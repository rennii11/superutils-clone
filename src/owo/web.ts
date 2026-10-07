import { OWO_COMMANDS, parseOwoSlotStats, stoppedStatus, type OwoCommand, type OwoStatus } from './config.js'

export function parseOwoStatus(value: unknown): OwoStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return stoppedStatus()
  const item = value as Record<string, unknown>
  const state = item.state
  const lastAction = item.lastAction
  const lastError = item.lastError
  const updatedAt = item.updatedAt
  if (!['stopped', 'running', 'paused_captcha', 'paused_insufficient', 'error'].includes(String(state))) return stoppedStatus()
  if (lastAction !== null && !(OWO_COMMANDS as readonly string[]).includes(lastAction as OwoCommand)) return stoppedStatus()
  if (lastError !== null && typeof lastError !== 'string') return stoppedStatus()
  if (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0) return stoppedStatus()
  return { state: state as OwoStatus['state'], lastAction: lastAction as OwoStatus['lastAction'], lastError: lastError ? lastError.slice(0, 220) : null, updatedAt, slot: parseOwoSlotStats(item.slot) }
}
