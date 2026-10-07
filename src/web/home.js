if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

const i18n = {
  vi: {
    navFeatures: 'Xem các tiện ích',
    navDashboard: 'Dashboard',
    eyebrow: 'Bạn đã chán Discord chỉ có Nitro?',
    heroTitle: 'Đừng lo.<br>Đến với <em>SuperUtils.</em>',
    heroLede: 'Chúng tôi cung cấp các tiện ích biến account Discord của bạn trở nên nổi bật hơn — Rich Presence, voice, chat và stream tự động, tất cả trong một bảng điều khiển.',
    heroPrimary: 'Mở Dashboard',
    heroGhost: 'Xem các tiện ích ↓',
    discordCardLabel: 'Rich Presence thực tế chạy bằng SuperUtils',
    avatarAlt: 'Avatar Discord của ',
    highlightsTitle: 'Vận hành ổn định',
    highlights: ['Hoạt động 24/24', 'Reconnect khi gặp lỗi', 'Tự động thông báo token hết hiệu lực'],
    toolsEyebrow: 'Công cụ',
    toolsTitle: 'Mọi thứ bạn cần, trong một nơi.',
    modules: [
      ['Rich Presence', 'Tạo và xem trước trạng thái Discord, lưu lại để dùng ngay.'],
      ['Status', 'Xoay vòng nhiều custom status kèm emoji theo thứ tự hoặc random.'],
      ['Voice', 'Kết nối voice cho từng tài khoản, không cần thao tác thủ công.'],
      ['Multi Voice', 'Quản lý nhiều kết nối voice cùng lúc trong một nơi.'],
      ['Auto Chat', 'Đặt lịch và nội dung chat tự động.'],
      ['Multi Chat', 'Điều khiển chat tự động cho nhiều tài khoản cùng lúc.'],
      ['Stream', 'Bật luồng stream và các lệnh điều khiển đi kèm.'],
      ['Quest', 'Theo dõi tiến độ và lịch chạy Quest.']
    ],
    planTitle: 'Chọn gói phù hợp',
    footBack: 'Lên đầu trang ↑',
    planKickerFree: 'GÓI FREE',
    planKickerPaid: 'GÓI ',
    planBadgeFeatured: 'Phổ biến nhất',
    planBenefitsLabel: 'Quyền lợi',
    planFreeBenefits: ['Auto Quest thủ công mỗi 5 giờ', '1 token'],
    planPaidBenefits: (p) => ['Toàn bộ công cụ', `${p.slots} token · ${p.configs} scene/token`, `Tối đa ${p.statuses} status`, `Multi Voice/Chat: ${p.poolTokens} token`, `Kho ảnh: ${p.mediaMb || 10} MB`],
    planFree: 'Miễn phí',
    planPriceSuffix: ' / 30 ngày',
    planCtaFree: 'Dùng miễn phí',
    planCtaPaid: 'Mua gói',
    activityLabels: {PLAYING:'Đang chơi', STREAMING:'Đang stream', LISTENING:'Cùng lắng nghe', WATCHING:'Đang xem', COMPETING:'Đang chơi'}
  },
  en: {
    navFeatures: 'View features',
    navDashboard: 'Dashboard',
    eyebrow: 'Tired of Discord with just Nitro?',
    heroTitle: 'No worries.<br>Meet <em>SuperUtils.</em>',
    heroLede: 'We provide utilities that make your Discord account stand out — Rich Presence, voice, chat and automated stream, all in one dashboard.',
    heroPrimary: 'Open Dashboard',
    heroGhost: 'View features ↓',
    discordCardLabel: 'Live Rich Presence running with SuperUtils',
    avatarAlt: 'Discord avatar of ',
    highlightsTitle: 'Stable operation',
    highlights: ['24/7 uptime', 'Auto reconnect on errors', 'Automatic token expiry alerts'],
    toolsEyebrow: 'Tools',
    toolsTitle: 'Everything you need, in one place.',
    modules: [
      ['Rich Presence', 'Create and preview Discord status, save it for instant use.'],
      ['Status', 'Rotate multiple custom statuses with emoji, sequential or random.'],
      ['Voice', 'Connect voice for every account, no manual steps needed.'],
      ['Multi Voice', 'Manage multiple voice connections at once in one place.'],
      ['Auto Chat', 'Schedule automatic chat content and timing.'],
      ['Multi Chat', 'Control automated chat for multiple accounts at once.'],
      ['Stream', 'Turn on stream broadcasting with built-in controls.'],
      ['Quest', 'Track Quest progress and run schedule.']
    ],
    planTitle: 'Choose your plan',
    footBack: 'Back to top ↑',
    planKickerFree: 'FREE PLAN',
    planKickerPaid: 'PLAN ',
    planBadgeFeatured: 'Most popular',
    planBenefitsLabel: 'Benefits',
    planFreeBenefits: ['Manual Auto Quest every 5 hours', '1 token'],
    planPaidBenefits: (p) => ['All tools', `${p.slots} tokens · ${p.configs} scenes/token`, `Up to ${p.statuses} statuses`, `Multi Voice/Chat: ${p.poolTokens} tokens`, `Media library: ${p.mediaMb || 10} MB`],
    planFree: 'Free',
    planPriceSuffix: ' / 30 days',
    planCtaFree: 'Use for free',
    planCtaPaid: 'Buy plan',
    activityLabels: {PLAYING:'Playing', STREAMING:'Streaming', LISTENING:'Listening to', WATCHING:'Watching', COMPETING:'Competing in'}
  }
}

