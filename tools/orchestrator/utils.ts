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
