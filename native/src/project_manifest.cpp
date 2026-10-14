#include "project_manifest.h"
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
    if(out.colorMode!="rgba") out.unsupported.emplace_back("colorMode="+out.colorMode);
    if(present(doc,"pixelFormat") && str(doc,"pixelFormat")!="rgba32") out.unsupported.emplace_back("pixelFormat="+str(doc,"pixelFormat"));
    fields(root,{"app","schemaVersion","document","sourceSchemaVersion"},"manifest",out);
    fields(doc,{"schemaVersion","id","name","width","height","colorMode","pixelFormat","layers","groups","activeLayerId","palette","paletteOrder","paletteSlots","paletteColumns","nextColorId","customBrushes","referenceImages","canvasReferences","tilesets","animation","outlineSettings","displaySettings","layerPanelState","statistics","timelapse","slices","createdAt","updatedAt"},"document",out);
    if(present(doc,"displaySettings")){const auto display=object(doc,"displaySettings");if(present(display,"symmetryCenter")){const auto center=object(display,"symmetryCenter");out.symmetryCenter=std::make_pair(center.GetNamedNumber(L"x"),center.GetNamedNumber(L"y"));}}
    for(const auto name:{"groups","referenceImages","canvasReferences","tilesets","slices"}) nonempty(doc,name,out);
    if(present(doc,"timelapse")) {auto t=object(doc,"timelapse");if(boolean(t,"enabled",false) || array(t,"snapshots",false).Size()) out.unsupported.emplace_back("timelapse");}
    // Decode each shared resource/geometry tuple once. Source archive preserves all other files.
    using RasterKey=std::tuple<std::string,std::string,int,int,int,int>;
    std::map<RasterKey,std::shared_ptr<const ManifestRaster>> rasters;std::size_t decodedBytes=0;
    std::set<std::string> consumedFiles{"manifest.json","preview.png"};
    auto raster=[&](const JsonObject& metadata)->std::shared_ptr<const ManifestRaster> {
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
      result->pixels=decodeRgba(data,encoding,w,h,limits.expandedBytes-decodedBytes);decodedBytes+=std::size_t(pixels)*4;
      rasters.emplace(cacheKey,result);return result;
    };
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
      layer.blendMode=str(o,"blendMode",false,"normal");layer.kind=str(o,"kind",false);layer.groupId=str(o,"groupId",false);layer.linkedContentId=str(o,"linkedContentId",false);
      if(!layer.kind.empty()) out.unsupported.emplace_back("layer kind="+layer.kind);
      if(layer.blendMode!="normal") out.unsupported.emplace_back("blendMode="+layer.blendMode);
      if(!layer.groupId.empty()||!layer.linkedContentId.empty()) out.unsupported.emplace_back("grouped/linked layer "+layer.id);
      if(boolean(o,"clippingMask",false)||present(o,"layerStyles")||present(o,"adjustment")||present(o,"background")) out.unsupported.emplace_back("layer effects "+layer.id);
      fields(o,{"id","name","linkedContentId","autoLinkAnimationCels","displayColor","description","kind","tilemapTilesetId","freeTileTilesetId","freeTileSetId","freeTileSources","visible","locked","opacity","blendMode","clippingMask","layerStyles","adjustment","background","groupId","width","height","offsetX","offsetY","dataFile","dataEncoding"},"layer",out);
      layer.surface=raster(o);if(!layer.surface && out.colorMode=="rgba" && layer.kind.empty()) bad("missing layer raster");out.layers.push_back(std::move(layer));
    }
    if(out.layers.empty() || !layerIds.count(out.activeLayerId)) bad("activeLayerId");
    const auto animation=object(doc,"animation");out.activeFrameId=str(animation,"activeFrameId");out.loop=boolean(animation,"loop",true);
    fields(animation,{"frames","cels","activeFrameId","loop","loopSections","layerMasks","groupMasks"},"animation",out);
    for(const auto name:{"layerMasks","groupMasks"}) nonempty(animation,name,out);
    for(const auto& item:array(animation,"frames")) {auto o=itemObject(item,"frame");ManifestFrame frame;frame.id=str(o,"id");unique(frameIds,frame.id,"frame");frame.duration=integer(o,"duration",100,1,true);fields(o,{"id","duration"},"frame",out);out.frames.push_back(std::move(frame));}
    if(out.frames.empty() || !frameIds.count(out.activeFrameId)) bad("activeFrameId");
    std::set<std::string> loopIds;
    for(const auto& item:array(animation,"loopSections",false)){const auto o=itemObject(item,"loopSection");ManifestLoopSection section;section.id=str(o,"id");unique(loopIds,section.id,"loop section");section.name=str(o,"name",false);section.startFrameId=str(o,"startFrameId");section.endFrameId=str(o,"endFrameId");section.direction=str(o,"direction",false,"forward");if(!frameIds.count(section.startFrameId)||!frameIds.count(section.endFrameId))bad("loop frame reference");if(section.direction!="forward" && section.direction!="reverse" && section.direction!="ping-pong" && section.direction!="ping-pong-reverse")bad("loop direction");if(present(o,"repeatCount")){section.repeatCount=integer(o,"repeatCount",1,1,true);if(*section.repeatCount>9999)bad("loop repeatCount");}fields(o,{"id","name","startFrameId","endFrameId","direction","repeatCount"},"loopSection",out);out.loopSections.push_back(std::move(section));}
    std::set<std::pair<std::string,std::string>> occupied;
    for(const auto& item:array(animation,"cels")) {
      const auto o=itemObject(item,"cel");ManifestCel cel;cel.id=str(o,"id");unique(celIds,cel.id,"cel");cel.layerId=str(o,"layerId");cel.frameId=str(o,"frameId");cel.linkedCelId=str(o,"linkedCelId",false);cel.zIndex=integer(o,"zIndex",0);
      if(!layerIds.count(cel.layerId)||!frameIds.count(cel.frameId)||!occupied.emplace(cel.layerId,cel.frameId).second) bad("cel relationship "+cel.id);
      if(present(o,"opacity")) cel.opacity=opacity(o,"opacity");
      for(const auto name:{"mask","text","tilemap","freeTiles"}) if(present(o,name)) out.unsupported.emplace_back(std::string("cel ")+name);
      fields(o,{"id","layerId","frameId","linkedCelId","zIndex","opacity","format","width","height","offsetX","offsetY","dataFile","dataEncoding","mask","text","tilemap","freeTiles"},"cel",out);
      cel.surface=raster(o);if(!cel.surface && cel.linkedCelId.empty() && out.colorMode=="rgba") bad("missing cel raster");out.cels.push_back(std::move(cel));
    }
    for(const auto& cel:out.cels) if(!cel.linkedCelId.empty() && !celIds.count(cel.linkedCelId)) bad("missing linkedCelId");
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