let lang = (localStorage.getItem('lang') === 'en') ? 'en' : 'vi'
function t() { return i18n[lang] }

function renderHome() {
  const s = t()
  return `
    <div class="site">
      <header class="nav-bar">
        <div class="nav">
          <a class="brand" href="/" data-scroll-to="top"><img class="brand-mark" src="/superutils-logo-v1.png" alt="">SuperUtils</a>
          <nav class="nav-links">
            <a href="/" data-scroll-to="modules">${s.navFeatures}</a>
            <button type="button" class="lang-switch" id="langSwitch" data-lang="${lang}" aria-label="Switch language / Chuyển ngôn ngữ">
              <span class="lang-switch-thumb" aria-hidden="true"></span>
              <span class="lang-switch-opt">VI</span>
              <span class="lang-switch-opt">EN</span>
            </button>
            <a class="nav-cta" href="/dashboard">${s.navDashboard}</a>
          </nav>
        </div>
      </header>

      <section class="hero">
        <div class="hero-text reveal">
          <p class="eyebrow">${s.eyebrow}</p>
          <h1>${s.heroTitle}</h1>
          <p class="lede">${s.heroLede}</p>
          <div class="hero-actions">
            <a class="btn-primary" href="/dashboard">${s.heroPrimary}</a>
            <a class="btn-ghost" href="/" data-scroll-to="modules">${s.heroGhost}</a>
          </div>
        </div>
        <aside class="discord-card discord-card-loading reveal" id="discordCard" aria-label="${s.discordCardLabel}">
          <div class="discord-frame discord-frame-back" id="discordFrameBack" aria-hidden="true"></div>
          <div class="discord-effect" id="discordEffect" aria-hidden="true"></div>
          <div class="discord-banner" id="discordBanner"></div>
          <div class="discord-body">
            <div class="discord-avatar-wrap">
              <img class="discord-avatar-img" id="discordAvatar" alt="">
              <img class="discord-decoration" id="discordDecoration" alt="" aria-hidden="true" hidden>
              <span class="discord-status" id="discordStatus" aria-hidden="true"></span>
            </div>
            <div class="discord-identity">
              <b id="discordName">…</b>
              <div class="discord-identity-row">
                <span id="discordUsername">…</span>
                <span class="discord-clan-tag" id="discordClanTag" hidden>
                  <img id="discordClanBadge" alt="">
                  <span id="discordClanText"></span>
                </span>
                <span id="discordBadges"></span>
              </div>
            </div>
            <div class="discord-activity">
              <div class="discord-activity-kicker" id="discordHeader">…</div>
              <div class="discord-activity-row">
                <div class="discord-activity-icon" id="discordActivityIcon" aria-hidden="true"></div>
                <div class="discord-activity-text">
                  <em id="discordDetail">…</em>
                  <span id="discordState">…</span>
                  <small id="discordAsset">…</small>
                </div>
              </div>
              <div class="discord-activity-buttons">
                <a id="discordButton1" target="_blank" rel="noopener" hidden></a>
                <a id="discordButton2" target="_blank" rel="noopener" hidden></a>
              </div>
            </div>
          </div>
          <div class="discord-frame discord-frame-front" id="discordFrameFront" aria-hidden="true"></div>
          <div class="discord-card-skeleton" id="discordCardSkeleton" aria-label="Loading profile">
            <span class="discord-skeleton-block discord-skeleton-banner"></span>
            <div class="discord-skeleton-content">
              <span class="discord-skeleton-block discord-skeleton-avatar"></span>
              <span class="discord-skeleton-block discord-skeleton-name"></span>
              <span class="discord-skeleton-block discord-skeleton-user"></span>
              <span class="discord-skeleton-block discord-skeleton-activity"></span>
            </div>
          </div>
        </aside>
      </section>

      <section class="highlights reveal">
        <div class="highlights-inner">
          <h2>${s.highlightsTitle}</h2>
          <div class="highlights-list">
            ${s.highlights.map(h => `<span class="highlight">${h}</span>`).join('')}
          </div>
        </div>
      </section>

      <section class="modules" id="modules">
        <header class="section-head reveal">
          <p class="eyebrow">${s.toolsEyebrow}</p>
          <h2>${s.toolsTitle}</h2>
        </header>
        <div class="module-list">
          ${s.modules.map(([name, desc]) => `<article class="module-row reveal"><span class="dot" aria-hidden="true"></span><h3>${name}</h3><p>${desc}</p></article>`).join('')}
        </div>
        <div class="final-inner reveal">
          <h2>${s.planTitle}</h2>
          <div class="plan-grid" id="planGrid" aria-live="polite"></div>
        </div>
      </section>

      <footer class="foot">
        <div class="foot-inner">
          <span>© SuperUtils</span>
          <a href="/" data-scroll-to="top">${s.footBack}</a>
        </div>
      </footer>
    </div>`
}

