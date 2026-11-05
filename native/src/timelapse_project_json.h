#pragma once
#include "timelapse.h"
#include "project_reader.h"
#include "project_restore_report.h"
#include "legacy_json_number.h"
#include <set>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::project::timelapsejson {
using namespace winrt::Windows::Data::Json;
inline void fail(const char* why){throw Error(ErrorKind::Unsupported,std::string("Recording preserved: ")+why);}
inline void known(const JsonObject& o,const std::set<std::wstring>& names){for(const auto& pair:o)if(!names.count(std::wstring(pair.Key())))fail("unsupported recording metadata");}
inline double number(const JsonObject& o,const wchar_t* key,double fallback){if(!o.HasKey(key))return fallback;auto v=o.GetNamedValue(key);if(v.ValueType()!=JsonValueType::Number||!std::isfinite(v.GetNumber()))fail("invalid numeric recording metadata");return v.GetNumber();}
inline std::string string(const JsonObject& o,const wchar_t* key,const std::string& fallback={}){if(!o.HasKey(key))return fallback;auto v=o.GetNamedValue(key);if(v.ValueType()!=JsonValueType::String)fail("invalid text recording metadata");return winrt::to_string(v.GetString());}
inline bool boolean(const JsonObject& o,const wchar_t* key,bool fallback){if(!o.HasKey(key))return fallback;auto v=o.GetNamedValue(key);if(v.ValueType()!=JsonValueType::Boolean)fail("invalid boolean recording metadata");return v.GetBoolean();}
inline std::uint64_t safeInteger(double n){if(n<0||n>9007199254740991.||std::floor(n)!=n)fail("invalid recording range");return static_cast<std::uint64_t>(n);}
inline void png(const timelapse::Frame& f){const unsigned char sig[]{137,80,78,71,13,10,26,10};if(f.data.size()<24||f.data.size()>32ULL*1024*1024||!std::equal(std::begin(sig),std::end(sig),f.data.begin()))fail("invalid embedded PNG");auto be=[&](std::size_t at){std::uint32_t n=0;for(int i=0;i<4;++i)n=(n<<8)|f.data[at+i];return n;};if(be(16)!=std::uint32_t(f.width)||be(20)!=std::uint32_t(f.height))fail("recording PNG dimensions mismatch");}
inline timelapse::Settings decode(const JsonObject& o,const Archive& archive,std::set<std::string>& consumed,std::size_t budget,TimelapseRestoreReport* report=nullptr){
 known(o,{L"enabled",L"recordUndoSteps",L"quality",L"fps",L"speed",L"mode",L"snapshots"});timelapse::Settings s;
 auto field=[&](const JsonObject& object,const wchar_t* key)->IJsonValue{return object.HasKey(key)?object.GetNamedValue(key):nullptr;};
 auto isTrue=[&](const wchar_t* key){const auto v=field(o,key);return v&&v.ValueType()==JsonValueType::Boolean&&v.GetBoolean();};
 auto isText=[&](const wchar_t* key,const wchar_t* text){const auto v=field(o,key);return v&&v.ValueType()==JsonValueType::String&&v.GetString()==text;};
 auto setting=[&](const wchar_t* key,int fallback,int maximum){const auto v=field(o,key);return v&&v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?int(std::clamp(std::floor(v.GetNumber()+.5),1.,double(maximum))):fallback;};
 s.enabled=isTrue(L"enabled");s.recordUndoSteps=isTrue(L"recordUndoSteps");s.quality=isText(L"quality",L"low")?timelapse::Quality::Low:isText(L"quality",L"high")?timelapse::Quality::High:timelapse::Quality::Medium;s.mode=isText(L"mode",L"full")?timelapse::Mode::Full:timelapse::Mode::Smart;s.fps=setting(L"fps",12,60);s.speed=setting(L"speed",8,64);std::set<std::string> ids;std::size_t bytes=0;
 const auto snapshots=field(o,L"snapshots");if(!snapshots||snapshots.ValueType()!=JsonValueType::Array)return s;auto values=snapshots.GetArray();if(values.Size()>timelapse::fullFrameLimit)fail("recording frame count exceeds native limit");
 auto drop=[&](const char* reason){if(report)report->drop(reason);};
 for(const auto& value:values){
  if(value.ValueType()!=JsonValueType::Object){drop("invalid-metadata");continue;}
  const auto v=value.GetObject();known(v,{L"id",L"capturedAt",L"elapsedMs",L"width",L"height",L"changeScore",L"local",L"dataFile"});
  // Account for declared recording payloads even when their metadata is lost.
  // Keep unrelated/unknown resources subject to normal manifest admission.
  std::string file;const auto dataFile=field(v,L"dataFile");const bool embedded=dataFile&&dataFile.ValueType()==JsonValueType::String;
  if(v.HasKey(L"dataFile")&&v.GetNamedValue(L"dataFile").ValueType()==JsonValueType::String){file=winrt::to_string(v.GetNamedString(L"dataFile"));if(file.rfind("timelapse/",0)==0&&file.size()>14&&file.substr(file.size()-4)==".png")consumed.insert(file);}
  if(!v.HasKey(L"id")||v.GetNamedValue(L"id").ValueType()!=JsonValueType::String){drop("invalid-metadata");continue;}
  timelapse::Frame f;f.id=string(v,L"id");if(!timelapse::safeId(f.id))fail("invalid recording frame ID");
  if(!embedded&&!v.HasKey(L"local")){drop("invalid-metadata");continue;}
  if(!embedded){
   if(v.GetNamedValue(L"local").ValueType()!=JsonValueType::Object){drop("invalid-metadata");continue;}
   const auto local=v.GetNamedObject(L"local");known(local,{L"store",L"chunk",L"offset",L"length",L"checksum"});timelapse::Reference r;
   try{r.store=string(local,L"store");r.chunk=string(local,L"chunk");r.offset=safeInteger(number(local,L"offset",-1));r.length=safeInteger(number(local,L"length",0));const auto crc=safeInteger(number(local,L"checksum",-1));if(crc>0xffffffff||!timelapse::validReference(r)){drop("invalid-metadata");continue;}r.checksum=std::uint32_t(crc);}catch(const Error&){drop("invalid-metadata");continue;}
   // The legacy decoder returns snapshot.local unchanged, including insertion
   // order. Known fields are scalar/safe IDs, so Stringify positions identify
   // their exact top-level key order without reordering via WinRT map iteration.
   const auto encoded=std::wstring(local.Stringify());std::vector<std::pair<std::size_t,std::string>> keys;
   for(const auto* key:{L"store",L"chunk",L"offset",L"length",L"checksum"}){const auto position=encoded.find(std::wstring(L"\"")+key+L"\":");if(position!=std::wstring::npos)keys.emplace_back(position,winrt::to_string(key));}
   std::sort(keys.begin(),keys.end());for(const auto& key:keys)f.historyLocalKeys.push_back(key.second);
   f.local=std::move(r);
  }
  const auto width=legacyjson::number(field(v,L"width")),height=legacyjson::number(field(v,L"height"));
  if(!std::isfinite(width)||!std::isfinite(height)||width<1||height<1||std::floor(width)!=width||std::floor(height)!=height||width>9007199254740991.||height>9007199254740991.){drop("invalid-dimensions");continue;}
  if(width>2400||height>2400)fail("recording dimensions exceed native limit");f.width=int(width);f.height=int(height);
  if(embedded){
   if(file.empty()){drop("missing-data");continue;}
   if(file!="timelapse/"+f.id+".png")fail("invalid embedded recording path");
   if(!archive.entries().count(file)){drop("missing-data");continue;}
   f.data=archive.read(file,std::min<std::size_t>(32ULL*1024*1024,budget-bytes));if(f.data.empty()){drop("missing-data");continue;}
   png(f);if(f.data.size()>budget-bytes)fail("embedded recordings exceed archive budget");bytes+=f.data.size();consumed.insert(file);
   if(auto backing=archive.storedBacking(file))f.historyDataBacking=timelapse::HistoryDataBacking{std::move(backing),f.data.size()};
  }
  auto time=[&](const wchar_t* key){const auto n=legacyjson::number(field(v,key));const auto result=std::max(0.,std::trunc(std::isnan(n)?0.:n));if(!std::isfinite(result))fail("non-finite recording time exceeds native representation");return result;};
  f.capturedAt=time(L"capturedAt");f.elapsedMs=time(L"elapsedMs");const auto score=field(v,L"changeScore");f.historyChangeScoreUndefined=!(score&&score.ValueType()==JsonValueType::Number&&std::isfinite(score.GetNumber()));f.changeScore=f.historyChangeScoreUndefined?0.:std::clamp(score.GetNumber(),0.,1.);
  if(!ids.insert(f.id).second)fail("duplicate recording frame ID");s.snapshots.push_back(std::move(f));
 }
 if(report)report->timelapseFrames=s.snapshots.size();return s;
}

