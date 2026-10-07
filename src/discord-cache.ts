import { Options } from 'discord.js-selfbot-v13'

// Gateway events can otherwise retain every member, presence, and reaction.
export const memoryConstrainedClientOptions = {
  makeCache: Options.cacheWithLimits({
    ...Options.defaultMakeCacheSettings,
    MessageManager: 25,
    GuildMemberManager: 0,
    PresenceManager: 0,
    ReactionManager: 0,
    ThreadMemberManager: 0,
    UserManager: 100,
    VoiceStateManager: 0,
  }),
}