function setLang(next) {
  if (next === lang) return
  lang = next
  localStorage.setItem('lang', lang)
  document.documentElement.lang = lang
  render()
}

function render() {
  document.querySelector('#prototype').innerHTML = renderHome()
  document.documentElement.lang = lang
  setupScrollReveal()
  document.querySelectorAll('[data-scroll-to]').forEach(el => el.addEventListener('click', event => {
    event.preventDefault()
    const targetId = el.dataset.scrollTo
    if (targetId === 'top') scrollTo({top: 0, behavior: 'smooth'})
    else document.getElementById(targetId)?.scrollIntoView({behavior: 'smooth'})
  }))
  document.getElementById('langSwitch')?.addEventListener('click', () => setLang(lang === 'vi' ? 'en' : 'vi'))
  loadPrice()
  startDiscordActivityRotation()
}

function rpcSceneLength(scene) {
  const setup = scene.setup || {}, source = scene.config || {}
  const lens = [
    Array.isArray(source['text-1']) ? source['text-1'].length : 0,
    Array.isArray(source['text-2']) ? source['text-2'].length : 0,
    Array.isArray(source['text-3']) ? source['text-3'].length : 0,
    Array.isArray(source.bigimg) ? source.bigimg.length : 0,
    Array.isArray(source.smallimg) ? source.smallimg.length : 0,
    Array.isArray(source['button-1']) ? source['button-1'].length : 0,
    Array.isArray(source['button-2']) ? source['button-2'].length : 0,
    Array.isArray(setup.name) ? setup.name.length : (typeof setup.name === 'string' ? 1 : 0)
  ]
  return Math.max(1, ...lens)
}

