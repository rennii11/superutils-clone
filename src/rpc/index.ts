import 'dotenv/config'
import { Client, RichPresence } from 'discord.js-selfbot-v13'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import advancedFormat from 'dayjs/plugin/advancedFormat.js'
import * as z from 'zod'
import { readFile, writeFile } from 'node:fs/promises'
import { setDefaultResultOrder } from 'node:dns'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { healthCheck, selfPing } from './koyebCompact.js'
import type { Config } from './config'
import { activityPlatformForMode, defaultTypeForMode } from './meta-quest.js'
import { externalImageAssetMatchesUrl, rememberExternalImage } from './external-image-cache.js'
import { rotatingButtons } from './button-rotation.js'
import { rotatingName } from './name-rotation.js'
import { embeddedSessionContext, onWorkerStop, reportTokenInvalid } from '../multi/embedded-context.js'
import { readStoredToken } from '../token-store.js'
import { memoryConstrainedClientOptions } from '../discord-cache.js'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(advancedFormat)
setDefaultResultOrder('ipv4first')
const execFileAsync = promisify(execFile)

const embeddedSession = embeddedSessionContext(import.meta.url)
const logger = embeddedSession.logger
const { CONFIG_PATH = 'scene.json', TOKEN_PATH, TOKEN, LOG_PAYLOAD, KOYEB_PUBLIC_DOMAIN, KOYEB_HEALTH_CHECK, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, DISCORD_CLIENT_ID, DISCORD_SCENE_APPLICATION_IDS } =
  embeddedSession.env


const KOYEB_HEALTH_CHECK_ENABLED: boolean =
  KOYEB_PUBLIC_DOMAIN &&
  (KOYEB_HEALTH_CHECK === undefined || z.stringbool().parse(KOYEB_HEALTH_CHECK))
    ? true
    : false

let rawConfig = await loadConfig(CONFIG_PATH)
const activeToken = await loadToken(TOKEN_PATH, (rawConfig as any).token || TOKEN)
let tick = 0
let lastPresencePayload = ''
const startedAt = Date.now()
const externalImageCache = new Map<string, string>()
const discordAttachmentCache = new Map<string, { url: string; expires: number }>()
const externalImageRetryAt = new Map<string, number>()
const lyricsCache = new Map<string, Promise<{at:number;text:string}[]>>()
const spotifyRelatedCache = new Map<string, Promise<any[]>>()
let spotifyTokenCache:{value:string;expires:number}|null=null
await loadExternalImageCache()
const defaultApplicationId = DISCORD_CLIENT_ID?.trim() || '123456789012345678'
// ponytail: five IDs cover the largest plan; extend the pool if plans allow more scenes.
const sceneApplicationIds = [DISCORD_CLIENT_ID?.trim(), ...(DISCORD_SCENE_APPLICATION_IDS || '').split(',').map(id => id.trim())]
let config = (rawConfig as any).config ? { APPLICATION_ID: (rawConfig as any).APPLICATION_ID || defaultApplicationId } as Config : rawConfig
let tickTimer: NodeJS.Timeout | undefined
let shuttingDown = false

const platformJsonPatch = Symbol.for('superutils.rich-presence-platform-json')
const richPresencePrototype = RichPresence.prototype as any
if (!richPresencePrototype[platformJsonPatch]) {
  const richPresenceToJSON = RichPresence.prototype.toJSON
  RichPresence.prototype.toJSON = function () {
    const payload = richPresenceToJSON.call(this)
    if (this.platform) (payload as any).platform = this.platform
    return payload
  }
  Object.defineProperty(richPresencePrototype, platformJsonPatch, { value: true })
}

function createRPC(config: Config): RichPresence {
  const rpc = new RichPresence(client).setApplicationId(config.APPLICATION_ID)
  const platform = activityPlatformForMode(config.mode, config.type)
  if (platform && !(config as any).noPlatform) rpc.setPlatform(platform as any)
  return rpc
}

const client = new Client({
  ...memoryConstrainedClientOptions,
  sweepers: {
    /*
     * i dont know how to use this
     * anybody wanna help me?
     */
    // applicationCommands: {
    //   filter: () => () => true,
    //   interval: 60
    // },
    autoModerationRules: {
      filter: () => () => true,
      interval: 60
    },
    bans: {
      filter: () => () => true,
      interval: 60
    },
    emojis: {
      filter: () => () => true,
      interval: 60
    },
    invites: {
      lifetime: 10,
      interval: 60
    },
    guildMembers: {
      filter: () => () => true,
      interval: 60
    },
    messages: {
      lifetime: 10,
      interval: 60
    },
    presences: {
      filter: () => () => true,
      interval: 60
    },
    reactions: {
      filter: () => () => true,
      interval: 60
    },
    stageInstances: {
      filter: () => () => true,
      interval: 60
    },
    stickers: {
      filter: () => () => true,
      interval: 60
    },
    threadMembers: {
      filter: () => () => true,
      interval: 60
    },
    threads: {
      lifetime: 10,
      interval: 60
    },
    users: {
      filter: () => () => true,
      interval: 60
    },
    voiceStates: {
      filter: () => () => true,
      interval: 60
    }
  }
})

{
  const _scenes = getScenes(rawConfig as any)
  const _firstMode = (_scenes[0]?.setup?.mode) || (rawConfig as any).mode || 'RICH_PRESENCE'
  if (_firstMode === 'META_QUEST') {
    // ponytail: Discord currently maps this fingerprint to VR; use headless sessions if OAuth support opens.
    Object.assign(client.options.ws!.properties!, {
      os: 'Android',
      browser: 'Discord VR',
      device: 'Meta Quest 3',
      os_version: '12'
    })
  }
}


