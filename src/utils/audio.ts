export function calcGain(value: number) {
  if (value <= 0)
    return 0
  const valueRange = 10 // from 0 to 10. 0 => no sound.
  const dbRange = 25 // from -25dB to 0dB. -25 not used (volume=0 => no sound).
  const normalizedValue = value / valueRange
  const dB = normalizedValue * dbRange - dbRange
  return Math.pow(10, dB / 20)
}