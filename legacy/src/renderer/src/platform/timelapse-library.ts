import type { MoonSpriteApi } from '@shared/types-platform'
import type { TimelapseSnapshot } from '@shared/types-timelapse'
import { validTimelapseReference } from '@/core/timelapse-reference'

export async function readTimelapseFrame(snapshot: TimelapseSnapshot, api: MoonSpriteApi = window.moonSprite): Promise<Uint8Array> {
  if (snapshot.data.byteLength) return snapshot.data
  if (!validTimelapseReference(snapshot.local) || !api.readTimelapseFrame) throw new Error('缩时录像不在本机。请从原电脑打包携带录像的工程后重新打开。')
  return api.readTimelapseFrame(snapshot.local)
}
