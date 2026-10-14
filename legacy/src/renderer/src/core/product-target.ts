/** Build target is injected by Vite; tests may override it with vi.stubEnv. */
export const isWebTrial = (): boolean => import.meta.env.VITE_MOONSPRITE_TARGET === 'web-trial'
