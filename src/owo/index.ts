import 'dotenv/config'
import { Client } from 'discord.js-selfbot-v13'
import { readFile, writeFile } from 'node:fs/promises'
import { embeddedSessionContext, onWorkerStop, reportTokenInvalid } from '../multi/embedded-context.js'
import { memoryConstrainedClientOptions } from '../discord-cache.js'
import { cashChannelId, parseOwoConfig, statusForError, stoppedStatus, type OwoStatus } from './config.js'
import { parseOwoStatus } from './web.js'
import { startOwoSession } from './runner.js'
import { readStoredToken } from '../token-store.js'

const embeddedSession = embeddedSessionContext(import.meta.url)
const logger = embeddedSession.logger
const { OWO_CONFIG_PATH = 'owo.json', OWO_STATUS_PATH = 'owo-status.json', OWO_CASH_REQUEST_PATH, OWO_CASH_RESULT_PATH, TOKEN_PATH, TOKEN } = embeddedSession.env
let session: Awaited<ReturnType<typeof startOwoSession>> | undefined

async function writeStatus(status: OwoStatus) {
  await writeFile(OWO_STATUS_PATH, JSON.stringify(status) + '\n', { mode: 0o600 })
}

async function loadToken() {
  if (!TOKEN_PATH) return TOKEN || ''
  return readStoredToken(await readFile(TOKEN_PATH, 'utf8')) || TOKEN || ''
}

async function readCashRequest() {
  if (!OWO_CASH_REQUEST_PATH) return null
  const value = await readFile(OWO_CASH_REQUEST_PATH, 'utf8').then(JSON.parse).catch(() => null) as { id?: unknown } | null
  return typeof value?.id === 'string' && value.id ? { id: value.id } : null
}

async function writeCashResult(result: { id: string; cash?: number; error?: string }) {
  if (!OWO_CASH_RESULT_PATH) return
  await writeFile(OWO_CASH_RESULT_PATH, JSON.stringify(result) + '\n', { mode: 0o600 })
}

async function start() {
  const parsed = parseOwoConfig(JSON.parse(await readFile(OWO_CONFIG_PATH, 'utf8')))
  const cashChannel = parsed.ok ? cashChannelId(parsed.value) : ''
  if (!parsed.ok || (!parsed.value.enabled && !/^\d{17,20}$/.test(cashChannel))) {
    await writeStatus(parsed.ok ? stoppedStatus() : { ...stoppedStatus(), state: 'error', lastError: statusForError(parsed.error), updatedAt: Date.now() })
    return
  }
  const token = await loadToken()
  if (!token) throw new Error('OwO token missing')
  const client = new Client({ checkUpdate: false, ...memoryConstrainedClientOptions } as any)
  client.on('error', error => logger.error('OwO Discord client error:', error))
  client.on('invalidated', () => {
    logger.error('OwO session invalidated')
    reportTokenInvalid()
  })
  const previousStatus = await readFile(OWO_STATUS_PATH, 'utf8').then(raw => parseOwoStatus(JSON.parse(raw))).catch(stoppedStatus)
  session = await startOwoSession({ client: client as any, token, config: parsed.value, writeStatus, readCashRequest, writeCashResult, slotStats: previousStatus.slot, logger })
}

async function shutdown(exitProcess: boolean) {
  session?.stop()
  if (exitProcess) process.exit(0)
}

if (!embeddedSession.active && process.stdin) {
  process.stdin.on('close', () => void shutdown(true))
  process.stdin.on('end', () => void shutdown(true))
  process.stdin.resume()
}

if (!embeddedSession.active) {
  process.once('SIGINT', () => void shutdown(true))
  process.once('SIGTERM', () => void shutdown(true))
} else {
  onWorkerStop(() => shutdown(false))
}

await start().catch(async error => {
  logger.error('OwO startup failed:', error instanceof Error ? error.message : String(error))
  await writeStatus({ ...stoppedStatus(), state: 'error', lastError: statusForError(error), updatedAt: Date.now() }).catch(() => undefined)
  if (!embeddedSession.active) process.exitCode = 1
})
