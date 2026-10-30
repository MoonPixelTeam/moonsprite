#pragma once
#include "project_backup.h"
#include "document.h"
#include "airbrush.h"
#include <random>
#include "runtime_diagnostics.h"
#include "text_font_service.h"
#include "history_list.h"
#include "canvas_rotation.h"
#include "tablet_assist_panel.h"
#include "brush_dynamics.h"
#include "tilemap_ui.h"
#include "help_dialog.h"
#include "home_announcements.h"
#include "recent_projects_pane.h"
#include "reference_image_window.h"
#include "editor_timeline_rows.h"
#include "canvas_renderer.h"
#include "native_widgets.h"
#include "pixel_font.h"
#include "panel_docking.h"
#include "space_drag_scroll.h"
#include "editor_preferences.h"
#include "shortcut_model.h"
#include "layer_label_width.h"
#include "selection_tools.h"
#include "image_export.h"
#include "gif_export.h"
#include "animation_layer_export.h"
#include "frame_png_export.h"
#include "sprite_sheet.h"
#include "sprite_sheet_import.h"
#include "recent_colors.h"
#include "eyedropper_model.h"
#include "palette_clipboard.h"
#include "palette_library.h"
#include "palette_growth.h"
#include "pattern_brush_library.h"
#include "workspace_preset_library.h"
#include "brush_library_panel.h"
#include "recovery_catalog.h"
#include "layer_quick_actions.h"
#include "pixel_clipboard.h"
#include "native_color_picker.h"
#include "color_editor_popup.h"
#include "about_dialog.h"
#include "ui/tooltips.h"
#include <commdlg.h>
#include <mmsystem.h>
#include <shellapi.h>
#include <future>
#include <map>
#include <set>
#include "editor_interaction_state.h"
#include "editor_recovery.h"
#include "timeline_button.h"
#include "gradient_map_presets.h"
#include "quick_grid_selection.h"
#include "grid_snap.h"
#include "alignment.h"
#include "move_click_flash.h"
#include "usage_statistics.h"
#include "menu_catalog.h"
#include "project_encode.h"
#include "cel_thumbnail_pipeline.h"
namespace moon {class PixelTextArea;class LegacyCursors;class FreeTileInstancesPanel;}

namespace moon::editor {
template<class Base> class DialogBackground;
class PreviewPanel;
class FloatingColumnSurface;
class DockFeedback;
class GradientStopsTrack;
class CurveEditorNative;
class SpriteSheetPreview;
class ToolPropertyPopup;
class LoopNumberEntry;
class FrameDurationPaletteEntry;
class LayerLabelSeparator;
class Editor : public ui::Widget {
public:
  void smokeAsepriteSaveLifecycle();
  void smokeMaskSelectionClipboard();
  void smokeRecentProjects();

public:
  usage::Tracker usageStatistics_;
  bool usageStatisticsEphemeral_=true;
  usage::Milliseconds usageStrokeStarted_=0;
  project::BackupPolicy projectBackupPolicy()const;
  void initializeProjectRollback();
  void showProjectRollback();
  void initializeUsageStatistics(bool testing);
  std::shared_ptr<diagnostics::Recorder> diagnostics_;ui::Timer diagnosticTimer_{500,this};bool diagnosticTesting_=false;std::chrono::steady_clock::time_point diagnosticHeartbeat_{},diagnosticSummary_{},diagnosticLastIncident_{};std::u32string diagnosticLastStatus_;std::string diagnosticLastAction_;std::uint64_t diagnosticInputs_=0;
  void initializeDiagnostics(bool testing);void syncDiagnostics();void diagnosticTick();void observeDiagnosticInput(ui::Message*);void openDiagnosticLogs();void smokeDiagnostics();
  std::function<void(const std::filesystem::path&)> diagnosticFolderOpener_;std::function<std::filesystem::path()> diagnosticExportChooser_;

  void persistUsageStatistics();
  void usageStatisticsTick();
  void setUsageStatisticsEnabled(bool enabled);
  void showUsageStatistics(bool verify=false);
  void smokeUsageStatistics();

  Document document=Document::withBuiltinPalette();

  std::function<void()> closeRequested;

private:

  const PixelFont& font_; Skin& skin_; std::filesystem::path assets_;

  PreviewPanel* previewPanel_=nullptr;

  PixelButton *documentTabNew_=nullptr,*documentTabClose_=nullptr;

  PixelMenuItem* homeButton_=nullptr;

  bool homeOpen_=false;

  int homeSection_=0,homeScroll_=0,homeBanner_=0;

  std::chrono::steady_clock::time_point homeBannerDue_;

  std::vector<PixelButton*> homeActions_,homeTabs_,homeRows_;
  HomeAnnouncementsPane* homeAnnouncements_=nullptr;
  std::size_t releaseNotesLastOpened_=std::size_t(-1);

  PixelButton* homeReturn_=nullptr;

  std::vector<std::pair<ui::Widget*,bool>> homeVisibility_;

  std::vector<recent::Project> homeRecent_;
  RecentProjectsPane* recentPane_=nullptr;PixelButton *recentPrivacy_=nullptr,*recentRefresh_=nullptr,*recentClear_=nullptr;
  PixelMenu* recentMenu_=nullptr;PixelMenuItem* recentEmpty_=nullptr;std::vector<PixelMenuItem*> recentMenuRows_;
  std::map<std::string,std::string> recentErrors_;bool recentHidden_=false,recentKeepHome_=false;int recentDensity_=1;
  std::filesystem::path recentSettingsOverride_;

  std::vector<os::SurfaceRef> homeBanners_;

  os::SurfaceRef homeLogo_;

  struct HomeRow {std::u32string name;std::filesystem::path path;std::string recoveryId;};

  std::vector<HomeRow> homeEntries_;

  bool documentOpen_=true;

  // legacy workspace-types.ts DocumentSession: inactive documents are moved,

  // never serialized or copied, so pixels, selections and undo remain intact.

  struct TemporaryBrushCapture { int kind=0,mode=0,radius=4; bool rounded=false; std::uint64_t identity=0; };
  struct ProjectSession {

    std::optional<Document> stored;

    std::filesystem::path path;

    gfx::Rect canvas;

    double zoom=8;view::Rotation rotation;

    int layers=0,frames=0,layerRemainder=0,frameRemainder=0,paletteScroll=0;

    bool frameSelection=false,guides=true;

    RecentColors recent;

    std::optional<TransformPoint> pivot;
    TransformPoint drawingAnchor{.5,.5};bool drawingAnchorVisible=true,drawFromCanvasCenter=false;

    std::optional<TemporaryBrushCapture> brushCapture;
    std::optional<BrushOptions> brushReturnProfile;
    std::optional<PatternBrush> temporaryBrush;
    std::string temporaryBrushId;
    double temporaryBrushAngle=0;
    bool temporaryBrushActive=false;
    RecoverySession recovery;

  };

  std::vector<std::unique_ptr<ProjectSession>> projects_;

  std::size_t activeProject_=0,recoveryProject_=0;

  std::vector<PixelButton*> projectCloseButtons_;

  std::vector<gfx::Rect> projectTabRects_;

  int projectTabScroll_=0;

  bool revealProjectTab_=false,closingWorkspace_=false;

  bool projectTabDragging_=false;

  gfx::Point projectTabPress_;

  std::vector<std::pair<ui::Widget*,bool>> closedControlStates_;

  std::vector<PixelButton*> commands_, swatches_, panelTabs_;
  std::vector<TimelineButton*> timelineInactive_;

  PixelButton *paletteActions_=nullptr,*paletteLibrary_=nullptr;

  PixelButton *paletteLock_=nullptr,*primaryRole_=nullptr,*secondaryRole_=nullptr;

  PixelEntry* paletteInput_=nullptr;

  std::u32string paletteSaveName_;

  std::vector<PixelButton*> paletteSavePreview_;

  std::unique_ptr<ColorEditorPopup> colorEditorPopup_;

  bool colorEditorSecondary_=false,colorEditorSampling_=false;std::array<bool,9> colorEditorReturnTools_{};
  ColorEditorPopup* colorEditorSamplingTarget_=nullptr;std::uint64_t colorEditorSamplingIdentity_=0;
  ui::Widget *gradientStopsFocusOwner_=nullptr,*gradientStopsColorFocusOwner_=nullptr;

  int replaceSampling_=-1;

  std::array<bool,9> replaceReturnTools_{};

  bool replaceSamplingFinishing_=false;

  PixelButton* exportFormatButton_=nullptr;

  PixelButton* exportOpenFolderButton_=nullptr;

  PixelEntry* exportFilename_=nullptr;

  PixelButton* exportLocation_=nullptr;

  std::filesystem::path exportDirectory_;

  std::string exportDefaultName_;

  std::vector<PixelButton*> exportScaleButtons_;PixelScrollBar* exportScaleBar_=nullptr;int exportScaleScroll_=0;gfx::Rect exportScaleViewport_;

  std::vector<std::pair<PixelButton*,PixelButton*>> preferenceColorRows_;int preferenceColorRowsY_=0;
  std::vector<std::pair<PixelEntry*,PixelButton*>> preferenceScaleRows_;int preferenceScaleRowsY_=0;

  PixelPresetControls exportPresets_;

  struct ExportPreset {std::string name;int kind=0,format=0;bool explicitRange=false;StaticImageExportOptions image;GifExportOptions animation;bool allLayers=false;};

  std::vector<ExportPreset> savedExportPresets_;

  bool exportPresetsReadable_=true;

  std::u32string exportPresetFeedback_;

  std::filesystem::path exportPresetPathOverride_;

  struct RememberedExport {std::string identity,filename;ExportPreset settings;};

  std::filesystem::path exportMemoryPathOverride_;

  std::filesystem::path recentExportDirectoryPathOverride_;

  std::filesystem::path recentExportPathsPathOverride_;

  std::filesystem::path recentExportPathsPath()const;

  void recordRecentExportPath(const std::filesystem::path& output);

  std::filesystem::path recentExportDirectoryPath()const;

  std::filesystem::path preferredExportDirectory()const;

  void rememberExportDirectory(const std::filesystem::path& output);

  std::string exportSequenceMemoryName_;

  bool restoringExportMemory_=false;

  std::filesystem::path exportMemoryPath()const;

  std::string exportMemoryIdentity()const;

  std::vector<RememberedExport> readExportMemory()const;

  // Legacy platform/export-success-sound.ts: completion feedback never fails the export.

  std::function<bool(const std::filesystem::path&)> playExportSound_=[](const auto& path){return PlaySoundW(path.c_str(),nullptr,SND_FILENAME|SND_ASYNC|SND_NODEFAULT)!=FALSE;};

  bool exportSoundErrorReported_=false;

  void playExportSuccessSound() noexcept;

  void rememberSuccessfulExport(const std::filesystem::path& path);

  bool restoreExportMemory(bool frames=false);

  bool exportOpenFolderRequested_=false;

  std::filesystem::path exportedDirectory_;

  std::function<bool(OPENFILENAMEW*)> chooseExportFile_=[](OPENFILENAMEW* dialog){return GetSaveFileNameW(dialog)!=FALSE;};

  GifExportOptions gifOptions_;

  bool gifWebp_=false;

  std::array<PixelEntry*,3> gifInputs_{};

  PixelButton *gifRange_=nullptr,*gifDirection_=nullptr,*gifTrim_=nullptr;

  bool gifExplicitRange_=false;

  Pixel replaceSource_=0,replaceDestination_=0;

  std::array<PixelEntry*,2> replaceInputs_{};

  std::array<PixelButton*,2> replaceSample_{};

  PixelButton *replaceScopeButton_=nullptr,*replacePreviewButton_=nullptr,*replaceRememberButton_=nullptr;

  std::string replaceScope_="layers";

  bool replacePreview_=false,replaceRemember_=true,replaceLoaded_=false;

  SheetImportOptions importSheetOptions_;std::array<PixelEntry*,8> importSheetInputs_{};PixelButton *importSheetLayout_=nullptr,*importSheetPartial_=nullptr;bool importAfterOpen_=false,importSheetUpdating_=false;

  bool sheetOutputFile_=false,sheetOpenAfterExport_=false;std::filesystem::path sheetExportedPath_;

  std::function<void(const std::filesystem::path&)> openSheetOutput_;

  SpriteSheetOptions sheetOptions_;PixelEntry* sheetValue_=nullptr;std::array<PixelButton*,7> sheetButtons_{};SpriteSheetPreview* sheetPreview_=nullptr;

  PixelEntry* exportScaleInput_=nullptr;PixelButton *exportTrimButton_=nullptr,*exportSelectionButton_=nullptr,*exportLayerButton_=nullptr;StaticImageExportOptions exportOptions_;

  std::array<PixelEntry*,4> resizeInputs_{};

  PixelButton *resizeLock_=nullptr,*resizeMethod_=nullptr;

  int resizeWidth_=1,resizeHeight_=1;bool resizeLocked_=true,resizeUpdating_=false;

  ImageInterpolation resizeMethodValue_=ImageInterpolation::Nearest;

  AntiAliasOptions aaSpec_;bool aaAuto_=true,aaLive_=true,aaScheduled_=false,aaCommit_=false;Pixel aaCustom_=0;std::chrono::steady_clock::time_point aaDue_;std::shared_ptr<std::atomic<bool>> aaCancel_;std::uint64_t aaGeneration_=0;

  struct AntiAliasResult {Document::AntiAliasSurfaceTask task;std::uint64_t generation;bool cancelled=false;std::string error;};std::future<AntiAliasResult> aaWorker_;

  PixelButton *aaAutoButton_=nullptr,*aaInterior_=nullptr,*aaLiveButton_=nullptr;PixelDropdown* aaSource_=nullptr;PixelEntry *aaOpacity_=nullptr,*aaColorEntry_=nullptr;PixelSlider* aaOpacitySlider_=nullptr;NativeColorPicker* aaPicker_=nullptr;

  ConvolutionOptions convolutionSpec_;std::vector<PixelButton*> convolutionPresets_;std::array<PixelButton*,4> convolutionChannels_{};PixelButton *convolutionTiled_=nullptr,*convolutionLive_=nullptr,*convolutionApply_=nullptr;PixelScrollBar* convolutionScroll_=nullptr;int convolutionScrollPixels_=0;

  struct ConvolutionResult {Document::ConvolutionSurfaceTask task;std::uint64_t generation,optionsRevision;bool cancelled=false;std::string error;};

  std::future<ConvolutionResult> convolutionWorker_;std::shared_ptr<std::atomic<bool>> convolutionCancel_;std::uint64_t convolutionGeneration_=0,convolutionRevision_=0;std::optional<std::uint64_t> convolutionApplied_;bool convolutionLiveEnabled_=true,convolutionScheduled_=false;int convolutionCommit_=0;std::chrono::steady_clock::time_point convolutionDue_;

