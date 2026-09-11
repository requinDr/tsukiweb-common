import { promises as fs } from 'fs'
import path from 'path'
import { logger } from '../utils/logger.ts'
import { parseEntries, extractEntry, type ArchiveEntry } from './core.ts'

function filterEntries(entries: ArchiveEntry[], filterDirs: string[] = []) {
  if (!filterDirs.length) return entries

  return entries.filter(({ filename }) => {
    const normalizedFilename = filename.replace(/\\/g, '/')
    return filterDirs.some(dir => normalizedFilename.startsWith(dir.replace(/\\/g, '/')))
  })
}

function outputPathFor(outputDir: string, filename: string): string {
  const normalized = filename.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(part => part && part !== '.')
  if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized) ||
      !parts.length || parts.includes('..')) {
    throw new Error(`Refusing unsafe NSA filename: "${filename}"`)
  }

  const outputPath = path.join(outputDir, ...parts)
  const relative = path.relative(outputDir, outputPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to extract outside output directory: "${filename}"`)
  }
  return outputPath
}

export async function extractNsa(
  archivePath = 'arc.nsa',
  outputDir = 'output',
  filterDirs: string[] = []
) {
  try {
    const buffer = await fs.readFile(archivePath)
    const entries = parseEntries(buffer)
    const entriesToExtract = filterEntries(entries, filterDirs)

    await fs.mkdir(outputDir, { recursive: true })

    let extractedFiles = 0
    for (let i = 0; i < entriesToExtract.length; i++) {
      const entry = entriesToExtract[i]
      logger.progress(`Extracting file: ${i + 1}/${entriesToExtract.length} (${entry.filename})`)

      try {
        const fileData = extractEntry(buffer, entry)
        const outputPath = outputPathFor(outputDir, entry.filename)
        await fs.mkdir(path.dirname(outputPath), { recursive: true })
        await fs.writeFile(outputPath, fileData)
        extractedFiles++
      } catch (error) {
        logger.error(`\nInvalid entry ${i + 1}/${entriesToExtract.length} (${entry.filename}): ${(error as Error).message}`)
      }
    }

    logger.progress(`Extraction complete: ${extractedFiles}/${entriesToExtract.length} files extracted to "${outputDir}"\n`)
  } catch (error) {
    logger.error(`An error occurred during NSA extraction: ${(error as Error).message}`)
  }
}
