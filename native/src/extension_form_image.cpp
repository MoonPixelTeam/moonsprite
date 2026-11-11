#include "extension_form_image.h"
#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Storage.Streams.h>
#include "include/codec/SkPngDecoder.h"
#include "include/core/SkData.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <deque>
#include <functional>
namespace moon::extension {
// Detached workers can outlive windows and static teardown.
namespace {struct ImageMemoryState{std::mutex mutex;std::condition_variable changed;std::size_t bytes=0;};ImageMemoryState& imageMemory(){static auto* state=new ImageMemoryState;return *state;}}
FormImageMemory::~FormImageMemory(){shrink(0);}
void FormImageMemory::shrink(std::size_t bytes){std::lock_guard<std::mutex> lock(imageMemory().mutex);if(bytes>bytes_)throw std::logic_error("Image memory lease cannot grow");imageMemory().bytes-=bytes_-bytes;bytes_=bytes;imageMemory().changed.notify_all();}
std::size_t formImageMemoryUsed(){std::lock_guard<std::mutex> lock(imageMemory().mutex);return imageMemory().bytes;}
std::shared_ptr<FormImageMemory> reserveFormImageMemory(std::size_t bytes,const std::shared_ptr<std::atomic<bool>>& cancelled){
 if(bytes>formImageMemoryLimit)throw std::length_error("Image exceeds global memory budget");
 std::unique_lock<std::mutex> lock(imageMemory().mutex);
 while(bytes>formImageMemoryLimit-imageMemory().bytes){if(cancelled&&cancelled->load())throw std::runtime_error("Image decode cancelled");imageMemory().changed.wait_for(lock,std::chrono::milliseconds(20));}
 if(cancelled&&cancelled->load())throw std::runtime_error("Image decode cancelled");
 auto lease=std::make_shared<FormImageMemory>(bytes);imageMemory().bytes+=bytes;return lease;
}
double formImageExtent(const winrt::Windows::Data::Json::JsonObject& node,const wchar_t* key){using namespace winrt::Windows::Data::Json;if(!node.HasKey(key)||node.GetNamedValue(key).ValueType()!=JsonValueType::Number)return 48;const auto n=node.GetNamedNumber(key);return std::isfinite(n)?std::clamp(n,16.,512.):48;}
static FormImage decode(const std::wstring& source,const std::shared_ptr<std::atomic<bool>>& cancelled){
 auto check=[&]{if(cancelled&&cancelled->load())throw std::runtime_error("Image decode cancelled");};check();
 const std::wstring prefix=L"data:image/png;base64,";if(source.compare(0,prefix.size(),prefix)!=0)throw std::invalid_argument("扩展表单仅支持 PNG data URL。");
 // Native working-memory admission; no disk files or network reads for previews.
 constexpr std::size_t encodedLimit=32u*1024*1024,pixelLimit=16u*1024*1024;
 if(source.size()-prefix.size()>encodedLimit)throw std::length_error("扩展表单图片超过原生内存预算。");
 // Reserve worst-case source/base64/codec copies and both CPU/upload pixel buffers
 // together before decoding. Concurrent jobs never hold a partial reservation.
 auto memory=reserveFormImageMemory(source.size()*8ull+pixelLimit*8ull,cancelled);
 const auto buffer=winrt::Windows::Security::Cryptography::CryptographicBuffer::DecodeFromBase64String(source.substr(prefix.size()));
 check();winrt::com_array<std::uint8_t> bytes;winrt::Windows::Security::Cryptography::CryptographicBuffer::CopyToByteArray(buffer,bytes);
 auto data=SkData::MakeWithCopy(bytes.data(),bytes.size());SkCodec::Result status;auto codec=SkPngDecoder::Decode(std::move(data),&status);if(!codec)throw std::invalid_argument("扩展表单 PNG 图片无效。");const auto size=codec->dimensions();if(size.width()<=0||size.height()<=0||std::uint64_t(size.width())*size.height()>pixelLimit)throw std::length_error("扩展表单图片超过原生像素预算。");
 check();FormImage image;image.width=size.width();image.height=size.height();image.pixels.resize(std::size_t(image.width)*image.height);const auto info=SkImageInfo::Make(image.width,image.height,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,nullptr);if(codec->getPixels(info,image.pixels.data(),std::size_t(image.width)*4)!=SkCodec::kSuccess)throw std::invalid_argument("扩展表单 PNG 像素无效。");check();image.memory=std::move(memory);return image;
}
FormImage decodeFormImage(const std::wstring& source){return decode(source,{});}
namespace {
// The process owns two workers. No worker or queued job contains UI pointers.
// Leaked process-lifetime state avoids joining a decoder from window teardown.
struct ImageQueue {
 std::mutex mutex;std::condition_variable ready;struct Job{std::shared_ptr<std::atomic<bool>> token;std::function<void()> run,reject;};std::deque<Job> jobs;int workers=0;
 void start(){for(;workers<2;++workers)std::thread([this]{for(;;){Job job;{std::unique_lock<std::mutex> lock(mutex);ready.wait(lock,[this]{return !jobs.empty();});job=std::move(jobs.front());jobs.pop_front();}job.run();}}).detach();}
 void push(Job job){{std::lock_guard<std::mutex> lock(mutex);jobs.push_back(std::move(job));}ready.notify_one();}
 void cancel(const std::shared_ptr<std::atomic<bool>>& token){std::function<void()> reject;{std::lock_guard<std::mutex> lock(mutex);auto found=std::find_if(jobs.begin(),jobs.end(),[&](const Job& job){return job.token==token;});if(found!=jobs.end()){reject=std::move(found->reject);jobs.erase(found);}}if(reject)reject();}
};
ImageQueue& imageQueue(){static auto* queue=new ImageQueue;static std::once_flag started;std::call_once(started,[&]{queue->start();});return *queue;}
}
void FormImageTask::cancel(){if(!cancelled)return;cancelled->store(true);imageQueue().cancel(cancelled);imageMemory().changed.notify_all();}
FormImageTask startFormImage(std::wstring source){
 auto promise=std::make_shared<std::promise<FormImage>>();FormImageTask task{promise->get_future(),std::make_shared<std::atomic<bool>>(false)};auto cancelled=task.cancelled;
 imageQueue().push({cancelled,[source=std::move(source),promise,cancelled]{try{if(cancelled->load())throw std::runtime_error("Image decode cancelled");winrt::init_apartment(winrt::apartment_type::multi_threaded);struct Apartment{~Apartment(){winrt::uninit_apartment();}}apartment;promise->set_value(decode(source,cancelled));}catch(...){promise->set_exception(std::current_exception());}},[promise]{try{throw std::runtime_error("Image decode cancelled");}catch(...){promise->set_exception(std::current_exception());}}});return task;
}
}
