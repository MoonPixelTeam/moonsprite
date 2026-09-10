import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
const manifest = 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'
if (!existsSync(manifest)) throw new Error('Run pnpm android:init before android:prepare')
let xml = readFileSync(manifest, 'utf8')
if (!xml.includes('android:screenOrientation=')) xml = xml.replace('<activity', '<activity android:screenOrientation="sensorLandscape"')
writeFileSync(manifest, xml)
console.log('Android test activity prepared (landscape, existing keyboard/configuration handling retained).')

const strings = 'src-tauri/gen/android/app/src/main/res/values/strings.xml'
let labels = readFileSync(strings, 'utf8')
labels = labels.replace(/(<string name="(?:app_name|main_activity_title)">).*?(<\/string>)/g, '$1MoonSprite Android Test$2')
writeFileSync(strings, labels)

copyFileSync('src-tauri/android/MainActivity.kt', 'src-tauri/gen/android/app/src/main/java/art/moonpx/moonsprite/tablettest/MainActivity.kt')

const licenses = 'src-tauri/gen/android/app/src/main/assets/licenses'
mkdirSync(licenses, { recursive: true })
for (const name of ['Fusion-Pixel-Font-OFL-1.1.txt', 'Silkscreen-OFL-1.1.txt', 'Tiny5-OFL-1.1.txt']) {
  copyFileSync('src-tauri/resources/fonts/licenses/' + name, licenses + '/' + name)
}
copyFileSync('LICENSE', licenses + '/MoonSprite-LICENSE.txt')
copyFileSync('THIRD_PARTY_NOTICES.md', licenses + '/THIRD_PARTY_NOTICES.md')
