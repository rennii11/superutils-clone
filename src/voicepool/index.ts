import 'dotenv/config'
import { Client } from 'discord.js-selfbot-v13'
import { watch } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { voiceRepairAction } from '../voice/repair.js'

if (process.stdin) {
  process.stdin.on('close', () => process.exit(0))
  process.stdin.on('end', () => process.exit(0))
  process.stdin.resume()
}

type VoicepoolConfig = {
  Tokens: string[]
  Guild: string
  Channel: string
  Stream?: boolean
  Camera?: boolean
  SelfMute?: boolean
  SelfDeaf?: boolean
  RefreshMs?: number
}

type IndexedToken = { token: string; index: number }
type Session = {
  client: Client
  token: string
  index: number
  tokenName: string
  refreshTimer?: NodeJS.Timeout
  streamTimer?: NodeJS.Timeout
  verifyRestricted?: boolean
  verifyJoinTimer?: NodeJS.Timeout
}

const { VOICEPOOL_CONFIG_PATH = 'voicepool.json' } = process.env
const VOICEPOOL_STATUS_PATH = process.env.VOICEPOOL_STATUS_PATH || join(dirname(VOICEPOOL_CONFIG_PATH), 'voicepool-status.json')
let config = await loadConfig(VOICEPOOL_CONFIG_PATH)
const sessions = new Map<string, Session>()
const failedTokens = new Set<string>()
const verifyTokens = new Set<string>()
let shuttingDown = false
let reloadTimer: NodeJS.Timeout|undefined
let reconcileQueue=Promise.resolve()

function indexedTokens(value: unknown): IndexedToken[] {
  const raw = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  return raw.map((value,index)=>({token:typeof value==='string'?value.trim():'',index})).filter(item=>item.token&&!seen.has(item.token)&&Boolean(seen.add(item.token))).slice(0,50)
}

function planTokenChanges(desired: IndexedToken[]) {
  const desiredByToken = new Map(desired.map(item => [item.token, item]))
  const known = new Set([...sessions.keys(), ...failedTokens, ...verifyTokens])
  return {
    desiredByToken,
    removed: [...known].filter(token => !desiredByToken.has(token)),
    added: desired.filter(item => !known.has(item.token) || verifyTokens.has(item.token))
  }
}

function send(client: Client, op: number, data: unknown) {
  ;(client.ws as any).broadcast({ op, d: data })
}

function tokenName(index: number) {
  return `Token ${index + 1}`
}

function streamKey(client: Client, value: VoicepoolConfig = config) {
  if (!client.user) throw new Error('Client not ready')
  return `guild:${value.Guild}:${value.Channel}:${client.user.id}`
}

function joinVoice(client: Client, value: VoicepoolConfig = config) {
  if (!client.guilds.cache.has(value.Guild)) console.error(`${client.user?.username || 'token'} not in guild or no guild access`)
  send(client, 4, {
    guild_id: value.Guild,
    channel_id: value.Channel,
    self_mute: value.SelfMute ?? true,
    self_deaf: value.SelfDeaf ?? false,
    self_video: value.Camera ?? false
  })
}

function startStream(client: Client, value: VoicepoolConfig = config) {
  if (!value.Stream) return
  send(client, 18, {type:'guild',guild_id:value.Guild,channel_id:value.Channel,preferred_region:null})
  send(client, 22, {stream_key:streamKey(client,value),paused:false})
}

function scheduleStream(session: Session) {
  if (!config.Stream || shuttingDown) return
  if (session.streamTimer) clearTimeout(session.streamTimer)
  session.streamTimer = setTimeout(() => {
    session.streamTimer = undefined
    if (!shuttingDown) startStream(session.client)
  }, 1500)
}

function stopStream(client: Client, value: VoicepoolConfig = config) {
  if (!client.user || !value.Stream) return
  send(client, 19, {stream_key:streamKey(client,value)})
}

function leaveVoice(client: Client, value: VoicepoolConfig = config) {
  send(client, 4, {guild_id:value.Guild,channel_id:null,self_mute:value.SelfMute??true,self_deaf:value.SelfDeaf??false,self_video:false})
}

async function applyVoiceState(session: Session) {
  if (shuttingDown) return
  joinVoice(session.client)
  scheduleStream(session)
}

function currentVoiceState(session: Session) {
  const selfId=session.client.user?.id
  return selfId?session.client.guilds.cache.get(config.Guild)?.voiceStates.cache.get(selfId):undefined
}

const MAX_TIMER_MS = 2_147_483_647

function refreshDelay(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 5000), MAX_TIMER_MS) : 60000
}

function maintainVoiceState(session: Session, state: any = currentVoiceState(session)) {
  if (shuttingDown) return
  const action=voiceRepairAction(config.Channel,Boolean(config.Stream),state?{channelId:state.channelId??null,streaming:state.streaming??null}:null)
  if(action==='join'){void applyVoiceState(session);return}
  if(action==='stream'){scheduleStream(session);return}
  if(state?.streaming===true&&session.streamTimer){clearTimeout(session.streamTimer);session.streamTimer=undefined}
}

function scheduleRefresh(session: Session) {
  if (session.refreshTimer) clearInterval(session.refreshTimer)
  session.refreshTimer = setInterval(() => maintainVoiceState(session), refreshDelay(config.RefreshMs ?? 60000))
}

