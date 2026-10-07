import { PLANS, isPlanId, reminderDays } from './plans.js'
import { FreePlanError } from './free-plan.js'
import { ensureDiscordActivityDisplay } from './discord-activity-display.js'
import 'dotenv/config'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, watch } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { setDefaultResultOrder } from 'node:dns'
import { disableQuest, enableQuest, getQuestState, QuestControlError, setQuestAccessResolver, restoreQuestLoops, runQuestNow, type QuestType } from './quest.js'
import { WebStorage, type BillingDebit, type BillingPayment, type BillingSlot, type BillingState, type BillingUser, type Session } from './storage.js'
import { TOKEN_NOTICE_INTERVALS_MS, tokenNoticeIntervalMs, tokenWebhookNotice } from '../multi/token-notice.js'
import { isValidStatusConfig } from '../status/config.js'
import { readStoredToken, serializeToken } from '../token-store.js'
import { listAccessibleDiscordChannels } from './discord-channel-access.js'
import { cashChannelId, parseOwoConfig, stoppedStatus } from '../owo/config.js'
import { parseOwoStatus } from '../owo/web.js'
import { profileCollectibles } from './showcase-profile.js'

setDefaultResultOrder('ipv4first')

async function writeFileAtomic(path: string, data: string, options?: Parameters<typeof writeFile>[2]) {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await writeFile(tmp, data, options)
  await rename(tmp, path)
}

const WEB_HOST = process.env.WEB_HOST || '127.0.0.1'
const WEB_PORT = Number(process.env.WEB_PORT || 3210)
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || 'https://rennii.store').replace(/\/+$/, '')
const MULTI_CONFIG_DIR = process.env.MULTI_CONFIG_DIR || 'accounts'
const DISABLED_CONFIG_DIR = process.env.DISABLED_CONFIG_DIR || join(dirname(MULTI_CONFIG_DIR), 'accounts-disabled')
const MEDIA_ROOT_DIR = process.env.MEDIA_ROOT_DIR || join(dirname(MULTI_CONFIG_DIR), 'media')
const STREAM_CONFIG_DIR = process.env.STREAM_CONFIG_DIR || 'stream-users'
const IDENTITY_FILE = 'identity.json'
const BOT_TOKEN = process.env.BOT_TOKEN || ''
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1532814751594319964'
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ''
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || ''
const ADMIN_USER_ID = '631286646246998039'
const oauthReady = Boolean(BOT_TOKEN && CLIENT_SECRET && REDIRECT_URI)
const BILLING_DB_FILE = process.env.BILLING_DB_FILE || 'billing.sqlite'
const SESSION_DB_FILE = process.env.SESSION_DB_FILE || 'sessions.sqlite'
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || ''
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || ''
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || ''
const storage = new WebStorage({billingDatabaseFile:BILLING_DB_FILE,sessionDatabaseFile:SESSION_DB_FILE,defaultPrice:30000})
const PLAN_DAYS = 30
const DAY_MS = 86400000
// ponytail: single web process; shared locks required before adding web replicas.
const tokenMutations = new Set<string>()
const states = new Map<string, number>()
const sessions = new Map<string, Session>()
async function saveSessions() { storage.saveSessions(sessions) }
async function loadSessions() { for(const [id,value] of storage.loadSessions())sessions.set(id,value) }
const sessionByUser=new Map<string,string>();function rebuildSessionIndex(){sessionByUser.clear();for(const[sid,s]of sessions)if(s.expires>Date.now())sessionByUser.set(s.id,sid)};loadSessions().then(()=>{rebuildSessionIndex();startServer()})
const configFiles = { config: 'scene.json', voice: 'voice.json', voicepool: 'voicepool.json', chat: 'chat.json', mention: 'mention.json', chatpool: 'chatpool.json', status: 'status.json' } as const
const disabledFiles = { config: 'rpc.disabled', voice: 'voice.disabled', voicepool: 'voicepool.disabled', chat: 'chat.disabled', mention: 'mention.disabled', chatpool: 'chatpool.disabled', status: 'status.disabled' } as const
const previewCache = new Map<string, { expires: number; values: Record<string, string> }>()
const validUserCache = new Map<string, { expires: number; valid: boolean }>()
const tokenPremiumCache = new Map<string, { expires: number; premiumType: number | null }>()
const discordMeGuildsCache = new Map<string, { expires: number; me: {id?:unknown}|null; guilds: unknown }>()
let spotifyTokenCache: {value:string;expires:number}|null = null
type SpotifyTrack = {id:string;name:string;artists:string;album:string;durationMs:number;url:string;image:string}
type ConfigFile = keyof typeof configFiles
type StoredIdentity = { userId: string; username: string }
type IdentityFolder = { folder: string; root: string; location: 'active'|'disabled' }
type AdminConfigUser = { ownerId:string;username:string;displayName:string;location:'active'|'disabled';slots:(BillingSlot&{active:boolean})[];bindOwnerId?:string;bindSlotId?:string;slotActive?:boolean }
function statusLimitFor(user: BillingUser) { const plan=user.plan; return plan&&plan.expiresAt>Date.now()?PLANS[plan.id].statuses:100 }
function poolTokenLimitFor(user: BillingUser) { const plan=user.plan; return plan&&plan.expiresAt>Date.now()?PLANS[plan.id].poolTokens:50 }
function mediaLimitBytes(user: BillingUser) { const plan=user.plan; return plan&&plan.expiresAt>Date.now()?PLANS[plan.id].mediaMb*1024*1024:0 }

async function spotifyAccessToken(force=false) {
  if(!force&&spotifyTokenCache&&spotifyTokenCache.expires>Date.now())return spotifyTokenCache.value
  if(!SPOTIFY_CLIENT_ID||!SPOTIFY_CLIENT_SECRET)throw Error('Spotify API chưa cấu hình.')
  const authorization=Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
  const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{authorization:`Basic ${authorization}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials'}),signal:AbortSignal.timeout(10000)})
  const payload=await response.json().catch(()=>null) as {access_token?:unknown;expires_in?:unknown;error_description?:unknown}|null
  if(!response.ok||typeof payload?.access_token!=='string')throw Error(typeof payload?.error_description==='string'?payload.error_description:'Không thể kết nối Spotify API.')
  spotifyTokenCache={value:payload.access_token,expires:Date.now()+Math.max(60,Number(payload.expires_in)||3600)*1000-60_000}
  return spotifyTokenCache.value
}

function spotifyTrackId(input:string) {
  const value=input.trim()
  const match=value.match(/(?:open\.spotify\.com\/track\/|spotify:track:)([A-Za-z0-9]{22})/)||value.match(/^([A-Za-z0-9]{22})$/)
  return match?.[1]||''
}

function publicSpotifyTrack(value:any):SpotifyTrack {
  return {id:String(value?.id||''),name:String(value?.name||''),artists:Array.isArray(value?.artists)?value.artists.map((artist:any)=>String(artist?.name||'')).filter(Boolean).join(', '):'',album:String(value?.album?.name||''),durationMs:Math.max(0,Number(value?.duration_ms)||0),url:String(value?.external_urls?.spotify||''),image:String(value?.album?.images?.[0]?.url||'')}
}

async function spotifyTracks(input:string) {
  const query=input.trim().slice(0,200);if(!query)throw Error('Nhập tên bài, album, tác giả hoặc link Spotify.')
  const id=spotifyTrackId(query),path=id?`/v1/tracks/${id}`:`/v1/search?type=track&limit=5&q=${encodeURIComponent(query)}`
  const request=async(force=false)=>fetch(`https://api.spotify.com${path}`,{headers:{authorization:`Bearer ${await spotifyAccessToken(force)}`},signal:AbortSignal.timeout(10000)})
  let response=await request();if(response.status===401){spotifyTokenCache=null;response=await request(true)}
  const payload=await response.json().catch(()=>null) as any
  if(!response.ok)throw Error(typeof payload?.error?.message==='string'?payload.error.message:'Không tìm được bài trên Spotify.')
  const items=id?[payload]:Array.isArray(payload?.tracks?.items)?payload.tracks.items:[]
  return items.map(publicSpotifyTrack).filter((track:SpotifyTrack)=>track.id&&track.name&&track.durationMs>0)
}
// ponytail: One web process owns writes; use targeted SQL mutations before adding more writers.
let billingCache: BillingState|null = null
async function loadBilling() { billingCache=storage.loadBilling();return billingCache }
async function saveBilling(value: BillingState,debit?:Omit<BillingDebit,'id'|'createdAt'>,notifyWeb=true) { storage.saveBilling(value,debit);billingCache=value;if(notifyWeb)queueWebEvent('billing-status') }
// Customer role management
const CUSTOMER_GUILD_ID = '1527391520968278177'
const CUSTOMER_ROLE_ID = '1539615972208550038'
const roleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const BOT_HEADERS = { Authorization: 'Bot ' + BOT_TOKEN, 'User-Agent': 'DiscordBot (https://discord.com, 1.0.0)' }
async function grantRole(userId: string) {
  if (!BOT_TOKEN) return
  await fetch(`https://discord.com/api/v10/guilds/${CUSTOMER_GUILD_ID}/members/${userId}/roles/${CUSTOMER_ROLE_ID}`, {
    method: 'PUT', headers: BOT_HEADERS, signal: AbortSignal.timeout(8000)
  }).catch(() => null)
}
async function revokeRole(userId: string) {
  if (!BOT_TOKEN) return
  await fetch(`https://discord.com/api/v10/guilds/${CUSTOMER_GUILD_ID}/members/${userId}/roles/${CUSTOMER_ROLE_ID}`, {
    method: 'DELETE', headers: BOT_HEADERS, signal: AbortSignal.timeout(8000)
  }).catch(() => null)
}
function scheduleRoleRevoke(userId: string, expiresAt: number) {
  const old = roleTimers.get(userId); if (old) clearTimeout(old); roleTimers.delete(userId)
  const delay = expiresAt - Date.now()
  if (delay <= 0) { void recheckUserRole(userId); return }
  const safeDelay = Math.min(delay, 2147483647)
  roleTimers.set(userId, setTimeout(() => {
    roleTimers.delete(userId)
    if (Date.now() >= expiresAt) void recheckUserRole(userId)
    else scheduleRoleRevoke(userId, expiresAt)
  }, safeDelay))
}
async function recheckUserRole(userId: string) {
  const state = await loadBilling()
  const user = state.users[userId]
  if (!user) return
  syncUserRole(userId, user)
}
function syncUserRole(userId: string, user: BillingUser) {
  const now = Date.now()
  const activeSlots = user.slots.filter(s => !s.free && s.expiresAt > now)
  const old = roleTimers.get(userId); if (old) clearTimeout(old); roleTimers.delete(userId)
  if (activeSlots.length === 0) { void revokeRole(userId); return }
  void grantRole(userId)
  const maxExpiry = Math.max(...activeSlots.map(s => s.expiresAt))
  scheduleRoleRevoke(userId, maxExpiry)
}
async function syncAllUserRoles() {
  const state = await loadBilling()
  for (const [userId, user] of Object.entries(state.users)) {
    syncUserRole(userId, user)
    await new Promise(r => setTimeout(r, 250))
  }
  console.log('Customer roles synced: ' + Object.keys(state.users).length + ' users')
}
function billingUser(state: BillingState, id: string, username: string) { const current=state.users[id]||{username,balance:0,slotLimit:1,disabled:false,tokenNoticeEnabled:true,tokenNoticeIntervalMs:3600000,slots:[]};current.username=username;current.balance=Math.max(0,Number(current.balance)||0);current.slotLimit=Math.max(1,Number(current.slotLimit)||1);current.disabled=Boolean(current.disabled);current.slots=Array.isArray(current.slots)?current.slots:[];state.users[id]=current;return current }
function displaySlotLimit(_x: Session, user: BillingUser) { return user.slots.filter(slot=>!slot.parked).length }
const paymentMin=10000
const cardAmounts=new Set([10000,20000,30000,50000,100000,200000,300000,500000,1000000])
const cardTelcos=new Set(['VIETTEL','VINAPHONE','MOBIFONE','VNMOBI','GARENA2','ZING'])
type CardFee={telco:string;value:number;fees:number;receive:number}
let cardFeeCache:{expires:number;items:CardFee[]}|null=null
const cardFeeRefreshMs=300000
const sepayPollLookbackDays=Math.max(1,Math.min(30,Number(process.env.SEPAY_POLL_LOOKBACK_DAYS)||1))
const sepayQrExpiresMinutes=Math.max(1,Math.min(1440,Number(process.env.SEPAY_QR_EXPIRES_MINUTES)||10))
function sepay(){const bank=String(process.env.SEPAY_BANK_NAME||'').trim().toUpperCase(),account=String(process.env.SEPAY_BANK_ACCOUNT||process.env.SEPAY_ACCOUNT_NUMBER||'').trim(),bin=({MBBANK:'970422',MB:'970422',BIDV:'970418',ACB:'970416',VCB:'970436',VIETCOMBANK:'970436',TECHCOMBANK:'970407',TPBANK:'970423',VPBANK:'970432',OCB:'970448',KLB:'970452'} as Record<string,string>)[bank];if(!bin||!/^[A-Za-z0-9]{1,19}$/.test(account))throw Error('SePay chưa cấu hình ngân hàng.');return {bin,account,name:String(process.env.SEPAY_BANK_ACCOUNT_NAME||'').trim(),token:String(process.env.SEPAY_API_TOKEN||process.env.SEPAY_API_KEY||'').trim()}}
function ready(){try{return Boolean(sepay().token)}catch{return false}}
function card2k(){const partnerId=String(process.env.CARD2K_PARTNER_ID||'').trim(),partnerKey=String(process.env.CARD2K_PARTNER_KEY||'').trim(),callbackUrl=String(process.env.CARD2K_CALLBACK_URL||'').trim();if(!/^https:\/\//.test(callbackUrl))throw Error('Card2K chưa cấu hình callback HTTPS.');if(!partnerId||!partnerKey)throw Error('Card2K chưa cấu hình API.');return {partnerId,partnerKey,callbackUrl}}
function card2kReady(){try{card2k();return true}catch{return false}}
async function card2kFees(force=false){if(!force&&cardFeeCache&&cardFeeCache.expires>Date.now())return cardFeeCache.items;const {partnerId}=card2k(),url=new URL('https://card2k.com/chargingws/v2/getfee');url.searchParams.set('partner_id',partnerId);const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)}),payload=await response.json() as unknown;if(!response.ok||!Array.isArray(payload))throw Error('Không tải được bảng phí Card2K.');const items:CardFee[]=[];for(const row of payload){if(!isObject(row))continue;const providerTelco=String(row.telco||'').trim().toUpperCase(),telco=providerTelco==='VNMB'?'VNMOBI':providerTelco,value=Math.floor(Number(row.value)),fees=Number(row.fees);if(!cardTelcos.has(telco)||!cardAmounts.has(value)||!Number.isFinite(fees)||fees<0||fees>=100)continue;const feeBasis=Math.round(fees*100);items.push({telco,value,fees:feeBasis/100,receive:Math.floor(value*(10000-feeBasis)/10000)})}if(!items.length)throw Error('Bảng phí Card2K không hợp lệ.');items.sort((a,b)=>a.telco.localeCompare(b.telco)||a.value-b.value);cardFeeCache={expires:Date.now()+cardFeeRefreshMs,items};return items}
function md5(value:string){return createHash('md5').update(value).digest('hex')}
function safeHexEqual(left:string,right:string){if(!/^[a-f0-9]{32}$/i.test(left)||!/^[a-f0-9]{32}$/i.test(right))return false;return timingSafeEqual(Buffer.from(left,'hex'),Buffer.from(right,'hex'))}
function cardInput(telco:string,serial:string,code:string){const normalizedTelco=telco.trim().toUpperCase(),normalizedSerial=serial.replace(/\s/g,'').toUpperCase(),normalizedCode=code.replace(/\s/g,'').toUpperCase();if(!cardTelcos.has(normalizedTelco))throw Error('Nhà mạng không hợp lệ.');if(!/^[A-Z0-9]{6,24}$/.test(normalizedSerial)||!/^[A-Z0-9]{6,24}$/.test(normalizedCode))throw Error('Mã thẻ hoặc serial không hợp lệ.');const lengths:Record<string,[number[],number[]]>={VIETTEL:[[15],[14]],VINAPHONE:[[14],[14]],MOBIFONE:[[12],[15]],VNMOBI:[[12],[11,12,13,14,15]],ZING:[[9],[12]]};const expected=lengths[normalizedTelco];if(expected&&(!expected[0].includes(normalizedCode.length)||!expected[1].includes(normalizedSerial.length)))throw Error('Độ dài mã thẻ hoặc serial không hợp lệ.');return {telco:normalizedTelco,serial:normalizedSerial,code:normalizedCode}}
function rawPublicBilling(userId:string,user: BillingUser, price: number,state:BillingState,slotDisplayLimit:number|null=user.slotLimit) { const topups=[...state.payments.filter(item=>item.userId===userId).map(item=>({id:item.id,type:item.purpose==='plan'?'plan':'topup',purpose:item.purpose||'topup',provider:item.provider,invoice:item.invoice,amount:item.amount,status:item.status,createdAt:item.createdAt||item.expiresAt-sepayQrExpiresMinutes*60000,expiresAt:item.expiresAt,qrImage:item.qrImage,planId:item.planId,planVersion:item.planVersion,cardTelco:item.cardTelco,cardSerial:item.cardSerial,declaredAmount:item.declaredAmount,actualValue:item.actualValue,providerMessage:item.providerMessage})),...storage.loadBillingDebits(userId).map(item=>({id:'debit:'+item.id,type:'debit',provider:'internal',invoice:item.detail,amount:-item.amount,status:'debit',createdAt:item.createdAt,expiresAt:item.createdAt,qrImage:''}))].sort((a,b)=>b.createdAt-a.createdAt);return {ownerId:userId,price,plans:Object.values(PLANS),plan:user.plan||null,planVersion:user.plan?.version||0,planNotice:user.plan?reminderDays(user.plan.expiresAt):null,freeClaimed:storage.hasFreeClaim(userId),balance:user.balance,slotLimit:user.slotLimit,tokenNoticeEnabled:user.tokenNoticeEnabled !== false,tokenNoticeIntervalMs:tokenNoticeIntervalMs(user.tokenNoticeIntervalMs),slotDisplayLimit,slots:user.slots.map(slot=>({...slot,folder:slotBound(slot)?slot.folder:null,active:slot.expiresAt>Date.now()})),payments:{sepay:ready(),card2k:card2kReady()},topups} }
async function publicBilling(userId:string,user:BillingUser,price:number,state:BillingState,slotDisplayLimit:number|null=user.slotLimit) {
  const value=rawPublicBilling(userId,user,price,state,slotDisplayLimit)
  value.slots=await Promise.all(user.slots.filter(slot=>!slot.parked).map(async slot=>{
    const root=slotBound(slot)?slotRoot(slot):null
    const activeFolder=Boolean(root&&await stat(root).then(item=>item.isDirectory()).catch(()=>false))
    const archived=!activeFolder&&Boolean(await archivedSlotRoot(slot.id))
    const tokenState=slot.tokenState==='invalid'||archived?'invalid':activeFolder?'active':'none'
    return {...slot,folder:activeFolder?slot.folder:null,tokenState,active:slot.expiresAt>Date.now()}
  }))
  return value
}
async function adminAccounts(state: BillingState) {
  const now=Date.now(),list: {id:string;username:string;avatar:string|null;balance:number;slotLimit:number;disabled:boolean;plan:BillingUser['plan']|null;slots:Record<string,unknown>[]}[]=[]
  for(const [id,user] of Object.entries(state.users)){
    const slots: Record<string,unknown>[]=[]
    for(let index=0;index<user.slots.length;index++){
      const slot=user.slots[index],bound=slotBound(slot),root=bound?slotRoot(slot):null
      const folderExists=Boolean(root&&await stat(root).then(item=>item.isDirectory()).catch(()=>false))
      const archived=!folderExists?await archivedSlotRoot(slot.id):null
      const tokenState=slot.tokenState==='invalid'||archived?'invalid':folderExists?(slot.expiresAt>now?'active':'expired'):'none'
      slots.push({...slot,index,active:slot.expiresAt>now,bound,tokenState})
    }
    const sessionId=sessionByUser.get(id),accountSession=sessionId?sessions.get(sessionId):undefined
    list.push({id,username:user.username,avatar:accountSession&&accountSession.expires>now?accountSession.avatar:null,balance:user.balance,slotLimit:user.slotLimit,disabled:user.disabled,plan:user.plan||null,slots})
  }
  return list.sort((a,b)=>a.username.localeCompare(b.username,'vi'))
}
async function adminBilling(state: BillingState) { return {price:state.price,users:await adminAccounts(state),payments:state.payments.slice(-100).map(item=>({id:item.id,userId:item.userId,provider:item.provider,orderCode:item.orderCode,invoice:item.invoice,amount:item.amount,status:item.status,createdAt:item.createdAt??null,expiresAt:item.expiresAt,reference:item.reference??null,paidAt:item.paidAt??null})),logs:storage.loadAdminLogs(30)} }
function validTimestamp(value: unknown): value is number { return typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=8640000000000000 }
const reconcileLocks=new Map<string,Promise<BillingState>>()
function reconcile(userId:string){const running=reconcileLocks.get(userId);if(running)return running;const task=runReconcile(userId).finally(()=>{if(reconcileLocks.get(userId)===task)reconcileLocks.delete(userId)});reconcileLocks.set(userId,task);return task}
async function runReconcile(userId:string){const state=await loadBilling(),now=Date.now();for(const item of state.payments.filter(x=>x.userId===userId&&x.status==='pending'&&x.expiresAt<=now))item.status='expired';for(const item of state.payments.filter(x=>x.userId===userId&&x.provider==='sepay'&&x.expiresAt>now&&(x.status==='pending'||(x.status==='expired'&&x.providerMessage==='Đã hủy bởi người dùng.')))){try{const x=sepay(),u=new URL('https://my.sepay.vn/userapi/transactions/list');u.searchParams.set('account_number',x.account);u.searchParams.set('transaction_date_min',new Date(now-sepayPollLookbackDays*86400000).toISOString().slice(0,10));const r=await fetch(u,{headers:{Authorization:'Bearer '+x.token},signal:AbortSignal.timeout(5000)}),v=await r.json() as any,tx=v?.transactions?.find((t:any)=>Number(t.amount_in)===item.amount&&[t.transaction_content,t.content,t.description,t.code].some(c=>String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'').includes(item.invoice)));if(tx){const reference=String(tx.id||tx.reference_number||'');const settled=storage.settleSepayPayment(item.id,reference,now);if(settled.changed){billingCache=storage.loadBilling();queueWebEvent('billing-status');if(settled.planApplied){void syncPlanLicenses(userId).catch(error=>console.error('Direct plan license sync pending:',error instanceof Error?error.message:String(error)));syncUserRole(userId,billingCache.users[userId]);void adminNotify('💳 '+(settled.username||userId)+' mua '+item.amount+'đ · GD '+item.invoice)}else void adminNotify('💰 '+(settled.username||userId)+' nạp '+item.amount+'đ · GD '+item.invoice)}else if(settled.reviewRequired)void adminNotify('⚠️ Giao dịch gói '+item.invoice+' cần quản trị viên kiểm tra: '+(settled.providerMessage||'gói đã thay đổi')+'.')}}catch{}}await saveBilling(state,undefined,false);const fresh=storage.loadBilling();billingCache=fresh;return fresh}
async function applyCardResult(payload:Record<string,unknown>,verifyCallback:boolean){const requestId=String(payload.request_id||'').trim(),serial=String(payload.serial||'').replace(/\s/g,'').toUpperCase(),telco=String(payload.telco||'').trim().toUpperCase(),status=Number(payload.status),message=String(payload.message||'').slice(0,240),reference=String(payload.trans_id||'').slice(0,80),amount=Math.floor(Number(payload.amount)),actualValue=Math.floor(Number(payload.value||payload.card_value||payload.declared_value));if(!requestId||!Number.isInteger(status))throw Error('Callback không hợp lệ.');const payment=(await loadBilling()).payments.find(item=>item.id===requestId&&item.provider==='card2k');if(!payment)throw Error('Không tìm thấy giao dịch.');if(verifyCallback){const callbackSign=String(payload.callback_sign||'');if(!payment.callbackSign||!safeHexEqual(callbackSign,payment.callbackSign))throw Error('Chữ ký callback không hợp lệ.');if(payment.cardTelco!==telco||!payment.cardSerial?.endsWith(serial.slice(-4)))throw Error('Thông tin thẻ không khớp.')}if(status===99)return {changed:false,pending:true};const paid=status===1||status===2;if(paid&&(!Number.isSafeInteger(amount)||amount<=0))throw Error('Số tiền thực nhận không hợp lệ.');const result=storage.settleCardPayment(requestId,paid?'paid':'failed',paid?amount:0,Number.isSafeInteger(actualValue)&&actualValue>0?actualValue:payment.declaredAmount||0,reference,status,message);if(result.changed){billingCache=null;queueWebEvent('billing-status');if(paid)void adminNotify('💰 '+(result.username||result.userId)+' nạp thẻ '+amount+'đ · GD '+payment.invoice)}return {...result,pending:false}}

