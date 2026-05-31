import fs, { type FileHandle } from 'fs/promises'
import path from 'path'
import { inflateSync } from 'zlib'

import { logger } from '../utils/logger.ts'

const XP3_SIGNATURE = Buffer.from([0x58, 0x50, 0x33, 0x0d, 0x0a, 0x20, 0x0a, 0x1a, 0x8b, 0x67, 0x01])
const INDEX_COMPRESSED = 1
const SEGMENT_COMPRESSED = 1
const FILE_PROTECTED = 0x80000000
const COPY_CHUNK_SIZE = 1024 * 1024

interface Segment {
  flags:        number
  offset:       number
  originalSize: number
  archiveSize:  number
}

interface Entry {
  filename:     string
  flags:        number
  originalSize: number
  archiveSize:  number
  segments:     Segment[]
}

function readUInt64LE(buffer: Buffer, offset: number): number {
  const value = buffer.readBigUInt64LE(offset)
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`XP3 value is too large to handle safely: ${value}`)
  }
  return Number(value)
}

function chunk(buffer: Buffer, offset: number) {
  if (offset + 12 > buffer.length) throw new Error('Unexpected end of XP3 index.')

  const tag = buffer.subarray(offset, offset + 4).toString('ascii')
  const size = readUInt64LE(buffer, offset + 4)
  const dataOffset = offset + 12
  const endOffset = dataOffset + size
  if (endOffset > buffer.length) throw new Error(`XP3 chunk "${tag}" exceeds index size.`)

  return { tag, size, dataOffset, endOffset }
}

async function readAt(file: FileHandle, size: number, position: number): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(size)
  let done = 0

  while (done < size) {
    const { bytesRead } = await file.read(buffer, done, size - done, position + done)
    if (bytesRead === 0) throw new Error(`Unexpected end of file at offset ${position + done}.`)
    done += bytesRead
  }

  return buffer
}

function assertInsideArchive(offset: number, size: number, archiveSize: number, label: string): void {
  if (offset < 0 || size < 0 || offset > archiveSize || offset + size > archiveSize) {
    throw new Error(`${label} exceeds archive size.`)
  }
}

async function readIndex(file: FileHandle, archiveSize: number): Promise<Buffer> {
  const headerSize = XP3_SIGNATURE.length + 8
  assertInsideArchive(0, headerSize, archiveSize, 'XP3 header')

  const header = await readAt(file, headerSize, 0)
  if (!header.subarray(0, XP3_SIGNATURE.length).equals(XP3_SIGNATURE)) {
    throw new Error('Invalid XP3 signature.')
  }

  const indexOffset = readUInt64LE(header, XP3_SIGNATURE.length)
  assertInsideArchive(indexOffset, 1, archiveSize, 'XP3 index header')

  const flags = (await readAt(file, 1, indexOffset))[0]
  const sizes = await readAt(file, flags === INDEX_COMPRESSED ? 16 : 8, indexOffset + 1)
  const packedSize = readUInt64LE(sizes, 0)
  const unpackedSize = flags === INDEX_COMPRESSED ? readUInt64LE(sizes, 8) : packedSize
  const dataOffset = indexOffset + (flags === INDEX_COMPRESSED ? 17 : 9)

  if (flags !== 0 && flags !== INDEX_COMPRESSED) throw new Error(`Unsupported XP3 index flags: ${flags}`)
  assertInsideArchive(dataOffset, packedSize, archiveSize, 'XP3 index')

  const index = flags === INDEX_COMPRESSED
    ? inflateSync(await readAt(file, packedSize, dataOffset))
    : await readAt(file, packedSize, dataOffset)

  if (index.length !== unpackedSize) {
    throw new Error(`XP3 index size mismatch: expected ${unpackedSize}, got ${index.length}.`)
  }

  return index
}

function parseInfo(buffer: Buffer, offset: number, size: number) {
  if (size < 22) throw new Error('Invalid XP3 info chunk.')

  const nameLength = buffer.readUInt16LE(offset + 20)
  const nameOffset = offset + 22
  const nameEnd = nameOffset + nameLength * 2
  if (nameEnd > offset + size) throw new Error('XP3 filename exceeds info chunk size.')

  return {
    flags:        buffer.readUInt32LE(offset),
    originalSize: readUInt64LE(buffer, offset + 4),
    archiveSize:  readUInt64LE(buffer, offset + 12),
    filename:     buffer.subarray(nameOffset, nameEnd).toString('utf16le'),
  }
}

function parseSegments(buffer: Buffer, offset: number, size: number): Segment[] {
  if (size % 28 !== 0) throw new Error('Invalid XP3 segment chunk size.')

  const segments: Segment[] = []
  for (let pos = offset; pos < offset + size; pos += 28) {
    segments.push({
      flags:        buffer.readUInt32LE(pos),
      offset:       readUInt64LE(buffer, pos + 4),
      originalSize: readUInt64LE(buffer, pos + 12),
      archiveSize:  readUInt64LE(buffer, pos + 20),
    })
  }
  return segments
}

function parseFile(index: Buffer, offset: number, size: number): Entry {
  const end = offset + size
  let info: ReturnType<typeof parseInfo> | undefined
  let segments: Segment[] = []

  for (let pos = offset; pos < end;) {
    const item = chunk(index, pos)
    if (item.endOffset > end) throw new Error(`XP3 file sub-chunk "${item.tag}" exceeds file chunk size.`)
    if (item.tag === 'info') info = parseInfo(index, item.dataOffset, item.size)
    if (item.tag === 'segm') segments = parseSegments(index, item.dataOffset, item.size)
    pos = item.endOffset
  }

  if (!info) throw new Error('XP3 file entry is missing its filename.')
  if (!segments.length) throw new Error(`XP3 file entry "${info.filename}" has no segments.`)
  if ((info.flags & ~FILE_PROTECTED) !== 0) throw new Error(`Unsupported XP3 file flags for "${info.filename}".`)

  const originalSize = segments.reduce((total, segment) => total + segment.originalSize, 0)
  const archiveSize = segments.reduce((total, segment) => total + segment.archiveSize, 0)
  if (originalSize !== info.originalSize || archiveSize !== info.archiveSize) {
    throw new Error(`XP3 entry "${info.filename}" size mismatch.`)
  }

  return { ...info, segments }
}