async function startToken(item: IndexedToken) {
  verifyTokens.delete(item.token)
  const client = new Client({ checkUpdate: false } as any)
  const session: Session = {client,token:item.token,index:item.index,tokenName:tokenName(item.index)}
  client.on('ready', () => {
    console.log(`${session.tokenName} logged in as ${client.user?.username}`)
    void applyVoiceState(session)
    scheduleRefresh(session)
  })
  client.on('voiceStateUpdate', (oldState: any, newState: any) => {
    if (shuttingDown) return
    const selfId = client.user?.id
    if (oldState.member?.id !== selfId && newState.member?.id !== selfId) return
    maintainVoiceState(session,newState)
  })
  try {
    await client.login(item.token)
    const check=await fetch('https://discord.com/api/v10/users/@me/guilds?limit=1',{headers:{Authorization:item.token},signal:AbortSignal.timeout(10000)}).catch(()=>null),result=await check?.json().catch(()=>null) as {code?:unknown}|null
    session.verifyRestricted=check?.status===403&&result?.code===40002
    sessions.set(item.token, session)
    if(session.verifyRestricted)session.verifyJoinTimer=setTimeout(async()=>{session.verifyJoinTimer=undefined;if(currentVoiceState(session)?.channelId===config.Channel)return;verifyTokens.add(session.token);sessions.delete(session.token);stopSession(session,config);await writeStatus(indexedTokens(config.Tokens));console.error(`${session.tokenName} blocked: verification prevented voice join`)},12000)
  } catch (error: any) {
    failedTokens.add(item.token)
    client.destroy()
    console.error(`${session.tokenName} failed: ${error?.message || error}`)
  }
}

function stopSession(session: Session, previous: VoicepoolConfig) {
  if (session.refreshTimer) clearInterval(session.refreshTimer)
  if (session.streamTimer) clearTimeout(session.streamTimer)
  if (session.verifyJoinTimer) clearTimeout(session.verifyJoinTimer)
  try {
    stopStream(session.client, previous)
    leaveVoice(session.client, previous)
    session.client.destroy()
  } catch (error: any) {
    console.error(`${session.tokenName} shutdown failed: ${error?.message || error}`)
  }
}

async function writeStatus(desired: IndexedToken[]) {
  const invalidTokens=desired.filter(item=>failedTokens.has(item.token)).map(item=>item.index+1),verifyRequiredTokens=desired.filter(item=>verifyTokens.has(item.token)).map(item=>item.index+1)
  await writeFile(VOICEPOOL_STATUS_PATH, JSON.stringify({invalidTokens,verifyRequiredTokens})+'\n', {mode:0o600})
}

function voiceSettingsChanged(previous: VoicepoolConfig, next: VoicepoolConfig) {
  return previous.Guild!==next.Guild||previous.Channel!==next.Channel||previous.Stream!==next.Stream||previous.Camera!==next.Camera||previous.SelfMute!==next.SelfMute||previous.SelfDeaf!==next.SelfDeaf
}

async function reconcileConfig(next: VoicepoolConfig) {
  const desired=indexedTokens(next.Tokens)
  const previous=config
  const changes=planTokenChanges(desired)
  for(const token of changes.removed){const session=sessions.get(token);if(session)stopSession(session,previous);sessions.delete(token);failedTokens.delete(token);verifyTokens.delete(token)}
  if (!next.Guild || !next.Channel) {
    await writeStatus(desired)
    console.error('Voicepool config waiting for Guild and Channel')
    return
  }
  config=next
  const settingsChanged=voiceSettingsChanged(previous,next)
  for(const [token,item] of changes.desiredByToken){const session=sessions.get(token);if(!session)continue;session.index=item.index;session.tokenName=tokenName(item.index);scheduleRefresh(session);if(settingsChanged){if(previous.Stream)stopStream(session.client,previous);if(previous.Guild!==next.Guild)leaveVoice(session.client,previous);await applyVoiceState(session)}}
  for(const item of changes.added)await startToken(item)
  await writeStatus(desired)
}

function watchPoolConfig(path: string) {
  const file=basename(path)
  return watch(dirname(path),{persistent:true},(_event,fileName)=>{
    if(basename(String(fileName||''))!==file)return
    clearTimeout(reloadTimer)
    reloadTimer=setTimeout(()=>{reconcileQueue=reconcileQueue.then(async()=>reconcileConfig(await loadConfig(path))).catch(error=>console.error('Voicepool config reload failed:',error instanceof Error?error.message:String(error)))},150)
  })
}

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  clearTimeout(reloadTimer)
  configWatcher.close()
  for (const session of sessions.values()) stopSession(session,config)
  await new Promise(resolve => setTimeout(resolve, 750))
  process.exit(0)
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())

await writeFile(VOICEPOOL_STATUS_PATH, '{"invalidTokens":[],"verifyRequiredTokens":[]}\n', {mode:0o600})
await reconcileConfig(config)
const configWatcher=watchPoolConfig(VOICEPOOL_CONFIG_PATH)

async function loadConfig(path: string): Promise<VoicepoolConfig> {
  return JSON.parse(await readFile(path, 'utf8')) as VoicepoolConfig
}
