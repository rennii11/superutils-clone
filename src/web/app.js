
    const $ = id => document.getElementById(id)
    function finishBoot() {
      const booting = document.documentElement.hasAttribute('data-booting')
      document.documentElement.removeAttribute('data-booting')
      $('boneyardOverlay')?.remove()
      $('bootScreen')?.remove()
      if (booting) showPage(pageFromPath())
    }
    if ('EventSource' in window) {
      const liveReload = new EventSource('/__web_reload')
      liveReload.onmessage = event => {
        const file = event.data
        if (file === 'voicepool-status') {
          if ($('page-voicepool').classList.contains('active')) void loadVoicepoolHealth(true)
          return
        }
        if (file === 'chatpool-status') {
          if ($('page-chatpool').classList.contains('active')) void loadChatpoolHealth(true)
          return
        }
        if (file === 'stream-status') {
          if ($('page-stream').classList.contains('active')) void loadStream()
          return
        }
        if (file === 'owo-status') {
          if ($('page-owo').classList.contains('active')) void loadOwo(true)
          return
        }
        if (file === 'billing-status') {
          void loadBilling()
          return
        }
        if (file === 'card-fees') {
          void loadCardFees()
          return
        }
        if (file === 'premium') {
          void loadConfigs()
          return
        }
        if (file.endsWith('.css')) {
          document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const url = new URL(link.href)
            if (url.pathname !== '/' + file) return
            url.searchParams.set('live', Date.now())
            link.href = url.href
          })
          return
        }
        location.reload()
      }
    }
    const themeToggle = $('themeToggle')
    const syncThemeToggle = () => {
      const dark = document.documentElement.dataset.theme === 'dark'
      themeToggle.setAttribute('aria-pressed', String(dark))
      themeToggle.setAttribute('aria-label', dark ? 'Chuyển sang nền trắng' : 'Chuyển sang nền đen')
      $('themeToggleLabel').textContent = dark ? 'NỀN ĐEN' : 'NỀN TRẮNG'
    }
    themeToggle.onclick = () => {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = theme
      try { localStorage.setItem('manga-theme', theme) } catch {}
      syncThemeToggle()
    }
    syncThemeToggle()

    const previewToggle = $('previewToggle')
    const previewSide = $('rpcSide')
    const previewBackdrop = $('previewBackdrop')
    function closePreview() {
      if (!previewSide) return
      previewSide.classList.remove('preview-open')
      if (previewBackdrop) previewBackdrop.hidden = true
      if (previewToggle) previewToggle.setAttribute('aria-expanded', 'false')
      document.documentElement.classList.remove('preview-scroll-lock')
      document.body.classList.remove('preview-scroll-lock')
    }
    if (previewToggle && previewSide) {
      previewToggle.onclick = () => {
        const open = previewSide.classList.toggle('preview-open')
        if (previewBackdrop) previewBackdrop.hidden = !open
        previewToggle.setAttribute('aria-expanded', String(open))
        document.documentElement.classList.toggle('preview-scroll-lock', open)
        document.body.classList.toggle('preview-scroll-lock', open)
      }
      if (previewBackdrop) previewBackdrop.onclick = closePreview
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && previewSide.classList.contains('preview-open')) closePreview()
      })
    }

    if (document.documentElement.dataset.layout === 'mobile') {
      const mobileSelectDialog = document.createElement('dialog')
      mobileSelectDialog.className = 'mobile-select-dialog'
      mobileSelectDialog.setAttribute('aria-labelledby', 'mobileSelectTitle')
      mobileSelectDialog.innerHTML = '<section class="mobile-select-sheet"><header><p>CHỌN GIÁ TRỊ</p><h2 id="mobileSelectTitle"></h2></header><div class="mobile-select-options" role="listbox"></div><button class="mobile-select-close" type="button">Đóng</button></section>'
      document.body.append(mobileSelectDialog)
      const mobileSelectTitle = mobileSelectDialog.querySelector('#mobileSelectTitle')
      const mobileSelectOptions = mobileSelectDialog.querySelector('.mobile-select-options')
      const mobileSelectClose = mobileSelectDialog.querySelector('.mobile-select-close')
      let mobileSelectTarget = null
      const selectFromEvent = event => event.target instanceof Element ? event.target.closest('select') : null
      const mobileSelectName = select => {
        const label = select.closest('label')
        const text = Array.from(label?.childNodes || [])
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .filter(Boolean)
          .join(' ')
        return select.getAttribute('aria-label') || text || 'Chọn giá trị'
      }
      function openMobileSelect(select) {
        if (select.disabled) return
        mobileSelectTarget = select
        mobileSelectDialog.classList.toggle('account-manager-select', Boolean(select.closest('.admin-user')))
        mobileSelectTitle.textContent = mobileSelectName(select)
        // ponytail: Current controls use flat options; add optgroup headings when grouped selects exist.
        mobileSelectOptions.replaceChildren(...Array.from(select.options).map(option => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'mobile-select-option'
          button.dataset.optionIndex = String(option.index)
          button.setAttribute('role', 'option')
          button.setAttribute('aria-selected', String(option.selected))
          button.disabled = option.disabled
          const icon = option.dataset.guildIcon
          if (icon) { const image = document.createElement('img'); image.className = 'guild-option-avatar'; image.src = icon; image.alt = ''; button.append(image) }
          const text = document.createElement('span'); text.textContent = option.textContent; button.append(text)
          return button
        }))
        if (mobileSelectDialog.open) mobileSelectDialog.close()
        mobileSelectDialog.showModal()
        requestAnimationFrame(() => {
          const selected = mobileSelectOptions.querySelector('[aria-selected="true"]') || mobileSelectOptions.querySelector('button:not(:disabled)')
          selected?.focus()
          selected?.scrollIntoView({block:'nearest'})
        })
      }
      mobileSelectOptions.onclick = event => {
        const button = event.target.closest('.mobile-select-option')
        if (!button || !mobileSelectTarget) return
        const option = mobileSelectTarget.options[Number(button.dataset.optionIndex)]
        if (!option || option.disabled) return
        const changed = mobileSelectTarget.selectedIndex !== option.index
        mobileSelectTarget.selectedIndex = option.index
        if (changed) {
          mobileSelectTarget.dispatchEvent(new Event('input', {bubbles:true}))
          mobileSelectTarget.dispatchEvent(new Event('change', {bubbles:true}))
        }
        mobileSelectDialog.close()
      }
      mobileSelectClose.onclick = () => mobileSelectDialog.close()
      mobileSelectDialog.addEventListener('click', event => {
        if (event.target !== mobileSelectDialog) return
        const rect = mobileSelectDialog.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) mobileSelectDialog.close()
      })
      mobileSelectDialog.addEventListener('close', () => {
        const select = mobileSelectTarget
        mobileSelectTarget = null
        mobileSelectDialog.classList.remove('account-manager-select')
        if (select?.isConnected) requestAnimationFrame(() => select.focus({preventScroll:true}))
      })
      document.addEventListener('click', event => {
        const select = selectFromEvent(event)
        if (!select || select.disabled) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!mobileSelectDialog.open) openMobileSelect(select)
      }, true)
      document.addEventListener('keydown', event => {
        const select = selectFromEvent(event)
        if (!select || select.disabled || !['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
        event.preventDefault()
        event.stopImmediatePropagation()
        openMobileSelect(select)
      }, true)
    }

    const apiHelp = {
      '{hour:1}': ['Giờ dạng 24h.', 'Ví dụ: 18'],
      '{hour:2}': ['Giờ dạng 12h.', 'Ví dụ: 06'],
      '{min:1}': ['Phút hiện tại.', 'Ví dụ: 05'],
      '{min:2}': ['Phút kèm AM/PM.', 'Ví dụ: 05 PM'],
      '{th=date}': ['Ngày trong tháng.', 'Ví dụ: 26'],
      '{th=month:1}': ['Số tháng.', 'Ví dụ: 6'],
      '{en=date}': ['Ngày tiếng Anh dạng ordinal.', 'Ví dụ: 26th'],
      '{en=week:1}': ['Thứ tiếng Anh viết tắt.', 'Ví dụ: Fri'],
      '{en=week:2}': ['Thứ tiếng Anh đầy đủ.', 'Ví dụ: Friday'],
      '{en=month:1}': ['Số tháng 2 chữ số.', 'Ví dụ: 06'],
      '{en=month:2}': ['Tên tháng tiếng Anh viết tắt.', 'Ví dụ: Jun'],
      '{en=month:3}': ['Tên tháng tiếng Anh đầy đủ.', 'Ví dụ: June'],
      '{en=year:1}': ['Năm 2 số.', 'Ví dụ: 26'],
      '{en=year:2}': ['Năm 4 số.', 'Ví dụ: 2026'],
      '{city}': ['Tên thành phố/tỉnh trong setup.city.', 'Ví dụ: Đồng Tháp'],
      '{region}': ['Khu vực/tỉnh từ dữ liệu thời tiết.', 'Ví dụ: Dong Thap'],
      '{country}': ['Quốc gia từ dữ liệu thời tiết.', 'Ví dụ: Vietnam'],
      '{temp:c}': ['Nhiệt độ Celsius.', 'Ví dụ: 28'],
      '{temp:f}': ['Nhiệt độ Fahrenheit.', 'Ví dụ: 82'],
      '{wind:kph}': ['Tốc độ gió km/h.', 'Ví dụ: 13'],
      '{wind:mph}': ['Tốc độ gió mph.', 'Ví dụ: 8'],
      '{wind:degree}': ['Góc gió.', 'Ví dụ: 180'],
      '{wind:dir}': ['Hướng gió.', 'Ví dụ: S'],
      '{pressure:mb}': ['Áp suất mbar.', 'Ví dụ: 1008'],
      '{pressure:in}': ['Áp suất inHg.', 'Ví dụ: 29.8'],
      '{precip:mm}': ['Lượng mưa mm.', 'Ví dụ: 0.1'],
      '{precip:in}': ['Lượng mưa inch.', 'Ví dụ: 0'],
      '{gust:kph}': ['Gió giật km/h.', 'Ví dụ: 20'],
      '{gust:mph}': ['Gió giật mph.', 'Ví dụ: 12'],
      '{feelslike:c}': ['Nhiệt độ cảm nhận Celsius.', 'Ví dụ: 31'],
      '{feelslike:f}': ['Nhiệt độ cảm nhận Fahrenheit.', 'Ví dụ: 88'],
      '{windchill:c}': ['Nhiệt độ gió lạnh Celsius.', 'Ví dụ: 28'],
      '{windchill:f}': ['Nhiệt độ gió lạnh Fahrenheit.', 'Ví dụ: 82'],
      '{heatindex:c}': ['Chỉ số nhiệt Celsius.', 'Ví dụ: 32'],
      '{heatindex:f}': ['Chỉ số nhiệt Fahrenheit.', 'Ví dụ: 90'],
      '{dewpoint:c}': ['Điểm sương Celsius.', 'Ví dụ: 24'],
      '{dewpoint:f}': ['Điểm sương Fahrenheit.', 'Ví dụ: 75'],
      '{vis:km}': ['Tầm nhìn km.', 'Ví dụ: 10'],
      '{vis:mi}': ['Tầm nhìn mile.', 'Ví dụ: 6'],
      '{humidity}': ['Độ ẩm phần trăm.', 'Ví dụ: 78'],
      '{cloud}': ['Mức độ mây phần trăm.', 'Ví dụ: 78'],
      '{uv}': ['Chỉ số UV.', 'Ví dụ: 0'],
      '{co}': ['Carbon monoxide trong không khí.', 'Ví dụ: 220'],
      '{no2}': ['Nitrogen dioxide trong không khí.', 'Ví dụ: 4'],
      '{o3}': ['Ozone trong không khí.', 'Ví dụ: 30'],
      '{so2}': ['Sulphur dioxide trong không khí.', 'Ví dụ: 2'],
      '{pm2.5}': ['Bụi mịn PM2.5.', 'Ví dụ: 12'],
      '{pm10}': ['Bụi PM10.', 'Ví dụ: 25'],
      '{user:name}': ['Username Discord đang chạy RPC.', 'Ví dụ: niyaa08_'],
      '{guild=members:SERVER_ID}': ['Số thành viên server theo ID.', 'Ví dụ: {guild=members:123456789012345678}'],
      '{guild=name:SERVER_ID}': ['Tên server theo ID.', 'Ví dụ: {guild=name:123456789012345678}'],
      '{guild=icon:SERVER_ID}': ['Icon server theo ID.', 'Ví dụ: {guild=icon:123456789012345678}'],
      '{emoji:random}': ['Emoji ngẫu nhiên.', 'Ví dụ: 🌸'],
      '{emoji:time}': ['Emoji theo buổi trong ngày.', 'Ví dụ: 🌙'],
      '{emoji:clock}': ['Emoji đồng hồ theo giờ.', 'Ví dụ: 🕕']
    }
    const gated=['config','voice','voicepool','chat','mention','chatpool','status','stream','owo']
    const gatedFeatureNames={config:'Rich Presence',voice:'Voice',voicepool:'Multi Voice',chat:'Auto Chat',mention:'Auto Reply',chatpool:'Multi Chat',status:'Status',stream:'Stream',owo:'OwO'}
    const hidden=['media','api']
    let freeFeatureLocked = false
    let voicepoolPageEnabled = false
    function setVoicepoolAccess(allowed) {
      voicepoolPageEnabled = allowed
      document.querySelectorAll('[data-page="voicepool"]').forEach(tab => { tab.hidden = !allowed })
      const page = document.getElementById("page-voicepool")
      if (page) page.hidden = !allowed
      if (!allowed && page?.classList.contains("active")) showPage("main")
    }
    function setFreeFeatureGates(freeOnly) {
      freeFeatureLocked = freeOnly
      for (const page of gated) {
        const root = $('page-' + page)
        if (!root) continue
        const current = root.querySelector('.free-feature-gate')
        if (!freeOnly) {
          root.removeAttribute('data-free-locked')
          current?.remove()
          continue
        }
        root.dataset.freeLocked = 'true'
        if (current) continue
        const gate = document.createElement('section')
        gate.className = 'free-feature-gate'
        const title = document.createElement('h2')
        title.textContent = gatedFeatureNames[page]
        const message = document.createElement('p')
        message.textContent = 'Chức năng này dành cho gói trả phí.'
        const plans = document.createElement('p')
        plans.textContent = 'Xem các gói hiện có'
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = 'Chuyển danh mục'
        button.onclick = () => showPage('plan')
        gate.append(title, message, plans, button)
        root.append(gate)
      }
    }
    const dashboardRoutes = {main:'/dashboard',config:'/dashboard/rpc',media:'/dashboard/media',status:'/dashboard/status',voice:'/dashboard/voice',voicepool:'/dashboard/voicepool',chat:'/dashboard/chat',mention:'/dashboard/mention',chatpool:'/dashboard/chatpool',stream:'/dashboard/stream',quest:'/dashboard/quest',owo:'/dashboard/owo',api:'/dashboard/api',plan:'/dashboard/plan',deposit:'/dashboard/deposit',admin:'/dashboard/admin'}
    let dashboardAccessReady = false
    function showPage(name) {
      if (document.documentElement.hasAttribute('data-booting') && name !== (window.dashboardBootPage || 'main')) return
      closePreview()
      const requested = dashboardAccessReady && name === "admin" && document.getElementById("adminTab").hidden ? "main" : dashboardAccessReady && name === "plan" && document.getElementById("planTab").hidden ? "main" : dashboardAccessReady && name === "deposit" && document.getElementById("depositTab").hidden ? "main" : dashboardAccessReady && name === "voicepool" && !voicepoolPageEnabled ? "main" : name
      document.querySelectorAll('.page').forEach(page => page.classList.remove('active'))
      const page = requested === 'media' ? 'media' : requested === 'api' ? 'api' : requested === 'plan' ? 'plan' : requested === 'deposit' ? 'deposit' : requested === 'main' ? 'main' : requested === 'admin' ? 'admin' : requested === 'stream' ? 'stream' : requested === 'quest' ? 'quest' : requested === 'owo' ? 'owo' : requested === 'voicepool' ? 'voicepool' : requested === 'voice' ? 'voice' : requested === 'chat' ? 'chat' : requested === 'mention' ? 'mention' : requested === 'chatpool' ? 'chatpool' : requested === 'status' ? 'status' : 'config'
      $('page-' + page).classList.add('active')
      document.body.classList.toggle('config-page', page === 'config')
      document.body.classList.toggle('main-page', page === 'main')
      let activeLink
      document.querySelectorAll('[data-page]').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page)
        if (link.dataset.page === page) activeLink = link
      })
      try { localStorage.setItem('dashboardPage', page) } catch {}
      if (document.documentElement.dataset.layout === 'mobile' && activeLink) requestAnimationFrame(() => {
        const tabs = $('tabs')
        tabs.scrollTo({left:Math.max(0,activeLink.offsetLeft-(tabs.clientWidth-activeLink.clientWidth)/2),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
      })
      const route = dashboardRoutes[page]
      if (route && location.pathname !== route) history.pushState(null, '', route)
    }
    const menuToggle = $('menuToggle')
    const closeMobileMenu = () => {
      document.querySelector('.topbar')?.classList.remove('menu-open')
      document.documentElement.classList.remove('menu-lock')
      if (menuToggle) {
        menuToggle.setAttribute('aria-expanded', 'false')
        menuToggle.setAttribute('aria-label', 'Mở menu')
        menuToggle.textContent = '☰'
      }
    }
    if (menuToggle) {
      menuToggle.onclick = () => {
        const topbar = document.querySelector('.topbar')
        const open = topbar ? topbar.classList.toggle('menu-open') : false
        document.documentElement.classList.toggle('menu-lock', open)
        menuToggle.setAttribute('aria-expanded', String(open))
        menuToggle.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu')
        menuToggle.textContent = open ? '✕' : '☰'
      }
    }
    $('mobileMenuScrim')?.addEventListener('click', closeMobileMenu)
    window.addEventListener('pageshow', closeMobileMenu)
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.querySelector('.topbar')?.classList.contains('menu-open')) closeMobileMenu()
    })
    document.querySelectorAll('[data-page]').forEach(link => link.onclick = event => {
      event.preventDefault()
      const page = link.dataset.page
      showPage(page)
      if (freeFeatureLocked&&gated.includes(page)) { closeMobileMenu(); return }
      if (page === 'owo') void loadOwo()
      if (page === 'media') void loadMediaGallery()
      if (page === 'quest') void loadQuest()
      if (page === 'stream') void loadStream()
      if (page === 'voicepool') void loadVoicepoolHealth()
      if (page === 'chatpool') void loadChatpoolHealth()
      closeMobileMenu()
    })
    const pageFromPath = () => Object.entries(dashboardRoutes).find(([, route]) => route === location.pathname)?.[0] || 'main'
    showPage(pageFromPath())
    addEventListener('popstate', () => showPage(pageFromPath()))
    document.querySelectorAll('.api code').forEach(code => code.onclick = () => {
      document.querySelectorAll('.api code').forEach(item => item.classList.remove('active'))
      code.classList.add('active')
      const key = code.textContent.trim()
      const info = apiHelp[key] || ['Không có mô tả.', 'Ví dụ: ' + key]
      $('apiInfo').innerHTML = '<h2>' + key + '</h2><p>' + info[0] + '</p><p>' + info[1] + '</p>'
    })
    const lines = id => $(id).value.split('\n').map(x => x.trim()).filter(Boolean)
    const rpcNames = value => (Array.isArray(value) ? value : [value]).filter(name => typeof name === 'string').map(name => name.trim()).filter(Boolean)
    const rpcNameAt = (value, index = 0) => { const names = rpcNames(value); return names.length ? names[index % names.length] : '' }
    const buttons = id => lines(id).slice(0, 2).map(line => {
      const [name, ...url] = line.split('|')
      return { name: name.trim(), url: url.join('|').trim() }
    }).filter(x => x.name)
    const nullable = value => value.trim() ? value.trim() : null
    const isUrl = value => /^https?:\/\//.test(value) || /^(mp:external|youtube:|spotify:|twitch:)/.test(value)
    function validStreamURL(value) {
      try {
        const url = new URL(value)
        return url.protocol === 'https:' && /(^|\.)(twitch\.tv|youtube\.com|youtu\.be)$/i.test(url.hostname)
      } catch { return false }
    }
    const buttonNameBytes = value => new TextEncoder().encode(value).length
    let syncing = false
    let statusProfilePreviewIndex = -1
    let statusProfilePreviewStartedAt = performance.now()
    let statusProfilePreviewTimer = null
    const discordSelectorState = {
      chat: {sequence:0, guilds:[], guildId:"", channelId:""},
      owo: {sequence:0, guilds:[], guildId:"", channelId:""},
      voice: {sequence:0, guilds:[], guildId:"", channelId:""}
    }
    function discordSelectorIds(mode) { if (mode === "voice") return ["voiceGuild", "voiceChannel"]; if (mode.startsWith("owo")) return [mode + "Guild", mode + "Channel"]; return ["chatGuild", "chatChannel"] }
    function discordTarget() {
      if (typeof configSlotMode !== 'undefined' && configSlotMode) return linkedSlotId ? configSlotTarget() : null
      return linkedUser ? {user:linkedUser,...(linkedLocation === 'disabled' ? {location:'disabled'} : {})} : null
    }
    function selectValue(select, value, fallback) {
      if (value && !Array.from(select.options).some(option => option.value === value)) select.append(new Option(fallback + ' · ' + value, value))
      select.value = value || ''
    }
    function renderGuildAvatar(mode, guildId) {
      const avatar=document.querySelector('[data-guild-avatar="' + mode + '"]')
      if (!avatar) return
      const guild=discordSelectorState[mode].guilds.find(item => item.id === guildId)
      const fallback=avatar.querySelector('.guild-avatar-fallback'),image=avatar.querySelector('img')
      fallback.textContent=(guild?.name || 'G').trim().slice(0,1).toUpperCase() || 'G'
      avatar.classList.toggle('has-image',Boolean(guild?.icon))
      if (guild?.icon) { image.onerror=()=>avatar.classList.remove('has-image');image.src=guild.icon }
      else image.removeAttribute('src')
    }
    function renderDiscordGuilds(mode, preferredGuild = '') {
      const [guildId] = discordSelectorIds(mode), select=$(guildId), state=discordSelectorState[mode]
      select.replaceChildren(new Option(state.guilds.length ? 'Chọn guild' : 'Không có guild', ''))
      select.append(...state.guilds.map(guild => { const option=new Option(guild.name,guild.id);if(guild.icon)option.dataset.guildIcon=guild.icon;return option }))
      selectValue(select, preferredGuild, 'Guild đã lưu')
      select.disabled = !state.guilds.length
      renderGuildAvatar(mode,select.value)
    }
    function renderDiscordChannels(mode, guildId, preferredChannel = '') {
      const [,channelId] = discordSelectorIds(mode), select=$(channelId), state=discordSelectorState[mode]
      const guild=state.guilds.find(item => item.id === guildId), channels=Array.isArray(guild?.channels) ? guild.channels : []
      select.replaceChildren(new Option(guildId ? (channels.length ? 'Chọn channel' : 'Không có channel phù hợp') : 'Chọn guild trước', ''))
      select.append(...channels.map(channel => new Option(channel.name, channel.id)))
      selectValue(select, preferredChannel, 'Channel đã lưu')
      select.disabled = !guildId || !channels.length
    }
    function renderDiscordChannelLoading(mode) {
      const [,channelId] = discordSelectorIds(mode), select=$(channelId)
      select.replaceChildren(new Option('Loading...', ''))
      select.disabled = true
    }
    function renderDiscordFallback(mode, guildId, channelId, message) {
      const [guildSelectId,channelSelectId]=discordSelectorIds(mode)
      const guildSelect=$(guildSelectId),channelSelect=$(channelSelectId)
      guildSelect.replaceChildren(new Option(guildId ? 'Guild đã lưu · ' + guildId : message, guildId || ''))
      guildSelect.value=guildId||'';guildSelect.disabled=!guildId
      channelSelect.replaceChildren(new Option(channelId ? 'Channel đã lưu · ' + channelId : 'Chọn guild trước', channelId || ''))
      channelSelect.value=channelId||'';channelSelect.disabled=!guildId||!channelId
      renderGuildAvatar(mode,guildId)
    }
    async function fetchDiscordDirectory(query) {
      const request=()=>fetch("/api/discord/channels?" + query,{credentials:"same-origin",cache:"no-store"}).catch(()=>null)
      let response=await request()
      if(!response?.ok&&(!response||response.status>=500)){await new Promise(resolve=>setTimeout(resolve,350));response=await request()}
      return response
    }
    async function loadDiscordGuildChannels(mode, guildId, preferredChannel = "") {
      const state=discordSelectorState[mode], sequence=++state.sequence
      state.guildId=guildId;state.channelId=preferredChannel
      renderDiscordChannels(mode, guildId, preferredChannel)
      if (!guildId) return
      const target=discordTarget()
      if (!target) return
      renderDiscordChannelLoading(mode)
      const query=new URLSearchParams({...target,mode:mode.startsWith("owo") ? "chat" : mode,guildId}).toString()
      const response=await fetchDiscordDirectory(query)
      if (sequence !== state.sequence) return
      if (!response?.ok) { renderDiscordFallback(mode,guildId,preferredChannel,"Không tải được guild"); return }
      const result=await response.json().catch(()=>null)
      const guild=Array.isArray(result?.guilds)?result.guilds[0]:null
      if (!guild) { renderDiscordChannels(mode,guildId,preferredChannel); return }
      state.guilds=state.guilds.map(item => item.id===guild.id ? guild : item)
      renderDiscordChannels(mode,guildId,preferredChannel)
    }
    async function loadDiscordSelectors(mode, preferredGuild = "", preferredChannel = "") {
      const state=discordSelectorState[mode], sequence=++state.sequence, target=discordTarget()
      state.guildId=preferredGuild;state.channelId=preferredChannel
      if (!target) { renderDiscordFallback(mode,preferredGuild,preferredChannel,"Chọn token trước"); return }
      const [guildSelectId,channelSelectId]=discordSelectorIds(mode)
      $(guildSelectId).disabled=true;$(channelSelectId).disabled=true
      $(guildSelectId).replaceChildren(new Option("Đang tải guild…", ""))
      $(channelSelectId).replaceChildren(new Option("Chọn guild trước", ""))
      const query=new URLSearchParams({...target,mode:mode.startsWith("owo") ? "chat" : mode}).toString()
      const response=await fetchDiscordDirectory(query)
      if (sequence !== state.sequence) return
      if (!response?.ok) { renderDiscordFallback(mode,preferredGuild,preferredChannel,"Không tải được guild"); return }
      const result=await response.json().catch(()=>null)
      state.guilds=Array.isArray(result?.guilds) ? result.guilds.map(guild => ({...guild,channels:Array.isArray(guild.channels)?guild.channels:[]})) : []
      state.guildId=preferredGuild
      renderDiscordGuilds(mode,preferredGuild)
      renderDiscordChannels(mode,preferredGuild,preferredChannel)
      if (preferredGuild) await loadDiscordGuildChannels(mode,preferredGuild,preferredChannel)
    }
    function initDiscordSelectors(mode) {
      const [guildId,channelId]=discordSelectorIds(mode)
      $(guildId).onchange=()=>{const value=$(guildId).value;renderGuildAvatar(mode,value);void loadDiscordGuildChannels(mode,value,"");mode === "voice" ? buildVoice() : mode === "chat" ? buildChat() : (owoFormTouched = true)}
      $(channelId).onchange=()=>{discordSelectorState[mode].channelId=$(channelId).value;mode === "voice" ? buildVoice() : mode === "chat" ? buildChat() : (owoFormTouched = true)}
    }
    initDiscordSelectors("chat");initDiscordSelectors("voice");initDiscordSelectors("owo")
    function validate(data) {
      const errors = []
      if (!data.setup.city) errors.push('Thiếu thành phố/tỉnh.')
      if (!rpcNames(data.setup.name).length && data.setup.type !== 'STREAMING') errors.push('Thiếu name.')
      if (data.setup.mode === 'SPOTIFY' && !(Array.isArray(data.setup.spotifyTracks) ? data.setup.spotifyTracks.length : data.setup.spotifyTrack?.id)) errors.push('Chưa chọn bài Spotify.')
      if (data.setup.mode !== 'SPOTIFY' && data.setup.type === 'STREAMING' && !validStreamURL(data.setup.streamURL)) errors.push('Stream URL phải là HTTPS Twitch hoặc YouTube.')
      if (data.setup.mode && !['RICH_PRESENCE', 'META_QUEST', 'XBOX', 'PLAYSTATION', 'YOUTUBE', 'SPOTIFY'].includes(data.setup.mode)) errors.push('RPC mode không hợp lệ.')
      if (data.setup.mode === 'SPOTIFY' && scenes.length > 1) errors.push('Không thể dùng mode SPOTIFY khi có hơn 1 scene.')
      if (!Number.isFinite(data.setup.delay) || data.setup.delay < 1) errors.push('Delay phải từ 1 giây trở lên.')
      if (data.setup.mode !== 'SPOTIFY' && !data.config['text-1']?.length) errors.push('Thiếu text-1.')
      if (data.setup.mode !== 'SPOTIFY' && !data.config['text-2']?.length) errors.push('Thiếu text-2.')
      if (data.setup.mode !== 'SPOTIFY' && !['PLAYING', 'WATCHING'].includes(data.setup.type) && !data.config['text-3']?.length) errors.push('Thiếu text-3.')
      if (data.setup.mode !== 'SPOTIFY' && !data.config.bigimg?.length) errors.push('Thiếu bigimg.')
      ;(data.config.bigimg || []).forEach((url, i) => { if (!isUrl(url)) errors.push('Big image dòng ' + (i + 1) + ' không đúng URL.') })
      ;(data.config.smallimg || []).forEach((url, i) => { if (!isUrl(url)) errors.push('Small image dòng ' + (i + 1) + ' không đúng URL.') })
      ;['button-1', 'button-2'].forEach(key => (data.config[key] || []).forEach((button, i) => {
        const name = String(button.name || '')
        const bytes = buttonNameBytes(name)
        if (bytes > 32) errors.push(key + ' dòng ' + (i + 1) + ' name vượt giới hạn UTF-8 (' + bytes + '/32 byte).')
        if (!button.url) errors.push(key + ' dòng ' + (i + 1) + ' thiếu URL.')
        else if (!/^https?:\/\//.test(button.url)) errors.push(key + ' dòng ' + (i + 1) + ' URL không hợp lệ.')
      }))
      return errors
    }
    function validateVoice(data) {
      const errors = []
      if (!data.Guild) errors.push('Thiếu Guild ID.')
      if (!data.Channel) errors.push('Thiếu Channel ID.')
      if (!Number.isFinite(data.RefreshMs) || data.RefreshMs < 5000) errors.push('RefreshMs phải từ 5000 trở lên.')
      return errors
    }
    function validateVoicepool(data) {
      const errors = []
      if (!Array.isArray(data.Tokens) || !data.Tokens.length) errors.push('Thiếu token.')
      if (!data.Guild) errors.push('Thiếu Guild ID.')
      if (!data.Channel) errors.push('Thiếu Channel ID.')
      if (!Number.isFinite(data.RefreshMs) || data.RefreshMs < 5000) errors.push('RefreshMs phải từ 5000 trở lên.')
      return errors
    }
    function validateMention(data) {
      const errors = []
      if (!data.replyText || !data.replyText.trim()) errors.push('Thiếu nội dung tin nhắn phản hồi.')
      if (data.replyText && data.replyText.length > 2000) errors.push('Tin nhắn phản hồi tối đa 2000 ký tự.')
      return errors
    }
    function validateChat(data) {
      const errors = []
      if (!data.guildId) errors.push('Thiếu Guild ID.')
      if (!data.channelId) errors.push('Thiếu Channel ID.')
      if (data.mode === 'text-war' && !/^\d{17,20}$/.test(data.targetUserId || '')) errors.push('ID user cần ping không hợp lệ.')
      if (data.mode !== 'text-war' && (!Array.isArray(data.texts) || !data.texts.length)) errors.push('Thiếu text.')
      if (data.image && !/^media\/chat-image\.(png|jpe?g|gif|webp)$/i.test(data.image)) errors.push('Ảnh Auto Chat không hợp lệ.')
      if (!Number.isFinite(data.delaySeconds) || data.delaySeconds < 0.1) errors.push('Delay phải từ 0.1 giây trở lên.')
      return errors
    }
    function validateChatpool(data) {
      const errors = []
      if (!Array.isArray(data.Tokens) || !data.Tokens.length) errors.push('Thiếu token.')
      if (!data.guildId) errors.push('Thiếu Guild ID.')
      if (!data.channelId) errors.push('Thiếu Channel ID.')
      if (data.mode === 'text-war' && !/^\d{17,20}$/.test(data.targetUserId || '')) errors.push('ID user cần ping không hợp lệ.')
      if (data.mode !== 'text-war' && (!Array.isArray(data.texts) || !data.texts.length)) errors.push('Thiếu text.')
      if (data.image && !/^media\/chatpool-image\.(png|jpe?g|gif|webp)$/i.test(data.image)) errors.push('Ảnh Multi Chat không hợp lệ.')
      if (!Number.isFinite(data.delaySeconds) || data.delaySeconds < 0.1) errors.push('Delay phải từ 0.1 giây trở lên.')
      return errors
    }
    function buildVoicepool() {
      if (syncing) return
      const data = {
        Tokens: lines('voicepoolTokens').slice(0, 50),
        Guild: $('voicepoolGuild').value.trim(),
        Channel: $('voicepoolChannel').value.trim(),
        Stream: $('voicepoolStream').value === 'true',
        Camera: $('voicepoolCamera').value === 'true',
        SelfMute: $('voicepoolMute').value !== 'true',
        SelfDeaf: $('voicepoolDeaf').value !== 'true',
        RefreshMs: Number($('voicepoolRefresh').value || 60000)
      }
      $('voicepoolOutput').value = JSON.stringify(data, null, 2)
      const errors = validateVoicepool(data)
      $('voicepoolErrors').textContent = errors.join('\n')
    }
    function fillVoicepoolFromJson() {
      try {
        const data = JSON.parse($('voicepoolOutput').value)
        syncing = true
        $('voicepoolTokens').value = Array.isArray(data.Tokens) ? data.Tokens.join('\n') : ''
        $('voicepoolGuild').value = data.Guild || ''
        $('voicepoolChannel').value = data.Channel || ''
        $('voicepoolStream').value = String(data.Stream !== false)
        $('voicepoolCamera').value = String(Boolean(data.Camera))
        $('voicepoolMute').value = String(data.SelfMute === false)
        $('voicepoolDeaf').value = String(data.SelfDeaf !== true)
        $('voicepoolRefresh').value = data.RefreshMs ?? 60000
        syncing = false
        const errors = validateVoicepool(data)
        $('voicepoolErrors').textContent = errors.join('\n')
      } catch {
        syncing = false
        $('voicepoolErrors').textContent = 'JSON không hợp lệ.'
      }
    }
    function updateChatMode(prefix) {
      const war = $(prefix + 'Random').value === 'text-war'
      $(prefix + 'TargetField').hidden = !war
      $(prefix + 'TextsField').hidden = war
    }
    function chatImageUrl(path) {
      const file = typeof path === 'string' ? path.split('/').pop() : ''
      const folder = configSlotMode ? configSlots.find(slot => slot.id === linkedSlotId)?.folder : linkedUser
      const owner = folder?.split('/')[0]
      return file && owner ? '/accounts/' + encodeURIComponent(owner) + '/media/' + encodeURIComponent(file) : ''
    }
    async function loadMediaGallery() { const box=$('mediaGallery');if(!box)return;const target=configSlotMode?configSlotTarget():{};box.classList.add('is-loading');if(box.dataset.loaded!=='1'){const spinner=document.createElement('div');spinner.className='media-gallery-spinner';const i=document.createElement('i');const span=document.createElement('span');span.textContent='Đang tải kho ảnh…';spinner.append(i,span);box.replaceChildren(spinner)}const response=await fetch('/api/media?'+new URLSearchParams(target),{credentials:'same-origin'}).catch(()=>null);const items=response?.ok?(await response.json()).items||[]:[];box.dataset.loaded='1';box.classList.remove('is-loading');box.replaceChildren(...(items.length?items:[{name:'Kho ảnh đang trống.',url:''}]).map(item=>{const card=document.createElement('article');card.className='media-gallery-item';if(item.url){const shell=document.createElement('div');shell.className='media-card-shell';const img=document.createElement('img');img.src=item.url;img.alt='';img.onerror=()=>{img.onerror=null;img.hidden=true;const retry=document.createElement('button');retry.type='button';retry.className='media-card-retry';retry.textContent='Không tải được ảnh · Bấm để thử lại';retry.onclick=()=>{retry.remove();img.hidden=false;img.src=item.url+(item.url.includes('?')?'&':'?')+'retry='+Date.now()};shell.append(retry)};shell.append(img);card.append(shell);const meta=document.createElement('div');meta.className='media-card-meta';const name=document.createElement('span');name.textContent=item.name;const actions=document.createElement('div');const copy=document.createElement('button');copy.type='button';copy.textContent='Copy link';copy.onclick=()=>navigator.clipboard?.writeText(location.origin+item.url);const del=document.createElement('button');del.type='button';del.textContent='Xoá';del.onclick=async()=>{await fetch('/api/media?'+new URLSearchParams({...target,name:item.name}),{method:'DELETE',credentials:'same-origin'});void loadMediaGallery();void loadMediaPicker()};actions.append(copy,del);meta.append(name,actions);card.append(meta)}else card.textContent=item.name;return card})) }

    function renderImageChooserLibrary(items) {
      const library=$('imageChooserLibrary')
      if (!library) return
      library.replaceChildren(...(items.length ? items : [{name:'Kho ảnh đang trống.',url:''}]).map(item => {
        if (!item.url) { const empty=document.createElement('p'); empty.className='image-chooser-empty'; empty.textContent=item.name; return empty }
        const button=document.createElement('button'); button.type='button'; button.className='image-chooser-library-item'; button.dataset.imageUrl=item.url
        const image=document.createElement('img'); image.src=item.url; image.alt=item.name; image.loading='lazy'
        const name=document.createElement('span'); name.textContent=item.name
        button.append(image,name)
        return button
      }))
    }
    async function loadMediaPicker() {
      const target=configSlotMode?configSlotTarget():{user:linkedUser||undefined}
      const response=await fetch('/api/media?'+new URLSearchParams(target),{credentials:'same-origin'}).catch(()=>null)
      const items=response?.ok?(await response.json()).items||[]:[]
      for(const id of ['mediaPicker','chatMediaPicker','chatpoolMediaPicker']){const select=$(id);if(!select)continue;select.replaceChildren(new Option(id==='mediaPicker'?'Chọn ảnh để thêm vào Big image':'Chọn ảnh đã upload',''),...items.map(item=>new Option(item.name,item.url)))}
      renderImageChooserLibrary(items)
    }

    function setChatImage(prefix, path, url = '') {
      const value = typeof path === 'string' ? path : ''
      $(prefix + 'Image').value = value
      const preview = $(prefix + 'ImagePreview'), remove = $(prefix + 'ImageRemove')
      const source = url || chatImageUrl(value)
      preview.hidden = !source
      if (source) preview.src = source
      else preview.removeAttribute('src')
      $(prefix + 'ImageName').textContent = value ? value.split('/').pop() : 'Chưa chọn ảnh'
      remove.hidden = !value
    }
    async function uploadChatImage(prefix, file) {
      const input = $(prefix + 'ImageFile'), errors = $(prefix + 'Errors')
      if (!file) return
      if (file.size > 8 * 1024 * 1024) { errors.textContent = 'Ảnh không được vượt quá 8 MiB.'; input.value = ''; return }
      input.disabled = true
      errors.textContent = 'Đang tải ảnh...'
      try {
        const extension = file.name.split('.').pop()?.toLowerCase(), contentType = (file.type === 'image/jpg' ? 'image/jpeg' : file.type) || ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'}[extension] || '')
        if (!contentType) throw new Error('Chỉ hỗ trợ PNG, JPEG, GIF hoặc WebP.')
        const target = configSlotMode ? configSlotTarget() : {user:linkedUser || undefined,...(linkedLocation==='disabled'?{location:'disabled'}:{})}
        const query = new URLSearchParams({file:prefix === 'chatpool' ? 'chatpool' : 'chat',...target}).toString()
        let bytes
        for (let attempt = 0; ; attempt++) {
          try { bytes = await file.arrayBuffer(); break }
          catch {
            if (attempt === 2) throw new Error('Không thể đọc ảnh đã chọn. Hãy chọn lại ảnh.')
            await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt))
          }
        }
        const request = () => fetch('/api/chat/image?' + query, {method:'POST',headers:{'content-type':contentType},body:bytes,credentials:'same-origin'})
        let response
        for (let attempt = 0; ; attempt++) {
          try { response = await request(); break }
          catch {
            if (attempt === 3) throw new Error('Mất kết nối khi tải ảnh. Vui lòng thử lại.')
            await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt))
          }
        }
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Không thể tải ảnh.')
        setChatImage(prefix, result.image, result.url)
        prefix === 'chatpool' ? buildChatpool() : buildChat()
        errors.textContent = [errors.textContent, 'Đã nhận ảnh. Bấm Lưu config & Discord để áp dụng.'].filter(Boolean).join('\n')
      } catch (error) { errors.textContent = error instanceof Error ? error.message : 'Không thể tải ảnh.' }
      finally { input.disabled = false }
    }
    let mentionLogItems = []
    const selectedMentionLogIds = new Set()
    function mentionLogTime(at) {
      return window.formatMentionLogTime(at)
    }
    function mentionTarget() {
      return configSlotMode ? configSlotTarget() : {user:linkedUser || undefined,...(linkedLocation==="disabled"?{location:"disabled"}:{})}
    }
    function updateMentionSelection() {
      const selected = document.getElementById("mentionSelection")
      const removeSelected = document.getElementById("mentionDeleteSelected")
      if (selected) selected.textContent = selectedMentionLogIds.size ? "Đã chọn " + selectedMentionLogIds.size : "Chưa chọn"
      if (removeSelected) removeSelected.disabled = selectedMentionLogIds.size === 0
      const removeAll = document.getElementById("mentionDeleteAll")
      if (removeAll) removeAll.disabled = mentionLogItems.length === 0
    }
    function renderMentionLog(list) {
      const box = document.getElementById("mentionLog")
      if (!box) return
      mentionLogItems = Array.isArray(list) ? [...list].sort((left, right) => Number(right?.at || 0) - Number(left?.at || 0)) : []
      const currentIds = new Set(mentionLogItems.map(item => typeof item?.id === "string" ? item.id : ""))
      for (const id of selectedMentionLogIds) if (!currentIds.has(id)) selectedMentionLogIds.delete(id)
      updateMentionSelection()
      if (!mentionLogItems.length) { box.replaceChildren(Object.assign(document.createElement("p"), {className:"mention-log-empty", textContent:"Chưa có lượt mention nào."})); return }
      box.replaceChildren(...mentionLogItems.map(item => {
        const row = document.createElement("div")
        row.className = "mention-log-item"
        const checkLabel = document.createElement("label")
        checkLabel.className = "mention-log-check"
        const check = document.createElement("input")
        check.type = "checkbox"
        check.checked = selectedMentionLogIds.has(item.id)
        check.setAttribute("aria-label", "Chọn tin nhắn mention")
        check.addEventListener("change", () => {
          if (check.checked) selectedMentionLogIds.add(item.id)
          else selectedMentionLogIds.delete(item.id)
          updateMentionSelection()
        })
        const meta = document.createElement("span")
        meta.className = "mention-log-meta"
        meta.textContent = window.formatMentionLog(item, mentionLogTime(item.at))
        checkLabel.append(check, meta)
        const link = document.createElement("a")
        link.href = item.url || "#"
        link.target = "_blank"
        link.rel = "noopener"
        link.textContent = "Xem tin nhắn"
        row.append(checkLabel, link)
        return row
      }))
    }
    async function deleteMentionLog(deleteAll) {
      const ids = [...selectedMentionLogIds]
      if (!deleteAll && !ids.length) return
      if (deleteAll && !window.confirm("Xóa toàn bộ lịch sử mention?")) return
      const removeSelected = document.getElementById("mentionDeleteSelected")
      const removeAll = document.getElementById("mentionDeleteAll")
      const error = document.getElementById("mentionErrors")
      if (!removeSelected || !removeAll || !error) return
      removeSelected.disabled = true
      removeAll.disabled = true
      try {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(mentionTarget())) if (typeof value === "string" && value) query.set(key, value)
        const response = await fetch("/api/mention-log?" + query, {method:"DELETE", headers:{"content-type":"application/json"}, credentials:"same-origin", body:JSON.stringify({deleteAll, ids})})
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || "Không thể xóa lịch sử mention.")
        selectedMentionLogIds.clear()
        error.textContent = ""
        await loadConfigs()
      } catch (reason) {
        error.textContent = reason instanceof Error ? reason.message : "Không thể xóa lịch sử mention."
      } finally {
        updateMentionSelection()
      }
    }
    document.getElementById("mentionDeleteSelected").onclick = () => { void deleteMentionLog(false) }
    document.getElementById("mentionDeleteAll").onclick = () => { void deleteMentionLog(true) }
    function buildMention() {
      if (syncing) return
      const data = { replyText: $("mentionReplyText").value.slice(0, 2000), dmEnabled: $("mentionDmEnabled").checked, historyEnabled: $("mentionHistoryEnabled").checked }
      $("mentionOutput").value = JSON.stringify(data, null, 2)
      const errors = validateMention(data)
      $("mentionErrors").textContent = errors.join("\n")
    }
    function fillMentionFromJson() {
      try {
        const data = JSON.parse($("mentionOutput").value)
        syncing = true
        $("mentionReplyText").value = data.replyText || ""
        $("mentionDmEnabled").checked = data.dmEnabled !== false
        $("mentionHistoryEnabled").checked = data.historyEnabled !== false
        syncing = false
        const errors = validateMention(data)
        $("mentionErrors").textContent = errors.join("\n")
      } catch { $("mentionErrors").textContent = "JSON không hợp lệ." }
    }
    function buildChat() {
      if (syncing) return
      updateChatMode('chat')
      const mode = $('chatRandom').value
      const data = {
        guildId: $('chatGuild').value.trim(),
        channelId: $('chatChannel').value.trim(),
        delaySeconds: Number($('chatDelay').value || 30),
        mode,
        ...($('chatImage').value ? {image:$('chatImage').value} : {}),
        ...(mode === 'text-war' ? {targetUserId: $('chatTargetUser').value.trim()} : {texts: lines('chatTexts').slice(0, 100)})
      }
      $('chatOutput').value = JSON.stringify(data, null, 2)
      const errors = validateChat(data)
      $('chatErrors').textContent = errors.join('\n')
    }
    function fillChatFromJson() {
      try {
        const data = JSON.parse($('chatOutput').value)
        syncing = true
        $('chatGuild').value = data.guildId || ''
        $('chatChannel').value = data.channelId || ''
        $('chatTexts').value = Array.isArray(data.texts) ? data.texts.join('\n') : ''
        $('chatDelay').value = data.delaySeconds ?? 30
        $('chatRandom').value = data.mode === 'text-war' ? 'text-war' : data.mode === 'random' || data.randomChat === true ? 'random' : 'ordered'
        $('chatTargetUser').value = data.targetUserId || ''
        setChatImage('chat', data.image || '')
        updateChatMode('chat')
        syncing = false
        discordSelectorState.chat.guildId=data.guildId||''
        discordSelectorState.chat.channelId=data.channelId||''
        void loadDiscordSelectors('chat', data.guildId||'', data.channelId||'')
        const errors = validateChat(data)
        $('chatErrors').textContent = errors.join('\n')
      } catch {
        syncing = false
        $('chatErrors').textContent = 'JSON không hợp lệ.'
      }
    }
    function parseStatusEmoji(value) {
      const match = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>$/.exec(String(value || '').trim())
      if (!match) return null
      return {emojiName: match[2], emojiId: match[3], emojiAnimated: match[1] === 'a'}
    }
    function parseStatusUnicodeEmoji(value) {
      const input = String(value || '').trim()
      if (!input || typeof Intl.Segmenter !== 'function') return null
      const segments = Array.from(new Intl.Segmenter(undefined, {granularity:'grapheme'}).segment(input))
      if (segments.length !== 1 || segments[0].segment !== input) return null
      if (!/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3)/u.test(input)) return null
      return {emojiName: input}
    }
    function statusHasNitro() {
      return Number.isInteger(statusPremiumType) && statusPremiumType > 0
    }
    function statusEmojiLabel(global = false) {
      const prefix = global ? 'Emoji chung' : 'Emoji'
      if (statusHasNitro()) return prefix + ' (<:name:id>/<a:name:id> hoặc Unicode)'
      if (statusPremiumType === 0) return prefix + ' (Unicode)'
      return prefix + ' (Unicode — chưa xác định Nitro)'
    }
    function updateStatusEmojiLabels() {
      const globalLabel = $('statusEmojiInput').closest('label')
      if (globalLabel?.firstChild) globalLabel.firstChild.nodeValue = statusEmojiLabel(true)
      document.querySelectorAll('.status-item-emoji-label').forEach(label => {
        if (label.firstChild) label.firstChild.nodeValue = statusEmojiLabel(false)
      })
    }
    function statusEmojiInput(data) {
      const id = typeof data.emojiId === 'string' ? data.emojiId.trim() : ''
      if (/^\d{17,20}$/.test(id)) {
        const rawName = typeof data.emojiName === 'string' ? data.emojiName.trim() : ''
        const name = /^[A-Za-z0-9_]{2,32}$/.test(rawName) ? rawName : 'emoji'
        return '<' + (data.emojiAnimated === true ? 'a' : '') + ':' + name + ':' + id + '>'
      }
      const unicode = parseStatusUnicodeEmoji(data.emojiName)
      return unicode ? unicode.emojiName : ''
    }
    function statusEmojiErrors(data, label) {
      const errors = []
      const invalidName = data.emojiName !== undefined && typeof data.emojiName !== 'string'
      const invalidId = data.emojiId !== undefined && (typeof data.emojiId !== 'string' || (data.emojiId !== '' && !/^\d{17,20}$/.test(data.emojiId)))
      const custom = typeof data.emojiId === 'string' && /^\d{17,20}$/.test(data.emojiId)
      const unicode = !custom && parseStatusUnicodeEmoji(data.emojiName)
      if (invalidName || invalidId || (!custom && data.emojiName !== undefined && !unicode)) {
        if (statusPremiumType === 0) errors.push(label + ': Tài khoản không có Nitro chỉ dùng được một emoji Unicode.')
        else if (!statusHasNitro()) errors.push(label + ': Chưa xác định được Nitro; chỉ dùng được một emoji Unicode.')
        else errors.push(label + ': Chỉ chấp nhận một emoji Unicode hoặc <:tên:id>/<a:tên:id>.')
      } else if (custom && !statusHasNitro()) {
        errors.push(label + (statusPremiumType === 0 ? ': Tài khoản không có Nitro chỉ dùng được một emoji Unicode.' : ': Chưa xác định được Nitro; chỉ dùng được một emoji Unicode.'))
      }
      if (data.emojiAnimated !== undefined && typeof data.emojiAnimated !== 'boolean') errors.push(label + ': trạng thái emoji động không hợp lệ.')
      return errors
    }
    function validStatusDelay(value) {
      return Number.isFinite(value) && value >= 3
    }
    function validateStatus(data) {
      const errors = []
      if (!data || typeof data !== 'object' || Array.isArray(data)) return ['JSON Status phải là object.']
      if (!Array.isArray(data.statuses)) {
        if (!Array.isArray(data.texts) || !data.texts.length) errors.push('Thiếu status text.')
        else if (data.texts.length > statusLimit || data.texts.some(text => typeof text !== 'string' || !text.trim())) errors.push('Status text không hợp lệ hoặc vượt quá ' + statusLimit + ' mục.')
        if (!validStatusDelay(data.delaySeconds)) errors.push('Delay phải từ 3 giây trở lên.')
        return errors.concat(statusEmojiErrors(data, 'Emoji chung'))
      }
      if (data.mode !== 'ordered' && data.mode !== 'random') errors.push('Chế độ status không hợp lệ.')
      if (data.delayMode !== 'global' && data.delayMode !== 'per-status' && data.delayMode !== 'lyrics') errors.push('Chế độ delay không hợp lệ.')
      if (data.emojiMode !== 'global' && data.emojiMode !== 'per-status') errors.push('Chế độ emoji không hợp lệ.')
      if (!data.statuses.length) errors.push('Cần ít nhất một status.')
      if (data.statuses.length > statusLimit) errors.push('Tối đa ' + statusLimit + ' status.')
      data.statuses.forEach((status, index) => {
        const label = 'Status ' + (index + 1)
        if (!status || typeof status !== 'object' || Array.isArray(status)) {
          errors.push(label + ' không hợp lệ.')
          return
        }
        if (typeof status.text !== 'string' || !status.text.trim()) errors.push(label + ': thiếu nội dung.')
        if (data.delayMode === 'per-status' && !validStatusDelay(status.delaySeconds)) errors.push(label + ': delay phải từ 3 giây trở lên.')
        errors.push(...statusEmojiErrors(status, label))
      })
      if (data.delayMode === 'lyrics') {
        if (data.mode !== 'ordered') errors.push('Mốc lyric chỉ chạy theo thứ tự.')
        data.statuses.forEach((status, index) => {
          if (!status || !Number.isFinite(status.atSeconds) || status.atSeconds < 0 || (index && status.atSeconds <= data.statuses[index - 1]?.atSeconds)) errors.push('Status ' + (index + 1) + ': mốc bắt đầu phải tăng dần.')
          if (status && 'endSeconds' in status && (!Number.isFinite(status.endSeconds) || status.endSeconds <= status.atSeconds || (index < data.statuses.length - 1 && status.endSeconds > data.statuses[index + 1]?.atSeconds))) errors.push('Status ' + (index + 1) + ': mốc kết thúc phải sau mốc bắt đầu và không vượt mốc bắt đầu kế tiếp.')
        })
        if ('loopDelaySeconds' in data && (!Number.isFinite(data.loopDelaySeconds) || data.loopDelaySeconds < 0)) errors.push('Thời gian chờ từ status cuối về đầu phải từ 0 giây trở lên.')
      }
      if (data.delayMode === 'global' && !validStatusDelay(data.delaySeconds)) errors.push('Delay toàn bộ phải từ 3 giây trở lên.')
      errors.push(...statusEmojiErrors(data, 'Emoji chung'))
      return errors
    }
    function normalizeStatusForForm(data) {
      const modern = Array.isArray(data.statuses)
      const source = modern ? data.statuses : (Array.isArray(data.texts) ? data.texts.map(text => ({text})) : [])
      const delaySeconds = Number(data.delaySeconds ?? 30)
      return {
        mode: modern && data.mode === 'random' ? 'random' : 'ordered',
        delayMode: modern && ['per-status', 'lyrics'].includes(data.delayMode) ? data.delayMode : 'global',
        emojiMode: modern && data.emojiMode === 'per-status' ? 'per-status' : 'global',
        delaySeconds,
        loopDelaySeconds: Number(data.loopDelaySeconds ?? 0),
        emojiInput: statusEmojiInput(data),
        statuses: source.map(status => ({
          text: typeof status.text === 'string' ? status.text : '',
          delaySeconds: Number(status.delaySeconds ?? delaySeconds),
          atSeconds: Number(status.atSeconds ?? 0),
          endSeconds: status.endSeconds == null ? undefined : Number(status.endSeconds),
          emojiInput: statusEmojiInput(status)
        }))
      }
    }
    function readStatusItems() {
      return Array.from($('statusItems').querySelectorAll('.status-item')).map(item => ({
        text: item.querySelector('.status-item-text').value,
        delaySeconds: Number(item.querySelector('.status-item-delay-input').value || 30),
        atSeconds: parseStatusTime(item.querySelector('.status-item-time-input').value),
        endSeconds: item.querySelector('.status-item-end-input').value.trim() ? parseStatusTime(item.querySelector('.status-item-end-input').value) : undefined,
        emojiInput: item.querySelector('.status-item-emoji-input').value
      }))
    }
    function statusEmojiData(value) {
      const input = value.trim()
      if (!input) return {}
      return parseStatusUnicodeEmoji(input) || parseStatusEmoji(input) || {emojiName: null, emojiId: input}
    }
    function syncStatusModeVisibility() {
      const perDelay = $('statusDelayMode').value === 'per-status'
      const lyrics = $('statusDelayMode').value === 'lyrics'
      $('statusMode').value = lyrics ? 'ordered' : $('statusMode').value
      $('statusMode').disabled = lyrics
      $('statusLoopDelayField').hidden = !lyrics
      const perEmoji = $('statusEmojiMode').value === 'per-status'
      $('statusGlobalDelay').hidden = perDelay || lyrics
      $('statusGlobalEmoji').hidden = perEmoji
      document.querySelectorAll('.status-item-delay').forEach(field => { field.hidden = !perDelay })
      document.querySelectorAll('.status-item-time').forEach(field => { field.hidden = !lyrics })
      document.querySelectorAll('.status-item-emoji').forEach(field => { field.hidden = !perEmoji })
      $('statusAdd').disabled = $('statusItems').children.length >= statusLimit
      updateStatusEmojiLabels()
    }
    function renderStatusItems(statuses, focusIndex = -1) {
      const root = $('statusItems')
      root.replaceChildren()
      statuses.forEach((status, index) => {
        const item = document.createElement('section')
        item.className = 'status-item'

        const head = document.createElement('div')
        head.className = 'status-item-head'
        const title = document.createElement('b')
        title.textContent = 'STATUS ' + String(index + 1).padStart(2, '0')
        const actions = document.createElement('div')
        actions.className = 'status-item-actions'

        const up = document.createElement('button')
        up.type = 'button'
        up.textContent = '↑'
        up.disabled = index === 0
        up.setAttribute('aria-label', 'Đưa status ' + (index + 1) + ' lên')
        up.onclick = () => {
          const values = readStatusItems()
          ;[values[index - 1], values[index]] = [values[index], values[index - 1]]
          renderStatusItems(values)
          buildStatus()
        }

        const down = document.createElement('button')
        down.type = 'button'
        down.textContent = '↓'
        down.disabled = index === statuses.length - 1
        down.setAttribute('aria-label', 'Đưa status ' + (index + 1) + ' xuống')
        down.onclick = () => {
          const values = readStatusItems()
          ;[values[index], values[index + 1]] = [values[index + 1], values[index]]
          renderStatusItems(values)
          buildStatus()
        }

        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'status-item-remove'
        remove.textContent = 'Xóa'
        remove.disabled = statuses.length === 1
        remove.setAttribute('aria-label', 'Xóa status ' + (index + 1))
        remove.onclick = () => {
          const values = readStatusItems()
          values.splice(index, 1)
          renderStatusItems(values)
          buildStatus()
        }
        actions.append(up, down, remove)
        head.append(title, actions)

        const textLabel = document.createElement('label')
        textLabel.textContent = 'Status text'
        const text = document.createElement('input')
        text.className = 'status-item-text'
        text.value = status.text || ''
        text.placeholder = 'Nhập status'
        textLabel.append(text)

        const delayLabel = document.createElement('label')
        delayLabel.className = 'status-item-delay'
        delayLabel.textContent = 'Delay status này, giây'
        const delay = document.createElement('input')
        delay.className = 'status-item-delay-input'
        delay.type = 'number'
        delay.min = '3'
        delay.step = '1'
        delay.value = String(status.delaySeconds ?? Number($('statusDelay').value || 30))
        delayLabel.append(delay)

        const timeRow = document.createElement('div')
        timeRow.className = 'row status-item-time'
        const timeLabel = document.createElement('label')
        timeLabel.textContent = 'Bắt đầu (mm.ss.xx)'
        const time = document.createElement('input')
        time.className = 'status-item-time-input'
        time.type = 'text'
        time.inputMode = 'decimal'
        time.placeholder = '02.36.00'
        time.value = formatStatusTime(status.atSeconds ?? 0)
        timeLabel.append(time)
        const endLabel = document.createElement('label')
        endLabel.textContent = 'Kết thúc (mm.ss.xx)'
        const end = document.createElement('input')
        end.className = 'status-item-end-input'
        end.type = 'text'
        end.inputMode = 'decimal'
        end.placeholder = '02.40.00'
        end.value = status.endSeconds == null ? '' : formatStatusTime(status.endSeconds)
        endLabel.append(end)
        timeRow.append(timeLabel, endLabel)

        const emoji = document.createElement('div')
        emoji.className = 'status-item-emoji'
        const emojiRow = document.createElement('div')
        emojiRow.className = 'row'
        const emojiLabel = document.createElement('label')
        emojiLabel.className = 'status-item-emoji-label'
        emojiLabel.textContent = statusEmojiLabel(false)
        const emojiInput = document.createElement('input')
        emojiInput.className = 'status-item-emoji-input'
        emojiInput.value = status.emojiInput || ''
        emojiLabel.append(emojiInput)
        emojiRow.append(emojiLabel)
        emoji.append(emojiRow)

        item.append(head, textLabel, delayLabel, timeRow, emoji)
        item.querySelectorAll('input').forEach(input => {
          input.addEventListener('input', buildStatus)
          input.addEventListener('change', buildStatus)
        })
        root.append(item)
      })
      syncStatusModeVisibility()
      if (focusIndex >= 0) root.children[focusIndex]?.querySelector('.status-item-text')?.focus()
    }
    function parseStatusTime(value) {
      const match = /^(\d+)[.:]([0-5]\d)(?:\.(\d{1,3}))?$/.exec(value.trim())
      return match ? Number(match[1]) * 60 + Number(match[2]) + Number('0.' + (match[3] || '0')) : NaN
    }
    function formatStatusTime(seconds) {
      return Number.isFinite(seconds) ? String(Math.floor(seconds / 60)).padStart(2, '0') + '.' + (seconds % 60).toFixed(2).padStart(5, '0') : ''
    }
    function buildStatus() {
      if (syncing) return
      syncStatusModeVisibility()
      const mode = $('statusMode').value
      const delayMode = $('statusDelayMode').value
      const emojiMode = $('statusEmojiMode').value
      const statuses = readStatusItems().map(status => ({
        text: status.text.trim(),
        ...(delayMode === 'per-status' ? {delaySeconds: status.delaySeconds} : {}),
        ...(delayMode === 'lyrics' ? {atSeconds: status.atSeconds, ...(status.endSeconds !== undefined ? {endSeconds: status.endSeconds} : {})} : {}),
        ...(emojiMode === 'per-status' ? statusEmojiData(status.emojiInput) : {})
      }))
      const data = {
        mode,
        delayMode,
        emojiMode,
        statuses,
        ...(delayMode === 'global' ? {delaySeconds: Number($('statusDelay').value || 30)} : {}),
        ...(delayMode === 'lyrics' ? {loopDelaySeconds: $('statusLoopDelay').value.trim() ? Number($('statusLoopDelay').value) : NaN} : {}),
        ...(emojiMode === 'global' ? statusEmojiData($('statusEmojiInput').value) : {})
      }
      $('statusOutput').value = JSON.stringify(data, null, 2)
      const errors = validateStatus(data)
      if (errors.length) stopStatusProfilePreview()
      else resetStatusProfilePreview()
      $('statusErrors').textContent = errors.join('\n')
      $('statusSave').disabled = errors.length > 0 || !document.body.classList.contains('can-save')
    }
    function statusProfileEmoji(data, status) {
      const source = data.emojiMode === 'per-status' ? status : data
      if (typeof source.emojiName === 'string' && source.emojiName) return ':' + source.emojiName + ':'
      return typeof source.emojiId === 'string' && source.emojiId ? source.emojiId : ''
    }
    function nextStatusPreviewIndex(currentIndex, length, mode) {
      if (length <= 0) return -1
      if (mode === 'ordered') return currentIndex < 0 ? 0 : (currentIndex + 1) % length
      if (currentIndex < 0 || currentIndex >= length) return Math.floor(Math.random() * length)
      if (length === 1) return 0
      const candidate = Math.floor(Math.random() * (length - 1))
      return candidate >= currentIndex ? candidate + 1 : candidate
    }
    function stopStatusProfilePreview() {
      if (statusProfilePreviewTimer !== null) clearTimeout(statusProfilePreviewTimer)
      statusProfilePreviewTimer = null
    }
    function resetStatusProfilePreview() {
      stopStatusProfilePreview()
      statusProfilePreviewIndex = -1
      statusProfilePreviewStartedAt = performance.now()
      renderStatusProfilePresence()
    }
    function renderStatusProfilePresence(data) {
      if (!data) {
        try { data = JSON.parse($('statusOutput').value) } catch { data = null }
      }
      const statuses = Array.isArray(data?.statuses) ? data.statuses : []
      if (!statuses.length) {
        statusProfilePreviewIndex = -1
        $('statusProfilePresence').textContent = 'Chưa có Status config.'
        return
      }
      if (data.delayMode === 'lyrics') {
        statusProfilePreviewIndex = (statusProfilePreviewIndex + 1) % statuses.length
        if (statusProfilePreviewIndex === 0) statusProfilePreviewStartedAt = performance.now()
        const current = statuses[statusProfilePreviewIndex]
        const next = statuses[statusProfilePreviewIndex + 1]
        const nextAt = next ? Number(next.atSeconds) : Number(current.endSeconds ?? current.atSeconds) + Number(data.loopDelaySeconds ?? 0)
        const delayMs = Math.max(next ? 1 : 0, (nextAt - Number(statuses[0].atSeconds)) * 1000 - (performance.now() - statusProfilePreviewStartedAt))
        if (statuses.length > 1 || current.endSeconds !== undefined || Number(data.loopDelaySeconds) > 0) statusProfilePreviewTimer = setTimeout(() => renderStatusProfilePresence(data), delayMs)
      } else statusProfilePreviewIndex = nextStatusPreviewIndex(statusProfilePreviewIndex, statuses.length, data.mode)
      const status = statuses[statusProfilePreviewIndex] && typeof statuses[statusProfilePreviewIndex] === 'object' ? statuses[statusProfilePreviewIndex] : {}
      const text = typeof status.text === 'string' ? status.text.trim() : ''
      const emoji = data ? statusProfileEmoji(data, status) : ''
      $('statusProfilePresence').textContent = [emoji, text].filter(Boolean).join(' ') || 'Chưa có Status config.'
      if (data.delayMode !== 'lyrics') {
        const selectedDelay = data.delayMode === 'per-status' ? Number(status.delaySeconds) : Number(data.delaySeconds)
        const delay = Number.isFinite(selectedDelay) && selectedDelay >= 3 ? selectedDelay : 30
        statusProfilePreviewTimer = setTimeout(() => renderStatusProfilePresence(data), delay * 1000)
      }
    }
    function clearStatusProfile(message) {
      const avatar = $('statusProfileAvatar')
      avatar.hidden = true
      avatar.removeAttribute('src')
      const banner = $('statusProfileBanner')
      banner.style.removeProperty('background-image')
      banner.style.removeProperty('background-color')
      $('statusProfileAvatarFallback').hidden = false
      $('statusProfileAvatarFallback').textContent = '?'
      $('statusProfileName').textContent = message
      $('statusProfileHandle').textContent = 'Discord account'
    }
    function renderStatusProfile(profile) {
      const name = profile.globalName || profile.username || 'Discord account'
      const avatar = $('statusProfileAvatar')
      const banner = $('statusProfileBanner')
      banner.style.backgroundImage = profile.bannerUrl ? 'url("' + profile.bannerUrl + '")' : ''
      banner.style.backgroundColor = profile.accentColor || ''
      $('statusProfileName').textContent = name
      $('statusProfileHandle').textContent = profile.username ? '@' + profile.username : 'Discord account'
      $('statusProfileAvatarFallback').textContent = name.slice(0, 1).toUpperCase()
      if (!profile.avatarUrl) { avatar.hidden = true; $('statusProfileAvatarFallback').hidden = false; return }
      avatar.src = profile.avatarUrl
      avatar.alt = ''
      avatar.hidden = false
      $('statusProfileAvatarFallback').hidden = true
      avatar.onerror = () => { avatar.hidden = true; $('statusProfileAvatarFallback').hidden = false }
    }
    async function loadStatusProfile() {
      const sequence = ++statusProfileSequence
      const target = configSlotMode && linkedSlotId ? configSlotTarget() : null
      if (!target) { stopStatusProfilePreview(); clearStatusProfile('Chưa gắn token'); return }
      clearStatusProfile('Đang tải hồ sơ Discord...')
      try {
        const response = await fetch('/api/discord/profile?' + new URLSearchParams(target), {credentials:'same-origin', cache:'no-store'})
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.profile) throw new Error(data?.error || 'Không tải được hồ sơ Discord.')
        if (sequence === statusProfileSequence) renderStatusProfile(data.profile)
      } catch (error) {
        if (sequence === statusProfileSequence) clearStatusProfile(error instanceof Error ? error.message : 'Không tải được hồ sơ Discord.')
      }
    }
    function fillStatusFromJson() {
      try {
        const data = JSON.parse($('statusOutput').value)
        const errors = validateStatus(data)
        const normalized = normalizeStatusForForm(data)
        syncing = true
        $('statusMode').value = normalized.mode
        $('statusDelayMode').value = normalized.delayMode
        $('statusEmojiMode').value = normalized.emojiMode
        $('statusDelay').value = normalized.delaySeconds
        $('statusLoopDelay').value = normalized.loopDelaySeconds
        $('statusEmojiInput').value = normalized.emojiInput
        renderStatusItems(normalized.statuses)
        syncing = false
        syncStatusModeVisibility()
        $('statusErrors').textContent = errors.join('\n')
        $('statusSave').disabled = errors.length > 0 || !document.body.classList.contains('can-save')
        if (errors.length) stopStatusProfilePreview()
        else resetStatusProfilePreview()
      } catch {
        syncing = false
        $('statusErrors').textContent = 'JSON không hợp lệ.'
        $('statusSave').disabled = true
      }
    }
    $('statusAdd').onclick = () => {
      const statuses = readStatusItems()
      if (statuses.length >= 100) return
      statuses.push({text: '', delaySeconds: Number($('statusDelay').value || 30), emojiInput: ''})
      renderStatusItems(statuses)
      buildStatus()
    }
    function buildChatpool() {
      if (syncing) return
      updateChatMode('chatpool')
      const mode = $('chatpoolRandom').value
      const data = {
        Tokens: lines('chatpoolTokens').slice(0, 50),
        guildId: $('chatpoolGuild').value.trim(),
        channelId: $('chatpoolChannel').value.trim(),
        delaySeconds: Number($('chatpoolDelay').value || 30),
        mode,
        ...($('chatpoolImage').value ? {image:$('chatpoolImage').value} : {}),
        ...(mode === 'text-war' ? {targetUserId: $('chatpoolTargetUser').value.trim()} : {texts: lines('chatpoolTexts').slice(0, 100)})
      }
      $('chatpoolOutput').value = JSON.stringify(data, null, 2)
      const errors = validateChatpool(data)
      $('chatpoolErrors').textContent = errors.join('\n')
    }
    function fillChatpoolFromJson() {
      try {
        const data = JSON.parse($('chatpoolOutput').value)
        syncing = true
        $('chatpoolTokens').value = Array.isArray(data.Tokens) ? data.Tokens.join('\n') : ''
        $('chatpoolGuild').value = data.guildId || ''
        $('chatpoolChannel').value = data.channelId || ''
        $('chatpoolTexts').value = Array.isArray(data.texts) ? data.texts.join('\n') : ''
        $('chatpoolDelay').value = data.delaySeconds ?? 30
        $('chatpoolRandom').value = data.mode === 'text-war' ? 'text-war' : data.mode === 'random' || data.randomChat === true ? 'random' : 'ordered'
        $('chatpoolTargetUser').value = data.targetUserId || ''
        setChatImage('chatpool', data.image || '')
        updateChatMode('chatpool')
        syncing = false
        const errors = validateChatpool(data)
        $('chatpoolErrors').textContent = errors.join('\n')
      } catch {
        syncing = false
        $('chatpoolErrors').textContent = 'JSON không hợp lệ.'
      }
    }
    function buildVoice() {
      if (syncing) return
      const data = {
        Guild: $('voiceGuild').value.trim(),
        Channel: $('voiceChannel').value.trim(),
        Stream: $('voiceStream').value === 'true',
        Camera: $('voiceCamera').value === 'true',
        SelfMute: $('voiceMute').value !== 'true',
        SelfDeaf: $('voiceDeaf').value !== 'true',
        RefreshMs: Number($('voiceRefresh').value || 60000)
      }
      $('voiceOutput').value = JSON.stringify(data, null, 2)
      const errors = validateVoice(data)
      $('voiceErrors').textContent = errors.join('\n')
    }
    function fillVoiceFromJson() {
      try {
        const data = JSON.parse($('voiceOutput').value)
        syncing = true
        $('voiceGuild').value = data.Guild || ''
        $('voiceChannel').value = data.Channel || ''
        $('voiceStream').value = String(data.Stream !== false)
        $('voiceCamera').value = String(Boolean(data.Camera))
        $('voiceMute').value = String(data.SelfMute === false)
        $('voiceDeaf').value = String(data.SelfDeaf !== true)
        $('voiceRefresh').value = data.RefreshMs ?? 60000
        syncing = false
        discordSelectorState.voice.guildId=data.Guild||''
        discordSelectorState.voice.channelId=data.Channel||''
        void loadDiscordSelectors('voice', data.Guild||'', data.Channel||'')
        const errors = validateVoice(data)
        $('voiceErrors').textContent = errors.join('\n')
      } catch {
        syncing = false
        $('voiceErrors').textContent = 'JSON không hợp lệ.'
      }
    }
    let previewRequest = 0
    let previewTimer
    let previewIndex = 0
    let previewStartedAt = Date.now()
    let previewTimestampTimer
    let buildTimer
    const typeDrafts = new Map()
    const configDraftKey = () => $('mode').value === 'SPOTIFY' ? 'SPOTIFY' : 'STANDARD'
    let activeConfigType = configDraftKey()
    let spotifyTracks = []
    let spotifyAutoPlay = false
    function renderSpotifyAutoPlay() {
      $('spotifyAutoPlay').textContent = `Auto-play: ${spotifyAutoPlay ? 'Bật' : 'Tắt'}`
      $('spotifyAutoPlay').setAttribute('aria-pressed', String(spotifyAutoPlay))
    }
    function renderSpotifySelected() {
      const node = $('spotifySelected')
      node.replaceChildren(...spotifyTracks.map((track, index) => {
        const row = document.createElement('div'); row.className = 'spotify-selected-item'
        const image = document.createElement('img'); image.src = track.image; image.alt = ''
        const copy = document.createElement('span'), title = document.createElement('strong'), meta = document.createElement('small')
        title.textContent = (index + 1) + '. ' + track.name; meta.textContent = [track.artists, track.album].filter(Boolean).join(' • '); copy.append(title, meta)
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'spotify-selected-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Xóa ' + track.name)
        remove.onclick = () => { spotifyTracks.splice(index, 1); renderSpotifySelected(); markRpcDirty(); build() }
        row.append(image, copy, remove)
        return row
      }))
    }
    function renderSpotifyResults(tracks) {
      $('spotifyResults').hidden = false
      $('spotifyResults').replaceChildren(...tracks.map(track => {
        const button = document.createElement('button')
        button.type = 'button'; button.className = 'spotify-result'; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(spotifyTracks.some(item => item.id === track.id)))
        const image = document.createElement('img'); image.src = track.image; image.alt = ''
        const copy = document.createElement('span'), title = document.createElement('strong'), meta = document.createElement('small')
        title.textContent = track.name; meta.textContent = [track.artists, track.album].filter(Boolean).join(' • '); copy.append(title, meta); button.append(image, copy)
        button.onclick = () => { if (!spotifyTracks.some(item => item.id === track.id)) spotifyTracks.push(track); renderSpotifyResults(tracks); renderSpotifySelected(); markRpcDirty(); build() }
        return button
      }))
    }
    async function runSpotifySearch(query) {
      const response = await fetch('/api/spotify/search?q=' + encodeURIComponent(query)), data = await response.json()
      if (!response.ok) throw Error(data.error || 'Không tìm được bài trên Spotify.')
      if (!data.tracks?.length) throw Error('Không tìm thấy kết quả Spotify.')
      renderSpotifyResults(data.tracks)
    }
    async function searchSpotify() {
      const query = $('spotifyQuery').value.trim()
      if (!query) { $('spotifyResults').hidden = true; return }
      try { await runSpotifySearch(query) }
      catch (error) { $('errors').textContent = error instanceof Error ? error.message : 'Không tìm được bài trên Spotify.' }
    }
    let spotifyLiveTimer
    function liveSearchSpotify() {
      const query = $('spotifyQuery').value.trim()
      clearTimeout(spotifyLiveTimer)
      if (!query) { $('spotifyResults').hidden = true; $('spotifyResults').replaceChildren(); return }
      spotifyLiveTimer = setTimeout(async () => {
        try { await runSpotifySearch(query) }
        catch (error) { $('errors').textContent = error instanceof Error ? error.message : 'Không tìm được bài trên Spotify.' }
      }, 150)
    }
    function syncTypeDraft() {
      const nextType = configDraftKey()
      if (nextType === activeConfigType) return
      typeDrafts.set(activeConfigType, {
        name: $('name').value,
        text1: $('text1').value,
        text2: $('text2').value,
        text3: $('text3').value
      })
      const draft = typeDrafts.get(nextType)
      if (draft) {
        $('name').value = draft.name
        $('text1').value = draft.text1
        $('text2').value = draft.text2
        $('text3').value = draft.text3
      }
      activeConfigType = nextType
    }
    function schedulePreview(data) {
      clearTimeout(previewTimer)
      const delay = Math.max(Number(data.setup?.delay || 4) * 1000, 1000)
      previewTimer = setTimeout(() => { previewIndex++; preview(data); schedulePreview(data) }, delay)
    }
    function startPreview(data) {
      clearTimeout(previewTimer)
      previewIndex = 0
      previewStartedAt = Date.now()
      setPreviewTimestamp(data)
      preview(data)
      schedulePreview(data)
    }
    function parsePreviewTimestamp(value) {
      if (value === undefined || value === null || value === '') return undefined
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value !== 'string') return undefined
      if (/^\d+$/.test(value)) return Number(value)
      const match = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/)
      if (match) { const [, day, month, year, hour = '0', minute = '0', second = '0'] = match; return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime() }
      const parsed = Date.parse(value)
      return Number.isNaN(parsed) ? undefined : parsed
    }
    function setPreviewTimestamp(data) {
      clearInterval(previewTimestampTimer)
      const setup = data.setup || {}, node = $('previewTimestamp')
      if (['STREAMING', 'COMPETING'].includes(setup.type)) { node.hidden = true; return }
      const duration = setup.mode === 'SPOTIFY' ? Number((setup.spotifyTracks?.[0] || setup.spotifyTrack)?.durationMs) : 0
      const explicitStart = parsePreviewTimestamp(setup.startTimeStamp), explicitEnd = parsePreviewTimestamp(setup.endTimeStamp)
      const fallbackStart = duration > 0 || setup.timestamp === '{start}' ? previewStartedAt : undefined
      const start = explicitStart ?? (explicitEnd !== undefined && duration > 0 ? explicitEnd - duration : fallbackStart)
      const end = explicitEnd ?? (start !== undefined && duration > 0 ? start + duration : undefined)
      if (start === undefined && end === undefined) { node.hidden = true; return }
      const update = () => {
        const seconds = Math.max(0, Math.floor(((start ? Date.now() - start : end - Date.now()) / 1000)))
        const value = Math.floor(seconds / 3600) + ':' + String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
        node.lastChild.textContent = start !== undefined ? value : 'Kết thúc sau: ' + value
      }
      node.hidden = false
      update()
      previewTimestampTimer = setInterval(update, 1000)
    }
    function effectiveActivity(setup, index = 0) {
      const mode = setup.mode || 'RICH_PRESENCE'
      if (mode === 'SPOTIFY') return {mode, type: 'LISTENING', name: rpcNameAt(setup.name, index) || 'Spotify', buttons: true, compact: false}
      if (mode === 'XBOX' || mode === 'PLAYSTATION') return {mode, type: 'PLAYING', name: rpcNameAt(setup.name, index) || 'SuperUtils', buttons: true, compact: false}
      if (mode === 'YOUTUBE') return {mode, type: 'STREAMING', name: rpcNameAt(setup.name, index) || 'YouTube', buttons: true, compact: false}
      const type = setup.type || 'LISTENING'
      return {mode, type, name: rpcNameAt(setup.name, index) || 'SuperUtils', buttons: true, compact: false}
    }
    function syncRpcModeControls(activity) {
      const locked = activity.mode === 'SPOTIFY'
      const playLocked = activity.mode === 'XBOX' || activity.mode === 'PLAYSTATION'
      const ytLocked = activity.mode === 'YOUTUBE'
      if (playLocked) $('type').value = 'PLAYING'
      if (ytLocked) $('type').value = 'STREAMING'
      $('type').disabled = locked || playLocked || ytLocked
      $('typeField').hidden = locked || playLocked || ytLocked
      $('typeField').title = locked ? 'SPOTIFY luôn dùng LISTENING.' : playLocked ? 'Xbox/PlayStation luôn dùng PLAYING để hiện badge nền tảng.' : ytLocked ? 'YouTube luôn dùng STREAMING; nhập link youtube.com.' : ''
      $('spotifySearchField').hidden = !locked
      if ($('youtubeModeField')) $('youtubeModeField').hidden = !ytLocked
      // Xbox/PS luôn dùng badge nền tảng, không dùng custom button được.
      if ($('consoleButtonsField')) $('consoleButtonsField').hidden = true
      const ytWatch = ytLocked && $('youtubeMode')?.value === 'watch'
      const hideButtons = ytWatch || playLocked
      // Twitch/YouTube tự do dùng ô Stream URL; riêng YOUTUBE chỉ hiện ô URL khi chọn kiểu nút Xem.
      $('streamURLField').hidden = ytLocked ? !ytWatch : activity.type !== 'STREAMING'
      // Kiểu nút Xem / badge thay thế button nên ẩn 2 trường button custom.
      if ($('button1Field')) $('button1Field').hidden = hideButtons
      if ($('button2Field')) $('button2Field').hidden = hideButtons
      $('streamURL').placeholder = ytLocked ? 'https://www.youtube.com/watch?v=...' : 'https://www.twitch.tv/...'
      const hideName = activity.type === 'STREAMING' || playLocked
      $('nameField').hidden = hideName
      $('name').disabled = hideName
      const hideTimestamp = ['STREAMING', 'COMPETING'].includes(activity.type) || locked
      $('start').closest('label').hidden = hideTimestamp
      $('end').closest('label').hidden = hideTimestamp
      $('nameField').firstChild.textContent = locked ? 'Tên hiển thị, mỗi dòng 1 name' : 'Name, mỗi dòng 1 name'
      $('name').title = locked ? 'Tên hiển thị sau “Cùng lắng nghe”.' : ''
      $('text1Field').firstChild.textContent = 'Text 1'
      $('text2Field').firstChild.textContent = 'Text 2, mỗi dòng 1 item'
      const hideText3 = ['PLAYING', 'WATCHING'].includes(activity.type)
      for (const id of ['text1Field','text2Field','text3Field']) $(id).hidden = locked || (id === 'text3Field' && hideText3)
      for (const id of ['text1','text2','text3']) $(id).disabled = locked || (id === 'text3' && hideText3)
    }
    function preview(data) {
      const setup = data.setup || {}, config = data.config || {}
      const activity = effectiveActivity(setup, previewIndex)
      syncRpcModeControls(activity)
      const first = value => Array.isArray(value) && value.length ? String(value[previewIndex % value.length]) : 'Chưa có nội dung'
      const now = new Date(), months = ['January','February','March','April','May','June','July','August','September','October','November','December'], weeks = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      const ordinal = number => number + (number % 10 === 1 && number !== 11 ? 'st' : number % 10 === 2 && number !== 12 ? 'nd' : number % 10 === 3 && number !== 13 ? 'rd' : 'th')
      const values = {'{hour:1}':String(now.getHours()).padStart(2,'0'),'{hour:2}':String((now.getHours()%12)||12).padStart(2,'0'),'{min:1}':String(now.getMinutes()).padStart(2,'0'),'{min:2}':String(now.getMinutes()).padStart(2,'0')+(now.getHours()<12?' AM':' PM'),'{th=date}':String(now.getDate()),'{th=month:1}':String(now.getMonth()+1),'{en=date}':ordinal(now.getDate()),'{en=week:1}':weeks[now.getDay()].slice(0,3),'{en=week:2}':weeks[now.getDay()],'{en=month:1}':String(now.getMonth()+1).padStart(2,'0'),'{en=month:2}':months[now.getMonth()].slice(0,3),'{en=month:3}':months[now.getMonth()],'{en=year:1}':String(now.getFullYear()).slice(-2),'{en=year:2}':String(now.getFullYear()),'{city}':setup.city||'N/A','{user:name}':'N/A','{emoji:random}':'✨','{emoji:time}':'🌙','{emoji:clock}':'🕛'}
      const rendered = value => value.replace(/\{[^}]+\}/g, token => values[token] || 'N/A')
      const activityLabels = {PLAYING:'Đang chơi',STREAMING:'Đang stream',LISTENING:'Cùng lắng nghe',WATCHING:'Đang xem',COMPETING:'Đang chơi'}
      $('previewType').textContent = activity.mode.replace('_', ' ')
      const platformIcons = {
        META_QUEST: ['https://upload.wikimedia.org/wikipedia/commons/a/ab/Meta-Logo.png', 'Meta Quest'],
        SPOTIFY: ['https://upload.wikimedia.org/wikipedia/commons/8/84/Spotify_icon.svg', 'Spotify'],
        XBOX: ['https://upload.wikimedia.org/wikipedia/commons/f/f9/Xbox_one_logo.svg', 'Xbox'],
        PLAYSTATION: ['https://upload.wikimedia.org/wikipedia/commons/0/00/PlayStation_logo.svg', 'PlayStation'],
        YOUTUBE: ['https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg', 'YouTube']
      }
      const platformIcon = platformIcons[activity.mode] || null
      $('previewPlatform').hidden = !platformIcon
      $('previewPlatform').classList.toggle('spotify', activity.mode === 'SPOTIFY');$('previewPlatform').classList.toggle('meta-quest', activity.mode !== 'SPOTIFY' && !!platformIcon)
      if (platformIcon) { $('previewPlatform').src = platformIcon[0]; $('previewPlatform').alt = platformIcon[1] }
      const separateActivityName = activity.type === 'PLAYING'
      const platformSuffix = {META_QUEST:' trên Meta Quest', XBOX:' trên Xbox', PLAYSTATION:' trên PlayStation', YOUTUBE:' trên YouTube'}
      $('previewName').textContent = activityLabels[activity.type] || 'Hoạt động'
      if (separateActivityName && platformSuffix[activity.mode]) $('previewName').append(platformSuffix[activity.mode])
      if (!separateActivityName && activity.type !== 'STREAMING' && (activity.mode === 'SPOTIFY' || !activity.compact)) $('previewName').append(' ' + activity.name)
      $('previewActivityName').hidden = !separateActivityName
      $('previewActivityName').textContent = separateActivityName ? activity.name : ''
      $('previewTypeIcon').textContent = ({PLAYING:'🎮',STREAMING:'◉',LISTENING:'♪',WATCHING:'◉',COMPETING:'🎮'})[activity.type] || '◉'
      const setPreviewCopy = () => {
        const track = setup.spotifyTracks?.[0] || setup.spotifyTrack, text1 = rendered(first(config['text-1'])), text2 = rendered(first(config['text-2'])), text3 = rendered(first(config['text-3']))
        $('previewDetails').textContent = track?.name || text1
        $('previewState').textContent = track ? [track.artists, track.album].filter(Boolean).join(' • ') : text2
        $('previewAssetText').hidden = ['PLAYING', 'WATCHING'].includes(activity.type)
        $('previewAssetText').textContent = track?.album || text3
      }
      setPreviewCopy()
      const needsWeather = [first(config['text-1']), first(config['text-2']), first(config['text-3'])].some(text => /\{(?:city|region|country|temp:|wind:|pressure:|precip:|gust:|feelslike:|windchill:|heatindex:|dewpoint:|vis:|humidity|cloud|uv|co|no2|o3|so2|pm2\.5|pm10)\}/.test(text))
      const request = ++previewRequest
      if (needsWeather) fetch('/api/preview?city=' + encodeURIComponent(setup.city || '')).then(response => response.ok ? response.json() : null).then(result => {
        if (request !== previewRequest || !result) return
        const weather = result.values
        Object.assign(values, {'{city}':weather.city,'{region}':weather.region,'{country}':weather.country,'{temp:c}':weather.tempC,'{temp:f}':weather.tempF,'{wind:kph}':weather.windKph,'{wind:mph}':weather.windMph,'{wind:degree}':weather.windDegree,'{wind:dir}':weather.windDir,'{pressure:mb}':weather.pressureMb,'{pressure:in}':weather.pressureIn,'{precip:mm}':weather.precipMm,'{precip:in}':weather.precipIn,'{gust:kph}':weather.gustKph,'{gust:mph}':weather.gustMph,'{feelslike:c}':weather.feelslikeC,'{feelslike:f}':weather.feelslikeF,'{windchill:c}':weather.windchillC,'{windchill:f}':weather.windchillF,'{heatindex:c}':weather.heatindexC,'{heatindex:f}':weather.heatindexF,'{dewpoint:c}':weather.dewpointC,'{dewpoint:f}':weather.dewpointF,'{vis:km}':weather.visKm,'{vis:mi}':weather.visMi,'{humidity}':weather.humidity,'{cloud}':weather.cloud,'{uv}':weather.uv,'{co}':weather.co,'{no2}':weather.no2,'{o3}':weather.o3,'{so2}':weather.so2,'{pm2.5}':weather.pm25,'{pm10}':weather.pm10})
        setPreviewCopy()
      }).catch(() => {})
      const art = document.querySelector('.preview-art')
      const bigUrl = first(config.bigimg) === 'Chưa có nội dung' ? (setup.spotifyTracks?.[0] || setup.spotifyTrack)?.image || '' : first(config.bigimg), smallUrl = first(config.smallimg)
      const bigVisible = /^https?:\/\//i.test(bigUrl), smallVisible = /^https?:\/\//i.test(smallUrl)
      $('previewBig').hidden = !bigVisible
      $('previewSmall').hidden = !smallVisible
      art.hidden = !bigVisible
      if (bigVisible) $('previewBig').src = bigUrl
      if (smallVisible) $('previewSmall').src = smallUrl
      const buttons = $('previewButtons')
      const selectedButtons = activity.buttons ? ['button-1', 'button-2'].flatMap(key => {
        const values = Array.isArray(config[key]) ? config[key].filter(button => button?.name && button?.url) : []
        return values.length ? [values[previewIndex % values.length]] : []
      }) : []
      buttons.replaceChildren(...selectedButtons.map(button => {
        const link = document.createElement('a')
        link.textContent = button.name || 'Button'
        const url = String(button.url || '').trim()
        if (!/^https?:\/\//i.test(url)) return document.createTextNode('')
        link.href = url
        link.target = '_blank'
        link.rel = 'noopener'
        return link
      }))
    }
    function buildSceneObject() {
      return {
        setup: {
          city: $('city').value.trim(),
          setLocalTime: null,
          timezone: null,
          delay: Number($('delay').value || 4),
          mode: $('mode').value,
          type: $('mode').value === 'SPOTIFY' ? 'LISTENING' : (['XBOX', 'PLAYSTATION'].includes($('mode').value) ? 'PLAYING' : $('mode').value === 'YOUTUBE' ? 'STREAMING' : $('type').value),
          ...($('mode').value === 'YOUTUBE' ? {youtubeMode: $('youtubeMode').value, ...($('youtubeMode').value === 'watch' ? {streamURL: $('streamURL').value.trim()} : {})} : ($('type').value === 'STREAMING' ? {streamURL: $('streamURL').value.trim()} : {})),
          ...(['XBOX', 'PLAYSTATION'].includes($('mode').value) ? {consoleButtons: $('consoleButtons').value} : {}),
          ...($('type').value !== 'STREAMING' || $('mode').value === 'YOUTUBE' ? {name: lines('name')} : {}),
          ...($('mode').value === 'SPOTIFY' ? {spotifyTracks, spotifyAutoPlay, startTimeStamp: nullable($('start').value), endTimeStamp: nullable($('end').value), timestamp: '{start}'} : ['STREAMING', 'COMPETING'].includes($('type').value) ? {} : {startTimeStamp: nullable($('start').value), endTimeStamp: nullable($('end').value), timestamp: '{start}'})
        },
        config: {
          'text-1': lines('text1'),
          'text-2': lines('text2'),
          'text-3': lines('text3'),
          bigimg: lines('bigimg'),
          smallimg: lines('smallimg'),
          'button-1': buttons('button1'),
          'button-2': buttons('button2')
        }
      }
    }
    function build() {
      if (syncing) return
      syncTypeDraft()
      const data = buildSceneObject()
      $('output').value = JSON.stringify(data, null, 2)
      startPreview(data)
      const errors = validate(data)
      $('errors').textContent = errors.join('\n')
    }
    const join = value => Array.isArray(value) ? value.join('\n') : ''
    const joinButtons = value => Array.isArray(value) ? value.map(button => (button?.name || '') + '|' + (button?.url || '')).join('\n') : ''
    function applySceneToForm(data) {
      const setup = data.setup || {}
      const config = data.config || {}
      syncing = true
      $('city').value = setup.city || ''
      $('delay').value = setup.delay ?? 4
      $('mode').value = setup.mode || 'RICH_PRESENCE'
      $('type').value = setup.type || 'LISTENING'
      $('streamURL').value = setup.streamURL || ''
      if ($('youtubeMode')) $('youtubeMode').value = setup.youtubeMode === 'buttons' ? 'buttons' : 'watch'
      if ($('consoleButtons')) $('consoleButtons').value = setup.consoleButtons === 'buttons' ? 'buttons' : 'badge'
      spotifyTracks = Array.isArray(setup.spotifyTracks) && setup.spotifyTracks.length ? setup.spotifyTracks.filter(track => track?.id) : (setup.spotifyTrack?.id ? [setup.spotifyTrack] : [])
      spotifyAutoPlay = setup.spotifyAutoPlay !== false
      renderSpotifyAutoPlay()
      $('spotifyQuery').value = spotifyTracks[0]?.url || spotifyTracks[0]?.name || ''
      renderSpotifySelected()
      $('name').value = Array.isArray(setup.name) ? join(setup.name) : setup.name || ''
      $('start').value = setup.startTimeStamp || ''
      $('end').value = setup.endTimeStamp || ''
      $('text1').value = join(config['text-1'])
      $('text2').value = join(config['text-2'])
      $('text3').value = join(config['text-3'])
      $('bigimg').value = join(config.bigimg)
      $('smallimg').value = join(config.smallimg)
      $('button1').value = joinButtons(config['button-1'])
      $('button2').value = joinButtons(config['button-2'])
      typeDrafts.clear()
      activeConfigType = configDraftKey()
      syncing = false
      startPreview(data)
      const errors = validate(data)
      $('errors').textContent = errors.join('\n')
    }
    function fillFromJson() {
      if (!$('output').value.trim()) {
        $('errors').textContent = ''
        return
      }
      try {
        applySceneToForm(JSON.parse($('output').value))
      } catch {
        syncing = false
        $('errors').textContent = 'JSON không hợp lệ.'
      }
    }
    function queueBuild() { clearTimeout(buildTimer); buildTimer = setTimeout(build, 200) }
    document.querySelectorAll('#page-config input,#page-config select,#page-config textarea:not(#output)').forEach(x => {
      x.addEventListener('input', () => { markRpcDirty(); queueBuild() })
      x.addEventListener('change', () => { markRpcDirty(); build() })
    })
    // --- Multi-config (scenes) support ---
    let scenes = [defaultScene()]
    let currentScene = 0
    let simultaneous = false
    let sceneMeta = [{ savedIndex: null, snapshot: null, dirty: false, version: 0 }]
    let savedSceneCount = 0
    let savedSimultaneous = false
    let rpcDirty = false
    let rpcEditVersion = 0
    let rpcViewVersion = 0
    let rpcSaving = false
    function updateRpcEditorState() {
      if (!$('sceneEditorTitle')) return
      const count = scenes.length
      const scene = 'Scene ' + (currentScene + 1)
      const currentDirty = sceneMeta[currentScene]?.dirty || sceneMeta[currentScene]?.savedIndex === null
      const modeDirty = simultaneous !== savedSimultaneous
      const state = $('rpcToggle').dataset.state
      $('sceneEditorTitle').textContent = scene + ' / ' + count
      $('sceneSaveState').textContent = rpcSaving ? 'Đang lưu' : currentDirty || modeDirty ? 'Chưa lưu' : $('save').disabled ? 'Chưa có cấu hình' : 'Đã lưu'
      $('sceneSaveState').dataset.dirty = String(Boolean(currentDirty || modeDirty))
      $('sceneSaveHint').textContent = simultaneous !== savedSimultaneous
        ? 'Cách hiển thị chưa lưu. Nhấn Lưu tất cả scene để áp dụng.'
        : rpcDirty
          ? currentDirty ? 'Scene này chưa lưu. Discord vẫn dùng bản đã lưu cho đến khi bạn lưu.' : 'Scene này đã lưu; còn thay đổi khác chưa lưu.'
          : 'Lưu scene này giữ nguyên scene khác. Lưu tất cả ghi ' + count + ' scene của token đang xem.'
      $('save').textContent = rpcSaving ? 'Đang lưu…' : 'Lưu ' + scene
      if ($('saveAll')) $('saveAll').textContent = rpcSaving ? 'Đang lưu…' : 'Lưu tất cả ' + count + ' scene'
      $('saveJson').textContent = $('save').textContent
      $('previewToggle').textContent = 'Xem trước ' + scene
      const previewLabel = document.querySelector('#rpcSide .preview-label span:first-child')
      if (previewLabel) previewLabel.textContent = 'Xem trước ' + scene
      $('jsonDialogTitle').textContent = 'JSON ' + scene
      $('rpcFeatureStatus').textContent = state === 'enabled' ? 'Đang bật cho scene đã lưu' : state === 'disabled' ? 'Đang tắt' : 'Chưa tải'
    }
    function refreshRpcDirty() {
      rpcDirty = simultaneous !== savedSimultaneous || scenes.length !== savedSceneCount ||
        sceneMeta.some((meta, i) => meta.dirty || meta.savedIndex !== i)
      updateRpcEditorState()
    }
    function markRpcDirty() {
      sceneMeta[currentScene].dirty = true
      sceneMeta[currentScene].version++
      rpcEditVersion++
      refreshRpcDirty()
    }
    function maxRpcConfigs() { return configSlots.find(slot=>slot.id===linkedSlotId)?.configLimit ?? 1 }
    function defaultScene() {
      return {
        setup: { city: 'Đồng Tháp', delay: 4, mode: 'RICH_PRESENCE', type: 'LISTENING', name: 'Naiya', startTimeStamp: '11/07/2008', endTimeStamp: null, timestamp: '{start}' },
        config: {
          'text-1': ['꒰⊹{th=date}/{th=month:1}/{en=year:2}⊹꒱'],
          'text-2': ['‧₊˚🌙 Iroha Sakayor 🌙 ⋆｡˚ ⋆', '‧₊˚.💞ｄａｉｓｕｋｉ💞✧.*', '‧₊˚♡ｉｌｏｖｅｙｏｕ♡⋆｡˚ ⋆'],
          'text-3': ['‧₊˚.🌡️⊹{temp:c} °C 🍃⊹{wind:kph} km/h ✧.*', '‧₊˚.🌨️⊹{cloud} % ┊ 🌤️⊹{uv} uv ✧.*', '‧₊˚.🏙️⊹{city} ┊ 🌪️⊹{wind:mph} mph✧.*'],
          bigimg: ['https://i.postimg.cc/m260tXC1/snaptik-vn-7599849318195186965-14.jpg'],
          smallimg: ['https://i.postimg.cc/VkCH5YzD/giphy.gif'],
          'button-1': [{ name: '🍧 Discord', url: 'https://discord.gg/cy65PCXb2e' }],
          'button-2': [{ name: '🍭 Kết nối', url: 'https://discord.gg/cy65PCXb2e' }]
        }
      }
    }
    function commitCurrent() { scenes[currentScene] = buildSceneObject() }
    function switchScene(i) {
      if (i === currentScene || i < 0 || i >= scenes.length) return
      commitCurrent()
      currentScene = i
      applySceneToForm(scenes[currentScene])
      $('output').value = JSON.stringify(scenes[currentScene], null, 2)
      renderSceneTabs()
    }
    function addScene() {
      if (scenes.length >= maxRpcConfigs()) return
      if ($('mode').value === 'SPOTIFY') { alert('Chuyển RPC mode khỏi SPOTIFY trước khi thêm scene thứ 2.'); return }
      commitCurrent()
      scenes.splice(currentScene + 1, 0, defaultScene())
      sceneMeta.splice(currentScene + 1, 0, { savedIndex: null, snapshot: null, dirty: true, version: 0 })
      currentScene += 1
      rpcEditVersion++
      refreshRpcDirty()
      applySceneToForm(scenes[currentScene])
      $('output').value = JSON.stringify(scenes[currentScene], null, 2)
      renderSceneTabs()
    }
    function webConfirm(message, confirmLabel = 'OK', danger = false, title = 'Xác nhận') {
      return new Promise(resolve => {
        let dlg = document.getElementById('webConfirmDialog')
        if (!dlg) {
          dlg = document.createElement('dialog')
          dlg.id = 'webConfirmDialog'
          dlg.className = 'web-confirm-dialog'
          dlg.innerHTML = '<form method="dialog" class="web-confirm-box"><h2 class="web-confirm-title"></h2><p class="web-confirm-msg"></p><div class="web-confirm-actions"><button type="button" class="web-confirm-cancel">Huỷ</button><button type="button" class="web-confirm-ok"></button></div></form>'
          document.body.append(dlg)
        }
        dlg.querySelector('.web-confirm-title').textContent = title
        dlg.querySelector('.web-confirm-msg').textContent = message
        const ok = dlg.querySelector('.web-confirm-ok')
        ok.textContent = confirmLabel
        ok.classList.toggle('danger', danger)
        const finish = value => {
          dlg.removeEventListener('click', onClick)
          resolve(value)
        }
        const onClick = event => {
          if (event.target === dlg) { finish(false); dlg.close() }
          else if (event.target.classList.contains('web-confirm-cancel')) { finish(false); dlg.close() }
          else if (event.target.classList.contains('web-confirm-ok')) { finish(true); dlg.close() }
        }
        dlg.addEventListener('click', onClick)
        if (typeof dlg.showModal === 'function') dlg.showModal()
        else { if (window.confirm(message)) finish(true); else finish(false) }
      })
    }
    async function deleteScene() {
      if (scenes.length <= 1) return
      const ok = await webConfirm('Hành động này không thể hoàn tác.', 'Xoá', true, 'Xoá scene')
      if (!ok) return
      commitCurrent()
      scenes.splice(currentScene, 1)
      sceneMeta.splice(currentScene, 1)
      if (scenes.length < 2) simultaneous = false
      if (currentScene >= scenes.length) currentScene = scenes.length - 1
      rpcEditVersion++
      refreshRpcDirty()
      applySceneToForm(scenes[currentScene])
      $('output').value = JSON.stringify(scenes[currentScene], null, 2)
      renderSceneTabs()
    }
    function syncSpotifyAvailability() {
      const option = Array.from($('mode').options).find(o => o.value === 'SPOTIFY')
      if (option) option.disabled = scenes.length > 1
    }
    function renderSceneTabs() {
      syncSpotifyAvailability()
      let el = document.getElementById('sceneTabs')
      if (!el) {
        el = document.createElement('div')
        el.id = 'sceneTabs'
        el.className = 'scene-tabs'
        document.querySelector('#page-config [data-slot-switcher]')?.insertAdjacentElement('afterend', el)
      }
      el.innerHTML = ''
      scenes.forEach((_, i) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'scene-tab' + (i === currentScene ? ' active' : '')
        btn.textContent = 'Scene ' + (i + 1)
        btn.setAttribute('aria-current', i === currentScene ? 'true' : 'false')
        btn.onclick = () => switchScene(i)
        el.appendChild(btn)
      })
      if (scenes.length < maxRpcConfigs()) {
        const add = document.createElement('button')
        add.type = 'button'
        add.className = 'scene-tab add'
        add.textContent = '+ Thêm scene'
        add.onclick = addScene
        el.appendChild(add)
      }
      if (scenes.length > 1) {
        const displayMode = document.createElement('fieldset')
        displayMode.className = 'scene-display-mode'
        const legend = document.createElement('legend')
        legend.textContent = 'Hiển thị scene'
        displayMode.appendChild(legend)
        for (const [value, title] of [
          ['rotate', 'Xoay scene'],
          ['simultaneous', 'Hiện ' + scenes.length + ' scene']
        ]) {
          const label = document.createElement('label')
          const radio = document.createElement('input')
          radio.type = 'radio'
          radio.name = 'sceneDisplayMode'
          radio.value = value
          radio.checked = simultaneous === (value === 'simultaneous')
          radio.disabled = value === 'simultaneous' && scenes.length > maxRpcConfigs()
          radio.onchange = () => { simultaneous = radio.value === 'simultaneous'; rpcEditVersion++; refreshRpcDirty() }
          label.append(radio, title)
          displayMode.appendChild(label)
        }
        el.appendChild(displayMode)
        const del = document.createElement('button')
        del.type = 'button'
        del.className = 'scene-tab del'
        del.textContent = 'Xoá scene này'
        del.onclick = deleteScene
        el.appendChild(del)
      }
      updateRpcEditorState()
    }
    function normalizeScenes(targetIndex, persisted = true) {
      rpcViewVersion++
      let raw
      try { raw = JSON.parse($('output').value) } catch { raw = null }
      simultaneous = raw?.simultaneous === true
      if (raw && Array.isArray(raw.configs) && raw.configs.length) {
        scenes = raw.configs.map(c => ({ setup: (c && c.setup) || {}, config: (c && c.config) || {} }))
      } else if (raw && (raw.setup || raw.config)) {
        scenes = [{ setup: raw.setup || {}, config: raw.config || {} }]
      } else {
        scenes = [defaultScene()]
      }
      sceneMeta = scenes.map((scene, i) => ({
        savedIndex: persisted ? i : null, snapshot: persisted ? structuredClone(scene) : null, dirty: false, version: 0
      }))
      savedSceneCount = persisted ? scenes.length : 0
      savedSimultaneous = simultaneous
      rpcDirty = false
      const desired = typeof targetIndex === 'number' ? targetIndex : currentScene
      currentScene = Math.max(0, Math.min(desired, scenes.length - 1))
      applySceneToForm(scenes[currentScene])
      $('output').value = JSON.stringify(scenes[currentScene], null, 2)
      renderSceneTabs()
    }
    $('spotifyAutoPlay').onclick = () => { spotifyAutoPlay = !spotifyAutoPlay; renderSpotifyAutoPlay(); markRpcDirty(); build() }
    $('spotifyClear').onclick = () => { $('spotifyQuery').value = ''; $('spotifyQuery').focus(); liveSearchSpotify() }
    $('spotifyQuery').addEventListener('input', liveSearchSpotify)
    $('spotifyQuery').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); clearTimeout(spotifyLiveTimer); void searchSpotify() } })
    document.querySelectorAll('#page-voice input,#page-voice select').forEach(x => {
      x.addEventListener('input', buildVoice)
      x.addEventListener('change', buildVoice)
      x.addEventListener('keyup', buildVoice)
    })
    document.querySelectorAll('#page-voicepool input,#page-voicepool select,#page-voicepool textarea:not(#voicepoolOutput)').forEach(x => {
      x.addEventListener('input', buildVoicepool)
      x.addEventListener('change', buildVoicepool)
      x.addEventListener('keyup', buildVoicepool)
    })
    $('mediaUpload').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;const target=configSlotMode?configSlotTarget():{};const response=await fetch('/api/media/upload?'+new URLSearchParams(target),{method:'POST',headers:{'content-type':file.type},body:await file.arrayBuffer(),credentials:'same-origin'});const result=await response.json().catch(()=>({}));if(!response.ok){$('errors').textContent=result.error||'Không thể upload ảnh.'}else{event.target.value='';void loadMediaGallery();void loadMediaPicker()}}
    let imageChooserTarget = ''
    function openImageChooser(target) { imageChooserTarget=target; const dialog=$('imageChooserDialog'); if(!dialog.open)dialog.showModal(); $('imageChooserLibrary').hidden=true; $('imageChooserLinkField').hidden=true; $('imageChooserLink').value=''; $('chooseLibraryImage').focus() }
    function addImageValue(url) { if(!/^https:\/\//i.test(url)) { $('errors').textContent='Link ảnh phải bắt đầu bằng https://.'; return } const input=$(imageChooserTarget); input.value=[input.value.trim(),url.trim()].filter(Boolean).join('\n'); $('imageChooserDialog').close(); markRpcDirty(); build() }
    $('bigimgChooser').onclick=()=>openImageChooser('bigimg')
    $('smallimgChooser').onclick=()=>openImageChooser('smallimg')
    let imageConfigTarget = ''
    function openImageConfigInput(target) { imageConfigTarget=target; const dialog=$('imageConfigDialog'); $('imageConfigTitle').textContent=target==='bigimg'?'Cấu hình Big image':'Cấu hình Small image'; $('imageConfigLabel').firstChild.textContent=target==='bigimg'?'Big image URL, mỗi dòng 1 ảnh':'Small image URL, mỗi dòng 1 ảnh'; $('imageConfigInput').value=$(target).value; if(!dialog.open)dialog.showModal(); $('imageConfigInput').focus() }
    $('bigimgConfig').onclick=()=>openImageConfigInput('bigimg')
    $('smallimgConfig').onclick=()=>openImageConfigInput('smallimg')
    $('saveImageConfig').onclick=()=>{ if(!imageConfigTarget)return; $(imageConfigTarget).value=$('imageConfigInput').value; $('imageConfigDialog').close(); markRpcDirty(); build() }
    $('closeImageConfig').onclick=()=>$('imageConfigDialog').close()
    $('imageConfigDialog').addEventListener('click',event=>{const dialog=event.currentTarget,rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close()})
    $('chooseLibraryImage').onclick=()=>{ $('imageChooserLibrary').hidden=false; $('imageChooserLinkField').hidden=true; void loadMediaPicker(); $('imageChooserLibrary').focus() }
    $('chooseImageLink').onclick=()=>{ $('imageChooserLibrary').hidden=true; $('imageChooserLinkField').hidden=false; $('imageChooserLink').focus() }
    $('imageChooserLibrary').onclick=event=>{const button=event.target.closest('.image-chooser-library-item');if(button?.dataset.imageUrl)addImageValue(button.dataset.imageUrl)}
    $('saveImageLink').onclick=()=>addImageValue($('imageChooserLink').value)
    $('imageChooserLink').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();addImageValue(event.target.value)}}
    $('closeImageChooser').onclick=()=>$('imageChooserDialog').close()
    $('imageChooserDialog').addEventListener('click', event=>{const dialog=event.currentTarget,rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close()})
    $('chatMediaPicker').onchange=event=>{const url=event.target.value;if(!url)return;setChatImage('chat','media/'+url.split('/').pop(),url);event.target.value='';buildChat()}
    $('chatpoolMediaPicker').onchange=event=>{const url=event.target.value;if(!url)return;setChatImage('chatpool','media/'+url.split('/').pop(),url);event.target.value='';buildChatpool()}
    $('chatImageFile').addEventListener('change', event => void uploadChatImage('chat', event.target.files?.[0]))
    $('chatpoolImageFile').addEventListener('change', event => void uploadChatImage('chatpool', event.target.files?.[0]))
    $('chatImageRemove').onclick = () => { $('chatImageFile').value = ''; setChatImage('chat', ''); buildChat() }
    $('chatpoolImageRemove').onclick = () => { $('chatpoolImageFile').value = ''; setChatImage('chatpool', ''); buildChatpool() }
    document.querySelectorAll('#page-chat input,#page-chat select,#page-chat textarea:not(#chatOutput)').forEach(x => {
      x.addEventListener('input', buildChat)
      x.addEventListener('change', buildChat)
      x.addEventListener('keyup', buildChat)
    })
    document.querySelectorAll('#page-mention input,#page-mention select,#page-mention textarea:not(#mentionOutput)').forEach(x => {
      x.addEventListener('input', buildMention)
      x.addEventListener('change', buildMention)
      x.addEventListener('keyup', buildMention)
    })
    document.querySelectorAll('#page-chatpool input,#page-chatpool select,#page-chatpool textarea:not(#chatpoolOutput)').forEach(x => {
      x.addEventListener('input', buildChatpool)
      x.addEventListener('change', buildChatpool)
      x.addEventListener('keyup', buildChatpool)
    })
    document.querySelectorAll('#page-status input,#page-status select,#page-status textarea:not(#statusOutput)').forEach(x => {
      x.addEventListener('input', buildStatus)
      x.addEventListener('change', buildStatus)
      x.addEventListener('keyup', buildStatus)
    })
    $('output').addEventListener('input', () => { markRpcDirty(); fillFromJson() })
    $('output').addEventListener('change', () => { markRpcDirty(); fillFromJson() })
    $('output').addEventListener('keyup', fillFromJson)
    $('voiceOutput').addEventListener('input', fillVoiceFromJson)
    $('voiceOutput').addEventListener('change', fillVoiceFromJson)
    $('voiceOutput').addEventListener('keyup', fillVoiceFromJson)
    $('voicepoolOutput').addEventListener('input', fillVoicepoolFromJson)
    $('voicepoolOutput').addEventListener('change', fillVoicepoolFromJson)
    $('voicepoolOutput').addEventListener('keyup', fillVoicepoolFromJson)
    $('mentionOutput').addEventListener('input', fillMentionFromJson)
    $('mentionOutput').addEventListener('change', fillMentionFromJson)
    $('mentionOutput').addEventListener('keyup', fillMentionFromJson)
    $('chatOutput').addEventListener('input', fillChatFromJson)
    $('chatOutput').addEventListener('change', fillChatFromJson)
    $('chatOutput').addEventListener('keyup', fillChatFromJson)
    $('chatpoolOutput').addEventListener('input', fillChatpoolFromJson)
    $('chatpoolOutput').addEventListener('change', fillChatpoolFromJson)
    $('chatpoolOutput').addEventListener('keyup', fillChatpoolFromJson)
    $('statusOutput').addEventListener('input', fillStatusFromJson)
    $('statusOutput').addEventListener('change', fillStatusFromJson)
    $('statusOutput').addEventListener('keyup', fillStatusFromJson)
    $('closeJsonDialog').onclick = () => $('jsonDialog').close()
    $('jsonDialog').addEventListener('click', event => {
      const dialog = event.currentTarget
      if (event.target !== dialog) return
      const rect = dialog.getBoundingClientRect()
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
      if (outside) dialog.close()
    })
    const linked = { config: ['output', 'save', 'errors', 'rpcToggle'], voice: ['voiceOutput', 'voiceSave', 'voiceErrors', 'voiceToggle'], voicepool: ['voicepoolOutput', 'voicepoolSave', 'voicepoolErrors', 'voicepoolToggle'], chat: ['chatOutput', 'chatSave', 'chatErrors', 'chatToggle'], mention: ['mentionOutput', 'mentionSave', 'mentionErrors', 'mentionToggle'], chatpool: ['chatpoolOutput', 'chatpoolSave', 'chatpoolErrors', 'chatpoolToggle'], status: ['statusOutput', 'statusSave', 'statusErrors', 'statusToggle'] }
    function syncLinkedToggle(file) {
      const [, , errors, toggle] = linked[file], button = $(toggle)
      if (!button || button.dataset.state !== 'disabled') return
      const message = $(errors).textContent.trim()
      const invalid = Boolean(message) && !/^Đã (bật|tắt|lưu)/.test(message)
      button.disabled = invalid
      button.title = invalid ? 'Sửa config trước khi bật chức năng.' : ''
    }
    for (const [file, [, , errors]] of Object.entries(linked)) new MutationObserver(() => syncLinkedToggle(file)).observe($(errors), {childList:true, characterData:true, subtree:true})
    const featureLabels = {config:'Rich Presence',voice:'Voice',voicepool:'Multi Voice',chat:'Auto Chat',mention:'Auto Reply',chatpool:'Multi Chat',status:'Status',stream:'Stream',quest:'Quest'}
    const featureStates = Object.fromEntries(Object.keys(featureLabels).map(key => [key, 'loading']))
    function featureStateLabel(state) { return state === 'enabled' ? 'BẬT' : state === 'disabled' ? 'TẮT' : state === 'missing' ? 'CHƯA CẤU HÌNH' : 'KHÔNG CÓ' }
    function renderFeatureStatuses() {
      const track = $('featureStatusTrack')
      if (!track) return
      const group = () => {
        const wrapper = document.createElement('div')
        wrapper.className = 'feature-status-group'
        for (const [key, label] of Object.entries(featureLabels)) {
          const item = document.createElement('span')
          item.className = 'feature-status-item'
          item.dataset.state = featureStates[key]
          const name = document.createElement('b'), state = document.createElement('em')
          name.textContent = label
          state.textContent = featureStateLabel(featureStates[key])
          item.append(name, state)
          wrapper.append(item)
        }
        return wrapper
      }
      track.replaceChildren(group(), group())
      $('featureStatusText').textContent = Object.entries(featureLabels).map(([key, label]) => label + ': ' + featureStateLabel(featureStates[key])).join('. ')
    }
    function setFeatureState(key, state) { if (key in featureStates) { featureStates[key] = state; renderFeatureStatuses() } }
    function resetFeatureStatuses() { for (const key of Object.keys(featureStates)) featureStates[key] = 'loading'; renderFeatureStatuses() }
    let featureStatusSlots = [], featureStatusOwnerId = '', featureStatusSlotId = '', featureStatusLoadSequence = 0
    let linkedLoadPending = false
    function syncFeatureSlotNav() {
      const nav = $('featureSlotNav')
      if (!nav) return
      const index = featureStatusSlots.findIndex(slot => slot.id === featureStatusSlotId)
      nav.hidden = featureStatusSlots.length <= 1
      $('featureSlotLabel').textContent = index < 0 ? 'CHƯA CÓ TOKEN' : 'TOKEN ' + (index + 1)
      $('featureSlotPrev').onclick = () => stepFeatureSlot(-1)
      $('featureSlotNext').onclick = () => stepFeatureSlot(1)
    }
    function setFeatureStatusSlots(slots, ownerId = '', load = true) {
      const next = Array.isArray(slots) ? slots : []
      const signature = ownerId + ':' + next.map(slot => slot.id).join(',')
      const currentSignature = featureStatusOwnerId + ':' + featureStatusSlots.map(slot => slot.id).join(',')
      featureStatusSlots = next
      featureStatusOwnerId = ownerId
      if (!next.some(slot => slot.id === featureStatusSlotId)) featureStatusSlotId = next[0]?.id || ''
      syncFeatureSlotNav()
      if (load && signature !== currentSignature) void loadFeatureStatusSlot()
    }
    function stepFeatureSlot(direction) {
      if (featureStatusSlots.length <= 1) return
      const current = Math.max(0, featureStatusSlots.findIndex(slot => slot.id === featureStatusSlotId))
      featureStatusSlotId = featureStatusSlots[(current + direction + featureStatusSlots.length) % featureStatusSlots.length].id
      syncFeatureSlotNav()
      void loadFeatureStatusSlot()
    }
    async function loadFeatureStatusSlot() {
      const sequence = ++featureStatusLoadSequence
      document.querySelector('.feature-status-marquee')?.classList.add('is-loading')
      if (!featureStatusSlotId) {
        document.querySelector('.feature-status-marquee')?.classList.remove('is-loading')
        for (const file of Object.keys(linked)) featureStates[file] = 'missing'
        featureStates.quest = 'missing'
        renderFeatureStatuses()
        return
      }
      const query = new URLSearchParams({slotId:featureStatusSlotId,...(featureStatusOwnerId?{ownerId:featureStatusOwnerId}:{})}).toString()
      const [configResponse, questResponse] = await Promise.all([
        fetch('/api/config?' + query, {credentials:'same-origin', cache:'no-store'}).catch(() => null),
        fetch('/api/quest?' + query, {credentials:'same-origin', cache:'no-store'}).catch(() => null)
      ])
      if (sequence !== featureStatusLoadSequence) return
      document.querySelector('.feature-status-marquee')?.classList.remove('is-loading')
      const config = configResponse?.ok ? await configResponse.json().catch(() => null) : null
      const quest = questResponse?.ok ? await questResponse.json().catch(() => null) : null
      if (sequence !== featureStatusLoadSequence) return
      for (const file of Object.keys(linked)) featureStates[file] = config?.exists && config.files?.[file] ? (config.disabled?.[file] ? 'disabled' : 'enabled') : 'missing'
      featureStates.quest = quest ? (quest.enabled ? 'enabled' : quest.configured ? 'disabled' : 'missing') : 'missing'
      renderFeatureStatuses()
    }
    renderFeatureStatuses()
    const featureStatusMarquee = document.querySelector('.feature-status-marquee')
    if (featureStatusMarquee) {
      const track = $('featureStatusTrack')
      let drag = null
      featureStatusMarquee.onpointerdown = event => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
        const animation = track.getAnimations()[0]
        const duration = Number(animation?.effect?.getTiming().duration)
        const distance = track.scrollWidth / 2
        if (!animation || !Number.isFinite(duration) || !distance) return
        animation.pause()
        drag = {pointerId:event.pointerId,startX:event.clientX,startTime:Number(animation.currentTime)||0,duration,distance,animation}
        featureStatusMarquee.classList.add('is-dragging')
        featureStatusMarquee.setPointerCapture(event.pointerId)
      }
      featureStatusMarquee.onpointermove = event => {
        if (!drag || event.pointerId !== drag.pointerId) return
        const delta = event.clientX - drag.startX
        if (Math.abs(delta) < 2) return
        event.preventDefault()
        const time = (drag.startTime - delta / drag.distance * drag.duration) % drag.duration
        drag.animation.currentTime = time < 0 ? time + drag.duration : time
      }
      const finishFeatureStatusDrag = event => {
        if (!drag || event.pointerId !== drag.pointerId) return
        drag.animation.play()
        drag = null
        featureStatusMarquee.classList.remove('is-dragging')
        if (featureStatusMarquee.hasPointerCapture(event.pointerId)) featureStatusMarquee.releasePointerCapture(event.pointerId)
      }
      featureStatusMarquee.onpointerup = finishFeatureStatusDrag
      featureStatusMarquee.onpointercancel = finishFeatureStatusDrag
    }
    let linkedUser = ''
    let linkedLocation = 'active'
    let selectedAdminAccount = null
    let adminTokenBoxSync = null
    let adminAccountSwitch = null
    let linkedSlotId = ''
    let linkedOwnerId = ''
    let configSlots = []
    let configSlotMode = false
    let adminMode = false
    let statusPremiumType = null
    let statusLimit = 100
    let linkedDefaults = {}
    let configLoadSequence = 0
    let statusProfileSequence = 0
    let questLinked = false, questPending = false, questFormTouched = false, questCurrentKey = '', questLastState = null
    async function loadVoicepoolHealth(force=false) {
      if (adminMode && selectedAdminAccount && !configSlots.length) return
      if (configSlotMode && !linkedSlotId) return
      const query=configSlotMode?new URLSearchParams(configSlotTarget()).toString():new URLSearchParams({user:linkedUser,...(linkedLocation==='disabled'?{location:'disabled'}:{})}).toString()
      const result=await fetch('/api/config?'+query,{credentials:'same-origin',cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null)
      const current=$('voicepoolErrors').textContent
      if(force||!current||/^Token \d+ hỏng\./m.test(current))$('voicepoolErrors').textContent=result?.errors?.voicepool||''
    }
    async function loadChatpoolHealth(force=false) {
      if (adminMode && selectedAdminAccount && !configSlots.length) return
      if (configSlotMode && !linkedSlotId) return
      const query=configSlotMode?new URLSearchParams(configSlotTarget()).toString():new URLSearchParams({user:linkedUser,...(linkedLocation==='disabled'?{location:'disabled'}:{})}).toString()
      const result=await fetch('/api/config?'+query,{credentials:'same-origin',cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null)
      const current=$('chatpoolErrors').textContent
      if(force||!current||/^Token \d+ hỏng\./m.test(current))$('chatpoolErrors').textContent=result?.errors?.chatpool||''
    }
    function configSlotBound(slot) { return Boolean(slot.tokenUsername || slot.tokenUserId) }
    function configSlotLabel(slot, index) { return 'TOKEN ' + (index + 1) + ' · ' + (slot.tokenUsername || 'Chưa gắn token') + (slot.active === false ? ' · hết hạn' : '') }
    function updatePreviewToggle() {
      if (!previewToggle) return
      const usable = configSlotMode && Boolean(configSlots.find(slot => slot.id === linkedSlotId)?.active)
      previewToggle.hidden = !usable
    }
    function setConfigSlotLoading(loading) {
      document.body.classList.toggle('config-loading', loading)
      document.querySelectorAll('[data-slot-switcher]').forEach(wrapper => wrapper.classList.toggle('is-loading', loading))
    }
    function syncConfigSlotControls() {
      document.querySelectorAll('[data-slot-switcher]').forEach(wrapper => {
        wrapper.hidden = configSlots.length <= 1
        const select = wrapper.querySelector('[data-slot-select]')
        select.replaceChildren(...configSlots.map((slot, index) => {
          const option = document.createElement('option')
          option.value = slot.id
          option.textContent = configSlotLabel(slot, index)
          option.disabled = !configSlotBound(slot)
          return option
        }))
        if (!configSlotMode || !linkedSlotId) {
          const option = document.createElement('option')
          option.value = ''
          option.textContent = 'Chọn token'
          select.prepend(option)
        }
        select.value = configSlotMode ? linkedSlotId : ''
        select.onchange = () => selectConfigSlot(select.value)
        wrapper.onclick = event => {
          if (event.target === select || wrapper.classList.contains('is-loading')) return
          event.preventDefault()
          if (document.documentElement.dataset.layout === 'mobile') select.click()
          else try { select.showPicker() } catch { select.focus() }
        }
        if (!wrapper.querySelector('.config-slot-rail')) {
          const rail = document.createElement('div')
          rail.className = 'config-slot-rail'
          rail.append(select.closest('label'))
          wrapper.prepend(rail)
        }
      })
      updatePreviewToggle()
    }
    function setConfigSlots(slots, ownerId = '') {
      linkedOwnerId = ownerId
      configSlots = Array.isArray(slots) ? slots.filter(slot => !slot.parked) : []
      if (!configSlots.some(slot => slot.id === linkedSlotId && configSlotBound(slot))) linkedSlotId = configSlots.find(configSlotBound)?.id || ''
      syncConfigSlotControls()
      renderSceneTabs()
    }
    async function selectConfigSlot(slotId) {
      if (!configSlots.some(slot => slot.id === slotId && configSlotBound(slot)) || (configSlotMode && slotId === linkedSlotId)) return
      linkedSlotId = slotId
      configSlotMode = true
      configLoadSequence++
      resetLinkedConfigs()
      syncConfigSlotControls()
      setConfigSlotLoading(true)
      if (adminTokenBoxSync) adminTokenBoxSync()
      await loadConfigs()
      await loadQuest()
      await loadOwo()
    }
    function configSlotTarget() {
      return linkedOwnerId ? {slotId: linkedSlotId, ownerId: linkedOwnerId} : {slotId: linkedSlotId}
    }
    function questTarget() {
      if (linkedLocation === 'disabled') return null
      const target = configSlotMode ? (linkedSlotId ? configSlotTarget() : null) : (linkedUser ? {user: linkedUser} : null)
      const key = target ? JSON.stringify(target) : ''
      if (key !== questCurrentKey) {
        questCurrentKey = key
        questFormTouched = false
        questLastState = null
      }
      return target
    }
    function questDate(value) {
      if (!value) return 'Không có'
      return new Intl.DateTimeFormat('vi-VN', {dateStyle:'short', timeStyle:'medium'}).format(new Date(value))
    }
    function setQuestAvailability(usable, message = '') {
      const actions = $('questActions')
      const notice = $('questMessage')
      actions.hidden = !usable
      if (usable) {
        const wasUnavailable = notice.dataset.state === 'unavailable'
        delete notice.dataset.state
        if (wasUnavailable) notice.textContent = ''
        return
      }
      notice.dataset.state = 'unavailable'
      notice.textContent = message
    }
    function renderQuestLog(quests) {
      const box = $('questLog')
      const items = Array.isArray(quests) ? quests : []
      if (!items.length) {
        box.replaceChildren(Object.assign(document.createElement('p'), {className:'quest-log-empty', textContent:'Chưa có nhiệm vụ trong lượt này.'}))
        return
      }
      const statusText = {waiting:'Đang chờ', working:'Đang làm', completed:'Hoàn thành', error:'Lỗi'}
      box.replaceChildren(...items.map(item => {
        const card = document.createElement('article')
        card.className = 'quest-log-item'
        const image = document.createElement('img')
        image.src = typeof item.image === 'string' && item.image ? item.image : '/superutils-logo-v1.png'
        image.alt = ''
        const content = document.createElement('div')
        const name = document.createElement('h3')
        name.textContent = item.name || 'Quest'
        const meta = document.createElement('p')
        meta.className = 'quest-log-meta'
        const task = document.createElement('span')
        task.textContent = item.task || 'Không rõ nhiệm vụ'
        const orbs = document.createElement('span')
        orbs.textContent = 'Orb: ' + (Number(item.orbs) || 0)
        const expires = document.createElement('span')
        expires.textContent = 'Hạn: ' + (item.expiresAt ? questDate(item.expiresAt) : 'Không có')
        const status = document.createElement('span')
        status.className = 'quest-log-status'
        status.dataset.state = statusText[item.state] ? item.state : 'waiting'
        status.textContent = statusText[status.dataset.state]
        meta.append(task, orbs, expires, status)
        const progress = document.createElement('div')
        progress.className = 'quest-log-progress'
        const fill = document.createElement('i')
        const percent = Math.max(0, Math.min(100, Number(item.percent) || 0))
        fill.style.width = percent + '%'
        progress.append(fill)
        content.append(name, meta, progress)
        card.append(image, content)
        return card
      }))
    }
    function renderQuest(data) {
      questLastState = data
      if (linkedSlotId === featureStatusSlotId) setFeatureState('quest', data.enabled ? 'enabled' : data.configured ? 'disabled' : 'missing')
      const badge = $('questStateBadge')
      const state = data.running ? 'running' : data.enabled ? 'enabled' : data.configured ? 'disabled' : 'idle'
      badge.dataset.state = state
      badge.textContent = data.running ? 'ĐANG CHẠY' : data.enabled ? 'ĐANG BẬT' : data.configured ? 'ĐÃ TẮT' : data.tokenPresent ? 'CHƯA BẬT' : 'CHƯA GẮN TOKEN'
      if (!questFormTouched) {
        $('questType').value = data.type || 'BOTH'
        $('questDays').value = String(data.days ?? 0)
        $('questDmEnabled').checked = data.dmEnabled !== false
      }
      $('questTokenState').textContent = data.tokenPresent ? 'Đã gắn' : 'Chưa gắn'
      $('questScheduleState').textContent = data.enabled ? 'Mỗi 24 giờ · ' + (data.type || 'BOTH') : data.configured ? 'Đã tắt · ' + (data.type || 'BOTH') : 'Chưa cấu hình'
      $('questExpires').textContent = data.expiresAt ? questDate(data.expiresAt) : data.configured ? 'Vĩnh viễn' : 'Không có'
      $('questNextRun').textContent = data.running && data.enabled && !data.nextRunAt ? 'Sau khi lượt hiện tại xong' : data.nextRunAt ? questDate(data.nextRunAt) : 'Chưa lên lịch'
      $('questLastRun').textContent = data.summary?.lastStartedAt ? questDate(data.summary.lastStartedAt) : 'Chưa chạy'
      const progress = data.summary?.progress
      $('questProgress').hidden = !progress || !data.running
      if (progress) {
        const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0))
        $('questProgressName').textContent = progress.quest + ' · ' + progress.task
        $('questProgressLabel').textContent = percent + '% · còn ' + progress.minutesLeft + ' phút'
        $('questProgressBar').style.width = percent + '%'
        $('questProgress').querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(percent))
      }
      const summary = data.summary || {}
      renderQuestLog(summary.quests)
      $('questSummary').textContent = summary.lastStartedAt
        ? 'Quét ' + (summary.total || 0) + ' · hợp lệ ' + (summary.valid || 0) + ' · hoàn thành ' + (summary.completed || 0) + ' · lỗi/hết hạn ' + ((summary.failed || 0) + (summary.expired || 0))
        : 'Chưa có dữ liệu chạy Quest.'
      const usable = Boolean(data.slotActive && data.slotBound && data.tokenPresent)
      const actionLocked = questPending || data.running
      const free = Boolean(data.free), cooldown = free && data.freeNextRunAt > Date.now()
      $('questEnable').hidden = free
      $('questDisable').hidden = free
      $('questDays').closest('label').hidden = free
      $('questScheduleCopy').hidden = free
      $('questFreeInfo').hidden = !free
      $('questFreeInfo').textContent = free ? cooldown ? 'Lượt tiếp theo: ' + questDate(data.freeNextRunAt) : 'Free: chạy thủ công một lần mỗi 5 giờ theo account và token.' : ''
      if (free) { $('questScheduleState').textContent = 'Chỉ chạy thủ công'; $('questNextRun').textContent = cooldown ? questDate(data.freeNextRunAt) : 'Sẵn sàng' }
      const unavailableMessage = !data.slotActive ? 'Slot đã hết hạn. Gia hạn slot để dùng Auto Quest.' : 'Slot chưa gắn token. Gắn token để dùng Auto Quest.'
      setQuestAvailability(usable, unavailableMessage)
      $('questEnable').disabled = actionLocked || !usable
      $('questEnable').textContent = 'Chạy theo lịch'
      $('questDisable').disabled = actionLocked || !data.enabled
      $('questRun').disabled = actionLocked || !usable || cooldown
      return usable
    }
    async function questRequest(path, options = {}) {
      const response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options})
      const result = await response.json().catch(() => ({}))
      if (!response.ok) { if (result.nextRunAt && questLastState) questLastState.freeNextRunAt = result.nextRunAt; throw new Error(result.error || 'Không thể xử lý Quest.') }
      return result
    }
    async function loadQuest(silent = false) {
      if (!questLinked) return
      const target = questTarget()
      if (!target) {
        setFeatureState('quest', 'missing')
        setQuestAvailability(false, 'Chưa có slot để dùng Auto Quest.')
        return
      }
      if (!silent) $('questMessage').textContent = 'Đang tải trạng thái Quest...'
      try {
        const query = new URLSearchParams(target).toString()
        const data = await questRequest('/api/quest?' + query)
        const usable = renderQuest(data)
        if (!silent && usable) $('questMessage').textContent = ''
      } catch (error) {
        $('questMessage').textContent = error instanceof Error ? error.message : 'Không thể tải Quest.'
      }
    }
    async function questAction(path, success) {
      const target = questTarget()
      if (!target || questPending) return
      questPending = true
      if (questLastState) renderQuest(questLastState)
      $('questMessage').textContent = 'Đang xử lý Quest...'
      try {
        const payload = {...target, type:$('questType').value, days:Number($('questDays').value), dmEnabled:$('questDmEnabled').checked}
        const data = await questRequest(path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)})
        renderQuest(data)
        if (linkedSlotId === featureStatusSlotId) setFeatureState('quest', data.enabled ? 'enabled' : data.configured ? 'disabled' : 'missing')
        $('questMessage').textContent = success
        questFormTouched = false
      } catch (error) {
        $('questMessage').textContent = error instanceof Error ? error.message : 'Không thể xử lý Quest.'
      } finally {
        questPending = false
        if (questLastState) renderQuest(questLastState)
      }
    }
    $('questType').addEventListener('change', () => { questFormTouched = true })
    $('questDays').addEventListener('change', () => { questFormTouched = true })
    $('questDmEnabled').addEventListener('change', () => { questFormTouched = true })
    $('questEnable').onclick = () => questAction('/api/quest/enable', 'Đã bắt đầu lượt đầu và bật lịch Quest 24 giờ.')
    $('questDisable').onclick = () => questAction('/api/quest/disable', 'Đã tắt Quest.')
    $('questRun').onclick = () => questAction('/api/quest/run', 'Đã bắt đầu một lượt Quest.')
    setInterval(() => {
      if (questLinked && $('page-quest').classList.contains('active') && !questPending) void loadQuest(true)
    }, 4000)
    let owoLoadSequence = 0, owoPending = false, owoFormTouched = false, owoTargetKey = "", owoSavedConfig = null
    const owoTargetCommands = ["kiss","hug","slap","stare","kill","hold","pats","wave","boop","poke","pat","nom","cuddle","highfive","greet","punch"]
    const owoGroups = { huntBattle:{commands:["hunt","battle"]}, slot:{commands:["slot"]}, extra:{commands:["pup","piku","run","army",...owoTargetCommands]} }
    const owoControl = command => "owo" + command[0].toUpperCase() + command.slice(1)
    function renderOwoExtraCommands() {
      const root = $("owoExtraCommands")
      for (const command of owoTargetCommands) { const label=document.createElement("label"),input=document.createElement("input"); input.id=owoControl(command);input.type="checkbox";label.className="mention-switch owo-command-switch";const name=document.createElement("span");name.className="owo-command-name";name.textContent=command[0].toUpperCase()+command.slice(1)+" @OwO";const track=document.createElement("span");track.className="mention-switch-track";track.setAttribute("aria-hidden","true");label.append(name,input,track);root.append(label) }
    }
    renderOwoExtraCommands()
    function owoTarget() { return configSlotMode && linkedSlotId && linkedLocation !== "disabled" ? configSlotTarget() : null }
    function normalizedOwo(config) {
      const legacy = config?.groups ? null : config
      const groups = {}
      for (const [name, group] of Object.entries(owoGroups)) {
        const current=config?.groups?.[name] || {}
        groups[name]={enabled:current.enabled ?? Boolean(legacy?.enabled),guildId:current.guildId || legacy?.guildId || "",channelId:current.channelId || legacy?.channelId || "",commands:Object.fromEntries(group.commands.map(command=>[command,current.commands?.[command] ?? legacy?.commands?.[command] ?? (command==="hunt"||command==="battle"||command==="slot")])),...(name==="slot"?{slotStake:current.slotStake ?? legacy?.slotStake ?? 100}: {})}
      }
      const currentCash=config?.cash || {}
      const channel=Object.values(groups).find(group=>group.channelId) || currentCash
      return {enabled:config?.enabled===true,groups,cash:{guildId:currentCash.guildId || "",channelId:currentCash.channelId || ""},guildId:channel.guildId || "",channelId:channel.channelId || ""}
    }
    function setOwoAvailability(usable, message="") {
      for (const [name,group] of Object.entries(owoGroups)) {
        for (const command of group.commands) { const control=$(owoControl(command));if(control)control.disabled=!usable||owoPending }
        $("owo"+name[0].toUpperCase()+name.slice(1)+"Save").disabled=!usable||owoPending;$("owo"+name[0].toUpperCase()+name.slice(1)+"Toggle").disabled=!usable||owoPending
      }
      $("owoGuild").disabled=!usable||owoPending;$("owoChannel").disabled=!usable||owoPending;$("owoChannelSave").disabled=!usable||owoPending;$("owoCash").disabled=!usable||owoPending;$("owoSlotStake").disabled=!usable||owoPending
      if (!usable) $("owoMessage").textContent=message
    }
    function syncOwoToggle(name) { const group=owoSavedConfig?.groups?.[name],button=$("owo"+name[0].toUpperCase()+name.slice(1)+"Toggle"),enabled=group?.enabled===true;button.dataset.state=enabled?"enabled":"disabled";button.textContent=enabled?"Tắt chức năng":"Bật chức năng" }
    function renderOwo(data, preserve=false) {
      const config=normalizedOwo(data?.config),status=data?.status||{}
      owoSavedConfig=config
      if (!preserve) { for (const [name, group] of Object.entries(owoGroups)) { const current=config.groups[name];if(name==="slot")$("owoSlotStake").value=String(current.slotStake);for(const command of group.commands) { const control=$(owoControl(command));if(control)control.checked=current.commands[command]===true } };$("owoGuild").value=config.guildId;$("owoChannel").value=config.channelId;void loadDiscordSelectors("owo",config.guildId,config.channelId) }
      const slotStats=status.slot||{},slotStat=value=>Number.isSafeInteger(value)&&value>=0?value:0,slotNumber=value=>new Intl.NumberFormat("vi-VN").format(slotStat(value))
      $("owoSlotWins").textContent=slotNumber(slotStats.wins);$("owoSlotLosses").textContent=slotNumber(slotStats.losses);$("owoSlotWon").textContent=slotNumber(slotStats.won);$("owoSlotLost").textContent=slotNumber(slotStats.lost)
      for(const name of Object.keys(owoGroups))syncOwoToggle(name);setOwoAvailability(true)
    }
    async function loadOwo(silent=false) {
      const target=owoTarget();if(!target){setOwoAvailability(false,"Chưa có slot để dùng OwO.");return}
      const key=JSON.stringify(target),sequence=++owoLoadSequence;if(key!==owoTargetKey){owoTargetKey=key;owoFormTouched=false}
      if(!silent) $("owoMessage").textContent="Đang tải OwO..."
      try { const response=await fetch("/api/owo?"+new URLSearchParams(target),{credentials:"same-origin",cache:"no-store"}),data=await response.json().catch(()=>({}));if(sequence!==owoLoadSequence)return;if(!response.ok)throw new Error(data.error||"Không thể tải OwO.");renderOwo(data,owoFormTouched);if(!silent)$("owoMessage").textContent="" } catch(error) { if(sequence!==owoLoadSequence)return;setOwoAvailability(false,error instanceof Error?error.message:"Không thể tải OwO.") }
    }
    function owoGroupPayload(name) {
      const group=owoGroups[name],commands=Object.fromEntries(group.commands.map(command=>[command,command==="slot"?true:$(owoControl(command)).checked])),slotStake=name==="slot"?Number($("owoSlotStake").value):undefined
      return {enabled:owoSavedConfig?.groups?.[name]?.enabled===true,guildId:$("owoGuild").value.trim(),channelId:$("owoChannel").value.trim(),commands,...(name==="slot"?{slotStake}:{})}
    }
    function owoChannelReady() {
      const ready=/^\d{17,20}$/.test($("owoGuild").value) && /^\d{17,20}$/.test($("owoChannel").value)
      if (!ready) $("owoMessage").textContent="Chọn Guild và Text channel trong card Kênh OwO trước."
      return ready
    }
    async function saveOwoGroup(name, success="Đã lưu.") {
      const target=owoTarget();if(!target||owoPending||!owoSavedConfig||!owoChannelReady())return;owoPending=true;setOwoAvailability(true);$("owoMessage").textContent="Đang lưu OwO..."
      const group=owoGroupPayload(name);if(name==="slot"&&(!Number.isSafeInteger(group.slotStake)||group.slotStake<1||group.slotStake>250000)){$("owoMessage").textContent="Tiền cược phải là số nguyên từ 1 đến 250.000.";owoPending=false;setOwoAvailability(Boolean(owoTarget()));return}const groups=structuredClone(owoSavedConfig.groups);groups[name]=group;const payload=owoSharedPayload(groups)
      try { const response=await fetch("/api/owo?"+new URLSearchParams(target),{method:"PUT",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(payload)}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Không thể lưu OwO.");owoSavedConfig=normalizedOwo(data.config);syncOwoToggle(name);$("owoMessage").textContent=success } catch(error) { $("owoMessage").textContent=error instanceof Error?error.message:"Không thể lưu OwO." } finally { owoPending=false;setOwoAvailability(Boolean(owoTarget())) }
    }
    async function toggleOwoGroup(name) { if(!owoSavedConfig||!owoChannelReady())return;owoSavedConfig.groups[name].enabled=!owoSavedConfig.groups[name].enabled;syncOwoToggle(name);await saveOwoGroup(name,owoSavedConfig.groups[name].enabled?"Đã bật.":"Đã tắt.") }
    function owoSharedPayload(groups) {
      const guildId=$("owoGuild").value.trim(),channelId=$("owoChannel").value.trim()
      for (const group of Object.values(groups)) { group.guildId=guildId;group.channelId=channelId }
      return {enabled:Object.values(groups).some(group=>group.enabled&&Object.values(group.commands).some(Boolean)),groups,cash:{guildId,channelId}}
    }
    async function saveOwoChannel() {
      const target=owoTarget();if(!target||owoPending||!owoSavedConfig||!owoChannelReady())return;owoPending=true;setOwoAvailability(true);$("owoMessage").textContent="Đang lưu kênh..."
      const payload=owoSharedPayload(structuredClone(owoSavedConfig.groups))
      try { const response=await fetch("/api/owo?"+new URLSearchParams(target),{method:"PUT",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(payload)}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Không thể lưu kênh.");owoSavedConfig=normalizedOwo(data.config);$("owoMessage").textContent="Đã lưu kênh cho tất cả chức năng OwO." } catch(error) { $("owoMessage").textContent=error instanceof Error?error.message:"Không thể lưu kênh." } finally { owoPending=false;setOwoAvailability(Boolean(owoTarget())) }
    }
    async function loadOwoCash() {
      const target=owoTarget();if(!target||owoPending)return;owoPending=true;setOwoAvailability(true);$("owoCashBalance").textContent="Đang tải..."
      try { const response=await fetch("/api/owo/cash?"+new URLSearchParams(target),{method:"POST",credentials:"same-origin"}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Không thể lấy số dư.");$("owoCashBalance").textContent=new Intl.NumberFormat("vi-VN").format(data.cash)+" cowoncy" } catch(error) { $("owoCashBalance").textContent="Chưa tải";$("owoMessage").textContent=error instanceof Error?error.message:"Không thể lấy số dư." } finally { owoPending=false;setOwoAvailability(Boolean(owoTarget())) }
    }
    for(const group of Object.values(owoGroups))for(const command of group.commands){const control=$(owoControl(command));if(control)control.addEventListener("input",()=>{owoFormTouched=true})}
    $("owoHuntBattleSave").onclick=()=>void saveOwoGroup("huntBattle");$("owoHuntBattleToggle").onclick=()=>void toggleOwoGroup("huntBattle")
    $("owoChannelSave").onclick=()=>void saveOwoChannel();$("owoCash").onclick=()=>void loadOwoCash()
    $("owoSlotSave").onclick=()=>void saveOwoGroup("slot");$("owoSlotToggle").onclick=()=>void toggleOwoGroup("slot")
    $("owoExtraSave").onclick=()=>void saveOwoGroup("extra");$("owoExtraToggle").onclick=()=>void toggleOwoGroup("extra")
    async function saveSelectedScene() {
      if (rpcSaving) return
      rpcSaving = true
      $('save').disabled = true
      $('saveJson').disabled = true
      $('saveAll').disabled = true
      updateRpcEditorState()
      const selectedIndex = currentScene
      const viewVersion = rpcViewVersion
      const meta = sceneMeta[selectedIndex]
      const version = meta.version
      try {
        try { JSON.parse($('output').value) } catch { throw new Error('JSON scene không hợp lệ.') }
        commitCurrent()
        const scene = structuredClone(scenes[selectedIndex])
        const target = configSlotMode ? configSlotTarget() : {user: linkedUser || undefined, ...(linkedLocation === 'disabled' ? {location:'disabled'} : {})}
        const response = await fetch('/api/config', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
          file:'config', data:scene, saveScene:true, sceneIndex:meta.savedIndex, expectedScene:meta.snapshot, ...target
        })})
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Không thể lưu scene.')
        if (viewVersion !== rpcViewVersion) return
        meta.savedIndex = result.sceneIndex
        meta.snapshot = scene
        if (meta.version === version) meta.dirty = false
        savedSceneCount = result.sceneCount
        refreshRpcDirty()
        $('errors').textContent = meta.version === version
          ? 'Đã lưu Scene ' + (selectedIndex + 1) + '. Các scene khác giữ nguyên.'
          : 'Đã lưu bản trước của Scene ' + (selectedIndex + 1) + '; thay đổi mới chưa lưu.'
      } catch (error) {
        if (viewVersion === rpcViewVersion) $('errors').textContent = error instanceof Error ? error.message : 'Không thể lưu scene.'
      } finally {
        if (viewVersion === rpcViewVersion) showActionMessage($('errors'))
        rpcSaving = false
        $('save').disabled = false
        $('saveJson').disabled = false
        $('saveAll').disabled = false
        updateRpcEditorState()
      }
    }
    async function saveLinked(file) {
      const [output, save, errors] = linked[file]
      if (file === 'config') {
        if (rpcSaving) return
        rpcSaving = true
        $('save').disabled = true
        $('saveJson').disabled = true
        if ($('saveAll')) $('saveAll').disabled = true
        updateRpcEditorState()
      }
      try {
        const editVersion = rpcEditVersion
        const viewVersion = rpcViewVersion
        if (file === 'config') {
          try { JSON.parse($(output).value) } catch { throw new Error('JSON scene không hợp lệ.') }
        }
        const data = file === 'config'
          ? (commitCurrent(), { simultaneous: simultaneous && scenes.length > 1, configs: scenes.map(s => ({ setup: s.setup, config: s.config })) })
          : JSON.parse($(output).value)
        const sentMeta = file === 'config' ? [...sceneMeta] : []
        const sentVersions = sentMeta.map(meta => meta.version)
        const target = configSlotMode ? configSlotTarget() : {user: linkedUser || undefined, ...(linkedLocation === 'disabled' ? {location:'disabled'} : {})}
        const response = await fetch('/api/config', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({file, data, ...target})})
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || (file === 'config' ? 'Không thể lưu scene.' : 'Không thể lưu config.'))
        if (file !== 'config' || viewVersion === rpcViewVersion) {
        if (file === 'config') {
          savedSceneCount = data.configs.length
          savedSimultaneous = data.simultaneous
          sentMeta.forEach((meta, i) => {
            meta.savedIndex = i
            meta.snapshot = structuredClone(data.configs[i])
            meta.dirty = meta.version !== sentVersions[i]
          })
          refreshRpcDirty()
        }
        if (file !== 'config' || rpcEditVersion === editVersion) {
          await loadConfigs(file === 'config' ? editVersion : undefined)
        }
        if (Array.isArray(result.rejectedTokens) && result.rejectedTokens.length) {
          const lines = result.rejectedTokens.map(r => r.token + ': ' + r.reason)
          $(errors).textContent = (result.forcedDisabled
            ? 'Đã lưu nhưng KHÔNG token nào hợp lệ — tính năng đã bị tắt.\n'
            : 'Đã lưu. ' + result.activeCount + ' token hoạt động, ' + result.rejectedTokens.length + ' token bị loại:\n'
          ) + lines.join('\n')
        } else {
          $(errors).textContent = file === 'config'
            ? rpcEditVersion === editVersion ? 'Đã lưu tất cả ' + scenes.length + ' scene lên server.' : 'Đã lưu bản trước; thay đổi mới chưa lưu.'
            : 'Đã lưu lên server.'
        }
        }
      } catch (error) { if (file !== 'config' || viewVersion === rpcViewVersion) $(errors).textContent = error instanceof Error ? error.message : file === 'config' ? 'Không thể lưu scene.' : 'Không thể lưu config.' }
      if (file !== 'config' || viewVersion === rpcViewVersion) showActionMessage($(errors))
      if (file === 'config') {
        rpcSaving = false
        $('saveJson').disabled = false
        if ($('saveAll')) $('saveAll').disabled = false
      }
      $(save).disabled = false
      if (file === 'config') updateRpcEditorState()
    }
    async function toggleLinked(file) {
      const [, , errors, toggle] = linked[file]
      const toggleBtn = $(toggle)
      if (!toggleBtn || toggleBtn.disabled) return
      const pendingLabel = toggleBtn.dataset.state === 'disabled' ? 'Đang bật…' : 'Đang tắt…'
      const previousLabel = toggleBtn.textContent
      const viewSequence = configLoadSequence
      toggleBtn.disabled = true
      toggleBtn.textContent = pendingLabel
      try {
        const target = configSlotMode ? configSlotTarget() : {user: linkedUser || undefined, ...(linkedLocation === 'disabled' ? {location:'disabled'} : {})}
        const response = await fetch('/api/config/toggle', {method: 'POST', headers: {'content-type': 'application/json'}, credentials: 'same-origin', body: JSON.stringify({file, ...target})})
        const result = await response.json()
        if (viewSequence !== configLoadSequence) return
        if (!response.ok) throw new Error(result.error || 'Không thể thay đổi trạng thái.')
        if (linkedSlotId === featureStatusSlotId) setFeatureState(file, result.disabled ? 'disabled' : 'enabled')
        toggleBtn.textContent = result.disabled ? 'Bật chức năng' : 'Tắt chức năng'
        toggleBtn.dataset.state = result.disabled ? 'disabled' : 'enabled'
        syncLinkedToggle(file)
        if (file === 'config') updateRpcEditorState()
        $(errors).textContent = result.disabled ? 'Đã tắt chức năng.' : 'Đã bật chức năng.'
        showActionMessage($(errors))
      } catch (error) {
        if (viewSequence === configLoadSequence) {
          toggleBtn.textContent = previousLabel
          $(errors).textContent = error instanceof Error ? error.message : 'Không thể thay đổi trạng thái.'
          showActionMessage($(errors))
        }
      } finally {
        if (viewSequence === configLoadSequence) toggleBtn.disabled = false
      }
    }
    const money = value => Number(value || 0).toLocaleString('vi-VN') + 'đ'
    function renderAccountHome(user) {
      resetFeatureStatuses()
      $('page-main').dataset.accountState = 'linked'
      $('accountPlanSlots').hidden = false
      $('homeGreeting').textContent = 'Xin chào, ' + user.username
      $('homeUsername').textContent = user.username
      $('homeUserId').textContent = 'ID: ' + user.id
      $('homeAvatarFallback').textContent = user.username.slice(0, 1).toUpperCase()
      $('homeAvatar').hidden = !user.avatar
      $('homeAvatarFallback').hidden = Boolean(user.avatar)
      if (user.avatar) $('homeAvatar').src = user.avatar
      else $('homeAvatar').removeAttribute('src')
    }
    function renderAccountHomeState(data) {
      const activeSlots = data.slots.filter(slot => slot.active)
      const activePlan = data.plan?.expiresAt > Date.now()
      const plan = activePlan ? data.plans?.find(item => item.id === data.plan.id) : null
      const planName = data.plan?.id === 'pluna' ? 'Luna' : data.plan?.id === 'pterra' ? 'Terra' : data.plan?.id === 'psol' ? 'Sol' : plan?.name
      $('homePlanName').textContent = activePlan ? planName || 'Gói trả phí' : 'Free'
      if (activePlan) {
        const expiry = new Date(data.plan.expiresAt)
        $('homePlanExpiryTime').textContent = new Intl.DateTimeFormat('vi-VN', {timeStyle:'medium'}).format(expiry)
        $('homePlanExpiryDate').textContent = new Intl.DateTimeFormat('vi-VN', {dateStyle:'short'}).format(expiry)
      } else {
        $('homePlanExpiryTime').textContent = 'Không thời hạn'
        $('homePlanExpiryDate').textContent = ''
      }
      $('homeSummary').textContent = activeSlots.length ? 'Discord đã đồng bộ. ' + activeSlots.length + ' token còn hạn.' : 'Discord đã đồng bộ. Chưa có token còn hạn.'
    }
    let billingMe = null
    let cardFees = null
    let adminBillingState = null
    let adminFilterQuery = ''
    let adminFilterMode = 'all'
    let adminFilterPlan = 'all'
    const adminSelectedSlots = new Set()
    let currentUserId = ''
    let selectedSlotId = ''
    let pendingTokenUnbind = null
    let activePayment = null
    let paymentPopupCancelled = false
    async function billingRequest(path, options) { const response=await fetch(path,{credentials:'same-origin',...(options||{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Không thể xử lý.');return result }
    function openTokenUnbindDialog(slot, index, ownerId) {
      const dialog = $('tokenUnbindDialog')
      if (dialog.open) dialog.close()
      pendingTokenUnbind = {slotId: slot.id, ownerId, label: 'TOKEN ' + (index + 1)}
      $('tokenUnbindDialogTitle').textContent = 'Gỡ ' + pendingTokenUnbind.label + '?'
      $('tokenUnbindDialogCopy').textContent = 'Token sẽ bị xóa. Config chỉ được khôi phục khi gắn lại đúng tài khoản Discord; token khác sẽ dùng config mới.'
      $('tokenUnbindStatus').textContent = ''
      $('confirmTokenUnbind').disabled = false
      $('cancelTokenUnbind').disabled = false
      dialog.showModal()
      $('cancelTokenUnbind').focus({preventScroll: true})
    }
    function createSlotPanel(slot, index, data) {
      const box = document.createElement('div')
      box.className = 'slot slot-panel'
      box.dataset.tokenState = slot.tokenState
      box.id = 'slotPanel'
      box.setAttribute('role', 'tabpanel')
      box.setAttribute('aria-labelledby', 'slotTab' + index)
      const title = document.createElement('b')
      const tokenInvalid = slot.tokenState === 'invalid'
      title.textContent = 'Token ' + (index + 1) + (tokenInvalid ? ' · token hết hiệu lực' : slot.active ? ' · đang hoạt động' : '')
      const info = document.createElement('p')
      info.textContent = tokenInvalid ? 'Token hết hiệu lực' : 'User: ' + (slot.tokenUsername || 'Chưa gắn token')
      box.append(title, info)
      const actions = document.createElement('div')
      actions.className = 'actions'
      const hasToken = slot.tokenState === 'active'
      if (!hasToken && slot.active) {
        actions.classList.add('slot-bind-actions')
        const input = document.createElement('input')
        input.type = 'password'
        input.id = 'slotTokenInput' + index
        input.placeholder = 'Dán token Discord'
        input.autocomplete = 'off'
        const tokenField = document.createElement('div')
        tokenField.className = 'slot-token-field'
        const visibility = document.createElement('button')
        visibility.type = 'button'
        visibility.className = 'slot-token-toggle'
        visibility.title = 'Hiện token'
        visibility.setAttribute('aria-label', 'Hiện token')
        visibility.setAttribute('aria-pressed', 'false')
        visibility.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/><path class="eye-slash" d="m4 4 16 16"/></svg>'
        visibility.onclick = () => {
          const visible = input.type === 'password'
          const label = visible ? 'Ẩn token' : 'Hiện token'
          input.type = visible ? 'text' : 'password'
          visibility.classList.toggle('is-visible', visible)
          visibility.setAttribute('aria-label', label)
          visibility.setAttribute('aria-pressed', String(visible))
          visibility.title = label
          input.focus()
        }
        tokenField.append(input, visibility)
        const bindStatus = document.createElement('span')
        bindStatus.className = 'slot-bind-status'
        bindStatus.id = 'slotBindStatus' + index
        bindStatus.setAttribute('role', 'status')
        bindStatus.setAttribute('aria-live', 'polite')
        input.setAttribute('aria-describedby', bindStatus.id)
        const bind = document.createElement('button')
        bind.textContent = 'Gắn token'
        bind.disabled = true
        const syncBindButton = () => { bind.disabled = !input.value.trim() }
        input.addEventListener('input', () => {
          bindStatus.textContent = ''
          delete bindStatus.dataset.state
          syncBindButton()
        })
        bind.onclick = async () => {
          const token = input.value.trim()
          if (!token) { syncBindButton(); return }
          $('billingStatus').textContent = ''
          bindStatus.textContent = 'Đang kiểm tra token...'
          bindStatus.dataset.state = 'checking'
          input.disabled = true
          bind.disabled = true
          visibility.disabled = true
          try {
            await billingRequest('/api/billing/bind', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({slotId: slot.id, token, ...(data.ownerId ? {ownerId:data.ownerId} : {})})})
            input.value = ''
            await loadBilling()
          } catch (error) {
            bindStatus.textContent = error instanceof Error ? error.message : 'Không thể kiểm tra token.'
            bindStatus.dataset.state = 'error'
            input.disabled = false
            visibility.disabled = false
            syncBindButton()
          }
        }
        actions.append(tokenField, bindStatus, bind)
      }
      if (hasToken) {
        const unbind = document.createElement('button')
        unbind.type = 'button'
        unbind.className = 'slot-unbind'
        unbind.textContent = 'Gỡ token'
        unbind.title = 'Gỡ token khỏi TOKEN ' + (index + 1)
        unbind.onclick = () => openTokenUnbindDialog(slot, index, data.ownerId || '')
        actions.append(unbind)
      }
      box.append(actions)
      return box
    }
    function renderSlots(slots, data) {
      const list = $('slotList')
      if (!slots.length) {
        selectedSlotId = ''
        list.textContent = 'Chưa có slot. Nạp tiền rồi mua gói 30 ngày.'
        return
      }
      if (!slots.some(slot => slot.id === selectedSlotId)) selectedSlotId = slots[0].id
      const tabBar = document.createElement('div')
      tabBar.className = 'slot-tab-bar'
      const tabs = document.createElement('div')
      tabs.className = 'slot-tabs'
      tabs.setAttribute('role', 'tablist')
      tabs.setAttribute('aria-label', 'Chọn token Discord')
      slots.forEach((slot, index) => {
        const tab = document.createElement('button')
        const selected = slot.id === selectedSlotId
        tab.type = 'button'
        tab.id = 'slotTab' + index
        tab.className = 'slot-tab'
        tab.setAttribute('role', 'tab')
        tab.setAttribute('aria-controls', 'slotPanel')
        tab.setAttribute('aria-selected', String(selected))
        tab.tabIndex = selected ? 0 : -1
        tab.textContent = 'TOKEN ' + (index + 1)
        tab.onclick = () => { selectedSlotId = slot.id; renderSlots(slots, data) }
        tab.onkeydown = event => {
          const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
          if (!direction) return
          event.preventDefault()
          const next = (index + direction + slots.length) % slots.length
          selectedSlotId = slots[next].id
          renderSlots(slots, data)
          $('slotTab' + next).focus()
        }
        tabs.append(tab)
      })
      tabBar.append(tabs)
      const selectedIndex = Math.max(0, slots.findIndex(slot => slot.id === selectedSlotId))
      list.replaceChildren(tabBar, createSlotPanel(slots[selectedIndex], selectedIndex, data))
    }
    function renderBilling(data) {
      billingMe=data;$('billingBalance').textContent=money(data.balance)
      renderAccountHomeState(data)
      setFeatureStatusSlots(data.slots, data.ownerId, !linkedLoadPending)
      updateDepositButton()
      $('depositMessage').textContent=[data.payments.sepay?'':'Chuyển khoản chưa cấu hình.',data.payments.card2k?'':'Thẻ cào chưa cấu hình.'].filter(Boolean).join(' ')
      renderPlanOffers(data)
      const freeOnly = data.slots.length>0 && data.slots.every(slot => slot.free)
      setFreeFeatureGates(freeOnly)
      for (const page of hidden) document.querySelectorAll('[data-page="' + page + '"]').forEach(tab => { tab.hidden = freeOnly })
      if (freeOnly && hidden.some(page => $('page-' + page).classList.contains('active'))) showPage('main')
      if (!adminMode) setConfigSlots(data.slots)
      else if (selectedAdminAccount?.id === data.ownerId) {
        selectedAdminAccount = {...selectedAdminAccount, balance:data.balance, slotLimit:data.slotLimit, slots:data.slots.map((slot,index)=>({...slot,index,bound:Boolean(slot.tokenUserId||slot.tokenUsername)}))}
        setConfigSlots(data.slots, data.ownerId)
        if (adminTokenBoxSync) adminTokenBoxSync()
      }
      const slotTokenDraft = [...document.querySelectorAll('#slotList input[id^="slotTokenInput"]')].some(input => input === document.activeElement || input.value)
      if (!slotTokenDraft) renderSlots(data.slots, data)
      renderTopups(data.topups||[])
    }
    let billingLoadSequence = 0
    async function loadBilling(){const sequence=++billingLoadSequence;try{const ownerId=billingOwnerId(),query=ownerId?'?'+new URLSearchParams({ownerId}).toString():'';const data=await billingRequest('/api/billing'+query);if(sequence!==billingLoadSequence||(adminMode&&ownerId!==billingOwnerId()))return null;renderBilling(data);if(adminMode&&typeof me!=='undefined'&&me?.admin)void loadAdminBilling();return data}catch{return null}}
    let dashboardToastTimer
    let dashboardToastArmed = false
    document.addEventListener('click', () => { dashboardToastArmed = true }, {capture: true})
    document.addEventListener('input', () => { dashboardToastArmed = true }, {capture: true})
    const dashboardToast = document.createElement('div')
    dashboardToast.className = 'dashboard-toast'
    dashboardToast.setAttribute('role', 'status')
    dashboardToast.setAttribute('aria-live', 'polite')
    document.body.append(dashboardToast)
    function showDashboardToast(message) {
      if (!message) return
      clearTimeout(dashboardToastTimer)
      dashboardToast.textContent = message
      dashboardToast.style.animation = 'none'
      void dashboardToast.offsetWidth
      dashboardToast.style.animation = ''
      dashboardToastTimer = setTimeout(() => { dashboardToast.textContent = '' }, 6000)
    }
    function showActionMessage(source) {
      showDashboardToast(source.textContent.trim())
      source.textContent = ''
    }
    for (const id of ['billingStatus', 'depositMessage', 'streamMessage', 'adminBillingMessage', 'owoMessage', 'questMessage']) {
      const source = $(id)
      new MutationObserver(() => {
        if (!dashboardToastArmed || !source.closest('.page.active') || (id === 'questMessage' && source.dataset.state === 'unavailable')) return
        showDashboardToast(source.textContent.trim())
      }).observe(source, {childList: true, characterData: true, subtree: true})
    }
    let streamState = null
    function setStreamMessage(message) { $('streamMessage').textContent = message }
    async function loadStream() {
      try {
        const ownerId=billingOwnerId(),query=ownerId?'?'+new URLSearchParams({ownerId}).toString():''
        const data=await billingRequest('/api/stream'+query)
        if(adminMode&&ownerId!==billingOwnerId())return null
        streamState=data
        setFeatureState('stream', data.configured ? (data.disabled ? 'disabled' : 'enabled') : 'missing')
        $('streamController').value=data.controllerUsername
        $('streamPrefix').value=data.prefix||'n!'
        $('streamTokenUsername').value=data.tokenUsername||'Chưa có token'
        $('streamEligibility').textContent=data.allowed?'Đang có '+data.activeSlots+' slot còn hạn.':'Cần ít nhất một slot còn hạn để dùng Stream.'
        $('streamToken').placeholder=data.tokenSet?'Để trống để giữ token hiện tại':'Dán token Stream'
        $('streamSave').disabled=!data.allowed
        $('streamToggle').disabled=!data.allowed||!data.configured
        $('streamToggle').textContent=data.disabled?'Bật chức năng':'Tắt chức năng'
        $('streamToggle').dataset.state=data.disabled?'disabled':'enabled'
        setStreamMessage(data.error||'')
        return data
      } catch(error) {
        streamState=null
        setFeatureState('stream', 'loading')
        $('streamSave').disabled=true
        $('streamToggle').disabled=true
        delete $('streamToggle').dataset.state
        setStreamMessage(error instanceof Error?error.message:'Không tải được Stream.')
        return null
      }
    }
    $('streamSave').onclick=async()=>{
      $('streamSave').disabled=true;setStreamMessage('Đang lưu...')
      try{
        const ownerId=billingOwnerId(),token=$('streamToken').value.trim(),prefix=$('streamPrefix').value.trim()
        await billingRequest('/api/stream',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...(ownerId?{ownerId}:{}),token,prefix})})
        $('streamToken').value='';await loadStream();setStreamMessage('Đã lưu Stream.')
      }catch(error){setStreamMessage(error instanceof Error?error.message:'Không lưu được Stream.');$('streamSave').disabled=!streamState?.allowed}
    }
    $('streamToggle').onclick=async()=>{
      $('streamToggle').disabled=true;setStreamMessage('Đang cập nhật...')
      try{const ownerId=billingOwnerId();await billingRequest('/api/stream/toggle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(ownerId?{ownerId}:{})});await loadStream();setStreamMessage(streamState?.disabled?'Đã tắt Stream.':'Đã bật Stream.')}
      catch(error){setStreamMessage(error instanceof Error?error.message:'Không cập nhật được Stream.');$('streamToggle').disabled=!streamState?.allowed||!streamState?.configured}
    }
    let planPurchasePending=false
    function renderPlanOffers(data) {
      const active=data.plan?.expiresAt>Date.now(),current=data.plans?.find(plan=>plan.id===data.plan?.id)
      const freeActive=!active&&data.slots.some(slot=>slot.free)
      const legacy=data.slots.filter(slot=>slot.legacy).length
      $('planSummary').textContent=data.guest?'':active?current.name+' đến '+questDate(data.plan.expiresAt)+'. Nâng cấp/gia hạn cộng thêm 30 ngày vào hạn hiện tại.':data.plan?'Gói trả phí đã hết hạn, hiện dùng Free. Các config cũ được giữ lại.':'Mỗi account dùng một gói. Mua gói để mở toàn bộ công cụ.'
      if(legacy)$('planSummary').textContent+=' '+legacy+' token legacy giữ hạn riêng, tự xóa khi hết hạn.'
      if(active&&data.planNotice!==null)$('planSummary').textContent+=' Còn tối đa '+data.planNotice+' ngày. Vui lòng gia hạn.'
      const freePlan={id:'free',name:'Free',price:0,slots:1,configs:0}
      $('planOffers').replaceChildren(...[freePlan,...(data.plans||[])].map((plan,index)=>{
        const isFree=plan.id==='free',isCurrent=isFree?freeActive:active&&current?.id===plan.id
        const card=document.createElement('article');card.className='plan-card';card.dataset.planId=plan.id
        if(isCurrent)card.dataset.current='true'
        const core=document.createElement('div');core.className='plan-card-core'
        const heading=document.createElement('header');heading.className='plan-card-heading'
        const title=document.createElement('div')
        const kicker=document.createElement('small');kicker.textContent=isFree?'GÓI FREE':'GÓI '+String(index).padStart(2,'0')
        const name=document.createElement('h2');name.textContent=plan.name
        title.append(kicker,name);heading.append(title)
        if(!isFree&&isCurrent){const badge=document.createElement('span');badge.textContent='Đang sử dụng';heading.append(badge)}
        const price=document.createElement('div');price.className='plan-card-price';price.textContent=isFree?'Miễn phí':money(plan.price)+' / 30 ngày'
        const benefits=document.createElement('div');benefits.className='plan-card-benefits'
        const benefitsTitle=document.createElement('small');benefitsTitle.textContent='Quyền lợi'
        const benefitsList=document.createElement('ul');const benefitsItems=isFree?['Auto Quest thủ công mỗi 5 giờ','1 token']:['Toàn bộ công cụ',String(plan.slots)+' token · '+String(plan.configs)+' scene/token','Tối đa '+String(plan.statuses)+' status','Multi Voice/Chat: '+String(plan.poolTokens)+' token','Kho ảnh: '+String(plan.mediaMb||10)+' MB'];benefitsList.replaceChildren(...benefitsItems.map(value=>{const item=document.createElement('li');item.textContent=value;return item}));benefits.append(benefitsTitle,benefitsList)
        core.append(heading,benefits,price)
        const actions=document.createElement('div');actions.className='plan-card-actions'
        if(isFree){
          const button=document.createElement('button');button.type='button'
          if(data.guest){button.textContent='Liên kết Discord để nhận';button.onclick=()=>{location.href='/auth/discord'}}
          else{button.textContent=freeActive?'Đang sử dụng':'Không thể sử dụng';button.disabled=true}
          actions.append(button)
        }else{
          const button=document.createElement('button');button.type='button'
          const lower=Boolean(active&&plan.price<current.price)
          if(data.guest){button.textContent='Liên kết Discord để mua';button.onclick=()=>{location.href='/auth/discord'}}
          else if(isCurrent){button.textContent='Gia hạn 30 ngày';button.disabled=planPurchasePending;button.onclick=()=>buyPlan(plan,data)}
          else if(lower){button.textContent='Không thể mua gói thấp hơn';button.disabled=true}
          else{button.textContent='Mua gói';button.disabled=planPurchasePending;button.onclick=()=>buyPlan(plan,data)}
          actions.append(button)
        }
        core.append(actions)
        card.append(core)
        return card
      }))
    }
    function choosePlanPaymentMethod(plan,data) {
      return new Promise(resolve=>{
        let dialog=document.getElementById('planPaymentDialog')
        if(!dialog){
          dialog=document.createElement('dialog');dialog.id='planPaymentDialog';dialog.className='plan-payment-dialog'
          dialog.innerHTML='<form method="dialog" class="plan-payment-box"><header><small>PHƯƠNG THỨC THANH TOÁN</small><h2>Chọn cách mua gói</h2></header><p class="plan-payment-copy"><span class="plan-payment-plan-name"></span><strong class="plan-payment-plan-price"></strong></p><div class="plan-payment-wallet"><small>Số dư ví hiện tại</small><strong class="plan-payment-wallet-balance"></strong></div><div class="plan-payment-methods"><button type="button" data-plan-payment-method="wallet"><span><strong>Số dư ví</strong><small>Thanh toán từ số dư hiện có</small></span><b class="plan-payment-wallet-state"></b></button><button type="button" data-plan-payment-method="qr"><span><strong>Bank QR</strong><small>Chuyển khoản trực tiếp qua ngân hàng</small></span><b>↗</b></button></div><button type="button" class="plan-payment-cancel">Huỷ</button></form>'
          document.body.append(dialog)
        }
        dialog.querySelector('.plan-payment-plan-name').textContent=plan.name
        dialog.querySelector('.plan-payment-plan-price').textContent=money(plan.price)
        dialog.querySelector('.plan-payment-wallet-balance').textContent=money(data.balance)
        const wallet=dialog.querySelector('[data-plan-payment-method="wallet"]'),qr=dialog.querySelector('[data-plan-payment-method="qr"]')
        wallet.disabled=!Number.isSafeInteger(data.balance)||data.balance<plan.price
        qr.disabled=!data.payments?.sepay
        dialog.querySelector('.plan-payment-wallet-state').textContent=wallet.disabled?'Thiếu '+money(Math.max(0,plan.price-(Number(data.balance)||0))):'Đủ tiền'
        let settled=false
        const finish=value=>{if(settled)return;settled=true;dialog.oncancel=null;dialog.onclick=null;if(dialog.open)dialog.close();resolve(value)}
        wallet.onclick=()=>finish('wallet');qr.onclick=()=>finish('qr');dialog.querySelector('.plan-payment-cancel').onclick=()=>finish(null)
        dialog.onclick=event=>{if(event.target===dialog)finish(null)}
        dialog.oncancel=event=>{event.preventDefault();finish(null)}
        dialog.showModal()
      })
    }
    async function buyPlan(plan,data) {
      if(planPurchasePending)return
      const pending=data.topups?.find(item=>(item.type==='plan'||item.purpose==='plan')&&item.status==='pending'&&item.planId!==plan.id)
      if(pending){const pendingPlan=data.plans?.find(item=>item.id===pending.planId);$('billingStatus').textContent=pendingPlan?'Đang có giao dịch mua '+pendingPlan.name.toLowerCase()+' chưa thanh toán.':'Account đang có giao dịch QR chờ xác nhận.';return}
      const method=await choosePlanPaymentMethod(plan,data)
      if(!method)return
      if(method==='qr')showPaymentLoading(plan)
      const wallet=method==='wallet'
      if(wallet&&(!Number.isSafeInteger(data.balance)||data.balance<plan.price)){$('billingStatus').textContent='Số dư không đủ. Chọn QR ngân hàng để nạp thẳng.';return}
      planPurchasePending=true;renderPlanOffers(data)
      const key='plan-order:'+data.ownerId+':'+data.planVersion+':'+plan.id
      let requestId=sessionStorage.getItem(key)||crypto.randomUUID();sessionStorage.setItem(key,requestId)
      try{
        let response,result
        for(let attempt=0;attempt<2;attempt++){
          response=await fetch(wallet?'/api/billing/buy':'/api/billing/plan-payment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ownerId:data.ownerId,planId:plan.id,version:data.planVersion,requestId})})
          result=await response.json()
          if(!wallet&&response.status===409&&result.retry===true&&attempt===0){sessionStorage.removeItem(key);requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId);continue}
          break
        }
        if(!response.ok){if(response.status<500)sessionStorage.removeItem(key);throw Error(result.error||'Không thể mua gói.')}
        if(wallet){sessionStorage.removeItem(key);await loadBilling();await Promise.all([loadConfigs(),loadQuest(),loadStream()]);$('billingStatus').textContent='Đã thanh toán '+money(plan.price)+'. Gói mới đã được áp dụng.'}
        else{await loadBilling();if(paymentPopupCancelled){await cancelPendingPayment(result.payment);sessionStorage.removeItem(key);await loadBilling();$('billingStatus').textContent='Đã hủy giao dịch.'}else{showPaymentPopup(result.payment);$('billingStatus').textContent='Đã tạo QR '+money(plan.price)+'. Chờ SePay xác nhận.'}}
      }catch(error){if(method==='qr'&&$('paymentDialog').open)$('paymentDialog').close();$('billingStatus').textContent=error instanceof Error?error.message:'Không thể xác nhận giao dịch.'}
      finally{planPurchasePending=false;if(billingMe)renderPlanOffers(billingMe)}
    }
    $('cancelTokenUnbind').onclick = () => $('tokenUnbindDialog').close()
    $('confirmTokenUnbind').onclick = async () => {
      const pending = pendingTokenUnbind
      if (!pending) return
      const dialog = $('tokenUnbindDialog')
      $('confirmTokenUnbind').disabled = true
      $('cancelTokenUnbind').disabled = true
      $('tokenUnbindStatus').textContent = 'Đang gỡ token...'
      try {
        await billingRequest('/api/billing/unbind', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({slotId: pending.slotId, ...(pending.ownerId ? {ownerId:pending.ownerId} : {})})})
        dialog.close()
        await loadBilling()
      } catch (error) {
        $('tokenUnbindStatus').textContent = error instanceof Error ? error.message : 'Không thể gỡ token.'
        $('confirmTokenUnbind').disabled = false
        $('cancelTokenUnbind').disabled = false
      }
    }
    $('tokenUnbindDialog').addEventListener('cancel', event => {
      if ($('confirmTokenUnbind').disabled) event.preventDefault()
    })
    $('tokenUnbindDialog').addEventListener('close', () => {
      pendingTokenUnbind = null
      $('tokenUnbindStatus').textContent = ''
    })
    $('tokenUnbindDialog').addEventListener('click', event => {
      const dialog = event.currentTarget
      if (event.target !== dialog || $('confirmTokenUnbind').disabled) return
      const rect = dialog.getBoundingClientRect()
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
      if (outside) dialog.close()
    })
    let paymentCountdownTimer, paymentPollTimer
    function stopPaymentWatch(){clearInterval(paymentCountdownTimer);clearInterval(paymentPollTimer)}
    const depositTabs=[$('depositBankTab'),$('depositCardTab')]
    function selectDepositTab(tab){const bank=tab===$('depositBankTab');$('depositBankTab').setAttribute('aria-selected',String(bank));$('depositCardTab').setAttribute('aria-selected',String(!bank));$('depositBankTab').tabIndex=bank?0:-1;$('depositCardTab').tabIndex=bank?-1:0;$('depositBankPanel').hidden=!bank;$('depositCardPanel').hidden=bank;$('depositMaxValue').textContent=bank?'Không giới hạn':'1.000.000 VND'}
    depositTabs.forEach((tab,index)=>{tab.onclick=()=>selectDepositTab(tab);tab.onkeydown=event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();const next=depositTabs[index?0:1];selectDepositTab(next);next.focus()}})
    const topupLabels={pending:'Chờ thanh toán',paid:'Thành công',expired:'Đã hết hạn',failed:'Thất bại',debit:'Đã trừ'}
    function renderTopups(items){const list=$('topupList');if(!items.length){list.innerHTML='<div class="empty-state">Chưa có giao dịch.</div>';return}list.replaceChildren(...items.map(item=>{const row=document.createElement('article');row.className='topup-item';const info=document.createElement('div');const title=document.createElement('strong'),provider=item.type==='plan'?'Mua gói':item.provider==='card2k'?'Thẻ cào':item.provider==='sepay'?'Chuyển khoản':'';title.textContent=(provider?provider+' · ':'')+money(item.amount)+' · '+item.invoice;const time=document.createElement('p');time.textContent=new Date(item.createdAt).toLocaleString('vi-VN')+(item.cardTelco?' · '+item.cardTelco+' '+item.cardSerial:'')+(item.providerMessage?' · '+item.providerMessage:'');info.append(title,time);const actions=document.createElement('div');actions.className='topup-actions';const status=document.createElement('span');status.className='topup-status '+item.status;status.textContent=item.providerMessage==='Đã hủy bởi người dùng.'?'Đã hủy':topupLabels[item.status]||item.status;actions.append(status);if(item.status==='pending'){const cancel=document.createElement('button');cancel.className='history-cancel';cancel.textContent='Hủy';cancel.onclick=()=>cancelHistoryPayment(item,cancel);actions.prepend(cancel);if(item.provider==='sepay'){const open=document.createElement('button');open.className='history-open';open.textContent='Mở thanh toán';open.onclick=()=>showPaymentPopup(item);actions.prepend(open)}}row.append(info,actions);return row}))}
    function depositAmount(){return Number($('depositAmount').value.replace(/\D/g,''))}
    function selectedCardFee(){const telco=$('cardTelco').value,amount=Number($('cardAmount').value);return cardFees?.find(item=>item.telco===telco&&item.value===amount)||null}
    function renderCardReceive(){const box=$('cardReceive'),fee=selectedCardFee();if(cardFees===null){box.querySelector('b').textContent='Đang tải bảng phí';box.querySelector('small').textContent='';return}if(!fee){box.querySelector('b').textContent='Không hỗ trợ mệnh giá này';box.querySelector('small').textContent='';return}box.querySelector('b').textContent=money(fee.receive);box.querySelector('small').textContent='Phí '+Number(fee.fees).toLocaleString('vi-VN')+'%'}
    function updateDepositButton(){$('depositSepay').disabled=!(billingMe?.payments?.sepay)||!Number.isSafeInteger(depositAmount())||depositAmount()<10000;$('depositCard').disabled=!(billingMe?.payments?.card2k)||!selectedCardFee()||!$('cardSerial').value.trim()||!$('cardCode').value.trim()}
    function forgetPlanPayment(payment){const ownerId=billingOwnerId()||billingMe?.ownerId||payment?.userId;if(!ownerId||!payment||(payment.purpose!=='plan'&&payment.type!=='plan')||typeof payment.planId!=='string'||!Number.isSafeInteger(Number(payment.planVersion)))return;sessionStorage.removeItem('plan-order:'+ownerId+':'+Number(payment.planVersion)+':'+payment.planId)}
    async function cancelPendingPayment(payment){const ownerId=billingOwnerId()||billingMe?.ownerId||'';return billingRequest('/api/billing/payment/cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:payment.id,...(ownerId?{ownerId}:{})})})}
    async function cancelHistoryPayment(payment,button){button.disabled=true;button.textContent='Đang hủy';try{await cancelPendingPayment(payment);forgetPlanPayment(payment);await loadBilling();$('depositMessage').textContent='Đã hủy giao dịch.'}catch(error){button.disabled=false;button.textContent='Hủy';$('depositMessage').textContent=error instanceof Error?error.message:'Không thể hủy giao dịch.'}}
    function showPaymentLoading(plan){
      const dialog=$('paymentDialog')
      stopPaymentWatch();activePayment=null;paymentPopupCancelled=false;dialog.classList.remove('expired');dialog.classList.add('loading')
      $('paymentSummary').textContent='Đang khởi tạo giao dịch '+plan.name+'.'
      $('paymentLoading').hidden=false;$('paymentQr').hidden=true;$('paymentQr').removeAttribute('src');$('paymentDetails').hidden=true;$('paymentCountdown').closest('.countdown').hidden=true;$('paymentStatus').textContent='Đang tạo mã QR ngân hàng.'
      if(!dialog.open)dialog.showModal()
    }
    function showPaymentPopup(payment){
      const dialog=$('paymentDialog'),expiresAt=Number(payment.expiresAt)
      stopPaymentWatch();activePayment=payment;paymentPopupCancelled=false;dialog.classList.remove('expired','loading')
      const planPayment=payment.purpose==='plan'||payment.type==='plan'
      $('paymentSummary').textContent=planPayment?'Chuyển khoản đúng số tiền và nội dung. Gói chỉ kích hoạt sau khi SePay xác nhận.':'Chuyển khoản đúng thông tin bên dưới.'
      $('paymentLoading').hidden=true;$('paymentQr').hidden=false;$('paymentQr').src=payment.qrImage;$('paymentDetails').hidden=false;$('paymentCountdown').closest('.countdown').hidden=false
      $('paymentAmount').textContent=money(payment.amount)
      $('paymentInvoice').textContent=payment.invoice
      $('paymentStatus').textContent='Chờ xác nhận giao dịch.'
      if(!dialog.open)dialog.showModal()
      const updateCountdown=()=>{const seconds=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));$('paymentCountdown').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');if(!seconds){clearInterval(paymentCountdownTimer);if(planPayment)forgetPlanPayment(payment);dialog.classList.add('expired');$('paymentStatus').textContent='Mã QR đã hết hạn.'}}
      updateCountdown();paymentCountdownTimer=setInterval(updateCountdown,1000)
      paymentPollTimer=setInterval(async()=>{const data=await loadBilling(),current=data?.topups?.find(item=>item.id===payment.id);if(current?.status==='paid'){stopPaymentWatch();dialog.close();if(planPayment){await Promise.all([loadConfigs(),loadQuest(),loadStream()]);$('billingStatus').textContent='Đã xác nhận '+money(payment.amount)+'. Gói mới đã được áp dụng.'}else $('depositMessage').textContent='Đã cộng '+money(payment.amount)+' vào số dư.'}else if(current?.status==='expired'){if(planPayment)sessionStorage.removeItem('plan-order:'+data.ownerId+':'+current.planVersion+':'+current.planId);dialog.classList.add('expired');$('paymentStatus').textContent='Giao dịch đã hết hạn.'}else if(current?.status==='failed'){stopPaymentWatch();dialog.close();$('depositMessage').textContent='Giao dịch thất bại.'}else if(current?.providerMessage)$('paymentStatus').textContent=current.providerMessage},5000)
    }
    async function deposit(){
      const amount=depositAmount()
      if(!Number.isSafeInteger(amount)||amount<10000){$('depositMessage').textContent='Số tiền nạp tối thiểu 10.000đ.';return}
      $('depositSepay').disabled=true;$('depositMessage').textContent='Đang tạo mã QR.'
      showPaymentLoading({name:'nạp '+money(amount)})
      try{const ownerId=billingOwnerId()||billingMe?.ownerId||'';const result=await billingRequest('/api/billing/deposit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({amount,...(ownerId?{ownerId}:{})})});$('depositMessage').textContent='';$('depositAmount').value='';if(paymentPopupCancelled){await cancelPendingPayment(result.payment);$('depositMessage').textContent='Đã hủy giao dịch.'}else showPaymentPopup(result.payment);await loadBilling()}catch(error){if($('paymentDialog').open)$('paymentDialog').close();$('depositMessage').textContent=error.message}finally{updateDepositButton()}
    }
    $('depositSepay').onclick=deposit
    $('depositAmount').addEventListener('input',()=>{const digits=$('depositAmount').value.replace(/\D/g,'');$('depositAmount').value=digits?Number(digits).toLocaleString('vi-VN'):'';updateDepositButton()})
    function updateCardAmounts(){const telco=$('cardTelco').value,available=cardFees?.filter(item=>item.telco===telco).map(item=>item.value);for(const option of $('cardAmount').options){const unsupported=available?!available.includes(Number(option.value)):telco==='GARENA2'&&![20000,50000,100000,200000,500000].includes(Number(option.value));option.hidden=unsupported;option.disabled=unsupported}if($('cardAmount').selectedOptions[0]?.disabled){const first=[...$('cardAmount').options].find(option=>!option.disabled);if(first)$('cardAmount').value=first.value}renderCardReceive()}
    async function loadCardFees(){try{const result=await billingRequest('/api/billing/card2k/fees');cardFees=Array.isArray(result.fees)?result.fees:[]}catch{cardFees=[]}updateCardAmounts();updateDepositButton()}
    async function depositCard(){const amount=Number($('cardAmount').value),telco=$('cardTelco').value,serial=$('cardSerial').value.trim(),code=$('cardCode').value.trim();$('depositCard').disabled=true;$('depositMessage').textContent='Đang gửi thẻ.';try{const ownerId=billingOwnerId()||billingMe?.ownerId||'',result=await billingRequest('/api/billing/card2k',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({telco,amount,serial,code,...(ownerId?{ownerId}:{})})});$('cardSerial').value='';$('cardCode').value='';$('depositMessage').textContent=result.payment.status==='paid'?'Thẻ thành công. Số dư đã được cộng.':result.payment.status==='pending'?'Thẻ đang chờ xử lý.':'Thẻ thất bại: '+(result.payment.providerMessage||'Không rõ lý do.');await loadBilling()}catch(error){$('depositMessage').textContent=error instanceof Error?error.message:'Không gửi được thẻ.'}finally{updateDepositButton()}}
    $('depositCard').onclick=depositCard
    $('cardTelco').onchange=()=>{updateCardAmounts();updateDepositButton()}
    $('cardAmount').onchange=()=>{renderCardReceive();updateDepositButton()}
    $('cardSerial').addEventListener('input',updateDepositButton)
    $('cardCode').addEventListener('input',updateDepositButton)
    updateCardAmounts()
    $('closePaymentDialog').onclick=()=>{if($('paymentDialog').classList.contains('loading'))paymentPopupCancelled=true;$('paymentDialog').close()}
    $('cancelPaymentDialog').onclick=async()=>{const dialog=$('paymentDialog');if(dialog.classList.contains('loading')){paymentPopupCancelled=true;dialog.close();return}if(!activePayment){dialog.close();return}const button=$('cancelPaymentDialog');button.disabled=true;try{await cancelPendingPayment(activePayment);forgetPlanPayment(activePayment);activePayment=null;dialog.close();await loadBilling();$('depositMessage').textContent='Đã hủy giao dịch.';$('billingStatus').textContent='Đã hủy giao dịch.'}catch(error){$('paymentStatus').textContent=error instanceof Error?error.message:'Không thể hủy giao dịch.'}finally{button.disabled=false}}
    $('paymentDialog').addEventListener('close',stopPaymentWatch)
    const adminDateValue = value => {
      if (!Number.isFinite(value)) return ''
      const date = new Date(value)
      return new Date(value - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    }
    const adminDateMillis = value => value ? new Date(value).getTime() : null
    const adminFmtDate = value => new Date(value).toLocaleString('vi-VN', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})
    function selectedAdminUser() { return adminBillingState?.users?.find(user => user.id === $('adminBillingUser').value) }
    function renderAdminMetrics() {
      const users = adminBillingState?.users || [], now = Date.now()
      $('adminMetricUsers').textContent = String(users.length)
      $('adminMetricInvalid').textContent = String(users.reduce((count,user)=>count+user.slots.filter(slot=>slot.tokenState==='invalid').length,0))
      $('adminMetricExpiring').textContent = String(users.filter(user=>user.slots.some(slot=>slot.active&&slot.expiresAt-now<7*86400000)).length)
      $('adminMetricLocked').textContent = String(users.filter(user=>user.disabled).length)
    }
    function billingOwnerId() { if(!adminMode)return ''; return selectedAdminAccount?.id || linkedOwnerId || '' }
    function adminMessage(message) { $('adminBillingMessage').textContent = message }
    async function updateAdminBilling(payload, message) {
      try {
        const data = await billingRequest('/api/admin/billing', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
        renderAdminBilling(data)
        adminMessage(message)
        await loadBilling()
      } catch (error) { adminMessage(error instanceof Error ? error.message : 'Không thể lưu.') }
    }
    function renderAdminSlots(user) {
      const list = $('adminSlotDates')
      if (!user?.slots?.length) { list.replaceChildren(Object.assign(document.createElement('div'), {className:'empty-state', textContent:'Account chưa có token.'})); return }
      const fmt = value => new Date(value).toLocaleString('vi-VN', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})
      list.replaceChildren(...user.slots.map(slot => {
        const row = document.createElement('article')
        row.className = 'admin-slot-editor'
        const main = document.createElement('div')
        main.className = 'admin-slot-main'
        const title = document.createElement('strong')
        title.textContent = 'Token ' + (slot.index + 1)
        const expiry = document.createElement('span')
        expiry.dataset.state = slot.active ? 'active' : 'expired'
        expiry.textContent = slot.active ? 'Còn hạn' : 'Hết hạn'
        const token = document.createElement('span')
        token.dataset.state = slot.tokenState === 'active' ? 'linked' : 'unbound'
        token.textContent = slot.tokenState === 'active' ? (slot.tokenUsername || 'Đã gắn token') : slot.tokenState === 'invalid' ? 'Token hết hiệu lực' : slot.tokenState === 'expired' ? 'Token hết hạn' : 'Chưa gắn token'
        const until = document.createElement('span')
        until.className = 'admin-slot-until'
        until.textContent = slot.free ? 'Free · Không thời hạn' : 'Đến ' + fmt(slot.expiresAt)
        const pick = document.createElement('input')
        pick.type = 'checkbox'
        pick.checked = adminSelectedSlots.has(slot.id)
        pick.title = 'Chọn token'
        pick.onchange = () => { pick.checked ? adminSelectedSlots.add(slot.id) : adminSelectedSlots.delete(slot.id); updateBulkCount() }
        const quick = document.createElement('div')
        quick.className = 'admin-slot-quick'
        const days = document.createElement('input')
        days.type = 'number'; days.min = '1'; days.max = '3650'; days.value = '30'; days.title = 'Số ngày cộng'
        const add = document.createElement('button')
        add.textContent = '+ Ngày'
        add.onclick = () => {
          const addDays = Number(days.value)
          if (!Number.isSafeInteger(addDays) || addDays < 1 || addDays > 3650) { adminMessage('Số ngày cộng phải từ 1 đến 3650.'); return }
          updateAdminBilling({userId:user.id,slotId:slot.id,addDays}, 'Đã cộng ' + addDays + ' ngày cho token ' + (slot.index + 1) + '.')
        }
        if(slot.free||slot.legacy||user.plan){
          main.append(title, expiry, token, until)
          row.append(main)
          return row
        }
        quick.append(days, add)
        main.append(pick, title, expiry, token, until, quick)
        const edit = document.createElement('details')
        edit.className = 'admin-slot-edit'
        const summary = document.createElement('summary')
        summary.textContent = 'Sửa ngày bắt đầu / hết hạn'
        const dates = document.createElement('div')
        dates.className = 'admin-date-fields'
        const startLabel = document.createElement('label')
        startLabel.append(document.createTextNode('Bắt đầu'))
        const start = document.createElement('input')
        start.type = 'datetime-local'
        start.value = adminDateValue(slot.startsAt)
        startLabel.append(start)
        const endLabel = document.createElement('label')
        endLabel.append(document.createTextNode('Hết hạn'))
        const end = document.createElement('input')
        end.type = 'datetime-local'
        end.value = adminDateValue(slot.expiresAt)
        endLabel.append(end)
        const save = document.createElement('button')
        save.textContent = 'Lưu ngày'
        save.onclick = () => {
          const startsAt = adminDateMillis(start.value), expiresAt = adminDateMillis(end.value)
          if (!Number.isFinite(expiresAt)) { adminMessage('Ngày hết hạn không hợp lệ.'); return }
          updateAdminBilling({userId:user.id,slotId:slot.id,startsAt,expiresAt}, 'Đã lưu thời hạn token ' + (slot.index + 1) + '.')
        }
        dates.append(startLabel, endLabel, save)
        edit.append(summary, dates)
        row.append(main, edit)
        return row
      }))
    }
    function renderAdminSelectedUser() {
      const user = selectedAdminUser()
      $('adminUserSummary').textContent = user ? user.username + ' · ' + user.id + ' · ' + money(user.balance) + ' · ' + user.slots.length + ' token' : 'Không có account.'
      $('adminAddCredit').disabled = !user
      $('adminDebitBtn').disabled = !user
      $('adminPlanId').value = user?.plan?.id || 'pluna'
      $('adminChangePlan').disabled = !user
      $('adminBulkBar').hidden = !user?.slots?.some(slot=>!slot.free&&!slot.legacy&&!user.plan)
      updateBulkCount()
      renderAdminSlots(user)
      renderAdminPayments()
      renderAdminOverview()
    }
    function renderAdminBilling(data) {
      adminBillingState = data
      const select = $('adminBillingUser'),previous = select.value
      select.replaceChildren(...data.users.map(user => { const option=document.createElement('option');option.value=user.id;option.textContent=user.username+' · '+user.id;return option }))
      const preferred = data.users.find(user => user.id === previous) || data.users.find(user => user.id === currentUserId) || data.users[0]
      select.value = preferred?.id || ''
      renderAdminMetrics()
      renderAdminSelectedUser()
      renderAdminLogs()
    }
    function updateBulkCount() { $('adminBulkCount').textContent = adminSelectedSlots.size ? adminSelectedSlots.size + ' token đã chọn' : '' }
    function renderAdminOverview() {
      const box = $('adminOverview'), users = adminBillingState?.users || [], now = Date.now()
      const list = users.filter(user => {
        if (adminFilterQuery && !user.username.toLowerCase().includes(adminFilterQuery)) return false
        if (adminFilterPlan !== 'all' && (adminFilterPlan === 'none' ? user.plan : user.plan?.id !== adminFilterPlan)) return false
        if (adminFilterMode === 'invalid') return user.slots.some(slot => slot.tokenState === 'invalid')
        if (adminFilterMode === 'expiring') return user.slots.some(slot => slot.active && slot.expiresAt - now < 7 * 86400000)
        return true
      })
      if (!list.length) { box.replaceChildren(Object.assign(document.createElement('div'), {className:'empty-state', textContent:'Không có account khớp bộ lọc.'})); return }
      box.replaceChildren(...list.map(user => {
        const row = document.createElement('article')
        row.className = 'admin-overview-row' + (user.id === $('adminBillingUser').value ? ' selected' : '')
        const primary = document.createElement('div')
        primary.className = 'admin-overview-primary'
        const name = document.createElement('strong')
        name.textContent = user.username
        const states = document.createElement('span')
        states.className = 'admin-overview-states'
        const appendState = (className, text) => {
          const badge = document.createElement('span')
          badge.className = 'admin-overview-badge ' + className
          badge.textContent = text
          states.append(badge)
        }
        if (user.slots.some(slot => slot.tokenState === 'invalid')) appendState('bad', 'Token lỗi')
        if (user.slots.some(slot => slot.active && slot.expiresAt - now < 7 * 86400000)) appendState('warn', 'Sắp hết hạn')
        if (!states.childElementCount) appendState('good', 'Ổn định')
        appendState('plan', user.plan?.name || 'Free')
        primary.append(name, states)

        const meta = document.createElement('div')
        meta.className = 'admin-overview-meta'
        const active = user.slots.filter(slot => slot.tokenState === 'active').length
        for (const [label, value] of [['Số dư', money(user.balance)], ['Token', String(user.slots.length)], ['Đã gắn', String(active)]]) {
          const item = document.createElement('span')
          item.append(Object.assign(document.createElement('small'), {textContent:label}), document.createTextNode(value))
          meta.append(item)
        }
        const dates = user.slots.filter(slot => slot.active).map(slot => slot.expiresAt)
        const expiry = document.createElement('small')
        expiry.className = 'admin-overview-expiry'
        expiry.textContent = dates.length ? 'Gần nhất · ' + adminFmtDate(Math.min(...dates)) : 'Chưa có thời hạn hoạt động'
        row.append(primary, meta, expiry)
        row.onclick = () => { if ($('adminBillingUser').value !== user.id) { $('adminBillingUser').value = user.id; renderAdminSelectedUser() } if (adminAccountSwitch) adminAccountSwitch(user.id) }
        return row
      }))
    }
    function renderAdminPayments() {
      const box = $('adminPayments'), user = selectedAdminUser()
      const list = (adminBillingState?.payments || []).filter(p => p.userId === user?.id).slice().reverse()
      if (!user || !list.length) { box.replaceChildren(Object.assign(document.createElement('div'), {className:'empty-state', textContent: user ? 'Chưa có giao dịch.' : 'Chưa chọn account.'})); return }
      const head = document.createElement('div'); head.className = 'admin-history-row admin-history-head'
      for (const label of ['Thời gian','Số tiền','Trạng thái','Mã GD','Ref']) head.append(Object.assign(document.createElement('span'), {textContent: label}))
      box.replaceChildren(head, ...list.map(p => {
        const row = document.createElement('div'); row.className = 'admin-history-row'
        const at = document.createElement('span'); at.textContent = adminFmtDate(p.createdAt || p.expiresAt)
        const amount = document.createElement('span'); amount.textContent = money(p.amount)
        const st = document.createElement('span'); st.textContent = p.status === 'paid' ? 'Đã thanh toán' : p.status === 'pending' ? 'Chờ xử lý' : p.status === 'expired' ? 'Hết hạn' : 'Thất bại'
        const inv = document.createElement('span'); inv.textContent = p.invoice
        const ref = document.createElement('span'); ref.textContent = p.reference || ''
        row.append(at, amount, st, inv, ref)
        return row
      }))
    }
    function renderAdminLogs() {
      const box = $('adminLogs'), logs = adminBillingState?.logs || []
      if (!logs.length) { box.replaceChildren(Object.assign(document.createElement('div'), {className:'empty-state', textContent:'Chưa có log.'})); return }
      const head = document.createElement('div'); head.className = 'admin-history-row admin-history-head'
      for (const label of ['Thời gian','Người thao tác','Hành động','Account','Chi tiết']) head.append(Object.assign(document.createElement('span'), {textContent: label}))
      box.replaceChildren(head, ...logs.map(log => {
        const row = document.createElement('div'); row.className = 'admin-history-row'
        const at = document.createElement('span'); at.textContent = adminFmtDate(log.at)
        const actor = document.createElement('span'); actor.textContent = log.actor
        const action = document.createElement('span'); action.textContent = log.action
        const target = document.createElement('span'); target.textContent = log.targetUser || ''
        const detail = document.createElement('span'); detail.textContent = log.detail || ''
        row.append(at, actor, action, target, detail)
        return row
      }))
    }
    async function loadAdminBilling() {
      try { const data=await billingRequest('/api/admin/billing'); renderAdminBilling(data); return data }
      catch (error) { adminMessage(error instanceof Error ? error.message : 'Không thể tải quản trị billing.'); return null }
    }
    $('adminBillingUser').onchange = () => {
      renderAdminSelectedUser()
      if (adminAccountSwitch && adminAccountSwitch($('adminBillingUser').value) === false) return
    }
    $('adminAddCredit').onclick=()=>{const user=selectedAdminUser();if(user)updateAdminBilling({userId:user.id,credit:Number($('adminCredit').value)},'Đã cộng tiền.')}
    $('adminDebitBtn').onclick=()=>{const user=selectedAdminUser();if(user)updateAdminBilling({userId:user.id,debit:Number($('adminDebitAmount').value)},'Đã trừ tiền.')};
    $('adminChangePlan').onclick=()=>{const user=selectedAdminUser();if(user)updateAdminBilling({userId:user.id,planId:$('adminPlanId').value},'Đã đổi gói.')}
    $('adminBulkExtend').onclick=()=>{const user=selectedAdminUser();if(!user)return;const ids=user.slots.filter(s=>adminSelectedSlots.has(s.id)).map(s=>s.id);if(!ids.length){adminMessage('Chọn ít nhất 1 token.');return}const days=Number($('adminBulkDays').value);if(!Number.isSafeInteger(days)||days<1||days>3650){adminMessage('Số ngày cộng phải từ 1 đến 3650.');return}updateAdminBilling({userId:user.id,slotIds:ids,addDays:days},'Đã cộng '+days+' ngày cho '+ids.length+' token.')}
    $('adminPlanFilter').onchange=()=>{adminFilterPlan=$('adminPlanFilter').value;renderAdminOverview()}
    $('adminCheckAll').onchange=()=>{const user=selectedAdminUser();if(!user)return;const on=$('adminCheckAll').checked;for(const s of user.slots)on?adminSelectedSlots.add(s.id):adminSelectedSlots.delete(s.id);renderAdminSlots(user);updateBulkCount()}
    $('adminSearch').oninput=()=>{adminFilterQuery=$('adminSearch').value.trim().toLowerCase();renderAdminOverview()}
    document.querySelectorAll('[data-admin-filter]').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('[data-admin-filter]').forEach(b=>b.classList.toggle('active',b===btn));adminFilterMode=btn.getAttribute('data-admin-filter')||'all';renderAdminOverview()})
    function logoutButton() {
      const button = document.createElement('button')
      button.className = 'logout'
      button.textContent = 'Đăng xuất'
      button.onclick = async () => { await fetch('/auth/logout', {method: 'POST'}); location.href = '/' }
      return button
    }
    function retryLink(message) {
      const account = $('account')
      const retry = document.createElement('button')
      retry.className = 'logout'
      retry.textContent = 'Thử lại'
      retry.onclick = () => loadLinked()
      account.replaceChildren(document.createTextNode(message + ' '), retry)
    }
    function setFeatureTogglesHidden(hidden) {
      document.querySelectorAll('.feature-toggle').forEach(el => { el.hidden = hidden })
    }
    async function loadLinked() {
      const oauthLinked = new URLSearchParams(location.search).get('oauth') === 'linked'
      linkedLoadPending = true
      try {
        if (new URLSearchParams(location.search).get('oauth') === 'locked') { retryLink('Tài khoản đã bị khóa bởi quản trị.'); return }
        const response = await fetch('/api/me', {credentials: 'same-origin', cache: 'no-store'})
        if (!response.ok) throw new Error('Session verification failed')
        const me = await response.json()
        dashboardAccessReady = true
        if (me.disabled) { retryLink('Tài khoản đã bị khóa bởi quản trị.'); return }
        if (!me.loggedIn) {
          resetFeatureStatuses()
          $('page-main').removeAttribute('data-account-state')
          $('page-main').dataset.authState = 'guest'
          $('homePlanName').textContent = 'Chưa có gói'
          $('homePlanExpiry').textContent = ''
          $('featureSlotNav').hidden = true
          $('homePlanExpiry').hidden = true
          document.querySelectorAll('[data-page="media"]').forEach(tab => { tab.hidden = true })
          $('accountPlanSlots').hidden = true
          $('accountPlanTitle').hidden = true
          $('accountPlanSummary').hidden = true
          $('adminTab').hidden = true
          $('page-admin').hidden = true
          $('planTab').hidden = false
          $('page-plan').hidden = false
          $('accountPlanTitle').hidden = false
          $('accountPlanSummary').hidden = false
          fetch('/api/price', {credentials:'same-origin', cache:'no-store'}).then(response => response.ok ? response.json() : null).then(price => {
            if (price?.plans) renderPlanOffers({guest:true, plans: price.plans, slots: [], balance: 0, payments: {}, plan: null})
          }).catch(() => {})
          $('depositTab').hidden = true
          $('page-deposit').hidden = true
          if ($('page-admin').classList.contains('active') || $('page-plan').classList.contains('active') || $('page-deposit').classList.contains('active') || $('page-media').classList.contains('active')) showPage('main')
          setQuestAvailability(false, 'Đăng nhập để sử dụng Auto Quest.')
          setFeatureTogglesHidden(true); updatePreviewToggle(); if (oauthLinked) retryLink('Không nhận được phiên đăng nhập trên trình duyệt.'); return
        }
        renderAccountHome(me.user)
        $('page-main').dataset.authState = 'authenticated'
        $('homePlanExpiry').hidden = false
        const account = $('account')
        const profile = document.createElement('button')
        profile.type = 'button'
        profile.className = 'account-profile'
        profile.setAttribute('aria-expanded', 'false')
        profile.setAttribute('aria-controls', 'accountMenu')
        if (me.user.avatar) { const avatar = document.createElement('img'); avatar.className = 'account-avatar'; avatar.src = me.user.avatar; avatar.alt = ''; profile.append(avatar) }
        else { const avatar=document.createElement('span'); avatar.className='account-avatar account-avatar-fallback'; avatar.textContent=me.user.username.slice(0,1).toUpperCase(); profile.append(avatar) }
        const name = document.createElement('span')
        name.className = 'account-name'
        name.textContent = me.user.username
        profile.append(name)
        const accountMenu = document.createElement('div')
        accountMenu.id = 'accountMenu'
        accountMenu.className = 'account-menu'
        accountMenu.hidden = true
        profile.onclick = () => { const open = accountMenu.hidden; accountMenu.hidden = !open; profile.setAttribute('aria-expanded', String(open)); if (open && !me.admin) requestAnimationFrame(() => { const panel = account.closest('.mobile-dock-panel'); if (panel) panel.scrollTop = panel.scrollHeight }) }
        account.addEventListener('click', event => event.stopPropagation())
        document.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('.mobile-select-dialog')) return; accountMenu.hidden = true; profile.setAttribute('aria-expanded', 'false') })
        account.replaceChildren(profile, accountMenu)
        if (oauthLinked) history.replaceState(null, '', location.pathname)
        setFeatureTogglesHidden(false)
        questLinked = true
        currentUserId = me.user.id
        adminMode = me.admin
        setVoicepoolAccess(me.admin)
        if (!me.admin && $('page-admin').classList.contains('active')) showPage('main')
        configSlotMode = !me.admin
        $('adminBilling').hidden = !me.admin
        $('adminTab').hidden = !me.admin
        $('page-admin').hidden = !me.admin
        $('planTab').hidden = false
        $('page-plan').hidden = false
        $('depositTab').hidden = false
        $('page-deposit').hidden = false
        $('accountPlanTitle').hidden = false
        $('accountPlanSummary').hidden = false
        if (me.canSwitchRole && me.admin) { const mode=document.createElement('button'); mode.className='account-action'; mode.textContent='Chuyển sang user'; mode.onclick=async()=>{await fetch('/api/session/mode',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'user'})});location.href='/dashboard'}; accountMenu.append(mode) }
        const [billing, adminBilling] = await Promise.all([loadBilling(), me.admin ? loadAdminBilling() : null])

        if (configSlotMode) {
          linkedUser = ''
          if (billing) setConfigSlots(billing.slots || [])
        } else {
          linkedUser = ''
          linkedSlotId = ''
          linkedOwnerId = ''
          configSlots = []
          syncConfigSlotControls()
        }
        if (me.admin) {
          if (adminBilling) {
            const accounts = adminBilling.users || []
            const label = document.createElement('label')
            label.className = 'admin-user'
            label.append(document.createTextNode('Quản lý account'))
            const select = document.createElement('select')
            const tokenBox = document.createElement('form')
            tokenBox.className = 'admin-disabled-token'
            const tokenSlot = document.createElement('select')
            const tokenInput = document.createElement('input')
            tokenInput.type = 'password'; tokenInput.autocomplete = 'off'; tokenInput.placeholder = 'Token Discord mới'
            const tokenButton = document.createElement('button')
            tokenButton.type = 'submit'; tokenButton.textContent = 'Lưu token'
            const tokenStatus = document.createElement('small')
            tokenBox.append(tokenSlot, tokenInput, tokenButton, tokenStatus)
            function tokenTarget() {
              const slot = selectedAdminAccount?.slots?.find(item => item.id === tokenSlot.value)
              if (!slot) return null
              if (slot.tokenState === 'active' || slot.tokenState === 'expired') return {mode: 'replace', slot}
              if (slot.active) return {mode: 'bind', slot}
              return {mode: 'expired', slot}
            }
            function renderTokenBox() {
              const account = selectedAdminAccount, slots = account?.slots || []
              const keep = slots.some(slot => slot.id === tokenSlot.value) ? tokenSlot.value : (slots.find(slot => slot.bound) || slots[0])?.id || ''
              tokenSlot.replaceChildren(...slots.map(slot => {
                const option = document.createElement('option')
                option.value = slot.id
                option.textContent = 'SLOT ' + (slot.index + 1) + (slot.tokenUsername ? ' · ' + slot.tokenUsername : ' · Chưa gắn token') + (slot.tokenState === 'invalid' ? ' · token hết hiệu lực' : slot.tokenState === 'expired' ? ' · hết hạn' : '')
                return option
              }))
              if (keep) tokenSlot.value = keep
              tokenSlot.hidden = slots.length <= 1
              tokenInput.value = ''
              const target = tokenTarget()
              if (!slots.length) tokenStatus.textContent = 'Account chưa có slot.'
              else if (!target) tokenStatus.textContent = 'Chọn slot.'
              else if (target.mode === 'expired') tokenStatus.textContent = 'Slot hết hạn, cần gia hạn trước khi gắn token.'
              else if (target.slot.tokenState === 'invalid') tokenStatus.textContent = 'Token hết hiệu lực. Gắn token mới để khôi phục config cũ.'
              else if (target.mode === 'replace') tokenStatus.textContent = 'Sửa token cho slot đang chọn.' + (target.slot.tokenState === 'expired' ? ' (slot hết hạn)' : '')
              else tokenStatus.textContent = 'Gắn token vào slot đang chọn.'
              tokenInput.disabled = !target || target.mode === 'expired'
              tokenButton.disabled = tokenInput.disabled
            }
            adminTokenBoxSync = () => { if (linkedSlotId && tokenSlot.value !== linkedSlotId) tokenSlot.value = linkedSlotId; renderTokenBox() }
            function selectAdminAccount(key) {
              const selected = adminBillingState?.users?.find(account => account.id === key) || accounts.find(account => account.id === key)
              selectedAdminAccount = selected || null
              try { selected && selected.id !== me.user.id ? sessionStorage.setItem('adminAccountId', selected.id) : sessionStorage.removeItem('adminAccountId') } catch {}
              if (!selected) { linkedUser = ''; linkedLocation = 'active'; linkedSlotId = ''; configSlotMode = false; setConfigSlots([]); select.value = ''; tokenStatus.textContent = ''; return }
              renderAccountHome(selected)
              renderAccountHomeState(selected)
              setFeatureStatusSlots(selected.slots, selected.id, false)
              linkedUser = ''
              linkedLocation = 'active'
              linkedSlotId = ''
              configSlotMode = Boolean(selected.slots.length)
              setConfigSlots(configSlotMode ? selected.slots : [], configSlotMode ? selected.id : '')
              select.value = selected.id
              tokenSlot.value = linkedSlotId || (selected.slots[0] && selected.slots[0].id) || ''
              renderTokenBox()
            }
            for (const account of accounts) {
              const option = document.createElement('option')
              option.value = account.id
              if (!account.slots.length) option.textContent = account.username + ' · chưa có slot'
              else {
                const active = account.slots.filter(slot => slot.tokenState === 'active').length
                const invalid = account.slots.filter(slot => slot.tokenState === 'invalid').length
                const expired = account.slots.filter(slot => slot.tokenState === 'expired').length
                option.textContent = account.username + ' · ' + active + '/' + account.slots.length + ' token' + (invalid ? ' · ' + invalid + ' token hết hiệu lực' : '') + (expired ? ' · ' + expired + ' hết hạn' : '')
              }
              select.append(option)
            }
            adminAccountSwitch = key => {
              if (!adminBillingState?.users?.some(account => account.id === key) && !accounts.some(account => account.id === key)) return false
              selectAdminAccount(key)
              void Promise.all([loadConfigs(), loadQuest(), loadBilling(), loadStream()])
              return true
            }
            select.onchange = () => { adminAccountSwitch(select.value); if ($('adminBillingUser') && $('adminBillingUser').value !== select.value) { const opt = Array.from($('adminBillingUser').options).find(o => o.value === select.value); if (opt) { $('adminBillingUser').value = select.value; renderAdminSelectedUser() } } }
            let savedAccountId = null
            try { savedAccountId = sessionStorage.getItem('adminAccountId') } catch {}
            selectAdminAccount((accounts.find(account => account.id === savedAccountId) || accounts.find(account => account.id === me.user.id) || accounts[0])?.id || '')
            if (selectedAdminAccount?.id !== billing?.ownerId) void loadBilling()
            tokenSlot.onchange = () => {
              const slot = selectedAdminAccount?.slots?.find(item => item.id === tokenSlot.value)
              if (slot) selectConfigSlot(slot.id)
              renderTokenBox()
            }
            tokenBox.onsubmit = async event => {
              event.preventDefault()
              const target = tokenTarget(), token = tokenInput.value.trim()
              if (!selectedAdminAccount || !target || target.mode === 'expired' || !token) return
              tokenButton.disabled = true; tokenStatus.textContent = 'Đang lưu token...'
              try { await billingRequest(target.mode === 'replace' ? '/api/billing/token' : '/api/billing/bind', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ownerId:selectedAdminAccount.id,slotId:target.slot.id,token})}); location.reload() }
              catch (error) { tokenStatus.textContent = error instanceof Error ? error.message : 'Không thể lưu token.'; tokenButton.disabled = false }
            }
            label.append(select)
            accountMenu.prepend(label,tokenBox)
          }
        }
        if (!me.admin && me.canSwitchRole) { const mode=document.createElement('button');mode.className='account-action';mode.textContent='Chuyển sang admin';mode.onclick=async()=>{await fetch('/api/session/mode',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'admin'})});location.reload()};accountMenu.append(mode) }
        const logout = logoutButton()
        logout.className = 'account-action account-logout'
        accountMenu.append(logout)
        finishBoot()
        void loadCardFees()
        await Promise.all([loadConfigs(), loadQuest(), loadStream(), loadOwo()])
        window.dispatchEvent(new Event('dashboard-home-ready'))
      } catch { if (oauthLinked) retryLink('Không thể xác minh phiên đăng nhập.') }
      finally { linkedLoadPending = false; finishBoot() }
    }
    function resetLinkedConfigs() {
      document.body.classList.remove('can-save')
      statusPremiumType = null
      statusLimit = 100
      updateStatusEmojiLabels()
      for (const [file, [output, save, errors, toggle]] of Object.entries(linked)) {
        $(output).value = linkedDefaults[file]
        $(errors).textContent = ''
        $(save).disabled = true
        if (toggle && $(toggle)) {
          $(toggle).disabled = true
          $(toggle).textContent = 'Tắt chức năng'
          delete $(toggle).dataset.state
        }
        if (file === 'config') {
          $('saveJson').disabled = true
          if ($('saveAll')) $('saveAll').disabled = true
        }
      }
      rpcDirty = false
      normalizeScenes(undefined, false)
      fillFromJson(); fillVoiceFromJson(); fillVoicepoolFromJson(); fillChatFromJson(); fillMentionFromJson(); fillChatpoolFromJson(); fillStatusFromJson()
      renderMentionLog([])
    }
    async function loadConfigs(expectedRpcVersion) {
        const sequence = ++configLoadSequence
        setConfigSlotLoading(true)
        void loadStatusProfile()
        try {
        if ((adminMode && selectedAdminAccount && !configSlots.length) || (configSlotMode && !linkedSlotId)) { return }
        const query = configSlotMode ? new URLSearchParams(configSlotTarget()).toString() : new URLSearchParams({user:linkedUser,...(linkedLocation === 'disabled'?{location:'disabled'}:{})}).toString()
        const configs = await fetch('/api/config?' + query, {credentials: 'same-origin', cache: 'no-store'})
        if (sequence !== configLoadSequence) return
        if (!configs.ok) { return }
        const result = await configs.json()
        if (sequence !== configLoadSequence || (expectedRpcVersion !== undefined && rpcEditVersion !== expectedRpcVersion)) return
        statusPremiumType = Number.isInteger(result.premiumType) && result.premiumType >= 0 ? result.premiumType : null
        statusLimit = Number.isInteger(result.statusLimit) && result.statusLimit > 0 ? result.statusLimit : 100
        updateStatusEmojiLabels(); void loadMediaPicker(); void loadMediaGallery()
        if (!result.exists && linkedSlotId === featureStatusSlotId) for (const file of Object.keys(linked)) setFeatureState(file, 'missing')
        if (!result.exists) { resetLinkedConfigs(); return }
        document.body.classList.add('can-save')
        for (const [file, [output, save, , toggle]] of Object.entries(linked)) {
          if (linkedSlotId === featureStatusSlotId) setFeatureState(file, result.files[file] ? (result.disabled && result.disabled[file] ? 'disabled' : 'enabled') : 'missing')
          $(output).value = result.files[file] ? JSON.stringify(result.files[file], null, 2) : linkedDefaults[file]
          $(save).disabled = false
          if (toggle && $(toggle)) {
            const configured = Boolean(result.files[file])
            const isDisabled = Boolean(result.disabled && result.disabled[file])
            $(toggle).disabled = !configured
            $(toggle).textContent = isDisabled ? 'Bật chức năng' : 'Tắt chức năng'
            if (configured) $(toggle).dataset.state = isDisabled ? 'disabled' : 'enabled'
            else delete $(toggle).dataset.state
          }
          if (file === 'config') {
            $('saveJson').disabled = false
            if ($('saveAll')) $('saveAll').disabled = false
          }
        }
      $('output').value = result.files.config ? JSON.stringify(result.files.config, null, 2) : linkedDefaults.config
      rpcDirty = false
      normalizeScenes(undefined, Boolean(result.files.config))
      updateRpcEditorState()
      fillFromJson(); fillVoiceFromJson(); fillVoicepoolFromJson(); fillChatFromJson(); fillMentionFromJson(); fillChatpoolFromJson(); fillStatusFromJson()
      renderMentionLog(result.mentionLog)
        if(result.errors?.voicepool)$('voicepoolErrors').textContent=result.errors.voicepool
        if(result.errors?.chatpool)$('chatpoolErrors').textContent=result.errors.chatpool
        } catch (error) {
          console.error('loadConfigs failed:', error)
        } finally {
          if (sequence === configLoadSequence) setConfigSlotLoading(false)
        }
    }
    $('save').onclick = () => $('saveAll') ? saveSelectedScene() : saveLinked('config')
    $('saveJson').onclick = () => $('saveAll') ? saveSelectedScene() : saveLinked('config')
    if ($('saveAll')) $('saveAll').onclick = () => saveLinked('config')
    $('rpcToggle').onclick = () => toggleLinked('config')
    $('voiceSave').onclick = () => saveLinked('voice')
    $('voiceToggle').onclick = () => toggleLinked('voice')
    $('voicepoolSave').onclick = () => saveLinked('voicepool')
    $('voicepoolToggle').onclick = () => toggleLinked('voicepool')
    $('chatSave').onclick = () => saveLinked('chat')
    $('chatToggle').onclick = () => toggleLinked('chat')
    $('mentionSave').onclick = () => saveLinked('mention')
    $('mentionToggle').onclick = () => toggleLinked('mention')
    $('chatpoolSave').onclick = () => saveLinked('chatpool')
    $('chatpoolToggle').onclick = () => toggleLinked('chatpool')
    $('statusSave').onclick = () => saveLinked('status')
    $('statusToggle').onclick = () => toggleLinked('status')
    build()
    buildVoice()
    buildVoicepool()
    buildChat()
    buildChatpool()
    renderStatusItems([{text:'Status 1',delaySeconds:30},{text:'Status 2',delaySeconds:30},{text:'Status 3',delaySeconds:30}])
    buildStatus()
    linkedDefaults = Object.fromEntries(Object.entries(linked).map(([file, [output]]) => [file, $(output).value]))
    syncConfigSlotControls()
    loadLinked()