function parseEntries(index: Buffer): Entry[] {
  const entries: Entry[] = []

  for (let pos = 0; pos < index.length;) {
    const item = chunk(index, pos)
    if (item.tag === 'File') entries.push(parseFile(index, item.dataOffset, item.size))
    pos = item.endOffset
  }

  return entries
}

function normalizeArchivePath(filename: string): string {
  return filename
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '')
}

function filterEntries(entries: Entry[], filters: string[]): Entry[] {
  const normalizedFilters = filters
    .map(filter => ({
      directoryOnly: /[\\/]$/.test(filter),
      path: normalizeArchivePath(filter).replace(/\/+$/, ''),
    }))
    .filter(filter => filter.path)

  if (!normalizedFilters.length) return entries

  return entries.filter(entry => {
    const filename = normalizeArchivePath(entry.filename)
    return normalizedFilters.some(filter =>
      filter.directoryOnly
        ? filename.startsWith(`${filter.path}/`)
        : filename === filter.path || filename.startsWith(`${filter.path}/`)
    )
  })
}

function outputPathFor(outputDir: string, filename: string): string {
  const parts = normalizeArchivePath(filename).split('/').filter(part => part && part !== '.')
  if (!parts.length || parts.includes('..')) throw new Error(`Refusing unsafe XP3 filename: "${filename}"`)

  const outputPath = path.join(outputDir, ...parts)
  const relative = path.relative(outputDir, outputPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to extract outside output directory: "${filename}"`)
  }
  return outputPath
}

async function copyStoredSegment(archive: FileHandle, output: FileHandle, segment: Segment, outputOffset: number): Promise<void> {
  const buffer = Buffer.allocUnsafe(Math.min(COPY_CHUNK_SIZE, segment.archiveSize))
  let remaining = segment.archiveSize
  let inputOffset = segment.offset

  while (remaining > 0) {
    const bytesToRead = Math.min(buffer.length, remaining)
    const { bytesRead } = await archive.read(buffer, 0, bytesToRead, inputOffset)
    if (bytesRead === 0) throw new Error(`Unexpected end of file at offset ${inputOffset}.`)

    await output.write(buffer, 0, bytesRead, outputOffset)
    remaining -= bytesRead
    inputOffset += bytesRead
    outputOffset += bytesRead
  }
}

async function extractEntry(archive: FileHandle, archiveSize: number, entry: Entry, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  const output = await fs.open(outputPath, 'w')
  let ok = false

  try {
    let outputOffset = 0

    for (const segment of entry.segments) {
      if ((segment.flags & ~SEGMENT_COMPRESSED) !== 0) throw new Error(`Unsupported XP3 segment flags for "${entry.filename}".`)
      assertInsideArchive(segment.offset, segment.archiveSize, archiveSize, `Segment for "${entry.filename}"`)

      if ((segment.flags & SEGMENT_COMPRESSED) !== 0) {
        const data = inflateSync(await readAt(archive, segment.archiveSize, segment.offset))
        if (data.length !== segment.originalSize) throw new Error(`Segment size mismatch for "${entry.filename}".`)
        await output.write(data, 0, data.length, outputOffset)
      } else {
        if (segment.archiveSize !== segment.originalSize) throw new Error(`Stored segment size mismatch for "${entry.filename}".`)
        await copyStoredSegment(archive, output, segment, outputOffset)
      }

      outputOffset += segment.originalSize
    }

    ok = outputOffset === entry.originalSize
    if (!ok) throw new Error(`File size mismatch for "${entry.filename}".`)
  } finally {
    await output.close()
    if (!ok) await fs.rm(outputPath, { force: true })
  }
}

export async function extractXp3(
  archivePath = 'patch.xp3',
  outputDir = 'output',
  filterDirs: string[] = []
) {
  let archive: FileHandle | undefined

  try {
    archive = await fs.open(archivePath, 'r')
    const archiveSize = (await archive.stat()).size
    const entries = parseEntries(await readIndex(archive, archiveSize))
    const entriesToExtract = filterEntries(entries, filterDirs)

    await fs.mkdir(outputDir, { recursive: true })
    logger.log(`Files selected: ${entriesToExtract.length}/${entries.length}`)

    let extracted = 0
    for (let i = 0; i < entriesToExtract.length; i++) {
      const entry = entriesToExtract[i]
      const filename = normalizeArchivePath(entry.filename)
      logger.progress(`Extracting file: ${i + 1}/${entriesToExtract.length} (${filename})`)

      try {
        await extractEntry(archive, archiveSize, entry, outputPathFor(outputDir, filename))
        extracted++
      } catch (error) {
        logger.error(`\nInvalid entry ${i + 1}/${entriesToExtract.length} (${filename}): ${(error as Error).message}`)
      }
    }

    logger.clear()
    logger.log(`Extraction complete: ${extracted}/${entriesToExtract.length} files extracted to "${outputDir}"`)
  } catch (error) {
    logger.error(`An error occurred during XP3 extraction: ${(error as Error).message}`)
  } finally {
    await archive?.close()
  }
}
