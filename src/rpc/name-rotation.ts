export function rotatingName(value: unknown, index: number): string | undefined {
  const names = (Array.isArray(value) ? value : [value])
    .filter((name): name is string => typeof name === 'string')
    .map(name => name.trim())
    .filter(Boolean)
  if (!names.length) return undefined
  const cursor = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0
  return names[cursor % names.length]
}

