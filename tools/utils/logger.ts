import { AsyncLocalStorage } from 'async_hooks'
import { gray, red } from './console-utils.ts'

const DEFAULT_KEY = ''
const ANSI = /\x1b\[[0-9;]*m/g

interface Scope {
  key: string
  label: string
}

function fit(text: string, width: number): string {
  if (text.replace(ANSI, '').length <= width) return text
  let visible = 0
  let result = ''
  for (const part of text.split(/(\x1b\[[0-9;]*m)/)) {
    if (part.startsWith('\x1b[')) {
      result += part
      continue
    }
    const room = width - 1 - visible
    result += part.slice(0, Math.max(0, room))
    visible += Math.min(part.length, Math.max(0, room))
  }
  return `${result}…\x1b[0m`
}

class Logger {
  private lines = new Map<string, string>()
  private drawnLines = 0
  private readonly tty = process.stdout.isTTY ?? false
  private readonly scope = new AsyncLocalStorage<Scope>()

  private erase(): void {
    if (!this.drawnLines) return
    process.stdout.write(`\x1b[${this.drawnLines}A\r\x1b[0J`)
    this.drawnLines = 0
  }

  private draw(): void {
    const width = (process.stdout.columns ?? 120) - 1
    for (const text of this.lines.values()) {
      process.stdout.write(fit(text.replace(/\s+$/, '').replace(/\n/g, ' '), width) + '\n')
      this.drawnLines++
    }
  }

  private print(stream: NodeJS.WriteStream, text: string): void {
    this.erase()
    stream.write(text + '\n')
    this.draw()
  }

  /**
   * Run `fn` with its own progress line: every progress() and log() made
   * inside it updates that line, prefixed with `label`.
   */
  withScope<T>(key: string, label: string, fn: () => Promise<T>): Promise<T> {
    return this.scope.run({ key, label }, fn)
  }

  /**
   * Update a progress line in place.
   *
   * - `logger.progress('Loading… 42%')` — default line.
   * - `logger.progress('worker-1', 'Worker 1: 42%')` — named line among several,
   *   each updated independently.
   */
  progress(text: string): void
  progress(key: string, text: string): void
  progress(keyOrText: string, text?: string): void {
    if (!this.tty) return
    const scope = this.scope.getStore()
    const message = text ?? keyOrText
    this.erase()
    if (scope) this.lines.set(scope.key, `${scope.label}  ${gray(message.trim())}`)
    else this.lines.set(text === undefined ? DEFAULT_KEY : keyOrText, message)
    this.draw()
  }

  /** Print a permanent message above the progress lines. */
  log(...args: unknown[]): void {
    if (this.scope.getStore()) {
      this.progress(args.join(' '))
      return
    }
    this.print(process.stdout, args.join(' '))
  }

  /** Print a permanent error message above the progress lines. */
  error(...args: unknown[]): void {
    const scope = this.scope.getStore()
    this.print(process.stderr, red(`${scope ? `${scope.label}  ` : ''}${args.join(' ')}`))
  }

  /** Replace a progress line with a permanent message. */
  finish(key: string, message: string): void {
    this.erase()
    this.lines.delete(key)
    process.stdout.write(message + '\n')
    this.draw()
  }

  /** Keep the current progress lines on screen and stop updating them. */
  done(): void {
    this.lines.clear()
    this.drawnLines = 0
  }

  /** Erase the progress lines. */
  clear(): void {
    this.erase()
    this.lines.clear()
  }

  section(title: string): void {
    const line = '─'.repeat(title.length + 4)
    this.log(`\n${line}\n  ${title}\n${line}`)
  }
}

export const logger = new Logger()
