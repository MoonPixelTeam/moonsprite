export interface OverlayBounds { x: number; y: number; width: number; height: number }
export interface OverlayRegion { sourceWidth: number; sourceHeight: number; spans: { x: number; y: number; width: number }[] }
export const overlayBounds = (value: unknown): OverlayBounds => {
  const input = value as OverlayBounds | null
  if (!input || ![input.x, input.y, input.width, input.height].every(Number.isFinite)
    || input.width < 1 || input.height < 1 || input.width > 8192 || input.height > 8192
    || Math.abs(input.x) > 32768 || Math.abs(input.y) > 32768) throw new Error('覆盖层边界无效。')
  return { x: input.x, y: input.y, width: input.width, height: input.height }
}
export const overlayRegion = (value: unknown): OverlayRegion => {
  const input = value as OverlayRegion | null
  if (!input || !Number.isInteger(input.sourceWidth) || !Number.isInteger(input.sourceHeight)
    || input.sourceWidth < 1 || input.sourceHeight < 1 || input.sourceWidth > 8192 || input.sourceHeight > 8192
    || !Array.isArray(input.spans) || input.spans.length > 65536) throw new Error('覆盖层命中区域无效。')
  for (const span of input.spans) if (!span || ![span.x, span.y, span.width].every(Number.isInteger)
    || span.x < 0 || span.y < 0 || span.width < 1 || span.x + span.width > input.sourceWidth || span.y >= input.sourceHeight) throw new Error('覆盖层命中区域越界。')
  return input
}
export const overlayClipPath = (region: OverlayRegion | null, bounds: OverlayBounds): string => {
  if (!region || region.spans.length === 0) return 'inset(50%)'
  const sx = bounds.width / region.sourceWidth, sy = bounds.height / region.sourceHeight
  return `path("${region.spans.map(({ x, y, width }) => `M${x * sx} ${y * sy}h${width * sx}v${sy}h${-width * sx}Z`).join('')}")`
}
