#include "recovery_store.h"
#include "recovery_commit.h"
#include <windows.h>
#include <fstream>
#include <algorithm>
#include <atomic>
#include <set>
#include <map>
#include <array>
#include <optional>
#include <zlib.h>
namespace moon::project {
namespace {
[[noreturn]] void failed(const char* action){throw std::runtime_error(std::string(action)+" (Windows "+std::to_string(GetLastError())+")");}
// The directory's volume/file identity gives aliases the same cooperating-process
// lock, without creating a lock file or serializing unrelated recovery roots.
class DirectoryGuard {
 HANDLE mutex_=nullptr;
public:
 explicit DirectoryGuard(const std::filesystem::path& directory){
  HANDLE dir=CreateFileW(directory.c_str(),FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS,nullptr);
  if(dir==INVALID_HANDLE_VALUE)failed("Cannot open recovery directory");
  BY_HANDLE_FILE_INFORMATION info{};const bool known=GetFileInformationByHandle(dir,&info)!=0;const auto error=GetLastError();CloseHandle(dir);
  if(!known){SetLastError(error);failed("Cannot identify recovery directory");}
  const auto name=L"Local\\MoonSprite.Recovery.v1-"+std::to_wstring(info.dwVolumeSerialNumber)+L"-"+std::to_wstring(info.nFileIndexHigh)+L"-"+std::to_wstring(info.nFileIndexLow);
  mutex_=CreateMutexW(nullptr,FALSE,name.c_str());if(!mutex_)failed("Cannot create recovery lock");
  const auto status=WaitForSingleObject(mutex_,30000);
  // An abandoned writer may have committed only the payload. Each file remains
  // atomic; discovery deliberately re-scans disk and retains orphan payloads.
  if(status!=WAIT_OBJECT_0&&status!=WAIT_ABANDONED){const auto error=GetLastError();CloseHandle(mutex_);mutex_=nullptr;if(status==WAIT_TIMEOUT)throw std::runtime_error("Recovery directory is busy; retry later");SetLastError(error);failed("Cannot acquire recovery lock");}
 }
 ~DirectoryGuard(){if(mutex_){ReleaseMutex(mutex_);CloseHandle(mutex_);}}
 DirectoryGuard(const DirectoryGuard&)=delete;DirectoryGuard& operator=(const DirectoryGuard&)=delete;
};
void atomic(const std::filesystem::path& target,const Bytes& data){
 static std::atomic<std::uint64_t> serial{0};
 auto temp=target;temp+=L"."+std::to_wstring(GetCurrentProcessId())+L"."+std::to_wstring(GetTickCount64())+L"."+std::to_wstring(++serial)+L".tmp";
 HANDLE file=CreateFileW(temp.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);
 if(file==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot create recovery temporary file");
 try {for(std::size_t offset=0;offset<data.size();){const auto count=DWORD(std::min<std::size_t>(1024*1024,data.size()-offset));DWORD n=0;if(!WriteFile(file,data.data()+offset,count,&n,nullptr)||n!=count)failed("Cannot write recovery");offset+=count;}if(!FlushFileBuffers(file))failed("Cannot flush recovery");CloseHandle(file);file=INVALID_HANDLE_VALUE;
 if(!MoveFileExW(temp.c_str(),target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Cannot commit recovery");
 }catch(...){if(file!=INVALID_HANDLE_VALUE)CloseHandle(file);DeleteFileW(temp.c_str());throw;}
}
// Native GAP-015 commit descriptor. Existing .moonsprite/.json remain readable
// by legacy. Only a matching payload may use this uncommitted metadata.
constexpr char pendingMagic[]="MSREC01\n";
Bytes pendingRecord(const std::string& json,const Bytes& data){
 Bytes out(pendingMagic,pendingMagic+8);
 const auto size=std::uint64_t(data.size());for(int i=0;i<8;++i)out.push_back(std::uint8_t(size>>(8*i)));
 uLong crc=crc32(0,Z_NULL,0);for(std::size_t offset=0;offset<data.size();){const auto n=std::min<std::size_t>(1024*1024,data.size()-offset);crc=crc32(crc,data.data()+offset,uInt(n));offset+=n;}
 for(int i=0;i<4;++i)out.push_back(std::uint8_t(crc>>(8*i)));out.insert(out.end(),json.begin(),json.end());return out;
}
std::optional<RecoveryRecord> matchingPending(const std::filesystem::path& pending,const std::filesystem::path& payload,const std::string& id){
 try{
  std::ifstream meta(pending,std::ios::binary|std::ios::ate);if(!meta||meta.tellg()<20||meta.tellg()>1024*1024+20)return {};
  Bytes bytes(std::size_t(meta.tellg()));meta.seekg(0);if(!meta.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(bytes.size()))||!std::equal(bytes.begin(),bytes.begin()+8,pendingMagic))return {};
  std::uint64_t length=0;std::uint32_t expected=0;for(int i=0;i<8;++i)length|=std::uint64_t(bytes[8+i])<<(8*i);for(int i=0;i<4;++i)expected|=std::uint32_t(bytes[16+i])<<(8*i);
  if(length>Limits{}.archiveBytes)return {};auto record=decodeRecoveryRecord(std::string(bytes.begin()+20,bytes.end()));if(record.id!=id)return {};
  std::ifstream file(payload,std::ios::binary|std::ios::ate);if(!file||file.tellg()!=std::streamoff(length))return {};file.seekg(0);
  std::array<unsigned char,65536> buffer{};uLong crc=crc32(0,Z_NULL,0);
  for(std::uint64_t offset=0;offset<length;){const auto n=std::size_t(std::min<std::uint64_t>(buffer.size(),length-offset));if(!file.read(reinterpret_cast<char*>(buffer.data()),std::streamsize(n)))return {};crc=crc32(crc,buffer.data(),uInt(n));offset+=n;}
  if(crc!=expected||file.peek()!=std::char_traits<char>::eof())return {};return record;
 }catch(const std::exception&){return {};}
}
}
#ifdef MOONSPRITE_RECOVERY_COMMIT_TEST
void commitCheckpoint(const char* stage);
#endif
std::optional<RecoveryRecord> readPendingRecoveryRecord(const std::filesystem::path& payload,const std::string& id){
 if(!isSafeRecoveryId(id)||!std::filesystem::exists(payload.parent_path()))return {};
 DirectoryGuard lock(payload.parent_path());auto pending=payload.parent_path()/std::filesystem::u8path(id+".recovery-pending");return matchingPending(pending,payload,id);
}
std::vector<RecoveryRecord> listRecoveryRecords(const std::filesystem::path& directory){
 std::vector<RecoveryRecord> result;if(!std::filesystem::exists(directory))return result;
 DirectoryGuard lock(directory);
 std::set<std::string> described;
 std::vector<std::filesystem::path> payloads;
 std::map<std::string,std::filesystem::path> pending;
 // Directory discovery must not decode every complete project. Existing metadata
 // wins; orphan rows use their safe file identity as a fallback name. The
 // normal open path validates the bounded archive only when it is requested.
 for(const auto& entry:std::filesystem::directory_iterator(directory)){
  std::error_code error;if(!entry.is_regular_file(error)||error)continue;
  const auto id=entry.path().stem().u8string();if(!isSafeRecoveryId(id))continue;
  if(entry.path().extension()==L".moonsprite"){payloads.push_back(entry.path());continue;}
  if(entry.path().extension()==L".recovery-pending"){pending.emplace(id,entry.path());continue;}
  if(entry.path().extension()!=L".json")continue;
  const auto size=entry.file_size(error);if(error||size>1024*1024)continue;
  std::ifstream f(entry.path(),std::ios::binary);if(!f)continue;
  std::string json(std::size_t(size),'\0');if(!f.read(json.data(),std::streamsize(json.size()))||f.peek()!=std::char_traits<char>::eof())continue;
  try {auto record=decodeRecoveryRecord(json);if(id==record.id){described.insert(id);result.push_back(std::move(record));}}catch(const std::exception&){} // Preserve malformed metadata for investigation/retry.
 }
 for(const auto& path:payloads){
  const auto id=path.stem().u8string();
  const auto transaction=pending.find(id);
  if(transaction!=pending.end())if(auto record=matchingPending(transaction->second,path,id)){
   auto prior=std::find_if(result.begin(),result.end(),[&](const auto& row){return row.id==id;});if(prior==result.end())result.push_back(std::move(*record));else *prior=std::move(*record);continue;
  }
  if(described.count(id))continue;
  WIN32_FILE_ATTRIBUTE_DATA attributes{};if(!GetFileAttributesExW(path.c_str(),GetFileExInfoStandard,&attributes))continue;
  const auto ticks=(std::uint64_t(attributes.ftLastWriteTime.dwHighDateTime)<<32)|attributes.ftLastWriteTime.dwLowDateTime;
  constexpr std::uint64_t epoch=116444736000000000ULL;
  const auto millis=ticks>=epoch?(ticks-epoch)/10000:0;
  result.push_back({id,id,std::to_string(millis)});
 }

 std::sort(result.begin(),result.end(),[](const auto&a,const auto&b){return a.updatedAt>b.updatedAt;});return result;
}
void writeRecoveryFiles(const std::filesystem::path& directory,const RecoveryRecord& record,const Bytes& data){
 const auto json=encodeRecoveryRecord(record);std::filesystem::create_directories(directory);
 DirectoryGuard lock(directory);
 const auto pending=directory/std::filesystem::u8path(record.id+".recovery-pending");
 // Preserve the last interrupted commit's matching metadata before replacing
 // its descriptor, so another early exit cannot restore an older description.
 if(const auto previous=matchingPending(pending,directory/std::filesystem::u8path(record.id+".moonsprite"),record.id)){
  const auto committed=encodeRecoveryRecord(*previous);atomic(directory/std::filesystem::u8path(record.id+".json"),Bytes(committed.begin(),committed.end()));
 }
 atomic(pending,pendingRecord(json,data));
#ifdef MOONSPRITE_RECOVERY_COMMIT_TEST
 commitCheckpoint("descriptor");
#endif
 atomic(directory/std::filesystem::u8path(record.id+".moonsprite"),data);
#ifdef MOONSPRITE_RECOVERY_COMMIT_TEST
 commitCheckpoint("payload");
#endif
 atomic(directory/std::filesystem::u8path(record.id+".json"),Bytes(json.begin(),json.end()));
#ifdef MOONSPRITE_RECOVERY_COMMIT_TEST
 commitCheckpoint("metadata");
#endif
 // Both public files committed. A leftover descriptor is still valid, so a
 // cleanup failure must not falsely report that the recovery write failed.
 std::error_code ignored;std::filesystem::remove(pending,ignored);
}
void removeOwnedRecovery(const std::filesystem::path& directory,const std::string& id){
 if(!isSafeRecoveryId(id))throw std::invalid_argument("Invalid recovery ID");
 if(!std::filesystem::exists(directory))return;DirectoryGuard lock(directory);
 // Match legacy's payload-before-sidecar order. If a payload is locked, its
 // discovery metadata must survive so the recovery remains visible.
 auto remove=[&](const char* suffix){std::error_code error;std::filesystem::remove(directory/std::filesystem::u8path(id+suffix),error);if(error)throw std::runtime_error(std::string("Cannot remove owned recovery ")+suffix+" (Windows "+std::to_string(error.value())+")");};
 // filesystem_error::what() may contain ACP-encoded Windows paths. Keep the
 // error channel ASCII/UTF-8 instead of throwing while formatting that error.
 remove(".moonsprite");remove(".recovery-pending");remove(".json");
}
}