// Trạng thái trực tuyến mong muốn: giữ nguyên trạng thái account tự đặt (dnd/idle/invisible/online),
// tránh việc mỗi tick ép về 'online' đè lên lựa chọn của user.
let desiredStatus: 'online' | 'idle' | 'dnd' | 'invisible' = 'online'

client.on('ready', () => {
  void (async () => {
    logger.log(`Logged in as ${client.user?.username}`)
    lastPresencePayload = ''
    const current = (client.user?.presence?.status as any)
    if (current && current !== 'offline') desiredStatus = current
    else {
      const settingStatus = (client as any).settings?.status
      if (settingStatus && settingStatus !== 'offline' && settingStatus !== 'unknown') desiredStatus = settingStatus
    }
    logger.log(`Preserving online status: ${desiredStatus}`)
    await runTick()
  })()
})
client.on('error', error => logger.error('Discord client error:', error))
client.on('invalidated', () => { logger.error('Session invalidated, token likely revoked'); reportTokenInvalid() })

let currentItemElapsedMs = 0

async function applyCurrentConfig() {
  if (shuttingDown) return { refreshInterval: 15000, itemDurationMs: 15000 }
  rawConfig = await loadConfig(CONFIG_PATH)
  let runtimes: Config[]
  let itemDurationMs = 15000
  if (!(rawConfig as any).configs && !(rawConfig as any).config) {
    // Legacy flat config (no scenes): use it directly.
    runtimes = [rawConfig as Config]
    itemDurationMs = Math.max(1000, Number((runtimes[0] as any).delay || (runtimes[0] as any).setup?.delay || 15) * 1000)
  } else {
    const scenes = getScenes(rawConfig)
    if ((rawConfig as any).simultaneous === true && scenes.length > 1) {
      runtimes = []
      for (const [sceneIndex, scene] of scenes.entries()) {
        const delayMs = Math.max(1000, Number(scene.setup?.delay || 15) * 1000)
        const index = Math.floor((Date.now() - startedAt) / delayMs) % sceneRotationLength(scene)
        runtimes.push(await toRuntimeScene(rawConfig, scene, index, sceneIndex))
      }
      itemDurationMs = Math.min(...scenes.map(scene => Math.max(1000, Number(scene.setup?.delay || 15) * 1000)))
    } else {
      const { sceneIndex, localIndex } = resolveScene(scenes, tick)
      const currentScene = scenes[sceneIndex]
      itemDurationMs = Math.max(1000, Number(currentScene?.setup?.delay || 15) * 1000)
      runtimes = [await toRuntimeScene(rawConfig, currentScene, localIndex, sceneIndex)]
    }
  }
  config = runtimes[0]
  const activities: RichPresence[] = []
  for (const runtime of runtimes) {
    const rpc = createRPC(runtime)
    await updateRPC(rpc, runtime)
    activities.push(rpc)
  }
  // META_QUEST badge chỉ thay thế chấm trạng thái khi account ở trạng thái online, nên mode này ép online.
  const presenceStatus = runtimes.some(runtime => runtime.mode === 'META_QUEST') ? 'online' : desiredStatus
  const activityPayloads = activities.map(activity => activity.toJSON())
  const presencePayload = JSON.stringify({ activities: activityPayloads, status: presenceStatus })
  if (presencePayload !== lastPresencePayload) {
    client.user?.setPresence({ activities, status: presenceStatus, afk: false } as any)
    lastPresencePayload = presencePayload
    if (LOG_PAYLOAD === 'true') logger.log('RPC payload:', new Date().toISOString(), JSON.stringify(activityPayloads.length === 1 ? activityPayloads[0] : activityPayloads))
  }
  const refreshInterval = Math.min(...runtimes.map(runtime => runtime.refreshInterval || 15000))
  return { refreshInterval, itemDurationMs }
}

async function runTick() {
  if (shuttingDown) return
  const started = Date.now()
  let refreshInterval: number
  let itemDurationMs: number
  try {
    ({ refreshInterval, itemDurationMs } = await applyCurrentConfig())
  } catch (error) {
    logger.error('RPC tick failed:', error instanceof Error ? error.message : String(error))
    if (!shuttingDown) tickTimer = setTimeout(() => void runTick(), 5000)
    return
  }
  const remainingItemMs = Math.max(0, itemDurationMs - currentItemElapsedMs)
  const stepMs = Math.min(refreshInterval, remainingItemMs > 0 ? remainingItemMs : itemDurationMs)
  const wait = Math.max(100, stepMs - (Date.now() - started))
  tickTimer = setTimeout(() => {
    currentItemElapsedMs += stepMs
    if (currentItemElapsedMs >= itemDurationMs) {
      currentItemElapsedMs = 0
      tick++
    }
    void runTick()
  }, wait)
}

