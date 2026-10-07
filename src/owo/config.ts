export const OWO_TARGET_COMMANDS = ['kiss', 'hug', 'slap', 'stare', 'kill', 'hold', 'pats', 'wave', 'boop', 'poke', 'pat', 'nom', 'cuddle', 'highfive', 'greet', 'punch'] as const
const OWO_RETIRED_COMMANDS = ['blush', 'cry', 'dance', 'lewd', 'pout', 'shrug', 'sleepy', 'smile', 'smug', 'thumbsup', 'wag', 'thinking', 'triggered', 'teehee', 'deredere', 'thonking', 'scoff', 'happy', 'thumbs', 'grin'] as const
export const OWO_COMMANDS = ['hunt', 'battle', 'slot', 'pup', 'piku', 'run', 'army', ...OWO_TARGET_COMMANDS] as const
export type OwoCommand = typeof OWO_COMMANDS[number]
export const OWO_COMMAND_GROUPS = ["huntBattle", "slot", "extra"] as const
export type OwoCommandGroup = typeof OWO_COMMAND_GROUPS[number]
export type OwoCommandGroupConfig = { enabled: boolean; guildId?: string; channelId: string; commands: Partial<Record<OwoCommand, boolean>>; slotStake?: number }
export type OwoCashConfig = { guildId?: string; channelId: string }
export type OwoSlotStats = { wins: number; losses: number; won: number; lost: number }

export type OwoConfig = {
  groups?: Partial<Record<OwoCommandGroup, OwoCommandGroupConfig>>
  cash?: OwoCashConfig
  enabled: boolean
  guildId?: string
  channelId: string
  commands: Partial<Record<OwoCommand, boolean>>
  cooldownSeconds?: [number, number]
}

export type OwoStatus = {
  state: 'stopped' | 'running' | 'paused_captcha' | 'paused_insufficient' | 'error'
  lastAction: OwoCommand | null
  lastError: string | null
  updatedAt: number
  slot: OwoSlotStats
}

export const OWO_DUSK_COMMAND_COOLDOWN_MS: [number, number] = [14_000, 16_000]
export const OWO_DUSK_SLOT_COOLDOWN_MS = 15_000
export const OWO_DUSK_SLOT_MAX_STAKE = 250_000
export const OWO_DUSK_EXTRA_COMMAND_COOLDOWN_MS: [number, number] = [60_000, 65_000]
export const OWO_DUSK_INTERACTION_COOLDOWN_MS: [number, number] = [4_000, 5_000]
export const OWO_DUSK_BETWEEN_COMMANDS_MS: [number, number] = [3_000, 4_000]
export const OWO_DUSK_CAPTCHA_RESTART_MS: [number, number] = [60_000, 60_000]

type ParsedConfig = { ok: true; value: OwoConfig } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parsedError(error: string): ParsedConfig {
  return { ok: false, error }
}
export function commandGroup(command: OwoCommand): OwoCommandGroup {
  if (command === "hunt" || command === "battle") return "huntBattle"
  if (command === "slot") return "slot"
  return "extra"
}

export function commandEnabled(config: OwoConfig, command: OwoCommand) {
  return config.groups ? Boolean(config.groups[commandGroup(command)]?.enabled && config.groups[commandGroup(command)]?.commands[command]) : Boolean(config.commands[command])
}

export function channelIdForCommand(config: OwoConfig, command: OwoCommand) {
  return config.groups ? config.groups[commandGroup(command)]?.channelId || "" : config.channelId
}

export function cashChannelId(config: OwoConfig) {
  return config.cash?.channelId || ""
}

export function slotStake(config: OwoConfig) {
  const value=config.groups?.slot?.slotStake
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:100
}

function parseCommands(value: unknown, group?: OwoCommandGroup): Partial<Record<OwoCommand, boolean>> | null {
  if (!isRecord(value)) return null
  const commands: Partial<Record<OwoCommand, boolean>> = {}
  for (const [name, enabled] of Object.entries(value)) {
    if ((OWO_RETIRED_COMMANDS as readonly string[]).includes(name)) continue
    if (!(OWO_COMMANDS as readonly string[]).includes(name) || typeof enabled !== "boolean") return null
    const command = name as OwoCommand
    if (group && commandGroup(command) !== group) return null
    commands[command] = enabled
  }
  return commands
}


