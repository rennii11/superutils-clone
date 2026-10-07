import { spawn } from 'node:child_process'
import { closeSync, openSync, writeSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readStoredToken } from '../token-store.js'

export type QuestType = 'DECOR' | 'ORBS' | 'BOTH'

type QuestLoopConfig = {
  dmEnabled: boolean
  discordId: string
  username: string
  days: number
  type: QuestType
  intervalMs: number
  expiresAt?: number
}

type QuestLogItem = { name: string; task: string; image: string; orbs: number; expiresAt: string; percent: number; minutesLeft: number; state: 'waiting' | 'working' | 'completed' | 'error' }
type QuestLogRecord = Pick<QuestLogItem, 'name' | 'task' | 'image' | 'orbs' | 'expiresAt'>

type QuestProgress = {
  quest: string
  task: string
  done: number
  total: number
  percent: number
  minutesLeft: number
}

type QuestSummary = {
  lastStartedAt: number | null
  lastExitCode: number | null
  total: number
  valid: number
  completed: number
  expired: number
  failed: number
  progress: QuestProgress | null
  quests: QuestLogItem[]
}

const QUEST_INTERVAL_MS = 24 * 60 * 60 * 1000
const questTimers = new Map<string, NodeJS.Timeout>()
const nextRuns = new Map<string, number>()
const questBrand = 'Tự động hoàn thành nhiệm vụ'
const botToken = (process.env.BOT_TOKEN || '').trim()

export function questNextRunAt(lastStartedAt: number | null, intervalMs: number, now = Date.now()) {
  return lastStartedAt === null ? now + intervalMs : lastStartedAt + intervalMs
}

type QuestEmbedPayload = {
  title: string
  description: string
  color: number
  footer: { text: string }
  timestamp: string
}

type QuestDmMessage = {
  edit: (embed: QuestEmbedPayload) => Promise<void>
}

function questEmbed(title: string, description: string, color = 0xb8f3ff): QuestEmbedPayload {
  return {
    title,
    description,
    color,
    footer: { text: questBrand },
    timestamp: new Date().toISOString()
  }
}

async function discordRequest(path: string, method: 'POST' | 'PATCH', body: unknown) {
  if (!botToken) return null
  const response = await fetch('https://discord.com/api/v10' + path, {
    method,
    headers: {
      Authorization: 'Bot ' + botToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  }).catch(() => null)
  if (!response?.ok) return null
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>
}

function createQuestDmSender(discordId: string) {
  let channelPromise: Promise<string | null> | null = null
  const channelId = () => {
    if (!channelPromise) {
      channelPromise = discordRequest('/users/@me/channels', 'POST', { recipient_id: discordId })
        .then(value => typeof value?.id === 'string' ? value.id : null)
    }
    return channelPromise
  }
  return async (embed: QuestEmbedPayload): Promise<QuestDmMessage | null> => {
    const target = await channelId()
    if (!target) return null
    const message = await discordRequest('/channels/' + target + '/messages', 'POST', { embeds: [embed] })
    if (typeof message?.id !== 'string') return null
    const messageId = message.id
    return {
      edit: async next => {
        await discordRequest('/channels/' + target + '/messages/' + messageId, 'PATCH', { embeds: [next] })
      }
    }
  }
}

function parseQuestDmSummary(log: string) {
  const completed = [...log.matchAll(/Quest "([^"]+)" completed!/g)].map(match => match[1])
  const failed = [...log.matchAll(/^(.*(?:failed|Error|Uncaught Exception).*)$/gmi)].map(match => match[1]).slice(-5)
  const found = log.match(/Found (\d+) valid quests? to do\./)?.[1] ?? '0'
  const scan = log.match(/Quest scan: total=(\d+) valid=(\d+) expired=(\d+) completed=(\d+) filtered=(\d+)\./)
  return {
    completed,
    failed,
    found,
    total: scan?.[1] ?? found,
    expired: scan?.[3] ?? '0'
  }
}

function parseQuestLogItems(log: string): QuestLogRecord[] {
  const records: QuestLogRecord[] = []
  for (const match of log.matchAll(/^Quest item: (.+)$/gm)) {
    try {
      const value = JSON.parse(match[1]) as Partial<QuestLogRecord>
      if (typeof value.name !== 'string' || typeof value.task !== 'string') continue
      records.push({
        name: value.name,
        task: value.task,
        image: typeof value.image === 'string' ? value.image : '',
        orbs: Number.isFinite(Number(value.orbs)) ? Number(value.orbs) : 0,
        expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : ''
      })
    } catch {}
  }
  return records
}

function parseQuestDmProgress(log: string) {
  const found = Number(log.match(/Found (\d+) valid quests? to do\./)?.[1] ?? '0')
  const names = new Set<string>()
  for (const item of parseQuestLogItems(log)) names.add(`${item.name} · ${item.task}`)
  for (const match of log.matchAll(/Quest item: ([^|]+) \| ([^\n]+)/g)) names.add(`${match[1].trim()} · ${match[2].trim()}`)
  for (const match of log.matchAll(/(?:Already enrolled in|Enrolling in) quest "([^"]+)"/g)) names.add(match[1])
  for (const match of log.matchAll(/Spoofed your game to ([^.]+)\. Wait for (\d+) more minute\(s\)\./g)) names.add(match[1])
  const wait = log.match(/Wait for (\d+) more minute\(s\)\./)?.[1]
  return { found, names: [...names], wait }
}

function parseQuestDmProgressLine(line: string) {
  const match = line.match(/^Quest progress: (.+) \| ([A-Z_]+) \| (\d+)\/(\d+)s \| (\d+)% \| (\d+)m left$/)
  if (!match) return null
  return {
    quest: match[1],
    task: match[2],
    done: Number(match[3]),
    total: Number(match[4]),
    percent: Number(match[5]),
    minutesLeft: Number(match[6])
  }
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

export class QuestControlError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
  }
}

