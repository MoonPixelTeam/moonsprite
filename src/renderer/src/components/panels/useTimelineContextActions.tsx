import type { ShortcutId } from '@/core/shortcuts'
import { createPortal } from 'react-dom'
import { AnimationLoopSectionDialog } from '@/components/AnimationLoopSectionDialog'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { RangeField } from '@/components/RangeField'
import { Tooltip } from '@/components/Tooltip'
import { AnimationPlaybackMenu } from '@/components/AnimationPlaybackMenu'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AnimationLoopSection } from '@shared/types-animation'
import { type AnimationLoopSectionDraft } from '@/components/AnimationLoopSectionDialog'
import { animationMaskAt, animationMaskSlotAt, resolveAnimationMask } from '@/core/document-model'
import { animationCelKey, animationGroupMaskAt, ensureAnimationDocument, parseAnimationCelKey } from '@/core/animation'
import { resolveAnimationLoopSectionRange } from '@/core/animation-loop-sections'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { cachedCelHasContent } from './layer-timeline-thumbnails'
import type { LayerContextMenu, LayerCreateContextMenu, AnimationContextMenu, AnimationLoopSectionEditorState } from './layer-panel-contracts'

interface Options {
  timeline: import('@shared/types-animation').AnimationTimeline
  activeFrameIndex: number
  setContextMenu: import('react').Dispatch<import('react').SetStateAction<LayerContextMenu | null>>
  setLayerCreateMenu: import('react').Dispatch<import('react').SetStateAction<LayerCreateContextMenu | null>>
  session: DocumentSession
  celLookup: import('@/core/animation').AnimationCelLookup

  shortcutHint: (...ids: ShortcutId[]) => import('react').JSX.Element | null
  emptyLayerMaskCelTooltip: import('react').JSX.Element
  layerMaskTooltip: import('react').JSX.Element
}

