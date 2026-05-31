const GRAY = '\u001b[90m'
const RESET = '\u001b[0m'

export function gray(text: string): string {
  return `${GRAY}${text}${RESET}`
}
