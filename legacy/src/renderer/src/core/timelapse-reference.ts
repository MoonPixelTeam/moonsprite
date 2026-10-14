import type { TimelapseFrameReference } from '@shared/types-timelapse'

export function validTimelapseReference(value: unknown): value is TimelapseFrameReference {
  if (!value || typeof value !== 'object') return false
  const r = value as TimelapseFrameReference
  const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(v)
  return id(r.store) && id(r.chunk) && Number.isSafeInteger(r.offset) && r.offset >= 0
    && Number.isSafeInteger(r.length) && r.length > 0 && r.length <= 32 * 1024 * 1024
    && Number.isSafeInteger(r.offset + r.length) && Number.isInteger(r.checksum) && r.checksum >= 0 && r.checksum <= 0xffffffff
}
