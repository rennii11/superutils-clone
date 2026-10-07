import 'dotenv/config'
import assert from 'node:assert/strict'
import { Client } from 'discord.js-selfbot-v13'
import { watch } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { embeddedSessionContext, onWorkerStop, reportTokenInvalid } from '../multi/embedded-context.js'
import { buildOwnerNotification, type OwnerNotificationEntry } from './owner-notification.js'
import { autoReplyAction } from './trigger.js'
import { readStoredToken } from '../token-store.js'
import { memoryConstrainedClientOptions } from '../discord-cache.js'

const embeddedSession = embeddedSessionContext(import.meta.url)
const logger = embeddedSession.logger

if (!embeddedSession.active && process.stdin) {
  process.stdin.on('close', () => process.exit(0))
  process.stdin.on('end', () => process.exit(0))
  process.stdin.resume()
}

type MentionConfig = { replyText: string; dmEnabled: boolean; historyEnabled: boolean }
const COOLDOWN_MS = 10_000

function normalizeReplyText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 2000) : ""
}

function normalizeMentionConfig(value: Partial<MentionConfig>): MentionConfig {
  return { replyText: normalizeReplyText(value.replyText), dmEnabled: value.dmEnabled !== false, historyEnabled: value.historyEnabled !== false }
}


if (embeddedSession.env.MENTION_SELF_CHECK === '1') {
  assert.equal(normalizeReplyText('  hi there  '), 'hi there')
  assert.equal(normalizeReplyText(42), '')
  assert.equal(normalizeReplyText('x'.repeat(2100)).length, 2000)
  assert.deepEqual(normalizeMentionConfig({ replyText: 'ok' }), { replyText: 'ok', dmEnabled: true, historyEnabled: true })
  assert.deepEqual(normalizeMentionConfig({ replyText: 'ok', dmEnabled: false, historyEnabled: false }), { replyText: 'ok', dmEnabled: false, historyEnabled: false })
  logger.log('Auto reply self-check passed')
  process.exit(0)
}

const { MENTION_CONFIG_PATH = 'mention.json', MENTION_LOG_PATH, MENTION_OWNER_ID, BOT_TOKEN, TOKEN_PATH, TOKEN } = embeddedSession.env
type MentionLogEntry = OwnerNotificationEntry
const MENTION_LOG_LIMIT = 15
const MENTION_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
let dmChannelId: string | undefined

async function loadToken(path: string | undefined, fallback: string | undefined): Promise<string | undefined> {
  if (!path) return fallback
  const raw = (await readFile(path, 'utf8')).trim()
  return readStoredToken(raw) || fallback
}

function retainedMentionLog(value: unknown, now = Date.now()): MentionLogEntry[] {
  const cutoff = now - MENTION_LOG_RETENTION_MS
  return (Array.isArray(value) ? value : [])
    .filter((entry): entry is MentionLogEntry => Boolean(entry) && typeof entry === "object" && Number.isSafeInteger((entry as MentionLogEntry).at) && (entry as MentionLogEntry).at >= cutoff)
    .sort((left, right) => right.at - left.at)
    .slice(0, MENTION_LOG_LIMIT)
}

async function pruneMentionLog() {
  if (!MENTION_LOG_PATH) return
  const existing = await readFile(MENTION_LOG_PATH, "utf8").then(raw => JSON.parse(raw)).catch(() => [])
  const next = retainedMentionLog(existing)
  if (JSON.stringify(existing) !== JSON.stringify(next)) await writeFile(MENTION_LOG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 })
}

async function appendMentionLog(entry: MentionLogEntry) {
  if (!MENTION_LOG_PATH) return
  try {
    const existing = await readFile(MENTION_LOG_PATH, "utf8").then(raw => JSON.parse(raw)).catch(() => [])
    const next = retainedMentionLog([entry, ...(Array.isArray(existing) ? existing : [])])
    await writeFile(MENTION_LOG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 })
  } catch (error: any) { logger.error(`Auto reply log write failed: ${error?.message || error}`) }
}


