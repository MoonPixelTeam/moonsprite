import assert from 'node:assert/strict'
import test from 'node:test'
import { validateVersionContract } from './check-version-contract.mjs'

const base = {
  packageVersion: '0.1.0-dev.3',
  cargoVersion: '0.1.0-dev.3',
  tauriVersion: '0.1.0-dev.3',
  appLabel: 'DEV.3',
  latestLabel: 'DEV.2',
  changelog: '[DEV.2](docs/changelog/DEV.2.md)',
  archiveIndex: '[DEV.2](DEV.2.md)',
  readme: '当前源码版本 `0.1.0-dev.3`，最近打包 [`DEV.2`](docs/changelog/DEV.2.md)',
  readmeEn: 'Source version `0.1.0-dev.3`, latest packaged [`DEV.2`](docs/changelog/DEV.2.md)',
}

test('开发版本允许当前 DEV.3 与最近打包 DEV.2 并存', () => {
  assert.deepEqual(validateVersionContract(base), [])
})

test('内部版本和应用标识必须一致', () => {
  assert.match(validateVersionContract({ ...base, cargoVersion: '0.1.0-dev.2' })[0], /版本不一致/)
  assert.match(validateVersionContract({ ...base, appLabel: 'DEV.2' })[0], /当前应用标识应为 DEV.3/)
})

test('发布检查要求最近归档切换到当前版本', () => {
  assert.match(validateVersionContract(base, { release: true })[0], /最近打包版本 DEV.2 与当前发布标识 DEV.3 一致/)
  const released = { ...base, latestLabel: 'DEV.3', changelog: '[DEV.3](docs/changelog/DEV.3.md)', archiveIndex: '[DEV.3](DEV.3.md)', appLabel: 'DEV.3', readme: '当前源码版本 `0.1.0-dev.3`，最近打包 [`DEV.3`](docs/changelog/DEV.3.md)', readmeEn: 'Source version `0.1.0-dev.3`, latest packaged [`DEV.3`](docs/changelog/DEV.3.md)' }
  assert.deepEqual(validateVersionContract(released, { release: true }), [])
  assert.match(validateVersionContract({ ...released, readmeEn: base.readmeEn }, { release: true })[0], /README.en.md 未标注/)
})
