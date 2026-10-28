#include <algorithm>
#include "tilemap_project_json.h"
#include "free_tile_project_json.h"
#include "gradient_map_presets.h"
#include <codecvt>
#include <locale>
#include "text_project_json.h"
#include "layer_metadata.h"
#include "project_manifest.h"
#include "timelapse_project_json.h"
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

std::optional<timeline::ColorOverlayStyle> readColorOverlay(const JsonObject& owner,ReadManifest& out,const std::string& id){
 if(!present(owner,"layerStyles"))return {};auto styles=object(owner,"layerStyles");timeline::ColorOverlayStyle s;s.enabled=boolean(styles,"enabled",true);s.preservedJson=winrt::to_string(styles.Stringify());
 if(present(styles,"gradientMap")){auto settings=object(styles,"gradientMap");s.gradientMapEnabled=boolean(settings,"enabled",false);if(present(settings,"stops"))s.gradientMap=GradientMapPresetStore::decodeSettings(settings);}
 if(present(styles,"colorOverlay")){auto overlay=object(styles,"colorOverlay");s.overlayEnabled=boolean(overlay,"enabled",false);if(present(overlay,"color")){auto c=object(overlay,"color");s.color=0;for(int i=0;i<4;++i){auto k=std::string(1,"rgba"[i]);auto v=value(c,k.c_str());double n=v&&v.ValueType()==JsonValueType::Number?v.GetNumber():double((0xffff7929u>>(8*i))&255);if(!std::isfinite(n))n=0;s.color|=std::uint32_t(std::floor(std::clamp(n,0.,255.)+.5))<<(8*i);}}}
 if(present(styles,"gradientOverlay")){auto g=object(styles,"gradientOverlay");s.gradientEnabled=boolean(g,"enabled",false);auto readColor=[&](const char* name,timeline::Pixel fallback){if(!present(g,name))return fallback;auto c=object(g,name);timeline::Pixel result=0;for(int i=0;i<4;++i){const auto k=std::string(1,"rgba"[i]);auto v=value(c,k.c_str());const double n=v&&v.ValueType()==JsonValueType::Number?v.GetNumber():double((fallback>>(8*i))&255);result|=timeline::Pixel(std::floor(std::clamp(std::isfinite(n)?n:0.,0.,255.)+.5))<<(8*i);}return result;};s.gradientFrom=readColor("from",0xff000000);s.gradientTo=readColor("to",0xffffffff);auto a=value(g,"angle");if(a&&a.ValueType()==JsonValueType::Number&&std::isfinite(a.GetNumber()))s.gradientAngle=int(std::floor(std::clamp(a.GetNumber(),0.,359.)+.5));auto name=str(g,"dither",false,"none");for(int i=0;i<9;++i)if(name==GradientMapPresetStore::ditherNames()[i])s.gradientDither=i;}
 if(present(styles,"stroke")){auto o=object(styles,"stroke");auto& stroke=s.stroke;stroke.enabled=boolean(o,"enabled",false);stroke.smartHue=boolean(o,"smartHue",false);stroke.followOpacity=boolean(o,"followOpacity",false);auto integer=[&](const char* name,int fallback,int low,int high){auto v=value(o,name);return v&&v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?int(std::floor(std::clamp(v.GetNumber(),double(low),double(high))+.5)):fallback;};stroke.size=integer("size",1,1,64);stroke.darkness=integer("smartHueDarkness",45,0,100);const auto position=str(o,"position",false,"outside"),kernel=str(o,"kernel",false,"round");stroke.position=position=="inside"?0:position=="both"?2:1;stroke.kernel=kernel=="square"?1:kernel=="horizontal"?2:kernel=="vertical"?3:0;stroke.directions=stroke.kernel==0?0x5a:stroke.kernel==1?0xff:stroke.kernel==2?0x18:0x42;if(present(o,"directions")){auto d=object(o,"directions");const char* names[]{"nw","n","ne","w","e","sw","s","se"};for(int i=0;i<8;++i){auto v=value(d,names[i]);if(v&&v.ValueType()==JsonValueType::Boolean){if(v.GetBoolean())stroke.directions|=1u<<i;else stroke.directions&=~(1u<<i);}}}if(present(o,"color")){auto c=object(o,"color");stroke.color=0;for(int i=0;i<4;++i){auto v=value(c,std::string(1,"rgba"[i]).c_str());const double fallback=i==3?255:0,n=v&&v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?v.GetNumber():fallback;stroke.color|=timeline::Pixel(std::floor(std::clamp(n,0.,255.)+.5))<<(8*i);}}}
 if(present(styles,"shadow")){auto o=object(styles,"shadow");auto& sh=s.shadow;sh.enabled=boolean(o,"enabled",false);sh.smart=boolean(o,"smartShadow",false);auto integer=[&](const char* name,int fallback,int low,int high){auto v=value(o,name);return v&&v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?int(std::floor(std::clamp(v.GetNumber(),double(low),double(high))+.5)):fallback;};sh.offsetX=integer("offsetX",2,-64,64);sh.offsetY=integer("offsetY",2,-64,64);sh.blur=integer("blur",0,0,32);sh.darkness=integer("smartShadowDarkness",45,0,100);if(present(o,"color")){auto c=object(o,"color");sh.color=0;for(int i=0;i<4;++i){auto v=value(c,std::string(1,"rgba"[i]).c_str());const double fallback=i==3?160:0,n=v&&v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?v.GetNumber():fallback;sh.color|=timeline::Pixel(std::floor(std::clamp(n,0.,255.)+.5))<<(8*i);}}}
 if(present(styles,"innerGlow")){auto o=object(styles,"innerGlow");auto& glow=s.innerGlow;glow.enabled=boolean(o,"enabled",false);auto size=value(o,"size");if(size&&size.ValueType()==JsonValueType::Number&&std::isfinite(size.GetNumber()))glow.size=int(std::floor(std::clamp(size.GetNumber(),1.,32.)+.5));if(present(o,"color")){auto c=object(o,"color");glow.color=0;for(int i=0;i<4;++i){auto v=value(c,std::string(1,"rgba"[i]).c_str());const double fallback=i==3?192:255,n=v&&v.ValueType()==JsonValueType::Number&&std::isfinite(v.GetNumber())?v.GetNumber():fallback;glow.color|=timeline::Pixel(std::floor(std::clamp(n,0.,255.)+.5))<<(8*i);}}}
 return s;
}
}
ReadManifest readProjectManifest(std::shared_ptr<const Bytes> bytes,Limits limits) {
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
    if(out.schemaVersion!=21) throw Error(ErrorKind::Unsupported,"Only project schema 21 is supported by the native manifest reader");
    auto doc=object(root,"document");
    if(integer(doc,"schemaVersion",0,1,true)!=out.schemaVersion) bad("document schemaVersion mismatch");
    out.id=str(doc,"id");out.name=str(doc,"name",false);out.width=integer(doc,"width",0,1,true);out.height=integer(doc,"height",0,1,true);
    out.colorMode=str(doc,"colorMode");out.activeLayerId=str(doc,"activeLayerId");
    auto date=[&](const char* name,const std::string& fallback){auto v=value(doc,name);return v&&v.ValueType()==JsonValueType::String&&!v.GetString().empty()?winrt::to_string(v.GetString()):fallback;};out.information.createdAt=date("createdAt",out.information.createdAt);out.information.updatedAt=date("updatedAt",out.information.updatedAt);
    if(auto v=value(doc,"statistics");v&&v.ValueType()==JsonValueType::Object){const auto statistics=v.GetObject();auto counter=[&](const char* name){const auto n=value(statistics,name);return n&&n.ValueType()==JsonValueType::Number?projectCounter(n.GetNumber()):std::uint64_t(0);};out.information.strokeCount=counter("strokeCount");out.information.operationCount=counter("operationCount");out.information.drawingTimeMs=counter("drawingTimeMs");}

    if(out.colorMode!="rgba") out.unsupported.emplace_back("colorMode="+out.colorMode);
    if(present(doc,"pixelFormat") && str(doc,"pixelFormat")!="rgba32") out.unsupported.emplace_back("pixelFormat="+str(doc,"pixelFormat"));
    fields(root,{"app","schemaVersion","document","sourceSchemaVersion"},"manifest",out);
    fields(doc,{"schemaVersion","id","name","width","height","colorMode","pixelFormat","layers","groups","activeLayerId","palette","paletteOrder","paletteSlots","paletteColumns","nextColorId","customBrushes","referenceImages","canvasReferences","tilesets","animation","outlineSettings","displaySettings","layerPanelState","statistics","timelapse","slices","createdAt","updatedAt"},"document",out);
    if(present(doc,"displaySettings")){const auto display=object(doc,"displaySettings");auto pixelGrid=value(display,"showPixelGrid");out.showPixelGrid=pixelGrid&&pixelGrid.ValueType()==JsonValueType::Boolean&&pixelGrid.GetBoolean();auto custom=value(display,"showGrid");out.showCustomGrid=custom&&custom.ValueType()==JsonValueType::Boolean&&custom.GetBoolean();auto grid=value(display,"grid");if(grid&&grid.ValueType()==JsonValueType::Object){auto obj=grid.GetObject();auto n=[&](const char* name,double fallback){auto v=value(obj,name);return v&&v.ValueType()==JsonValueType::Number?v.GetNumber():fallback;};out.customGrid=normalizeGridSettings({n("x",0),n("y",0),n("width",16),n("height",16)});}if(present(display,"symmetryCenter")){const auto center=object(display,"symmetryCenter");out.symmetryCenter=std::make_pair(center.GetNamedNumber(L"x"),center.GetNamedNumber(L"y"));}}
    nonempty(doc,"canvasReferences",out);
    if(auto values=value(doc,"slices");values&&values.ValueType()==JsonValueType::Array){std::vector<DocumentSlice> parsed;for(const auto& item:values.GetArray()){if(item.ValueType()!=JsonValueType::Object)continue;auto o=item.GetObject();auto id=value(o,"id");if(!id||id.ValueType()!=JsonValueType::String)continue;double numbers[4];bool valid=true;const char* keys[]={"x","y","width","height"};for(int i=0;i<4;++i){auto n=value(o,keys[i]);if(!n||n.ValueType()!=JsonValueType::Number||!std::isfinite(n.GetNumber()))throw std::runtime_error("Invalid slice coordinate: numeric values required");numbers[i]=n.GetNumber();}if(!valid||std::floor(numbers[2]+.5)<1||std::floor(numbers[3]+.5)<1)continue;DocumentSlice slice;slice.id=winrt::to_string(id.GetString());if(auto name=value(o,"name");name&&name.ValueType()==JsonValueType::String){auto wideName=std::wstring(name.GetString());for(std::size_t i=0;i<wideName.size();++i){char32_t c=wideName[i];if(c>=0xd800&&c<=0xdbff&&i+1<wideName.size()){const char32_t lo=wideName[++i];c=0x10000+((c-0xd800)<<10)+(lo-0xdc00);}slice.name.push_back(c);}}slice.rect={sliceRound(numbers[0]),sliceRound(numbers[1]),sliceRound(numbers[2]),sliceRound(numbers[3])};fields(o,{"id","name","x","y","width","height"},"slice",out);parsed.push_back(std::move(slice));}out.slices=normalizeDocumentSlices(std::move(parsed),out.width,out.height);}

    std::set<std::string> groupIds;
    for(const auto& item:array(doc,"groups",false)){
      const auto o=itemObject(item,"group");ManifestGroup group;group.id=str(o,"id");unique(groupIds,group.id,"group");group.name=str(o,"name",false);group.parentGroupId=str(o,"parentGroupId",false);group.visible=boolean(o,"visible",true);group.locked=boolean(o,"locked",false);group.opacity=opacity(o,"opacity");group.blendMode=str(o,"blendMode",false,"normal");group.description=str(o,"description",false);
      if(auto order=value(o,"panelOrder");order&&order.ValueType()!=JsonValueType::Null){if(order.ValueType()!=JsonValueType::Number||!std::isfinite(order.GetNumber()))bad("group.panelOrder");group.panelOrder=order.GetNumber();}
      if(auto v=value(o,"displayColor");v&&v.ValueType()==JsonValueType::Object){auto color=v.GetObject();double rgba[4];bool valid=true;const char* keys[]={"r","g","b","a"};for(int i=0;i<4;++i){auto c=value(color,keys[i]);if(!c||c.ValueType()!=JsonValueType::Number){valid=false;break;}rgba[i]=c.GetNumber();}if(valid)group.displayColor=normalizeLayerDisplayColor(rgba[0],rgba[1],rgba[2],rgba[3]);}
      if(!parseLayerBlendMode(group.blendMode))out.unsupported.emplace_back("group blendMode="+group.blendMode);
      group.clippingMask=boolean(o,"clippingMask",false);
      group.layerStyles=readColorOverlay(o,out,group.id);
      if(present(o,"adjustment")||boolean(o,"cumulativeBlend",false))out.unsupported.emplace_back("group effects "+group.id);
      fields(o,{"id","name","parentGroupId","visible","locked","opacity","blendMode","panelOrder","displayColor","description","clippingMask","layerStyles","adjustment","cumulativeBlend"},"group",out);out.groups.push_back(std::move(group));
    }
    // Decode each shared resource/geometry tuple once. Source archive preserves all other files.
    using RasterKey=std::tuple<std::string,std::string,int,int,int,int>;
    std::map<RasterKey,std::shared_ptr<const ManifestRaster>> rasters;std::size_t decodedBytes=0;
    std::set<std::string> consumedFiles{"manifest.json","preview.png"};
    if(present(doc,"timelapse"))out.timelapse=timelapsejson::decode(object(doc,"timelapse"),archive,consumedFiles,limits.expandedBytes);
    auto raster=[&](const JsonObject& metadata,bool mask=false)->std::shared_ptr<const ManifestRaster> {
      if(!present(metadata,"dataFile")) return {};
      auto file=str(metadata,"dataFile"),encoding=str(metadata,"dataEncoding",false,"raw");consumedFiles.insert(file);
      int w=integer(metadata,"width",out.width,1),h=integer(metadata,"height",out.height,1);
      int x=integer(metadata,"offsetX",0),y=integer(metadata,"offsetY",0);
      RasterKey cacheKey{file,encoding,w,h,x,y};auto cached=rasters.find(cacheKey);if(cached!=rasters.end()) return cached->second;
      if(out.colorMode!="rgba" || str(metadata,"format",false,"rgba")!="rgba") {out.unsupported.emplace_back("non-RGBA resource "+file);return {};}
      const std::uint64_t pixels=std::uint64_t(w)*h;
      if(pixels>(limits.expandedBytes-decodedBytes)/4) throw Error(ErrorKind::Limit,"Decoded project pixels exceed budget");
      auto data=archive.read(file,limits.expandedBytes);
      auto result=std::make_shared<ManifestRaster>();result->width=w;result->height=h;result->offsetX=x;result->offsetY=y;result->dataFile=file;result->dataEncoding=encoding;
      if(mask&&encoding=="raw"&&data.size()==pixels){result->pixels.reserve(std::size_t(pixels));for(auto v:data)result->pixels.push_back(0xff000000u|std::uint32_t(v)*0x010101u);}else result->pixels=decodeRgba(data,encoding,w,h,limits.expandedBytes-decodedBytes);decodedBytes+=std::size_t(pixels)*4;
      rasters.emplace(cacheKey,result);return result;
    };

    std::set<std::string> tilesetIds;
    for(const auto& item:array(doc,"tilesets",false)){
      auto o=itemObject(item,"tileset");tiles::Tileset t;t.id=tilejson::string(o,L"id");unique(tilesetIds,t.id,"tileset");
      t.name=std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.from_bytes(str(o,"name",false));t.tileWidth=tilejson::integer(o,L"tileWidth",1,256);t.tileHeight=tilejson::integer(o,L"tileHeight",1,256);t.columns=tilejson::integer(o,L"columns",1,int(tiles::MaxCells));t.rows=tilejson::integer(o,L"rows",1,int(tiles::MaxCells));tiles::sizeCheck(t.tileWidth,t.tileHeight,t.columns,t.rows,true);
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
      layer.visible=boolean(o,"visible",true);layer.locked=boolean(o,"locked",false);layer.opacity=opacity(o,"opacity");layer.autoLinkAnimationCels=boolean(o,"autoLinkAnimationCels",false);
      if(auto v=value(o,"displayColor");v&&v.ValueType()==JsonValueType::Object){auto color=v.GetObject();double rgba[4];bool valid=true;const char* keys[]={"r","g","b","a"};for(int i=0;i<4;++i){auto c=value(color,keys[i]);if(!c||c.ValueType()!=JsonValueType::Number){valid=false;break;}rgba[i]=c.GetNumber();}if(valid)layer.displayColor=normalizeLayerDisplayColor(rgba[0],rgba[1],rgba[2],rgba[3]);}if(auto v=value(o,"description");v&&v.ValueType()==JsonValueType::String)layer.description=winrt::to_string(v.GetString());
      layer.blendMode=str(o,"blendMode",false,"normal");layer.kind=str(o,"kind",false);layer.tilemapTilesetId=str(o,"tilemapTilesetId",false);layer.groupId=str(o,"groupId",false);layer.linkedContentId=str(o,"linkedContentId",false);
      if(!layer.kind.empty()&&layer.kind!="text"&&layer.kind!="tilemap"&&layer.kind!="adjustment"&&layer.kind!="free-tile") out.unsupported.emplace_back("layer kind="+layer.kind);
      if(!parseLayerBlendMode(layer.blendMode)) out.unsupported.emplace_back("blendMode="+layer.blendMode);

      if(layer.kind=="free-tile")layer.freeTiles=freejson::decodeLayer(o,layer.id);
      layer.clippingMask=boolean(o,"clippingMask",false);
      if(layer.kind=="adjustment"){
       auto adjustment=o.GetNamedObject(L"adjustment",JsonObject{});const auto kind=adjustment.GetNamedString(L"kind",L"gradient-map");if(kind!=L"gradient-map")out.unsupported.emplace_back("adjustment kind "+layer.id);
       auto settings=adjustment.GetNamedObject(L"gradientMap",JsonObject{});if(!present(o,"adjustment")&&present(o,"layerStyles"))settings=o.GetNamedObject(L"layerStyles").GetNamedObject(L"gradientMap",JsonObject{});
       timeline::LayerAdjustment value;value.enabled=adjustment.GetNamedBoolean(L"enabled",true);if(!present(o,"adjustment")&&present(o,"layerStyles")){auto styles=o.GetNamedObject(L"layerStyles");value.enabled=styles.GetNamedBoolean(L"enabled",true)&&styles.GetNamedObject(L"gradientMap",JsonObject{}).GetNamedBoolean(L"enabled",true);}if(settings.HasKey(L"stops"))value.gradientMap=GradientMapPresetStore::decodeSettings(settings);layer.adjustment=std::move(value);
      }else {layer.layerStyles=readColorOverlay(o,out,layer.id);if(present(o,"adjustment"))out.unsupported.emplace_back("layer effects "+layer.id);}
      fields(o,{"id","name","linkedContentId","autoLinkAnimationCels","displayColor","description","kind","tilemapTilesetId","freeTileTilesetId","freeTileSetId","freeTileSources","visible","locked","opacity","blendMode","clippingMask","layerStyles","adjustment","background","groupId","width","height","offsetX","offsetY","dataFile","dataEncoding"},"layer",out);
      if(auto v=value(o,"background");v&&v.ValueType()==JsonValueType::Object){auto b=v.GetObject();timeline::BackgroundSettings settings;settings.mode=str(b,"mode",false);if(settings.mode=="canvas"){auto w=value(b,"repeatWidth"),h=value(b,"repeatHeight");if(w&&h&&w.ValueType()==JsonValueType::Number&&h.ValueType()==JsonValueType::Number){double x=w.GetNumber(),y=h.GetNumber();if(std::floor(x)==x&&std::floor(y)==y&&x>0&&y>0&&x<=65536&&y<=65536&&x*y<=268435456){settings.repeatWidth=int(x);settings.repeatHeight=int(y);}}layer.background=settings;}else if(settings.mode=="preset"){settings.pattern=str(b,"pattern",false);if(isBackgroundPattern(settings.pattern))layer.background=settings;}}
      layer.surface=raster(o);if(!layer.surface && out.colorMode=="rgba" && layer.kind.empty()) bad("missing layer raster");out.layers.push_back(std::move(layer));
    }
    if(out.layers.empty() || !layerIds.count(out.activeLayerId)) bad("activeLayerId");
    const auto animation=object(doc,"animation");out.activeFrameId=str(animation,"activeFrameId");out.loop=boolean(animation,"loop",true);
    fields(animation,{"frames","cels","activeFrameId","loop","loopSections","layerMasks","groupMasks"},"animation",out);
    for(const auto& item:array(animation,"frames")) {auto o=itemObject(item,"frame");ManifestFrame frame;frame.id=str(o,"id");unique(frameIds,frame.id,"frame");frame.duration=integer(o,"duration",100,1,true);frame.disabled=boolean(o,"disabled",false);fields(o,{"id","duration","disabled"},"frame",out);out.frames.push_back(std::move(frame));}
    if(out.frames.empty() || !frameIds.count(out.activeFrameId)) bad("activeFrameId");
    std::set<std::string> loopIds;
    for(const auto& item:array(animation,"loopSections",false)){const auto o=itemObject(item,"loopSection");ManifestLoopSection section;section.id=str(o,"id");unique(loopIds,section.id,"loop section");section.name=str(o,"name",false);section.startFrameId=str(o,"startFrameId");section.endFrameId=str(o,"endFrameId");section.direction=str(o,"direction",false,"forward");if(!frameIds.count(section.startFrameId)||!frameIds.count(section.endFrameId))bad("loop frame reference");if(section.direction!="forward" && section.direction!="reverse" && section.direction!="ping-pong" && section.direction!="ping-pong-reverse")bad("loop direction");if(present(o,"repeatCount")){section.repeatCount=integer(o,"repeatCount",1,1,true);if(*section.repeatCount>9999)bad("loop repeatCount");}fields(o,{"id","name","startFrameId","endFrameId","direction","repeatCount"},"loopSection",out);out.loopSections.push_back(std::move(section));}
    std::set<std::pair<std::string,std::string>> occupied;
    for(const auto& item:array(animation,"cels")) {
      const auto o=itemObject(item,"cel");ManifestCel cel;cel.id=str(o,"id");unique(celIds,cel.id,"cel");cel.layerId=str(o,"layerId");cel.frameId=str(o,"frameId");cel.linkedCelId=str(o,"linkedCelId",false);cel.zIndex=integer(o,"zIndex",0);
      if(!layerIds.count(cel.layerId)||!frameIds.count(cel.frameId)||!occupied.emplace(cel.layerId,cel.frameId).second) bad("cel relationship "+cel.id);
      if(present(o,"opacity")) cel.opacity=opacity(o,"opacity");
      if(present(o,"text"))cel.text=decodeTextCel(o.GetNamedObject(L"text"));
      if(present(o,"tilemap"))cel.tilemap=tilejson::decode(o.GetNamedObject(L"tilemap"));if(present(o,"freeTiles"))cel.freeTiles=freejson::decodeCel(o.GetNamedObject(L"freeTiles"));
      fields(o,{"id","layerId","frameId","linkedCelId","zIndex","opacity","format","width","height","offsetX","offsetY","dataFile","dataEncoding","mask","text","tilemap","freeTiles"},"cel",out);
      cel.surface=raster(o);if(!cel.surface && cel.linkedCelId.empty() && out.colorMode=="rgba") bad("missing cel raster");out.cels.push_back(std::move(cel));
    }
    for(const auto& cel:out.cels) if(!cel.linkedCelId.empty() && !celIds.count(cel.linkedCelId)) bad("missing linkedCelId");

    // Explicit layer slots precede legacy cel.mask; shadow resources are read first.
    std::map<std::string,Bytes> maskResources;
    auto rememberMaskResource=[&](const IJsonValue& metadata){if(!metadata||metadata.ValueType()!=JsonValueType::Object)return;const auto o=metadata.GetObject();const auto v=value(o,"dataFile");if(!v||v.ValueType()!=JsonValueType::String)return;const auto file=winrt::to_string(v.GetString());if(file.empty())return;if(std::find(out.maskDataFiles.begin(),out.maskDataFiles.end(),file)==out.maskDataFiles.end())out.maskDataFiles.push_back(file);consumedFiles.insert(file);if(archive.entries().count(file)&&!maskResources.count(file))maskResources.emplace(file,archive.read(file,limits.expandedBytes));};
    for(const auto name:{"layerMasks","groupMasks"})for(const auto& item:array(animation,name,false)){const auto o=itemObject(item,"mask slot");rememberMaskResource(value(o,"mask"));}
    for(const auto& item:array(animation,"cels"))rememberMaskResource(value(item.GetObject(),"mask"));
    std::set<std::string> decodedMaskIds;
    auto decodeMask=[&](const IJsonValue& metadata,const std::string& owner,const std::string& frame,bool group){
      if(!metadata||metadata.ValueType()!=JsonValueType::Object)bad("mask metadata");const auto o=metadata.GetObject();ManifestMask m;m.ownerId=owner;m.frameId=frame;m.group=group;m.id=str(o,"id");unique(decodedMaskIds,m.id,"mask");m.linkedMaskId=str(o,"linkedMaskId",false);
      auto flag=[&](const char* name){const auto v=value(o,name);return v&&v.ValueType()==JsonValueType::Boolean&&v.GetBoolean();};m.locked=flag("locked");m.autoLink=flag("autoLinkAnimationCels");
      const int width=integer(o,"width",0,1,true),height=integer(o,"height",0,1,true);auto offset=[&](const char* name){const auto v=value(o,name);if(!v||v.ValueType()!=JsonValueType::Number||!std::isfinite(v.GetNumber()))bad(std::string("mask ")+name);const double n=std::trunc(v.GetNumber());if(n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max())throw Error(ErrorKind::Limit,"Mask offset exceeds native coordinates");return int(n);};const int x=offset("offsetX"),y=offset("offsetY");const auto file=str(o,"dataFile");
      const std::uint64_t pixels=std::uint64_t(width)*height;if(pixels>(limits.expandedBytes-decodedBytes)/4)throw Error(ErrorKind::Limit,"Decoded mask pixels exceed budget");const auto found=maskResources.find(file);if(found==maskResources.end())bad("missing mask resource "+file);const auto& data=found->second;if(data.size()!=pixels&&data.size()!=pixels*4)bad("mask resource byte count "+file);
      auto raster=std::make_shared<ManifestRaster>();raster->width=width;raster->height=height;raster->offsetX=x;raster->offsetY=y;raster->dataFile=file;raster->dataEncoding="raw";raster->pixels.resize(std::size_t(pixels));
      if(data.size()==pixels){for(std::size_t i=0;i<pixels;++i)raster->pixels[i]=0xff000000u|std::uint32_t(data[i])*0x010101u;}else for(std::size_t i=0;i<pixels;++i){const auto at=i*4;const auto alpha=data[at+3];if(alpha==0){raster->pixels[i]=0;continue;}if(alpha!=255||data[at]!=data[at+1]||data[at]!=data[at+2])bad("mask resource must contain scalar grayscale or transparent RGBA");raster->pixels[i]=0xff000000u|std::uint32_t(data[at])*0x010101u;}
      decodedBytes+=std::size_t(pixels)*4;fields(o,{"id","linkedMaskId","locked","autoLinkAnimationCels","width","height","offsetX","offsetY","dataFile"},"mask",out);m.surface=std::move(raster);out.masks.push_back(std::move(m));
    };
    std::set<std::pair<std::string,std::string>> layerMaskSlots,groupMaskSlots;
    for(const auto& item:array(animation,"layerMasks",false)){const auto slot=itemObject(item,"layer mask slot");const auto owner=str(slot,"layerId"),frame=str(slot,"frameId");if(!layerIds.count(owner)||!frameIds.count(frame))bad("layer mask slot reference");fields(slot,{"layerId","frameId","mask"},"layer mask slot",out);if(!layerMaskSlots.emplace(owner,frame).second)continue;decodeMask(value(slot,"mask"),owner,frame,false);}
    for(const auto& item:array(animation,"cels")){const auto cel=item.GetObject();if(!present(cel,"mask"))continue;const auto owner=str(cel,"layerId"),frame=str(cel,"frameId");if(!layerMaskSlots.emplace(owner,frame).second)continue;decodeMask(value(cel,"mask"),owner,frame,false);}
    for(const auto& item:array(animation,"groupMasks",false)){const auto slot=itemObject(item,"group mask slot");const auto owner=str(slot,"groupId"),frame=str(slot,"frameId");if(!groupIds.count(owner)||!frameIds.count(frame)||!groupMaskSlots.emplace(owner,frame).second)bad("group mask slot reference or duplicate");fields(slot,{"groupId","frameId","mask"},"group mask slot",out);decodeMask(value(slot,"mask"),owner,frame,true);}
    std::map<std::string,const ManifestMask*> masksById;for(const auto& mask:out.masks)masksById.emplace(mask.id,&mask);for(const auto& mask:out.masks){std::set<std::string> visited;const auto* current=&mask;while(!current->linkedMaskId.empty()){if(!visited.insert(current->id).second)bad("cyclic mask link");const auto next=masksById.find(current->linkedMaskId);if(next==masksById.end()||next->second==current)bad("missing or self mask link");current=next->second;}}

    std::set<int> paletteIds;
    for(const auto& item:array(doc,"palette")) {
      auto o=itemObject(item,"palette entry");ManifestPaletteEntry entry;entry.id=integer(o,"id",0,1,true);entry.name=str(o,"name",false);
      if(!paletteIds.insert(entry.id).second) bad("duplicate palette ID");const auto c=object(o,"color");
      int shift=0;for(const auto channel:{"r","g","b","a"}) {const auto n=integer(c,channel,0,0,true);if(n>255) bad("palette channel");entry.color|=std::uint32_t(n)<<shift;shift+=8;}
      fields(o,{"id","name","color"},"palette",out);out.palette.push_back(std::move(entry));
    }
    for(const auto& item:array(doc,"paletteOrder")) {auto id=integerValue(item,"paletteOrder",1);if(!paletteIds.count(id)) bad("paletteOrder reference");out.paletteOrder.push_back(id);}
    for(const auto& item:array(doc,"paletteSlots",false)) {const auto id=item.ValueType()==JsonValueType::Null?0:integerValue(item,"paletteSlots",1);if(id && !paletteIds.count(id)) bad("paletteSlots reference");out.paletteSlots.push_back(id);}
    out.paletteColumns=integer(doc,"paletteColumns",8,1);out.nextColorId=integer(doc,"nextColorId",1,1,true);
    for(const auto id:paletteIds) if(id>=out.nextColorId) bad("nextColorId");
    for(const auto& entry:archive.entries()) if(!consumedFiles.count(entry.first)) out.unsupported.emplace_back("unmapped archive resource "+entry.first);
    return out;
  } catch(const winrt::hresult_error& error) {
    throw Error(error.code().value==E_OUTOFMEMORY?ErrorKind::Limit:ErrorKind::Corrupt,"System JSON failure; HRESULT="+std::to_string(error.code().value)+": "+winrt::to_string(error.message()));
  }
}
}
