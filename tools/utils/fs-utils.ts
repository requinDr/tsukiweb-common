import fs from 'fs/promises'
import path from 'path'

const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    return (await fs.stat(dirPath)).isDirectory()
  } catch {
    return false
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDir: string, relativeDir = ''): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue

      const relativePath = path.join(relativeDir, entry.name)
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        await walk(fullPath, relativePath)
      } else if (entry.isFile()) {
        files.push(relativePath)
      }
    }
  }

  await walk(root)
  return files
}

export async function directoryHasFiles(dirPath: string): Promise<boolean> {
  return (await listFilesRecursive(dirPath)).length > 0
}

export async function ensureEmptyDirInside(root: string, dirPath: string): Promise<void> {
  const relative = path.relative(root, dirPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to empty a directory outside ${root}: ${dirPath}`)
  }

  await fs.rm(dirPath, { recursive: true, force: true })
  await fs.mkdir(dirPath, { recursive: true })
}

export async function copyDirectory(source: string, target: string, guardRoot: string): Promise<void> {
  await ensureEmptyDirInside(guardRoot, target)
  await fs.cp(source, target, { recursive: true })
}

export function displayPath(filePath: string, from = process.cwd()): string {
  return (path.relative(from, filePath) || '.').replaceAll('\\', '/')
}

export function isMediaFile(relativePath: string): boolean {
  const name = path.basename(relativePath)
  if (IGNORED_NAMES.has(name)) return false
  if (name.startsWith('.')) return false

  const ext = path.extname(name).toLowerCase()
  return !ext || [
    '.aac',
    '.flac',
    '.m4a',
    '.mp3',
    '.ogg',
    '.opus',
    '.wav',
    '.webm',
  ].includes(ext)
}
