#include "text_project_json.h"
#include "gradient_map_presets.h"
#include "tilemap_project_json.h"
#include "free_tile_project_json.h"
#include "project_encode.h"
#include "timelapse_project_json.h"
#include "document.h"
#include "project_manifest.h"
#include "project_import.h"
#include "project_preview.h"
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
#include <windows.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include "zlib.h"
#include <codecvt>
#include <locale>
#include <set>
#include <algorithm>
#include <limits>
namespace moon::project {
static void writeColorOverlay(winrt::Windows::Data::Json::JsonObject& out,const std::optional<timeline::ColorOverlayStyle>& style){using namespace winrt::Windows::Data::Json;if(!style){if(out.HasKey(L"layerStyles"))out.Remove(L"layerStyles");return;}JsonObject styles;if(!style->preservedJson.empty())styles=JsonObject::Parse(winrt::to_hstring(style->preservedJson));styles.SetNamedValue(L"enabled",JsonValue::CreateBooleanValue(style->enabled));JsonObject overlay,color;overlay.SetNamedValue(L"enabled",JsonValue::CreateBooleanValue(style->overlayEnabled));for(int i=0;i<4;++i)color.SetNamedValue(winrt::to_hstring(std::string(1,"rgba"[i])),JsonValue::CreateNumberValue((style->color>>(8*i))&255));overlay.SetNamedValue(L"color",color);styles.SetNamedValue(L"colorOverlay",overlay);JsonObject gradient;gradient.SetNamedValue(L"enabled",JsonValue::CreateBooleanValue(style->gradientEnabled));gradient.SetNamedValue(L"angle",JsonValue::CreateNumberValue(style->gradientAngle));gradient.SetNamedValue(L"dither",JsonValue::CreateStringValue(winrt::to_hstring(GradientMapPresetStore::ditherNames()[style->gradientDither])));for(auto name:{L"from",L"to"}){const auto p=std::wstring(name)==L"from"?style->gradientFrom:style->gradientTo;JsonObject color;for(int i=0;i<4;++i)color.SetNamedValue(winrt::to_hstring(std::string(1,"rgba"[i])),JsonValue::CreateNumberValue((p>>(8*i))&255));gradient.SetNamedValue(name,color);}styles.SetNamedValue(L"gradientOverlay",gradient);JsonObject stroke,strokeColor,directions;const auto& st=style->stroke;stroke.SetNamedValue(L"enabled",JsonValue::CreateBooleanValue(st.enabled));stroke.SetNamedValue(L"size",JsonValue::CreateNumberValue(st.size));stroke.SetNamedValue(L"position",JsonValue::CreateStringValue(st.position==0?L"inside":st.position==2?L"both":L"outside"));stroke.SetNamedValue(L"kernel",JsonValue::CreateStringValue(st.kernel==1?L"square":st.kernel==2?L"horizontal":st.kernel==3?L"vertical":L"round"));stroke.SetNamedValue(L"smartHue",JsonValue::CreateBooleanValue(st.smartHue));stroke.SetNamedValue(L"followOpacity",JsonValue::CreateBooleanValue(st.followOpacity));stroke.SetNamedValue(L"smartHueDarkness",JsonValue::CreateNumberValue(st.darkness));for(int i=0;i<4;++i)strokeColor.SetNamedValue(winrt::to_hstring(std::string(1,"rgba"[i])),JsonValue::CreateNumberValue((st.color>>(8*i))&255));const wchar_t* names[]{L"nw",L"n",L"ne",L"w",L"e",L"sw",L"s",L"se"};for(int i=0;i<8;++i)directions.SetNamedValue(names[i],JsonValue::CreateBooleanValue((st.directions&(1u<<i))!=0));stroke.SetNamedValue(L"color",strokeColor);stroke.SetNamedValue(L"directions",directions);styles.SetNamedValue(L"stroke",stroke);JsonObject shadow,shadowColor;const auto& sh=style->shadow;shadow.SetNamedValue(L"enabled",JsonValue::CreateBooleanValue(sh.enabled));shadow.SetNamedValue(L"offsetX",JsonValue::CreateNumberValue(sh.offsetX));shadow.SetNamedValue(L"offsetY",JsonValue::CreateNumberValue(sh.offsetY));shadow.SetNamedValue(L"blur",JsonValue::CreateNumberValue(sh.blur));shadow.SetNamedValue(L"smartShadow",JsonValue::CreateBooleanValue(sh.smart));shadow.SetNamedValue(L"smartShadowDarkness",JsonValue::CreateNumberValue(sh.darkness));for(int i=0;i<4;++i)shadowColor.SetNamedValue(winrt::to_hstring(std::string(1,"rgba"[i])),JsonValue::CreateNumberValue((sh.color>>(8*i))&255));shadow.SetNamedValue(L"color",shadowColor);styles.SetNamedValue(L"shadow",shadow);JsonObject glow,glowColor;glow.SetNamedValue(L"enabled",JsonValue::CreateBooleanValue(style->innerGlow.enabled));glow.SetNamedValue(L"size",JsonValue::CreateNumberValue(style->innerGlow.size));for(int i=0;i<4;++i)glowColor.SetNamedValue(winrt::to_hstring(std::string(1,"rgba"[i])),JsonValue::CreateNumberValue((style->innerGlow.color>>(8*i))&255));glow.SetNamedValue(L"color",glowColor);styles.SetNamedValue(L"innerGlow",glow);auto map=GradientMapPresetStore::encodeSettings(style->gradientMap);map.SetNamedValue(L"enabled",JsonValue::CreateBooleanValue(style->gradientMapEnabled));map.SetNamedValue(L"scope",JsonValue::CreateStringValue(L"layer"));styles.SetNamedValue(L"gradientMap",map);out.SetNamedValue(L"layerStyles",styles);}

namespace {
using namespace winrt::Windows::Data::Json;
struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize JSON encoder; HRESULT="+std::to_string(status));}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};
std::string utf8(const std::u32string& s) {return std::wstring_convert<std::codecvt_utf8<char32_t>,char32_t>{}.to_bytes(s);}
void text(JsonObject o,const wchar_t* k,const std::string& s){o.Insert(k,JsonValue::CreateStringValue(winrt::to_hstring(s)));}
void number(JsonObject o,const wchar_t* k,double n){o.Insert(k,JsonValue::CreateNumberValue(n));}
void boolean(JsonObject o,const wchar_t* k,bool v){o.Insert(k,JsonValue::CreateBooleanValue(v));}
std::string now(){SYSTEMTIME t;GetSystemTime(&t);char s[32];snprintf(s,sizeof(s),"%04u-%02u-%02uT%02u:%02u:%02u.%03uZ",t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond,t.wMilliseconds);return s;}
std::string newId(std::uint64_t identity){static const std::string process=[] {GUID guid;const auto hr=CoCreateGuid(&guid);if(FAILED(hr))throw std::runtime_error("Cannot create project ID");wchar_t s[40];StringFromGUID2(guid,s,40);return winrt::to_string(s);}();return "doc-native-"+process+"-"+std::to_string(identity);}
void put16(Bytes& b,std::uint32_t n){b.push_back(n&255);b.push_back((n>>8)&255);}
void put32(Bytes& b,std::uint32_t n){put16(b,n);put16(b,n>>16);}
struct EncodedRaster {Bytes data;std::string encoding;};
EncodedRaster raster(const timeline::Surface& surface){
  const auto w=surface.width,h=surface.height;
  const auto& pixels=surface.pixels;
  struct Tile{int x,y,w,h;};std::vector<Tile> tiles;std::size_t payload=0;
  for(int y=0;y<h;y+=64)for(int x=0;x<w;x+=64){const int tw=std::min(64,w-x),th=std::min(64,h-y);bool content=false;
    for(int row=0;row<th&&!content;++row)for(int col=0;col<tw;++col)if(pixels[std::size_t(y+row)*w+x+col]!=0){content=true;break;}
    if(content){tiles.push_back({x,y,tw,th});payload+=std::size_t(tw)*th*4;}
  }
  const auto sparseSize=24+tiles.size()*16+payload;
  if(sparseSize>=pixels.size()*4){EncodedRaster out{{},"raw"};out.data.reserve(pixels.size()*4);for(auto p:pixels)put32(out.data,p);return out;}
  EncodedRaster out{{},"sparse-tiles-v1"};auto& b=out.data;b.reserve(sparseSize);
  put32(b,0x3154534d);put16(b,64);b.push_back(1);b.push_back(0);put32(b,w);put32(b,h);put32(b,std::uint32_t(tiles.size()));put32(b,std::uint32_t(payload));
  std::size_t offset=24+tiles.size()*16;
  for(const auto& t:tiles){put32(b,t.x);put32(b,t.y);put16(b,t.w);put16(b,t.h);put32(b,std::uint32_t(offset));offset+=std::size_t(t.w)*t.h*4;}
  for(const auto& t:tiles)for(int row=0;row<t.h;++row)for(int col=0;col<t.w;++col)put32(b,pixels[std::size_t(t.y+row)*w+t.x+col]);
  return out;
}
Bytes zipStored(const std::map<std::string,Bytes>& files,Limits limits,int compression){
  if(files.size()>limits.maxEntries || files.size()>=65535)throw Error(ErrorKind::Limit,"Too many saved project resources");
  std::uint64_t size=22,total=0;
  for(const auto& [name,data]:files){if(name.empty()||name.size()>65535||data.size()>0xffffffff)throw Error(ErrorKind::Limit,"Saved ZIP resource too large");size+=76+name.size()*2+data.size();total+=data.size();}
  if(size>limits.archiveBytes||size>=0xffffffff||total>limits.expandedBytes)throw Error(ErrorKind::Limit,"Encoded project exceeds memory/archive budget");
  Bytes b,central;b.reserve(std::size_t(size));
  for(const auto& [name,data]:files){const auto offset=std::uint32_t(b.size()),length=std::uint32_t(data.size());const auto crc=std::uint32_t(crc32(0,data.empty()?Z_NULL:data.data(),length));
    Bytes compressed;
    if(compression) {
      z_stream z{};if(deflateInit2(&z,1,Z_DEFLATED,-MAX_WBITS,8,Z_DEFAULT_STRATEGY)!=Z_OK)throw Error(ErrorKind::Limit,"Cannot initialize recovery compressor");
      struct DeflateGuard { z_stream* stream; ~DeflateGuard(){deflateEnd(stream);} } guard{&z};
      const auto bound=deflateBound(&z,length);
      if(bound>limits.archiveBytes || bound>std::numeric_limits<uInt>::max())throw Error(ErrorKind::Limit,"Recovery compression exceeds budget");
      compressed.resize(bound);z.next_in=const_cast<Bytef*>(data.data());z.avail_in=length;z.next_out=compressed.data();z.avail_out=static_cast<uInt>(compressed.size());
      const auto result=deflate(&z,Z_FINISH);const auto written=z.total_out;
      if(result!=Z_STREAM_END)throw Error(ErrorKind::Corrupt,"Recovery compression failed");compressed.resize(written);
    }
    const auto& payload=compression?compressed:data;const auto stored=std::uint32_t(payload.size());
    if(b.size()+payload.size()+central.size()+name.size()*2+98>limits.archiveBytes)throw Error(ErrorKind::Limit,"Recovery archive exceeds budget");
    put32(b,0x04034b50);put16(b,20);put16(b,0x800);put16(b,compression?8:0);put16(b,0);put16(b,33);put32(b,crc);put32(b,stored);put32(b,length);put16(b,std::uint32_t(name.size()));put16(b,0);b.insert(b.end(),name.begin(),name.end());b.insert(b.end(),payload.begin(),payload.end());
    put32(central,0x02014b50);put16(central,20);put16(central,20);put16(central,0x800);put16(central,compression?8:0);put16(central,0);put16(central,33);put32(central,crc);put32(central,stored);put32(central,length);put16(central,std::uint32_t(name.size()));put16(central,0);put16(central,0);put16(central,0);put16(central,0);put32(central,0);put32(central,offset);central.insert(central.end(),name.begin(),name.end());
  }
  const auto offset=std::uint32_t(b.size());b.insert(b.end(),central.begin(),central.end());put32(b,0x06054b50);put16(b,0);put16(b,0);put16(b,std::uint32_t(files.size()));put16(b,std::uint32_t(files.size()));put32(b,std::uint32_t(central.size()));put32(b,offset);put16(b,0);return b;
}
}
static EncodedProject encodeProject(const Document& d,Limits limits,bool recovery){
  if(d.active())throw Error(ErrorKind::Unsupported,"Commit or cancel the active stroke before saving");
  if(d.width()<1||d.height()<1||d.width()>1024||d.height()>1024)
    throw Error(ErrorKind::Unsupported,"Unsupported document canvas dimensions");
  // Format encoding accepts independent RGBA owners. This does not admit
  // sparse external editing. Formal save separately validates reopen admission.
  std::uint64_t rasterBytes=0;
  for(const auto& item:d.timeline().state().cels){
    const auto resolved=d.timeline().resolveSurface(item.id);
    if(!resolved.source || !resolved.surface)
      throw Error(ErrorKind::Unsupported,"Missing owned frame raster");
    const auto& surface=*resolved.surface;
    if(surface.width<1 || surface.height<1)
      throw Error(ErrorKind::Corrupt,"Invalid frame raster dimensions");
    const auto count=std::uint64_t(surface.width)*std::uint64_t(surface.height);
    if(count>std::numeric_limits<std::size_t>::max()/sizeof(Pixel) || count!=surface.pixels.size())
      throw Error(ErrorKind::Corrupt,"Frame raster pixel count mismatch");
    if(count>std::numeric_limits<std::uint32_t>::max()/sizeof(Pixel))
      throw Error(ErrorKind::Limit,"Frame raster exceeds ZIP resource size");
    // The container writes a raster fallback for every linked slot.
    if(rasterBytes>limits.expandedBytes || count>(limits.expandedBytes-rasterBytes)/sizeof(Pixel))
      throw Error(ErrorKind::Limit,"Document exceeds encode pixel budget");
    rasterBytes+=count*sizeof(Pixel);
  }
  const auto& l=d.layer();const auto& f=d.frame();
  std::optional<ReadManifest> source;
  if(d.sourceArchive()){source=readProjectManifest(d.sourceArchive(),limits);(void)prepareEditableImport(*source);if(source->id!=d.projectId())throw Error(ErrorKind::Unsupported,"Imported identities changed outside supported commands");}
  Apartment apartment;
  try{
    JsonObject root,doc,layer,frame,cel,animation;std::map<std::string,Bytes> files;
    if(source){root=JsonObject::Parse(winrt::to_hstring(source->manifestUtf8));doc=root.GetNamedObject(L"document");layer=doc.GetNamedArray(L"layers").GetObjectAt(0);animation=doc.GetNamedObject(L"animation");frame=animation.GetNamedArray(L"frames").GetObjectAt(0);cel=animation.GetNamedArray(L"cels").GetObjectAt(0);
      Archive original(d.sourceArchive(),limits);for(const auto& [name,entry]:original.entries())if(name!="manifest.json" && (!recovery || name!="preview.png"))files.emplace(name,original.read(name,limits.expandedBytes));
    }else{
      number(root,L"schemaVersion",21);text(root,L"app","MoonSprite");root.Insert(L"document",doc);number(doc,L"schemaVersion",21);text(doc,L"createdAt",now());text(doc,L"colorMode","rgba");text(doc,L"pixelFormat","rgba32");
      for(const auto key:{L"groups",L"customBrushes",L"referenceImages",L"canvasReferences",L"tilesets",L"slices"})doc.Insert(key,JsonArray());
      JsonArray layers;layers.Append(layer);doc.Insert(L"layers",layers);JsonArray frames;frames.Append(frame);animation.Insert(L"frames",frames);JsonArray cels;cels.Append(cel);animation.Insert(L"cels",cels);doc.Insert(L"animation",animation);
      boolean(animation,L"loop",true);for(const auto key:{L"layerMasks",L"groupMasks"})animation.Insert(key,JsonArray());
      text(layer,L"blendMode","normal");layer.Insert(L"groupId",JsonValue::CreateNullValue());
    }
    const auto id=d.projectId().empty()?newId(d.identity()):d.projectId();text(doc,L"id",id);text(doc,L"name",utf8(d.name()));number(doc,L"width",d.width());number(doc,L"height",d.height());text(doc,L"createdAt",d.projectInformation().createdAt);text(doc,L"updatedAt",d.projectInformation().updatedAt);text(doc,L"activeLayerId",l.id);text(animation,L"activeFrameId",f.id);
      JsonArray sections;for(const auto& section:d.timeline().state().loopSections){JsonObject o;text(o,L"id",section.id);text(o,L"name",utf8(section.name));text(o,L"startFrameId",section.startFrameId);text(o,L"endFrameId",section.endFrameId);text(o,L"direction",section.direction);o.Insert(L"repeatCount",section.repeatCount?JsonValue::CreateNumberValue(*section.repeatCount):JsonValue::CreateNullValue());sections.Append(o);}animation.Insert(L"loopSections",sections);
    {const auto& information=d.projectInformation();JsonObject statistics;number(statistics,L"strokeCount",double(information.strokeCount));number(statistics,L"operationCount",double(information.operationCount));number(statistics,L"drawingTimeMs",double(information.drawingTimeMs));doc.Insert(L"statistics",statistics);}
    std::map<const void*,std::string> linkedFiles;
    JsonArray savedLayers,savedCels,savedFrames,savedGroups;
    for(const auto& group:d.timeline().state().groups){JsonObject out;text(out,L"id",group.id);text(out,L"name",utf8(group.name));out.Insert(L"parentGroupId",group.parentGroupId?JsonValue::CreateStringValue(winrt::to_hstring(*group.parentGroupId)):JsonValue::CreateNullValue());boolean(out,L"visible",group.visible);boolean(out,L"locked",group.locked);number(out,L"opacity",group.opacity);text(out,L"blendMode",group.blendMode);if(group.clippingMask)boolean(out,L"clippingMask",true);if(group.panelOrder)number(out,L"panelOrder",*group.panelOrder);if(!group.description.empty())text(out,L"description",utf8(group.description));if(group.displayColor){auto c=*group.displayColor;JsonObject color;number(color,L"r",c&255);number(color,L"g",(c>>8)&255);number(color,L"b",(c>>16)&255);number(color,L"a",c>>24);out.Insert(L"displayColor",color);}writeColorOverlay(out,group.layerStyles);savedGroups.Append(out);}doc.Insert(L"groups",savedGroups);
    boolean(animation,L"loop",d.animationLoop());
    for(const auto& current:d.timeline().state().frames){JsonObject out; text(out,L"id",current.id);number(out,L"duration",current.duration);if(current.disabled)boolean(out,L"disabled",true);savedFrames.Append(out);}
    for(auto it=d.timeline().state().layers.rbegin();it!=d.timeline().state().layers.rend();++it) {
      const auto& item=*it;JsonObject outLayer;
      if(source)for(const auto& old:doc.GetNamedArray(L"layers")){const auto o=old.GetObject();if(winrt::to_string(o.GetNamedString(L"id"))==item.id){outLayer=o;break;}}
      if(item.kind=="free-tile"&&item.freeTiles)freejson::encodeLayer(outLayer,*item.freeTiles);else for(auto key:{L"freeTileSetId",L"freeTileTilesetId",L"freeTileSources"})outLayer.Remove(key);
      if(item.background){JsonObject settings; text(settings,L"mode",item.background->mode);if(item.background->mode=="preset")text(settings,L"pattern",item.background->pattern);else if(item.background->repeatWidth>0){number(settings,L"repeatWidth",item.background->repeatWidth);number(settings,L"repeatHeight",item.background->repeatHeight);}outLayer.Insert(L"background",settings);}else outLayer.Remove(L"background");if(item.linkedContentId.empty())outLayer.Remove(L"linkedContentId");else text(outLayer,L"linkedContentId",item.linkedContentId);if(item.kind.empty())outLayer.Remove(L"kind");else text(outLayer,L"kind",item.kind);if(item.kind=="adjustment"){JsonObject a;a.Insert(L"kind",JsonValue::CreateStringValue(L"gradient-map"));a.Insert(L"enabled",JsonValue::CreateBooleanValue(!item.adjustment||item.adjustment->enabled));a.Insert(L"gradientMap",GradientMapPresetStore::encodeSettings(item.adjustment?item.adjustment->gradientMap:GradientMapSettings{}));outLayer.Insert(L"adjustment",a);outLayer.Remove(L"layerStyles");}else {outLayer.Remove(L"adjustment");writeColorOverlay(outLayer,item.layerStyles);}if(item.kind=="tilemap")text(outLayer,L"tilemapTilesetId",item.tilemapTilesetId);else outLayer.Remove(L"tilemapTilesetId");text(outLayer,L"id",item.id);text(outLayer,L"name",utf8(item.name));text(outLayer,L"blendMode",item.blendMode);if(item.clippingMask)boolean(outLayer,L"clippingMask",true);else outLayer.Remove(L"clippingMask");outLayer.Insert(L"groupId",item.groupId?JsonValue::CreateStringValue(winrt::to_hstring(*item.groupId)):JsonValue::CreateNullValue());boolean(outLayer,L"visible",item.visible);boolean(outLayer,L"locked",item.locked);number(outLayer,L"opacity",item.opacity);if(item.autoLinkAnimationCels)boolean(outLayer,L"autoLinkAnimationCels",true);else outLayer.Remove(L"autoLinkAnimationCels");
      for(const auto& current:d.timeline().state().frames) {
        const auto* slot=d.timeline().findCel(item.id,current.id);const auto resolution=slot?d.timeline().resolveSurface(slot->id):timeline::Resolution{};const auto* owned=resolution.source;
        if(!owned || !owned->surface)throw Error(ErrorKind::Unsupported,"Missing owned frame raster");
        const auto& surface=*owned->surface;
        JsonObject outCel;if(source)for(const auto& old:animation.GetNamedArray(L"cels")){const auto o=old.GetObject();if(winrt::to_string(o.GetNamedString(L"id"))==slot->id){outCel=o;break;}}
        if(slot->freeTiles)outCel.Insert(L"freeTiles",freejson::encodeCel(*slot->freeTiles));else outCel.Remove(L"freeTiles");
        outCel.Remove(L"mask"); // Canonical independent slots supersede inline metadata.
        if(owned->tilemap&&!slot->linkedCelId)outCel.Insert(L"tilemap",tilejson::encode(*owned->tilemap));else outCel.Remove(L"tilemap");if(owned->text)outCel.Insert(L"text",encodeTextCel(*owned->text));else outCel.Remove(L"text");text(outCel,L"id",slot->id);text(outCel,L"layerId",item.id);text(outCel,L"frameId",current.id);text(outCel,L"format","rgba");if(slot->opacity)number(outCel,L"opacity",*slot->opacity);else outCel.Remove(L"opacity");number(outCel,L"zIndex",slot->zIndex);
        if(slot->linkedCelId)text(outCel,L"linkedCelId",*slot->linkedCelId);else outCel.Remove(L"linkedCelId");
        const auto encoded=raster(surface);auto file="cels/"+slot->id+".rgba"+(encoded.encoding=="raw"?"":".tiles");if(!item.linkedContentId.empty()){auto hit=linkedFiles.emplace(surface.pixels.identity(),file);file=hit.first->second;}
        number(outCel,L"width",surface.width);number(outCel,L"height",surface.height);number(outCel,L"offsetX",surface.offsetX);number(outCel,L"offsetY",surface.offsetY);text(outCel,L"dataFile",file);text(outCel,L"dataEncoding",encoded.encoding);files[file]=encoded.data;savedCels.Append(outCel);
        if(current.id==f.id)for(const auto key:{L"width",L"height",L"offsetX",L"offsetY",L"dataFile",L"dataEncoding"})outLayer.Insert(key,outCel.GetNamedValue(key));
      }
      if(item.displayColor){auto c=*item.displayColor;JsonObject color;number(color,L"r",c&255);number(color,L"g",(c>>8)&255);number(color,L"b",(c>>16)&255);number(color,L"a",c>>24);outLayer.Insert(L"displayColor",color);}else if(outLayer.HasKey(L"displayColor"))outLayer.Remove(L"displayColor");if(!item.description.empty())text(outLayer,L"description",utf8(item.description));else if(outLayer.HasKey(L"description"))outLayer.Remove(L"description");
      savedLayers.Append(outLayer);
    }
    JsonArray savedTilesets;for(const auto& t:d.timeline().state().tilesets){tilejson::validate(t);JsonObject o;tilejson::text(o,L"id",t.id);tilejson::text(o,L"name",utf8(t.name));tilejson::number(o,L"tileWidth",t.tileWidth);tilejson::number(o,L"tileHeight",t.tileHeight);tilejson::number(o,L"columns",t.columns);tilejson::number(o,L"rows",t.rows);JsonArray ids,slots;for(auto& id:t.tileIds)ids.Append(JsonValue::CreateStringValue(winrt::to_hstring(id)));for(auto& id:tiles::compactSlots(t))slots.Append(id?JsonValue::CreateStringValue(winrt::to_hstring(*id)):JsonValue::CreateNullValue());o.Insert(L"tileIds",ids);o.Insert(L"tileSlots",slots);const auto path="tilesets/"+t.id+".rgba";tilejson::text(o,L"dataFile",path);Bytes bytes;bytes.reserve(t.pixels.size()*4);for(auto p:t.pixels)put32(bytes,p);files[path]=std::move(bytes);savedTilesets.Append(o);}doc.Insert(L"tilesets",savedTilesets);
    JsonArray layerMasks,groupMasks;for(const auto& slot:d.timeline().state().masks){const auto& m=slot.mask;JsonObject entry,mask;text(entry,slot.group?L"groupId":L"layerId",slot.ownerId);text(entry,L"frameId",slot.frameId);text(mask,L"id",m.id);if(!m.linkedMaskId.empty())text(mask,L"linkedMaskId",m.linkedMaskId);if(m.locked)boolean(mask,L"locked",true);if(m.autoLinkAnimationCels)boolean(mask,L"autoLinkAnimationCels",true);const auto& r=m.surface;number(mask,L"width",r.width);number(mask,L"height",r.height);number(mask,L"offsetX",r.offsetX);number(mask,L"offsetY",r.offsetY);auto file="masks/"+m.id+".rgba";text(mask,L"dataFile",file);Bytes payload;payload.reserve(r.pixels.size()*4);for(auto p:r.pixels)put32(payload,p);files[file]=std::move(payload);entry.Insert(L"mask",mask);(slot.group?groupMasks:layerMasks).Append(entry);}animation.Insert(L"layerMasks",layerMasks);animation.Insert(L"groupMasks",groupMasks);
    doc.Insert(L"layers",savedLayers);animation.Insert(L"cels",savedCels);animation.Insert(L"frames",savedFrames);
    // Legacy encodePixels emits the current resource plan. An edited small cel
    // may change from sparse to raw (or back); carrying its previous payload
    // forward leaves an unreferenced archive entry and fails import admission.
    // Prune only known original raster resources absent from the new plan.
    if(source){
      std::set<std::string> retained;
      for(const auto& value:savedCels)retained.insert(winrt::to_string(value.GetObject().GetNamedString(L"dataFile")));
      for(const auto& set:d.timeline().state().tilesets)retained.insert("tilesets/"+set.id+".rgba");
      for(const auto& old:JsonObject::Parse(winrt::to_hstring(source->manifestUtf8)).GetNamedObject(L"document").GetNamedArray(L"tilesets",JsonArray{})){const auto file=winrt::to_string(old.GetObject().GetNamedString(L"dataFile"));if(!retained.count(file))files.erase(file);}
      for(const auto& m:d.timeline().state().masks)retained.insert("masks/"+m.mask.id+".rgba");

      for(const auto& resource:d.projectBrushes()){retained.insert(resource.metadata.dataFile);retained.insert(resource.metadata.colorsFile);}
      for(const auto& image:d.referenceImages())retained.insert("references/"+image.id+".rgba");
      for(const auto& file:source->maskDataFiles)if(!retained.count(file))files.erase(file);
      for(const auto& m:source->masks)if(m.surface&&!retained.count(m.surface->dataFile))files.erase(m.surface->dataFile);
      for(const auto& layer:source->layers)if(layer.surface && !retained.count(layer.surface->dataFile))files.erase(layer.surface->dataFile);
      for(const auto& cel:source->cels)if(cel.surface && !retained.count(cel.surface->dataFile))files.erase(cel.surface->dataFile);
    }

    JsonObject display;if(doc.HasKey(L"displaySettings"))display=doc.GetNamedObject(L"displaySettings");JsonObject center;number(center,L"x",d.symmetryCenter().x);number(center,L"y",d.symmetryCenter().y);display.Insert(L"symmetryCenter",center);display.Insert(L"showPixelGrid",JsonValue::CreateBooleanValue(d.showPixelGrid()));display.Insert(L"showGrid",JsonValue::CreateBooleanValue(d.showCustomGrid()));JsonObject grid;const auto settings=d.customGrid();number(grid,L"x",settings.x);number(grid,L"y",settings.y);number(grid,L"width",settings.width);number(grid,L"height",settings.height);display.Insert(L"grid",grid);doc.Insert(L"displaySettings",display);
    JsonArray brushes;
    for(const auto& resource:d.projectBrushes()){
      JsonObject item;if(source&&doc.HasKey(L"customBrushes"))for(const auto& old:doc.GetNamedArray(L"customBrushes")){auto object=old.GetObject();if(winrt::to_string(object.GetNamedString(L"id"))==resource.metadata.id){item=object;break;}}
      const auto& metadata=resource.metadata;text(item,L"id",metadata.id);text(item,L"name",metadata.name);number(item,L"width",resource.brush.width);number(item,L"height",resource.brush.height);text(item,L"dataFile",metadata.dataFile);
      if(!metadata.colorsFile.empty())text(item,L"colorsFile",metadata.colorsFile);if(metadata.sourceX)number(item,L"sourceX",*metadata.sourceX);if(metadata.sourceY)number(item,L"sourceY",*metadata.sourceY);
      for(const auto& entry:encodeProjectBrushResource(resource))files[entry.first]=entry.second;brushes.Append(item);
    }
    doc.Insert(L"customBrushes",brushes);

    JsonArray references;std::set<std::string> liveReferenceFiles;
    for(const auto& image:d.referenceImages()){validateReferenceImage(image);JsonObject item;text(item,L"id",image.id);number(item,L"width",image.width);number(item,L"height",image.height);const auto file="references/"+image.id+".rgba";text(item,L"dataFile",file);references.Append(item);Bytes bytes;bytes.reserve(image.pixels->size()*4);for(auto pixel:*image.pixels)put32(bytes,pixel);files[file]=std::move(bytes);liveReferenceFiles.insert(file);}doc.Insert(L"referenceImages",references);
    JsonArray slices;for(const auto& slice:d.slices()){JsonObject item;text(item,L"id",slice.id);text(item,L"name",utf8(slice.name));number(item,L"x",slice.rect.x);number(item,L"y",slice.rect.y);number(item,L"width",slice.rect.width);number(item,L"height",slice.rect.height);slices.Append(item);}doc.Insert(L"slices",slices);
    if(source)for(const auto& old:source->referenceImages){const auto file="references/"+old.id+".rgba";if(!liveReferenceFiles.count(file))files.erase(file);}

    // Remove only archive payloads belonging to explicitly deleted brush resources,
    // preserving shared raster/live brush resources and all unrelated original files.
    if(source){std::set<std::string> retained;for(const auto& resource:d.projectBrushes()){retained.insert(resource.metadata.dataFile);retained.insert(resource.metadata.colorsFile);}for(const auto& layer:source->layers)if(layer.surface)retained.insert(layer.surface->dataFile);for(const auto& cel:source->cels)if(cel.surface)retained.insert(cel.surface->dataFile);for(const auto& resource:source->customBrushes)if(std::none_of(d.projectBrushes().begin(),d.projectBrushes().end(),[&](const auto& current){return current.metadata.id==resource.metadata.id;})){if(!retained.count(resource.metadata.dataFile))files.erase(resource.metadata.dataFile);if(!retained.count(resource.metadata.colorsFile))files.erase(resource.metadata.colorsFile);}}
    if(d.palette().columns<1||d.palette().columns>256)throw Error(ErrorKind::Corrupt,"Invalid save palette columns");
    JsonArray palette,order,slots;std::set<int> ids,visible;
    for(const auto& entry:d.palette().entries){if(entry.id<1||!ids.insert(entry.id).second||entry.id>=d.palette().nextId)throw Error(ErrorKind::Corrupt,"Invalid save palette ID");JsonObject item,color;
      // Preserve original palette-entry metadata where present.
      if(source)for(const auto& old:doc.GetNamedArray(L"palette")){const auto o=old.GetObject();if(o.GetNamedNumber(L"id")==entry.id){item=o;break;}}
      number(item,L"id",entry.id);text(item,L"name",utf8(entry.name));int shift=0;for(const auto key:{L"r",L"g",L"b",L"a"}){number(color,key,(entry.color>>shift)&255);shift+=8;}item.Insert(L"color",color);palette.Append(item);
    }
    for(const auto slot:d.palette().slots){if(slot==0){slots.Append(JsonValue::CreateNullValue());continue;}if(!ids.count(slot)||!visible.insert(slot).second)throw Error(ErrorKind::Corrupt,"Invalid save palette slot");slots.Append(JsonValue::CreateNumberValue(slot));order.Append(JsonValue::CreateNumberValue(slot));}
    number(doc,L"paletteColumns",d.palette().columns);doc.Insert(L"palette",palette);doc.Insert(L"paletteOrder",order);doc.Insert(L"paletteSlots",slots);number(doc,L"nextColorId",d.palette().nextId);
    if(source)for(const auto& f:source->timelapse.snapshots)files.erase("timelapse/"+f.id+".png");
    doc.Insert(L"timelapse",timelapsejson::encode(d.timelapseSettings(),files));
    if(!recovery) files["preview.png"]=encodeProjectPreview(d);
    const auto json=winrt::to_string(root.Stringify());if(json.size()>limits.manifestBytes)throw Error(ErrorKind::Limit,"Encoded manifest exceeds budget");files["manifest.json"]=Bytes(json.begin(),json.end());
    return {std::make_shared<const Bytes>(zipStored(files,limits,recovery?1:0)),id};
  }catch(const winrt::hresult_error& e){throw Error(e.code().value==E_OUTOFMEMORY?ErrorKind::Limit:ErrorKind::Corrupt,"Project JSON encoding failed; HRESULT="+std::to_string(e.code().value)+": "+winrt::to_string(e.message()));}
}
EncodedProject encodeEditableProject(const Document& d,Limits limits){return encodeProject(d,limits,false);}
EncodedProject encodeRecoveryProject(const Document& d,Limits limits){return encodeProject(d,limits,true);}

}
