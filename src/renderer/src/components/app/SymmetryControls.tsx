import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { RgbaColor } from '@shared/types-color'
import { ColorValueControl } from '@/components/ColorValueControl'
import { FormField } from '@/components/FormField'
import { NumberInput } from '@/components/NumberInput'
import { RangeField } from '@/components/RangeField'
import { MAX_SYMMETRY_AXIS_THICKNESS, MIN_SYMMETRY_AXIS_THICKNESS, loadEditorPreferences, saveEditorPreferences, type SymmetryAxisPreferences } from '@/core/file-preferences'
import type { SymmetryAxes, SymmetryMode } from '@/core/symmetry'
import { useI18n } from '@/components/I18nProvider'
import { PixelAssetIcon } from './editor-tools'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { Tooltip } from '@/components/Tooltip'
import symmetryDiagonalDownIcon from '@/assets/pixel-icons/symmetry-diagonal-down.svg'
import symmetryDiagonalUpIcon from '@/assets/pixel-icons/symmetry-diagonal-up.svg'
import symmetryHorizontalIcon from '@/assets/pixel-icons/symmetry-horizontal.svg'
import symmetryRotationalIcon from '@/assets/pixel-icons/symmetry-rotational.svg'
import symmetryVerticalIcon from '@/assets/pixel-icons/symmetry-vertical.svg'

interface SymmetryControlsProps {
  axes: SymmetryAxes
  onAxisToggle: (axis: SymmetryMode, enabled: boolean) => void
  onResetCenter: () => void
}

interface MenuPosition {
  left: number
  top: number
}

const SYMMETRY_AXES: Array<{ axis: SymmetryMode; icon: string; labelKey: 'toolOptions.symmetryHorizontal' | 'toolOptions.symmetryVertical' | 'toolOptions.symmetryDiagonalUp' | 'toolOptions.symmetryDiagonalDown' | 'toolOptions.symmetryRotational' }> = [
  { axis: 'horizontal', icon: symmetryHorizontalIcon, labelKey: 'toolOptions.symmetryHorizontal' },
  { axis: 'vertical', icon: symmetryVerticalIcon, labelKey: 'toolOptions.symmetryVertical' },
  { axis: 'diagonalUp', icon: symmetryDiagonalUpIcon, labelKey: 'toolOptions.symmetryDiagonalUp' },
  { axis: 'diagonalDown', icon: symmetryDiagonalDownIcon, labelKey: 'toolOptions.symmetryDiagonalDown' },
  { axis: 'rotational', icon: symmetryRotationalIcon, labelKey: 'toolOptions.symmetryRotational' }
]

const copySymmetryPreferences = (preferences: SymmetryAxisPreferences): SymmetryAxisPreferences => ({
  ...preferences,
  color: { ...preferences.color }
})

