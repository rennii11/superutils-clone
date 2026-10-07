import { REST } from '@discordjs/rest'
import { WebSocketManager, WebSocketShardEvents } from '@discordjs/ws'
import { PresenceUpdateStatus } from 'discord-api-types/v10'

export async function startBotPresence(token: string, log: (message: string) => void = console.log) {
  const value = token.trim()
  if (!value) throw new Error('BOT_TOKEN is required')

  const gateway = new WebSocketManager({
    token: value,
    intents: 0,
    rest: new REST({ version: '10' }).setToken(value),
    initialPresence: { activities: [], afk: false, since: null, status: PresenceUpdateStatus.Online }
  })
  gateway.on(WebSocketShardEvents.Ready, data => log(`[bot] ready as ${data.user.username}`))
  gateway.on(WebSocketShardEvents.Error, error => console.error('[bot] gateway error:', error.message))
  await gateway.connect()
  return gateway
}
