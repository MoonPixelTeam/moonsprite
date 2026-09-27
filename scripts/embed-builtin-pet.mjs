import { createDecipheriv, createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createLocalizationSource } from './pet-companion-localization.mjs'

const [sourcePath, extensionPath] = process.argv.slice(2)
if (!sourcePath || !extensionPath) throw new Error('用法：node scripts/embed-builtin-pet.mjs <源.mspet> <内置扩展.msext>')

const data = JSON.parse(readFileSync(sourcePath, 'utf8'))
if (data.format !== 'moonsprite-pet' || data.version !== 1 || !data.pet || data.pet.name !== '月猫') throw new Error('内置宠物包格式或名称不正确')
const { pet, spriteEncrypted } = data
if (spriteEncrypted?.algorithm !== 'AES-GCM') throw new Error('内置宠物包缺少 AES-GCM 素材')
const encrypted = Buffer.from(spriteEncrypted.data, 'base64')
const decipher = createDecipheriv('aes-256-gcm', Buffer.from('MoonSpritePetKey-v1-20260926-123'), Buffer.from(spriteEncrypted.iv, 'base64'))
decipher.setAuthTag(encrypted.subarray(-16))
const png = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()])
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== pet.frameWidth || png.readUInt32BE(20) !== pet.frameHeight * pet.frameCount) throw new Error('内置宠物 PNG 尺寸不匹配')
if (!Array.isArray(pet.durations) || pet.durations.length !== pet.frameCount || !pet.animations?.IDLE?.length || !Array.isArray(pet.triggerSlots)) throw new Error('内置宠物动画元数据不完整')

const builtIn = {
  id: 'builtin', name: pet.name, frameWidth: pet.frameWidth, frameHeight: pet.frameHeight,
  frameCount: pet.frameCount, showFrames: pet.animations.SHOW ?? [], idleFrames: pet.animations.IDLE,
  assetVersion: 'mspet-v1:' + createHash('sha256').update(JSON.stringify(pet)).update(png).digest('hex'),
  localizedName: pet.name, animations: pet.animations, triggerSlots: pet.triggerSlots,
  durations: pet.durations, source: 'builtin'
}

function replaceObject(source, marker, value) {
  const position = source.indexOf(marker)
  if (position < 0) throw new Error(`扩展页面缺少 ${marker}`)
  const start = source.indexOf('{', position + marker.length)
  let depth = 0, quoted = false, escaped = false
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return source.slice(0, start) + JSON.stringify(value) + source.slice(index + 1)
  }
  throw new Error(`扩展页面中的 ${marker} 对象不完整`)
}

const archive = unzipSync(readFileSync(extensionPath))
const localization = createLocalizationSource()
for (const name of ['runtime/index.html', 'ui/pet.html', 'ui/manager.html']) {
  let html = strFromU8(archive[name])
  const start = html.indexOf('const PET_LANGUAGES=')
  const end = html.indexOf("setPetLanguage('auto');", start)
  if (start < 0 || end < 0) throw new Error(`${name} 缺少多语言脚本`)
  html = html.slice(0, start) + localization + html.slice(end + "setPetLanguage('auto');".length)
  html = replaceObject(html, name === 'runtime/index.html' ? 'builtInPet=' : 'BUILT_IN=', builtIn)
  if (name === 'ui/pet.html') html = html.replace('aria-label="奶龙"', 'aria-label="月猫"')
  archive[name] = strToU8(html)
}
archive['assets/companion.png'] = new Uint8Array(png)
writeFileSync(extensionPath, Buffer.from(zipSync(archive, { level: 6 })))
console.log(`内置宠物已设为 ${pet.name}：${pet.frameWidth}×${pet.frameHeight}，${pet.frameCount} 帧，${pet.triggerSlots.length} 个触发槽`)