  std::vector<SavedGradientMapPreset> gmSaved_;std::vector<int> gmHidden_,gmKeys_;bool gmReadable_=true;std::u32string gmError_;int gmStop_=0;GradientStopsTrack* gmTrack_=nullptr;NativeColorPicker* gmPicker_=nullptr;PixelDropdown *gmPreset_=nullptr,*gmDither_=nullptr;PixelEntry *gmPosition_=nullptr,*gmColor_=nullptr,*gmName_=nullptr;PixelButton *gmMode_=nullptr,*gmReverse_=nullptr,*gmPalette_=nullptr,*gmSave_=nullptr,*gmDelete_=nullptr,*gmAdd_=nullptr,*gmRemove_=nullptr,*gmRestore_=nullptr,*gmFlipStops_=nullptr;

  struct GradientMapResult {Document::GradientMapTask task;std::uint64_t generation;bool cancelled=false;std::string error;};std::future<GradientMapResult> gmWorker_;std::shared_ptr<std::atomic<bool>> gmCancel_;std::uint64_t gmGeneration_=0;bool gmScheduled_=false,gmCommit_=false;

  ColorAdjustment adjustmentSpec_;

  std::array<PixelEntry*,3> adjustmentInputs_{};std::array<PixelSlider*,3> adjustmentSliders_{};CurveEditorNative* curveEditor_=nullptr;PixelButton *curveChannelButton_=nullptr,*curveResetButton_=nullptr,*curveDeleteButton_=nullptr;int curveChannel_=0;std::array<std::array<unsigned,256>,4> curveHistogram_{};

  PixelButton *adjustmentPreview_=nullptr,*adjustmentColorize_=nullptr,*adjustmentToneButton_=nullptr;int adjustmentTone_=1;std::array<PixelButton*,3> adjustmentToneButtons_{};

  bool adjustmentPreviewEnabled_=true;

  std::array<double,3> relativeHsl_{},colorizedHsl_{};bool hasColorizedHsl_=false;

  PixelEntry* extractNameInput_=nullptr;

  PixelButton* extractModeButton_=nullptr;

  int extractMode_=0,extractLimit_=32;

  struct PickerColumnWidgets {
    NativeColorPicker* picker=nullptr;
    PixelButton *restore=nullptr,*settings=nullptr,*primary=nullptr,*secondary=nullptr,*add=nullptr;
    std::vector<PixelButton*> recent;
  };
  std::array<PickerColumnWidgets,panels::columnCount> pickerColumns_{};
  panels::Visibility pickerOpen_{false,true,false,false,true,true,false,false};
  static const char32_t* pickerColumnName(int id);
  static ColorPickerScheme pickerColumnScheme(int id);
  void createExtraPickerColumns();
  void layoutPickerColumn(int id);
  void togglePickerColumn(int id);
  void setupDefaultPickerGroup();
  NativeColorPicker* colorPicker_=nullptr;

  PixelButton* pickerRestore_=nullptr;PixelButton* pickerScheme_=nullptr;bool pickerSchemeReadable_=true,pickerMoonFieldReadable_=true,pickerQuantizationReadable_=true;

  PixelButton *pickerPrimary_=nullptr,*pickerSecondary_=nullptr,*pickerAdd_=nullptr;

  std::vector<PixelButton*> recentButtons_;

  RecentColors recentColors_;

  std::uint64_t recentColorsIdentity_=0;

  std::array<PixelButton*,6> symmetryButtons_{};

  SymmetryAxes persistedSymmetryAxes_;

  std::uint64_t symmetryIdentity_=0;

  bool symmetryLocked_=false,symmetryInitialized_=false,symmetryDragging_=false;

  SymmetryAxis symmetryDragAxis_=SymmetryAxis::Center;

  SymmetryCenter symmetryDragBefore_;

  int symmetryThickness_=1;

  Pixel symmetryColor_=0xffff0000;





  bool eyedropperTool_=false,eyedropperHeld_=false,paletteSamplingHeld_=false;

  EyedropperSource eyedropperSource_=EyedropperSource::Composite;

  EyedropperGesture eyedropperGesture_;

  std::array<SkinPatch,4> eyedropperLensMasks_;

  std::array<SkinPatch,2> eyedropperLensPointers_;

  os::SurfaceRef eyedropperLensSurface_;

  gfx::Point eyedropperLensPointer_;

  Pixel eyedropperLensPrevious_=0;

  PixelButton* eyedropperSourceButton_=nullptr;
  PixelButton *eyedropperForegroundButton_=nullptr,*eyedropperBackgroundButton_=nullptr,*eyedropperReplaceButton_=nullptr;

  bool eyedropperLensEnabled_=true;int eyedropperLensSize_=2;

  preferences::RuntimeSettings runtimePreferences_,runtimePreferenceDraft_;

  bool runtimePreferencesReadable_=true;

  struct PreferenceDraft {bool smooth=false,lens=true,returnStart=false;int source=0,lensSize=2;double rate=1;recovery::Preferences recovery;};

  CheckerboardSettings checkerboard_,checkerboardDraft_;

  std::array<PixelEntry*,3> checkerboardFields_{};

  std::vector<ui::Widget*> preferenceRows_;

  std::vector<int> preferenceRowY_;

  gfx::Rect preferenceViewport_;

  PreferenceDraft preferenceDraft_;

  int preferenceSection_=0;

  std::array<PixelButton*,14> preferenceTabs_{};

  std::array<PixelDropdown*,9> preferenceFields_{};

  PixelButton* preferenceApply_=nullptr;

  std::u32string preferenceFeedback_;

  RecentPaintDrag recentDrag_;

  Pixel strokeColor_=0;

  bool selectionTool_=false,selectionDragging_=false,floatingDragging_=false,selectionMoved_=false,selectionBoxDragging_=false;

  int selectionMode_=0,gestureSelectionMode_=0,selectionKind_=0;

  std::optional<SelectionMask> selectionPreview_;

  std::optional<SelectionTransform> marqueeTarget_,marqueeRotationStart_,marqueeResizeStart_;double marqueeViewAngle_=0;

  TransformPoint marqueePointerStart_,marqueePointerLast_;

  int marqueeDirectionX_=1,marqueeDirectionY_=1;

  std::optional<SelectionTransform> marqueeCtrlRestore_,marqueeSpaceTarget_;

  TransformPoint marqueeSpacePointer_;

  bool marqueeSpaceHadResize_=false;

  bool selectionShift_=false,selectionRight_=false,selectionCtrl_=false;

  int selectionAxis_=0;

  gfx::Point selectionPointerPosition_;

  gfx::Rect selectionPointerDamage_;

  bool selectionSyntheticMove_=false;

  bool selectionFreeTransform_=false,selectionPivotVisible_=true,selectionPivotDragging_=false;

  os::SurfaceRef tweenEndpointImage_; std::uint64_t tweenEndpointIdentity_=0,tweenEndpointRevision_=0; double tweenEndpointX_=0,tweenEndpointY_=0;
  std::optional<TransformPoint> selectionPivot_,selectionPivotBeforeGesture_;

  TransformPoint selectionPivotStart_,selectionPivotPointerStart_;

  std::uint64_t selectionPivotIdentity_=0;

  std::optional<SelectionMask> selectionPivotMask_;

  std::uint64_t trimPivotIdentity_=0,trimPivotSerial_=0;
  std::uint64_t maskSelectionIdentity_=0,maskSelectionSerial_=0;

  mutable std::map<std::pair<int,int>,std::vector<Pixel>> selectionColorTiles_;

  mutable std::uint64_t selectionColorIdentity_=0,selectionColorRevision_=0,selectionColorFloatingRevision_=0;

  mutable std::string selectionColorFrame_;

  Point selectionLast_{};

  std::u32string selectionStatusBefore_;

  bool quickSelection_=false,quickSelectionExplicitDouble_=false;

  std::optional<QuickSelectionPress> quickSelectionPress_;

  std::chrono::steady_clock::time_point quickSelectionTime_;

  SelectionMask quickSelectionCell_;

  std::vector<SelectionPoint> selectionPath_,selectionPathRedo_;

  SelectionBrushStroke selectionBrushStroke_;

  SelectionPoint selectionBrushLast_{};

  std::optional<gfx::Point> selectionBrushPointer_;

  std::uint64_t selectionBrushIdentity_=0;

  int selectionBrushAngle_=0;

  PixelEntry* selectionBrushAngleInput_=nullptr;

  WandOptions wandOptions_;

  bool polygonPending_=false,wandReleased_=false,wandPreviewReady_=false;

  std::shared_ptr<const std::vector<Pixel>> wandSource_;

  std::future<std::optional<SelectionMask>> wandWorker_;

  std::optional<SelectionPoint> wandRequest_,wandLastPoint_;

  std::uint64_t wandGeneration_=0,wandWorkerGeneration_=0,wandIdentity_=0,wandContentRevision_=0;std::string wandLayer_,wandFrame_;

  std::vector<std::pair<ui::Widget*,int>> selectionControls_;

  int numberScrubLastX_=0;

  PixelEntry* modalNumberScrub_=nullptr;

  std::array<PixelButton*,4> selectionModeButtons_{};

  PixelEntry *wandToleranceInput_=nullptr,*wandGapInput_=nullptr;

  PixelButton *wandContiguousButton_=nullptr,*wandGapButton_=nullptr,*wandConnectivityButton_=nullptr,*wandReferenceButton_=nullptr;

  void wandTick();

  void requestWand(Point p);

  bool gridSnapActive()const;

  Point gridSnapPoint(Point p,int ax=0,int ay=0)const;

  Point gridSnapBrush(Point p)const;

  bool gridMoveEnabled_=false;

  bool smartMoveEnabled_=false;
  double moveAlignmentThreshold_=6;
  std::vector<GridRect> moveAlignmentTargets_;
  AlignmentBoundsCache alignmentBoundsCache_;
  std::vector<AlignmentGuide> alignmentGuides_;
  void beginAlignmentMove(bool content);
  Point gridSnapMove(Point p,GridRect b);

  std::optional<SelectionMask> quickSelectionCellAt(Point p)const;

  void updateSelectionCreation(Point p,bool constrain=false,bool center=false,bool rotate=false);

  void polygonStep(bool redo);

  SelectionTransform transformGestureStart_;

  TransformPoint transformPointerStart_;

  std::string transformHandle_;

  bool selectionCopyDrag_=false;

  bool selectionRotSprite_=false;

  PixelButton* selectionAlgorithmButton_=nullptr;

  std::array<PixelEntry*,5> selectionTransformFields_{};

  bool selectionPropertiesActive_=false,selectionRounded_=false;

  int selectionCornerRadius_=4;

  PixelButton* selectionRoundedButton_=nullptr;

  PixelEntry* selectionCornerRadiusInput_=nullptr;

  bool shapeTool_=false,shapeDragging_=false,shapeRounded_=false,shapeRatio_=false,shapeRequest_=false;

  std::vector<SelectionPoint> polygonShapeRedo_,polygonShapeCachePath_,polygonShapeCache_;bool polygonShapeCacheBalanced_=false;
  TransformPoint drawingAnchorDefaults_{.5,.5};bool drawingAnchorDefaultEnabled_=false,drawingAnchorDefaultVisible_=true;
  bool drawFromCanvasCenter_=false,drawingAnchorVisible_=true,drawingAnchorDragging_=false;TransformPoint drawingAnchor_{.5,.5},drawingAnchorDragBefore_{},drawingAnchorPointerStart_{};
  std::optional<TransformPoint> shapeDrawingAnchor_,marqueeDrawingAnchor_;ShapeDragGeometry anchoredMarqueeGeometry_;ShapeSpec anchoredMarqueeSpec_;
  PixelButton* drawingAnchorButton_=nullptr;PixelButton* drawingAnchorPresetButton_=nullptr;
  bool drawingAnchorEligible()const;bool drawingAnchorActive()const;TransformPoint drawingAnchorPoint()const;void setDrawingAnchor(TransformPoint point);void showDrawingAnchorPopup();void layoutDrawingAnchor(int& x);void smokeDrawingAnchor();void smokeSelectionSymmetry();void smokeSymmetryContentTranslation();void smokeSymmetryContentScale();void smokeSymmetryContentRotation();void smokeSymmetryContentShear();void smokeLinkedEditStaticPixels();
  ShapeSpec shapeSpec_;ShapeDragGeometry shapeGeometry_;TransformPoint shapePointer_{};

  int shapeRadius_=4;double shapeRatioWidth_=1,shapeRatioHeight_=1;

  Pixel shapeColor_=0;std::uint64_t shapeIdentity_=0;

  std::vector<std::pair<ui::Widget*,int>> shapeControls_;

  PixelButton *shapeModeButton_=nullptr,*shapeRoundedButton_=nullptr,*shapeRatioButton_=nullptr;

  PixelEntry *shapeRadiusInput_=nullptr,*shapeRatioWidthInput_=nullptr,*shapeRatioHeightInput_=nullptr;

  void shapeTick();
  void polygonShapePreview();
  void polygonShapeStep(bool redo);
  void finishPolygonShape();
  void smokePolygonShape();
  void smokeFreeformShape();
  int curveAnchorCount_=2,curveAnchorIndex_=0;bool curveEndpoint_=true;
  std::vector<TransformPoint> curveControls_;
  PixelEntry* curveAnchorInput_=nullptr;
  void curveTick();void finishCurveShape();void smokeCurveShape();

  void useShapeTool(ShapeKind kind);
  bool isToolAvailableForSession(const char* id) const;
public:
  void smokeToolRailMatrix();
private:

  bool fillTool_=false,fillDragging_=false,fillCommitted_=false;
  bool magicEraserTool_=false,magicEraserDragging_=false,magicEraserContiguous_=false;
  void useMagicEraserTool();void loadMagicEraserPreferences();
  bool processMagicEraserInput(ui::Message*);
public: void smokeMagicEraser();
private:

  WandOptions fillOptions_;

  PatternFillOptions fillPattern_;

  PixelButton *fillTextureButton_=nullptr,*fillImageButton_=nullptr;

  PixelEntry* fillTextureScale_=nullptr;

  std::u32string fillImageName_;

  PatternBrushSelection fillLibrarySelection_;

  std::string fillFolder_,fillFolderEditing_;

  bool fillFolderRename_=false;

  std::vector<std::pair<ui::Widget*,int>> fillControls_;

  PixelEntry *fillToleranceInput_=nullptr,*fillGapInput_=nullptr;

  PixelButton *fillContiguousButton_=nullptr,*fillGapButton_=nullptr,*fillConnectivityButton_=nullptr,*fillReferenceButton_=nullptr;

  bool rememberGradientTool_=false;

  bool gradientTool_=false,gradientDragging_=false,gradientPending_=false,gradientRequest_=false,gradientRight_=false,gradientConfirm_=false,gradientFreeform_=false;

  GradientSpec gradientSpec_;GradientDragGeometry gradientGeometry_;

  WandOptions gradientOptions_;

  std::uint64_t gradientIdentity_=0,gradientContent_=0;

  std::string gradientLayer_,gradientFrame_;

  std::vector<GradientStop> gradientStops_;

  int gradientStop_=0,gradientHandle_=-1;TransformPoint gradientHandlePress_{};GradientSpec gradientHandleBefore_;