const WEB_ASSET_DIR = process.env.WEB_ASSET_DIR || join(process.cwd(), 'src', 'web')
const webReloadClients = new Set<ServerResponse>()
const pendingWebReloads = new Set<string>()
let webReloadTimer: ReturnType<typeof setTimeout>|undefined
function queueWebEvent(file: string) {
  pendingWebReloads.add(file)
  clearTimeout(webReloadTimer)
  webReloadTimer=setTimeout(()=>{
    const files=[...pendingWebReloads];pendingWebReloads.clear()
    for(const client of webReloadClients){
      if(client.destroyed){webReloadClients.delete(client);continue}
      for(const changed of files)client.write('data: '+changed.replace(/[\r\n]/g,'')+'\n\n')
    }
  },80)
}
async function syncCard2kFees(){if(!card2kReady())return;const previous=cardFeeCache?.items||null,next=await card2kFees(true);if(previous&&JSON.stringify(previous)!==JSON.stringify(next))queueWebEvent('card-fees')}
setInterval(()=>void syncCard2kFees().catch(error=>console.error('Card fee refresh failed:',error instanceof Error?error.message:String(error))),cardFeeRefreshMs).unref()
watch(WEB_ASSET_DIR,{persistent:false},(_event,fileName)=>{
  const file=String(fileName||'reload')
  if(file!=='reload'&&!/\.(html|css|js)$/i.test(file))return
  queueWebEvent(file)
}).on('error',error=>console.error('Web live reload watch failed:',error.message))
for(const root of [MULTI_CONFIG_DIR,DISABLED_CONFIG_DIR]){
  watch(root,{recursive:true,persistent:false},(_event,fileName)=>{
    const file=basename(String(fileName||''))
    if(file==='voicepool-status.json')queueWebEvent('voicepool-status')
    if(file==='chatpool-status.json')queueWebEvent('chatpool-status')
    if(file==='owo-status.json')queueWebEvent('owo-status')
  }).on('error',error=>console.error('Token pool status watch failed:',error.message))
}
watch(STREAM_CONFIG_DIR,{recursive:true,persistent:false},(_event,fileName)=>{if(basename(String(fileName||''))==='stream-error.txt')queueWebEvent('stream-status')}).on('error',error=>console.error('Stream status watch failed:',error.message))
function mobilePageRequest(req: IncomingMessage, url: URL) {
  const forced=url.searchParams.get('layout')
  if(forced==='mobile')return true
  if(forced==='desktop')return false
  const hint=String(req.headers['sec-ch-ua-mobile']||'')
  if(hint==='?1')return true
  if(hint==='?0')return false
  const viewport=Number(req.headers['viewport-width']||req.headers['sec-ch-viewport-width']||0)
  if(Number.isFinite(viewport)&&viewport>0)return viewport<=1200
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(String(req.headers['user-agent']||''))
}

async function dashboardPage(file: 'mobile.html'|'desktop.html') {
  const css=file==='mobile.html'?'mobile.css':'desktop.css'
  let html=await readFile(join(WEB_ASSET_DIR,file),'utf8')
  for(const asset of [css,'mention-log.js','dashboard-boneyard.js','app.js']){
    const version=Math.trunc((await stat(join(WEB_ASSET_DIR,asset))).mtimeMs).toString(36)
    html=html.replace('/'+asset,'/'+asset+'?v='+version)
  }
  return html
}

