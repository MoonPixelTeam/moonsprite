#include "recovery_store.h"
#include <windows.h>
#include <fstream>
#include <algorithm>
namespace moon::project {
namespace {
void atomic(const std::filesystem::path& target,const Bytes& data){
 auto temp=target;temp+=L"."+std::to_wstring(GetCurrentProcessId())+L".tmp";
 HANDLE file=CreateFileW(temp.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);
 if(file==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot create recovery temporary file");
 try {DWORD n=0;if(data.size()>DWORD(-1)||!WriteFile(file,data.data(),DWORD(data.size()),&n,nullptr)||n!=data.size()||!FlushFileBuffers(file))throw std::runtime_error("Cannot write recovery");CloseHandle(file);file=INVALID_HANDLE_VALUE;
 if(!MoveFileExW(temp.c_str(),target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Cannot commit recovery");
 }catch(...){if(file!=INVALID_HANDLE_VALUE)CloseHandle(file);DeleteFileW(temp.c_str());throw;}
}
}
std::vector<RecoveryRecord> listRecoveryRecords(const std::filesystem::path& directory){
 std::vector<RecoveryRecord> result;if(!std::filesystem::exists(directory))return result;
 for(auto& entry:std::filesystem::directory_iterator(directory))if(entry.path().extension()==L".json"){
  if(entry.file_size()>1024*1024)continue;std::ifstream f(entry.path(),std::ios::binary);std::string json((std::istreambuf_iterator<char>(f)),{});
  try {auto record=decodeRecoveryRecord(json);if(entry.path().stem().u8string()==record.id)result.push_back(std::move(record));}catch(const std::exception&){} // Legacy ignores malformed sidecars; never delete them.
 }
 std::sort(result.begin(),result.end(),[](const auto&a,const auto&b){return a.updatedAt>b.updatedAt;});return result;
}
void writeRecoveryFiles(const std::filesystem::path& directory,const RecoveryRecord& record,const Bytes& data){
 const auto json=encodeRecoveryRecord(record);std::filesystem::create_directories(directory);
 atomic(directory/std::filesystem::u8path(record.id+".moonsprite"),data);atomic(directory/std::filesystem::u8path(record.id+".json"),Bytes(json.begin(),json.end()));
}
void removeOwnedRecovery(const std::filesystem::path& directory,const std::string& id){
 if(!isSafeRecoveryId(id))throw std::invalid_argument("Invalid recovery ID");
 // Match legacy's payload-before-sidecar order. If a payload is locked, its
 // discovery metadata must survive so the recovery remains visible.
 auto remove=[&](const char* suffix){std::error_code error;std::filesystem::remove(directory/std::filesystem::u8path(id+suffix),error);if(error)throw std::runtime_error(std::string("Cannot remove owned recovery ")+suffix+" (Windows "+std::to_string(error.value())+")");};
 // filesystem_error::what() may contain ACP-encoded Windows paths. Keep the
 // error channel ASCII/UTF-8 instead of throwing while formatting that error.
 remove(".moonsprite");remove(".json");
}
}
