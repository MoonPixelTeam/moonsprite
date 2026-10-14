#include "recovery_preferences.h"
#include <windows.h>
#include <algorithm>
#include <cmath>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <locale>
#include <atomic>
#include <stdexcept>
namespace moon::recovery {
namespace {
double number(const std::string& text,double fallback) {
 const auto first=text.find_first_not_of(" \t\r\n");if(first==std::string::npos)return fallback;
 try {std::size_t consumed=0;double v=std::stod(text,&consumed);if(text.find_first_not_of(" \t\r\n",consumed)!=std::string::npos||!std::isfinite(v))return fallback;return v;}catch(...){return fallback;}
}
[[noreturn]]void ioError(const char* action){throw std::runtime_error(std::string(action)+" (Windows "+std::to_string(GetLastError())+")");}
}
Preferences normalizePreferences(Preferences value) {
 value.minutes=std::isfinite(value.minutes)?std::clamp(value.minutes,.5,60.):5;
 value.retentionDays=std::clamp(value.retentionDays,1,365);return value;
}
Preferences loadPreferences(const std::filesystem::path& path) {
 Preferences p;std::error_code ec;
 if(!std::filesystem::exists(path,ec)){if(ec)throw std::runtime_error("Cannot inspect recovery preferences");return p;}
 std::ifstream f(path,std::ios::binary);if(!f)throw std::runtime_error("Cannot read recovery preferences");
 std::string line;while(std::getline(f,line)) {
  if(!line.empty()&&line.back()=='\r')line.pop_back();const auto at=line.find('=');if(at==std::string::npos)continue;
  const auto key=line.substr(0,at),v=line.substr(at+1);
  if(key=="enabled")p.enabled=v!="false";
  else if(key=="minutes")p.minutes=number(v,5);
  else if(key=="retentionDays")p.retentionDays=int(std::clamp(std::floor(number(v,7)+.5),1.,365.));
 }
 if(f.bad())throw std::runtime_error("Cannot finish reading recovery preferences");return normalizePreferences(p);
}
void savePreferencesAtomic(const std::filesystem::path& path,Preferences value) {
 if(path.empty())throw std::invalid_argument("Empty preferences path");value=normalizePreferences(value);
 std::ostringstream stream;stream.imbue(std::locale::classic());stream<<"enabled="<<(value.enabled?"true":"false")<<"\nminutes="<<std::setprecision(17)<<value.minutes<<"\nretentionDays="<<value.retentionDays<<'\n';const auto bytes=stream.str();
 if(!path.parent_path().empty())std::filesystem::create_directories(path.parent_path());
 static std::atomic<unsigned> counter{0};const auto temp=path.parent_path()/(path.filename().wstring()+L"."+std::to_wstring(GetCurrentProcessId())+L"."+std::to_wstring(++counter)+L".tmp");
 HANDLE h=CreateFileW(temp.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(h==INVALID_HANDLE_VALUE)ioError("Cannot create preference temporary");
 try {DWORD written=0;if(!WriteFile(h,bytes.data(),DWORD(bytes.size()),&written,nullptr)||written!=bytes.size())ioError("Cannot write recovery preferences");if(!FlushFileBuffers(h))ioError("Cannot flush recovery preferences");CloseHandle(h);h=INVALID_HANDLE_VALUE;
 if(!MoveFileExW(temp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))ioError("Cannot replace recovery preferences");
 }catch(...){if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);DeleteFileW(temp.c_str());throw;}
}
bool retentionStale(std::int64_t updatedMs,std::int64_t nowMs,int days) {
 if(updatedMs>nowMs)return false;const auto duration=std::uint64_t(std::clamp(days,1,365))*86400000ULL;
 return std::uint64_t(nowMs)-std::uint64_t(updatedMs)>duration;
}
}
