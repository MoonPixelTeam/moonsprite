import { readStoredString, writeStoredString } from './storage'

export interface PetPreferences {
  enabled: boolean
  scale: number
  remindersEnabled: boolean
  unsavedMinutes: number
  breakMinutes: number
}

export const PET_PREFERENCES_KEY = 'moonsprite.preference.extension-pet.v1'

const defaults: PetPreferences = {
  enabled: true,
  scale: 2,
  remindersEnabled: true,
  unsavedMinutes: 15,
  breakMinutes: 60
}

const integerInRange = (value: unknown, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback
}

export const loadPetPreferences = (): PetPreferences => {
  const raw = readStoredString(PET_PREFERENCES_KEY)
  if (!raw) return { ...defaults }
  try {
    const value = JSON.parse(raw) as Partial<PetPreferences>
    return {
      enabled: value.enabled !== false,
      scale: integerInRange(value.scale, defaults.scale, 1, 4),
      remindersEnabled: value.remindersEnabled !== false,
      unsavedMinutes: integerInRange(value.unsavedMinutes, defaults.unsavedMinutes, 5, 120),
      breakMinutes: integerInRange(value.breakMinutes, defaults.breakMinutes, 15, 180)
    }
  } catch {
    return { ...defaults }
  }
}

export const savePetPreferences = (value: PetPreferences): void => { writeStoredString(PET_PREFERENCES_KEY, JSON.stringify(value)) }

export const petPositionKey = (extensionId: string, petId: string): string =>
  `moonsprite.extension-pet-position.v1.${extensionId}:${petId}`

export const loadPetPosition = (extensionId: string, petId: string): { x: number; y: number } => {
  const raw = readStoredString(petPositionKey(extensionId, petId))
  if (!raw) return { x: 0.82, y: 0.72 }
  try {
    const value = JSON.parse(raw) as { x?: number; y?: number }
    const x = Number(value.x)
    const y = Number(value.y)
    return {
      x: Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0.82,
      y: Number.isFinite(y) ? Math.max(0, Math.min(1, y)) : 0.72
    }
  } catch {
    return { x: 0.82, y: 0.72 }
  }
}

export const savePetPosition = (extensionId: string, petId: string, position: { x: number; y: number }): void =>
  { writeStoredString(petPositionKey(extensionId, petId), JSON.stringify({ x: Math.max(0, Math.min(1, position.x)), y: Math.max(0, Math.min(1, position.y)) })) }
