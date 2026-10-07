import { betweenCommandDelayMs, captchaRestartDelayMs, cashChannelId, channelIdForCommand, commandEnabled, commandText, delayMs, emptySlotStats, OWO_COMMANDS, slotStake, statusForError, type OwoCommand, type OwoConfig, type OwoSlotStats, type OwoStatus } from './config.js'
import { resolveOwoCaptcha, type OwoCaptchaLogger } from './captcha.js'

const OWO_BOT_ID = '408785106942164992'
const VERIFIED_TEXT = 'i have verified that you are human! thank you! :3'

type OwoMessage = {
  authorId: string
  channelId: string
  content: string
  embedAuthorNames?: string[]
  hasVerifyButton?: boolean
  hasAttachments?: boolean
  isDirectMessage?: boolean
}

type DiscordChannel = { send: (message: string) => Promise<unknown> }

type DiscordMessage = {
  author?: { id?: string }
  channelId?: string
  content?: string
  embeds?: Array<{ author?: { name?: string | null } | null }>
  components?: Array<{ components?: Array<{ label?: string | null }> | null, children?: Array<{ label?: string | null }> | null }>
  attachments?: { size?: number }
  channel?: { type?: unknown }
}

type DiscordClient = {
  once: (event: 'ready', listener: () => Promise<void>) => unknown
  on: ((event: 'messageCreate', listener: (message: DiscordMessage) => void) => unknown) & ((event: 'messageUpdate', listener: (before: DiscordMessage, after: DiscordMessage) => void) => unknown)
  login: (token: string) => Promise<unknown>
  destroy: () => void
  user?: { displayName?: string }
  channels: { fetch: (id: string) => Promise<DiscordChannel | null> }
}

export type OwoCashRequest = { id: string }
export type OwoCashResult = { id: string; cash?: number; error?: string }

type OwoControllerDependencies = {
  config: OwoConfig
  send: (message: string, command: OwoCommand) => Promise<void>
  writeStatus: (status: OwoStatus) => Promise<void>
  schedule: (delay: number) => void
  userDisplayName?: string | (() => string)
  now?: () => number
  random?: () => number
  slotStats?: OwoSlotStats
  solveCaptcha?: () => Promise<void>
}

export function selectReadyCommand(config: OwoConfig, dueAt: Partial<Record<OwoCommand, number>>, awaiting: ReadonlyMap<OwoCommand, number>, time: number): OwoCommand | null {
  let selected: OwoCommand | null = null
  for (const command of OWO_COMMANDS) {
    const due = dueAt[command] || 0
    if (!config.enabled || !commandEnabled(config, command) || awaiting.has(command) || due > time) continue
    if (!selected || due < (dueAt[selected] || 0)) selected = command
  }
  return selected
}

function isCaptcha(message: OwoMessage, content: string) {
  return Boolean(message.hasVerifyButton || (message.hasAttachments && content.includes('⚠️')) || /captcha|verify\s+you\s+are\s+human|human\s+verification/.test(content))
}

function ownerName(value: OwoControllerDependencies['userDisplayName']) {
  return typeof value === 'function' ? value().trim().toLowerCase() : String(value || '').trim().toLowerCase()
}

function isHuntResult(content: string, name: string) {
  return Boolean(name) && content.includes(name) && /you found:|caught/.test(content)
}

function isBattleResult(names: string[] | undefined, name: string) {
  return Boolean(name) && Boolean(names?.some(value => value.toLowerCase().includes(name + ' goes into battle!')))
}

function slotResult(content: string, name: string) {
  if(!name||!content.includes(name))return null
  const betMatch=content.match(/\bbet\s+(?:<:[^:>]+:\d+>\s*)?([\d,]+)/i)
  if(!betMatch)return null
  const bet=Number(betMatch[1].replaceAll(',',''))
  if(!Number.isSafeInteger(bet)||bet<1)return null
  if(/and won nothing/i.test(content))return {bet,won:false}
  const wonMatch=content.match(/and won\s+(?:<:[^:>]+:\d+>\s*)?([\d,]+)/i)
  if(!wonMatch)return null
  const wonAmount=Number(wonMatch[1].replaceAll(',',''))
  return Number.isSafeInteger(wonAmount)&&wonAmount>0?{bet,won:true,wonAmount}:null
}

export function parseOwoCash(content: string): number | null {
  const plain = content.replace(/[*_]/g, ' ')
  if (!/you currently have/i.test(plain)) return null
  const match = plain.match(/([\d,]+)\s+cowoncy\b/i)
  if (!match) return null
  const cash = Number(match[1].replaceAll(',', ''))
  return Number.isSafeInteger(cash) && cash >= 0 ? cash : null
}

