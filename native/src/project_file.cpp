#include "project_file.h"
#include "project_encode.h"
#include "project_import.h"
#include <windows.h>
#include <fstream>
#include <array>
#include <atomic>
namespace moon::project {
namespace {
[[noreturn]] void failed(const char* action){throw std::runtime_error(std::string(action)+" (Windows "+std::to_string(GetLastError())+")");}
}
void saveDocumentAtomic(Document& document,const std::filesystem::path& path) {
  if(path.empty()) throw std::invalid_argument("Empty project path");
  auto encoded=encodeEditableProject(document);
  // The generated archive must pass the same admission gate as a reopened file.
  prepareEditableImport(readProjectManifest(encoded.bytes));
  if(!path.parent_path().empty()) std::filesystem::create_directories(path.parent_path());
  static std::atomic<unsigned> serial{0};
  const auto temporary=path.parent_path()/(path.filename().wstring()+L"."+std::to_wstring(GetCurrentProcessId())+L"."+std::to_wstring(GetTickCount64())+L"."+std::to_wstring(++serial)+L".tmp");
  HANDLE handle=CreateFileW(temporary.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);
  if(handle==INVALID_HANDLE_VALUE) failed("Cannot create temporary project");
  try {
    std::size_t offset=0;
    while(offset<encoded.bytes->size()) {
      DWORD written=0;const auto count=DWORD(std::min<std::size_t>(1024*1024,encoded.bytes->size()-offset));
      if(!WriteFile(handle,encoded.bytes->data()+offset,count,&written,nullptr)||written!=count) failed("Cannot write project");
      offset+=written;
    }
    if(!FlushFileBuffers(handle)) failed("Cannot flush project");
    CloseHandle(handle);handle=INVALID_HANDLE_VALUE;
    std::ifstream file(temporary,std::ios::binary|std::ios::ate);
    if(!file || file.tellg()!=std::streamoff(encoded.bytes->size())) throw std::runtime_error("Saved project size mismatch");
    // The encoded bytes already passed admission. Verify the on-disk bytes
    // exactly in bounded chunks; decoding an identical archive again adds no
    // validation and holds another complete raster document in memory.
    std::array<char,65536> checked{};file.seekg(0);
    for(std::size_t offset=0;offset<encoded.bytes->size();){
      const auto count=std::min(checked.size(),encoded.bytes->size()-offset);
      if(!file.read(checked.data(),std::streamsize(count)) || !std::equal(checked.begin(),checked.begin()+count,reinterpret_cast<const char*>(encoded.bytes->data()+offset)))throw std::runtime_error("Saved project verification failed");
      offset+=count;
    }
    file.close();
    if(!MoveFileExW(temporary.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)) failed("Cannot replace project");
  } catch(...) {
    if(handle!=INVALID_HANDLE_VALUE) CloseHandle(handle);
    DeleteFileW(temporary.c_str()); // Only our uniquely created uncommitted file.
    throw;
  }
  document.acceptSaved(std::move(encoded.projectId),std::move(encoded.bytes));
}
}
