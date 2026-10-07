function safeMediaFile(value: string | undefined): value is string {
  return Boolean(value && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\') && !value.includes('\0'))
}

function localMediaFile(source: string, prefix: string) {
  if (!source.startsWith(prefix)) return undefined
  try {
    const value = decodeURIComponent(source.slice(prefix.length))
    return safeMediaFile(value) ? value : undefined
  } catch {
    return undefined
  }
}

function contentAddressSuffix(value: string) {
  return value.match(/-([a-f0-9]{12}\.(?:png|jpe?g|gif|webp))$/i)?.[1]?.toLowerCase()
}

function discordAttachmentKey(value: string) {
  try {
    const match = new URL(value).pathname.match(/^\/attachments\/(\d+)\/(\d+)\//)
    return match ? `${match[1]}/${match[2]}` : ''
  } catch {
    return ''
  }
}

export function reusableRpcMediaFile(
  source: string,
  prefix: string,
  media: Record<string, string>,
  availableFiles: Iterable<string>
) {
  const files = [...availableFiles].filter(safeMediaFile).sort()
  const existing = new Set(files)
  const local = localMediaFile(source, prefix)
  if (local) {
    if (existing.has(local)) return local
    const suffix = contentAddressSuffix(local)
    if (suffix) return files.find(file => contentAddressSuffix(file) === suffix)
    return undefined
  }

  const exact = media[source]
  if (safeMediaFile(exact) && existing.has(exact)) return exact
  const attachment = discordAttachmentKey(source)
  if (!attachment) return undefined
  for (const [storedUrl, file] of Object.entries(media)) {
    if (safeMediaFile(file) && existing.has(file) && discordAttachmentKey(storedUrl) === attachment) return file
  }
  return undefined
}
