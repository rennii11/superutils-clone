import { isMainThread, parentPort, workerData } from 'node:worker_threads'

export type SessionLogger = {
  log: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
}

type EmbeddedPayload = {
  env?: NodeJS.ProcessEnv
  prefix?: string
}

export type EmbeddedSessionContext = {
  active: boolean
  env: NodeJS.ProcessEnv
  logger: SessionLogger
}

function errorText(args: unknown[]) {
  return args.map(value => value instanceof Error ? `${value.name}: ${value.message}` : String(value)).join(' ')
}

function workerLogger(prefix: string): SessionLogger {
  return {
    log: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => {
      console.error(prefix, ...args)
      parentPort?.postMessage({ type: 'error', text: errorText(args) })
    }
  }
}

export function embeddedSessionContext(metaUrl: string): EmbeddedSessionContext {
  if (!isMainThread) {
    const payload = (workerData || {}) as EmbeddedPayload
    const prefix = typeof payload.prefix === 'string' ? payload.prefix : ''
    return {
      active: true,
      env: { ...process.env, ...(payload.env || {}) },
      logger: prefix ? workerLogger(prefix) : console
    }
  }
  return { active: false, env: process.env, logger: console }
}

export function reportTokenInvalid() {
  if (isMainThread || !parentPort) return
  parentPort.postMessage({ type: 'token-invalid' })
}

export function onWorkerStop(handler: () => Promise<void> | void) {
  if (isMainThread || !parentPort) return
  parentPort.on('message', message => {
    const type = (message as { type?: unknown } | null)?.type
    if (type !== 'stop') return
    Promise.resolve(handler())
      .catch(error => console.error('worker stop handler failed:', error))
      .finally(() => { parentPort?.postMessage({ type: 'stopped' }); parentPort?.close() })
  })
}
