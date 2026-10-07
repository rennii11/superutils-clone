export function autoReplyAction(directMention: boolean, replyToSelf: boolean, guildMessage: boolean): 'ignore'|'notify'|'reply-and-notify' {
  if (!guildMessage || (!directMention && !replyToSelf)) return 'ignore'
  if (directMention) return 'reply-and-notify'
  return 'notify'
}