function rpcResolveScene(scenes, tick) {
  const total = scenes.reduce((sum, s) => sum + rpcSceneLength(s), 0)
  if (total <= 0) return {sceneIndex: 0, localIndex: 0}
  let t = ((tick % total) + total) % total
  for (let i = 0; i < scenes.length; i++) {
    const len = rpcSceneLength(scenes[i])
    if (t < len) return {sceneIndex: i, localIndex: t}
    t -= len
  }
  return {sceneIndex: 0, localIndex: 0}
}

function rpcFirst(arr, index) {
  return Array.isArray(arr) && arr.length ? String(arr[index % arr.length]) : ''
}

function rpcFirstUrl(arr, index) {
  const value = rpcFirst(arr, index)
  return /^https?:\/\//i.test(value) ? value : ''
}

function rpcButton(source, key, index) {
  const arr = Array.isArray(source[key]) ? source[key].filter(b => b && b.name && b.url) : []
  return arr.length ? arr[index % arr.length] : null
}

function rpcValues(setup, weather) {
  const now = new Date()
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const weeks = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th')
  const values = {
    '{hour:1}': String(now.getHours()).padStart(2,'0'),
    '{hour:2}': String((now.getHours() % 12) || 12).padStart(2,'0'),
    '{min:1}': String(now.getMinutes()).padStart(2,'0'),
    '{min:2}': String(now.getMinutes()).padStart(2,'0') + (now.getHours() < 12 ? ' AM' : ' PM'),
    '{th=date}': String(now.getDate()),
    '{th=month:1}': String(now.getMonth() + 1),
    '{en=date}': ordinal(now.getDate()),
    '{en=week:1}': weeks[now.getDay()].slice(0,3),
    '{en=week:2}': weeks[now.getDay()],
    '{en=month:1}': String(now.getMonth() + 1).padStart(2,'0'),
    '{en=month:2}': months[now.getMonth()].slice(0,3),
    '{en=month:3}': months[now.getMonth()],
    '{en=year:1}': String(now.getFullYear()).slice(-2),
    '{en=year:2}': String(now.getFullYear()),
    '{city}': setup.city || 'N/A',
    '{user:name}': 'N/A',
    '{emoji:random}': '✨', '{emoji:time}': '🌙', '{emoji:clock}': '🕛'
  }
  if (weather) Object.assign(values, {
    '{city}':weather.city, '{region}':weather.region, '{country}':weather.country,
    '{temp:c}':weather.tempC, '{temp:f}':weather.tempF,
    '{wind:kph}':weather.windKph, '{wind:mph}':weather.windMph, '{wind:degree}':weather.windDegree, '{wind:dir}':weather.windDir,
    '{pressure:mb}':weather.pressureMb, '{pressure:in}':weather.pressureIn,
    '{precip:mm}':weather.precipMm, '{precip:in}':weather.precipIn,
    '{gust:kph}':weather.gustKph, '{gust:mph}':weather.gustMph,
    '{feelslike:c}':weather.feelslikeC, '{feelslike:f}':weather.feelslikeF,
    '{windchill:c}':weather.windchillC, '{windchill:f}':weather.windchillF,
    '{heatindex:c}':weather.heatindexC, '{heatindex:f}':weather.heatindexF,
    '{dewpoint:c}':weather.dewpointC, '{dewpoint:f}':weather.dewpointF,
    '{vis:km}':weather.visKm, '{vis:mi}':weather.visMi,
    '{humidity}':weather.humidity, '{cloud}':weather.cloud, '{uv}':weather.uv,
    '{co}':weather.co, '{no2}':weather.no2, '{o3}':weather.o3, '{so2}':weather.so2, '{pm2.5}':weather.pm25, '{pm10}':weather.pm10
  })
  return values
}

function rpcRender(text, values) {
  return String(text || '').replace(/\{[^}]+\}/g, token => (token in values ? values[token] : 'N/A'))
}

