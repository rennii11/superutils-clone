export type VoiceSnapshot = { channelId: string | null; streaming: boolean | null }

export function voiceRepairAction(targetChannelId: string, streamEnabled: boolean, state: VoiceSnapshot | null | undefined): 'join'|'stream'|null {
  if (!state || state.channelId !== targetChannelId) return 'join'
  if (streamEnabled && state.streaming === false) return 'stream'
  return null
}
