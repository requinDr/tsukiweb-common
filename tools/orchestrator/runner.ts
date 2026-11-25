import readline from 'readline/promises'
import { stdin as input, stdout as output } from 'process'
import { bold, gray, green, red, underline } from '../utils/console-utils.ts'
import { displayPath } from '../utils/fs-utils.ts'
import { logger } from '../utils/logger.ts'
import { formatDuration } from '../utils/utils.ts'
import type { ExternalTool } from './external-tools.ts'
import type { Check, OrchestratorStep } from './utils.ts'

export interface OrchestratorContext {
  fields: { label: string, value: string }[]
  tools: ExternalTool[]
  steps: OrchestratorStep[]
}

export interface OrchestratorOptions {
  title: string
  subtitle: string
  load: () => Promise<OrchestratorContext>
}

const WIDTH = 82

function failures(check: Check): string[] {
  return check.details
    .filter(detail => !detail.ok)
    .map(({ failure }) => typeof failure === 'string' ? failure : `${failure.target} is ${failure.state}`)
}

async function printHeader(options: OrchestratorOptions, context: OrchestratorContext): Promise<void> {
  const labelWidth = Math.max(...context.fields.map(field => field.label.length))

  console.log(`\n${'='.repeat(WIDTH)}\n  ${options.title}\n  ${options.subtitle}\n${'-'.repeat(WIDTH)}`)
  for (const field of context.fields) {
    console.log(`  ${field.label.padEnd(labelWidth)} ${field.value}`)
  }
  console.log('')
  for (const tool of context.tools) {
    console.log(await tool.describe())
  }
  console.log('='.repeat(WIDTH))
}

async function printStatus(options: OrchestratorOptions, context: OrchestratorContext): Promise<void> {
  await printHeader(options, context)
  console.log('')

  const headings = ['Steps', 'Runnable', 'Finished', 'Details']
  const rows = await Promise.all(context.steps.map(async step => {
    const [canRun, done] = await Promise.all([step.canRun(), step.isDone()])
    return [
      `${step.id}. ${step.title}`,
      canRun.ok ? 'Yes' : 'No',
      done.ok ? 'Yes' : 'No',
      failures(canRun.ok ? done : canRun)[0] ?? '',
    ]
  }))
  const widths = headings.map((heading, index) =>
    Math.max(heading.length, ...rows.map(row => row[index].length))
  )

  console.log(headings.map((heading, index) =>
    `${underline(heading)}${' '.repeat(widths[index] - heading.length)}`
  ).join('  '))
  for (const row of rows) {
    console.log(row.map((value, index) => {
      const padded = value.padEnd(widths[index])
      return index === 1 || index === 2
        ? (value === 'Yes' ? green : red)(padded)
        : padded
    }).join('  ').trimEnd())
  }
}

async function runStep(step: OrchestratorStep): Promise<boolean> {
  const key = `step-${step.id}`
  const name = `${step.id}. ${step.title}`
  const canRun = await step.canRun()
  if (!canRun.ok) {
    logger.log(gray(`- ${name}  skipped: ${failures(canRun).join(', ')}`))
    return false
  }

  const startedAt = performance.now()
  const elapsed = () => formatDuration(performance.now() - startedAt)
  try {
    await logger.withScope(key, `  ${name}`, async () => {
      logger.progress('starting...')
      await step.run()
    })
  } catch (error) {
    logger.finish(key, red(`✗ ${name}  failed after ${elapsed()}`))
    logger.error(error instanceof Error ? error.stack : error)
    return false
  }

  const done = await step.isDone()
  if (done.ok) {
    logger.finish(key, `${green('✓')} ${name}  ${gray(elapsed())}`)
    return true
  }
  logger.finish(key, red(`✗ ${name}  incomplete after ${elapsed()}: ${failures(done).join(', ')}`))
  return false
}

async function runAll(steps: OrchestratorStep[]): Promise<void> {
  const startedAt = performance.now()
  const results = new Map<number, boolean>()
  const running = new Map<number, Promise<void>>()

  console.log('')
  for (const step of steps) {
    if (!(await step.isDone()).ok) continue
    results.set(step.id, true)
    logger.log(gray(`✓ ${step.id}. ${step.title}  already done`))
  }

  while (true) {
    for (const step of steps) {
      if (results.has(step.id) || running.has(step.id)) continue
      const dependencies = step.dependsOn ?? []
      if (dependencies.some(id => results.get(id) === false)) {
        results.set(step.id, false)
        logger.log(gray(`- ${step.id}. ${step.title}  skipped: a previous step failed`))
        continue
      }
      if (!dependencies.every(id => results.get(id))) continue

      running.set(step.id, runStep(step).then(ok => {
        results.set(step.id, ok)
        running.delete(step.id)
      }))
    }
    if (!running.size) break
    await Promise.race(running.values())
  }

  logger.log(bold(`
Finished in ${formatDuration(performance.now() - startedAt)}.`))
}

type Prompt = readline.Interface

async function ask(prompt: Prompt, question: string, fallback: string): Promise<string> {
  return prompt.question(question).then(answer => answer.trim().toLowerCase(), () => fallback)
}

async function offerDownloads(prompt: Prompt, tools: ExternalTool[]): Promise<void> {
  for (const tool of tools) {
    const { label, archiveUrl, downloadSize } = tool.definition
    if (!archiveUrl || await tool.locate()) continue

    try {
      const url = await archiveUrl()
      const answer = await ask(prompt,
        `${label} was not found in your PATH.\nDownload it (${downloadSize}) from ${url}\nto ${displayPath(tool.installDir)}? [Y/n] `,
        'n',
      )
      if (answer !== '' && answer !== 'y') continue
      await tool.install(url)
    } catch (error) {
      logger.clear()
      logger.error(`Cannot install ${label}:`, error instanceof Error ? error.message : error)
    }
  }
}

async function runInteractive(prompt: Prompt, options: OrchestratorOptions, context: OrchestratorContext): Promise<void> {
  while (true) {
    await printStatus(options, context)
    const answer = await ask(prompt, `
Step to run (1-${context.steps.length}), a=all, r=refresh, q=quit: `, 'q')

    if (answer === 'q') break
    if (answer === 'a') {
      await runAll(context.steps)
    } else if (answer && answer !== 'r') {
      const step = context.steps.find(step => step.id === Number.parseInt(answer, 10))
      if (step) await runStep(step)
      else console.log(`Unknown choice: ${answer}`)
    }
    context = await options.load()
  }
}

export async function runOrchestrator(options: OrchestratorOptions): Promise<void> {
  const prompt = readline.createInterface({ input, output })
  try {
    const context = await options.load()
    await offerDownloads(prompt, context.tools)
    if (process.argv.includes('--all')) {
      await printHeader(options, context)
      await runAll(context.steps)
    } else {
      await runInteractive(prompt, options, context)
    }
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    prompt.close()
  }
}

export function positionalArgs(): string[] {
  return process.argv.slice(2).filter(arg => !arg.startsWith('--'))
}