async function startDiscordActivityRotation() {
  const cardEl = document.getElementById('discordCard')
  const headerEl = document.getElementById('discordHeader')
  const detailEl = document.getElementById('discordDetail')
  const stateEl = document.getElementById('discordState')
  const assetEl = document.getElementById('discordAsset')
  if (!cardEl || !headerEl) return
  let data
  try {
    const response = await fetch('/api/showcase')
    data = await response.json()
  } catch { cardEl.hidden = true; return }
  if (!data || !Array.isArray(data.scenes) || !data.scenes.length || !data.profile) { cardEl.hidden = true; return }

  const profile = data.profile
  const displayName = profile.globalName || profile.username
  document.getElementById('discordBanner').style.backgroundImage = profile.bannerUrl ? `url('${profile.bannerUrl}')` : ''
  const avatarEl = document.getElementById('discordAvatar')
  avatarEl.src = profile.avatarUrl || ''
  avatarEl.alt = t().avatarAlt + displayName
  const decorationEl = document.getElementById('discordDecoration')
  if (profile.decorationUrl) { decorationEl.src = profile.decorationUrl; decorationEl.hidden = false }
  const renderCollectibles = (id, layers) => {
    const container = document.getElementById(id)
    container.replaceChildren()
    if (id === 'discordEffect') {
      const effects = (layers || []).map(layer => {
        const image = document.createElement('img')
        image.src = layer.src
        image.alt = ''
        image.style.zIndex = String(layer.zIndex)
        return { ...layer, image }
      })
      let index = 0
      const play = () => {
        const layer = effects[index]
        if (!layer) return
        container.replaceChildren(layer.image.cloneNode())
        index = (index + 1) % effects.length
        window.setTimeout(play, Math.max(layer.duration, 1))
      }
      play()
      return
    }
    for (const layer of layers || []) {
      const image = document.createElement('img')
      image.src = layer.src
      image.alt = ''
      if (layer.zIndex !== undefined) image.style.zIndex = String(layer.zIndex)
      if (layer.anchor) image.className = 'discord-frame-' + layer.anchor
      container.append(image)
    }
  }
  renderCollectibles('discordEffect', profile.effectLayers)
  renderCollectibles('discordFrameBack', (profile.frameLayers || []).filter(layer => layer.order === 'back'))
  renderCollectibles('discordFrameFront', (profile.frameLayers || []).filter(layer => layer.order === 'front'))
  document.getElementById('discordName').textContent = displayName
  document.getElementById('discordUsername').textContent = '@' + profile.username
  if (profile.clan) {
    document.getElementById('discordClanTag').hidden = false
    const clanBadgeEl = document.getElementById('discordClanBadge')
    clanBadgeEl.src = profile.clan.badgeUrl
    clanBadgeEl.alt = 'Clan tag ' + profile.clan.tag
    document.getElementById('discordClanText').textContent = profile.clan.tag
  }
  const badgesEl = document.getElementById('discordBadges')
  badgesEl.replaceChildren(...(profile.badges || []).map(badge => {
    const img = document.createElement('img')
    img.className = 'discord-badge'
    img.src = badge.iconUrl
    img.alt = badge.description
    img.title = badge.description
    return img
  }))
  cardEl.hidden = false
  cardEl.classList.remove('discord-card-loading')
  document.getElementById('discordCardSkeleton').hidden = true
  cardEl.classList.toggle('has-discord-frame', Boolean(profile.frameLayers?.length))
  const updateFrameSize = () => {
    const width = cardEl.clientWidth
    cardEl.style.setProperty('--discord-frame-left', `${width * -0.0467}px`)
    cardEl.style.setProperty('--discord-frame-width', `${width * 1.0934}px`)
    cardEl.style.setProperty('--discord-frame-top', `${width * -0.17738}px`)
    cardEl.style.setProperty('--discord-frame-bottom', `${width * -0.12369}px`)
  }
  updateFrameSize()
  window.addEventListener('resize', updateFrameSize)

  const scenes = data.scenes.map(s => ({setup: s.setup || {}, config: s.config || {}}))
  const weather = data.weather
  const iconEl = document.getElementById('discordActivityIcon')
  const button1El = document.getElementById('discordButton1')
  const button2El = document.getElementById('discordButton2')

  let tick = 0
  const showTick = () => {
    const {sceneIndex, localIndex} = rpcResolveScene(scenes, tick)
    const scene = scenes[sceneIndex]
    const setup = scene.setup, source = scene.config
    const type = setup.type || 'LISTENING'
    const values = rpcValues(setup, weather)
    const nameList = Array.isArray(setup.name) ? setup.name : [setup.name || 'SuperUtils']
    const name = rpcFirst(nameList, localIndex) || 'SuperUtils'
    const label = t().activityLabels[type] || 'Activity'
    headerEl.textContent = type === 'STREAMING' ? label : label + ' ' + name
    detailEl.textContent = rpcRender(rpcFirst(source['text-1'], localIndex), values)
    stateEl.textContent = rpcRender(rpcFirst(source['text-2'], localIndex), values)
    assetEl.textContent = rpcRender(rpcFirst(source['text-3'], localIndex), values)
    const bigUrl = rpcFirstUrl(source.bigimg, localIndex)
    if (bigUrl) iconEl.style.backgroundImage = `url('${bigUrl}')`
    const b1 = rpcButton(source, 'button-1', localIndex), b2 = rpcButton(source, 'button-2', localIndex)
    button1El.hidden = !b1
    if (b1) { button1El.textContent = b1.name; button1El.href = b1.url }
    button2El.hidden = !b2
    if (b2) { button2El.textContent = b2.name; button2El.href = b2.url }
    tick++
    const delayMs = Math.max(1000, Number(setup.delay || 4) * 1000)
    setTimeout(showTick, delayMs)
  }
  showTick()
}

