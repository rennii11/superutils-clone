import 'dotenv/config'
import assert from 'node:assert/strict'
import { Client } from 'discord.js-selfbot-v13'
import { watch } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
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

type ChatMode = 'ordered'|'random'|'text-war'
type ChatConfig = {Tokens:string[];guildId:string;channelId:string;texts:string[];delaySeconds?:number;mode:ChatMode;targetUserId?:string;image?:string}
type IndexedToken = {token:string;index:number}
type Session = {client:Client;token:string;index:number;tokenName:string;timer?:NodeJS.Timeout;verifyRestricted?:boolean}

function normalizeTokens(value: unknown, fallback: string | undefined) {
  const rawTokens = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const tokens: IndexedToken[] = []
  for (let index = 0; index < rawTokens.length && tokens.length < 50; index++) {
    const token = typeof rawTokens[index] === 'string' ? rawTokens[index].trim() : ''
    if (!token || seen.has(token)) continue
    seen.add(token)
    tokens.push({token,index})
  }
  const fallbackToken = fallback?.trim()
  return tokens.length || !fallbackToken ? tokens : [{token:fallbackToken,index:0}]
}

function chatMode(data: {mode?:unknown;randomChat?:unknown;RandomChat?:unknown}): ChatMode {
  return data.mode==='text-war'?'text-war':data.mode==='random'||data.randomChat===true||data.RandomChat===true?'random':'ordered'
}

function textWarMessage(text:string,userId:string){const mention=` <@${userId}>`;return `${text.slice(0,2000-mention.length)}${mention}`}
function imagePath(value: unknown) { return typeof value==='string'&&/^media\/(?:chat|chatpool)-image\.(?:png|jpe?g|gif|webp)$/i.test(value)?value:'' }
function chatMessage(text:string,data:ChatConfig,configPath:string,mediaRootDir:string){const content=data.mode==='text-war'?textWarMessage(text,data.targetUserId!):text;const owner=basename(dirname(dirname(configPath)));const files=data.image?[join(mediaRootDir,owner,basename(data.image))]:undefined;return {content,...(files?{files}:{}),...(data.mode==='text-war'?{allowedMentions:{users:[data.targetUserId!]}}:{})}}

if (embeddedSession.env.CHAT_SELF_CHECK === '1') {
  assert.deepEqual(normalizeTokens([' token-a ', 'token-a', '', 'token-b'], 'fallback'), [{token:'token-a',index:0},{token:'token-b',index:3}])
  assert.deepEqual(normalizeTokens([], ' fallback '), [{token:'fallback',index:0}])
  assert.equal(chatMode({randomChat:true}),'random')
  assert.equal(chatMode({mode:'text-war'}),'text-war')
  assert.equal(textWarMessage('test','12345678901234567'),'test <@12345678901234567>')
  assert.equal(imagePath('media/chat-image.webp'),'media/chat-image.webp')
  assert.equal(imagePath('../token.json'),'')
  assert.deepEqual(chatMessage('hello',{mode:'ordered',image:'media/chat-image.png'} as ChatConfig,'/accounts/demo/demo-slot/chat.json','/media'),{content:'hello',files:['/media/demo/chat-image.png']})
  assert.deepEqual(chatMessage('hello',{mode:'text-war',targetUserId:'12345678901234567'} as ChatConfig,'/accounts/demo/demo-slot/chat.json','/media'),{content:'hello <@12345678901234567>',allowedMentions:{users:['12345678901234567']}})
  logger.log('Auto chat self-check passed')
  process.exit(0)
}

const { CHAT_CONFIG_PATH = 'chat.json', CHATPOOL_STATUS_PATH, CHAT_WAR_TEXT_PATH = 'assets/chui.txt', MEDIA_ROOT_DIR = 'media', TOKEN_PATH, TOKEN } = embeddedSession.env
const fallbackToken=CHATPOOL_STATUS_PATH?undefined:await loadToken(TOKEN_PATH,TOKEN)
let config = await loadConfig(CHAT_CONFIG_PATH)
const sessions = new Map<string,Session>()
const failedTokens = new Set<string>()
const verifyTokens = new Set<string>()
let messageIndex = 0
let shuttingDown = false
let reloadTimer: NodeJS.Timeout|undefined
let reconcileQueue=Promise.resolve()

