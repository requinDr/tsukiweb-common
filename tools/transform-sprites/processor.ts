import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import { logger } from '../utils/logger.ts'


const STATUS = Object.freeze({
  SUCCESS: 'success',
  FAILED:  'failed',
  SKIPPED: 'skipped',
})

async function ensureDirectoryExists(dir: string) {
  const created = await fs.mkdir(dir, { recursive: true })
  if (created) logger.log(`Folder "${dir}" successfully created.`)
}

async function applyTransparencyMask(inputPath: string, outputPath: string, metadata: sharp.Metadata) {
  try {
    // 1. Get the file
    const { width, height } = metadata
    const halfWidth = Math.floor(width / 2)
    const image = sharp(inputPath)
   
    // 2. Extract the mask (alpha channel) from the right side
    const maskBuffer = await image
      .clone()
      .extract({ left: halfWidth, top: 0, width: halfWidth, height: height })
      .grayscale()
      .median(3)
      .negate()     // Invert the mask so that white = transparent, black = opaque
      .png()        // Prevent JPEG compression artifacts in the mask
      .toBuffer()
   
    // 3. Apply the mask to the left side (color image)
    await image
      .extract({ left: 0, top: 0, width: halfWidth, height: height })
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .joinChannel(maskBuffer)
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
