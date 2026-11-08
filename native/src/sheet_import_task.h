#pragma once
#include "sprite_sheet_import.h"
#include "raster_snapshot.h"
#include <atomic>
#include <functional>
namespace moon {
// Capture on bounded UI ticks, compute on detached immutable storage, then
// install one guarded structural transaction. Destruction never joins workers.
class SheetImportTask {
public:
 enum class Phase {Capturing,Working,Ready,Failed,Cancelled,Applied};
 using Executor=std::function<void(std::function<void()>)>;
private:
 struct Work {std::atomic<bool> cancelled{false},ready{false};std::atomic<std::size_t> frames{0};std::optional<timeline::State> before,after;std::string error;};
 SheetImportOptions options_;std::uint64_t identity_,content_,revision_;std::string layer_,frame_;int width_,height_;std::size_t total_=0;
 std::unique_ptr<RasterSnapshot> capture_;std::shared_ptr<Work> work_;Executor executor_;Phase phase_=Phase::Capturing;std::string error_;
public:
 SheetImportTask(const Document&,SheetImportOptions,Executor={});
 ~SheetImportTask();
 SheetImportTask(const SheetImportTask&)=delete;SheetImportTask& operator=(const SheetImportTask&)=delete;
 Phase phase()const{return phase_;}bool busy()const{return phase_==Phase::Capturing||phase_==Phase::Working;}
 const std::string& error()const{return error_;}std::size_t completedFrames()const{return work_?work_->frames.load():0;}std::size_t totalFrames()const{return total_;}
 bool matches(const Document&)const;
 void tick(const Document&);
 void cancel();
 bool commit(Document&,std::optional<TransformPoint> pivot={});
 // Shared by synchronous core callers; the UI only uses guarded commit().
 static bool install(Document&,const SheetImportOptions&,timeline::State before,timeline::State after,std::optional<TransformPoint>);
};
}
