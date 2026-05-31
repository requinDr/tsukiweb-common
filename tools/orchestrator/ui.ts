import readline from 'readline/promises'
import { stdin as input, stdout as output } from 'process'
import { gray } from '../utils/console-utils.ts'
import type { Check, OrchestratorStep } from './utils.ts'

export interface StepStatus {
  step: OrchestratorStep
  canRun: Check
  done: Check
}

export async function collectStatuses(steps: OrchestratorStep[]): Promise<StepStatus[]> {
  const statuses: StepStatus[] = []

  for (const step of steps) {
    statuses.push({
      step,
      canRun: await step.canRun(),
      done: await step.isDone(),
    })
  }

  return statuses
}

const OK = '\u2705'
const KO = '\u274c'

function isFailureState(failure: Check['details'][number]['failure']): failure is { target: string, state: string } {
  return typeof failure === 'object' && failure !== null && 'target' in failure && 'state' in failure
}

function formatGroupedFailure(targets: string[], state: string): string {
  return `${targets.join(', ')} ${targets.length === 1 ? 'is' : 'are'} ${state}`
}

function failedConditionLabel(check: Pick<Check, 'details'>): string {
  const failed = check.details.filter(detail => !detail.ok)
  if (!failed.length) return ''

  const grouped = new Map<string, string[]>()
  const messages: string[] = []

  for (const detail of failed) {
    if (isFailureState(detail.failure)) {
      const targets = grouped.get(detail.failure.state) ?? []
      targets.push(detail.failure.target)
      grouped.set(detail.failure.state, targets)
    } else {
      messages.push(detail.failure)
    }
  }

  for (const [state, targets] of grouped) {
    messages.push(formatGroupedFailure(targets, state))
  }

  return messages.join(', ')
}

function statusIcon(check: Check): string {
  return check.ok ? OK : KO
}

export function statusLine(label: string, check: Check): string {
  const failedLabel = check.ok ? '' : failedConditionLabel(check)
  const details = failedLabel ? ` ${gray(`(${failedLabel})`)}` : ''
  return `   ${label}: ${statusIcon(check)}${details}`
}

export function printCheckDetails(check: Check): void {
  for (const detail of check.details.filter(detail => !detail.ok)) {
    const failed = failedConditionLabel({ details: [detail] })
    console.log(` - ${KO} ${failed}`)
  }
}

export function createPrompt() {
  return readline.createInterface({ input, output })
}