async function hasFile(path: string) {
  return stat(path).then(item => item.isFile()).catch(() => false)
}

function isQuestType(value: unknown): value is QuestType {
  return value === 'DECOR' || value === 'ORBS' || value === 'BOTH'
}

async function readLoopConfig(root: string): Promise<QuestLoopConfig | null> {
  const value = await readFile(join(root, 'quest-loop.json'), 'utf8').then(JSON.parse).catch(() => null) as Partial<QuestLoopConfig> | null
  if (!value || typeof value.discordId !== 'string' || typeof value.username !== 'string' || !isQuestType(value.type)) return null
  const days = Number(value.days)
  const intervalMs = Number(value.intervalMs)
  if (!Number.isInteger(days) || days < 0 || days > 7 || !Number.isFinite(intervalMs) || intervalMs < 60000) return null
  const expiresAt = Number(value.expiresAt)
  return {
    discordId: value.discordId,
    username: value.username,
    days,
    type: value.type,
    intervalMs,
    dmEnabled: value.dmEnabled !== false,
    ...(Number.isFinite(expiresAt) && expiresAt > 0 ? { expiresAt } : {})
  }
}

async function readToken(root: string) {
  const raw = (await readFile(join(root, 'token.json'), 'utf8').catch(() => '')).trim()
  if (!raw) throw new QuestControlError('Slot chưa gắn token.', 409)
  return readStoredToken(raw)
}

async function verifiedToken(root: string) {
  const token = await readToken(root)
  if (token.length < 20 || token.length > 300 || /\s/.test(token)) throw new QuestControlError('Token Discord không hợp lệ.', 400)
  const response = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(10000)
  }).catch(() => null)
  if (!response) throw new QuestControlError('Không kết nối được Discord API.', 502)
  if (!response.ok) throw new QuestControlError('Token Discord sai hoặc đã hết hạn.', 400)
  const identity = await response.json().catch(() => null) as {id?: string; username?: string} | null
  if (!identity?.id || !identity.username) throw new QuestControlError('Không đọc được tài khoản Discord của token.', 502)
  return { token, id: identity.id, username: identity.username }
}

