import exampleUrl from '@/assets/trial-example.moonsprite?url&inline'

export async function loadTrialExampleFile(): Promise<File> {
  let bytes: ArrayBuffer
  if (exampleUrl.startsWith('data:')) {
    const payload = exampleUrl.slice(exampleUrl.indexOf(',') + 1)
    const binary = atob(payload)
    const decoded = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) decoded[index] = binary.charCodeAt(index)
    bytes = decoded.buffer
  } else {
    const response = await fetch(exampleUrl)
    if (!response.ok) throw new Error(`工程示例加载失败（HTTP ${response.status}），请重试。`)
    bytes = await response.arrayBuffer()
  }
  return new File([bytes], '工程示例.moonsprite', { type: 'application/octet-stream' })
}