export function createOwoController(dependencies: OwoControllerDependencies) {
  const now = dependencies.now || Date.now
  const random = dependencies.random || Math.random
  const dueAt: Partial<Record<OwoCommand, number>> = {}
  const awaiting = new Map<OwoCommand, number>()
  let paused = false
  let resumeAt = 0
  let nextAllowedAt = 0
  let captchaSolveInFlight = false
  let current: OwoStatus = { state: 'running', lastAction: null, lastError: null, updatedAt: now(), slot: dependencies.slotStats || emptySlotStats() }

  async function persist() {
    current = { ...current, updatedAt: now() }
    await dependencies.writeStatus(current)
  }

  function enabled(command: OwoCommand) {
    return dependencies.config.enabled && commandEnabled(dependencies.config, command)
  }

  function readyCommand(time: number) {
    return selectReadyCommand(dependencies.config, dueAt, awaiting, time)
  }

  function arm() {
    if (paused) return
    const time = now()
    if (resumeAt > time) {
      dependencies.schedule(resumeAt - time)
      return
    }
    const wakeups: number[] = []
    for (const command of OWO_COMMANDS) {
      if (!enabled(command) || awaiting.has(command)) continue
      wakeups.push(Math.max(dueAt[command] || 0, nextAllowedAt))
    }
    for (const deadline of awaiting.values()) wakeups.push(deadline)
    if (wakeups.length) dependencies.schedule(Math.max(0, Math.min(...wakeups) - time))
  }

  function expireAwaiting(time: number) {
    for (const [command, deadline] of awaiting) {
      if (deadline > time) continue
      awaiting.delete(command)
      dueAt[command] = time
    }
  }

  function confirm(command: OwoCommand, time: number) {
    if (!awaiting.delete(command)) return false
    dueAt[command] = time + delayMs(dependencies.config, random, command)
    return true
  }

  return {
    status: () => current,
    async tick() {
      if (paused) return
      const time = now()
      if (resumeAt > time) {
        arm()
        return
      }
      if (resumeAt) {
        resumeAt = 0
        current = { ...current, state: 'running', lastError: null }
        await persist()
      }
      expireAwaiting(time)
      const command = readyCommand(time)
      if (!command || time < nextAllowedAt) {
        arm()
        return
      }
      try {
        await dependencies.send(commandText(dependencies.config, command), command)
        awaiting.set(command, time + delayMs(dependencies.config, random, command))
        nextAllowedAt = time + betweenCommandDelayMs(random)
        current = { ...current, state: 'running', lastAction: command, lastError: null }
        await persist()
        arm()
      } catch (error) {
        current = { ...current, state: 'error', lastError: statusForError(error) }
        await persist()
      }
    },
    async onOwoMessage(message: OwoMessage) {
      if (message.authorId !== OWO_BOT_ID) return
      const content = message.content.trim().toLowerCase()
      if (message.isDirectMessage && content.includes(VERIFIED_TEXT)) {
        if (!paused) return
        resumeAt = now() + captchaRestartDelayMs(random)
        paused = false
        arm()
        return
      }
      if (!OWO_COMMANDS.some(command => commandEnabled(dependencies.config, command) && channelIdForCommand(dependencies.config, command) === message.channelId)) return
      if (message.channelId === channelIdForCommand(dependencies.config, 'slot') && awaiting.has('slot') && /you don't have enough cowoncy!/.test(content)) {
        paused = true
        resumeAt = 0
        awaiting.delete('slot')
        current = { ...current, state: 'paused_insufficient', lastError: 'Không đủ cowoncy.' }
        await persist()
        return
      }
      if (isCaptcha(message, content)) {
        paused = true
        resumeAt = 0
        awaiting.clear()
        current = { ...current, state: 'paused_captcha', lastError: null }
        await persist()
        if (dependencies.solveCaptcha && !captchaSolveInFlight) {
          captchaSolveInFlight = true
          void dependencies.solveCaptcha()
            .catch(async error => {
              current = { ...current, lastError: statusForError(error) }
              await persist()
            })
            .finally(() => { captchaSolveInFlight = false })
        }
        return
      }
      const name = ownerName(dependencies.userDisplayName)
      const time = now()
      if (message.channelId === channelIdForCommand(dependencies.config, "hunt") && isHuntResult(content, name) && confirm("hunt", time)) {
        await persist()
        arm()
        return
      }
      if (message.channelId === channelIdForCommand(dependencies.config, "battle") && isBattleResult(message.embedAuthorNames, name) && confirm("battle", time)) {
        await persist()
        arm()
        return
      }
      const result=message.channelId===channelIdForCommand(dependencies.config, "slot")?slotResult(content,name):null
      if(result&&confirm("slot",time)){
        const payout=result.won?result.wonAmount || 0:0
        const slot=current.slot
        current={...current,slot:result.won?{...slot,wins:Math.min(Number.MAX_SAFE_INTEGER,slot.wins+1),won:Math.min(Number.MAX_SAFE_INTEGER,slot.won+payout)}:{...slot,losses:Math.min(Number.MAX_SAFE_INTEGER,slot.losses+1),lost:Math.min(Number.MAX_SAFE_INTEGER,slot.lost+result.bet)}}
        await persist()
        arm()
      }
    }
  }
}

