#pragma once
#include "selection_transform.h"
#include "selection_model.h"
#include "selection_tools.h"
#include "gradient_model.h"
#include "shape_model.h"
#include "symmetry_model.h"
#include "pattern_fill.h"
#include "project_brush_resources.h"
#include "image_brush.h"
#include "color_adjustment.h"
#include "convolution_matrix.h"
#include "anti_alias.h"
#include "image_resize.h"
#include <cstdint>
#include "brush.h"
#include "timeline_model.h"
#include <vector>
#include <unordered_map>
#include <optional>
#include <string>
#include <memory>

namespace moon {
using Pixel = std::uint32_t; // RGBA: red in the low byte; transparent is zero.
struct Point { int x, y; };
struct PixelRegion {
  int x=0,y=0,w=0,h=0;
  bool empty() const {return w==0 || h==0;}
  void include(int px,int py);
};
struct PaletteEntry { int id; std::u32string name; Pixel color; };
struct PaletteState {
  std::vector<PaletteEntry> entries{{1,U"墨黑",0xff211b18},{2,U"月蓝",0xffff7929}};
  std::vector<int> slots{1,2,0,0,0,0,0,0}, selected;
  int nextId=3, primaryId=0, secondaryId=0;
  Pixel primary=0xffff7929, secondary=0xffffffff;
  std::vector<int> order() const {std::vector<int> ids;for(int id:slots) if(id) ids.push_back(id);return ids;}
};
using DocumentLayer=timeline::Layer;
using DocumentFrame=timeline::Frame;
using DocumentCel=timeline::Cel;
// UI and tools can inspect pixels but only transactions may change them.
struct SheetImportOptions;
class Document {
public:
  explicit Document(int width = 32, int height = 32, std::size_t maxBytes=256*1024*1024, std::size_t maxEntries=10000);
  static Document withBuiltinPalette();
  static Document fromImported(int width,int height,timeline::State state,PaletteState palette,
    std::string projectId,std::u32string name,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive);
  std::uint64_t revision() const {return revision_;}
  void clearSourceArchiveForNewSnapshot() {sourceArchive_.reset();}
  void markRecovered(std::u32string name) {name_=std::move(name);modified_=true;}
  const std::u32string& name() const {return name_;}
  const std::string& projectId() const {return projectId_;}
  const std::shared_ptr<const std::vector<std::uint8_t>>& sourceArchive() const {return sourceArchive_;}
  int width() const { return width_; }
  int height() const { return height_; }
  const std::vector<Pixel>& pixels() const { return timeline_.resolveSurface(cel().id).surface->pixels; }
  const DocumentLayer& layer() const {return timeline_.state().layers.at(activeLayerIndex());}
  const DocumentFrame& frame() const {return timeline_.state().frames.at(activeFrameIndex());}
  const DocumentCel& cel() const {return *timeline_.findCel(layer().id,frame().id);}
  SymmetryAxes symmetryAxes;
  SymmetryCenter symmetryCenter() const{return symmetryCenter_.value_or(defaultSymmetryCenter(width_,height_));}
  void setSymmetryCenter(SymmetryCenter c,bool metadata=true){if(!std::isfinite(c.x) || !std::isfinite(c.y))throw std::invalid_argument("Invalid symmetry center");symmetryCenter_=moveSymmetryCenter(symmetryCenter(),SymmetryAxis::Center,c,width_,height_);if(metadata)modified_=true;}
  bool dirty() const { return modified_ || !pending_.empty(); }
  std::uint64_t identity() const {return identity_;}
  std::uint64_t contentRevision() const {return contentRevision_;}
  PixelRegion lastContentChange() const {return change_;}
  std::size_t historyBytes() const {return historyBytes_;}
  bool active() const { return paletteReplacement_.has_value() || adjustment_.has_value() || gradient_.has_value() || floating_.has_value() || active_ || opacityBefore_.has_value() || durationBefore_.has_value(); }
  bool canUndo() const { return position_ > 0; }
  bool canRedo() const { return position_ < history_.size(); }
  std::size_t historySize() const { return history_.size(); }
  const PaletteState& palette() const {return palette_;}
  const PaletteState& displayPalette() const {return paletteReplacement_?paletteReplacement_->preview:palette_;}
  const PaletteEntry* displayPaletteEntry(int id) const;
  bool beginPaletteReplacement(std::optional<Pixel> restorePrimary={});
  bool updatePaletteReplacement(Pixel source,Pixel replacement,bool enabled=true);
  bool commitPaletteReplacement();void cancelPaletteReplacement();
  const PaletteEntry* paletteEntry(int id) const;
  void selectPalette(int id,bool additive=false);
  void selectPaletteRange(int id,int columns);
  void selectPaletteSlotRange(std::size_t slot,int columns);
  void selectSecondaryPalette(int id);
  void clearPaletteSelection();
  void selectPaletteBox(std::size_t start,std::size_t end,int columns);
  static std::vector<int> movedPaletteSlots(const std::vector<int>& slots,const std::vector<int>& ids,int target,int anchor,int columns);
  void repositionPaletteColors(const std::vector<int>& slots,const std::vector<int>& ids,int target,int anchor,int columns);
  void pastePaletteColors(const std::vector<Pixel>& colors,const std::vector<std::size_t>& targets={});
  void setPaletteRole(Pixel color,bool secondary,bool locked);
  void renamePaletteColor(int id,const std::u32string& name);
  void applyExtractedPalette(const std::vector<Pixel>& colors,bool append=false,int columns=8);
  int addPaletteColor(Pixel color,bool selectAdded=true,std::optional<std::size_t> targetSlot=std::nullopt);
  void deletePaletteColors(const std::vector<int>& ids);
  void updatePaletteColor(int id,Pixel color);
  std::size_t activeLayerIndex() const;
  void selectLayer(const std::string& id);
  std::size_t activeFrameIndex() const;
  void selectFrame(const std::string& id);
  void addFrame(bool duplicate=false);
  void deleteFrame();
  const std::vector<std::string>& selectedFrames() const {return selectedFrames_;}
  void selectFrameHeader(const std::string& id,int mode=0,bool preservePlayhead=false);
  void clearFrameSelection(){selectedFrames_.clear();frameAnchor_.clear();}
  void moveSelectedFrames(const std::string& target,bool after);
  bool canReverseSelectedFrames() const;
  void reverseSelectedFrames();
  struct CelClipboardItem {DocumentCel cel;int row=0,column=0;std::optional<SelectionClipboard> selectionPixels;};
  struct CelClipboardSnapshot {std::vector<CelClipboardItem> items;std::uint64_t sourceIdentity=0;int width=0,height=0;};
  CelClipboardSnapshot exportCelClipboard()const{return {celClipboard_,identity_,width_,height_};}
  bool pasteCelClipboard(const CelClipboardSnapshot& snapshot);
  bool beginCelSelectionPaste(const std::vector<CelClipboardItem>& items);
  bool copySelectedCels();
  bool cutSelectedCels();
  bool deleteSelectedCels(bool ignorePixelSelection=false);
  bool pasteCopiedCels();
  bool hasCelClipboard()const{return !celClipboard_.empty();}
  struct FrameClipboardItem { DocumentFrame frame; std::vector<DocumentCel> cels; };
  struct FrameClipboardSnapshot {std::vector<FrameClipboardItem> items;std::vector<DocumentLayer> layers;std::uint64_t sourceIdentity=0;int width=0,height=0;};
  FrameClipboardSnapshot exportFrameClipboard()const;
  bool pasteFrameClipboard(const FrameClipboardSnapshot& snapshot);
  bool importGifAnimationLayer(const Document& source,int startFrameIndex);
  bool hasFrameClipboard() const{return !frameClipboard_.empty();}
  bool copySelectedFrames();
  bool cutSelectedFrames();
  bool pasteCopiedFrames(bool duplicateSelection=false);
  void deleteSelectedFrames(bool clearPixelSelection=false);
  std::string createLoopSection(std::optional<timeline::LoopSection> draft={});
  void updateLoopSection(timeline::LoopSection section);
  void deleteLoopSection(const std::string& id);