async function shutdown(exitProcess: boolean) {
  if (shuttingDown) return
  shuttingDown = true
  if (tickTimer) clearTimeout(tickTimer)
  try {
    client.user?.setActivity(null as any)
    client.user?.setPresence({ activities: [], status: 'invisible' } as any)
    await new Promise(resolve => setTimeout(resolve, 750))
    client.destroy()
  } finally {
    if (exitProcess) process.exit(0)
  }
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

if (KOYEB_HEALTH_CHECK_ENABLED) {
  setInterval(() => {
    selfPing(`https://${KOYEB_PUBLIC_DOMAIN}`)
  }, 60000)
}

try {
  if (KOYEB_HEALTH_CHECK_ENABLED) {
    healthCheck.listen(8000)
    logger.log(
      `Health check server for Koyeb running at https://${KOYEB_PUBLIC_DOMAIN}`
    )
  }
  if (!activeToken) throw new Error('Missing TOKEN or config.token')
  await client.login(activeToken)
} catch (error) {
  logger.error('Error logging in:', error)
  if (error instanceof Error && error.message === 'An invalid token was provided.') reportTokenInvalid()
  client.destroy()
  if (embeddedSession.active) throw error
  throw new Error('Failed to log in')
}

/**
 * Get the start of the day in the specified timezone
 * @param {string} timezone The timezone to get the start of the day for
 * @return {number} The start of the day in milliseconds since the Unix epoch
 */
function getStartOfDayInTimezone(timezone: string): number {
  const now = dayjs().tz(timezone)
  const AM = now.startOf('day')
  return AM.valueOf()
}

/**
 * Loads the configuration from a local JSON file.
 */
async function loadConfig(path: string): Promise<Config> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Config
  } catch (error) {
    logger.error('Error loading config:', error)
    throw new Error('Failed to load config')
  }
}

async function loadToken(path: string | undefined, fallback: string | undefined): Promise<string | undefined> {
  if (!path) return fallback
  return readStoredToken(await readFile(path, 'utf8')) || fallback
}


function pick<T>(values: T[] | undefined, index: number): T | undefined {
  return values && values.length ? values[index % values.length] : undefined
}

function renderText(value: string | undefined, city: string | undefined, metrics: Metrics): string | undefined {
  if (!value) return value
  const now = dayjs()
  const replacements: Record<string, string> = {
    'hour:1': now.format('HH'), 'hour:2': now.format('hh'), 'min:1': now.format('mm'), 'min:2': now.format('mm A'),
    'en=date': now.format('Do'), 'th=date': now.format('D'), 'en=week:1': now.format('ddd'), 'en=week:2': now.format('dddd'),
    'en=month:1': now.format('MM'), 'th=month:1': now.format('M'), 'en=month:2': now.format('MMM'), 'en=month:3': now.format('MMMM'),
    'en=year:1': now.format('YY'), 'en=year:2': now.format('YYYY'), city: city || metrics.city || '', region: metrics.region, country: metrics.country,
    'temp:c': metrics.tempC, 'temp:f': metrics.tempF, 'wind:kph': metrics.windKph, 'wind:mph': metrics.windMph, 'wind:degree': metrics.windDegree, 'wind:dir': metrics.windDir,
    'pressure:mb': metrics.pressureMb, 'pressure:in': metrics.pressureIn, 'precip:mm': metrics.precipMm, 'precip:in': metrics.precipIn,
    'gust:kph': metrics.gustKph, 'gust:mph': metrics.gustMph, 'feelslike:c': metrics.feelslikeC, 'feelslike:f': metrics.feelslikeF,
    'windchill:c': metrics.windchillC, 'windchill:f': metrics.windchillF, 'heatindex:c': metrics.heatindexC, 'heatindex:f': metrics.heatindexF,
    'dewpoint:c': metrics.dewpointC, 'dewpoint:f': metrics.dewpointF, 'vis:km': metrics.visKm, 'vis:mi': metrics.visMi,
    humidity: metrics.humidity, cloud: metrics.cloud, uv: metrics.uv, co: metrics.co, no2: metrics.no2, o3: metrics.o3, so2: metrics.so2,
    'pm2.5': metrics.pm25, pm10: metrics.pm10, 'user:name': metrics.userName, 'emoji:random': metrics.emojiRandom, 'emoji:time': metrics.emojiTime, 'emoji:clock': metrics.emojiClock
  }
  return value.replace(/\{([^{}]+)\}/g, (_, rawKey: string) => {
    const [, arg] = rawKey.split(':')
    if (rawKey.startsWith('guild=members:')) return getGuildMembers(arg)
    if (rawKey.startsWith('guild=name:')) return getGuildName(arg)
    if (rawKey.startsWith('guild=icon:')) return getGuildIcon(arg)
    return replacements[rawKey] ?? 'N/A'
  })
}

