export const PREVIEW_ZOOM_SHORTCUT_EVENT = 'moonsprite:preview-zoom-shortcut'

export interface PreviewZoomShortcutDetail {
  zoom: number
  pointer?: { x: number; y: number }
}
