const GRAY = '\u001b[90m'
const RED = '\u001b[31m'
const RESET = '\u001b[0m'

export function gray(text: string): string {
  return `${GRAY}${text}${RESET}`
}

export function red(text: string): string {
  return `${RED}${text}${RESET}`
}