const previewCompass=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
async function previewValues(city: string) {
  const key=city.trim().toLowerCase(); const cached=previewCache.get(key); if(cached&&cached.expires>Date.now())return cached.values
  const geo=await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name='+encodeURIComponent(city),{signal:AbortSignal.timeout(8000)}).then(r=>r.json()).catch(()=>null) as {results?:{latitude:number;longitude:number;admin1?:string;country?:string}[]}|null
  const point=geo?.results?.[0]
  const value=(x:unknown)=>x===undefined||x===null||x===''?'N/A':String(x)
  const num=(x:unknown)=>{const n=Number(x);return Number.isFinite(n)?n:null}
  const round=(n:number)=>Math.round(n*10)/10
  const f=(c:number|null)=>c===null?'N/A':value(round(c*9/5+32))
  const compass=(deg:number|null)=>deg===null?'N/A':previewCompass[Math.round(deg/22.5)%16]
  let values:Record<string,string>
  if(point){
    const params=new URLSearchParams({latitude:String(point.latitude),longitude:String(point.longitude),timezone:'auto',current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m,visibility,uv_index'})
    const fc=await fetch('https://api.open-meteo.com/v1/forecast?'+params,{signal:AbortSignal.timeout(8000)}).then(r=>r.json()) as any
    const cur=fc.current||{}
    const tempC=num(cur.temperature_2m), feelslikeC=num(cur.apparent_temperature), windKph=num(cur.wind_speed_10m), gustKph=num(cur.wind_gusts_10m), pressureMb=num(cur.pressure_msl), precipMm=num(cur.precipitation), dewpointC=num(cur.dew_point_2m), visM=num(cur.visibility), windDeg=num(cur.wind_direction_10m)
    // Open-Meteo exposes no separate windchill/heatindex; apparent_temperature already blends both, so reuse it for those placeholders.
    values={city,region:point.admin1||city,country:point.country||'N/A',tempC:value(tempC),tempF:f(tempC),windKph:value(windKph),windMph:windKph===null?'N/A':value(round(windKph*0.621371)),windDegree:value(windDeg),windDir:compass(windDeg),pressureMb:value(pressureMb),pressureIn:pressureMb===null?'N/A':value(round(pressureMb*0.02953)),precipMm:value(precipMm),precipIn:precipMm===null?'N/A':value(round(precipMm*0.0393701)),gustKph:value(gustKph),gustMph:gustKph===null?'N/A':value(round(gustKph*0.621371)),feelslikeC:value(feelslikeC),feelslikeF:f(feelslikeC),windchillC:value(feelslikeC),windchillF:f(feelslikeC),heatindexC:value(feelslikeC),heatindexF:f(feelslikeC),dewpointC:value(dewpointC),dewpointF:f(dewpointC),visKm:visM===null?'N/A':value(round(visM/1000)),visMi:visM===null?'N/A':value(round(visM/1609.34)),humidity:value(num(cur.relative_humidity_2m)),cloud:value(num(cur.cloud_cover)),uv:value(num(cur.uv_index)),co:'N/A',no2:'N/A',o3:'N/A',so2:'N/A',pm25:'N/A',pm10:'N/A'}
  }else{
    values={city,region:city,country:'N/A',tempC:'N/A',tempF:'N/A',windKph:'N/A',windMph:'N/A',windDegree:'N/A',windDir:'N/A',pressureMb:'N/A',pressureIn:'N/A',precipMm:'N/A',precipIn:'N/A',gustKph:'N/A',gustMph:'N/A',feelslikeC:'N/A',feelslikeF:'N/A',windchillC:'N/A',windchillF:'N/A',heatindexC:'N/A',heatindexF:'N/A',dewpointC:'N/A',dewpointF:'N/A',visKm:'N/A',visMi:'N/A',humidity:'N/A',cloud:'N/A',uv:'N/A',co:'N/A',no2:'N/A',o3:'N/A',so2:'N/A',pm25:'N/A',pm10:'N/A'}
  }
  if(point){const air=await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?current=carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide,pm10,pm2_5&latitude='+point.latitude+'&longitude='+point.longitude,{signal:AbortSignal.timeout(8000)}).then(r=>r.json()).catch(()=>null) as any;const currentAir=air?.current||{};Object.assign(values,{co:value(currentAir.carbon_monoxide),no2:value(currentAir.nitrogen_dioxide),o3:value(currentAir.ozone),so2:value(currentAir.sulphur_dioxide),pm25:value(currentAir.pm2_5),pm10:value(currentAir.pm10)})}
  previewCache.set(key,{expires:Date.now()+600000,values});return values
}
let showcaseCache: {expires:number; value:unknown}|null=null
async function loadShowcase() {
  const now=Date.now()
  if(showcaseCache&&showcaseCache.expires>now)return showcaseCache.value
  const showcaseFolder=(await identityFolders(MULTI_CONFIG_DIR,ADMIN_USER_ID,'active'))[0]?.folder
  const root=showcaseFolder?join(MULTI_CONFIG_DIR,showcaseFolder):MULTI_CONFIG_DIR
  const rawConfig=await readFile(join(root,'scene.json'),'utf8').then(JSON.parse).catch(()=>({})) as any
  const identity=await readFile(join(root,'identity.json'),'utf8').then(JSON.parse).catch(()=>({})) as {userId?:string}
  const token=await readFile(join(root,'token.json'),'utf8').then(readStoredToken).catch(()=> '')
  const userId=identity.userId||''
  let profile:unknown=null
  if(userId&&token){
    const me=await fetch(`https://discord.com/api/v10/users/@me`,{headers:{Authorization:token},signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null).catch(()=>null) as any
    const full=await fetch(`https://discord.com/api/v10/users/${userId}/profile?with_mutual_guilds=false`,{headers:{Authorization:token},signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null).catch(()=>null) as any
    if(me){
      const skuIds=[full?.user_profile?.profile_effect?.sku_id,...(Array.isArray(full?.user_profile?.collectibles)?full.user_profile.collectibles.filter((item:any)=>item?.type===3).map((item:any)=>item.sku_id):[])].filter((id):id is string=>typeof id==='string')
      const listings=new Map<string,any>()
      await Promise.all(skuIds.map(async skuId=>{
        const listing=await fetch(`https://discord.com/api/v10/store/published-listings/skus/${skuId}`,{headers:{Authorization:token},signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null).catch(()=>null) as any
        const item=listing?.sku?.tenant_metadata?.collectibles?.item
        if(item)listings.set(skuId,{item})
      }))
      const collectibles=profileCollectibles(full,listings)
      const clanInfo=full?.user?.clan
      profile={
        id:userId,
        username:me.username,
        globalName:me.global_name||me.username,
        avatarUrl:me.avatar?`https://cdn.discordapp.com/avatars/${userId}/${me.avatar}.${String(me.avatar).startsWith('a_')?'gif':'png'}?size=128`:null,
        bannerUrl:me.banner?`https://cdn.discordapp.com/banners/${userId}/${me.banner}.${String(me.banner).startsWith('a_')?'gif':'png'}?size=480`:null,
        decorationUrl:me.avatar_decoration_data?.asset?`https://cdn.discordapp.com/avatar-decoration-presets/${me.avatar_decoration_data.asset}.png?size=160`:null,
        ...collectibles,
        clan:clanInfo?{tag:clanInfo.tag,badgeUrl:`https://cdn.discordapp.com/clan-badges/${clanInfo.identity_guild_id}/${clanInfo.badge}.png?size=16`}:null,
        badges:Array.isArray(full?.badges)?full.badges.map((b:any)=>({iconUrl:`https://cdn.discordapp.com/badge-icons/${b.icon}.png?size=24`,description:String(b.description||'')})):[]
      }
    }
  }
  const scenes=Array.isArray(rawConfig?.configs)&&rawConfig.configs.length?rawConfig.configs:(rawConfig?.setup||rawConfig?.config?[{setup:rawConfig.setup||{},config:rawConfig.config||{}}]:[])
  const city=scenes.map((s:any)=>s?.setup?.city).find((c:unknown)=>typeof c==='string'&&c)||''
  const weather=city?await previewValues(city).catch(()=>null):null
  const value={scenes,profile,weather}
  showcaseCache={expires:now+(profile?300000:0),value}
  return value
}
function mediaType(file: string) { return file.endsWith('.png') ? 'image/png' : file.endsWith('.gif') ? 'image/gif' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }
function ck(req: IncomingMessage, n: string) { for (const p of (req.headers.cookie || '').split(';')) { const x=p.trim().split('='); if(x[0]===n)return decodeURIComponent(x.slice(1).join('=')) } }
function out(res: ServerResponse, code: number, body: unknown) { res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body)) }
const owoCashRequests = new Set<string>()
async function waitOwoCash(path: string, id: string) {
  const until = Date.now() + 15_000
  while (Date.now() < until) {
    const result = await readFile(path, 'utf8').then(JSON.parse).catch(() => null) as { id?: unknown; cash?: unknown; error?: unknown } | null
    if (result?.id === id) {
      if (Number.isSafeInteger(result.cash) && Number(result.cash) >= 0) return { cash: Number(result.cash) }
      if (typeof result.error === 'string') return { error: result.error }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return { error: 'OwO chưa trả số dư.' }
}
function set(res: ServerResponse,n:string,v:string,age:number){res.setHeader('set-cookie',n+'='+encodeURIComponent(v)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(REDIRECT_URI.startsWith('https://')?'; Secure':''))}
function folderName(username: string) { return username.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 48) || 'user' }
function validFolderPath(value: string) { const parts=value.split('/'); return parts.length===2 && parts.every(part=>folderName(part)===part) }
async function configFolders(base: string) { const result:string[]=[]; for(const owner of await readdir(base,{withFileTypes:true}).catch(()=>[])){if(!owner.isDirectory()||folderName(owner.name)!==owner.name)continue;for(const token of await readdir(join(base,owner.name),{withFileTypes:true}).catch(()=>[]))if(token.isDirectory()&&token.name!=='media'&&folderName(token.name)===token.name)result.push(owner.name+'/'+token.name)} return result }
function configFolder(ownerId: string, slotId: string) { return folderName('slot-'+ownerId.slice(-8)+'-'+slotId) }
function ownerMediaRoot(owner:{username:string}) { return join(MEDIA_ROOT_DIR, folderName(owner.username)) }
function slotBound(slot: BillingSlot) { return Boolean(slot.tokenUserId || slot.tokenUsername) }
function slotLabel(user: BillingUser,slot: BillingSlot) { return 'SLOT '+(user.slots.indexOf(slot)+1) }
function streamRoot(ownerId:string){return join(STREAM_CONFIG_DIR,ownerId)}
function activeSlotCount(user:BillingUser){return user.disabled?0:user.slots.filter(slot=>!slot.free&&slot.expiresAt>Date.now()).length}
async function streamPublic(ownerId:string,user:BillingUser){
  const root=streamRoot(ownerId),configText=await readFile(join(root,'stream.json'),'utf8').catch(()=>''),configSet=Boolean(configText)
  const tokenSet=Boolean(await stat(join(root,'token.json')).then(item=>item.isFile()).catch(()=>false)),disabled=Boolean(await stat(join(root,'stream.disabled')).then(item=>item.isFile()).catch(()=>false))
  const error=await readFile(join(root,'stream-error.txt'),'utf8').catch(()=>''),identityText=await readFile(join(root,'identity.json'),'utf8').catch(()=>'');let tokenUsername='';try{const identity=JSON.parse(identityText) as {username?:unknown};if(typeof identity.username==='string')tokenUsername=identity.username}catch{}
  let prefix='n!';try{const value=JSON.parse(configText) as {prefix?:unknown};if(typeof value.prefix==='string'&&/^\S{1,32}$/.test(value.prefix))prefix=value.prefix}catch{}
  return {ownerId,controllerUsername:user.username,prefix,tokenUsername,activeSlots:activeSlotCount(user),allowed:activeSlotCount(user)>0,configured:configSet&&tokenSet,disabled,tokenSet,error:error.trim().slice(0,220)}
}
function slotRoot(slot: BillingSlot) {
  if(!slotBound(slot))return null
  if(!slot.folder||!validFolderPath(slot.folder))return null
  return join(MULTI_CONFIG_DIR,slot.folder)
}
async function slotTokenValid(slot: BillingSlot) {
  const root=slotRoot(slot); if(!root)return false
  const raw=await readFile(join(root,'token.json'),'utf8').catch(()=>null); if(!raw)return false
  let token=''; try { token=readStoredToken(raw) } catch { return false }
  if(!token)return false
  const response=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:token},signal:AbortSignal.timeout(8000)}).catch(()=>null)
  return Boolean(response?.ok)
}
async function adminConfigUsers(state: BillingState) {
  const users=new Map<string,AdminConfigUser>()
  for(const username of await userNames())users.set('active:'+username,{ownerId:'',username,displayName:username,location:'active',slots:[]})
  for(const [ownerId,user] of Object.entries(state.users)){
    const slots:(BillingSlot&{active:boolean})[]=[]
    for(const slot of user.slots.filter(slotBound)){
      const root=slotRoot(slot)
      if(!root||!(await stat(root).then(item=>item.isDirectory()).catch(()=>false)))continue
      slots.push({...slot,active:slot.expiresAt>Date.now()})
    }
    if(slots.length)users.set('active:'+user.username,{ownerId,username:user.username,displayName:user.username,location:'active',slots})
  }
  const disabledUsers=new Map<string,{entry:string;root:string;identity:StoredIdentity|null;license:{ownerId?:string;slotId?:string}|null;modified:number}>()
  for(const entry of await configFolders(DISABLED_CONFIG_DIR)){
    const root=join(DISABLED_CONFIG_DIR,entry),identity=await storedIdentity(root)
    const license=await readFile(join(root,'license.json'),'utf8').then(JSON.parse).catch(()=>null) as {ownerId?:string;slotId?:string}|null
    const key=typeof license?.slotId==='string'?'slot:'+license.slotId:identity?.userId?'identity:'+identity.userId:'folder:'+entry
    const modified=await stat(root).then(item=>item.mtimeMs).catch(()=>0),previous=disabledUsers.get(key)
    if(!previous||modified>previous.modified)disabledUsers.set(key,{entry:entry,root,identity,license,modified})
  }
  for(const {entry,identity,license} of disabledUsers.values()){
    let bindOwnerId='',slot:BillingSlot|undefined
    if(typeof license?.slotId==='string')for(const [ownerId,user] of Object.entries(state.users)){const found=user.slots.find(item=>item.id===license.slotId&&!slotBound(item));if(found){bindOwnerId=ownerId;slot=found;break}}
    if(!slot&&identity){const candidates=state.users[identity.userId]?.slots.filter(item=>!slotBound(item))||[];if(candidates.length===1){bindOwnerId=identity.userId;slot=candidates[0]}}
    users.set('disabled:'+entry,{ownerId:'',username:entry,displayName:identity?.username||entry,location:'disabled',slots:[],...(slot?{bindOwnerId,bindSlotId:slot.id,slotActive:slot.expiresAt>Date.now()}:{})})
  }
  return [...users.values()].sort((a,b)=>a.displayName.localeCompare(b.displayName,'vi')||a.location.localeCompare(b.location))
}
function billingOwner(state: BillingState, x: Session, requestedOwnerId = '') {
  const ownerId=requestedOwnerId||x.id;if(ownerId!==x.id&&!admin(x))return null
  const owner=ownerId===x.id?billingUser(state,x.id,x.username):state.users[ownerId];if(owner&&owner.disabled&&!admin(x))return null;return owner?{ownerId,owner}:null
}
function billingMutationOwner(state: BillingState, x: Session, requestedOwnerId = '') {
  if(admin(x)&&!requestedOwnerId)return null
  return billingOwner(state,x,requestedOwnerId)
}
async function adminNotify(content: string) { if (!WEBHOOK_URL) return false; const response=await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Billing Alert', content }) }).catch(() => null);if(!response?.ok)console.error('Billing webhook failed:',response?.status||'network');return Boolean(response?.ok) }
async function tokenNotify(content:string){if(!WEBHOOK_URL)return false;const response=await fetch(WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'Token Alert',content}),signal:AbortSignal.timeout(10000)}).catch(()=>null);if(!response?.ok)console.error('Token webhook failed:',response?.status||'network');return Boolean(response?.ok)}
async function storedIdentity(root: string): Promise<StoredIdentity|null> {
  const value=await readFile(join(root,IDENTITY_FILE),'utf8').then(JSON.parse).catch(()=>null) as unknown
  if(!isObject(value)||typeof value.userId!=='string'||!value.userId)return null
  return {userId:value.userId,username:typeof value.username==='string'?value.username:''}
}
async function writeIdentity(root: string,userId: string,username: string) {
  await writeFile(join(root,IDENTITY_FILE),JSON.stringify({userId,username},null,2)+'\n',{mode:0o600})
}
async function archivedSlotRoot(slotId: string) {
  const entries = await configFolders(DISABLED_CONFIG_DIR)
  const matches:{root:string;modified:number}[]=[]
  for(const entry of entries){
    const root=join(DISABLED_CONFIG_DIR,entry),license=await readFile(join(root,'license.json'),'utf8').then(JSON.parse).catch(()=>null) as unknown
    if(isObject(license)&&license.slotId===slotId)matches.push({root,modified:await stat(root).then(item=>item.mtimeMs).catch(()=>0)})
  }
  return matches.sort((left,right)=>right.modified-left.modified)[0]?.root||null
}
async function identityFolders(base: string,userId: string,location: 'active'|'disabled') {
  const entries=await configFolders(base),matches:IdentityFolder[]=[]
  for(const entry of entries){const root=join(base,entry),identity=await storedIdentity(root);if(identity?.userId===userId)matches.push({folder:entry,root,location})}
  return matches
}
async function availableFolder(base: string,preferred: string,userId: string) {
  const safe=folderName(preferred)
  if(!(await stat(join(base,safe)).catch(()=>null)))return safe
  for(let index=0;index<100;index++){const suffix='-'+userId.slice(-8)+(index?'-'+index:'');const candidate=folderName(safe.slice(0,Math.max(1,48-suffix.length))+suffix);if(!(await stat(join(base,candidate)).catch(()=>null)))return candidate}
  throw new Error('Không thể tạo thư mục config.')
}
async function cleanupEmptyDir(root: string) { const entries=await readdir(root).catch(()=>null);if(entries?.length===0)await rm(root,{recursive:true,force:true}).catch(()=>{}) }
async function restoreText(path: string,value: string|null) { if(value===null)await rm(path,{force:true});else await writeFile(path,value,{mode:0o600}) }
function session(req: IncomingMessage) { const id=ck(req,'web_session')||'', value=sessions.get(id); if(!value||value.expires<=Date.now()){if(id){sessions.delete(id);sessionByUser.forEach((s,u)=>{if(s===id)sessionByUser.delete(u)});void storage.deleteSession(id)}return} return value }
function admin(x:Session|undefined){return x?.id===ADMIN_USER_ID&&x.mode!=='user'}
function canSwitch(x:Session|undefined){return x?.id===ADMIN_USER_ID}
function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value)&&typeof value==='object'&&!Array.isArray(value) }
function tokenInput(value: unknown) { const token=typeof value==='string'?value.trim():'';return token.startsWith('"')&&token.endsWith('"')?token.slice(1,-1).trim():token }
function valid(file: ConfigFile, data: unknown) {
  if(!isObject(data)) return false
  if(file==='config') return (isObject(data.setup)&&isObject(data.config)) || (Array.isArray(data.configs)&&data.configs.length>0&&data.configs.every(s=>isObject(s)&&isObject(s.setup)&&isObject(s.config)))
  if(file==='voice') return typeof data.Guild==='string'&&typeof data.Channel==='string'&&typeof data.RefreshMs==='number'
  if(file==='voicepool') return Array.isArray(data.Tokens)&&typeof data.Guild==='string'&&typeof data.Channel==='string'&&typeof data.RefreshMs==='number'
  const noImage=!('image' in data)
  if(file==='chat') return (noImage||typeof data.image==='string'&&/^media\/[\w.-]+\.(?:png|jpe?g|gif|webp)$/i.test(data.image))&&typeof data.guildId==='string'&&typeof data.channelId==='string'&&typeof data.delaySeconds==='number'&&(data.mode==='text-war'?typeof data.targetUserId==='string'&&/^\d{17,20}$/.test(data.targetUserId):Array.isArray(data.texts))
  if(file==='chatpool') return (noImage||typeof data.image==='string'&&/^media\/[\w.-]+\.(?:png|jpe?g|gif|webp)$/i.test(data.image))&&Array.isArray(data.Tokens)&&typeof data.guildId==='string'&&typeof data.channelId==='string'&&typeof data.delaySeconds==='number'&&(data.mode==='text-war'?typeof data.targetUserId==='string'&&/^\d{17,20}$/.test(data.targetUserId):Array.isArray(data.texts))
  if(file==='status') return isValidStatusConfig(data)
  if(file==='mention') return typeof data.replyText==='string'&&data.replyText.trim().length>0&&data.replyText.length<=2000&&(!('dmEnabled' in data)||typeof data.dmEnabled==='boolean')&&(!('historyEnabled' in data)||typeof data.historyEnabled==='boolean')
  return false
}
function maskToken(token: string) { return token.length>10?token.slice(0,6)+'…'+token.slice(-4):'••••' }
type DiscordDirectoryMode = 'chat'|'voice'
type DiscordDirectory = { guilds: { id:string; name:string; icon:string|null; channels: {id:string;name:string;type:number;parentId:string|null}[] }[] }
const discordDirectoryPending = new Map<string, Promise<DiscordDirectory>>()
const discordDirectoryCache = new Map<string, { expires:number; stale:number; value:DiscordDirectory }>()
async function discordGet(url:string,headers:{Authorization:string}) {
  let response:Response|null=null
  for(let attempt=0;attempt<2;attempt++){
    response=await fetch(url,{headers,signal:AbortSignal.timeout(8000)}).catch(()=>null)
    if(response?.ok||(response&&response.status!==429&&response.status<500))return response
    if(!attempt)await new Promise(resolve=>setTimeout(resolve,Math.min(Math.max(Number(response?.headers.get('retry-after'))*1000||350,350),3000)))
  }
  return response
}
async function discordDirectory(token: string, mode: DiscordDirectoryMode, onlyGuildId = ''): Promise<DiscordDirectory> {
  const key=createHash('sha256').update(token).digest('hex')+':'+mode+':'+onlyGuildId,cached=discordDirectoryCache.get(key),pending=discordDirectoryPending.get(key)
  if(cached&&cached.expires>Date.now())return cached.value
  if(pending)return pending
  const request=fetchDiscordDirectory(token,mode,onlyGuildId).then(value=>{discordDirectoryCache.set(key,{expires:Date.now()+60_000,stale:Date.now()+600_000,value});return value}).catch(error=>{
    if(cached&&cached.stale>Date.now())return cached.value
    throw error
  })
  discordDirectoryPending.set(key,request)
  request.finally(()=>{if(discordDirectoryPending.get(key)===request)discordDirectoryPending.delete(key)}).catch(()=>undefined)
  return request
}
async function fetchDiscordDirectory(token: string, mode: DiscordDirectoryMode, onlyGuildId = ''): Promise<DiscordDirectory> {
  const headers={Authorization:token}
  const cacheKey=createHash('sha256').update(token).digest('hex'), cached=discordMeGuildsCache.get(cacheKey)
  let me: {id?:unknown}|null, guilds: unknown
  if(cached&&cached.expires>Date.now()){ me=cached.me; guilds=cached.guilds }
  else {
    const [meRes,guildsRes]=await Promise.all([
      discordGet('https://discord.com/api/v10/users/@me',headers),
      discordGet('https://discord.com/api/v10/users/@me/guilds',headers)
    ])
    if(!meRes?.ok||!guildsRes?.ok)throw Error('Token sai hoặc đã hết hiệu lực.')
    me=await meRes.json().catch(()=>null) as {id?:unknown}|null
    guilds=await guildsRes.json().catch(()=>null) as unknown
    if(typeof me?.id!=='string'||!Array.isArray(guilds))throw Error('Không đọc được danh sách guild của token.')
    discordMeGuildsCache.set(cacheKey,{expires:Date.now()+15_000,me,guilds})
  }
  if(typeof me?.id!=='string'||!Array.isArray(guilds))throw Error('Không đọc được danh sách guild của token.')
  const userId=me.id
  const selected=guilds.flatMap(guild=>isObject(guild)&&typeof guild.id==='string'&&(!onlyGuildId||guild.id===onlyGuildId)?[{id:guild.id,name:typeof guild.name==='string'&&guild.name?guild.name:guild.id,icon:typeof guild.icon==='string'&&guild.icon?`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=64`:null,permissions:typeof guild.permissions_new==='string'?guild.permissions_new:typeof guild.permissions==='string'?guild.permissions:'0',owner:guild.owner===true}]:[])
  if(!onlyGuildId)return {guilds:selected.map(guild=>({id:guild.id,name:guild.name,icon:guild.icon,channels:[]})).sort((left,right)=>left.name.localeCompare(right.name,'vi')||left.id.localeCompare(right.id))}
  const result=await Promise.all(selected.map(async guild=>{
    const [channelsRes,memberRes]=await Promise.all([
      discordGet(`https://discord.com/api/v10/guilds/${guild.id}/channels`,headers),
      discordGet(`https://discord.com/api/v10/users/@me/guilds/${guild.id}/member`,headers)
    ])
    const channels=channelsRes?.ok?await channelsRes.json().catch(()=>null):null
    const member=memberRes?.ok?await memberRes.json().catch(()=>null) as {roles?:unknown}|null:null
    const accessible=listAccessibleDiscordChannels({
      mode,guildId:guild.id,userId,guildPermissions:guild.permissions,
      memberRoleIds:Array.isArray(member?.roles)?member.roles.filter((id):id is string=>typeof id==='string'):[],channels:Array.isArray(channels)?channels:[],isGuildOwner:guild.owner===true
    })
    return {id:guild.id,name:guild.name,icon:guild.icon,channels:accessible}
  }))
  return {guilds:result.sort((left,right)=>left.name.localeCompare(right.name,'vi')||left.id.localeCompare(right.id))}
}
async function verifyGuildAndChannel(token: string, guildId: string, channelId: string, mode?: DiscordDirectoryMode): Promise<{ok:true}|{ok:false,reason:string}> {
  if(!mode){
    const [guildRes,channelRes]=await Promise.all([
      fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,{headers:{Authorization:token},signal:AbortSignal.timeout(8000)}).catch(()=>null),
      fetch(`https://discord.com/api/v10/channels/${channelId}`,{headers:{Authorization:token},signal:AbortSignal.timeout(8000)}).catch(()=>null)
    ])
    if(!guildRes?.ok)return {ok:false,reason:'Token chưa tham gia guild này hoặc guild không tồn tại.'}
    const channel=await channelRes?.json().catch(()=>null) as {guild_id?:string}|null
    if(!channelRes?.ok||!channel)return {ok:false,reason:'Channel không tồn tại.'}
    return channel.guild_id===guildId?{ok:true}:{ok:false,reason:'Channel không thuộc guild đã nhập.'}
  }
  try {
    const directory=await discordDirectory(token,mode,guildId),guild=directory.guilds[0]
    if(!guild)return {ok:false,reason:'Token chưa tham gia guild này hoặc guild không tồn tại.'}
    if(!guild.channels.some(channel=>channel.id===channelId))return {ok:false,reason:'Token không có quyền dùng channel này.'}
    return {ok:true}
  } catch(error) { return {ok:false,reason:error instanceof Error?error.message:'Không thể xác minh guild/channel.'} }
}
async function readSingleToken(root:string) { const raw=await readFile(join(root,'token.json'),'utf8').catch(()=>null);if(!raw)return null;try{return readStoredToken(raw)||null}catch{return null} }
async function refreshConfigPremiumType(token:string,key:string) {
  const response=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:token},signal:AbortSignal.timeout(8000)}).catch(()=>null)
  const profile=await response?.json().catch(()=>null) as unknown
  const raw=isObject(profile)?profile.premium_type:undefined
  const premiumType=response?.ok&&Number.isInteger(raw)&&Number(raw)>=0?Number(raw):null
  tokenPremiumCache.set(key,{expires:Date.now()+(premiumType===null?30_000:300_000),premiumType})
  queueWebEvent('premium')
}
async function configPremiumType(root:string) {
  const token=await readSingleToken(root);if(!token)return null
  const key=createHash('sha256').update(token).digest('hex'),cached=tokenPremiumCache.get(key)
  if(cached&&cached.expires>Date.now())return cached.premiumType
  tokenPremiumCache.set(key,{expires:Date.now()+30_000,premiumType:null})
  void refreshConfigPremiumType(token,key)
  return null
}
function isUnicodeEmoji(value:unknown) {
  if(typeof value!=='string')return false
  const input=value.trim();if(!input)return false
  const Segmenter=(Intl as unknown as {Segmenter?:new(locales?:string|string[],options?:{granularity:string})=>{segment(input:string):Iterable<{segment:string}>}}).Segmenter
  if(!Segmenter)return false
  const segments=[...new Segmenter(undefined,{granularity:'grapheme'}).segment(input)]
  return segments.length===1&&segments[0].segment===input&&/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3)/u.test(input)
}
function activeStatusEmojiEntries(data:Record<string,unknown>) {
  if(Array.isArray(data.statuses)&&data.emojiMode==='per-status')return data.statuses.filter(isObject)
  return [data]
}
function statusEmojiAccessError(data:Record<string,unknown>,premiumType:number|null) {
  for(const entry of activeStatusEmojiEntries(data)){
    const name=entry.emojiName,id=entry.emojiId
    if((name===undefined||name==='')&&(id===undefined||id===''))continue
    if(typeof id==='string'&&id){
      if(!(premiumType!==null&&premiumType>0))return premiumType===0?'Tài khoản không có Nitro chỉ dùng được một emoji Unicode.':'Chưa xác định được Nitro của token; chỉ dùng được một emoji Unicode.'
      continue
    }
    if(!isUnicodeEmoji(name))return premiumType===0?'Tài khoản không có Nitro chỉ dùng được một emoji Unicode.':'Emoji phải là một emoji Unicode hoặc custom emoji hợp lệ.'
  }
  return ''
}
async function body(req: IncomingMessage) { let raw=''; for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>262144)throw new Error('Payload too large')} return JSON.parse(raw) as unknown }
async function imageBody(req: IncomingMessage, limit=8*1024*1024) { const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const value=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=value.length;if(size>limit)throw new Error('Payload too large');chunks.push(value)}return Buffer.concat(chunks) }
function imageExtension(data:Buffer){if(data.length>=8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'png';if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)return'jpg';if(data.length>=6&&['GIF87a','GIF89a'].includes(data.subarray(0,6).toString('ascii')))return'gif';if(data.length>=12&&data.subarray(0,4).toString('ascii')==='RIFF'&&data.subarray(8,12).toString('ascii')==='WEBP')return'webp';return''}
async function mediaBytes(root:string):Promise<number>{let total=0;for(const item of await readdir(root,{withFileTypes:true}).catch(()=>[])){const path=join(root,item.name);if(item.isDirectory())total+=await mediaBytes(path);else if(item.isFile())total+=(await stat(path).catch(()=>null))?.size||0}return total}
async function callbackBody(req:IncomingMessage){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32768)throw Error('Payload too large')}if((req.headers['content-type']||'').includes('application/json'))return JSON.parse(raw) as unknown;return Object.fromEntries(new URLSearchParams(raw))}
async function validUserToken(username: string) {
  const cached=validUserCache.get(username);if(cached&&cached.expires>Date.now())return cached.valid
  const raw=await readFile(join(MULTI_CONFIG_DIR,username,'token.json'),'utf8').catch(()=>'')
  let token='';try{token=readStoredToken(raw)}catch{return false}
  const response=token?await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:token},signal:AbortSignal.timeout(10000)}).catch(()=>null):null
  const valid=Boolean(response?.ok);validUserCache.set(username,{expires:Date.now()+300000,valid});return valid
}
async function userNames() { const names=await configFolders(MULTI_CONFIG_DIR);return (await Promise.all(names.map(async name=>await validUserToken(name)?name:null))).filter((name):name is string=>Boolean(name)).sort() }
async function tokenHealth(root:string,file:string){const status=await readFile(join(root,file),'utf8').then(JSON.parse).catch(()=>null) as {invalidTokens?:unknown;verifyRequiredTokens?:unknown}|null,values=(input:unknown)=>Array.isArray(input)?input.filter((value):value is number=>Number.isInteger(value)&&value>0&&value<=50):[],invalid=values(status?.invalidTokens),verify=values(status?.verifyRequiredTokens);return [...invalid.map(value=>'Token '+value+' hỏng.'),...verify.map(value=>'Token '+value+' chưa xác minh.')].join('\n')}
async function configsAt(root: string) { const exists=Boolean(await stat(root).then(item=>item.isDirectory()).catch(()=>false)); const files={} as Partial<Record<ConfigFile, unknown>>; const disabled={} as Record<ConfigFile, boolean>; for(const [name,file] of Object.entries(configFiles) as [ConfigFile,string][]) { const raw=await readFile(join(root,file),'utf8').catch(()=>null); files[name]=raw?JSON.parse(raw):null; disabled[name]=Boolean(await stat(join(root,disabledFiles[name])).then(item=>item.isFile()).catch(()=>false)) } const [voicepool,chatpool]=await Promise.all([tokenHealth(root,'voicepool-status.json'),tokenHealth(root,'chatpool-status.json')]);return {root,exists,files,disabled,errors:{voicepool,chatpool}} }
function mentionLogId(entry: unknown) { return createHash("sha256").update(JSON.stringify(entry)).digest("hex") }
const MENTION_LOG_LIMIT = 15
const MENTION_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
function retainedMentionLog(value: unknown, now = Date.now()) {
  return (Array.isArray(value) ? value : []).filter(item=>isObject(item)&&typeof item.at==='number'&&Number.isSafeInteger(item.at)&&item.at>=now-MENTION_LOG_RETENTION_MS).sort((left,right)=>Number(right.at)-Number(left.at)).slice(0,MENTION_LOG_LIMIT)
}
async function readMentionLog(root: string) {
  const path=join(root,"mention-log.json"),value=await readFile(path,"utf8").then(raw=>JSON.parse(raw)).catch(()=>[]),next=retainedMentionLog(value)
  if(JSON.stringify(value)!==JSON.stringify(next))await writeFileAtomic(path,JSON.stringify(next,null,2)+"\n",{mode:0o600})
  return next
}
async function userConfigs(username: string) { return configsAt(join(MULTI_CONFIG_DIR,username)) }
function freeConfigTarget(billing: BillingState, owner: BillingUser, slot: BillingSlot|undefined, requested: string) {
  const target=slot||Object.values(billing.users).flatMap(user=>user.slots).find(item=>item.folder===requested)
  return target?Boolean(target.free||target.parked||target.expiresAt<=Date.now()):!owner.slots.some(item=>!item.free&&!item.parked&&item.expiresAt>Date.now())
}
async function slotConfigs(slot: BillingSlot) { const root=slotRoot(slot);return root?configsAt(root):null }
async function questTarget(x: Session, input: Record<string, unknown>) {
  const billing=await loadBilling()
  const selected=billingOwner(billing,x,typeof input.ownerId==='string'?input.ownerId:'')
  if(!selected)throw new QuestControlError('Không tìm thấy account.',403)
  const owner=selected.owner
  const slotId=typeof input.slotId==='string'?input.slotId:''
  if(slotId){
    const slot=owner.slots.find(item=>item.id===slotId)
    if(!slot)throw new QuestControlError('Không tìm thấy slot.',403)
    const bound=slotBound(slot),root=slotRoot(slot)||join(MULTI_CONFIG_DIR,configFolder(selected.ownerId,slot.id))
    if(bound&&!(await stat(root).then(item=>item.isDirectory()).catch(()=>false)))throw new QuestControlError('Thư mục slot không hợp lệ.',409)
    return {root,ownerId:selected.ownerId,slot,slotActive:slot.expiresAt>Date.now(),slotBound:bound}
  }
  const requested=typeof input.user==='string'?input.user:x.username
  const foreignFree=Object.entries(billing.users).find(([id,user])=>id!==selected.ownerId&&user.slots.some(slot=>slot.free&&slot.folder===requested))
  if(foreignFree){
    if(!admin(x))throw new QuestControlError('Quest access denied.',403)
    return questTarget(x,{ownerId:foreignFree[0],slotId:foreignFree[1].slots.find(slot=>slot.free&&slot.folder===requested)!.id})
  }
  const matched=owner.slots.find(slot=>slot.folder===requested)
  if (matched) return {root:slotRoot(matched)||join(MULTI_CONFIG_DIR,configFolder(selected.ownerId,matched.id)),ownerId:selected.ownerId,slot:matched,slotActive:matched.expiresAt>Date.now(),slotBound:slotBound(matched)}
  if(owner.slots.some(slot=>slot.free)||storage.hasFreeClaim(selected.ownerId))throw new QuestControlError('Chọn slot để dùng Auto Quest.',403)
  const owned=new Set([x.username,...owner.slots.filter(slot=>slotBound(slot)).map(slot=>slot.folder).filter((folder):folder is string=>Boolean(folder))])
  const names=admin(x)?await userNames():[]
  if(!owned.has(requested)&&!names.includes(requested))throw new QuestControlError('Quest access denied.',403)
  const root=join(MULTI_CONFIG_DIR,folderName(requested))
  const license=await readFile(join(root,'license.json'),'utf8').then(JSON.parse).catch(()=>null)
  if(license?.plan==='free')throw new QuestControlError('Chọn slot Free đang hoạt động.',403)
  return {root,ownerId:selected.ownerId,slot:undefined,slotActive:true,slotBound:true}
}
setQuestAccessResolver(async root=>{
  const license=await readFile(join(root,'license.json'),'utf8').then(JSON.parse).catch(()=>null)
  const state=storage.loadBilling()
  for(const user of Object.values(state.users))for(const slot of user.slots)if(slot.id===license?.slotId||slot.folder===basename(root))return !user.disabled&&!slot.free&&!slot.parked&&slot.expiresAt>Date.now()
  return false
})
let planSweepRunning=false
async function syncPlanLicenses(ownerId?:string) {
  const state=storage.loadBilling()
  for(const [id,user] of Object.entries(state.users)){
    if(ownerId&&ownerId!==id)continue
    if(!user.plan)continue
    for(const slot of user.slots){
      if(slot.legacy)continue
      const root=slotRoot(slot)
      if(!root)continue
      const path=join(root,'license.json'),raw=await readFile(path,'utf8').catch(()=>null)
      if(!raw)continue
      const old=JSON.parse(raw),next={...old,ownerId:id,slotId:slot.id,startsAt:slot.startsAt,expiresAt:slot.expiresAt,plan:slot.free?'free':user.plan.id}
      if(JSON.stringify(old)!==JSON.stringify(next))await writeFileAtomic(path,JSON.stringify(next,null,2),{mode:0o600})
    }
  }
  return state
}
async function planSweep() {
  if(planSweepRunning)return
  planSweepRunning=true
  try{
    const state=await syncPlanLicenses()
    if(!BOT_TOKEN)return
    for(const job of storage.planReminderJobs()){
      const planName=PLANS[job.planId].name
      const username=state.users[job.ownerId]?.username||job.ownerId
      const dmContent=job.days===0
        ?'Gói '+planName+' của bạn đã quá hạn và đã bị khoá, vui lòng gia hạn để được sử dụng tiếp.'
        :'Gói '+planName+' của bạn còn '+job.days+' ngày sẽ hết hạn, để không bị gián đoạn vui lòng gia hạn trước khi bị khoá.'
      const webhookContent=job.days===0
        ?'Gói '+planName+' của account '+username+' đã hết hạn và bị khoá'
        :'Gói '+planName+' của account '+username+' còn '+job.days+' ngày sẽ hết hạn'
      const headers={Authorization:'Bot '+BOT_TOKEN,'content-type':'application/json'}
      const dm=await fetch('https://discord.com/api/v10/users/@me/channels',{method:'POST',headers,body:JSON.stringify({recipient_id:job.ownerId}),signal:AbortSignal.timeout(10000)}).catch(()=>null)
      const channel=await dm?.json().catch(()=>null) as {id?:string}|null
      if(!dm?.ok||!channel?.id)continue
      const nonce=createHash('sha256').update(job.ownerId+':'+job.expiresAt+':'+job.days).digest('hex').slice(0,24)
      const response=await fetch('https://discord.com/api/v10/channels/'+channel.id+'/messages',{method:'POST',headers,body:JSON.stringify({content:dmContent,nonce,enforce_nonce:true}),signal:AbortSignal.timeout(10000)}).catch(()=>null)
      if(response?.ok){storage.markPlanReminder(job.ownerId,job.expiresAt,job.days);void adminNotify(webhookContent)}
    }
  }catch(error){console.error('Plan maintenance failed:',error instanceof Error?error.message:String(error))}
  finally{planSweepRunning=false}
}
setInterval(()=>void planSweep(),60000).unref()
void planSweep()
void restoreQuestLoops(MULTI_CONFIG_DIR).then(count=>console.log('Quest schedules restored: '+count)).catch(error=>console.error('Quest schedule restore failed:',error instanceof Error?error.message:String(error)))
void syncAllUserRoles().catch(error=>console.error('Role sync failed:',error instanceof Error?error.message:String(error)))
function startServer(){
createServer(async(req,res)=>{const u=new URL(req.url||'/','http://localhost')
if((req.method==='POST'||req.method==='GET')&&u.pathname==='/api/billing/card2k/callback'){const payload=req.method==='GET'?Object.fromEntries(u.searchParams):await callbackBody(req).catch(()=>null);if(!isObject(payload)){out(res,400,{error:'Callback không hợp lệ.'});return}try{if(payload.telco==='GARENA')payload.telco='GARENA2';if(payload.telco==='VIETNAMOBILE')payload.telco='VNMOBI';const result=await applyCardResult(payload,true);out(res,200,{status:'success',duplicate:!result.changed&&!result.pending})}catch(error){out(res,400,{error:error instanceof Error?error.message:'Callback không hợp lệ.'})}return}
if(req.method==='GET'&&u.pathname==='/__web_reload'){res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','connection':'keep-alive','x-accel-buffering':'no'});res.write('retry: 1000\n\n');webReloadClients.add(res);req.on('close',()=>webReloadClients.delete(res));return}

if(req.method==='GET'&&u.pathname==='/api/me'){const x=session(req);out(res,200,{oauthReady,loggedIn:Boolean(x),allowed:Boolean(x),admin:admin(x),canSwitchRole:canSwitch(x),disabled:x?storage.userDisabled(x.id):false,user:x?{id:x.id,username:x.username,avatar:x.avatar}:undefined});return}
if(req.method==='GET'&&u.pathname==='/api/spotify/search'){const x=session(req);if(!x){out(res,401,{error:'Login required'});return}try{const tracks=await spotifyTracks(u.searchParams.get('q')||'');out(res,200,{tracks})}catch(error){out(res,502,{error:error instanceof Error?error.message:'Không tìm được bài trên Spotify.'})}return}
if(req.method==='GET'&&u.pathname==='/api/billing/card2k/fees'){const x=session(req);if(!x){out(res,401,{error:'Login required'});return}try{out(res,200,{fees:await card2kFees()})}catch(error){out(res,502,{error:error instanceof Error?error.message:'Không tải được bảng phí Card2K.'})}return}
if(req.method==='POST'&&u.pathname==='/api/session/mode'){const x=session(req);const payload=await body(req).catch(()=>null);if(!x||!canSwitch(x)||!isObject(payload)||(payload.mode!=='admin'&&payload.mode!=='user')){out(res,403,{error:'Forbidden'});return}x.mode=payload.mode;await storage.saveSession(ck(req,'web_session')||'',x);out(res,200,{admin:admin(x)});return}
if(req.method==='GET'&&u.pathname==='/api/users'){const x=session(req);if(!x){out(res,401,{error:'Login required'});return}if(!admin(x)){out(res,403,{error:'Admin required'});return}out(res,200,{accounts:await adminAccounts(await loadBilling())});return}
if(u.pathname==='/api/quest'||u.pathname==='/api/quest/enable'||u.pathname==='/api/quest/disable'||u.pathname==='/api/quest/run'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  try{
    const payload=req.method==='POST'?await body(req):Object.fromEntries(u.searchParams)
    if(!isObject(payload)){out(res,400,{error:'Dữ liệu Quest không hợp lệ.'});return}
    const target=await questTarget(x,payload)
    const free=Boolean(target.slot?.free)
    const access=()=>({slotActive:target.slotActive,slotBound:target.slotBound,free,freeNextRunAt:free?storage.freeQuestNextRun(target.ownerId,target.slot?.tokenUserId||''):0})
    if(req.method==='GET'&&u.pathname==='/api/quest'){
      out(res,200,{...await getQuestState(target.root),...access()});return
    }
    if(req.method!=='POST'){out(res,405,{error:'Method not allowed'});return}
    if(!target.slotActive){out(res,403,{error:'Slot đã hết hạn.'});return}
    if(!target.slotBound){out(res,409,{error:'Slot chưa gắn token.'});return}
    if(free&&u.pathname!=='/api/quest/run'){out(res,403,{error:'Gói Free chỉ chạy thủ công, không có chạy theo lịch.'});return}
    if(u.pathname==='/api/quest/enable'){
      const days=Number(payload.days),type=String(payload.type||'BOTH').toUpperCase() as QuestType
      out(res,200,{...await enableQuest(target.root,days,type,payload.dmEnabled!==false),slotActive:true,slotBound:true});return
    }
    if(u.pathname==='/api/quest/disable'){
      out(res,200,{...await disableQuest(target.root),slotActive:true,slotBound:true});return
    }
    if(u.pathname==='/api/quest/run'){
      const type=String(payload.type||'BOTH').toUpperCase() as QuestType
      out(res,200,{...await runQuestNow(target.root,type,free?(tokenUserId)=>storage.reserveFreeQuest(target.ownerId,target.slot!.id,tokenUserId):undefined,payload.dmEnabled!==false),...access()});return
    }
    out(res,404,{error:'Not found'});return
  }catch(error){
    if(!(error instanceof QuestControlError)&&!(error instanceof FreePlanError)&&!(error instanceof SyntaxError))console.error('Quest API error:',error instanceof Error?error.message:String(error))
    const status=error instanceof QuestControlError||error instanceof FreePlanError?error.status:error instanceof SyntaxError?400:500
    if(error instanceof FreePlanError&&error.nextRunAt)res.setHeader('Retry-After',String(Math.max(1,Math.ceil((error.nextRunAt-Date.now())/1000))))
    out(res,status,{error:error instanceof QuestControlError||error instanceof FreePlanError?error.message:error instanceof SyntaxError?'Dữ liệu Quest không hợp lệ.':'Không thể xử lý Quest.',...(error instanceof FreePlanError&&error.nextRunAt?{nextRunAt:error.nextRunAt}:{})});return
  }
}
if(u.pathname==='/api/billing'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  if(!u.searchParams.get('ownerId')||u.searchParams.get('ownerId')===x.id)storage.ensureFreePlan(x.id,x.username)
  const selected=billingOwner(await loadBilling(),x,u.searchParams.get('ownerId')||'')
  if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
  const state=await reconcile(selected.ownerId),current=billingOwner(state,x,selected.ownerId)
  if(!current){out(res,403,{error:'Không tìm thấy account.'});return}
  out(res,200,await publicBilling(current.ownerId,current.owner,state.price,state,displaySlotLimit(x,current.owner)));return
}
if(req.method==='POST'&&u.pathname==='/api/billing/token-notice'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const payload=await body(req).catch(()=>null),billing=await loadBilling(),ownerId=isObject(payload)&&typeof payload.ownerId==='string'?payload.ownerId:''
  const selected=billingMutationOwner(billing,x,ownerId);if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
  const enabled=isObject(payload)?payload.enabled:undefined,intervalMs=isObject(payload)?payload.intervalMs:undefined
  if(typeof enabled!=='boolean'||typeof intervalMs!=='number'||!TOKEN_NOTICE_INTERVALS_MS.includes(intervalMs)){out(res,400,{error:'Cài đặt thông báo không hợp lệ.'});return}
  selected.owner.tokenNoticeEnabled=enabled;selected.owner.tokenNoticeIntervalMs=intervalMs
  await saveBilling(billing);out(res,200,await publicBilling(selected.ownerId,selected.owner,billing.price,billing,displaySlotLimit(x,selected.owner)));return
}
if(u.pathname==='/api/stream'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const billing=await loadBilling()
  if(req.method==='GET'){
    const selected=billingOwner(billing,x,u.searchParams.get('ownerId')||'');if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
    out(res,200,await streamPublic(selected.ownerId,selected.owner));return
  }
  if(req.method==='POST'){
    const payload=await body(req).catch(()=>null),ownerId=isObject(payload)&&typeof payload.ownerId==='string'?payload.ownerId:''
    const selected=billingOwner(billing,x,ownerId);if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
    if(activeSlotCount(selected.owner)===0){out(res,403,{error:'Account cần ít nhất một slot còn hạn để dùng Stream.'});return}
    const root=streamRoot(selected.ownerId),tokenPath=join(root,'token.json'),token=tokenInput(isObject(payload)?payload.token:undefined),prefix=isObject(payload)&&typeof payload.prefix==='string'?payload.prefix.trim():''
    const configPath=join(root,'stream.json'),configured=Boolean(await stat(configPath).then(item=>item.isFile()).catch(()=>false))
    const tokenSet=Boolean(await stat(tokenPath).then(item=>item.isFile()).catch(()=>false))
    if(!token&&!tokenSet){out(res,400,{error:'Cần nhập token Stream.'});return}
    if(!/^\S{1,32}$/.test(prefix)){out(res,400,{error:'Prefix phải từ 1 đến 32 ký tự và không có khoảng trắng.'});return}
    let tokenIdentity:{id:string;username:string}|null=null
    if(token){
      if(token.length<20||token.length>300||/\s/.test(token)){out(res,400,{error:'Token Stream không hợp lệ.'});return}
      const verify=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:token},signal:AbortSignal.timeout(10000)}).catch(()=>null)
      const profile=await verify?.json().catch(()=>null) as {id?:unknown;username?:unknown}|null
      if(!verify?.ok||typeof profile?.id!=='string'||typeof profile.username!=='string'){out(res,400,{error:'Token Stream sai hoặc đã hết hạn.'});return}
      tokenIdentity={id:profile.id,username:profile.username}
    }
    await mkdir(root,{recursive:true,mode:0o700})
    if(token){await writeFile(tokenPath,serializeToken(token)+'\n',{mode:0o600});await writeFile(join(root,'identity.json'),JSON.stringify({userId:tokenIdentity!.id,username:tokenIdentity!.username},null,2)+'\n',{mode:0o600});await Promise.all(['stream-error.txt','stream-invalid-notice','stream-verify-notice'].map(file=>rm(join(root,file),{force:true})))}
    await writeFile(configPath,JSON.stringify({prefix},null,2)+'\n',{mode:0o600})
    if(!configured)await writeFile(join(root,'stream.disabled'),'',{mode:0o600})
    out(res,200,await streamPublic(selected.ownerId,selected.owner));return
  }
  out(res,405,{error:'Method not allowed'});return
}
if(req.method==='POST'&&u.pathname==='/api/stream/toggle'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const payload=await body(req).catch(()=>null),billing=await loadBilling(),ownerId=isObject(payload)&&typeof payload.ownerId==='string'?payload.ownerId:''
  const selected=billingOwner(billing,x,ownerId);if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
  if(activeSlotCount(selected.owner)===0){out(res,403,{error:'Account cần ít nhất một slot còn hạn để dùng Stream.'});return}
  const root=streamRoot(selected.ownerId),configOk=Boolean(await stat(join(root,'stream.json')).then(item=>item.isFile()).catch(()=>false)),tokenOk=Boolean(await stat(join(root,'token.json')).then(item=>item.isFile()).catch(()=>false))
  if(!configOk||!tokenOk){out(res,409,{error:'Cần lưu cấu hình và token Stream trước.'});return}
  const disabledPath=join(root,'stream.disabled'),disabled=Boolean(await stat(disabledPath).then(item=>item.isFile()).catch(()=>false))
  if(disabled)await rm(disabledPath,{force:true});else await writeFile(disabledPath,'',{mode:0o600})
  out(res,200,await streamPublic(selected.ownerId,selected.owner));return
}
if(req.method==='POST'&&(u.pathname==='/api/billing/buy'||u.pathname==='/api/billing/renew')){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  try{
    const payload=await body(req)
    if(!isObject(payload)||Object.keys(payload).some(key=>!['ownerId','planId','requestId','version'].includes(key))){out(res,400,{error:'Chọn gói và xác nhận giao dịch.'});return}
    const current=await loadBilling(),selected=billingMutationOwner(current,x,typeof payload.ownerId==='string'?payload.ownerId:'')
    if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
    const state=storage.purchasePlan(selected.ownerId,payload.planId,payload.requestId,payload.version)
    await syncPlanLicenses(selected.ownerId).catch(error=>console.error('Plan license sync pending:',error instanceof Error?error.message:String(error)))
    queueWebEvent('billing-status');syncUserRole(selected.ownerId,state.users[selected.ownerId])
    out(res,200,await publicBilling(selected.ownerId,state.users[selected.ownerId],state.price,state));return
  }catch(error){out(res,error instanceof FreePlanError?error.status:error instanceof SyntaxError?400:500,{error:error instanceof FreePlanError?error.message:'Không thể mua gói. Có thể thử lại với cùng mã giao dịch.'});return}
}
if(req.method==='POST'&&u.pathname==='/api/billing/plan-payment'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const payload=await body(req).catch(()=>null)
  if(!isObject(payload)||Object.keys(payload).some(key=>!['ownerId','planId','requestId','version'].includes(key))||typeof payload.planId!=='string'||typeof payload.requestId!=='string'||!Number.isSafeInteger(payload.version)){out(res,400,{error:'Chọn gói và xác nhận giao dịch.'});return}
  if(!ready()){out(res,503,{error:'SePay chưa cấu hình.'});return}
  const state=await loadBilling(),selected=billingMutationOwner(state,x,typeof payload.ownerId==='string'?payload.ownerId:'')
  if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
  const plan=Object.values(PLANS).find(item=>item.id===payload.planId)
  if(!plan||!/^[-A-Za-z0-9_]{16,80}$/.test(payload.requestId)){out(res,400,{error:'Giao dịch gói không hợp lệ.'});return}
  const existing=state.payments.find(item=>item.requestId===payload.requestId)
  if(existing){if(existing.userId!==selected.ownerId||existing.planId!==plan.id){out(res,409,{error:'Mã giao dịch đã được dùng.'});return}if(existing.status!=='pending'||existing.expiresAt<=Date.now()){out(res,409,{error:'Mã QR cũ không còn hiệu lực.',retry:true});return}out(res,200,{payment:existing});return}
  const orderCode=Date.now()+Math.floor(Math.random()*1000),invoice='PLAN'+orderCode,createdAt=Date.now(),expiresAt=createdAt+sepayQrExpiresMinutes*60000
  try{const bank=sepay(),url=new URL((process.env.SEPAY_QR_BASE_URL||'https://img.vietqr.io/image').replace(/\/$/,'')+'/'+bank.bin+'-'+bank.account+'-compact2.png');url.searchParams.set('amount',String(plan.price));url.searchParams.set('addInfo',invoice);if(bank.name)url.searchParams.set('accountName',bank.name);const checkoutUrl=url.toString(),payment:BillingPayment={id:randomBytes(12).toString('hex'),userId:selected.ownerId,provider:'sepay',orderCode,invoice,amount:plan.price,status:'pending',checkoutUrl,qrImage:checkoutUrl,createdAt,expiresAt,purpose:'plan',requestId:String(payload.requestId),planId:plan.id,planVersion:Number(payload.version)},saved=storage.createSepayPlanPayment(payment);billingCache=storage.loadBilling();queueWebEvent('billing-status');out(res,201,{payment:saved});return}catch(error){out(res,error instanceof FreePlanError?error.status:502,{error:error instanceof FreePlanError?error.message:'Không thể khởi tạo giao dịch QR.'});return}
}
if(req.method==='POST'&&u.pathname==='/api/billing/payment/cancel'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const payload=await body(req).catch(()=>null);if(!isObject(payload)||typeof payload.id!=='string'||Object.keys(payload).some(key=>!['id','ownerId'].includes(key))){out(res,400,{error:'Giao dịch không hợp lệ.'});return}
  const state=await loadBilling(),selected=billingMutationOwner(state,x,typeof payload.ownerId==='string'?payload.ownerId:'');if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
  try{const payment=storage.cancelPayment(selected.ownerId,payload.id);billingCache=storage.loadBilling();queueWebEvent('billing-status');out(res,200,{payment:{id:payment.id,status:payment.status,providerMessage:payment.providerMessage}});return}catch(error){out(res,error instanceof FreePlanError?error.status:500,{error:error instanceof FreePlanError?error.message:'Không thể hủy giao dịch.'});return}
}
if(req.method==='POST'&&u.pathname==='/api/billing/unbind'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const payload=await body(req).catch(()=>null);if(!isObject(payload)||typeof payload.slotId!=='string'){out(res,400,{error:'Slot không hợp lệ.'});return}
  if(tokenMutations.has(payload.slotId)){out(res,409,{error:'Slot đang cập nhật token. Thử lại sau.'});return}
  tokenMutations.add(payload.slotId)
  try{
  const state=await loadBilling(),selected=billingMutationOwner(state,x,typeof payload.ownerId==='string'?payload.ownerId:'')
  if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
  const user=selected.owner,slot=user.slots.find(item=>item.id===payload.slotId)
  if(!slot){out(res,404,{error:'Không tìm thấy slot.'});return}
  if(!slotBound(slot)&&slot.tokenState!=='invalid'){out(res,409,{error:'Slot chưa gắn token.'});return}
  if(slot.tokenState==='invalid'){
    slot.tokenState='none';slot.invalidNoticeSentAt=null
    await saveBilling(state);out(res,200,await publicBilling(selected.ownerId,user,state.price,state,displaySlotLimit(x,user)));return
  }
  if(!slot.folder||!validFolderPath(slot.folder)){slot.folder=null;slot.tokenUserId=null;slot.tokenUsername=null;slot.tokenState='none';slot.invalidNoticeSentAt=null;await saveBilling(state);out(res,200,await publicBilling(selected.ownerId,user,state.price,state,displaySlotLimit(x,user)));return}
  const previousFolder=slot.folder,previousUserId=slot.tokenUserId,previousUsername=slot.tokenUsername,previousTokenState=slot.tokenState,previousNoticeSentAt=slot.invalidNoticeSentAt
  const sourceRoot=join(MULTI_CONFIG_DIR,previousFolder)
  if(!(await stat(sourceRoot).then(item=>item.isDirectory()).catch(()=>false))){slot.folder=null;slot.tokenUserId=null;slot.tokenUsername=null;slot.tokenState='none';slot.invalidNoticeSentAt=null;await saveBilling(state);out(res,200,await publicBilling(selected.ownerId,user,state.price,state,displaySlotLimit(x,user)));return}
  const tokenPath=join(sourceRoot,'token.json'),licensePath=join(sourceRoot,'license.json')
  const previousToken=await readFile(tokenPath,'utf8').catch(()=>null),previousLicense=await readFile(licensePath,'utf8').catch(()=>null)
  let archiveRoot='',moved=false
  try{
    await mkdir(DISABLED_CONFIG_DIR,{recursive:true})
    await writeIdentity(sourceRoot,previousUserId||'',previousUsername||'')
    await writeFileAtomic(licensePath,JSON.stringify({ownerId:selected.ownerId,slotId:slot.id,expiresAt:0,...(slot.free?{plan:'free'}:{})},null,2)+'\n')
    const archiveOwner=folderName(user.username),archiveToken=await availableFolder(join(DISABLED_CONFIG_DIR,archiveOwner),basename(previousFolder!),previousUserId||'');const archiveFolder=archiveOwner+'/'+archiveToken;archiveRoot=join(DISABLED_CONFIG_DIR,archiveFolder)
    await mkdir(dirname(archiveRoot),{recursive:true})
    await rename(sourceRoot,archiveRoot);moved=true
    slot.folder=null;slot.tokenUserId=null;slot.tokenUsername=null;slot.tokenState='none';slot.invalidNoticeSentAt=null
    await saveBilling(state)
    await rm(join(archiveRoot,'token.json'),{force:true}).catch(()=>{})
    out(res,200,await publicBilling(selected.ownerId,user,state.price,state,displaySlotLimit(x,user)));return
  }catch{
    if(moved)await rename(archiveRoot,sourceRoot).catch(()=>{})
    if(archiveRoot)await cleanupEmptyDir(dirname(archiveRoot))
    const rollbackRoot=await stat(sourceRoot).then(item=>item.isDirectory()?sourceRoot:null).catch(()=>null)
    if(rollbackRoot){await restoreText(join(rollbackRoot,'token.json'),previousToken).catch(()=>{});await restoreText(join(rollbackRoot,'license.json'),previousLicense).catch(()=>{})}
    slot.folder=previousFolder;slot.tokenUserId=previousUserId;slot.tokenUsername=previousUsername;slot.tokenState=previousTokenState;slot.invalidNoticeSentAt=previousNoticeSentAt
    await saveBilling(state).catch(()=>{})
    out(res,500,{error:'Không thể chuyển config sang users-disable.'});return
  }
  }finally{tokenMutations.delete(payload.slotId)}
}
if(req.method==='POST'&&u.pathname==='/api/billing/token'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  if(!admin(x)){out(res,403,{error:'Admin required'});return}
  const payload=await body(req).catch(()=>null)
  const token=tokenInput(isObject(payload)?payload.token:undefined)
  if(!isObject(payload)||typeof payload.ownerId!=='string'||typeof payload.slotId!=='string'||token.length<20||token.length>300||/\s/.test(token)){out(res,400,{error:'Token không hợp lệ.'});return}
  if(tokenMutations.has(payload.slotId)){out(res,409,{error:'Slot đang cập nhật token. Thử lại sau.'});return}
  tokenMutations.add(payload.slotId)
  let identityLock=''
  try{
  const state=await loadBilling(),owner=state.users[payload.ownerId]
  if(!owner){out(res,404,{error:'Không tìm thấy account.'});return}
  const slot=owner.slots.find(item=>item.id===payload.slotId)
  if(!slot){out(res,404,{error:'Không tìm thấy slot.'});return}
  if(!slotBound(slot)){out(res,409,{error:'Slot chưa gắn token. Hãy gắn token trước.'});return}
  const root=slotRoot(slot)
  if(!root||!(await stat(root).then(item=>item.isDirectory()).catch(()=>false))){out(res,404,{error:'Không tìm thấy thư mục token.'});return}
  const verify=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:token},signal:AbortSignal.timeout(10000)}).catch(()=>null)
  const identity=await verify?.json().catch(()=>null) as {id?:string;username?:string}|null
  if(!verify?.ok||!identity?.id||!identity.username){out(res,400,{error:'Token Discord sai hoặc hết hạn.'});return}
  identityLock='discord:'+identity.id
  if(tokenMutations.has(identityLock)){identityLock='';out(res,409,{error:'Token đang được gắn vào slot khác. Thử lại sau.'});return}
  tokenMutations.add(identityLock)
  for(const [otherOwnerId,user] of Object.entries(storage.loadBilling().users))for(const item of user.slots)if(item.tokenUserId===identity.id&&!(otherOwnerId===payload.ownerId&&item.id===payload.slotId)){out(res,409,{error:'Discord user ID đã được gắn trên slot khác.'});return}
  const tokenPath=join(root,'token.json'),identityPath=join(root,IDENTITY_FILE)
  const previousToken=await readFile(tokenPath,'utf8').catch(()=>null),previousIdentity=await readFile(identityPath,'utf8').catch(()=>null)
  const previousUserId=slot.tokenUserId,previousUsername=slot.tokenUsername,previousTokenState=slot.tokenState,previousNoticeSentAt=slot.invalidNoticeSentAt
  try{
    await writeFileAtomic(tokenPath,serializeToken(token)+'\n',{mode:0o600})
    await writeIdentity(root,identity.id,identity.username)
    slot.tokenUserId=identity.id;slot.tokenUsername=identity.username;slot.tokenState='active';slot.invalidNoticeSentAt=null
    await saveBilling(state)
    console.log('['+slot.folder+'] token updated by admin: '+identity.username)
    out(res,200,{ok:true,folder:slot.folder,userId:identity.id,username:identity.username});return
  }catch{
    slot.tokenUserId=previousUserId;slot.tokenUsername=previousUsername;slot.tokenState=previousTokenState;slot.invalidNoticeSentAt=previousNoticeSentAt
    await restoreText(tokenPath,previousToken).catch(()=>{})
    await restoreText(identityPath,previousIdentity).catch(()=>{})
    await saveBilling(state).catch(()=>{})
    out(res,500,{error:'Không thể cập nhật token.'});return
  }
  }finally{tokenMutations.delete(payload.slotId);if(identityLock)tokenMutations.delete(identityLock)}
}
if(req.method==='POST'&&u.pathname==='/api/billing/bind'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const payload=await body(req).catch(()=>null)
  const token=tokenInput(isObject(payload)?payload.token:undefined)
  if(!isObject(payload)||typeof payload.slotId!=='string'||token.length<20||token.length>300||/\s/.test(token)){out(res,400,{error:'Token không hợp lệ.'});return}
  if(tokenMutations.has(payload.slotId)){out(res,409,{error:'Slot đang cập nhật token. Thử lại sau.'});return}
  tokenMutations.add(payload.slotId)
  let identityLock=''
  try{
  const state=await loadBilling(),selected=billingMutationOwner(state,x,typeof payload.ownerId==='string'?payload.ownerId:'')
  if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
  const user=selected.owner,slot=user.slots.find(item=>item.id===payload.slotId)
  if(!slot){out(res,409,{error:'Slot không hợp lệ.'});return}
  if(slotBound(slot)&&await slotTokenValid(slot)){out(res,409,{error:'Slot không hợp lệ hoặc đã gắn token.'});return}
  if(slot.expiresAt<=Date.now()){out(res,403,{error:'Slot đã hết hạn.'});return}
  const verify=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:token},signal:AbortSignal.timeout(10000)}).catch(()=>null)
  const identity=await verify?.json().catch(()=>null) as {id?:string;username?:string}|null
  if(!verify?.ok||!identity?.id||!identity.username){out(res,400,{error:'Token Discord sai hoặc hết hạn.'});return}
  identityLock='discord:'+identity.id
  if(tokenMutations.has(identityLock)){identityLock='';out(res,409,{error:'Token đang được gắn vào slot khác. Thử lại sau.'});return}
  tokenMutations.add(identityLock)
  for(const [otherOwnerId,owner] of Object.entries(storage.loadBilling().users))for(const item of owner.slots)if(item.tokenUserId===identity.id && !(otherOwnerId===selected.ownerId && item.id===slot.id)){out(res,409,{error:'Discord user ID đã được gắn vào slot khác.'});return}
  const existingRoot=slotBound(slot)?slotRoot(slot):null
  const invalidRoot=!slot.free&&slot.tokenState==='invalid'?await archivedSlotRoot(slot.id):null
  const matches=slot.free||existingRoot||invalidRoot?[]:await identityFolders(DISABLED_CONFIG_DIR,identity.id,'disabled')
  const licensedMatches=await Promise.all(matches.map(async match=>{
    const license=await readFile(join(match.root,'license.json'),'utf8').then(JSON.parse).catch(()=>null) as {ownerId?:string;slotId?:string}|null
    return {match,ownerId:typeof license?.ownerId==='string'?license.ownerId:'',slotId:typeof license?.slotId==='string'?license.slotId:''}
  }))
  const sameSlot=licensedMatches.filter(item=>item.slotId===slot.id)
  const sameOwner=licensedMatches.filter(item=>item.ownerId===selected.ownerId)
  const candidates=sameSlot.length?sameSlot:sameOwner.length?sameOwner:licensedMatches
  if(candidates.length>1){out(res,409,{error:'Tìm thấy nhiều folder cùng Discord user ID trong cùng account.'});return}
  const matched=candidates[0]?.match
  const sourceRoot=invalidRoot||matched?.root||null
  const ownerFolder=folderName(user.username),tokenFolder=existingRoot?'':await availableFolder(join(MULTI_CONFIG_DIR,ownerFolder),sourceRoot?basename(sourceRoot):folderName(identity.username),identity.id)
  const folder=existingRoot&&slot.folder?slot.folder:ownerFolder+'/'+tokenFolder,root=existingRoot||join(MULTI_CONFIG_DIR,folder)
  let moved=false,created=false
  if(!existingRoot){if(sourceRoot){await mkdir(dirname(root),{recursive:true});await rename(sourceRoot,root);moved=true}else{await mkdir(root,{recursive:true});created=true}}
  const tokenPath=join(root,'token.json'),licensePath=join(root,'license.json'),identityPath=join(root,IDENTITY_FILE)
  const previousToken=await readFile(tokenPath,'utf8').catch(()=>null),previousLicense=await readFile(licensePath,'utf8').catch(()=>null),previousIdentity=await readFile(identityPath,'utf8').catch(()=>null)
  const previousFolder=slot.folder,previousTokenState=slot.tokenState,previousNoticeSentAt=slot.invalidNoticeSentAt
  try{
    await writeIdentity(root,identity.id,identity.username)
    await writeFileAtomic(tokenPath,serializeToken(token)+'\n',{mode:0o600})
    await writeFileAtomic(licensePath,JSON.stringify({ownerId:selected.ownerId,slotId:slot.id,startsAt:slot.startsAt,expiresAt:slot.expiresAt,...(slot.free?{plan:'free'}:{})},null,2)+'\n')
    slot.folder=folder;slot.tokenUserId=identity.id;slot.tokenUsername=identity.username;slot.tokenState='active';slot.invalidNoticeSentAt=null
    await saveBilling(state)
    storage.setCanonicalFolder(slot.id, folder)
    if(previousTokenState==='invalid')void tokenNotify(tokenWebhookNotice(user.username,user.slots.indexOf(slot),user.slots.length,true))
    out(res,200,await publicBilling(selected.ownerId,user,state.price,state,displaySlotLimit(x,user)));return
  }catch{
    slot.folder=previousFolder;slot.tokenUserId=null;slot.tokenUsername=null;slot.tokenState=previousTokenState;slot.invalidNoticeSentAt=previousNoticeSentAt
    await restoreText(tokenPath,previousToken).catch(()=>{});await restoreText(licensePath,previousLicense).catch(()=>{});await restoreText(identityPath,previousIdentity).catch(()=>{})
    if(moved&&sourceRoot)await rename(root,sourceRoot).catch(()=>{})
    else if(created)await rm(root,{recursive:true,force:true}).catch(()=>{})
    out(res,500,{error:'Không thể gắn token.'});return
  }
  }finally{tokenMutations.delete(payload.slotId);if(identityLock)tokenMutations.delete(identityLock)}
}
if(req.method==='POST'&&u.pathname==='/api/billing/deposit'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}const payload=await body(req).catch(()=>null),amount=isObject(payload)&&typeof payload.amount==='number'?Math.floor(payload.amount):0;if(!Number.isSafeInteger(amount)||amount<paymentMin){out(res,400,{error:'Số tiền nạp tối thiểu 10.000đ.'});return}if(!ready()){out(res,503,{error:'SePay chưa cấu hình.'});return}
  const state=await loadBilling(),selected=billingMutationOwner(state,x,isObject(payload)&&typeof payload.ownerId==='string'?payload.ownerId:'')
  if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}
  const orderCode=Date.now()+Math.floor(Math.random()*1000),invoice='NII'+orderCode,createdAt=Date.now(),expiresAt=createdAt+sepayQrExpiresMinutes*60000;try{const bank=sepay(),url=new URL((process.env.SEPAY_QR_BASE_URL||'https://img.vietqr.io/image').replace(/\/$/,'')+'/'+bank.bin+'-'+bank.account+'-compact2.png');url.searchParams.set('amount',String(amount));url.searchParams.set('addInfo',invoice);if(bank.name)url.searchParams.set('accountName',bank.name);const checkoutUrl=url.toString(),payment:BillingPayment={id:randomBytes(12).toString('hex'),userId:selected.ownerId,provider:'sepay',orderCode,invoice,amount,status:'pending',checkoutUrl,qrImage:checkoutUrl,createdAt,expiresAt};state.payments.push(payment);await saveBilling(state);out(res,201,{payment});return}catch{out(res,502,{error:'Không thể khởi tạo giao dịch nạp tiền.'});return}
}
if(req.method==='POST'&&u.pathname==='/api/billing/card2k'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}const payload=await body(req).catch(()=>null);if(!isObject(payload)){out(res,400,{error:'Dữ liệu thẻ không hợp lệ.'});return}if(!card2kReady()){out(res,503,{error:'Card2K chưa cấu hình.'});return}
  const amount=typeof payload.amount==='number'?Math.floor(payload.amount):0;if(!Number.isSafeInteger(amount)||!cardAmounts.has(amount)){out(res,400,{error:'Mệnh giá không hợp lệ.'});return}const rawTelco=typeof payload.telco==='string'?payload.telco:'',rawSerial=typeof payload.serial==='string'?payload.serial:'',rawCode=typeof payload.code==='string'?payload.code:'';let card:ReturnType<typeof cardInput>;try{card=cardInput(rawTelco,rawSerial,rawCode)}catch(error){out(res,400,{error:error instanceof Error?error.message:'Dữ liệu thẻ không hợp lệ.'});return}if(card.telco==='GARENA2'&&![20000,50000,100000,200000,500000].includes(amount)){out(res,400,{error:'Garena không hỗ trợ mệnh giá này.'});return}
  const state=await loadBilling(),selected=billingMutationOwner(state,x,typeof payload.ownerId==='string'?payload.ownerId:'');if(!selected){out(res,403,{error:'Không tìm thấy account.'});return}const config=card2k(),id=randomBytes(16).toString('hex'),orderCode=Date.now()+Math.floor(Math.random()*1000),invoice='CARD'+orderCode,createdAt=Date.now(),expiresAt=createdAt+30*60000,callbackSign=md5(config.partnerKey+card.code+card.serial);if(state.payments.some(item=>item.provider==='card2k'&&item.callbackSign===callbackSign)){out(res,409,{error:'Thẻ này đã được gửi trước đó.'});return}const payment:BillingPayment={id,userId:selected.ownerId,provider:'card2k',orderCode,invoice,amount,status:'pending',checkoutUrl:'',qrImage:'',createdAt,expiresAt,declaredAmount:amount,cardTelco:card.telco,cardSerial:'••••'+card.serial.slice(-4),callbackSign};state.payments.push(payment);await saveBilling(state)
  const command='charging',sign=md5(config.partnerKey+card.code+card.serial),form=new URLSearchParams({telco:card.telco,code:card.code,serial:card.serial,amount:String(amount),request_id:id,partner_id:config.partnerId,command,sign});try{const response=await fetch('https://card2k.com/chargingws/v2',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:form,signal:AbortSignal.timeout(15000)}),result=await response.json() as unknown;if(!response.ok||!isObject(result))throw Error('Card2K trả dữ liệu không hợp lệ.');const providerStatus=Number(result.status),providerMessage=String(result.message||'').slice(0,240);if(!Number.isInteger(providerStatus))throw Error('Card2K trả trạng thái không hợp lệ.');payment.providerStatus=providerStatus;payment.providerMessage=providerMessage;await saveBilling(state);if(providerStatus!==99)await applyCardResult({...result,request_id:id},false);out(res,201,{payment:{id,status:providerStatus===1||providerStatus===2?'paid':providerStatus===99?'pending':'failed',invoice,amount,declaredAmount:amount,providerMessage}})}catch(error){payment.status='failed';payment.providerStatus=100;payment.providerMessage=error instanceof Error?error.message:'Không gửi được thẻ.';await saveBilling(state);out(res,502,{error:payment.providerMessage})}return
}
if(req.method==='GET'&&u.pathname==='/api/admin/billing'){const x=session(req);if(!x){out(res,401,{error:'Login required'});return}if(!admin(x)){out(res,403,{error:'Admin required'});return}out(res,200,await adminBilling(await loadBilling()));return}
if(req.method==='POST'&&u.pathname==='/api/admin/billing'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}if(!admin(x)){out(res,403,{error:'Admin required'});return}
  const payload=await body(req).catch(()=>null);if(!isObject(payload)){out(res,400,{error:'Dữ liệu không hợp lệ.'});return}
  const state=await loadBilling(),previousPrice=state.price
  if('price' in payload&&(typeof payload.price!=='number'||!Number.isSafeInteger(payload.price)||payload.price<1000)){out(res,400,{error:'Giá gói không hợp lệ.'});return}
  const userId=typeof payload.userId==='string'?payload.userId:''
  const target=userId?state.users[userId]:undefined
  if(userId&&!target){out(res,404,{error:'Không tìm thấy account.'});return}
  if('planId' in payload){
    if(!userId||!isPlanId(payload.planId)){out(res,400,{error:'Gói không hợp lệ.'});return}
    try{const updated=storage.adminChangePlan(userId,payload.planId);syncUserRole(userId,updated.users[userId]);storage.addAdminLog({actor:x.username,action:'changePlan',targetUser:updated.users[userId].username,detail:PLANS[payload.planId].name});out(res,200,await adminBilling(updated));return}catch(error){out(res,400,{error:error instanceof Error?error.message:'Không thể đổi gói.'});return}
  }
  if(target&&payload.grantSlot===true){out(res,409,{error:'Account Free chỉ có một slot. Cần nâng cấp gói.'});return}
  const previousBalance=target?.balance,previousSlotLimit=target?.slotLimit
  if('credit' in payload&&(typeof payload.credit!=='number'||!Number.isSafeInteger(payload.credit)||payload.credit<=0)){out(res,400,{error:'Số tiền cộng không hợp lệ.'});return}
  if('slotLimit' in payload&&(typeof payload.slotLimit!=='number'||!Number.isSafeInteger(payload.slotLimit)||payload.slotLimit<1)){out(res,400,{error:'Giới hạn slot không hợp lệ.'});return}
  if('grantSlot' in payload&&payload.grantSlot!==true){out(res,400,{error:'Dữ liệu cộng slot không hợp lệ.'});return}
  
  if('debit' in payload&&(typeof payload.debit!=='number'||!Number.isSafeInteger(payload.debit)||payload.debit<=0)){out(res,400,{error:'Số tiền trừ không hợp lệ.'});return}
  if(target&&typeof payload.debit==='number'&&target.balance<payload.debit){out(res,409,{error:'Số dư không đủ để trừ.'});return}
  if('disabled' in payload&&typeof payload.disabled!=='boolean'){out(res,400,{error:'Trạng thái khóa không hợp lệ.'});return}
  if('deleteUser' in payload){out(res,410,{error:'Chức năng xóa account đã bị vô hiệu hóa.'});return}
  if('slotIds' in payload&&(!Array.isArray(payload.slotIds)||!(payload.slotIds as unknown[]).length||!(payload.slotIds as unknown[]).every(id=>typeof id==='string'))){out(res,400,{error:'Danh sách slot không hợp lệ.'});return}
  const slotIds=Array.isArray(payload.slotIds)?(payload.slotIds as unknown[]).filter((id):id is string=>typeof id==='string'):[]
  if(slotIds.length&&(typeof payload.addDays!=='number'||!Number.isSafeInteger(payload.addDays)||(payload.addDays as number)<1||(payload.addDays as number)>3650)){out(res,400,{error:'Số ngày cộng phải từ 1 đến 3650.'});return}
  const bulkSlots=slotIds.map(id=>target?.slots.find(item=>item.id===id)).filter((item):item is BillingSlot=>Boolean(item))
  if(slotIds.length&&bulkSlots.length!==slotIds.length){out(res,404,{error:'Không tìm thấy slot.'});return}
  const slotId=typeof payload.slotId==='string'?payload.slotId:''
  const slot=slotId&&target?target.slots.find(item=>item.id===slotId):undefined
  if(slotId&&!slot){out(res,404,{error:'Không tìm thấy slot.'});return}
  if((slot||bulkSlots.length)&&('startsAt' in payload||'expiresAt' in payload||'addDays' in payload)){out(res,409,{error:'Slot Free không có thời hạn để chỉnh hoặc gia hạn.'});return}
  let previousStartsAt:number|null|undefined,previousExpiresAt:number|undefined,licensePath='',previousLicense:string|null=null
  if(slot){
    const hasStartedAt='startsAt' in payload,hasExpiresAt='expiresAt' in payload,hasAddDays='addDays' in payload
    if(hasAddDays&&(hasStartedAt||hasExpiresAt)){out(res,400,{error:'Không thể vừa đặt ngày vừa cộng ngày.'});return}
    if(hasStartedAt&&payload.startsAt!==null&&!validTimestamp(payload.startsAt)){out(res,400,{error:'Ngày bắt đầu không hợp lệ.'});return}
    if(hasExpiresAt&&!validTimestamp(payload.expiresAt)){out(res,400,{error:'Ngày hết hạn không hợp lệ.'});return}
    if(hasAddDays&&(typeof payload.addDays!=='number'||!Number.isSafeInteger(payload.addDays)||payload.addDays<1||payload.addDays>3650)){out(res,400,{error:'Số ngày cộng phải từ 1 đến 3650.'});return}
    previousStartsAt=slot.startsAt;previousExpiresAt=slot.expiresAt
    const nextStartsAt=hasAddDays&&slot.expiresAt<=Date.now()?Date.now():hasStartedAt?payload.startsAt as number|null:slot.startsAt
    const nextExpiresAt=hasAddDays?Math.max(Date.now(),slot.expiresAt)+(payload.addDays as number)*DAY_MS:hasExpiresAt?payload.expiresAt as number:slot.expiresAt
    if(nextStartsAt!==null&&nextStartsAt>nextExpiresAt){out(res,400,{error:'Ngày bắt đầu phải trước ngày hết hạn.'});return}
    slot.startsAt=nextStartsAt;slot.expiresAt=nextExpiresAt
    const root=slotRoot(slot)
    if(root&&await stat(root).then(item=>item.isDirectory()).catch(()=>false)){licensePath=join(root,'license.json');previousLicense=await readFile(licensePath,'utf8').catch(()=>null)}
  }
  const bulkPrev=bulkSlots.map(item=>({slot:item,startsAt:item.startsAt,expiresAt:item.expiresAt,licensePath:'',licenseText:null as string|null}))
  if(bulkSlots.length){
    const bulkNow=Date.now()
    for(const item of bulkSlots){if(item.expiresAt<=bulkNow)item.startsAt=bulkNow;item.expiresAt=Math.max(bulkNow,item.expiresAt)+(payload.addDays as number)*DAY_MS}
    for(const entry of bulkPrev){const root=slotRoot(entry.slot);if(root&&await stat(root).then(item=>item.isDirectory()).catch(()=>false)){entry.licensePath=join(root,'license.json');entry.licenseText=await readFile(entry.licensePath,'utf8').catch(()=>null)}}
  }
  if('revokeSlotId' in payload&&(typeof payload.revokeSlotId!=='string'||!payload.revokeSlotId)){out(res,400,{error:'Mã slot cần trừ không hợp lệ.'});return}
  if('revokeSlotIds' in payload&&(!Array.isArray(payload.revokeSlotIds)||!(payload.revokeSlotIds as unknown[]).length||!(payload.revokeSlotIds as unknown[]).every(id=>typeof id==='string'))){out(res,400,{error:'Danh sách slot cần trừ không hợp lệ.'});return}
  const singleRevokeId=typeof payload.revokeSlotId==='string'?payload.revokeSlotId:''
  const revokeSlotIds=Array.isArray(payload.revokeSlotIds)?(payload.revokeSlotIds as unknown[]).filter((id):id is string=>typeof id==='string'):(singleRevokeId?[singleRevokeId]:[])
  const revokedSlots=revokeSlotIds.map(id=>target?.slots.find(item=>item.id===id)).filter((item):item is BillingSlot=>Boolean(item))
  if(revokeSlotIds.length&&revokedSlots.length!==revokeSlotIds.length){out(res,404,{error:'Không tìm thấy slot cần trừ.'});return}
  if(target?.plan&&revokedSlots.some(item=>!item.legacy)){out(res,409,{error:'Không thể trừ slot thuộc gói. Khóa account nếu cần.'});return}
  const previousDisabled=target?.disabled,previousSlots=target?[...target.slots]:undefined
  const adminLogEntries:Array<{action:string;targetUser?:string;detail?:string}>=[]
  if(typeof payload.price==='number')adminLogEntries.push({action:'price',detail:String(payload.price)})
  if(target&&typeof payload.credit==='number')adminLogEntries.push({action:'credit',targetUser:target.username,detail:'+'+payload.credit})
  if(target&&typeof payload.debit==='number')adminLogEntries.push({action:'debit',targetUser:target.username,detail:'-'+payload.debit})
  if(target&&typeof payload.slotLimit==='number')adminLogEntries.push({action:'slotLimit',targetUser:target.username,detail:String(payload.slotLimit)})
  if(target&&payload.grantSlot===true)adminLogEntries.push({action:'grantSlot',targetUser:target.username,detail:'+1 slot'})
  if(target&&revokedSlots.length)adminLogEntries.push({action:'revokeSlot',targetUser:target.username,detail:'-'+revokedSlots.length+' slot'})
  if(target&&typeof payload.disabled==='boolean')adminLogEntries.push({action:payload.disabled?'lock':'unlock',targetUser:target.username})
  if(slot&&target&&('startsAt' in payload||'expiresAt' in payload))adminLogEntries.push({action:'slotDates',targetUser:target.username,detail:slotLabel(target,slot)})
  if(slot&&target&&typeof payload.addDays==='number')adminLogEntries.push({action:'extend',targetUser:target.username,detail:slotLabel(target,slot)+' +'+payload.addDays+' ngày'})
  if(bulkSlots.length&&typeof payload.addDays==='number')adminLogEntries.push({action:'bulkExtend',targetUser:target?.username,detail:bulkSlots.length+' slot +'+payload.addDays+' ngày'})
  try{
    if(typeof payload.price==='number')state.price=payload.price
    if(target&&typeof payload.credit==='number')target.balance+=payload.credit
    if(target&&typeof payload.slotLimit==='number')target.slotLimit=payload.slotLimit
    if(target&&typeof payload.debit==='number')target.balance-=payload.debit
    if(target&&typeof payload.disabled==='boolean')target.disabled=payload.disabled
    if(target&&payload.grantSlot===true)target.slots.push({id:randomBytes(12).toString('hex'),folder:null,tokenUserId:null,tokenUsername:null,tokenState:'none',invalidNoticeSentAt:null,startsAt:Date.now(),expiresAt:Date.now()+PLAN_DAYS*DAY_MS})
    if(target&&revokedSlots.length)target.slots=target.slots.filter(item=>!revokeSlotIds.includes(item.id))
    if(slot&&licensePath)await writeFileAtomic(licensePath,JSON.stringify({ownerId:userId,slotId:slot.id,startsAt:slot.startsAt,expiresAt:slot.expiresAt,...(slot.free?{plan:'free'}:{})},null,2)+'\n',{mode:0o600})
    for(const entry of bulkPrev)if(entry.licensePath)await writeFileAtomic(entry.licensePath,JSON.stringify({ownerId:userId,slotId:entry.slot.id,startsAt:entry.slot.startsAt,expiresAt:entry.slot.expiresAt,...(entry.slot.free?{plan:'free'}:{})},null,2)+'\n',{mode:0o600})
    await saveBilling(state)
    if(target&&userId)syncUserRole(userId,target)
    for(const entry of adminLogEntries)try{storage.addAdminLog({actor:x.username,action:entry.action,targetUser:entry.targetUser,detail:entry.detail})}catch{}
    out(res,200,await adminBilling(state));return
  }catch(error){
    console.error('Admin billing error:', error)
    state.price=previousPrice
    if(target&&previousBalance!==undefined&&previousSlotLimit!==undefined){target.balance=previousBalance;target.slotLimit=previousSlotLimit}
    if(target&&previousSlots!==undefined)target.slots=previousSlots
    if(target&&previousDisabled!==undefined)target.disabled=previousDisabled
    if(slot&&previousStartsAt!==undefined&&previousExpiresAt!==undefined){slot.startsAt=previousStartsAt;slot.expiresAt=previousExpiresAt}
    for(const entry of bulkPrev){entry.slot.startsAt=entry.startsAt;entry.slot.expiresAt=entry.expiresAt;if(entry.licensePath)await restoreText(entry.licensePath,entry.licenseText).catch(()=>{})}
    if(licensePath)await restoreText(licensePath,previousLicense).catch(()=>{})
    out(res,500,{error:'Không thể lưu cấu hình thời hạn.'});return
  }
}
if(req.method==='GET'&&u.pathname==='/api/price'){const state=await loadBilling();out(res,200,{price:PLANS.pluna.price,days:PLAN_DAYS,plans:Object.values(PLANS)});return}
if(req.method==='GET'&&u.pathname==='/api/preview'){const city=u.searchParams.get('city')?.trim()||'';if(!city||city.length>100){out(res,400,{error:'Invalid city'});return}try{out(res,200,{values:await previewValues(city)});return}catch{out(res,502,{error:'Preview data unavailable'});return}}
if(req.method==='GET'&&u.pathname==='/api/showcase'){try{out(res,200,await loadShowcase())}catch{out(res,502,{error:'Showcase unavailable'})}return}
if(req.method==='GET'&&u.pathname==='/auth/discord'){if(!oauthReady){out(res,503,{error:'OAuth not configured'});return}const state=randomBytes(24).toString('base64url');states.set(state,Date.now()+600000);set(res,'oauth_state',state,600);const q=new URL('https://discord.com/oauth2/authorize');q.search=new URLSearchParams({client_id:CLIENT_ID,redirect_uri:REDIRECT_URI,response_type:'code',scope:'identify',state}).toString();res.writeHead(302,{location:q.toString()});res.end();return}
if(req.method==='GET'&&u.pathname==='/auth/discord/callback'){const code=u.searchParams.get('code'),state=u.searchParams.get('state');if(!oauthReady||!code||!state||ck(req,'oauth_state')!==state||(states.get(state)||0)<=Date.now()){console.warn('OAuth callback rejected');out(res,400,{error:'Invalid OAuth callback'});return}states.delete(state);const tr=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:REDIRECT_URI})}).catch(()=>null);const token=await tr?.json().catch(()=>null) as {access_token?:string}|null;if(!tr?.ok||!token?.access_token){out(res,502,{error:'Token exchange failed'});return}const pr=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+token.access_token}}).catch(()=>null);const p=await pr?.json().catch(()=>null) as {id?:string;username?:string;avatar?:string|null;discriminator?:string}|null;if(!pr?.ok||!p?.id||!p.username){out(res,502,{error:'User lookup failed'});return}const billingState=await loadBilling(),known=billingState.users[p.id];if(known?.disabled){console.log('Login blocked (locked): '+p.username);set(res,'web_session','',0);res.writeHead(302,{location:'/dashboard?oauth=locked'});res.end();return}if(!known||known.username!==p.username){const created=!known;billingUser(billingState,p.id,p.username);await saveBilling(billingState);if(created)console.log('Billing user created at login: '+p.username)}storage.ensureFreePlan(p.id,p.username);const oldSid=sessionByUser.get(p.id);if(oldSid){sessions.delete(oldSid);await storage.deleteSession(oldSid)}const sid=randomBytes(32).toString('base64url');sessions.set(sid,{id:p.id,username:p.username,avatar:p.avatar ? 'https://cdn.discordapp.com/avatars/'+p.id+'/'+p.avatar+'.png?size=128' : null,allowed:true,expires:Date.now()+604800000});sessionByUser.set(p.id,sid);await storage.saveSession(sid,sessions.get(sid)!);console.log('OAuth session created');set(res,'web_session',sid,604800);res.writeHead(302,{location:'/dashboard?oauth=linked'});res.end();return}
if(req.method==='POST'&&u.pathname==='/auth/logout'){const id=ck(req,'web_session');if(id){const s=sessions.get(id);if(s){sessionByUser.delete(s.id);sessions.delete(id)}await storage.deleteSession(id)}set(res,'web_session','',0);res.writeHead(204);res.end();return}
if(req.method==='POST'&&u.pathname==='/api/config/toggle'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const billing=await loadBilling();const owner=billingUser(billing,x.id,x.username)
  if(owner.disabled&&!admin(x)){out(res,403,{error:'Tài khoản đã bị khóa.'});return}
  const owned=new Set([x.username,...owner.slots.filter(slot=>slotBound(slot)).map(slot=>slot.folder).filter((folder):folder is string=>Boolean(folder))])
  const names=admin(x)?await userNames():[],adminUsers=admin(x)?await adminConfigUsers(billing):[]
  try{
    const payload=await body(req),slotId=isObject(payload)&&typeof payload.slotId==='string'?payload.slotId:''
    const ownerId=isObject(payload)&&typeof payload.ownerId==='string'?payload.ownerId:''
    const selected=slotId?billingOwner(billing,x,ownerId):null
    const slot=slotId&&selected?selected.owner.slots.find(item=>item.id===slotId):undefined
    if(slotId&&(!selected||!slot)){out(res,403,{error:'Config access denied'});return}
    const requested=isObject(payload)&&typeof payload.user==='string'?payload.user:x.username
    const location=isObject(payload)&&typeof payload.location==='string'?payload.location:'active'
    const disabled=location==='disabled'&&admin(x)&&folderName(requested)===requested&&adminUsers.some(item=>item.location==='disabled'&&item.username===requested)
    if(location!=='active'&&!disabled){out(res,403,{error:'Config access denied'});return}
    if(slot&&!slotBound(slot)&&!admin(x)){out(res,409,{error:'Slot chưa gắn token.'});return}
    if(!slot&&!disabled&&!owned.has(requested)&&!names.includes(requested)){out(res,403,{error:'Config access denied'});return}
    if(freeConfigTarget(billing,owner,slot,requested)){out(res,403,{error:'Gói Free chỉ dùng được Auto Quest.'});return}
    let configs=slot?await slotConfigs(slot):disabled?await configsAt(join(DISABLED_CONFIG_DIR,requested)):await userConfigs(requested)
    if(slot&&admin(x)&&!configs?.exists){const archived=await archivedSlotRoot(slot.id);if(archived)configs=await configsAt(archived)}
    if(!configs){out(res,403,{error:'Config access denied'});return}
    if(!isObject(payload)||typeof payload.file!=='string'||!(payload.file in disabledFiles)){out(res,400,{error:'Invalid config file'});return}
    const file=payload.file as ConfigFile
    const disabledPath=join(configs.root,disabledFiles[file])
    const currentlyDisabled=Boolean(await stat(disabledPath).then(item=>item.isFile()).catch(()=>false))
    const nextDisabled=typeof payload.disabled==='boolean'?payload.disabled:typeof payload.enabled==='boolean'?!payload.enabled:!currentlyDisabled
    if (!nextDisabled) {
      const raw=await readFile(join(configs.root,configFiles[file]),'utf8').catch(()=>'')
      let data:unknown;try{data=JSON.parse(raw)}catch{out(res,409,{error:'Config JSON không hợp lệ.'});return}
      if (!valid(file,data)) { out(res,409,{error:'Config chưa đủ hoặc không hợp lệ.'});return }
      const value=data as Record<string,unknown>
      if ((file==='voice'||file==='voicepool') && (!String(value.Guild||'').trim()||!String(value.Channel||'').trim())) { out(res,409,{error:'Thiếu Guild ID hoặc Channel ID.'});return }
      if ((file==='chat'||file==='chatpool') && (!String(value.guildId||'').trim()||!String(value.channelId||'').trim())) { out(res,409,{error:'Thiếu Guild ID hoặc Channel ID.'});return }
      if ((file==='voicepool'||file==='chatpool') && configs.errors[file]) { out(res,409,{error:configs.errors[file]});return }
      if(file==='voicepool'||file==='chatpool'){ const limitOwner=slot?selected!.owner:Object.values(billing.users).find(user=>user.slots.some(item=>item.folder===requested))||owner, poolTokenLimit=poolTokenLimitFor(limitOwner), tokens=(value.Tokens as unknown[]).filter(token=>typeof token==='string'&&Boolean(token.trim())); if(tokens.length>poolTokenLimit){out(res,409,{error:'Gói này chỉ được tối đa '+poolTokenLimit+' token cho Multi Voice và Multi Chat.'});return} }
    }
    await mkdir(configs.root,{recursive:true})
    if(file==='config'&&currentlyDisabled&&!nextDisabled){
      const token=await readSingleToken(configs.root)
      if(!token){out(res,409,{error:'Slot chưa gắn token.'});return}
      try{await ensureDiscordActivityDisplay(token)}catch(error){
        out(res,502,{error:error instanceof Error?error.message:'Không thể bật Discord Activity Display.'});return
      }
    }
    if(nextDisabled){
      await writeFile(disabledPath,'')
    }else{
      await rm(disabledPath,{force:true})
    }
    out(res,200,{ok:true,file,disabled:nextDisabled,enabled:!nextDisabled});return
  }catch(error){out(res,error instanceof Error&&error.message==='Payload too large'?413:400,{error:'Invalid JSON'});return}
}
if(req.method==='POST'&&u.pathname==='/api/media/upload'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const billing=await loadBilling(),selected=billingOwner(billing,x,u.searchParams.get('ownerId')||'');if(!selected){out(res,403,{error:'Config access denied'});return}
  const quota=mediaLimitBytes(selected.owner),mediaRoot=await ownerMediaRoot(selected.owner);if(!quota){out(res,403,{error:'Kho ảnh chỉ dành cho gói trả phí.'});return}
  const type=String(req.headers['content-type']||'').split(';')[0].toLowerCase();if(!['image/png','image/jpeg','image/gif','image/webp'].includes(type)){out(res,415,{error:'Chỉ hỗ trợ PNG, JPEG, GIF hoặc WebP.'});return}
  try{const image=await imageBody(req,quota);const extension=imageExtension(image);if(!extension){out(res,415,{error:'File ảnh không hợp lệ.'});return}const name='library-'+Date.now()+'-'+randomBytes(3).toString('hex')+'.'+extension;await mkdir(mediaRoot,{recursive:true});if(await mediaBytes(mediaRoot)+image.length>quota){out(res,413,{error:'Kho ảnh đã đạt giới hạn của gói.'});return}await writeFile(join(mediaRoot,name),image,{mode:0o600});out(res,201,{name,url:MEDIA_BASE_URL+'/media/'+encodeURIComponent(folderName(selected.owner.username))+'/'+encodeURIComponent(name)});return}catch(error){out(res,error instanceof Error&&error.message==='Payload too large'?413:400,{error:error instanceof Error&&error.message==='Payload too large'?'Ảnh vượt quá dung lượng gói.':'Không thể lưu ảnh.'});return}
}
if(req.method==='DELETE'&&u.pathname==='/api/media'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}const billing=await loadBilling(),selected=billingOwner(billing,x,u.searchParams.get('ownerId')||'');if(!selected){out(res,403,{error:'Config access denied'});return}const mediaRoot=await ownerMediaRoot(selected.owner),name=u.searchParams.get('name')||'';if(!/^[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(name)){out(res,400,{error:'Ảnh không hợp lệ.'});return}await rm(join(mediaRoot,name),{force:true});out(res,200,{ok:true});return
}
if(req.method==='GET'&&u.pathname==='/api/media'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const billing=await loadBilling(),selected=billingOwner(billing,x,u.searchParams.get('ownerId')||'');if(!selected){out(res,403,{error:'Config access denied'});return}
  const owner=folderName(selected.owner.username),mediaRoot=await ownerMediaRoot(selected.owner),items=(await readdir(mediaRoot,{withFileTypes:true}).catch(()=>[])).filter(item=>item.isFile()&&/^[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(item.name)).map(item=>({name:item.name,url:MEDIA_BASE_URL+'/media/'+encodeURIComponent(owner)+'/'+encodeURIComponent(item.name)}))
  out(res,200,{items});return
}
if(req.method==='POST'&&u.pathname==='/api/chat/image'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const file=u.searchParams.get('file');if(file!=='chat'&&file!=='chatpool'){out(res,400,{error:'Loại Auto Chat không hợp lệ.'});return}
  const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase().replace('image/jpg','image/jpeg')
  if(!['image/png','image/jpeg','image/gif','image/webp'].includes(type)){out(res,415,{error:'Chỉ hỗ trợ PNG, JPEG, GIF hoặc WebP.'});return}
  const billing=await loadBilling(),owner=billingUser(billing,x.id,x.username)
  if(owner.disabled&&!admin(x)){out(res,403,{error:'Tài khoản đã bị khóa.'});return}
  const owned=new Set([x.username,...owner.slots.filter(slot=>slotBound(slot)).map(slot=>slot.folder).filter((folder):folder is string=>Boolean(folder))])
  const names=admin(x)?await userNames():[],adminUsers=admin(x)?await adminConfigUsers(billing):[]
  const slotId=u.searchParams.get('slotId'),selected=slotId?billingOwner(billing,x,u.searchParams.get('ownerId')||''):null
  const slot=slotId&&selected?selected.owner.slots.find(item=>item.id===slotId):undefined
  if(slotId&&(!selected||!slot)){out(res,403,{error:'Config access denied'});return}
  if(slot&&!slotBound(slot)&&!admin(x)){out(res,409,{error:'Slot chưa gắn token.'});return}
  const requested=u.searchParams.get('user')||x.username,location=u.searchParams.get('location')||'active'
  const disabled=location==='disabled'&&admin(x)&&folderName(requested)===requested&&adminUsers.some(item=>item.location==='disabled'&&item.username===requested)
  if(location!=='active'&&!disabled){out(res,403,{error:'Config access denied'});return}
  if(!slot&&!disabled&&!owned.has(requested)&&!names.includes(requested)){out(res,403,{error:'Config access denied'});return}
  if(freeConfigTarget(billing,owner,slot,requested)){out(res,403,{error:'Gói Free chỉ dùng được Auto Quest.'});return}
    let configs=slot?await slotConfigs(slot):disabled?await configsAt(join(DISABLED_CONFIG_DIR,requested)):await userConfigs(requested)
  if(slot&&admin(x)&&!configs?.exists){const archived=await archivedSlotRoot(slot.id);if(archived)configs=await configsAt(archived)}
  if(!configs){out(res,403,{error:'Config access denied'});return}
  try{
    const quota=mediaLimitBytes(owner);if(!quota){out(res,403,{error:'Kho ảnh chỉ dành cho gói Luna, Terra hoặc Sol.'});return}const image=await imageBody(req,quota);if(!image.length){out(res,400,{error:'File ảnh trống.'});return}
    const extension=imageExtension(image);if(!extension){out(res,415,{error:'Nội dung file không phải PNG, JPEG, GIF hoặc WebP.'});return}
    const ownerFolder=relative(MULTI_CONFIG_DIR,dirname(configs.root)),mediaRoot=join(MEDIA_ROOT_DIR,ownerFolder),name=file+'-image.'+extension
    await mkdir(mediaRoot,{recursive:true})
    const old=(await readdir(mediaRoot).catch(()=>[])).filter(item=>item.startsWith(file+'-image.')),oldBytes=await Promise.all(old.map(item=>stat(join(mediaRoot,item)).then(x=>x.size).catch(()=>0)))
    if((await mediaBytes(mediaRoot))-oldBytes.reduce((sum,size)=>sum+size,0)+image.length>quota){out(res,413,{error:'Kho ảnh đã đạt giới hạn của gói.'});return}
    await Promise.all(old.map(item=>rm(join(mediaRoot,item),{force:true})))
    await writeFile(join(mediaRoot,name),image,{mode:0o600})
    out(res,200,{image:'media/'+name,url:MEDIA_BASE_URL+'/media/'+ownerFolder.split('/').map(encodeURIComponent).join('/')+'/'+encodeURIComponent(name)});return
  }catch(error){out(res,error instanceof Error&&error.message==='Payload too large'?413:400,{error:error instanceof Error&&error.message==='Payload too large'?'Ảnh vượt quá dung lượng kho ảnh của gói.':'Không thể lưu ảnh.'});return}
}
if(req.method==='GET'&&u.pathname==='/api/discord/profile'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const billing=await loadBilling(),owner=billingUser(billing,x.id,x.username)
  if(owner.disabled&&!admin(x)){out(res,403,{error:'Tài khoản đã bị khóa.'});return}
  const slotId=u.searchParams.get('slotId')||'',selected=slotId?billingOwner(billing,x,u.searchParams.get('ownerId')||''):null
  const slot=selected?.owner.slots.find(item=>item.id===slotId)
  if(!slotId||!selected||!slot){out(res,403,{error:'Config access denied'});return}
  if(!slotBound(slot)){out(res,409,{error:'Slot chưa gắn token.'});return}
  if(freeConfigTarget(billing,owner,slot,slot.folder||'')){out(res,403,{error:'Gói Free chỉ dùng được Auto Quest.'});return}
  const configs=await slotConfigs(slot)
  if(!configs?.exists){out(res,409,{error:'Slot chưa gắn token.'});return}
  const token=await readSingleToken(configs.root);if(!token){out(res,409,{error:'Slot chưa gắn token.'});return}
  const response=await discordGet('https://discord.com/api/v10/users/@me',{Authorization:token})
  const value=await response?.json().catch(()=>null) as {id?:unknown;username?:unknown;global_name?:unknown;avatar?:unknown;banner?:unknown;accent_color?:unknown}|null
  if(!response?.ok||typeof value?.id!=='string'||typeof value.username!=='string'){out(res,502,{error:'Token sai hoặc đã hết hiệu lực.'});return}
  const avatar=typeof value.avatar==='string'&&value.avatar?'https://cdn.discordapp.com/avatars/'+value.id+'/'+value.avatar+'.'+(value.avatar.startsWith('a_')?'gif':'webp')+'?size=128':null
  const banner=typeof value.banner==='string'&&value.banner?'https://cdn.discordapp.com/banners/'+value.id+'/'+value.banner+'.'+(value.banner.startsWith('a_')?'gif':'webp')+'?size=600':null
  const accent=Number.isInteger(value.accent_color)&&Number(value.accent_color)>=0?'#'+Number(value.accent_color).toString(16).padStart(6,'0'):null
  out(res,200,{profile:{id:value.id,username:value.username,globalName:typeof value.global_name==='string'&&value.global_name?value.global_name:null,avatarUrl:avatar,bannerUrl:banner,accentColor:accent}});return
}
if(req.method==='GET'&&u.pathname==='/api/discord/channels'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const mode=u.searchParams.get('mode');if(mode!=='chat'&&mode!=='voice'){out(res,400,{error:'Mode không hợp lệ.'});return}
  const billing=await loadBilling(),owner=billingUser(billing,x.id,x.username)
  if(owner.disabled&&!admin(x)){out(res,403,{error:'Tài khoản đã bị khóa.'});return}
  const slotId=u.searchParams.get('slotId')||'',selected=slotId?billingOwner(billing,x,u.searchParams.get('ownerId')||''):null
  const slot=slotId&&selected?selected.owner.slots.find(item=>item.id===slotId):undefined
  if(slotId&&(!selected||!slot)){out(res,403,{error:'Config access denied'});return}
  if(slot&&!slotBound(slot)){out(res,409,{error:'Slot chưa gắn token.'});return}
  const requested=u.searchParams.get('user')||x.username,location=u.searchParams.get('location')||'active'
  const disabled=location==='disabled'&&admin(x)&&folderName(requested)===requested&&(await adminConfigUsers(billing)).some(item=>item.location==='disabled'&&item.username===requested)
  const owned=new Set([x.username,...owner.slots.filter(slot=>slotBound(slot)).map(slot=>slot.folder).filter((folder):folder is string=>Boolean(folder))])
  if(location!=='active'&&!disabled){out(res,403,{error:'Config access denied'});return}
  if(!slot&&!disabled&&!owned.has(requested)&&!(admin(x)&&(await userNames()).includes(requested))){out(res,403,{error:'Config access denied'});return}
  if(freeConfigTarget(billing,owner,slot,requested)){out(res,403,{error:'Gói Free chỉ dùng được Auto Quest.'});return}
  let configs=slot?await slotConfigs(slot):disabled?await configsAt(join(DISABLED_CONFIG_DIR,requested)):await userConfigs(requested)
  if(slot&&admin(x)&&!configs?.exists){const archived=await archivedSlotRoot(slot.id);if(archived)configs=await configsAt(archived)}
  if(!configs){out(res,403,{error:'Config access denied'});return}
  const token=await readSingleToken(configs.root);if(!token){out(res,409,{error:'Slot chưa gắn token.'});return}
  try{out(res,200,{mode,guilds:(await discordDirectory(token,mode,u.searchParams.get('guildId')||'')).guilds});return}
  catch(error){out(res,502,{error:error instanceof Error?error.message:'Không thể tải guild/channel.'});return}
}
if(u.pathname==='/api/owo/cash'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  if(req.method!=='POST'){out(res,405,{error:'Method not allowed'});return}
  const billing=await loadBilling(),owner=billingUser(billing,x.id,x.username)
  if(owner.disabled&&!admin(x)){out(res,403,{error:'Tài khoản đã bị khóa.'});return}
  const slotId=u.searchParams.get('slotId')||'',selected=slotId?billingOwner(billing,x,u.searchParams.get('ownerId')||''):null
  const slot=selected?.owner.slots.find(item=>item.id===slotId)
  if(!slotId||!selected||!slot){out(res,403,{error:'Config access denied'});return}
  if(!slotBound(slot)){out(res,409,{error:'Slot chưa gắn token.'});return}
  if(freeConfigTarget(billing,owner,slot,slot.folder||'')){out(res,403,{error:'Gói Free chỉ dùng được Auto Quest.'});return}
  const configs=await slotConfigs(slot)
  if(!configs?.exists||!await readSingleToken(configs.root)){out(res,409,{error:'Slot chưa gắn token.'});return}
  const configPath=join(configs.root,'owo.json'),requestPath=join(configs.root,'owo-cash-request.json'),resultPath=join(configs.root,'owo-cash-result.json')
  const parsed=parseOwoConfig(await readFile(configPath,'utf8').then(JSON.parse).catch(()=>null))
  if(!parsed.ok){out(res,409,{error:parsed.error});return}
  const channelId=cashChannelId(parsed.value)
  if(!/^\d{17,20}$/.test(channelId)){out(res,409,{error:'Lưu kênh Số dư trước.'});return}
  if(owoCashRequests.has(configs.root)){out(res,409,{error:'Đang lấy số dư.'});return}
  owoCashRequests.add(configs.root)
  const id=randomBytes(18).toString('base64url')
  try{
    await writeFileAtomic(requestPath,JSON.stringify({id})+'\n',{mode:0o600})
    const result=await waitOwoCash(resultPath,id)
    if('cash' in result&&typeof result.cash==='number'){out(res,200,result);return}
    out(res,504,{error:result.error});return
  }finally{
    owoCashRequests.delete(configs.root)
    await rm(requestPath,{force:true}).catch(()=>undefined)
  }
}
if(u.pathname==='/api/owo'){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const billing=await loadBilling(),owner=billingUser(billing,x.id,x.username)
  if(owner.disabled&&!admin(x)){out(res,403,{error:'Tài khoản đã bị khóa.'});return}
  const slotId=u.searchParams.get('slotId')||'',selected=slotId?billingOwner(billing,x,u.searchParams.get('ownerId')||''):null
  const slot=selected?.owner.slots.find(item=>item.id===slotId)
  if(!slotId||!selected||!slot){out(res,403,{error:'Config access denied'});return}
  if(!slotBound(slot)){out(res,409,{error:'Slot chưa gắn token.'});return}
  if(freeConfigTarget(billing,owner,slot,slot.folder||'')){out(res,403,{error:'Gói Free chỉ dùng được Auto Quest.'});return}
  const configs=await slotConfigs(slot)
  if(!configs?.exists||!await readSingleToken(configs.root)){out(res,409,{error:'Slot chưa gắn token.'});return}
  const configPath=join(configs.root,'owo.json'),statusPath=join(configs.root,'owo-status.json')
  if(req.method==='GET'){
    const config=await readFile(configPath,'utf8').then(raw=>JSON.parse(raw)).catch(()=>null)
    const status=await readFile(statusPath,'utf8').then(raw=>parseOwoStatus(JSON.parse(raw))).catch(stoppedStatus)
    out(res,200,{config,status});return
  }
  if(req.method==='PUT'){
    const payload=await body(req).catch(()=>null),parsed=parseOwoConfig(payload)
    if(!parsed.ok){out(res,400,{error:parsed.error});return}
    const previous=await readFile(configPath,'utf8').then(raw=>parseOwoConfig(JSON.parse(raw))).catch(()=>null)
    const wasSlotEnabled=previous?.ok&&previous.value.groups?.slot?.enabled===true
    const resetSlotStats=!wasSlotEnabled&&parsed.value.groups?.slot?.enabled===true
    if(resetSlotStats)await writeFileAtomic(statusPath,JSON.stringify({...stoppedStatus(),updatedAt:Date.now()})+'\n',{mode:0o600})
    await writeFileAtomic(configPath,JSON.stringify(parsed.value,null,2)+'\n',{mode:0o600})
    out(res,200,{config:parsed.value});return
  }
  out(res,405,{error:'Method not allowed'});return
}
if(u.pathname==="/api/mention-log"){
  const x=session(req);if(!x){out(res,401,{error:"Login required"});return}
  if(req.method!=="DELETE"){out(res,405,{error:"Method not allowed"});return}
  const payload=await body(req).catch(()=>null)
  const deleteAll=isObject(payload)&&payload.deleteAll===true
  const ids=isObject(payload)&&Array.isArray(payload.ids)?[...new Set(payload.ids.filter((id):id is string=>typeof id==="string"&&/^[a-f0-9]{64}$/.test(id)!))].slice(0,20):[]
  if(!deleteAll&&!ids.length){out(res,400,{error:"Chọn ít nhất một tin nhắn."});return}
  const billing=await loadBilling(),owner=billingUser(billing,x.id,x.username)
  if(owner.disabled&&!admin(x)){out(res,403,{error:"Tài khoản đã bị khóa."});return}
  const owned=new Set([x.username,...owner.slots.filter(slot=>slotBound(slot)).map(slot=>slot.folder).filter((folder):folder is string=>Boolean(folder))])
  const slotId=u.searchParams.get("slotId")||"",selected=slotId?billingOwner(billing,x,u.searchParams.get("ownerId")||""):null
  const slot=selected?.owner.slots.find(item=>item.id===slotId)
  if(slotId&&(!selected||!slot)){out(res,403,{error:"Config access denied"});return}
  const requested=u.searchParams.get("user")||x.username,location=u.searchParams.get("location")||"active"
  const disabled=location==="disabled"&&admin(x)&&folderName(requested)===requested&&(await adminConfigUsers(billing)).some(item=>item.location==="disabled"&&item.username===requested)
  if(location!=="active"&&!disabled){out(res,403,{error:"Config access denied"});return}
  if(slot&&!slotBound(slot)&&!admin(x)){out(res,409,{error:"Slot chưa gắn token."});return}
  if(!slot&&!disabled&&!owned.has(requested)&&!(admin(x)&&(await userNames()).includes(requested))){out(res,403,{error:"Config access denied"});return}
  if(freeConfigTarget(billing,owner,slot,requested)){out(res,403,{error:"Gói Free chỉ dùng được Auto Quest."});return}
  let configs=slot?await slotConfigs(slot):disabled?await configsAt(join(DISABLED_CONFIG_DIR,requested)):await userConfigs(requested)
  if(slot&&admin(x)&&!configs?.exists){const archived=await archivedSlotRoot(slot.id);if(archived)configs=await configsAt(archived)}
  if(!configs||!configs.exists){out(res,409,{error:"Slot chưa gắn token."});return}
  const path=join(configs.root,"mention-log.json")
  const entries=await readMentionLog(configs.root)
  const next=deleteAll?[]:entries.filter(entry=>!ids.includes(mentionLogId(entry)))
  if(next.length!==entries.length||deleteAll)await writeFileAtomic(path,JSON.stringify(next,null,2)+"\n",{mode:0o600})
  const identity=await storedIdentity(configs.root)
  const enriched=next.map(item=>isObject(item)?{...item,id:mentionLogId(item),mentionedUserId:typeof item.mentionedUserId==="string"&&item.mentionedUserId?item.mentionedUserId:identity?.userId||"",mentionedUsername:typeof item.mentionedUsername==="string"&&item.mentionedUsername?item.mentionedUsername:identity?.username||""}:item)
  out(res,200,{mentionLog:enriched});return
}
 if(u.pathname==="/api/config"){
  const x=session(req);if(!x){out(res,401,{error:'Login required'});return}
  const billing=await loadBilling();const owner=billingUser(billing,x.id,x.username)
  if(owner.disabled&&!admin(x)){out(res,403,{error:'Tài khoản đã bị khóa.'});return}
  const owned=new Set([x.username,...owner.slots.filter(slot=>slotBound(slot)).map(slot=>slot.folder).filter((folder):folder is string=>Boolean(folder))])
  if(req.method==='GET'){
    const slotId=u.searchParams.get('slotId'),selected=slotId?billingOwner(billing,x,u.searchParams.get('ownerId')||''):null
    const slot=slotId&&selected?selected.owner.slots.find(item=>item.id===slotId):undefined
    if(slotId&&(!selected||!slot)){out(res,403,{error:'Config access denied'});return}
    if(slot&&!slotBound(slot)&&!admin(x)){out(res,200,{exists:false,files:Object.fromEntries(Object.keys(configFiles).map(file=>[file,null]))});return}
    const requested=u.searchParams.get('user')||x.username,location=u.searchParams.get('location')||'active'
    const disabled=location==='disabled'&&admin(x)&&folderName(requested)===requested&&(await adminConfigUsers(billing)).some(item=>item.location==='disabled'&&item.username===requested)
    if(location!=='active'&&!disabled){out(res,403,{error:'Config access denied'});return}
    if(!slot&&!disabled&&!owned.has(requested)&&!(admin(x)&&(await userNames()).includes(requested))){out(res,403,{error:'Config access denied'});return}
    if(freeConfigTarget(billing,owner,slot,requested)){out(res,403,{error:'Gói Free chỉ dùng được Auto Quest.'});return}
    let configs=slot?await slotConfigs(slot):disabled?await configsAt(join(DISABLED_CONFIG_DIR,requested)):await userConfigs(requested)
    if(slot&&admin(x)&&!configs?.exists){const archived=await archivedSlotRoot(slot.id);if(archived)configs=await configsAt(archived)}
    if(!configs){out(res,403,{error:'Config access denied'});return}
    const mentionIdentity=await storedIdentity(configs.root)
    const mentionLog=await readMentionLog(configs.root)
    const enrichedMentionLog=mentionLog.map(item=>isObject(item)?{...item,id:mentionLogId(item),mentionedUserId:typeof item.mentionedUserId==='string'&&item.mentionedUserId?item.mentionedUserId:mentionIdentity?.userId||'',mentionedUsername:typeof item.mentionedUsername==='string'&&item.mentionedUsername?item.mentionedUsername:mentionIdentity?.username||''}:item)
    const files=admin(x)?configs.files:{...configs.files,voicepool:null}
    const configDisabled=admin(x)?configs.disabled:{...configs.disabled,voicepool:true}
    const errors=admin(x)?configs.errors:{...configs.errors,voicepool:''}
    const premiumType=await configPremiumType(configs.root)
    out(res,200,{exists:configs.exists,files,disabled:configDisabled,errors,configLimit:(slot||Object.values(billing.users).flatMap(user=>user.slots).find(item=>item.folder===requested))?.configLimit??1,statusLimit:statusLimitFor(slot?selected!.owner:Object.values(billing.users).find(user=>user.slots.some(item=>item.folder===requested))||owner),premiumType,mentionLog:enrichedMentionLog});return
  }
  if(req.method==='POST'){
    try{
      const payload=await body(req),slotId=isObject(payload)&&typeof payload.slotId==='string'?payload.slotId:''
      const ownerId=isObject(payload)&&typeof payload.ownerId==='string'?payload.ownerId:''
      const selected=slotId?billingOwner(billing,x,ownerId):null
      const slot=slotId&&selected?selected.owner.slots.find(item=>item.id===slotId):undefined
      if(slotId&&(!selected||!slot)){out(res,403,{error:'Config access denied'});return}
      const requested=isObject(payload)&&typeof payload.user==='string'?payload.user:x.username
      const location=isObject(payload)&&typeof payload.location==='string'?payload.location:'active'
      const disabled=location==='disabled'&&admin(x)&&folderName(requested)===requested&&(await adminConfigUsers(billing)).some(item=>item.location==='disabled'&&item.username===requested)
      if(location!=='active'&&!disabled){out(res,403,{error:'Config access denied'});return}
      if(slot&&!slotBound(slot)&&!admin(x)){out(res,409,{error:'Slot chưa gắn token.'});return}
      if(!slot&&!disabled&&!owned.has(requested)&&!(admin(x)&&(await userNames()).includes(requested))){out(res,403,{error:'Config access denied'});return}
      if(freeConfigTarget(billing,owner,slot,requested)){out(res,403,{error:'Gói Free chỉ dùng được Auto Quest.'});return}
    let configs=slot?await slotConfigs(slot):disabled?await configsAt(join(DISABLED_CONFIG_DIR,requested)):await userConfigs(requested)
      if(slot&&admin(x)&&!configs?.exists){const archived=await archivedSlotRoot(slot.id);if(archived)configs=await configsAt(archived)}
      if(!configs){out(res,403,{error:'Config access denied'});return}
      if(!isObject(payload)||typeof payload.file!=='string'||!(payload.file in configFiles)){out(res,400,{error:'Invalid config file'});return}
      const file=payload.file as ConfigFile;if(file==='voicepool'&&!admin(x)){out(res,403,{error:'Multi Voice chỉ dành cho quản trị.'});return}
      let data=payload.data as Record<string,unknown>
      let savedScene: { index: number; count: number; original: string|null }|undefined
      if(file==='config'&&payload.saveScene===true){
        if(!isObject(data)||!isObject(data.setup)||!isObject(data.config)){out(res,400,{error:'Invalid scene data'});return}
        const original=await readFile(join(configs.root,configFiles.config),'utf8').catch(()=>null)
        const stored=original?JSON.parse(original) as Record<string,unknown>:{}
        if(!isObject(stored)){out(res,400,{error:'Invalid stored config'});return}
        const scenes=Array.isArray(stored.configs)?[...stored.configs]:isObject(stored.setup)&&isObject(stored.config)?[{setup:stored.setup,config:stored.config}]:[]
        let index:number
        if(payload.sceneIndex===null){index=scenes.length;scenes.push(data)}
        else{
          index=payload.sceneIndex as number
          if(!Number.isSafeInteger(index)||index<0||index>=scenes.length||
            !isObject(payload.expectedScene)||JSON.stringify(scenes[index])!==JSON.stringify(payload.expectedScene)){
            out(res,409,{error:'Scene đã thay đổi trên server; tải lại trước khi lưu.'});return
          }
          scenes[index]=data
        }
        savedScene={index,count:scenes.length,original}
        data={...stored,configs:scenes}
      }
      if(!valid(file,data)){out(res,400,{error:'Invalid config data'});return}
      if(file==='config'){
        const target=slot||Object.values(billing.users).flatMap(user=>user.slots).find(item=>item.folder===requested)
        const limit=target?.configLimit??1
        if(('simultaneous' in data&&typeof data.simultaneous!=='boolean')||
          (data.simultaneous===true&&(!Array.isArray(data.configs)||data.configs.length<2||data.configs.length>limit))){
          out(res,400,{error:'Hiện đồng thời cần ít nhất 2 scene và gói hỗ trợ đủ số scene.'});return
        }
        const scenes=Array.isArray(data.configs)?data.configs:[data]
        if(scenes.some(scene=>isObject(scene)&&isObject(scene.setup)&&
          'applicationId' in scene.setup&&
          (typeof scene.setup.applicationId!=='string'||!/^\d{17,20}$/.test(scene.setup.applicationId)))){
          out(res,400,{error:'Application ID phải gồm 17-20 chữ số.'});return
        }
        if(Array.isArray(data.configs)&&data.configs.length>limit){
          out(res,400,{error:'Token này chỉ được tối đa '+limit+' scene Rich Presence.'});return
        }
        if(Array.isArray(data.configs)&&data.configs.length>1&&data.configs.some(c=>isObject(c)&&isObject((c as any).setup)&&(c as any).setup.mode==='SPOTIFY')){
          out(res,400,{error:'Không thể dùng mode SPOTIFY khi có hơn 1 scene.'});return
        }
      }
      if(file==='status'){
        const statusOwner=slot?selected!.owner:Object.values(billing.users).find(user=>user.slots.some(item=>item.folder===requested))||owner,statusLimit=statusLimitFor(statusOwner)
        if(Array.isArray(data.statuses)&&data.statuses.length>statusLimit){out(res,400,{error:'Gói này chỉ được tối đa '+statusLimit+' status.'});return}
        if(Array.isArray(data.texts)&&data.texts.length>statusLimit){out(res,400,{error:'Gói này chỉ được tối đa '+statusLimit+' status.'});return}
        const premiumType=await configPremiumType(configs.root),emojiError=statusEmojiAccessError(data,premiumType)
        if(emojiError){out(res,400,{error:emojiError});return}
      }
      let saveData:unknown=data,rejectedTokens:{token:string,reason:string}[]|undefined,activeCount:number|undefined,forcedDisabled=false
      if(file==='voice'||file==='chat'){
        const guildId=String(file==='voice'?data.Guild:data.guildId),channelId=String(file==='voice'?data.Channel:data.channelId)
        const token=await readSingleToken(configs.root)
        if(!token){out(res,409,{error:'Slot chưa gắn token.'});return}
        const verify=await verifyGuildAndChannel(token,guildId,channelId,file==='voice'?'voice':'chat');if(!verify.ok){out(res,400,{error:verify.reason});return}
      } else if(file==='voicepool'||file==='chatpool'){
        const guildId=String(file==='voicepool'?data.Guild:data.guildId),channelId=String(file==='voicepool'?data.Channel:data.channelId)
        const tokens=(data.Tokens as unknown[]).filter((t):t is string=>typeof t==='string'&&Boolean(t))
        const limitOwner=slot?selected!.owner:Object.values(billing.users).find(user=>user.slots.some(item=>item.folder===requested))||owner,poolTokenLimit=poolTokenLimitFor(limitOwner)
        if(tokens.length>poolTokenLimit){out(res,400,{error:'Gói này chỉ được tối đa '+poolTokenLimit+' token cho Multi Voice và Multi Chat.'});return}
        const results=await Promise.all(tokens.map(async token=>({token,verify:await verifyGuildAndChannel(token,guildId,channelId)})))
        const validTokens=results.filter(r=>r.verify.ok).map(r=>r.token)
        rejectedTokens=results.filter(r=>!r.verify.ok).map(r=>({token:maskToken(r.token),reason:(r.verify as {reason:string}).reason}))
        if(tokens.length>0&&!validTokens.length){
          out(res,400,{error:'Không token nào hợp lệ; config cũ được giữ nguyên.',rejectedTokens,activeCount:0,forcedDisabled:true});return
        }
        activeCount=validTokens.length
        forcedDisabled=tokens.length>0&&validTokens.length===0
        saveData={...data,Tokens:validTokens}
      }
      const configPath=join(configs.root,configFiles[file]),configured=Boolean(await stat(configPath).then(item=>item.isFile()).catch(()=>false))
      const serialized=JSON.stringify(saveData,null,2)+'\n'
      await mkdir(configs.root,{recursive:true})
      const previous=await readFile(configPath,'utf8').catch(()=>null)
      if(savedScene&&previous!==savedScene.original){out(res,409,{error:'Scene đã thay đổi trên server; tải lại trước khi lưu.'});return}
      if(previous!==serialized)await writeFileAtomic(configPath,serialized)
      if(file==='voicepool'||file==='chatpool')await writeFileAtomic(join(configs.root,file+'-status.json'),'{"invalidTokens":[]}\n',{mode:0o600})
      if(!configured||forcedDisabled)await writeFile(join(configs.root,disabledFiles[file]),'')
      out(res,200,{ok:true,...(savedScene?{sceneIndex:savedScene.index,sceneCount:savedScene.count}:{}),...(rejectedTokens?{rejectedTokens,activeCount,forcedDisabled}:{})});return
    }catch(error){out(res,error instanceof Error&&error.message==='Payload too large'?413:400,{error:'Invalid JSON'});return}
  }
  out(res,405,{error:'Method not allowed'});return
}
if(req.method==='GET'&&u.pathname.startsWith('/media/')){const[, ,owner,file]=u.pathname.split('/');if(!owner||!file||folderName(owner)!==owner||!/^[\w.-]+\.(png|jpe?g|gif|webp)$/.test(file)){res.writeHead(404);res.end('Not found');return}const p=join(MEDIA_ROOT_DIR,owner,file),ok=await stat(p).then(x=>x.isFile()).catch(()=>false);if(!ok){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'content-type':mediaType(file),'cache-control':'public, max-age=31536000, immutable'});createReadStream(p).pipe(res);return}
if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405);res.end('Method not allowed');return}
const immutableAssetCache = 'public, max-age=31536000, immutable'
const webAssets: Record<string, [string, string, string?]> = {'/desktop.css':['desktop.css','text/css; charset=utf-8',immutableAssetCache],'/mobile.css':['mobile.css','text/css; charset=utf-8',immutableAssetCache],'/mention-log.js':['mention-log.js','application/javascript; charset=utf-8',immutableAssetCache],'/dashboard-boneyard.js':['dashboard-boneyard.js','application/javascript; charset=utf-8',immutableAssetCache],'/app.js':['app.js','application/javascript; charset=utf-8',immutableAssetCache],'/home.css':['home.css','text/css; charset=utf-8'],'/home.js':['home.js','application/javascript; charset=utf-8'],'/superutils-logo-v1.png':['superutils-logo-v1.png','image/png',immutableAssetCache],'/Little-Thiing-Regular.otf':['Little-Thiing-Regular.otf','font/otf',immutableAssetCache],'/home-logo.webp':['home-logo.webp','image/webp'],'/home-showcase-config.webp':['home-showcase-config.webp','image/webp'],'/home-showcase-result.webp':['home-showcase-result.webp','image/webp'],...Object.fromEntries([400,500,600,700,800,900].map(weight=>[`/font-be-vietnam-pro-${weight}.ttf`,[`font-be-vietnam-pro-${weight}.ttf`,'font/ttf',immutableAssetCache]])),...Object.fromEntries(['extract.js','runtime.js','shared.js','types.js'].map(file=>['/boneyard/'+file,['../../node_modules/boneyard-js/dist/'+file,'application/javascript; charset=utf-8',immutableAssetCache]]))}
if(u.pathname in webAssets){const [file,type,cacheControl='no-store']=webAssets[u.pathname];res.writeHead(200,{'content-type':type,'cache-control':cacheControl});if(req.method==='HEAD'){res.end();return}res.end(await readFile(join(WEB_ASSET_DIR,file)));return}
if(u.pathname==='/' ){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});if(req.method==='HEAD'){res.end();return}res.end(await readFile(join(WEB_ASSET_DIR,'home.html'),'utf8'));return}
if(u.pathname==='/home'){res.writeHead(302,{location:'/'});res.end();return}
const legacyDashboardRoutes: Record<string,string> = {'/deposit':'/dashboard/deposit','/billing':'/dashboard/plan','/admin':'/dashboard/admin','/voice':'/dashboard/voice','/voicepool':'/dashboard/voicepool','/chat':'/dashboard/chat','/chatpool':'/dashboard/chatpool','/stream':'/dashboard/stream','/quest':'/dashboard/quest','/api-page':'/dashboard/api'}
if(u.pathname in legacyDashboardRoutes){res.writeHead(302,{location:legacyDashboardRoutes[u.pathname]});res.end();return}
const dashboardRoutes = new Set(['/dashboard','/dashboard/rpc','/dashboard/media','/dashboard/status','/dashboard/voice','/dashboard/voicepool','/dashboard/chat','/dashboard/mention','/dashboard/chatpool','/dashboard/stream','/dashboard/quest','/dashboard/owo','/dashboard/api','/dashboard/plan','/dashboard/deposit','/dashboard/admin'])
if(!dashboardRoutes.has(u.pathname)){res.writeHead(404);res.end('Not found');return}const mobile=mobilePageRequest(req,u);res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','accept-ch':'Sec-CH-UA-Mobile, Viewport-Width','vary':'Sec-CH-UA-Mobile, Viewport-Width, User-Agent'});if(req.method==='HEAD'){res.end();return}res.end(await dashboardPage(mobile?'mobile.html':'desktop.html'))
}).listen(WEB_PORT,WEB_HOST,()=>console.log('Config generator listening on http://'+WEB_HOST+':'+WEB_PORT))
}