function validId(value: string) {
  return /^\d{17,20}$/.test(value)
}

export function parseOwoConfig(value: unknown): ParsedConfig {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') return parsedError('OwO enabled must be a boolean')
  if (value.groups !== undefined) {
    if (!isRecord(value.groups)) return parsedError("OwO groups are invalid")
    const groups: Partial<Record<OwoCommandGroup, OwoCommandGroupConfig>> = {}
    const commands: Partial<Record<OwoCommand, boolean>> = {}
    for (const groupName of OWO_COMMAND_GROUPS) {
      const group = value.groups[groupName]
      if (group === undefined) continue
      if (!isRecord(group) || typeof group.enabled !== "boolean" || typeof group.channelId !== "string" || (group.guildId !== undefined && typeof group.guildId !== "string")) return parsedError("OwO groups are invalid")
      const groupCommands = parseCommands(group.commands, groupName)
      if (!groupCommands) return parsedError("OwO commands are invalid")
      const guildId = typeof group.guildId === "string" ? group.guildId.trim() : ""
      const channelId = group.channelId.trim()
      if (guildId && !validId(guildId)) return parsedError("OwO guildId is invalid")
      const rawSlotStake=groupName==='slot'?group.slotStake:undefined
      const slotStake=rawSlotStake===undefined?100:typeof rawSlotStake==='number'?rawSlotStake:0
      if(groupName==='slot'&&(!Number.isSafeInteger(slotStake)||slotStake<1||slotStake>OWO_DUSK_SLOT_MAX_STAKE))return parsedError("OwO slotStake is invalid")
      groups[groupName] = { enabled: group.enabled, ...(guildId ? { guildId } : {}), channelId, commands: groupCommands, ...(groupName==='slot'?{slotStake}: {}) }
      Object.assign(commands, groupCommands)
    }
    let cash: OwoCashConfig | undefined
    if (value.cash !== undefined) {
      if (!isRecord(value.cash) || typeof value.cash.channelId !== "string" || (value.cash.guildId !== undefined && typeof value.cash.guildId !== "string")) return parsedError("OwO cash is invalid")
      const guildId = typeof value.cash.guildId === "string" ? value.cash.guildId.trim() : ""
      const channelId = value.cash.channelId.trim()
      if (guildId && !validId(guildId)) return parsedError("OwO cash guildId is invalid")
      if (channelId && !validId(channelId)) return parsedError("OwO cash channelId is invalid")
      cash = { ...(guildId ? { guildId } : {}), channelId }
    }
    const firstChannel = OWO_COMMAND_GROUPS.map(name => groups[name]?.channelId || "").find(Boolean) || ""
    const config: OwoConfig = { enabled: value.enabled, channelId: firstChannel, commands, groups, ...(cash ? { cash } : {}) }
    if (!config.enabled) return { ok: true, value: config }
    if (!OWO_COMMANDS.some(command => commandEnabled(config, command))) return parsedError("Enable an OwO command")
    if (OWO_COMMANDS.some(command => commandEnabled(config, command) && !validId(channelIdForCommand(config, command)))) return parsedError("OwO channelId is required")
    return { ok: true, value: config }
  }

  if (typeof value.channelId !== 'string') return parsedError('OwO channelId must be a string')
  if (value.guildId !== undefined && typeof value.guildId !== 'string') return parsedError('OwO guildId must be a string')
  if (!isRecord(value.commands)) return parsedError('OwO commands are invalid')
  const commands: Partial<Record<OwoCommand, boolean>> = {}
  for (const [name, enabled] of Object.entries(value.commands)) {
    // Existing saved configs may still contain commands removed from the dashboard.
    if ((OWO_RETIRED_COMMANDS as readonly string[]).includes(name)) continue
    if (!(OWO_COMMANDS as readonly string[]).includes(name) || typeof enabled !== 'boolean') return parsedError('OwO commands are invalid')
    commands[name as OwoCommand] = enabled
  }


  let cooldownSeconds: [number, number] | undefined
  if (value.cooldownSeconds !== undefined) {
    if (!Array.isArray(value.cooldownSeconds) || value.cooldownSeconds.length !== 2) return parsedError('OwO cooldown is invalid')
    const [minimum, maximum] = value.cooldownSeconds
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 10 || maximum < minimum || maximum > 3600) return parsedError('OwO cooldown is invalid')
    cooldownSeconds = [minimum, maximum]
  }

  if (typeof value.guildId === 'string' && value.guildId.trim() && !validId(value.guildId.trim())) return parsedError('OwO guildId is invalid')
  const config: OwoConfig = {
    enabled: value.enabled,
    ...(typeof value.guildId === 'string' && value.guildId.trim() ? { guildId: value.guildId.trim() } : {}),
    channelId: value.channelId.trim(),
    commands,
    ...(cooldownSeconds ? { cooldownSeconds } : {})
  }

  if (!config.enabled) return { ok: true, value: config }
  if (!validId(config.channelId)) return parsedError('OwO channelId is required')
  if (!OWO_COMMANDS.some(command => config.commands[command])) return parsedError('Enable an OwO command')
  return { ok: true, value: config }
}

