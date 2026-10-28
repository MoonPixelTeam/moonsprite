# Timeline hidden G1

Existing legacy Window → Panels → Timeline is migrated as a mode of the layers panel, never its visibility switch. Source contracts: LayersPanel.tsx, useLayerPanelPreferences.tsx, LayerRowThumbnail.tsx, LayerRowMaskThumbnail.tsx, animation-thumbnail.ts and styles.css:2219–2238.

The native v2 snapshot includes timelineHidden; v1 omits it and preserves the current setting. The explicit native default shows the timeline. Existing native/legacy layout files are retained. No legacy JSON import/export UI exists in App.tsx or WorkspaceManagerDialog.tsx, so none is invented. Four-way tool rail remains unimplemented.

Source provenance coverage, application build, named workspace smoke and visual review must be reported separately. The known general workspace suite Home scrollbar fixture failure is not bypassed by this feature.
