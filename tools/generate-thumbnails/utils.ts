import sharp, { type OverlayOptions, type Region, type Sharp, type SharpOptions } from 'sharp'
import path from 'path'


export const isHexColor = (str: string) => /^#[0-9A-Fa-f]{6}$/.test(str)
const hexToRgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
})

interface ThumbnailOptions {
  bg?: string
  l?: string
  c?: string
  r?: string
  monochrome?: string
  width: number
  height: number
}

export async function generateThumbnail({ bg, l, c, r, monochrome, width, height }: ThumbnailOptions) {
  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })

  const layers: OverlayOptions[] = []

  const applyGrayscale = (inputImage: Sharp) => {
    if (monochrome) {
      return inputImage.grayscale().toBuffer()
    }
    return inputImage.toBuffer()
  }

  // Check if the background is a hex color or an image path
  if (bg && isHexColor(bg)) {
    // If it's a hex color, use it as the background
    const { r, g, b } = hexToRgb(bg)

    // Add a solid color background layer
    layers.push({
      input: Buffer.from(
        `<svg width="${width}" height="${height}">
            <rect x="0" y="0" width="${width}" height="${height}" fill="rgb(${r},${g},${b})"/>
        </svg>`
      ),
      top: 0,
      left: 0,
    })
  } else if (bg) {
    const bgBuffer = await sharp(bg).resize(width, height, { fit: 'cover' }).toBuffer()
    const finalBgBuffer = await applyGrayscale(sharp(bgBuffer)) // Apply grayscale if monochrome is specified
    layers.push({ input: finalBgBuffer, top: 0, left: 0 })
  }

  const characterGrid: Record<string, Region> = {
    l: { left: 0, top: 0, width: Math.floor(width / 2), height },
    c: { left: Math.floor(width / 4), top: 0, width: Math.floor(width / 2), height },
    r: { left: Math.floor(width / 2), top: 0, width: Math.floor(width / 2), height },
  }

  const resizeAndCenterCharacter = async (characterPath: string, position: string) => {
    // Resize the character, keeping the aspect ratio and filling the height
    const charImage = sharp(characterPath)
    const { width: originalWidth, height: originalHeight } = await charImage.metadata()
    if (!originalWidth || !originalHeight) return null

    const scaleFactor = height / originalHeight
    const newWidth = Math.round(originalWidth * scaleFactor)

    // Resize the character image
    const resizedBuffer = await charImage.resize(newWidth, height, { fit: 'cover' }).toBuffer()

    // Calculate the offset to center the character
    const { left, top, width: containerWidth } = characterGrid[position]
    const overflowX = Math.max(0, newWidth - containerWidth)
    const centerX = left + Math.floor((containerWidth - newWidth) / 2)
    const adjustedLeft = (newWidth <= containerWidth) ? centerX : left

    return {
      input: resizedBuffer,
      top: Math.round(top),
      left: Math.round(adjustedLeft - overflowX / 2), // Allow overflow on both sides
    }
  }

  // Add character layers with optional grayscale
  for (const [position, charPath] of Object.entries({ l, c, r })) {
    if (charPath) {
      const characterLayer = await resizeAndCenterCharacter(charPath, position)
      if (characterLayer) {
        const characterImage = sharp(characterLayer.input)
        const grayCharacterImage = await applyGrayscale(characterImage) // Apply grayscale only if monochrome is present
        layers.push({ input: grayCharacterImage, top: characterLayer.top, left: characterLayer.left })
      }
    }
  }

  // Apply the monochrome filter (the layer on top of everything)
  if (monochrome) {
    const { r, g, b } = hexToRgb(monochrome)

    // Create a monochrome layer (this mimics the CSS "mix-blend-mode: multiply")
    const monochromeLayer = Buffer.from(
      `<svg width="${width}" height="${height}">
        <rect x="0" y="0" width="${width}" height="${height}" fill="rgb(${r},${g},${b})"/>
      </svg>`
    )

    layers.push({
      input: monochromeLayer,
      top: 0,
      left: 0,
      blend: 'multiply',
    })
  }

  return canvas.composite(layers).toFormat("avif").toBuffer()
}

export async function saveSpritesheet(
  thumbnails: Buffer[], outputDir: string, fileName: string, thumbWidth: number, thumbHeight: number
) {
  const cols = 10 // Number of thumbnails per row
  const rows = Math.ceil(thumbnails.length / cols)
  const spritesheetPath = path.join(outputDir, fileName)

  const nw = cols * thumbWidth
  const nh = rows * thumbHeight

  const compositeImages = thumbnails.map((thumb, i) => ({
    input: thumb,
    left: (i % cols) * thumbWidth,
    top: Math.floor(i / cols) * thumbHeight,
  }))

  const canvas: SharpOptions = {
    create: {
      width: nw,
      height: nh,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }

  const avifPromise = sharp(canvas)
    .composite(compositeImages)
    .toFormat('avif')
    .avif({ effort: 9, quality: 40 })
    .toFile(spritesheetPath + ".avif")
 
  const webpPromise = sharp(canvas)
    .composite(compositeImages)
    .toFormat('webp')
    .webp({ effort: 6, preset: 'drawing', quality: 70 })
    .toFile(spritesheetPath + ".webp")

  await Promise.all([avifPromise, webpPromise])

  return { nw, nh }
}
