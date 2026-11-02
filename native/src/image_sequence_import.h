#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
// Aseprite UI declares ui::TRANSPARENT; do not leak the Win32 macro.
#ifdef TRANSPARENT
#undef TRANSPARENT
#endif
#include "document.h"
#include "layer_compositor.h"
#include "image_export.h"
#include "palette_extraction.h"
#include <functional>
#include <regex>
#include <set>
#include <map>
#include <fstream>
#include <cmath>
#include <codecvt>
#include <locale>
#include <limits>
#include <cctype>

namespace moon::image_sequence {
// legacy core/image-sequence.ts: preserve first-batch placement, sort only
// consecutive trailing numbers, and require consistent zero padding.
inline std::vector<std::vector<std::string>> batches(const std::vector<std::string>& paths){
 struct Item{std::string path,digits;std::uint64_t number;};
 auto key=[](std::string s){std::replace(s.begin(),s.end(),'\\','/');if(s.empty())return s;auto wide=std::filesystem::u8path(s).wstring();const int size=LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,wide.data(),int(wide.size()),nullptr,0,nullptr,nullptr,0);if(size<=0)throw std::runtime_error("Cannot normalize image sequence path");std::wstring lower(size,0);if(!LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,wide.data(),int(wide.size()),lower.data(),size,nullptr,nullptr,0))throw std::runtime_error("Cannot normalize image sequence path");return std::filesystem::path(lower).u8string();};
 std::vector<std::string> unique;std::set<std::string> seen;
 std::map<std::string,std::vector<Item>> groups;
 const std::regex pattern(R"(^(.*?)([0-9]+)(\.(?:png|jpe?g|bmp|webp))$)",std::regex::icase);
 for(const auto& path:paths){if(!seen.insert(key(path)).second)continue;unique.push_back(path);std::smatch match;std::string normalized=path;std::replace(normalized.begin(),normalized.end(),'\\','/');if(!std::regex_match(normalized,match,pattern))continue;try{const auto n=std::stoull(match[2].str());if(n>9007199254740991ull)continue;groups[key(match[1].str())+char(0)+key(match[3].str())].push_back({path,match[2].str(),n});}catch(const std::exception&){} }
 std::map<std::string,std::vector<std::string>> sequence;
 for(auto& group:groups){auto& items=group.second;std::stable_sort(items.begin(),items.end(),[](const auto& a,const auto& b){return a.number<b.number;});std::vector<Item> run;
  const auto flush=[&]{if(run.size()<2)return;std::vector<std::string> values;for(const auto& i:run)values.push_back(i.path);for(const auto& i:run)sequence[i.path]=values;};
  for(const auto& item:items){if(!run.empty()){auto expected=std::to_string(item.number);if(expected.size()<run.back().digits.size())expected.insert(0,run.back().digits.size()-expected.size(),'0');if(item.number!=run.back().number+1||item.digits!=expected){flush();run.clear();}}run.push_back(item);}flush();
 }
 std::vector<std::vector<std::string>> result;seen.clear();for(const auto& path:unique){if(seen.count(path))continue;auto found=sequence.find(path);auto batch=found==sequence.end()?std::vector<std::string>{path}:found->second;for(const auto& p:batch)seen.insert(p);result.push_back(std::move(batch));}return result;
}
enum class Choice{Cancel,Separate,Animation};
inline int duration(double value){return std::isfinite(value)?int(std::clamp(std::trunc(value),1.,60000.)):100;}
struct Preference{Choice choice=Choice::Cancel;int duration=100;};
struct Settings{double duration=100;bool repeat=false,remember=false;std::optional<std::vector<std::size_t>> selected;};
// Native preference storage adapts localStorage to the existing atomic file writer.
inline std::optional<Preference> load(const std::filesystem::path& path){std::ifstream in(path);std::string version,choice;double value;if(!(in>>version>>choice>>value)||version!="moon-image-sequence-v1"||!std::isfinite(value)||(choice!="animation"&&choice!="separate"))return {};return Preference{choice=="animation"?Choice::Animation:Choice::Separate,duration(value)};}
inline bool save(const std::filesystem::path& path,Preference pref){try{if(pref.choice==Choice::Cancel)return false;std::filesystem::create_directories(path.parent_path());const auto text=std::string("moon-image-sequence-v1\n")+(pref.choice==Choice::Animation?"animation":"separate")+" "+std::to_string(duration(pref.duration))+"\n";writeExportBytesAtomic(path,{text.begin(),text.end()});return true;}catch(const std::exception&){return false;}}
struct Host{
 std::function<Choice(const std::vector<std::string>&,Settings&)> ask;
 std::function<bool(const std::string&)> open;
 std::function<Document(const std::string&)> read;
 std::function<void(Document)> add;
 std::function<Document(std::function<Document()>)> work;
 std::function<void(const std::string&)> error;
};
inline bool open(const std::vector<std::string>& paths,const std::filesystem::path& preferencePath,const Host& host){
 bool opened=false;auto repeated=load(preferencePath);
 for(const auto& batch:batches(paths)){
  if(batch.size()==1){opened=host.open(batch.front())||opened;continue;}
  Settings settings;settings.duration=repeated?repeated->duration:100;
  const auto choice=repeated?repeated->choice:host.ask(batch,settings);
  if(choice!=Choice::Animation&&choice!=Choice::Separate)break;
  std::vector<std::string> selected;for(std::size_t i=0;i<batch.size();++i)if(!settings.selected||std::find(settings.selected->begin(),settings.selected->end(),i)!=settings.selected->end())selected.push_back(batch[i]);
  if(selected.empty())continue;
  const Preference decision{choice,duration(settings.duration)};
  if(settings.repeat||settings.remember)repeated=decision;
  if(settings.remember&&!save(preferencePath,decision))host.error("无法保存图片序列提醒设置，下次仍会询问。");
  if(choice==Choice::Separate){for(const auto& path:selected)opened=host.open(path)||opened;continue;}
  try{
   const auto assemble=[&]() -> Document {
   int width=0,height=0;timeline::State timeline;Document seed(1,1);timeline.layers=seed.timeline().state().layers;std::vector<std::vector<Pixel>> surfaces;
   for(std::size_t n=0;n<selected.size();++n){auto source=host.read(selected[n]);if(!width){width=source.width();height=source.height();if(selected.size()>10000||std::uint64_t(width)*height*(selected.size()+2)*sizeof(Pixel)>256ull*1024*1024)throw std::length_error("图片序列超出当前原生像素内存限制。");}
    if(source.width()!=width||source.height()!=height||source.timeline().state().frames.size()!=1)throw std::runtime_error("这些图片的尺寸不一致，或包含已有动画，未合并。请重新选择并分别打开。");
    surfaces.push_back(compositeNormalRegion(source.timeline(),source.frame().id,{0,0,width,height}));
   }
   std::unordered_set<Pixel> exact;for(const auto& pixels:surfaces){for(auto pixel:pixels){if(pixel>>24)exact.insert(pixel);if(exact.size()>4096)break;}if(exact.size()>4096)break;}
   const auto colors=extractImportedPalette(surfaces,256,exact.size()<=4096?std::numeric_limits<std::size_t>::max():262144);
   auto palette=seed.palette();palette.entries.clear();palette.slots.clear();int id=1;for(auto color:colors){const auto number=std::to_string(id);palette.entries.push_back({id,U"颜色 "+std::u32string(number.begin(),number.end()),color});palette.slots.push_back(id++);}palette.nextId=id;palette.slots.resize((palette.slots.size()+palette.columns-1)/palette.columns*palette.columns);
   for(std::size_t n=0;n<surfaces.size();++n){const auto frame="frame-sequence-"+std::to_string(n+1);timeline.frames.push_back({frame,decision.duration});DocumentCel cel;cel.id="cel-sequence-"+std::to_string(n+1);cel.layerId=timeline.layers.front().id;cel.frameId=frame;cel.surface=timeline::Surface{width,height,0,0,{},{},timeline::LinkedPixelStorage(std::move(surfaces[n]))};timeline.cels.push_back(std::move(cel));}
   auto name=std::filesystem::u8path(selected.front()).filename().u8string();name=std::regex_replace(name,std::regex(R"([0-9]+\.[^.]+$)"),"");while(!name.empty()&&(name.back()=='-'||name.back()=='_'||name.back()==' '))name.pop_back();if(name.empty())name="Animation";
   GUID guid{};if(FAILED(CoCreateGuid(&guid)))throw std::runtime_error("Cannot create image sequence project ID");wchar_t guidText[40]{};if(!StringFromGUID2(guid,guidText,40))throw std::runtime_error("Cannot format image sequence project ID");std::wstring_convert<std::codecvt_utf8<wchar_t>> guidUtf;
   std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t> utf;auto result=Document::fromImported(width,height,std::move(timeline),std::move(palette),"image-sequence-native-"+guidUtf.to_bytes(guidText),utf.from_bytes(name),std::make_shared<const std::vector<std::uint8_t>>());result.clearSourceArchiveForNewSnapshot();result.markRecovered(utf.from_bytes(name));result.setImportedLoop(true);return result;};
   host.add(host.work?host.work(assemble):assemble());opened=true;
  }catch(const std::exception& error){host.error(error.what());}
 }
 return opened;
}
}
