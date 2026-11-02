#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <string>
#include <cstdint>
#include <vector>
#include <deque>
#include <filesystem>
#include <functional>
#include <stdexcept>
#include <algorithm>
#include <cwctype>

namespace moon::document_launch {
// legacy src-tauri/lib.rs::supported_file_paths/startup_file_paths.
inline std::vector<std::string> supported(const std::vector<std::string>& arguments){
 std::vector<std::string> paths;
 for(std::size_t i=0;i<arguments.size();++i){
  if(arguments[i]=="--theme"||arguments[i]=="--cursors"){if(i+1<arguments.size())++i;continue;}
  const auto path=std::filesystem::u8path(arguments[i]);std::error_code error;
  if(!std::filesystem::is_regular_file(path,error))continue;
  auto extension=path.extension().wstring();std::transform(extension.begin(),extension.end(),extension.begin(),[](wchar_t c){return std::towlower(c);});
  if(extension!=L".moonsprite"&&extension!=L".ase"&&extension!=L".aseprite"&&extension!=L".psd"&&extension!=L".png"&&extension!=L".jpg"&&extension!=L".jpeg"&&extension!=L".webp"&&extension!=L".bmp"&&extension!=L".gif"&&extension!=L".msext"){
   auto name=path.filename().wstring();std::transform(name.begin(),name.end(),name.begin(),[](wchar_t c){return std::towlower(c);});
   const std::wstring suffix=L".moonsprite.bak";if(name.size()<suffix.size()||name.substr(name.size()-suffix.size())!=suffix)continue;
  }
  const auto absolute=std::filesystem::absolute(path,error);if(!error)paths.push_back(absolute.lexically_normal().u8string());
 }return paths;
}
inline bool automation(const std::vector<std::string>& arguments){
 for(std::size_t i=0;i<arguments.size();++i){if(arguments[i]=="--theme"||arguments[i]=="--cursors"){++i;continue;}if(arguments[i].rfind("--",0)==0)return true;}return false;
}
inline std::wstring applicationKey(){
 std::wstring path(32768,0);const auto count=GetModuleFileNameW(nullptr,path.data(),DWORD(path.size()));if(!count||count==path.size())throw std::runtime_error("Cannot identify native executable");path.resize(count);
 // Native development installs use the one authoritative executable path.
 std::uint64_t hash=14695981039346656037ull;for(auto c:path){hash^=std::towlower(c);hash*=1099511628211ull;}return L"MoonSprite.Native.Files."+std::to_wstring(hash);
}
// Necessary Win32 replacement for Tauri's single-instance plugin and file event.
// WM_COPYDATA only queues owned strings. Document work runs later on the UI loop.
class Instance final {
 struct Request{std::vector<std::string> paths;bool activated=false;};
 HANDLE mutex_=nullptr,ready_=nullptr;HWND receiver_=nullptr;bool primary_=false,processing_=false;std::wstring name_;std::deque<Request> requests_;
 static constexpr ULONG_PTR signature=0x4d53464c;static constexpr std::size_t maximumBytes=1024*1024;
 static LRESULT CALLBACK procedure(HWND window,UINT message,WPARAM wparam,LPARAM lparam){
  if(message==WM_NCCREATE){SetWindowLongPtrW(window,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(reinterpret_cast<CREATESTRUCTW*>(lparam)->lpCreateParams));}
  auto self=reinterpret_cast<Instance*>(GetWindowLongPtrW(window,GWLP_USERDATA));
  if(message==WM_COPYDATA&&self){
   const auto data=reinterpret_cast<const COPYDATASTRUCT*>(lparam);if(!data||data->dwData!=signature||!data->lpData||data->cbData<2*sizeof(wchar_t)||data->cbData>maximumBytes||data->cbData%sizeof(wchar_t))return FALSE;
   const auto text=static_cast<const wchar_t*>(data->lpData);const auto count=data->cbData/sizeof(wchar_t);if(text[count-1]||text[count-2]||self->requests_.size()>=128)return FALSE;
   try{std::vector<std::string> paths;std::size_t offset=0;while(offset+1<count&&text[offset]){std::size_t end=offset;while(end<count&&text[end])++end;if(end>=count)return FALSE;paths.push_back(std::filesystem::path(std::wstring(text+offset,text+end)).u8string());offset=end+1;}for(std::size_t i=offset;i<count;++i)if(text[i])return FALSE;self->requests_.push_back({supported(paths),false});return TRUE;}catch(...){return FALSE;}
  }
  return DefWindowProcW(window,message,wparam,lparam);
 }
 void release(){if(receiver_)DestroyWindow(receiver_);receiver_=nullptr;if(ready_)CloseHandle(ready_);ready_=nullptr;if(mutex_)CloseHandle(mutex_);mutex_=nullptr;}
public:
 explicit Instance(std::wstring name=applicationKey()):name_(std::move(name)){
  try{
   mutex_=CreateMutexW(nullptr,FALSE,(L"Local\\"+name_).c_str());if(!mutex_)throw std::runtime_error("Cannot create native application instance");primary_=GetLastError()!=ERROR_ALREADY_EXISTS;
   ready_=CreateEventW(nullptr,TRUE,FALSE,(L"Local\\"+name_+L".Ready").c_str());if(!ready_)throw std::runtime_error("Cannot initialize native file delivery");
   if(primary_){ResetEvent(ready_);WNDCLASSW cls{};cls.lpfnWndProc=procedure;cls.hInstance=GetModuleHandleW(nullptr);cls.lpszClassName=name_.c_str();if(!RegisterClassW(&cls)&&GetLastError()!=ERROR_CLASS_ALREADY_EXISTS)throw std::runtime_error("Cannot register native file receiver");receiver_=CreateWindowExW(0,name_.c_str(),name_.c_str(),0,0,0,0,0,HWND_MESSAGE,nullptr,cls.hInstance,this);if(!receiver_)throw std::runtime_error("Cannot create native file receiver");SetEvent(ready_);}
  }catch(...){release();throw;}
 }
 ~Instance(){release();}Instance(const Instance&)=delete;Instance& operator=(const Instance&)=delete;
 bool primary()const{return primary_;}HWND handle()const{return receiver_;}
 void enqueue(std::vector<std::string> paths){if(!paths.empty())requests_.push_back({std::move(paths),false});}
 void forward(const std::vector<std::string>& paths){
  if(primary_)throw std::logic_error("Cannot forward to own instance");if(WaitForSingleObject(ready_,5000)!=WAIT_OBJECT_0)throw std::runtime_error("MoonSprite is still starting; files were not delivered");
  const HWND target=FindWindowExW(HWND_MESSAGE,nullptr,name_.c_str(),nullptr);if(!target)throw std::runtime_error("Cannot find the existing MoonSprite window");
  std::vector<wchar_t> buffer;for(const auto& path:paths){const auto wide=std::filesystem::u8path(path).wstring();buffer.insert(buffer.end(),wide.begin(),wide.end());buffer.push_back(0);}buffer.push_back(0);if(buffer.size()==1)buffer.push_back(0);
  if(buffer.size()*sizeof(wchar_t)>maximumBytes)throw std::length_error("Too many files in native launch request");
  DWORD process=0;GetWindowThreadProcessId(target,&process);if(process)AllowSetForegroundWindow(process);
  COPYDATASTRUCT data{signature,DWORD(buffer.size()*sizeof(wchar_t)),buffer.data()};DWORD_PTR accepted=0;
  if(!SendMessageTimeoutW(target,WM_COPYDATA,0,reinterpret_cast<LPARAM>(&data),SMTO_ABORTIFHUNG|SMTO_BLOCK,5000,&accepted)||!accepted)throw std::runtime_error("MoonSprite did not accept the file request; no new window was created");
 }
 // False means the editor has a modal operation; retain the request until ready.
 void pump(const std::function<void()>& activate,const std::function<bool(const std::vector<std::string>&)>& open){
  if(processing_||requests_.empty())return;processing_=true;struct Reset{bool& value;~Reset(){value=false;}}reset{processing_};
  auto& request=requests_.front();if(!request.activated){activate();request.activated=true;}if(request.paths.empty()||open(request.paths))requests_.pop_front();
 }
 bool pending()const{return !requests_.empty();}
};
}
