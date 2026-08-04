import { promises as fs } from 'fs'
import path from 'path'
import { logger } from '../utils/logger.ts'

interface ArchiveEntry {
  filename:     string
  compression:  number
  offset:       number
  size:         number
  originalSize: number
}

const filenameDecoder = new TextDecoder('shift_jis')

function parseEntries(buffer: Buffer): ArchiveEntry[] {
  if (buffer.length < 6) throw new Error('Invalid NSA header.')

  const fileCount = buffer.readUInt16BE(0)
  const baseOffset = buffer.readUInt32BE(2)
  if (baseOffset < 6 || baseOffset > buffer.length) throw new Error('Invalid NSA data offset.')

  const entries: ArchiveEntry[] = []
  let offset = 6

  for (let i = 0; i < fileCount; i++) {
    const filenameEnd = buffer.indexOf(0, offset)
    if (filenameEnd < offset || filenameEnd >= baseOffset || filenameEnd + 14 > baseOffset) {
      throw new Error(`Invalid NSA entry ${i + 1}.`)
    }

    const filename = filenameDecoder.decode(buffer.subarray(offset, filenameEnd))
    if (!filename) throw new Error(`NSA entry ${i + 1} has no filename.`)
    offset = filenameEnd + 1

    const compression = buffer[offset++]
    const relativeOffset = buffer.readUInt32BE(offset)
    offset += 4
    const size = buffer.readUInt32BE(offset)
    offset += 4
    const originalSize = buffer.readUInt32BE(offset)
    offset += 4

    entries.push({ filename, compression, offset: baseOffset + relativeOffset, size, originalSize })
  }

  return entries
}

function filterEntries(entries: ArchiveEntry[], filterDirs: string[] = []) {
  if (!filterDirs.length) return entries

  return entries.filter(({ filename }) => {
    const normalizedFilename = filename.replace(/\\/g, '/')
    return filterDirs.some(dir => normalizedFilename.startsWith(dir.replace(/\\/g, '/')))
  })
}

function bitReader(buffer: Buffer) {
  let offset = 0

  return (length: number): number => {
    if (offset + length > buffer.length * 8) throw new Error('Unexpected end of compressed data.')

    let value = 0
    for (let i = 0; i < length; i++, offset++) {
      value = (value << 1) | ((buffer[offset >> 3] >> (7 - (offset & 7))) & 1)
    }
    return value
  }
}

function decompressLzss(data: Buffer, originalSize: number): Buffer {
  const readBits = bitReader(data)
  const output = Buffer.alloc(originalSize)
  const ring = Buffer.alloc(256)
  let outputOffset = 0
  let ringOffset = 239

  while (outputOffset < originalSize) {
    if (readBits(1)) {
      const value = readBits(8)
      output[outputOffset++] = value
      ring[ringOffset] = value
      ringOffset = (ringOffset + 1) & 0xff
      continue
    }

    const sourceOffset = readBits(8)
    const length = readBits(4) + 2
    for (let i = 0; i < length && outputOffset < originalSize; i++) {
      const value = ring[(sourceOffset + i) & 0xff]
      output[outputOffset++] = value
      ring[ringOffset] = value
      ringOffset = (ringOffset + 1) & 0xff
    }
  }

  return output
}

function decompressSpb(data: Buffer, originalSize: number): Buffer {
  if (data.length < 4) throw new Error('Invalid SPB header.')

  const width = data.readUInt16BE(0)
  const height = data.readUInt16BE(2)
  const stride = Math.ceil(width * 3 / 4) * 4
  const totalSize = 54 + stride * height
  if (!width || !height || totalSize !== originalSize) throw new Error('Invalid SPB dimensions.')

  const output = Buffer.alloc(totalSize)
  output.write('BM')
  output.writeUInt32LE(totalSize, 2)
  output.writeUInt32LE(54, 10)
  output.writeUInt32LE(40, 14)
  output.writeInt32LE(width, 18)
  output.writeInt32LE(height, 22)
  output.writeUInt16LE(1, 26)
  output.writeUInt16LE(24, 28)
  output.writeUInt32LE(totalSize - 54, 34)

  const readBits = bitReader(data.subarray(4))
  const pixelCount = width * height

  for (let channel = 0; channel < 3; channel++) {
    const values = Buffer.alloc(pixelCount + 3)
    let count = 0
    let value = readBits(8)
    values[count++] = value

    while (count < pixelCount) {
      const code = readBits(3)
      if (code === 0) {
        values.fill(value, count, count + 4)
        count += 4
        continue
      }

      const bits = code === 7 ? readBits(1) + 1 : code + 2
      for (let i = 0; i < 4; i++) {
        const delta = readBits(bits)
        value = (value + (delta & 1 ? (delta >> 1) + 1 : -(delta >> 1))) & 0xff
        values[count++] = value
      }
    }

    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const outputColumn = row & 1 ? width - column - 1 : column
        output[54 + (height - row - 1) * stride + outputColumn * 3 + channel] = values[row * width + column]
      }
    }
  }

  return output
}

function decompressEntry(entry: ArchiveEntry, data: Buffer): Buffer {
  if (entry.compression === 0) {
    if (entry.size !== entry.originalSize) throw new Error('Stored size does not match original size.')
    return data
  }
  if (entry.compression === 1) return decompressSpb(data, entry.originalSize)
  if (entry.compression === 2) return decompressLzss(data, entry.originalSize)
  throw new Error(`Unsupported NSA compression type ${entry.compression}.`)
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
        if (entry.offset > buffer.length || entry.size > buffer.length - entry.offset) {
          throw new Error('Entry exceeds archive size.')
        }

        const fileData = decompressEntry(entry, buffer.subarray(entry.offset, entry.offset + entry.size))
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
