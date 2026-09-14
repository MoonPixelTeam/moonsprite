import type { StoredExtension, StoredExtensionPet } from '@shared/types-extensions'

export interface ExtensionPetContribution {
  extensionId: string
  extensionName: string
  pet: StoredExtensionPet
}

export const listExtensionPetContributions = (extensions: readonly StoredExtension[]): ExtensionPetContribution[] =>
  extensions.flatMap((extension) => extension.enabled ? (extension.pets ?? []).map((pet) => ({ extensionId: extension.id, extensionName: extension.name, pet })) : [])
