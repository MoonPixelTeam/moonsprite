#include "timelapse.h"
#include <functional>
#include <atomic>
#include "layer_metadata.h"
#include "layer_panel_tree.h"
#include "layer_panel_state.h"
#pragma once
#include "outline_samples.h"
#include "tile_repeat.h"
#include "history_change.h"
#include "animation_change.h"
#include "history_store.h"
#include "history_replay.h"
#include <map>
#include "project_information.h"
#include "document_slices.h"
#include "canvas_resize.h"
#include "filter_presets.h"
#include "reference_images.h"
#include "layer_color_presets.h"
#include "animation_crossfade.h"
#include "animation_transform.h"
#include "custom_grid.h"
#include "selection_transform.h"
#include "selection_model.h"
#include "stroke_pixel_lookup.h"
#include "selection_tools.h"
#include "smooth_brush.h"
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
#include "liquify.h"
#include "timeline_model.h"
#include "document_color_mode.h"
#include "history_panel_model.h"
#include "cel_properties.h"
#include <vector>
#include <unordered_map>
#include <optional>
#include <variant>
#include <string>
#include <memory>
#include <filesystem>

namespace moon {
namespace script {struct RasterBatch;struct CreatedLayer;}
namespace local_history {class CommittedCapture;class PixelHistory;struct PixelHistoryEdit;}
struct SymmetryRotationRaster;
namespace timelapse {class Session;}
using Pixel = std::uint32_t; // RGBA: red in the low byte; transparent is zero.
struct Point { int x, y; };
struct PixelRegion {
  int x=0,y=0,w=0,h=0;
  bool empty() const {return w==0 || h==0;}
  void include(int px,int py);
};
struct PaletteEntry { int id; std::u32string name; Pixel color; };
struct PaletteViewSelection {int columns=1;std::optional<std::size_t> focused;std::optional<std::pair<std::size_t,std::size_t>> box;};
struct PaletteState {
  std::vector<PaletteEntry> entries{{1,U"墨黑",0xff211b18},{2,U"月蓝",0xffff7929}};
  std::vector<int> slots{1,2,0,0,0,0,0,0}, selected;
  int nextId=3, primaryId=0, secondaryId=0;
  Pixel primary=0xffff7929, secondary=0xffffffff;
  int columns=8; // Stored legacy palette layout; independent from the viewport auto grid.
  // Legacy stores paletteOrder independently. Ordinary slot-based states need
  // no duplicate allocation; imported independent order survives color edits.
  std::optional<std::vector<int>> independentOrder;
  std::vector<int> order() const {if(independentOrder)return *independentOrder;std::vector<int> ids;for(int id:slots) if(id) ids.push_back(id);return ids;}
  void setOrder(std::vector<int> ids){independentOrder.reset();if(ids!=order())independentOrder=std::move(ids);}
};
using DocumentLayer=timeline::Layer;
using DocumentFrame=timeline::Frame;
using DocumentCel=timeline::Cel;
// UI and tools can inspect pixels but only transactions may change them.
struct SheetImportOptions;
struct LayerPanelDropTarget{enum class Kind{Top,Bottom,Inside,Above,Below};Kind kind=Kind::Above;LayerPanelKind rowKind=LayerPanelKind::Layer;std::string id;};
struct TilemapSelection {tiles::Mode mode=tiles::Mode::Hybrid;std::string tilesetId,primary,secondary;bool freePaint=false;};
class Document {
  friend class local_history::CommittedCapture;
  friend class local_history::PixelHistory;
public:
 const std::vector<DocumentSlice>& slices()const{return sliceState_.items;}
 const std::vector<std::string>& selectedSliceIds()const{return sliceState_.selected;}
 std::string selectedSliceId()const{return sliceState_.selected.empty()?std::string{}:sliceState_.selected.back();}
 void selectSlice(const std::string&,bool additive=false);void selectAllSlices();void setImportedSlices(std::vector<DocumentSlice>);bool createSlices(const std::vector<SliceRect>&);bool updateSlices(const std::vector<DocumentSlice>&);bool duplicateSlices(const std::vector<DocumentSlice>&);bool deleteSlices(const std::vector<std::string>&);
private:
  friend struct AsepriteDocumentBuilder;
 SliceState sliceState_;std::uint64_t nextSliceId_=0;bool commitSlices(SliceState,std::u32string);

  friend class DocumentSnapshot;
  friend struct ScriptDocumentBuilder;
  friend class SheetImportTask;
  friend class ImageResizeTask;
  friend struct RasterHistoryFixture;
public:
  const timelapse::Settings& timelapseSettings()const{return timelapseSettings_;}
  timelapse::Settings& mutableTimelapseSettings(){return timelapseSettings_;}
  void setImportedTimelapse(timelapse::Settings value){timelapseSettings_=std::move(value);}
  std::optional<PixelRegion> recordingDirtySince(std::uint64_t from)const{if(from==contentRevision_)return PixelRegion{};if(recordingDirtyValid_&&recordingDirtyFrom_==from&&recordingDirtyTo_==contentRevision_)return recordingDirty_;return std::nullopt;}
  void acknowledgeRecordingCapture(){recordingDirty_={};recordingDirtyFrom_=recordingDirtyTo_=contentRevision_;recordingDirtyValid_=true;}
  void markTimelapseModified(){modified_=true;++revision_;}
  std::shared_ptr<timelapse::Session> recordingSession()const{return recordingBinding_.session;}
  void setRecordingSession(std::shared_ptr<timelapse::Session> session,std::function<void(Document&,bool)> observer,std::function<void(const timelapse::Settings&)> restore={}){recordingBinding_.session=std::move(session);recordingBinding_.observer=std::move(observer);recordingBinding_.restore=std::move(restore);}
  bool hasTilemapContent()const;
  bool hasFreeTileContent()const {return std::any_of(timeline_.state().layers.begin(),timeline_.state().layers.end(),[](const auto& l){return l.kind=="free-tile";});}
  bool createFreeTileLayer(std::u32string name,const std::string& sharedSet={});
  bool addFreeTileSource();
  bool reorderFreeTileSource(const std::string& id,const std::string& target);
  bool deleteFreeTileSource(const std::string&);
  bool freeTilePaintMode()const{return tileSelection_.freePaint;}
  void setFreeTilePaintMode(bool paint);
  bool beginFreeTilePlacement(Point,bool erase=false,bool secondary=false);
  bool updateFreeTilePlacement(Point);
  bool commitFreeTilePlacement();void cancelFreeTilePlacement();
  bool freeTilePlacementActive()const{return freeTilePlacement_.has_value();}
  bool freeTileDrawingActive()const{return freeTilePlacement_&&!freeTilePlacement_->moving&&freeTilePlacement_->flagControl<0;}
  std::string freeTileDrawingSourceId()const{return freeTileDrawingActive()?freeTilePlacement_->sourceId:std::string{};}
  bool freeTileInstanceView()const;
  bool setFreeTileInstanceView(bool);
  std::vector<std::string> selectedFreeTileInstances()const;
  std::string primaryFreeTileInstance()const;
  std::optional<PixelRegion> freeTileInstanceBounds(const std::string&)const;
  bool selectFreeTileInstance(const std::string&,int mode=0);
  bool beginFreeTileInstanceMove(Point);
  bool previewFreeTileInstanceMove(int dx,int dy);
  bool freeTileInstanceMoving()const{return freeTilePlacement_&&freeTilePlacement_->moving;}
  std::string movingFreeTileInstance()const{return freeTileInstanceMoving()?freeTilePlacement_->initiatingInstance:std::string{};}
  bool beginFreeTileInstanceFlags(bool locked);
  struct FreeTileInstanceChanges {
    std::optional<int> x,y,rotation;
    std::optional<bool> flipHorizontal,flipVertical;
    std::optional<double> opacity;
    std::optional<std::string> blendMode;
  };
  struct FreeTileSourceChanges {
    std::optional<std::u32string> name;
    std::optional<std::string> description;
    std::optional<std::optional<Pixel>> displayColor;
    std::optional<bool> visible,locked;
    std::optional<double> offsetX,offsetY;
  };
  bool beginFreeTileSourceProperties(const std::string&);
  bool previewFreeTileSourceProperties(const FreeTileSourceChanges&);
  bool commitFreeTileSourceProperties(const FreeTileSourceChanges&);
  void cancelFreeTileSourceProperties();
  bool freeTileSourcePropertiesActive()const{return bool(freeSourceProperties_);}
  bool setFreeTileSourceProperties(const std::string&,const FreeTileSourceChanges&);
  bool beginFreeTileInstanceProperties(const std::vector<std::string>&);
  bool previewFreeTileInstanceProperties(const FreeTileInstanceChanges&);
  bool setFreeTileInstanceProperties(const std::string&,const FreeTileInstanceChanges&);
  bool showOnlyFreeTileInstance(const std::string&);
  bool reorderFreeTileInstance(const std::string& id,const std::string& target,bool before);
  struct FreeTileInstanceClipboardSnapshot {
    std::string sourceProjectId,setId;
    std::uint64_t sourceIdentity=0;
    int offsetX=0,offsetY=0;
    std::vector<free_tiles::Instance> instances;
    std::vector<free_tiles::Source> sources;
    std::vector<tiles::Tileset> tilesets;
  };
  std::optional<FreeTileInstanceClipboardSnapshot> copyFreeTileInstances()const;
  bool pasteFreeTileInstances(const FreeTileInstanceClipboardSnapshot&);
  bool pasteFreeTilePixels(const SelectionClipboard&,Point);
  bool freeTileInstancePropertiesActive()const{return freeTilePlacement_&&freeTilePlacement_->flagControl==2;}
  bool previewFreeTileInstanceFlags(const std::vector<std::string>&,bool value);
  bool freeTileInstanceFlagsActive()const{return freeTilePlacement_&&freeTilePlacement_->flagControl>=0&&freeTilePlacement_->flagControl<2;}
  bool canDeleteFreeTileInstances(const std::vector<std::string>&)const;
  bool deleteFreeTileInstances(const std::vector<std::string>&);
  bool tilemapSelectionCutAvailable()const;bool tilemapPaintSelectionDeleteBlocked()const;
  const TilemapSelection& tileSelection()const{return tileSelection_;}
  tiles::Mode tilemapMode()const{return tileSelection_.mode;}
  void setTilemapMode(tiles::Mode mode){if(!active_)tileSelection_.mode=mode;}
  void setSelectedTileset(const std::string&);
  void setSelectedTile(const std::string&,const std::string&,bool secondary=false);
  std::string addTilesetTile(const std::string&);
  bool reorderTilesetTiles(const std::string&,const std::vector<std::string>&);
  bool setTilesetTileSlots(const std::string&,const std::vector<std::optional<std::string>>&);
  bool deleteTilesetTiles(const std::string&,const std::vector<std::string>&);
  bool clearUnusedTilesetTiles(const std::string&);
  bool writeTilesetTilePixels(const std::string&,const std::string&,const std::vector<Pixel>&);
  bool createTilemapLayer(int,int,std::u32string,const std::string& shared={});
  bool convertLayerToTilemap(int,int,std::u32string);
  explicit Document(int width = 32, int height = 32, std::size_t maxBytes=256*1024*1024, std::size_t maxEntries=10000);
  color_mode::PixelFormat pixelFormat()const{return pixelFormat_;}
  void setImportedPixelFormat(color_mode::PixelFormat value){pixelFormat_=value;}
  bool setPixelFormat(color_mode::PixelFormat);
  // Legacy packed writes preserve zero-alpha coverage; direct color writes
  // quantize every channel, including alpha in RGB formats. Masks override both.
  Pixel normalizeCanvasPacked(Pixel value,bool mask=false)const{return mask?timeline::normalizedMaskPixel(value):color_mode::normalizeRgbaPackedValue(pixelFormat_,value);}
  Pixel normalizeCanvasColor(Pixel value,bool mask=false)const{return mask?timeline::normalizedMaskPixel(value):color_mode::quantizePixelColor(value,pixelFormat_);}
  static Document withBuiltinPalette(int width=32,int height=32,std::u32string name=U"未命名");
  static Document fromClipboardRaster(const SelectionClipboard& source);
  static Document fromSpriteSheetRaster(int width,int height,std::vector<Pixel> pixels,std::u32string name);
  static Document fromImported(int width,int height,timeline::State state,PaletteState palette,
    std::string projectId,std::u32string name,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive,std::string activeFrameId={});
  std::array<int,4> displayedLayerGeometry(const std::string&) const;
  void setImportedLayerGeometry(std::unordered_map<std::string,std::array<int,4>>);
  bool rollbackProject(const Document& backup);
  std::uint64_t revision() const {return revision_;}
  // Validated Lua raster batch -> ordinary owner-aware undo history.
  // Other script operations are applied by the workspace adapter separately.
  bool commitScriptRasterBatch(const script::RasterBatch&);
  void commitScriptCreatedLayer(const script::CreatedLayer&,std::u32string label);
  void clearSourceArchiveForNewSnapshot() {sourceArchive_.reset();}
  void markRecovered(std::u32string name) {name_=std::move(name);modified_=true;}
  const std::u32string& name() const {return name_;}
  const ProjectInformation& projectInformation()const{return projectInformation_;}
  void setImportedProjectInformation(ProjectInformation value){projectInformation_=std::move(value);}
private:
  friend struct AsepriteDocumentBuilder;
  ProjectInformation projectInformation_=ProjectInformation::fresh();bool pendingGroupedProjectOperation_=false;std::chrono::steady_clock::time_point projectStrokeStarted_{};
public:

  const std::string& projectId() const {return projectId_;}
  // Imported-file origin is session metadata, separate from the native save path.
  const std::filesystem::path& sourceFilePath() const {return sourceFilePath_;}
  void setSourceFilePath(std::filesystem::path path) {sourceFilePath_=std::move(path);}
  const std::shared_ptr<const std::vector<std::uint8_t>>& sourceArchive() const {return sourceArchive_;}
  int width() const { return width_; }
  int height() const { return height_; }
  const std::vector<Pixel>& pixels() const { return activeSurface().pixels; }
  // Owner storage is local; canvas snapshots sample document/world coordinates.
  // Read-only empty-slot queries preserve Cel absence; callers that edit must
  // materialize through their transaction before requesting activeSurface().
  const timeline::Surface* activeSurfaceIfPresent()const {if(absentStrokeSurface_)return &*absentStrokeSurface_;const auto* slot=timeline_.findCel(layer().id,frame().id);return slot?timeline_.resolveSurface(slot->id).surface:nullptr;}
  const timeline::Surface& activeSurface()const {return *activeSurfaceIfPresent();}
  std::vector<Pixel> canvasPixels()const;
  std::optional<SelectionMask> selectionContentBounds(const SelectionMask&)const;
  const DocumentLayer& layer() const {return timeline_.state().layers.at(activeLayerIndex());}
  bool layerEffectivelyLocked(const DocumentLayer& value) const {return timeline::isLayerEffectivelyLocked(timeline_.state(),value);}
  bool layerEffectivelyVisible(const DocumentLayer& value) const {return timeline::isLayerEffectivelyVisible(timeline_.state(),value);}
  bool maskIsolated()const{return maskIsolated_&&!activeMaskId_.empty();}
  std::vector<Pixel> maskDisplayRegion(PixelRegion)const;
  bool deleteAttachedMasks(const std::vector<std::pair<std::string,std::string>>& slots);
  const std::string& activeMaskId()const{return activeMaskId_;}
  const timeline::AttachedMask* activeMask()const;
  bool maskBrushAvailable()const;
  bool createAttachedMask(const std::string& owner,const std::string& frame,bool group=false);
  bool canCreateLayerMasksForLayer(const std::string& owner)const;
  bool createLayerMasksForLayer(const std::string& owner);
  bool selectAttachedMask(const std::string& owner,const std::string& frame,bool isolated=true);
  void exitAttachedMask();
  bool deleteAttachedMask(const std::string& owner,const std::string& frame);
  bool setAttachedMaskFlags(const std::string& owner,const std::string& frame,bool visible,bool locked,bool moveWithOwner,bool autoLink,const std::vector<std::pair<std::string,std::string>>* selection=nullptr);
  using MaskSlotKey=std::pair<std::string,std::string>;
  struct MaskPlacement {MaskSlotKey source,target;};
  enum class MaskTransferResult {Done,NoChange,LinkedSelection,Locked,EmptyCel,Invalid};
  std::vector<MaskPlacement> mapAttachedMaskBlock(const std::vector<MaskSlotKey>&,const MaskSlotKey& anchor,const MaskSlotKey& target)const;
  MaskTransferResult moveAttachedMasks(const std::vector<MaskSlotKey>&,const MaskSlotKey& anchor,const MaskSlotKey& target);
  bool copyAttachedMasks(const std::vector<MaskSlotKey>&,std::uint32_t systemSequence=0);
  MaskTransferResult pasteAttachedMasks(const std::vector<MaskSlotKey>& selection,const MaskSlotKey& target);
  bool hasMaskClipboard()const{return !maskClipboard_.empty();}
  std::uint32_t maskClipboardSequence()const{return maskClipboardSequence_;}
  void clearMaskClipboard(){maskClipboard_.clear();}
  bool linkAttachedMasks(const std::vector<std::pair<std::string,std::string>>& slots,bool detach=false);
  bool rasterToolsAvailable() const {return activeMaskId_.empty() && layer().kind!="text" && layer().kind!="tilemap" && layer().kind!="adjustment" && layer().kind!="free-tile" && !hasSelectedGroups() && !layerEffectivelyLocked(layer()) && layerEffectivelyVisible(layer());}
  const DocumentFrame& frame() const {return timeline_.state().frames.at(activeFrameIndex());}
  const DocumentCel& cel() const {return *timeline_.findCel(layer().id,frame().id);}
  const DocumentCel& freeTileCel() const {const auto resolved=timeline_.resolveSurface(cel().id);if(!resolved.source||resolved.issue!=timeline::LinkIssue::None)throw std::logic_error("Invalid free tile Cel link");return *resolved.source;}
  SymmetryAxes symmetryAxes;
  SymmetryCenter symmetryCenter() const{return symmetryCenter_.value_or(defaultSymmetryCenter(width_,height_));}
  void setSymmetryCenter(SymmetryCenter c,bool metadata=true){if(!std::isfinite(c.x) || !std::isfinite(c.y))throw std::invalid_argument("Invalid symmetry center");symmetryCenter_=moveSymmetryCenter(symmetryCenter(),SymmetryAxis::Center,c,width_,height_);if(metadata){modified_=true;projectInformation_.operation();++revision_;}}
  // Project decode preserves finite source coordinates; tool dragging quantizes separately.
  void setImportedSymmetryCenter(SymmetryCenter c){if(!std::isfinite(c.x)||!std::isfinite(c.y))throw std::invalid_argument("Invalid imported symmetry center");symmetryCenter_=c;}
  bool showCustomGrid() const{return showCustomGrid_;}
  GridSettings customGrid() const{return customGrid_;}
  void setCustomGrid(bool enabled,GridSettings grid,bool metadata=true){showCustomGrid_=enabled;customGrid_=normalizeGridSettings(grid);if(metadata){modified_=true;projectInformation_.operation();++revision_;change_={0,0,width_,height_};publishChange();}}
  bool showPixelGrid() const{return showPixelGrid_;}
  void setPixelGrid(bool enabled,bool metadata=true){showPixelGrid_=enabled;if(metadata){modified_=true;projectInformation_.operation();++revision_;change_={0,0,width_,height_};publishChange();}}
  bool dirty() const { return modified_ || !pending_.empty() || !liquifyDeltas_.empty(); }
  std::uint64_t identity() const {return identity_;}
  HistoryPanelTimeline historyTimeline()const;
  std::size_t historyPosition()const{return history_.position();}
  std::uint64_t historyRevision()const{return historyRevision_;}
  void setHistoryChangeListener(HistoryChangeBinding::Observer observer){historyChangeBinding_.set(std::move(observer));}
  void clearHistory();
  bool setHistoryPosition(std::size_t target);
  bool strokeActive()const{return active_||bool(freeSourceStroke_);}
  bool applySmoothBrush(const std::vector<std::size_t>& visited,int strength,std::optional<std::chrono::steady_clock::time_point> started={});
  class HistoryLabelScope {
    Document& owner_;std::u32string previous_;
  public:
    HistoryLabelScope(Document& owner,std::u32string label):owner_(owner),previous_(std::move(owner.historyLabelOverride_)){owner.historyLabelOverride_=std::move(label);}
    ~HistoryLabelScope(){owner_.historyLabelOverride_=std::move(previous_);}
    HistoryLabelScope(const HistoryLabelScope&)=delete;
    HistoryLabelScope& operator=(const HistoryLabelScope&)=delete;
  };
  std::uint64_t contentRevision() const {return contentRevision_;}
  // Restoration must reject raster previews/edits even after cancellation,
  // while a frame view invalidation alone may arrive during journal I/O.
  std::uint64_t contentMutationRevision()const{return contentMutationRevision_;}
  PixelRegion lastContentChange() const {return change_;}
  std::size_t historyBytes() const {return history_.bytes();}
  std::uint64_t tilemapCacheCellWrites()const{return tilemapCacheCellWrites_;}
  bool active(bool includeFloating=true) const { return bool(freeSourceProperties_) || bool(freeSourceStroke_) || freeTilePlacement_.has_value() || paintCellMove_.has_value() || layerStyleBaseline_.has_value() || layerAdjustmentBaseline_.has_value() || textDraft_.has_value() || layerMove_.has_value() || filterPreview_.has_value() || paletteReplacement_.has_value() || adjustment_.has_value() || gradient_.has_value() || (includeFloating&&floating_.has_value()) || active_ || opacityBefore_.has_value() || durationBefore_.has_value() || celPropertyPreview_.has_value(); }
  bool canUndo() const { return history_.canUndo(); }
  bool canRedo() const { return history_.canRedo(); }
  std::size_t historySize() const { return history_.size(); }
  void setHistoryEntryLimit(std::size_t limit);
  const PaletteState& palette() const {return palette_;}
  const PaletteState& displayPalette() const {return paletteReplacement_?paletteReplacement_->preview:palette_;}
  const PaletteEntry* displayPaletteEntry(int id) const;
  bool beginPaletteReplacement(std::optional<Pixel> restorePrimary={});
  bool updatePaletteReplacement(Pixel source,Pixel replacement,bool enabled=true);
  bool commitPaletteReplacement();void cancelPaletteReplacement();
  const PaletteEntry* paletteEntry(int id) const;
  void selectPalette(int id,bool additive=false);
  void selectPaletteRange(int id,int columns);
  void selectPaletteSlotRange(std::size_t slot,int columns,const std::vector<int>* viewSlots=nullptr);
  void selectSecondaryPalette(int id);
  void clearPaletteSelection();
  void selectPaletteBox(std::size_t start,std::size_t end,int columns,const std::vector<int>* viewSlots=nullptr);
  static std::vector<int> movedPaletteSlots(const std::vector<int>& slots,const std::vector<int>& ids,int target,int anchor,int columns);
  void repositionPaletteColors(const std::vector<int>& slots,const std::vector<int>& ids,int target,int anchor,int columns,bool storeColumns=false);
  bool movePaletteColor(int direction);
  bool reorderPaletteColors(const std::vector<int>& ids,const std::vector<int>& targetSlots,int columns);
  void pastePaletteColors(const std::vector<Pixel>& colors,const std::vector<std::size_t>& targets={},bool selectResult=true,const std::vector<int>* viewSlots=nullptr,int viewColumns=0);
  void setPaletteRole(Pixel color,bool secondary,bool locked);
  void swapPaletteRoles(Pixel primary,Pixel secondary){const int previousPrimaryId=palette_.primaryId;palette_.primaryId=0;setPaletteRole(primary,false,true);palette_.secondary=secondary;palette_.secondaryId=previousPrimaryId;}
  void renamePaletteColor(int id,const std::u32string& name);
  void annotatePaletteView(PaletteViewSelection before,PaletteViewSelection after);
  const std::optional<PaletteViewSelection>& paletteViewRestore()const{return paletteViewRestore_;}
  std::uint64_t paletteViewRestoreSerial()const{return paletteViewRestoreSerial_;}
  void applyStoredPalette(const std::vector<Pixel>& colors,int columns=0,const std::vector<std::optional<std::size_t>>& slots={},const std::vector<std::u32string>* names=nullptr);
  void applyExtractedPalette(const std::vector<Pixel>& colors,bool append=false,int columns=8);
  int addPaletteColor(Pixel color,bool selectAdded=true,std::optional<std::size_t> targetSlot=std::nullopt,const std::vector<int>* viewSlots=nullptr,int viewColumns=0);
  void deletePaletteColors(const std::vector<int>& ids);
  void setPaletteColorSynchronization(bool enabled){paletteColorSynchronization_=enabled;}
  bool paletteColorSynchronization()const{return paletteColorSynchronization_;}
  void updatePaletteColor(int id,Pixel color);
  enum class PaletteSortMode {Hue,Saturation,Brightness,Luminance,Red,Green,Blue,Alpha};
  bool sortPaletteColors(PaletteSortMode mode,bool descending=false);
  void gradientPaletteSlots(std::vector<std::size_t> indices,int columns,bool byHue=false,const std::vector<int>* viewSlots=nullptr);
  bool reversePaletteColors();
  bool gradientPaletteColors(bool byHue=false);
  std::size_t activeLayerIndex() const;
  void selectLayer(const std::string& id);
  std::size_t activeFrameIndex() const;
  void selectFrame(const std::string& id,AnimationFrameOrigin origin=AnimationFrameOrigin::Manual);
  void setAnimationChangeListener(AnimationChangeBinding::Observer observer){animationChangeBinding_.set(std::move(observer));}
  std::vector<Pixel> crossfadeTweenPreview(const std::string& startFrame,const std::string& layerId,const CrossfadeTweenOptions&,int step,const std::vector<std::string>& selectedLayers={}) const;
  bool generateTransformTween(const std::string& startFrame,const std::string& layerId,const TransformTweenOptions&,const std::vector<std::string>& selectedLayers={},std::optional<TransformPoint> selectionPivot={});
  bool generateCrossfadeTween(const std::string& startFrame,const std::string& layerId,const CrossfadeTweenOptions&,const std::vector<std::string>& selectedLayers={},std::optional<TransformPoint> pivot={});
  void addFrame(bool duplicate=false);
  void deleteFrame();
  const std::vector<std::string>& selectedFrames() const {return selectedFrames_;}
  void selectFrameHeader(const std::string& id,int mode=0,bool preservePlayhead=false);
  void clearFrameSelection(){selectedFrames_.clear();frameAnchor_.clear();}
  void moveSelectedFrames(const std::string& target,bool after);
  bool canReverseSelectedFrames() const;
  void reverseSelectedFrames();
  struct CelClipboardItem {DocumentCel cel;int row=0,column=0;std::optional<SelectionClipboard> selectionPixels;std::optional<timeline::MaskSlot> mask;};
  struct CelClipboardSnapshot {std::vector<CelClipboardItem> items;std::uint64_t sourceIdentity=0;int width=0,height=0;std::vector<tiles::Tileset> tilesets;std::vector<DocumentLayer> layers;bool tilemapContext=false;};
  CelClipboardSnapshot exportCelClipboard()const;
  bool pasteCelClipboard(const CelClipboardSnapshot& snapshot);
  bool beginCelSelectionPaste(const std::vector<CelClipboardItem>& items);
  bool copySelectedCels();
  bool cutSelectedCels();
  bool deleteSelectedCels(bool ignorePixelSelection=false);
  bool pasteCopiedCels(bool crossDocument=false);
  bool hasCelClipboard()const{return !celClipboard_.empty();}
  struct FrameClipboardItem { DocumentFrame frame; std::vector<DocumentCel> cels;std::vector<timeline::MaskSlot> masks; };
  struct FrameClipboardSnapshot {std::vector<FrameClipboardItem> items;std::vector<DocumentLayer> layers;std::uint64_t sourceIdentity=0;int width=0,height=0;std::vector<tiles::Tileset> tilesets;std::vector<timeline::Group> groups;std::vector<std::array<int,4>> layerGeometry;};
  FrameClipboardSnapshot exportFrameClipboard()const;
  bool pasteFrameClipboard(const FrameClipboardSnapshot& snapshot);
  bool importGifAnimationLayer(const Document& source,int startFrameIndex,const std::vector<MaskSlotKey>* maskSelection=nullptr,const std::optional<MaskSlotKey>* maskAnchor=nullptr);
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
  bool setSelectedFramesDisabled(bool disabled,bool toggle=false);
  bool beginCelProperties(const std::string& clickedCelId,const std::vector<std::string>& frozenIds={});
  bool previewCelProperties(double opacity,double zIndex);
  void commitCelProperties();void cancelCelProperties();
  bool celPropertiesActive()const{return celPropertyPreview_.has_value();}
  void setFrameDuration(int duration);
  void beginFrameDuration();
  void previewFrameDuration(int duration);
  void commitFrameDuration();
  bool animationLoop() const {return animationLoop_;}
  void setAnimationLoop(bool loop);
  void setImportedLoop(bool loop) {if(animationLoop_==loop)return;animationLoop_=loop;animationChangeBinding_.publish(*this,{AnimationChange::Kind::LoopChanged});}
  void addLayer();
  std::vector<std::string> layerStyleTargets()const;
  std::optional<timeline::ColorOverlayStyle> layerStyle(const std::string&)const;
  bool setLayerStylesEnabled(const std::vector<std::string>& targets,bool enabled);
  bool beginLayerStyle();bool previewLayerStyle(std::optional<timeline::ColorOverlayStyle>,bool preview=true);bool commitLayerStyle(std::optional<timeline::ColorOverlayStyle>);void cancelLayerStyle();
  void createGradientMapLayer();
  bool beginLayerAdjustment();
  bool previewLayerAdjustment(const GradientMapSettings&,bool preview=true,bool enabled=true);
  bool commitLayerAdjustment(const GradientMapSettings&,bool enabled=true);
  void cancelLayerAdjustment();
  bool createBackgroundLayer(const timeline::Surface&,bool solid=false);bool setLayerBackground(const std::string&,bool);bool resizeBackgroundCanvas(int,int,int,int,bool,std::optional<TransformPoint>);
  bool resizeResourceImage(int,int,ImageInterpolation);
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
    std::vector<std::string> maskRows;
  };
  struct AnimationSelectionSnapshot {
    std::uint64_t identity=0;
    TimelineSelection selection;
    std::vector<std::string> frames,groups;
    std::optional<std::string> groupFocus;
    std::string activeLayer,activeFrame,frameAnchor,activeMask;
    std::optional<MaskSlotKey> activeMaskSlot;
    bool maskIsolated=false;
    std::optional<AnimationSessionSelection> sessionSelection;
  };
  void setAnimationSelectionAccess(AnimationChangeBinding::SelectionAccess access){animationChangeBinding_.setSelectionAccess(std::move(access));}
  AnimationSelectionSnapshot captureAnimationSelection()const;
  bool restoreAnimationSelection(AnimationSelectionSnapshot snapshot);
  void normalizeAnimationSelection();
  class AnimationSelectionHistoryScope {
   friend class Document;
  public:
   AnimationSelectionHistoryScope(Document&,bool normalize);
   ~AnimationSelectionHistoryScope()noexcept(false);
   AnimationSelectionHistoryScope(const AnimationSelectionHistoryScope&)=delete;
   AnimationSelectionHistoryScope& operator=(const AnimationSelectionHistoryScope&)=delete;
  private:
   Document& document_;
   AnimationSelectionSnapshot before_;
   std::uint64_t state_,pushRevision_;
   int exceptions_;
   bool normalize_;
  };
  AnimationSelectionHistoryScope trackAnimationSelectionHistory(bool normalize=false){return AnimationSelectionHistoryScope(*this,normalize);}
  const TimelineSelection& timelineSelection() const {return timelineSelection_;}
  const std::string& frameSelectionAnchor() const {return frameAnchor_;}
  void restoreFrameSelectionAnchor(std::string value){frameAnchor_=std::move(value);}
  void restoreTimelineSelection(TimelineSelection value,const std::vector<std::string>& frames){timelineSelection_=std::move(value);selectedFrames_=frames;}
  void selectTimelineLayer(const std::string& id,int mode=0);
  void selectTimelineCel(const std::string& id,int mode=0,const std::vector<std::string>& replacement={});
  void selectTimelineCelContent(const std::string& id,bool additive=false);
  const std::vector<std::string>& selectedGroupIds()const{return selectedGroupIds_;}
  std::optional<std::string> selectedGroupId()const{return selectedGroupId_;}
  bool hasSelectedGroups()const{return !selectedGroupIds_.empty()||selectedGroupId_.has_value();}
  bool groupSelectionOnly()const{return hasSelectedGroups()&&timelineSelection_.layers.empty();}
  bool setMaskMoveWithOwner(const std::string& owner,const std::string& frame,bool enabled);
  std::vector<std::string> selectedDirectLayerIds()const{return timelineSelection_.layers;}
  std::vector<std::string> selectedLayerIdsWithGroups()const;
  LayerPanelState layerPanelState()const;
  void applyLayerPanelState(LayerPanelState);
  const std::vector<std::string>& collapsedGroupIds()const{return collapsedGroupIds_;}
  const timeline::Group* findGroup(const std::string&)const;
  void selectTimelineRow(const LayerPanelNode&,int mode=0);
  void restoreTimelineRowSelection(std::vector<std::string>,std::vector<std::string>,std::optional<std::string> anchor={});
  void toggleGroupCollapsed(const std::string&);
  bool moveLayerPanelRows(const LayerPanelDropTarget&,bool copy=false);
  bool createLayerGroup();bool ungroupSelected();
  bool canMergeSelectedGroup()const;bool mergeSelectedGroup();
  struct LayerClipboardSnapshot {std::vector<timeline::MaskSlot> masks;std::vector<DocumentLayer> layers;std::vector<timeline::Group> groups;std::vector<DocumentFrame> frames;std::vector<DocumentCel> cels;std::vector<std::string> collapsed;std::uint64_t sourceIdentity=0;std::vector<tiles::Tileset> tilesets;};
  std::optional<LayerClipboardSnapshot> copyLayerClipboard();
  bool pasteLayerClipboard(const LayerClipboardSnapshot&);
  bool pastePixelsAsNewLayer(const SelectionClipboard&,Point,std::optional<TransformPoint> pivot={});
  bool canToggleClippingMask()const;bool toggleClippingMask();bool activeClippingMask()const;
  void setGroupVisible(const std::string&,bool);void setGroupLocked(const std::string&,bool);
  void clearTimelineSelection(){timelineSelection_={};selectedGroupIds_.clear();selectedGroupId_.reset();clearFrameSelection();}
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
  void previewLayerDisplayColor(std::optional<Pixel>);
  void previewLayerDescription(const std::u32string&);
  void previewLayerBlendMode(const std::string& mode);
  void commitLayerOpacity();
  void cancelLayerOpacity();
  const timeline::Timeline& timeline() const {timeline_.state_.canvasWidth=width_;timeline_.state_.canvasHeight=height_;return timeline_;}
  const std::optional<SelectionMask>& selection() const {return selection_;}
  std::uint64_t selectionRevision() const {return selectionRevision_;}
  void previewSelection(std::optional<SelectionMask> value){setSelectionValue(std::move(value));animationChangeBinding_.publish(*this,{AnimationChange::Kind::SelectionPreviewChanged});}
  void commitSelection(std::optional<SelectionMask> before,std::optional<SelectionMask> after,bool resetFrames=false);
  void selectAllPixels();void deselectPixels();void invertPixels();
  std::optional<SelectionClipboard> copyPixels();
  std::optional<SelectionClipboard> copyMergedPixels();
  bool flipContent(bool horizontal);
  bool rotateContent180();
  bool rotateContent(int angle);
  bool centerActiveContent(bool horizontal=true,bool vertical=true);
  bool fillSelectionOrCanvas(Pixel color);
  const std::optional<OutlineSettings>& outlineSettings()const{return outlineSettings_;}
  void setImportedOutlineSettings(std::optional<OutlineSettings> value){outlineSettings_=std::move(value);}
  struct OutlineTask {std::shared_ptr<Document> draft;std::uint64_t identity=0,revision=0;OutlineSettings settings;std::vector<MaskSlotKey> masks;bool boundary=false,changed=false;};
  OutlineTask captureOutlineTask(const OutlineSettings&,const std::vector<MaskSlotKey>& masks={},bool boundary=false);
  static bool runOutlineTask(OutlineTask&,const std::function<bool()>& cancelled);
  bool publishOutlineTask(const OutlineTask&);
  bool commitOutlineTask(OutlineTask&&);
  bool applyOutline(const OutlineSettings&,const std::vector<MaskSlotKey>& masks={},bool boundary=false);
  bool outlinePixels(const struct OutlineSampling&,Pixel color,bool smartHue=false,double darkness=45,bool followOpacity=false,bool boundary=false,const std::vector<MaskSlotKey>& masks={},const std::function<bool()>& cancelled={});
  bool deleteSelectedPixels();bool cutPixels(std::optional<SelectionClipboard>& clipboard);
  bool beginFloatingPaste(const SelectionClipboard& clipboard,int x,int y);
  bool beginLayerTransform();
  bool beginSelectionContentMove(bool copy=false,bool allFrameLayers=false,int initialDx=0,int initialDy=0,std::optional<Point> tilemapSeed={},bool symmetryTranslation=false,bool symmetryScale=false,bool symmetryRotation=false,bool symmetryShear=false);
  bool nudgeSelectionContent(int dx,int dy,bool allFrameLayers=false);
  bool nudgeTextLayer(int dx,int dy);
  bool paintCellFlipAvailable()const{return bool(expandedPaintCellSelection(true));}bool flipPaintCellSelection(bool horizontal);
  bool beginPaintCellMove(bool copy=false,bool keyboard=false);void updatePaintCellMove(int dx,int dy,bool clamp=false);bool finishPaintCellMove(bool cancel=false);bool paintCellMoving()const{return paintCellMove_.has_value();}
  bool beginTextDraft(const TextCelData&,timeline::Surface,const std::string& celId={});
  bool previewTextDraft(const TextCelData&,timeline::Surface);bool commitTextDraft();void cancelTextDraft();
  bool textDraftActive()const{return textDraft_.has_value();}
  bool canRasterizeLayer(const std::string& layerId)const;
  bool rasterizeLayer(const std::string& layerId);
  bool canCreateLinkedLayer(const std::string&)const;std::string createLinkedLayer(const std::string&);bool detachLinkedLayer(const std::string&);
  enum class LayerMoveScope { ContentAndSelection,TextBox };
  bool beginLayerMove(const std::vector<std::string>& celIds,bool duplicate=false,std::optional<TransformPoint> pivot={},LayerMoveScope scope=LayerMoveScope::ContentAndSelection);
  bool previewLayerMove(int dx,int dy);bool commitLayerMove();void cancelLayerMove();
  bool layerMoveActive()const{return layerMove_.has_value();}
  std::vector<std::string> layerMoveTargets()const;

