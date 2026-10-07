export type OwnerNotificationEntry = {
  authorTag: string
  guildName: string
  channelName: string
  messageContent: string
  url: string
  at: number
}

export function buildOwnerNotification(input: { accountUsername: string; entry: OwnerNotificationEntry }) {
  const { entry } = input
  return {
    flags: 32768,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        components: [
          { type: 10, content: '## Tin nhắn mentioned' },
          { type: 10, content: `Người nhắc: **${entry.authorTag}**\nServer: **${entry.guildName}**\nChannel: #${entry.channelName}\nNội dung:\n${entry.messageContent}\nThời gian: <t:${Math.floor(entry.at / 1000)}:F>` },
          {
            type: 1,
            components: [
              { type: 2, style: 5, label: 'Xem tin nhắn', url: entry.url }
            ]
          }
        ]
      }
    ]
  }
}
