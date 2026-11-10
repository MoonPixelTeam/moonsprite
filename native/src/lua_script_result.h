#pragma once
#include "lua_script_invocation.h"
namespace moon::script {
struct RasterBatch {
 struct Change {std::size_t index=0;Pixel before=0,after=0;};
 SurfaceSnapshot before;
 std::optional<SurfaceSnapshot> after;
 std::vector<Change> changes;
 std::u32string label;
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
struct RasterSummary {std::size_t transactionCount=0,changedPixelCount=0;};
// Raster/layer stage of the workspace executor. Rejects unsupported workspace
// operations/created documents before the first edit; never silently drops them.
RasterSummary applyRasterResult(Document& activeDocument,Target&,const std::string& resultJson);
struct WorkspaceSummary {std::size_t transactionCount=0,changedPixelCount=0;bool documentBoundary=false;};
// The workspace callback adopts each completed document in result order. It
// must preserve existing sessions; the last adopted document becomes active.
WorkspaceSummary applyWorkspaceResult(Document& activeDocument,Target&,const std::string& resultJson,const std::function<void(Document&&)>& addSession);
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
 const std::string& failureSessionId={});
}
