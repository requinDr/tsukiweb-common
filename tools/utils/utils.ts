export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`

  const totalSeconds = Math.round(milliseconds / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)

  if (totalMinutes === 0) return `${seconds}s`

  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (hours === 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`

  return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
}