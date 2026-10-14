export function allowsTauriIpc(policy) {
  return policy.split(';').some((directive) => {
    const [name, ...sources] = directive.trim().split(/\s+/)
    return name === 'connect-src' && sources.some((source) => {
      try {
        const url = new URL(source)
        return url.protocol === 'http:' && url.hostname === 'ipc.localhost'
      } catch {
        return false
      }
    })
  })
}
