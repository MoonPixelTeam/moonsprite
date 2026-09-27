import { cp, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
await access(new URL('website/dist/index.html', root))
await access(new URL('out/web-trial/index.html', root))
await cp(fileURLToPath(new URL('out/web-trial/', root)), fileURLToPath(new URL('website/dist/try/', root)), { recursive: true })
console.log('Website and Web trial ready in website/dist (editor: /try/).')
