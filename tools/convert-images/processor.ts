import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sharp, { type AvifOptions, type ResizeOptions } from 'sharp'
import { logger} from '../utils/logger.ts'


interface ConvertOptions {
  resize?: ResizeOptions
  avif?:   AvifOptions
}

/**
 * Converts a single image according to the specified options.
 */
async function convertImage(inputFile: string, outputFile: string, options: ConvertOptions) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true })

  let image = sharp(inputFile, { limitInputPixels: false })
  if (options.resize) {
    image = image.resize(options.resize)
  }

  await image.avif(options.avif || {}).toFile(outputFile)
}

/**
 * Processes all images in a directory based on multiple output configurations.
 */
export async function processImages(
  inputDir: string, outputDir: string, options: ConvertOptions
) {
  let relativePaths: string[] = []

  try {
    const files = await fs.readdir(inputDir, { recursive: true })
    relativePaths = files.filter(file => /\.(png|jpe?g|webp)$/i.test(file))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.error(`Input directory not found: ${inputDir}`)
      return
    }
    throw error
  }

  const total = relativePaths.length
  if (total === 0) {
    logger.error(`No images found to process in ${inputDir}`)
    return
  }

  const concurrencyLimit = Math.max(1, os.cpus().length - 1)
  let processedCount = 0
  let nextIndex = 0

  logger.progress(outputDir, `Processing ${outputDir}: 0/${total}`)
 
  const worker = async () => {
    while (nextIndex < total) {
      const currentIndex = nextIndex++
      if (currentIndex >= total) break

      const relativePath = relativePaths[currentIndex]
      const inputFile = path.join(inputDir, relativePath)

      const parsed = path.parse(relativePath)
      const outputFile = path.join(outputDir, parsed.dir, `${parsed.name}.avif`)

      try {
        await convertImage(inputFile, outputFile, options)
        logger.progress(outputDir, `Processing ${outputDir}: ${++processedCount}/${total}`)
      } catch (error) {
        logger.error(`Error converting ${inputFile} to ${outputFile}: ${error as Error}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrencyLimit }, worker))
}
