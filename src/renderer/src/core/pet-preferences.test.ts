import { beforeEach, describe, expect, it } from 'vitest'
import { loadPetPosition, loadPetPreferences, PET_PREFERENCES_KEY, savePetPosition, savePetPreferences } from './pet-preferences'

describe('extension pet preferences', () => {
  beforeEach(() => localStorage.clear())

  it('uses low-distraction defaults and clamps persisted values', () => {
    expect(loadPetPreferences()).toMatchObject({ enabled: true, scale: 2, remindersEnabled: true, unsavedMinutes: 15, breakMinutes: 60 })
    localStorage.setItem(PET_PREFERENCES_KEY, JSON.stringify({ scale: 99, unsavedMinutes: 1, breakMinutes: 999 }))
    expect(loadPetPreferences()).toMatchObject({ scale: 4, unsavedMinutes: 5, breakMinutes: 180 })
  })

  it('persists pet positions as normalized main-window coordinates', () => {
    savePetPosition('com.example.pet', 'companion', { x: 1.4, y: -0.3 })
    expect(loadPetPosition('com.example.pet', 'companion')).toEqual({ x: 1, y: 0 })
    savePetPreferences({ enabled: false, scale: 3, remindersEnabled: false, unsavedMinutes: 25, breakMinutes: 90 })
    expect(loadPetPreferences()).toMatchObject({ enabled: false, scale: 3, remindersEnabled: false, unsavedMinutes: 25, breakMinutes: 90 })
  })
})