function planTokenChanges(desired: IndexedToken[]) {
  const desiredByToken=new Map(desired.map(item=>[item.token,item]))
  const known=new Set([...sessions.keys(),...failedTokens,...verifyTokens])
  return {desiredByToken,removed:[...known].filter(token=>!desiredByToken.has(token)),added:desired.filter(item=>!known.has(item.token)||verifyTokens.has(item.token))}
}

async function loadConfig(path: string): Promise<ChatConfig> {
  const data = JSON.parse(await readFile(path, 'utf8')) as Partial<ChatConfig> & {tokens?:string[];Guild?:string;Channel?:string;Texts?:string[];DelaySeconds?:number;RandomChat?:boolean}
  const mode=chatMode(data)
  const source=mode==='text-war'?(await readFile(CHAT_WAR_TEXT_PATH,'utf8')).split(/\r?\n/):Array.isArray(data.texts)?data.texts:data.Texts||[]
  const texts=source.filter(item=>typeof item==='string').map(item=>item.trim()).filter(Boolean).slice(0,mode==='text-war'?10_000:100)
  return {Tokens:Array.isArray(data.Tokens)?data.Tokens:Array.isArray(data.tokens)?data.tokens:[],guildId:String(data.guildId||data.Guild||'').trim(),channelId:String(data.channelId||data.Channel||'').trim(),texts,delaySeconds:Math.max(Number(data.delaySeconds??data.DelaySeconds??30),0.1),mode,targetUserId:String(data.targetUserId||'').trim(),image:imagePath(data.image)}
}

async function loadToken(path: string | undefined, fallback: string | undefined): Promise<string | undefined> {
  if (!path) return fallback
  const raw = (await readFile(path, 'utf8')).trim()
  return readStoredToken(raw) || fallback
}

function tokenName(tokenIndex: number) { return `token-${tokenIndex + 1}` }

function nextText() {
  if (config.mode!=='ordered') return config.texts[Math.floor(Math.random() * config.texts.length)]
  const text=config.texts[messageIndex%config.texts.length]
  messageIndex++
  return text
}

function scheduleNext(session: Session) {
  if(session.timer)clearTimeout(session.timer)
  if(!shuttingDown)session.timer=setTimeout(()=>void sendNext(session),Math.max(config.delaySeconds??30,0.1)*1000)
}

async function sendNext(session: Session) {
  if (shuttingDown) return
  let blocked=false
  try {
    const guild=await session.client.guilds.fetch(config.guildId).catch(()=>null)
    if(!guild)throw new Error('Guild not found')
    const channel=await session.client.channels.fetch(config.channelId).catch(()=>null) as any
    if(!channel?.send)throw new Error('Channel not found or cannot send')
    const text=nextText()
    await channel.send(chatMessage(text,config,CHAT_CONFIG_PATH,MEDIA_ROOT_DIR))
  } catch (error: any) {if(session.verifyRestricted){blocked=true;verifyTokens.add(session.token);sessions.delete(session.token);stopSession(session);await writeStatus(normalizeTokens(config.Tokens,fallbackToken));logger.error(`${session.tokenName} blocked: verification prevented chat`)}else logger.error(`${session.tokenName} auto chat error: ${error?.message||error}`) }
  finally { if(!blocked)scheduleNext(session) }
}

