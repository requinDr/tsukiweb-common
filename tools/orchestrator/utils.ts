import fs from 'fs/promises'
import path from 'path'
import { directoryHasFiles, isDirectory, pathExists } from '../utils/fs-utils.ts'

export interface FailureState {
  target: string
  state: string
}

export type CheckFailure = FailureState | string

export interface CheckDetail {
  ok: boolean
  failure: CheckFailure
}

export interface Check {
  ok: boolean
  details: CheckDetail[]
}

export interface OrchestratorStep {
  id: number
  title: string
  canRun: () => Promise<Check>
  isDone: () => Promise<Check>
  run: () => Promise<void>
}

export function check(ok: boolean, failure: CheckFailure): CheckDetail {
  return { ok, failure }
}

export function stateFailure(target: string, state: string): FailureState {
  return { target, state }
}

export function combine(details: CheckDetail[]): Check {
  return {
    ok: details.every(detail => detail.ok),
    details,
  }
}

export async function fileExistsCheck(filePath: string, label = filePath): Promise<CheckDetail> {
  return check(await pathExists(filePath), stateFailure(label, 'missing'))
}

export async function directoryExistsCheck(dirPath: string, label = dirPath): Promise<CheckDetail> {
  return check(await isDirectory(dirPath), stateFailure(label, 'missing'))
}

export async function nonEmptyDirectoryCheck(dirPath: string, label = dirPath): Promise<CheckDetail> {
  return check(await directoryHasFiles(dirPath), stateFailure(label, 'empty'))
}

export async function listScriptLangs(staticDir: string, baseLang: string): Promise<string[]> {
  if (!(await isDirectory(staticDir))) return [baseLang]

  const entries = await fs.readdir(staticDir, { withFileTypes: true })
  const others: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === baseLang) continue
    if (await isDirectory(path.join(staticDir, entry.name, 'sources'))) others.push(entry.name)
  }

  return [baseLang, ...others.sort()]
}
