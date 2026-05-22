import fs from 'fs/promises'
import path from 'path'

export async function extractNscript(inputFile: string, outputFile: string) {
  const inputBuffer = await fs.readFile(inputFile)

  const outputBuffer = Buffer.from(inputBuffer.map(byte => byte ^ 0x84))

  const decoder = new TextDecoder('shift_jis')
  const decodedText = decoder.decode(outputBuffer)

  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await fs.writeFile(outputFile, decodedText, 'utf-8')
}