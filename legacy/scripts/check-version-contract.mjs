import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.cwd()

const devLabelForVersion = (version) => {
  const match = version.match(/-dev\.(\d+)$/)
  return match ? `DEV.${match[1]}` : version
}

export const validateVersionContract = ({ packageVersion, cargoVersion, tauriVersion, appLabel, latestLabel, changelog, archiveIndex, readme, readmeEn }, { release = false } = {}) => {
  const errors = []
  if (packageVersion !== cargoVersion || packageVersion !== tauriVersion) {
    errors.push(`package/Cargo/Tauri 版本不一致：${packageVersion} / ${cargoVersion} / ${tauriVersion}`)
  }
  if (appLabel !== devLabelForVersion(packageVersion)) {
    errors.push(`当前应用标识应为 ${devLabelForVersion(packageVersion)}，实际为 ${appLabel}。`)
  }
  const archivePath = `docs/changelog/${latestLabel}.md`
  if (!changelog.includes(`](${archivePath})`)) {
    errors.push(`CHANGELOG.md 未链接最近打包版本归档：${archivePath}`)
  }
  if (!archiveIndex.includes(`](${latestLabel}.md)`)) {
    errors.push(`docs/changelog/README.md 未链接最近打包版本归档：${latestLabel}.md`)
  }
  if (release && latestLabel !== appLabel) {
    errors.push(`发布检查要求最近打包版本 ${latestLabel} 与当前发布标识 ${appLabel} 一致。`)
  }
  if (release) {
    for (const [path, content] of [['README.md', readme], ['README.en.md', readmeEn]]) {
      if (!content?.includes(`\`${packageVersion}\``) || !content.includes(`[\`${latestLabel}\`](${archivePath})`)) {
        errors.push(`${path} 未标注当前源码版本 ${packageVersion} 和最近打包版本归档 ${archivePath}。`)
      }
    }
  }
  return errors
}

const firstVersionInPackage = (text) => text.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const appMetaValue = (text, name) => text.match(new RegExp(`export const ${name} = '([^']+)'`))?.[1]

const run = async () => {
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const tauri = JSON.parse(await readFile(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const cargo = await readFile(join(root, 'src-tauri', 'Cargo.toml'), 'utf8')
  const appMeta = await readFile(join(root, 'src', 'renderer', 'src', 'core', 'app-meta.ts'), 'utf8')
  const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8')
  const archiveIndex = await readFile(join(root, 'docs', 'changelog', 'README.md'), 'utf8')
  const release = process.argv.includes('--release')
  const [readme, readmeEn] = release
    ? await Promise.all([readFile(join(root, 'README.md'), 'utf8'), readFile(join(root, 'README.en.md'), 'utf8')])
    : [undefined, undefined]
  const latestLabel = appMetaValue(appMeta, 'LATEST_PACKAGED_RELEASE_LABEL')
  const errors = validateVersionContract({
    packageVersion: packageJson.version,
    cargoVersion: firstVersionInPackage(cargo),
    tauriVersion: tauri.version,
    appLabel: appMetaValue(appMeta, 'APP_CHANNEL_LABEL'),
    latestLabel,
    changelog,
    archiveIndex,
    readme,
    readmeEn,
  }, { release })
  try {
    await access(join(root, 'docs', 'changelog', `${latestLabel}.md`))
  } catch {
    errors.push(`最近打包版本归档不存在：docs/changelog/${latestLabel}.md`)
  }
  if (errors.length > 0) {
    console.error('版本契约检查失败：')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`版本契约检查通过：当前 ${appMetaValue(appMeta, 'APP_CHANNEL_LABEL')}，最近打包 ${latestLabel}。`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await run()
