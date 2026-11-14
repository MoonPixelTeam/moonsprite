#include <algorithm>
#include "tilemap_project_json.h"
#include "free_tile_project_json.h"
#include "gradient_map_presets.h"
#include <codecvt>
#include <locale>
#include "text_project_json.h"
#include "layer_metadata.h"
#include "javascript_text.h"
#include "project_manifest.h"
#include "document_color_mode.h"
#include "outline_settings_json.h"
#include "layer_panel_state_json.h"
#include "timelapse_project_json.h"
#include "legacy_json_number.h"
#include "project_restore_report.h"
#include "background_layer.h"
#include "layer_blend.h"
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
#include <roapi.h>
#include <windows.h>
#ifdef GetObject
#undef GetObject
#endif
#include <cmath>
#include <limits>
#include <set>
#include <tuple>
namespace moon::project {
namespace {
using namespace winrt::Windows::Data::Json;
[[noreturn]] void bad(const std::string& path) {throw Error(ErrorKind::Corrupt,"Invalid project manifest: "+path);}
struct Apartment {
  HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);
  Apartment() {if(FAILED(status) && status!=RPC_E_CHANGED_MODE) throw std::runtime_error("Cannot initialize system JSON parser; HRESULT="+std::to_string(status));}
  ~Apartment() {if(status==S_OK) winrt::clear_factory_cache();if(SUCCEEDED(status)) RoUninitialize();}
};
winrt::hstring key(const char* name) {return winrt::to_hstring(name);}
IJsonValue value(const JsonObject& o,const char* name) {return o.HasKey(key(name))?o.GetNamedValue(key(name)):nullptr;}
bool present(const JsonObject& o,const char* name) {auto v=value(o,name);return v && v.ValueType()!=JsonValueType::Null;}
std::string str(const JsonObject& o,const char* name,bool required=true,const std::string& fallback={}) {
  auto v=value(o,name);if(!v || v.ValueType()==JsonValueType::Null) {if(required) bad(name);return fallback;}
  if(v.ValueType()!=JsonValueType::String) bad(name);
  auto s=winrt::to_string(v.GetString());if(required && s.empty()) bad(name);return s;
}
JsonObject object(const JsonObject& o,const char* name) {auto v=value(o,name);if(!v || v.ValueType()!=JsonValueType::Object) bad(name);return v.GetObject();}
JsonArray array(const JsonObject& o,const char* name,bool required=true) {auto v=value(o,name);if(!v) {if(required) bad(name);return JsonArray();}if(v.ValueType()!=JsonValueType::Array) bad(name);return v.GetArray();}
int integerValue(const IJsonValue& v,const std::string& path,int minimum=std::numeric_limits<int>::min()) {
  if(!v || v.ValueType()!=JsonValueType::Number) bad(path);const auto n=v.GetNumber();
  if(!std::isfinite(n) || std::floor(n)!=n || n<minimum || n>std::numeric_limits<int>::max()) bad(path);return int(n);
}
int integer(const JsonObject& o,const char* name,int fallback,int minimum=std::numeric_limits<int>::min(),bool required=false) {auto v=value(o,name);if(!v) {if(required) bad(name);return fallback;}return integerValue(v,name,minimum);}
bool boolean(const JsonObject& o,const char* name,bool fallback) {auto v=value(o,name);if(!v) return fallback;if(v.ValueType()!=JsonValueType::Boolean) bad(name);return v.GetBoolean();}
double opacity(const JsonObject& o,const char* name,double fallback=1) {auto v=value(o,name);if(!v) return fallback;if(v.ValueType()!=JsonValueType::Number) bad(name);auto n=v.GetNumber();if(!std::isfinite(n)||n<0||n>1) bad(name);return n;}
JsonObject itemObject(const IJsonValue& v,const char* path) {if(v.ValueType()!=JsonValueType::Object) bad(path);return v.GetObject();}
void unique(std::set<std::string>& ids,const std::string& id,const char* kind) {if(!ids.insert(id).second) bad(std::string("duplicate ")+kind+" ID "+id);}
void fields(const JsonObject& o,const std::set<std::string>& known,const char* path,ReadManifest& out) {
  for(const auto& field:o) {const auto name=winrt::to_string(field.Key());if(!known.count(name)) out.unsupported.emplace_back(std::string(path)+"."+name);}
}
void nonempty(const JsonObject& o,const char* name,ReadManifest& out) {if(present(o,name) && array(o,name).Size()!=0) out.unsupported.emplace_back(name);}

std::optional<timeline::ColorOverlayStyle> readColorOverlay(const JsonObject& owner,ReadManifest&,const std::string&){
 // Direct normalizeLayerStyles boundary: record includes JSON arrays; numeric
 // effect fields use Number(value), unlike gradient-map's strict RGB numbers.
 const auto raw=value(owner,"layerStyles");if(!raw||(raw.ValueType()!=JsonValueType::Object&&raw.ValueType()!=JsonValueType::Array))return {};
 const auto record=[](IJsonValue v){return v&&v.ValueType()==JsonValueType::Object?v.GetObject():JsonObject{};};
 const auto styles=record(raw);timeline::ColorOverlayStyle s;s.preservedJson=winrt::to_string(raw.Stringify());
 const auto yes=[](const JsonObject& o,const char* key){const auto v=value(o,key);return v&&v.ValueType()==JsonValueType::Boolean&&v.GetBoolean();};
 const auto notFalse=[](const JsonObject& o,const char* key){const auto v=value(o,key);return !v||v.ValueType()!=JsonValueType::Boolean||v.GetBoolean();};
 const auto integer=[](const JsonObject& o,const char* key,int fallback,int low,int high){const auto n=legacyjson::number(o.HasKey(winrt::to_hstring(key))?o.GetNamedValue(winrt::to_hstring(key)):IJsonValue{nullptr});return std::isfinite(n)?int(std::clamp(std::floor(n+.5),double(low),double(high))):fallback;};
 const auto color=[&](const JsonObject& o,const char* key,std::uint32_t fallback){const auto v=value(o,key);if(!v||(v.ValueType()!=JsonValueType::Object&&v.ValueType()!=JsonValueType::Array))return fallback;const auto c=record(v);std::uint32_t packed=0;for(int i=0;i<4;++i)packed|=std::uint32_t(integer(c,std::string(1,"rgba"[i]).c_str(),(fallback>>(8*i))&255,0,255))<<(8*i);return packed;};
 s.enabled=notFalse(styles,"enabled");const auto map=record(value(styles,"gradientMap"));s.gradientMapEnabled=yes(map,"enabled");s.gradientMap=GradientMapPresetStore::decodeSettings(map);
 const auto stroke=record(value(styles,"stroke"));auto& st=s.stroke;st.enabled=yes(stroke,"enabled");st.color=color(stroke,"color",0xff000000);st.size=integer(stroke,"size",1,1,64);st.darkness=integer(stroke,"smartHueDarkness",45,0,100);st.smartHue=yes(stroke,"smartHue");st.followOpacity=yes(stroke,"followOpacity");
 const auto text=[](const JsonObject& o,const char* key){const auto v=value(o,key);return v&&v.ValueType()==JsonValueType::String?winrt::to_string(v.GetString()):std::string{};};const auto position=text(stroke,"position"),kernel=text(stroke,"kernel");st.position=position=="inside"?0:position=="both"?2:1;st.kernel=kernel=="square"?1:kernel=="horizontal"?2:kernel=="vertical"?3:0;st.directions=st.kernel==0?0x5a:st.kernel==1?0xff:st.kernel==2?0x18:0x42;
 const auto directions=record(value(stroke,"directions"));const char* names[]{"nw","n","ne","w","e","sw","s","se"};for(int i=0;i<8;++i){const auto v=value(directions,names[i]);if(v&&v.ValueType()==JsonValueType::Boolean){if(v.GetBoolean())st.directions|=1u<<i;else st.directions&=~(1u<<i);}}
 const auto shadow=record(value(styles,"shadow"));auto& sh=s.shadow;sh.enabled=yes(shadow,"enabled");sh.color=color(shadow,"color",0xa0000000);sh.offsetX=integer(shadow,"offsetX",2,-64,64);sh.offsetY=integer(shadow,"offsetY",2,-64,64);sh.blur=integer(shadow,"blur",0,0,32);sh.smart=yes(shadow,"smartShadow");sh.darkness=integer(shadow,"smartShadowDarkness",45,0,100);
 const auto glow=record(value(styles,"innerGlow"));s.innerGlow.enabled=yes(glow,"enabled");s.innerGlow.color=color(glow,"color",0xc0ffffff);s.innerGlow.size=integer(glow,"size",2,1,32);
 const auto overlay=record(value(styles,"colorOverlay"));s.overlayEnabled=yes(overlay,"enabled");s.color=color(overlay,"color",0xffff7929);
 const auto gradient=record(value(styles,"gradientOverlay"));s.gradientEnabled=yes(gradient,"enabled");s.gradientFrom=color(gradient,"from",0xff000000);s.gradientTo=color(gradient,"to",0xffffffff);s.gradientAngle=integer(gradient,"angle",0,0,359);const auto dither=text(gradient,"dither");for(int i=0;i<9;++i)if(dither==GradientMapPresetStore::ditherNames()[i])s.gradientDither=i;
 return s;
}
}
std::optional<timeline::ColorOverlayStyle> normalizeLayerStylesJson(const std::string& json){
 JsonObject owner;owner.Insert(L"layerStyles",JsonValue::Parse(winrt::to_hstring(json)));ReadManifest unused;auto style=readColorOverlay(owner,unused,{});if(style)style->preservedJson.clear();return style;
}
ReadManifest readProjectManifest(std::shared_ptr<const Bytes> bytes,Limits limits) {return readProjectManifest(std::move(bytes),limits,nullptr);}
static ReadManifest readManifestWithClock(std::shared_ptr<const Bytes>,Limits,TimelapseRestoreReport*,const std::function<std::string()>&);
ReadManifest readProjectManifestWithClock(std::shared_ptr<const Bytes> bytes,Limits limits,std::function<std::string()> clock){if(!clock)throw std::invalid_argument("Missing project decode clock");return readManifestWithClock(std::move(bytes),limits,nullptr,clock);}
ReadManifest readProjectManifest(std::shared_ptr<const Bytes> bytes,Limits limits,TimelapseRestoreReport* report){return readManifestWithClock(std::move(bytes),limits,report,projectTimestamp);}
static ReadManifest readManifestWithClock(std::shared_ptr<const Bytes> bytes,Limits limits,TimelapseRestoreReport* report,const std::function<std::string()>& clock) {
  if(report)*report={};
  Archive archive(bytes,limits);const auto json=archive.read("manifest.json",limits.manifestBytes);
  if(json.empty()) bad("empty manifest");
  // Strict UTF-8 decoding; malformed sequences must not silently change names/IDs.
  if(json.size()>std::numeric_limits<int>::max()) throw Error(ErrorKind::Limit,"Manifest is too large");
  const auto count=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,reinterpret_cast<const char*>(json.data()),int(json.size()),nullptr,0);
  if(count==0) bad("manifest UTF-8");
  std::wstring wide(count,L'\0');
  if(MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,reinterpret_cast<const char*>(json.data()),int(json.size()),wide.data(),count)!=count) bad("manifest UTF-8");
  Apartment apartment;
  try {
    JsonObject root;if(!JsonObject::TryParse(winrt::hstring(wide),root)) bad("JSON syntax");
    ReadManifest out;out.manifestUtf8.assign(json.begin(),json.end());out.sourceArchive=std::move(bytes);
    if(str(root,"app")!="MoonSprite") bad("app");
    out.schemaVersion=integer(root,"schemaVersion",0,1,true);
    if(out.schemaVersion<1||out.schemaVersion>21) throw Error(ErrorKind::Unsupported,"Native manifest migration supports project schemas 1 through 21");
    auto doc=object(root,"document");
    if(integer(doc,"schemaVersion",0,1,true)!=out.schemaVersion) bad("document schemaVersion mismatch");
    // normalizeAnimationTimeline falls back when animation/frames is absent.
    auto animationValue=value(doc,"animation");
    if(!animationValue||animationValue.ValueType()!=JsonValueType::Object){JsonObject a;a.Insert(L"frames",JsonArray());a.Insert(L"cels",JsonArray());doc.Insert(L"animation",a);}
    bool normalizedAnimationArrays=false;
    {auto a=object(doc,"animation");for(const auto* name:{L"frames",L"cels"}){auto list=a.TryLookup(name);if(!list||list.ValueType()!=JsonValueType::Array){a.Insert(name,JsonArray());normalizedAnimationArrays=true;}}}
    // project-format-manifest.ts version gates, including pre-animation files.
    // Keep source version for atlas decoding; preserved JSON is normalized so
    // saving an imported archive cannot restore obsolete version metadata.
    const auto sourceVersion=out.schemaVersion;
    // Legacy rejects unknown raster codecs before slot filtering. Even a Cel
    // that is later discarded cannot hide an encoding from a future format.
    if(sourceVersion>=5){auto checkEncodings=[&](const JsonArray& entries){for(const auto& item:entries){if(item.ValueType()!=JsonValueType::Object)continue;const auto entry=item.GetObject();if(!entry.HasKey(L"dataEncoding"))continue;const auto encoding=entry.GetNamedValue(L"dataEncoding");if(encoding.ValueType()!=JsonValueType::String||(encoding.GetString()!=L"raw"&&encoding.GetString()!=L"sparse-tiles-v1"))throw Error(ErrorKind::Unsupported,"Unknown project raster encoding");}};checkEncodings(array(doc,"layers"));checkEncodings(array(object(doc,"animation"),"cels"));}
    if(sourceVersion<21){
      for(const auto& item:array(doc,"layers")){
        auto layer=itemObject(item,"layer");
        if(sourceVersion<=4)layer.Insert(L"dataEncoding",JsonValue::CreateStringValue(L"raw"));
        if(sourceVersion<11)layer.Remove(L"layerStyles");
        if(sourceVersion<12)layer.Remove(L"background");
        if(sourceVersion<17)layer.Remove(L"linkedContentId");
        if(sourceVersion<14){if(str(layer,"kind",false)=="free-tile")layer.Remove(L"kind");layer.Remove(L"freeTileTilesetId");layer.Remove(L"freeTileSources");}
        if(str(layer,"kind",false)=="free-tile"){
          if(sourceVersion<15)layer.Remove(L"freeTileSources");else layer.Remove(L"freeTileTilesetId");
          if(sourceVersion<18)layer.Insert(L"freeTileSetId",JsonValue::CreateStringValue(winrt::to_hstring("import-free-set-"+str(layer,"id"))));
        }
      }
      if(sourceVersion<11)for(const auto& item:array(doc,"groups",false))if(item.ValueType()==JsonValueType::Object)item.GetObject().Remove(L"layerStyles");
      if(sourceVersion<13)doc.Insert(L"tilesets",JsonArray());
      if(sourceVersion==1){
        JsonObject animation,frame;frame.Insert(L"id",JsonValue::CreateStringValue(L"frame-1"));frame.Insert(L"duration",JsonValue::CreateNumberValue(100));JsonArray frames;frames.Append(frame);animation.Insert(L"frames",frames);animation.Insert(L"activeFrameId",JsonValue::CreateStringValue(L"frame-1"));animation.Insert(L"loop",JsonValue::CreateBooleanValue(true));
        // User-approved schema1 repair: retain the imported layer surface.
        // Legacy refreshActiveAnimationFrame otherwise clears it without a Cel.
        JsonArray cels;unsigned serial=0;for(const auto& item:array(doc,"layers")){auto layer=item.GetObject();JsonObject cel;for(const auto* name:{L"width",L"height",L"offsetX",L"offsetY",L"dataFile",L"dataEncoding",L"opacity"})if(layer.HasKey(name))cel.Insert(name,layer.GetNamedValue(name));cel.Insert(L"id",JsonValue::CreateStringValue(winrt::to_hstring("cel-"+std::to_string(++serial))));cel.Insert(L"layerId",layer.GetNamedValue(L"id"));cel.Insert(L"frameId",JsonValue::CreateStringValue(L"frame-1"));cel.Insert(L"format",JsonValue::CreateStringValue(str(doc,"colorMode")=="indexed"?L"indexed":L"rgba"));cels.Append(cel);}animation.Insert(L"cels",cels);doc.Insert(L"animation",animation);
      }
      auto animation=object(doc,"animation");
      for(const auto& item:array(animation,"cels")){if(item.ValueType()!=JsonValueType::Object)continue;auto cel=item.GetObject();if(sourceVersion<=4&&present(cel,"dataFile"))cel.Insert(L"dataEncoding",JsonValue::CreateStringValue(L"raw"));if(sourceVersion<13)cel.Remove(L"tilemap");if(sourceVersion<14)cel.Remove(L"freeTiles");}
      if(sourceVersion<16)animation.Insert(L"loopSections",JsonArray());
      doc.Insert(L"referenceImages",JsonArray());doc.Insert(L"canvasReferences",JsonArray());
      if(sourceVersion<20){auto timelapse=value(doc,"timelapse");if(timelapse&&timelapse.ValueType()==JsonValueType::Object){auto snapshots=value(timelapse.GetObject(),"snapshots");if(snapshots&&snapshots.ValueType()==JsonValueType::Array)for(const auto& snapshot:snapshots.GetArray())if(snapshot.ValueType()==JsonValueType::Object)snapshot.GetObject().Remove(L"local");}}
      root.Insert(L"schemaVersion",JsonValue::CreateNumberValue(21));doc.Insert(L"schemaVersion",JsonValue::CreateNumberValue(21));
      out.manifestUtf8=winrt::to_string(root.Stringify());out.schemaVersion=21;
    }
    out.id=str(doc,"id");out.name=str(doc,"name",false);out.width=integer(doc,"width",0,1,true);out.height=integer(doc,"height",0,1,true);
    out.colorMode=str(doc,"colorMode");out.activeLayerId=textjson::str(doc,L"activeLayerId");
    auto date=[&](const char* name){auto v=value(doc,name);return v&&v.ValueType()==JsonValueType::String&&!v.GetString().empty()?winrt::to_string(v.GetString()):clock();};out.information.createdAt=date("createdAt");out.information.updatedAt=date("updatedAt");
    if(auto v=value(doc,"statistics");v&&v.ValueType()==JsonValueType::Object){const auto statistics=v.GetObject();auto counter=[&](const char* name){const auto n=value(statistics,name);return n&&n.ValueType()==JsonValueType::Number?projectCounter(n.GetNumber()):std::uint64_t(0);};out.information.strokeCount=counter("strokeCount");out.information.operationCount=counter("operationCount");out.information.drawingTimeMs=counter("drawingTimeMs");}

    if(!color_mode::rgbaStorageMode(out.colorMode)) out.unsupported.emplace_back("colorMode="+out.colorMode);
    // project-format-decode.ts: invalid, absent and non-string formats fall back.
    if(auto v=value(doc,"pixelFormat");v&&v.ValueType()==JsonValueType::String)
      out.pixelFormat=std::string(color_mode::name(color_mode::preferencePixelFormat(winrt::to_string(v.GetString()))));
    fields(root,{"app","schemaVersion","document","sourceSchemaVersion"},"manifest",out);
    fields(doc,{"schemaVersion","id","name","width","height","colorMode","pixelFormat","layers","groups","activeLayerId","palette","paletteOrder","paletteSlots","paletteColumns","nextColorId","customBrushes","referenceImages","canvasReferences","tilesets","animation","outlineSettings","displaySettings","layerPanelState","statistics","timelapse","slices","createdAt","updatedAt"},"document",out);
    if(present(doc,"displaySettings")){const auto display=object(doc,"displaySettings");auto pixelGrid=value(display,"showPixelGrid");out.showPixelGrid=pixelGrid&&pixelGrid.ValueType()==JsonValueType::Boolean&&pixelGrid.GetBoolean();auto custom=value(display,"showGrid");out.showCustomGrid=custom&&custom.ValueType()==JsonValueType::Boolean&&custom.GetBoolean();auto grid=value(display,"grid");if(grid&&grid.ValueType()==JsonValueType::Object){auto obj=grid.GetObject();auto n=[&](const char* name,double fallback){auto v=value(obj,name);return v&&v.ValueType()==JsonValueType::Number?v.GetNumber():fallback;};out.customGrid=normalizeGridSettings({n("x",0),n("y",0),n("width",16),n("height",16)});}if(present(display,"symmetryCenter")){const auto center=object(display,"symmetryCenter");out.symmetryCenter=std::make_pair(center.GetNamedNumber(L"x"),center.GetNamedNumber(L"y"));}}
    out.outline=decodeOutlineSettings(value(doc,"outlineSettings"));
    nonempty(doc,"canvasReferences",out);
    if(auto values=value(doc,"slices");values&&values.ValueType()==JsonValueType::Array){std::vector<DocumentSlice> parsed;for(const auto& item:values.GetArray()){if(item.ValueType()!=JsonValueType::Object)continue;auto o=item.GetObject();auto id=value(o,"id");if(!id||id.ValueType()!=JsonValueType::String)continue;double numbers[4];bool valid=true;const char* keys[]={"x","y","width","height"};for(int i=0;i<4;++i){auto n=value(o,keys[i]);if(!n||n.ValueType()!=JsonValueType::Number||!std::isfinite(n.GetNumber()))throw std::runtime_error("Invalid slice coordinate: numeric values required");numbers[i]=n.GetNumber();}if(!valid||std::floor(numbers[2]+.5)<1||std::floor(numbers[3]+.5)<1)continue;DocumentSlice slice;slice.id=winrt::to_string(id.GetString());if(auto name=value(o,"name");name&&name.ValueType()==JsonValueType::String){auto wideName=std::wstring(name.GetString());for(std::size_t i=0;i<wideName.size();++i){char32_t c=wideName[i];if(c>=0xd800&&c<=0xdbff&&i+1<wideName.size()){const char32_t lo=wideName[++i];c=0x10000+((c-0xd800)<<10)+(lo-0xdc00);}slice.name.push_back(c);}}slice.rect={sliceRound(numbers[0]),sliceRound(numbers[1]),sliceRound(numbers[2]),sliceRound(numbers[3])};fields(o,{"id","name","x","y","width","height"},"slice",out);parsed.push_back(std::move(slice));}out.slices=normalizeDocumentSlices(std::move(parsed),out.width,out.height);}

    std::set<std::string> groupIds;
    for(const auto& item:array(doc,"groups",false)){
      const auto o=itemObject(item,"group");ManifestGroup group;group.id=str(o,"id");unique(groupIds,group.id,"group");group.name=str(o,"name",false);group.parentGroupId=str(o,"parentGroupId",false);group.parentGroupIdPresent=o.HasKey(L"parentGroupId");group.visible=boolean(o,"visible",true);group.locked=boolean(o,"locked",false);group.opacity=opacity(o,"opacity");group.blendMode=str(o,"blendMode",false,"normal");group.description=str(o,"description",false);
      if(auto order=value(o,"panelOrder");order&&order.ValueType()!=JsonValueType::Null){if(order.ValueType()!=JsonValueType::Number||!std::isfinite(order.GetNumber()))bad("group.panelOrder");group.panelOrder=order.GetNumber();}
      if(auto v=value(o,"displayColor");v&&v.ValueType()==JsonValueType::Object){auto color=v.GetObject();double rgba[4];bool valid=true;const char* keys[]={"r","g","b","a"};for(int i=0;i<4;++i){auto c=value(color,keys[i]);if(!c||c.ValueType()!=JsonValueType::Number){valid=false;break;}rgba[i]=c.GetNumber();}if(valid)group.displayColor=normalizeLayerDisplayColor(rgba[0],rgba[1],rgba[2],rgba[3]);}
      if(!parseLayerBlendMode(group.blendMode))out.unsupported.emplace_back("group blendMode="+group.blendMode);
      group.clippingMask=boolean(o,"clippingMask",false);
      group.layerStyles=readColorOverlay(o,out,group.id);
      group.cumulativeBlend=boolean(o,"cumulativeBlend",false);
      if(present(o,"adjustment"))out.unsupported.emplace_back("group effects "+group.id);
      fields(o,{"id","name","parentGroupId","visible","locked","opacity","blendMode","panelOrder","displayColor","description","clippingMask","layerStyles","adjustment","cumulativeBlend"},"group",out);out.groups.push_back(std::move(group));
    }
    // Decode each shared resource/geometry tuple once. Source archive preserves all other files.
    using RasterKey=std::tuple<std::string,std::string,RasterFormat,int,int,int,int>;
    std::map<RasterKey,std::shared_ptr<const ManifestRaster>> rasters;std::size_t decodedBytes=0;
    std::set<std::string> consumedFiles{"manifest.json","preview.png"};
    if(auto recording=value(doc,"timelapse");recording&&recording.ValueType()==JsonValueType::Object)out.timelapse=timelapsejson::decode(recording.GetObject(),archive,consumedFiles,limits.expandedBytes,report);
    auto raster=[&](const JsonObject& metadata,bool mask=false)->std::shared_ptr<const ManifestRaster> {
      if(!present(metadata,"dataFile")) return {};
      auto file=str(metadata,"dataFile"),encoding=str(metadata,"dataEncoding",false,"raw");consumedFiles.insert(file);
      int w=integer(metadata,"width",out.width,1),h=integer(metadata,"height",out.height,1);
      int x=integer(metadata,"offsetX",0),y=integer(metadata,"offsetY",0);
      const auto formatName=str(metadata,"format",false,"rgba");
      if(formatName!="rgba"&&formatName!="indexed")bad("raster format");
      const auto format=formatName=="indexed"?RasterFormat::Indexed:RasterFormat::Rgba;
      RasterKey cacheKey{file,encoding,format,w,h,x,y};auto cached=rasters.find(cacheKey);if(cached!=rasters.end()) return cached->second;
      const std::uint64_t pixels=std::uint64_t(w)*h;
      if(pixels>(limits.expandedBytes-decodedBytes)/4) throw Error(ErrorKind::Limit,"Decoded project pixels exceed budget");
      auto data=archive.read(file,limits.expandedBytes);
      auto result=std::make_shared<ManifestRaster>();result->width=w;result->height=h;result->offsetX=x;result->offsetY=y;result->dataFile=file;result->dataEncoding=encoding;result->format=format;
      if(mask&&encoding=="raw"&&data.size()==pixels){result->pixels.reserve(std::size_t(pixels));for(auto v:data)result->pixels.push_back(0xff000000u|std::uint32_t(v)*0x010101u);}else result->pixels=decodeRaster(data,encoding,format,w,h,limits.expandedBytes-decodedBytes);decodedBytes+=std::size_t(pixels)*4;
      rasters.emplace(cacheKey,result);return result;
    };

    std::set<std::string> tilesetIds;
    for(const auto& item:array(doc,"tilesets",false)){
      auto o=itemObject(item,"tileset");tiles::Tileset t;t.id=tilejson::string(o,L"id");unique(tilesetIds,t.id,"tileset");
      if(auto name=value(o,"name");name&&name.ValueType()==JsonValueType::String)t.name=std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(winrt::to_string(name.GetString()));t.name=std::u32string(javascriptTrim(t.name));if(t.name.empty())t.name=U"Tileset";t.tileWidth=tilejson::integer(o,L"tileWidth",1,int(tiles::MaxTilesetPixels));t.tileHeight=tilejson::integer(o,L"tileHeight",1,int(tiles::MaxTilesetPixels));t.columns=tilejson::integer(o,L"columns",1,int(tiles::MaxCells));t.rows=tilejson::integer(o,L"rows",1,int(tiles::MaxCells));tiles::sizeCheck(t.tileWidth,t.tileHeight,t.columns,t.rows,true);
      for(auto id:o.GetNamedArray(L"tileIds")){if(id.ValueType()!=JsonValueType::String)bad("tileset tile ID");t.tileIds.push_back(winrt::to_string(id.GetString()));}
      if(o.HasKey(L"tileSlots"))for(auto slot:o.GetNamedArray(L"tileSlots")){if(slot.ValueType()==JsonValueType::Null)t.tileSlots.push_back({});else if(slot.ValueType()==JsonValueType::String)t.tileSlots.push_back(winrt::to_string(slot.GetString()));else bad("tileset slot");}
      const auto file=str(o,"dataFile");const auto count=std::size_t(t.columns)*t.rows*t.tileWidth*t.tileHeight;if(count>(limits.expandedBytes-decodedBytes)/4)throw Error(ErrorKind::Limit,"Tileset decoded budget exceeded");const auto bytes=archive.read(file,limits.expandedBytes-decodedBytes);if(bytes.size()!=count*4)bad("tileset byte count");t.pixels.resize(count);for(std::size_t i=0;i<count;++i)t.pixels[i]=std::uint32_t(bytes[4*i])|(std::uint32_t(bytes[4*i+1])<<8)|(std::uint32_t(bytes[4*i+2])<<16)|(std::uint32_t(bytes[4*i+3])<<24);tilejson::validate(t);t.tileSlots=tiles::normalizedSlots(t);decodedBytes+=bytes.size();consumedFiles.insert(file);fields(o,{"id","name","tileWidth","tileHeight","columns","rows","tileIds","tileSlots","dataFile"},"tileset",out);out.tilesets.push_back(std::move(t));
    }
    std::set<std::string> referenceIds;
    for(const auto& item:array(doc,"referenceImages",false)){const auto o=itemObject(item,"reference image");ReferenceImage image;image.id=str(o,"id");unique(referenceIds,image.id,"reference image");image.width=integer(o,"width",0,1,true);image.height=integer(o,"height",0,1,true);const auto file=str(o,"dataFile");if(file!="references/"+image.id+".rgba")bad("Invalid reference image resource");const auto count=std::uint64_t(image.width)*image.height;if(count>(limits.expandedBytes-decodedBytes)/4)throw Error(ErrorKind::Limit,"Reference images exceed decoded budget");auto bytes=archive.read(file,limits.expandedBytes-decodedBytes);if(count*4!=bytes.size())bad("Invalid reference image bytes");auto pixels=std::make_shared<std::vector<std::uint32_t>>(std::size_t(count));for(std::size_t i=0;i<pixels->size();++i)(*pixels)[i]=std::uint32_t(bytes[4*i])|(std::uint32_t(bytes[4*i+1])<<8)|(std::uint32_t(bytes[4*i+2])<<16)|(std::uint32_t(bytes[4*i+3])<<24);image.pixels=std::move(pixels);try{validateReferenceImage(image);}catch(const std::invalid_argument& e){bad(e.what());}decodedBytes+=bytes.size();consumedFiles.insert(file);fields(o,{"id","width","height","dataFile"},"reference image",out);out.referenceImages.push_back(std::move(image));}
    std::set<std::string> brushIds;
    for(const auto& item:array(doc,"customBrushes",false)){
      auto o=itemObject(item,"custom brush");ProjectBrushMetadata metadata;metadata.id=str(o,"id");metadata.name=str(o,"name",false);unique(brushIds,metadata.id,"brush");metadata.width=integer(o,"width",0,1,true);metadata.height=integer(o,"height",0,1,true);metadata.dataFile=str(o,"dataFile");metadata.colorsFile=str(o,"colorsFile",false);
      if(present(o,"sourceX"))metadata.sourceX=integer(o,"sourceX",0);if(present(o,"sourceY"))metadata.sourceY=integer(o,"sourceY",0);
      const std::uint64_t count=std::uint64_t(metadata.width)*metadata.height;if(count>16*1024*1024)throw Error(ErrorKind::Limit,"Project brush exceeds legacy resource limit");
      if(count>limits.expandedBytes-decodedBytes)throw Error(ErrorKind::Limit,"Project brush decoded bytes exceed budget");
      std::map<std::string,Bytes> resources;resources[metadata.dataFile]=archive.read(metadata.dataFile,limits.expandedBytes-decodedBytes);consumedFiles.insert(metadata.dataFile);
      if(!metadata.colorsFile.empty()&&archive.entries().count(metadata.colorsFile)){resources[metadata.colorsFile]=archive.read(metadata.colorsFile,limits.expandedBytes-decodedBytes);consumedFiles.insert(metadata.colorsFile);}
      try{auto resource=decodeProjectBrushResource(metadata,resources);const auto storageBytes=resource.brush.coverage.size()+resource.brush.colors.size()*4;if(storageBytes>limits.expandedBytes-decodedBytes)throw Error(ErrorKind::Limit,"Project brush decoded bytes exceed budget");decodedBytes+=storageBytes;out.customBrushes.push_back(std::move(resource));}catch(const std::invalid_argument& e){bad(e.what());}
      // Original metadata object is retained in sourceArchive/manifestUtf8, including unknown fields.
    }
    std::set<std::string> layerIds,frameIds,celIds;
    for(const auto& item:array(doc,"layers")) {
      const auto o=itemObject(item,"layer");ManifestLayer layer;
      layer.id=str(o,"id");unique(layerIds,layer.id,"layer");layer.name=str(o,"name",false);
      // decodeProject uses literal booleans and finite numeric opacity here,
      // not general JSON coercion or the stricter native model validators.
      const auto literal=[&](const char* name,bool expected){const auto v=value(o,name);return v&&v.ValueType()==JsonValueType::Boolean&&v.GetBoolean()==expected;};
      layer.visible=!literal("visible",false);layer.locked=literal("locked",true);layer.autoLinkAnimationCels=literal("autoLinkAnimationCels",true);layer.opacity=1;
      if(const auto alpha=value(o,"opacity");alpha&&alpha.ValueType()==JsonValueType::Number&&std::isfinite(alpha.GetNumber()))layer.opacity=std::clamp(alpha.GetNumber(),0.,1.);
      if(auto v=value(o,"displayColor");v&&v.ValueType()==JsonValueType::Object){auto color=v.GetObject();double rgba[4];bool valid=true;const char* keys[]={"r","g","b","a"};for(int i=0;i<4;++i){auto c=value(color,keys[i]);if(!c||c.ValueType()!=JsonValueType::Number){valid=false;break;}rgba[i]=c.GetNumber();}if(valid)layer.displayColor=normalizeLayerDisplayColor(rgba[0],rgba[1],rgba[2],rgba[3]);}if(auto v=value(o,"description");v&&v.ValueType()==JsonValueType::String)layer.description=winrt::to_string(v.GetString());
      layer.blendMode=textjson::str(o,L"blendMode");if(!parseLayerBlendMode(layer.blendMode))layer.blendMode="normal";layer.kind=textjson::str(o,L"kind");if(layer.kind!="text"&&layer.kind!="adjustment"&&layer.kind!="tilemap"&&layer.kind!="free-tile")layer.kind.clear();if(layer.kind=="tilemap")layer.tilemapTilesetId=textjson::str(o,L"tilemapTilesetId");if(auto group=value(o,"groupId");group&&group.ValueType()==JsonValueType::String){layer.groupId=winrt::to_string(group.GetString());if(!layer.groupId.empty()&&!groupIds.count(layer.groupId))layer.groupId.clear();}if(const auto linked=value(o,"linkedContentId")){if(linked.ValueType()!=JsonValueType::String||textjson::truthy(o,L"kind"))bad("linked layer identity/kind");std::u16string units;for(const auto c:linked.GetString())units+=char16_t(c);if(javascriptTrim(textUtf32(units)).empty())bad("empty linked layer identity");layer.linkedContentId=winrt::to_string(linked.GetString());}

      if(layer.kind=="free-tile")layer.freeTiles=freejson::decodeLayer(o,layer.id,sourceVersion>=15);
      layer.clippingMask=literal("clippingMask",true);
      if(layer.kind=="adjustment"){
       const auto adjustment=textjson::object(o,L"adjustment"),styles=textjson::object(o,L"layerStyles");
       const auto falseValue=[](const JsonObject& source,const wchar_t* field){return source.HasKey(field)&&source.GetNamedValue(field).ValueType()==JsonValueType::Boolean&&!source.GetNamedBoolean(field);};
       const auto rawStyles=value(o,"layerStyles");const bool hasStyles=rawStyles&&(rawStyles.ValueType()==JsonValueType::Object||rawStyles.ValueType()==JsonValueType::Array);
       timeline::LayerAdjustment settings;settings.enabled=!falseValue(adjustment,L"enabled");
       // normalizeLayerStyles enables its gradient map only for literal true.
       if(!textjson::truthy(o,L"adjustment")&&hasStyles){const auto map=textjson::object(styles,L"gradientMap");settings.enabled=!falseValue(styles,L"enabled")&&map.HasKey(L"enabled")&&map.GetNamedValue(L"enabled").ValueType()==JsonValueType::Boolean&&map.GetNamedBoolean(L"enabled");}
       const auto explicitMap=value(adjustment,"gradientMap");const auto rawMap=explicitMap&&explicitMap.ValueType()!=JsonValueType::Null?explicitMap:value(styles,"gradientMap");settings.gradientMap=GradientMapPresetStore::decodeSettings(rawMap&&rawMap.ValueType()==JsonValueType::Object?rawMap.GetObject():JsonObject{});layer.adjustment=std::move(settings);
      }else {layer.layerStyles=readColorOverlay(o,out,layer.id);if(present(o,"adjustment"))out.unsupported.emplace_back("layer effects "+layer.id);}
      fields(o,{"id","name","linkedContentId","autoLinkAnimationCels","displayColor","description","kind","tilemapTilesetId","freeTileTilesetId","freeTileSetId","freeTileSources","visible","locked","opacity","blendMode","clippingMask","layerStyles","adjustment","background","groupId","width","height","offsetX","offsetY","dataFile","dataEncoding"},"layer",out);
      if(auto v=value(o,"background");v&&v.ValueType()==JsonValueType::Object){auto b=v.GetObject();timeline::BackgroundSettings settings;settings.mode=textjson::str(b,L"mode");if(settings.mode=="canvas"){auto w=value(b,"repeatWidth"),h=value(b,"repeatHeight");if(w&&h&&w.ValueType()==JsonValueType::Number&&h.ValueType()==JsonValueType::Number){double x=w.GetNumber(),y=h.GetNumber();if(std::floor(x)==x&&std::floor(y)==y&&x>0&&y>0&&x<=65536&&y<=65536&&x*y<=268435456){settings.repeatWidth=int(x);settings.repeatHeight=int(y);}}layer.background=settings;}else if(settings.mode=="preset"){settings.pattern=textjson::str(b,L"pattern");if(isBackgroundPattern(settings.pattern))layer.background=settings;}}
      if(!layer.linkedContentId.empty()&&layer.background)bad("linked background layer");
      // Layer geometry has different legacy defaults from Cel geometry:
      // invalid dimensions use canvas size; nonnumeric offsets use zero.
      JsonObject layerRaster;for(const auto& field:o)layerRaster.Insert(field.Key(),field.Value());
      for(const auto* name:{"width","height"}){const auto raw=value(o,name);double n=std::string_view(name)=="width"?out.width:out.height;if(raw&&raw.ValueType()==JsonValueType::Number){const auto d=raw.GetNumber();if(std::isfinite(d)&&std::floor(d)==d&&d>0&&d<=9007199254740991.)n=d;}layerRaster.Insert(key(name),JsonValue::CreateNumberValue(n));}
      for(const auto* name:{"offsetX","offsetY"}){const auto raw=value(o,name);double n=0;if(raw&&raw.ValueType()==JsonValueType::Number&&std::isfinite(raw.GetNumber()))n=std::trunc(raw.GetNumber());if(n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max())throw Error(ErrorKind::Limit,"Layer offset exceeds native coordinates");layerRaster.Insert(key(name),JsonValue::CreateNumberValue(n));}
      layerRaster.Insert(L"format",JsonValue::CreateStringValue(out.colorMode=="indexed"?L"indexed":L"rgba"));
      layer.surface=raster(layerRaster);if(!layer.surface && color_mode::rgbaStorageMode(out.colorMode) && layer.kind.empty()) bad("missing layer raster");out.layers.push_back(std::move(layer));
    }
    if(out.layers.empty())bad("missing layers");if(!layerIds.count(out.activeLayerId))out.activeLayerId=out.layers.front().id;
    std::set<std::string> modernFreeLayers;std::map<std::string,const ManifestLayer*> celOwners;for(const auto& layer:out.layers){celOwners.emplace(layer.id,&layer);if(layer.kind=="free-tile"&&layer.freeTiles&&!layer.freeTiles->sources.empty())modernFreeLayers.insert(layer.id);}
    // Legacy decodes every explicit special payload before resolving links or
    // discarding no-raster runtime metadata. Index resources once for all Cels.
    const tiles::Catalog celResources(out.tilesets);
    std::map<std::string,std::map<std::string,std::string>> freeAliases;
    for(const auto& layer:out.layers)if(layer.freeTiles)for(const auto& source:layer.freeTiles->sources){auto& aliases=freeAliases[layer.id];aliases.emplace(source.id,source.id);aliases.emplace(source.tilesetId,source.id);if(const auto set=celResources.sets.find(source.tilesetId);set!=celResources.sets.end())for(const auto& tile:set->second->tileIds)aliases.emplace(tile,source.id);}
    auto animation=object(doc,"animation");out.activeFrameId=textjson::str(animation,L"activeFrameId");const auto loopValue=value(animation,"loop");out.loop=!(loopValue&&loopValue.ValueType()==JsonValueType::Boolean&&!loopValue.GetBoolean());
    if(!animation.HasKey(L"cels"))animation.Insert(L"cels",JsonArray());
    fields(animation,{"frames","cels","activeFrameId","loop","loopSections","layerMasks","groupMasks"},"animation",out);
    std::size_t frameIndex=0;
    for(const auto& item:array(animation,"frames",false)) {const auto index=frameIndex++;if(item.ValueType()!=JsonValueType::Object&&item.ValueType()!=JsonValueType::Array)continue;auto o=item.ValueType()==JsonValueType::Object?item.GetObject():JsonObject{};ManifestFrame frame;frame.id=textjson::str(o,L"id");if(javascriptTrim(std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(frame.id)).empty())frame.id="frame-"+std::to_string(index+1);if(!frameIds.insert(frame.id).second)continue;frame.duration=100;if(auto duration=value(o,"duration");duration&&duration.ValueType()==JsonValueType::Number&&std::isfinite(duration.GetNumber()))frame.duration=int(std::clamp(std::trunc(duration.GetNumber()),1.,60000.));if(auto disabled=value(o,"disabled");disabled&&disabled.ValueType()==JsonValueType::Boolean)frame.disabled=disabled.GetBoolean();fields(o,{"id","duration","disabled"},"frame",out);out.frames.push_back(std::move(frame));}
    if(out.frames.empty()){
      out.frames.push_back({"frame-1",100,false});frameIds.insert("frame-1");out.loop=true;
      animation.Insert(L"activeFrameId",JsonValue::CreateStringValue(L"frame-1"));
      animation.Insert(L"loop",JsonValue::CreateBooleanValue(true));
      animation.Insert(L"cels",JsonArray());
      animation.Insert(L"layerMasks",JsonArray());animation.Insert(L"groupMasks",JsonArray());animation.Insert(L"loopSections",JsonArray());
      JsonObject frame;frame.Insert(L"id",JsonValue::CreateStringValue(L"frame-1"));frame.Insert(L"duration",JsonValue::CreateNumberValue(100));JsonArray frames;frames.Append(frame);animation.Insert(L"frames",frames);
      doc.Insert(L"animation",animation);out.manifestUtf8=winrt::to_string(root.Stringify());
    }if(!frameIds.count(out.activeFrameId))out.activeFrameId=out.frames.front().id;
    std::set<std::string> loopIds;
    std::map<std::string,std::size_t> loopFrameIndexes;for(std::size_t i=0;i<out.frames.size();++i)loopFrameIndexes.emplace(out.frames[i].id,i);
    // normalizeAnimationLoopSections filters invalid candidates, preserving the
    // first valid ID, and numbers default names by accepted result position.
    if(auto list=value(animation,"loopSections");list&&list.ValueType()==JsonValueType::Array)for(const auto& item:list.GetArray()){
      if(item.ValueType()!=JsonValueType::Object)continue;const auto o=item.GetObject();
      const auto text=[&](const char* field){const auto v=value(o,field);return v&&v.ValueType()==JsonValueType::String?winrt::to_string(v.GetString()):std::string{};};
      ManifestLoopSection section;section.id=text("id");section.startFrameId=text("startFrameId");section.endFrameId=text("endFrameId");
      if(section.id.empty()||loopIds.count(section.id)||!loopFrameIndexes.count(section.startFrameId)||!loopFrameIndexes.count(section.endFrameId))continue;
      if(loopFrameIndexes.at(section.startFrameId)>loopFrameIndexes.at(section.endFrameId))std::swap(section.startFrameId,section.endFrameId);
      const auto name=value(o,"name");std::u16string units;if(name&&name.ValueType()==JsonValueType::String)for(const auto c:name.GetString())units+=char16_t(c);
      auto normalized=textUtf32(units);normalized=std::u32string(javascriptTrim(normalized));units=textUtf16(normalized);if(units.size()>64)units.resize(64);
      section.name=std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(std::u32string(javascriptTrim(textUtf32(units))));if(section.name.empty())section.name="Loop "+std::to_string(out.loopSections.size()+1);
      section.direction=text("direction");if(section.direction!="reverse"&&section.direction!="ping-pong"&&section.direction!="ping-pong-reverse")section.direction="forward";
      if(auto repeat=value(o,"repeatCount");repeat&&repeat.ValueType()!=JsonValueType::Null){const auto number=legacyjson::number(repeat);if(std::isfinite(number))section.repeatCount=int(std::clamp(std::trunc(number),1.,9999.));}
      loopIds.insert(section.id);out.loopSections.push_back(std::move(section));
    }
    std::map<std::string,JsonObject> firstRawCels;for(const auto& raw:array(animation,"cels"))if(raw.ValueType()==JsonValueType::Object){const auto candidate=raw.GetObject();const auto id=textjson::str(candidate,L"id");if(!id.empty())firstRawCels.emplace(id,candidate);}
    std::vector<std::tuple<std::string,std::string,IJsonValue>> inlineMasks;
    std::set<std::string> occupied;
    for(const auto& item:array(animation,"cels")) {
      if(item.ValueType()!=JsonValueType::Object)continue;const auto o=item.GetObject();ManifestCel cel;cel.id=textjson::str(o,L"id");cel.layerId=textjson::str(o,L"layerId");cel.frameId=textjson::str(o,L"frameId");if(cel.id.empty()||celIds.count(cel.id)||cel.layerId.empty()||!frameIds.count(cel.frameId)||occupied.count(cel.layerId+":"+cel.frameId))continue;celIds.insert(cel.id);occupied.insert(cel.layerId+":"+cel.frameId);const auto& rawSource=firstRawCels.at(cel.id);if(textjson::truthy(rawSource,L"mask"))inlineMasks.emplace_back(cel.layerId,cel.frameId,value(rawSource,"mask"));if(!layerIds.count(cel.layerId))continue;cel.linkedCelId=textjson::str(o,L"linkedCelId");const auto z=legacyjson::number(value(o,"zIndex"));cel.zIndex=std::isfinite(z)?int(std::clamp(std::trunc(z),-999.,999.)):0;
      // normalizeManifestAnimation recovers raw opacity from the first matching
      // ID, even when that earlier candidate failed frame validation.
      if(auto alpha=value(o,"opacity");alpha&&alpha.ValueType()==JsonValueType::Number&&std::isfinite(alpha.GetNumber()))cel.opacity=std::clamp(alpha.GetNumber(),0.,1.);
      const auto& opacitySource=firstRawCels.at(cel.id);
      if(auto alpha=value(opacitySource,"opacity");alpha&&alpha.ValueType()==JsonValueType::Number&&std::isfinite(alpha.GetNumber()))cel.opacity=std::clamp(alpha.GetNumber(),0.,1.);
      if(present(o,"text")){const auto v=o.GetNamedValue(L"text");if(v.ValueType()==JsonValueType::Object)cel.text=decodeTextCel(v.GetObject());else if(v.ValueType()==JsonValueType::Array)cel.text=decodeTextCel(JsonObject{});}
      const auto& textSource=firstRawCels.at(cel.id);
      if(present(textSource,"text")){const auto value=textSource.GetNamedValue(L"text");if(value.ValueType()==JsonValueType::Object)cel.text=decodeTextCel(value.GetObject());else if(value.ValueType()==JsonValueType::Array)cel.text=decodeTextCel(JsonObject{});}
      if(present(textSource,"tilemap"))cel.tilemap=tilejson::decode(textSource.GetNamedObject(L"tilemap"));if(present(textSource,"freeTiles"))cel.freeTiles=freejson::decodeCel(textSource.GetNamedObject(L"freeTiles"),modernFreeLayers.count(cel.layerId)!=0);
      fields(o,{"id","layerId","frameId","linkedCelId","zIndex","opacity","format","width","height","offsetX","offsetY","dataFile","dataEncoding","mask","text","tilemap","freeTiles"},"cel",out);
      // Resource metadata comes from the first raw ID match, while slot,
      // link and zIndex come from the accepted normalized candidate.
      JsonObject rasterMetadata;for(const auto& field:firstRawCels.at(cel.id))rasterMetadata.Insert(field.Key(),field.Value());
      const auto& owner=*celOwners.at(cel.layerId);if(owner.kind=="tilemap"){if(cel.text||cel.freeTiles||(cel.linkedCelId.empty()&&!cel.tilemap))bad("tilemap cel payload");}else if(owner.kind=="free-tile"){if(cel.text||cel.tilemap||(cel.linkedCelId.empty()&&!cel.freeTiles))bad("free tile cel payload");}else if(cel.tilemap||cel.freeTiles)bad("raster cel payload");
      if(cel.tilemap)for(const auto& cell:cel.tilemap->cells)if(cell){const auto set=celResources.sets.find(cell->tilesetId);if(set==celResources.sets.end()||set->second->tileWidth!=cel.tilemap->tileWidth||set->second->tileHeight!=cel.tilemap->tileHeight||!celResources.indexes.at(cell->tilesetId).find(cell->tileId))bad("cel tile reference");}
      if(cel.freeTiles){if(!owner.freeTiles)bad("cel free tile owner");auto canonical=*cel.freeTiles;if(!owner.freeTiles->sources.empty())for(auto& instance:canonical.instances){const auto& aliases=freeAliases.at(owner.id);const auto source=aliases.find(instance.sourceId);if(source==aliases.end())bad("cel free tile source");instance.sourceId=source->second;}try{free_tiles::validate(*owner.freeTiles,canonical,out.tilesets);}catch(const std::exception& e){bad(e.what());}}
      // normalizeManifestAnimation keeps only string paths and safe integer
      // dimensions. decodeProject drops unlinked Cels without a path, and all
      // Cels with a path but unusable geometry; empty-slot adaptation happens
      // later, after the remaining valid grid templates have been collected.
      const auto path=value(rasterMetadata,"dataFile");const bool hasPath=path&&path.ValueType()==JsonValueType::String&&!path.GetString().empty();
      if(!hasPath){rasterMetadata.Remove(L"dataFile");if(cel.linkedCelId.empty())continue;
       // decodeProject keeps normalizeCels' runtime grid in this branch,
       // not the sparse manifest grid decoded above. A sparse cells array
       // shorter than columns*rows has no runtime payload to retain.
       if(cel.tilemap){const auto cells=textSource.GetNamedObject(L"tilemap").GetNamedArray(L"cells");if(cells.Size()!=cel.tilemap->cells.size())cel.tilemap.reset();else{auto ordered=cel.tilemap->cells;for(unsigned i=0;i<cells.Size();++i)ordered[i]=cel.tilemap->cells[std::size_t(cells.GetObjectAt(i).GetNamedNumber(L"index"))];cel.tilemap->cells=std::move(ordered);}}
      }
      else {const auto format=value(rasterMetadata,"format");if(!format||format.ValueType()!=JsonValueType::String||(format.GetString()!=L"rgba"&&format.GetString()!=L"indexed"))bad("cel raster format");auto validDimension=[&](const char* name){const auto n=value(rasterMetadata,name);if(!n||n.ValueType()!=JsonValueType::Number)return false;const auto d=n.GetNumber();return std::isfinite(d)&&std::floor(d)==d&&d>=1&&d<=9007199254740991.;};if(!validDimension("width")||!validDimension("height")){consumedFiles.insert(winrt::to_string(path.GetString()));continue;}}
      for(const auto* name:{L"offsetX",L"offsetY"}){const auto raw=rasterMetadata.TryLookup(name);double n=0;if(raw&&raw.ValueType()==JsonValueType::Number&&std::isfinite(raw.GetNumber()))n=std::trunc(raw.GetNumber());if(n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max())throw Error(ErrorKind::Limit,"Cel offset exceeds native coordinates");rasterMetadata.Insert(name,JsonValue::CreateNumberValue(n));}
      cel.surface=raster(rasterMetadata);if(!cel.surface && cel.linkedCelId.empty() && color_mode::rgbaStorageMode(out.colorMode)) bad("missing cel raster");out.cels.push_back(std::move(cel));
    }
    // Broken targets are retained for the explicitly approved editable-import
    // repair; every explicit fallback raster was validated above.

    // Manifest normalization drops invalid slot candidates before decodeProject
    // validates owner existence and duplicate semantics.
    const auto maskArray=[&](const char* name){const auto list=value(animation,name);return list&&list.ValueType()==JsonValueType::Array?list.GetArray():JsonArray{};};
    const auto maskCandidate=[&](const JsonObject& slot,const wchar_t* owner){return !textjson::str(slot,owner).empty()&&frameIds.count(textjson::str(slot,L"frameId"))&&textjson::truthy(slot,L"mask");};
    // Explicit layer slots precede legacy cel.mask; shadow resources are read first.
    std::map<std::string,Bytes> maskResources;
    auto rememberMaskResource=[&](const IJsonValue& metadata){if(!metadata||metadata.ValueType()!=JsonValueType::Object)return;const auto o=metadata.GetObject();const auto v=value(o,"dataFile");if(!v||v.ValueType()!=JsonValueType::String)return;const auto file=winrt::to_string(v.GetString());if(file.empty())return;if(std::find(out.maskDataFiles.begin(),out.maskDataFiles.end(),file)==out.maskDataFiles.end())out.maskDataFiles.push_back(file);consumedFiles.insert(file);if(archive.entries().count(file)&&!maskResources.count(file))maskResources.emplace(file,archive.read(file,limits.expandedBytes));};
    for(const auto name:{"layerMasks","groupMasks"})for(const auto& item:maskArray(name)){if(item.ValueType()!=JsonValueType::Object)continue;const auto o=item.GetObject();rememberMaskResource(value(o,"mask"));}
    for(const auto& item:array(animation,"cels"))if(item.ValueType()==JsonValueType::Object)rememberMaskResource(value(item.GetObject(),"mask"));
    for(const auto& [owner,frame,metadata]:inlineMasks)rememberMaskResource(metadata);
    std::set<std::string> decodedMaskIds;
    auto decodeMask=[&](const IJsonValue& metadata,const std::string& owner,const std::string& frame,bool group){
      if(!metadata||metadata.ValueType()!=JsonValueType::Object)bad("mask metadata");const auto o=metadata.GetObject();ManifestMask m;m.ownerId=owner;m.frameId=frame;m.group=group;m.id=str(o,"id");unique(decodedMaskIds,m.id,"mask");m.linkedMaskId=str(o,"linkedMaskId",false);if(auto link=value(o,"linkedMaskId");link&&link.ValueType()!=JsonValueType::Null&&m.linkedMaskId.empty())bad("empty linkedMaskId");
      auto flag=[&](const char* name){const auto v=value(o,name);return v&&v.ValueType()==JsonValueType::Boolean&&v.GetBoolean();};m.locked=flag("locked");m.autoLink=flag("autoLinkAnimationCels");
      auto dimension=[&](const char* name){const auto n=legacyjson::number(value(o,name));if(!std::isfinite(n)||std::floor(n)!=n||n<1)bad(std::string("mask ")+name);if(n>std::numeric_limits<int>::max())throw Error(ErrorKind::Limit,"Mask dimension exceeds native coordinates");return int(n);};const int width=dimension("width"),height=dimension("height");auto offset=[&](const char* name){const auto numeric=legacyjson::number(value(o,name));if(!std::isfinite(numeric))bad(std::string("mask ")+name);const double n=std::trunc(numeric);if(n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max())throw Error(ErrorKind::Limit,"Mask offset exceeds native coordinates");return int(n);};const int x=offset("offsetX"),y=offset("offsetY");const auto file=str(o,"dataFile");
      const std::uint64_t pixels=std::uint64_t(width)*height;if(pixels>(limits.expandedBytes-decodedBytes)/4)throw Error(ErrorKind::Limit,"Decoded mask pixels exceed budget");const auto found=maskResources.find(file);if(found==maskResources.end())bad("missing mask resource "+file);const auto& data=found->second;if(data.size()!=pixels&&data.size()!=pixels*4)bad("mask resource byte count "+file);
      auto raster=std::make_shared<ManifestRaster>();raster->width=width;raster->height=height;raster->offsetX=x;raster->offsetY=y;raster->dataFile=file;raster->dataEncoding="raw";raster->pixels.resize(std::size_t(pixels));
      if(data.size()==pixels){for(std::size_t i=0;i<pixels;++i)raster->pixels[i]=0xff000000u|std::uint32_t(data[i])*0x010101u;}else for(std::size_t i=0;i<pixels;++i){const auto at=i*4;const auto alpha=data[at+3];if(alpha==0){raster->pixels[i]=0;continue;}if(alpha!=255||data[at]!=data[at+1]||data[at]!=data[at+2])bad("mask resource must contain scalar grayscale or transparent RGBA");raster->pixels[i]=0xff000000u|std::uint32_t(data[at])*0x010101u;}
      decodedBytes+=std::size_t(pixels)*4;fields(o,{"id","linkedMaskId","locked","autoLinkAnimationCels","width","height","offsetX","offsetY","dataFile"},"mask",out);m.surface=std::move(raster);out.masks.push_back(std::move(m));
    };
    std::set<std::pair<std::string,std::string>> layerMaskSlots,groupMaskSlots;
    for(const auto& item:maskArray("layerMasks")){if(item.ValueType()!=JsonValueType::Object)continue;const auto slot=item.GetObject();if(!maskCandidate(slot,L"layerId"))continue;const auto owner=str(slot,"layerId"),frame=str(slot,"frameId");if(!layerIds.count(owner)||!frameIds.count(frame))bad("layer mask slot reference");fields(slot,{"layerId","frameId","mask"},"layer mask slot",out);if(!layerMaskSlots.emplace(owner,frame).second)continue;decodeMask(value(slot,"mask"),owner,frame,false);}
    for(const auto& [owner,frame,metadata]:inlineMasks){if(!layerIds.count(owner)||!frameIds.count(frame))bad("inline mask slot reference");if(!layerMaskSlots.emplace(owner,frame).second)continue;decodeMask(metadata,owner,frame,false);}
    for(const auto& item:maskArray("groupMasks")){if(item.ValueType()!=JsonValueType::Object)continue;const auto slot=item.GetObject();if(!maskCandidate(slot,L"groupId"))continue;const auto owner=str(slot,"groupId"),frame=str(slot,"frameId");if(!groupIds.count(owner)||!frameIds.count(frame)||!groupMaskSlots.emplace(owner,frame).second)bad("group mask slot reference or duplicate");fields(slot,{"groupId","frameId","mask"},"group mask slot",out);decodeMask(value(slot,"mask"),owner,frame,true);}
    std::map<std::string,const ManifestMask*> masksById;for(const auto& mask:out.masks)masksById.emplace(mask.id,&mask);for(const auto& mask:out.masks){std::set<std::string> visited;const auto* current=&mask;while(!current->linkedMaskId.empty()){if(!visited.insert(current->id).second)bad("cyclic mask link");const auto next=masksById.find(current->linkedMaskId);if(next==masksById.end()||next->second==current)bad("missing or self mask link");current=next->second;}}

    std::set<int> paletteIds;
    const auto rawPalette=value(doc,"palette");const auto paletteEntries=rawPalette&&rawPalette.ValueType()==JsonValueType::Array?rawPalette.GetArray():JsonArray{};
    for(const auto& item:paletteEntries) {
      auto o=itemObject(item,"palette entry");ManifestPaletteEntry entry;entry.id=integer(o,"id",0,0,true);entry.name=str(o,"name",false);
      if(!paletteIds.insert(entry.id).second) bad("duplicate palette ID");const auto c=object(o,"color");
      int shift=0;for(const auto channel:{"r","g","b","a"}) {const auto n=integer(c,channel,0,0,true);if(n>255) bad("palette channel");entry.color|=std::uint32_t(n)<<shift;shift+=8;}
      fields(o,{"id","name","color"},"palette",out);out.palette.push_back(std::move(entry));
    }
    // project-format-decode / palette-layout: only safe numeric integers
    // participate; columns clamp, while invalid/missing layout values default.
    const auto safeInteger=[](const IJsonValue& v){if(!v||v.ValueType()!=JsonValueType::Number)return false;const auto n=v.GetNumber();return std::isfinite(n)&&std::floor(n)==n&&std::abs(n)<=9007199254740991.0;};
    const auto rawOrder=value(doc,"paletteOrder");if(rawOrder&&rawOrder.ValueType()==JsonValueType::Array)for(const auto& item:rawOrder.GetArray())if(safeInteger(item)){const auto n=item.GetNumber();if(n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max())throw Error(ErrorKind::Unsupported,"Palette order ID exceeds native integer range");out.paletteOrder.push_back(int(n));}
    const auto rawColumns=value(doc,"paletteColumns");out.paletteColumns=safeInteger(rawColumns)?int(std::clamp(rawColumns.GetNumber(),1.0,256.0)):8;
    const auto rawSlots=value(doc,"paletteSlots");const auto sourceSlots=rawSlots&&rawSlots.ValueType()==JsonValueType::Array?rawSlots.GetArray():JsonArray{};
    std::set<int> visible,placed;std::vector<int> visibleIds;for(int id:out.paletteOrder)if(paletteIds.count(id)&&visible.insert(id).second)visibleIds.push_back(id);const auto columns=std::size_t(out.paletteColumns);
    const auto count=std::max(std::size_t(sourceSlots.Size()),visible.size());const auto slotCount=std::max(columns,((count+columns-1)/columns)*columns);
    if(slotCount>limits.expandedBytes/sizeof(std::optional<int>))throw Error(ErrorKind::Limit,"Palette layout exceeds decoded byte budget");out.paletteSlots.resize(slotCount);
    std::size_t index=0;for(const auto& item:sourceSlots){if(safeInteger(item)){const auto n=item.GetNumber();if(n>=0&&n<=std::numeric_limits<int>::max()){const int id=int(n);if(visible.count(id)&&placed.insert(id).second)out.paletteSlots[index]=id;}}++index;}
    // A monotonic hole cursor produces the same first-null filling as legacy
    // without repeatedly scanning an occupied prefix for large palettes.
    std::size_t hole=0;for(int id:visibleIds)if(placed.insert(id).second){while(hole<out.paletteSlots.size()&&out.paletteSlots[hole])++hole;out.paletteSlots[hole++]=id;}
    // Actual decodeProject: Math.max(1, source.nextColorId ?? 1). Do not
    // fabricate max(existing ID)+1; collision remains an editable gate.
    const auto rawNext=value(doc,"nextColorId");const auto converted=!rawNext||rawNext.ValueType()==JsonValueType::Null?1.:legacyjson::number(rawNext);
    const auto next=converted<1?1.:converted;if(!std::isfinite(next)||std::floor(next)!=next||next>std::numeric_limits<int>::max())throw Error(ErrorKind::Unsupported,"Palette allocation cursor is outside native integer representation");out.nextColorId=int(next);
    // document-model.ts::remapIndexedDocumentToVisiblePalette. A visible
    // identity survives even when its entry is missing; hidden identities use
    // getPaletteEntry's transparent fallback and the visible nearest color.
    // Keep the source archive immutable and replace each shared DTO once.
    if(out.colorMode=="indexed"){
      // decodeProject rebuilds special Cel caches from authoritative resources
      // before projecting the active frame and remapping hidden identities.
      for(auto& cel:out.cels){
        if(!cel.surface||(!cel.tilemap&&!cel.freeTiles))continue;
        int width=cel.surface->width,height=cel.surface->height;
        if(cel.tilemap){width=cel.tilemap->columns*cel.tilemap->tileWidth;height=cel.tilemap->rows*cel.tilemap->tileHeight;}
        const auto count=std::size_t(width)*height;
        if(count>(limits.expandedBytes-decodedBytes)/4)throw Error(ErrorKind::Limit,"Indexed tile reconstruction exceeds decoded pixel budget");
        auto rebuilt=std::make_shared<ManifestRaster>();rebuilt->width=width;rebuilt->height=height;
        rebuilt->offsetX=cel.surface->offsetX;rebuilt->offsetY=cel.surface->offsetY;rebuilt->format=RasterFormat::Indexed;
        if(cel.tilemap)rebuilt->pixels=tiles::render(*cel.tilemap,out.tilesets);
        else {
          const auto& owner=*celOwners.at(cel.layerId);auto instances=*cel.freeTiles;
          if(!owner.freeTiles)bad("free tile reconstruction owner");
          if(!owner.freeTiles->sources.empty())for(auto& instance:instances.instances)instance.sourceId=freeAliases.at(owner.id).at(instance.sourceId);
          rebuilt->pixels=free_tiles::render(*owner.freeTiles,instances,out.tilesets,width,height);
        }
        for(auto& pixel:rebuilt->pixels)pixel=std::uint32_t(color_mode::paletteColorIdForCanvas(out.palette,out.paletteOrder,pixel));
        decodedBytes+=count*4;cel.surface=std::move(rebuilt);
      }
      // animation.ts::applyFrameSurfaces and animation-cel-resolver-cache.ts:
      // invalid/cyclic chains display the original candidate's own fallback;
      // valid chains use root geometry, storage and opacity without changing
      // serialized Cel links or discarding independent fallback storage.
      const auto none=std::numeric_limits<std::size_t>::max();
      std::map<std::string,std::size_t> ids,active;
      for(std::size_t i=0;i<out.cels.size();++i){ids.emplace(out.cels[i].id,i);if(out.cels[i].frameId==out.activeFrameId)active.emplace(out.cels[i].layerId,i);}
      std::vector<std::vector<std::size_t>> incoming(out.cels.size());std::vector<std::size_t> roots(out.cels.size(),none),queue;
      for(std::size_t i=0;i<out.cels.size();++i){const auto& cel=out.cels[i];
        if(cel.linkedCelId.empty()){roots[i]=i;queue.push_back(i);}
        else if(const auto found=ids.find(cel.linkedCelId);found!=ids.end()&&out.cels[found->second].layerId==cel.layerId)incoming[found->second].push_back(i);
      }
      for(std::size_t head=0;head<queue.size();++head){const auto root=queue[head];for(auto child:incoming[root])if(roots[child]==none){roots[child]=roots[root];queue.push_back(child);}}
      for(auto& layer:out.layers){
        const ManifestCel* source=nullptr;
        if(const auto found=active.find(layer.id);found!=active.end()){const auto index=found->second;source=&out.cels[roots[index]==none?index:roots[index]];}
        if(source&&source->surface){
          if(source->surface->format!=RasterFormat::Indexed)bad("active Cel raster format differs from indexed layer");
          layer.surface=source->surface;if(source->opacity)layer.opacity=*source->opacity;
        }else if(layer.surface&&std::any_of(layer.surface->pixels.begin(),layer.surface->pixels.end(),[](auto id){return id!=0;})){
          const auto bytes=layer.surface->pixels.size()*4;
          if(bytes>limits.expandedBytes-decodedBytes)throw Error(ErrorKind::Limit,"Indexed empty frame exceeds decoded pixel budget");
          auto blank=std::make_shared<ManifestRaster>();blank->width=layer.surface->width;blank->height=layer.surface->height;
          blank->offsetX=layer.surface->offsetX;blank->offsetY=layer.surface->offsetY;blank->format=RasterFormat::Indexed;
          blank->pixels.assign(layer.surface->pixels.size(),0);decodedBytes+=bytes;layer.surface=std::move(blank);
        }
      }
      const std::set<int> visible(out.paletteOrder.begin(),out.paletteOrder.end());
      std::map<const ManifestRaster*,std::shared_ptr<const ManifestRaster>> remapped;
      auto remap=[&](std::shared_ptr<const ManifestRaster>& surface){
        if(!surface||surface->format!=RasterFormat::Indexed)return;
        if(const auto found=remapped.find(surface.get());found!=remapped.end()){surface=found->second;return;}
        const auto before=surface;std::shared_ptr<ManifestRaster> after;
        for(std::size_t i=0;i<before->pixels.size();++i){const auto id=before->pixels[i];
          if(id==0||(id<=std::uint32_t(std::numeric_limits<int>::max())&&visible.count(int(id))))continue;
          if(!after){
            const auto bytes=before->pixels.size()*sizeof(std::uint32_t);
            if(bytes>limits.expandedBytes-decodedBytes)throw Error(ErrorKind::Limit,"Indexed remap exceeds decoded pixel budget");
            after=std::make_shared<ManifestRaster>(*before);decodedBytes+=bytes;
          }
          const auto color=id<=std::uint32_t(std::numeric_limits<int>::max())?color_mode::paletteColor(out.palette,int(id)):0;
          after->pixels[i]=std::uint32_t(color_mode::paletteColorIdForCanvas(out.palette,out.paletteOrder,color));
        }
        const auto result=after?std::shared_ptr<const ManifestRaster>(std::move(after)):before;
        remapped.emplace(before.get(),result);surface=result;
      };
      for(auto& layer:out.layers)remap(layer.surface);
      for(auto& cel:out.cels)remap(cel.surface);
    }
    // Legacy storedTimelapseEntryViews accounts for every recording PNG,
    // including payloads whose declared snapshot metadata was unusable.
    for(const auto& entry:archive.entries())if(entry.first.rfind("timelapse/",0)==0&&entry.first.size()>14&&entry.first.substr(entry.first.size()-4)==".png")consumedFiles.insert(entry.first);
    for(const auto& entry:archive.entries()) if(!consumedFiles.count(entry.first)) out.unsupported.emplace_back("unmapped archive resource "+entry.first);
    if(normalizedAnimationArrays)out.manifestUtf8=winrt::to_string(root.Stringify());
    {std::vector<std::string> layers,groups;for(const auto& l:out.layers)layers.push_back(l.id);for(const auto& g:out.groups)groups.push_back(g.id);out.layerPanelState=normalizeLayerPanelState(layers,groups,out.activeLayerId,paneljson::decode(value(doc,"layerPanelState"),out.activeLayerId));}
    return out;
  } catch(const winrt::hresult_error& error) {
    throw Error(error.code().value==E_OUTOFMEMORY?ErrorKind::Limit:ErrorKind::Corrupt,"System JSON failure; HRESULT="+std::to_string(error.code().value)+": "+winrt::to_string(error.message()));
  }
}
}
