import sharp, { type Metadata } from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import { logger } from '../utils/logger.ts'


const STATUS = Object.freeze({
  SUCCESS: 'success',
  FAILED:  'failed',
  SKIPPED: 'skipped',
})

const ALPHA_CLEANUP_THRESHOLD = 10
const COLOR_BLEED_PASSES = 2

async function ensureDirectoryExists(dir: string) {
  const created = await fs.mkdir(dir, { recursive: true })
  if (created) logger.log(`Folder "${dir}" successfully created.`)
}

function cleanAlpha(alpha: number): number {
  if (alpha <= ALPHA_CLEANUP_THRESHOLD) return 0
  if (alpha >= 255 - ALPHA_CLEANUP_THRESHOLD) return 255
  return alpha
}

function removeWhiteMatte(channel: number, alpha: number): number {
  return Math.max(0, Math.min(255, Math.round(255 - (255 - channel) * 255 / alpha)))
}

function removeMaskNoise(rawMask: Buffer, medianMask: Buffer, width: number, height: number): Buffer {
  const cleaned = Buffer.from(rawMask)
  const visited = Buffer.alloc(rawMask.length)

  for (let start = 0; start < rawMask.length; start++) {
    if (visited[start] || rawMask[start] <= ALPHA_CLEANUP_THRESHOLD) continue

    const component = [start]
    let supported = false
    visited[start] = 1

    for (let index = 0; index < component.length; index++) {
      const pixel = component[index]
      const x = pixel % width
      const y = Math.floor(pixel / width)
      if (medianMask[pixel] > ALPHA_CLEANUP_THRESHOLD) supported = true

      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const neighbourX = x + offsetX
          const neighbourY = y + offsetY
          if (neighbourX < 0 || neighbourX >= width || neighbourY < 0 || neighbourY >= height) continue

          const neighbour = neighbourY * width + neighbourX
          if (visited[neighbour] || rawMask[neighbour] <= ALPHA_CLEANUP_THRESHOLD) continue
          visited[neighbour] = 1
          component.push(neighbour)
        }
      }
    }

    if (!supported) {
      for (const pixel of component) cleaned[pixel] = 0
    }
  }

  return cleaned
}

function bleedTransparentEdgeColors(image: Buffer, width: number, height: number): Buffer {
  let colors = image
  let filled = Buffer.alloc(width * height)
  for (let pixel = 0; pixel < filled.length; pixel++) {
    filled[pixel] = image[pixel * 4 + 3] > 0 ? 1 : 0
  }

  for (let pass = 0; pass < COLOR_BLEED_PASSES; pass++) {
    const nextColors = Buffer.from(colors)
    const nextFilled = Buffer.from(filled)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x
        if (filled[pixel]) continue

        let red = 0
        let green = 0
        let blue = 0
        let neighbours = 0
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            const neighbourX = x + offsetX
            const neighbourY = y + offsetY
            if (neighbourX < 0 || neighbourX >= width || neighbourY < 0 || neighbourY >= height) continue

            const neighbour = neighbourY * width + neighbourX
            if (!filled[neighbour]) continue

            red += colors[neighbour * 4]
            green += colors[neighbour * 4 + 1]
            blue += colors[neighbour * 4 + 2]
            neighbours++
          }
        }

        if (!neighbours) continue
        nextColors[pixel * 4] = Math.round(red / neighbours)
        nextColors[pixel * 4 + 1] = Math.round(green / neighbours)
        nextColors[pixel * 4 + 2] = Math.round(blue / neighbours)
        nextFilled[pixel] = 1
      }
    }

    colors = nextColors
    filled = nextFilled
  }

  return colors
}