type Metrics = {
  city: string; region: string; country: string; tempC: string; tempF: string; windKph: string; windMph: string; windDegree: string; windDir: string;
  pressureMb: string; pressureIn: string; precipMm: string; precipIn: string; gustKph: string; gustMph: string; feelslikeC: string; feelslikeF: string;
  windchillC: string; windchillF: string; heatindexC: string; heatindexF: string; dewpointC: string; dewpointF: string; visKm: string; visMi: string;
  humidity: string; cloud: string; uv: string; co: string; no2: string; o3: string; so2: string; pm25: string; pm10: string; userName: string; emojiRandom: string; emojiTime: string; emojiClock: string
}
const NA = 'N/A'
const emptyMetrics: Metrics = Object.fromEntries(['city','region','country','tempC','tempF','windKph','windMph','windDegree','windDir','pressureMb','pressureIn','precipMm','precipIn','gustKph','gustMph','feelslikeC','feelslikeF','windchillC','windchillF','heatindexC','heatindexF','dewpointC','dewpointF','visKm','visMi','humidity','cloud','uv','co','no2','o3','so2','pm25','pm10','userName','emojiRandom','emojiTime','emojiClock'].map(key => [key, NA])) as Metrics
const weatherCache = new Map<string, { expires: number; metrics: Partial<Metrics> }>()
function cleanNumber(value: unknown): string { if (value === undefined || value === null || value === '') return NA; const num = Number(value); return Number.isFinite(num) ? (Number.isInteger(num) ? String(num) : String(Math.round(num * 10) / 10)) : String(value) }
const cityCoords: Record<string, { lat: number; lon: number; region?: string; country?: string }> = { 'đồng tháp': { lat: 10.46017, lon: 105.63294 }, 'dong thap': { lat: 10.46017, lon: 105.63294 }, 'cao lãnh': { lat: 10.46017, lon: 105.63294 }, 'cao lanh': { lat: 10.46017, lon: 105.63294 } }
const compassPoints = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
function toCompass(deg: unknown): string { const n = Number(deg); return Number.isFinite(n) ? compassPoints[Math.round(n / 22.5) % 16] : NA }
function toF(c: unknown): string { const n = Number(c); return Number.isFinite(n) ? cleanNumber(n * 9 / 5 + 32) : NA }
function toMph(kph: unknown): string { const n = Number(kph); return Number.isFinite(n) ? cleanNumber(n * 0.621371) : NA }
function toIn(mb: unknown): string { const n = Number(mb); return Number.isFinite(n) ? cleanNumber(n * 0.02953) : NA }
function mmToIn(mm: unknown): string { const n = Number(mm); return Number.isFinite(n) ? cleanNumber(n * 0.0393701) : NA }
function mToKm(m: unknown): string { const n = Number(m); return Number.isFinite(n) ? cleanNumber(n / 1000) : NA }
function mToMi(m: unknown): string { const n = Number(m); return Number.isFinite(n) ? cleanNumber(n / 1609.34) : NA }
async function geocode(city: string): Promise<{ lat: number; lon: number; region?: string; country?: string } | undefined> { const key = city.trim().toLowerCase(); const fixed = cityCoords[key]; if (fixed) return fixed; const geoRes = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(city), { signal: AbortSignal.timeout(8000) }); const geo = await geoRes.json() as { results?: { latitude: number; longitude: number; admin1?: string; country?: string }[] }; const place = geo.results?.[0]; return place ? { lat: place.latitude, lon: place.longitude, region: place.admin1, country: place.country } : undefined }
async function getWeather(city: string | undefined): Promise<Partial<Metrics>> {
  if (!city) return {}; const cached = weatherCache.get(city); if (cached && cached.expires > Date.now()) return cached.metrics
  const coords = await geocode(city)
  if (!coords) { const empty: Partial<Metrics> = {}; weatherCache.set(city, { expires: Date.now() + 600000, metrics: empty }); return empty }
  const params = new URLSearchParams({ latitude: String(coords.lat), longitude: String(coords.lon), timezone: 'auto', current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m,visibility,uv_index' })
  const fcRes = await fetch('https://api.open-meteo.com/v1/forecast?' + params, { signal: AbortSignal.timeout(8000) }); const fc = await fcRes.json() as any
  const cur = fc.current || {}
  // Open-Meteo exposes no separate windchill/heatindex; apparent_temperature already blends both, so reuse it for those placeholders.
  const metrics: Partial<Metrics> = { city, region: coords.region || city, country: coords.country || NA, tempC: cleanNumber(cur.temperature_2m), tempF: toF(cur.temperature_2m), windKph: cleanNumber(cur.wind_speed_10m), windMph: toMph(cur.wind_speed_10m), windDegree: cleanNumber(cur.wind_direction_10m), windDir: toCompass(cur.wind_direction_10m), pressureMb: cleanNumber(cur.pressure_msl), pressureIn: toIn(cur.pressure_msl), precipMm: cleanNumber(cur.precipitation), precipIn: mmToIn(cur.precipitation), gustKph: cleanNumber(cur.wind_gusts_10m), gustMph: toMph(cur.wind_gusts_10m), feelslikeC: cleanNumber(cur.apparent_temperature), feelslikeF: toF(cur.apparent_temperature), windchillC: cleanNumber(cur.apparent_temperature), windchillF: toF(cur.apparent_temperature), heatindexC: cleanNumber(cur.apparent_temperature), heatindexF: toF(cur.apparent_temperature), dewpointC: cleanNumber(cur.dew_point_2m), dewpointF: toF(cur.dew_point_2m), visKm: mToKm(cur.visibility), visMi: mToMi(cur.visibility), humidity: cleanNumber(cur.relative_humidity_2m), cloud: cleanNumber(cur.cloud_cover), uv: cleanNumber(cur.uv_index) }
  if (coords) { try { const aqUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality?current=carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide,pm10,pm2_5&latitude=' + coords.lat + '&longitude=' + coords.lon; const { stdout } = await execFileAsync('curl', ['-4', '-sS', '-m', '8', aqUrl], { timeout: 9000, maxBuffer: 1024 * 1024 }); const aq = JSON.parse(stdout) as any; const air = aq.current || {}; Object.assign(metrics, { co: cleanNumber(air.carbon_monoxide), no2: cleanNumber(air.nitrogen_dioxide), o3: cleanNumber(air.ozone), so2: cleanNumber(air.sulphur_dioxide), pm25: cleanNumber(air.pm2_5), pm10: cleanNumber(air.pm10) }) } catch { } }
  weatherCache.set(city, { expires: Date.now() + 600000, metrics }); return metrics
}
function getEmojiTime(): string { const hour = new Date().getHours(); if (hour >= 5 && hour < 11) return '🌅'; if (hour >= 11 && hour < 17) return '☀️'; if (hour >= 17 && hour < 21) return '🌙'; return '🌌' }
function getEmojiClock(): string { return ['🕛','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚'][new Date().getHours() % 12] }
function getGuildMembers(id: string | undefined): string { const guild = id ? client.guilds.cache.get(id) : undefined; return guild?.memberCount ? String(guild.memberCount) : NA }
function getGuildName(id: string | undefined): string { return id ? client.guilds.cache.get(id)?.name || NA : NA }
function getGuildIcon(id: string | undefined): string { return id ? client.guilds.cache.get(id)?.iconURL() || NA : NA }
async function getMetrics(city: string | undefined): Promise<Metrics> { const weather = await getWeather(city).catch(() => ({})); const emoji = ['😀','😎','✨','🌙','💞','🌸','🍧','🍭']; return { ...emptyMetrics, ...weather, userName: client.user?.username || NA, emojiRandom: emoji[Math.floor(Math.random() * emoji.length)], emojiTime: getEmojiTime(), emojiClock: getEmojiClock() } }

function validImage(value: string | undefined): string | undefined {
  return value
}

function isExternalImage(value: string | undefined): value is string {
  return Boolean(value && /^https?:\/\//.test(value) && !isDiscordMediaUrl(value))
}

function isDiscordMediaUrl(value: string | undefined): value is string {
  return Boolean(value && /^https?:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//.test(value))
}

function signedUrlExpiresAt(value: string | undefined): number {
  const ex = value?.match(/[?&]ex=([0-9a-f]+)/i)?.[1]
  return ex ? parseInt(ex, 16) * 1000 : 0
}

async function refreshDiscordMediaUrl(value: string | undefined): Promise<string | undefined> {
  if (!isDiscordMediaUrl(value)) return value
  const currentExpires = signedUrlExpiresAt(value)
  if (currentExpires > Date.now() + 3600000) return value

  const cached = discordAttachmentCache.get(value)
  if (cached && cached.expires > Date.now() + 3600000) return cached.url

  const match = value.match(/attachments\/(\d+)\/(\d+)\//)
  if (!match || !activeToken) return value
  const [, channelId, attachmentId] = match
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?around=${attachmentId}&limit=10`, {
      headers: { Authorization: activeToken },
      signal: AbortSignal.timeout(8000)
    })
    if (res.status !== 200) return value
    const messages = await res.json() as any[]
    for (const message of messages) {
      for (const attachment of message.attachments || []) {
        if (attachment.id === attachmentId) {
          const fresh = attachment.proxy_url || attachment.url
          const freshExpires = signedUrlExpiresAt(fresh)
          if (fresh) discordAttachmentCache.set(value, { url: fresh, expires: freshExpires || Date.now() + 86400000 })
          return fresh || value
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to refresh Discord media URL:', error)
  }
  return value
}

function externalImageCachePath() {
  return `${CONFIG_PATH}.external-assets.json`
}

async function loadExternalImageCache() {
  const raw = await readFile(externalImageCachePath(), 'utf8').catch(() => '')
  if (!raw) return
  try {
    const data = JSON.parse(raw) as Record<string, string>
    for (const [url, asset] of Object.entries(data)) {
      if (/^https?:\/\//.test(url) && externalImageAssetMatchesUrl(url, asset)) rememberExternalImage(externalImageCache, url, asset)
    }
  } catch {
    logger.warn('Invalid external image cache:', externalImageCachePath())
  }
}

async function saveExternalImageCache() {
  await writeFile(externalImageCachePath(), JSON.stringify(Object.fromEntries(externalImageCache), null, 2) + '\n').catch(error => {
    logger.warn('Failed to save external image cache:', error)
  })
}

function resolvedImage(value: string | undefined) {
  if (!value) return undefined
  return externalImageCache.get(value) || (isExternalImage(value) ? undefined : value)
}

async function resolveExternalImages(config: Config): Promise<Config> {
  const originalAssets = config.assets
  const assets = originalAssets ? {
    ...originalAssets,
    large_image: await refreshDiscordMediaUrl(originalAssets.large_image),
    small_image: await refreshDiscordMediaUrl(originalAssets.small_image)
  } : undefined
  const urls = [...new Set([assets?.large_image, assets?.small_image].filter(isExternalImage))]
  let cacheChanged = false
  if (!assets) return config
  if (urls.length) {
    const missing = urls.filter(url => !externalImageCache.has(url))
    if (missing.length) {
      const retryAt = Math.max(...missing.map(url => externalImageRetryAt.get(url) || 0))
      if (retryAt <= Date.now()) {
        try {
          const resolved = await RichPresence.getExternal(client, config.APPLICATION_ID, ...missing.slice(0, 2))
          resolved.forEach((asset, index) => {
            const url = asset.url || missing[index]
            if (url && asset.external_asset_path) {
              if (rememberExternalImage(externalImageCache, url, 'mp:' + asset.external_asset_path)) cacheChanged = true
            }
          })
        } catch (error) {
          const retryAt = Date.now() + 60_000
          for (const url of missing) externalImageRetryAt.set(url, retryAt)
          logger.warn('Failed to resolve external images:', error)
        }
      }
    }
  }

  if (cacheChanged) await saveExternalImageCache()
  const largeImage = resolvedImage(assets.large_image)
  const smallImage = resolvedImage(assets.small_image)

  return {
    ...config,
    assets: {
      ...assets,
      large_image: largeImage,
      small_image: smallImage
    }
  }
}

function parseTimestamp(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  if (/^\d+$/.test(value)) return Number(value)
  const match = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/)
  if (match) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = match
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime()
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

function parseSyncedLyrics(value:string) {
  const lines:{at:number;text:string}[]=[]
  for(const row of value.split(/\r?\n/)){
    const match=row.match(/^\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]\s*(.+)$/)
    if(!match)continue
    lines.push({at:Number(match[1])*60+Number(match[2]),text:match[3].trim().slice(0,128)})
  }
  return lines.filter(line=>line.text).sort((left,right)=>left.at-right.at)
}

function publicSpotifyTrack(value:any){return{id:String(value?.id||''),name:String(value?.name||''),artists:Array.isArray(value?.artists)?value.artists.map((artist:any)=>String(artist?.name||'')).filter(Boolean).join(', '):'',album:String(value?.album?.name||''),durationMs:Math.max(0,Number(value?.duration_ms)||0),url:String(value?.external_urls?.spotify||''),image:String(value?.album?.images?.[0]?.url||'')}}

async function spotifyAccessToken(force=false){
  if(!force&&spotifyTokenCache&&spotifyTokenCache.expires>Date.now())return spotifyTokenCache.value
  if(!SPOTIFY_CLIENT_ID||!SPOTIFY_CLIENT_SECRET)throw Error('Spotify API chua cau hinh.')
  const authorization=Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
  const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{authorization:`Basic ${authorization}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials'}),signal:AbortSignal.timeout(10000)})
  const payload=await response.json().catch(()=>null) as any
  if(!response.ok||typeof payload?.access_token!=='string')throw Error('Spotify token failed.')
  spotifyTokenCache={value:payload.access_token,expires:Date.now()+Math.max(60,Number(payload.expires_in)||3600)*1000-60_000}
  return spotifyTokenCache.value
}

async function spotifyGet(path:string,force=false):Promise<any>{
  const response=await fetch(`https://api.spotify.com${path}`,{headers:{authorization:`Bearer ${await spotifyAccessToken(force)}`},signal:AbortSignal.timeout(10000)})
  if(response.status===401&&!force){spotifyTokenCache=null;return spotifyGet(path,true)}
  if(!response.ok)throw Error(`Spotify HTTP ${response.status}`)
  return response.json()
}

async function spotifyRelated(track:any){
  const key=String(track?.id||'');if(!key)return [track]
  let request=spotifyRelatedCache.get(key)
  if(!request){
    request=(async()=>{try{
      const full=await spotifyGet(`/v1/tracks/${encodeURIComponent(key)}`)
      const artistId=String(full?.artists?.[0]?.id||'')
      const profile=artistId?await spotifyGet(`/v1/artists/${encodeURIComponent(artistId)}`):null
      const genres=Array.isArray(profile?.genres)?profile.genres.slice(0,2).map(String).filter(Boolean):[]
      const queries=[String(track.name||''),`album:"${track.album||''}"`,...genres.map((genre:string)=>`genre:"${genre}"`)].filter(Boolean)
      const results=await Promise.all(queries.map(async query=>{try{const payload=await spotifyGet(`/v1/search?type=track&limit=10&q=${encodeURIComponent(query)}`);return Array.isArray(payload?.tracks?.items)?payload.tracks.items.map(publicSpotifyTrack):[]}catch{return[]}}))
      const artistKeys=(value:unknown)=>String(value||'').toLowerCase().split(',').map(name=>name.trim()).filter(Boolean)
      const signature=(value:any)=>`${String(value?.name||'').toLowerCase()}|${String(value?.artists||'').toLowerCase()}`
      const seen=new Set([key]),seenSignatures=new Set([signature(track)]),artistCounts=new Map(artistKeys(track.artists).map(name=>[name,1])),related=[] as any[]
      for(let row=0;row<10&&related.length<30;row++)for(const group of results){
        const item=group[row],keys=artistKeys(item?.artists),itemSignature=signature(item)
        if(!item?.id||item.durationMs<=0||seen.has(item.id)||seenSignatures.has(itemSignature)||keys.some(name=>(artistCounts.get(name)||0)>=2))continue
        seen.add(item.id);seenSignatures.add(itemSignature);for(const name of keys)artistCounts.set(name,(artistCounts.get(name)||0)+1);related.push(item)
      }
      return [track,...related]
    }catch{return[track]}})()
    spotifyRelatedCache.set(key,request)
  }
  return request
}

let spotifyPlayback:{key:string;queue:any[];index:number;progressMs:number;lastActiveAt:number|null}|null=null
const spotifyKeyOf=(track:any)=>[track?.id,track?.name,track?.artists].join('|')
async function spotifyExtendQueue(queue:any[],exclude:Set<string>){
  const related=await spotifyRelated(queue[queue.length-1])
  for(const item of related){
    const key=spotifyKeyOf(item)
    if(!item?.id||Number(item.durationMs)<=0||exclude.has(key))continue
    exclude.add(key);queue.push(item)
  }
}
async function currentSpotifyTrack(playlist:any[],autoPlay:boolean){
  const key=(autoPlay?'on':'off')+'|'+playlist.map(spotifyKeyOf).join('|')
  const now=Date.now()
  if(!spotifyPlayback||spotifyPlayback.key!==key){
    spotifyPlayback={key,queue:[...playlist],index:0,progressMs:0,lastActiveAt:now}
  }else if(spotifyPlayback.lastActiveAt!==null){
    const delta=Math.max(0,now-spotifyPlayback.lastActiveAt)
    spotifyPlayback.progressMs+=delta
    spotifyPlayback.lastActiveAt=now
  }else{
    spotifyPlayback.lastActiveAt=now
  }
  let track=spotifyPlayback.queue[spotifyPlayback.index]||playlist[0]
  let duration=Math.max(1,Number(track?.durationMs)||1)
  while(spotifyPlayback.progressMs>=duration){
    spotifyPlayback.progressMs-=duration
    spotifyPlayback.index++
    if(spotifyPlayback.index>=spotifyPlayback.queue.length){
      if(autoPlay){
        await spotifyExtendQueue(spotifyPlayback.queue,new Set(spotifyPlayback.queue.map(spotifyKeyOf)))
        if(spotifyPlayback.index>=spotifyPlayback.queue.length)spotifyPlayback.index=0
      }else spotifyPlayback.index=0
    }
    track=spotifyPlayback.queue[spotifyPlayback.index]||playlist[0]
    duration=Math.max(1,Number(track?.durationMs)||1)
  }
  const startedAt=now-spotifyPlayback.progressMs
  return{track,startedAt,progressMs:spotifyPlayback.progressMs}
}

async function spotifyLyrics(track:any) {
  const key=String(track?.id||'');if(!key)return []
  let request=lyricsCache.get(key)
  if(!request){
    request=(async()=>{try{const query=new URLSearchParams({track_name:String(track.name||''),artist_name:String(track.artists||''),album_name:String(track.album||''),duration:String(Math.round(Number(track.durationMs||0)/1000))}),response=await fetch(`https://lrclib.net/api/get?${query}`,{headers:{'user-agent':'Discord Utils/1.0'},signal:AbortSignal.timeout(10000)}),payload=await response.json().catch(()=>null) as {syncedLyrics?:unknown}|null;return response.ok&&typeof payload?.syncedLyrics==='string'?parseSyncedLyrics(payload.syncedLyrics):[]}catch{return []}})()
    lyricsCache.set(key,request)
  }
  return request
}

type SceneInput = { setup: any; source: any }

function getScenes(raw: any): SceneInput[] {
  if (Array.isArray(raw?.configs) && raw.configs.length) {
    return raw.configs.slice(0,Math.max(1,Number(embeddedSession.env.RPC_CONFIG_LIMIT)||1)).map((s: any) => ({ setup: s?.setup || {}, source: s?.config || {} }))
  }
  return [{ setup: raw?.setup || {}, source: raw?.config || {} }]
}

function sceneRotationLength(scene: SceneInput): number {
  const setup = scene?.setup || {}
  const source = scene?.source || {}
  const mode = setup.mode || 'RICH_PRESENCE'
  if (mode === 'SPOTIFY') {
    const names = Array.isArray(setup.name) ? setup.name.length : (typeof setup.name === 'string' ? 1 : 0)
    const button1 = Array.isArray(source['button-1']) ? source['button-1'].length : 0
    const button2 = Array.isArray(source['button-2']) ? source['button-2'].length : 0
    const bigimg = Array.isArray(source.bigimg) ? source.bigimg.length : 0
    return Math.max(1, names, button1, button2, bigimg)
  }
  const lengths = [
    Array.isArray(source['text-1']) ? source['text-1'].length : 0,
    Array.isArray(source['text-2']) ? source['text-2'].length : 0,
    Array.isArray(source['text-3']) ? source['text-3'].length : 0,
    Array.isArray(source.bigimg) ? source.bigimg.length : 0,
    Array.isArray(source.smallimg) ? source.smallimg.length : 0,
    Array.isArray(source['button-1']) ? source['button-1'].length : 0,
    Array.isArray(source['button-2']) ? source['button-2'].length : 0,
    Array.isArray(setup.name) ? setup.name.length : (typeof setup.name === 'string' ? 1 : 0)
  ]
  return Math.max(1, ...lengths)
}

function resolveScene(scenes: SceneInput[], tickRaw: number): { sceneIndex: number; localIndex: number } {
  const tick = Number.isFinite(tickRaw) ? Math.max(0, Math.trunc(tickRaw)) : 0
  const total = scenes.reduce((sum, s) => sum + sceneRotationLength(s), 0)
  if (total <= 0) return { sceneIndex: 0, localIndex: 0 }
  let t = ((tick % total) + total) % total
  for (let i = 0; i < scenes.length; i++) {
    const len = sceneRotationLength(scenes[i])
    if (t < len) return { sceneIndex: i, localIndex: t }
    t -= len
  }
  return { sceneIndex: 0, localIndex: 0 }
}

async function toRuntimeScene(raw: Config | any, scene: SceneInput, index: number, sceneIndex: number): Promise<Config> {
  const setup = scene.setup || {}
  const mode = setup.mode || 'RICH_PRESENCE'
  if(mode!=='SPOTIFY'&&spotifyPlayback){
    spotifyPlayback.lastActiveAt=null
  }
  const source = scene.source || {}
  const spotifySeedList=mode==='SPOTIFY'?((Array.isArray(setup.spotifyTracks)?setup.spotifyTracks:Array.isArray(setup.spotifyTrack)?setup.spotifyTrack:[setup.spotifyTrack]).filter((track:any)=>track&&typeof track==='object'&&Number(track.durationMs)>0)):[]
  let spotifyCurrent:any=null
  if(spotifySeedList.length)spotifyCurrent=await currentSpotifyTrack(spotifySeedList,setup.spotifyAutoPlay!==false)
  const spotifyTrack=spotifyCurrent?.track||null
  // Badge nền tảng (Xbox/PS badge) và nút Xem YouTube thay thế custom button ở Discord;
  // giữ button trong config nhưng không gửi khi các chế độ này bật.
  // XBOX/PS luôn dùng badge nền tảng; Discord thay custom button bằng nút mặc định nên không gửi button.
  const suppressButtons =
    mode === 'XBOX' || mode === 'PLAYSTATION' ||
    (mode === 'YOUTUBE' && setup.youtubeMode !== 'buttons')
  const selectedButtons = suppressButtons ? [] : rotatingButtons(source,index)
  const metrics = await getMetrics(setup.city)
  const startTimestamp = parseTimestamp(setup.startTimeStamp ?? raw.startTimeStamp ?? source.options?.startTimeStamp)
  const endTimestamp = parseTimestamp(setup.endTimeStamp ?? raw.endTimeStamp ?? source.options?.endTimeStamp)
  const timestampMode = setup.timestamp ?? source.options?.timestamp
  // XBOX/PLAYSTATION/YOUTUBE ép cứng type để hiện badge, đè cả config cũ đã lưu type khác.
  const type = defaultTypeForMode(mode) || setup.type || 'LISTENING'
  const text1 = renderText(pick(source['text-1'], index), setup.city, metrics)
  const text2 = renderText(pick(source['text-2'], index), setup.city, metrics)
  const text3 = renderText(pick(source['text-3'], index), setup.city, metrics)
  const spotifyDuration=Math.max(0,Number(spotifyTrack?.durationMs)||0)
  const spotifyFallbackStart=spotifyDuration>0?spotifyCurrent?.startedAt:undefined
  let spotifyStart:number|undefined
  let spotifyEnd:number|undefined
  if(spotifyTrack){
    // Spotify mode follows the live playback window (0 -> end) and ignores manual start/end fields
    spotifyStart=spotifyFallbackStart
    spotifyEnd=spotifyStart!==undefined?spotifyStart+spotifyDuration:undefined
  }
  const lyrics=spotifyTrack?await spotifyLyrics(spotifyTrack):[]
  const elapsed=spotifyCurrent?spotifyCurrent.progressMs/1000:(spotifyStart===undefined?0:(Date.now()-spotifyStart)/1000)
  const lyric=[...lyrics].reverse().find(line=>line.at<=elapsed)?.text

  return {
    APPLICATION_ID: sceneApplicationIds[sceneIndex] || raw.APPLICATION_ID || defaultApplicationId,
    mode,
    type,
    noPlatform: false,
    name: mode === 'YOUTUBE' ? 'YouTube' : (rotatingName(setup.name, index) || (mode === 'SPOTIFY' ? 'Spotify' : type)),
    // YOUTUBE: youtubeMode='watch' hiện nút Xem (dùng url youtube), ='buttons' giữ 2 custom button (không url).
    streamURL: mode === 'YOUTUBE'
      ? (setup.youtubeMode === 'watch'
          ? (typeof setup.streamURL === 'string' && setup.streamURL.trim() ? setup.streamURL : 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
          : undefined)
      : (typeof setup.streamURL === 'string' && setup.streamURL.trim() ? setup.streamURL : undefined),
    details: spotifyTrack?.name||text1,
    state: spotifyTrack?spotifyTrack.artists:text2,
    startTimestamp: spotifyStart??startTimestamp??(timestampMode === '{start}' ? startedAt : undefined),
    endTimestamp: spotifyTrack?spotifyEnd:endTimestamp,
    assets: {
      large_image: validImage(pick(source.bigimg, index))||validImage(spotifyTrack?.image),
      large_text: spotifyTrack?(lyric||spotifyTrack.album):(['PLAYING', 'WATCHING'].includes(type) ? undefined : text3),
      small_image: validImage(pick(source.smallimg, index)),
      small_text: setup.city
    },
    buttons: selectedButtons.length ? selectedButtons.map((button: { name: string; url: string }) => ({
      label: button.name,
      url: button.url
    })) : undefined,
    refreshInterval: mode==='SPOTIFY'?1000:Math.max(Number(setup.delay || 15) * 1000, 1000)
  }
}

/**
 * Updates the Rich Presence object based on the provided configuration.
 * @param rpc The Rich Presence object to update.
 * @param config The configuration to apply.
 */
async function updateRPC(rpc: RichPresence, config: Config) {
  config = await resolveExternalImages(config)
  if (config.mode === 'SPOTIFY') {
    rpc.setName(config.name||'Spotify')
    rpc.setType('LISTENING')
  } else {
    // Activity name is required by discord.js even when Discord does not display it.
    rpc.setName(config.name || config.type || 'RICH_PRESENCE')
  }
  if (config.details) rpc.setDetails(config.details)
  if (config.state) rpc.setState(config.state)
  if (config.party) {
    rpc.setParty({
      max: config.party.size.max,
      current: config.party.size.current
    })
  }

  // Activity Type
  if (config.mode !== 'SPOTIFY' && config.type) {
    rpc.setType(config.type)
    if (config.type === 'STREAMING' && config.streamURL) {
      rpc.setURL(config.streamURL)
    }
  }

  // Timestamps
  if (config.setLocalTime && config.timezone) {
    rpc.setStartTimestamp(getStartOfDayInTimezone(config.timezone))
  } else if (config.startTimestamp) {
    rpc.setStartTimestamp(config.startTimestamp)
  }
  if (config.endTimestamp) {
    rpc.setEndTimestamp(config.endTimestamp)
  }

  // Assets
  if (config.assets) {
    if (config.assets.large_image)
      rpc.setAssetsLargeImage(config.assets.large_image)
    if (config.assets.large_text)
      rpc.setAssetsLargeText(config.assets.large_text)
    if (config.assets.small_image)
      rpc.setAssetsSmallImage(config.assets.small_image)
    if (config.assets.small_text)
      rpc.setAssetsSmallText(config.assets.small_text)
  }

  // Buttons
  if (config.buttons) {
    rpc.setButtons(
      ...config.buttons.map((button: { label: string; url: string }) => ({
        name: button.label,
        url: button.url
      }))
    )
  }
}