  void addLinkedFrame(bool allLayers=false);
  void disconnectCel();
  bool canReverseSelectedCels()const;
  bool reverseSelectedCels();
  bool canConnectSelectedCels()const;
  bool connectSelectedCels();
  bool canDisconnectSelectedCels()const;
  bool disconnectSelectedCels();
  bool selectedFramesDisabled()const;
  bool setSelectedFramesDisabled(bool disabled);
  void setFrameDuration(int duration);
  void beginFrameDuration();
  void previewFrameDuration(int duration);
  void commitFrameDuration();
  bool animationLoop() const {return animationLoop_;}
  void setAnimationLoop(bool loop);
  void setImportedLoop(bool loop) {animationLoop_=loop;}
  void addLayer();
  bool canDuplicateSelectedLayers() const;
  void duplicateSelectedLayers();
  void duplicateLayer();
  bool canMergeSelectedLayers() const;
  void mergeSelectedLayers();
  bool canMergeLayerDown() const;
  void mergeLayerDown();
  void mergeVisibleLayers();
  void deleteLayer();
  void deleteSelectedLayers();
  bool canDeleteSelectedLayers() const;
  bool canDeleteLayers() const;
  void moveLayer(std::size_t topIndex);
  struct TimelineSelection {
    std::vector<std::string> layers,cels;
    std::string layerAnchor,celAnchor;
  };
  const TimelineSelection& timelineSelection() const {return timelineSelection_;}
  const std::string& frameSelectionAnchor() const {return frameAnchor_;}
  void restoreFrameSelectionAnchor(std::string value){frameAnchor_=std::move(value);}
  void restoreTimelineSelection(TimelineSelection value,const std::vector<std::string>& frames){timelineSelection_=std::move(value);selectedFrames_=frames;}
  void selectTimelineLayer(const std::string& id,int mode=0);
  void selectTimelineCel(const std::string& id,int mode=0,const std::vector<std::string>& replacement={});
  void clearTimelineSelection(){timelineSelection_={};clearFrameSelection();}
  void moveTimelineLayers(const std::string& target,bool after,bool copy=false);
  void moveTimelineCels(const std::string& anchor,const std::string& target,bool copy=false);
  void copyTimelineFrames(const std::string& target,bool after);
  void beginLockGesture();
  void previewLockGesture(const std::string& layerId,bool locked);
  bool commitLockGesture();
  void setLayerLocked(bool locked);
  void setLayerAutoLinkAnimationCels(const std::string& layerId,bool enabled);
  void beginAutoLinkGesture();
  void previewAutoLinkGesture(const std::string& layerId,bool enabled);
  bool commitAutoLinkGesture();
  void beginVisibilityGesture();
  void previewVisibilityGesture(const std::string& layerId,bool visible);
  bool commitVisibilityGesture();
  void setLayerVisible(bool visible);
  void setLayerOpacity(double opacity);
  void beginLayerOpacity();
  void beginLayerProperties(const std::vector<std::string>& targets={});
  void previewLayerName(const std::u32string& name);
  void previewLayerOpacity(double opacity);
  void commitLayerOpacity();
  void cancelLayerOpacity();
  const timeline::Timeline& timeline() const {return timeline_;}
  const std::optional<SelectionMask>& selection() const {return selection_;}
  void previewSelection(std::optional<SelectionMask> value){selection_=std::move(value);}
  void commitSelection(std::optional<SelectionMask> before,std::optional<SelectionMask> after,bool resetFrames=false);
  void selectAllPixels();void deselectPixels();void invertPixels();
  std::optional<SelectionClipboard> copyPixels();
  std::optional<SelectionClipboard> copyMergedPixels();
  bool flipContent(bool horizontal);
  bool rotateContent180();
  bool rotateContent(int angle);
  bool centerActiveContent(bool horizontal=true,bool vertical=true);
  bool fillSelectionOrCanvas(Pixel color);
  bool deleteSelectedPixels();bool cutPixels(std::optional<SelectionClipboard>& clipboard);
  bool beginFloatingPaste(const SelectionClipboard& clipboard,int x,int y);
  bool beginLayerTransform();
  bool beginSelectionContentMove(bool copy=false,bool allFrameLayers=false);
  bool nudgeSelectionContent(int dx,int dy,bool allFrameLayers=false);
  void commitSelectionBox(std::optional<SelectionMask> before);
  void prepareSelectionBoxMove();
  bool floating() const {return floating_.has_value();}
  void moveFloatingPaste(int x,int y);
  void transformFloatingPaste(const SelectionTransform& target,bool rotSprite=false);
  std::optional<SelectionTransform> floatingTransform() const {return floating_?std::optional<SelectionTransform>{floating_->transform}:std::optional<SelectionTransform>{};}bool commitFloatingPaste();void cancelFloatingPaste();
  void beginStroke(Point point, Pixel color,BrushOptions brush={},const PatternBrush* image=nullptr,double angle=0,const std::unordered_map<std::size_t,Pixel>* baseline=nullptr,bool stampInitial=true);
  void updateStroke(Point point);
  std::unordered_map<std::size_t,Pixel> strokeBaseline() const;
  // Transient replacement pixels only; never opens a transaction or changes history.
  std::unordered_map<std::size_t,Pixel> brushPreview(Point from,Point to,Pixel color,BrushOptions brush,const PatternBrush* image=nullptr,double angle=0,const std::unordered_map<std::size_t,Pixel>* baseline=nullptr,bool clipSelection=true) const;
  void mergeLastStrokeEdits();
  bool commitStroke();
  void cancelStroke();
  void undo();
  void redo();
  void acceptSaved(std::string projectId,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive);
  static Document fromImage(int width,int height,std::vector<Pixel> pixels,std::u32string name);
  bool importSpriteSheet(const SheetImportOptions& options);
  bool resizeImage(int width,int height,ImageInterpolation method=ImageInterpolation::Nearest);
  bool beginColorAdjustment(const std::vector<std::string>& layers={});
  bool beginColorReplacement(const std::vector<std::string>& celIds,bool clipSelection=false);
  bool updateColorReplacement(Pixel source,Pixel replacement,bool enabled=true);
  bool updateColorAdjustment(const ColorAdjustment& adjustment,bool enabled=true);
  struct ConvolutionTask {int width,height;std::uint64_t identity,revision;std::string layerId,frameId;std::optional<SelectionMask> selection;std::vector<std::pair<std::string,std::vector<Pixel>>> targets;};
  struct AntiAliasTask {ConvolutionTask captured;timeline::Timeline timeline;std::vector<std::string> frames;std::vector<Pixel> palette;};
  bool beginAntiAliasPreview();
  static std::optional<std::vector<std::vector<Pixel>>> runAntiAliasTask(AntiAliasTask task,const AntiAliasOptions& options,const std::function<bool()>& cancelled);
  std::optional<AntiAliasTask> captureAntiAliasTask() const;
  std::optional<ConvolutionTask> captureConvolutionTask() const;
  bool publishConvolutionTask(const ConvolutionTask& task,const std::vector<std::vector<Pixel>>& results);
  bool restoreAdjustmentBaseline();
  bool commitColorAdjustment();void cancelColorAdjustment();
  const timeline::Timeline& displayTimeline()const{return adjustment_?adjustment_->preview:timeline_;}
  bool colorAdjustmentActive()const{return adjustment_.has_value();}
  bool beginGradient(Point seed,WandOptions options={});
  bool updateGradient(const GradientSpec& spec,WandOptions options);
  bool commitGradient();void cancelGradient();
  bool gradientActive()const{return gradient_ && !gradient_->shape;}
  bool shapeActive()const{return gradient_ && gradient_->shape;}
  bool beginShapePreview();bool updateShapePreview(const ShapeSpec& spec,Pixel color);
  bool commitShapePreview(){return commitGradient();}void cancelShapePreview(){cancelGradient();}
  std::uint64_t gradientRevision()const{return gradientRevision_;}
  const std::vector<Pixel>& displayPixels()const{return adjustment_?adjustment_->preview.resolveSurface(cel().id).surface->pixels:gradient_?gradient_->preview:pixels();}
  PixelRegion gradientBounds()const{if(adjustment_)return {0,0,width_,height_};if(!gradient_ || !gradient_->region)return {};const auto& r=*gradient_->region;return {r.x,r.y,r.width,r.height};}
  const std::vector<Pixel>* gradientPreviewPixels()const{return gradient_?&gradient_->preview:nullptr;}
  bool fillPixels(Point point,Pixel color,WandOptions options={});
  bool fillPatternPixels(Point point,Pixel color,const PatternFillOptions& pattern,WandOptions options={});
  const std::vector<ProjectBrushResource>& projectBrushes()const{return projectBrushes_;}
  void setImportedProjectBrushes(std::vector<ProjectBrushResource> brushes);
  bool deleteProjectBrush(const std::string& id);
  void markSaved(); // Only call after successful persistence of this exact state.
private:
  struct Delta { std::size_t index; Pixel before, after; };
  struct PixelRun {std::size_t index,length;Pixel before,after;};
  struct DensePixels {int x,y,width,height;std::vector<Pixel> before,after;};
  struct Edit {
    std::vector<Delta> pixels; std::uint64_t beforeState, afterState;
    std::optional<std::pair<int,int>> beforeDimensions,afterDimensions;
    std::optional<timeline::State> beforeTimeline,afterTimeline;
    std::vector<PixelRun> runs;
    std::optional<DensePixels> dense;
    bool documentChanged=true;
    bool pixelSelectionEdit=false;
    std::optional<SelectionMask> beforePixelsSelection,afterPixelsSelection;
    std::optional<PaletteState> beforePalette,afterPalette;
    std::string targetCelId; // Empty only for non-pixel palette edits.
    std::optional<bool> beforeVisible,afterVisible,beforeLocked,afterLocked,beforeAutoLink,afterAutoLink;
    std::string targetLayerId,beforeActive,afterActive;
    std::vector<std::string> beforeOrder,afterOrder;
    std::optional<DocumentLayer> detachedLayer;
    std::optional<DocumentCel> detachedCel;
    std::vector<DocumentCel> detachedCels;
    std::vector<DocumentCel> beforeCels,afterCels;
    std::optional<std::vector<timeline::LoopSection>> beforeLoops,afterLoops;
    std::optional<bool> beforeAnimationLoop,afterAnimationLoop;
    std::optional<std::vector<std::string>> beforeSelection,afterSelection;
    std::vector<Edit> children;
    std::optional<TimelineSelection> beforeTimelineSelection,afterTimelineSelection;
    std::optional<std::string> beforeFrameAnchor,afterFrameAnchor;