async function isPidRunning(root: string) {
  const path = join(root, 'quest.pid')
  const pid = Number(await readFile(path, 'utf8').catch(() => '0'))
  if (!pid) {
    await rm(path, { force: true }).catch(() => {})
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    await rm(path, { force: true }).catch(() => {})
    return false
  }
}

function lastMatch(text: string, expression: RegExp) {
  return [...text.matchAll(expression)].at(-1)
}

async function readSummary(root: string): Promise<QuestSummary> {
  const raw = await readFile(join(root, 'quest.log'), 'utf8').catch(() => '')
  const tail = raw.slice(-262144)
  const startIndex = tail.lastIndexOf('--- quest start ')
  const current = startIndex >= 0 ? tail.slice(startIndex) : tail
  const start = current.match(/--- quest start ([^\n]+?) ---/)
  const startedAt = start ? Date.parse(start[1]) : NaN
  const exit = lastMatch(current, /--- quest exit (-?\d+) ---/g)
  const scan = lastMatch(current, /Quest scan: total=(\d+) valid=(\d+) expired=(\d+) completed=(\d+) filtered=(\d+)\./g)
  const found = lastMatch(current, /Found (\d+) valid quests? to do\./g)
  const progresses = [...current.matchAll(/^Quest progress: (.+) \| ([A-Z_]+) \| (\d+)\/(\d+)s \| (\d+)% \| (\d+)m left$/gm)].map(match => ({ quest: match[1], task: match[2], done: Number(match[3]), total: Number(match[4]), percent: Number(match[5]), minutesLeft: Number(match[6]) }))
  const progress = progresses.at(-1)
  const progressByQuest = new Map(progresses.map(item => [item.quest, item]))
  const completedNames = new Set([...current.matchAll(/Quest "([^"]+)" completed!/g)].map(match => match[1]))
  const failed = (current.match(/^(.*(?:failed|Error|Uncaught Exception).*)$/gmi) || []).length
  const lastExitCode = exit ? Number(exit[1]) : null
  const quests = parseQuestLogItems(current).map(item => {
    const latest = progressByQuest.get(item.name)
    return { ...item, percent: latest?.percent ?? 0, minutesLeft: latest?.minutesLeft ?? 0, state: completedNames.has(item.name) ? 'completed' : latest ? 'working' : lastExitCode && lastExitCode !== 0 ? 'error' : 'waiting' } as QuestLogItem
  })
  return {
    lastStartedAt: Number.isFinite(startedAt) ? startedAt : null,
    lastExitCode,
    total: scan ? Number(scan[1]) : Number(found?.[1] || 0),
    valid: scan ? Number(scan[2]) : Number(found?.[1] || 0),
    completed: completedNames.size,
    expired: scan ? Number(scan[3]) : 0,
    failed,
    progress: progress || null,
    quests
  }
}

function clearSchedule(root: string) {
  const timer = questTimers.get(root)
  if (timer) clearTimeout(timer)
  questTimers.delete(root)
  nextRuns.delete(root)
}

let questAccessResolver:((root:string)=>Promise<boolean>)|undefined
export function setQuestAccessResolver(resolver:(root:string)=>Promise<boolean>) { questAccessResolver=resolver }
async function enabledConfig(root: string) {
  const license = await readFile(join(root, 'license.json'), 'utf8').then(JSON.parse).catch(() => null)
  if (questAccessResolver ? !await questAccessResolver(root) : license?.plan === 'free') return null
  const config = await readLoopConfig(root)
  if (!config || await hasFile(join(root, 'quest.disabled'))) return null
  if (config.expiresAt && config.expiresAt <= Date.now()) {
    await writeFile(join(root, 'quest.disabled'), 'expired\n', { mode: 0o600 })
    clearSchedule(root)
    return null
  }
  return config
}

async function launchQuest(
  root: string,
  type: QuestType,
  token: string,
  recipient: { discordId: string; username: string; dmEnabled: boolean },
  onDone?: () => Promise<void>
) {
  if (await isPidRunning(root)) throw new QuestControlError('Quest đang chạy rồi.', 409)
  await mkdir(root, { recursive: true })
  const logPath = join(root, 'quest.log')
  const output = openSync(logPath, 'w', 0o600)
  writeSync(output, '\n--- quest start ' + new Date().toISOString() + ' ---\n')
  const sendDm = recipient.dmEnabled ? createQuestDmSender(recipient.discordId) : async (_embed: QuestEmbedPayload): Promise<QuestDmMessage | null> => null
  await sendDm(questEmbed(
    'Đang quét nhiệm vụ...',
    `Xin chào **${recipient.username || 'user'}**!\nĐang kết nối và quét danh sách nhiệm vụ của bạn...\n\nVui lòng chờ, quá trình này có thể mất vài giây.`
  )).catch(() => null)
  const child = spawn(process.execPath, ['dist/quest/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, TOKEN: token, WEBHOOK_URL: '', QUEST_TYPE: type },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  try {
    await writeFile(join(root, 'quest.pid'), String(child.pid) + '\n', { mode: 0o600 })
  } catch (error) {
    child.kill()
    closeSync(output)
    throw error
  }
  let log = ''
  let progressSent = false
  const completedSent = new Set<string>()
  const progressBuckets = new Map<string, number>()
  const progressMessages = new Map<string, Promise<QuestDmMessage | null>>()
  const collect = (chunk: Buffer) => {
    const value = chunk.toString()
    log += value
    writeSync(output, value)
    const progress = parseQuestDmProgress(log)
    if (!progressSent && progress.found > 0 && progress.names.length > 0) {
      progressSent = true
      const pages = chunkItems(progress.names, 10)
      pages.forEach((page, index) => {
        const lines = [
          `Đã tìm thấy **${progress.found}** nhiệm vụ hợp lệ.`,
          `Trang **${index + 1}/${pages.length}**`,
          '',
          page.map((name, itemIndex) => `**${index * 10 + itemIndex + 1}.** ${name}`).join('\n'),
          progress.wait && index === pages.length - 1 ? `\nĐang xử lý, còn khoảng **${progress.wait} phút**.` : ''
        ].filter(Boolean)
        void sendDm(questEmbed('Danh sách nhiệm vụ', lines.join('\n'))).catch(() => null)
      })
    }
    for (const line of value.split(/\r?\n/)) {
      const current = parseQuestDmProgressLine(line.trim())
      if (!current) continue
      const bucket = Math.min(Math.floor(current.percent / 10) * 10, 100)
      const key = `${current.quest}:${current.task}`
      const lastBucket = progressBuckets.get(key)
      if (lastBucket !== undefined && bucket <= lastBucket) continue
      progressBuckets.set(key, bucket)
      const doneMin = Math.floor(current.done / 60)
      const totalMin = Math.ceil(current.total / 60)
      const embed = questEmbed(
        `Đang làm nhiệm vụ: ${current.quest}`,
        [
          `Loại: **${current.task}**`,
          `Tiến trình: **${current.percent}%** (${doneMin}/${totalMin} phút)`,
          `Còn khoảng: **${current.minutesLeft} phút**`
        ].join('\n')
      )
      const update = (progressMessages.get(key) || Promise.resolve(null))
        .then(async message => {
          if (message) {
            await message.edit(embed)
            return message
          }
          return sendDm(embed)
        })
        .catch(() => null)
      progressMessages.set(key, update)
    }
    for (const match of log.matchAll(/Quest "([^"]+)" completed!/g)) {
      const quest = match[1]
      if (completedSent.has(quest)) continue
      completedSent.add(quest)
      void sendDm(questEmbed(
        'Nhiệm vụ đã hoàn thành!',
        `**${quest}**\n\nNhiệm vụ đã hoàn thành thành công!`,
        0x57f287
      )).catch(() => null)
    }
  }
  child.stdout?.on('data', collect)
  child.stderr?.on('data', collect)
  child.once('error', error => writeSync(output, '\nQuest worker error: ' + error.message + '\n'))
  child.once('close', async code => {
    writeSync(output, '\n--- quest exit ' + String(code ?? -1) + ' ---\n')
    closeSync(output)
    await rm(join(root, 'quest.pid'), { force: true }).catch(() => {})
    const summary = parseQuestDmSummary(log)
    const foundCount = Number(summary.found)
    const lines = [
      `Xin chào **${recipient.username || 'user'}**, lượt chạy nhiệm vụ đã kết thúc.`,
      ''
    ]
    if (foundCount === 0 && summary.completed.length === 0 && !summary.failed.length) {
      lines.push('Không có nhiệm vụ hợp lệ để làm lúc này.')
    } else {
      lines.push(
        `Tổng nhiệm vụ đã quét: **${summary.total}**`,
        `Đã hoàn thành trong lượt này: **${summary.completed.length}**`,
        `Nhiệm vụ hợp lệ tìm thấy: **${summary.found}**`,
        `Nhiệm vụ lỗi / hết hạn: **${summary.failed.length + Number(summary.expired)}**`
      )
    }
    if (summary.failed.length) lines.push('', 'Lỗi:', ...summary.failed.map(line => `\`${line.slice(0, 90)}\``))
    if (code && code !== 0) lines.push('', '```', `Mã thoát: ${code}`, '```')
    await sendDm(questEmbed('Báo cáo tổng kết chi tiết', lines.join('\n'), summary.failed.length ? 0xed4245 : 0x57f287)).catch(() => null)
    await onDone?.().catch(() => {})
  })
}

async function scheduleQuestLoop(root: string, config: QuestLoopConfig, notBefore?: number) {
  clearSchedule(root)
  const now = Date.now()
  const summary = await readSummary(root)
  const dueAt = notBefore ?? questNextRunAt(summary.lastStartedAt, config.intervalMs, now)
  const scheduledAt = config.expiresAt ? Math.min(dueAt, config.expiresAt) : dueAt
  const delay = Math.max(scheduledAt - now, 0)
  if (delay <= 0) {
    if (config.expiresAt && config.expiresAt <= now) {
      await writeFile(join(root, 'quest.disabled'), 'expired\n', { mode: 0o600 })
      return
    }
  }
  nextRuns.set(root, scheduledAt)
  questTimers.set(root, setTimeout(async () => {
    questTimers.delete(root)
    nextRuns.delete(root)
    const fresh = await enabledConfig(root).catch(() => null)
    if (!fresh) return
    if (await isPidRunning(root)) {
      await scheduleQuestLoop(root, fresh, Date.now() + 60000)
      return
    }
    try {
      const verified = await verifiedToken(root)
      await launchQuest(root, fresh.type, verified.token, { discordId: verified.id, username: verified.username, dmEnabled: fresh.dmEnabled }, async () => {
        const latest = await enabledConfig(root).catch(() => null)
        if (latest) await scheduleQuestLoop(root, latest)
      })
    } catch {
      const latest = await enabledConfig(root).catch(() => null)
      if (latest) await scheduleQuestLoop(root, latest, Date.now() + latest.intervalMs)
    }
  }, delay))
}

export async function getQuestState(root: string) {
  const config = await readLoopConfig(root)
  const expired = Boolean(config?.expiresAt && config.expiresAt <= Date.now())
  if (expired && !(await hasFile(join(root, 'quest.disabled')))) await writeFile(join(root, 'quest.disabled'), 'expired\n', { mode: 0o600 })
  const disabled = await hasFile(join(root, 'quest.disabled'))
  const enabled = Boolean(config && !disabled && !expired && (!questAccessResolver || await questAccessResolver(root)))
  if (!enabled) clearSchedule(root)
  return {
    tokenPresent: await hasFile(join(root, 'token.json')),
    configured: Boolean(config),
    enabled,
    running: await isPidRunning(root),
    type: config?.type || 'BOTH',
    days: config?.days ?? 0,
    intervalMs: config?.intervalMs || QUEST_INTERVAL_MS,
    expiresAt: config?.expiresAt || null,
    dmEnabled: config?.dmEnabled ?? true,
    nextRunAt: enabled ? nextRuns.get(root) || null : null,
    summary: await readSummary(root)
  }
}

export async function enableQuest(root: string, days: number, type: QuestType, dmEnabled = true) {
  if (!Number.isInteger(days) || days < 0 || days > 7) throw new QuestControlError('Số ngày phải từ 0 đến 7.', 400)
  if (!isQuestType(type)) throw new QuestControlError('Loại nhiệm vụ không hợp lệ.', 400)
  if (await isPidRunning(root)) throw new QuestControlError('Quest đang chạy. Chờ lượt hiện tại kết thúc.', 409)
  const verified = await verifiedToken(root)
  const config: QuestLoopConfig = {
    discordId: verified.id,
    username: verified.username,
    days,
    type,
    intervalMs: QUEST_INTERVAL_MS,
    dmEnabled,
    ...(days ? { expiresAt: Date.now() + days * QUEST_INTERVAL_MS } : {})
  }
  await writeFile(join(root, 'quest-loop.json'), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  await rm(join(root, 'quest.disabled'), { force: true })
  clearSchedule(root)
  try {
    await launchQuest(root, type, verified.token, { discordId: verified.id, username: verified.username, dmEnabled }, async () => {
      const latest = await enabledConfig(root).catch(() => null)
      if (latest) await scheduleQuestLoop(root, latest)
    })
  } catch (error) {
    await scheduleQuestLoop(root, config, Date.now() + config.intervalMs)
    throw error
  }
  return getQuestState(root)
}

export async function disableQuest(root: string) {
  if (await isPidRunning(root)) throw new QuestControlError('Quest đang chạy. Chỉ có thể tắt khi lượt hiện tại kết thúc.', 409)
  clearSchedule(root)
  await writeFile(join(root, 'quest.disabled'), 'disabled\n', { mode: 0o600 })
  return getQuestState(root)
}

export async function runQuestNow(root: string, type: QuestType, beforeLaunch?: (tokenUserId: string) => void, dmEnabled = true) {
  if (!isQuestType(type)) throw new QuestControlError('Loại nhiệm vụ không hợp lệ.', 400)
  if (await isPidRunning(root)) throw new QuestControlError('Quest đang chạy. Chờ lượt hiện tại kết thúc.', 409)
  const verified = await verifiedToken(root)
  beforeLaunch?.(verified.id)
  const scheduled = await enabledConfig(root).catch(() => null)
  if (scheduled) {
    scheduled.dmEnabled = dmEnabled
    await writeFile(join(root, 'quest-loop.json'), JSON.stringify(scheduled, null, 2) + '\n', { mode: 0o600 })
    clearSchedule(root)
  }
  try {
    await launchQuest(root, type, verified.token, { discordId: verified.id, username: verified.username, dmEnabled }, scheduled ? async () => {
      const latest = await enabledConfig(root).catch(() => null)
      if (latest) await scheduleQuestLoop(root, latest)
    } : undefined)
  } catch (error) {
    if (scheduled) await scheduleQuestLoop(root, scheduled, Date.now() + scheduled.intervalMs)
    throw error
  }
  return getQuestState(root)
}

export function questRestartNotBefore(hadPid: boolean, pidRunning: boolean, now = Date.now()) {
  return hadPid && !pidRunning ? now : undefined
}

export async function questConfigRoots(configDir: string) {
  const roots: string[] = []
  for (const account of await readdir(configDir, { withFileTypes: true }).catch(() => [])) {
    if (!account.isDirectory()) continue
    for (const token of await readdir(join(configDir, account.name), { withFileTypes: true }).catch(() => [])) {
      if (token.isDirectory() && token.name !== 'media') roots.push(join(configDir, account.name, token.name))
    }
  }
  return roots
}

export async function restoreQuestLoops(configDir: string) {
  let restored = 0
  for (const root of await questConfigRoots(configDir)) {
    const hadPid = await hasFile(join(root, 'quest.pid'))
    const pidRunning = hadPid && await isPidRunning(root)
    const config = await enabledConfig(root).catch(() => null)
    if (!config) continue
    await scheduleQuestLoop(root, config, questRestartNotBefore(hadPid, pidRunning))
    restored++
  }
  return restored
}
