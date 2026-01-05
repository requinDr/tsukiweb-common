import { promises as fs } from 'fs'
import path from 'path'
import { logProgress } from '../utils/logging.js'

function readHeader(buffer) {
	const fileCount = buffer.readUInt16BE(0) // 2 bytes Big Endian
	const baseOffset = buffer.readUInt32BE(2) // 4 bytes Big Endian
	return { fileCount, baseOffset }
}

function parseEntries(buffer, fileCount, baseOffset) {
	// Index starts at offset 6 (after 2 bytes count + 4 bytes base offset)
	let offset = 6
	const entries = []

	for (let i = 0; i < fileCount; i++) {
		const filenameEnd = buffer.indexOf('\0', offset)
		if (filenameEnd === -1) break

		const filename = buffer.subarray(offset, filenameEnd).toString('ascii').trim()
		offset = filenameEnd + 1

		const relativeOffset = buffer.readUInt32BE(offset)
		offset += 4

		const size = buffer.readUInt32BE(offset)
		offset += 4

		if (!filename) continue

		entries.push({
			filename,
			offset: baseOffset + relativeOffset,
			size
		})
	}
	return entries
}

function filterEntries(entries, filterDirs = []) {
	if (!filterDirs.length) return entries

	return entries.filter(({ filename }) => {
		const normalizedFilename = filename.replace(/\\/g, '/')
		return filterDirs.some(dir =>
			normalizedFilename.startsWith(dir.replace(/\\/g, '/'))
		)
	})
}

export async function extractSar(archivePath = 'arc.sar', outputDir = 'output', filterDirs = []) {
	try {
		const buffer = await fs.readFile(archivePath)
		const { fileCount, baseOffset } = readHeader(buffer)

		await fs.mkdir(outputDir, { recursive: true })

		const entries = parseEntries(buffer, fileCount, baseOffset)
		const entriesToExtract = filterEntries(entries, filterDirs)

		let extractedFiles = 0
		const totalToExtract = entriesToExtract.length

		for (let i = 0; i < totalToExtract; i++) {
			const { filename, offset, size } = entriesToExtract[i]

			if (
				offset >= buffer.length ||
				size > buffer.length ||
				size === 0 ||
				offset + size > buffer.length
			) {
				console.warn(`\nInvalid entry ${i + 1}/${totalToExtract} (${filename}).`)
				continue
			}

			logProgress(`Extracting file: ${i + 1}/${totalToExtract} (${filename})`)

			const fileData = buffer.subarray(offset, offset + size)
			const outputPath = path.join(outputDir, filename)

			const outputSubDir = path.dirname(outputPath)
			if (outputSubDir !== '.' && outputSubDir !== outputDir) {
				await fs.mkdir(outputSubDir, { recursive: true })
			}
			
			await fs.writeFile(outputPath, fileData)
			extractedFiles++
		}

		logProgress(`Extraction complete: ${extractedFiles}/${totalToExtract} files extracted to "${outputDir}"\n`)

	} catch (error) {
		console.error("\nAn error occurred during extraction:", error)
	}
}
