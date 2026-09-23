// Local prototype roles only. Production authorization belongs on the server.
let adminAccountId: string | null = null
export function currentLocalAccountId(): string | null {
  try {
  const id = localStorage.getItem('moonsprite-session')
  const accounts = JSON.parse(localStorage.getItem('moonsprite-accounts') ?? '{"accounts":[]}').accounts
  return id && Array.isArray(accounts) && accounts.some((account: { id: string }) => account.id === id) ? id : null
  } catch (error) { console.warn('MoonSprite: could not read account permissions.', error); return null }
}
export function isLocalAdmin(): boolean {
  return Boolean(adminAccountId && adminAccountId === currentLocalAccountId())
}
export function unlockLocalAdmin(passphrase: string): boolean {
  adminAccountId = passphrase === 'admin' ? currentLocalAccountId() : null
  window.dispatchEvent(new Event('moonsprite:data'))
  return isLocalAdmin()
}
export function requireLocalAdmin(): void {
  if (!isLocalAdmin()) throw new Error('forbidden')
}
export function clearLocalAdmin(): void { adminAccountId = null }
