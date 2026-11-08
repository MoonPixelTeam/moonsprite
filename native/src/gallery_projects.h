#pragma once
// Native filesystem adapter of platform_gallery.rs and home-history.ts.
#include "recent_projects.h"
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <functional>
#include <optional>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <memory>
#include <stdexcept>
namespace moon::gallery {
using Path=std::filesystem::path;
using Writer=std::function<void(const Path&,const std::vector<std::uint8_t>&)>;
inline const Path exampleName=std::filesystem::u8path(u8"示例.moonsprite");
inline std::string read(const Path& path){std::ifstream in(path,std::ios::binary);if(!in)throw std::runtime_error("Cannot read gallery resource: "+path.u8string());return {std::istreambuf_iterator<char>(in),{}};}
inline bool projectFile(const Path& path){auto ext=path.extension().u8string();for(auto& c:ext)c=char(std::tolower(static_cast<unsigned char>(c)));return ext==".moonsprite";}
inline void sort(std::vector<recent::Project>& projects){std::stable_sort(projects.begin(),projects.end(),[](const auto& a,const auto& b){return a.lastOpened!=b.lastOpened?a.lastOpened>b.lastOpened:Path(std::filesystem::u8path(a.path)).stem().u8string()<Path(std::filesystem::u8path(b.path)).stem().u8string();});std::stable_partition(projects.begin(),projects.end(),[](const auto& p){return p.pinned;});}
inline std::vector<recent::Project> list(const Path& directory,const std::vector<std::string>& pins={},const std::function<bool()>& canceled={}){
 std::vector<recent::Project> result;std::set<std::string> pinned(pins.begin(),pins.end());
 for(const auto& entry:std::filesystem::directory_iterator(directory)){
  if(canceled&&canceled())return {};const auto path=entry.path();std::error_code fileError;if(!std::filesystem::is_regular_file(path,fileError)||!projectFile(path))continue;
  HANDLE file=CreateFileW(path.c_str(),FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,0,nullptr);if(file==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot read gallery project metadata: "+path.u8string());FILETIME modified{};const bool valid=GetFileTime(file,nullptr,nullptr,&modified)!=0;CloseHandle(file);if(!valid)throw std::runtime_error("Cannot read gallery project metadata: "+path.u8string());
  const std::uint64_t ticks=(std::uint64_t(modified.dwHighDateTime)<<32)|modified.dwLowDateTime;constexpr std::uint64_t epoch=116444736000000000ULL;
  const auto name=path.u8string();result.push_back({name,ticks<epoch?0:std::int64_t((ticks-epoch)/10000),pinned.count(name)!=0});
 }sort(result);return result;
}
inline std::optional<Path> ensureExample(const Path& directory,const Path& marker,const Path& resource,const Writer& write){
 std::string state;try{state=read(marker);}catch(...){}const auto start=state.find_first_not_of(" \t\r\n"),end=state.find_last_not_of(" \t\r\n");state=start==std::string::npos?std::string{}:state.substr(start,end-start+1);
 if(state=="deleted")return {};const auto target=directory/exampleName;std::filesystem::create_directories(directory);
 if(state=="3"&&std::filesystem::is_regular_file(target))return target;
 const auto data=read(resource);write(target,{data.begin(),data.end()});write(marker,{'3'});return target;
}
inline void remove(const Path& directory,const std::string& filename,const Path& marker,const Writer& write){
 const auto name=std::filesystem::u8path(filename);if(filename.empty()||name.filename()!=name||name.has_root_path()||filename.find_first_of("/\\:")!=std::string::npos||!projectFile(name))throw std::invalid_argument("Invalid gallery project filename");
 const auto path=directory/name;if(!std::filesystem::is_regular_file(path))throw std::runtime_error("Gallery project file does not exist");
 if(!DeleteFileW(path.c_str()))throw std::runtime_error("Cannot delete gallery project; Win32="+std::to_string(GetLastError()));
 if(name==exampleName)try{write(marker,{'d','e','l','e','t','e','d'});}catch(...){} // Legacy marker update is best effort after successful deletion.
}
inline std::string encodePins(const std::vector<std::string>& pins){std::ostringstream out;out<<"moonsprite-gallery-pins-v1\n";for(const auto& pin:pins)out<<std::quoted(pin)<<'\n';return out.str();}
inline std::vector<std::string> decodePins(const std::string& text){std::istringstream in(text);std::string tag,path;std::getline(in,tag);if(tag!="moonsprite-gallery-pins-v1")return {};std::vector<std::string> pins;std::set<std::string> seen;while(in>>std::quoted(path))if(seen.insert(path).second)pins.push_back(path);return pins;}
// One coalescing scan worker; canceled generations never touch UI state.
// Detached lifetime owns only immutable filesystem inputs and shared state.
class ScanQueue {
public:
 struct Result{std::uint64_t generation=0;std::vector<recent::Project> projects;std::string error;};
 using Work=std::function<std::vector<recent::Project>(const std::function<bool()>&)>;
private:
 struct State{std::mutex mutex;std::condition_variable ready;bool stopped=false;std::uint64_t generation=0;Work pending;std::optional<Result> result;};std::shared_ptr<State> state_=std::make_shared<State>();
public:
 ScanQueue(){std::thread([state=state_]{for(;;){Work job;std::uint64_t generation;{std::unique_lock<std::mutex> lock(state->mutex);state->ready.wait(lock,[&]{return state->stopped||bool(state->pending);});if(state->stopped)return;job=std::move(state->pending);state->pending={};generation=state->generation;}Result result;result.generation=generation;auto canceled=[state,generation]{std::lock_guard<std::mutex> lock(state->mutex);return state->stopped||generation!=state->generation;};try{result.projects=job(canceled);}catch(const std::exception& e){result.error=e.what();}catch(...){result.error="Cannot read gallery";}{std::lock_guard<std::mutex> lock(state->mutex);if(!state->stopped&&generation==state->generation)state->result=std::move(result);}}}).detach();}
 ~ScanQueue(){std::lock_guard<std::mutex> lock(state_->mutex);state_->stopped=true;state_->pending={};state_->ready.notify_all();}
 ScanQueue(const ScanQueue&)=delete;ScanQueue& operator=(const ScanQueue&)=delete;
 std::uint64_t request(Work work){std::lock_guard<std::mutex> lock(state_->mutex);++state_->generation;state_->pending=std::move(work);state_->result.reset();state_->ready.notify_one();return state_->generation;}
 void cancel(){std::lock_guard<std::mutex> lock(state_->mutex);++state_->generation;state_->pending={};state_->result.reset();}
 std::optional<Result> take(){std::lock_guard<std::mutex> lock(state_->mutex);auto result=std::move(state_->result);state_->result.reset();return result;}
};
}