export function SymmetryControls({ axes, onAxisToggle, onResetCenter }: SymmetryControlsProps) {
  const { t } = useI18n()
  const [preferences, setPreferences] = useState<SymmetryAxisPreferences>(() => copySymmetryPreferences(loadEditorPreferences().symmetryAxis))
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [thicknessSliderOpen, setThicknessSliderOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition>({ left: 8, top: 8 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncPreferences = (): void => setPreferences(copySymmetryPreferences(loadEditorPreferences().symmetryAxis))
    window.addEventListener('moonsprite:preferences-changed', syncPreferences)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const closeOutside = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target) || event.target.closest('.color-editor-popover')) return
      setMenuOpen(false)
      setSettingsOpen(false)
      setThicknessSliderOpen(false)
    }
    const closeOnKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      setSettingsOpen(false)
      setThicknessSliderOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('keydown', closeOnKey, true)
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('keydown', closeOnKey, true)
    }
  }, [menuOpen])

  useLayoutEffect(() => {
    if (!menuOpen) return
    const placeMenu = (): void => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const menu = menuRef.current?.getBoundingClientRect()
      if (!trigger || !menu) return
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - menu.width - 8, trigger.left - 5)),
        top: trigger.bottom + 2
      })
    }
    placeMenu()
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [menuOpen, settingsOpen])

  const updatePreferences = (patch: Partial<SymmetryAxisPreferences>): void => {
    const current = loadEditorPreferences()
    const next: SymmetryAxisPreferences = {
      ...current.symmetryAxis,
      ...patch,
      color: patch.color ? { ...patch.color } : { ...current.symmetryAxis.color }
    }
    setPreferences(copySymmetryPreferences(next))
    saveEditorPreferences({ ...current, symmetryAxis: next })
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }

  const resetAxis = (): void => {
    onResetCenter()
    setMenuOpen(false)
    setSettingsOpen(false)
    setThicknessSliderOpen(false)
  }

  const toggleMenu = (): void => setMenuOpen((open) => {
    if (open) {
      setSettingsOpen(false)
      setThicknessSliderOpen(false)
    }
    return !open
  })

  const menu = menuOpen ? createPortal(
    <div ref={menuRef} className="symmetry-more-menu" role="menu" aria-label={t('toolOptions.symmetryMore')} style={{ left: position.left, top: position.top } as CSSProperties} onPointerDown={(event) => {
      event.stopPropagation()
      if (!(event.target instanceof Element) || !event.target.closest('.symmetry-thickness-input')) setThicknessSliderOpen(false)
    }}>
      <button type="button" role="menuitem" className="symmetry-more-item" onClick={resetAxis}>
        <PixelUtilityIcon kind="refresh" />
        <span>{t('toolOptions.resetSymmetryAxis')}</span>
      </button>
      <Tooltip className="symmetry-lock-tooltip" content={t('toolOptions.symmetryLockHint')}>
        <button type="button" role="menuitemcheckbox" aria-checked={preferences.locked} className="symmetry-more-item" onClick={() => updatePreferences({ locked: !preferences.locked })}>
          {preferences.locked ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}
          <span>{t(preferences.locked ? 'toolOptions.unlockSymmetryAxis' : 'toolOptions.lockSymmetryAxis')}</span>
        </button>
      </Tooltip>
      <button type="button" role="menuitem" aria-expanded={settingsOpen} className={`symmetry-more-item ${settingsOpen ? 'selected' : ''}`} onClick={() => setSettingsOpen((open) => {
        if (open) setThicknessSliderOpen(false)
        return !open
      })}>
        <PixelUtilityIcon kind="properties" />
        <span>{t('toolOptions.adjustSymmetryAxis')}</span>
      </button>
      {settingsOpen && <section className="symmetry-axis-settings" aria-label={t('toolOptions.adjustSymmetryAxis')}>
        <ColorValueControl color={preferences.color} density="regular" onChange={(color: RgbaColor) => updatePreferences({ color })} label={t('toolOptions.symmetryAxisColor')} roleLabel={t('toolOptions.symmetryAxisColor')} />
        <FormField className="symmetry-thickness-control" label={t('toolOptions.symmetryAxisThickness')}><div className="symmetry-thickness-input" onPointerDown={() => setThicknessSliderOpen(true)}><NumberInput aria-label={t('toolOptions.symmetryAxisThickness')} density="compact" min={MIN_SYMMETRY_AXIS_THICKNESS} max={MAX_SYMMETRY_AXIS_THICKNESS} suffix="px" value={preferences.thickness} live onValueChange={(thickness) => updatePreferences({ thickness })} onFocus={() => setThicknessSliderOpen(true)} />{thicknessSliderOpen && <div className="symmetry-thickness-slider" role="dialog" aria-label={t('toolOptions.symmetryAxisThickness')}><RangeField ariaLabel={t('toolOptions.symmetryAxisThickness')} density="compact" min={MIN_SYMMETRY_AXIS_THICKNESS} max={MAX_SYMMETRY_AXIS_THICKNESS} suffix="px" value={preferences.thickness} onChange={(thickness) => updatePreferences({ thickness })} /></div>}</div></FormField>
      </section>}
    </div>,
    document.body
  ) : null

  return <div className="symmetry-controls" role="group" aria-label={t('toolOptions.symmetry')}>
    <div className="symmetry-axis-buttons">
      {SYMMETRY_AXES.map((item) => {
        const selected = axes[item.axis]
        const label = t(item.labelKey)
        return <button key={item.axis} type="button" className={`symmetry-axis-button ${selected ? 'selected' : ''}`} title={label} aria-label={label} aria-pressed={selected} onClick={() => onAxisToggle(item.axis, !selected)}><PixelAssetIcon src={item.icon} /></button>
      })}
      <button ref={triggerRef} type="button" className={`icon-button symmetry-more-button ${menuOpen ? 'active' : ''}`} title={t('toolOptions.symmetryMore')} aria-label={t('toolOptions.symmetryMore')} aria-expanded={menuOpen} onClick={toggleMenu}><PixelUtilityIcon kind="more" /></button>
    </div>
    {menu}
  </div>
}
