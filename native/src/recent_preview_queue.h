#pragma once
#include "recent_project_preview.h"
#include <algorithm>
#include <condition_variable>
#include <deque>
#include <list>
#include <mutex>
#include <thread>
namespace moon::recent {
inline std::string previewKey(const Project& record){return record.path+std::string(1,'\0')+std::to_string(record.lastOpened);}
class PreviewQueue {
public:
 using Value=std::shared_ptr<const Preview>;
 using Loader=std::function<Preview(const Project&,const std::filesystem::path&,const std::function<bool()>&)>;
 struct Result {std::string key;Value value;};
private:
 struct Job {Project record;std::filesystem::path directory;std::uint64_t generation;};
 struct State {std::mutex mutex;std::condition_variable ready;bool stopping=false;std::uint64_t generation=0;std::deque<Job> jobs;std::vector<Result> results;std::vector<std::string> keys;std::filesystem::path directory;std::list<std::pair<std::string,Value>> cache;std::size_t bytes=0;int running=0;Loader loader;};
 std::shared_ptr<State> state_;
 static Value cached(State& state,const std::string& key){for(auto i=state.cache.begin();i!=state.cache.end();++i)if(i->first==key){auto value=i->second;state.cache.splice(state.cache.end(),state.cache,i);return value;}return {};}
 static void store(State& state,const std::string& key,Value value){if(!value->error.empty())return;for(auto i=state.cache.begin();i!=state.cache.end();++i)if(i->first==key){state.bytes-=i->second->png.size();state.cache.erase(i);break;}state.bytes+=value->png.size();state.cache.push_back({key,std::move(value)});while(state.cache.size()>24||state.bytes>32u*1024u*1024u){state.bytes-=state.cache.front().second->png.size();state.cache.pop_front();}}
 static void work(std::shared_ptr<State> state){for(;;){Job job;{std::unique_lock<std::mutex> lock(state->mutex);state->ready.wait(lock,[&]{return state->stopping||!state->jobs.empty();});if(state->stopping)return;job=std::move(state->jobs.front());state->jobs.pop_front();++state->running;}const auto key=previewKey(job.record);auto canceled=[state,generation=job.generation]{std::lock_guard<std::mutex> lock(state->mutex);return state->stopping||state->generation!=generation;};Preview preview;try{preview=state->loader(job.record,job.directory,canceled);}catch(const std::exception& error){preview.error=error.what();}catch(...){preview.error="Cannot read project preview";}auto value=std::make_shared<const Preview>(std::move(preview));{std::lock_guard<std::mutex> lock(state->mutex);--state->running;if(!state->stopping&&state->generation==job.generation){store(*state,key,value);state->results.push_back({key,std::move(value)});}}}}
public:
 explicit PreviewQueue(Loader loader=readPreview):state_(std::make_shared<State>()){state_->loader=std::move(loader);for(int i=0;i<3;++i)std::thread([state=state_]{work(std::move(state));}).detach();}
 ~PreviewQueue(){std::lock_guard<std::mutex> lock(state_->mutex);state_->stopping=true;++state_->generation;state_->jobs.clear();state_->ready.notify_all();}
 PreviewQueue(const PreviewQueue&)=delete;PreviewQueue& operator=(const PreviewQueue&)=delete;
 bool request(const std::vector<Project>& records,const std::filesystem::path& directory,bool force=false){std::vector<std::string> keys;for(const auto& record:records)keys.push_back(previewKey(record));std::sort(keys.begin(),keys.end());std::lock_guard<std::mutex> lock(state_->mutex);if(!force&&keys==state_->keys&&directory==state_->directory)return false;++state_->generation;state_->keys=std::move(keys);state_->directory=directory;state_->jobs.clear();state_->results.clear();for(const auto& record:records){auto key=previewKey(record);auto value=cached(*state_,key);if(value)state_->results.push_back({key,std::move(value)});else state_->jobs.push_back({record,directory,state_->generation});}state_->ready.notify_all();return true;}
 void cancel(){std::lock_guard<std::mutex> lock(state_->mutex);++state_->generation;state_->jobs.clear();state_->results.clear();state_->keys.clear();state_->directory.clear();}
 std::vector<Result> take(){std::lock_guard<std::mutex> lock(state_->mutex);std::vector<Result> result;result.swap(state_->results);return result;}
 std::size_t cacheCount()const{std::lock_guard<std::mutex> lock(state_->mutex);return state_->cache.size();}
 std::size_t cacheBytes()const{std::lock_guard<std::mutex> lock(state_->mutex);return state_->bytes;}
};
}
