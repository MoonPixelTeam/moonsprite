#pragma once
#include "document.h"
#include "raster_snapshot.h"
#include <chrono>
#include <memory>
namespace moon::script {
// lua-script-service.ts buildInvocation/findActiveTargetSession. Native surfaces
// are packed RGBA; indexed context and MSE workspace capture remain separate.
struct SurfaceSnapshot {
 int width=0,height=0,x=0,y=0;
 std::shared_ptr<const std::vector<Pixel>> pixels;
 bool matches(const timeline::Surface&)const;
};
struct Target {
 std::uint64_t identity=0,revision=0;
 std::string documentId,layerId,frameId;
 SurfaceSnapshot expected;
 bool previewGuard=false,expectedFloating=false;
 std::uint64_t overlayRevision=0,contentMutationRevision=0;
 std::optional<SelectionMask> expectedSelection;
 void capturePreview(const Document&);
 // The caller passes the currently active document, never a background tab.
 // Dialog rebase checks identity/slot eligibility without the old revision.
 bool matches(const Document& activeDocument,bool requireExpected=true,bool rasterOnly=true)const;
};
struct Invocation {
 struct Cel {std::string id,frameId;std::size_t frameNumber=1;SurfaceSnapshot surface;};
 Target target;
 std::u32string documentName,layerName;
 std::filesystem::path filePath;
 int width=0,height=0,opacity=255;
 bool visible=true,locked=false;
 std::optional<std::string> groupId;
 std::size_t stackIndex=1,frameNumber=1;
 Pixel foreground=0,background=0;
 std::optional<SelectionMask> selection;
 std::vector<Cel> cels;
 // Supplied by the workspace adapter, not fabricated as an empty MSE model.
 std::string mseSnapshotJson;
 // Run on the executor worker; no per-pixel WinRT objects on the UI thread.
 std::string contextJson()const;
};
class InvocationCapture {
 struct Source {
  std::string owner;int width=0,height=0,x=0,y=0;
  const void* storage=nullptr;std::uint64_t revision=0;
  std::shared_ptr<std::vector<Pixel>> pixels;
 };
 Invocation invocation_;
 std::vector<Source> sources_;
 std::size_t source_=0,offset_=0,copied_=0;
 bool taken_=false;
 bool unchanged(const Document&)const;
public:
 static constexpr std::size_t maxImagePixels=4194304,maxCelPixels=maxImagePixels*3;
 // Metadata/budget planning only. No raster pixels are copied here.
 // Modeless callbacks may rebase a pending floating preview; a fresh run may not.
 InvocationCapture(const Document&,std::string mseSnapshotJson,std::optional<std::filesystem::path> savePath={},bool allowFloating=false);
 bool advance(const Document&,std::chrono::steady_clock::time_point deadline,std::size_t maxPixels=RasterSnapshot::tickPixels);
 std::size_t copiedPixels()const{return copied_;}
 Invocation take();
};
}
