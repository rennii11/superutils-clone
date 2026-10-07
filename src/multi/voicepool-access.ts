const VOICEPOOL_ADMIN_ID = process.env.ADMIN_USER_ID || '631286646246998039'

export function canRunVoicepool(ownerId: unknown) {
  return ownerId === VOICEPOOL_ADMIN_ID
}
