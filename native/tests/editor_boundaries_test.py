"""Isolated positive/negative fixtures for the production dependency guard."""
from pathlib import Path
import runpy
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
inspect = runpy.run_path(str(ROOT / "scripts/check-editor-boundaries.py"))["inspect"]


class EditorBoundariesTest(unittest.TestCase):
    def setUp(self):
        temporary = ROOT / "build/test-tmp"
        temporary.mkdir(parents=True, exist_ok=True)
        self.fixture = tempfile.TemporaryDirectory(prefix="editor-boundaries-", dir=temporary)
        self.addCleanup(self.fixture.cleanup)
        self.root = Path(self.fixture.name)
        for name in ("native_widgets.h", "main.cpp", "editor.h", "editor_session.cpp"):
            self.write(name, "// fixture\n")
        self.write("editor_lifecycle.cpp", '#include "editor.h"\n')
        self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\n")
        for name, header in {
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
        }.items():
            self.write(header, "#pragma once\n")
            self.write(name, f'#include "{header}"\n')

    def write(self, name, content):
        target = self.root / "src" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def errors(self):
        return inspect(self.root)[0]

    def test_tool_owner_rejects_editor_duplicate(self):
        self.write("editor.h", "bool selectionTool_=false;\n")
        self.assertTrue(any("Session tools must not regain" in e for e in self.errors()))

    def test_tool_owner_rejects_transfer_snapshot(self):
        self.write("editor.h", "std::optional<workspace::ToolSessionState> tools;\n")
        self.assertTrue(any("direct values" in e for e in self.errors()))

    def test_tool_owner_rejects_capture_restore_protocol(self):
        self.write("editor_session.cpp", "slot.tools=captureToolSession();\n")
        self.assertTrue(any("not capture/restore" in e for e in self.errors()))

    def test_valid_nested_relative_include_with_duplicate_basenames(self):
        self.write("a/common.hpp", '#include "../b/common.hpp"\n')
        self.write("b/common.hpp", "#pragma once\n")
        self.assertEqual(self.errors(), [])

    def test_nested_cycle(self):
        self.write("a/common.hpp", '#include "../b/common.hpp"\n')
        self.write("b/common.hpp", '#include "../a/common.hpp"\n')
        self.assertTrue(any("Include cycle:" in error for error in self.errors()))

    def test_angle_ui_dependency_in_nested_core_header(self):
        self.write("nested/document_helpers.hpp", "#include <ui/widget.h>\n")
        self.assertTrue(any("document/recovery layer depends on UI" in error for error in self.errors()))

    def test_transitive_relative_editor_dependency(self):
        self.write("ui_frame_capture.h", '#include "nested/leaf.hpp"\n')
        self.write("nested/leaf.hpp", '#include "../editor.h"\n')
        self.assertTrue(any("shared UI adapter reaches Editor: editor.h" in error for error in self.errors()))

    def test_actual_first_include(self):
        self.write("extension_install_dialog.cpp", '#include <ui/window.h>\n#include "extension_install_dialog.h"\n')
        self.assertTrue(any("compile its own declaration first" in error for error in self.errors()))

    def test_shared_preview_cannot_regain_editor_support(self):
        self.write("preview_panel.h", '#include "nested/preview.hpp"\n')
        self.write("nested/preview.hpp", '#include "../editor_support.h"\n')
        self.write("editor_support.h", "#pragma once\n")
        self.assertTrue(any("preview_panel.cpp: shared UI adapter reaches Editor: editor_support.h" in error for error in self.errors()))

    def test_extracted_controls_cannot_import_editor(self):
        for stem in ("pixel_theme", "curve_editor_native", "sprite_sheet_preview",
                     "tool_property_popup", "loop_number_entry",
                     "frame_duration_palette_entry", "layer_label_separator"):
            with self.subTest(component=stem):
                self.write(stem + ".h", '#include "editor.h"\n')
                self.assertTrue(any(stem + ".cpp: shared UI adapter reaches Editor: editor.h" in error
                                    for error in self.errors()))
                self.write(stem + ".h", "#pragma once\n")

    def test_main_typed_diagnostic_dispatch_is_allowed(self):
        self.write("main.cpp", "struct Check {void (Editor::*run)();};\nCheck checks[]{{&Editor::smokeHistoryPanel}};\n")
        self.assertEqual(self.errors(), [])

    def test_editor_cannot_reintroduce_retired_dependency_bundles(self):
        for header in ("editor_implementation.h", "editor_support.h"):
            with self.subTest(header=header):
                # Missing files and Windows spelling must not evade the guard.
                self.write("editor_tools.cpp", '#include "..\\' + header.upper() + '"\n')
                self.assertTrue(any("editor_tools.cpp: retired Editor dependency bundle:" in error
                                    for error in self.errors()))
        self.write("editor_tools.cpp", '#include "editor.h"\n#include "legacy_tools.h"\n')
        self.assertEqual(self.errors(), [])

    def test_main_editor_method_implementation_is_rejected(self):
        self.write("main.cpp", "void Editor::smokeHidden() {}\n")
        self.assertTrue(any("main.cpp must contain startup/CLI dispatch" in error for error in self.errors()))

    def test_refresh_cannot_schedule_panel_persistence(self):
        self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\nvoid Editor::refresh() { saveLayerPanelState(); }\n")
        self.assertTrue(any("Refresh must not schedule durable panel state writes" in error for error in self.errors()))

    def test_session_view_cannot_regain_editor_working_copy(self):
        self.write("editor.h", "struct ProjectViewState {double zoom=8;};\n"
                   "struct ProjectSession {ProjectViewState view;};\n")
        self.assertEqual(self.errors(), [])
        for field in ("canvas_", "zoom_", "viewRotation_", "tileRepeat_", "layerScroll_",
                      "frameScroll_", "layerScrollRemainder_", "frameScrollRemainder_",
                      "paletteScrollPixels_", "frameSelectionExplicit_",
                      "timelineSelectionGuidesVisible_", "recentColors_", "selectionPivot_",
                      "drawingAnchor_", "drawingAnchorVisible_", "drawFromCanvasCenter_",
                           "showSelectionOutline_", "selectionOutlineIdentity_", "luminanceDocumentIdentity_",
                           "selectionPivotVisible_", "paletteScrollXPixels_",
                           "playing_", "loopPlayback_", "playbackTagMode_", "playbackModeLoop_",
                           "playbackSessionMode_", "playbackModeIdentity_", "playbackTagCycle_", "playbackObservedFrame_",
                           "playbackIdentity_", "playbackRevision_", "playbackDue_", "playbackRate_",
                           "playbackReturnToStart_", "playbackStartFrame_"):
            with self.subTest(field=field):
                self.write("editor.h", f"class Editor {{ int {field}=0; }};\n")
                self.assertTrue(any("Session view must not regain a duplicate Editor field:" in error
                                    for error in self.errors()))

    def test_refresh_and_paint_cannot_reset_session_display(self):
        for filename in ("editor_refresh.cpp", "editor_canvas.cpp"):
            for statement in ("syncSelectionOutlineView();", "renderer_.setRelativeLuminance(false);",
                              "currentView().showSelectionOutline=true;", "currentView().relativeLuminance=false;"):
                with self.subTest(filename=filename, statement=statement):
                    self.write(filename, "void Editor::syncDocumentViewState() {}\nvoid Editor::refresh() { " + statement + " }\n")
                    self.assertTrue(any("Refresh/paint must not reset session display decisions" in error
                                        for error in self.errors()))
            self.write(filename, "void Editor::syncDocumentViewState() {}\n")
        self.write("editor_canvas.cpp", "if(currentView().showSelectionOutline==false) return;\n")
        self.assertEqual(self.errors(), [])

    def test_refresh_cannot_own_layout_or_repeat_lifecycle(self):
        for statement in ("initializeDocking();", "bindTileRepeat(mode);", "bindProjectDocument(value);", "currentDocument().setFloatingRepeat(mode);", "currentDocument().setDeferredFloatingDisplaySupported(true);"):
            with self.subTest(statement=statement):
                self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\nvoid Editor::refresh() { " + statement + " }\n")
                self.assertTrue(any("Refresh must not initialize docking or bind document display policy" in error for error in self.errors()))

    def test_nested_c_implementation_include(self):
        self.write("nested/component.c", "#include <other.c>\n")
        self.assertTrue(any("implementation include other.c" in error for error in self.errors()))

    def test_mask_selection_cannot_regain_shared_editor_storage(self):
        for field in ("selectedMaskSlots_", "maskSelectionAnchor_", "maskSelectionIdentity_", "maskSelectionSerial_", "virtualSlots_", "virtualAnchor_", "recentColorsIdentity_"):
            with self.subTest(field=field):
                self.write("editor.h", "class Editor { int " + field + "=0; };\n")
                self.assertTrue(any("Session view must not regain a duplicate Editor field: " + field in error
                                    for error in self.errors()))
        self.write("editor.h", "struct ProjectViewState { int maskIdentity=0,maskSerial=0; };\n")
        self.assertEqual(self.errors(), [])

    def test_refresh_cannot_launch_sheet_previews(self):
        for statement in ("buildSpriteSheetImage(document,options);", "updateSpriteSheetPreview();",
                          "spriteSheetPreviewTick();", "sheetPreviewTimer_.start();"):
            with self.subTest(statement=statement):
                self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() { " + statement + " }\n")
                self.assertTrue(any("Refresh must not compose or schedule sprite-sheet previews" in error for error in self.errors()))
        self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\n")
        self.assertEqual(self.errors(), [])

    def test_refresh_cannot_reset_recent_colors(self):
        for statement in ("currentView().recent={};", "recentDrag_.reset();"):
            with self.subTest(statement=statement):
                self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() { " + statement + " }\n")
                self.assertTrue(any("Refresh must not reset session recent colors" in error for error in self.errors()))
        self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\n")
        self.assertEqual(self.errors(), [])

    def test_refresh_cannot_consume_mask_history(self):
        for statement in ("currentDocument().maskSelectionHistory();", "projectMaskSelectionHistory(view,document);",
                          "bindTimelineSelection();", "currentView().maskSerial=0;", "currentView().maskIdentity=0;"):
            with self.subTest(statement=statement):
                self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() { " + statement + " }\n")
                self.assertTrue(any("Refresh must not bind or consume mask selection history" in error for error in self.errors()))
        self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\n")
        self.assertEqual(self.errors(), [])

    def test_refresh_cannot_coordinate_floating_transform(self):
        for statement in ("currentView().freeTransform=false;", "selectionFreeTransform_=false;"):
            with self.subTest(statement=statement):
                self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() { " + statement + " }\n")
                self.assertTrue(any("Refresh must not coordinate floating transform lifecycle" in error for error in self.errors()))
        self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\n")
        self.write("editor.h", "class Editor { bool selectionFreeTransform_=false; };\n")
        self.assertTrue(any("Session view must not regain a duplicate Editor field" in error for error in self.errors()))
        self.write("editor.h", "class Editor {};\n")
        self.assertEqual(self.errors(), [])

    def test_refresh_cannot_consume_pivot_history(self):
        for statement in ("currentDocument().selectionPivotHistory();", "projectSelectionPivotHistory(view,document);",
                          "currentView().pivotHistorySerial=0;", "currentView().pivotHistoryIdentity=0;"):
            with self.subTest(statement=statement):
                self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() { " + statement + " }\n")
                self.assertTrue(any("Refresh must not bind or consume selection pivot history" in error for error in self.errors()))
        self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\n")
        self.assertEqual(self.errors(), [])

    def test_refresh_cannot_coordinate_ordinary_pivots(self):
        for statement in ("currentView().pivotObservedRevision=0;", "currentView().pivotIdentity=0;",
                          "currentView().pivotMask={};", "currentView().pivot.reset();",
                          "projectOrdinarySelectionPivot(view,document);"):
            with self.subTest(statement=statement):
                self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() { " + statement + " }\n")
                self.assertTrue(any("Refresh must not coordinate ordinary selection pivots" in error for error in self.errors()))
        self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\n")
        self.assertEqual(self.errors(), [])

    def test_pivot_observation_belongs_to_session(self):
        for field in ("selectionPivotIdentity_", "selectionPivotMask_", "selectionPivotObservedRevision_", "trimPivotIdentity_", "trimPivotSerial_"):
            with self.subTest(field=field):
                self.write("editor.h", "class Editor { int " + field + "=0; };\n")
                self.assertTrue(any("Session view must not regain a duplicate Editor field" in error for error in self.errors()))
        self.write("editor.h", "class Editor {};\n")
        self.assertEqual(self.errors(), [])

    def test_refresh_cannot_coordinate_playback(self):
        for statement in ("currentPlayback().modeIdentity=0;", "retargetTagPlayback();",
                          "observePlaybackChange(state,document,change);",
                          "initializePlaybackMode(state,document,mode);",
                          "bindPlaybackObservation();", "bindSessionAnimationObservation();", "replaceDocumentForSmoke(value);"):
            with self.subTest(statement=statement):
                self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() { " + statement + " }\n")
                self.assertTrue(any("Refresh must not initialize or coordinate playback lifecycle" in error
                                    for error in self.errors()))
        self.write("editor_refresh.cpp", "void Editor::syncDocumentViewState() {}\n")
        self.assertEqual(self.errors(), [])

    def test_document_fixture_replacement_requires_binding(self):
        self.write("editor_smoke.cpp", "currentDocument()=Document(2,1);\n")
        self.assertTrue(any("Document replacement must use explicit session binding" in error
                            for error in self.errors()))
        self.write("editor_smoke.cpp", "replaceDocumentForSmoke(Document(2,1));\n")
        self.assertEqual(self.errors(), [])

    def test_document_fixture_replacement_preserves_heap_allocation(self):
        for parameter in ("Document", "Document next"):
            self.write("editor.h", "class Editor { void replaceDocumentForSmoke(" + parameter + "); };\n")
            self.assertTrue(any("Document fixture replacement must not add a by-value stack temporary" in error
                                for error in self.errors()))
        self.write("editor.h", "class Editor { void replaceDocumentForSmoke(Document&&); void replaceDocumentForSmoke(const Document&); };\n")
        self.assertEqual(self.errors(), [])

    def test_windows_separators_and_case_cannot_hide_editor_dependency(self):
        self.write("ui_frame_capture.h", '#include "nested/leaf.hpp"\n')
        self.write("nested/leaf.hpp", '#include "..\\EDITOR.H"\n')
        self.assertTrue(any("shared UI adapter reaches Editor: editor.h" in error for error in self.errors()))

    def test_windows_separators_cannot_hide_ui_dependency(self):
        self.write("nested/document_helpers.hpp", '#include "UI\\widget.h"\n')
        self.assertTrue(any("document/recovery layer depends on UI" in error for error in self.errors()))


if __name__ == "__main__":
    unittest.main()
