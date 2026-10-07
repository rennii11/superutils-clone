import type { DatabaseSync } from 'node:sqlite'

export const TOKEN_NOTICE_INTERVALS_MS = [1, 3, 6, 12, 24].map(hours => hours * 60 * 60 * 1000)
export const DEFAULT_TOKEN_NOTICE_INTERVAL_MS = TOKEN_NOTICE_INTERVALS_MS[0]
export function tokenNoticeIntervalMs(value: unknown) {
  return typeof value === 'number' && TOKEN_NOTICE_INTERVALS_MS.includes(value) ? value : DEFAULT_TOKEN_NOTICE_INTERVAL_MS
}
export function shouldSendInvalidTokenDm(enabled: boolean, sentAt: number | null, now: number, intervalMs: unknown) {
  return sentAt === null || (enabled && sentAt <= now - tokenNoticeIntervalMs(intervalMs))
}

export type SlotArchiveReason = 'token_missing'|'token_invalid'|'slot_expired'|'orphan'

export function invalidTokenNotice(position: number, slotCount: number) {
  const detail=slotCount>1?'Token #'+(position+1)+' của bạn':'Token của bạn'
  return 'Thông báo từ Discord Client: '+detail+' đã hết hiệu lực, vui lòng cập nhật token mới để sử dụng tiếp.'
}

export function tokenWebhookNotice(username:string,position:number,slotCount:number,recovered:boolean) {
  const target=slotCount>1?'Token #'+(position+1)+' của account '+username:'Token của account '+username
  return target+(recovered?' đã được cập nhật lại':' đã hết hiệu lực')
}

export function slotArchiveNotice(position:number,slotCount:number,reason:SlotArchiveReason) {
  if(reason==='slot_expired'){
    const detail=slotCount>1?'Token #'+(position+1)+' của bạn':'Token của bạn'
    return 'Thông báo từ Discord Client: '+detail+' đã hết hạn, vui lòng gia hạn để tiếp tục sử dụng.'
  }
  return invalidTokenNotice(position,slotCount)
}

export function slotArchiveWebhookNotice(username:string,position:number,slotCount:number,reason:SlotArchiveReason,recovered:boolean) {
  if(reason==='slot_expired'){
    const target=slotCount>1?'Token #'+(position+1)+' của '+username:'Token của '+username
    return target+(recovered?' đã được gia hạn và khôi phục lại':' đã hết hạn')
  }
  return tokenWebhookNotice(username,position,slotCount,recovered)
}

export function ensureTokenHealthColumns(db: DatabaseSync) {
  const columns=db.prepare('PRAGMA table_info(billing_slots)').all() as {name:string}[]
  if(!columns.some(row=>row.name==='token_state')){
    db.exec("ALTER TABLE billing_slots ADD COLUMN token_state TEXT NOT NULL DEFAULT 'none' CHECK (token_state IN ('none','active','invalid'))")
    db.exec("UPDATE billing_slots SET token_state = 'active' WHERE token_user_id IS NOT NULL OR token_username IS NOT NULL")
  }
  if(!columns.some(row=>row.name==='invalid_notice_sent_at'))db.exec('ALTER TABLE billing_slots ADD COLUMN invalid_notice_sent_at INTEGER')
  if(!columns.some(row=>row.name==='invalid_dm_notice_sent_at'))db.exec('ALTER TABLE billing_slots ADD COLUMN invalid_dm_notice_sent_at INTEGER')
  if(!columns.some(row=>row.name==='invalid_webhook_notice_sent_at'))db.exec('ALTER TABLE billing_slots ADD COLUMN invalid_webhook_notice_sent_at INTEGER')
  const userColumns=db.prepare('PRAGMA table_info(billing_users)').all() as {name:string}[]
  if(!userColumns.some(row=>row.name==='token_notice_enabled'))db.exec('ALTER TABLE billing_users ADD COLUMN token_notice_enabled INTEGER NOT NULL DEFAULT 1')
  if(!userColumns.some(row=>row.name==='token_notice_interval_ms'))db.exec('ALTER TABLE billing_users ADD COLUMN token_notice_interval_ms INTEGER NOT NULL DEFAULT 3600000')
  db.exec("UPDATE billing_slots SET invalid_dm_notice_sent_at=CASE WHEN invalid_notice_sent_at<0 THEN -invalid_notice_sent_at WHEN invalid_notice_sent_at>0 THEN invalid_notice_sent_at END, invalid_webhook_notice_sent_at=CASE WHEN invalid_notice_sent_at>0 THEN invalid_notice_sent_at END WHERE token_state='invalid' AND (invalid_dm_notice_sent_at IS NULL OR invalid_webhook_notice_sent_at IS NULL)")
  if(!columns.some(row=>row.name==='canonical_folder'))db.exec('ALTER TABLE billing_slots ADD COLUMN canonical_folder TEXT')
}

export function invalidateTokenSlot(db: DatabaseSync, slotId: string, folder: string, tokenUserId: string) {
  return Number(db.prepare("UPDATE billing_slots SET folder = NULL, token_user_id = NULL, token_username = NULL, token_state = 'invalid', invalid_notice_sent_at = NULL WHERE id = ? AND folder = ? AND token_user_id = ?").run(slotId,folder,tokenUserId).changes)
}
