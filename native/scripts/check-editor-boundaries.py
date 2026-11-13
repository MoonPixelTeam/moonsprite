"""Conservative owned-source include checks; not a C++ preprocessor/type analysis."""
from pathlib import Path
import posixpath
import re


def source_graph(native):
    src = native / "src"
    files = {p.relative_to(src).as_posix(): p for p in src.rglob("*")
             if p.suffix in {".h", ".hpp", ".cpp", ".c"}}
    errors = []
    normalized = {name.casefold(): name for name in files}
    if len(normalized) != len(files):
        errors.append("Owned source paths collide under Windows case folding")
    graph = {}
    headers = {}
    for name, path in files.items():
        source = path.read_text(encoding="utf-8")
        includes = re.findall(r'^\s*#include\s+["<]([^"<>\n]+)[">]', source, re.M)
        includes = [item.replace("\\", "/") for item in includes]
        resolved = []
        for item in includes:
            for candidate in (posixpath.normpath(posixpath.join(posixpath.dirname(name), item)), posixpath.normpath(item)):
                if candidate.casefold() in normalized:
                    resolved.append(normalized[candidate.casefold()])
                    break
        graph[name] = resolved
        headers[name] = includes
    return files, graph, headers, errors


def inspect(native):
    files, graph, headers, errors = source_graph(native)
    for name in files:
        includes = headers[name]
        resolved = graph[name]
        basename = posixpath.basename(name).casefold()
        for target in resolved:
            if posixpath.basename(target).casefold().startswith("editor") and not basename.startswith(("editor", "main")):
                errors.append(f"{name}: lower layer depends on Editor: {target}")
        for item in includes:
            if posixpath.basename(item).casefold() in {"editor_implementation.h", "editor_support.h"}:
                errors.append(f"{name}: retired Editor dependency bundle: {item}")
            if item.casefold().endswith((".cpp", ".c")):
                errors.append(f"{name}: implementation include {item}")
            if posixpath.basename(item).casefold().startswith("editor") and not basename.startswith(("editor", "main")):
                errors.append(f"{name}: lower layer depends on Editor: {item}")
        if basename.startswith(("document", "timeline_model", "layer_compositor", "cel_properties", "editor_recovery")) and "dialog" not in basename:
            for item in includes:
                if item.casefold().startswith(("ui/", "os/", "native_widgets", "editor.h", "editor_support")):
                    errors.append(f"{name}: document/recovery layer depends on UI: {item}")

    visiting, visited = set(), set()
    def visit(name, chain):
        if name in visiting:
            errors.append("Include cycle: " + " -> ".join(chain + [name]))
            return
        if name in visited:
            return
        visiting.add(name)
        for target in graph[name]:
            visit(target, chain + [name])
        visiting.remove(name)
        visited.add(name)
    for name in graph:
        visit(name, [])

    # These adapters compile their public declaration first. Shared UI diagnostics
    # must not pull Editor implementation/support widgets back in transitively.
    standalone_adapters = {
        "extension_install_dialog.cpp": "extension_install_dialog.h",
        "extension_menu_adapter.cpp": "extension_menu_adapter.h",
        "extension_panel_host.cpp": "extension_panel_host.h",
        "extension_preferences.cpp": "extension_preferences.h",
        "extension_settings_dialog.cpp": "extension_settings_dialog.h",
        "editor_frame_capture.cpp": "ui_frame_capture.h",
        "preview_panel.cpp": "preview_panel.h",
        "floating_column_surface.cpp": "floating_column_surface.h",
        "pixel_theme.cpp": "pixel_theme.h",
        "curve_editor_native.cpp": "curve_editor_native.h",
        "sprite_sheet_preview.cpp": "sprite_sheet_preview.h",
        "tool_property_popup.cpp": "tool_property_popup.h",
        "loop_number_entry.cpp": "loop_number_entry.h",
        "frame_duration_palette_entry.cpp": "frame_duration_palette_entry.h",
        "layer_label_separator.cpp": "layer_label_separator.h",
    }
    for name, header in standalone_adapters.items():
        includes = re.findall(r'^\s*#include\s+["<]([^"<>\n]+)[">]', files[name].read_text(encoding="utf-8"), re.M)
        if not includes or includes[0] != header:
            errors.append(f"{name}: compile its own declaration first: {header}")
        reachable = set()
        pending = [name]
        while pending:
            target = pending.pop()
            if target in reachable:
                continue
            reachable.add(target)
            pending.extend(graph[target])
        forbidden = reachable & {"editor.h", "editor_implementation.h", "editor_support.h"}
        if forbidden:
            errors.append(f"{name}: shared UI adapter reaches Editor: {', '.join(sorted(forbidden))}")

    widgets = files["native_widgets.h"].read_text(encoding="utf-8")
    if re.search(r"timeline(?:Cel|Selected|ParentPainted|DisplayColor|CaptionPadding)", widgets):
        errors.append("Shared buttons must not own timeline-specific view state")
    main = files["main.cpp"].read_text(encoding="utf-8")
    declaration = files["editor.h"].read_text(encoding="utf-8")
    if '#include "editor_support.h"' in declaration or '#include "editor_implementation.h"' in declaration:
        errors.append("Editor declaration must not import its implementation/support widgets")
    lifecycle_includes = re.findall(r'^\s*#include\s+"([^"\n]+)"', files["editor_lifecycle.cpp"].read_text(encoding="utf-8"), re.M)
    if not lifecycle_includes or lifecycle_includes[0] != "editor.h":
        errors.append("Compile Editor declaration first to detect hidden include-order dependencies")
    # Typed member-function pointers are dispatch data, not implementations.
    if re.search(r'\bclass\s+Editor\b[^;{]*\{|\bEditor::\w+\s*\([^;{]*\)\s*(?:const\s*)?(?:->[^;{]+)?\{|\bvoid\s+smoke\w*\s*\(', main):
        errors.append("main.cpp must contain startup/CLI dispatch, not Editor implementation")
    recovery = files["editor_session.cpp"].read_text(encoding="utf-8")
    if re.search(r'std::swap\(document,\*slot.stored\)', recovery):
        errors.append("Inactive recovery must operate on its document, not swap active Editor state")
    declaration = files["editor.h"].read_text(encoding="utf-8")
    retired_view_fields = ("canvas_", "zoom_", "viewRotation_", "tileRepeat_", "layerScroll_",
                           "frameScroll_", "layerScrollRemainder_", "frameScrollRemainder_",
                           "paletteScrollPixels_", "frameSelectionExplicit_",
                           "timelineSelectionGuidesVisible_", "recentColors_", "selectionPivot_",
                           "drawingAnchor_", "drawingAnchorVisible_", "drawFromCanvasCenter_",
                           "showSelectionOutline_", "selectionOutlineIdentity_", "luminanceDocumentIdentity_",
                           "selectionPivotVisible_", "paletteScrollXPixels_",
                           "playing_", "loopPlayback_", "playbackTagMode_", "playbackModeLoop_",
                           "playbackSessionMode_", "playbackModeIdentity_", "playbackTagCycle_", "playbackObservedFrame_",
                           "playbackIdentity_", "playbackRevision_", "playbackDue_", "playbackRate_",
                           "playbackReturnToStart_", "playbackStartFrame_",
                           "selectedMaskSlots_", "maskSelectionAnchor_", "maskSelectionIdentity_", "maskSelectionSerial_",
                           "virtualSlots_", "virtualAnchor_", "recentColorsIdentity_",
                           "selectionPivotIdentity_", "selectionPivotMask_", "selectionPivotObservedRevision_",
                           "trimPivotIdentity_", "trimPivotSerial_", "selectionFreeTransform_")
    for field in retired_view_fields:
        if re.search(r'\b' + re.escape(field) + r'\s*(?:[=,;{])', declaration):
            errors.append(f"Session view must not regain a duplicate Editor field: {field}")
    retired_tool_fields = ("selectionTool_", "shapeTool_", "eyedropperTool_", "zoomTool_",
                           "gradientTool_", "fillTool_", "handTool_", "eraser_", "moveTool_",
                           "textTool_", "rotateTool_", "smoothTool_", "airbrushTool_", "liquifyTool_",
                           "magicEraserTool_", "sliceMode_", "selectionMode_", "selectionKind_",
                           "selectionRounded_", "selectionCornerRadius_", "selectionRotSprite_",
                           "selectionBrushAngle_", "wandOptions_", "shapeRounded_", "shapeRatio_",
                           "shapeRadius_", "shapeRatioWidth_", "shapeRatioHeight_", "curveAnchorCount_",
                           "fillOptions_", "fillPattern_", "fillLibrarySelection_", "fillImageName_",
                           "rememberGradientTool_", "gradientOptions_", "gradientStops_",
                           "gradientConfirm_", "gradientFreeform_", "brushProfiles_", "inkProfiles_",
                           "syncInkAcrossTools_", "pencilImageBrushId_", "pencilImageBrushAngle_",
                           "pencilImageBrush_", "brushDynamics_", "airbrushSettings_", "liquifyOptions_",
                           "smoothStrength_", "smoothAngle_", "smoothBrush_", "temporaryBrushReturnProfile_",
                           "temporaryBrushCapture_", "temporaryBrushActive_", "moveAutoSelect_",
                           "eyedropperSource_", "magicEraserContiguous_")
    for field in retired_tool_fields:
        if re.search(r'\b' + re.escape(field) + r'\s*(?:[=,;{])', declaration):
            errors.append(f"Session tools must not regain a duplicate Editor field: {field}")
    if re.search(r'\b(?:captureToolSession|restoreToolSession)\s*\(', declaration + recovery):
        errors.append("Tab switching must select session tools, not capture/restore field lists")
    if re.search(r'std::optional\s*<\s*workspace::ToolSessionState\s*>', declaration):
        errors.append("Session tools must be direct values, not optional transfer snapshots")
    refresh = files["editor_refresh.cpp"].read_text(encoding="utf-8").split("void Editor::syncDocumentViewState", 1)[1]
    if re.search(r'\.freeTransform\b|\bselectionFreeTransform_\b', refresh):
        errors.append("Refresh must not coordinate floating transform lifecycle")
    if re.search(r'\b(?:selectionPivotHistory|projectSelectionPivotHistory)\s*\(|\.pivotHistory(?:Serial|Identity)\b', refresh):
        errors.append("Refresh must not bind or consume selection pivot history")
    if re.search(r'\.pivot(?:ObservedRevision|Identity|Mask)\b|\.pivot\s*\.\s*reset\s*\(|\bprojectOrdinarySelectionPivot\s*\(', refresh):
        errors.append("Refresh must not coordinate ordinary selection pivots")
    if re.search(r'\b(?:buildSpriteSheetImage|updateSpriteSheetPreview|spriteSheetPreviewTick)\s*\(|\bsheetPreviewTimer_\b', refresh):
        errors.append("Refresh must not compose or schedule sprite-sheet previews")
    if re.search(r'currentView\(\)\.recent\s*=|\brecentDrag_\.reset\s*\(', refresh):
        errors.append("Refresh must not reset session recent colors")
    if re.search(r'\b(?:maskSelectionHistory|projectMaskSelectionHistory|bindTimelineSelection)\s*\(', refresh) or re.search(r'\.mask(?:Serial|Identity)\b', refresh):
        errors.append("Refresh must not bind or consume mask selection history")
    if re.search(r'\breplaceDocumentForSmoke\s*\(\s*Document\s*(?:[A-Za-z_]\w*\s*)?\)', declaration):
        errors.append("Document fixture replacement must not add a by-value stack temporary")
    if re.search(r'\b(?:currentPlayback|observePlaybackChange|initializePlaybackMode|bindPlaybackObservation|bindSessionAnimationObservation|replaceDocumentForSmoke|retargetTagPlayback)\s*\(', refresh):
        errors.append("Refresh must not initialize or coordinate playback lifecycle")
    for name, path in files.items():
        if name.startswith("editor") and name.endswith(".cpp") and name != "editor_session.cpp":
            if re.search(r'currentDocument\(\)\s*=(?!=)', path.read_text(encoding="utf-8")):
                errors.append(f"{name}: Document replacement must use explicit session binding")
    if re.search(r'\bsaveLayerPanelState\s*\(', refresh):
        errors.append("Refresh must not schedule durable panel state writes")
    if re.search(r'\b(?:initializeDocking|bindTileRepeat|bindProjectDocument|setFloatingRepeat|setDeferredFloatingDisplaySupported)\s*\(', refresh):
        errors.append("Refresh must not initialize docking or bind document display policy")
    if re.search(r'\.(?:setHistoryEntryLimit|setPaletteColorSynchronization)\(', refresh):
        errors.append("Refresh must not mutate document preferences/history limits")
    for name in ("editor_refresh.cpp", "editor_canvas.cpp"):
        if name not in files:
            continue
        source = files[name].read_text(encoding="utf-8")
        if re.search(r'\b(?:syncSelectionOutlineView|setRelativeLuminance)\s*\(|currentView\(\)\.(?:showSelectionOutline|relativeLuminance)\s*=(?!=)', source):
            errors.append(f"{name}: Refresh/paint must not reset session display decisions")
    return list(dict.fromkeys(errors)), len(files)


if __name__ == "__main__":
    errors, count = inspect(Path(__file__).resolve().parents[1])
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Editor boundaries: {count} sources; no include cycles, implementation includes or reverse UI dependencies.")
