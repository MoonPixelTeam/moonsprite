interface CursorAsset {
  variable: string
  source: string
  hotspot: string
  fallback: string
}

const images = new Map<string, Promise<string>>()
const inlineCursor = (source: string, scale: number): Promise<string> => {
  const key = `${source}:${scale}`
  let pending = images.get(key)
  if (!pending) {
    pending = new Promise<string>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.naturalWidth * scale)
        canvas.height = Math.round(image.naturalHeight * scale)
        const context = canvas.getContext('2d')
        if (!context) { reject(new Error('无法生成扩展指针')); return }
        context.imageSmoothingEnabled = false
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      }
      image.onerror = () => reject(new Error('无法加载扩展指针'))
      image.src = source
    })
    images.set(key, pending)
  }
  return pending
}

export const extensionWindowThemeCss = (variables: string): string => `
:root{${variables}}
*{cursor:var(--cursor-default)!important}
html,body{margin:0;background:transparent;color:var(--theme-text-primary);font:12px/1.5 system-ui,sans-serif;cursor:var(--cursor-default)!important}
button,a,input,select,textarea{font:inherit;border-radius:0}
button,a,select,input[type=checkbox]{cursor:var(--cursor-default)!important}
input,textarea{cursor:var(--cursor-default)!important}
img{-webkit-user-drag:none}
body[data-ms-dialog]{height:100vh;box-sizing:border-box;padding:0;gap:0;background:var(--theme-dialog-content)!important;border:1px solid var(--theme-border-strong)}
[data-ms-dialog] h1{display:flex;align-items:center;margin:0;padding:8px 12px;background:var(--theme-raised-surface);border-bottom:1px solid var(--theme-border);font-size:13px}
[data-ms-dialog] section{margin:10px;padding:10px;background:var(--theme-dialog-section);border:1px solid var(--theme-border)}
[data-ms-dialog] button{padding:5px 10px;color:var(--theme-text-primary);background:var(--theme-raised-surface);border:1px solid var(--theme-border-strong)}
[data-ms-dialog] button:hover:not(:disabled){background:var(--theme-surface-hover)}
[data-ms-dialog] button.primary{background:#2979FF;border-color:#2979FF;color:white}
[data-ms-dialog] input{color:var(--theme-text-primary);background:var(--theme-deep-surface);border:1px solid var(--theme-border-strong)}
[data-ms-dialog] :focus-visible{outline:1px solid #2979FF;outline-offset:1px}
[data-ms-dialog] .hint,[data-ms-dialog] small,[data-ms-dialog] #status{color:var(--theme-text-secondary)}
[data-ms-dialog] .pet{background:var(--theme-raised-surface);border-color:var(--theme-border)}
[data-ms-dialog] .pet[data-active=true]{border-color:#2979FF}
`

export async function extensionWindowTheme(assets: readonly CursorAsset[], useSystem: boolean, scale: number): Promise<string> {
  const cursors = await Promise.all(assets.map(async asset => {
    const hotspot = asset.hotspot.split(' ').map(value => Math.round(Number(value) * scale)).join(' ')
    return `${asset.variable}:${useSystem ? asset.fallback : `url('${await inlineCursor(asset.source, scale)}') ${hotspot}, none`};`
  }))
  const computed = getComputedStyle(document.documentElement)
  const theme = ['surface','raised-surface','deep-surface','dialog-content','dialog-section','surface-hover','border','border-strong','text-primary','text-secondary']
    .map(name => `--theme-${name}:${computed.getPropertyValue(`--theme-${name}`)};`).join('')
  return extensionWindowThemeCss(theme + cursors.join(''))
}
