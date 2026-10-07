import 'dotenv/config'
import { Client } from 'discord.js-selfbot-v13'
import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { nextStatusIndex, normalizeStatusConfig, statusDelaySeconds, statusEmoji, type StatusConfig, type StatusItem } from './config.js'
import { embeddedSessionContext, onWorkerStop, reportTokenInvalid } from '../multi/embedded-context.js'
import { readStoredToken } from '../token-store.js'
import { memoryConstrainedClientOptions } from '../discord-cache.js'

const embeddedSession = embeddedSessionContext(import.meta.url)
const logger = embeddedSession.logger

if (!embeddedSession.active && process.stdin) {
  process.stdin.on('close', () => process.exit(0))
  process.stdin.on('end', () => process.exit(0))
  process.stdin.resume()
}

const { STATUS_CONFIG_PATH = 'status.json', TOKEN_PATH, TOKEN } = embeddedSession.env

async function loadToken(path: string | undefined, fallback: string | undefined): Promise<string | undefined> {
  if (!path) return fallback
  const raw = (await readFile(path, 'utf8')).trim()
  return readStoredToken(raw) || fallback
}

async function loadConfig(path: string): Promise<StatusConfig> {
  return normalizeStatusConfig(JSON.parse(await readFile(path, 'utf8')))
}

const token = await loadToken(TOKEN_PATH, TOKEN)
if (!token) {
  logger.error('Missing token for custom status')
  if (embeddedSession.active) throw new Error('Missing token for custom status')
  process.exit(1)
}

let config = await loadConfig(STATUS_CONFIG_PATH)
let statusIndex = -1
let lyricStartedAt = performance.now()
let shuttingDown = false
let rotateTimer: NodeJS.Timeout | undefined
let reloadTimer: NodeJS.Timeout | undefined
let originalCustomStatus: { text: string | null; emoji_name: string | null; emoji_id: string | null; expires_at: string | null } | null | undefined

const client = new Client({ checkUpdate: false, ...memoryConstrainedClientOptions } as any)

// Snapshot chụp một lần lúc ready; nếu user tự đổi custom status thủ công trong lúc module đang chạy,
// restore lúc shutdown sẽ trả về giá trị snapshot ban đầu, không phải giá trị user vừa đổi.
async function captureOriginalStatus() {
  try {
    await (client as any).settings.fetch()
    const current = (client as any).settings.customStatus
    originalCustomStatus = current ? { text: current.text ?? null, emoji_name: current.emoji_name ?? null, emoji_id: current.emoji_id ?? null, expires_at: current.expires_at ?? null } : null
  } catch (error: any) {
    logger.error('Failed to read original custom status:', error?.message || error)
  }
}

async function restoreOriginalStatus() {
  if (originalCustomStatus === undefined) return
  try {
    await Promise.race([
      (client as any).settings.edit({ custom_status: originalCustomStatus }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800))
    ])
    logger.log('Custom status restored to original')
  } catch (error: any) {
    logger.error('Failed to restore original custom status:', error?.message || error)
  }
}

function buildActivity(status: StatusItem) {
  return {
    name: 'Custom Status',
    type: 4,
    state: status.text,
    emoji: statusEmoji(config, status)
  }
}

async function applyStatus() {
  if (shuttingDown || !config.statuses.length) return
  statusIndex = nextStatusIndex(statusIndex, config.statuses.length, config.mode)
  const status = config.statuses[statusIndex]
  try {
    client.user?.setPresence({ activities: [buildActivity(status)], status: desiredStatus, afk: false } as any)
    if (config.delayMode === 'lyrics' && statusIndex === 0) lyricStartedAt = performance.now()
  } catch (error: any) {
    logger.error('Failed to set custom status:', error?.message || error)
  }
}

function scheduleRotate() {
  if (rotateTimer) clearTimeout(rotateTimer)
  if (shuttingDown || !config.statuses.length) return
  if (config.delayMode === 'lyrics') {
    const current = config.statuses[statusIndex]
    const next = config.statuses[statusIndex + 1]
    if (!next && config.statuses.length === 1 && current.endSeconds === undefined && !config.loopDelaySeconds) return
    const firstAt = config.statuses[0].atSeconds!
    const nextAt = next ? next.atSeconds! : (current.endSeconds ?? current.atSeconds!) + (config.loopDelaySeconds ?? 0)
    const delayMs = Math.max(next ? 1 : 0, (nextAt - firstAt) * 1000 - (performance.now() - lyricStartedAt))
    rotateTimer = setTimeout(() => { void applyStatus().then(scheduleRotate) }, delayMs)
    return
  }
  if (config.statuses.length < 2) return
  const status = config.statuses[statusIndex]
  rotateTimer = setTimeout(() => { void applyStatus().then(scheduleRotate) }, statusDelaySeconds(config, status) * 1000)
}

function watchConfig(path: string) {
  const file = basename(path)
  return watch(dirname(path), { persistent: true }, (_event, fileName) => {
    if (basename(String(fileName || '')) !== file) return
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      loadConfig(path)
        .then(next => {
          config = next
          statusIndex = -1
          lyricStartedAt = performance.now()
          if (!config.statuses.length) { logger.error('Missing statuses for custom status'); return }
          void applyStatus().then(scheduleRotate)
        })
        .catch(error => logger.error('Custom status config reload failed:', error instanceof Error ? error.message : String(error)))
    }, 150)
  })
}

// Giữ nguyên trạng thái trực tuyến account tự đặt thay vì ép 'online' mỗi lần đổi status.
let desiredStatus: 'online' | 'idle' | 'dnd' | 'invisible' = 'online'

client.once('ready', () => {
  logger.log(`Custom status logged in as ${client.user?.username}`)
  const current = (client.user?.presence?.status as any)
  if (current && current !== 'offline') desiredStatus = current
  else {
    const settingStatus = (client as any).settings?.status
    if (settingStatus && settingStatus !== 'offline' && settingStatus !== 'unknown') desiredStatus = settingStatus
  }
  logger.log(`Preserving online status: ${desiredStatus}`)
  void captureOriginalStatus().then(() => {
    if (!config.statuses.length) { logger.error('Missing statuses for custom status'); return }
    lyricStartedAt = performance.now()
    void applyStatus().then(scheduleRotate)
  })
})
client.on('error', error => logger.error('Discord client error:', error))
client.on('invalidated', () => { logger.error('Session invalidated, token likely revoked'); reportTokenInvalid() })

async function shutdown(exitProcess: boolean) {
  if (shuttingDown) return
  shuttingDown = true
  clearTimeout(rotateTimer)
  clearTimeout(reloadTimer)
  configWatcher.close()
  await restoreOriginalStatus()
  client.destroy()
  if (exitProcess) process.exit(0)
}

export async function stopEmbeddedSession() {
  await shutdown(false)
}

if (!embeddedSession.active) {
  process.once('SIGINT', () => void shutdown(true))
  process.once('SIGTERM', () => void shutdown(true))
} else {
  onWorkerStop(() => stopEmbeddedSession())
}

try {
  await client.login(token)
} catch (error) {
  if (error instanceof Error && error.message === 'An invalid token was provided.') reportTokenInvalid()
  client.destroy()
  throw error
}
const configWatcher = watchConfig(STATUS_CONFIG_PATH)
