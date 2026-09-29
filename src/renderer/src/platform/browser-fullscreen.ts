let transition: Promise<boolean> | null = null

export async function toggleBrowserFullscreen(): Promise<boolean> {
  if (transition) return transition
  const operation = (async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else {
        if (!document.documentElement.requestFullscreen) throw new Error('Fullscreen API unavailable')
        await document.documentElement.requestFullscreen()
      }
      return Boolean(document.fullscreenElement)
    } catch (error) {
      throw new Error('浏览器未能切换全屏，请通过浏览器菜单切换全屏，或检查网站全屏权限。', { cause: error })
    }
  })()
  transition = operation
  try { return await operation } finally { transition = null }
}

export function observeBrowserFullscreen(onChange: (fullscreen: boolean) => void): () => void {
  const update = () => onChange(Boolean(document.fullscreenElement))
  document.addEventListener('fullscreenchange', update)
  update()
  return () => document.removeEventListener('fullscreenchange', update)
}