  std::vector<std::pair<ui::Widget*,int>> gradientControls_;

  PixelEntry *gradientTolerance_=nullptr,*gradientStopPosition_=nullptr,*gradientStopColor_=nullptr;

  PixelButton *gradientType_=nullptr,*gradientContiguous_=nullptr,*gradientReference_=nullptr,*gradientConnectivity_=nullptr,*gradientDither_=nullptr,*gradientFreeformButton_=nullptr,*gradientMode_=nullptr;

  void gradientColors();

  void gradientTick();

  void gradientChanged();

  void cancelGradientGesture();

  void applyGradientGesture();

  void useFillTool();

  void useGradientTool();

  void sortGradientStops(GradientStop selected);

  void addGradientStop();

  std::optional<SelectionTransform> selectionTransformTarget() const;

  TransformPoint selectionPivotPreset(const SelectionTransform& target,int index) const;

  TransformPoint selectionPivotPoint() const;

  bool selectionPivotHit(gfx::Point point) const;

  Point constrainedSelectionDelta(Point delta,bool shift);

  void centerContent(bool horizontal,bool vertical);

  void trimCanvas(bool allFrames);

  void cropCanvas();

  void shrinkSelectionToContent();

  void showSelectionPivotPopup(bool drawing=false);

  void startFreeSelectionTransform();

  TransformPoint transformCanvasPoint(gfx::Point p) const;

  std::optional<SelectionTransform> selectionControlTarget() const;

  std::string transformHit(gfx::Point p)const;

  Point selectionStart_{},floatingStart_{};

  gfx::Point selectionPress_;

  std::optional<SelectionMask> selectionBefore_;

  std::optional<Document::LayerClipboardSnapshot> layerClipboardSnapshot_;
  std::optional<Document::FreeTileInstanceClipboardSnapshot> freeTileInstanceClipboard_;
  void copyEditorClipboard(bool cut=false);void pasteEditorClipboard();
  PixelClipboard pixelClipboard_;
  PixelClipboard::ImageReader newDocumentClipboardReaderForSmoke_;

  bool celClipboardContext()const;
  bool mixedPixelCopyContext(bool cut=false)const;bool mixedPixelPasteContext()const;

  void cutTimelineCels();

  Document::CelClipboardSnapshot celClipboardSnapshot_;

  Document::FrameClipboardSnapshot frameClipboardSnapshot_;

  bool hasApplicationFrameClipboard()const;

  bool applicationCelSelectionOnly()const;

  bool hasApplicationCelClipboard()const;

  std::optional<int> gifDropTargetIndex_;

  std::optional<int> timelineGifDropIndex(gfx::Point at)const;

  void clearTimelineGifDrop();

  bool handleTimelineGifDrag(os::DragEvent& event,bool drop=false);
  bool handleBrushLibraryDrop(os::DragEvent&,bool drop=false);
  void importBrushLibraryImages(const std::vector<std::filesystem::path>&,const std::string&);
  void smokeBrushLibraryDrop();
  PatternBrushDropPaths brushLibraryDropPaths_;

  void copyTimelineFrames();

  void cutTimelineFrames();

  void pasteTimelineFrames();

  void copyTimelineCels();

  void pasteTimelineCels();

  bool pixelClipboardContext() const;

  void beginLayerTransform();

  void useSelectionTool(int kind=-1);

  void selectAllPixels();

  void copyMergedPixels();

  void cutSelectionPixels();

  void copySelectionPixels(bool cut);

  void pasteSelectionPixels();

  int selectionHit(gfx::Point position) const;

  void endSelectionGesture(bool cancel);

  struct PaletteGesture {std::size_t start=0,last=0;int anchor=0,columns=1;bool secondary=false,moving=false,active=false;gfx::Point origin;std::vector<int> slots,ids;std::chrono::steady_clock::time_point began;PaletteViewSelection beforeView;};

  std::optional<PaletteGesture> paletteGesture_;

  struct PaletteGrowthGesture {std::uint64_t identity;std::vector<int> base;PaletteGrowthPreview preview;};

  std::optional<PaletteGrowthGesture> paletteGrowth_;

  PixelButton* paletteGrowthHandle_=nullptr;

  struct PaletteBoxRange{std::uint64_t identity;std::size_t start,end;std::vector<int> selected;};

  std::optional<PaletteBoxRange> paletteBoxRange_;

  FloatingColumnSurface* paletteSelectionOverlay_=nullptr;

  PixelScrollBar* paletteScrollBar_=nullptr;PixelScrollBar* paletteHorizontalBar_=nullptr;int paletteScrollXPixels_=0;

  PixelScrollBar *railScrollBar_=nullptr,*timelineHorizontal_=nullptr,*timelineVertical_=nullptr,*canvasHorizontal_=nullptr,*canvasVertical_=nullptr,*homeScrollBar_=nullptr,*errorScrollBar_=nullptr,*preferenceNavBar_=nullptr,*preferenceContentBar_=nullptr;

  int preferenceNavPixels_=0,preferenceContentPixels_=0;

  std::map<ui::Widget*,gfx::Rect> scrollViewports_;

  int railScrollPixels_=0;

  int layerScrollRemainder_=0,frameScrollRemainder_=0,homeScrollPixels_=0,errorScrollPixels_=0;

  std::string timelineLastActiveFrame_;

  gfx::Rect paletteSelectionBorder_;

  struct PaletteEdge {gfx::Rect border,clip;std::vector<gfx::Rect> pieces;int side=0;};

  std::vector<PaletteEdge> paletteSelectionEdges_;

  std::vector<Pixel> paletteClipboard_;

  std::optional<std::size_t> paletteFocusedSlot_;

  bool paletteLocked_=true,paletteFocused_=false,editingSecondary_=false,paletteManual_=false;

  std::uint64_t paletteRestoreIdentity_=0,paletteRestoreSerial_=0;

  PaletteClipboardData paletteClipboardLayout_;

  int paletteScrollPixels_=0,paletteColumns_=1,renameId_=0;

  SpaceDragScroll panelScrollDrag_;

  struct ScrollDragRegion {std::function<gfx::Rect()> bounds;SpaceDragScroll::Target target;};

  std::vector<ScrollDragRegion> scrollDragRegions_;

  bool panelScrollSpace_=false;

  std::optional<gfx::Point> paletteMousePosition_;

  std::vector<int> paletteButtonIds_;

  Pixel lastPaletteInk_=0xffff7929;

  using BrushOutlinePixel=BrushFeedbackState::BrushOutlinePixel;
  using BrushLineAnchor=BrushFeedbackState::BrushLineAnchor;
  using ModifierBrushSize=BrushFeedbackState::ModifierBrushSize;
  BrushFeedbackState brushFeedback_;














  const std::unordered_map<std::size_t,Pixel>* brushLineBaseline(const BrushLineAnchor* anchor) const;



  bool ordinaryBrushTool() const;

  const BrushLineAnchor* brushLineAnchor() const;











  void flushBrushSizePreferences();





  bool modifierBrushSupported() const;

  void setModifierBrushSize(int value);

  void finishModifierBrushSize();

  struct ToolControl {ui::Widget* first;int second;int gap=uiGap;bool pencilOnly=false;};

  std::vector<ToolControl> toolControls_;

  PixelButton* brushShapeButton_=nullptr;
  PixelButton* perfectPixelsButton_=nullptr;
  PixelEntry* lineStepInput_=nullptr;

  PixelButton* imageBrushButton_=nullptr;
  PixelDropdown* imagePaintModeDropdown_=nullptr;
  void smokeImageBrushPaintModes();

  std::string pencilImageBrushId_;

  double pencilImageBrushAngle_=0;

  std::optional<PatternBrush> pencilImageBrush_;
  // legacy workspace-commands-tool.ts: private, unsaved Ctrl+B capture draft.
  std::optional<TemporaryBrushCapture> temporaryBrushCapture_;
  std::optional<BrushOptions> temporaryBrushReturnProfile_;
  bool temporaryBrushActive_=false;

  PixelEntry *brushSizeInput_=nullptr,*brushOpacityInput_=nullptr;

  PixelSlider* brushRange_=nullptr;

  PixelTextArea* layerDescription_=nullptr;PixelButton *layerDisplayColor_=nullptr,*layerNoColor_=nullptr;std::vector<PixelButton*> layerPresetColors_;ui::TooltipManager* layerTooltips_=nullptr;

  PixelDropdown* layerBlendMode_=nullptr;PixelSlider* layerOpacityRange_=nullptr;

  PixelSlider* layerHeaderOpacity_=nullptr;

  struct AutoLinkGesture {std::string start;bool value=false;std::map<std::string,bool> originals;};

  std::optional<AutoLinkGesture> autoLinkGesture_;

  std::string autoLinkSoloTarget_;

  std::map<std::string,bool> autoLinkSoloOriginals_;

  std::uint64_t autoLinkGestureIdentity_=0;

  std::vector<std::string> autoLinkVisibleTargets()const;

  std::vector<std::string> autoLinkModifierTargets()const;

  bool autoLinkValue(const std::string& id)const;

  void finishAutoLinkGesture();

  void updateAutoLinkGesture(const std::string& id);

  void beginAutoLinkGesture(const std::string& id,const ui::MouseMessage& mouse);

  bool processAutoLinkGesture(ui::Message* msg);

  ui::Widget* timelineSpaceFocus_=nullptr;

  std::uint64_t timelineSpaceIdentity_=0;

  bool processTimelineSelectionKeyboard(ui::Message* msg);

  bool processAutoLinkKeyboard(ui::Message* msg);

  struct VisibilityGesture {std::string start;bool value=false;std::map<std::string,bool> originals;};

  std::optional<VisibilityGesture> visibilityGesture_;

  std::string visibilitySoloTarget_;

  std::map<std::string,bool> visibilitySoloOriginals_;

  std::uint64_t visibilityGestureIdentity_=0;

  std::vector<std::string> visibilityVisibleTargets()const;

  std::vector<std::string> visibilityModifierTargets()const;

  bool visibilityValue(const std::string& id)const;

  void finishVisibilityGesture();

  void updateVisibilityGesture(const std::string& id);

  void beginVisibilityGesture(const std::string& id,const ui::MouseMessage& mouse);

  bool processVisibilityGesture(ui::Message* msg);

  struct LockGesture {std::string start;bool value=false;std::map<std::string,bool> originals;};

  std::optional<LockGesture> lockGesture_;

  std::string lockSoloTarget_;

  std::map<std::string,bool> lockSoloOriginals_;

  std::uint64_t lockGestureIdentity_=0;

  std::vector<std::string> lockVisibleTargets()const;

  std::vector<std::string> lockModifierTargets()const;

  bool lockValue(const std::string& id)const;

  void finishLockGesture();

  void updateLockGesture(const std::string& id);

  void beginLockGesture(const std::string& id,const ui::MouseMessage& mouse);

  bool processLockGesture(ui::Message* msg);

  std::vector<TimelineButton*> layerRows_,layerEyes_,layerLocks_,layerAutoLinks_;

  int layerScroll_=0,frameScroll_=0;

  std::vector<TimelineButton*> frameHeaders_,frameCells_;

  std::unordered_set<std::string> timelineSelectedCels_;

  layerlabel::Width layerLabelWidth_;

  LayerLabelSeparator* layerLabelSeparator_=nullptr;

  bool layerLabelReadable_=true;

  int timelineLabelWidth()const;

  void setLayerLabelWidth(double physical);

  gfx::Rect layerLabelSeparatorBounds()const;

  bool layerLabelHit(gfx::Point at)const;

public:

  bool processLayerLabelResize(ui::Message* msg);

private:

  os::SurfaceRef timelinePaintCache_;

  gfx::Rect timelinePaintCacheBounds_;

  bool timelinePaintCacheValid_=false;

  std::uint64_t timelineCachePaints_=0;

  bool playing_=false,frameSelectionExplicit_=false;

  // Legacy separates editing context from explicit timeline selection.

  std::string selectedTimelineLayer_,selectedTimelineCelLayer_,selectedTimelineCelFrame_;

  std::uint64_t timelineSelectionIdentity_=0;

  bool timelineSelectionGuidesVisible_=true;

  std::vector<TimelineSlot> virtualSlots_;std::optional<TimelineSlot> virtualAnchor_;
  void selectTimelineSlot(int row,int column,int mode=0,const std::vector<TimelineSlot>& replacement={});
  struct GroupExpandGesture{std::string start;bool value;std::map<std::string,bool> originals;};std::optional<GroupExpandGesture> groupExpandGesture_;std::string groupExpandSolo_;std::map<std::string,bool> groupExpandSoloOriginals_;std::uint64_t groupExpandIdentity_=0;
  bool processGroupExpandGesture(ui::Message*);gfx::Rect groupExpandBounds(int visualRow)const;
  struct TimelineGesture {
    std::vector<std::pair<std::string,std::string>> masks;
    std::optional<std::pair<std::string,std::string>> maskAnchor,activeMaskSlot;
    bool maskIsolated=false;
    std::optional<Document::MaskSlotKey> maskDrop;
    std::vector<Document::MaskPlacement> maskPlacements;
    std::vector<TimelineSlot> virtualSlots;std::optional<TimelineSlot> virtualAnchor,pointerAnchor;std::vector<std::string> groups;std::string realTargetCel;std::optional<LayerPanelDropTarget> rowDrop;

    int kind=0,row=0,column=0,targetRow=0,targetColumn=0,mode=0;

    int minRow=0,maxRow=0,minColumn=0,maxColumn=0;

    bool canMove=false,moved=false,copy=false,right=false,after=false,altClick=false,addContent=false,starting=false;

    gfx::Point origin,pointer;

    std::uint64_t identity=0;

    Document::TimelineSelection selection;

    std::vector<std::string> frames;

    std::string activeLayer,activeFrame,anchor,frameAnchor;

  } timelineGesture_;

  ui::Timer timelineScrollTimer_{30,this};

  timeline::LoopPlayback loopPlayback_;

  bool playbackTagMode_=false,playbackModeLoop_=true;

  std::optional<std::string> savedPlaybackMode_;

  std::string playbackSessionMode_="all";

  std::uint64_t playbackModeIdentity_=0;

  std::string playbackTagCycle_,playbackObservedFrame_;

  std::uint64_t playbackIdentity_=0,playbackRevision_=0;

  std::optional<timeline::LoopSection> loopDraft_;

  std::array<PixelEntry*,4> loopInputs_{};

  PixelButton* loopDirection_=nullptr;

  PixelButton* loopRepeat_=nullptr;

  bool loopFinite_=false;

  std::string frameClickCollapse_;

  OnionSkinSettings onion_;

  void showCustomGridSettings(int verify=0);

  bool skipDisabledFrames_=true,animationSettingsReadable_=true;

  gfx::Rect animationSettingsGeometry_;

  bool persistAnimationSettings();

  void showAnimationSettings(bool verify=false);

  int onionField_=0;

  std::chrono::steady_clock::time_point playbackDue_;

  double playbackRate_=1;bool playbackReturnToStart_=false;std::string playbackStartFrame_;

