import fs from 'fs/promises'
import sharp from 'sharp'

/**
 * Merges two images by placing the top image above the bottom image.
 * @param {string} bottom - Path to the bottom image.
 * @param {string} top - Path to the top image.
 * @param {string} newimage - Path for the output merged image.
 */
export async function mergeImages(bottom, top, newimage) {
	try {
		await fs.access(newimage)
		console.log(`Skipping merge, already exists: ${newimage}`)
		return
	} catch {
	}

	const bottomImage = sharp(bottom, { limitInputPixels: false })
	const topImage = sharp(top, { limitInputPixels: false })

	const [bottomMeta, topMeta] = await Promise.all([
		bottomImage.metadata(),
		topImage.metadata()
	])

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
		.toFile(newimage)

	await Promise.all([
		fs.unlink(bottom),
		fs.unlink(top)
	])

	console.log(`Merged ${top} + ${bottom} -> ${newimage}`)
}