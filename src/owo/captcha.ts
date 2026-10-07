/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import puppeteer, { type Browser, type Page } from 'puppeteer-core'

export type OwoCaptchaLogger = { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }

const NOPECHA_API_KEY = 'sub_1Tst82CRwBwvt6ptQglae1Pd'
// Sitekey hCaptcha cố định lấy trực tiếp từ bundle JS owobot.com/captcha.
const OWOBOT_HCAPTCHA_SITEKEY = 'a6a1d5ce-612d-472d-8e37-7601408fbc09'
const OWO_DM_VERIFIED_TEXT = 'i have verified that you are human'
const CHROME_EXECUTABLE = process.env.CHROME_PATH || '/usr/bin/google-chrome'

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

async function solveHcaptcha(sitekey: string, pageUrl: string, timeoutMs = 300_000): Promise<string> {
  const submit = await fetch('https://api.nopecha.com/v1/token/hcaptcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: NOPECHA_API_KEY, sitekey, url: pageUrl, data: {} })
  })
  if (!submit.ok) throw new Error(`NopeCHA submit thất bại (HTTP ${submit.status}): ${await submit.text()}`)
  const jobId = ((await submit.json()) as { data?: string }).data
  if (!jobId) throw new Error('NopeCHA không trả job id')

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let poll: Response
    try {
      poll = await fetch(`https://api.nopecha.com/v1/token/hcaptcha?key=${encodeURIComponent(NOPECHA_API_KEY)}&id=${encodeURIComponent(jobId)}`)
    } catch {
      // Lỗi mạng tạm thời khi poll, tiếp tục chờ thay vì bỏ lượt.
      await sleep(2000)
      continue
    }
    if (poll.status === 409) { await sleep(500); continue }
    if (poll.status >= 500) {
      // Lỗi tạm thời phía NopeCHA (vd 520 Cloudflare); tiếp tục chờ thay vì abort.
      await sleep(2000)
      continue
    }
    if (!poll.ok) throw new Error(`NopeCHA poll thất bại (HTTP ${poll.status}): ${await poll.text()}`)
    const body = (await poll.json()) as { data?: string }
    if (!body.data) throw new Error('NopeCHA trả kết quả rỗng')
    return body.data
  }
  throw new Error('Hết thời gian chờ NopeCHA giải.')
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  })
}

async function waitPageReady(page: Page, timeoutMs = 15_000) {
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: timeoutMs })
}

async function setDiscordToken(page: Page, token: string) {
  const client = await page.createCDPSession()
  await client.send('DOMStorage.enable')
  await client.send('DOMStorage.setDOMStorageItem', {
    storageId: { securityOrigin: 'https://discord.com', isLocalStorage: true },
    key: 'token',
    value: JSON.stringify(token)
  })
  await client.detach()
}

async function clickAuthorizeButtonIfPresent(page: Page, timeoutMs = 15_000) {
  try {
    const handle = await page.waitForFunction(() => {
      // Danh sách quyền OAuth có thể dài hơn khung hiển thị; Discord ẩn nút
      // Authorize thật sau nút "Keep Scrolling..." cho tới khi cuộn hết xuống đáy.
      for (const element of document.querySelectorAll('*')) {
        if (element.scrollHeight > element.clientHeight) element.scrollTop = element.scrollHeight
      }
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons.find(button => !button.disabled && /^authorize$|^ủy quyền$/i.test((button.textContent || '').trim())) || null
    }, { timeout: timeoutMs, polling: 300 })
    const element = handle.asElement() as ReturnType<typeof handle.asElement> & { click: () => Promise<void> } | null
    if (element) await element.click()
  } catch {
    // Có thể app owobot đã được Authorize từ trước, Discord tự redirect luôn.
  }
}

