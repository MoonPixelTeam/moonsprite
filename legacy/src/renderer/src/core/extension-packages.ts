export const EXTENSION_PACKAGE_EXTENSION = 'msext'

export const isExtensionPackagePath = (path: string): boolean =>
  new RegExp(`\\.${EXTENSION_PACKAGE_EXTENSION}$`, 'i').test(path.trim().replace(/^"|"$/g, ''))
