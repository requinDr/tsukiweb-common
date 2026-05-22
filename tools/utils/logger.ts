declare const process: {
  stdout: { isTTY: boolean; write: (s: string) => void }
  stderr: { write: (s: string) => void }
}

const CURSOR_COL0  = '\r'          // move to column 0
const CLEAR_LINE   = '\x1b[2K'    // clear entire current line
const cursorUp = (n: number) => `\x1b[${n}A`
const cursorDown = (n: number) => `\x1b[${n}B`

type Mode = 'idle' | 'single' | 'multi'

class Logger {
  private mode: Mode = 'idle'
  private lines = new Map<string, string>()
  private lineOrder: string[] = []
  private readonly tty = process.stdout.isTTY ?? false

  // ─── Private ────────────────────────────────────────────────────────────────

  private erase(): void {
    if (!this.tty) return

    if (this.mode === 'single') {
      process.stdout.write(CURSOR_COL0 + CLEAR_LINE)
    } else if (this.mode === 'multi') {
      process.stdout.write(cursorUp(this.lineOrder.length))
      for (let i = 0; i < this.lineOrder.length; i++) {
        process.stdout.write(CURSOR_COL0 + CLEAR_LINE)
        if (i < this.lineOrder.length - 1) process.stdout.write(cursorDown(1))
      }
    }
  }

  private redraw(): void {
    if (!this.tty || this.mode !== 'multi') return
    for (const key of this.lineOrder) {
      process.stdout.write(CURSOR_COL0 + CLEAR_LINE + this.lines.get(key)! + '\n')
    }
  }

  private reset(): void {
    this.mode = 'idle'
    this.lines.clear()
    this.lineOrder = []
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Update a progress line.
   *
   * - `logger.progress('Loading… 42%')` — single line, updated in place.
   * - `logger.progress('worker-1', 'Worker 1: 42%')` — named line among several,
   *   each updated independently.
   */
  progress(text: string): void
  progress(key: string, text: string): void
  progress(keyOrText: string, text?: string): void {
    if (!this.tty) return

    if (text === undefined) {
      if (this.mode === 'multi') throw new Error('[logger] Cannot mix progress() and progress(key, text)')
      this.mode = 'single'
      process.stdout.write(CURSOR_COL0 + CLEAR_LINE + keyOrText)
    } else {
      if (this.mode === 'single') throw new Error('[logger] Cannot mix progress(key, text) and progress()')
      this.mode = 'multi'

      const key = keyOrText
      if (!this.lines.has(key)) {
        this.lineOrder.push(key)
        this.lines.set(key, text)
        process.stdout.write(text + '\n')
        return
      }

      this.lines.set(key, text)
      process.stdout.write(cursorUp(this.lineOrder.length))
      this.redraw()
    }
  }

  /**
   * Print a permanent log message.
   * In multi-line mode, progress lines are preserved below.
   */
  log(...args: unknown[]): void {
    if (this.tty) {
      this.erase()
      process.stdout.write(args.join(' ') + '\n')
      this.redraw()
    } else {
      process.stdout.write(args.join(' ') + '\n')
    }
  }

  /**
   * Print a permanent error message.
   * In multi-line mode, progress lines are preserved below.
   */
  error(...args: unknown[]): void {
    if (this.tty) {
      this.erase()
      process.stderr.write(args.join(' ') + '\n')
      this.redraw()
    } else {
      process.stderr.write(args.join(' ') + '\n')
    }
  }

  /**
   * Commit the last progress line and return to idle mode.
   * Useful to "freeze" a final result before continuing to log.
   *
   * @example
   * logger.progress('Done ✓')
   * logger.done()
   * logger.log('Continuing…')
   */
  done(): void {
    if (this.tty && this.mode === 'single') {
      process.stdout.write('\n')
    }
    this.reset()
  }

  /**
   * Erase the progress area and reset state, leaving no trace.
   */
  clear(): void {
    this.erase()
    this.reset()
  }

  section(title: string): void {
    const line = '─'.repeat(title.length + 4)
    this.log(`\n${line}\n  ${title}\n${line}`)
  }
}

export const logger = new Logger()
