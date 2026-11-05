#include "local_history_policy.h"
#include "legacy_json_number.h"
#include <windows.h>
#include <icu.h>
#include <algorithm>
#include <cstdint>
#include <limits>
#include <stdexcept>
namespace moon::local_history {
namespace {
std::wstring trim(const std::wstring& input){std::size_t begin=0,end=input.size();while(begin<end&&project::legacyjson::numberSpace(input[begin]))++begin;while(end>begin&&project::legacyjson::numberSpace(input[end-1]))--end;return input.substr(begin,end-begin);}
std::string userLocale(){wchar_t locale[LOCALE_NAME_MAX_LENGTH];if(!GetUserDefaultLocaleName(locale,LOCALE_NAME_MAX_LENGTH))throw std::runtime_error("Cannot read local-history casing locale");std::string result;for(const auto c:std::wstring(locale))result.push_back(char(c));return result;}
}
std::string historyKey(const std::wstring& filePath,const std::wstring& sourceFilePath,const std::wstring& runtimeId,const char* locale){
 static_assert(sizeof(wchar_t)==2,"Local history hashes UTF-16 code units");
 // Select BEFORE trimming: a truthy whitespace-only filePath does not fall back.
 const auto source=trim(!filePath.empty()?filePath:!sourceFilePath.empty()?sourceFilePath:runtimeId);
 if(source.size()>std::size_t(std::numeric_limits<std::int32_t>::max()))throw std::length_error("Local-history path too long");
 const auto systemLocale=locale?std::string{}:userLocale();const char* casing=locale?locale:systemLocale.c_str();
 UErrorCode error=U_ZERO_ERROR;const auto required=u_strToLower(nullptr,0,reinterpret_cast<const UChar*>(source.data()),std::int32_t(source.size()),casing,&error);
 if(error!=U_BUFFER_OVERFLOW_ERROR&&U_FAILURE(error))throw std::runtime_error("Cannot lowercase local-history path");
 std::wstring lower(std::size_t(required),L'\0');error=U_ZERO_ERROR;
 const auto written=u_strToLower(reinterpret_cast<UChar*>(lower.data()),required,reinterpret_cast<const UChar*>(source.data()),std::int32_t(source.size()),casing,&error);
 if(U_FAILURE(error)||written!=required)throw std::runtime_error("Cannot lowercase local-history path");
 std::uint32_t hash=0x811c9dc5;for(const auto unit:lower){hash^=std::uint16_t(unit);hash*=0x01000193;}
 std::string digits;do{const auto digit=hash%36;digits.push_back("0123456789abcdefghijklmnopqrstuvwxyz"[digit]);hash/=36;}while(hash);std::reverse(digits.begin(),digits.end());return "project-"+digits;
}
int parseHistorySteps(const std::optional<std::wstring>& text){
 if(!text||trim(*text).empty())return 50;const double parsed=project::legacyjson::stringNumber(*text);
 return std::isfinite(parsed)?int(std::floor(std::clamp(parsed,1.,200.)+.5)):50;
}
RestoreWindow restoreWindow(std::size_t total,std::size_t position,std::optional<std::size_t> limit){
 position=std::min(position,total);if(!limit)return {0,total,position};
 // HistoryStack normalizes finite limits to at least one entry.
 const auto count=std::max<std::size_t>(1,*limit),begin=std::min(position,total>count?total-count:0);
 const auto end=begin+std::min(total-begin,count);return {begin,end,position-begin};
}
}