  void commitSelectionBox(std::optional<SelectionMask> before);
  void prepareSelectionBoxMove();
  Point symmetryContentDragDelta(Point delta)const;
  void setFloatingRepeat(repeat::Mode mode){floatingRepeat_=mode;}
  bool floating() const {return floating_.has_value();}
  bool freeTileSelectionPlacementMoving()const;
  bool floatingDeferred()const{return floating_&&floating_->deferred&&!floating_->restoredFromDeselect;}
  std::uint64_t floatingOverlayRevision()const{return floatingOverlayRevision_;}
  std::uint64_t floatingHybridPatchBuilds()const{return floatingHybridPatchBuilds_;}
  PixelRegion floatingOverlayChange()const{return floatingOverlayChange_;}
  std::vector<Pixel> floatingOverlayRegion(PixelRegion region,bool rawHybrid=false)const;
  void setDeferredFloatingDisplaySupported(bool enabled){deferredFloatingDisplaySupported_=enabled;}
  void moveFloatingPaste(int x,int y);
  void transformFloatingPaste(const SelectionTransform& target,bool rotSprite=false);
  std::optional<SelectionTransform> floatingTransform() const {return floating_?std::optional<SelectionTransform>{floating_->transform}:std::optional<SelectionTransform>{};}bool commitFloatingPaste();void cancelFloatingPaste();
  bool beginLiquify(liquify::Point,liquify::Options);bool updateLiquify(liquify::Point);bool holdLiquify();bool commitLiquify();void cancelLiquify();bool liquifyActive()const{return liquifyStroke_.has_value()&&active_;}
  void beginStroke(Point point, Pixel color,BrushOptions brush={},const PatternBrush* image=nullptr,double angle=0,const std::unordered_map<std::size_t,Pixel>* baseline=nullptr,bool stampInitial=true,bool tileSecondary=false,bool tileErase=false,repeat::Mode repeatMode=repeat::Mode::Off);
  void updateStroke(Point point);
  void configureStrokeDynamics(BrushOptions base,const PatternBrush* image,Pixel gradientStart,Pixel gradientEnd,int dither);
  void updateDynamicStroke(Point point,BrushPathPoint sample,bool initial=false);
  // Legacy ISO: redraw a mutable aligned path or append an independent grid edge.
  void paintAlignedStrokePath(const std::vector<BrushPathPoint>& path,bool reset);
  void sprayStroke(const std::vector<SelectionPoint>& particles,BrushOptions brush,int angle);
  std::unordered_map<std::size_t,Pixel> strokeBaseline() const;
  std::vector<std::pair<std::size_t,Pixel>> strokeBaselinePoints() const;
  // Transient replacement pixels only; never opens a transaction or changes history.
  std::unordered_map<std::size_t,Pixel> brushPreview(Point from,Point to,Pixel color,BrushOptions brush,const PatternBrush* image=nullptr,double angle=0,const std::unordered_map<std::size_t,Pixel>* baseline=nullptr,bool clipSelection=true,repeat::Mode repeatMode=repeat::Mode::Off,bool balanced=false) const;
  void mergeLastStrokeEdits();
  bool commitStroke();
  void cancelStroke();
  void undo();
  void redo();
  void acceptSaved(std::string projectId,std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive,bool exact=true);
  static Document fromImage(int width,int height,std::vector<Pixel> pixels,std::u32string name);
  bool importSpriteSheet(const SheetImportOptions& options,std::optional<TransformPoint> pivot={});
  bool resizeImage(int width,int height,ImageInterpolation method=ImageInterpolation::Nearest);
  bool resizeCanvas(int width,int height,CanvasAnchor anchor=CanvasAnchor::Center,std::optional<int> offsetX={},std::optional<int> offsetY={},bool trimOutside=false,std::optional<TransformPoint> pivot={});
  std::optional<PixelRegion> visibleContentBounds(bool allFrames) const;
  bool trimCanvas(bool allFrames,std::optional<TransformPoint> pivot={});
  bool cropCanvas(std::optional<TransformPoint> pivot={});
  struct SelectionPivotHistory {std::uint64_t serial=0;std::optional<TransformPoint> pivot;};
  const SelectionPivotHistory& selectionPivotHistory() const {return selectionPivotHistory_;}
  struct MaskSelectionHistory {std::uint64_t serial=0;std::vector<std::pair<std::string,std::string>> slots;std::optional<std::optional<MaskSlotKey>> anchor;};
  const MaskSelectionHistory& maskSelectionHistory()const{return maskSelectionHistory_;}
  bool beginColorAdjustment(const std::vector<std::string>& layers={});
  bool beginColorReplacement(const std::vector<std::string>& celIds,bool clipSelection=false);
  bool updateColorReplacement(Pixel source,Pixel replacement,bool enabled=true);
  bool updateColorAdjustment(const ColorAdjustment& adjustment,bool enabled=true);
  struct GradientMapTask {
    struct Target{std::string ownerId;timeline::Surface surface;};
    int width=0,height=0;std::uint64_t identity=0,revision=0,previewRevision=0;
    std::string layerId,frameId;std::optional<SelectionMask> selection;
    std::size_t documentBytes=0;std::vector<Target> targets;bool completed=false;
    color_mode::PixelFormat pixelFormat=color_mode::PixelFormat::Rgba32;
  };
  std::optional<GradientMapTask> captureGradientMapTask() const;
  static bool runGradientMapTask(GradientMapTask&,const GradientMapSettings&,const std::function<bool()>& cancelled);
  bool publishGradientMapTask(GradientMapTask&&);
  bool restoreGradientMapBaseline();
  struct ConvolutionSurfaceTask {
    GradientMapTask source;ConvolutionOptions options;
    std::vector<ConvolutionSurfacePlan> plans;
    std::vector<timeline::Surface> results;std::vector<unsigned char> produced;
    std::size_t baseBytes=0,plannedBytes=0;bool completed=false;
  };
  std::optional<ConvolutionSurfaceTask> captureConvolutionSurfaceTask(const ConvolutionOptions&)const;
  static bool runConvolutionSurfaceTask(ConvolutionSurfaceTask&,const std::function<bool()>& cancelled);
  bool publishConvolutionSurfaceTask(ConvolutionSurfaceTask&&);
  bool restoreConvolutionBaseline();
  bool commitConvolutionAdjustment();
  struct ConvolutionTask {int width,height;std::uint64_t identity,revision;std::string layerId,frameId;std::optional<SelectionMask> selection;std::vector<std::pair<std::string,std::vector<Pixel>>> targets;color_mode::PixelFormat pixelFormat=color_mode::PixelFormat::Rgba32;};
  struct AntiAliasSurfaceTask {
    ConvolutionSurfaceTask surfaces;timeline::Timeline simulation;
    std::vector<std::string> frames;std::vector<Pixel> palette;AntiAliasOptions options;
    std::size_t simulationBytes=0,scratchBytes=0;std::string maskContext;
  };
  std::optional<AntiAliasSurfaceTask> captureAntiAliasSurfaceTask(const AntiAliasOptions&)const;
  static bool runAntiAliasSurfaceTask(AntiAliasSurfaceTask&,const std::function<bool()>&);
  bool publishAntiAliasSurfaceTask(AntiAliasSurfaceTask&&);
  bool commitAntiAliasAdjustment();
  struct AntiAliasTask {ConvolutionTask captured;timeline::Timeline timeline;std::vector<std::string> frames;std::vector<Pixel> palette;};
  bool beginAntiAliasPreview(const std::vector<MaskSlotKey>& masks={});
  static std::optional<std::vector<std::vector<Pixel>>> runAntiAliasTask(AntiAliasTask task,const AntiAliasOptions& options,const std::function<bool()>& cancelled);
  std::optional<AntiAliasTask> captureAntiAliasTask() const;
  std::optional<ConvolutionTask> captureConvolutionTask() const;
  bool publishConvolutionTask(const ConvolutionTask& task,const std::vector<std::vector<Pixel>>& results);
  bool restoreAdjustmentBaseline();
  bool commitColorAdjustment();void cancelColorAdjustment();
  struct FilterPreviewTask{int width=0,height=0;std::uint64_t identity=0,revision=0,contentRevision=0,generation=0;FilterPreset preset=FilterPreset::CrtSubtle;double opacity=1;bool lcd=false;LcdScreenFilterOptions lcdOptions;std::vector<timeline::Pixel> layerDisplayColors;std::string sourceLayerId,sourceFrameId,groupId;std::string layerId;timeline::State source;std::optional<timeline::Timeline> result;bool completed=false;};
  bool beginFilterPreview();
  std::optional<FilterPreviewTask> captureFilterPreviewTask(FilterPreset,std::optional<double> opacity={},bool lcd=false,int lcdWidth=1,int lcdHeight=1);
  static bool runFilterPreviewTask(FilterPreviewTask&,const std::function<bool()>& cancelled);
  bool publishFilterPreviewTask(FilterPreviewTask&&);
  bool commitFilterPreviewTask(FilterPreviewTask&&);
  bool restoreFilterPreview();void cancelFilterPreview();
  bool applyFilterPreset(FilterPreset,std::optional<double> opacity={});
  bool canSplitLayerStyles(const std::string& id={})const;
  bool splitLayerStyles(const std::string& id={});
  void setLayerDisplayColorPresets(std::vector<timeline::Pixel> colors){layerDisplayColors_=normalizeLayerDisplayColors(colors);}
  bool applyLcdScreenFilter(int width=1,int height=1);
  bool filterPreviewActive()const{return filterPreview_.has_value();}
  const timeline::Timeline& displayTimeline()const{const auto& value=filterPreview_&&filterPreview_->timeline?*filterPreview_->timeline:adjustment_?adjustment_->preview:(floating_&&floating_->tilemapPreview?*floating_->tilemapPreview->tilemapDisplay:(gradient_&&gradient_->tilemapDisplay?*gradient_->tilemapDisplay:timeline_));value.state_.canvasWidth=width_;value.state_.canvasHeight=height_;return value;}
  bool colorAdjustmentActive()const{return adjustment_.has_value();}
  std::uint64_t colorAdjustmentSession()const{return adjustment_?adjustment_->session:0;}
  bool beginGradient(Point seed,WandOptions options={});
  bool updateGradient(const GradientSpec& spec,WandOptions options);
  bool commitGradient();void cancelGradient();
  bool gradientContextValid()const;
  bool gradientActive()const{return gradient_ && !gradient_->shape;}
  bool shapeActive()const{return gradient_ && gradient_->shape;}
  bool beginShapePreview(std::optional<Point> sourceSeed={});bool updateShapePreview(const ShapeSpec& spec,Pixel color);
  bool paintGeometricBrushPath(const std::vector<SelectionPoint>& points,Pixel color,BrushOptions brush,const PatternBrush* image=nullptr,double angle=0,std::optional<Point> sourceSeed={});
  bool paintFreeTileSourceLine(Point from,Point to,Pixel color,BrushOptions brush={},const PatternBrush* image=nullptr,double angle=0,std::optional<BrushPathPoint> dynamics={},Pixel gradientStart=0,int gradientDither=0,bool balanced=true,repeat::Mode repeatMode=repeat::Mode::Off);
  bool updateGeometricBrushPreview(const std::vector<SelectionPoint>& points,Pixel color,BrushOptions brush,const PatternBrush* image=nullptr,double angle=0);
  bool commitShapePreview(){return commitGradient();}void cancelShapePreview(){cancelGradient();}
  std::uint64_t gradientRevision()const{return gradientRevision_;}
  const std::vector<Pixel>& displayPixels()const{if(floating_&&floating_->tilemapPreview)return floating_->tilemapPreview->tilemapDisplay->resolveSurface(cel().id).surface->pixels;if(adjustment_)return adjustment_->preview.resolveSurface(cel().id).surface->pixels;if(gradient_){if(gradient_->tilemapDisplay)return gradient_->tilemapDisplay->resolveSurface(cel().id).surface->pixels;return gradient_->preview;}return pixels();}
  const std::vector<PixelRegion>* tilemapPreviewRegions()const{return floating_&&floating_->tilemapPreview?&floating_->tilemapPreview->tilemapRegions:gradient_&&gradient_->tilemapDisplay?&gradient_->tilemapRegions:nullptr;}
  PixelRegion gradientBounds()const{if(floating_&&floating_->tilemapPreview){PixelRegion bounds;for(const auto& r:floating_->tilemapPreview->tilemapRegions){bounds.include(r.x,r.y);bounds.include(r.x+r.w-1,r.y+r.h-1);}return bounds;}if(gradient_&&gradient_->tilemapDisplay){PixelRegion bounds;for(const auto& r:gradient_->tilemapRegions){bounds.include(r.x,r.y);bounds.include(r.x+r.w-1,r.y+r.h-1);}return bounds;}if(adjustment_)return {0,0,width_,height_};if(!gradient_ || !gradient_->region)return {};const auto& r=*gradient_->region;return {r.x,r.y,r.width,r.height};}
  const timeline::AttachedMask* maskPreview()const;
  const std::vector<Pixel>* gradientPreviewPixels()const{if(active_&&tileStrokeIncremental_&&absentStrokeSurface_)return &static_cast<const std::vector<Pixel>&>(absentStrokeSurface_->pixels);return gradient_&&!gradient_->mask&&!gradient_->tilemapDisplay?&gradient_->preview:nullptr;}
  bool fillPixels(Point point,Pixel color,WandOptions options={});
  bool fillPatternPixels(Point point,Pixel color,const PatternFillOptions& pattern,WandOptions options={});
  // Legacy magic eraser: clear pixels matching the sampled color, honoring
  // tolerance/continuity/reference/selection, as one history edit.
  bool eraseMatchingColor(Point point,WandOptions options={},bool preview=false);
  const std::vector<ProjectBrushResource>& projectBrushes()const{return projectBrushes_;}
  std::uint64_t projectBrushRevision()const{return projectBrushRevision_;}
  void setImportedProjectBrushes(std::vector<ProjectBrushResource> brushes);
  bool deleteProjectBrush(const std::string& id);
  const ReferenceLibrary& referenceImages()const{return referenceImages_;}
  bool addReferenceImage(ReferenceImage);
  bool removeReferenceImage(const std::string&);
  void setImportedReferenceImages(ReferenceLibrary);
  void markSaved(); // Only call after successful persistence of this exact state.
private:
  friend struct AsepriteDocumentBuilder;
  SelectionPivotHistory selectionPivotHistory_;
  MaskSelectionHistory maskSelectionHistory_;
  bool cropCanvasRegion(PixelRegion bounds,std::optional<TransformPoint> pivot);
  TilemapSelection tileSelection_;std::uint64_t nextTileId_=0;
  struct FreeTilePlacement {DocumentCel before;Point last;bool erase=false,sampled=false,moving=false;std::vector<std::string> movingIds;int flagControl=-1;std::string initiatingInstance,sourceId;};
  std::optional<FreeTilePlacement> freeTilePlacement_;
  struct FreeTileSourceSnapshot {free_tiles::Source source;std::u32string tilesetName;};
  std::shared_ptr<const FreeTileSourceSnapshot> freeSourceProperties_;
  bool applyFreeTileSourceSnapshot(const FreeTileSourceSnapshot&);
  FreeTileSourceSnapshot freeTileSourceAfterChanges(const FreeTileSourceChanges&,bool)const;
  std::string freeInstanceViewLayer_,freeInstanceSelectionFrame_,freeInstancePrimary_,freeInstanceAnchor_;
  std::vector<std::string> freeInstanceSelected_;
  // Legacy free-tile-edit.ts uses a temporary ordinary raster, never the cel cache.
  struct FreeTileSourceStroke;
  std::shared_ptr<FreeTileSourceStroke> freeSourceStroke_;
  bool fillFreeTileSourcePixels(Point,Pixel,WandOptions,const PatternFillOptions*);
  Document* freeTileSourceStrokeDocument()const;
  Point freeTileSourceStrokePoint(Point,bool pointerSample=false)const;
  bool beginFreeTileSourceStroke(Point,Pixel,BrushOptions,const PatternBrush*,double,const std::unordered_map<std::size_t,Pixel>*,bool,bool=false,repeat::Mode=repeat::Mode::Off);
  void publishFreeTileSourceStroke();
  void publishFreeTileSourceStroke(FreeTileSourceStroke&);
  struct FreeTileSelectionMove;
  bool flipFreeTileContent(bool);
  bool beginFreeTileSelectionMove(bool,bool,int,int);
  void transformFreeTileSelectionMove(const SelectionTransform&);
  bool commitFreeTileSelectionMove();
  bool commitFreeTileSourceStroke();
  void cancelFreeTileSourceStroke();

