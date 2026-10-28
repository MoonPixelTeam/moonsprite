#pragma once
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <string>
namespace moon {
inline constexpr std::uint64_t projectCounterLimit=9007199254740991ULL;
inline std::uint64_t projectCounter(double value){return std::isfinite(value)&&value>=0&&value<=double(projectCounterLimit)&&std::floor(value)==value?std::uint64_t(value):0;}
inline std::string projectTimestamp(){const auto ms=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();const auto seconds=std::time_t(ms/1000);std::tm date{};gmtime_s(&date,&seconds);char text[40];std::snprintf(text,sizeof(text),"%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",date.tm_year+1900,date.tm_mon+1,date.tm_mday,date.tm_hour,date.tm_min,date.tm_sec,int(ms%1000));return text;}
struct ProjectInformation {
 std::uint64_t strokeCount=0,operationCount=0,drawingTimeMs=0;std::string createdAt,updatedAt;
 static ProjectInformation fresh(){ProjectInformation out;out.createdAt=out.updatedAt=projectTimestamp();return out;}
 void operation(){operationCount=std::min(projectCounterLimit,operationCount+1);updatedAt=projectTimestamp();}
 void drawing(std::int64_t duration){strokeCount=std::min(projectCounterLimit,strokeCount+1);const auto elapsed=std::uint64_t(std::max<std::int64_t>(0,duration));drawingTimeMs+=std::min(projectCounterLimit-drawingTimeMs,elapsed);}
};
inline std::string projectDuration(std::uint64_t milliseconds){const auto seconds=milliseconds/1000;std::ostringstream out;out<<std::setfill('0')<<std::setw(2)<<seconds/3600<<':'<<std::setw(2)<<(seconds%3600)/60<<':'<<std::setw(2)<<seconds%60;return out.str();}
inline std::string projectStorage(std::uint64_t bytes){if(bytes<1024)return std::to_string(bytes)+" B";const char* units[]{"KB","MB","GB"};double value=double(bytes);const char* unit=units[0];for(int i=0;i<3&&value>=1024;++i){value/=1024;unit=units[i];}std::ostringstream out;out<<std::fixed<<std::setprecision(value>=100?0:1)<<value<<' '<<unit;return out.str();}
}