async function notifyOwner(entry: MentionLogEntry) {
  if (!BOT_TOKEN || !MENTION_OWNER_ID) return
  const headers = { Authorization: 'Bot ' + BOT_TOKEN, 'content-type': 'application/json' }
  try {
    if (!dmChannelId) {
      const dm = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers, body: JSON.stringify({ recipient_id: MENTION_OWNER_ID }), signal: AbortSignal.timeout(10000) })
      const channel = await dm.json().catch(() => null) as { id?: string } | null
      if (!dm.ok || !channel?.id) throw new Error('DM channel failed' + (dm ? ' HTTP ' + dm.status : ''))
      dmChannelId = channel.id
    }
    const body = buildOwnerNotification({ accountUsername: client.user?.username || 'Tài khoản', entry })
    const sent = await fetch('https://discord.com/api/v10/channels/' + dmChannelId + '/messages', { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })
    if (!sent.ok) throw new Error('DM send failed HTTP ' + sent.status)
  } catch (error: any) { logger.error(`Auto reply owner notify failed: ${error?.message || error}`) }
}

async function loadConfig(path: string): Promise<MentionConfig> {
  const data = JSON.parse(await readFile(path, 'utf8')) as Partial<MentionConfig>
  return normalizeMentionConfig(data)
}

const token = await loadToken(TOKEN_PATH, TOKEN)
let config = await loadConfig(MENTION_CONFIG_PATH)
let shuttingDown = false
let reloadTimer: NodeJS.Timeout | undefined
const lastReplyAt = new Map<string, number>()
function scheduleMentionLogCleanup() { void pruneMentionLog().catch(error => logger.error("Auto reply log cleanup failed:", error instanceof Error ? error.message : String(error))) }
scheduleMentionLogCleanup()
const logCleanupTimer = setInterval(scheduleMentionLogCleanup, 60 * 60 * 1000)
logCleanupTimer.unref()

if (!token) { logger.error('Auto reply: no token available'); if (!embeddedSession.active) process.exit(1) }

const client = new Client({ checkUpdate: false, ...memoryConstrainedClientOptions } as any)

client.once('ready', () => logger.log(`Auto reply logged in as ${client.user?.username}`))
client.on('error', error => logger.error('Auto reply Discord client error:', error))
client.on('invalidated', () => { logger.error('Session invalidated, token likely revoked'); reportTokenInvalid() })

client.on('messageCreate', async message => {
  if (shuttingDown || !config.replyText) return
  if (message.author.id === client.user?.id) return
  const selfUserId = client.user?.id
  if (!selfUserId) return
  const directMention = message.mentions.has(selfUserId, { ignoreRoles: true, ignoreEveryone: true, ignoreRepliedUser: true })
  const replyToSelf = message.mentions.repliedUser?.id === selfUserId
  const action = autoReplyAction(directMention, replyToSelf, Boolean(message.guild))
  if (action === 'ignore') return
  const now = Date.now()
  const last = lastReplyAt.get(message.channelId) || 0
  if (now - last < COOLDOWN_MS) return
  lastReplyAt.set(message.channelId, now)
  if (action === 'reply-and-notify') {
    try { await message.reply(config.replyText) }
    catch (error: any) { logger.error(`Auto reply failed: ${error?.message || error}`) }
  }
  const entry: MentionLogEntry = {
    authorTag: (message.author as any).tag || message.author.username,
    guildName: message.guild?.name || 'DM',
    channelName: (message.channel as any).name || '',
    messageContent: message.content.trim() || '[Tin nhắn không có nội dung văn bản]',
    url: message.url,
    at: now
  }
  await Promise.all([...(config.historyEnabled ? [appendMentionLog(entry)] : []), ...(config.dmEnabled ? [notifyOwner(entry)] : [])])
})

async function reloadConfig() {
  try { config = await loadConfig(MENTION_CONFIG_PATH) }
  catch (error) { logger.error('Auto reply config reload failed:', error instanceof Error ? error.message : String(error)) }
}

function watchConfig(path: string) {
  const file = basename(path)
  return watch(dirname(path), { persistent: true }, (_event, fileName) => {
    if (basename(String(fileName || '')) !== file) return
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => void reloadConfig(), 150)
  })
}

async function shutdown(exitProcess: boolean) {
  if (shuttingDown) return
  shuttingDown = true
  clearTimeout(reloadTimer)
  clearInterval(logCleanupTimer)
  configWatcher.close()
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

if (token) await client.login(token).catch(error => {
  if (error instanceof Error && error.message === 'An invalid token was provided.') reportTokenInvalid()
  throw error
})
const configWatcher = watchConfig(MENTION_CONFIG_PATH)
