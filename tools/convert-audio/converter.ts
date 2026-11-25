import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { displayPath, isMediaFile, listFilesRecursive } from '../utils/fs-utils.ts'
import { logger } from '../utils/logger.ts'
import { runCommand } from '../utils/process-utils.ts'
import { mapConcurrent } from '../utils/utils.ts'
import type { Executable } from '../orchestrator/external-tools.ts'

export async function convertAudioTree(
  ffmpeg: Executable,
  args: readonly string[],
  inputDir: string,
  outputDir: string,
  outputName: (relativePath: string) => string = relativePath => `${path.parse(relativePath).name}.webm`,
): Promise<void> {
  const files = (await listFilesRecursive(inputDir)).filter(isMediaFile)
  const outputs = files.map(file => path.join(outputDir, path.dirname(file), outputName(file)))
  const duplicate = outputs.find((output, index) => outputs.indexOf(output) !== index)
  if (duplicate) throw new Error(`Duplicate output audio file "${displayPath(duplicate)}".`)

  const label = displayPath(inputDir)
  let converted = 0
  logger.progress(label, `Converting ${label}: 0/${files.length}`)
  await mapConcurrent(files, os.availableParallelism(), async (file, index) => {
    await fs.mkdir(path.dirname(outputs[index]), { recursive: true })
    await runCommand(ffmpeg.command, ['-y', '-i', path.join(inputDir, file), ...args, outputs[index]], { cwd: ffmpeg.cwd })
    logger.progress(label, `Converting ${label}: ${++converted}/${files.length}`)
  })
}