async function applyTransparencyMask(inputPath: string, outputPath: string, metadata: Metadata) {
  try {
    // 1. Get the file
    const { width, height } = metadata
    const halfWidth = Math.floor(width / 2)
    const image = sharp(inputPath)
   
    // 2. Extract the mask (alpha channel) from the right side
    const [colorBuffer, rawMaskBuffer, medianMaskBuffer] = await Promise.all([
      image
        .clone()
        .extract({ left: 0, top: 0, width: halfWidth, height })
        .removeAlpha()
        .raw()
        .toBuffer(),
      image
        .clone()
        .extract({ left: halfWidth, top: 0, width: halfWidth, height })
        .grayscale()
        .negate() // White = opaque, black = transparent
        .raw()
        .toBuffer(),
      image
        .clone()
        .extract({ left: halfWidth, top: 0, width: halfWidth, height })
        .grayscale()
        .median(3)
        .negate()
        .raw()
        .toBuffer(),
    ])

    // 3. Remove the original white matte and bleed edge colours into transparent pixels.
    const maskBuffer = removeMaskNoise(rawMaskBuffer, medianMaskBuffer, halfWidth, height)
    const pixels = Buffer.alloc(halfWidth * height * 4)
    for (let pixel = 0; pixel < halfWidth * height; pixel++) {
      const outputOffset = pixel * 4
      const inputOffset = pixel * 3
      const minimumAlpha = 255 - Math.min(
        colorBuffer[inputOffset],
        colorBuffer[inputOffset + 1],
        colorBuffer[inputOffset + 2]
      )
      const sourceAlpha = maskBuffer[pixel] <= ALPHA_CLEANUP_THRESHOLD
        ? 0
        : Math.max(maskBuffer[pixel], minimumAlpha)

      for (let channel = 0; channel < 3; channel++) {
        pixels[outputOffset + channel] = sourceAlpha <= ALPHA_CLEANUP_THRESHOLD
          ? 0
          : removeWhiteMatte(colorBuffer[inputOffset + channel], sourceAlpha)
      }
      pixels[outputOffset + 3] = cleanAlpha(sourceAlpha)
    }

    await sharp(bleedTransparentEdgeColors(pixels, halfWidth, height), {
      raw: { width: halfWidth, height, channels: 4 },
    })
      .png()
      .toFile(outputPath)
   
    return STATUS.SUCCESS
  } catch (error) {
    logger.error(`Error processing image ${inputPath}: ${(error as Error).message}`)
    return STATUS.FAILED
  }
}

async function processFile(inputDir: string, outputDir: string, file: string) {
  const inputPath  = path.join(inputDir, file)
  const outputPath = path.join(outputDir, `${path.parse(file).name}.png`)
 
  const metadata = await sharp(inputPath).metadata()
 
  if (metadata.hasAlpha) {
    if (inputPath !== outputPath) {
      await fs.copyFile(inputPath, outputPath)
    }
    return STATUS.SKIPPED
  }
 
  return applyTransparencyMask(inputPath, outputPath, metadata)
}

/**
 * Process all JPG/JPEG images in the input directory, apply transparency masks,
 * and save the results as PNG files in the output directory.
 */
export async function processImages(inputDir: string, outputDir: string) {
  try {
    await ensureDirectoryExists(inputDir)
    await ensureDirectoryExists(outputDir)

    const files = await fs.readdir(inputDir)
    const imageFiles = files.filter(file =>
      ['.jpg', '.jpeg', '.png'].includes(path.extname(file).toLowerCase())
    )

    const total = imageFiles.length
    if (total === 0) {
      logger.error('No images found in the "input" folder.')
      return
    }

    let processedCount = 0
    const results = await Promise.all(
      imageFiles.map(file => processFile(inputDir, outputDir, file)
        .then(result => {
          logger.progress(`Processing sprites: ${++processedCount}/${total}`)
          return result
        })
      )
    )

    const counts = {
      success: results.filter(r => r === STATUS.SUCCESS).length,
      skipped: results.filter(r => r === STATUS.SKIPPED).length,
      failed:  results.filter(r => r === STATUS.FAILED).length,
    }
 
    const summary = [
      `${counts.success}/${total} processed`,
      counts.skipped && `${counts.skipped} skipped`,
      counts.failed  && `${counts.failed} failed`,
    ].filter(Boolean).join(', ')
 
    logger.log(`Processing complete: ${summary}`)
  } catch (error) {
    logger.error(`Error processing images: ${(error as Error).message}`)
  }
}
