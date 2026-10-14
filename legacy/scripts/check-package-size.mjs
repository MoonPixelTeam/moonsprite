import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const releaseDirectory = join(process.cwd(), 'release')
const { version } = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'))
const artifactLimit = 100 * 1024 * 1024
const artifacts = [
  `MoonSprite-Setup-${version}-x64.exe`,
  `MoonSprite-Portable-${version}-x64.exe`
]

for (const name of artifacts) {
  const bytes = (await stat(join(releaseDirectory, name))).size
  const megabytes = bytes / 1024 / 1024
  console.log(`${name}: ${megabytes.toFixed(2)} MiB`)
  if (bytes > artifactLimit) throw new Error(`${name} exceeds the 100 MiB release limit.`)
}