  TimelineButton *layerEye_=nullptr,*layerRow_=nullptr;
  FreeTileInstancesPanel* freeTileInstancesPanel_=nullptr;
  PixelButton* freeTileInstanceSettings_=nullptr;
  bool freeTileInstancesSeparate_=true,freeTileInstancesOpen_=false,freeTileInstanceLayoutReadable_=true;
  std::string freeTileInstanceAutoKey_;
  int freeTileInstanceAutoCount_=0;
  bool freeTileInstanceAutoSeparate_=false;
  void syncFreeTileInstancePanel();
  void layoutFreeTileInstancePanel();
  void showFreeTileInstancePanelSettings(bool verify=false);
  void setFreeTileInstancePanelLayout(bool separate,bool persist=true);
  bool integratedFreeTileInstances()const{return !freeTileInstancesSeparate_&&document.freeTileInstanceView();}
  PixelButton *layerProperties_=nullptr,*layerQuickSettings_=nullptr;

  std::vector<PixelButton*> layerQuickButtons_;

  layerquick::Actions layerQuickActions_=layerquick::normalize({});

  gfx::Rect layerQuickDialogGeometry_;

  void showLayerQuickActions(bool verify=false);

  bool brushRangeOpacity_=false;

  bool updatingBrushFields_=false,smoke_=false,skipWorkspaceRestore_=false;

  int toolRowScroll_=0,shownBrushProfile_=-1;

  ui::MouseButton strokeButton_=ui::kButtonNone;

  bool syncPaletteColors_=false;

  bool showPaletteNames_=false;

  bool paletteSortDescending_=false;

  int swatchSize_=1;

  static constexpr int swatchPixels_[5]={22,30,40,52,64};

  static constexpr const char* swatchKeys_[5]={"tiny","small","medium","large","huge"};

  PixelButton *discard_=nullptr, *keep_=nullptr, *dialogClose_=nullptr, *saveBeforeClose_=nullptr;

  Skin toolIcons_;

  std::array<PixelButton*,5> topActions_{};

  std::vector<PixelButton*> toolRail_;

  std::unique_ptr<ui::PopupWindow> toolFlyout_;

  std::unique_ptr<ToolPropertyPopup> propertyRangePopup_;

  PixelSlider* propertyRangeSlider_=nullptr;
  PixelEntry* parameterRangeOwner_=nullptr;bool parameterRangeFilters_=false;
  void openParameterRange(PixelEntry*,int,int);void syncParameterRange();void closeParameterRange();bool processParameterRangeMessage(ui::Message*);void smokeSmoothParameterRanges();void smokeToolParameterRanges();
public:
  void smokeToolParameterDrafts();
  void smokeFillParameterDrafts();
  void smokeSelectionTransformDraftRoute();

  ui::MenuBar* menuBar_=nullptr;

  std::map<std::string,PixelMenuItem*> menuItems_;

  menus::Commands menuCommands_;

  Pixel ink_=0xffff7929;
  PixelButton* inkButton_=nullptr;
  std::array<InkMode,8> inkProfiles_{};
  bool syncInkAcrossTools_=false;
  std::filesystem::path inkPreferenceOverride_;
  int inkProfileIndex() const; InkMode currentInkMode() const; BrushOptions activeStrokeBrush() const;
  std::filesystem::path inkModesPath() const; void loadInkPreferences(); void saveInkPreferences(); void chooseInkMode(InkMode); void showInkMenu(int smokeChoice=-1); void smokeInkModes();

  bool palettePanelOpen_=true,previewPanelOpen_=true,layersPanelOpen_=true;

  bool eraser_=false, colorPickerOpen_=true, handTool_=false, spaceHeld_=false;











  void invalidatePanMovement(gfx::Point delta);

  std::function<void()> refreshCursor_;

  void updateNavigationCursor();

  void finishPan(bool cancel);
  CanvasNavigationState navigation_;

  // canvas-auto-pan.ts: the active selection gesture owns the viewport edge band.

  void selectionAutoPan(gfx::Point pointer);

  void constrainCanvas();

  std::filesystem::path documentPath_,candidatePath_,recoveryDirectory_;

  bool candidateRecovery_=false;


  RecoverySession recovery_;
  recovery::RecoveryCatalog recoveryCatalog_;

  recovery::Preferences recoveryPreferences_;







  ui::Timer* recoveryTimer_=nullptr;

  struct HeldCelNavigation {ui::KeyScancode key;std::chrono::steady_clock::time_point nextAt;};

  std::vector<HeldCelNavigation> heldCelNavigation_;

  std::uint64_t celNavigationIdentity_=0;

  ui::Timer celNavigationTimer_{40,this};



  std::optional<Document> openCandidate_;

  std::u32string openError_,errorTitle_=U"无法打开工程";

  int modalErrorScroll_=0;

  std::u32string modalErrorContent_;

  enum class Pending { None, New, Open, OpenError, Close, CloseDocument, LayerOpacity, FrameDuration, LoopSection, OnionValue, PaletteName, PaletteLibrary, PaletteSave, PaletteExtract, Timelapse, ColorAdjustment, Convolution, AntiAlias, ReplaceColor, ColorRole, ImageResize, BrushFolderName, StaticExport, SpriteSheet, GifExport, SheetImport, Preferences, Saving } pending_=Pending::None;

  Pending saveResume_=Pending::None;

  bool closeAfterSave_=false;

  std::optional<DocumentSnapshot> saveSnapshot_;

  std::future<project::EncodedProject> saveWorker_;

  std::filesystem::path savingPath_;
  bool savingAseprite_=false,savingSourceOnly_=false;
  struct QueuedSave {std::uint64_t identity;bool saveAs;};
  std::vector<QueuedSave> queuedSaves_;
  Pending queuedSaveResume_=Pending::None;bool queuedSaveClose_=false;
  std::function<bool(OPENFILENAMEW*)> chooseSaveFile_=[](OPENFILENAMEW* dialog){return GetSaveFileNameW(dialog)!=FALSE;};
  std::function<int(bool,const std::vector<std::string>&)> asepriteSaveDecisionForSmoke_;
  int confirmAsepriteSave(bool projectPreferred,const std::vector<std::string>& issues);


  std::uint64_t savingIdentity_=0,savingRevision_=0,savingContentRevision_=0;

  std::vector<std::pair<ui::Widget*,bool>> savingControlStates_;

  void restoreSaveControls();

  int dockWidth_=0,timelineHeight_=109;

  double paletteShare_=0;

  std::map<Pending,gfx::Rect> modalGeometry_;

  enum class SizeDrag { None, DockWidth, ColorSplit, Timeline, Modal, ModalMove } sizeDrag_=SizeDrag::None;

  gfx::Point sizeDragMouse_;

  gfx::Rect sizeDragBounds_;

  int sizeDragEdges_=0,sizeDragValue_=0;

  ui::Timer sizeTimer_{16,this};

  ui::Timer floatingViewportSaveTimer_{32,this};

  ui::Timer antsTimer_{100,this};

  int antsOffset_=0;

  bool showSelectionOutline_=true;

  std::uint64_t selectionOutlineIdentity_=0;

  void syncSelectionOutlineView();

  void toggleSelectionOutline();

  std::optional<gfx::Point> pendingSizePointer_;

  std::uint64_t sizeLayoutUpdates_=0;

  std::uint64_t smokePreviewUpdates_=0;

  std::uint64_t smokePreviewBlits_=0,smokePreviewPaints_=0;

  int smokePreviewStep_=0;

  gfx::Region smokePreviewDrawable_;

  gfx::Rect smokePreviewBefore_;

  std::u32string status_=U"内存画布";

  gfx::Rect canvas_;

  // User layout: left tool rail, adjacent color dock, then document/timeline.

  struct Layout {

    // Logical skin pixels; physical UI remains exactly 2x.

    // 11px legacy icon + 1px colored frame + 1px black edge on each side.

    // Neighbors overlap only the outer black pixel; colored frames stay whole.

    static constexpr int edge=uiGap,gap=uiGap,toolSize=15,toolHeight=16,toolGap=-1,tabHeight=18,projectTabHeight=16,frame=3;

    // Fusion's current Chinese labels occupy ink rows 1..9 in the 10px cell.

    // Menu row: 16px action buttons with 2px top/bottom padding.

    static constexpr int fontHeight=10,labelInkHeight=9,menuHeight=textControlHeight+4,statusHeight=labelInkHeight+2*gap;

    static constexpr int panelY=menuHeight,documentY=panelY,optionsY=documentY+projectTabHeight+frame+gap,optionsHeight=textControlHeight,workY=optionsY+optionsHeight,inset=frame+gap;

    int right,rightX,workX,workW,tabY=optionsY,top=workY+gap,bottom,split,layerTop,pickerTop=-1;


    struct RailGeometry {gfx::Rect viewport,main,bar;bool horizontal=false,overflow=false;int step=15,total=1,page=1;};
    static RailGeometry rail(gfx::Rect rc,int side,int count){
      RailGeometry r;r.horizontal=side>=2;r.step=r.horizontal?toolSize-1:toolHeight+toolGap;r.total=std::max(1,count*r.step+1);const int available=std::max(1,r.horizontal?rc.w-2*edge:rc.h-statusHeight-optionsY);r.page=available;r.overflow=r.total>available;const int scroll=r.overflow?6:0;const int thickness=(r.horizontal?toolHeight:toolSize)+gap+scroll;
      r.main={edge,optionsY,std::max(0,rc.w-2*edge),std::max(0,rc.h-statusHeight-optionsY)};
      if(side==0){r.viewport={edge,optionsY,toolSize,available};r.main.x+=thickness;r.main.w=std::max(0,r.main.w-thickness);r.bar={r.viewport.x2(),r.viewport.y,7,available};}
      else if(side==1){r.viewport={rc.w-edge-toolSize,optionsY,toolSize,available};r.main.w=std::max(0,r.main.w-thickness);r.bar={r.viewport.x-6,r.viewport.y,7,available};}
      else if(side==2){r.viewport={edge,optionsY,available,toolHeight};r.main.y+=thickness;r.main.h=std::max(0,r.main.h-thickness);r.bar={r.viewport.x,r.viewport.y2(),available,7};}
      else{r.viewport={edge,rc.h-statusHeight-toolHeight,available,toolHeight};r.main.h=std::max(0,r.main.h-thickness);r.bar={r.viewport.x,r.viewport.y-6,available,7};}
      return r;
    }
    explicit Layout(gfx::Rect rc,bool layers=true,int dockWidth=0,double paletteShare=0,int timelineHeight=109,int railSide=0,int railCount=13){
      const auto area=rail(rc,railSide,railCount).main;rightX=area.x;tabY=area.y;top=tabY+optionsHeight+gap;bottom=area.y2();
      right=std::clamp(dockWidth?dockWidth:std::clamp(rc.w/6,116,120),116,std::max(116,area.w-gap-160));workX=rightX+right+gap;workW=std::max(1,area.x2()-workX);
      split=paletteShare>0?top+int(std::round((bottom-top)*paletteShare)):tabY+(bottom-tabY)*2/5;split=std::clamp(split,top+70,std::max(top+70,bottom-100));layerTop=layers?bottom-std::clamp(timelineHeight,65,std::max(65,bottom-top-100)):bottom+gap;
    }

    int paletteBottom(bool picker) const {return picker?split-gap:bottom;}

    gfx::Rect pickerPanel() const {return {rightX,split,right,bottom-split};}

    gfx::Rect pickerContent() const {const auto chrome=PanelChromeLayout(pickerPanel(),true);const int y=pickerTop>=0?pickerTop+PanelChromeLayout::actionHeight+uiGap:chrome.content.y;return {rightX+inset,y,right-2*inset,bottom-y-inset};}

    gfx::Rect pickerGradient(bool recent) const {auto r=pickerContent();r.h-=44+(recent?12+uiGap:0);return r;}

    gfx::Rect workspacePanel() const {return {workX,top,workW,layerTop-gap-top};}

    gfx::Rect workspaceContent() const {return {workX+inset,top+inset,workW-2*inset,layerTop-gap-top-2*inset};}

  };

  int advancedMode_=0; // Session view: normal, tool options, canvas only.
  bool advancedNotice_=false;
  ui::Timer advancedNoticeTimer_{1700,this};
  std::vector<std::pair<ui::Widget*,bool>> advancedHidden_;
  bool advancedActive()const;
  int optionsTop()const;
  bool advancedToolWidget(ui::Widget* w)const;
  void restoreAdvancedVisibility();
  void applyAdvancedVisibility();
  void changeAdvancedMode(int next);
  void cycleAdvancedMode();
  void paintAdvancedNotice(ui::Graphics& graphics);

  panels::Model docking_;

  std::array<PixelButton*,panels::columnCount> dockingTabs_{};

  DockFeedback* dockFeedback_=nullptr;

  std::array<FloatingColumnSurface*,panels::columnCount> floatingSurfaces_{};

  std::array<PixelButton*,panels::columnCount> columnClose_{};

  FloatingColumnSurface* modalSurface_=nullptr;

  std::array<std::uint64_t,panels::columnCount> floatingFocus_{};

  std::uint64_t overlayClock_=0,dialogFocus_=0;

  Pending stackedPending_=Pending::None;

  struct PanelGesture {int id=-1,edges=0,neighbor=-1;bool moved=false,wholeGroup=false;gfx::Point origin,pointer;gfx::Rect tabStart;panels::Rect start;panels::Model before;panels::Target candidate,confirmed;std::chrono::steady_clock::time_point due;};

  PanelGesture panelGesture_;

  std::optional<gfx::Point> pendingPanelPointer_;

  std::uint64_t panelGeometryUpdates_=0,panelBlitMoves_=0,panelFullRefreshes_=0;

  ui::Timer panelDockTimer_{16,this};

  gfx::Rect toDisplay(gfx::Rect local)const;

  gfx::Rect dialogDisplayBounds()const;

  panels::Visibility columnVisibility()const;

  panels::Rect dockArea(gfx::Rect rc)const;

  panels::Rect floatingArea(gfx::Rect rc)const;

  panels::Geometry columnGeometry(gfx::Rect rc)const;

  bool columnShown(int id)const;

  Layout workspaceLayout(gfx::Rect rc)const;

  Layout columnLayout(gfx::Rect rc,int id)const;

  // Background frame has a 3px rim; keep 2px before controls/content.

  // Reserve the complete 10px title cell; grouped tabs sit outside the frame.

  PanelChromeLayout columnChrome(int id)const;

  int columnBodyTop(int id)const;

  void initializeDocking();

  void restorePickerSquare(int id=1);

  void dockColumn(int id,panels::Dock dock);

  void ensureProjects();

  const Document& projectDocument(std::size_t index)const;

  int projectWidth(const Document& value)const;

  int documentTabWidth(const Layout&)const;

  void swapRecovery(ProjectSession& slot);

  void settleProjectGesture();

  void storeActiveProject();

  void restoreProject(std::size_t index);

  void activateProject(std::size_t index);

