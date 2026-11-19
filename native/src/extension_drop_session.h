#pragma once
#include "extension_file_drop.h"
#include "extension_runtime.h"
#include "extension_form_files.h"
namespace moon::extension {
// The legacy route awaits each read, then revalidates registration identity.
// Reuse the existing asynchronous file worker and keep UI continuations queued.
class DropSession final {
 struct Batch{std::vector<std::string> paths,remaining;std::size_t next=0;std::function<void(std::vector<std::string>)> complete;};
 struct Reading{FileDropRouter::Pending owner;FormFileReadTask task;std::optional<FormState::File> file;};
 FileDropRouter& drops_;RuntimeRegistry& registry_;std::function<void(const std::string&)> report_;
 std::deque<Batch> batches_;std::optional<Reading> reading_;bool pumping_=false;
public:
 using Start=std::function<FormFileReadTask(const std::string&)>;
 static FormFileReadTask read(const std::string& path){return startFormFileRead({std::filesystem::u8path(path)},[](const auto& paths,const auto& cancelled){
  std::ifstream input(paths.at(0),std::ios::binary);if(!input)throw std::runtime_error("Cannot read extension import file");FormState::File file;char block[65536];
  while(input){if(cancelled->load())throw std::runtime_error("Extension import cancelled");input.read(block,sizeof(block));const auto count=std::size_t(input.gcount());if(count>FileDropRouter::maxBytes-file.bytes.size())throw std::length_error("Extension import file exceeds 12 MiB");file.bytes.insert(file.bytes.end(),block,block+count);}if(input.bad())throw std::runtime_error("Cannot finish reading extension import file");return std::vector<FormState::File>{std::move(file)};
 });}
private:Start start_;std::function<bool()> ready_;
public:
 DropSession(FileDropRouter& drops,RuntimeRegistry& registry,std::function<void(const std::string&)> report,Start start=read,std::function<bool()> ready={}):drops_(drops),registry_(registry),report_(std::move(report)),start_(std::move(start)),ready_(std::move(ready)){}
 ~DropSession(){if(reading_)reading_->task.cancel();}
 void route(std::vector<std::string> paths,std::function<void(std::vector<std::string>)> complete){batches_.push_back({std::move(paths),{},0,std::move(complete)});}
 bool pending()const{return !batches_.empty();}
 void pump(std::chrono::steady_clock::time_point deadline){
  if(pumping_)return;pumping_=true;struct Guard{bool& value;~Guard(){value=false;}}guard{pumping_};
  while(!batches_.empty()&&std::chrono::steady_clock::now()<deadline){
   if(reading_){
    if(!reading_->file){if(reading_->task.result.wait_for(std::chrono::seconds(0))!=std::future_status::ready)return;try{auto files=reading_->task.result.get();if(files.size()!=1)throw std::runtime_error("Invalid extension file read result");reading_->file=std::move(files[0]);}catch(const std::exception& error){reading_.reset();if(report_)report_(error.what());continue;}catch(const winrt::hresult_error& error){reading_.reset();if(report_)report_(winrt::to_string(error.message()));continue;}}
    // Pause completed reads while an earlier binary envelope is being built.
    // Legal bursts wait instead of failing an artificial native queue limit.
    if(ready_&&!ready_())return;auto work=std::move(*reading_);reading_.reset();try{drops_.complete(work.owner,work.file->bytes,[this](const auto& id,const auto& name,const auto& bytes){return registry_.filesDropped(id,name,bytes);});}catch(const std::exception& error){if(report_)report_(error.what());}catch(const winrt::hresult_error& error){if(report_)report_(winrt::to_string(error.message()));}continue;
   }
   auto& batch=batches_.front();if(batch.next==batch.paths.size()){auto done=std::move(batch);batches_.pop_front();if(done.complete)done.complete(std::move(done.remaining));continue;}
   auto path=std::move(batch.paths[batch.next++]);if(!drops_.accepts(path)){batch.remaining.push_back(std::move(path));continue;}
   auto owner=drops_.begin(path);try{reading_.emplace(Reading{std::move(owner),start_(path)});}catch(const std::exception& error){if(report_)report_(error.what());}
  }
 }
};
}
