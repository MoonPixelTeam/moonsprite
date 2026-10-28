#include "timelapse_library.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <atomic>
#include <chrono>
#include <fstream>
#include <list>
#include <mutex>
#include "zlib.h"
namespace moon::timelapse {
namespace {
constexpr std::uint64_t chunkBytes=64ULL*1024*1024;
struct Handle {HANDLE value=INVALID_HANDLE_VALUE;explicit Handle(HANDLE h):value(h){}~Handle(){if(value!=INVALID_HANDLE_VALUE)CloseHandle(value);}Handle(const Handle&)=delete;};
[[noreturn]] void ioError(const char* message){throw std::runtime_error(std::string(message)+"; Win32="+std::to_string(GetLastError()));}
std::filesystem::path contained(const std::filesystem::path& root,const std::filesystem::path& path){const auto r=std::filesystem::canonical(root),p=std::filesystem::canonical(path);auto a=r.begin(),b=p.begin();for(;a!=r.end();++a,++b)if(b==p.end()||_wcsicmp(a->c_str(),b->c_str())!=0)throw std::runtime_error("Recording path escapes its library");return p;}
std::uint32_t checksum(const Bytes& b){return static_cast<std::uint32_t>(crc32(0,b.data(),static_cast<uInt>(b.size())));}
std::mutex chunksMutex;
std::list<std::pair<std::filesystem::path,std::filesystem::path>> chunks;
std::atomic<std::uint64_t> sequence{0};
}
std::filesystem::path executableLibraryRoot(){std::vector<wchar_t> path(32768);const auto n=GetModuleFileNameW(nullptr,path.data(),static_cast<DWORD>(path.size()));if(!n||n>=path.size())throw std::runtime_error("Cannot resolve executable directory");return std::filesystem::path(std::wstring(path.data(),n)).parent_path()/L"timelapse-v1";}
Reference appendLibraryFrame(const std::filesystem::path& root,const std::string& store,const Bytes& png){
 static constexpr unsigned char signature[]{137,80,78,71,13,10,26,10};
 if(!safeId(store))throw std::invalid_argument("Invalid local recording identifier");
 if(png.size()<24||png.size()>32ULL*1024*1024||!std::equal(std::begin(signature),std::end(signature),png.begin()))throw std::invalid_argument("Invalid or oversized recording frame");
 std::filesystem::create_directories(root);std::filesystem::create_directories(root/store);const auto directory=contained(root,root/store);
 std::lock_guard<std::mutex> lock(chunksMutex);std::filesystem::path path;
 for(auto it=chunks.begin();it!=chunks.end();++it)if(it->first==directory){std::error_code ec;const auto size=std::filesystem::file_size(it->second,ec);if(!ec&&size<=chunkBytes-png.size())path=it->second;chunks.splice(chunks.end(),chunks,it);break;}
 if(path.empty()){
  const auto stamp=std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
  const auto name=std::to_string(GetCurrentProcessId())+"-"+std::to_string(stamp)+"-"+std::to_string(sequence.fetch_add(1));path=directory/(name+".bin");
  Handle fresh(CreateFileW(path.c_str(),GENERIC_WRITE,FILE_SHARE_READ,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr));if(fresh.value==INVALID_HANDLE_VALUE)ioError("Cannot create recording chunk");
  for(auto it=chunks.begin();it!=chunks.end();)if(it->first==directory)it=chunks.erase(it);else ++it;chunks.emplace_back(directory,path);while(chunks.size()>128)chunks.pop_front();
 }
 path=contained(root,path);Handle out(CreateFileW(path.c_str(),GENERIC_WRITE|FILE_READ_ATTRIBUTES,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr));if(out.value==INVALID_HANDLE_VALUE)ioError("Cannot open recording chunk");
 LARGE_INTEGER size{};if(!GetFileSizeEx(out.value,&size)||size.QuadPart<0)ioError("Cannot measure recording chunk");
 if(!SetFilePointerEx(out.value,size,nullptr,FILE_BEGIN))ioError("Cannot seek recording append");
 std::size_t offset=0;while(offset<png.size()){DWORD written=0;if(!WriteFile(out.value,png.data()+offset,static_cast<DWORD>(png.size()-offset),&written,nullptr))ioError("Cannot append recording frame");if(!written)throw std::runtime_error("Incomplete recording write");offset+=written;}
 if(!FlushFileBuffers(out.value))ioError("Cannot flush recording frame");
 Reference r{store,path.stem().string(),static_cast<std::uint64_t>(size.QuadPart),static_cast<std::uint64_t>(png.size()),checksum(png)};if(!validReference(r))throw std::runtime_error("Invalid durable recording range");return r;
}
Bytes readLibraryFrame(const std::filesystem::path& root,const Reference& r){
 if(!validReference(r))throw std::invalid_argument("Invalid local recording reference");const auto path=contained(root,root/r.store/(r.chunk+".bin"));
 Handle in(CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr));if(in.value==INVALID_HANDLE_VALUE)ioError("Local recording unavailable");
 LARGE_INTEGER size{};if(!GetFileSizeEx(in.value,&size)||size.QuadPart<0)ioError("Cannot measure recording range");if(r.offset+r.length>static_cast<std::uint64_t>(size.QuadPart))throw std::runtime_error("Incomplete recording frame");
 LARGE_INTEGER begin{};begin.QuadPart=static_cast<LONGLONG>(r.offset);if(!SetFilePointerEx(in.value,begin,nullptr,FILE_BEGIN))ioError("Cannot seek recording range");Bytes data(static_cast<std::size_t>(r.length));std::size_t offset=0;while(offset<data.size()){DWORD got=0;if(!ReadFile(in.value,data.data()+offset,static_cast<DWORD>(data.size()-offset),&got,nullptr))ioError("Cannot read recording range");if(!got)throw std::runtime_error("Incomplete recording frame");offset+=got;}if(checksum(data)!=r.checksum)throw std::runtime_error("Recording checksum mismatch");return data;
}
Bytes readLibraryFrameWithLegacy(const std::filesystem::path& root,const std::filesystem::path& legacy,const Reference& r){
 if(!validReference(r))throw std::invalid_argument("Invalid local recording reference");const auto path=root/r.store/(r.chunk+".bin");std::error_code ec;const auto status=std::filesystem::symlink_status(path,ec);if(ec&&ec!=std::errc::no_such_file_or_directory)throw std::filesystem::filesystem_error("Local recording unavailable",path,ec);if(!ec&&status.type()!=std::filesystem::file_type::not_found)return readLibraryFrame(root,r);return readLibraryFrame(legacy,r);
}
}
