#include "javascript_text.h"
#include "local_history_diff.h"
#include "local_history_raster_cost.h"
#include "local_history_resource_cost.h"
#include "text_project_json.h"
#include "document.h"
#include "tilemap_project_json.h"
#include "project_import.h"
#include "gradient_map_presets.h"
#include "legacy_json_number.h"
#include <algorithm>
#include <cstring>
#include <cwchar>
#include <cmath>
#include <charconv>
#include <unordered_map>
#include <unordered_set>
#include <tuple>
#include <limits>
#include <codecvt>
#include <locale>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
namespace moon::local_history {
namespace {
// Shared append-only runtime-value construction for decoded field adapters.
class CompareAppend {
 HistoryCompareDocument& graph;project::Limits limits;std::size_t retained=0,byteCount=0;
public:
 using K=HistoryCompareValue::Kind;
 CompareAppend(HistoryCompareDocument& value,project::Limits budget):graph(value),limits(budget){
  if(graph.values.size()>limits.maxEntries)throw project::Error(project::ErrorKind::Limit,"History graph exceeds node budget");
  // A complete document assembles multiple fragments. Account for retained
  // nodes as well, so each append cannot silently restart its byte budget.
  std::unordered_set<const Bytes*> buffers;
  for(const auto& node:graph.values){
   if(node.kind==K::String){if(node.text.size()>limits.manifestBytes/2-retained)throw project::Error(project::ErrorKind::Limit,"History strings exceed budget");retained+=node.text.size();}
   if(node.kind==K::View&&node.view.buffer&&buffers.insert(node.view.buffer.get()).second){if(node.view.buffer->size()>limits.expandedBytes-byteCount)throw project::Error(project::ErrorKind::Limit,"History bytes exceed budget");byteCount+=node.view.buffer->size();}
  }
 }
 std::size_t node(HistoryCompareValue value={}){if(graph.values.size()>=limits.maxEntries)throw project::Error(project::ErrorKind::Limit,"History graph exceeds node budget");graph.values.push_back(std::move(value));return graph.values.size()-1;}
 std::size_t container(K kind,std::size_t length=0){HistoryCompareValue value;value.kind=kind;value.arrayLength=length;return node(std::move(value));}
 std::size_t number(double value){HistoryCompareValue out;out.kind=K::Number;out.number=value;return node(std::move(out));}
 std::size_t boolean(bool value){HistoryCompareValue out;out.kind=K::Boolean;out.boolean=value;return node(std::move(out));}
 std::size_t null(){HistoryCompareValue out;out.kind=K::Null;return node(std::move(out));}
 std::size_t text(std::u16string value){if(value.size()>limits.manifestBytes/2-retained)throw project::Error(project::ErrorKind::Limit,"History strings exceed budget");retained+=value.size();HistoryCompareValue out;out.kind=K::String;out.text=std::move(value);return node(std::move(out));}
 std::size_t string(const std::string& value){const auto utf16=winrt::to_hstring(value);std::u16string out;for(auto c:utf16)out.push_back(char16_t(c));return text(std::move(out));}
 std::size_t wide(const std::u32string& value){std::u16string out;for(auto c:value){if(c>0x10ffff||(c>=0xd800&&c<=0xdfff))throw std::invalid_argument("Invalid history Unicode");if(c<0x10000)out.push_back(char16_t(c));else{c-=0x10000;out.push_back(char16_t(0xd800+(c>>10)));out.push_back(char16_t(0xdc00+(c&1023)));}}return text(std::move(out));}
 void add(std::size_t owner,std::string key,std::size_t child){graph.values[owner].properties.emplace_back(std::move(key),child);}
 std::size_t view(const void* data,std::size_t count,const char* type){if(count>limits.expandedBytes-byteCount)throw project::Error(project::ErrorKind::Limit,"History bytes exceed budget");byteCount+=count;Bytes bytes(count);if(count)std::memcpy(bytes.data(),data,count);HistoryCompareValue out;out.kind=K::View;out.view={std::make_shared<const Bytes>(std::move(bytes)),0,count,type};return node(std::move(out));}
};
std::size_t compareColor(CompareAppend& b,std::uint32_t color){const auto root=b.container(CompareAppend::K::Object);for(int i=0;i<4;++i)b.add(root,std::string(1,"rgba"[i]),b.number((color>>(8*i))&255));return root;}
std::size_t compareGradientMap(CompareAppend& b,const GradientMapSettings& map){
 const auto normalized=normalizeGradientMap(map);if(gradientMapSignature(normalized)!=gradientMapSignature(map)||map.dither<0||map.dither>8)throw std::invalid_argument("Unnormalized history gradient map");
 const auto root=b.container(CompareAppend::K::Object),stops=b.container(CompareAppend::K::Array,map.stops.size());for(std::size_t i=0;i<map.stops.size();++i){const auto& stop=map.stops[i];if(!std::isfinite(stop.position)||stop.position<0||stop.position>1||(stop.color>>24)!=255||(i&&stop.position<map.stops[i-1].position))throw std::invalid_argument("Unnormalized history gradient stop");const auto node=b.container(CompareAppend::K::Object);b.add(node,"position",b.number(std::max(0.,stop.position)));b.add(node,"color",compareColor(b,stop.color));b.add(stops,std::to_string(i),node);}if(map.stops.size()<2||map.stops.size()>256)throw std::invalid_argument("Invalid history gradient stops");b.add(root,"stops",stops);b.add(root,"mode",b.string(map.steps?"steps":"continuous"));b.add(root,"dither",b.string(GradientMapPresetStore::ditherNames()[map.dither]));b.add(root,"reverse",b.boolean(map.reverse));return root;
}
std::size_t compareLayerStyles(CompareAppend& b,const timeline::ColorOverlayStyle& style){
 using K=CompareAppend::K;const auto& st=style.stroke;const auto& sh=style.shadow;const auto& glow=style.innerGlow;
 if(st.position<0||st.position>2||st.kernel<0||st.kernel>3||st.size<1||st.size>64||st.darkness<0||st.darkness>100||st.directions>255||sh.offsetX<-64||sh.offsetX>64||sh.offsetY<-64||sh.offsetY>64||sh.blur<0||sh.blur>32||sh.darkness<0||sh.darkness>100||glow.size<1||glow.size>32||style.gradientAngle<0||style.gradientAngle>359||style.gradientDither<0||style.gradientDither>8)throw std::invalid_argument("Invalid history layer styles");
 const auto root=b.container(K::Object);b.add(root,"enabled",b.boolean(style.enabled));const auto map=compareGradientMap(b,style.gradientMap);b.add(map,"enabled",b.boolean(style.gradientMapEnabled));b.add(map,"scope",b.string("layer"));b.add(root,"gradientMap",map);
 const auto stroke=b.container(K::Object);b.add(stroke,"enabled",b.boolean(st.enabled));b.add(stroke,"color",compareColor(b,st.color));b.add(stroke,"size",b.number(st.size));const char* positions[]{"inside","outside","both"};const char* kernels[]{"round","square","horizontal","vertical"};b.add(stroke,"position",b.string(positions[st.position]));b.add(stroke,"kernel",b.string(kernels[st.kernel]));const auto directions=b.container(K::Object);const char* names[]{"nw","n","ne","w","e","sw","s","se"};for(int i=0;i<8;++i)b.add(directions,names[i],b.boolean((st.directions&(1u<<i))!=0));b.add(stroke,"directions",directions);b.add(stroke,"smartHue",b.boolean(st.smartHue));b.add(stroke,"smartHueDarkness",b.number(st.darkness));b.add(stroke,"followOpacity",b.boolean(st.followOpacity));b.add(root,"stroke",stroke);
 const auto shadowOffset=[&](const wchar_t* key,int value){if(value||style.preservedJson.empty())return double(value);using namespace winrt::Windows::Data::Json;const auto raw=JsonValue::Parse(winrt::to_hstring(style.preservedJson));if(raw.ValueType()!=JsonValueType::Object)return double(value);const auto root=raw.GetObject();if(!root.HasKey(L"shadow")||root.GetNamedValue(L"shadow").ValueType()!=JsonValueType::Object)return double(value);const auto shadow=root.GetNamedObject(L"shadow");if(!shadow.HasKey(key))return double(value);const auto n=project::legacyjson::number(shadow.GetNamedValue(key));return n>=-.5&&n<=0?std::copysign(0.,n):double(value);};
 const auto shadow=b.container(K::Object);b.add(shadow,"enabled",b.boolean(sh.enabled));b.add(shadow,"color",compareColor(b,sh.color));b.add(shadow,"offsetX",b.number(shadowOffset(L"offsetX",sh.offsetX)));b.add(shadow,"offsetY",b.number(shadowOffset(L"offsetY",sh.offsetY)));b.add(shadow,"blur",b.number(sh.blur));b.add(shadow,"smartShadow",b.boolean(sh.smart));b.add(shadow,"smartShadowDarkness",b.number(sh.darkness));b.add(root,"shadow",shadow);
 const auto inner=b.container(K::Object);b.add(inner,"enabled",b.boolean(glow.enabled));b.add(inner,"color",compareColor(b,glow.color));b.add(inner,"size",b.number(glow.size));b.add(root,"innerGlow",inner);
 const auto overlay=b.container(K::Object);b.add(overlay,"enabled",b.boolean(style.overlayEnabled));b.add(overlay,"color",compareColor(b,style.color));b.add(root,"colorOverlay",overlay);
 const auto gradient=b.container(K::Object);b.add(gradient,"enabled",b.boolean(style.gradientEnabled));b.add(gradient,"from",compareColor(b,style.gradientFrom));b.add(gradient,"to",compareColor(b,style.gradientTo));b.add(gradient,"angle",b.number(style.gradientAngle));b.add(gradient,"dither",b.string(GradientMapPresetStore::ditherNames()[style.gradientDither]));b.add(root,"gradientOverlay",gradient);return root;
}
bool normalizedDecodedName(const std::u32string& name,std::size_t maxUnits=std::numeric_limits<std::size_t>::max()){
 const auto whitespace=[](char32_t c){return c==9||c==10||c==11||c==12||c==13||c==32||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;};
 if(name.empty()||whitespace(name.front())||whitespace(name.back()))return false;
 std::size_t units=0;for(const auto c:name){const std::size_t count=c>0xffff?2:1;if(count>maxUnits-units)return false;units+=count;}return true;
}
std::size_t compareJsonTree(CompareAppend& b,const winrt::Windows::Data::Json::IJsonValue& value){
 using namespace winrt::Windows::Data::Json;using K=CompareAppend::K;std::vector<std::pair<IJsonValue,std::size_t>> pending;
 const auto append=[&](const IJsonValue& v){switch(v.ValueType()){
 case JsonValueType::Null:return b.null();case JsonValueType::Boolean:return b.boolean(v.GetBoolean());case JsonValueType::Number:return b.number(v.GetNumber());
 case JsonValueType::String:{const auto s=v.GetString();return b.text(std::u16string(reinterpret_cast<const char16_t*>(s.data()),s.size()));}
 case JsonValueType::Array:case JsonValueType::Object:{const auto root=b.container(v.ValueType()==JsonValueType::Array?K::Array:K::Object,v.ValueType()==JsonValueType::Array?v.GetArray().Size():0);pending.emplace_back(v,root);return root;}
 default:throw std::invalid_argument("Unsupported text rectangle JSON value");}};
 const auto root=append(value);while(!pending.empty()){const auto [v,owner]=pending.back();pending.pop_back();if(v.ValueType()==JsonValueType::Array){const auto array=v.GetArray();for(unsigned i=0;i<array.Size();++i)b.add(owner,std::to_string(i),append(array.GetAt(i)));}else{const auto object=v.GetObject();for(const auto& key:project::textjson::orderedObjectKeys(object))b.add(owner,winrt::to_string(key),append(object.GetNamedValue(key)));}}return root;
}
bool sameDecodedText(const std::optional<TextCelData>& a,const std::optional<TextCelData>& c){
 if(bool(a)!=bool(c))return false;if(!a)return true;const auto& x=*a;const auto& y=*c;
 if(std::tie(x.text,x.fontFamily,x.fontSize,x.lineSpacing,x.letterSpacing,x.actualSpacing,x.smooth,x.boxed,x.align,x.color,x.originX,x.originY,x.boxWidth,x.boxHeight)!=std::tie(y.text,y.fontFamily,y.fontSize,y.lineSpacing,y.letterSpacing,y.actualSpacing,y.smooth,y.boxed,y.align,y.color,y.originX,y.originY,y.boxWidth,y.boxHeight)||x.styleRuns.size()!=y.styleRuns.size()||x.transforms.size()!=y.transforms.size())return false;
 for(std::size_t i=0;i<x.styleRuns.size();++i)if(x.styleRuns[i].start!=y.styleRuns[i].start||x.styleRuns[i].end!=y.styleRuns[i].end||!textStyleEqual(x.styleRuns[i],y.styleRuns[i]))return false;
 const auto number=[](double u,double v){return u==v&&(u!=0||std::signbit(u)==std::signbit(v));};const auto rect=[&](const TextRect& u,const TextRect& v){return number(u.x,v.x)&&number(u.y,v.y)&&number(u.width,v.width)&&number(u.height,v.height)&&u.projectProperties==v.projectProperties;};
 for(std::size_t i=0;i<x.transforms.size();++i){const auto& u=x.transforms[i];const auto& v=y.transforms[i];if(!rect(u.source,v.source)||!rect(u.target,v.target)||!number(u.angle,v.angle)||bool(u.shear)!=bool(v.shear)||(u.shear&&(u.shear->axis!=v.shear->axis||u.shear->edge!=v.shear->edge||!number(u.shear->amount,v.shear->amount))))return false;}return true;
}
std::size_t compareTextCel(CompareAppend& b,const TextCelData& text,const winrt::Windows::Data::Json::JsonObject& raw){
 using namespace winrt::Windows::Data::Json;using K=CompareAppend::K;using namespace project::textjson;
 // Native integral fields cannot retain JS rounded/truncated negative zero.
 // Recover its sign from the same source field that supplied the normalized DTO.
 const auto spacing=[&](const JsonObject& source,const wchar_t* key,int normalized){const auto n=coerced(source,key,0);return normalized==0&&n>=-.5&&n<=0?std::copysign(0.,n):double(normalized);};
 const auto root=b.container(K::Object);b.add(root,"text",b.text(text.text));const auto font=fontUnits(text.fontFamily);b.add(root,"fontFamily",b.text(std::u16string(reinterpret_cast<const char16_t*>(font.data()),font.size())));b.add(root,"fontSize",b.number(text.fontSize));b.add(root,"lineSpacing",b.number(spacing(raw,L"lineSpacing",text.lineSpacing)));b.add(root,"letterSpacing",b.number(spacing(raw,L"letterSpacing",text.letterSpacing)));b.add(root,"spacingMode",b.string(text.actualSpacing?"actual":"font"));b.add(root,"antialias",b.string(text.smooth?"smooth":"pixel"));b.add(root,"layoutMode",b.string(text.boxed?"box":"free"));b.add(root,"textAlign",b.string(text.align==TextCelData::Align::Center?"center":text.align==TextCelData::Align::Right?"right":"left"));b.add(root,"color",compareColor(b,text.color));
 if(!text.styleRuns.empty()){const auto runs=b.container(K::Array,text.styleRuns.size());for(std::size_t i=0;i<text.styleRuns.size();++i){const auto& run=text.styleRuns[i];JsonObject source;
  if(raw.HasKey(L"styleRuns")&&raw.GetNamedValue(L"styleRuns").ValueType()==JsonValueType::Array){const auto candidates=raw.GetNamedArray(L"styleRuns");for(unsigned n=candidates.Size();n>0;--n){const auto v=candidates.GetAt(n-1);if(v.ValueType()!=JsonValueType::Object)continue;const auto r=v.GetObject();const auto start=std::clamp(std::trunc(coerced(r,L"start",0)),0.,double(text.text.size())),end=std::clamp(std::trunc(coerced(r,L"end",start)),start,double(text.text.size()));if(start<=run.start&&end>run.start&&(finite(r,L"fontSize")||finite(r,L"lineSpacing")||finite(r,L"letterSpacing")||truthy(r,L"color"))){source=r;break;}}}
  const auto item=b.container(K::Object);b.add(runs,std::to_string(i),item);b.add(item,"start",b.number(run.start));b.add(item,"end",b.number(run.end));if(run.fontSize)b.add(item,"fontSize",b.number(*run.fontSize));if(run.lineSpacing)b.add(item,"lineSpacing",b.number(spacing(source,L"lineSpacing",*run.lineSpacing)));if(run.letterSpacing)b.add(item,"letterSpacing",b.number(spacing(source,L"letterSpacing",*run.letterSpacing)));b.add(item,"color",run.color?compareColor(b,*run.color):b.node());}b.add(root,"styleRuns",runs);}
 const auto origin=[&](const wchar_t* key,std::optional<int> value){if(!value)return;const auto n=std::trunc(num(raw,key,0));if(n!=*value)throw std::invalid_argument("Text history origin exceeds native coordinates");b.add(root,winrt::to_string(key),b.number(n));};origin(L"originX",text.originX);origin(L"originY",text.originY);if(text.boxed){b.add(root,"boxWidth",b.number(text.boxWidth));b.add(root,"boxHeight",b.number(text.boxHeight));}
 if(!text.transforms.empty()){
  const auto transforms=b.container(K::Array,text.transforms.size());std::size_t index=0;for(const auto& v:raw.GetNamedArray(L"transforms")){if(v.ValueType()!=JsonValueType::Object)continue;const auto source=v.GetObject(),from=object(source,L"source"),to=object(source,L"target");if(!validTextRect(rect(from))||!validTextRect(rect(to)))continue;if(index>=text.transforms.size())throw std::invalid_argument("Inconsistent text transform source");const auto& transform=text.transforms[index];const auto item=b.container(K::Object);b.add(transforms,std::to_string(index++),item);b.add(item,"source",compareJsonTree(b,from));b.add(item,"target",compareJsonTree(b,to));b.add(item,"angle",b.number(transform.angle));if(transform.shear){const auto shear=b.container(K::Object);b.add(shear,"axis",b.string(std::string(1,transform.shear->axis)));b.add(shear,"edge",b.string(std::string(1,transform.shear->edge)));b.add(shear,"amount",b.number(transform.shear->amount));b.add(item,"shear",shear);}}
  if(index!=text.transforms.size())throw std::invalid_argument("Missing text transform source");b.add(root,"transforms",transforms);
 }return root;
}

}
HistoryCompareResourceRoots appendDecodedHistoryResourceValues(HistoryCompareDocument& graph,const Document& document,project::Limits limits){
 const auto start=graph.values.size();
 try{
  CompareAppend b(graph,limits);using K=HistoryCompareValue::Kind;
  HistoryCompareResourceRoots roots{};
  const auto& brushes=document.projectBrushes();roots.customBrushes=b.container(K::Array,brushes.size());
  for(std::size_t i=0;i<brushes.size();++i){const auto& resource=brushes[i];const auto& brush=resource.brush;const auto& metadata=resource.metadata;
   if(brush.width<1||brush.height<1||std::uint64_t(brush.width)*brush.height!=brush.coverage.size()||(!brush.colors.empty()&&brush.colors.size()!=brush.coverage.size())||metadata.width!=brush.width||metadata.height!=brush.height||metadata.sourceX.value_or(0)!=brush.sourceX||metadata.sourceY.value_or(0)!=brush.sourceY)throw std::invalid_argument("History brush is not a normalized decoded resource");
   const auto item=b.container(K::Object);b.add(roots.customBrushes,std::to_string(i),item);
   b.add(item,"id",b.string(metadata.id));b.add(item,"name",b.string(metadata.name));b.add(item,"width",b.number(brush.width));b.add(item,"height",b.number(brush.height));
   b.add(item,"coverage",b.view(brush.coverage.data(),brush.coverage.size(),"Uint8Array"));
   b.add(item,"colors",brush.colors.empty()?b.node({}):b.view(brush.colors.data(),brush.colors.size()*sizeof(Pixel),"Uint32Array"));
   b.add(item,"sourceX",metadata.sourceX?b.number(*metadata.sourceX):b.node({}));b.add(item,"sourceY",metadata.sourceY?b.number(*metadata.sourceY):b.node({}));
  }
  const auto& images=document.referenceImages();validateReferenceLibrary(images);roots.referenceImages=b.container(K::Array,images.size());
  std::unordered_map<const void*,std::size_t> imageViews;
  for(std::size_t i=0;i<images.size();++i){const auto& image=images[i];const auto item=b.container(K::Object);b.add(roots.referenceImages,std::to_string(i),item);
   b.add(item,"id",b.string(image.id));b.add(item,"width",b.number(image.width));b.add(item,"height",b.number(image.height));
   auto found=imageViews.find(image.pixels.get());if(found==imageViews.end())found=imageViews.emplace(image.pixels.get(),b.view(image.pixels->data(),image.pixels->size()*sizeof(Pixel),"Uint8ClampedArray")).first;
   b.add(item,"pixels",found->second);
  }
  const auto& slices=document.slices();roots.slices=b.container(K::Array,slices.size());
  for(std::size_t i=0;i<slices.size();++i){const auto& slice=slices[i];const auto item=b.container(K::Object);b.add(roots.slices,std::to_string(i),item);b.add(item,"id",b.string(slice.id));b.add(item,"name",b.wide(slice.name));b.add(item,"x",b.number(slice.rect.x));b.add(item,"y",b.number(slice.rect.y));b.add(item,"width",b.number(slice.rect.width));b.add(item,"height",b.number(slice.rect.height));}
  return roots;
 }catch(...){graph.values.resize(start);throw;}
}
HistoryCompareTimelineRoots appendDecodedHistoryTimelineValues(HistoryCompareDocument& graph,const Document& document,project::Limits limits){
 const auto start=graph.values.size();
 try{
  CompareAppend b(graph,limits);using K=HistoryCompareValue::Kind;HistoryCompareTimelineRoots roots{};const auto& state=document.timeline().state();
  roots.frames=b.container(K::Array,state.frames.size());
  std::unordered_map<std::string,std::size_t> frameIds;
  for(std::size_t i=0;i<state.frames.size();++i){const auto& frame=state.frames[i];if(frame.id.empty()||frame.duration<1||frame.duration>60000||!frameIds.emplace(frame.id,i).second)throw std::invalid_argument("Unnormalized history frame");
   const auto item=b.container(K::Object);b.add(roots.frames,std::to_string(i),item);b.add(item,"id",b.string(frame.id));b.add(item,"duration",b.number(frame.duration));if(frame.disabled)b.add(item,"disabled",b.boolean(true));
  }
  if(!frameIds.count(document.frame().id))throw std::invalid_argument("Missing history active frame");
  roots.activeFrameId=b.string(document.frame().id);roots.loop=b.boolean(document.animationLoop());roots.loopSections=b.container(K::Array,state.loopSections.size());
  std::unordered_set<std::string> sectionIds;
  for(std::size_t i=0;i<state.loopSections.size();++i){const auto& section=state.loopSections[i];const auto first=frameIds.find(section.startFrameId),last=frameIds.find(section.endFrameId);
   if(section.id.empty()||!sectionIds.insert(section.id).second||!normalizedDecodedName(section.name,64)||first==frameIds.end()||last==frameIds.end()||first->second>last->second||(section.direction!="forward"&&section.direction!="reverse"&&section.direction!="ping-pong"&&section.direction!="ping-pong-reverse")||(section.repeatCount&&(*section.repeatCount<1||*section.repeatCount>9999)))throw std::invalid_argument("Unnormalized history loop section");
   const auto item=b.container(K::Object);b.add(roots.loopSections,std::to_string(i),item);b.add(item,"id",b.string(section.id));b.add(item,"name",b.wide(section.name));b.add(item,"startFrameId",b.string(section.startFrameId));b.add(item,"endFrameId",b.string(section.endFrameId));b.add(item,"direction",b.string(section.direction));b.add(item,"repeatCount",section.repeatCount?b.number(*section.repeatCount):b.null());
  }
  roots.tilesets=b.container(K::Array,state.tilesets.size());std::unordered_set<std::string> setIds;
  // Free-tile ownership overwrites normalized tileset names with the source's
  // literal name after decode, including leading/trailing whitespace.
  std::unordered_map<std::string,std::string> freeNames;for(const auto& layer:state.layers)if(layer.freeTiles)for(const auto& source:layer.freeTiles->sources)freeNames.emplace(source.tilesetId,source.name);
  for(std::size_t i=0;i<state.tilesets.size();++i){const auto& set=state.tilesets[i];project::tilejson::validate(set);
   if(const auto owner=freeNames.find(set.id);owner!=freeNames.end()){if(set.name!=std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(owner->second))throw std::invalid_argument("Stale free-tile history name");}
   else if(!normalizedDecodedName(set.name))throw std::invalid_argument("Unnormalized history tileset name");
   if(!setIds.insert(set.id).second||set.tileSlots.empty()||std::count_if(set.tileSlots.begin(),set.tileSlots.end(),[](const auto& id){return id.has_value();})!=set.tileIds.size())throw std::invalid_argument("Unnormalized history tileset layout");
   const auto item=b.container(K::Object);b.add(roots.tilesets,std::to_string(i),item);b.add(item,"id",b.string(set.id));b.add(item,"name",b.wide(set.name));b.add(item,"tileWidth",b.number(set.tileWidth));b.add(item,"tileHeight",b.number(set.tileHeight));b.add(item,"columns",b.number(set.columns));b.add(item,"rows",b.number(set.rows));
   const auto tileIds=b.container(K::Array,set.tileIds.size());for(std::size_t j=0;j<set.tileIds.size();++j)b.add(tileIds,std::to_string(j),b.string(set.tileIds[j]));b.add(item,"tileIds",tileIds);
   const auto tileSlots=b.container(K::Array,set.tileSlots.size());for(std::size_t j=0;j<set.tileSlots.size();++j)b.add(tileSlots,std::to_string(j),set.tileSlots[j]?b.string(*set.tileSlots[j]):b.null());b.add(item,"tileSlots",tileSlots);
   b.add(item,"pixels",b.view(set.pixels.data(),set.pixels.size()*sizeof(Pixel),"Uint8ClampedArray"));
  }
  return roots;
 }catch(...){graph.values.resize(start);throw;}
}
std::size_t appendDecodedHistoryRecordingValues(HistoryCompareDocument& graph,const Document& document,project::Limits limits){
 const auto start=graph.values.size();
 try{
  CompareAppend b(graph,limits);using K=HistoryCompareValue::Kind;const auto& settings=document.timelapseSettings();
  if(settings.fps<1||settings.fps>60||settings.speed<1||settings.speed>64)throw std::invalid_argument("Unnormalized history recording settings");
  const char* quality=nullptr;switch(settings.quality){case timelapse::Quality::Low:quality="low";break;case timelapse::Quality::Medium:quality="medium";break;case timelapse::Quality::High:quality="high";break;default:throw std::invalid_argument("Invalid history recording quality");}
  const char* mode=nullptr;switch(settings.mode){case timelapse::Mode::Full:mode="full";break;case timelapse::Mode::Smart:mode="smart";break;default:throw std::invalid_argument("Invalid history recording mode");}
  const auto root=b.container(K::Object);b.add(root,"enabled",b.boolean(settings.enabled));b.add(root,"recordUndoSteps",b.boolean(settings.recordUndoSteps));b.add(root,"quality",b.string(quality));b.add(root,"fps",b.number(settings.fps));b.add(root,"speed",b.number(settings.speed));b.add(root,"mode",b.string(mode));
  const auto snapshots=b.container(K::Array,settings.snapshots.size());b.add(root,"snapshots",snapshots);std::unordered_set<std::string> ids;
  for(std::size_t i=0;i<settings.snapshots.size();++i){const auto& frame=settings.snapshots[i];
   if(!timelapse::safeId(frame.id)||!ids.insert(frame.id).second||frame.width<1||frame.height<1||!std::isfinite(frame.capturedAt)||frame.capturedAt<0||!std::isfinite(frame.elapsedMs)||frame.elapsedMs<0||(!frame.historyChangeScoreUndefined&&(!std::isfinite(frame.changeScore)||frame.changeScore<0||frame.changeScore>1))||(frame.local&&!timelapse::validReference(*frame.local))||(frame.data.empty()&&!frame.local))throw std::invalid_argument("Invalid history recording frame");
   // This fragment is the decoder's normalized shape. Native capture may use
   // fractional clocks; it needs a separate live-shape lifecycle adapter.
   if(std::trunc(frame.capturedAt)!=frame.capturedAt||std::trunc(frame.elapsedMs)!=frame.elapsedMs)throw std::invalid_argument("Unnormalized history recording time");
   if(frame.historyDataBacking){const auto& backing=*frame.historyDataBacking;if(!backing.buffer||backing.viewLength!=frame.data.size()||backing.viewLength>backing.buffer->size())throw std::invalid_argument("Stale history recording backing");}
   const auto item=b.container(K::Object);b.add(snapshots,std::to_string(i),item);b.add(item,"id",b.string(frame.id));b.add(item,"capturedAt",b.number(frame.capturedAt));b.add(item,"elapsedMs",b.number(frame.elapsedMs));b.add(item,"width",b.number(frame.width));b.add(item,"height",b.number(frame.height));b.add(item,"changeScore",frame.historyChangeScoreUndefined?b.node():b.number(frame.changeScore));b.add(item,"data",b.view(frame.data.data(),frame.data.size(),"Uint8Array"));
   if(frame.local){const auto& ref=*frame.local;const auto local=b.container(K::Object);const std::vector<std::string> defaults{"store","chunk","offset","length","checksum"};const auto& keys=frame.historyLocalKeys.empty()?defaults:frame.historyLocalKeys;
    if(keys.size()!=5||std::unordered_set<std::string>(keys.begin(),keys.end())!=std::unordered_set<std::string>(defaults.begin(),defaults.end()))throw std::invalid_argument("Invalid history recording local shape");
    for(const auto& key:keys){const auto value=key=="store"?b.string(ref.store):key=="chunk"?b.string(ref.chunk):key=="offset"?b.number(double(ref.offset)):key=="length"?b.number(double(ref.length)):b.number(ref.checksum);b.add(local,key,value);}b.add(item,"local",local);}
  }
  return root;
 }catch(...){graph.values.resize(start);throw;}
}
std::size_t appendDecodedHistoryGroupValues(HistoryCompareDocument& graph,const Document& document,const project::ReadManifest& manifest,project::Limits limits){
 const auto start=graph.values.size();try{
  const auto& groups=document.timeline().state().groups;if(!manifest.sourceArchive||manifest.sourceArchive!=document.sourceArchive()||manifest.id!=document.projectId()||groups.size()!=manifest.groups.size())throw std::invalid_argument("Changed decoded group source");
  struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize group parser");}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment;
  using namespace winrt::Windows::Data::Json;const auto raw=JsonObject::Parse(winrt::to_hstring(manifest.manifestUtf8)).GetNamedObject(L"document").GetNamedArray(L"groups",JsonArray{});if(raw.Size()!=groups.size())throw std::invalid_argument("Inconsistent group source");
  CompareAppend b(graph,limits);using K=HistoryCompareValue::Kind;const auto root=b.container(K::Array,groups.size());
  for(std::size_t i=0;i<groups.size();++i){const auto& g=groups[i];const auto& expected=manifest.groups[i];const auto source=raw.GetAt(unsigned(i)).GetObject();const auto utf8=[](const std::u32string& v){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(v);};
   if(g.id!=expected.id||g.parentGroupIdPresent!=expected.parentGroupIdPresent||g.parentGroupIdPresent!=source.HasKey(L"parentGroupId")||utf8(g.name)!=expected.name||g.name.empty()||g.parentGroupId.value_or("")!=expected.parentGroupId||g.visible!=expected.visible||g.locked!=expected.locked||g.opacity!=expected.opacity||g.blendMode!=expected.blendMode||g.panelOrder!=expected.panelOrder||g.displayColor!=expected.displayColor||utf8(g.description)!=expected.description||g.clippingMask!=expected.clippingMask||g.cumulativeBlend!=expected.cumulativeBlend||timeline::styleSignature(g.layerStyles)!=timeline::styleSignature(expected.layerStyles))throw std::invalid_argument("Changed decoded group values");
   if(source.HasKey(L"parentGroupId")&&source.GetNamedValue(L"parentGroupId").ValueType()==JsonValueType::String&&source.GetNamedString(L"parentGroupId").empty())throw std::invalid_argument("Empty-string group parent needs native shape adapter");
   const auto node=b.container(K::Object);b.add(root,std::to_string(i),node);b.add(node,"id",b.string(g.id));b.add(node,"name",b.wide(g.name));if(g.panelOrder)b.add(node,"panelOrder",b.number(*g.panelOrder));if(g.displayColor)b.add(node,"displayColor",compareColor(b,*g.displayColor));if(!g.description.empty())b.add(node,"description",b.wide(g.description));if(g.parentGroupIdPresent)b.add(node,"parentGroupId",g.parentGroupId?b.string(*g.parentGroupId):b.null());b.add(node,"visible",b.boolean(g.visible));b.add(node,"locked",b.boolean(g.locked));b.add(node,"opacity",b.number(std::max(0.,g.opacity)));b.add(node,"blendMode",b.string(g.blendMode));if(g.clippingMask)b.add(node,"clippingMask",b.boolean(true));if(g.layerStyles)b.add(node,"layerStyles",compareLayerStyles(b,*g.layerStyles));if(g.cumulativeBlend)b.add(node,"cumulativeBlend",b.boolean(true));
  }return root;
 }catch(...){graph.values.resize(start);throw;}
}
HistoryCompareMaskRoots appendDecodedHistoryMaskValues(HistoryCompareDocument& graph,const Document& document,const std::u32string& layerMaskName,const std::u32string& groupMaskName,project::Limits limits){
 const auto start=graph.values.size();try{
  const auto& state=document.timeline().state();timeline::validateMasks(state);CompareAppend b(graph,limits);using K=HistoryCompareValue::Kind;HistoryCompareMaskRoots roots{b.container(K::Array),b.container(K::Array)};std::size_t layers=0,groups=0;
  for(const auto& slot:state.masks){const auto& mask=slot.mask;const auto& s=mask.surface;const auto& name=slot.group?groupMaskName:layerMaskName;
   if(name.empty()||!mask.visible||!mask.moveWithOwner||s.width<1||s.height<1||std::uint64_t(s.width)*s.height!=s.pixels.size()||s.storageOriginX||s.storageOriginY)throw std::invalid_argument("Unnormalized decoded history mask");
   for(const auto color:s.pixels)if(color!=timeline::normalizedMaskPixel(color))throw std::invalid_argument("Unnormalized decoded mask pixel");
   const auto entry=b.container(K::Object);b.add(slot.group?roots.groupMasks:roots.layerMasks,std::to_string(slot.group?groups++:layers++),entry);b.add(entry,slot.group?"groupId":"layerId",b.string(slot.ownerId));b.add(entry,"frameId",b.string(slot.frameId));const auto node=b.container(K::Object);b.add(entry,"mask",node);
   b.add(node,"id",b.string(mask.id));b.add(node,"name",b.wide(name));b.add(node,"description",b.string(""));b.add(node,"visible",b.boolean(true));b.add(node,"locked",b.boolean(mask.locked));b.add(node,"opacity",b.number(1));b.add(node,"blendMode",b.string("normal"));b.add(node,"width",b.number(s.width));b.add(node,"height",b.number(s.height));b.add(node,"offsetX",b.number(s.offsetX));b.add(node,"offsetY",b.number(s.offsetY));b.add(node,"format",b.string("rgba"));b.add(node,"pixels",b.view(s.pixels.data(),s.pixels.size()*sizeof(Pixel),"Uint8ClampedArray"));b.add(node,"ownerKind",b.string(slot.group?"group":"cel"));b.add(node,"ownerId",b.string(slot.ownerId));if(!mask.linkedMaskId.empty())b.add(node,"linkedMaskId",b.string(mask.linkedMaskId));if(mask.autoLinkAnimationCels)b.add(node,"autoLinkAnimationCels",b.boolean(true));
  }graph.values[roots.layerMasks].arrayLength=layers;graph.values[roots.groupMasks].arrayLength=groups;return roots;
 }catch(...){graph.values.resize(start);throw;}
}
HistoryCompareRasterRoots appendDecodedHistoryRasterValues(HistoryCompareDocument& graph,const Document& document,const project::ReadManifest& manifest,project::Limits limits){
 const auto start=graph.values.size();
 try{
  const auto& state=document.timeline().state();
  if(!graph.layers.empty()||graph.activeFrameId||!manifest.sourceArchive||manifest.sourceArchive!=document.sourceArchive()||manifest.id!=document.projectId()||manifest.schemaVersion!=21||manifest.colorMode!="rgba"||manifest.width!=document.width()||manifest.height!=document.height()||manifest.activeFrameId!=document.frame().id||state.layers.size()!=manifest.layers.size()||state.cels.size()!=manifest.cels.size()||state.frames.size()!=manifest.frames.size())throw std::invalid_argument("Changed decoded raster source or existing layer metadata");
  const auto utf8=[](const std::u32string& value){return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(value);};
  std::unordered_map<std::string,const project::ManifestCel*> cels,active;
  std::unordered_map<std::string,project::ManifestRaster> rendered;
  std::unordered_map<std::string,const free_tiles::LayerData*> freeLayers;
  std::optional<project::PreparedImport> prepared;
  if(std::any_of(manifest.layers.begin(),manifest.layers.end(),[](const auto& layer){return layer.kind=="free-tile";}))prepared=project::prepareEditableImport(manifest);
  std::unordered_map<std::string,const timeline::Cel*> decodedCels;if(prepared)for(const auto& cel:prepared->timeline.cels)decodedCels.emplace(cel.id,&cel);
  if(prepared)for(const auto& layer:prepared->timeline.layers)if(layer.freeTiles){if(layer.freeTiles->sources.empty()||!layer.freeTiles->legacyTilesetId.empty())throw std::invalid_argument("Legacy free tile comparison requires ownership adapter");freeLayers.emplace(layer.id,&*layer.freeTiles);}
  if(prepared){if(state.tilesets.size()!=prepared->timeline.tilesets.size())throw std::invalid_argument("Changed free tile resources");for(std::size_t i=0;i<state.tilesets.size();++i){const auto& a=state.tilesets[i];const auto& c=prepared->timeline.tilesets[i];if(std::tie(a.id,a.name,a.tileWidth,a.tileHeight,a.columns,a.rows,a.tileIds,a.tileSlots,a.pixels)!=std::tie(c.id,c.name,c.tileWidth,c.tileHeight,c.columns,c.rows,c.tileIds,c.tileSlots,c.pixels))throw std::invalid_argument("Changed free tile resource values");}}
  for(const auto& source:manifest.cels)if(source.freeTiles&&source.surface){const auto& c=*decodedCels.at(source.id);project::ManifestRaster surface;surface.width=source.surface->width;surface.height=source.surface->height;surface.offsetX=source.surface->offsetX;surface.offsetY=source.surface->offsetY;surface.pixels=free_tiles::render(*freeLayers.at(source.layerId),*c.freeTiles,prepared->timeline.tilesets,surface.width,surface.height);rendered.emplace(source.id,std::move(surface));}
  if(std::any_of(manifest.cels.begin(),manifest.cels.end(),[](const auto& cel){return bool(cel.tilemap);})){if(state.tilesets.size()!=manifest.tilesets.size())throw std::invalid_argument("Changed tilemap tilesets");for(std::size_t i=0;i<manifest.tilesets.size();++i){const auto& a=state.tilesets[i];const auto& c=manifest.tilesets[i];if(std::tie(a.id,a.name,a.tileWidth,a.tileHeight,a.columns,a.rows,a.tileIds,a.tileSlots,a.pixels)!=std::tie(c.id,c.name,c.tileWidth,c.tileHeight,c.columns,c.rows,c.tileIds,c.tileSlots,c.pixels))throw std::invalid_argument("Changed tilemap tileset values");}}
  for(const auto& source:manifest.cels)if(source.tilemap&&source.surface){const auto& grid=*source.tilemap;project::ManifestRaster surface;surface.width=grid.columns*grid.tileWidth;surface.height=grid.rows*grid.tileHeight;surface.offsetX=source.surface->offsetX;surface.offsetY=source.surface->offsetY;surface.pixels=tiles::render(grid,manifest.tilesets);rendered.emplace(source.id,std::move(surface));}
  const auto sameGrid=[](const auto& a,const auto& b){return bool(a)==bool(b)&&(!a||std::tie(a->tileWidth,a->tileHeight,a->columns,a->rows,a->cells)==std::tie(b->tileWidth,b->tileHeight,b->columns,b->rows,b->cells));};
  const auto surfaceFor=[&](const project::ManifestCel& cel)->const project::ManifestRaster&{if(const auto found=rendered.find(cel.id);found!=rendered.end())return found->second;return *cel.surface;};
  for(std::size_t i=0;i<manifest.frames.size();++i)if(state.frames[i].id!=manifest.frames[i].id)throw std::invalid_argument("Changed decoded raster frame order");
  for(const auto& cel:manifest.cels){if(!cels.emplace(cel.id,&cel).second)throw std::invalid_argument("Duplicate decoded cel");if(cel.frameId==manifest.activeFrameId)active.emplace(cel.layerId,&cel);}
  const auto resolve=[&](const project::ManifestCel& value){const auto* cel=&value;for(std::size_t steps=0;!cel->linkedCelId.empty();++steps){if(steps>=manifest.cels.size())throw std::invalid_argument("Cyclic decoded cel");cel=cels.at(cel->linkedCelId);if(cel->layerId!=value.layerId)throw std::invalid_argument("Cross-layer decoded cel");}if(!cel->surface)throw std::invalid_argument("Missing decoded cel storage");return cel;};
  // Validate the native capture before using source-only field presence and
  // storage layout. Linked fallback surfaces are retained only in the manifest;
  // the native timeline resolves its owner rather than duplicating that surface.
  for(std::size_t i=0;i<manifest.cels.size();++i){const auto& source=manifest.cels[i];const auto& cel=state.cels[i];const auto* owner=resolve(source);
   if(!sameDecodedText(source.text,cel.text)||!sameGrid(source.tilemap,cel.tilemap)||(prepared?cel.freeTiles!=decodedCels.at(source.id)->freeTiles:bool(cel.freeTiles))||source.zIndex<-999||source.zIndex>999||cel.id!=source.id||cel.layerId!=source.layerId||cel.frameId!=source.frameId||cel.linkedCelId.value_or("")!=source.linkedCelId||cel.runtimeSharedCelId||cel.opacity!=source.opacity||cel.zIndex!=source.zIndex||(cel.surface.has_value()!=source.linkedCelId.empty()&&!source.tilemap&&!source.freeTiles))throw std::invalid_argument("Changed or special decoded cel values: "+source.id+" tile="+std::to_string(bool(source.tilemap))+" surface="+std::to_string(bool(cel.surface))+" linked="+source.linkedCelId);
   const auto resolved=document.timeline().resolveSurface(cel.id);const auto& raster=surfaceFor(*owner);
   if(!resolved.surface||resolved.surface->width!=raster.width||resolved.surface->height!=raster.height||resolved.surface->offsetX!=raster.offsetX||resolved.surface->offsetY!=raster.offsetY||resolved.surface->storageOriginX.value_or(0)||resolved.surface->storageOriginY.value_or(0)||resolved.surface->pixels!=raster.pixels)throw std::invalid_argument("Changed decoded cel raster");
  }
  std::vector<const project::ManifestRaster*> rasters;std::vector<const project::ManifestCel*> displayed;
  for(std::size_t i=0;i<manifest.layers.size();++i){const auto& source=manifest.layers[i];const auto& layer=state.layers[state.layers.size()-1-i];const auto found=active.find(source.id);if(found==active.end())throw std::invalid_argument("Missing decoded active cel");const auto* cel=resolve(*found->second);const auto expectedOpacity=cel->opacity.value_or(source.opacity);
   const auto background=[](const std::optional<timeline::BackgroundSettings>& a,const std::optional<timeline::BackgroundSettings>& b){return bool(a)==bool(b)&&(!a||std::tie(a->mode,a->pattern,a->repeatWidth,a->repeatHeight)==std::tie(b->mode,b->pattern,b->repeatWidth,b->repeatHeight));};
   if((!source.kind.empty()&&source.kind!="adjustment"&&source.kind!="text"&&source.kind!="tilemap"&&source.kind!="free-tile")||layer.linkedContentId!=source.linkedContentId||!source.surface||layer.id!=source.id||utf8(layer.name)!=source.name||utf8(layer.description)!=source.description||layer.visible!=source.visible||layer.locked!=source.locked||layer.opacity!=expectedOpacity||layer.autoLinkAnimationCels!=source.autoLinkAnimationCels||layer.blendMode!=source.blendMode||layer.groupId.value_or("")!=source.groupId||layer.displayColor!=source.displayColor||layer.clippingMask!=source.clippingMask||layer.kind!=source.kind||layer.tilemapTilesetId!=source.tilemapTilesetId||(layer.freeTiles&&(freeLayers.count(layer.id)==0||*layer.freeTiles!=*freeLayers.at(layer.id)))||bool(layer.freeTiles)!=bool(source.freeTiles)||timeline::styleSignature(layer.layerStyles)!=timeline::styleSignature(source.layerStyles)||timeline::adjustmentSignature(layer.adjustment)!=timeline::adjustmentSignature(source.adjustment)||!background(layer.background,source.background))throw std::invalid_argument("Changed or special decoded layer values");
   displayed.push_back(cel);rasters.push_back(cel->surface.get());
  }
  struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize raster history parser");}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment;
  using namespace winrt::Windows::Data::Json;const auto raw=JsonObject::Parse(winrt::to_hstring(manifest.manifestUtf8)).GetNamedObject(L"document").GetNamedArray(L"layers");
  if(raw.Size()!=manifest.layers.size())throw std::invalid_argument("Inconsistent decoded layer source");
  std::unordered_map<std::string,JsonObject> textSources,rawCelSources;const auto rawCels=JsonObject::Parse(winrt::to_hstring(manifest.manifestUtf8)).GetNamedObject(L"document").GetNamedObject(L"animation").GetNamedArray(L"cels");for(const auto& v:rawCels){if(v.ValueType()!=winrt::Windows::Data::Json::JsonValueType::Object)continue;const auto item=v.GetObject();textSources.emplace(project::textjson::str(item,L"id"),project::textjson::object(item,L"text"));rawCelSources.emplace(project::textjson::str(item,L"id"),item);}
  for(const auto& cel:manifest.cels)if(cel.surface)rasters.push_back(cel.surface.get());
  // All projected layer and own-cel storage is assembled together, so views
  // and runtime objects retain decodePixels' resource/geometry-key aliases.
  DecodedHistoryRasterStorage storage(manifest,true);auto storageRoots=storage.appendComparison(graph,rasters,limits);
  {CompareAppend bytes(graph,limits);std::unordered_map<std::string,HistoryRasterStorageRoots> views;
   const auto replace=[&](const project::ManifestCel& cel,std::size_t index){const auto found=rendered.find(cel.id);if(found==rendered.end())return;auto view=views.find(cel.id);if(view==views.end()){const auto& pixels=found->second.pixels;view=views.emplace(cel.id,HistoryRasterStorageRoots{bytes.view(pixels.data(),pixels.size()*4,"Uint8ClampedArray"),{}}).first;}storageRoots[index]=view->second;};
   for(std::size_t i=0;i<displayed.size();++i)replace(*displayed[i],i);std::size_t index=displayed.size();for(const auto& cel:manifest.cels)if(cel.surface)replace(cel,index++);
  }
  CompareAppend b(graph,limits);using K=HistoryCompareValue::Kind;HistoryCompareRasterRoots roots{b.container(K::Array,manifest.layers.size()),b.container(K::Array,manifest.cels.size())};std::vector<HistoryCompareLayer> layerMetadata;
  std::unordered_map<std::string,std::size_t> freeSourceArrays;
  const auto sourcesFor=[&](const free_tiles::LayerData& data){if(const auto found=freeSourceArrays.find(data.setId);found!=freeSourceArrays.end())return found->second;const auto root=b.container(K::Array,data.sources.size());for(std::size_t i=0;i<data.sources.size();++i){const auto& source=data.sources[i];const auto item=b.container(K::Object);b.add(item,"id",b.string(source.id));b.add(item,"name",b.string(source.name));b.add(item,"tilesetId",b.string(source.tilesetId));if(!source.description.empty())b.add(item,"description",b.string(source.description));if(source.displayColor)b.add(item,"displayColor",compareColor(b,*source.displayColor));b.add(item,"visible",b.boolean(source.visible));b.add(item,"locked",b.boolean(source.locked));b.add(item,"opacity",b.number(source.opacity));b.add(item,"blendMode",b.string(source.blendMode));b.add(item,"offsetX",b.number(source.offsetX));b.add(item,"offsetY",b.number(source.offsetY));b.add(root,std::to_string(i),item);}freeSourceArrays.emplace(data.setId,root);return root;};
  const auto appendStorage=[&](std::size_t owner,std::size_t index){const auto& value=storageRoots.at(index);b.add(owner,"pixels",value.pixels);if(value.runtimeRaster)b.add(owner,"runtimeRaster",*value.runtimeRaster);};
  for(std::size_t i=0;i<manifest.layers.size();++i){const auto& layer=manifest.layers[i];const auto& cel=*displayed[i];const auto& surface=surfaceFor(cel);const auto item=b.container(K::Object);b.add(roots.layers,std::to_string(i),item);
   b.add(item,"id",b.string(layer.id));b.add(item,"name",b.string(layer.name));if(!layer.linkedContentId.empty())b.add(item,"linkedContentId",b.string(layer.linkedContentId));if(layer.autoLinkAnimationCels)b.add(item,"autoLinkAnimationCels",b.boolean(true));b.add(item,"description",b.string(layer.description));b.add(item,"visible",b.boolean(layer.visible));b.add(item,"locked",b.boolean(layer.locked));b.add(item,"opacity",b.number(std::max(0.,cel.opacity.value_or(layer.opacity))));b.add(item,"blendMode",b.string(layer.blendMode));if(layer.clippingMask)b.add(item,"clippingMask",b.boolean(true));if(layer.layerStyles)b.add(item,"layerStyles",compareLayerStyles(b,*layer.layerStyles));
   if(layer.adjustment){const auto adjustment=b.container(K::Object);b.add(adjustment,"kind",b.string("gradient-map"));b.add(adjustment,"enabled",b.boolean(layer.adjustment->enabled));b.add(adjustment,"gradientMap",compareGradientMap(b,layer.adjustment->gradientMap));b.add(item,"adjustment",adjustment);}
   if(layer.background){const auto& settings=*layer.background;const auto background=b.container(K::Object);b.add(background,"mode",b.string(settings.mode));if(settings.mode=="preset")b.add(background,"pattern",b.string(settings.pattern));else if(settings.mode=="canvas"){if(settings.repeatWidth>0){b.add(background,"repeatWidth",b.number(settings.repeatWidth));b.add(background,"repeatHeight",b.number(settings.repeatHeight));}}else throw std::invalid_argument("Invalid decoded background");b.add(item,"background",background);}
   if(!layer.kind.empty())b.add(item,"kind",b.string(layer.kind));if(layer.kind=="tilemap")b.add(item,"tilemapTilesetId",b.string(layer.tilemapTilesetId));if(layer.kind=="free-tile"){const auto& data=*freeLayers.at(layer.id);b.add(item,"freeTileSetId",b.string(data.setId));b.add(item,"freeTileSources",sourcesFor(data));}const auto rawGroup=raw.GetAt(unsigned(i)).GetObject().TryLookup(L"groupId");const bool emptyGroup=rawGroup&&rawGroup.ValueType()==JsonValueType::String&&rawGroup.GetString().empty();b.add(item,"groupId",layer.groupId.empty()&&!emptyGroup?b.null():b.string(layer.groupId));if(layer.displayColor)b.add(item,"displayColor",compareColor(b,*layer.displayColor));b.add(item,"width",b.number(surface.width));b.add(item,"height",b.number(surface.height));b.add(item,"offsetX",b.number(surface.offsetX));b.add(item,"offsetY",b.number(surface.offsetY));b.add(item,"format",b.string("rgba"));appendStorage(item,i);
   layerMetadata.push_back({layer.id,double(surface.width),double(surface.offsetX),double(surface.offsetY),0,0,bool(storageRoots[i].runtimeRaster)});
  }
  std::size_t rasterIndex=manifest.layers.size();
  for(std::size_t i=0;i<manifest.cels.size();++i){const auto& cel=manifest.cels[i];const auto item=b.container(K::Object);b.add(roots.cels,std::to_string(i),item);b.add(item,"id",b.string(cel.id));b.add(item,"layerId",b.string(cel.layerId));b.add(item,"frameId",b.string(cel.frameId));if(!cel.linkedCelId.empty())b.add(item,"linkedCelId",b.string(cel.linkedCelId));if(cel.zIndex)b.add(item,"zIndex",b.number(cel.zIndex));if(cel.opacity)b.add(item,"opacity",b.number(std::max(0.,*cel.opacity)));const auto& rawCel=rawCelSources.at(cel.id);const bool tileBefore=cel.tilemap&&rawCel.GetNamedObject(L"tilemap").GetNamedArray(L"cells").Size()==cel.tilemap->cells.size();
   const auto tilemap=[&]{const auto& grid=*cel.tilemap;const auto root=b.container(K::Object);b.add(root,"tileWidth",b.number(grid.tileWidth));b.add(root,"tileHeight",b.number(grid.tileHeight));b.add(root,"columns",b.number(grid.columns));b.add(root,"rows",b.number(grid.rows));std::vector<std::size_t> order;if(!cel.surface&&tileBefore){for(const auto& v:rawCel.GetNamedObject(L"tilemap").GetNamedArray(L"cells"))order.push_back(std::size_t(v.GetObject().GetNamedNumber(L"index")));}else for(std::size_t n=0;n<grid.cells.size();++n)order.push_back(n);const auto cells=b.container(K::Array,order.size());for(std::size_t n=0;n<order.size();++n){const auto& cell=grid.cells[order[n]];if(!cell){b.add(cells,std::to_string(n),b.null());continue;}const auto value=b.container(K::Object);b.add(value,"tilesetId",b.string(cell->tilesetId));b.add(value,"tileId",b.string(cell->tileId));if(cell->flipHorizontal)b.add(value,"flipHorizontal",b.boolean(true));if(cell->flipVertical)b.add(value,"flipVertical",b.boolean(true));if(cell->rotation)b.add(value,"rotation",b.number(cell->rotation));b.add(cells,std::to_string(n),value);}b.add(root,"cells",cells);b.add(item,"tilemap",root);};
   if(cel.freeTiles){const auto& data=*decodedCels.at(cel.id)->freeTiles;const auto free=b.container(K::Object),instances=b.container(K::Array,data.instances.size());for(std::size_t n=0;n<data.instances.size();++n){const auto& value=data.instances[n];const auto instance=b.container(K::Object);b.add(instance,"id",b.string(value.id));b.add(instance,"sourceId",b.string(value.sourceId));b.add(instance,"x",b.number(value.x));b.add(instance,"y",b.number(value.y));b.add(instance,"visible",b.boolean(value.visible));b.add(instance,"locked",b.boolean(value.locked));if(value.opacity)b.add(instance,"opacity",b.number(*value.opacity));if(value.blendMode)b.add(instance,"blendMode",b.string(*value.blendMode));if(value.rotation)b.add(instance,"rotation",b.number(value.rotation));if(value.flipHorizontal)b.add(instance,"flipHorizontal",b.boolean(true));if(value.flipVertical)b.add(instance,"flipVertical",b.boolean(true));b.add(instances,std::to_string(n),instance);}b.add(free,"instances",instances);b.add(item,"freeTiles",free);}
   if(tileBefore)tilemap();b.add(item,"text",cel.text?compareTextCel(b,*cel.text,textSources.at(cel.id)):b.node({}));if(cel.tilemap&&!tileBefore&&cel.surface)tilemap();
   if(cel.surface){const auto& raster=surfaceFor(cel);const auto surface=b.container(K::Object);b.add(surface,"format",b.string("rgba"));b.add(surface,"width",b.number(raster.width));b.add(surface,"height",b.number(raster.height));b.add(surface,"offsetX",b.number(raster.offsetX));b.add(surface,"offsetY",b.number(raster.offsetY));if(!rendered.count(cel.id)){b.add(surface,"storageOriginX",b.number(0));b.add(surface,"storageOriginY",b.number(0));}appendStorage(surface,rasterIndex++);b.add(item,"surface",surface);}
  }
  // Publish comparison metadata only after every allocation/validation passed.
  auto activeFrame=std::optional<std::string>(manifest.activeFrameId);graph.layers.swap(layerMetadata);graph.activeFrameId.swap(activeFrame);return roots;
 }catch(...){graph.values.resize(start);throw;}
}
std::size_t appendDecodedHistoryMetadataValues(HistoryCompareDocument& graph,const Document& document,const project::ReadManifest& manifest,const std::string& decodedDocumentId,project::Limits limits){
 const auto start=graph.values.size();
 try{
  const auto& information=document.projectInformation();const auto& original=manifest.information;
  if(!manifest.sourceArchive||manifest.sourceArchive!=document.sourceArchive()||manifest.id!=document.projectId()||decodedDocumentId.empty()||manifest.schemaVersion!=21||manifest.colorMode!="rgba"||manifest.width!=document.width()||manifest.height!=document.height()||manifest.activeLayerId!=document.layer().id||manifest.activeFrameId!=document.frame().id||manifest.name.empty()||winrt::to_hstring(manifest.name)!=winrt::to_hstring(std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(document.name()))||information.createdAt!=original.createdAt||information.updatedAt!=original.updatedAt||information.strokeCount!=original.strokeCount||information.operationCount!=original.operationCount||information.drawingTimeMs!=original.drawingTimeMs||document.showPixelGrid()!=manifest.showPixelGrid||document.showCustomGrid()!=manifest.showCustomGrid||document.customGrid()!=manifest.customGrid)throw std::invalid_argument("Stale decoded history root metadata");
  const auto sameNumber=[](double a,double b){return a==b&&(a!=0||std::signbit(a)==std::signbit(b));};
  const auto center=document.symmetryCenter();const auto expectedCenter=manifest.symmetryCenter.value_or(std::make_pair(document.width()/2.0,document.height()/2.0));if(!sameNumber(center.x,expectedCenter.first)||!sameNumber(center.y,expectedCenter.second))throw std::invalid_argument("Changed decoded symmetry center");
  const auto gridValues=document.customGrid();if(!sameNumber(gridValues.x,manifest.customGrid.x)||!sameNumber(gridValues.y,manifest.customGrid.y))throw std::invalid_argument("Changed decoded grid sign");
  struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history metadata parser");}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment;
  using namespace winrt::Windows::Data::Json;
  const auto source=JsonObject::Parse(winrt::to_hstring(manifest.manifestUtf8)).GetNamedObject(L"document");
  const auto field=[](const JsonObject& owner,const wchar_t* key)->IJsonValue{return owner.HasKey(key)?owner.GetNamedValue(key):JsonValue::CreateNullValue();};
  const auto object=[&](const JsonObject& owner,const wchar_t* key){const auto value=field(owner,key);return value.ValueType()==JsonValueType::Object?value.GetObject():JsonObject{};};
  const auto text=[&](const JsonObject& owner,const wchar_t* key)->std::optional<std::string>{const auto value=field(owner,key);if(value.ValueType()==JsonValueType::String)return winrt::to_string(value.GetString());return {};};
  const auto number=[&](const JsonObject& owner,const wchar_t* key,double fallback){const auto value=field(owner,key);return value.ValueType()==JsonValueType::Number&&std::isfinite(value.GetNumber())?value.GetNumber():fallback;};
  const auto truth=[&](const JsonObject& owner,const wchar_t* key){const auto value=field(owner,key);return value.ValueType()==JsonValueType::Boolean&&value.GetBoolean();};
  const auto references=field(source,L"canvasReferences");if(references.ValueType()==JsonValueType::Array&&references.GetArray().Size())throw std::invalid_argument("Canvas-reference history comparison requires adapter");
  // Reuse the timestamps resolved by this manifest decode; never read a second
  // clock during capture. Truthy nonstring createdAt has a distinct JS shape.
  if(project::textjson::truthy(source,L"createdAt")&&!text(source,L"createdAt"))throw std::invalid_argument("Nonstring createdAt requires decode adaptation");
  if(information.createdAt.empty()||information.updatedAt.empty())throw std::invalid_argument("Missing resolved decode timestamps");
  const auto format=text(source,L"pixelFormat");if(format&&*format!="rgba32")throw std::invalid_argument("History pixel format not admitted");
  CompareAppend b(graph,limits);using K=HistoryCompareValue::Kind;const auto root=b.container(K::Object);
  b.add(root,"schemaVersion",b.number(21));b.add(root,"id",b.string(decodedDocumentId));b.add(root,"name",b.wide(document.name()));b.add(root,"width",b.number(document.width()));b.add(root,"height",b.number(document.height()));b.add(root,"colorMode",b.string("rgba"));b.add(root,"pixelFormat",b.string("rgba32"));b.add(root,"activeLayerId",b.string(document.layer().id));b.add(root,"canvasReferences",b.container(K::Array));
  const auto outlineValue=field(source,L"outlineSettings");
  if(outlineValue.ValueType()==JsonValueType::Object||outlineValue.ValueType()==JsonValueType::Array){
   const auto outline=object(source,L"outlineSettings");const auto settings=b.container(K::Object);
   const auto rounded=[&](const JsonObject& owner,const wchar_t* key,double fallback,double low,double high){return std::clamp(std::floor(number(owner,key,fallback)+.5),low,high);};
   const auto color=[&](const wchar_t* key,double alpha){const auto raw=object(outline,key);const auto node=b.container(K::Object);for(const auto* channel:{L"r",L"g",L"b",L"a"})b.add(node,winrt::to_string(channel),b.number(rounded(raw,channel,channel[0]==L'a'?alpha:0,0,255)));return node;};
   b.add(settings,"color",color(L"color",255));b.add(settings,"backgroundColor",color(L"backgroundColor",0));b.add(settings,"thickness",b.number(rounded(outline,L"thickness",1,1,64)));
   auto position=text(outline,L"position").value_or("outside"),kernel=text(outline,L"kernel").value_or("round");if(position!="inside"&&position!="outside"&&position!="both")position="outside";if(kernel!="round"&&kernel!="square"&&kernel!="horizontal"&&kernel!="vertical")kernel="round";
   b.add(settings,"position",b.string(position));b.add(settings,"kernel",b.string(kernel));const auto directions=b.container(K::Object);const auto rawDirections=object(outline,L"directions");
   // normalizeOutlineSettings uses default round directions as fallback even
   // when a different kernel was requested.
   for(const auto* key:{L"nw",L"n",L"ne",L"w",L"e",L"sw",L"s",L"se"}){const auto value=field(rawDirections,key);b.add(directions,winrt::to_string(key),b.boolean(value.ValueType()==JsonValueType::Boolean?value.GetBoolean():std::wcslen(key)==1));}
   b.add(settings,"directions",directions);b.add(settings,"smartHue",b.boolean(truth(outline,L"smartHue")));b.add(settings,"smartHueDarkness",b.number(rounded(outline,L"smartHueDarkness",45,0,100)));b.add(settings,"followOpacity",b.boolean(truth(outline,L"followOpacity")));const auto preview=field(outline,L"previewEnabled");b.add(settings,"previewEnabled",b.boolean(preview.ValueType()!=JsonValueType::Boolean||preview.GetBoolean()));b.add(root,"outlineSettings",settings);
  }
  const auto display=b.container(K::Object);b.add(display,"showPixelGrid",b.boolean(document.showPixelGrid()));b.add(display,"showGrid",b.boolean(document.showCustomGrid()));const auto grid=b.container(K::Object);const auto g=document.customGrid();b.add(grid,"x",b.number(g.x));b.add(grid,"y",b.number(g.y));b.add(grid,"width",b.number(g.width));b.add(grid,"height",b.number(g.height));b.add(display,"grid",grid);
  if(manifest.symmetryCenter){const auto node=b.container(K::Object);b.add(node,"x",b.number(center.x));b.add(node,"y",b.number(center.y));b.add(display,"symmetryCenter",node);}b.add(root,"displaySettings",display);
  const auto statistics=b.container(K::Object);const auto rawStatistics=object(source,L"statistics");for(const auto* key:{L"strokeCount",L"operationCount",L"drawingTimeMs"}){const auto raw=number(rawStatistics,key,0);b.add(statistics,winrt::to_string(key),b.number(projectCounter(raw)==0?(raw==0?raw:0):double(projectCounter(raw))));}b.add(root,"statistics",statistics);
  b.add(root,"filePath",b.null());b.add(root,"dirty",b.boolean(false));b.add(root,"createdAt",b.string(information.createdAt));b.add(root,"updatedAt",b.string(information.updatedAt));
  const auto panel=object(source,L"layerPanelState");std::unordered_set<std::string> layerIds,groupIds;for(const auto& layer:manifest.layers)layerIds.insert(layer.id);for(const auto& group:manifest.groups)groupIds.insert(group.id);
  const auto ids=[&](const wchar_t* key,const auto& valid){std::vector<std::string> result;std::unordered_set<std::string> seen;const auto value=field(panel,key);if(value.ValueType()==JsonValueType::Array)for(const auto& item:value.GetArray())if(item.ValueType()==JsonValueType::String){auto id=winrt::to_string(item.GetString());if(valid.count(id)&&seen.insert(id).second)result.push_back(std::move(id));}return result;};
  auto selectedLayers=ids(L"selectedLayerIds",layerIds),selectedGroups=ids(L"selectedGroupIds",groupIds);const auto collapsed=ids(L"collapsedGroupIds",groupIds);const auto requested=text(panel,L"activeLayerId").value_or(manifest.activeLayerId);
  const auto active=layerIds.count(requested)?requested:!selectedLayers.empty()?selectedLayers.back():layerIds.count(manifest.activeLayerId)?manifest.activeLayerId:manifest.layers.empty()?std::string{}:manifest.layers.back().id;
  auto selectedGroup=text(panel,L"selectedGroupId");if(selectedGroup&&(!groupIds.count(*selectedGroup)||std::find(selectedGroups.begin(),selectedGroups.end(),*selectedGroup)==selectedGroups.end()))selectedGroup.reset();if(selectedLayers.empty()&&selectedGroups.empty()&&!active.empty())selectedLayers.push_back(active);
  auto anchor=text(panel,L"layerSelectionAnchorId");if(!anchor||anchor->empty()||(!layerIds.count(*anchor)&&!groupIds.count(*anchor))){anchor.reset();if(!selectedGroups.empty())anchor=selectedGroups.back();else if(!selectedLayers.empty())anchor=selectedLayers.back();else if(!active.empty())anchor=active;}
  const auto panelNode=b.container(K::Object);b.add(panelNode,"activeLayerId",b.string(active));const auto array=[&](const auto& values){const auto node=b.container(K::Array,values.size());for(std::size_t i=0;i<values.size();++i)b.add(node,std::to_string(i),b.string(values[i]));return node;};b.add(panelNode,"selectedLayerIds",array(selectedLayers));b.add(panelNode,"selectedGroupIds",array(selectedGroups));b.add(panelNode,"selectedGroupId",selectedGroup?b.string(*selectedGroup):b.null());b.add(panelNode,"layerSelectionAnchorId",anchor?b.string(*anchor):b.null());b.add(panelNode,"collapsedGroupIds",array(collapsed));b.add(root,"layerPanelState",panelNode);
  return root;
 }catch(...){graph.values.resize(start);throw;}
}
HistoryComparePaletteRoots appendDecodedHistoryPaletteValues(HistoryCompareDocument& graph,const Document& document,const project::ReadManifest& manifest,project::Limits limits){
 const auto start=graph.values.size();
 try{
  // Reuse import's actual normalization/admission for independent order/slots;
  // do not derive legacy paletteOrder by walking native slot positions.
  const auto expected=project::prepareEditablePalette(manifest);const auto& palette=document.palette();
  if(manifest.sourceArchive!=document.sourceArchive()||manifest.id!=document.projectId()||palette.columns!=expected.columns||palette.nextId!=expected.nextId||palette.order()!=expected.order||palette.slots!=expected.slots||palette.entries.size()!=expected.entries.size())throw std::invalid_argument("Stale decoded history palette");
  for(std::size_t i=0;i<palette.entries.size();++i){const auto& a=palette.entries[i];const auto& e=expected.entries[i];if(a.id!=e.id||a.name!=e.name||a.color!=e.color)throw std::invalid_argument("Changed decoded history palette entry");}
  struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history palette parser");}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment;
  using namespace winrt::Windows::Data::Json;
  const auto source=JsonObject::Parse(winrt::to_hstring(manifest.manifestUtf8)).GetNamedObject(L"document");const auto entries=source.GetNamedArray(L"palette",JsonArray{});if(entries.Size()!=palette.entries.size())throw std::invalid_argument("Inconsistent history palette source");
  const auto ordered=[](const JsonObject& object,std::initializer_list<const wchar_t*> allowed){
   const auto json=std::wstring(object.Stringify());std::vector<std::pair<std::size_t,std::string>> keys;
   // Validated names are fixed ASCII keys. Stringify canonicalizes key escapes;
   // escaped quotes inside string values cannot match the complete key token.
   for(const auto* key:allowed)if(object.HasKey(key)){const auto at=json.find(std::wstring(L"\"")+key+L"\":");if(at==std::wstring::npos)throw std::invalid_argument("Invalid history palette key");keys.emplace_back(at,winrt::to_string(key));}
   if(keys.size()!=object.Size())throw std::invalid_argument("Unrepresented history palette extension");std::sort(keys.begin(),keys.end());return keys;
  };
  CompareAppend b(graph,limits);using K=HistoryCompareValue::Kind;HistoryComparePaletteRoots roots{};roots.palette=b.container(K::Array,palette.entries.size());
  for(std::size_t i=0;i<palette.entries.size();++i){const auto raw=entries.GetAt(unsigned(i)).GetObject();const auto& entry=palette.entries[i];const auto item=b.container(K::Object);b.add(roots.palette,std::to_string(i),item);
   for(const auto& [position,key]:ordered(raw,{L"id",L"name",L"color"})){
    if(key=="id")b.add(item,key,b.number(entry.id));else if(key=="name")b.add(item,key,raw.GetNamedValue(L"name").ValueType()==JsonValueType::Null?b.null():b.wide(entry.name));else{
     const auto color=b.container(K::Object);for(const auto& [at,channel]:ordered(raw.GetNamedObject(L"color"),{L"r",L"g",L"b",L"a"})){b.add(color,channel,b.number(raw.GetNamedObject(L"color").GetNamedNumber(winrt::to_hstring(channel))));}b.add(item,key,color);
    }
   }
  }
  roots.paletteOrder=b.container(K::Array,manifest.paletteOrder.size());for(std::size_t i=0;i<manifest.paletteOrder.size();++i)b.add(roots.paletteOrder,std::to_string(i),b.number(manifest.paletteOrder[i]));
  roots.paletteSlots=b.container(K::Array,palette.slots.size());for(std::size_t i=0;i<palette.slots.size();++i)b.add(roots.paletteSlots,std::to_string(i),palette.slots[i]?b.number(palette.slots[i]):b.null());
  roots.paletteColumns=b.number(palette.columns);roots.nextColorId=b.number(palette.nextId);return roots;
 }catch(...){graph.values.resize(start);throw;}
}
HistoryCompareDocument decodedHistoryComparison(const Document& document,const project::ReadManifest& manifest,const HistoryDecodeContext& context,project::Limits limits){
 HistoryCompareDocument graph;
 const auto metadata=appendDecodedHistoryMetadataValues(graph,document,manifest,context.documentId,limits);
 const auto rasters=appendDecodedHistoryRasterValues(graph,document,manifest,limits);
 const auto groups=appendDecodedHistoryGroupValues(graph,document,manifest,limits);
 const auto palette=appendDecodedHistoryPaletteValues(graph,document,manifest,limits);
 const auto resources=appendDecodedHistoryResourceValues(graph,document,limits);
 const auto timeline=appendDecodedHistoryTimelineValues(graph,document,limits);
 const auto masks=appendDecodedHistoryMaskValues(graph,document,context.maskNames.layer,context.maskNames.group,limits);
 const auto recording=appendDecodedHistoryRecordingValues(graph,document,limits);
 CompareAppend b(graph,limits);using K=HistoryCompareValue::Kind;
 // Read indices afresh after fragment appends: graph.values can reallocate.
 const auto field=[&](const char* key){for(const auto& p:graph.values[metadata].properties)if(p.first==key)return p.second;throw std::logic_error("Missing decoded history metadata field");};
 const auto root=b.container(K::Object);graph.root=root;
 // project-format-decode constructs the root in this order. Persisted panel
 // state is assigned after creation and therefore is the final enumerable key.
 for(const auto* key:{"schemaVersion","id","name","width","height","colorMode","pixelFormat"})b.add(root,key,field(key));
 b.add(root,"layers",rasters.layers);b.add(root,"groups",groups);b.add(root,"activeLayerId",field("activeLayerId"));
 b.add(root,"palette",palette.palette);b.add(root,"paletteOrder",palette.paletteOrder);b.add(root,"paletteColumns",palette.paletteColumns);b.add(root,"paletteSlots",palette.paletteSlots);b.add(root,"nextColorId",palette.nextColorId);
 b.add(root,"customBrushes",resources.customBrushes);b.add(root,"referenceImages",resources.referenceImages);b.add(root,"canvasReferences",field("canvasReferences"));b.add(root,"tilesets",timeline.tilesets);
 const auto animation=b.container(K::Object);b.add(animation,"frames",timeline.frames);b.add(animation,"cels",rasters.cels);b.add(animation,"layerMasks",masks.layerMasks);b.add(animation,"groupMasks",masks.groupMasks);b.add(animation,"loopSections",timeline.loopSections);b.add(animation,"activeFrameId",timeline.activeFrameId);b.add(animation,"loop",timeline.loop);b.add(root,"animation",animation);
 for(const auto& p:graph.values[metadata].properties)if(p.first=="outlineSettings"){b.add(root,p.first,p.second);break;}
 b.add(root,"displaySettings",field("displaySettings"));b.add(root,"statistics",field("statistics"));b.add(root,"timelapse",recording);b.add(root,"slices",resources.slices);
 for(const auto* key:{"filePath","dirty","createdAt","updatedAt","layerPanelState"})b.add(root,key,field(key));
 return graph;
}
std::optional<HistoryByteDifference> compareHistoryByteViews(const HistoryByteView& a,const HistoryByteView& b,project::Limits limits){
 const auto validate=[](const auto& view){if(!view.buffer||view.offset>view.buffer->size()||view.length>view.buffer->size()-view.offset||view.type.empty())throw std::invalid_argument("Invalid history byte view");};validate(a);validate(b);
 if(a.type!=b.type)return {};HistoryByteDifference result;std::size_t retained=0;
 const auto append=[&](std::optional<std::size_t> offset,std::size_t start,std::size_t an,std::size_t bn){
  if(result.patches.size()>=limits.maxEntries||an>limits.expandedBytes-retained||bn>limits.expandedBytes-retained-an)throw project::Error(project::ErrorKind::Limit,"History byte difference exceeds budget");
  retained+=an+bn;result.bytes+=double(an)+double(bn)+32.;
  auto before=std::make_shared<const Bytes>(a.buffer->begin()+a.offset+start,a.buffer->begin()+a.offset+start+an);
  auto after=std::make_shared<const Bytes>(b.buffer->begin()+b.offset+start,b.buffer->begin()+b.offset+start+bn);
  result.patches.push_back({offset,std::move(before),std::move(after)});
 };
 if(a.length!=b.length){result.replacement=true;append({},0,a.length,b.length);return result;}
 const bool words=a.offset%4==0&&b.offset%4==0&&a.length%4==0;
 for(std::size_t start=0;start<a.length;){
  if(words&&start%4==0){
   while(start<a.length){std::uint32_t av,bv;std::memcpy(&av,a.buffer->data()+a.offset+start,4);std::memcpy(&bv,b.buffer->data()+b.offset+start,4);if(av!=bv)break;start+=4;}
   if(start==a.length)break;
  }
  if((*a.buffer)[a.offset+start]==(*b.buffer)[b.offset+start]){++start;continue;}
  auto end=start+std::min(std::size_t(1024),a.length-start);
  while(end>start+1&&(*a.buffer)[a.offset+end-1]==(*b.buffer)[b.offset+end-1])--end;
  append(start,start,end-start,end-start);start=end;
 }
 return result;
}
namespace {
using Value=HistoryCompareValue;using Kind=Value::Kind;
bool object(const Value& value){return value.kind==Kind::Object||value.kind==Kind::Array||value.kind==Kind::View||value.kind==Kind::Other;}
std::size_t scalarLength(const Value& value){
 switch(value.kind){
 case Kind::Undefined:return 9;case Kind::Null:return 4;case Kind::Boolean:return value.boolean?4:5;case Kind::String:return value.text.size();
 case Kind::Number:{
  const auto n=value.number;if(std::isnan(n))return 3;if(std::isinf(n))return n<0?9:8;if(n==0)return 1;
  char buffer[64];const auto encoded=std::to_chars(buffer,buffer+64,std::abs(n),std::chars_format::general);if(encoded.ec!=std::errc())throw std::invalid_argument("Cannot format history primitive");
  std::string raw(buffer,encoded.ptr);const auto e=raw.find('e');const int exponent=e==std::string::npos?0:std::stoi(raw.substr(e+1));const auto mantissa=raw.substr(0,e);const auto dot=mantissa.find('.');std::string digits=mantissa;if(dot!=std::string::npos)digits.erase(dot,1);
  // to_chars may choose fixed notation with leading fractional zeroes.
  int decimal=int(dot==std::string::npos?mantissa.size():dot)+exponent;
  while(digits.size()>1&&digits.front()=='0'){digits.erase(digits.begin());--decimal;}
  while(digits.size()>1&&digits.back()=='0')digits.pop_back();
  const std::size_t sign=n<0?1:0;
  if(std::abs(n)>=1e-6&&std::abs(n)<1e21){if(decimal<=0)return sign+2+std::size_t(-decimal)+digits.size();if(decimal>=int(digits.size()))return sign+std::size_t(decimal);return sign+digits.size()+1;}
  const int scientific=decimal-1;return sign+digits.size()+(digits.size()>1?1:0)+2+std::to_string(std::abs(scientific)).size();
 }
 default:throw std::invalid_argument("Expected history primitive");
 }
}
bool same(const Value& a,const Value& b){
 if(a.kind!=b.kind)return false;
 if(object(a))return a.identity&&a.identity==b.identity;
 switch(a.kind){case Kind::Number:return (std::isnan(a.number)&&std::isnan(b.number))||(a.number==b.number&&(a.number!=0||std::signbit(a.number)==std::signbit(b.number)));case Kind::Boolean:return a.boolean==b.boolean;case Kind::String:return a.text==b.text;default:return true;}
}
}
std::optional<HistoryObjectDifference> compareHistoryObjects(const HistoryCompareDocument& before,const HistoryCompareDocument& after,project::Limits limits){
 for(std::size_t i=0;i<before.layers.size();++i)if(i>=after.layers.size()||before.layers[i].id!=after.layers[i].id||before.layers[i].runtimeRaster||after.layers[i].runtimeRaster)return {};
 HistoryObjectDifference result;for(const auto& layer:before.layers)result.beforeOrigins.emplace_back(layer.originX,layer.originY);for(const auto& layer:after.layers)result.afterOrigins.emplace_back(layer.originX,layer.originY);
 struct Task {std::size_t a,b;std::vector<std::string> path;};std::vector<Task> tasks{{before.root,after.root,{}}};
 std::unordered_map<std::size_t,std::size_t> forward,backward,replacements;
 std::unordered_set<std::string> affected;bool pixelOnly=true;double left=std::numeric_limits<double>::infinity(),top=left,right=-left,bottom=-left;std::size_t retained=0,visited=0;
 const auto append=[&](HistoryObjectPatch patch){if(result.patches.size()>=limits.maxEntries)throw project::Error(project::ErrorKind::Limit,"Too many history object patches");result.patches.push_back(std::move(patch));};
 while(!tasks.empty()){
  auto task=std::move(tasks.back());tasks.pop_back();if(++visited>limits.maxEntries)throw project::Error(project::ErrorKind::Limit,"History comparison exceeds node budget");
  if(task.a>=before.values.size()||task.b>=after.values.size())throw std::invalid_argument("Invalid history graph reference");
  const auto& a=before.values[task.a];const auto& b=after.values[task.b];const auto& path=task.path;
  if(same(a,b))continue;
  if(!object(a)||!object(b)){
   if(object(a)||object(b))return {};
   append({path,a,b,{},{}});result.bytes+=32.+double(scalarLength(a))*2.+double(scalarLength(b))*2.;
   if(!(path.size()==1&&(path[0]=="dirty"||path[0]=="updatedAt"||path[0]=="createdAt"))&&(path.empty()||path[0]!="statistics"))pixelOnly=false;
   continue;
  }
  const auto f=forward.find(task.a),r=backward.find(task.b);
  if(f!=forward.end()||r!=backward.end()){
   if(f==forward.end()||r==backward.end()||f->second!=task.b||r->second!=task.a)return {};
   if(const auto replacement=replacements.find(task.a);replacement!=replacements.end())result.patches[replacement->second].aliases->push_back(path);
   continue;
  }
  forward.emplace(task.a,task.b);backward.emplace(task.b,task.a);
  if(a.kind==Kind::View||b.kind==Kind::View){
   if(a.kind!=Kind::View||b.kind!=Kind::View)return {};
   auto byteLimits=limits;byteLimits.expandedBytes-=retained;auto difference=compareHistoryByteViews(a.view,b.view,byteLimits);if(!difference)return {};
   const HistoryCompareLayer* layer=nullptr;
   if(path.size()==3&&path[0]=="layers"&&path[2]=="pixels"){
    std::size_t index=0;const auto parsed=std::from_chars(path[1].data(),path[1].data()+path[1].size(),index);if(parsed.ec==std::errc()&&parsed.ptr==path[1].data()+path[1].size()&&index<before.layers.size())layer=&before.layers[index];
   }
   result.bytes+=difference->bytes;
   if(difference->replacement){replacements.emplace(task.a,result.patches.size());pixelOnly=false;}
   for(auto& patch:difference->patches){
    Value av,bv;av.kind=bv.kind=Kind::View;av.view={patch.before,0,patch.before->size(),difference->replacement?a.view.type:"Uint8Array"};bv.view={patch.after,0,patch.after->size(),difference->replacement?b.view.type:"Uint8Array"};
    retained+=av.view.length+bv.view.length;
    HistoryObjectPatch next{path,std::move(av),std::move(bv),patch.offset,{}};if(difference->replacement)next.aliases=std::vector<std::vector<std::string>>{path};append(std::move(next));
    if(layer){if(affected.insert(layer->id).second)result.affectedLayerIds.push_back(layer->id);
     if(patch.offset){if(layer->width<=0)throw std::invalid_argument("Invalid history layer width");const auto first=std::floor(double(*patch.offset)/4.),last=std::floor(double(*patch.offset+patch.after->size()-1)/4.);const auto y0=std::floor(first/layer->width),y1=std::floor(last/layer->width);left=std::min(left,layer->x+(y0==y1?std::fmod(first,layer->width):0));right=std::max(right,layer->x+(y0==y1?std::fmod(last,layer->width)+1:layer->width));top=std::min(top,layer->y+y0);bottom=std::max(bottom,layer->y+y1+1);}
    }else pixelOnly=false;
   }
   continue;
  }
  if((a.kind==Kind::Array)!=(b.kind==Kind::Array)||(a.kind==Kind::Array&&a.arrayLength!=b.arrayLength))return {};
  if(a.kind!=Kind::Array&&(a.kind!=Kind::Object||b.kind!=Kind::Object))return {};
  if(a.properties.size()>limits.maxEntries||b.properties.size()>limits.maxEntries)throw project::Error(project::ErrorKind::Limit,"History object exceeds property budget");
  const auto keys=[&](const Value& value){std::vector<std::pair<std::string,std::size_t>> values;std::unordered_set<std::string> seen;for(const auto& property:value.properties){if(!seen.insert(property.first).second)throw std::invalid_argument("Duplicate history object key");if(path.empty()&&(property.first=="id"||property.first=="filePath"||property.first=="sourceFilePath"))continue;values.push_back(property);}return values;};
  const auto ak=keys(a),bk=keys(b);if(ak.size()!=bk.size())return {};std::unordered_map<std::string,std::size_t> lookup;for(const auto& property:b.properties)lookup.emplace(property);
  for(auto it=ak.rbegin();it!=ak.rend();++it){const auto found=lookup.find(it->first);if(found==lookup.end())return {};auto child=path;child.push_back(it->first);if(tasks.size()>=limits.maxEntries)throw project::Error(project::ErrorKind::Limit,"History traversal exceeds task budget");tasks.push_back({it->second,found->second,std::move(child)});}
 }
 result.requiresAnimationSelectionNormalization=!pixelOnly;
 if(pixelOnly&&!result.affectedLayerIds.empty())result.region=HistoryObjectDifference::Region{left,top,right-left,bottom-top,before.activeFrameId};
 return result;
}

Delta historyDifferenceDelta(const HistoryObjectDifference& difference,const std::string& label,project::Limits limits){
 struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history compiler JSON");}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}} apartment;
 using namespace winrt::Windows::Data::Json;
 if(difference.patches.size()>limits.maxEntries||!std::isfinite(difference.bytes)||difference.bytes<0)throw project::Error(project::ErrorKind::Limit,"Invalid history comparison result");
 Delta result;JsonObject root;JsonArray patches;std::size_t retained=0;
 const auto text=[](const std::string& value){return JsonValue::CreateStringValue(winrt::to_hstring(value));};
 const auto number=[](double value)->IJsonValue{return std::isfinite(value)?IJsonValue(JsonValue::CreateNumberValue(value==0?0:value)):IJsonValue(JsonValue::CreateNullValue());};
 const auto path=[&](const std::vector<std::string>& values){JsonArray array;for(const auto& value:values)array.Append(text(value));return array;};
 const auto side=[&](JsonObject patch,const wchar_t* key,const HistoryCompareValue& value,std::size_t index,bool after){
  switch(value.kind){
  case Kind::Undefined:break;
  case Kind::Null:patch.Insert(key,JsonValue::CreateNullValue());break;
  case Kind::Boolean:patch.Insert(key,JsonValue::CreateBooleanValue(value.boolean));break;
  case Kind::Number:patch.Insert(key,number(value.number));break;
  case Kind::String:{std::wstring utf16;utf16.reserve(value.text.size());for(auto c:value.text)utf16.push_back(wchar_t(c));patch.Insert(key,JsonValue::CreateStringValue(utf16));break;}
  case Kind::View:{
   const auto& view=value.view;if(!view.buffer||view.offset>view.buffer->size()||view.length>view.buffer->size()-view.offset||view.length>limits.expandedBytes-retained)throw project::Error(project::ErrorKind::Limit,"History comparison buffer exceeds budget");
   retained+=view.length;auto data=view.buffer;if(view.offset||view.length!=data->size())data=std::make_shared<const Bytes>(data->begin()+view.offset,data->begin()+view.offset+view.length);
   result.buffers.push_back({index,after,view.type,std::move(data)});patch.Insert(key,JsonValue::CreateNullValue());break;
  }
  default:throw std::invalid_argument("Object-valued history replacement is not a compiled delta");
  }
 };
 for(std::size_t i=0;i<difference.patches.size();++i){const auto& patch=difference.patches[i];JsonObject encoded;encoded.Insert(L"path",path(patch.path));if(patch.offset)encoded.Insert(L"offset",number(double(*patch.offset)));if(patch.aliases){JsonArray aliases;for(const auto& alias:*patch.aliases)aliases.Append(path(alias));encoded.Insert(L"aliases",aliases);}side(encoded,L"before",patch.before,i,false);side(encoded,L"after",patch.after,i,true);patches.Append(encoded);}
 root.Insert(L"patches",patches);JsonObject origins;for(bool after:{false,true}){JsonArray points;for(const auto& point:after?difference.afterOrigins:difference.beforeOrigins){JsonObject value;value.Insert(L"x",number(point.first));value.Insert(L"y",number(point.second));points.Append(value);}origins.Insert(after?L"after":L"before",points);}root.Insert(L"origins",origins);root.Insert(L"label",text(label));root.Insert(L"bytes",number(difference.bytes));JsonObject invalidation;
 if(difference.region){invalidation.Insert(L"kind",text("region"));if(difference.region->frameId)invalidation.Insert(L"frameId",text(*difference.region->frameId));JsonObject rect;rect.Insert(L"x",number(difference.region->x));rect.Insert(L"y",number(difference.region->y));rect.Insert(L"width",number(difference.region->width));rect.Insert(L"height",number(difference.region->height));invalidation.Insert(L"rect",rect);}else invalidation.Insert(L"kind",text("full"));root.Insert(L"invalidation",invalidation);
 JsonArray affected;for(const auto& id:difference.affectedLayerIds)affected.Append(text(id));root.Insert(L"affectedLayerIds",affected);root.Insert(L"requiresAnimationSelectionNormalization",JsonValue::CreateBooleanValue(difference.requiresAnimationSelectionNormalization));
 result.json=javascriptJsonUtf8(std::wstring_view(root.Stringify()));if(result.json.size()>limits.manifestBytes)throw project::Error(project::ErrorKind::Limit,"History comparison metadata exceeds budget");return result;
}
std::optional<Delta> compileHistoryGraphs(const HistoryCompareDocument& before,const HistoryCompareDocument& after,const std::string& label,project::Limits limits){auto result=compareHistoryObjects(before,after,limits);if(!result)return {};return historyDifferenceDelta(*result,label,limits);}

}
