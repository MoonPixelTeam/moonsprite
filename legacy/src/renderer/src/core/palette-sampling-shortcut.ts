let active = false

export const beginPaletteSamplingShortcut = (): void => { active = true }
export const endPaletteSamplingShortcut = (): void => { active = false }
export const paletteSamplingShortcutActive = (): boolean => active