  std::optional<timeline::State> tileStrokeBefore_;
  struct TilemapStrokeCell {std::optional<tiles::Cell> before;std::vector<Pixel> beforePixels;};
  bool tileStrokeIncremental_=false,tileStrokeLinked_=false;std::map<std::size_t,TilemapStrokeCell> tileStrokeCells_;std::string tileStrokeCel_;Point tileStrokePoint_{};std::optional<std::size_t> tileEditCell_;std::optional<tiles::Cell> tilePaintValue_;
  std::string uniqueTileId(const std::string&);
  bool commitTilemapState(timeline::State,const TilemapSelection&,std::u32string,const std::string& active={},bool clearPixelSelection=false,bool preserveTilemapOwners=false);
  bool fillTilemapPixels(Point,Pixel,WandOptions,const PatternFillOptions*);
  bool commitTilemapPixelCanvas(const std::vector<Pixel>& baseline,const std::vector<Pixel>& canvas,std::u32string label,std::optional<std::size_t> editCell={},bool clearPixelSelection=false,const std::optional<SelectionMask>* beforePixels=nullptr,const std::optional<SelectionMask>* afterPixels=nullptr,bool linkedCreateSelection=false,bool linkedEditSelection=false,bool linkedHybridSelection=false,bool linkedCreateFloating=false,bool linkedEditFloating=false,bool linkedHybridFloating=false,bool paintFloating=false,const tiles::CellPixelEdits* regional=nullptr);
  bool tilemapSelectionTransformAvailable()const;bool commitTilemapFloating();std::optional<bool> commitHybridCellFloating();
  bool deleteTilemapSelectionPixels();
  bool tilemapPixelReferenceOwnersSupported(const std::string& tilesetId)const;bool linkedHybridSelectionAvailable(bool requireSelection=true)const;bool linkedEditSelectionAvailable(bool requireSelection=true)const;bool linkedCreateSelectionAvailable(bool requireSelection=true,bool paintTransform=false)const;bool tilemapDeltaSupported()const;bool tilemapCellOwnerSupported(const std::string& celId,bool allowOffset=false,bool allowLinkedCels=false)const;std::uint64_t tilemapCacheCellWrites_=0;
  void startTilemapStroke(Point,bool);void paintTilemapLine(Point);bool commitTilemapStroke();void cancelTilemapStroke();
  struct Delta { std::size_t index; Pixel before, after; };
  struct SurfaceChange{std::string ownerId;timeline::Surface before,after;};
  struct PixelRun {std::size_t index,length;Pixel before,after;};
  struct DensePixels {int x,y,width,height;std::vector<Pixel> before,after;};
  struct PixelAddressSpace {int width=0,height=0,originX=0,originY=0;};
  struct GradientPreview;
  struct FloatingPaste;
  struct LayerStructureSnapshot {std::vector<DocumentLayer> layers;std::vector<timeline::Group> groups;std::optional<std::vector<DocumentFrame>> frames;std::vector<timeline::MaskSlot> masks;std::vector<std::pair<std::string,std::optional<double>>> celOpacities;};
  struct GroupUiSnapshot {std::vector<std::string> selected,collapsed;std::optional<std::string> focus;};
  struct FreeTileSelectionSnapshot {std::vector<std::string> selected;std::string primary,anchor,frame,viewLayer;};
  struct RollbackPayload {
 color_mode::PixelFormat pixelFormat=color_mode::PixelFormat::Rgba32;std::optional<OutlineSettings> outline;int width=0,height=0;timeline::State timeline;std::unordered_map<std::string,std::array<int,4>> displayedLayerGeometry;PaletteState palette;std::vector<ProjectBrushResource> brushes;ReferenceLibrary references;SliceState slices;std::optional<SymmetryCenter> symmetry;bool loop=true,pixelGrid=false,customGridVisible=false;GridSettings grid;std::string activeLayer,activeFrame;std::vector<std::string> collapsed;std::shared_ptr<const std::vector<std::uint8_t>> archive;ProjectInformation information;timelapse::Settings timelapse;
 };
 std::shared_ptr<const RollbackPayload> captureRollbackPayload()const;
 std::shared_ptr<const RollbackPayload> takeRollbackPayload()&&;
 struct RollbackReplay {
  RollbackPayload payload;
  timeline::Timeline timeline;
  TimelineSelection selection;
  std::vector<std::string> frames,groups;
  std::optional<std::string> groupFocus;
  std::string frameAnchor;
  std::optional<SelectionMask> pixelsSelection;
  SelectionPivotHistory pivot;
  PixelRegion damage;
  std::uint64_t brushRevision=0,selectionRevision=0;
  bool preserveRecording=false,applied=false;
  explicit RollbackReplay(const RollbackPayload& source):payload(source),timeline(std::move(payload.timeline)){}
 };
 void applyRollbackPayload(const RollbackPayload&,bool preserveRecording=false,const std::string* viewedFrame=nullptr,std::unique_ptr<RollbackReplay>* retained=nullptr);
 void exchangeRollbackPayload(RollbackReplay&)noexcept;
 void applyPreparedRollback(RollbackReplay&);
  std::optional<OutlineSettings> outlineSettings_;
  std::string activeMaskId_;bool maskIsolated_=false;
  struct MaskRasterGeometry {
    int width,height,offsetX,offsetY;std::optional<int> storageOriginX,storageOriginY;
    static MaskRasterGeometry capture(const timeline::Surface& s){return {s.width,s.height,s.offsetX,s.offsetY,s.storageOriginX,s.storageOriginY};}
    bool matches(const timeline::Surface& s)const{return width==s.width&&height==s.height&&offsetX==s.offsetX&&offsetY==s.offsetY&&storageOriginX==s.storageOriginX&&storageOriginY==s.storageOriginY;}
  };
  struct MaskStrokeBaseline {std::string maskId;MaskRasterGeometry geometry;std::optional<timeline::Surface> original;};
  struct MaskRasterHistory {std::string maskId;MaskRasterGeometry before,after;int canvasWidth;std::vector<Delta> pixels;};
  std::optional<MaskStrokeBaseline> maskStroke_;
  void prepareMaskStroke(bool expand);
  void rollbackMaskStroke();
  bool commitMaskStroke();
  void applyMaskRasterHistory(const MaskRasterHistory&,bool forward);
  std::vector<timeline::MaskSlot> maskClipboard_;
  std::uint32_t maskClipboardSequence_=0;
  MaskTransferResult transferAttachedMasks(const std::vector<timeline::MaskSlot>& sources,const std::vector<MaskSlotKey>& selection,const MaskSlotKey& anchor,const MaskSlotKey& target,bool move);
  timeline::AttachedMask* mutableActiveMask();
  std::vector<Pixel> attachedMaskCanvas(const timeline::Surface&)const;
  bool beginMaskPreview(Point,WandOptions,bool shape);
  bool maskPreviewValid()const;
  const std::vector<Pixel>& previewBaseline()const;
  void publishMaskPreview();
  bool commitMaskPreview();
  bool fillAttachedMask(Point,Pixel,WandOptions,const PatternFillOptions*);
  bool fillAttachedMaskSelection(Pixel);
  bool removeAttachedMasks(const std::vector<std::pair<std::string,std::string>>&,bool selected);
  bool commitMasks(std::vector<timeline::MaskSlot> before,const std::u32string& label);
  // Legacy TilemapTilesetEdit: only changed cells plus one affected tileset.
  // Both tileset snapshots are intentional; legacy does not use per-tile history.
  struct TilemapPixelHistory {
    struct CellChange{std::size_t index;std::optional<tiles::Cell> before,after;};
    std::string celId;bool tilesetEdit=true,independentCellOwner=false,cellOffsetLayout=false,linkedCellOwner=false,linkedCreateSelection=false,linkedEditSelection=false,linkedHybridSelection=false;tiles::Tileset beforeSet,afterSet;
    std::vector<CellChange> cells;std::vector<std::string> changedTileIds;
    std::size_t bytes()const;
  };
  struct LayerTilesetHistory {struct Entry{std::size_t index;tiles::Tileset value;};std::vector<Entry> before,after;std::size_t bytes()const;};
  // Composable layer payload; focus, selection and shared cels stay on Edit.
  struct LayerHistory {
    // Layer creation, deletion and menu duplication keep the current frame.
    bool preserveCurrentFrame=false;
    // Legacy row duplication restores rows, not the whole animation selection.
    bool copiedRowSelection=false;
    enum class DeletedRows {None,ActiveLayer,SelectedRows};
    DeletedRows deletedRows=DeletedRows::None;
    std::shared_ptr<const LayerTilesetHistory> layerTilesets;
    std::optional<LayerMetadataSnapshot> beforeLayerMetadata,afterLayerMetadata;std::optional<std::size_t> layerMetadataBytes;
    std::vector<std::pair<std::string,double>> beforeLayerOpacityProjection,afterLayerOpacityProjection;
    std::optional<bool> beforeVisible,afterVisible,beforeLocked,afterLocked,beforeAutoLink,afterAutoLink;
    std::vector<std::string> beforeOrder,afterOrder;
    std::optional<DocumentLayer> detachedLayer;
    std::optional<double> beforeOpacity,afterOpacity;
    std::optional<std::string> beforeBlendMode,afterBlendMode;
    std::optional<std::u32string> beforeName,afterName;
    mutable std::vector<DocumentCel> structureCels;
    std::size_t structureCelBytes=0;
    std::optional<LayerStructureSnapshot> beforeLayerStructure,afterLayerStructure;
    std::optional<GroupUiSnapshot> beforeGroupUi,afterGroupUi;
    std::string targetLayerId;
    std::size_t tilesetBytes()const;
    std::size_t nameBytes()const;
    std::size_t propertyBytes()const;
    std::size_t orderBytes()const;
    std::size_t projectionBytes()const;
    std::size_t snapshotBytes()const;
  };
  // Composable frame payload; shared cels, focus and selection stay on Edit.
  struct FrameHistory {
    // Legacy frame creation clears current timeline items on Redo rather than
    // restoring selection snapshots; Undo leaves current row/item choices alone.
    bool clearItemSelectionOnRedo=false;
    std::optional<std::vector<timeline::LoopSection>> beforeLoops,afterLoops;
    std::optional<bool> beforeAnimationLoop,afterAnimationLoop;
    std::optional<DocumentFrame> detachedFrame;
    std::vector<DocumentFrame> detachedFrames;
    std::vector<std::string> beforeFrames,afterFrames;
    std::vector<std::pair<std::string,bool>> beforeDisabled,afterDisabled;
    std::optional<int> beforeDuration,afterDuration;
    std::optional<std::vector<std::pair<std::string,int>>> beforeScriptDurations,afterScriptDurations;
    std::string targetFrameId;
    std::size_t durationBytes()const;
    std::size_t loopBytes()const;
    std::size_t frameBytes()const;
  };
  // Composable palette payload; pixel children and transaction state stay on Edit.
  struct PaletteHistory {
    std::optional<PaletteState> beforePalette,afterPalette;
    std::optional<PaletteViewSelection> beforePaletteView,afterPaletteView;
    int paletteKind=0, colorId=0; // 1 add, 2 remove slots, 3 color edit
    std::optional<std::size_t> exclusiveBytes()const;
    std::size_t metadataBytes()const;
    std::size_t snapshotBytes()const;
  };
  // Composable domains; shared timeline, focus and children remain on Edit.
  struct MaskHistory {
    std::optional<std::vector<timeline::MaskSlot>> beforeMasks,afterMasks;
    std::optional<std::string> maskToActivateOnRedo;
    std::optional<std::pair<std::string,bool>> maskEditingOnUndo;
    std::optional<std::vector<std::pair<std::string,std::string>>> beforeMaskSelection,afterMaskSelection;
    std::optional<std::optional<MaskSlotKey>> beforeMaskSelectionAnchor,afterMaskSelectionAnchor;
    struct MaskContextHistory {std::string before,after;bool beforeIsolated=false,afterIsolated=false;};
    std::shared_ptr<const MaskContextHistory> maskContext;
    std::size_t resourceBytes(const MaskRasterHistory* maskRaster)const;
    std::size_t contextBytes()const;
  };
  struct PixelSelectionHistory {
    std::optional<std::optional<TransformPoint>> beforeTrimPivot,afterTrimPivot;
    bool pixelSelectionEdit=false;
    std::optional<SelectionMask> beforePixelsSelection,afterPixelsSelection;
    std::size_t bytes()const;
  };
  // Domains compose inside one Edit; state, children and focus remain shared.
  struct SnapshotHistory {
    std::shared_ptr<const RollbackPayload> beforeRollback,afterRollback;std::size_t rollbackBytes=0;
    std::optional<std::pair<int,int>> beforeDimensions,afterDimensions;
    std::optional<timeline::State> beforeTimeline,afterTimeline;
    // Immutable history geometry: pointer moves cannot allocate (MSVC map moves can).
    using ScriptGeometry=std::unordered_map<std::string,std::array<int,4>>;
    std::shared_ptr<const ScriptGeometry> beforeScriptGeometry,afterScriptGeometry;
    std::optional<std::size_t> exclusiveBytes()const;
    std::size_t timelineBytes()const;
    std::size_t geometryBytes()const;
  };
  struct LocalSnapshotHistory {
    std::shared_ptr<const RollbackPayload> beforeRollback,afterRollback;std::size_t rollbackBytes=0;
    bool beforeHistoryDirty=false,afterHistoryDirty=false;
    std::u32string beforeHistoryName,afterHistoryName;
  };
  struct SourcePropertiesHistory {
    std::shared_ptr<const FreeTileSourceSnapshot> before,after;
  };
  struct TileResourceHistory {
    std::optional<TilemapSelection> beforeTileSelection,afterTileSelection;
    bool freeTileSourceAddition=false,freeTileSourceDeletion=false,freeTileSourceReorder=false;
    std::string tilesetSlotsId;std::optional<std::vector<std::optional<std::string>>> beforeTilesetSlots,afterTilesetSlots;
    std::optional<FreeTileSelectionSnapshot> beforeFreeTileSelection,afterFreeTileSelection;
    std::optional<std::size_t> exclusiveBytes(const SourcePropertiesHistory* source)const;
    std::size_t pixelBytes(const TilemapPixelHistory* tilemapPixels)const;
    std::size_t slotBytes()const;
  };
  struct SliceHistory {
  std::optional<SliceState> beforeSlices,afterSlices;
    std::size_t bytes()const;
  };
  struct ContentHistory {
    std::vector<PixelRun> runs;
    std::optional<DensePixels> dense;
    std::optional<PixelAddressSpace> pixelAddress;
    std::shared_ptr<const FloatingPaste> restoredClipboard;
    std::size_t restoredClipboardBytes=0;
    std::string targetCelId; // Empty only for non-pixel palette edits.
    std::optional<DocumentCel> detachedCel;
    std::vector<DocumentCel> detachedCels;
    std::vector<DocumentCel> beforeCels,afterCels;
    std::optional<CelPropertiesPlan> celProperties;
    std::vector<SurfaceChange> surfaceChanges;
    struct OwnerOffsetChange{std::string ownerId;int beforeX,beforeY,afterX,afterY;};
    std::vector<OwnerOffsetChange> ownerOffsets;
    struct TextChange {std::string id;std::optional<TextCelData> before,after;};
    std::vector<TextChange> textChanges;
    std::optional<std::size_t> exclusiveBytes()const;
    std::size_t textBytes()const;
    std::size_t addressBytes()const;
    std::size_t pixelBytes(std::size_t deltaCount)const;
    std::size_t denseBytes()const;
    std::size_t celBytes()const;
    std::size_t offsetBytes()const;
    std::size_t surfaceBytes()const;
  };
  // Only the five terminal replay categories are mutually exclusive.
  // Composite resources, selection, focus and children remain on their parent.
  using MaskRasterReplay=std::shared_ptr<const MaskRasterHistory>;
  using LocalPixelsReplay=std::shared_ptr<const local_history::PixelHistoryEdit>;
  using TilemapPixelsReplay=std::shared_ptr<const TilemapPixelHistory>;
  using TerminalHistory=std::variant<std::monostate,MaskRasterReplay,LocalSnapshotHistory,LocalPixelsReplay,SourcePropertiesHistory,TilemapPixelsReplay>;
  struct Edit {
    std::vector<Delta> pixels; std::uint64_t beforeState, afterState;
    TerminalHistory terminalHistory;
    const MaskRasterHistory* maskRaster()const{const auto* p=std::get_if<MaskRasterReplay>(&terminalHistory);return p?p->get():nullptr;}
    const local_history::PixelHistoryEdit* localPixels()const{const auto* p=std::get_if<LocalPixelsReplay>(&terminalHistory);return p?p->get():nullptr;}
    const TilemapPixelHistory* tilemapPixels()const{const auto* p=std::get_if<TilemapPixelsReplay>(&terminalHistory);return p?p->get():nullptr;}
    const SourcePropertiesHistory* sourceProperties()const{return std::get_if<SourcePropertiesHistory>(&terminalHistory);}
    const LocalSnapshotHistory* localSnapshot()const{return std::get_if<LocalSnapshotHistory>(&terminalHistory);}
    LocalSnapshotHistory* localSnapshot(){return std::get_if<LocalSnapshotHistory>(&terminalHistory);}
    // A restored structural entry also restores root name/dirty. Ordinary
    // project backup rollback retains its existing root-field semantics.
    SnapshotHistory snapshotHistory;
    MaskHistory maskHistory;
    SliceHistory sliceHistory;
    TileResourceHistory tileHistory;
    ContentHistory contentHistory;
    bool documentChanged=true;
    PixelSelectionHistory pixelSelectionHistory;
    PaletteHistory paletteHistory;
    std::string beforeActive,afterActive;
    std::optional<std::vector<std::string>> beforeSelection,afterSelection;
    LayerHistory layerHistory;
    FrameHistory frameHistory;
    std::vector<Edit> children;
    std::optional<TimelineSelection> beforeTimelineSelection,afterTimelineSelection;
    std::optional<std::string> beforeFrameAnchor,afterFrameAnchor;
    std::string beforeFrame,afterFrame;
    std::optional<AnimationSelectionSnapshot> beforeAnimationSelection,afterAnimationSelection;
    bool normalizeAnimationSelection=false;
    std::size_t animationSelectionBytes()const;
    std::u32string label=U"绘制";
    std::size_t bytes() const;
  };
  void applyTilemapPixelHistory(const Edit&,bool forward);
  std::vector<tiles::Tileset> tilesetsForLayerEdit(const Edit&,bool)const;
  struct LayerMovePreview {Edit edit;LayerMoveScope scope=LayerMoveScope::ContentAndSelection;std::vector<std::string> celIds;bool duplicate=false,duplicated=false;int x=0,y=0;std::vector<PixelRegion> bounds;};
  std::optional<LayerMovePreview> layerMove_;
  struct TextDraft {Edit edit;std::string owner;bool created=false;std::optional<timeline::Surface> originalSurface;std::optional<TextCelData> originalText;};
  std::optional<TextDraft> textDraft_;
  std::vector<std::string> selectedGroupIds_,collapsedGroupIds_;
  std::optional<std::string> selectedGroupId_;
  std::uint64_t nextGroupId_=0;
  bool commitLayerFlagGesture(std::vector<std::pair<std::string,bool>>&,bool visibility);
  void addLayerInGroupContext(bool gradientMap=false);
  bool duplicateLayerRows(const std::vector<std::string>& direct,const std::vector<std::string>& groups,const LayerPanelDropTarget& target,bool copyMove=false);
  bool deleteLayerRows(const std::vector<std::string>& direct,const std::vector<std::string>& groups,bool activeOnly=false);
  void captureGroupEdit(Edit&,bool after)const;
  void appendDetachLinkedLayer(Edit&,const std::string&);std::u32string linkedLayerCopyName(const std::string&,const std::u32string&,const std::vector<DocumentLayer>* namingLayers=nullptr)const;
  bool pasteTilemapCels(const CelClipboardSnapshot&);bool cutTilemapCels();void detachTilemapCelTargets(timeline::State&,const std::vector<std::string>&)const;
  bool pasteTilemapFrames(const FrameClipboardSnapshot&,bool duplicateSelection=false,std::optional<int> insertion=std::nullopt);bool cutTilemapFrames();
  struct LayerStructureReplay {
   std::optional<timeline::Timeline> timeline;
   std::vector<DocumentCel> detached;
   std::string layer,frame,mask;
   TilemapSelection tileSelection;
   PixelRegion damage;
   bool isolated=false,applied=false;
  };
  void applyLayerStructure(const Edit&,bool forward,LayerStructureReplay* retained=nullptr);
  void exchangeLayerStructure(const Edit&,LayerStructureReplay&)noexcept;
  void applyGroupUi(const Edit&,bool forward);
  bool commitGroupEdit(Edit,std::u32string label={});
  bool commitImmediateTransform(const std::vector<std::string>& targets,const std::optional<SelectionMask>& capture,const SelectionTransform& transform,bool wholeFlip,bool packedFlip,bool horizontal,std::optional<SelectionMask> afterSelection,bool selectionOnly);
  struct SparseFillGeometry{bool expanded=false,discardPlaceholder=false,localClosureResolved=false;std::optional<SelectionMask> localClosure;};
  std::vector<Pixel> sparseFillCanvas(const timeline::Surface&)const;
  void prepareSparseFillGeometry(std::vector<Pixel>&,const timeline::Surface&,Point,WandOptions,SparseFillGeometry&,bool compactSolid)const;
  bool fillCanvasAt(std::vector<Pixel>&,Point,Pixel,WandOptions,Edit&,const timeline::Surface* sparseSource=nullptr,SparseFillGeometry* geometry=nullptr);
  bool fillPatternCanvasAt(std::vector<Pixel>&,Point,Pixel,const PatternFillOptions&,WandOptions,Edit&,const timeline::Surface* sparseSource=nullptr,SparseFillGeometry* geometry=nullptr);
  bool fillSparse(Point,Pixel,WandOptions,const PatternFillOptions* pattern=nullptr);
  bool commitSparseFill(Edit,const std::vector<Pixel>&,SparseFillGeometry geometry);
  std::u32string name_=U"未命名";
  std::string projectId_;
  std::filesystem::path sourceFilePath_;
  std::shared_ptr<const std::vector<std::uint8_t>> sourceArchive_;
  PaletteState palette_;
  color_mode::PixelFormat pixelFormat_=color_mode::PixelFormat::Rgba32;
  std::vector<ProjectBrushResource> projectBrushes_;
  std::uint64_t projectBrushRevision_=0;
  ReferenceLibrary referenceImages_;
  std::optional<SymmetryCenter> symmetryCenter_;
  std::vector<std::pair<std::string,bool>> lockGestureBefore_;
  std::vector<std::pair<std::string,bool>> visibilityGestureBefore_;
  std::vector<std::pair<std::string,bool>> autoLinkGestureBefore_;
  bool fillSymmetryDispatch_=false;
  void reserveHistoryEntries(std::size_t additional=1);
  void finishAnimationSelectionHistory(AnimationSelectionHistoryScope&);
  void pushEdit(Edit edit,std::u32string label=U"绘制");
  struct SurfaceReplay {
   struct Text {std::string id;std::optional<TextCelData> value;std::optional<TextCelData>* target=nullptr;};
   struct Offset {std::string id;int x,y;timeline::Surface* target=nullptr;};
   struct Replacement {std::string id;timeline::Surface value;timeline::Surface* target=nullptr;};
   std::vector<Text> text;
   std::vector<Offset> offsets;
   std::vector<Replacement> replacements;
   std::string active,frame;
  };
  std::unique_ptr<SurfaceReplay> prepareSurfaceEdit(const Edit&,bool)const;
  void applySurfaceEdit(const Edit&,bool,SurfaceReplay* prepared=nullptr);
  void capturePixelAddresses(Edit& edit);
  void applyPixelEdit(const Edit& edit,bool forward,bool activateTarget=false,bool prepareOnly=false);
  PaletteState capturePaletteEdit(int kind,int id=0) const;
  struct PaletteReplay {
   struct Patch {std::size_t index;std::optional<std::u32string> name;std::optional<Pixel> color;};
   std::optional<PaletteState> full;
   std::optional<std::vector<PaletteEntry>> entries;
   std::optional<std::optional<std::vector<int>>> order;
   std::optional<std::vector<int>> slots,selected;
   std::optional<int> columns,nextId,primaryId;
   std::optional<Pixel> primary,secondary;
   std::vector<Patch> patches;
   std::optional<std::optional<PaletteViewSelection>> view;
   std::uint64_t viewSerial=0;
   bool applied=false;
  };
  std::unique_ptr<PaletteReplay> preparePaletteEdit(const Edit& edit,bool redo)const;
  void exchangePaletteEdit(PaletteReplay& prepared)noexcept;
  void applyPaletteEdit(const Edit& edit,bool redo,PaletteReplay* prepared=nullptr);
  std::optional<PaletteViewSelection> paletteViewRestore_;
  std::uint64_t paletteViewRestoreSerial_=0;
  void selectPaletteIds(const std::vector<int>& ids,int primary);
  void line(Point from, Point to);
  void plot(int x, int y);
  bool plotStrokeColorReplacement(std::size_t index,int coverage);
  std::optional<std::pair<Pixel,Pixel>> strokeColorReplacement_;
  void stamp(int x,int y);
  BrushOptions brush_;
  bool dynamicStroke_=false;BrushOptions dynamicBase_;std::optional<PatternBrush> dynamicImage_;Pixel dynamicGradientStart_=0,dynamicGradientEnd_=0;int dynamicDither_=0;BrushPathPoint dynamicLast_;
  void dynamicStamp(BrushPathPoint sample);
  std::unordered_map<std::uint64_t,int> inkStampCoverage_;
  std::vector<BrushSpan> stampSpans_;
  std::optional<ImageBrushStamp> imageStamp_;
  std::optional<ImageBrushPatternSampler> imagePattern_;double strokeImageAngle_=0;
  std::unordered_map<std::size_t,int> imageEraseCoverage_;
  std::unordered_map<std::size_t,Pixel> inheritedStrokeBaseline_;
  Point previousStamp_{};
  bool hasPreviousStamp_=false;
  std::vector<BrushPathPoint> perfectPath_;
  struct PerfectTailPixel {Pixel value; int pending; Pixel after;};
  std::unordered_map<std::size_t,PerfectTailPixel> perfectTailPixels_;
  std::unordered_map<std::size_t,std::optional<int>> perfectTailErase_;
  std::unordered_map<std::uint64_t,std::optional<int>> perfectTailInk_;
  std::size_t perfectStable_=0,perfectPendingStart_=0;
  bool capturingPerfectTail_=false;
  void capturePerfectPixel(std::size_t index);
  void capturePerfectInkCoverage(std::uint64_t key);
  void rollbackPerfectTail();
  int width_, height_;
  timeline::Timeline timeline_;
  // Resolve the selected owned surface once per stroke, retaining the direct pixel hot path.
  std::vector<Pixel>& pixelStorage() {return strokePixels_?*strokePixels_:timeline_.mutableOwnedSurface(timeline_.resolveSurface(cel().id).source->id)->pixels;}
  std::vector<Pixel>* strokePixels_=nullptr;
  std::optional<timeline::Surface> absentStrokeSurface_;
  bool strokeCanvasStorage_=true;
  int strokeStride_=0,strokeOffsetX_=0,strokeOffsetY_=0;
  repeat::Mode strokeRepeat_=repeat::Mode::Off;
  std::vector<SymmetryPixel> strokeSymmetryPoints(SymmetryPixel)const;
  PixelAddressSpace strokeAddress_;
  std::size_t strokeStorageIndex(std::size_t index)const {
    if(strokeCanvasStorage_)return index;
    return std::size_t(std::int64_t(index/std::size_t(width_))-strokeOffsetY_)*std::size_t(strokeStride_)+std::size_t(std::int64_t(index%std::size_t(width_))-strokeOffsetX_);
  }
  Pixel& strokePixel(std::size_t index){return (*strokePixels_)[strokeStorageIndex(index)];}
  std::string activeLayerId_;
  std::uint64_t nextLayerId_=0,nextFrameId_=0;
  std::string activeFrameId_,frameAnchor_;
  // Legacy display layer geometry survives an absent animation slot.
  std::unordered_map<std::string,std::array<int,4>> displayedLayerGeometry_;
  void projectActiveLayerGeometry();
  std::vector<std::string> selectedFrames_;
  TimelineSelection timelineSelection_;
  std::vector<CelClipboardItem> celClipboard_;
  std::vector<FrameClipboardItem> frameClipboard_;
  std::shared_ptr<const FrameClipboardSnapshot> frameClipboardMetadata_;
  bool animationLoop_=true;
  void mergeRasterLayers(const std::vector<std::string>& ids,std::size_t index);
  void captureFrameOrder(Edit& edit,bool after) const;
  void normalizeFrameDeletionSelection();
  void clearAnimationItemSelection();
  void applyFrameEdit(const Edit& edit,bool redo);
  void applyEdit(const Edit& edit,bool redo);
  // Only applyEdit or its already-validated child traversal may enter here.
  struct HistoryResourceReplay {
   std::optional<std::vector<std::optional<std::string>>> tileSlots;
   std::optional<TilemapSelection> tileSelection;
   std::optional<std::vector<timeline::MaskSlot>> masks;
   std::optional<MaskSelectionHistory> maskSelection;
   std::string activeMask,activeLayer,activeFrame;
   bool isolated=false,explicitMask=false,focus=false,maskSwapped=false,layerSwapped=false,frameSwapped=false,initialized=false,applied=false;
   HistoryResourceReplay(const Edit& edit,bool forward);
  };
  struct HistoryReplayPlan {
   PreparedHistoryReplay rollback;
   HistoryResourceReplay resources;
   struct Snapshot {
    std::optional<timeline::Timeline> timeline;
    std::string layer,frame;
    int width=0,height=0;
    PixelRegion damage;
    bool dimensions=false,applied=false;
   };
   std::optional<Snapshot> snapshot;
   std::optional<LayerStructureReplay> layers;
   std::unique_ptr<RollbackReplay> rollbackPayload;
   std::unique_ptr<PaletteReplay> palette;
   struct Leaf {
    struct Pixels {struct Span {std::size_t index;std::vector<Pixel> values;};timeline::LinkedPixelStorage storage;std::vector<Span> spans;};
    std::unique_ptr<Pixels> pixels;
    std::optional<timeline::Timeline> metadata;
    std::string layer,frame;
    std::vector<std::string> frames;
    std::unordered_map<std::string,std::array<int,4>> geometry;
    PixelRegion damage;
    bool ready=false,published=false,applied=false;
   };
   std::unique_ptr<Leaf> leaf;
   std::optional<SliceState> slices;
   std::optional<SelectionPivotHistory> pivot;
   std::optional<bool> loop;
   bool slicesApplied=false,pivotPrepared=false,pivotApplied=false,loopApplied=false;
   std::optional<std::optional<SelectionMask>> pixelsSelection;
   bool pixelsSelectionApplied=false;
   bool contentApplied=false;
   std::vector<HistoryReplayPlan> children;
   HistoryReplayPlan(const Edit& edit,bool forward);
  };
  void applyValidatedEdit(const Edit& edit,bool forward,HistoryReplayPlan& plan);
  // Internal replay phases preserve the legacy-compatible ordered transaction.
  void applyMaskHistoryResources(HistoryResourceReplay& prepared);
  void applyMaskHistoryContext(const MaskHistory& mask,bool forward);
  void applyTrimPivotHistory(HistoryReplayPlan& plan)noexcept;
  void applyPixelSelectionHistory(HistoryReplayPlan& plan)noexcept;
  bool applyTerminalHistory(const Edit& edit,bool forward);
  void applyLocalSnapshotHistory(const LocalSnapshotHistory& snapshot,bool forward);
  void applyRollbackHistory(const SnapshotHistory& snapshot,bool forward,HistoryReplayPlan& plan);
  void applySnapshotStructure(const Edit& edit,bool forward,HistoryReplayPlan& plan);
  void exchangeSnapshotStructure(HistoryReplayPlan::Snapshot& prepared)noexcept;
  void applySliceHistory(HistoryReplayPlan& plan)noexcept;
  void applyTileHistoryResources(const Edit& edit,HistoryResourceReplay& prepared);
  void applyFreeTileSelectionHistory(const TileResourceHistory& tiles,bool forward);
  void applyHistoryResources(const Edit& edit,HistoryResourceReplay& prepared);
  void applyHistoryStructure(const Edit& edit,bool forward,HistoryReplayPlan& plan);
  void applyHistoryContent(const Edit& edit,bool forward,HistoryReplayPlan& plan);
  std::unique_ptr<HistoryReplayPlan::Leaf::Pixels> prepareHistoryPixelRestore(const Edit& edit)const;
  void prepareHistoryLeafMetadata(const Edit& edit,bool forward,HistoryReplayPlan::Leaf& prepared);
  void exchangeHistoryLeaf(HistoryReplayPlan& plan)noexcept;
  void applyHistorySelection(const Edit& edit,bool forward,HistoryReplayPlan& plan);
  void applyHistoryProjection(const Edit& edit,bool forward);
  void finishHistorySources(const Edit& edit,bool forward,bool freePaintBefore,bool sourceEdit,const std::string& sourceEditLayer,const std::string& sourceEditFrame);

