import path from 'path'

import { displayPath } from '../utils/fs-utils.ts'
import { resolveExecutable } from '../utils/process-utils.ts'

export interface OrchestratorHeaderField {
  label: string
  value: string
}

export interface OrchestratorHeaderTool {
  label: string
  configuredValue: string
  downloadUrl?: string
}

interface ToolStatus extends OrchestratorHeaderTool {
  command: string
  found: boolean
}

export interface OrchestratorHeaderPaths {
  repo: string
  tools: string
}

export interface OrchestratorHeaderOptions {
  title: string
  subtitle?: string
  fields: OrchestratorHeaderField[]
  paths: OrchestratorHeaderPaths
  tools?: OrchestratorHeaderTool[]
  width?: number
}

const OK = '\u2705'
const KO = '\u274c'
const DEFAULT_WIDTH = 72

async function collectToolStatuses(
  tools: OrchestratorHeaderTool[],
  baseDir: string,
): Promise<ToolStatus[]> {
  return Promise.all(tools.map(async tool => {
    const executable = await resolveExecutable(tool.configuredValue, baseDir)
    return {
      ...tool,
      command: executable.command,
      found: executable.found,
    }
  }))
}

function printSeparator(char: string, width: number): void {
  console.log(char.repeat(width))
}

function printHeaderFields(fields: OrchestratorHeaderField[]): void {
  const labelWidth = Math.max(0, ...fields.map(field => field.label.length))

  for (const field of fields) {
    console.log(`  ${field.label.padEnd(labelWidth)} ${field.value}`)
  }
}

function isInsideDir(baseDir: string, targetPath: string): boolean {
  const relative = path.relative(baseDir, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function hasPathSeparator(value: string): boolean {
  return value.includes('/') || value.includes('\\')
}

function formatFoundTool(status: ToolStatus, paths: OrchestratorHeaderPaths): string {
  if (path.isAbsolute(status.command) && isInsideDir(paths.repo, status.command)) {
    return displayPath(status.command, paths.repo)
  }

  if (!path.isAbsolute(status.configuredValue) && !hasPathSeparator(status.configuredValue)) {
    return `found in PATH (${status.configuredValue})`
  }

  return `found (${status.configuredValue})`
}

function formatToolStatus(status: ToolStatus, paths: OrchestratorHeaderPaths, labelWidth: number): string {
  const icon = status.found ? OK : KO
  const state = status.found ? formatFoundTool(status, paths) : `not found (${status.configuredValue})`
  return `  ${icon} ${status.label.padEnd(labelWidth)} ${state}`
}

function printToolStatus(status: ToolStatus, paths: OrchestratorHeaderPaths, labelWidth: number): void {
  console.log(formatToolStatus(status, paths, labelWidth))
  if (!status.found && status.downloadUrl) {
    console.log(`     Download ${status.downloadUrl}`)
  }
}

export async function printOrchestratorHeader(options: OrchestratorHeaderOptions): Promise<void> {
  const width = options.width ?? DEFAULT_WIDTH
  const toolStatuses = options.tools?.length
    ? await collectToolStatuses(options.tools, options.paths.tools)
    : []

  console.log('')
  printSeparator('=', width)
  console.log(`  ${options.title}`)
  if (options.subtitle) {
    console.log(`  ${options.subtitle}`)
  }
  printSeparator('-', width)
  printHeaderFields(options.fields)

  if (toolStatuses.length) {
    const toolLabelWidth = Math.max(...toolStatuses.map(status => status.label.length))
    console.log('')
    console.log('  Tools')
    for (const status of toolStatuses) {
      printToolStatus(status, options.paths, toolLabelWidth)
    }
  }

  printSeparator('=', width)
  console.log('')
}
