const CUSTOM_NAME_TYPES = new Set(['WATCHING', 'COMPETING'])

// Map RPC mode -> Discord activity platform fingerprint.
const MODE_PLATFORM: Record<string, string> = {
  META_QUEST: 'meta_quest',
  XBOX: 'xbox',
  PLAYSTATION: 'ps5'
}

// Modes that force a default activity type when the setup does not specify one.
// YOUTUBE relies on STREAMING + youtube.com URL for Discord to render the LIVE/YouTube badge.
const MODE_DEFAULT_TYPE: Record<string, string> = {
  XBOX: 'PLAYING',
  PLAYSTATION: 'PLAYING',
  YOUTUBE: 'STREAMING'
}

export function activityPlatformForMode(mode: string | undefined, type: string | undefined): string | null {
  const platform = MODE_PLATFORM[mode || '']
  if (!platform) return null
  // Custom-name types render their own text; a platform badge conflicts with them.
  if (CUSTOM_NAME_TYPES.has(type || '')) return null
  return platform
}

export function defaultTypeForMode(mode: string | undefined): string | undefined {
  return MODE_DEFAULT_TYPE[mode || '']
}

// Backwards-compatible helper.
export function usesMetaQuestActivityPlatform(mode: string | undefined, type: string | undefined) {
  return mode === 'META_QUEST' && !CUSTOM_NAME_TYPES.has(type || '')
}