async function startToken(item: IndexedToken) {
  verifyTokens.delete(item.token)
  const client=new Client({checkUpdate:false,...memoryConstrainedClientOptions} as any)
  const session:Session={client,token:item.token,index:item.index,tokenName:tokenName(item.index)}
  client.once('ready',()=>logger.log(`${session.tokenName} auto chat logged in as ${client.user?.username}`))
  client.on('error',error=>logger.error(`${session.tokenName} Discord client error:`,error))
  client.on('invalidated',()=>{logger.error(`${session.tokenName} session invalidated, token likely revoked`);if(!CHATPOOL_STATUS_PATH)reportTokenInvalid()})
  try { await client.login(item.token);const check=await fetch('https://discord.com/api/v10/users/@me/guilds?limit=1',{headers:{Authorization:item.token},signal:AbortSignal.timeout(10000)}).catch(()=>null),result=await check?.json().catch(()=>null) as {code?:unknown}|null;session.verifyRestricted=check?.status===403&&result?.code===40002;sessions.set(item.token,session);void sendNext(session) }
  catch(error:any){failedTokens.add(item.token);client.destroy();if(!CHATPOOL_STATUS_PATH&&error?.message==='An invalid token was provided.')reportTokenInvalid();logger.error(`${session.tokenName} failed: ${error?.message||error}`)}
}

function stopSession(session: Session) {
  if(session.timer)clearTimeout(session.timer)
  session.client.destroy()
}

async function writeStatus(desired: IndexedToken[]) {
  if(!CHATPOOL_STATUS_PATH)return
  const invalidTokens=desired.filter(item=>failedTokens.has(item.token)).map(item=>item.index+1),verifyRequiredTokens=desired.filter(item=>verifyTokens.has(item.token)).map(item=>item.index+1)
  await writeFile(CHATPOOL_STATUS_PATH,JSON.stringify({invalidTokens,verifyRequiredTokens})+'\n',{mode:0o600})
}

async function reconcileConfig(next: ChatConfig) {
  const desired=normalizeTokens(next.Tokens,fallbackToken)
  const changes=planTokenChanges(desired)
  for(const token of changes.removed){const session=sessions.get(token);if(session)stopSession(session);sessions.delete(token);failedTokens.delete(token);verifyTokens.delete(token)}
  if(!next.guildId||!next.channelId||!next.texts.length||(next.mode==='text-war'&&!/^\d{17,20}$/.test(next.targetUserId||''))){await writeStatus(desired);logger.error('Auto chat config waiting for guildId, channelId, texts and valid Text War user ID');return}
  config=next
  for(const [token,item] of changes.desiredByToken){const session=sessions.get(token);if(!session)continue;session.index=item.index;session.tokenName=tokenName(item.index);scheduleNext(session)}
  for(const item of changes.added)await startToken(item)
  await writeStatus(desired)
}

function watchPoolConfig(path: string) {
  const file=basename(path)
  return watch(dirname(path),{persistent:true},(_event,fileName)=>{
    if(basename(String(fileName||''))!==file)return
    clearTimeout(reloadTimer)
    reloadTimer=setTimeout(()=>{reconcileQueue=reconcileQueue.then(async()=>reconcileConfig(await loadConfig(path))).catch(error=>logger.error('Auto chat config reload failed:',error instanceof Error?error.message:String(error)))},150)
  })
}

async function shutdown(exitProcess: boolean) {
  if(shuttingDown)return
  shuttingDown=true
  clearTimeout(reloadTimer)
  configWatcher.close()
  for(const session of sessions.values())stopSession(session)
  if(exitProcess)process.exit(0)
}

export async function stopEmbeddedSession() {
  await shutdown(false)
}

if(!embeddedSession.active){
  process.once('SIGINT',()=>void shutdown(true))
  process.once('SIGTERM',()=>void shutdown(true))
}else{
  onWorkerStop(()=>stopEmbeddedSession())
}

if(CHATPOOL_STATUS_PATH)await writeFile(CHATPOOL_STATUS_PATH,'{"invalidTokens":[],"verifyRequiredTokens":[]}\n',{mode:0o600})
await reconcileConfig(config)
const configWatcher=watchPoolConfig(CHAT_CONFIG_PATH)