  void applyLocalHistoryPixels(const local_history::PixelHistoryEdit&,bool forward);
  void groupEdits(std::size_t start,const std::vector<std::string>& selection);
  void applyCelEdit(const Edit& edit,bool redo);
  void applyLayerEdit(const Edit& edit,bool redo);
  void captureLayerOrder(Edit& edit,bool after) const;
  // legacy PixelEditPoints: contiguous touched-pixel records, with a bounded
  // document-local lookup instead of allocating a hash node for every pixel.
  std::optional<liquify::Stroke> liquifyStroke_;liquify::Options liquifyOptions_;liquify::Point liquifyLast_;
  std::string liquifyOwner_;std::optional<timeline::Surface> liquifyGeometry_;
  std::vector<DocumentCel> liquifyBeforeCels_,liquifyAfterCels_;
  std::vector<Delta> liquifyDeltas_;std::unordered_map<std::size_t,std::size_t> liquifyLookup_;
  liquify::Context liquifyContext();
  std::vector<Delta> pending_;
  StrokePixelLookup pendingLookup_;
  void clearPendingStroke(){strokeRepeat_=repeat::Mode::Off;imagePattern_.reset();dynamicStroke_=false;dynamicImage_.reset();capturingPerfectTail_=false;perfectPath_.clear();perfectTailPixels_.clear();perfectTailErase_.clear();perfectTailInk_.clear();perfectStable_=0;pendingLookup_.clear();pending_.clear();}
  PixelRegion change_;
  PixelRegion recordingDirty_;std::uint64_t recordingDirtyFrom_=0,recordingDirtyTo_=0;bool recordingDirtyValid_=true;
  timelapse::Settings timelapseSettings_;
  struct RecordingBinding {
    std::shared_ptr<timelapse::Session> session;std::function<void(Document&,bool)> observer;std::function<void(const timelapse::Settings&)> restore;
    RecordingBinding()=default;
    RecordingBinding(const RecordingBinding&) {}
    RecordingBinding& operator=(const RecordingBinding&){session.reset();observer={};restore={};return *this;}
    RecordingBinding(RecordingBinding&&)=default;RecordingBinding& operator=(RecordingBinding&&)=default;
  } recordingBinding_;
  void notifyRecording(bool undoStep=false){if(recordingBinding_.observer)recordingBinding_.observer(*this,undoStep);}
  std::uint64_t identity_=0,contentRevision_=0,contentMutationRevision_=0,revision_=0;
  HistoryStore<Edit> history_;
  HistoryChangeBinding historyChangeBinding_;
  AnimationChangeBinding animationChangeBinding_;
  void notifyHistoryChange(HistoryStackChange::Kind,const std::u32string& label={},std::size_t discardedUndo=0,std::size_t discardedRedo=0);
  std::uint64_t historyRevision_=0;
  // Unlike historyRevision_, this changes only when a new entry is pushed.
  std::uint64_t historyPushRevision_=0;
  std::u32string historyLabelOverride_;
  bool groupingHistory_=false;
  bool paletteColorSynchronization_=false; // UI preference, never project metadata.
  std::optional<std::vector<std::pair<std::string,std::optional<timeline::ColorOverlayStyle>>>> layerStyleBaseline_;
  std::optional<timeline::LayerAdjustment> layerAdjustmentBaseline_;std::string layerAdjustmentId_;
  void publishChange(bool linkedLayersPrepared=false,bool frameViewOnly=false){
    timeline_.state_.canvasWidth=width_;timeline_.state_.canvasHeight=height_;
    if(timeline_.hasLinkedLayers()){if(!linkedLayersPrepared)timeline_.synchronizeLinkedLayers();if(!change_.empty())change_={0,0,width_,height_};}
    projectActiveLayerGeometry();
    if(!change_.empty()){
      if(recordingDirtyTo_!=contentRevision_)recordingDirtyValid_=false;
      if(recordingDirty_.empty())recordingDirty_=change_;
      else{const int x=std::min(recordingDirty_.x,change_.x),y=std::min(recordingDirty_.y,change_.y);const auto right=std::max(std::int64_t(recordingDirty_.x)+recordingDirty_.w,std::int64_t(change_.x)+change_.w),bottom=std::max(std::int64_t(recordingDirty_.y)+recordingDirty_.h,std::int64_t(change_.y)+change_.h);if(right-x>std::numeric_limits<int>::max()||bottom-y>std::numeric_limits<int>::max())recordingDirtyValid_=false;else recordingDirty_={x,y,int(right-x),int(bottom-y)};}
      ++contentRevision_;if(!frameViewOnly)++contentMutationRevision_;recordingDirtyTo_=contentRevision_;
    }
  }