export function nextCommand(config: OwoConfig, previous?: OwoCommand): OwoCommand | null {
  if (!config.enabled) return null
  const start = previous ? (OWO_COMMANDS.indexOf(previous) + 1) % OWO_COMMANDS.length : 0
  for (let offset = 0; offset < OWO_COMMANDS.length; offset++) {
    const command = OWO_COMMANDS[(start + offset) % OWO_COMMANDS.length]
    if (config.commands[command]) return command
  }
  return null
}

const OWO_BOT_MENTION = '<@408785106942164992>'

export function commandText(config: OwoConfig, command: OwoCommand) {
  if (command === 'slot') return 'owo slot '+slotStake(config)
  return (OWO_TARGET_COMMANDS as readonly string[]).includes(command) ? `owo ${command} ${OWO_BOT_MENTION}` : `owo ${command}`
}

export function delayMs(_: OwoConfig, random: () => number, command: OwoCommand = 'hunt'): number {
  if (command === 'slot') return OWO_DUSK_SLOT_COOLDOWN_MS
  if (command === 'hunt' || command === 'battle') return randomDelayMs(OWO_DUSK_COMMAND_COOLDOWN_MS, random)
  if ((OWO_TARGET_COMMANDS as readonly string[]).includes(command)) return randomDelayMs(OWO_DUSK_INTERACTION_COOLDOWN_MS, random)
  return randomDelayMs(OWO_DUSK_EXTRA_COMMAND_COOLDOWN_MS, random)
}

export function betweenCommandDelayMs(random: () => number): number {
  return randomDelayMs(OWO_DUSK_BETWEEN_COMMANDS_MS, random)
}

export function captchaRestartDelayMs(random: () => number): number {
  return randomDelayMs(OWO_DUSK_CAPTCHA_RESTART_MS, random)
}

function randomDelayMs([minimum, maximum]: [number, number], random: () => number): number {
  const value = Math.min(1, Math.max(0, random()))
  return Math.floor(minimum + (maximum - minimum) * value)
}

export function statusForError(_: unknown): string {
  return 'OwO worker error'
}

export function emptySlotStats(): OwoSlotStats {
  return { wins: 0, losses: 0, won: 0, lost: 0 }
}

export function parseOwoSlotStats(value: unknown): OwoSlotStats {
  if (!isRecord(value)) return emptySlotStats()
  const stats = Object.fromEntries(Object.entries(value).filter(([key, item]) => ['wins', 'losses', 'won', 'lost'].includes(key) && typeof item === 'number' && Number.isSafeInteger(item) && item >= 0)) as Partial<OwoSlotStats>
  return { wins: stats.wins || 0, losses: stats.losses || 0, won: stats.won || 0, lost: stats.lost || 0 }
}

export function stoppedStatus(): OwoStatus {
  return { state: 'stopped', lastAction: null, lastError: null, updatedAt: 0, slot: emptySlotStats() }
}
