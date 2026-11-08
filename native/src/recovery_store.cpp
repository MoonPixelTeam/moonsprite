#include "recovery_store.h"
#include <windows.h>
#include <fstream>
#include <algorithm>
#include <mutex>
#include <set>
namespace moon::project {
namespace {
std::mutex& recoveryFilesMutex(){static std::mutex value;return value;}
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
 std::set<std::string> described;
 std::vector<std::filesystem::path> payloads;
 // Directory discovery must not decode every complete project. Existing metadata
 // wins; orphan rows use their safe file identity as a fallback name. The
 // normal open path validates the bounded archive only when it is requested.
 for(const auto& entry:std::filesystem::directory_iterator(directory)){
  std::error_code error;if(!entry.is_regular_file(error)||error)continue;
  const auto id=entry.path().stem().u8string();if(!isSafeRecoveryId(id))continue;
  if(entry.path().extension()==L".moonsprite"){payloads.push_back(entry.path());continue;}
  if(entry.path().extension()!=L".json")continue;
  const auto size=entry.file_size(error);if(error||size>1024*1024)continue;
  std::ifstream f(entry.path(),std::ios::binary);if(!f)continue;
  std::string json((std::istreambuf_iterator<char>(f)),{});if(f.bad())continue;
  try {auto record=decodeRecoveryRecord(json);if(id==record.id){described.insert(id);result.push_back(std::move(record));}}catch(const std::exception&){} // Preserve malformed metadata for investigation/retry.
 }
 for(const auto& path:payloads){
  const auto id=path.stem().u8string();if(described.count(id))continue;
  WIN32_FILE_ATTRIBUTE_DATA attributes{};if(!GetFileAttributesExW(path.c_str(),GetFileExInfoStandard,&attributes))continue;
  const auto ticks=(std::uint64_t(attributes.ftLastWriteTime.dwHighDateTime)<<32)|attributes.ftLastWriteTime.dwLowDateTime;
  constexpr std::uint64_t epoch=116444736000000000ULL;
  const auto millis=ticks>=epoch?(ticks-epoch)/10000:0;
  result.push_back({id,id,std::to_string(millis)});
 }

 std::sort(result.begin(),result.end(),[](const auto&a,const auto&b){return a.updatedAt>b.updatedAt;});return result;
}
void writeRecoveryFiles(const std::filesystem::path& directory,const RecoveryRecord& record,const Bytes& data){
 std::lock_guard<std::mutex> lock(recoveryFilesMutex());
 const auto json=encodeRecoveryRecord(record);std::filesystem::create_directories(directory);
 atomic(directory/std::filesystem::u8path(record.id+".moonsprite"),data);atomic(directory/std::filesystem::u8path(record.id+".json"),Bytes(json.begin(),json.end()));
}
void removeOwnedRecovery(const std::filesystem::path& directory,const std::string& id){
 std::lock_guard<std::mutex> lock(recoveryFilesMutex());
 if(!isSafeRecoveryId(id))throw std::invalid_argument("Invalid recovery ID");
 // Match legacy's payload-before-sidecar order. If a payload is locked, its
 // discovery metadata must survive so the recovery remains visible.
 auto remove=[&](const char* suffix){std::error_code error;std::filesystem::remove(directory/std::filesystem::u8path(id+suffix),error);if(error)throw std::runtime_error(std::string("Cannot remove owned recovery ")+suffix+" (Windows "+std::to_string(error.value())+")");};
 // filesystem_error::what() may contain ACP-encoded Windows paths. Keep the
 // error channel ASCII/UTF-8 instead of throwing while formatting that error.
 remove(".moonsprite");remove(".json");
}
}
