const settingsUrl = 'https://discord.com/api/v9/users/@me/settings'

export async function ensureDiscordActivityDisplay(token: string, request: typeof fetch = fetch): Promise<boolean> {
  const value = token.trim()
  if (!value) throw new Error('Discord token is required')
  const current = await request(settingsUrl, { headers: { authorization: value } })
  if (!current.ok) throw new Error(`Discord settings request failed: ${current.status}`)
  const settings = await current.json().catch(() => ({})) as { show_current_game?: unknown }
  if (settings.show_current_game === true) return false

  const updated = await request(settingsUrl, {
    method: 'PATCH',
    headers: { authorization: value, 'content-type': 'application/json' },
    body: JSON.stringify({ show_current_game: true })
  })
  if (!updated.ok) throw new Error(`Discord settings update failed: ${updated.status}`)
  return true
}