function hasVerifyButton(message: DiscordMessage) {
  return Boolean(message.components?.some(row => [...(row.components || []), ...(row.children || [])].some(component => component.label === 'Verify')))
}

export async function startOwoSession(options: {
  client: DiscordClient
  token: string
  config: OwoConfig
  writeStatus: (status: OwoStatus) => Promise<void>
  readCashRequest?: () => Promise<OwoCashRequest | null>
  writeCashResult?: (result: OwoCashResult) => Promise<void>
  schedule?: (delay: number) => void
  slotStats?: OwoSlotStats
  logger?: OwoCaptchaLogger
}) {
  let timer: NodeJS.Timeout | undefined
  let cashTimer: NodeJS.Timeout | undefined
  let lastCashRequestId = ''
  let activeCashRequest: OwoCashRequest | undefined
  const channels = new Map<string, DiscordChannel>()
  async function channelFor(channelId: string) {
    let channel = channels.get(channelId)
    if (!channel) { const fetched = await options.client.channels.fetch(channelId); if (fetched) { channel = fetched; channels.set(channelId, fetched) } }
    return channel
  }
  async function checkCashRequest() {
    const request = await options.readCashRequest?.()
    if (!request || !request.id || request.id === lastCashRequestId) return
    lastCashRequestId = request.id
    const channelId = cashChannelId(options.config)
    if (!channelId) { await options.writeCashResult?.({ id: request.id, error: 'Chưa chọn kênh Slot.' }); return }
    const channel = await channelFor(channelId)
    if (!channel) { await options.writeCashResult?.({ id: request.id, error: 'Kênh Slot không khả dụng.' }); return }
    try { await channel.send('ocash'); activeCashRequest = request }
    catch { await options.writeCashResult?.({ id: request.id, error: 'Không thể gửi ocash.' }) }
  }
  const logger = options.logger || console
  const controller = createOwoController({
    config: options.config,
    slotStats: options.slotStats,
    userDisplayName: () => String(options.client.user?.displayName || ""),
    send: async (message, command) => {
      const channel = await channelFor(channelIdForCommand(options.config, command))
      if (!channel) throw new Error("OwO channel unavailable")
      await channel.send(message)
    },
    writeStatus: options.writeStatus,
    schedule: delay => {
      if (options.schedule) return options.schedule(delay)
      clearTimeout(timer)
      timer = setTimeout(() => void controller.tick(), delay)
    },
    solveCaptcha: () => resolveOwoCaptcha(options.token, logger)
  })
  options.client.once("ready", async () => {
    await controller.tick()
    await checkCashRequest()
    if (options.readCashRequest) cashTimer = setInterval(() => void checkCashRequest(), 250)
  })
  const onMessage = (message: DiscordMessage) => {
    const authorId = String(message.author?.id || '')
    const channelId = String(message.channelId || '')
    const content = String(message.content || '')
    const request = activeCashRequest
    const name = String(options.client.user?.displayName || '').trim().toLowerCase()
    const cash = request && name && authorId === OWO_BOT_ID && channelId === cashChannelId(options.config) && content.toLowerCase().includes(name) ? parseOwoCash(content) : null
    if (request && cash !== null) { activeCashRequest = undefined; void options.writeCashResult?.({ id: request.id, cash }); return }
    void controller.onOwoMessage({
      authorId,
      channelId,
      content,
      embedAuthorNames: (message.embeds || []).map(embed => String(embed.author?.name || '')).filter(Boolean),
      hasVerifyButton: hasVerifyButton(message),
      hasAttachments: Boolean(message.attachments?.size),
      isDirectMessage: (() => {
        const type = message.channel?.type
        return type === 'DM' || Number(type) === 1
      })()
    })
  }
  options.client.on("messageCreate", onMessage)
  options.client.on("messageUpdate", (_before, message) => onMessage(message))
  await options.client.login(options.token)

  return {
    controller,
    checkCashRequest,
    stop() {
      clearTimeout(timer)
      clearInterval(cashTimer)
      options.client.destroy()
    }
  }
}