  gfx::Rect aboutDialogGeometry_;bool aboutGeometryLoaded_=false,aboutGeometryReadable_=true;
  std::function<void(AboutDialog&)> aboutDialogCheckForSmoke_;
  AboutDialog* aboutDialogForFocus_=nullptr;
  std::function<void()> aboutRepositoryLauncher_=[] {SHELLEXECUTEINFOW action{};action.cbSize=sizeof(action);action.fMask=SEE_MASK_FLAG_NO_UI;action.lpVerb=L"open";action.lpFile=L"https://github.com/MoonPixelTeam/moonsprite";action.nShow=SW_SHOWNORMAL;if(!ShellExecuteExW(&action))throw std::runtime_error("无法打开链接 (Windows "+std::to_string(GetLastError())+")");};
  void showAbout();
  void showLatestRelease(std::size_t index=0,bool verify=false);bool releaseNotesVerify_=false,releaseNoticeHandled_=false;
  void showProjectInformation(bool verify=false);bool projectInformationVerify_=false;
  void showHelp(bool tips,bool verify=false);bool helpVerify_=false;

  bool pasteAsNewDocument();

  void addProject(Document next,std::filesystem::path path={});

  void layoutDocumentTab();

  void closeDocumentTab();

  bool processProjectTabs(ui::Message* msg);

  bool enabledTimelineAction(std::size_t i) const;

  // Toolbar selectAnimationEdge/selectAnimationStep explicitly select frames, independent of keyboard stepping.

  void toolbarSelectFrame(std::size_t index);

  void toolbarStepFrame(int direction);

  void keyboardStepFrame(int direction);

  static bool celNavigationKey(ui::KeyScancode key);

  bool celNavigationBlocked() const;

  void stopCelNavigation();

  void releaseCelNavigation(ui::KeyScancode key);

  void navigateCel(ui::KeyScancode key);

  void pressCelNavigation(ui::KeyScancode key,std::chrono::steady_clock::time_point now);

  void celNavigationTick(std::chrono::steady_clock::time_point now);

  bool canDeleteWorkspaceContent() const;

  void deleteWorkspaceContent(bool keyboard);

  void seekFrame(std::size_t index);

  void createLayer();

  void deleteTimelineItems();

  void frameAction(int kind);

  // Legacy AnimationPlaybackMenu/useAnimationPlaybackClock rates and deadline reset.

  static double normalizedPlaybackRate(double value);

  std::chrono::steady_clock::duration playbackFrameDelay() const;

  void readPlaybackPreferences(std::istream& in);

  void writePlaybackPreferences(std::ostream& out)const;

  void savePlaybackPreferences();

  void setPlaybackRate(double rate);

  void completePlayback(bool once);

  void setPlaybackLoopMode(bool loop);

  void playOnceMode();

  void showPlaybackMenu();

  const timeline::LoopSection* playbackSection(const std::string& id)const;

  bool playbackSectionContains(const timeline::LoopSection& section,const std::string& frame)const;

  bool installPlaybackSection(const timeline::LoopSection& section,bool seek);

  std::string nextTagFrame(const std::string& frame)const;

  void setPlaybackTagMode();

  void retargetTagPlayback();

  bool continueTagPlayback(const std::string& next);

  void startLoopPlayback(const std::string& id);

  void updateFramesDisabled(bool disabled,bool toggle=false);

  void togglePlayback();

  void playbackTick();

  void openLoopEditor(const std::string& id={});

  void updateLoopDirection();

  void updateLoopRepeat();

  void toggleLoopRepeat();

  std::u32string loopDisplayName()const;

  std::pair<int,int> loopDisplayRange()const;

  bool commitLoopEditor();

  void openFramePropertiesFor(std::size_t index);

  bool commitFrameDurationDraft();

  void closePaletteModal();

  void showFrameDuration();

  void saveOnionSettings();

  void toggleOnion();

  void openOnionValue(int field);

  void previewOnionValue();

  void showOnionMenu();

  std::vector<std::string> contextLayerTargets_;

  std::uint64_t contextLayerIdentity_=0;

  std::string contextFrameId_;

  std::string contextCelId_;

  std::uint64_t contextCelIdentity_=0;

  enum class Column { Palette, Color, Layers, Preview };

  void clipColumn(ui::Graphics& g,int id,bool physical)const;

  bool columnFloating(int id)const;

  int columnFrameTop(int id)const;

  gfx::Rect columnFrame(int id)const;

  int topFloatingColumnAt(gfx::Point point)const;

  std::uint64_t groupFocus(int id)const;

  void focusOverlayAt(gfx::Point point);

  int widgetColumn(ui::Widget* w)const;

  bool floatingChrome(ui::Widget* w)const;

  void raiseFloatingAt(gfx::Point point);

  void layoutFloatingColumnActions();
  void raiseDockWidgets();

  void beginPanelGesture(int id,const ui::MouseMessage& mouse,int edges=0,bool wholeGroup=false);

  void finishPanelGesture(bool cancel=false);

  void tickPanelGesture();

  gfx::Rect dockGhostRect()const;

  gfx::Rect dockFeedbackBounds()const;

  void flushDockPointer();

  void moveFloatingWidgets(int id,gfx::Point delta);

  void layoutGestureColumns(int id,bool all);

  void updatePanelGesture(gfx::Point pointer);

public:

  bool dispatchPanelGesture(ui::Message* msg);

private:

  struct PanelResizeHit {int id=-1,edges=0,neighbor=-1;};

  PanelResizeHit panelResizeAt(gfx::Point point)const;

  static const char* panelResizeHitCursor(int edges);

  bool processPanelGesture(ui::Message* msg);

  void buildColumnContextMenu(PixelMenu& menu,Column column);

  gfx::Point pointerMenuPosition(gfx::Point screenPosition) const;

  void showColumnContextMenu(Column column);

  // Legacy create-area / layer / frame-header / cel context menus.

  void buildLayerContextMenu(PixelMenu* menu,int kind);

  void showCrossfadeTween(std::string start,std::string layer,int verify=0,std::string initialLoop={});

  void showCelProperties(const std::string& id,int verify=0);

  void prepareLayerContext(const std::string& id);

  void prepareCelContext(const std::string& id);

  void showLayerContextMenu(int kind);

  bool celHasContent(const timeline::Cel* cel);

  void clearTimelineRowSelection();

  void markFrameSelection();

  void selectTimelineLayer(std::size_t index);

  void selectTimelineCel(std::size_t row,std::size_t column);

  void hideTimelineSelectionGuides();

  bool clearTimelineSelectionFromBlank(const ui::MouseMessage& mouse);

  struct TimelineScrollMetrics {int width=1,viewportWidth=1,height=1,contentWidth=1,contentHeight=1;bool horizontal=false,vertical=false;};

  struct LoopTrackDrag {std::string id;int edge=0,start=0,end=0,previewStart=0,previewEnd=0;std::uint64_t identity=0;bool moved=false;gfx::Point pointer;};

  std::optional<LoopTrackDrag> loopTrackDrag_;

  ui::Timer loopTrackTimer_{30,this};

  timeline::LoopSectionLayout loopTrackLayout() const;

  int loopTrackHeight() const;

  int timelineHeaderOffset() const;

  // Legacy density dimensions adapted to native 2x; accepted compact spacing retained.

  int timelineDensity_=0;

  static constexpr const char* timelineDensityKeys_[6]={"compact","normal","detailed","expanded","large","huge"};

  int timelineRowHeight() const;

  int timelineFrameWidth() const;

  int timelineHeaderHeight() const;

  int timelineThumbnailSize() const;

  void setTimelineDensity(int density);

  bool attachedMaskRow(const std::string& id)const;
  const timeline::MaskSlot* selectedOwnerMask()const;
  std::string selectedMaskPropertyOwner()const;
  std::string attachedMaskOwner(const std::string& id)const;
  bool selectMaskSlot(const std::string& owner,const std::string& frame,int mode=0,const std::vector<Document::MaskSlotKey>* replacement=nullptr,bool isolated=false);
  bool maskLayerControlsAvailable(const std::string& owner,const std::string& frame)const;
  void toggleMaskIsolation(const std::string& owner,const std::string& frame,bool additive=false);
  bool selectMaskTimelineRow(int row,int column,int mode=0,const std::vector<std::pair<std::string,std::string>>* replacement=nullptr);
  void copyMaskTimeline(bool cut=false);
  void pasteMaskTimeline(const std::string& owner,const std::string& frame);
  void reportMaskTransfer(Document::MaskTransferResult);
  std::vector<Document::MaskSlotKey> maskTimelineVisualSlots()const;
  void buildAttachedMaskMenu(PixelMenu&,const std::string& owner,const std::string& frame);
  void showAttachedMaskMenu(const std::string& owner,const std::string& frame);
  std::vector<std::pair<std::string,std::string>> selectedMaskSlots_;
  bool selectMaskPanelRow(int row,int mode=0);
  std::optional<std::pair<std::string,std::string>> maskSelectionAnchor_;
  std::string maskContextOwner_,maskContextFrame_;
  int timelineRowsOffset() const;

  gfx::Rect loopTrackViewport() const;

  gfx::Rect loopTrackItemBounds(const timeline::LoopSectionLayoutItem& item) const;

  struct LoopTrackHit {std::string id;int edge=0;};

  LoopTrackHit loopTrackHit(gfx::Point point) const;

  void buildLoopTrackMenu(PixelMenu& menu,const std::string& id);

  void finishLoopTrackResize(bool cancel=false);

  void updateLoopTrackResize(gfx::Point point,bool scrolling=false);

  bool processLoopTrack(ui::Message* msg);

  void paintLoopTrack(ui::Graphics& g);

  TimelineScrollMetrics timelineScrollMetrics(const Layout& l) const;

  int timelineColumns(const Layout& l) const;

  int timelineCapacity(const Layout& l) const;

  gfx::Rect timelineRowViewport() const;

  gfx::Rect timelineFrameViewport(bool header=false) const;

  gfx::Rect timelineMaterialViewport(gfx::Rect viewport,bool header=false) const;

  void layoutTimelineScrollBars(const Layout& l);

  struct TimelineThumbnailBinding {

    std::string cel,key;std::uint64_t identity=0,revision=0,generation=0;bool live=false;

    CelThumbnailOwner owner;CelThumbnailQueue::Cancel cancel;os::SurfaceRef image;

  };

  CelThumbnailCache thumbnailCache_;

  ui::Timer thumbnailTimer_{1,this};

  std::map<std::uint64_t,std::function<void()>> thumbnailDeferred_;

  std::uint64_t thumbnailHandle_=0;

  std::unique_ptr<CelThumbnailQueue> thumbnailQueue_;

  std::vector<TimelineThumbnailBinding> thumbnailBindings_;

  void bindTimelineThumbnail(std::size_t slot,const timeline::Cel* cel);

  void layoutLayers();

  bool liquifyTool_=false,liquifyDragging_=false;
  liquify::Options liquifyOptions_;liquify::Mode liquifyGestureMode_=liquify::Mode::Push;
  std::uint64_t liquifyGestureIdentity_=0,liquifyResetIdentity_=0,liquifyResetRevision_=0;
  std::optional<std::size_t> liquifyResetPosition_;
  std::chrono::steady_clock::time_point liquifyNextTick_;
  std::filesystem::path liquifyPreferenceOverride_,liquifyPreferencePath()const;
  std::vector<std::pair<ui::Widget*,int>> liquifyControls_;
  std::array<PixelButton*,5> liquifyModeButtons_{};
  PixelButton *liquifySmoothingButton_=nullptr,*liquifyResetButton_=nullptr;
  PixelEntry *liquifyRadiusInput_=nullptr,*liquifyStrengthInput_=nullptr,*liquifySmoothingInput_=nullptr;
  void createLiquifyOptions();bool layoutLiquifyOptions();void showLiquifyRange(int);
  void loadLiquifyPreferences();void saveLiquifyPreferences();bool processLiquifyInput(ui::Message*);void finishLiquifyGesture(bool);void liquifyTick();
  void smokeLiquify();void paintLiquifyPreview(ui::Graphics&,const gfx::Rect&);
  double zoom_=8;view::Rotation viewRotation_;bool rotateTool_=false,rotationDragging_=false;double rotationStart_=0,rotationAngle_=0;gfx::Rect rotationCanvas_;view::Point rotationPivot_;
  gfx::Rect canvasPaintViewport(gfx::Rect)const;gfx::Rect canvasDisplayBounds()const;void panCanvasDisplay(double,double);void paintViewRotationIndicator(ui::Graphics&);
  view::Point canvasRotationPivot()const;gfx::Matrix canvasRotationMatrix()const;gfx::Point canvasUnrotatedDisplay(gfx::Point)const;TransformPoint canvasDocumentPoint(gfx::Point)const;gfx::Point canvasDocumentToDisplay(TransformPoint)const;bool canvasDocumentContains(gfx::Point)const;void setViewRotation(double);void initializeViewRotation();bool processViewRotation(ui::Message*);void saveDocumentView();void loadDocumentView();

  double canvasScale() const;

  CanvasRenderer renderer_;

  unsigned chromePaints_=0;

  bool modalControl(ui::Widget* w) const;

  void compositeControl(ui::Widget& widget,ui::PaintEvent& ev,const std::function<void()>& paint);
  template<class Base> void configureDialogBackground(DialogBackground<Base>* w) {
    w->blocked=[this,w]{return pending_!=Pending::None && !modalControl(w);};
    w->composite=[this](ui::Widget& widget,ui::PaintEvent& ev,const std::function<void()>& paint){compositeControl(widget,ev,paint);};
  }

  PixelButton* button(std::u32string label,std::function<void()> action);
  TimelineButton* timelineButton(std::u32string label,std::function<void()> action);

  PixelSwitch* switchButton(std::u32string label,bool checked,std::function<void(bool)> changed);

  Point canvasPoint(gfx::Point p) const;

  gfx::Rect canvasFullViewport() const;

  gfx::Rect canvasViewport() const;

  void layoutCanvasScrollBars();

  gfx::Rect changedCanvasPixels() const;

  void invalidateStrokePixels(std::uint64_t before);

  void fitCanvas();

  void zoomCanvas(gfx::Point anchor,int direction);

  bool zoomFullRedraw_=false,symmetryClip_=true;

  gfx::Rect statusBounds() const;

  void setCanvasZoom(gfx::Point anchor,double next);

  void useZoomTool();

  void finishZoomTool();

  void layoutPanelTabs(int only=-1);

  int paletteActionsY(const Layout& l) const;

  gfx::Rect paletteContentBounds() const;

  gfx::Rect paletteViewportBounds() const;

  void layoutPalette(int only=-1);

  std::filesystem::path palettePreferencePath() const;

  static const char* modalSizeKey(Pending action);