export function useTimelineContextActions({
  timeline,
  activeFrameIndex,
  setContextMenu,
  setLayerCreateMenu,
  session,
  celLookup,
  shortcutHint,
  emptyLayerMaskCelTooltip,
  layerMaskTooltip
}: Options) {
  const { t } = useI18n()
  const store = useWorkspace.getState()
  const timelinePropertiesHistoryRef = useRef<{ documentId: string; kind: 'frame' | 'cel'; label: string } | null>(null)

  const [animationMenu, setAnimationMenu] = useState<AnimationContextMenu | null>(null)

  const animationMenuRef = useRef<HTMLDivElement>(null)

  const [animationMenuPosition, setAnimationMenuPosition] = useState({ left: 8, top: 8 })

  const [frameProperties, setFrameProperties] = useState<{ frameId: string; targetFrameIds: string[]; duration: number } | null>(null)

  const [loopSectionEditor, setLoopSectionEditor] = useState<AnimationLoopSectionEditorState | null>(null)

  const [celProperties, setCelProperties] = useState<{ layerId: string; frameId: string; targetKeys: string[]; opacity: number; zIndex: number } | null>(null)

  const commitPropertiesTransaction = useCallback((kind?: 'frame' | 'cel'): void => {
    const transaction = timelinePropertiesHistoryRef.current
    if (!transaction || (kind && transaction.kind !== kind)) return
    // Clear ownership before publishing a store update to avoid double commits.
    timelinePropertiesHistoryRef.current = null
    useWorkspace.getState().commitLayerPanelTransaction(transaction.documentId, transaction.label)
  }, [])

  const saveFrameProperties = useCallback((): void => {
    commitPropertiesTransaction('frame')
    setFrameProperties(null)
  }, [commitPropertiesTransaction])

  const saveCelProperties = useCallback((): void => {
    commitPropertiesTransaction('cel')
    setCelProperties(null)
  }, [commitPropertiesTransaction])

  useEffect(() => {
    setFrameProperties(null)
    setCelProperties(null)
    // Previews already changed the document; preserve them as one undo step
    // when the owning panel disappears or switches to a different document.
    return () => commitPropertiesTransaction()
  }, [session.document.id, commitPropertiesTransaction])

  useLayoutEffect(() => {
    if (!animationMenu || animationMenu.kind === 'playback') return
    const menu = animationMenuRef.current
    if (!menu) return
    const place = (): void => {
      const bounds = menu.getBoundingClientRect()
      setAnimationMenuPosition({
        left: Math.max(8, Math.min(animationMenu.x, window.innerWidth - bounds.width - 8)),
        top: Math.max(8, Math.min(animationMenu.y, window.innerHeight - bounds.height - 8))
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [animationMenu])

  const selectAnimationFrame = (frameId: string, mode: 'replace' | 'toggle' | 'range' = 'replace'): void => {
    store.selectAnimationFrame(frameId, mode)
  }

  const selectAnimationEdge = (edge: 'first' | 'last'): void => {
    const frame = edge === 'first' ? timeline.frames[0] : timeline.frames.at(-1)
    if (frame) selectAnimationFrame(frame.id)
  }

  const selectAnimationStep = (delta: number): void => {
    if (timeline.frames.length === 0 || delta === 0) return
    const lastIndex = timeline.frames.length - 1
    const nextIndex = activeFrameIndex + delta
    const index =
      delta > 0 ? ((nextIndex % timeline.frames.length) + timeline.frames.length) % timeline.frames.length : Math.max(0, Math.min(lastIndex, nextIndex))
    const frame = timeline.frames[index]
    if (frame) selectAnimationFrame(frame.id)
  }

  const openAnimationMenu = (event: React.MouseEvent<HTMLElement>, menu: AnimationContextMenu): void => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setLayerCreateMenu(null)
    setAnimationMenuPosition({ left: event.clientX, top: event.clientY })
    setAnimationMenu(menu)
  }

  const openFrameMenu = (event: React.MouseEvent<HTMLElement>, frameId: string): void => {
    if (!session.selectedAnimationFrameIds.includes(frameId)) selectAnimationFrame(frameId)
    openAnimationMenu(event, { kind: 'frame', frameId, x: event.clientX, y: event.clientY })
  }

  const useFrameMenuTarget = (action: () => void): void => {
    if (animationMenu?.kind !== 'frame') return
    if (ensureAnimationDocument(session.document).activeFrameId !== animationMenu.frameId) store.setActiveAnimationFrame(animationMenu.frameId)
    action()
    setAnimationMenu(null)
  }

  const openFrameProperties = (): void =>
    useFrameMenuTarget(() => {
      const frame = ensureAnimationDocument(session.document).frames.find(
        (candidate) => candidate.id === ensureAnimationDocument(session.document).activeFrameId
      )
      if (frame) {
        const targetFrameIds = session.selectedAnimationFrameIds.includes(frame.id) ? [...session.selectedAnimationFrameIds] : [frame.id]
        commitPropertiesTransaction()
        store.beginLayerPanelTransaction(session.document.id)
        timelinePropertiesHistoryRef.current = { documentId: session.document.id, kind: 'frame', label: t('workspace.history.animationFrameDuration') }
        setFrameProperties({ frameId: frame.id, targetFrameIds, duration: frame.duration })
      }
    })

  const openFramePropertiesFor = (frameId: string): void => {
    const frame = ensureAnimationDocument(session.document).frames.find((candidate) => candidate.id === frameId)
    if (!frame) return
    if (ensureAnimationDocument(session.document).activeFrameId !== frameId) store.setActiveAnimationFrame(frameId)
    const targetFrameIds = session.selectedAnimationFrameIds.includes(frame.id) ? [...session.selectedAnimationFrameIds] : [frame.id]
    commitPropertiesTransaction()
    store.beginLayerPanelTransaction(session.document.id)
    timelinePropertiesHistoryRef.current = { documentId: session.document.id, kind: 'frame', label: t('workspace.history.animationFrameDuration') }
    setFrameProperties({ frameId: frame.id, targetFrameIds, duration: frame.duration })
    setAnimationMenu(null)
  }

  const previewFrameProperties = (duration: number): void => {
    if (!frameProperties) return
    const next = { ...frameProperties, duration }
    setFrameProperties(next)
    // Frame properties apply as the value changes, matching layer-property
    // feedback. The subsequent Save only closes this already-applied dialog.
    if (ensureAnimationDocument(session.document).activeFrameId !== next.frameId) store.setActiveAnimationFrame(next.frameId)
    store.setActiveAnimationFrameDuration(next.duration)
  }

  const nextLoopSectionName = (): string => {
    const names = new Set((ensureAnimationDocument(session.document).loopSections ?? []).map((section) => section.name))
    let number = 1
    while (names.has(t('timeline.defaultLoopSectionName', { number }))) number += 1
    return t('timeline.defaultLoopSectionName', { number })
  }

  const openLoopSectionCreator = (): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const currentTimeline = ensureAnimationDocument(active.document)
    const selected = new Set(active.selectedAnimationFrameIds.length ? active.selectedAnimationFrameIds : [currentTimeline.activeFrameId])
    const indexes = currentTimeline.frames.flatMap((frame, index) => (selected.has(frame.id) ? [index] : []))
    if (indexes.length === 0) return
    setLoopSectionEditor({
      mode: 'create',
      value: {
        name: nextLoopSectionName(),
        startFrame: Math.min(...indexes) + 1,
        endFrame: Math.max(...indexes) + 1,
        direction: 'forward',
        repeatCount: null
      }
    })
    setAnimationMenu(null)
  }

  const openLoopSectionPropertiesFor = (sectionId: string): void => {
    const currentTimeline = ensureAnimationDocument(session.document)
    const section = (currentTimeline.loopSections ?? []).find((candidate) => candidate.id === sectionId)
    const range = section ? resolveAnimationLoopSectionRange(currentTimeline, section) : null
    if (!section || !range) return
    setLoopSectionEditor({
      mode: 'edit',
      sectionId,
      value: {
        name: section.name,
        startFrame: range.startIndex + 1,
        endFrame: range.endIndex + 1,
        direction: section.direction,
        repeatCount: section.repeatCount
      }
    })
    setAnimationMenu(null)
  }

  const saveLoopSection = (draft: AnimationLoopSectionDraft): void => {
    if (!loopSectionEditor) return
    const currentTimeline = ensureAnimationDocument(session.document)
    const startFrame = currentTimeline.frames[draft.startFrame - 1]
    const endFrame = currentTimeline.frames[draft.endFrame - 1]
    if (!startFrame || !endFrame) return
    const options = { name: draft.name, startFrameId: startFrame.id, endFrameId: endFrame.id, direction: draft.direction, repeatCount: draft.repeatCount }
    if (loopSectionEditor.mode === 'edit' && loopSectionEditor.sectionId) store.updateAnimationLoopSection(loopSectionEditor.sectionId, options)
    else store.createAnimationLoopSection(options)
    setLoopSectionEditor(null)
  }

  const selectLoopSection = (section: AnimationLoopSection): void => {
    const range = resolveAnimationLoopSectionRange(ensureAnimationDocument(session.document), section)
    if (!range) return
    store.selectAnimationFrame(range.startFrameId)
    if (range.endFrameId !== range.startFrameId) store.selectAnimationFrame(range.endFrameId, 'range')
  }

  const openLoopSectionMenu = (event: React.MouseEvent<HTMLElement>, sectionId: string): void => {
    openAnimationMenu(event, { kind: 'loop-section', sectionId, x: event.clientX, y: event.clientY })
  }

  const openCelProperties = (layerId: string, frameId: string): void => {
    const cel = celLookup.at(layerId, frameId)
    if (!cel) return
    const source = celLookup.resolve(cel) ?? cel
    const key = animationCelKey(layerId, frameId)
    const targetKeys = session.selectedAnimationCellKeys.includes(key) ? [...session.selectedAnimationCellKeys] : [key]
    if (!session.selectedAnimationCellKeys.includes(key)) store.selectAnimationCell(key)
    commitPropertiesTransaction()
    store.beginLayerPanelTransaction(session.document.id)
    timelinePropertiesHistoryRef.current = { documentId: session.document.id, kind: 'cel', label: t('workspace.history.animationCelProperties') }
    setCelProperties({ layerId, frameId, targetKeys, opacity: Math.round((source.opacity ?? 1) * 100), zIndex: source.zIndex ?? 0 })
    setAnimationMenu(null)
  }

  const previewCelProperties = (next: NonNullable<typeof celProperties>): void => {
    setCelProperties(next)
    store.setAnimationCelProperties(next.layerId, next.frameId, { opacity: next.opacity / 100, zIndex: next.zIndex }, next.targetKeys)
  }

  const openCelMenu = (event: React.MouseEvent<HTMLElement>, layerId: string, frameId: string, kind: 'cel' | 'mask' = 'cel'): void => {
    const key = animationCelKey(layerId, frameId)
    if (kind === 'mask') {
      if (!session.selectedAnimationMaskCellKeys.includes(key)) store.selectAnimationMaskCell(key)
    } else if (!session.selectedAnimationCellKeys.includes(key)) store.selectAnimationCell(key)
    openAnimationMenu(event, { kind, layerId, frameId, x: event.clientX, y: event.clientY })
  }

  const updateAnimationFrameDisabled = useCallback(
    (disabled: boolean | 'toggle'): void => {
      if (disabled === 'toggle') store.toggleSelectedAnimationFramesDisabled()
      else store.setSelectedAnimationFramesDisabled(disabled)
    },
    [store]
  )

  const animationMenuLoopSection =
    animationMenu?.kind === 'loop-section' ? ((timeline.loopSections ?? []).find((section) => section.id === animationMenu.sectionId) ?? null) : null

  const animationMenuFrameIds =
    animationMenu?.kind === 'frame'
      ? session.selectedAnimationFrameIds.includes(animationMenu.frameId) && session.selectedAnimationFrameIds.length > 0
        ? session.selectedAnimationFrameIds
        : [animationMenu.frameId]
      : []

  const animationMenuFramesAllDisabled =
    animationMenuFrameIds.length > 0 && animationMenuFrameIds.every((frameId) => timeline.frames.find((frame) => frame.id === frameId)?.disabled === true)

  const animationMenuCel = animationMenu?.kind === 'cel' || animationMenu?.kind === 'mask' ? celLookup.at(animationMenu.layerId, animationMenu.frameId) : null

  const animationMenuOwnerKind =
    animationMenu?.kind === 'cel' || animationMenu?.kind === 'mask'
      ? session.document.layers.some((layer) => layer.id === animationMenu.layerId)
        ? 'layer'
        : session.document.groups.some((group) => group.id === animationMenu.layerId)
          ? 'group'
          : null
      : null

  const animationMenuGroupMask =
    animationMenu?.kind === 'mask' && !animationMenuCel ? animationGroupMaskAt(timeline, animationMenu.layerId, animationMenu.frameId) : null

  const animationMenuMask = animationMenu?.kind === 'mask' ? animationMaskAt(timeline, animationMenu.layerId, animationMenu.frameId) : null

  const animationMenuCelMask = animationMenu?.kind === 'cel' ? animationMaskAt(timeline, animationMenu.layerId, animationMenu.frameId) : null

  const animationMenuCelHasContent = cachedCelHasContent(
    celLookup.resolve(animationMenuCel),
    session.document.palette,
    animationMenu?.kind === 'cel' || animationMenu?.kind === 'mask' ? (animationMenu.frameId === timeline.activeFrameId ? session.contentRevision : 0) : 0
  )

  const animationMenuLayerMaskCreationBlocked = animationMenuOwnerKind === 'layer' && !animationMenuMask && !animationMenuCelMask && !animationMenuCelHasContent

  const animationMenuLayerMaskPasteBlocked = animationMenuOwnerKind === 'layer' && !animationMenuCelHasContent

  const selectedAnimationCelsCanLink =
    animationMenu?.kind === 'cel' &&
    (() => {
      const selected = new Set(session.selectedAnimationCellKeys)
      const targets = timeline.cels.filter((cel) => selected.has(animationCelKey(cel.layerId, cel.frameId)))
      if (
        targets.length < 2 ||
        !targets.some((cel) =>
          cachedCelHasContent(celLookup.resolve(cel), session.document.palette, cel.frameId === timeline.activeFrameId ? session.contentRevision : 0)
        )
      )
        return false
      const counts = new Map<string, number>()
      for (const cel of targets) counts.set(cel.layerId, (counts.get(cel.layerId) ?? 0) + 1)
      return [...counts.values()].some((count) => count > 1)
    })()

  const selectedAnimationCelsCanUnlink =
    animationMenu?.kind === 'cel' &&
    (() => {
      const selected = new Set(session.selectedAnimationCellKeys)
      return timeline.cels.some((cel) => {
        if (!selected.has(animationCelKey(cel.layerId, cel.frameId))) return false
        const source = celLookup.resolve(cel)
        return (
          Boolean(cel.linkedCelId) ||
          Boolean(source && timeline.cels.some((candidate) => candidate.id !== source.id && celLookup.resolve(candidate)?.id === source.id))
        )
      })
    })()

  const selectedAnimationMasksCanLink =
    animationMenu?.kind === 'mask' &&
    (() => {
      const counts = new Map<string, number>()
      for (const key of session.selectedAnimationMaskCellKeys) {
        const target = parseAnimationCelKey(key)
        if (!target || !animationMaskSlotAt(timeline, target.layerId, target.frameId)) continue
        counts.set(target.layerId, (counts.get(target.layerId) ?? 0) + 1)
      }
      return [...counts.values()].some((count) => count > 1)
    })()

  const selectedAnimationMasksCanUnlink =
    animationMenu?.kind === 'mask' &&
    (() => {
      const selected = new Set(session.selectedAnimationMaskCellKeys)
      const masks = [
        ...(timeline.layerMasks ?? []).map((entry) => ({ key: animationCelKey(entry.layerId, entry.frameId), mask: entry.mask })),
        ...(timeline.groupMasks ?? []).map((entry) => ({ key: animationCelKey(entry.groupId, entry.frameId), mask: entry.mask }))
      ]
      const selectedRoots = new Set(masks.flatMap((item) => (selected.has(item.key) ? [resolveAnimationMask(timeline, item.mask)?.id ?? item.mask.id] : [])))
      return masks.some((item) =>
        Boolean(item.mask.linkedMaskId && (selected.has(item.key) || selectedRoots.has(resolveAnimationMask(timeline, item.mask)?.id ?? '')))
      )
    })()
  const timelineContextSurfaces = (
    <>
      {animationMenu?.kind === 'playback' && (
        <AnimationPlaybackMenu session={session} x={animationMenu.x} y={animationMenu.y} onClose={() => setAnimationMenu(null)} />
      )}
      {animationMenu &&
        animationMenu.kind !== 'playback' &&
        createPortal(
          <div
            ref={animationMenuRef}
            className="context-menu animation-context-menu"
            role="menu"
            aria-label={t(
              animationMenu.kind === 'frame' ? 'timeline.frameMenu' : animationMenu.kind === 'loop-section' ? 'timeline.loopSectionMenu' : 'timeline.celMenu'
            )}
            style={animationMenuPosition}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {animationMenu.kind === 'frame' ? (
              <>
                <button className="context-menu-item" type="button" role="menuitem" onClick={openLoopSectionCreator}>
                  <PixelUtilityIcon kind="link" />
                  <span>{t('timeline.createLoopSection')}</span>
                  {shortcutHint('createAnimationLoopSection')}
                </button>
                <button className="context-menu-item" type="button" role="menuitem" onClick={openFrameProperties}>
                  <PixelUtilityIcon kind="info" />
                  <span>{t('timeline.frameProperties')}</span>
                  {shortcutHint('openAnimationFrameProperties')}
                </button>
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    updateAnimationFrameDisabled(!animationMenuFramesAllDisabled)
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind={animationMenuFramesAllDisabled ? 'eye' : 'eyeOff'} />
                  <span>{t(animationMenuFramesAllDisabled ? 'timeline.enableFrame' : 'timeline.disableFrame')}</span>
                </button>
                <span className="context-menu-divider" />
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    store.copySelectedAnimationFrames()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="copy" />
                  <span>{t('timeline.copyFrame')}</span>
                  {shortcutHint('copyAnimationFrames', 'copy')}
                </button>
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!session.animationFrameClipboard.length}
                  onClick={() => {
                    store.pasteAnimationFrames()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="paste" />
                  <span>{t('timeline.pasteFrame')}</span>
                  {shortcutHint('pasteAnimationFrames', 'paste')}
                </button>
                <span className="context-menu-divider" />
                <button className="context-menu-item" type="button" role="menuitem" onClick={() => useFrameMenuTarget(() => store.duplicateAnimationFrame())}>
                  <PixelUtilityIcon kind="copy" />
                  <span>{t('timeline.addFrame')}</span>
                  {shortcutHint('addAnimationFrame')}
                </button>
                <button className="context-menu-item" type="button" role="menuitem" onClick={() => useFrameMenuTarget(() => store.addAnimationFrame())}>
                  <PixelUtilityIcon kind="paste" />
                  <span>{t('timeline.addBlankFrame')}</span>
                  {shortcutHint('addBlankAnimationFrame')}
                </button>
                <button
                  className="context-menu-item danger"
                  type="button"
                  role="menuitem"
                  disabled={timeline.frames.length <= 1}
                  onClick={() => useFrameMenuTarget(() => store.deleteSelectedAnimationItems())}
                >
                  <PixelUtilityIcon kind="delete" />
                  <span>{t('timeline.deleteFrame')}</span>
                  {shortcutHint('deleteAnimationFrame', 'deleteLayer')}
                </button>
              </>
            ) : animationMenu.kind === 'loop-section' ? (
              <>
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!animationMenuLoopSection}
                  onClick={() => {
                    if (animationMenuLoopSection) store.playAnimationLoopSection(animationMenuLoopSection.id)
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="right" />
                  <span>{t('timeline.playLoopSection')}</span>
                  {shortcutHint('playAnimationLoopSection')}
                </button>
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!animationMenuLoopSection}
                  onClick={() => {
                    if (animationMenuLoopSection) openLoopSectionPropertiesFor(animationMenuLoopSection.id)
                  }}
                >
                  <PixelUtilityIcon kind="properties" />
                  <span>{t('timeline.loopSectionProperties')}</span>
                  {shortcutHint('openAnimationLoopSectionProperties')}
                </button>
                <span className="context-menu-divider" />
                <button
                  className="context-menu-item danger"
                  type="button"
                  role="menuitem"
                  disabled={!animationMenuLoopSection}
                  onClick={() => {
                    if (animationMenuLoopSection) store.deleteAnimationLoopSection(animationMenuLoopSection.id)
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="delete" />
                  <span>{t('timeline.deleteLoopSection')}</span>
                  {shortcutHint('deleteAnimationLoopSection')}
                </button>
              </>
            ) : animationMenu.kind === 'mask' ? (
              <>
                <Tooltip className="layer-menu-tooltip" content={animationMenuLayerMaskCreationBlocked ? emptyLayerMaskCelTooltip : layerMaskTooltip}>
                  <button
                    className="context-menu-item"
                    type="button"
                    role="menuitem"
                    disabled={animationMenuLayerMaskCreationBlocked}
                    onClick={() => {
                      if (animationMenuOwnerKind === 'layer') {
                        if (animationMenuMask) store.deleteSelectedLayerMasks()
                        else store.createLayerMask(animationMenuCel?.id ?? animationMenu.layerId, animationMenu.frameId)
                      } else if (animationMenuOwnerKind === 'group') {
                        if (animationMenuGroupMask) store.deleteGroupMask(animationMenu.layerId, animationMenu.frameId)
                        else store.createGroupMask(animationMenu.layerId, animationMenu.frameId)
                      }
                      setAnimationMenu(null)
                    }}
                  >
                    <PixelUtilityIcon kind="layerMask" />
                    <span>
                      {t(
                        animationMenuOwnerKind === 'layer'
                          ? animationMenuMask
                            ? 'layers.deleteLayerMask'
                            : 'layers.createLayerMask'
                          : animationMenuGroupMask
                            ? 'layers.deleteLayerGroupMask'
                            : 'layers.createLayerGroupMask'
                      )}
                    </span>
                    {shortcutHint('toggleAnimationMask')}
                  </button>
                </Tooltip>
                {animationMenuMask && (
                  <button
                    className="context-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (animationMenuOwnerKind === 'layer' && animationMenuCel)
                        store.setLayerMaskMoveWithOwner(animationMenuCel.id, animationMenuMask.moveWithOwner === false)
                      else if (animationMenuOwnerKind === 'group')
                        store.setGroupMaskMoveWithOwner(animationMenu.layerId, animationMenu.frameId, animationMenuMask.moveWithOwner === false)
                      setAnimationMenu(null)
                    }}
                  >
                    <PixelUtilityIcon kind="link" />
                    <span>{t(animationMenuMask.moveWithOwner === false ? 'layers.enableLayerMaskMoveBinding' : 'layers.disableLayerMaskMoveBinding')}</span>
                  </button>
                )}
                <span className="context-menu-divider" />
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!animationMenuMask}
                  onClick={() => {
                    store.copySelectedAnimationMasks()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="copy" />
                  <span>{t('timeline.copyMask')}</span>
                  {shortcutHint('copyAnimationMasks')}
                </button>
                <Tooltip className="layer-menu-tooltip" content={animationMenuLayerMaskPasteBlocked ? emptyLayerMaskCelTooltip : undefined}>
                  <button
                    className="context-menu-item"
                    type="button"
                    role="menuitem"
                    disabled={!session.animationMaskClipboard.length || animationMenuLayerMaskPasteBlocked}
                    onClick={() => {
                      store.pasteAnimationMasks(animationMenu.layerId, animationMenu.frameId)
                      setAnimationMenu(null)
                    }}
                  >
                    <PixelUtilityIcon kind="paste" />
                    <span>{t('timeline.pasteMask')}</span>
                    {shortcutHint('pasteAnimationMasks')}
                  </button>
                </Tooltip>
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!selectedAnimationMasksCanLink}
                  onClick={() => {
                    store.connectSelectedAnimationMasks()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="link" />
                  <span>{t('timeline.connectMask')}</span>
                  {shortcutHint('connectAnimationMasks')}
                </button>
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!selectedAnimationMasksCanUnlink}
                  onClick={() => {
                    store.disconnectSelectedAnimationMasks()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="link" />
                  <span>{t('timeline.disconnectMask')}</span>
                  {shortcutHint('disconnectAnimationMasks')}
                </button>
              </>
            ) : (
              <>
                <Tooltip className="layer-menu-tooltip" content={animationMenuLayerMaskCreationBlocked ? emptyLayerMaskCelTooltip : layerMaskTooltip}>
                  <button
                    className="context-menu-item"
                    type="button"
                    role="menuitem"
                    disabled={animationMenuLayerMaskCreationBlocked}
                    onClick={() => {
                      if (animationMenuOwnerKind !== 'layer') return
                      if (animationMenuCelMask && animationMenuCel) store.deleteLayerMask(animationMenuCel.id)
                      else store.createLayerMask(animationMenuCel?.id ?? animationMenu.layerId, animationMenu.frameId)
                      setAnimationMenu(null)
                    }}
                  >
                    <PixelUtilityIcon kind="layerMask" />
                    <span>{t(animationMenuCelMask ? 'layers.deleteLayerMask' : 'layers.createLayerMask')}</span>
                    {shortcutHint('toggleAnimationMask')}
                  </button>
                </Tooltip>
                <span className="context-menu-divider" />
                <Tooltip className="layer-menu-tooltip" content={animationMenuLayerMaskPasteBlocked ? emptyLayerMaskCelTooltip : undefined}>
                  <button
                    className="context-menu-item"
                    type="button"
                    role="menuitem"
                    disabled={!session.animationMaskClipboard.length || animationMenuLayerMaskPasteBlocked}
                    onClick={() => {
                      store.pasteAnimationMasks(animationMenu.layerId, animationMenu.frameId)
                      setAnimationMenu(null)
                    }}
                  >
                    <PixelUtilityIcon kind="paste" />
                    <span>{t('timeline.pasteMask')}</span>
                    {shortcutHint('pasteAnimationMasks')}
                  </button>
                </Tooltip>
                <span className="context-menu-divider" />
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!animationMenuCel}
                  onClick={() => openCelProperties(animationMenu.layerId, animationMenu.frameId)}
                >
                  <PixelUtilityIcon kind="info" />
                  <span>{t('timeline.celProperties')}</span>
                  {shortcutHint('openAnimationCelProperties')}
                </button>
                <span className="context-menu-divider" />
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!animationMenuCelHasContent}
                  onClick={() => {
                    store.copySelectedAnimationCels()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="copy" />
                  <span>{t('timeline.copyCel')}</span>
                  {shortcutHint('copy', 'copyAnimationCel')}
                </button>
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!session.animationCellClipboard.length}
                  onClick={() => {
                    store.pasteAnimationCels()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="paste" />
                  <span>{t('timeline.pasteCel')}</span>
                  {shortcutHint('pasteAnimationCels', 'paste')}
                </button>
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!selectedAnimationCelsCanLink}
                  onClick={() => {
                    store.connectSelectedAnimationCels()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="link" />
                  <span>{t('timeline.connectCel')}</span>
                  {shortcutHint('connectAnimationCels')}
                </button>
                <button
                  className="context-menu-item"
                  type="button"
                  role="menuitem"
                  disabled={!selectedAnimationCelsCanUnlink}
                  onClick={() => {
                    store.disconnectSelectedAnimationCels()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="link" />
                  <span>{t('timeline.disconnectCel')}</span>
                  {shortcutHint('disconnectAnimationCels')}
                </button>
                <button
                  className="context-menu-item danger"
                  type="button"
                  role="menuitem"
                  disabled={!animationMenuCelHasContent}
                  onClick={() => {
                    store.deleteSelectedAnimationItems()
                    setAnimationMenu(null)
                  }}
                >
                  <PixelUtilityIcon kind="delete" />
                  <span>{t('timeline.deleteCel')}</span>
                  {shortcutHint('deleteAnimationFrame', 'deleteLayer')}
                </button>
              </>
            )}
          </div>,
          document.body
        )}
      {loopSectionEditor && (
        <AnimationLoopSectionDialog
          mode={loopSectionEditor.mode}
          frameCount={timeline.frames.length}
          initialValue={loopSectionEditor.value}
          onClose={() => setLoopSectionEditor(null)}
          onConfirm={saveLoopSection}
        />
      )}
      {frameProperties &&
        createPortal(
          <div className="modal-backdrop dialog-backdrop" role="presentation">
            <ModalShell
              as="form"
              storageKey="animation-frame-properties"
              defaultWidth={340}
              defaultHeight={224}
              minWidth={300}
              minHeight={210}
              maxWidth={440}
              maxHeight={300}
              className="layer-modal frame-properties-modal"
              onSubmit={(event) => {
                event.preventDefault()
                saveFrameProperties()
              }}
            >
              <DialogHeader
                eyebrow="FRAME PROPERTIES"
                title={
                  frameProperties.targetFrameIds.length > 1
                    ? t('timeline.multipleFrameProperties')
                    : t('timeline.framePropertiesNumbered', { number: timeline.frames.findIndex((frame) => frame.id === frameProperties.frameId) + 1 })
                }
                closeLabel={t('common.close')}
                onClose={saveFrameProperties}
              />
              <div className="modal-body">
                <FormField layout="inline" label={t('timeline.duration')}>
                  <NumberInput
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label={t('timeline.duration')}
                    value={frameProperties.duration}
                    min={1}
                    max={60_000}
                    step={10}
                    suffix="ms"
                    onValueChange={previewFrameProperties}
                  />
                </FormField>
              </div>
              <footer>
                <button type="button" className="primary-button" onClick={saveFrameProperties}>
                  {t('common.close')}
                </button>
              </footer>
            </ModalShell>
          </div>,
          document.body
        )}
      {celProperties &&
        createPortal(
          <div className="modal-backdrop dialog-backdrop" role="presentation">
            <ModalShell
              as="form"
              storageKey="animation-cel-properties"
              defaultWidth={340}
              defaultHeight={224}
              minWidth={300}
              minHeight={210}
              maxWidth={440}
              maxHeight={300}
              className="layer-modal frame-properties-modal"
              onSubmit={(event) => {
                event.preventDefault()
                saveCelProperties()
              }}
              onKeyDown={(event) => {
                if (event.defaultPrevented || event.key !== 'Enter' || event.nativeEvent.isComposing) return
                event.preventDefault()
                event.stopPropagation()
                saveCelProperties()
              }}
            >
              <DialogHeader
                eyebrow="CEL PROPERTIES"
                title={
                  celProperties.targetKeys.length > 1
                    ? t('timeline.multipleCelProperties')
                    : t('timeline.celPropertiesNumbered', { number: timeline.frames.findIndex((frame) => frame.id === celProperties.frameId) + 1 })
                }
                closeLabel={t('common.close')}
                onClose={saveCelProperties}
              />
              <div className="modal-body">
                <RangeField
                  autoFocus
                  className="layer-opacity-control"
                  label={t('layers.opacity')}
                  min={0}
                  max={100}
                  suffix="%"
                  value={celProperties.opacity}
                  onChange={(opacity) => previewCelProperties({ ...celProperties, opacity })}
                />
                <FormField layout="inline" label={t('timeline.zCoordinate')}>
                  <NumberInput
                    aria-label={t('timeline.zCoordinate')}
                    value={celProperties.zIndex}
                    min={-999}
                    max={999}
                    step={1}
                    onValueChange={(zIndex) => previewCelProperties({ ...celProperties, zIndex })}
                  />
                </FormField>
              </div>
              <footer>
                <button type="button" className="primary-button" onClick={saveCelProperties}>
                  {t('common.close')}
                </button>
              </footer>
            </ModalShell>
          </div>,
          document.body
        )}
    </>
  )

  return {
    timelineContextSurfaces,
    setAnimationMenu,
    closeFrameProperties: saveFrameProperties,
    closeCelProperties: saveCelProperties,
    selectAnimationFrame,
    selectAnimationEdge,
    selectAnimationStep,
    openAnimationMenu,
    openFrameMenu,
    openFramePropertiesFor,
    openLoopSectionCreator,
    openLoopSectionPropertiesFor,
    selectLoopSection,
    openLoopSectionMenu,
    openCelProperties,
    openCelMenu,
    updateAnimationFrameDisabled
  }
}
