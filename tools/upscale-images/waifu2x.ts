import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { listFilesRecursive } from '../utils/fs-utils.ts'
import { logger } from '../utils/logger.ts'
import { runCommand } from '../utils/process-utils.ts'
import { mapConcurrent } from '../utils/utils.ts'
import type { Executable } from '../orchestrator/external-tools.ts'

interface Job {
  relativePath: string
  name: string
  hasAlpha: boolean
}

const CONCURRENCY = 8

const BLEED_ITERATIONS = 16

function bleedColors(rgba: Buffer, width: number, height: number): Buffer {
  const rgb = Buffer.alloc(width * height * 3)
  let known = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    rgba.copy(rgb, i * 3, i * 4, i * 4 + 3)
    known[i] = rgba[i * 4 + 3] > 0 ? 1 : 0
  }

  for (let iteration = 0; iteration < BLEED_ITERATIONS; iteration++) {
    const next = known.slice()
    const source = Buffer.from(rgb)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        if (known[index]) continue
        let r = 0, g = 0, b = 0, count = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const neighbor = ny * width + nx
            if (!known[neighbor]) continue
            r += source[neighbor * 3]
            g += source[neighbor * 3 + 1]
            b += source[neighbor * 3 + 2]
            count++
          }
        }
        if (!count) continue
        rgb[index * 3] = Math.round(r / count)
        rgb[index * 3 + 1] = Math.round(g / count)
        rgb[index * 3 + 2] = Math.round(b / count)
        next[index] = 1
      }
    }
    known = next
  }
  return rgb
}

async function splitAlpha(source: string, colorFile: string, alphaFile: string): Promise<void> {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  await sharp(bleedColors(data, width, height), { raw: { width, height, channels: 3 } }).png().toFile(colorFile)
  await sharp(data, { raw: { width, height, channels: 4 } }).extractChannel(3).png().toFile(alphaFile)
}

async function joinAlpha(colorFile: string, alphaFile: string, output: string): Promise<void> {
  const color = await sharp(colorFile).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const alpha = await sharp(alphaFile).extractChannel(0).raw().toBuffer()
  const { width, height } = color.info
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    if (alpha[i] === 0) continue
    color.data.copy(data, i * 4, i * 3, i * 3 + 3)
    data[i * 4 + 3] = alpha[i]
  }
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(output)
}

export async function upscaleImages(
  waifu2x: Executable,
  args: readonly string[],
  inputDir: string,
  outputDir: string,
): Promise<void> {
  const staging = `${outputDir}.staging`
  const dirs = {
    color: path.join(staging, 'color'),
    alpha: path.join(staging, 'alpha'),
    colorX2: path.join(staging, 'color_x2'),
    alphaX2: path.join(staging, 'alpha_x2'),
  }
  await fs.rm(staging, { recursive: true, force: true })
  await Promise.all(Object.values(dirs).map(dir => fs.mkdir(dir, { recursive: true })))

  const files = await listFilesRecursive(inputDir)
  const jobs: Job[] = []
  let prepared = 0
  logger.progress(inputDir, `Preparing images: 0/${files.length}`)
  await mapConcurrent(files, CONCURRENCY, async (relativePath, index) => {
    const source = path.join(inputDir, relativePath)
    const { hasAlpha } = await sharp(source).metadata()
    const name = `${index}`
    if (hasAlpha) {
      await splitAlpha(source, path.join(dirs.color, `${name}.png`), path.join(dirs.alpha, `${name}.png`))
    } else {
      await fs.copyFile(source, path.join(dirs.color, `${name}${path.extname(relativePath)}`))
    }
    jobs[index] = { relativePath, name, hasAlpha: Boolean(hasAlpha) }
    logger.progress(inputDir, `Preparing images: ${++prepared}/${files.length}`)
  })

  const total = jobs.length + jobs.filter(job => job.hasAlpha).length
  const updateProgress = async () => {
    const processed = (await listFilesRecursive(dirs.colorX2)).length + (await listFilesRecursive(dirs.alphaX2)).length
    logger.progress(inputDir, `Upscaling images: ${Math.min(processed, total)}/${total}`)
  }
  const timer = setInterval(() => void updateProgress(), 1000)
  try {
    const alphaArgs = args.map((arg, index) => args[index - 1] === '-n' ? '-1' : arg)
    const passes = [[dirs.color, dirs.colorX2, args], [dirs.alpha, dirs.alphaX2, alphaArgs]] as const
    for (const [input, output, passArgs] of passes) {
      if (!(await listFilesRecursive(input)).length) continue
      await runCommand(waifu2x.command, ['-i', input, '-o', output, ...passArgs], { cwd: waifu2x.cwd, quiet: true })
    }
  } finally {
    clearInterval(timer)
  }
  await updateProgress()

  let saved = 0
  await mapConcurrent(jobs, CONCURRENCY, async job => {
    const parsed = path.parse(job.relativePath)
    const output = path.join(outputDir, parsed.dir, `${parsed.name}.png`)
    const color = path.join(dirs.colorX2, `${job.name}.png`)
    await fs.mkdir(path.dirname(output), { recursive: true })
    if (job.hasAlpha) await joinAlpha(color, path.join(dirs.alphaX2, `${job.name}.png`), output)
    else await fs.rename(color, output)
    logger.progress(inputDir, `Saving images: ${++saved}/${jobs.length}`)
  })
  await fs.rm(staging, { recursive: true, force: true })
}