function money(value) {
  return Number(value || 0).toLocaleString('vi-VN') + 'đ'
}

function renderPlanGrid(plans) {
  const s = t()
  const grid = document.getElementById('planGrid')
  if (!grid || !Array.isArray(plans)) return
  const freePlan = { id: 'free', name: 'Free' }
  const all = [freePlan, ...plans]
  grid.innerHTML = all.map((plan, index) => {
    const isFree = plan.id === 'free'
    const isFeatured = plan.id === 'pluna'
    const benefitsItems = isFree ? s.planFreeBenefits : s.planPaidBenefits(plan)
    const benefits = `<div class="plan-card-benefits"><small>${s.planBenefitsLabel}</small><ul>${benefitsItems.map(item => `<li>${item}</li>`).join('')}</ul></div>`
    const price = isFree
      ? `<div class="plan-card-price">${s.planFree}</div>`
      : `<div class="plan-card-price">${money(plan.price)}${s.planPriceSuffix}</div>`
    const cta = isFree
      ? `<a class="plan-card-cta plan-card-cta-outline" href="/dashboard">${s.planCtaFree}</a>`
      : `<a class="plan-card-cta" href="/dashboard">${s.planCtaPaid}</a>`
    return `
    <article class="plan-card${isFeatured ? ' plan-card-featured' : ''}">
      ${isFeatured ? `<span class="plan-card-badge">${s.planBadgeFeatured}</span>` : ''}
      <div class="plan-card-core">
        <small class="plan-card-kicker">${isFree ? s.planKickerFree : s.planKickerPaid + String(index).padStart(2, '0')}</small>
        <h3>${plan.name}</h3>
        ${benefits}
        ${price}
        ${cta}
      </div>
    </article>
  `
  }).join('')
}

async function loadPrice() {
  try {
    const response = await fetch('/api/price')
    const data = await response.json()
    renderPlanGrid(data.plans)
  } catch {}
}

function setupScrollReveal() {
  const targets = document.querySelectorAll('.reveal')
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    targets.forEach(target => target.classList.add('reveal-visible'))
    return
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('reveal-visible')
    })
  }, {rootMargin:'0px 0px -10% 0px', threshold:.1})
  targets.forEach(target => observer.observe(target))
}

render()
scrollTo(0, 0)
addEventListener('load', () => scrollTo(0, 0))
setTimeout(() => scrollTo(0, 0), 600)