inline JsonObject encode(const timelapse::Settings& s,std::map<std::string,Bytes>& files){JsonObject o;auto text=[](JsonObject v,const wchar_t* k,const std::string& s){v.Insert(k,JsonValue::CreateStringValue(winrt::to_hstring(s)));};auto num=[](JsonObject v,const wchar_t* k,double n){if(!std::isfinite(n))fail("invalid recording number on save");v.Insert(k,JsonValue::CreateNumberValue(n));};o.Insert(L"enabled",JsonValue::CreateBooleanValue(s.enabled));o.Insert(L"recordUndoSteps",JsonValue::CreateBooleanValue(s.recordUndoSteps));text(o,L"quality",s.quality==timelapse::Quality::Low?"low":s.quality==timelapse::Quality::High?"high":"medium");text(o,L"mode",s.mode==timelapse::Mode::Full?"full":"smart");num(o,L"fps",s.fps);num(o,L"speed",s.speed);JsonArray snapshots;std::set<std::string> ids;for(const auto& f:s.snapshots){if(!timelapse::safeId(f.id)||!ids.insert(f.id).second)fail("invalid recording frame ID on save");JsonObject v;text(v,L"id",f.id);num(v,L"capturedAt",f.capturedAt);num(v,L"elapsedMs",f.elapsedMs);num(v,L"width",f.width);num(v,L"height",f.height);if(!f.historyChangeScoreUndefined)num(v,L"changeScore",f.changeScore);if(f.data.empty()){if(!f.local||!timelapse::validReference(*f.local))fail("missing recording payload on save");const auto& r=*f.local;JsonObject local;text(local,L"store",r.store);text(local,L"chunk",r.chunk);num(local,L"offset",double(r.offset));num(local,L"length",double(r.length));num(local,L"checksum",r.checksum);if(!f.historyLocalKeys.empty()){JsonObject ordered;std::set<std::string> keys;for(const auto& key:f.historyLocalKeys){const auto name=winrt::to_hstring(key);if(!local.HasKey(name)||!keys.insert(key).second)fail("invalid recording local field order");ordered.Insert(name,local.GetNamedValue(name));}if(keys.size()!=5)fail("incomplete recording local field order");local=ordered;}v.Insert(L"local",local);}else{png(f);const auto file="timelapse/"+f.id+".png";text(v,L"dataFile",file);files[file]=f.data;}snapshots.Append(v);}o.Insert(L"snapshots",snapshots);return o;}
}
