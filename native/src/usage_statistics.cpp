#include "usage_statistics.h"
#include <windows.h>
#include <roapi.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <ctime>
#include <iomanip>
#include <regex>
#include <sstream>
namespace moon::usage {
namespace {
using namespace winrt::Windows::Data::Json;
struct Apartment{HRESULT hr=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(hr)&&hr!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize usage statistics JSON");}~Apartment(){if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();}};
std::tm local(Milliseconds ms){std::time_t t=ms/1000;std::tm out{};localtime_s(&out,&t);return out;}
std::string formatted(const std::tm& date,const char* format){std::ostringstream out;out<<std::put_time(&date,format);return out.str();}
std::uint64_t count(const IJsonValue& v){if(!v||v.ValueType()!=JsonValueType::Number)return 0;const double n=v.GetNumber();return std::isfinite(n)?std::uint64_t(std::clamp(std::floor(n+.5),0.,9007199254740991.)):0;}
IJsonValue get(const JsonObject& o,const char* name){const auto k=winrt::to_hstring(name);return o.HasKey(k)?o.GetNamedValue(k):nullptr;}
std::string string(const IJsonValue& v){return v&&v.ValueType()==JsonValueType::String?winrt::to_string(v.GetString()):std::string{};}
std::string monday(Milliseconds at){auto d=local(at);d.tm_mday-=(d.tm_wday+6)%7;d.tm_hour=d.tm_min=d.tm_sec=0;d.tm_isdst=-1;return dateKey(std::mktime(&d)*1000LL);}
Milliseconds dateAt(const std::string& key){int y=0,m=0,d=0;std::sscanf(key.c_str(),"%d-%d-%d",&y,&m,&d);return localTime(y,m,d);}
}
Milliseconds now(){return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();}
Milliseconds localTime(int year,int month,int day,int hour,int minute,int second){std::tm d{};d.tm_year=year-1900;d.tm_mon=month-1;d.tm_mday=day;d.tm_hour=hour;d.tm_min=minute;d.tm_sec=second;d.tm_isdst=-1;return std::mktime(&d)*1000LL;}
std::string isoTime(Milliseconds ms){std::time_t t=ms/1000;std::tm d{};gmtime_s(&d,&t);std::ostringstream out;out<<std::put_time(&d,"%Y-%m-%dT%H:%M:%S")<<'.'<<std::setfill('0')<<std::setw(3)<<((ms%1000+1000)%1000)<<'Z';return out.str();}
std::string dateKey(Milliseconds at){return formatted(local(at),"%Y-%m-%d");}
std::string shiftedDateKey(Milliseconds at,int days){auto d=local(at);d.tm_mday+=days;d.tm_hour=d.tm_min=d.tm_sec=0;d.tm_isdst=-1;return dateKey(std::mktime(&d)*1000LL);}
Data empty(bool enabled,Milliseconds at){Data d;d.enabled=enabled;d.updatedAt=isoTime(at);return d;}
Data parse(const std::string& text,Milliseconds at){auto d=empty(true,at);if(text.empty())return d;try{Apartment apartment;const auto o=JsonObject::Parse(winrt::to_hstring(text));auto enabled=get(o,"enabled");d.enabled=!(enabled&&enabled.ValueType()==JsonValueType::Boolean&&!enabled.GetBoolean());d.firstUsedAt=string(get(o,"firstUsedAt"));const auto updated=string(get(o,"updatedAt"));if(!updated.empty())d.updatedAt=updated;
#define READ(name) d.name=count(get(o,#name))
 READ(launchCount);READ(totalUsageMs);READ(longestSessionMs);READ(completedSessionCount);READ(newProjectCount);READ(saveCount);READ(exportCount);READ(drawingTimeMs);READ(drawingStrokeCount);
#undef READ
 auto map=[&](const char* key,auto& dest,bool dates){const auto v=get(o,key);if(!v||v.ValueType()!=JsonValueType::Object)return;for(const auto& pair:v.GetObject()){auto k=winrt::to_string(pair.Key());if(!k.empty()&&(!dates||std::regex_match(k,std::regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))))dest[k]=count(pair.Value());}};map("exportFormats",d.exportFormats,false);map("dailyUsageMs",d.dailyUsageMs,true);const auto hours=get(o,"hourlyUsageMs");if(hours&&hours.ValueType()==JsonValueType::Array){const auto a=hours.GetArray();for(unsigned i=0;i<std::min(24u,a.Size());++i)d.hourlyUsageMs[i]=count(a.GetAt(i));}return d;}catch(...){return empty(true,at);}}
std::string encode(const Data& d){Apartment apartment;JsonObject o;o.SetNamedValue(L"version",JsonValue::CreateNumberValue(1));o.SetNamedValue(L"enabled",JsonValue::CreateBooleanValue(d.enabled));o.SetNamedValue(L"firstUsedAt",d.firstUsedAt.empty()?JsonValue::CreateNullValue():JsonValue::CreateStringValue(winrt::to_hstring(d.firstUsedAt)));o.SetNamedValue(L"updatedAt",JsonValue::CreateStringValue(winrt::to_hstring(d.updatedAt)));
#define WRITE(name) o.SetNamedValue(L ## #name,JsonValue::CreateNumberValue(double(d.name)))
 WRITE(launchCount);WRITE(totalUsageMs);WRITE(longestSessionMs);WRITE(completedSessionCount);WRITE(newProjectCount);WRITE(saveCount);WRITE(exportCount);WRITE(drawingTimeMs);WRITE(drawingStrokeCount);
#undef WRITE
 auto map=[&](const wchar_t* key,const auto& source){JsonObject values;for(const auto& [k,v]:source)values.SetNamedValue(winrt::to_hstring(k),JsonValue::CreateNumberValue(double(v)));o.SetNamedValue(key,values);};map(L"exportFormats",d.exportFormats);map(L"dailyUsageMs",d.dailyUsageMs);JsonArray hours;for(auto n:d.hourlyUsageMs)hours.Append(JsonValue::CreateNumberValue(double(n)));o.SetNamedValue(L"hourlyUsageMs",hours);return winrt::to_string(o.Stringify());}
void addInterval(Data& d,Milliseconds start,Milliseconds end){if(end<=start)return;while(start<end){auto date=local(start);const auto day=dateKey(start);const auto hour=date.tm_hour;date.tm_hour+=1;date.tm_min=date.tm_sec=0;date.tm_isdst=-1;auto boundary=std::mktime(&date)*1000LL;if(boundary<=start)boundary=start+3600000;const auto stop=std::min<Milliseconds>(boundary,end);const auto duration=std::uint64_t(stop-start);d.dailyUsageMs[day]+=duration;d.hourlyUsageMs[hour]+=duration;d.totalUsageMs+=duration;start=stop;}d.updatedAt=isoTime(end);}
Summary summarize(Data data,Milliseconds at){Summary s;s.data=std::move(data);for(const auto& [key,duration]:s.data.dailyUsageMs)if(duration>0)++s.totalUsageDays;int cursor=s.data.dailyUsageMs.count(dateKey(at))&&s.data.dailyUsageMs.at(dateKey(at))>0?0:-1;while(true){const auto found=s.data.dailyUsageMs.find(shiftedDateKey(at,cursor));if(found==s.data.dailyUsageMs.end()||found->second==0)break;++s.consecutiveUsageDays;--cursor;}for(int i=0;i<30;++i){const auto key=shiftedDateKey(at,i-29);const auto found=s.data.dailyUsageMs.find(key);const auto value=found==s.data.dailyUsageMs.end()?0:found->second;s.dailyTrend.push_back({key,value});s.last30DaysMs+=value;if(i>=23)s.last7DaysMs+=value;}std::map<std::string,std::uint64_t> weeks;for(const auto& [key,value]:s.data.dailyUsageMs)weeks[monday(dateAt(key))]+=value;const auto first=dateAt(monday(at));for(int i=0;i<12;++i){const auto key=shiftedDateKey(first,(i-11)*7);s.weeklyTrend.push_back({key,weeks[key]});}std::uint64_t maximum=0;for(int h=0;h<24;++h)if(s.data.hourlyUsageMs[h]>maximum){maximum=s.data.hourlyUsageMs[h];s.mostActiveHour=h;}s.averageSessionMs=s.data.launchCount?std::uint64_t(std::floor(double(s.data.totalUsageMs)/s.data.launchCount+.5)):0;return s;}
void Tracker::changed(Milliseconds at){dirty_=true;data_.updatedAt=isoTime(at);if(!persistAt_)persistAt_=at+2000;}
void Tracker::account(Milliseconds at){if(!data_.enabled||!accounted_)return;addInterval(data_,*accounted_,at);if(session_&&at>=*session_)data_.longestSessionMs=std::max(data_.longestSessionMs,std::uint64_t(at-*session_));accounted_=at;}
void Tracker::initialize(const std::string& source,Milliseconds at){if(initialized_)return;data_=parse(source,at);initialized_=true;lastPeriodic_=at;if(data_.enabled){if(data_.firstUsedAt.empty())data_.firstUsedAt=isoTime(at);++data_.launchCount;session_=accounted_=at;changed(at);persistAt_=at;}}
void Tracker::setEnabled(bool enabled,Milliseconds at){if(!initialized_||data_.enabled==enabled)return;if(!enabled){account(at);if(session_)++data_.completedSessionCount;session_.reset();accounted_.reset();}else{if(data_.firstUsedAt.empty())data_.firstUsedAt=isoTime(at);session_=accounted_=at;}data_.enabled=enabled;changed(at);persistAt_=at;}
void Tracker::reset(Milliseconds at){if(!initialized_)return;const auto enabled=data_.enabled;data_=empty(enabled,at);session_.reset();accounted_.reset();if(enabled){data_.firstUsedAt=isoTime(at);data_.launchCount=1;session_=accounted_=at;}changed(at);persistAt_=at;}
void Tracker::recordEvent(const std::string& event,Milliseconds at){if(!initialized_||!data_.enabled)return;if(event=="newProject")++data_.newProjectCount;else if(event=="save")++data_.saveCount;else if(event=="drawingStroke")++data_.drawingStrokeCount;else return;changed(at);}
void Tracker::recordDrawing(bool stroke,Milliseconds duration,Milliseconds at){if(!initialized_||!data_.enabled||(!stroke&&duration<=0))return;if(stroke)++data_.drawingStrokeCount;data_.drawingTimeMs+=std::uint64_t(std::max<Milliseconds>(0,duration));changed(at);}
void Tracker::recordExport(const std::string& format,Milliseconds at){if(!initialized_||!data_.enabled)return;++data_.exportCount;++data_.exportFormats[format];changed(at);}
Summary Tracker::snapshot(Milliseconds at)const{auto copy=data_;if(initialized_&&copy.enabled&&accounted_){addInterval(copy,*accounted_,at);if(session_&&at>=*session_)copy.longestSessionMs=std::max(copy.longestSessionMs,std::uint64_t(at-*session_));}return summarize(std::move(copy),at);}
void Tracker::flush(Milliseconds at){if(initialized_&&data_.enabled){account(at);changed(at);persistAt_=at;}}
bool Tracker::tick(Milliseconds at){if(!initialized_)return false;if(data_.enabled&&at-lastPeriodic_>=60000){account(at);changed(at);lastPeriodic_=at;persistAt_=at;}return dirty_&&persistAt_&&at>=*persistAt_;}
}
