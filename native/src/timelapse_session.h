#pragma once
#include "timelapse_queue.h"
#include "timelapse_images.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <objbase.h>
namespace moon::timelapse {
inline std::string recordingUuid(){GUID guid{};if(FAILED(CoCreateGuid(&guid)))throw std::runtime_error("Cannot create recording identifier");wchar_t value[40];if(!StringFromGUID2(guid,value,40))throw std::runtime_error("Cannot format recording identifier");std::string out;for(const auto c:std::wstring(value))if(c!=L'{'&&c!=L'}')out.push_back(char(c));if(!safeId(out))throw std::runtime_error("Invalid generated recording identifier");return out;}
inline std::filesystem::path legacyLibraryRoot(){wchar_t path[32768]{};const DWORD n=GetEnvironmentVariableW(L"APPDATA",path,32768);if(!n||n>=32768)return {};return std::filesystem::path(path)/L"art.moonpx.moonsprite"/L"timelapse-v1";}
class Session {
 std::filesystem::path root_,legacy_;std::string store_;CaptureQueue queue_;SmartState smart_;std::uint64_t generation_=0,undoGeneration_=0,lastContent_=(std::numeric_limits<std::uint64_t>::max)();std::string lastFrame_;Mode mode_=Mode::Smart;bool enabled_=false,undo_=false;
 std::shared_ptr<const FrozenPixels> previousPixels_;int previousWidth_=0,previousHeight_=0;
 CaptureQueue::Valid valid(){return [this](const Prepared& p){return p.generation==generation_&&(!p.undoStep||p.undoGeneration==undoGeneration_);};}
 CaptureQueue::Commit commit(Document& d){return [this,&d](Frame f,Mode mode){try{append(d.mutableTimelapseSettings(),smart_,std::move(f),mode);}catch(const CapacityError& e){error=e.what();}d.markTimelapseModified();};}
struct EmbeddedResult {std::optional<Reference> local;std::string error;};
std::future<EmbeddedResult> embeddedTask_;
std::size_t embeddedIndex_=0,embeddedLength_=0,cursor_=0,observedSize_=(std::numeric_limits<std::size_t>::max)();
std::uint64_t embeddedGeneration_=0,cursorGeneration_=0;
std::string embeddedId_,cursorLastId_,embeddedError_;
const std::uint8_t* embeddedSource_=nullptr;
bool embeddedBlocked_=false,cursorComplete_=false;
void resetPersistence(){cursor_=0;cursorLastId_.clear();observedSize_=(std::numeric_limits<std::size_t>::max)();cursorGeneration_=generation_;cursorComplete_=false;embeddedBlocked_=false;embeddedError_.clear();}
void syncPersistenceCursor(const std::vector<Frame>& frames){
 if(cursorGeneration_!=generation_||cursor_>frames.size()||(cursor_&&frames[cursor_-1].id!=cursorLastId_)){cursor_=0;cursorLastId_.clear();cursorGeneration_=generation_;cursorComplete_=false;}
 if(observedSize_!=frames.size())cursorComplete_=false;
 observedSize_=frames.size();
}
void pollPersistence(Document& d){
 auto& frames=d.mutableTimelapseSettings().snapshots;
 const bool topologyChanged=observedSize_!=frames.size()||cursorGeneration_!=generation_||cursor_>frames.size()||(cursor_&&cursor_<=frames.size()&&frames[cursor_-1].id!=cursorLastId_);
 syncPersistenceCursor(frames);
 if(topologyChanged&&embeddedBlocked_&&!embeddedTask_.valid()&&!embeddedId_.empty()){
 const bool retained=embeddedGeneration_==generation_&&std::any_of(frames.begin(),frames.end(),[this](const auto& f){return f.id==embeddedId_&&f.data.data()==embeddedSource_&&f.data.size()==embeddedLength_;});
 if(!retained){embeddedBlocked_=false;embeddedError_.clear();embeddedId_.clear();embeddedSource_=nullptr;embeddedLength_=0;}
 }
 if(embeddedTask_.valid()){
  if(embeddedTask_.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return;
  auto result=embeddedTask_.get();
  if(embeddedGeneration_==generation_){
   auto position=embeddedIndex_;
   if(position>=frames.size()||frames[position].id!=embeddedId_){const auto found=std::find_if(frames.begin(),frames.end(),[this](const auto& f){return f.id==embeddedId_;});position=static_cast<std::size_t>(found-frames.begin());}
   if(position<frames.size()){
    auto& frame=frames[position];
    if(frame.data.data()==embeddedSource_&&frame.data.size()==embeddedLength_){
     if(!result.error.empty()){embeddedBlocked_=true;embeddedError_="Cannot write recording library "+root_.u8string()+": "+result.error;return;}
     if(!result.local||!validReference(*result.local)){embeddedBlocked_=true;embeddedError_="Invalid recording storage acknowledgement";return;}
     frame.local=std::move(result.local);Bytes{}.swap(frame.data);d.markTimelapseModified();
    }
   }
  }
  embeddedSource_=nullptr;embeddedLength_=0;embeddedId_.clear();
 }
 if(embeddedBlocked_||cursorComplete_)return;
 std::size_t checked=0;
 while(cursor_<frames.size()&&checked++<256){
  auto& frame=frames[cursor_];
  if(!frame.data.empty()){
   embeddedIndex_=cursor_;embeddedGeneration_=generation_;embeddedId_=frame.id;
   embeddedSource_=frame.data.data();embeddedLength_=frame.data.size();
   const auto root=root_;const auto store=store_;auto payload=frame.data;
   embeddedTask_=std::async(std::launch::async,[root,store,payload=std::move(payload)]()mutable{
    EmbeddedResult result;try{result.local=appendLibraryFrame(root,store,payload);}catch(const std::exception& e){result.error=e.what();}catch(...){result.error="Unknown embedded recording persistence failure";}return result;
   });
   return;
  }
  cursorLastId_=frame.id;++cursor_;
 }
 cursorComplete_=cursor_==frames.size();
}

public:
 std::string error;bool playback=false;
 Session(const Settings& s,std::filesystem::path root,std::filesystem::path legacy={}):root_(std::move(root)),legacy_(std::move(legacy)),store_(recordingUuid()),queue_(root_,store_),mode_(s.mode),enabled_(s.enabled),undo_(s.recordUndoSteps){}
 std::size_t pendingCount()const{const auto active=queue_.pendingCount()+(embeddedTask_.valid()?1:0);return active?active:(!cursorComplete_?1:0);}
 Bytes read(const Frame& f)const{if(!f.data.empty())return f.data;if(!f.local||!validReference(*f.local))throw std::runtime_error("Recording unavailable on this computer; reopen a portable project from the original computer");return legacy_.empty()?readLibraryFrame(root_,*f.local):readLibraryFrameWithLegacy(root_,legacy_,*f.local);}
 Reader reader()const{const auto root=root_,legacy=legacy_;return [root,legacy](const Frame& f){if(!f.data.empty())return f.data;if(!f.local||!validReference(*f.local))throw std::runtime_error("Recording unavailable on this computer; use a portable project from the original computer");return legacy.empty()?readLibraryFrame(root,*f.local):readLibraryFrameWithLegacy(root,legacy,*f.local);};}
 void settingsChanged(Document& d){auto& s=d.mutableTimelapseSettings();normalize(s);if(mode_!=s.mode||!s.enabled)smart_.reset();else if(undo_!=s.recordUndoSteps)++undoGeneration_;mode_=s.mode;enabled_=s.enabled;undo_=s.recordUndoSteps;d.markTimelapseModified();}
 void restoreSettings(const Settings& s){++generation_;++undoGeneration_;resetPersistence();smart_.reset();previousPixels_.reset();lastContent_=(std::numeric_limits<std::uint64_t>::max)();lastFrame_.clear();mode_=s.mode;enabled_=s.enabled;undo_=s.recordUndoSteps;error.clear();}
 void clear(Document& d){++generation_;++undoGeneration_;resetPersistence();smart_.reset();d.mutableTimelapseSettings().snapshots.clear();lastContent_=(std::numeric_limits<std::uint64_t>::max)();lastFrame_.clear();previousPixels_.reset();error.clear();d.markTimelapseModified();}
 void capture(Document& d,bool undoStep)noexcept{try{auto& s=d.mutableTimelapseSettings();if(!s.enabled||playback||(undoStep&&!s.recordUndoSteps))return;const auto revision=d.contentRevision();if(lastContent_==revision&&lastFrame_==d.frame().id)return;Prepared prepared;prepared.mode=s.mode;prepared.undoStep=undoStep;prepared.generation=generation_;prepared.undoGeneration=undoGeneration_;prepared.capturedAt=double(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count());const bool sameSource=previousPixels_&&previousWidth_==d.width()&&previousHeight_==d.height()&&lastFrame_==d.frame().id;const auto dirty=sameSource?d.recordingDirtySince(lastContent_):std::optional<PixelRegion>{};prepared.changeScore=!dirty?1:(std::max)(.01,(std::min)(1.,double(dirty->w)*dirty->h/(double(d.width())*d.height())));PixelPreparation prepare(d,s.quality,sameSource?previousPixels_:nullptr,dirty,true);while(!prepare.advance(d,std::chrono::steady_clock::now()+std::chrono::milliseconds(4)))if(!prepare.matches(d))throw std::runtime_error("Document changed during committed recording capture");prepared.pixels=prepare.finish();const auto frozen=prepared.pixels;if(!queue_.enqueue(std::move(prepared),"timelapse-"+recordingUuid())){s.enabled=false;error=queue_.error;d.markTimelapseModified();return;}lastContent_=revision;lastFrame_=d.frame().id;previousPixels_=frozen;previousWidth_=d.width();previousHeight_=d.height();d.acknowledgeRecordingCapture();}catch(const std::exception& e){error=e.what();d.mutableTimelapseSettings().enabled=false;d.markTimelapseModified();}catch(...){error="Recording capture failed";d.mutableTimelapseSettings().enabled=false;d.markTimelapseModified();}}
 void poll(Document& d){
 try{queue_.poll(valid(),commit(d));pollPersistence(d);}
 catch(const std::exception& e){embeddedBlocked_=true;embeddedError_=e.what();}
 catch(...){embeddedBlocked_=true;embeddedError_="Recording persistence scheduling failed";}
 if(!queue_.error.empty())error=queue_.error;
 else if(!embeddedError_.empty())error=embeddedError_;
 }
 void beginFlush(Document& d){queue_.retry();embeddedBlocked_=false;embeddedError_.clear();error.clear();poll(d);}
 bool flushReady(Document& d){poll(d);if(queue_.failed())throw std::runtime_error(queue_.error);if(embeddedBlocked_)throw std::runtime_error(embeddedError_);return queue_.empty()&&!embeddedTask_.valid()&&cursorComplete_;}
 void flush(Document& d){beginFlush(d);while(!flushReady(d)){if(embeddedTask_.valid())embeddedTask_.wait_for(std::chrono::milliseconds(1));else Sleep(1);}}
 Settings portable(Document& d){flush(d);auto settings=d.timelapseSettings();for(auto& f:settings.snapshots){f.data=read(f);f.local.reset();}return settings;}
};
inline std::shared_ptr<Session> ensureRecordingSession(Document& d,std::filesystem::path root=executableLibraryRoot(),std::filesystem::path legacy={}){auto session=d.recordingSession();if(!session){session=std::make_shared<Session>(d.timelapseSettings(),std::move(root),std::move(legacy));d.setRecordingSession(session,[session](Document& document,bool undo){session->capture(document,undo);});}return session;}
}