  PixelButton* workspaceMenuButton_=nullptr;
  std::string workspaceBaseline_,activeWorkspacePreset_="builtin-default",activeWorkspacePresetName_="默认工作区";
  bool workspacePresetReady_=false,workspacePresetApplying_=false,workspacePresetDirty_=false,workspacePresetDialogOpen_=false;
  ui::Timer workspacePresetTimer_{800,this};
  std::optional<std::filesystem::path> workspacePresetTestDirectory_;
  WorkspacePresetLibrary workspacePresetLibrary()const;
  std::string captureWorkspacePreset()const;
  void applyWorkspacePresetLayout(const std::string&);
  void initializeWorkspacePresets();
  void restoreWorkspacePreset();
  void queueWorkspacePresetSave();
  void flushWorkspacePresetSave();
  std::u32string saveWorkspacePreset(const std::string&);
  std::u32string loadWorkspacePreset(const std::string&);
  std::u32string deleteWorkspacePreset(const std::string&,int verify=0);
  void resetWorkspacePreset();
  void showWorkspacePresetMenu();
  void showSaveWorkspacePreset(int verify=0,const std::string& smokeName={});
  void showWorkspacePresetManager(int verify=0);
  void smokeNamedWorkspacePresets();
  bool timelineHidden_=false;
  bool layerSideDockAutoHide_=true,layerSideDockReadable_=true;
  std::filesystem::path timelineVisibilityPath()const;
  void loadTimelineVisibility();
  void setTimelineHidden(bool hidden,bool persist=true,bool redraw=true);
  void layoutHiddenTimelineRows();
  void bindHiddenTimelineThumbnail(TimelineButton* button,const std::string& owner,bool mask);
  std::vector<TimelineButton*> hiddenCelThumbnails_,hiddenMaskThumbnails_,hiddenMaskLinks_;
  int timelineNameOffset()const{return timelineHidden_?24:36;}
  void smokeTimelineVisibility();
  int toolRailSide_=0;
  bool toolRailFlyoutOpen_=false;
  PixelScrollBar* railVerticalScrollBar_=nullptr;
  PixelScrollBar* railHorizontalScrollBar_=nullptr;
  std::filesystem::path toolRailSidePath()const;
  void loadToolRailSide();
  void setToolRailSide(int side,bool persist=true,bool redraw=true);
  void smokeToolRailPlacement();
  void writeWorkspaceSizes(std::ostream& out) const;

  void saveWorkspaceSizes();

  void loadWorkspaceSizes();

  void readWorkspaceSizes(std::istream& in);

  void saveSelectionPreferences();


  bool smoothTool_=false,smoothDragging_=false;
  int smoothStrength_=50,smoothAngle_=0;
  BrushOptions smoothBrush_;
  std::uint64_t smoothIdentity_=0,smoothContent_=0;
  std::string smoothLayer_,smoothFrame_;
  SmoothBrushArea smoothArea_;
  std::chrono::steady_clock::time_point smoothStarted_;
  SelectionPoint smoothLast_;
  std::optional<SelectionMask> smoothSelection_;
  std::optional<gfx::Point> smoothPointer_;
  std::vector<std::pair<ui::Widget*,int>> smoothControls_;
  PixelEntry *smoothStrengthInput_=nullptr,*smoothAngleInput_=nullptr;
  void useSmoothTool();bool processSmoothInput(ui::Message*);void createSmoothOptions();void saveSmoothPreferences();void paintSmoothCoverage(ui::Graphics&,const gfx::Rect&);

  dynamics::Settings brushDynamics_;dynamics::Input dynamicsInput_;std::optional<dynamics::SpeedState> dynamicsSpeed_;std::optional<double> dynamicsPreviousPressure_;bool dynamicsPressureProved_=false,dynamicsStroke_=false;dynamics::Resolved dynamicsLast_;double dynamicsRasterDistance_=1;std::filesystem::path dynamicsPreferenceOverride_;PixelButton* dynamicsButton_=nullptr;std::unique_ptr<ToolPropertyPopup> dynamicsPopup_;ui::Widget* dynamicsChart_=nullptr;int dynamicsEffect_=0;std::array<std::array<PixelButton*,2>,4> dynamicsMatrix_{};std::array<PixelEntry*,4> dynamicsFields_{};std::array<PixelButton*,3> dynamicsCurveButtons_{};std::array<PixelButton*,2> dynamicsDirectionButtons_{};PixelButton* dynamicsDitherButton_=nullptr;
  void loadDynamicsPreferences();void saveDynamicsPreferences();void showDynamicsOptions(bool smokeOnly=false);void syncDynamicsOptions();void observeDynamicsInput(ui::Message*);dynamics::Resolved resolveDynamics(bool initial=false);void beginDynamicBrush(ui::MouseMessage*,Point,const std::unordered_map<std::size_t,Pixel>* baseline=nullptr,bool initial=true);void updateDynamicBrush(ui::MouseMessage*,Point);void smokeBrushDynamics();
public:
  void smokeBrushDynamicsDraft();
private:
  void saveBrushPreferences();
  bool airbrushTool_=false,airbrushDragging_=false;
  AirbrushSettings airbrushSettings_;
  SelectionPoint airbrushCenter_;
  double nextAirbrushAt_=0;
  std::mt19937_64 airbrushRandom_{std::random_device{}()};
  ui::Timer airbrushTimer_{16,this};
  std::vector<std::pair<ui::Widget*,int>> airbrushControls_;
  std::array<PixelEntry*,5> airbrushFields_{};
  PixelButton* airbrushShapeButton_=nullptr;
  void paintAirbrushPreview(ui::Graphics&,const gfx::Rect&);void useAirbrushTool();void sprayAirbrush();void createAirbrushOptions();void layoutAirbrushOptions();void saveAirbrushPreferences();void smokeAirbrush();void smokeSmoothBrush();
  bool processAirbrushInput(ui::Message*);

  void commitBrushField(bool opacity);

  void brushShapeMenu();

  gfx::Rect toolPopupBounds(ui::Widget* trigger,int width,int height);

  void showPropertyRange(PixelEntry* entry,int minimum,int maximum);

  void showBrushRange(bool opacity);

  gfx::Rect homeBounds() const;

  int homeBannerHeight() const;

  int homeContentY() const;

  int homeLeftWidth() const;

  std::filesystem::path homeRecentPath() const;

  void recordHomeRecent(const std::filesystem::path& path);
  void loadRecentProjects();void saveRecentProjects();void updateRecentMenu();void recentChanged();void openRecentProject(const std::string&,bool background=false);void removeRecentProject(const std::string&);void toggleRecentPrivacy();void openRecentFolder(const std::string&);

  void loadHomeSection();

  void layoutHome();

  void showHome(bool open);

  void applyHomeVisibility();

  void createHome();

  // The work layer overlays the flat base layer; columns are painted above it.

  void paintWorkLayer(ui::Graphics& g,const gfx::Rect& rc);

  void paintDocumentTab(ui::Graphics& g);

  void paintHome(ui::Graphics& g);

  void createToolOptions();

  void showFillSettings(PixelButton* trigger,bool gradient=false);

  void showGradientStopsMenu(bool verify=false);

  void showFillTexturePopup(bool verify=false);

  PixelButton* gradientRadialButton_=nullptr;

  void createGradientOptions();

  void connectLegacyPropertyRanges();

  void createShapeOptions();

  std::vector<PixelDropdown*> propertyDropdowns_;

  void migratePropertyDropdowns();

  void initializePropertyEntryWidths();

  static constexpr int propertyIconWidth=15,propertyIconHeight=16;

  int propertyControlWidth(ui::Widget* control,int width) const;

  void placePropertyControl(ui::Widget* control,int x,int width);

  bool supportsToolSymmetry()const;

  void layoutSymmetryOptions();

  void layoutToolRail();

  void finishToolScrollLayout();

  void layoutToolOptions();

  std::vector<int> paletteViewSlots()const;

  PaletteViewSelection capturePaletteView()const;

  void restorePaletteView();

  void choosePaletteLayout(bool manual);

  void addManualPaletteColor(std::size_t slot);

  void syncPaletteButtons();

  bool paletteOutlineContains(gfx::Point point)const;

  std::size_t paletteSlotAt(gfx::Point point) const;

  void beginPaletteGrowth(const ui::MouseMessage& mouse);

  void updatePaletteGrowth(gfx::Point point);

  void finishPaletteGrowth(bool cancel=false);

  void beginPalettePointer(std::size_t index,const ui::MouseMessage& mouse);

  void updatePalettePointer(gfx::Point point);

  void finishPalettePointer(bool cancel=false);

  void copyPaletteColors();

  void pastePaletteColors();

  void selectSwatch(std::size_t index,bool ctrl,bool shift,bool secondary);

  static bool readPaletteNamesPreference(std::istream& in);

  void loadPaletteSize();

  void choosePaletteSynchronization(bool enabled);

  void choosePaletteNames(bool show);

  void choosePaletteSortDirection(bool descending);

  void chooseSwatchSize(int size,bool persist=true);

  void togglePaletteLock();

  void paletteWheel(const ui::MouseMessage& mouse,bool persist=true);

  static bool parsePaletteHex(const std::string& value,Pixel& next);

  static std::string paletteHex(Pixel color);

  void commitPaletteHex();

  void setColorEditorSampling(bool active,ColorEditorPopup* target=nullptr);
  bool processColorEditorCanvasSampling(ui::Message* msg);

  void showRoleColorEditor(bool secondary,PixelButton* trigger=nullptr);

  void openPaletteEditor(int id,bool secondary);

  void saveReplacePreferences();

  std::vector<std::string> replaceTargets()const;

  void cancelReplacePreview();

  void updateReplaceUi();

  void previewReplace();

  void changeReplaceColor(int target,Pixel color,bool sampled=false);

  void beginReplaceSampling(int target);

  void finishReplaceSampling();

  void openReplaceColor();

  void createReplaceControls();

  void stopAntiAlias();

  void changeAntiAlias();

  void launchAntiAlias();

  void requestAntiAliasApply();

  void antiAliasTick();

  void openAntiAlias();

  void createAntiAliasControls();

  void layoutAntiAlias(const gfx::Rect& modal);

  void stopConvolution();

  void changeConvolution();

  void launchConvolution();

  void requestConvolutionApply(bool close);

  void convolutionTick();

  void openConvolution();

  void createConvolutionControls();

  void layoutConvolution(const gfx::Rect& modal);

  void cancelGradientMapJob();

  void scheduleGradientMap(bool commit=false);

  void gradientMapTick();

  GradientMapPresetStore gradientMapStore()const;

  void gmChanged(bool controlsChanged=true);

  void gmRefreshPresets();

  void openGradientMap();
  void openGradientMapLayer(bool create=false);
  bool editingLayerAdjustment_=false,layerAdjustmentEnabled_=true;

  void createGradientMapControls();

  void layoutGradientMap(const gfx::Rect& modal);

  void updateAdjustmentControls();

  void previewAdjustment();

  void openColorAdjustment(ColorAdjustmentKind kind);

  void updateResizeFields();

  void openImageResize();

  bool exportAllLayers_=false,animationLayerJob_=false;

  AnimationLayerExportOptions animationLayerOptions_;

  AnimationLayerExportPlan animationLayerPlan_;

  bool framePngMode_=false,framePngAutomatic_=false,frameBmp_=false,frameIco_=false,frameSvg_=false,frameJpeg_=false;

  struct FramePngJobState {std::atomic<bool> cancel{false};std::atomic<std::size_t> written{0};std::size_t total=0;};

  std::shared_ptr<FramePngJobState> framePngJob_;

  std::optional<DocumentSnapshot> framePngSnapshot_;

  std::future<std::string> framePngWorker_;

  FramePngExportOptions framePngOptions_;

  std::vector<std::filesystem::path> framePngPaths_;

  bool framePngBusy()const;

  bool supportedExportPreference(int index)const;

  void unsupportedExportPreference();

  void openFramePngExport(bool usePreference=true);

  ExportConflictChoice framePngConflict(const std::filesystem::path& path,const std::filesystem::path& suggested);

  void beginFramePngExport(const std::filesystem::path& path,const ExportConflictResolver& resolver);

  bool saveFramePngExport();

  void framePngTick();

  void openGifExport();

  void switchAnimatedExportFormat(bool webp);

  void beginAnimationLayerExport(const std::filesystem::path& path,const ExportConflictResolver& resolver);

  bool saveAnimationLayerExport();

  bool saveGifExport();

  void createGifExportControls();

  void updateSheetImportFields();

  void openSheetImport(bool selected);

  void chooseSheetSource();

  void createSheetImportControls();

  void openSpriteSheet();

  bool saveSpriteSheet();

  void createSpriteSheetControls();

  bool staticBmp_=false,staticIco_=false,staticSvg_=false,staticJpeg_=false;

  void switchStaticExportFormat(int format);

  void openSvgExport();

  void openIcoExport();

  void openBmpExport();

  void writeCurrentStaticExport(const std::filesystem::path& path);

  void openAsepriteExport();
  void openDocumentExport();

  void setFrameSequenceFormat(FrameSequenceFormat format,bool automatic=false);

  void finishExportFolder(const std::filesystem::path& directory);

  void exportAndOpenFolder();

  void createExportFormatControl();

  void ensureExportScaleButtons();

  void createExportScalePresets();

  PixelDropdown* exportDropdown(PixelButton*& previous);

  std::wstring exportExtension()const;

  std::filesystem::path exportFormPath()const;

  bool chooseFormExportFile(OPENFILENAMEW* dialog);

  void chooseExportLocation();

  void buildExportLocationMenu(PixelMenu& menu);

  void showExportLocationMenu();

  void createExportComponents();

  std::filesystem::path exportPresetPath()const;

  void updateExportPresetOptions();

  void loadExportPresets();

  bool persistExportPresets(const std::vector<ExportPreset>& next);

  void saveExportPreset();

  void deleteExportPreset();

  void applyExportPreset(ExportPreset p);

  int exportScaleY() const;

  void layoutExportForm(const gfx::Rect& modal);

  void openStaticExport();

  void beginStaticLayerExport(const std::filesystem::path& path,const ExportConflictResolver& resolver);

  bool saveStaticLayerExport();

  bool saveStaticExport();

  void createStaticExportControls();

  void createResizeControls();

  void createAdjustmentControls();

  std::u32string extractionDefaultName()const;

  std::u32string extractionName()const;

  std::vector<Pixel> paletteSaveColors()const;

// Included inside Editor: native controls for legacy PalettePanel library/save flows.
std::u32string storedPaletteError(const std::exception& error)const;
std::function<bool(OPENFILENAMEW*)> choosePaletteImportFile_=[](OPENFILENAMEW* dialog){return GetOpenFileNameW(dialog)!=FALSE;};
std::filesystem::path paletteLibraryOverride_;
std::string activeStoredPalette_;
std::vector<std::string> hiddenStoredPalettes_;
std::vector<StoredPalette> storedPalettes_;
std::vector<PixelButton*> storedPaletteRows_;
std::vector<std::vector<PixelButton*>> storedPaletteSwatches_;
PixelScrollBar* storedPaletteScroll_=nullptr;
std::vector<PixelButton*> storedPaletteActions_;
PixelButton *paletteSaveNew_=nullptr,*paletteSaveCurrent_=nullptr;
int storedPaletteScrollPixels_=0;
std::filesystem::path paletteLibraryDirectory()const;
PaletteLibrary paletteLibraryStore()const;
void persistStoredPalettePreferences();
void applyStoredPalette(const StoredPalette& p);
void deleteStoredPalette(const std::string& id);
void storedPaletteContext(std::string id);
void refreshStoredPalettes();
void importStoredPalette();
bool saveStoredPalette(bool current);
void openStoredPaletteLibrary();
bool storedPaletteModalControl(ui::Widget* w)const;
void createStoredPaletteControls();
void layoutStoredPaletteControls(const gfx::Rect& modal);


