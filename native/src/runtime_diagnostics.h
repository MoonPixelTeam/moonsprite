#pragma once
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <filesystem>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <variant>
#include <vector>
namespace moon::diagnostics {
using Scalar=std::variant<std::nullptr_t,bool,std::int64_t,double,std::string>;
using Detail=std::map<std::string,Scalar>;
struct Event {std::string json;bool important=false;};
class Recorder final {
 std::filesystem::path directory_,fallbackPath_,current_;std::uint64_t currentBytes_=0,fileSequence_=0,sequence_=0,generation_=0,dropped_=0;std::string session_,error_;int mode_=2;bool stopping_=false,writing_=false,urgent_=false,flushRequested_=false;mutable std::mutex mutex_;std::condition_variable wake_,settled_;std::deque<Event> recent_,pending_;std::deque<std::string> fallback_;std::thread worker_;std::chrono::steady_clock::time_point origin_=std::chrono::steady_clock::now();
 void sampleResources()noexcept;std::chrono::steady_clock::time_point lastResource_{};bool resourcesFailed_=false,fallbackReadable_=true;std::uint64_t lastCpu_=0,lastCpuWall_=0;
 void work()noexcept;void appendBatch(const std::vector<Event>&);void nextFile();void retainOwnLogs();void persistFallback(const std::vector<Event>&,const std::string&)noexcept;
public:
 explicit Recorder(std::filesystem::path directory,std::filesystem::path fallback,int mode=2);~Recorder();Recorder(const Recorder&)=delete;Recorder& operator=(const Recorder&)=delete;
 void mode(int value);int mode()const;void record(const std::string& kind,const std::string& name,Detail detail={})noexcept;
 bool flush(std::chrono::milliseconds limit=std::chrono::seconds(5))noexcept;
 std::string snapshotJson(bool includeFallback=false)const;std::string lastError()const;bool hasFallback()const;std::size_t recentSize()const;std::size_t pendingSize()const;
 const std::filesystem::path& directory()const{return directory_;}
 void exportSnapshot(const std::filesystem::path&,bool includeFallback=false)const;
};
std::shared_ptr<Recorder> global();void installGlobal(const std::shared_ptr<Recorder>&);void recordGlobal(const std::string&,const std::string&,Detail={})noexcept;
std::string jsonString(const std::string&);bool ownLogName(const std::string&);
}
