import path from 'path'
import { spawn } from 'child_process'
import { pathExists } from './fs-utils.ts'

interface ExecutableResolution {
  command: string
  found: boolean
  cwd: string
}

interface RunCommandOptions {
  cwd?: string
  stdout?: 'inherit' | 'ignore'
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
      if (await pathExists(fullPath)) return fullPath
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
      found: await pathExists(command),
      cwd: path.dirname(command),
    }
  }

  const besideConfig = path.join(baseDir, normalizedValue)
  if (await pathExists(besideConfig)) {
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
      stdio: ['inherit', options.stdout ?? 'inherit', 'inherit'],
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

export async function withWorkingDirectory<T>(cwd: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.cwd()
  process.chdir(cwd)
  try {
    return await fn()
  } finally {
    process.chdir(previous)
  }
}