  void openPaletteSave();

  bool savePalettePng();

  void openPaletteExtraction();

  bool applyPaletteExtraction();

  std::vector<std::size_t> paletteGradientSlots()const;

  void applyPaletteGradient(bool hue);

  void showPaletteActions();

  std::string activeRailTool() const;

  enum class RefreshScope : unsigned { None=0, Canvas=1, Timeline=2, Palette=4, Tools=8, Commands=16, Layout=32, All=63 };
  void applyDocumentPreferences(Document& target,bool initializeSymmetry=false);
  void applyWorkspacePreferences();
  void syncDocumentViewState();
  void updateCommandStates();
  void updateControlVisibility();
  void refresh(RefreshScope scope=RefreshScope::All);


  void cancelStroke();

  std::function<void(const std::filesystem::path&)> projectFolderLauncher_;

  std::filesystem::path projectFolderSource()const;

  bool fullscreenTransition_=false,restoreMaximizedAfterFullscreen_=false;

  std::function<void(os::Window*,bool)> setNativeFullscreen_=[](os::Window* window,bool state){window->setFullscreen(state);};

  bool fullscreen()const;

  void toggleFullscreen();

  bool fullscreenShortcut(ui::Message* msg);

  void openProjectFolder();

  void acceptOpen();

  static bool sameProjectPath(const std::filesystem::path& a,const std::filesystem::path& b);

  void openPath(const std::filesystem::path& path);

  void showSaveError(const std::exception& error);

  void saveTick();

  bool savePath(const std::filesystem::path& path,bool background=false,bool sourceOnly=false);

  bool saveProject(bool saveAs);

  std::filesystem::path recoveryDirectory();

  void recoveryTick(bool force=false);

  void activeRecoveryTick(bool force=false);

  void restoreRecovery(const std::filesystem::path& archive,const std::string& id,const std::u32string& name);

  void setRecoveryPreferences(recovery::Preferences preferences);

  BrushLibraryPanel* brushLibraryPanel_=nullptr;std::array<PixelButton*,3> brushLibraryActions_{};bool brushLibraryPanelOpen_=false,brushLibraryPreferencesReadable_=true,brushLibraryNeedsReload_=true;std::string brushLibraryResourceKey_;std::optional<std::filesystem::path> brushLibraryTestDirectory_;void createBrushLibraryPanel();void syncBrushLibraryPanel(bool reload=false);void layoutBrushLibraryPanel();void selectBrushLibraryItem(const std::string&,bool,bool);void showBrushLibraryActions();std::filesystem::path brushLibraryPreferencePath()const;
  void showColorOverlay(bool verify=false,bool gradient=false,bool stroke=false,bool shadow=false,bool innerGlow=false,int mapCheck=0,const std::string& source={});
  std::optional<timeline::ColorOverlayStyle> copiedLayerStyle_;bool layerStyleClipboard_=false;
  void openSelectedLayerProperties();

  void openLayerPropertiesFor(std::size_t index);

  void showLayerOpacity(const std::vector<std::string>& targets={});

  void showRecoveryPreferences();

  static const char32_t* preferenceSectionTitle(int i);

  std::vector<int> preferencePageFields()const;

  void createPreferencesControls();

  static bool preferenceDirectoryAction(const std::string& key);

  void preferenceDirectoryActionRun(const std::string& action);

  static bool fixedExportScaleRow(const preferences::Item& item);

  void syncPreferenceColors();
  void changePreferenceColor(std::size_t,Pixel);
  void preferenceColorAction(const std::string&);
  void layoutLayerPresetColors(const gfx::Rect&);
  void readPreferenceScales(bool normalize=false);

  void syncPreferenceScales();

  void addPreferenceScale();

  bool preferenceRowEnabled(const preferences::Item& item) const;

  void createPreferenceCatalogControls();

  void syncPreferenceCatalog();

  static constexpr int preferenceGroupGap=6,preferenceOptionGap=2,preferenceGroupTitleHeight=16;

  int preferenceCatalogHeight();

  void paintPreferenceCatalog(ui::Graphics& g,gfx::Rect modal);

  void showPreferences();

  bool applyPreferences();

  gfx::Rect preferenceFeedbackBounds(gfx::Rect modal) const;

  gfx::Rect preferenceBodyBounds(gfx::Rect modal) const;

  void layoutPreferences(gfx::Rect modal);

public:

  bool processPreferencesWheel(ui::MouseMessage& mouse);

  void smokeRuntimePreferences(bool persist=false);

  void smokePreferenceCatalog(const std::filesystem::path& directory,const std::function<bool(ui::MouseMessage&)>& wheelDispatch);

  void smokeCheckerboardPreferences();

  void smokePreferences(const std::filesystem::path& directory);

private:

  void loadRecoveries(bool startup=false);

  void chooseRecovery();

  void chooseProject();

  int newDocumentDialogCount_=0;

  void showNewDocument(bool verify=false);

  void ask(Pending action);

  void resolve(bool discard);

  bool& symmetryFlag(int i);

  void saveSymmetryPreferences();

  void toggleSymmetry(int i);

  void showSymmetryMenu();

  std::optional<SymmetryAxis> symmetryHit(gfx::Point at,bool ctrl=false)const;

  void finishSymmetryDrag(bool cancel=false);

  void useEyedropperTool();

  void updateEyedropperLens(gfx::Point pointer,Pixel sampled);

  void paintEyedropperLens(ui::Graphics& g);

  void sampleEyedropperAt(Point p);

  void finishEyedropper();

  std::filesystem::path fillBrushLibraryDirectory() const;

  std::filesystem::path backgroundPresetDirectory() const;

  std::optional<std::filesystem::path> backgroundPresetTestDirectory_;

  void createSelectionBackgroundPreset();

  void resolvePencilImageBrush();

  void showBrushDitherPopup();
  void showPencilImageBrushes();

  void applyFillLibrarySelection();

  void selectFillLibraryBrush(const std::string& id,bool ctrl,bool shift);

  void deleteFillLibrarySelection(const std::vector<std::string>& ids);

  void confirmFillLibraryDelete(int verify=0);
  void showBrushLibraryAdd();
  void smokeBrushLibraryDelete();

  void editFillFolder(bool rename);

  void moveFillBrushes(const std::string& folder);

  void confirmFillFolderDelete();

  void showFillFolderMenu();

public:
private:
  void openCanvasResize(int verify=0);
  void openFilterPreset(FilterPreset preset,int verify=0,bool initialLcd=false);
  std::optional<std::array<int,4>> canvasResizePreview_;
  std::uint64_t canvasResizeIdentity_=0,canvasResizeRevision_=0;
  void createBrushFromSelection();
  void beginTemporaryBrushCapture();
  void finishTemporaryBrushCapture(const SelectionMask& selection);
  void exitTemporaryBrushCapture();

  void createFillBrushFromSelection();

  void importFillImage();

  void showFillLibraryMenu();void showFillPatternSettings(int verify=-1);void loadFillPatternPreferences();void smokeFillPatternSettings();

  void createFillPatternOptions();

  void createEyedropperOptions();

  void showToolGroup(std::size_t index,bool smoke=false,int smokeChoice=-1);

  void createToolRail();

public:

  ui::Widget* frontWidgetAt(gfx::Point point,bool checkParentsVisibility=true);

  void focusWidgetOverlay(ui::Widget* w);

  bool canvasOwnsPointer(gfx::Point position) const;

  bool selectionPointerVisible(gfx::Point position) const;

  void refreshCanvasPointerFeedback();

  gfx::Rect brushPreviewDamage(std::optional<gfx::Point> position);

  void updatePaletteMouse(std::optional<gfx::Point> position);

  void smokeModalBackground();

  void smokeToolPropertyLayout();

  void smokePlainNumberEntry();

  void smokeMultiDocument();

  void smokeNewDocument();

  void smokeCheckboxes(const std::filesystem::path& directory);

  void smokeSwitches(const std::filesystem::path& directory);

  void smokeTimelineFirstPaint(os::Surface* actual=nullptr);

  void smokeAllScrollBars();

  void smokePaletteMouse(const std::function<void(ui::Message*)>& dispatch);

  void smokeHome();

  const char* selectionTransformCursor(const std::string& hit,const SelectionTransform& target,gfx::Point position) const;

  const char* selectionCursorAt(gfx::Point position) const;

  const char* cursorAt(gfx::Point position) const;

  bool panelHasCapture() const;

  void flushPanelGeometry();

  ~Editor() override;

  Editor(const PixelFont& font,Skin& skin,std::filesystem::path assets,std::function<void()> refreshCursor,std::filesystem::path recoveryRoot={},bool skipWorkspaceRestore=false);

  void requestClose();

  void smokeMenuPointerOwnership();

  void smokeSelectionCursors();

  void smokeAnts(const std::filesystem::path& output);

  void smokeModalComponents();
  void smokeWorkspace();

  void smokePointerPopup();

  void smokeWorkspaceModalPreview();

  void smokePrepareDockSplitRepaint();

  void smokePrepareDockLabelRepaint();

  void smokeMoveDockLabel(gfx::Point delta);

  void smokeFinishDockLabelRepaint();

  void smokePrepareMergedDockLabelRepaint();

  void smokeMoveMergedDockLabel(int shift);

  void smokeFloatingCoordinateTransitions();

  void smokePrepareFloatingPreviewRepaint();

  void smokeFloatingPreviewRepaintStep(int step);

  void smokeDockResizeMigration();

  void smokeDockResizeHover();

  void smokeDockSplitShrink();

  void smokePrepareColumnRepaint();

  void smokeColumnRepaintStep(int edges);

  void smokePreviewRepaintStep(int step);

  void smokePreviewBatchFlush(const std::function<void()>& dispatch);

  void smokeFinishPreviewRepaintStep();

  void smokeMergedPreviewLabels(const std::filesystem::path& directory);

  void smokeDocking(const std::filesystem::path& directory);

  void smokeLayerContext(const std::filesystem::path& directory);

  void smokeGroupTimeline(const std::filesystem::path& directory);
  void smokeTimelineGestures(const std::filesystem::path& directory);

  void smokeLayers(const std::filesystem::path& directory);

  void smokeSelectionDisplay();

  void smokeSelectAllMigration();

  void smokeLayerContextProperties();

  void smokeTemporaryBrushCapture();
  void smokeCanvasResize();
  void smokeLayerColorPresets();
  void smokeReferenceImages();
  ReferenceImagePanel* referencePanel_=nullptr;
  bool referencePanelOpen_=false;
  std::unordered_map<std::uint64_t,ReferenceSession> referenceSessions_;
  struct ReferenceWindowUi {std::uint64_t identity;std::unique_ptr<ReferenceImageWindow> window;};
  std::vector<ReferenceWindowUi> referenceWindows_;
  bool referenceGeometryReadable_=true;
  bool referenceSamplingCursor_=false;
  ReferenceSession& referenceSession(){return referenceSessions_[document.identity()];}
  void initializeReferencePanel();
  void configureReferencePanel(ReferenceImagePanel&);
  void syncReferencePanels();
  void layoutReferencePanel();
  void openReferenceWindow(const std::string&);
  void smokeHistoryPanel();
  HistoryList* historyList_=nullptr;
  PixelButton* historySettings_=nullptr;
  bool historyPanelOpen_=true,historyDisplayReadable_=true;
  std::vector<std::u32string> hiddenHistoryTypes_;
  std::uint64_t historyShownDocument_=0,historyShownRevision_=~std::uint64_t(0),historyDisplayRevision_=0,historyShownDisplayRevision_=~std::uint64_t(0);
  std::map<std::uint64_t,int> historyScrollByDocument_;
  std::optional<std::pair<std::uint64_t,std::size_t>> pendingHistoryJump_;
  ui::Timer historyJumpTimer_{16,this};
  TilesetPanel* tilesetPanel_=nullptr;PixelButton* tilesetDelete_=nullptr;PixelButton* tilesetAdd_=nullptr;bool tilesetPanelOpen_=false;
  void createTilesetPanel();void syncTilesetPanel();void layoutTilesetPanel();void showTilemapLayerDialog(bool);void showFreeTileLayerDialog(int verify=0);bool processFreeTileInput(ui::Message*);
  TabletAssistPanel* tabletPanel_=nullptr;TabletAssistState tabletAssist_;TabletAssistVisibility tabletVisibility_;bool tabletVisibilityReadable_=true;
  void createTabletPanel();void syncTabletPanel();void layoutTabletPanel();void setTabletVisible(bool);void saveTabletVisibility();void resetTabletInteraction();void observeTabletInput(ui::Message*);void tabletAction(const std::string&);bool tabletBusy()const;void smokeTabletAssist();void smokeTilesetManagement();void smokeBrushLibraryPanel();void smokeLinkedHybridStatic();void smokeLinkedCreateFloating();void smokeLinkedEditFloating();void smokeLinkedHybridFloating();void smokeTilemapSelectionDelete();void smokeTilemapFill();void smokeTilemapPreview();
  void createHistoryPanel();
  void syncHistoryPanel();
  void layoutHistoryPanel();
  void toggleHistoryPanel();
  void requestHistoryPosition(std::size_t);
  void applyDeferredHistoryPosition();
  bool historyGestureBusy()const;
  std::u32string saveHistoryDisplaySettings();
  void showHistoryDisplaySettings(bool verify=false);
  std::u32string historyAdjustmentLabel()const;
  shortcuts::Bindings shortcutBindings_=shortcuts::defaults();
  bool shortcutReadable_=true,shortcutDialogOpen_=false;
  std::string lastShortcutTool_;
  std::vector<std::pair<std::uint64_t,std::string>> deferredShortcuts_;
  ui::Timer shortcutDeferredTimer_{16,this};
  std::string shortcutCommand(const std::string&)const;
  bool shortcutSupported(const std::string&)const;
  void initializeShortcuts();void syncShortcutLabels();
  std::u32string saveShortcuts(const shortcuts::Bindings&);
  std::optional<std::string> shortcutImportFile();
  void shortcutExportFile(const std::string&);
  void showShortcutSettings(bool verify=false);
  bool runShortcutCommand(const std::string&);
  int routeShortcutMessage(ui::Message*);
  std::set<int> shortcutPointerPresses_;
  std::string shortcutTemporaryId_;
  std::uint64_t shortcutTemporaryIdentity_=0;
  std::function<void()> shortcutTemporaryRestore_;
  std::set<std::string> shortcutHeldParts(const ui::Message&)const;
  bool shortcutInputBlocked()const;
  void observeShortcutInputs(ui::Message*);
  void syncShortcutTools(const ui::Message&);
  bool routePointerShortcut(ui::Message*);
  void smokeShortcutInputs();
  void smokeShortcutSettings();
  bool moveTool_=false,moveAutoSelect_=true,moveDragging_=false,moveMoved_=false,moveClickCollapse_=false;
  std::array<PixelButton*,3> moveOptions_{};
  std::vector<GridRect> moveMovingBounds_;
  std::uint64_t moveIdentity_=0;
  Point moveStart_{};gfx::Point movePointer_;
  std::optional<TransformPoint> movePivotStart_;
  std::string moveClickLayer_;
  ui::Timer moveFlashTimer_{16,this};
  std::uint64_t moveFlashStarted_=0,moveFeedbackIdentity_=0;
  std::uint64_t movePreviewExpires_=0;bool moveContentPreview_=false;
  std::string moveFeedbackCel_;
  Point moveFeedbackOffset_{};
  os::SurfaceRef moveFlashSurface_;
  MoveClickFlashCache<os::SurfaceRef> moveFlashCache_;
  void showMoveFeedback(const std::string&);
  std::optional<GridRect> moveFlashBounds_;
  ui::Timer freeTileFlashTimer_{16,this};
  std::uint64_t freeTileFlashStarted_=0,freeTileFlashIdentity_=0,freeTileFlashRevision_=0;
  std::string freeTileFlashInstance_,freeTileFlashCel_;
  os::SurfaceRef freeTileFlashSurface_;
  PixelRegion freeTileFlashBounds_;
  void showFreeTileInstanceFeedback(const std::string&);
  void paintFreeTileInstanceFeedback(ui::Graphics&,const gfx::Rect&);
  std::set<std::string> moveHeldKeys_;
  bool moveModifierHeld(const std::string&,const ui::Message&)const;
  bool textTool_=false,textCreating_=false,textTransforming_=false,textTransformMoved_=false;std::string textTransformId_,textHandle_;TextCelData textTransformData_;SelectionTransform textTransformStart_,textTransformPreview_;Point textStart_;gfx::Point textPointer_;std::unique_ptr<TextFontService> textFonts_;
  void useTextTool();void editText(TextCelData,const std::string& id={},bool smokeAccept=false);bool processTextInput(ui::Message*);void paintTextBox(ui::Graphics&,const gfx::Rect&);void smokeTextTool();void smokeTextRasterization();void smokeLinkedLayers();
  void useMoveTool();void createMoveOptions();void layoutMoveOptions();
  const DocumentLayer* moveLayerAt(Point)const;
  void finishMoveGesture(bool);bool processMoveInput(ui::Message*);
  void paintMoveFeedback(ui::Graphics&,const gfx::Rect&);
  void smokeLayerMove();
  void smokeFilterPresets();
  void smokeCurrentMigrationBatch();

public:
  void smokeTransformEnterHistory();

