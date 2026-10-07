import 'dotenv/config'
import { Client } from 'discord.js-selfbot-v13'
import { readFile } from 'node:fs/promises'
import { voiceRepairAction } from './repair.js'
import { readStoredToken } from '../token-store.js'

if (process.stdin) {
  process.stdin.on('close', () => process.exit(0))
  process.stdin.on('end', () => process.exit(0))
  process.stdin.resume()
}

type VoiceConfig = {
  Guild: string
  Channel: string
  Stream?: boolean
  Camera?: boolean
  SelfMute?: boolean
  SelfDeaf?: boolean
  RefreshMs?: number
}

const { VOICE_CONFIG_PATH = 'voice.json', TOKEN_PATH, TOKEN } = process.env
const config = await loadConfig(VOICE_CONFIG_PATH)
const activeToken = await loadToken(TOKEN_PATH, TOKEN)

if (!activeToken) throw new Error('Missing TOKEN')
if (!config.Guild || !config.Channel) throw new Error('Missing Guild or Channel in voice config')

const client = new Client({ checkUpdate: false } as any)
let refreshTimer: NodeJS.Timeout | undefined
let streamTimer: NodeJS.Timeout | undefined
let shuttingDown = false

function send(op: number, data: unknown) {
  ;(client.ws as any).broadcast({ op, d: data })
}

function streamKey() {
  if (!client.user) throw new Error('Client not ready')
  return `guild:${config.Guild}:${config.Channel}:${client.user.id}`
}

function joinVoice() {
  send(4, {
    guild_id: config.Guild,
    channel_id: config.Channel,
    self_mute: config.SelfMute ?? true,
    self_deaf: config.SelfDeaf ?? false,
    self_video: config.Camera ?? false
  })
}

function startStream() {
  if (!config.Stream) return
  send(18, {
    type: 'guild',
    guild_id: config.Guild,
    channel_id: config.Channel,
    preferred_region: null
  })
  send(22, {
    stream_key: streamKey(),
    paused: false
  })
}

function scheduleStream() {
  if (!config.Stream || shuttingDown) return
  if (streamTimer) clearTimeout(streamTimer)
  streamTimer = setTimeout(() => {
    streamTimer = undefined
    if (!shuttingDown) startStream()
  }, 1500)
}

function stopStream() {
  if (!client.user) return
  send(19, { stream_key: streamKey() })
}

function leaveVoice() {
  send(4, {
    guild_id: config.Guild,
    channel_id: null,
    self_mute: config.SelfMute ?? true,
    self_deaf: config.SelfDeaf ?? false,
    self_video: false
  })
}

async function applyVoiceState() {
  if (shuttingDown) return
  joinVoice()
  scheduleStream()
}

function currentVoiceState() {
  const selfId=client.user?.id
  return selfId?client.guilds.cache.get(config.Guild)?.voiceStates.cache.get(selfId):undefined
}

const MAX_TIMER_MS = 2_147_483_647

function refreshDelay(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 5000), MAX_TIMER_MS) : 60000
}

function maintainVoiceState(state: any = currentVoiceState()) {
  if (shuttingDown) return
  const action=voiceRepairAction(config.Channel,Boolean(config.Stream),state?{channelId:state.channelId??null,streaming:state.streaming??null}:null)
  if(action==='join'){void applyVoiceState();return}
  if(action==='stream'){scheduleStream();return}
  if(state?.streaming===true&&streamTimer){clearTimeout(streamTimer);streamTimer=undefined}
}

client.on('invalidated', () => { console.error('An invalid token was provided. Session invalidated, token likely revoked') })

client.on('ready', () => {
  void (async () => {
    console.log(`Voice logged in as ${client.user?.username}`)
    await applyVoiceState()
    refreshTimer = setInterval(() => maintainVoiceState(), refreshDelay(config.RefreshMs ?? 60000))
  })()
})

client.on('voiceStateUpdate', (oldState: any, newState: any) => {
  if (shuttingDown) return
  const selfId = client.user?.id
  if (oldState.member?.id !== selfId && newState.member?.id !== selfId) return
  maintainVoiceState(newState)
})

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  if (refreshTimer) clearInterval(refreshTimer)
  if (streamTimer) clearTimeout(streamTimer)
  try {
    stopStream()
    leaveVoice()
    await new Promise(resolve => setTimeout(resolve, 750))
    client.destroy()
  } finally {
    process.exit(0)
  }
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())

try {
  await client.login(activeToken)
} catch (error) {
  console.error('Error logging in:', error)
  throw new Error('Failed to log in')
}

async function loadConfig(path: string): Promise<VoiceConfig> {
  return JSON.parse(await readFile(path, 'utf8')) as VoiceConfig
}
async function loadToken(path: string | undefined, fallback: string | undefined): Promise<string | undefined> {
  if (!path) return fallback
  return readStoredToken(await readFile(path, 'utf8')) || fallback
}
