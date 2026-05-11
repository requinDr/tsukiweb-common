import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import { logProgress, logError } from '../utils/logging.js'


const STATUS = Object.freeze({
	SUCCESS: 'success',
	FAILED:  'failed',
	SKIPPED: 'skipped',
})

async function ensureDirectoryExists(dir) {
	const created = await fs.mkdir(dir, { recursive: true })
	if (created) logProgress(`Folder "${dir}" successfully created.`)
}

async function applyTransparencyMask(inputPath, outputPath, metadata) {
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
			.negate()     // Invert the mask so that white = transparent, black = opaque
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
		logError(`Error processing image ${inputPath}: ${error.message}`)
		return STATUS.FAILED
	}
}

async function processFile(inputDir, outputDir, file) {
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
 * @param {string} inputDir - The directory containing input images.
 * @param {string} outputDir - The directory to save processed images.
 */
export async function processImages(inputDir, outputDir) {
	try {
		await ensureDirectoryExists(inputDir)
		await ensureDirectoryExists(outputDir)

		const files = await fs.readdir(inputDir)
		const imageFiles = files.filter(file =>
			['.jpg', '.jpeg', '.png'].includes(path.extname(file).toLowerCase())
		)

		const total = imageFiles.length
		if (total === 0) {
			logError('No images found in the "input" folder.')
			return
		}

		let processedCount = 0
		const results = await Promise.all(
			imageFiles.map(file => processFile(inputDir, outputDir, file)
				.then(result => {
					logProgress(`Processing sprites: ${++processedCount}/${total}`)
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
 
		logProgress(`Processing complete: ${summary}\n`)
	} catch (error) {
		logError(`Error processing images: ${error.message}`)
	}
}