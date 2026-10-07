export const FREE_COOLDOWN_MS = 5 * 60 * 60 * 1000
export const FREE_EXPIRES_AT = 8640000000000000

export class FreePlanError extends Error {
  constructor(message: string, public status = 403, public nextRunAt = 0) { super(message) }
}
