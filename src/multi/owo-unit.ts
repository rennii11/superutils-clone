import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cashChannelId, parseOwoConfig } from '../owo/config.js'

export type OwoUnit = {
  key: string
  user: string
  feature: 'owo'
  entry: string
  root: string
  env: NodeJS.ProcessEnv
  signature: string
  errorFile: string
}

export async function owoUnit(input: {
  root: string
  user: string
  tokenPath: string
  tokenSignature: string
  licenseSignature: string
  configSignature: string
  codeSignature: string
}): Promise<OwoUnit | null> {
  const configPath = join(input.root, 'owo.json')
  const raw = await readFile(configPath, 'utf8').catch(() => '')
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = parseOwoConfig(data)
  const cashChannel = parsed.ok ? cashChannelId(parsed.value) : ''
  if (!parsed.ok || (!parsed.value.enabled && !/^\d{17,20}$/.test(cashChannel))) return null
  return {
    key: `${input.user}:owo`,
    user: input.user,
    feature: 'owo',
    entry: 'dist/owo/index.js',
    root: input.root,
    env: {
      OWO_CONFIG_PATH: configPath,
      OWO_STATUS_PATH: join(input.root, 'owo-status.json'),
      OWO_CASH_REQUEST_PATH: join(input.root, 'owo-cash-request.json'),
      OWO_CASH_RESULT_PATH: join(input.root, 'owo-cash-result.json'),
      TOKEN_PATH: input.tokenPath,
      TOKEN: ''
    },
    signature: `${input.tokenSignature}:${input.licenseSignature}:${input.configSignature}:${input.codeSignature}`,
    errorFile: join(input.root, 'owo-error.txt')
  }
}
