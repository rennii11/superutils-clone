export const MAX_EXTERNAL_IMAGE_CACHE_ENTRIES = 256

export function externalImageAssetMatchesUrl(url: string, asset: string) {
  const match = asset.match(/^mp:external\/[^/]+\/(https?)\/(.+)$/)
  if (!match) return false
  try {
    return new URL(`${match[1]}://${match[2]}`).href === new URL(url).href
  } catch {
    return false
  }
}

export function rememberExternalImage(
  cache: Map<string, string>,
  url: string,
  asset: string,
  maxEntries = MAX_EXTERNAL_IMAGE_CACHE_ENTRIES
) {
  if (cache.get(url) === asset) return false
  cache.delete(url)
  cache.set(url, asset)
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return true
}
