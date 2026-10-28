#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include "image_export.h"
#include <windows.h>
#include "javascript_text.h"
#include <codecvt>
#include <locale>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <cstdio>
namespace moon::recent_export_paths {
struct Item{std::string filePath,exportedAt;};
inline std::string trim(const std::string& text){std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t> utf;const auto value=utf.from_bytes(text);const auto view=javascriptTrim(value);if(view.empty())return {};return utf.to_bytes(view.data(),view.data()+view.size());}
inline std::wstring key(const std::string& text){auto wide=std::filesystem::u8path(text).wstring();if(wide.empty())return wide;const int count=LCMapStringEx(LOCALE_NAME_USER_DEFAULT,LCMAP_LOWERCASE,wide.data(),int(wide.size()),nullptr,0,nullptr,nullptr,0);if(count>0){std::wstring result(count,0);if(LCMapStringEx(LOCALE_NAME_USER_DEFAULT,LCMAP_LOWERCASE,wide.data(),int(wide.size()),result.data(),count,nullptr,nullptr,0))return result;}for(auto& c:wide)if(c>=L'A'&&c<=L'Z')c+=32;return wide;}
inline std::string parent(std::string text){text=trim(text);while(!text.empty()&&(text.back()=='/'||text.back()=='\\'))text.pop_back();const auto at=text.find_last_of("/\\");if(at==std::string::npos)return {};if(at==0)return text.substr(0,1);if(at==2&&text[1]==':'&&((text[0]>='A'&&text[0]<='Z')||(text[0]>='a'&&text[0]<='z')))return text.substr(0,3);return text.substr(0,at);}
inline std::string now(){SYSTEMTIME time{};GetSystemTime(&time);char text[32]{};std::snprintf(text,sizeof(text),"%04u-%02u-%02uT%02u:%02u:%02u.%03uZ",time.wYear,time.wMonth,time.wDay,time.wHour,time.wMinute,time.wSecond,time.wMilliseconds);return text;}
inline bool validTime(const std::string& text){unsigned y=0,m=0,d=0,h=0,n=0,s=0,ms=0;char rest=0;if(text.size()!=24||std::sscanf(text.c_str(),"%4u-%2u-%2uT%2u:%2u:%2u.%3uZ%c",&y,&m,&d,&h,&n,&s,&ms,&rest)!=7)return false;SYSTEMTIME time{};time.wYear=WORD(y);time.wMonth=WORD(m);time.wDay=WORD(d);time.wHour=WORD(h);time.wMinute=WORD(n);time.wSecond=WORD(s);time.wMilliseconds=WORD(ms);FILETIME file{};return SystemTimeToFileTime(&time,&file)!=FALSE;}
inline std::vector<Item> decode(std::istream& input){std::string line;if(!std::getline(input,line)||line!="MoonSprite recent-export-paths 1")return {};std::vector<Item> result;while(std::getline(input,line)){std::istringstream row(line);Item item;if(!(row>>std::quoted(item.filePath)>>std::quoted(item.exportedAt))||!(row>>std::ws).eof())continue;try{item.filePath=trim(item.filePath);if(item.filePath.empty())continue;const auto normalized=key(item.filePath);if(std::any_of(result.begin(),result.end(),[&](const auto& existing){return key(existing.filePath)==normalized;}))continue;if(!validTime(item.exportedAt))item.exportedAt="1970-01-01T00:00:00.000Z";result.push_back(std::move(item));if(result.size()==10)break;}catch(...){}}return result;}
inline std::vector<Item> load(const std::filesystem::path& path){std::ifstream in(path);return decode(in);}
inline bool record(const std::filesystem::path& storage,const std::string& filePath,const std::string& timestamp=now()) noexcept {try{const auto value=trim(filePath);if(value.empty())return false;auto items=load(storage);const auto normalized=key(value);items.erase(std::remove_if(items.begin(),items.end(),[&](const auto& item){return key(item.filePath)==normalized;}),items.end());items.insert(items.begin(),{value,timestamp});if(items.size()>10)items.resize(10);std::ostringstream out;out<<"MoonSprite recent-export-paths 1\n";for(const auto& item:items)out<<std::quoted(item.filePath)<<' '<<std::quoted(item.exportedAt)<<'\n';const auto text=out.str();if(!storage.parent_path().empty())std::filesystem::create_directories(storage.parent_path());writeExportBytesAtomic(storage,{text.begin(),text.end()});return true;}catch(...){return false;}}
}
