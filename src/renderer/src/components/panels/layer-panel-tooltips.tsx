import type { useI18n } from '@/components/I18nProvider'

export function createLayerPanelTooltips(t: ReturnType<typeof useI18n>['t']) {
  const clippingMaskTooltip = (
    <>
      <strong>{t('layers.clippingMask')}</strong>
      <span>{t('layers.clippingMaskDescription')}</span>
      <small>{t('layers.clippingMaskUsage')}</small>
    </>
  )
  const layerMaskTooltip = (
    <>
      <strong>{t('core.document.layerMask')}</strong>
      <span>{t('layers.layerMaskDescription')}</span>
      <small>{t('layers.layerMaskUsage')}</small>
    </>
  )
  const emptyLayerMaskCelTooltip = (
    <>
      <strong>{t('core.document.layerMask')}</strong>
      <span>{t('layers.layerMaskEmptyCel')}</span>
    </>
  )

  return { clippingMaskTooltip, layerMaskTooltip, emptyLayerMaskCelTooltip }
}
