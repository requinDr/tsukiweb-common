import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

interface ExecutableResolution {
  command: string
  found: boolean
  cwd: string
}

interface RunCommandOptions {
  cwd?: string
}

async function canAccess(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function normalizeConfiguredValue(value: string): string {
  return value.trim().replace(/^[`'"]+|[`'"]+$/g, '')
}

function hasPathSeparator(value: string): boolean {
  return value.includes('/') || value.includes('\\')
}

async function findInPath(command: string): Promise<string | null> {
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : ['']

  const commandExt = path.extname(command)
  const candidates = commandExt
    ? [command]
    : extensions.map(ext => `${command}${ext.toLowerCase()}`).concat(extensions.map(ext => `${command}${ext}`))

  for (const dir of pathEntries) {
    for (const candidate of candidates) {
      const fullPath = path.join(dir, candidate)
      if (await canAccess(fullPath)) return fullPath
    }
  }

  return null
}

export async function resolveExecutable(configuredValue: string, baseDir: string): Promise<ExecutableResolution> {
  const normalizedValue = normalizeConfiguredValue(configuredValue)

  if (path.isAbsolute(normalizedValue) || hasPathSeparator(normalizedValue)) {
    const command = path.isAbsolute(normalizedValue)
      ? normalizedValue
      : path.resolve(baseDir, normalizedValue)

    return {
      command,
      found: await canAccess(command),
      cwd: path.dirname(command),
    }
  }

  const besideConfig = path.join(baseDir, normalizedValue)
  if (await canAccess(besideConfig)) {
    return {
      command: besideConfig,
      found: true,
      cwd: path.dirname(besideConfig),
    }
  }

  const inPath = await findInPath(normalizedValue)
  return {
    command: inPath ?? normalizedValue,
    found: Boolean(inPath),
    cwd: inPath ? path.dirname(inPath) : baseDir,
  }
}

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: 'inherit',
      shell: false,
      windowsHide: false,
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} exited with code ${code}`))
      }
    })
  })
}