    std::optional<DocumentFrame> detachedFrame;
    std::vector<std::string> beforeFrames,afterFrames;
    std::string beforeFrame,afterFrame,targetFrameId;
    std::vector<std::pair<std::string,bool>> beforeDisabled,afterDisabled;
    std::optional<int> beforeDuration,afterDuration;
    std::optional<double> beforeOpacity,afterOpacity;
    std::optional<std::u32string> beforeName,afterName;
    int paletteKind=0, colorId=0; // 1 add, 2 remove slots, 3 color edit
    std::size_t bytes() const;
  };
  std::u32string name_=U"未命名";
  std::string projectId_;
  std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive_;
  PaletteState palette_;
  std::vector<ProjectBrushResource> projectBrushes_;
  std::optional<SymmetryCenter> symmetryCenter_;
  std::vector<std::pair<std::string,bool>> lockGestureBefore_;
  std::vector<std::pair<std::string,bool>> visibilityGestureBefore_;
  std::vector<std::pair<std::string,bool>> autoLinkGestureBefore_;
  bool fillSymmetryDispatch_=false;
  void pushEdit(Edit edit);
  PaletteState capturePaletteEdit(int kind,int id=0) const;
  void applyPaletteEdit(const Edit& edit,bool redo);
  void selectPaletteIds(const std::vector<int>& ids,int primary);
  void line(Point from, Point to);
  void plot(int x, int y);
  void stamp(int x,int y);
  BrushOptions brush_;
  std::vector<BrushSpan> stampSpans_;
  std::optional<ImageBrushStamp> imageStamp_;
  std::unordered_map<std::size_t,int> imageEraseCoverage_;
  std::unordered_map<std::size_t,Pixel> inheritedStrokeBaseline_;
  Point previousStamp_{};
  bool hasPreviousStamp_=false;
  int width_, height_;
  timeline::Timeline timeline_;
  // Resolve the selected owned surface once per stroke, retaining the direct pixel hot path.
  std::vector<Pixel>& pixelStorage() {return strokePixels_?*strokePixels_:timeline_.mutableOwnedSurface(timeline_.resolveSurface(cel().id).source->id)->pixels;}
  std::vector<Pixel>* strokePixels_=nullptr;
  std::string activeLayerId_;
  std::uint64_t nextLayerId_=0,nextFrameId_=0;
  std::string activeFrameId_,frameAnchor_;
  std::vector<std::string> selectedFrames_;
  TimelineSelection timelineSelection_;
  std::vector<CelClipboardItem> celClipboard_;
  std::vector<FrameClipboardItem> frameClipboard_;
  bool animationLoop_=true;
  void mergeRasterLayers(const std::vector<std::string>& ids,std::size_t index);
  void captureFrameOrder(Edit& edit,bool after) const;
  void applyFrameEdit(const Edit& edit,bool redo);
  void applyEdit(const Edit& edit,bool redo);
  void groupEdits(std::size_t start,const std::vector<std::string>& selection);
  void applyCelEdit(const Edit& edit,bool redo);
  void applyLayerEdit(const Edit& edit,bool redo);
  void captureLayerOrder(Edit& edit,bool after) const;
  std::unordered_map<std::size_t,Delta> pending_;
  PixelRegion change_;
  std::uint64_t identity_=0,contentRevision_=0,revision_=0;
  std::size_t maxBytes_,maxEntries_,historyBytes_=0;
  bool groupingHistory_=false;
  void publishChange() {if(!change_.empty()) ++contentRevision_;}
  std::vector<Edit> history_;
  std::size_t position_ = 0;
  std::uint64_t state_ = 0, nextState_ = 1;
  bool modified_ = false; // Legacy touch: undo/redo are document changes too.
  std::optional<double> opacityBefore_;
  std::vector<std::pair<std::string,double>> opacityValuesBefore_;
  std::vector<std::pair<std::string,std::u32string>> layerNamesBefore_;
  bool layerNameChanged_=false;
  std::optional<int> durationBefore_;
  std::vector<std::pair<std::string,int>> durationValuesBefore_;
  std::optional<SelectionMask> selection_;
  struct FloatingTarget {SelectionClipboard source;std::string celId;std::unordered_map<std::size_t,Delta> preview;std::shared_ptr<SelectionRotSpriteSource> rotSprite;std::optional<SelectionClipboard> originalSource;};
  struct FloatingPaste {SelectionClipboard source;SelectionTransform transform;int x=0,y=0;std::optional<SelectionMask> beforeSelection;bool clipboard=true,copy=true,rotSprite=false;int sourceX=0,sourceY=0;std::vector<FloatingTarget> targets;std::string layerId,frameId;std::optional<timeline::State> beforeCelTimeline;TimelineSelection beforeTimelineSelection;std::vector<std::string> beforeSelectedFrames;};
  std::optional<FloatingPaste> floating_;
  struct GradientPreview {Point seed;std::string celId,layerId,frameId;std::vector<Pixel> preview;std::optional<SelectionMask> selection,region;WandOptions options;std::uint64_t contentRevision;bool shape=false;};
  std::optional<GradientPreview> gradient_;std::uint64_t gradientRevision_=0;

  struct AdjustmentPreview {timeline::Timeline baseline,preview;std::vector<std::string> targets;std::optional<SelectionMask> selection;std::string layerId,frameId;std::uint64_t contentRevision;bool clipSelection=true;std::vector<std::string> targetFrames;};
  std::optional<AdjustmentPreview> adjustment_;
  struct PaletteReplacementPreview {PaletteState baseline,preview;std::uint64_t contentRevision;std::optional<Pixel> restorePrimary;};
  std::optional<PaletteReplacementPreview> paletteReplacement_;
  bool active_ = false;
  Point last_{};
  Pixel color_ = 0;
};
int floorDivide(int coordinate, int positiveScale);
}


