import fs from 'fs/promises'
import sharp from 'sharp'
import { logger } from '../utils/logger.ts'

export async function mergeVertical(bottom: string, top: string, newImage: string) {
  try {
    await fs.access(newImage)
    logger.log(`Skipping merge, already exists: ${newImage}`)
    return
  } catch {
  }

  const bottomImage = sharp(bottom, { limitInputPixels: false })
  const topImage = sharp(top, { limitInputPixels: false })

  const [bottomMeta, topMeta] = await Promise.all([
    bottomImage.metadata(),
    topImage.metadata()
  ])
  if (!bottomMeta.width || !bottomMeta.height || !topMeta.width || !topMeta.height)
    throw new Error('Unable to retrieve image dimensions.')

  const totalHeight = bottomMeta.height + topMeta.height
  const maxWidth = Math.max(bottomMeta.width, topMeta.width)

  const [bottomBuffer, topBuffer] = await Promise.all([
    bottomImage.toBuffer(),
    topImage.toBuffer()
  ])

  await sharp({
      create: {
        width: maxWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([
      { input: topBuffer, top: 0, left: 0 },
      { input: bottomBuffer, top: topMeta.height, left: 0 }
    ])
    .toFile(newImage)

  logger.log(`Merged ${top} + ${bottom} -> ${newImage}`)
}
