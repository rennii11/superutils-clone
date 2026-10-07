window.dashboardBoneyardReady = Promise.all([
  import('/boneyard/extract.js'),
  import('/boneyard/runtime.js'),
]).then(([{ snapshotBones }, { renderBones }]) => {
  const layout = document.documentElement.dataset.layout
  const root = window.dashboardBootPage === 'config' ? document.querySelector('#page-config') : document.querySelector('#page-main .account-home')
  const cacheKey = 'superutils:boneyard:account-home:v2:' + layout + ':' + window.innerWidth
  let cached = null

  try {
    const value = JSON.parse(localStorage.getItem(cacheKey) || 'null')
    if (value && Array.isArray(value.bones) && Number.isFinite(value.width) && Number.isFinite(value.height)) cached = value
  } catch {}

  if (cached) {
    if (document.documentElement.hasAttribute('data-booting') && root && root.getBoundingClientRect().width >= 1) {
      const overlay = document.createElement('div')
      overlay.id = 'boneyardOverlay'
      overlay.setAttribute('aria-hidden', 'true')
      overlay.innerHTML = renderBones(cached, '#202226', true)
      root.append(overlay)
    }
  }

  window.addEventListener('dashboard-home-ready', () => {
    requestAnimationFrame(() => {
      const home = document.querySelector('#page-main .account-home')
      if (!home || home.getBoundingClientRect().width < 1) return
      try { localStorage.setItem(cacheKey, JSON.stringify(snapshotBones(home, 'dashboard-home'))) } catch {}
    })
  })
})
