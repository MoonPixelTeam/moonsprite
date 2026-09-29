import exampleUrl from '@/assets/trial-example.moonsprite?url&inline'

export async function loadTrialExampleFile(): Promise<File> {
  const response = await fetch(exampleUrl)
  if (!response.ok) throw new Error(`工程示例加载失败（HTTP ${response.status}），请重试。`)
  return new File([await response.arrayBuffer()], '工程示例.moonsprite', { type: 'application/octet-stream' })
}
