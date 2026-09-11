export interface ArchiveEntry {
  filename:     string
  compression:  number
  offset:       number
  size:         number
  originalSize: number
}

const filenameDecoder = new TextDecoder('shift_jis')

export function parseEntries(buffer: Uint8Array): ArchiveEntry[] {
  if (buffer.length < 6) throw new Error('Invalid NSA header.')

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const fileCount = view.getUint16(0)
  const baseOffset = view.getUint32(2)
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
    const relativeOffset = view.getUint32(offset)
    offset += 4
    const size = view.getUint32(offset)
    offset += 4
    const originalSize = view.getUint32(offset)
    offset += 4

    entries.push({ filename, compression, offset: baseOffset + relativeOffset, size, originalSize })
  }

  return entries
}

function bitReader(buffer: Uint8Array) {
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

function decompressLzss(data: Uint8Array, originalSize: number): Uint8Array {
  const readBits = bitReader(data)
  const output = new Uint8Array(originalSize)
  const ring = new Uint8Array(256)
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

function decompressSpb(data: Uint8Array, originalSize: number): Uint8Array {
  if (data.length < 4) throw new Error('Invalid SPB header.')

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const width = view.getUint16(0)
  const height = view.getUint16(2)
  const stride = Math.ceil(width * 3 / 4) * 4
  const totalSize = 54 + stride * height
  if (!width || !height || totalSize !== originalSize) throw new Error('Invalid SPB dimensions.')

  const output = new Uint8Array(totalSize)
  const header = new DataView(output.buffer)
  output.set([0x42, 0x4d])
  header.setUint32(2, totalSize, true)
  header.setUint32(10, 54, true)
  header.setUint32(14, 40, true)
  header.setInt32(18, width, true)
  header.setInt32(22, height, true)
  header.setUint16(26, 1, true)
  header.setUint16(28, 24, true)
  header.setUint32(34, totalSize - 54, true)

  const readBits = bitReader(data.subarray(4))
  const pixelCount = width * height

  for (let channel = 0; channel < 3; channel++) {
    const values = new Uint8Array(pixelCount + 3)
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

export function extractEntry(buffer: Uint8Array, entry: ArchiveEntry): Uint8Array {
  if (entry.offset > buffer.length || entry.size > buffer.length - entry.offset) {
    throw new Error('Entry exceeds archive size.')
  }
  const data = buffer.subarray(entry.offset, entry.offset + entry.size)
  if (entry.compression === 0) {
    if (entry.size !== entry.originalSize) throw new Error('Stored size does not match original size.')
    return data
  }
  if (entry.compression === 1) return decompressSpb(data, entry.originalSize)
  if (entry.compression === 2) return decompressLzss(data, entry.originalSize)
  throw new Error(`Unsupported NSA compression type ${entry.compression}.`)
}

