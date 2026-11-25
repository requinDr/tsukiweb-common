const RESET = '\u001b[0m'

export function gray(text: string): string {
  return `\u001b[90m${text}${RESET}`
}

export function red(text: string): string {
  return `\u001b[31m${text}${RESET}`
}

export function green(text: string): string {
  return `\u001b[32m${text}${RESET}`
}

export function underline(text: string): string {
  return `\u001b[4m${text}${RESET}`
}

export function bold(text: string): string {
  return `\u001b[1m${text}${RESET}`
}