  std::uint64_t state_ = 0, nextState_ = 1;
  bool showPixelGrid_=false,showCustomGrid_=false;GridSettings customGrid_;
  bool modified_ = false; // Legacy touch: undo/redo are document changes too.
  struct CelPropertyPreview {std::uint64_t identity;std::string layerId,frameId;std::vector<std::string> targets;std::vector<CelPropertiesPlan> steps;};
  std::optional<CelPropertyPreview> celPropertyPreview_;
  void projectActiveCelOpacities();
  void syncActiveLayerCelOpacity(const std::string& id);
  void applyCelPropertiesEdit(const Edit&,bool forward);
  std::optional<double> opacityBefore_;
  std::vector<std::pair<std::string,double>> opacityValuesBefore_;
  std::vector<std::pair<std::string,std::u32string>> layerNamesBefore_;
  bool layerNameChanged_=false;
  std::vector<timeline::Group> groupPropertiesBefore_;
  std::vector<LayerMetadataSnapshot> layerMetadataBefore_;
  std::vector<std::pair<std::string,std::optional<Pixel>>> linkedDisplayBefore_;bool layerDescriptionChanged_=false;void captureLayerMetadataPreview();
  std::vector<std::pair<std::string,std::string>> layerBlendModesBefore_;
  std::optional<int> durationBefore_;
  std::vector<std::pair<std::string,int>> durationValuesBefore_;
  std::optional<SelectionMask> selection_;
  std::uint64_t selectionRevision_=0;
  bool commitFloatingPasteImpl();void cancelFloatingPasteImpl();
  void setSelectionValue(std::optional<SelectionMask> value){selection_=std::move(value);++selectionRevision_;}
  void swapSelectionValue(std::optional<SelectionMask>& value)noexcept{selection_.swap(value);++selectionRevision_;}
  struct FloatingTarget {SelectionClipboard source;std::string celId;std::unordered_map<std::size_t,Delta> preview;std::shared_ptr<SelectionRotSpriteSource> rotSprite;std::optional<SelectionClipboard> originalSource;std::string ownerId;std::optional<timeline::Surface> baseline;std::shared_ptr<const SymmetryRotationRaster> symmetryRotation;};
  struct PaintCellMove {std::string layerId,frameId,celId;SelectionMask expanded;std::optional<SelectionMask> beforeSelection;std::vector<TilemapPixelHistory::CellChange> sources;std::shared_ptr<Edit> preview;bool copy=false;int columns=0,rows=0;};
  std::optional<PaintCellMove> paintCellMove_;std::optional<SelectionMask> expandedPaintCellSelection(bool discreteFlip=false)const;
  repeat::Mode floatingRepeat_=repeat::Mode::Off;
  struct HybridFloatingPatch {std::uint64_t overlayRevision=0,contentRevision=0;repeat::Mode repeat=repeat::Mode::Off;std::map<std::string,std::vector<Pixel>> modified;std::map<std::size_t,std::vector<Pixel>> local;std::size_t bytes=0;};
  struct FloatingPaste {mutable std::shared_ptr<const HybridFloatingPatch> hybridPatch;std::shared_ptr<FreeTileSelectionMove> freeTile;bool linkedCreate=false,linkedEdit=false,linkedHybrid=false;bool symmetryRotation=false;bool symmetryShear=false;bool symmetryScale=false;std::optional<SymmetryPixel> symmetryStart;SymmetryAxes symmetryAxes;SymmetryCenter symmetryCenter;std::string maskId;std::optional<std::vector<timeline::MaskSlot>> beforeMasks;SelectionClipboard source;SelectionTransform transform;int x=0,y=0;std::optional<SelectionMask> beforeSelection;bool clipboard=true,copy=true,rotSprite=false,tilemap=false;int sourceX=0,sourceY=0;std::vector<FloatingTarget> targets;std::string layerId,frameId;std::optional<timeline::State> beforeCelTimeline;TimelineSelection beforeTimelineSelection;std::vector<std::string> beforeSelectedFrames;bool sparse=false,restoredFromDeselect=false;std::size_t transientBytes=0;bool deferred=false;tiles::Mode tilemapMode=tiles::Mode::Create;std::optional<std::size_t> tilemapEditCell;std::shared_ptr<GradientPreview> tilemapPreview;};
  bool beginMaskFloating(const SelectionClipboard&,int,int,bool,bool);
  bool beginMaskSelectionMove(bool,bool,int,int);
  void transformMaskFloating(const SelectionTransform&,bool);
  bool commitMaskFloating();
  void cancelMaskFloating();
  bool transformMaskImmediate(bool,bool,int);
  bool deleteMaskSelection();
  std::optional<FloatingPaste> floating_;
  bool deferredFloatingDisplaySupported_=true;
  std::uint64_t floatingOverlayRevision_=0;
  mutable std::uint64_t floatingHybridPatchBuilds_=0;
  PixelRegion floatingOverlayChange_;
  bool supportsDeferredFloating(const FloatingPaste&)const;
  bool floatingSymmetryTranslation(const FloatingPaste&,const SelectionTransform&)const;
  bool floatingSymmetryScale(const FloatingPaste&,const SelectionTransform&)const;
  bool floatingSymmetryRotation(const FloatingPaste&,const SelectionTransform&)const;void configureSymmetryContentRotation(FloatingPaste&);void configureSymmetryContentShear(FloatingPaste&);
  void configureSymmetryContentDrag(FloatingPaste&,Point);
  void noteFloatingOverlayChange(const FloatingPaste&,const SelectionTransform&,const SelectionTransform&);
  bool commitDeferredFloatingPaste();
  void checkFloatingBudget(const FloatingPaste&,std::size_t extra)const;
  std::optional<SelectionMask> floatingSelectionMask(const FloatingPaste&,const SelectionTransform&)const;
  void transformSparseFloatingPaste(const SelectionTransform&,bool);
  bool commitSparseFloatingPaste();
  struct SparseGradientBaseline {std::vector<Pixel> canvas;std::string ownerId;int width=0,height=0,offsetX=0,offsetY=0;std::optional<int> originX,originY;};
  bool beginSparseShape();
  bool updateSparseShape(const ShapeSpec&,Pixel);
  bool commitSparseShape();
  bool beginSparseGradient(Point,WandOptions);
  bool updateSparseGradient(const GradientSpec&,WandOptions);
  bool commitSparseGradient();
  bool sparseGradientSourceValid()const;
  bool beginTilemapPreview(Point,WandOptions,bool);
  bool tilemapPreviewValid()const;
  void publishTilemapPreview();void publishTilemapPreview(GradientPreview&);bool linkedCreateFloatingSupported(const FloatingPaste&)const;bool linkedEditFloatingSupported(const FloatingPaste&)const;bool linkedHybridFloatingSupported(const FloatingPaste&)const;bool prepareTilemapFloating(FloatingPaste&,std::optional<Point>);
  bool commitTilemapPreview();
  struct MaskPreviewBaseline {std::string id;timeline::Surface surface;std::vector<Pixel> canvas;timeline::AttachedMask display;PixelRegion previous;};
  struct GradientPreview {Point seed;std::string celId,layerId,frameId;std::vector<Pixel> preview;std::optional<SelectionMask> selection,region;WandOptions options;std::uint64_t contentRevision;bool shape=false,absentRaster=false;std::optional<SparseGradientBaseline> sparse;std::optional<std::vector<Pixel>> absentRasterBaseline;std::optional<SelectionMask> shapePaintMask,shapeExpansion;std::optional<MaskPreviewBaseline> mask;bool tilemap=false;tiles::Mode tilemapMode=tiles::Mode::Hybrid;std::vector<Pixel> tilemapBaseline;std::optional<timeline::Timeline> tilemapDisplay;std::vector<std::string> previewTileIds;std::unordered_map<std::string,std::vector<std::pair<std::size_t,std::size_t>>> tilemapReferences;std::vector<PixelRegion> tilemapRegions;PixelRegion tilemapRawRegion;std::optional<Point> sourceShapeSeed;};
  std::optional<GradientPreview> gradient_;std::uint64_t gradientRevision_=0;
  struct FilterPreview{std::uint64_t revision=0,contentRevision=0,generation=0;std::optional<timeline::Timeline> timeline;};
  std::vector<timeline::Pixel> layerDisplayColors_=defaultLayerDisplayColors();
  std::optional<FilterPreview> filterPreview_;std::uint64_t nextFilterGeneration_=0;

  bool commitSurfaceAdjustment(const std::u32string& label);
  inline static std::atomic<std::uint64_t> adjustmentSessionClock_{0};
  struct AdjustmentPreview {timeline::Timeline baseline,preview;std::vector<std::string> targets;std::optional<SelectionMask> selection;std::string layerId,frameId;std::uint64_t contentRevision;bool clipSelection=true;std::vector<std::string> targetFrames;std::vector<std::string> convolutionTargets;std::string maskContext;std::uint64_t session=++adjustmentSessionClock_;};
  std::optional<AdjustmentPreview> adjustment_;
  struct PaletteReplacementPreview {PaletteState baseline,preview;std::uint64_t contentRevision;std::optional<Pixel> restorePrimary;};
  std::optional<PaletteReplacementPreview> paletteReplacement_;
  bool active_ = false;
  Point last_{};
  Pixel color_ = 0;
};
int floorDivide(int coordinate, int positiveScale);
}


