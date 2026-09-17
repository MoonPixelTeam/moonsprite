import type { BlendMode } from '@shared/types-color'
import type { TranslationKey } from '@/locales/contracts'
export function layerBlendOptions(t: (key: TranslationKey) => string): Array<{value: BlendMode; label: string}> {
  return [
    { value: 'normal', label: t('blend.normal') }, { value: 'darken', label: t('blend.darken') }, { value: 'multiply', label: t('blend.multiply') },
    { value: 'color-burn', label: t('blend.colorBurn') }, { value: 'linear-burn', label: t('blend.linearBurn') }, { value: 'lighten', label: t('blend.lighten') },
    { value: 'screen', label: t('blend.screen') }, { value: 'color-dodge', label: t('blend.colorDodge') }, { value: 'linear-dodge', label: t('blend.linearDodge') },
    { value: 'overlay', label: t('blend.overlay') }, { value: 'soft-light', label: t('blend.softLight') }, { value: 'hard-light', label: t('blend.hardLight') },
    { value: 'vivid-light', label: t('blend.vividLight') }, { value: 'linear-light', label: t('blend.linearLight') }, { value: 'pin-light', label: t('blend.pinLight') },
    { value: 'hard-mix', label: t('blend.hardMix') }, { value: 'difference', label: t('blend.difference') }, { value: 'exclusion', label: t('blend.exclusion') },
    { value: 'subtract', label: t('blend.subtract') }, { value: 'divide', label: t('blend.divide') }, { value: 'hue', label: t('blend.hue') },
    { value: 'saturation', label: t('blend.saturation') }, { value: 'color', label: t('blend.color') }, { value: 'luminosity', label: t('blend.luminosity') }
  ]

}