  void smokeSelectionTools();

  void smokeImageBrush();

  // Register any scrollable viewport here; all gestures use one controller.

  void registerScrollDrag(std::function<gfx::Rect()> bounds,SpaceDragScroll::Target target);

  void observeScrollDragKey(ui::Message* msg);

  bool processScrollDrag(ui::Message* msg);

  void observeModifierRelease(ui::Message* msg);

  void smokePanelScroll();

  void smokeBrushPreview();

  void smokeBrushPreviewPerformance();

  void smokeModifierBrushPerformance();

  void smokeModifiers();

  void smokeSamplingAndZoom(const std::filesystem::path& directory);

  void smokeLargeTimelinePerformance();

  void smokeWheelPerformance();

  void smokeEyedropper();

  void smokeRoleHex();

  void smokePaletteRenameTrim();

  void smokePaletteClipboard();

  void smokePaletteSynchronization();

  void smokePaletteGradient();

  void smokePaletteNames();

  void smokePaletteSort();

  void smokePaletteReverse();

  void smokePaletteExtraction();

  void smokeReplacePaletteSampling();

  void smokeColorReplacement();

  void smokeExportFormatPreference();

  void smokeRecentExportDirectory();

  void smokeExportMemory();

// Included at the existing public opened-check entry points.
void smokePaletteImport();
void smokePaletteLibrary();


  void smokePaletteManual();

  void smokePaletteGrowth();

  void preparePaletteGrowthBlur();

  void verifyPaletteGrowthBlur();

  void smokeStaticLayerBatch();

  void smokeAnimationLayerBatch();

  void smokeAnimationSelectionExport();

  void smokeWebpExport();

  void smokeJpegFramesAndPaletteColumns();

  void smokeJpegExport();

  void smokePalettePngRecentPaths();

  void smokeExportProtection();

  void smokeExtractionNames();

  void smokeExportSuccessSound();

  void smokeAppendExtractionCount();

  void smokeCustomExportScales();

  std::vector<int> paletteBlurSlots_,paletteBlurExpected_,paletteBlurSelected_;std::size_t paletteBlurHistory_=0;Pixel paletteBlurPrimary_=0,paletteBlurSecondary_=0;

  void setupPaletteWindowBlur();

  void preparePaletteWindowBlur(bool moving);

  void verifyPaletteWindowBlur(bool moving);

  void smokeGifLayerTarget();

  void smokeGifExport();

  void prepareFocusResumeCheck();

  void smokeDeselectPending();

  void smokeSelectionEnter();

  void smokeTimelineDeleteShortcut();

  void smokeLoopTrack();

  void smokeLoopDialogInteractions();

  void smokeLoopUnicodeName();

  void smokeLoopEditorNormalization();

  void smokeFrameAddShortcutGuards();

  void smokeCelContextDelete();

  void smokeTimelineDeleteToolbar();

  void smokeCelCopyShortcut();

  void smokeDeleteRouting();

  void smokeArrowNavigation();

  void smokeDeleteLayerTargets();

  void smokeCreatedFrameState();

  void smokeNewLayerPlacement();

  void smokeFrameNavigation();

  void smokeLockGestures();

  void smokeVisibilityGestures();

  void smokeAutoLinkLogicalScope();

  void smokePlaybackFloating();
  void smokeSparseProjectIo(const std::filesystem::path& directory);

  void smokeTimelineDensity(const std::filesystem::path& directory);

  void smokeTimelineTail();

  void smokeTimelineSelectionKeyboard();

  void smokeToggleRelease();

  void smokeCelContentSelection();

  void smokeAutoLinkKeyboard();

  void smokeAutoLinkGestures();

  void smokeFrameDisabled();

  void smokeRelativeLuminance();

  void smokeAnimationSettings();

  void smokeFullscreen();

  void smokeProjectFolder();

  void smokePreviewLuminanceContract();

  void smokeLayerLabelWidth();

  void smokeLayerQuickActions();

  void smokePlaybackPreferences();

  void smokeSheetNewDocument();

  void smokeSheetOpenAfterExport();

  void smokeSpriteSheetAutomatic();

  void smokeSpriteSheet();

  void smokeExportFolder();

  void smokeSvgFrameExport();

  void smokeIcoFrameExport();

  void smokeBmpFrameExport();

  void smokeLayerStaticExport();

  void smokeSvgExport();

  void smokeIcoExport();

  void smokeBmpExport();

  void smokePngAutomatic();

  void smokeFramePngExport();

  void smokeStaticExport();

  void smokeImageResize();

  void smokeGradientMap();
  void smokeColorOverlay();

  void smokeAntiAlias();

  void smokeCanvasCrop();

  void smokeBackgroundPreset();

  void smokeCanvasTrim();

  void smokeConvolution();

  void smokeCurves();

  void smokeAdjustmentComponents();

  void smokeColorAdjustments();

  void smokeSymmetry();

  void smokeSheetImport();

  void smokeLayerSelectionTargets();

  void smokeFrameCutAndMergeVisible();

  void smokePlaybackModePersistence();

  void smokePlayTagMode();

  void smokePlayAllMode();

  void smokePlayOnceMode();

  void smokeLayerTransformSelection();

  void smokeFlipContent();

  void smokeRotateContent90();

  void smokeRotateContent180();

  void smokeCenterContent();

  void smokeCutSelectionState();

  void smokeCopyMerged();

  void smokeSelectionFill();

  void smokeCelSelectionClipboard();

  void smokeCelClipboard();

  void smokeMigratedTimelineActions();

  void smokeLayerMergeAndCelLink();

  void smokeFrameContextClipboard();

  void smokeTimelineGifDrop();

  void smokeCrossProjectFrameClipboard();

  void smokeCelReverseContext();

  void smokeMergeLayerDownMenu();

  void smokeSelectedLayerMerge();

  void smokeDuplicateLayerRows();

  void smokeSelectedLayerPropertiesEntry();

  void smokeLayerRowProperties();

  void smokeFrameHeaderProperties();

  void smokeFrameDurationInput();

  void smokeFrameDurationTargets();

  void smokeAnimation();

  void smokeStrokePerformance();

  void smokeResize();

  // Focused reuse of the existing palette-gradient smoke's production gradient/shape pointer checks.
  void smokeGradientShape();

  void smokeAbout();

  void smokePasteAsNewDocument();
  void smokeAdvancedMode();

  void smokeGridSnapQuick();
  void smokeAlignment();

  void smokeCustomGrid();

  void smokeQuantizationMorph();
  void smokeAnimationTransform();

  void smokeMoonCrossfade();

  void smokeMetadataNormalGrid();

  void smokeWheelBlendSquare();

  void smokeCelAndPicker();

  void smokeSkinResize(const std::filesystem::path& directory);

  void smokeColorEditor();

  void smokeColorPicker();

  void smokePickerLightBackground();

  void smokeRange(bool focused=true);

  void smokeDialog();

  void smokePreviewPanel();
  void showBackgroundLayer(bool verify=false);void smokeBackgroundLayers();
  void showReleaseNoticeOnce();void smokeReleaseNotes();void smokeHomeAnnouncements(int phase=0);void smokeAsepriteIo();void smokeAttachedMasks();
  void timelapseTick();bool flushTimelapse();void showTimelapse();void exportTimelapseImages();int chooseTimelapsePortability();
  std::string timelapseLastError_;bool portableTimelapseSave_=false,savingPortableTimelapse_=false;
  void smokeClippingMask();void smokeMaskResize();void smokeProjectInformation();void smokeSlices();void smokeHelp();void smokeViewRotation();

  void smokeDismissDialog();

  void smokeWindowInput(const LegacyCursors& cursors);

  void smokeMenu(int phase,int index=5);

  void smokeHitTestingPerformance();

  void smokeDrawingPanPerformance();

  void smokeNavigation();

  void smokeRecovery(const std::filesystem::path& dir);

  void smokePerformanceUi(const std::filesystem::path& directory);

  void smokeSave(const std::filesystem::path& directory);

  void smokeOpen(const std::filesystem::path& sample);

  void smokeInteraction();

#undef require

  std::u32string modalHint() const;

  int paletteSaveDialogWidth()const;
  int modalPreferredWidth() const;

  // TextBox::onSizeHint reflows against the available viewport. Fusion BDF

  // glyph advances need a native adapter; preserve explicit newlines too.

  std::vector<std::u32string> modalErrorLines(int width) const;

  int modalErrorVisibleLines(gfx::Rect modal) const;

  int compactModalPreferredHeight() const;

  int modalPreferredHeight() const;

  gfx::Size modalMinimumSize() const;
  gfx::Rect modalBounds(gfx::Rect rc) const;

  SizeDrag sizeHandleAt(gfx::Point point) const;

  void finishSizeDrag();

  void flushSizeGeometry();

  bool processSizeDrag(ui::Message* msg);

  int modalActionY(const gfx::Rect& modal) const;

  void layoutModal();

  void layoutTopMenu(gfx::Rect bar);

  void onResize(ui::ResizeEvent& ev) override;

  void invalidateTimelineGrid();

  bool timelineBorderHit(gfx::Point point) const;

  void beginTimelineGesture(int kind,int row,int column,const ui::MouseMessage& mouse,bool outline=false);

  void updateTimelineGesture(gfx::Point pointer,bool copy,bool scrolling=false);

  void finishTimelineGesture(bool cancel=false);

public:

  bool beginTimelineOutline(const ui::MouseMessage& mouse);

public:

  struct TimelineOutline {gfx::Rect border;bool hover=false;gfx::Point offset{};gfx::Rect clip;};

  std::vector<TimelineOutline> timelineOutlines() const;

  void paintTimelineGrid(ui::Graphics& g);

  void paintTimelineCached(ui::Graphics& g,const Layout& ll,gfx::Rect area);

  void paintTimelineBackground(ui::Graphics& g,const Layout& ll);

  void paintScrollbarCorner(ui::Graphics& g,gfx::Rect physicalViewport);

  void paintPanelBackdrops(ui::Graphics& g,bool includeFloating=false);
  void paintChrome(ui::Graphics& g,bool includeFloating=false);

  void paintStatusText(ui::Graphics& g);

  std::uint64_t luminanceDocumentIdentity_=0;

  void ensureContentCache();

  void paintSelectionAnts(ui::Graphics& g,gfx::Rect cv,gfx::Rect viewport,int phase);

  gfx::Color selectionPreviewColor(int x,int y,bool selection=true) const;

  void paintSelectionFeedback(ui::Graphics& g,const gfx::Rect& cv,const gfx::Rect& viewport);

  // legacy useCanvasBrushOverlay, canvas-render-brush and connected-line preview.

  // Display-only replacement pixels: never mutate the document/cache/history.

  void paintBrushPreview(ui::Graphics& g,const gfx::Rect& cv,bool outlinePass=false);

  void paintCanvasBackdrop(ui::Graphics& g);

  void paintCanvas(ui::Graphics& g);

  void onPaint(ui::PaintEvent& ev) override;

  void paintDockFeedback(ui::Graphics& g);

  void paintDialog(ui::Graphics& g);

  bool processPaletteInput(ui::Message* msg);
  bool processTimelineInput(ui::Message* msg);
  bool processModalInput(ui::Message* msg);
  bool onProcessMessage(ui::Message* msg) override;

  bool sliceOutlinesVisible_=true,sliceOutlineReadable_=true;bool sliceAlt_=false;bool sliceMode_=false;int sliceDrag_=0;bool sliceMoved_=false,sliceCopy_=false;std::uint64_t sliceIdentity_=0;
  Point sliceStart_;gfx::Point slicePointer_;std::string sliceHandle_,sliceClicked_;std::vector<DocumentSlice> sliceStarts_,slicePreviews_;std::vector<SliceRect> autoSlicePreview_;
  PixelEntry* sliceName_=nullptr;std::vector<std::pair<ui::Widget*,int>> sliceControls_;
  bool sliceTool()const{return moveTool_&&sliceMode_;}
  void useSliceTool();bool processSliceInput(ui::Message*);void finishSliceGesture(bool);std::string sliceHandleAt(gfx::Point,const SliceRect&)const;
  void paintSliceOverlay(ui::Graphics&);void createSliceOptions();void layoutSliceOptions();void showSliceProperties();void showAutomaticSlices();

 bool exportSlices_=false;std::string exportSliceId_;bool saveSliceExport();

};
}