async function solveOwoCaptchaWithBrowser(token: string, logger: OwoCaptchaLogger): Promise<void> {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.goto('https://discord.com/login', { waitUntil: 'domcontentloaded' })
    await waitPageReady(page)
    await setDiscordToken(page, token)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitPageReady(page)
    await sleep(1000)

    logger.log('[*] Đang xác thực OAuth owobot.com...')
    await page.goto('https://owobot.com/api/auth/discord', { waitUntil: 'domcontentloaded' })
    await clickAuthorizeButtonIfPresent(page, 15_000)

    try {
      // Chỉ tính là xong khi trình duyệt THẬT SỰ rời discord.com sang owobot.com;
      // không được chỉ kiểm tra chuỗi con "owobot.com" trong URL vì nó xuất hiện
      // ngay trong query string redirect_uri khi vẫn còn ở discord.com.
      await page.waitForFunction(() => location.hostname === 'owobot.com', { timeout: 30_000 })
    } catch {
      await page.screenshot({ path: '/root/superutils/debug_owo_oauth.png' as `${string}.png` }).catch(() => undefined)
      throw new Error(`Không hoàn tất OAuth owobot, còn kẹt ở: ${page.url()}`)
    }
    logger.log(`[*] Sau OAuth, đang ở: ${page.url()}`)

    await page.goto('https://owobot.com/captcha', { waitUntil: 'domcontentloaded' })
    await waitPageReady(page)

    const cookies = await page.cookies('https://owobot.com')
    const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
    logger.log(`[*] Cookie owobot.com thu được: ${cookies.map(cookie => cookie.name).sort().join(', ')}`)

    const authCheck = await fetch('https://owobot.com/api/auth', { headers: { cookie: cookieHeader } })
    logger.log(`[*] GET /api/auth trước khi giải captcha: HTTP ${authCheck.status}`)
    if (!authCheck.ok) {
      throw new Error(`Chưa đăng nhập owobot.com được (HTTP ${authCheck.status}), OAuth có thể chưa hoàn tất: ${(await authCheck.text()).slice(0, 300)}`)
    }

    logger.log('[*] Đang gửi hCaptcha cho NopeCHA giải...')
    const hcaptchaResponse = await solveHcaptcha(OWOBOT_HCAPTCHA_SITEKEY, 'https://owobot.com/captcha')

    const verify = await fetch('https://owobot.com/api/captcha/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({ token: hcaptchaResponse })
    })
    if (!verify.ok) throw new Error(`owobot từ chối captcha (HTTP ${verify.status}): ${await verify.text()}`)

    // HTTP 200 chỉ nghĩa là request được chấp nhận; xác nhận lại thực tế bằng
    // GET /api/auth để chắc owobot đã tắt cờ captcha.
    const check = await fetch('https://owobot.com/api/auth', { headers: { cookie: cookieHeader } })
    if (!check.ok) throw new Error(`Không xác nhận lại được trạng thái captcha (HTTP ${check.status}).`)
    const checkBody = (await check.json()) as { captcha?: { active?: boolean } }
    if (checkBody.captcha?.active) throw new Error('owobot vẫn báo captcha đang active sau khi verify, coi như thất bại.')
    logger.log('[+] Đã xác minh captcha owobot.com thành công (đã kiểm tra lại trạng thái).')
  } finally {
    await browser.close()
  }
}

async function findOwoDmChannel(token: string): Promise<string | null> {
  const response = await fetch('https://discord.com/api/v10/users/@me/channels', {
    headers: { Authorization: token }
  })
  if (!response.ok) throw new Error(`Không lấy được danh sách DM (HTTP ${response.status}): ${await response.text()}`)
  const channels = (await response.json()) as Array<{ id: string; recipients?: Array<{ username?: string }> }>
  for (const channel of channels) {
    if (channel.recipients?.some(recipient => (recipient.username || '').toLowerCase() === 'owo')) return channel.id
  }
  return null
}

async function latestOwoVerifiedTime(token: string, dmChannelId: string): Promise<number | null> {
  const response = await fetch(`https://discord.com/api/v10/channels/${dmChannelId}/messages?limit=5`, {
    headers: { Authorization: token }
  })
  if (!response.ok) throw new Error(`Không đọc được DM (HTTP ${response.status}): ${await response.text()}`)
  const messages = (await response.json()) as Array<{ content?: string; timestamp: string }>
  let latest: number | null = null
  for (const message of messages) {
    if (!(message.content || '').toLowerCase().includes(OWO_DM_VERIFIED_TEXT)) continue
    const timestamp = new Date(message.timestamp).getTime()
    if (latest === null || timestamp > latest) latest = timestamp
  }
  return latest
}

async function waitOwoDmConfirmation(token: string, logger: OwoCaptchaLogger, timeoutMs = 30_000, pollIntervalMs = 3000): Promise<boolean> {
  let dmChannelId: string | null
  try {
    dmChannelId = await findOwoDmChannel(token)
  } catch (error) {
    logger.error('[!] Không lấy được kênh DM với OwO:', error instanceof Error ? error.message : String(error))
    return false
  }
  if (!dmChannelId) {
    logger.error('[!] Chưa từng có DM với OwO, không thể xác nhận bằng DM.')
    return false
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await latestOwoVerifiedTime(token, dmChannelId)) !== null) return true
    } catch (error) {
      logger.error('[!] Lỗi đọc DM xác nhận:', error instanceof Error ? error.message : String(error))
    }
    await sleep(pollIntervalMs)
  }
  return false
}

export async function resolveOwoCaptcha(token: string, logger: OwoCaptchaLogger, maxAttempts = 5, retryDelayMs = 10_000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await solveOwoCaptchaWithBrowser(token, logger)
      if (!(await waitOwoDmConfirmation(token, logger))) {
        throw new Error('Không nhận được DM xác nhận từ OwO sau khi verify.')
      }
      logger.log(`[+] OwO đã xác nhận qua DM: giải captcha thành công (lần ${attempt}/${maxAttempts}), tiếp tục hunt.`)
      return
    } catch (error) {
      logger.error(`[!] Giải captcha thất bại (lần ${attempt}/${maxAttempts}):`, error instanceof Error ? error.message : String(error))
      if (attempt < maxAttempts) {
        logger.log(`[*] Thử lại sau ${retryDelayMs / 1000}s...`)
        await sleep(retryDelayMs)
      }
    }
  }
  throw new Error(`Giải captcha owobot thất bại sau ${maxAttempts} lần, dừng auto hunt.`)
}
