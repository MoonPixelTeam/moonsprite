#pragma once
#include "extension_form_state.h"
#include "atomic_file.h"
#include <windows.h>
#include <commdlg.h>
#include <fstream>
#include <cwctype>
#include <atomic>
#include <future>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <deque>
namespace moon::extension {
struct FormFileReadTask {
 std::future<std::vector<FormState::File>> result;
 std::shared_ptr<std::atomic<bool>> cancelled;
 std::function<void()> removeQueued;
 void cancel(){if(cancelled)cancelled->store(true);if(removeQueued)removeQueued();}
};
class FormFiles {
 HWND owner_;std::function<BOOL(OPENFILENAMEW*)> open_,save_;
 static void chooserError(){if(CommDlgExtendedError())throw std::runtime_error("扩展文件对话框失败。");}
 static std::wstring mime(std::filesystem::path path){auto ext=path.extension().wstring();for(auto& c:ext)c=std::towlower(c);if(ext==L".png")return L"image/png";if(ext==L".gif")return L"image/gif";if(ext==L".webp")return L"image/webp";if(ext==L".jpg"||ext==L".jpeg")return L"image/jpeg";if(ext==L".bmp")return L"image/bmp";return L"";}
 static std::wstring extension(const std::wstring& name){const auto dot=name.find_last_of(L'.');const auto ext=dot==std::wstring::npos?name:name.substr(dot+1);if(ext.empty()||ext.size()>16||!std::all_of(ext.begin(),ext.end(),[](wchar_t c){return (c>=L'a'&&c<=L'z')||(c>=L'A'&&c<=L'Z')||(c>=L'0'&&c<=L'9');}))throw std::invalid_argument("扩展导出文件扩展名无效。");return ext;}
 static std::wstring filter(const winrt::Windows::Data::Json::JsonObject& node){
  using namespace winrt::Windows::Data::Json;const auto accept=node.HasKey(L"accept")&&node.GetNamedValue(L"accept").ValueType()==JsonValueType::String?std::wstring(node.GetNamedString(L"accept")):L"image/gif,image/png,image/webp";std::wstring patterns;std::size_t start=0;
  while(start<=accept.size()){const auto end=accept.find(L',',start);auto token=accept.substr(start,end==std::wstring::npos?end:end-start);const auto first=token.find_first_not_of(L" ");if(first!=std::wstring::npos)token=token.substr(first,token.find_last_not_of(L" ")-first+1);std::wstring pattern;if(token==L"image/gif")pattern=L"*.gif";else if(token==L"image/png")pattern=L"*.png";else if(token==L"image/webp")pattern=L"*.webp";else if(token==L"image/jpeg")pattern=L"*.jpg;*.jpeg";else if(token==L"image/*")pattern=L"*.png;*.gif;*.webp;*.jpg;*.jpeg;*.bmp";else if(token.size()>1&&token[0]==L'.'&&std::all_of(token.begin()+1,token.end(),[](wchar_t c){return (c>=L'a'&&c<=L'z')||(c>=L'A'&&c<=L'Z')||(c>=L'0'&&c<=L'9');}))pattern=L"*"+token;if(!pattern.empty()){if(!patterns.empty())patterns+=L';';patterns+=pattern;}if(end==std::wstring::npos)break;start=end+1;
  }if(patterns.empty())patterns=L"*.*";std::wstring result=L"扩展文件";result+=wchar_t(0);result+=patterns;result+=wchar_t(0);result+=L"所有文件";result+=wchar_t(0);result+=L"*.*";result+=wchar_t(0);result+=wchar_t(0);return result;
 }
public:
 explicit FormFiles(HWND owner=nullptr,std::function<BOOL(OPENFILENAMEW*)> open=GetOpenFileNameW,std::function<BOOL(OPENFILENAMEW*)> save=GetSaveFileNameW):owner_(owner),open_(std::move(open)),save_(std::move(save)){}
 std::optional<std::vector<std::filesystem::path>> choosePaths(const winrt::Windows::Data::Json::JsonObject& node)const{
  using namespace winrt::Windows::Data::Json;const bool multiple=!node.HasKey(L"multiple")||node.GetNamedValue(L"multiple").ValueType()!=JsonValueType::Boolean||node.GetNamedBoolean(L"multiple");std::vector<wchar_t> buffer(32768);const auto filters=filter(node);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=owner_;dialog.lpstrFile=buffer.data();dialog.nMaxFile=DWORD(buffer.size());dialog.lpstrFilter=filters.c_str();dialog.lpstrTitle=L"选择扩展文件";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_FILEMUSTEXIST|OFN_PATHMUSTEXIST|(multiple?OFN_ALLOWMULTISELECT:0);
  if(!open_(&dialog)){chooserError();return {};}
  // Parse within the allocated buffer even for injected or malformed chooser replies.
  auto cursor=buffer.data();auto end=buffer.data()+buffer.size();auto next=[&](){auto last=std::find(cursor,end,wchar_t(0));if(last==end)throw std::runtime_error("扩展文件选择结果无效。");std::wstring part(cursor,last);cursor=last+1;return part;};const std::filesystem::path first(next());if(first.empty())throw std::runtime_error("扩展文件选择结果无效。");std::vector<std::filesystem::path> paths;
  if(!multiple||cursor==end||!*cursor)paths.push_back(first);
  else{while(cursor<end&&*cursor){if(paths.size()==16)throw std::length_error("最多 16 个文件，合计不超过 16 MiB。");paths.push_back(first/next());}if(cursor==end)throw std::runtime_error("扩展文件选择结果无效。");}
  return paths;
 }
 static std::vector<FormState::File> read(const std::vector<std::filesystem::path>& paths,const std::shared_ptr<std::atomic<bool>>& cancelled={}){
  const auto check=[&]{if(cancelled&&cancelled->load())throw std::runtime_error("File import cancelled");};check();if(paths.empty()||paths.size()>16)throw std::length_error("最多 16 个文件，合计不超过 16 MiB。");
  // Legacy validates the combined File.size before Promise.all arrayBuffer.
  // Do the same before opening any stream, retaining the read-time growth cap.
  std::uintmax_t expected=0;for(const auto& path:paths){check();const auto size=std::filesystem::file_size(path);if(size>16u*1024*1024-expected)throw std::length_error("最多 16 个文件，合计不超过 16 MiB。");expected+=size;}
  std::vector<FormState::File> files;files.reserve(paths.size());std::size_t total=0;
  for(const auto& path:paths){check();const auto size=std::filesystem::file_size(path);if(size>16u*1024*1024-total)throw std::length_error("最多 16 个文件，合计不超过 16 MiB。");FormState::File file;file.name=path.filename().wstring();file.mime=mime(path);std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("无法读取扩展文件。");char chunk[65536];while(input){check();input.read(chunk,sizeof(chunk));const auto n=std::size_t(input.gcount());if(n>16u*1024*1024-total)throw std::length_error("最多 16 个文件，合计不超过 16 MiB。");file.bytes.insert(file.bytes.end(),chunk,chunk+n);total+=n;}if(input.bad())throw std::runtime_error("无法读取扩展文件。");files.push_back(std::move(file));}return files;
 }
 std::optional<std::vector<FormState::File>> choose(const winrt::Windows::Data::Json::JsonObject& node)const{auto paths=choosePaths(node);if(!paths)return {};return read(*paths);}
 bool save(const FormState::File& file)const{
  if(file.name.empty()||file.name.size()>120||file.bytes.size()>12u*1024*1024)throw std::invalid_argument("扩展导出文件无效。");for(auto c:file.name)if(c<32||(c>=127&&c<=159)||std::wstring(L"<>:\"/\\|?*").find(c)!=std::wstring::npos)throw std::invalid_argument("扩展导出文件无效。");if(winrt::to_string(file.name).size()>240)throw std::invalid_argument("扩展导出文件名无效。");const auto ext=extension(file.name);
  std::vector<wchar_t> buffer(32768);std::copy(file.name.begin(),file.name.end(),buffer.begin());std::wstring filters=L"扩展数据";filters+=wchar_t(0);filters+=L"*."+ext;filters+=wchar_t(0);filters+=L"所有文件";filters+=wchar_t(0);filters+=L"*.*";filters+=wchar_t(0);filters+=wchar_t(0);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=owner_;dialog.lpstrFile=buffer.data();dialog.nMaxFile=DWORD(buffer.size());dialog.lpstrFilter=filters.c_str();dialog.lpstrDefExt=ext.c_str();dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;
  if(!save_(&dialog)){chooserError();return false;}const auto end=std::find(buffer.begin(),buffer.end(),wchar_t(0));if(end==buffer.end()||end==buffer.begin())throw std::runtime_error("扩展文件选择结果无效。");writeBinaryFileAtomic(std::filesystem::path(std::wstring(buffer.begin(),end)),file.bytes);return true;
 }
};
// One process-wide reader; queued jobs carry paths only, never UI or JSON.
// Promise futures can be discarded on close without joining the reader.
namespace detail {
struct FormFileReadQueue{
 struct Job{std::shared_ptr<std::atomic<bool>> cancelled;std::function<void()> run,reject;};
 std::mutex mutex;std::condition_variable ready;std::deque<Job> jobs;
 FormFileReadQueue(){std::thread([this]{for(;;){Job job;{std::unique_lock<std::mutex> lock(mutex);ready.wait(lock,[&]{return !jobs.empty();});job=std::move(jobs.front());jobs.pop_front();}job.run();}}).detach();}
 void cancel(const std::shared_ptr<std::atomic<bool>>& token){std::function<void()> reject;{std::lock_guard<std::mutex> lock(mutex);const auto found=std::find_if(jobs.begin(),jobs.end(),[&](const Job& job){return job.cancelled==token;});if(found==jobs.end())return;reject=std::move(found->reject);jobs.erase(found);}reject();}
};
}
inline FormFileReadTask startFormFileRead(std::vector<std::filesystem::path> paths,
 std::function<std::vector<FormState::File>(const std::vector<std::filesystem::path>&,const std::shared_ptr<std::atomic<bool>>&)> reader=FormFiles::read){
 static auto* queue=new detail::FormFileReadQueue;
 auto promise=std::make_shared<std::promise<std::vector<FormState::File>>>();auto cancelled=std::make_shared<std::atomic<bool>>(false);auto future=promise->get_future();
 auto reject=[promise]{try{throw std::runtime_error("File import cancelled");}catch(...){promise->set_exception(std::current_exception());}};
 auto run=[paths=std::move(paths),reader=std::move(reader),cancelled,promise]{try{if(cancelled->load())throw std::runtime_error("File import cancelled");auto result=reader(paths,cancelled);if(cancelled->load())throw std::runtime_error("File import cancelled");promise->set_value(std::move(result));}catch(...){promise->set_exception(std::current_exception());}};
 {std::lock_guard<std::mutex> lock(queue->mutex);queue->jobs.push_back({cancelled,std::move(run),std::move(reject)});}queue->ready.notify_one();return {std::move(future),cancelled,[cancelled]{queue->cancel(cancelled);}};
}
}
