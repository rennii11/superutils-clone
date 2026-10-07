import { PLANS, isPlanId, createPlanSchema, syncPlanExpiry, slotAccess, PLAN_MONTH_MS, reminderDays, type Subscription } from './plans.js'
import { chmodSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { FREE_COOLDOWN_MS, FREE_EXPIRES_AT, FreePlanError } from './free-plan.js'
import { DatabaseSync } from 'node:sqlite'
import { tokenNoticeIntervalMs } from '../multi/token-notice.js'

export type Session = { id: string; username: string; avatar: string | null; allowed: boolean; expires: number; mode?: 'admin'|'user' }
export type BillingSlot = { legacy?:boolean; parked?:boolean; configLimit?:number; free?: boolean; id: string; folder: string | null; tokenUserId: string | null; tokenUsername: string | null; tokenState: 'none'|'active'|'invalid'; invalidNoticeSentAt: number | null; startsAt: number | null; expiresAt: number }
export type BillingUser = { plan?:Subscription; username: string; balance: number; slotLimit: number; disabled: boolean; tokenNoticeEnabled: boolean; tokenNoticeIntervalMs: number; slots: BillingSlot[] }
export type BillingPayment = { id:string; userId:string; provider:string; orderCode:number; invoice:string; amount:number; status:'pending'|'paid'|'expired'|'failed'; checkoutUrl:string; qrImage:string; createdAt?:number; expiresAt:number; reference?:string; paidAt?:number; declaredAmount?:number; actualValue?:number; cardTelco?:string; cardSerial?:string; callbackSign?:string; providerStatus?:number; providerMessage?:string; purpose?:'topup'|'plan'; requestId?:string; planId?:string; planVersion?:number }
export type BillingDebit = { id:number; userId:string; amount:number; kind:'buy'|'renew'; detail:string; createdAt:number }
export type BillingState = { price: number; users: Record<string, BillingUser>; payments: BillingPayment[] }

type StorageOptions = {
  billingDatabaseFile: string
  sessionDatabaseFile: string
  defaultPrice: number
}

type Row = Record<string, string | number | bigint | null>

export class WebStorage {
  private readonly billingDb: DatabaseSync
  private readonly sessionDb: DatabaseSync
  private readonly defaultPrice: number
  private readonly billingBaselines = new WeakMap<BillingState, BillingState>()

  constructor(options: StorageOptions) {
    if (options.billingDatabaseFile === options.sessionDatabaseFile) throw new Error('Billing and session databases must be separate files.')
    this.defaultPrice = options.defaultPrice
    this.billingDb = new DatabaseSync(options.billingDatabaseFile)
    this.sessionDb = new DatabaseSync(options.sessionDatabaseFile)
    chmodSync(options.billingDatabaseFile, 0o600)
    chmodSync(options.sessionDatabaseFile, 0o600)
    this.billingDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.sessionDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
    this.createSchema()
    createPlanSchema(this.billingDb)
  }

  private createSchema() {
    const legacyLedgerExists=Boolean(this.billingDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_plan_accounts'").get())
    // Remove the old IP constraint without losing grants or cooldown history.
    if ((this.billingDb.prepare('PRAGMA table_info(free_claims)').all() as Row[]).some(row=>row.name==='ip_key')) {
      this.transaction(this.billingDb,()=>this.billingDb.exec(`
        DROP TRIGGER IF EXISTS remember_legacy_plan;
        CREATE TABLE free_claims_without_ip (owner_id TEXT PRIMARY KEY, slot_id TEXT NOT NULL UNIQUE, claimed_at INTEGER NOT NULL);
        INSERT INTO free_claims_without_ip SELECT owner_id,slot_id,claimed_at FROM free_claims;
        DROP TABLE free_claims;
        ALTER TABLE free_claims_without_ip RENAME TO free_claims;
      `))
    }
    this.billingDb.exec(`
      CREATE TABLE IF NOT EXISTS billing_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS billing_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        balance INTEGER NOT NULL CHECK (balance >= 0),
        slot_limit INTEGER NOT NULL CHECK (slot_limit >= 1),
        token_notice_enabled INTEGER NOT NULL DEFAULT 1,
        token_notice_interval_ms INTEGER NOT NULL DEFAULT 3600000
      );
      CREATE TABLE IF NOT EXISTS billing_slots (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES billing_users(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        folder TEXT,
        token_user_id TEXT,
        token_username TEXT,
        token_state TEXT NOT NULL DEFAULT 'none' CHECK (token_state IN ('none','active','invalid')),
        invalid_notice_sent_at INTEGER,
        started_at INTEGER,
        expires_at INTEGER NOT NULL,
        UNIQUE (owner_id, position)
      );
      CREATE INDEX IF NOT EXISTS billing_slots_owner ON billing_slots(owner_id, position);
      CREATE TABLE IF NOT EXISTS billing_payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES billing_users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        order_code INTEGER NOT NULL,
        invoice TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount >= 0),
        status TEXT NOT NULL CHECK (status IN ('pending','paid','expired','failed')),
        checkout_url TEXT NOT NULL,
        qr_image TEXT NOT NULL,
        created_at INTEGER,
        expires_at INTEGER NOT NULL,
        reference TEXT,
        paid_at INTEGER,
        declared_amount INTEGER,
        actual_value INTEGER,
        card_telco TEXT,
        card_serial TEXT,
        callback_sign TEXT,
        provider_status INTEGER,
        provider_message TEXT,
        purpose TEXT NOT NULL DEFAULT 'topup',
        request_id TEXT,
        plan_id TEXT,
        plan_version INTEGER
      );
      CREATE INDEX IF NOT EXISTS billing_payments_user ON billing_payments(user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS free_claims (
        owner_id TEXT PRIMARY KEY,
        slot_id TEXT NOT NULL UNIQUE,
        claimed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS legacy_plan_accounts (owner_id TEXT PRIMARY KEY);
      CREATE TRIGGER IF NOT EXISTS remember_legacy_plan AFTER INSERT ON billing_slots
        WHEN NOT EXISTS (SELECT 1 FROM free_claims WHERE slot_id=NEW.id)
        BEGIN INSERT OR IGNORE INTO legacy_plan_accounts(owner_id) VALUES(NEW.owner_id); END;
      CREATE TABLE IF NOT EXISTS free_quest_cooldowns (
        scope TEXT NOT NULL CHECK (scope IN ('account','token')),
        subject TEXT NOT NULL,
        next_run_at INTEGER NOT NULL,
        PRIMARY KEY (scope, subject)
      );
      CREATE TABLE IF NOT EXISTS billing_debits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES billing_users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL CHECK (amount > 0),
        kind TEXT NOT NULL CHECK (kind IN ('buy','renew')),
        detail TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS billing_debits_user ON billing_debits(user_id, created_at DESC);
    `)
    if(!legacyLedgerExists)this.billingDb.exec('INSERT OR IGNORE INTO legacy_plan_accounts(owner_id) SELECT DISTINCT owner_id FROM billing_slots WHERE id NOT IN (SELECT slot_id FROM free_claims)')
    const slotColumns = this.billingDb.prepare('PRAGMA table_info(billing_slots)').all() as Row[]
    if (!slotColumns.some(row => row.name === 'started_at')) this.billingDb.exec('ALTER TABLE billing_slots ADD COLUMN started_at INTEGER')
    if (!slotColumns.some(row => row.name === 'token_state')) {
      this.billingDb.exec("ALTER TABLE billing_slots ADD COLUMN token_state TEXT NOT NULL DEFAULT 'none' CHECK (token_state IN ('none','active','invalid'))")
      this.billingDb.exec("UPDATE billing_slots SET token_state = 'active' WHERE token_user_id IS NOT NULL OR token_username IS NOT NULL")
    }
    if (!slotColumns.some(row => row.name === 'invalid_notice_sent_at')) this.billingDb.exec('ALTER TABLE billing_slots ADD COLUMN invalid_notice_sent_at INTEGER')
    if (!slotColumns.some(row => row.name === 'canonical_folder')) this.billingDb.exec('ALTER TABLE billing_slots ADD COLUMN canonical_folder TEXT')
    const userColumns = this.billingDb.prepare('PRAGMA table_info(billing_users)').all() as Row[]
    if (!userColumns.some(row => row.name === 'disabled')) this.billingDb.exec('ALTER TABLE billing_users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0')
    if (!userColumns.some(row => row.name === 'token_notice_enabled')) this.billingDb.exec('ALTER TABLE billing_users ADD COLUMN token_notice_enabled INTEGER NOT NULL DEFAULT 1')
    if (!userColumns.some(row => row.name === 'token_notice_interval_ms')) this.billingDb.exec('ALTER TABLE billing_users ADD COLUMN token_notice_interval_ms INTEGER NOT NULL DEFAULT 3600000')
    const paymentColumns = this.billingDb.prepare('PRAGMA table_info(billing_payments)').all() as Row[]
    for (const [name,type] of [['declared_amount','INTEGER'],['actual_value','INTEGER'],['card_telco','TEXT'],['card_serial','TEXT'],['callback_sign','TEXT'],['provider_status','INTEGER'],['provider_message','TEXT']] as const) {
      if (!paymentColumns.some(row => row.name === name)) this.billingDb.exec(`ALTER TABLE billing_payments ADD COLUMN ${name} ${type}`)
    }
    if (!paymentColumns.some(row => row.name === 'purpose')) this.billingDb.exec("ALTER TABLE billing_payments ADD COLUMN purpose TEXT NOT NULL DEFAULT 'topup'")
    if (!paymentColumns.some(row => row.name === 'request_id')) this.billingDb.exec('ALTER TABLE billing_payments ADD COLUMN request_id TEXT')
    if (!paymentColumns.some(row => row.name === 'plan_id')) this.billingDb.exec('ALTER TABLE billing_payments ADD COLUMN plan_id TEXT')
    if (!paymentColumns.some(row => row.name === 'plan_version')) this.billingDb.exec('ALTER TABLE billing_payments ADD COLUMN plan_version INTEGER')
    this.billingDb.exec("CREATE UNIQUE INDEX IF NOT EXISTS billing_card_sign ON billing_payments(provider,callback_sign) WHERE callback_sign IS NOT NULL")
    this.billingDb.exec('CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_request ON billing_payments(request_id) WHERE request_id IS NOT NULL')
    this.billingDb.exec(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_user TEXT,
        detail TEXT
      );
      CREATE INDEX IF NOT EXISTS admin_logs_id ON admin_logs(id DESC);
    `)
    this.sessionDb.exec(`
      CREATE TABLE IF NOT EXISTS web_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        avatar TEXT,
        allowed INTEGER NOT NULL CHECK (allowed IN (0,1)),
        expires INTEGER NOT NULL,
        mode TEXT CHECK (mode IS NULL OR mode IN ('admin','user'))
      );
      CREATE INDEX IF NOT EXISTS web_sessions_expires ON web_sessions(expires);
      CREATE INDEX IF NOT EXISTS web_sessions_user ON web_sessions(user_id);
    `)
  }

  private transaction(db: DatabaseSync, action: () => void) {
    db.exec('BEGIN IMMEDIATE')
    try {
      action()
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  loadBilling(): BillingState {
    syncPlanExpiry(this.billingDb)
    const priceRow = this.billingDb.prepare("SELECT value FROM billing_settings WHERE key = 'price'").get() as Row | undefined
    const state: BillingState = { price: Number(priceRow?.value || this.defaultPrice), users: {}, payments: [] }
    for (const row of this.billingDb.prepare('SELECT id,username,balance,slot_limit,disabled,token_notice_enabled,token_notice_interval_ms FROM billing_users').all() as Row[]) {
      state.users[String(row.id)] = { username: String(row.username), balance: Number(row.balance), slotLimit: Number(row.slot_limit), disabled: Number(row.disabled) === 1, tokenNoticeEnabled: Number(row.token_notice_enabled) !== 0, tokenNoticeIntervalMs: tokenNoticeIntervalMs(Number(row.token_notice_interval_ms)), slots: [] }
    }
    for(const row of this.billingDb.prepare('SELECT * FROM billing_plans').all() as Row[]){
      const owner=state.users[String(row.owner_id)]
      if(owner&&isPlanId(row.plan_id))owner.plan={id:row.plan_id,startsAt:Number(row.starts_at),expiresAt:Number(row.expires_at),version:Number(row.version)}
    }
    const access=slotAccess(this.billingDb)
    for (const row of this.billingDb.prepare('SELECT id,owner_id,folder,token_user_id,token_username,token_state,invalid_notice_sent_at,started_at,expires_at FROM billing_slots ORDER BY owner_id,position').all() as Row[]) {
      state.users[String(row.owner_id)]?.slots.push({
        id: String(row.id),
        ...access.get(String(row.id)),
        folder: row.folder === null ? null : String(row.folder),
        tokenUserId: row.token_user_id === null ? null : String(row.token_user_id),
        tokenUsername: row.token_username === null ? null : String(row.token_username),
        tokenState: String(row.token_state) as BillingSlot['tokenState'],
        invalidNoticeSentAt: row.invalid_notice_sent_at === null ? null : Number(row.invalid_notice_sent_at),
        startsAt: row.started_at === null ? null : Number(row.started_at),
        expiresAt: access.get(String(row.id))?.expiresAt ?? Number(row.expires_at)
      })
    }
    for (const row of this.billingDb.prepare('SELECT * FROM billing_payments').all() as Row[]) {
      const payment: BillingPayment = {
        id: String(row.id), userId: String(row.user_id), provider: String(row.provider), orderCode: Number(row.order_code),
        invoice: String(row.invoice), amount: Number(row.amount), status: String(row.status) as BillingPayment['status'],
        checkoutUrl: String(row.checkout_url), qrImage: String(row.qr_image), expiresAt: Number(row.expires_at)
      }
      if (row.created_at !== null) payment.createdAt = Number(row.created_at)
      if (row.reference !== null) payment.reference = String(row.reference)
      if (row.paid_at !== null) payment.paidAt = Number(row.paid_at)
      if (row.declared_amount !== null) payment.declaredAmount = Number(row.declared_amount)
      if (row.actual_value !== null) payment.actualValue = Number(row.actual_value)
      if (row.card_telco !== null) payment.cardTelco = String(row.card_telco)
      if (row.card_serial !== null) payment.cardSerial = String(row.card_serial)
      if (row.callback_sign !== null) payment.callbackSign = String(row.callback_sign)
      if (row.provider_status !== null) payment.providerStatus = Number(row.provider_status)
      if (row.provider_message !== null) payment.providerMessage = String(row.provider_message)
      payment.purpose = String(row.purpose || 'topup') as BillingPayment['purpose']
      if (row.request_id !== null) payment.requestId = String(row.request_id)
      if (row.plan_id !== null) payment.planId = String(row.plan_id)
      if (row.plan_version !== null) payment.planVersion = Number(row.plan_version)
      state.payments.push(payment)
    }
    this.billingBaselines.set(state, structuredClone(state))
    return state
  }

  private writeBilling(state: BillingState) {
    this.billingDb.exec('DELETE FROM billing_payments; DELETE FROM billing_slots; DELETE FROM billing_users;')
    this.billingDb.prepare("INSERT INTO billing_settings(key,value) VALUES('price',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(state.price))
    const insertUser = this.billingDb.prepare('INSERT INTO billing_users(id,username,balance,slot_limit,disabled,token_notice_enabled,token_notice_interval_ms) VALUES(?,?,?,?,?,?,?)')
    const insertSlot = this.billingDb.prepare('INSERT INTO billing_slots(id,owner_id,position,folder,token_user_id,token_username,token_state,invalid_notice_sent_at,started_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    const insertPayment = this.billingDb.prepare('INSERT INTO billing_payments(id,user_id,provider,order_code,invoice,amount,status,checkout_url,qr_image,created_at,expires_at,reference,paid_at,declared_amount,actual_value,card_telco,card_serial,callback_sign,provider_status,provider_message,purpose,request_id,plan_id,plan_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    for (const [ownerId, user] of Object.entries(state.users)) {
      insertUser.run(ownerId, user.username, user.balance, user.slotLimit, user.disabled ? 1 : 0, user.tokenNoticeEnabled === false ? 0 : 1, tokenNoticeIntervalMs(user.tokenNoticeIntervalMs))
      user.slots.forEach((slot, position) => insertSlot.run(slot.id, ownerId, position, slot.folder, slot.tokenUserId, slot.tokenUsername, slot.tokenState ?? (slot.tokenUserId || slot.tokenUsername ? 'active' : 'none'), slot.invalidNoticeSentAt ?? null, slot.startsAt ?? null, slot.expiresAt))
    }
    for (const payment of state.payments) {
      insertPayment.run(payment.id, payment.userId, payment.provider, payment.orderCode, payment.invoice, payment.amount, payment.status, payment.checkoutUrl, payment.qrImage, payment.createdAt ?? null, payment.expiresAt, payment.reference ?? null, payment.paidAt ?? null, payment.declaredAmount ?? null, payment.actualValue ?? null, payment.cardTelco ?? null, payment.cardSerial ?? null, payment.callbackSign ?? null, payment.providerStatus ?? null, payment.providerMessage ?? null, payment.purpose ?? 'topup', payment.requestId ?? null, payment.planId ?? null, payment.planVersion ?? null)
    }
  }

  saveBilling(state: BillingState, debit?: Omit<BillingDebit, 'id'|'createdAt'>) {
    const baseline = this.billingBaselines.get(state)
    this.transaction(this.billingDb, () => {
      if (baseline) this.writeBillingDiff(baseline, state)
      else this.writeBilling(state)
      if (debit) this.billingDb.prepare('INSERT INTO billing_debits(user_id,amount,kind,detail,created_at) VALUES(?,?,?,?,?)').run(debit.userId,debit.amount,debit.kind,debit.detail,Date.now())
    })
    this.billingBaselines.set(state, structuredClone(state))
  }

  hasLegacyPlan(ownerId: string) {
    return Boolean(this.billingDb.prepare('SELECT 1 FROM legacy_plan_accounts WHERE owner_id=?').get(ownerId))
  }

  hasFreeClaim(ownerId: string) {
    return Boolean(this.billingDb.prepare('SELECT 1 FROM free_claims WHERE owner_id=?').get(ownerId))
  }

  ensureFreePlan(ownerId: string, username: string, now = Date.now()) {
    this.transaction(this.billingDb, () => {
      if (this.hasFreeClaim(ownerId) || this.hasLegacyPlan(ownerId) || this.billingDb.prepare('SELECT 1 FROM billing_plans WHERE owner_id=?').get(ownerId) || this.userDisabled(ownerId) || this.billingDb.prepare('SELECT 1 FROM billing_slots WHERE owner_id=?').get(ownerId)) return
      const slotId = randomBytes(12).toString('hex')
      this.billingDb.prepare('INSERT INTO billing_users(id,username,balance,slot_limit,disabled) VALUES(?,?,0,1,0) ON CONFLICT(id) DO NOTHING').run(ownerId, username)
      this.billingDb.prepare('INSERT INTO free_claims(owner_id,slot_id,claimed_at) VALUES(?,?,?)').run(ownerId, slotId, now)
      this.billingDb.prepare("INSERT INTO billing_slots(id,owner_id,position,token_state,started_at,expires_at) VALUES(?,?,0,'none',?,?)").run(slotId, ownerId, now, FREE_EXPIRES_AT)
    })
    return this.loadBilling()
  }

  private applyPlanPurchase(ownerId:string,planId:unknown,requestId:string,expectedVersion:number,now:number,chargeBalance:boolean,extend=true) {
      if(!isPlanId(planId))throw new FreePlanError('Giao dịch gói không hợp lệ.',400)
      const duplicate=this.billingDb.prepare('SELECT owner_id,plan_id FROM billing_plan_orders WHERE request_id=?').get(requestId) as Row|undefined
      if(duplicate){if(duplicate.owner_id!==ownerId||duplicate.plan_id!==planId)throw new FreePlanError('Mã giao dịch đã được dùng.',409);return}
      const pending=chargeBalance?this.billingDb.prepare("SELECT plan_id FROM billing_payments WHERE user_id=? AND provider='sepay' AND purpose='plan' AND status='pending' AND expires_at>? LIMIT 1").get(ownerId,now) as Row|undefined:undefined
      if(pending)throw new FreePlanError(isPlanId(pending.plan_id)?`Đang có giao dịch mua ${PLANS[pending.plan_id].name.toLowerCase()} chưa thanh toán.`:'Account đang có giao dịch QR chờ xác nhận.',409)
      const owner=this.billingDb.prepare('SELECT balance,disabled FROM billing_users WHERE id=?').get(ownerId) as Row|undefined
      if(!owner||owner.disabled)throw new FreePlanError('Account không hợp lệ hoặc đã bị khóa.')
      const current=this.billingDb.prepare('SELECT * FROM billing_plans WHERE owner_id=?').get(ownerId) as Row|undefined
      if(Number(current?.version||0)!==expectedVersion)throw new FreePlanError('Gói vừa thay đổi. Tải lại trước khi mua.',409)
      const plan=PLANS[planId],active=current&&Number(current.expires_at)>now
      if(extend&&active&&isPlanId(current.plan_id)&&plan.price<PLANS[current.plan_id].price)throw new FreePlanError('Chỉ được nâng cấp hoặc gia hạn gói đang dùng.',409)
      if(chargeBalance&&Number(owner.balance)<plan.price)throw new FreePlanError('Số dư không đủ.',402)
      const expiresAt=extend?Math.max(now,Number(current?.expires_at||0))+PLAN_MONTH_MS:active?Number(current.expires_at):now+PLAN_MONTH_MS
      if(!Number.isSafeInteger(expiresAt)||expiresAt>FREE_EXPIRES_AT)throw new FreePlanError('Thời hạn gói vượt giới hạn.',400)
      if(chargeBalance)this.billingDb.prepare('UPDATE billing_users SET balance=balance-? WHERE id=?').run(plan.price,ownerId)
      this.billingDb.prepare('INSERT INTO billing_plans VALUES(?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET plan_id=excluded.plan_id,starts_at=excluded.starts_at,expires_at=excluded.expires_at,version=excluded.version').run(ownerId,planId,active?Number(current.starts_at):now,expiresAt,Number(current?.version||0)+1)
      let slots=this.billingDb.prepare('SELECT m.slot_id,m.ordinal FROM billing_plan_slots m JOIN billing_slots s ON s.id=m.slot_id WHERE m.owner_id=? ORDER BY m.ordinal').all(ownerId) as Row[]
      if(!slots.length){
        const free=this.billingDb.prepare('SELECT s.id FROM billing_slots s JOIN free_claims f ON f.slot_id=s.id WHERE s.owner_id=?').get(ownerId) as Row|undefined
        if(free){this.billingDb.prepare('INSERT INTO billing_plan_slots VALUES(?,?,0)').run(String(free.id),ownerId);slots=[{slot_id:free.id,ordinal:0}]}
        else {
          const legacy=this.billingDb.prepare("SELECT s.id FROM billing_slots s LEFT JOIN billing_plan_slots m ON m.slot_id=s.id WHERE s.owner_id=? AND m.slot_id IS NULL ORDER BY s.position,s.id").all(ownerId) as Row[]
          for(const [ordinal,row] of legacy.slice(0,plan.slots).entries()){this.billingDb.prepare("INSERT INTO billing_plan_slots VALUES(?,?,?)").run(String(row.id),ownerId,ordinal);slots.push({slot_id:row.id,ordinal})}
        }
      }
      let position=Number((this.billingDb.prepare('SELECT COALESCE(MAX(position),-1) AS n FROM billing_slots WHERE owner_id=?').get(ownerId) as Row).n)+1
      for(let ordinal=0;ordinal<plan.slots;ordinal++){
        let slot=slots.find(row=>Number(row.ordinal)===ordinal)
        if(!slot){
          const id=randomBytes(12).toString('hex')
          this.billingDb.prepare('INSERT INTO billing_plan_slots(slot_id,owner_id,ordinal) VALUES(?,?,?) ON CONFLICT(owner_id,ordinal) DO UPDATE SET slot_id=excluded.slot_id').run(id,ownerId,ordinal)
          this.billingDb.prepare("INSERT INTO billing_slots(id,owner_id,position,token_state,started_at,expires_at) VALUES(?,?,?,'none',?,?)").run(id,ownerId,position++,now,expiresAt)
          slot={slot_id:id,ordinal}
        }
        this.billingDb.prepare('UPDATE billing_slots SET expires_at=? WHERE id=?').run(expiresAt,String(slot.slot_id))
      }
      this.billingDb.prepare('DELETE FROM billing_plan_notices WHERE owner_id=?').run(ownerId)
      this.billingDb.prepare('INSERT INTO billing_plan_orders VALUES(?,?,?,?)').run(requestId,ownerId,planId,expiresAt)
      if(chargeBalance)this.billingDb.prepare('INSERT INTO billing_debits(user_id,amount,kind,detail,created_at) VALUES(?,?,?,?,?)').run(ownerId,plan.price,current?.plan_id===planId?'renew':'buy',plan.name+' - 30 ngày',now)
  }

  purchasePlan(ownerId:string,planId:unknown,requestId:unknown,expectedVersion:unknown,now=Date.now()) {
    if(!isPlanId(planId)||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)||!Number.isSafeInteger(expectedVersion)||Number(expectedVersion)<0)throw new FreePlanError('Giao dịch gói không hợp lệ.',400)
    syncPlanExpiry(this.billingDb,now)
    this.transaction(this.billingDb,()=>this.applyPlanPurchase(ownerId,planId,requestId,Number(expectedVersion),now,true))
    return this.loadBilling()
  }

  adminChangePlan(ownerId:string,planId:unknown,now=Date.now()) {
    if(!isPlanId(planId))throw new FreePlanError('Gói không hợp lệ.',400)
    syncPlanExpiry(this.billingDb,now)
    this.transaction(this.billingDb,()=>{
      const current=this.billingDb.prepare('SELECT version FROM billing_plans WHERE owner_id=?').get(ownerId) as Row|undefined
      this.applyPlanPurchase(ownerId,planId,'admin-'+randomBytes(16).toString('hex'),Number(current?.version||0),now,false,false)
    })
    return this.loadBilling()
  }

  createSepayPlanPayment(payment:BillingPayment,now=Date.now()) {
    const planId=payment.planId,requestId=payment.requestId,planVersion=payment.planVersion
    if(payment.provider!=='sepay'||payment.purpose!=='plan'||!isPlanId(planId)||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)||payment.amount!==PLANS[planId].price||!Number.isSafeInteger(planVersion)||Number(planVersion)<0)throw new FreePlanError('Giao dịch gói không hợp lệ.',400)
    syncPlanExpiry(this.billingDb,now)
    this.transaction(this.billingDb,()=>{
      const existing=this.billingDb.prepare('SELECT id,user_id,plan_id FROM billing_payments WHERE request_id=?').get(requestId) as Row|undefined
      if(existing){if(existing.user_id!==payment.userId||existing.plan_id!==planId)throw new FreePlanError('Mã giao dịch đã được dùng.',409);return}
      const pending=this.billingDb.prepare("SELECT plan_id FROM billing_payments WHERE user_id=? AND provider='sepay' AND purpose='plan' AND status='pending' AND expires_at>? LIMIT 1").get(payment.userId,now) as Row|undefined
      if(pending)throw new FreePlanError(isPlanId(pending.plan_id)?`Đang có giao dịch mua ${PLANS[pending.plan_id].name.toLowerCase()} chưa thanh toán.`:'Account đang có giao dịch QR chờ xác nhận.',409)
      const owner=this.billingDb.prepare('SELECT disabled FROM billing_users WHERE id=?').get(payment.userId) as Row|undefined
      if(!owner||owner.disabled)throw new FreePlanError('Account không hợp lệ hoặc đã bị khóa.')
      const current=this.billingDb.prepare('SELECT plan_id,expires_at,version FROM billing_plans WHERE owner_id=?').get(payment.userId) as Row|undefined
      if(Number(current?.version||0)!==Number(planVersion))throw new FreePlanError('Gói vừa thay đổi. Tải lại trước khi mua.',409)
      if(current&&Number(current.expires_at)>now&&isPlanId(current.plan_id)&&PLANS[planId].price<PLANS[current.plan_id].price)throw new FreePlanError('Chỉ được nâng cấp hoặc gia hạn gói đang dùng.',409)
      this.billingDb.prepare('INSERT INTO billing_payments(id,user_id,provider,order_code,invoice,amount,status,checkout_url,qr_image,created_at,expires_at,reference,paid_at,declared_amount,actual_value,card_telco,card_serial,callback_sign,provider_status,provider_message,purpose,request_id,plan_id,plan_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(payment.id,payment.userId,payment.provider,payment.orderCode,payment.invoice,payment.amount,'pending',payment.checkoutUrl,payment.qrImage,payment.createdAt??now,payment.expiresAt,null,null,null,null,null,null,null,null,null,'plan',requestId,planId,Number(planVersion))
    })
    const saved=this.loadBilling().payments.find(item=>item.requestId===requestId)
    if(!saved)throw Error('Không thể lưu giao dịch QR.')
    return saved
  }

  cancelPayment(ownerId:string,id:string) {
    const row=this.billingDb.prepare('SELECT status FROM billing_payments WHERE id=? AND user_id=?').get(id,ownerId) as Row|undefined
    if(!row)throw new FreePlanError('Không tìm thấy giao dịch.',404)
    if(row.status!=='pending')throw new FreePlanError('Giao dịch không còn chờ thanh toán.',409)
    this.billingDb.prepare("UPDATE billing_payments SET status='expired',provider_message='Đã hủy bởi người dùng.' WHERE id=? AND user_id=? AND status='pending'").run(id,ownerId)
    const payment=this.loadBilling().payments.find(item=>item.id===id)
    if(!payment)throw Error('Không thể cập nhật giao dịch.')
    return payment
  }

  settleSepayPayment(id:string,reference:string,now=Date.now()) {
    let result:{changed:boolean;planApplied?:boolean;reviewRequired?:boolean;providerMessage?:string;userId?:string;username?:string;amount?:number}={changed:false}
    this.transaction(this.billingDb,()=>{
      const payment=this.billingDb.prepare("SELECT p.*,u.username FROM billing_payments p JOIN billing_users u ON u.id=p.user_id WHERE p.id=? AND p.provider='sepay'").get(id) as Row|undefined
      const cancelled=payment?.status==='expired'&&payment.provider_message==='Đã hủy bởi người dùng.'
      if(!payment||(payment.status!=='pending'&&!cancelled))return
      if(String(payment.purpose||'topup')==='plan'){
        if(!isPlanId(payment.plan_id)||Number(payment.amount)!==PLANS[payment.plan_id].price||typeof payment.request_id!=='string'||!Number.isSafeInteger(Number(payment.plan_version)))return
        try{this.applyPlanPurchase(String(payment.user_id),String(payment.plan_id),String(payment.request_id),Number(payment.plan_version),now,false)}catch(error){
          if(error instanceof FreePlanError&&error.status===409){
            const message=error.message,notify=Number(payment.provider_status)!==-409
            if(notify)this.billingDb.prepare("UPDATE billing_payments SET provider_status=-409,provider_message=? WHERE id=? AND status IN ('pending','expired')").run(message,id)
            result={changed:false,reviewRequired:notify,providerMessage:message,userId:String(payment.user_id),username:String(payment.username),amount:Number(payment.amount)}
          }
          return
        }
        this.billingDb.prepare("UPDATE billing_payments SET status='paid',reference=?,paid_at=? WHERE id=? AND status IN ('pending','expired')").run(reference||null,now,id)
        result={changed:true,planApplied:true,userId:String(payment.user_id),username:String(payment.username),amount:Number(payment.amount)}
        return
      }
      const changed=this.billingDb.prepare("UPDATE billing_payments SET status='paid',reference=?,paid_at=? WHERE id=? AND status IN ('pending','expired')").run(reference||null,now,id)
      if(Number(changed.changes)!==1)return
      this.billingDb.prepare('UPDATE billing_users SET balance=balance+? WHERE id=?').run(Number(payment.amount),payment.user_id)
      result={changed:true,planApplied:false,userId:String(payment.user_id),username:String(payment.username),amount:Number(payment.amount)}
    })
    return result
  }

  planReminderJobs(now=Date.now()) {
    const jobs:{ownerId:string;expiresAt:number;days:number;planId:keyof typeof PLANS}[]=[]
    for(const row of this.billingDb.prepare('SELECT p.* FROM billing_plans p JOIN billing_users u ON u.id=p.owner_id WHERE u.disabled=0').all() as Row[]){
      const days=reminderDays(Number(row.expires_at),now)
      if(days===null||!isPlanId(row.plan_id))continue
      this.billingDb.prepare('INSERT OR IGNORE INTO billing_plan_notices(owner_id,expires_at,days) VALUES(?,?,?)').run(row.owner_id,row.expires_at,days)
      const reserved=this.billingDb.prepare('UPDATE billing_plan_notices SET retry_at=? WHERE owner_id=? AND expires_at=? AND days=? AND sent_at=0 AND retry_at<=?').run(now+600000,row.owner_id,row.expires_at,days,now)
      if(reserved.changes)jobs.push({ownerId:String(row.owner_id),expiresAt:Number(row.expires_at),days,planId:row.plan_id})
    }
    return jobs
  }

  markPlanReminder(ownerId:string,expiresAt:number,days:number,now=Date.now()) {
    this.billingDb.prepare('UPDATE billing_plan_notices SET sent_at=? WHERE owner_id=? AND expires_at=? AND days=?').run(now,ownerId,expiresAt,days)
  }

  freeQuestNextRun(ownerId: string, tokenUserId: string) {
    const row = this.billingDb.prepare("SELECT MAX(next_run_at) AS due FROM free_quest_cooldowns WHERE (scope='account' AND subject=?) OR (scope='token' AND subject=?)").get(ownerId, tokenUserId) as Row
    return Number(row.due || 0)
  }

  reserveFreeQuest(ownerId: string, slotId: string, tokenUserId: string, now = Date.now()) {
    this.transaction(this.billingDb, () => {
      if(!slotAccess(this.billingDb,now).get(slotId)?.free)throw new FreePlanError('Slot không thuộc gói Free.',409)
      const slot = this.billingDb.prepare("SELECT 1 FROM billing_slots s JOIN billing_users u ON u.id=s.owner_id WHERE s.id=? AND s.owner_id=? AND s.token_user_id=? AND s.token_state='active' AND s.expires_at>? AND u.disabled=0").get(slotId, ownerId, tokenUserId, now)
      if (!slot) throw new FreePlanError('Slot hoặc token đã thay đổi. Tải lại trang.', 409)
      const nextRunAt = this.freeQuestNextRun(ownerId, tokenUserId)
      if (nextRunAt > now) throw new FreePlanError('Gói Free chỉ chạy một lần mỗi 5 giờ. Vui lòng chờ lượt tiếp theo.', 429, nextRunAt)
      const save = this.billingDb.prepare('INSERT INTO free_quest_cooldowns(scope,subject,next_run_at) VALUES(?,?,?) ON CONFLICT(scope,subject) DO UPDATE SET next_run_at=excluded.next_run_at')
      save.run('account', ownerId, now + FREE_COOLDOWN_MS)
      save.run('token', tokenUserId, now + FREE_COOLDOWN_MS)
    })
  }

  setCanonicalFolder(slotId: string, folder: string) {
    this.billingDb.prepare('UPDATE billing_slots SET canonical_folder = COALESCE(canonical_folder, ?) WHERE id = ?').run(folder, slotId)
  }

  loadBillingDebits(userId: string, limit = 100): BillingDebit[] {
    return (this.billingDb.prepare('SELECT * FROM billing_debits WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?').all(userId,limit) as Row[]).map(row=>({id:Number(row.id),userId:String(row.user_id),amount:Number(row.amount),kind:String(row.kind) as BillingDebit['kind'],detail:String(row.detail),createdAt:Number(row.created_at)}))
  }

  settleCardPayment(id: string, status: 'paid'|'failed', amount: number, actualValue: number, reference: string, providerStatus: number, providerMessage: string) {
    let result: { changed:boolean; userId?:string; username?:string; amount?:number } = { changed:false }
    this.transaction(this.billingDb, () => {
      const row=this.billingDb.prepare("SELECT p.user_id,p.status,u.username FROM billing_payments p JOIN billing_users u ON u.id=p.user_id WHERE p.id=? AND p.provider='card2k'").get(id) as Row|undefined
      if(!row||row.status==='paid'||row.status==='failed')return
      const changed=this.billingDb.prepare('UPDATE billing_payments SET status=?,amount=?,actual_value=?,reference=?,paid_at=?,provider_status=?,provider_message=? WHERE id=? AND status IN (\'pending\',\'expired\')').run(status,amount,actualValue,reference||null,status==='paid'?Date.now():null,providerStatus,providerMessage||null,id)
      if(Number(changed.changes)!==1)return
      if(status==='paid')this.billingDb.prepare('UPDATE billing_users SET balance=balance+? WHERE id=?').run(amount,row.user_id)
      result={changed:true,userId:String(row.user_id),username:String(row.username),amount}
    })
    return result
  }

  private writeBillingDiff(baseline: BillingState, state: BillingState) {
    if (baseline.price !== state.price) this.billingDb.prepare("INSERT INTO billing_settings(key,value) VALUES('price',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(state.price))
    type UserRow = { username: string; balance: number; slotLimit: number; disabled: boolean; tokenNoticeEnabled: boolean; tokenNoticeIntervalMs: number }
    const baseUsers = new Map<string, UserRow>()
    for (const [id, user] of Object.entries(baseline.users)) baseUsers.set(id, { username: user.username, balance: user.balance, slotLimit: user.slotLimit, disabled: user.disabled, tokenNoticeEnabled: user.tokenNoticeEnabled, tokenNoticeIntervalMs: user.tokenNoticeIntervalMs })
    const updUser = this.billingDb.prepare('UPDATE billing_users SET username=?,balance=balance+?,slot_limit=?,disabled=?,token_notice_enabled=?,token_notice_interval_ms=? WHERE id=?')
    const insUser = this.billingDb.prepare('INSERT INTO billing_users(id,username,balance,slot_limit,disabled,token_notice_enabled,token_notice_interval_ms) VALUES(?,?,?,?,?,?,?)')
    const delUser = this.billingDb.prepare('DELETE FROM billing_users WHERE id=?')
    for (const [id, user] of Object.entries(state.users)) {
      const base = baseUsers.get(id)
      if (!base) insUser.run(id, user.username, user.balance, user.slotLimit, user.disabled ? 1 : 0, user.tokenNoticeEnabled === false ? 0 : 1, tokenNoticeIntervalMs(user.tokenNoticeIntervalMs))
      else if (base.username !== user.username || base.balance !== user.balance || base.slotLimit !== user.slotLimit || base.disabled !== user.disabled || base.tokenNoticeEnabled !== user.tokenNoticeEnabled || base.tokenNoticeIntervalMs !== user.tokenNoticeIntervalMs) updUser.run(user.username, user.balance-base.balance, user.slotLimit, user.disabled ? 1 : 0, user.tokenNoticeEnabled === false ? 0 : 1, tokenNoticeIntervalMs(user.tokenNoticeIntervalMs), id)
    }
    for (const id of baseUsers.keys()) if (!(id in state.users)) delUser.run(id)

    type SlotRow = { ownerId: string; position: number; folder: string | null; tokenUserId: string | null; tokenUsername: string | null; tokenState: BillingSlot['tokenState']; invalidNoticeSentAt: number | null; startsAt: number | null; expiresAt: number }
    const baseSlots = new Map<string, SlotRow>()
    for (const [ownerId, user] of Object.entries(baseline.users)) user.slots.forEach((slot, position) => baseSlots.set(slot.id, { ownerId, position, folder: slot.folder, tokenUserId: slot.tokenUserId, tokenUsername: slot.tokenUsername, tokenState: slot.tokenState ?? (slot.tokenUserId || slot.tokenUsername ? 'active' : 'none'), invalidNoticeSentAt: slot.invalidNoticeSentAt ?? null, startsAt: slot.startsAt, expiresAt: slot.expiresAt }))
    const curSlots = new Map<string, SlotRow>()
    for (const [ownerId, user] of Object.entries(state.users)) user.slots.forEach((slot, position) => curSlots.set(slot.id, { ownerId, position, folder: slot.folder, tokenUserId: slot.tokenUserId, tokenUsername: slot.tokenUsername, tokenState: slot.tokenState ?? (slot.tokenUserId || slot.tokenUsername ? 'active' : 'none'), invalidNoticeSentAt: slot.invalidNoticeSentAt ?? null, startsAt: slot.startsAt, expiresAt: slot.expiresAt }))
    const updSlot = this.billingDb.prepare('UPDATE billing_slots SET owner_id=?,position=?,folder=?,token_user_id=?,token_username=?,token_state=?,invalid_notice_sent_at=?,started_at=?,expires_at=? WHERE id=?')
    const insSlot = this.billingDb.prepare('INSERT INTO billing_slots(id,owner_id,position,folder,token_user_id,token_username,token_state,invalid_notice_sent_at,started_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    const delSlot = this.billingDb.prepare('DELETE FROM billing_slots WHERE id=?')
    const sameSlot = (a: SlotRow, b: SlotRow) => a.ownerId === b.ownerId && a.position === b.position && a.folder === b.folder && a.tokenUserId === b.tokenUserId && a.tokenUsername === b.tokenUsername && a.tokenState === b.tokenState && a.invalidNoticeSentAt === b.invalidNoticeSentAt && a.startsAt === b.startsAt && a.expiresAt === b.expiresAt
    for (const id of baseSlots.keys()) if (!curSlots.has(id)) delSlot.run(id)
    for (const [id, cur] of curSlots) {
      const base = baseSlots.get(id)
      if (!base) insSlot.run(id, cur.ownerId, cur.position, cur.folder, cur.tokenUserId, cur.tokenUsername, cur.tokenState, cur.invalidNoticeSentAt, cur.startsAt, cur.expiresAt)
      else if (!sameSlot(base, cur)) updSlot.run(cur.ownerId, cur.position, cur.folder, cur.tokenUserId, cur.tokenUsername, cur.tokenState, cur.invalidNoticeSentAt, cur.startsAt, cur.expiresAt, id)
    }

    const payKey = (p: BillingPayment) => [p.userId, p.provider, p.orderCode, p.invoice, p.amount, p.status, p.checkoutUrl, p.qrImage, p.createdAt ?? null, p.expiresAt, p.reference ?? null, p.paidAt ?? null, p.declaredAmount ?? null, p.actualValue ?? null, p.cardTelco ?? null, p.cardSerial ?? null, p.callbackSign ?? null, p.providerStatus ?? null, p.providerMessage ?? null, p.purpose ?? 'topup', p.requestId ?? null, p.planId ?? null, p.planVersion ?? null].join('|')
    const basePay = new Map(baseline.payments.map(p => [p.id, p]))
    const updPay = this.billingDb.prepare('UPDATE billing_payments SET amount=?,status=?,reference=?,paid_at=?,declared_amount=?,actual_value=?,card_telco=?,card_serial=?,callback_sign=?,provider_status=?,provider_message=?,purpose=?,request_id=?,plan_id=?,plan_version=? WHERE id=?')
    const insPay = this.billingDb.prepare('INSERT INTO billing_payments(id,user_id,provider,order_code,invoice,amount,status,checkout_url,qr_image,created_at,expires_at,reference,paid_at,declared_amount,actual_value,card_telco,card_serial,callback_sign,provider_status,provider_message,purpose,request_id,plan_id,plan_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const delPay = this.billingDb.prepare('DELETE FROM billing_payments WHERE id=?')
    const currentPayIds = new Set(state.payments.map(p => p.id))
    for (const payment of state.payments) {
      const base = basePay.get(payment.id)
      if (!base) insPay.run(payment.id, payment.userId, payment.provider, payment.orderCode, payment.invoice, payment.amount, payment.status, payment.checkoutUrl, payment.qrImage, payment.createdAt ?? null, payment.expiresAt, payment.reference ?? null, payment.paidAt ?? null, payment.declaredAmount ?? null, payment.actualValue ?? null, payment.cardTelco ?? null, payment.cardSerial ?? null, payment.callbackSign ?? null, payment.providerStatus ?? null, payment.providerMessage ?? null, payment.purpose ?? 'topup', payment.requestId ?? null, payment.planId ?? null, payment.planVersion ?? null)
      else if (payKey(base) !== payKey(payment)) updPay.run(payment.amount,payment.status,payment.reference ?? null,payment.paidAt ?? null,payment.declaredAmount ?? null,payment.actualValue ?? null,payment.cardTelco ?? null,payment.cardSerial ?? null,payment.callbackSign ?? null,payment.providerStatus ?? null,payment.providerMessage ?? null,payment.purpose ?? 'topup',payment.requestId ?? null,payment.planId ?? null,payment.planVersion ?? null,payment.id)
    }
    for (const id of basePay.keys()) if (!currentPayIds.has(id)) delPay.run(id)
  }

  loadSessions(now = Date.now()): [string, Session][] {
    this.sessionDb.prepare('DELETE FROM web_sessions WHERE expires <= ?').run(now)
    return (this.sessionDb.prepare('SELECT * FROM web_sessions').all() as Row[]).map(row => [String(row.session_id), {
      id: String(row.user_id), username: String(row.username), avatar: row.avatar === null ? null : String(row.avatar),
      allowed: Boolean(row.allowed), expires: Number(row.expires), mode: row.mode === null ? undefined : String(row.mode) as Session['mode']
    }])
  }

  private writeSessions(entries: Iterable<[string, Session]>) {
    this.sessionDb.exec('DELETE FROM web_sessions')
    const insert = this.sessionDb.prepare('INSERT INTO web_sessions(session_id,user_id,username,avatar,allowed,expires,mode) VALUES(?,?,?,?,?,?,?)')
    for (const [sessionId, value] of entries) insert.run(sessionId, value.id, value.username, value.avatar, value.allowed ? 1 : 0, value.expires, value.mode ?? null)
  }

  saveSessions(entries: Iterable<[string, Session]>) {
    this.transaction(this.sessionDb, () => this.writeSessions(entries))
  }

  saveSession(sessionId: string, value: Session) {
    this.transaction(this.sessionDb, () => {
      this.sessionDb.prepare('INSERT OR REPLACE INTO web_sessions(session_id,user_id,username,avatar,allowed,expires,mode) VALUES(?,?,?,?,?,?,?)').run(sessionId, value.id, value.username, value.avatar, value.allowed ? 1 : 0, value.expires, value.mode ?? null)
    })
  }

  deleteSession(sessionId: string) {
    this.transaction(this.sessionDb, () => {
      this.sessionDb.prepare('DELETE FROM web_sessions WHERE session_id = ?').run(sessionId)
    })
  }

  deleteSessionsByUser(userId: string) {
    this.transaction(this.sessionDb, () => {
      this.sessionDb.prepare('DELETE FROM web_sessions WHERE user_id = ?').run(userId)
    })
  }

  userDisabled(userId: string): boolean {
    const row = this.billingDb.prepare('SELECT disabled FROM billing_users WHERE id = ?').get(userId) as Row | undefined
    return row ? Number(row.disabled) === 1 : false
  }

  addAdminLog(entry: { actor: string; action: string; targetUser?: string; detail?: string }) {
    this.billingDb.prepare('INSERT INTO admin_logs(at,actor,action,target_user,detail) VALUES(?,?,?,?,?)').run(Date.now(), entry.actor, entry.action, entry.targetUser ?? null, entry.detail ?? null)
  }

  loadAdminLogs(limit = 30): Array<{ id: number; at: number; actor: string; action: string; targetUser: string | null; detail: string | null }> {
    return (this.billingDb.prepare('SELECT * FROM admin_logs ORDER BY id DESC LIMIT ?').all(limit) as Row[]).map(row => ({ id: Number(row.id), at: Number(row.at), actor: String(row.actor), action: String(row.action), targetUser: row.target_user === null ? null : String(row.target_user), detail: row.detail === null ? null : String(row.detail) }))
  }

  close() {
    this.billingDb.close()
    this.sessionDb.close()
  }
}
