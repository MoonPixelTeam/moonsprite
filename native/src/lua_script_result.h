#pragma once
#include "lua_script_invocation.h"
namespace moon::script {
struct LayerStructureUi {
 std::string activeLayer,activeFrame,frameAnchor;
 Document::TimelineSelection selection;
 std::vector<std::string> frames,groups,collapsed;
 std::optional<std::string> group;
 TilemapSelection tiles;
 std::vector<std::string> freeSelected;std::string freePrimary,freeAnchor,freeFrame,freeView;
};
LayerStructureUi captureLayerStructureUi(const Document&);
void restoreLayerStructureUi(Document&,const LayerStructureUi&);
bool planLayerStructure(const Document&,timeline::Timeline&,std::unordered_map<std::string,std::array<int,4>>&,LayerStructureUi&,const std::string& operation,const std::string& id,const std::optional<std::u32string>& name,const std::optional<double>& opacity);
struct RasterBatch {
 struct Change {std::size_t index=0;Pixel before=0,after=0;};
 bool operationsOnly=false; // Internal MSE adapter; wire raster writes are rejected before planning.
 SurfaceSnapshot before;
 std::optional<SurfaceSnapshot> after;
 std::optional<SurfaceSnapshot> historyBefore; // Legacy surface replacement records its validated wire baseline.
 std::vector<Change> changes;
 std::u32string label;
 std::optional<SliceState> slices;
 std::optional<std::optional<SelectionMask>> selection;
 std::optional<PaletteState> palette;
 std::vector<std::pair<std::string,std::optional<timeline::ColorOverlayStyle>>> styles;
 std::optional<std::vector<std::pair<std::string,int>>> durations;
 std::optional<std::vector<timeline::LoopSection>> loops;
 struct OwnerReplacement {std::string ownerId;timeline::Surface before,after;};
 std::vector<OwnerReplacement> synchronizedOwners;
 // Structural candidate is used for MSE layer batches. It includes
 // raster writes and sequential MSE effects, preflighted before installation.
 bool structureDocumentChanged=true;
 std::optional<LayerStructureUi> layerStructureUi;
 std::optional<timeline::State> layerUpdateTimeline;
 std::optional<std::unordered_map<std::string,std::array<int,4>>> layerUpdateGeometry;
};
struct CreatedLayer {
 std::string id;std::u32string name;
 int opacity=255;bool visible=true,locked=false;
 double frameNumber=1;
 std::optional<std::size_t> stackIndex;
 std::optional<std::string> parentGroupId;
 SurfaceSnapshot surface;
};
struct CreatedDocument {
 std::u32string name;int width=0,height=0;
 std::string colorMode;
 std::vector<CreatedLayer> layers;
};
// Builds a detached, dirty native document with no initial history. RGBA is
// admitted; indexed/grayscale document semantics need native color-mode state.
Document buildCreatedDocument(const CreatedDocument&);
// Validates every batch and created structure before the caller may apply any
// result. Returns the final raster baseline; does not execute MSE operations.
SurfaceSnapshot validateResult(const Target&,const std::string& resultJson);
struct PlaybackRequest {
 enum class Kind {SetPlaying,PlayLoop,LoopChanged,SetFrame};
 Kind kind=Kind::SetPlaying;bool playing=true;std::string loopId;
 std::optional<timeline::LoopSection> section;std::string firstFrameId;
};
// Host executes after batch commit; it must not throw, retain the Document
// reference, or replace/destroy it. SetFrame is executor-internal ordering.
using PlaybackHost=std::function<void(Document&,const PlaybackRequest&)>;
struct PanelRequest {
 std::string id;
 std::optional<bool> visible;
 std::optional<std::string> dock;
};
// Workspace changes do not enter document history. Called in operation order
// after the batch commit, before any created document adoption. The host must
// not replace/destroy the document or retain its reference.
using PanelHost=std::function<void(Document&,const PanelRequest&)>;
struct StyleClipboardHost {
 std::function<std::optional<timeline::ColorOverlayStyle>()> read;
 std::function<void(const timeline::ColorOverlayStyle&)> write;
 explicit operator bool()const{return bool(read)&&bool(write);}
};
// Enqueue-only status message delivery, deferred until the current UI pump ends.
using NotificationHost=std::function<void(const std::u32string&)>;
struct BrushRequest {enum class Kind {ImportImages,Remove,CreateFromSelection};Kind kind=Kind::ImportImages;std::string id;std::optional<timeline::Surface> source;std::optional<PatternBrush> brush;std::string error;};
// External library effects execute in MSE order after the batch raster commit. Project
// brush removal is non-history metadata, as in the legacy workspace.
using BrushHost=std::function<void(Document&,const BrushRequest&)>;
struct SaveRequest {bool saveAs=false;std::optional<std::string> optionsJson;};
// Runs in operation order and returns only after save/cancel/failure completes.
// Save failure is workspace status, as in legacy saveActive; do not replace d.
using SaveHost=std::function<void(Document&,const SaveRequest&)>;
// Export uses the complete legacy options object and never accepts a save point.
using ExportHost=std::function<void(Document&,const std::string& optionsJson)>;
// Preserve document/session state if an external brush host fails mid-batch.
std::function<void()> brushBatchRollback(Document&);
// Run ordered selection/brush effects inside the batch history boundary.
void orderedBrushBatch(Document&,const std::u32string&,const std::function<void()>&);
struct RasterSummary {std::size_t transactionCount=0,changedPixelCount=0;};
// Raster/layer stage of the workspace executor. Rejects unsupported workspace
// operations/created documents before the first edit; never silently drops them.
RasterSummary applyRasterResult(Document& activeDocument,Target&,const std::string& resultJson,bool selectCreatedPaletteColor=true,const PlaybackHost& playback={},const PanelHost& panels={},const StyleClipboardHost& styles={},const NotificationHost& notify={},const BrushHost& brushes={},const SaveHost& save={},const ExportHost& exportFile={});
struct WorkspaceSummary {std::size_t transactionCount=0,changedPixelCount=0;bool documentBoundary=false;};
// The workspace callback adopts each completed document in result order. It
// must preserve existing sessions; the last adopted document becomes active.
WorkspaceSummary applyWorkspaceResult(Document& activeDocument,Target&,const std::string& resultJson,const std::function<void(Document&&)>& addSession,bool selectCreatedPaletteColor=true,const PlaybackHost& playback={},const PanelHost& panels={},const StyleClipboardHost& styles={},const NotificationHost& notify={},const BrushHost& brushes={},const SaveHost& save={},const ExportHost& exportFile={});
struct RunSummary {
 std::string fileName,filePath;std::vector<std::string> output;
 std::size_t transactionCount=0,changedPixelCount=0;double elapsedMs=0;
};
struct ClientSession {std::string sessionId,fileName,filePath,dialogsJson;Target target;};
struct RunOutcome {RunSummary summary;std::optional<ClientSession> session;};
// Legacy outcomeFromResult plus run/dispatch failure cleanup. closeSession is
// an enqueue-only callback: UI callers must not wait for Runtime::close here.
// Dispatch callers supply their existing session ID as failureSessionId.
RunOutcome receiveWorkspaceResult(Document&,Target&,const std::string& resultJson,
 const std::function<void(Document&&)>& addSession,
 const std::function<void(const std::string&)>& closeSession,
 const std::string& failureSessionId={},bool selectCreatedPaletteColor=true,const PlaybackHost& playback={},const PanelHost& panels={},const StyleClipboardHost& styles={},const NotificationHost& notify={},const BrushHost& brushes={},const SaveHost& save={},const ExportHost& exportFile={});
}
