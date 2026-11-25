import fs from 'fs/promises'
import path from 'path'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as WebReadableStream } from 'stream/web'
import { gray, red } from '../utils/console-utils.ts'
import { displayPath, listFilesRecursive } from '../utils/fs-utils.ts'
import { logger } from '../utils/logger.ts'
import { findInPath, runCommand } from '../utils/process-utils.ts'
import { check, type CheckDetail } from './utils.ts'

export interface Executable {
  command: string
  cwd: string
}

export interface ExternalToolDefinition {
  label: string
  executable: string
  manualUrl: string
  downloadSize?: string
  archiveUrl?: () => Promise<string>
}

const isWindows = process.platform === 'win32'

const WAIFU2X_PLATFORM = ({
  win32: 'windows',
  linux: 'linux',
  darwin: 'macos',
} as Record<string, string | undefined>)[process.platform]

export const WAIFU2X: ExternalToolDefinition = {
  label: 'waifu2x',
  executable: isWindows ? 'waifu2x-ncnn-vulkan.exe' : 'waifu2x-ncnn-vulkan',
  manualUrl: 'https://github.com/nihui/waifu2x-ncnn-vulkan/releases/tag/20250915',
  downloadSize: '40MB',
  archiveUrl: WAIFU2X_PLATFORM
    ? async () => `https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20250915/waifu2x-ncnn-vulkan-20250915-${WAIFU2X_PLATFORM}.zip`
    : undefined,
}

const FFMPEG_PLATFORM = ({
  'win32-x64': 'win64',
  'win32-arm64': 'winarm64',
  'linux-x64': 'linux64',
  'linux-arm64': 'linuxarm64',
} as Record<string, string | undefined>)[`${process.platform}-${process.arch}`]

async function latestFfmpegBuild(): Promise<string> {
  const response = await fetch('https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest')
  if (!response.ok) throw new Error(`Cannot list ffmpeg builds: HTTP ${response.status}`)
  const release = await response.json() as { assets: { name: string, browser_download_url: string }[] }
  const pattern = new RegExp(`^ffmpeg-n(\\d+)\\.(\\d+)-latest-${FFMPEG_PLATFORM}-gpl-\\1\\.\\2\\.(zip|tar\\.xz)$`)
  const version = (name: string) => {
    const [, major, minor] = name.match(pattern)!
    return Number(major) * 1000 + Number(minor)
  }
  const asset = release.assets
    .filter(asset => pattern.test(asset.name))
    .sort((a, b) => version(b.name) - version(a.name))[0]
  if (!asset) throw new Error(`No ffmpeg build found for ${FFMPEG_PLATFORM}`)
  return asset.browser_download_url
}

export const FFMPEG: ExternalToolDefinition = {
  label: 'ffmpeg',
  executable: isWindows ? 'ffmpeg.exe' : 'ffmpeg',
  manualUrl: 'https://www.ffmpeg.org/download.html',
  downloadSize: '200MB',
  archiveUrl: FFMPEG_PLATFORM ? latestFfmpegBuild : undefined,
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`
}

async function download(url: string, file: string, label: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`Cannot download ${url}: HTTP ${response.status}`)

  const total = Number(response.headers.get('content-length')) || 0
  let received = 0
  let lastUpdate = 0
  const body = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>)
  await pipeline(body, async function* (chunks: AsyncIterable<Uint8Array>) {
    for await (const chunk of chunks) {
      received += chunk.length
      if (Date.now() - lastUpdate > 250) {
        lastUpdate = Date.now()
        logger.progress(label, `Downloading ${label}: ${formatSize(received)}${total ? `/${formatSize(total)}` : ''}`)
      }
      yield chunk
    }
  }, createWriteStream(file))
  logger.progress(label, `Downloaded ${label}: ${formatSize(received)}`)
}

async function extract(archive: string, dir: string): Promise<void> {
  if (isWindows) {
    await runCommand(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', archive, '-C', dir])
  } else if (archive.endsWith('.zip')) {
    await runCommand('unzip', ['-q', archive, '-d', dir])
  } else {
    await runCommand('tar', ['-xf', archive, '-C', dir])
  }
}

export class ExternalTool {
  readonly definition: ExternalToolDefinition
  readonly installDir: string
  private located?: Promise<Executable | null>

  constructor(definition: ExternalToolDefinition, binDir: string) {
    this.definition = definition
    this.installDir = path.join(binDir, definition.label)
  }

  locate(): Promise<Executable | null> {
    return this.located ??= this.find()
  }

  private async find(): Promise<Executable | null> {
    const command = await findInPath(this.definition.executable)
      ?? (await listFilesRecursive(this.installDir))
        .filter(file => path.basename(file) === this.definition.executable)
        .map(file => path.join(this.installDir, file))[0]
    return command ? { command, cwd: path.dirname(command) } : null
  }

  async check(): Promise<CheckDetail> {
    return check(Boolean(await this.locate()), `${this.definition.label} is unavailable`)
  }

  async describe(): Promise<string> {
    const { label, manualUrl } = this.definition
    const executable = await this.locate()
    if (executable) return `  ${label} ${gray(displayPath(executable.command))}`
    const hint = this.definition.archiveUrl ? ', or restart to download it automatically' : ''
    return `  ${red(`${label} not found, download ${manualUrl} and add it to your PATH${hint}`)}`
  }

  async executable(): Promise<Executable> {
    const executable = await this.locate()
    if (!executable) throw new Error(`${this.definition.label} not found`)
    return executable
  }

  async install(url: string): Promise<void> {
    const { label } = this.definition
    const tempDir = `${this.installDir}.tmp`
    const archive = `${this.installDir}${path.extname(new URL(url).pathname)}`

    await fs.rm(tempDir, { recursive: true, force: true })
    await fs.mkdir(tempDir, { recursive: true })
    try {
      await download(url, archive, label)
      logger.progress(label, `Extracting ${label}...`)
      await extract(archive, tempDir)
      await fs.rm(this.installDir, { recursive: true, force: true })
      await fs.rename(tempDir, this.installDir)
      this.located = undefined
      logger.finish(label, `Installed ${label} in ${displayPath(this.installDir)}`)
    } finally {
      await fs.rm(archive, { force: true })
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  }
}
