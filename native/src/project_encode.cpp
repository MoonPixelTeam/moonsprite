#include "project_encode.h"
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
EncodedRaster raster(const Document& d,const std::vector<Pixel>& pixels){
  const auto w=d.width(),h=d.height();
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
  if(d.width()<1||d.height()<1||d.width()>1024||d.height()>1024||d.pixels().size()!=std::size_t(d.width())*d.height())throw Error(ErrorKind::Unsupported,"Unsupported document raster dimensions");
  if(d.pixels().size()>limits.expandedBytes/4)throw Error(ErrorKind::Limit,"Document exceeds encode pixel budget");
  const auto& c=*d.timeline().resolveSurface(d.cel().id).source;const auto& l=d.layer();const auto& f=d.frame();
  if(!c.surface||c.zIndex||c.surface->offsetX||c.surface->offsetY||c.surface->width!=d.width()||c.surface->height!=d.height()||(c.opacity&&*c.opacity!=1)||f.disabled)throw Error(ErrorKind::Unsupported,"Unsupported editable document structure");
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
      text(layer,L"blendMode","normal");layer.Insert(L"groupId",JsonValue::CreateNullValue());number(doc,L"paletteColumns",8);
    }
    const auto id=d.projectId().empty()?newId(d.identity()):d.projectId();text(doc,L"id",id);text(doc,L"name",utf8(d.name()));number(doc,L"width",d.width());number(doc,L"height",d.height());text(doc,L"updatedAt",now());text(doc,L"activeLayerId",l.id);text(animation,L"activeFrameId",f.id);
      JsonArray sections;for(const auto& section:d.timeline().state().loopSections){JsonObject o;text(o,L"id",section.id);text(o,L"name",utf8(section.name));text(o,L"startFrameId",section.startFrameId);text(o,L"endFrameId",section.endFrameId);text(o,L"direction",section.direction);o.Insert(L"repeatCount",section.repeatCount?JsonValue::CreateNumberValue(*section.repeatCount):JsonValue::CreateNullValue());sections.Append(o);}animation.Insert(L"loopSections",sections);
    JsonArray savedLayers,savedCels,savedFrames;
    boolean(animation,L"loop",d.animationLoop());
    for(const auto& current:d.timeline().state().frames){JsonObject out; text(out,L"id",current.id);number(out,L"duration",current.duration);savedFrames.Append(out);}
    for(auto it=d.timeline().state().layers.rbegin();it!=d.timeline().state().layers.rend();++it) {
      const auto& item=*it;JsonObject outLayer;
      if(source)for(const auto& old:doc.GetNamedArray(L"layers")){const auto o=old.GetObject();if(winrt::to_string(o.GetNamedString(L"id"))==item.id){outLayer=o;break;}}
      text(outLayer,L"id",item.id);text(outLayer,L"name",utf8(item.name));text(outLayer,L"blendMode","normal");outLayer.Insert(L"groupId",JsonValue::CreateNullValue());boolean(outLayer,L"visible",item.visible);boolean(outLayer,L"locked",item.locked);number(outLayer,L"opacity",item.opacity);if(item.autoLinkAnimationCels)boolean(outLayer,L"autoLinkAnimationCels",true);
      for(const auto& current:d.timeline().state().frames) {
        const auto* slot=d.timeline().findCel(item.id,current.id);const auto resolution=slot?d.timeline().resolveSurface(slot->id):timeline::Resolution{};const auto* owned=resolution.source;
        if(!owned || !owned->surface || owned->zIndex || (owned->opacity && *owned->opacity!=1) || owned->surface->offsetX || owned->surface->offsetY || owned->surface->width!=d.width() || owned->surface->height!=d.height() || current.disabled)throw Error(ErrorKind::Unsupported,"Unsupported frame raster");
        JsonObject outCel;if(source)for(const auto& old:animation.GetNamedArray(L"cels")){const auto o=old.GetObject();if(winrt::to_string(o.GetNamedString(L"id"))==slot->id){outCel=o;break;}}
        text(outCel,L"id",slot->id);text(outCel,L"layerId",item.id);text(outCel,L"frameId",current.id);text(outCel,L"format","rgba");number(outCel,L"opacity",1);
        if(slot->linkedCelId)text(outCel,L"linkedCelId",*slot->linkedCelId);else outCel.Remove(L"linkedCelId");
        const auto encoded=raster(d,owned->surface->pixels);const auto file="cels/"+slot->id+".rgba"+(encoded.encoding=="raw"?"":".tiles");
        number(outCel,L"width",d.width());number(outCel,L"height",d.height());number(outCel,L"offsetX",0);number(outCel,L"offsetY",0);text(outCel,L"dataFile",file);text(outCel,L"dataEncoding",encoded.encoding);files[file]=encoded.data;savedCels.Append(outCel);
        if(current.id==f.id)for(const auto key:{L"width",L"height",L"offsetX",L"offsetY",L"dataFile",L"dataEncoding"})outLayer.Insert(key,outCel.GetNamedValue(key));
      }
      savedLayers.Append(outLayer);
    }
    doc.Insert(L"layers",savedLayers);animation.Insert(L"cels",savedCels);animation.Insert(L"frames",savedFrames);
    JsonObject display;if(doc.HasKey(L"displaySettings"))display=doc.GetNamedObject(L"displaySettings");JsonObject center;number(center,L"x",d.symmetryCenter().x);number(center,L"y",d.symmetryCenter().y);display.Insert(L"symmetryCenter",center);doc.Insert(L"displaySettings",display);
    JsonArray brushes;
    for(const auto& resource:d.projectBrushes()){
      JsonObject item;if(source&&doc.HasKey(L"customBrushes"))for(const auto& old:doc.GetNamedArray(L"customBrushes")){auto object=old.GetObject();if(winrt::to_string(object.GetNamedString(L"id"))==resource.metadata.id){item=object;break;}}
      const auto& metadata=resource.metadata;text(item,L"id",metadata.id);text(item,L"name",metadata.name);number(item,L"width",resource.brush.width);number(item,L"height",resource.brush.height);text(item,L"dataFile",metadata.dataFile);
      if(!metadata.colorsFile.empty())text(item,L"colorsFile",metadata.colorsFile);if(metadata.sourceX)number(item,L"sourceX",*metadata.sourceX);if(metadata.sourceY)number(item,L"sourceY",*metadata.sourceY);
      for(const auto& entry:encodeProjectBrushResource(resource))files[entry.first]=entry.second;brushes.Append(item);
    }
    doc.Insert(L"customBrushes",brushes);
    // Remove only archive payloads belonging to explicitly deleted brush resources,
    // preserving shared raster/live brush resources and all unrelated original files.
    if(source){std::set<std::string> retained;for(const auto& resource:d.projectBrushes()){retained.insert(resource.metadata.dataFile);retained.insert(resource.metadata.colorsFile);}for(const auto& layer:source->layers)if(layer.surface)retained.insert(layer.surface->dataFile);for(const auto& cel:source->cels)if(cel.surface)retained.insert(cel.surface->dataFile);for(const auto& resource:source->customBrushes)if(std::none_of(d.projectBrushes().begin(),d.projectBrushes().end(),[&](const auto& current){return current.metadata.id==resource.metadata.id;})){if(!retained.count(resource.metadata.dataFile))files.erase(resource.metadata.dataFile);if(!retained.count(resource.metadata.colorsFile))files.erase(resource.metadata.colorsFile);}}
    JsonArray palette,order,slots;std::set<int> ids,visible;
    for(const auto& entry:d.palette().entries){if(entry.id<1||!ids.insert(entry.id).second||entry.id>=d.palette().nextId)throw Error(ErrorKind::Corrupt,"Invalid save palette ID");JsonObject item,color;
      // Preserve original palette-entry metadata where present.
      if(source)for(const auto& old:doc.GetNamedArray(L"palette")){const auto o=old.GetObject();if(o.GetNamedNumber(L"id")==entry.id){item=o;break;}}
      number(item,L"id",entry.id);text(item,L"name",utf8(entry.name));int shift=0;for(const auto key:{L"r",L"g",L"b",L"a"}){number(color,key,(entry.color>>shift)&255);shift+=8;}item.Insert(L"color",color);palette.Append(item);
    }
    for(const auto slot:d.palette().slots){if(slot==0){slots.Append(JsonValue::CreateNullValue());continue;}if(!ids.count(slot)||!visible.insert(slot).second)throw Error(ErrorKind::Corrupt,"Invalid save palette slot");slots.Append(JsonValue::CreateNumberValue(slot));order.Append(JsonValue::CreateNumberValue(slot));}
    doc.Insert(L"palette",palette);doc.Insert(L"paletteOrder",order);doc.Insert(L"paletteSlots",slots);number(doc,L"nextColorId",d.palette().nextId);
    if(!recovery) files["preview.png"]=encodeProjectPreview(d);
    const auto json=winrt::to_string(root.Stringify());if(json.size()>limits.manifestBytes)throw Error(ErrorKind::Limit,"Encoded manifest exceeds budget");files["manifest.json"]=Bytes(json.begin(),json.end());
    return {std::make_shared<const Bytes>(zipStored(files,limits,recovery?1:0)),id};
  }catch(const winrt::hresult_error& e){throw Error(e.code().value==E_OUTOFMEMORY?ErrorKind::Limit:ErrorKind::Corrupt,"Project JSON encoding failed; HRESULT="+std::to_string(e.code().value)+": "+winrt::to_string(e.message()));}
}
EncodedProject encodeEditableProject(const Document& d,Limits limits){return encodeProject(d,limits,false);}
EncodedProject encodeRecoveryProject(const Document& d,Limits limits){return encodeProject(d,limits,true);}

}
