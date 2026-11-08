#pragma once
#include "document.h"
#include "raster_snapshot.h"
#include <atomic>
#include <functional>
namespace moon {
// Reuses SheetImportTask's bounded capture and detached-worker lifecycle.
class ImageResizeTask {
public:
 enum class Phase {Capturing,Working,Ready,Failed,Cancelled,Applied};
 using Executor=std::function<void(std::function<void()>)>;
private:
 struct Work {std::atomic<bool> cancelled{false},ready{false};std::unique_ptr<Document> result;std::string error;};
 std::uint64_t identity_,revision_,content_;std::string layer_,frame_;int sw_,sh_,width_,height_;ImageInterpolation method_;
 std::optional<SelectionMask> selection_;const unsigned char* selectionData_=nullptr;std::size_t selectionSize_=0,selectionCopied_=0;std::unique_ptr<RasterSnapshot> capture_;std::shared_ptr<Work> work_;Executor executor_;Phase phase_=Phase::Capturing;std::string error_;
public:
 ImageResizeTask(const Document&,int,int,ImageInterpolation,Executor={});
 ~ImageResizeTask();
 Phase phase()const{return phase_;}bool busy()const{return phase_==Phase::Capturing||phase_==Phase::Working;}
 const std::string& error()const{return error_;}
 bool matches(const Document&)const;void tick(const Document&);void cancel();bool commit(Document&);
};
}
