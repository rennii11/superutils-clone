type Effect = { src?: unknown; z_index?: unknown; loop?: unknown; start?: unknown; duration?: unknown }
type FrameLayer = { id?: unknown; order?: unknown; anchor?: unknown }
type Listing = { item?: { type?: unknown; effects?: Effect[]; layers?: FrameLayer[] } }

export function collectibleAssetUrl(skuId: string, assetId: string, format: 'static' | 'animated' | 'video'): string {
  return `https://cdn.discordapp.com/media/v1/collectibles-shop/${skuId}/${assetId}/${format}`
}

export function profileCollectibles(profile: any, listings: Map<string, Listing>) {
  const effectSkuId = profile?.user_profile?.profile_effect?.sku_id
  const effect = typeof effectSkuId === 'string' ? listings.get(effectSkuId)?.item : undefined
  const effectLayers = effect?.type === 1 && Array.isArray(effect.effects)
    ? effect.effects.flatMap(layer => typeof layer.src === 'string' && Number.isFinite(layer.z_index)
      ? [{ src: layer.src, zIndex: Number(layer.z_index), start: Number.isFinite(layer.start) ? Number(layer.start) : 0, duration: Number.isFinite(layer.duration) ? Number(layer.duration) : 0, loop: layer.loop === true }]
      : [])
    : []
  const frameSkuId = Array.isArray(profile?.user_profile?.collectibles)
    ? profile.user_profile.collectibles.find((item: any) => item?.type === 3 && typeof item.sku_id === 'string')?.sku_id
    : undefined
  const frame = typeof frameSkuId === 'string' ? listings.get(frameSkuId)?.item : undefined
  const frameLayers = frame?.type === 3 && Array.isArray(frame.layers)
    ? frame.layers.flatMap(layer => typeof layer.id === 'string' && (layer.order === 'front' || layer.order === 'back') && (layer.anchor === 'top' || layer.anchor === 'bottom')
      ? [{ src: collectibleAssetUrl(frameSkuId!, layer.id, 'static'), order: layer.order, anchor: layer.anchor }]
      : [])
    : []
  return { effectLayers, frameLayers }
}
