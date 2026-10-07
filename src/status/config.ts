export type StatusMode = 'ordered' | 'random'
export type StatusDelayMode = 'global' | 'per-status' | 'lyrics'
export type StatusEmojiMode = 'global' | 'per-status'

export type StatusItem = {
  text: string
  delaySeconds?: number
  atSeconds?: number
  endSeconds?: number
  emojiName?: string
  emojiId?: string
  emojiAnimated?: boolean
}

export type StatusConfig = {
  mode: StatusMode
  delayMode: StatusDelayMode
  emojiMode: StatusEmojiMode
  statuses: StatusItem[]
  delaySeconds: number
  loopDelaySeconds?: number
  emojiName?: string
  emojiId?: string
  emojiAnimated?: boolean
}

type EmojiSource = {
  emojiName?: string
  emojiId?: string
  emojiAnimated?: boolean
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizedDelay(value: unknown, fallback = 30) {
  const delay = Number(value)
  return Number.isFinite(delay) ? Math.max(delay, 3) : fallback
}

function emojiFields(value: Record<string, unknown>): EmojiSource {
  const emojiName = typeof value.emojiName === 'string' ? value.emojiName.trim() : ''
  const emojiId = typeof value.emojiId === 'string' ? value.emojiId.trim() : ''
  return {
    ...(emojiName ? {emojiName} : {}),
    ...(emojiId ? {emojiId} : {}),
    ...(value.emojiAnimated === true ? {emojiAnimated: true} : {})
  }
}

function normalizeItem(value: unknown): StatusItem | null {
  if (!isObject(value) || typeof value.text !== 'string') return null
  const text = value.text.trim()
  if (!text) return null
  const delay = Number(value.delaySeconds)
  return {
    text,
    ...(Number.isFinite(delay) ? {delaySeconds: Math.max(delay, 3)} : {}),
    ...(typeof value.atSeconds === 'number' ? {atSeconds: value.atSeconds} : {}),
    ...(typeof value.endSeconds === 'number' ? {endSeconds: value.endSeconds} : {}),
    ...emojiFields(value)
  }
}

export function normalizeStatusConfig(value: unknown): StatusConfig {
  const data = isObject(value) ? value : {}
  const modern = Array.isArray(data.statuses)
  const rawStatuses = modern
    ? data.statuses as unknown[]
    : (Array.isArray(data.texts) ? data.texts : Array.isArray(data.Texts) ? data.Texts : [])
        .map(text => ({text}))
  const statuses = rawStatuses.map(normalizeItem).filter((item): item is StatusItem => Boolean(item)).slice(0, 100)
  const delaySeconds = normalizedDelay(data.delaySeconds ?? data.DelaySeconds)
  const delayMode: StatusDelayMode = modern && (data.delayMode === 'per-status' || data.delayMode === 'lyrics') ? data.delayMode : 'global'
  const emojiMode: StatusEmojiMode = modern && data.emojiMode === 'per-status' ? 'per-status' : 'global'
  const mode: StatusMode = modern && data.mode === 'random' ? 'random' : 'ordered'

  if (delayMode === 'per-status') {
    for (const status of statuses) status.delaySeconds = normalizedDelay(status.delaySeconds, delaySeconds)
  }

  return {
    mode,
    delayMode,
    emojiMode,
    statuses,
    delaySeconds,
    ...(delayMode === 'lyrics' ? {loopDelaySeconds: Number.isFinite(Number(data.loopDelaySeconds)) && Number(data.loopDelaySeconds) >= 0 ? Number(data.loopDelaySeconds) : 0} : {}),
    ...emojiFields(data)
  }
}

function validDelay(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 3
}

function validEmoji(value: Record<string, unknown>) {
  if ('emojiName' in value && typeof value.emojiName !== 'string') return false
  if ('emojiId' in value && (typeof value.emojiId !== 'string' || (value.emojiId !== '' && !/^\d{17,20}$/.test(value.emojiId)))) return false
  if ('emojiAnimated' in value && typeof value.emojiAnimated !== 'boolean') return false
  return true
}

function validStatusItem(value: unknown) {
  if (!isObject(value) || typeof value.text !== 'string' || !value.text.trim()) return false
  if ('delaySeconds' in value && !validDelay(value.delaySeconds)) return false
  return validEmoji(value)
}

export function isValidStatusConfig(value: unknown) {
  if (!isObject(value)) return false

  if (!Array.isArray(value.statuses)) {
    return Array.isArray(value.texts)
      && value.texts.length > 0
      && value.texts.length <= 100
      && value.texts.every(text => typeof text === 'string' && Boolean(text.trim()))
      && validDelay(value.delaySeconds)
      && validEmoji(value)
  }

  if (value.mode !== 'ordered' && value.mode !== 'random') return false
  if (value.delayMode !== 'global' && value.delayMode !== 'per-status' && value.delayMode !== 'lyrics') return false
  if (value.emojiMode !== 'global' && value.emojiMode !== 'per-status') return false
  if (!value.statuses.length || value.statuses.length > 100 || !value.statuses.every(validStatusItem)) return false
  if (value.delayMode === 'lyrics') {
    if (value.mode !== 'ordered') return false
    if (!value.statuses.every((status, index) => isObject(status) && typeof status.atSeconds === 'number' && Number.isFinite(status.atSeconds) && status.atSeconds >= 0 && (index === 0 || status.atSeconds > Number((value.statuses as Record<string, unknown>[])[index - 1].atSeconds)))) return false
    if (!value.statuses.every((status, index) => {
      if (!isObject(status) || !('endSeconds' in status)) return true
      const next = (value.statuses as Record<string, unknown>[])[index + 1]
      return typeof status.endSeconds === 'number' && Number.isFinite(status.endSeconds) && status.endSeconds > Number(status.atSeconds) && (!next || status.endSeconds <= Number(next.atSeconds))
    })) return false
    if ('loopDelaySeconds' in value && (typeof value.loopDelaySeconds !== 'number' || !Number.isFinite(value.loopDelaySeconds) || value.loopDelaySeconds < 0)) return false
  } else if (value.delayMode === 'global' ? !validDelay(value.delaySeconds) : !value.statuses.every(status => isObject(status) && validDelay(status.delaySeconds))) return false
  return validEmoji(value)
}

export function nextStatusIndex(currentIndex: number, length: number, mode: StatusMode, random: () => number = Math.random) {
  if (length <= 0) return -1
  if (mode === 'ordered') return currentIndex < 0 ? 0 : (currentIndex + 1) % length
  const sample = Number(random())
  const normalized = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 0.9999999999999999) : 0
  if (currentIndex < 0 || currentIndex >= length) return Math.floor(normalized * length)
  if (length === 1) return 0
  const candidate = Math.floor(normalized * (length - 1))
  return candidate >= currentIndex ? candidate + 1 : candidate
}

export function statusDelaySeconds(config: StatusConfig, status: StatusItem) {
  return config.delayMode === 'per-status' ? normalizedDelay(status.delaySeconds, config.delaySeconds) : config.delaySeconds
}

export function statusEmoji(config: StatusConfig, status: StatusItem) {
  const source: EmojiSource = config.emojiMode === 'per-status' ? status : config
  if (!source.emojiName && !source.emojiId) return undefined
  return {
    name: source.emojiName || 'emoji',
    id: source.emojiId || undefined,
    animated: source.emojiAnimated || false
  }
}
