import path from 'path'
import { spawn } from 'child_process'
import { pathExists } from './fs-utils.ts'

interface RunCommandOptions {
  cwd?: string
  quiet?: boolean
}

export async function findInPath(command: string): Promise<string | null> {
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

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = options.quiet ? 'pipe' : 'inherit'
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['inherit', output, output],
      shell: false,
      windowsHide: false,
    })

    const captured: Buffer[] = []
    child.stdout?.on('data', chunk => captured.push(chunk))
    child.stderr?.on('data', chunk => captured.push(chunk))
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        const details = Buffer.concat(captured).toString().trim()
        reject(new Error(`${command} exited with code ${code}${details ? `
${details}` : ''}`))
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
