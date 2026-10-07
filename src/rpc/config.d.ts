import * as z from 'zod'

const Config = z.object({
  APPLICATION_ID: z.string(),
  configs: z
    .array(
      z.object({
        setup: z.any().optional(),
        config: z.any().optional()
      })
    )
    .optional(),
  mode: z.enum(['RICH_PRESENCE', 'META_QUEST', 'XBOX', 'PLAYSTATION', 'YOUTUBE', 'SPOTIFY']).optional(),
  noPlatform: z.boolean().optional(),
  type: z
    .enum(['PLAYING', 'STREAMING', 'LISTENING', 'WATCHING', 'COMPETING'])
    .optional(),
  name: z.string().optional(),
  details: z.string().optional(),
  state: z.string().optional(),
  streamURL: z.string().url().optional(),
  party: z
    .object({
      size: z.object({
        current: z.number(),
        max: z.number()
      })
    })
    .optional(),
  setLocalTime: z.boolean().optional(),
  timezone: z.string().optional(),
  startTimestamp: z.number().optional(),
  endTimestamp: z.number().optional(),
  assets: z
    .object({
      large_image: z.string().optional(),
      large_text: z.string().optional(),
      small_image: z.string().optional(),
      small_text: z.string().optional()
    })
    .optional(),
  buttons: z
    .array(
      z.object({
        label: z.string(),
        url: z.string().url()
      })
    )
    .max(2)
    .optional(),
  refreshInterval: z.number().min(15000).optional() // Minimum 15000 ms (15 seconds)
})

export type Config = z.infer<typeof Config>
