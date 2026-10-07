export function shouldStopMissingUnit(key: string, misses: number, explicitlyDisabled = false) {
  return explicitlyDisabled || key.endsWith(':stream') || key.endsWith(':status') || misses >= 5
}
