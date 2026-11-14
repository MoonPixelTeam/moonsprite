#include "project_import.h"
#include "palette_layout.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#ifdef GetObject
#undef GetObject
#endif
using namespace moon::project;
namespace {
struct Apartment {
 HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);
 ~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}
};
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
std::shared_ptr<const Bytes> load(const std::filesystem::path& file){std::ifstream in(file,std::ios::binary);if(!in)throw std::runtime_error("Missing indexed fixture");return std::make_shared<const Bytes>(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());}
template<class F>void rejects(F run,ErrorKind kind){try{run();}catch(const Error& e){check(e.kind==kind,"Wrong indexed diagnostic");return;}throw std::runtime_error("Unmigrated or corrupt indexed input admitted");}
}
int wmain(int argc,wchar_t** argv){
 const Apartment apartment;
 try{
  check(argc==2,"Fixture directory required");const std::filesystem::path dir(argv[1]);
  using namespace winrt::Windows::Data::Json;
  const auto json=load(dir/"oracle.json");const auto rows=JsonArray::Parse(winrt::to_hstring(std::string(json->begin(),json->end())));
  check(rows.Size()==60,"Indexed legacy matrix missing");
  for(const auto& item:rows){
   const auto row=item.GetObject();const auto name=winrt::to_string(row.GetNamedString(L"name"));const auto bytes=load(dir/(name+".moonsprite"));const auto m=readProjectManifest(bytes);
   check(m.sourceArchive==bytes&&m.colorMode==winrt::to_string(row.GetNamedString(L"mode")),"Mode/source evidence lost");
   check(m.palette.size()==3&&m.palette[0].id==0&&m.palette[0].color==0&&m.nextColorId==20,"Transparent ID zero lost");
   std::vector<std::optional<int>> slots;for(const auto& id:row.GetNamedArray(L"slots"))slots.push_back(id.ValueType()==JsonValueType::Null?std::nullopt:std::optional<int>(int(id.GetNumber())));
   std::vector<int> order;for(const auto& id:row.GetNamedArray(L"order"))order.push_back(int(id.GetNumber()));
   check(m.paletteSlots==slots&&m.paletteOrder==order&&m.paletteColumns==row.GetNamedNumber(L"columns"),"ID zero and null slots conflated");
   std::vector<std::uint32_t> pixels;for(const auto& p:row.GetNamedArray(L"pixels"))pixels.push_back(std::uint32_t(p.GetNumber()));
   const auto format=row.GetNamedString(L"format")==L"indexed"?RasterFormat::Indexed:RasterFormat::Rgba;
   check(m.layers.size()==1&&m.cels.size()==1&&m.layers[0].surface==m.cels[0].surface,"Shared raster cache changed");
   const auto& s=*m.cels[0].surface;
   check(s.format==format&&s.width==row.GetNamedNumber(L"width")&&s.height==row.GetNamedNumber(L"height")&&s.pixels==pixels,"Raw/sparse indexed IDs changed");
   const auto p=prepareEditablePalette(m);std::vector<int> runtimeSlots;for(const auto& id:slots)runtimeSlots.push_back(id.value_or(moon::EmptyPaletteSlot));
   check(p.slots==runtimeSlots&&p.order==order&&p.entries.front().id==0,"Editable palette lost zero/null identities");
   if(m.colorMode=="indexed")rejects([&]{prepareEditableImport(m);},ErrorKind::Unsupported);
   else {const auto imported=prepareEditableImport(m);check(imported.palette.slots==runtimeSlots,"RGBA/grayscale palette import changed layout");}
  }
  for(const auto* mode:{"rgba","grayscale"})for(int linked:{0,1}){
   const auto m=readProjectManifest(load(dir/(std::string("mixed-")+mode+"-"+std::to_string(linked)+".moonsprite")));
   check(m.unsupported.empty()&&m.cels.size()==2,"Mixed format evidence not decoded");
   check(m.layers[0].surface==m.cels[0].surface&&m.cels[0].surface!=m.cels[1].surface,"Raster cache omitted format");
   check(m.cels[0].surface->format==RasterFormat::Rgba&&m.cels[1].surface->format==RasterFormat::Indexed,"Inactive/fallback format lost");
   rejects([&]{prepareEditableImport(m);},ErrorKind::Unsupported);
  }
  {const auto bytes=load(dir/"remap-indexed-1-0-0.moonsprite");const auto original=*bytes;Limits limited;limited.expandedBytes=5u*130*66*4-1;
   bool rejected=false;try{readProjectManifest(bytes,limited);}catch(const Error& e){check(e.kind==ErrorKind::Limit&&std::string(e.what())=="Indexed remap exceeds decoded pixel budget","Remap budget failed outside pixel allocation");rejected=true;}
   check(rejected&&*bytes==original,"Remap budget admitted extra copy or mutated archive");
   check(readProjectManifest(bytes).cels.size()==4,"Budget failure poisoned later indexed read");}
  const auto remapJson=load(dir/"remap-oracle.json");const auto remapRows=JsonArray::Parse(winrt::to_hstring(std::string(remapJson->begin(),remapJson->end())));
  check(remapRows.Size()==48,"Hidden-ID legacy matrix missing");
  for(const auto& item:remapRows){
   const auto row=item.GetObject();const auto bytes=load(dir/(winrt::to_string(row.GetNamedString(L"name"))+".moonsprite"));const auto original=*bytes;const auto m=readProjectManifest(bytes);
   const auto words=[](const JsonArray& values){std::vector<std::uint32_t> result;for(const auto& value:values)result.push_back(std::uint32_t(value.GetNumber()));return result;};
   check(m.layers[0].surface->pixels==words(row.GetNamedArray(L"layer")),"Hidden-ID displayed layer differs from legacy");
   const auto expected=row.GetNamedArray(L"cels");check(expected.Size()==m.cels.size(),"Hidden-ID Cel count changed");
   for(unsigned i=0;i<expected.Size();++i){const auto cel=expected.GetObjectAt(i);check(m.cels[i].id==winrt::to_string(cel.GetNamedString(L"id"))&&m.cels[i].surface->pixels==words(cel.GetNamedArray(L"pixels")),"Hidden-ID Cel or linked fallback differs from legacy");check((m.cels[i].surface->format==RasterFormat::Indexed)==(cel.GetNamedString(L"format")==L"indexed"),"Remap changed raster format");}
   check(m.layers[0].surface==m.cels[0].surface&&m.cels[0].surface==m.cels[1].surface,"Remap detached shared resource");
   check(m.cels[0].surface!=m.cels[2].surface,"Remap merged independent equal resources");
   std::vector<int> order;for(const auto& id:row.GetNamedArray(L"order"))order.push_back(int(id.GetNumber()));
   std::vector<std::optional<int>> slots;for(const auto& id:row.GetNamedArray(L"slots"))slots.push_back(id.ValueType()==JsonValueType::Null?std::nullopt:std::optional<int>(int(id.GetNumber())));
   check(m.paletteOrder==order&&m.paletteSlots==slots&&*bytes==original&&m.sourceArchive==bytes,"Remap changed palette or source archive");
   rejects([&]{prepareEditableImport(m);},ErrorKind::Unsupported);
  }
  const auto projectionJson=load(dir/"projection-oracle.json");const auto projections=JsonArray::Parse(winrt::to_hstring(std::string(projectionJson->begin(),projectionJson->end())));
  check(projections.Size()==78,"Indexed projection legacy matrix missing");
  const auto compareSurface=[](const std::shared_ptr<const ManifestRaster>& actual,const IJsonValue& expected){
   if(expected.ValueType()==JsonValueType::Null){check(!actual,"Projection fabricated absent Cel storage");return;}
   check(bool(actual),"Projection discarded Cel storage");const auto e=expected.GetObject();
   check(actual->width==e.GetNamedNumber(L"width")&&actual->height==e.GetNamedNumber(L"height")&&actual->offsetX==e.GetNamedNumber(L"x")&&actual->offsetY==e.GetNamedNumber(L"y"),"Projected surface geometry differs from legacy");
   check((actual->format==RasterFormat::Indexed)==(e.GetNamedString(L"format")==L"indexed"),"Projected surface format differs from legacy");
   const auto pixels=e.GetNamedArray(L"pixels");check(actual->pixels.size()==pixels.Size(),"Projected storage length differs from legacy");
   for(unsigned i=0;i<pixels.Size();++i)check(actual->pixels[i]==std::uint32_t(pixels.GetNumberAt(i)),"Projected resource pixels differ from legacy");
  };
  for(const auto& item:projections){const auto row=item.GetObject();const auto bytes=load(dir/(winrt::to_string(row.GetNamedString(L"name"))+".moonsprite"));const auto original=*bytes;
   const auto m=readProjectManifest(bytes);compareSurface(m.layers[0].surface,row.GetNamedValue(L"layer"));check(m.layers[0].opacity==row.GetNamedNumber(L"opacity"),"Projected root opacity differs from legacy");
   const auto cels=row.GetNamedArray(L"cels");check(cels.Size()==m.cels.size(),"Projection materialized sparse Cel slots");
   for(unsigned i=0;i<cels.Size();++i){const auto e=cels.GetObjectAt(i);check(m.cels[i].id==winrt::to_string(e.GetNamedString(L"id"))&&m.cels[i].linkedCelId==winrt::to_string(e.GetNamedString(L"link")),"Read-only projection changed serialized Cel links");compareSurface(m.cels[i].surface,e.GetNamedValue(L"surface"));}
   const auto sets=row.GetNamedArray(L"tilesets");check(sets.Size()==m.tilesets.size(),"Projection changed tile resource count");
   for(unsigned i=0;i<sets.Size();++i){const auto data=sets.GetArrayAt(i);check(m.tilesets[i].pixels.size()*4==data.Size(),"Projection changed tile resource size");for(unsigned j=0;j<data.Size();++j)check(((m.tilesets[i].pixels[j/4]>>(8*(j%4)))&255)==data.GetNumberAt(j),"Projection quantized authoritative RGBA tile resource");}
   check(m.sourceArchive==bytes&&*bytes==original,"Projection modified source archive");rejects([&]{prepareEditableImport(m);},ErrorKind::Unsupported);
  }
  for(const auto* kind:{"raster","tilemap","free-tile"}){
   const auto bytes=load(dir/(std::string("projection-")+kind+"-0-budget.moonsprite"));const auto original=*bytes;Limits limits;
   limits.expandedBytes=5u*130*66*4+(std::string(kind)=="raster"?0:16)-1;
   bool rejected=false;try{readProjectManifest(bytes,limits);}catch(const Error& e){
    const auto expected=std::string(kind)=="raster"?"Indexed empty frame exceeds decoded pixel budget":"Indexed tile reconstruction exceeds decoded pixel budget";
    check(e.kind==ErrorKind::Limit&&e.what()==std::string(expected),"Projection allocation escaped decoded byte budget");rejected=true;
   }
   check(rejected&&*bytes==original,"Projection budget failure changed archive or admitted allocation");
   check(readProjectManifest(bytes).cels.size()==3,"Projection budget rejection poisoned later read");
  }
  for(const auto* failure:{"tag","truncated","missing"})rejects([&]{readProjectManifest(load(dir/(std::string("reject-")+failure+".moonsprite")));},ErrorKind::Corrupt);
  Bytes raw{0,0,0,0,255,255,255,255,0,0,0,128,255,255,255,127};
  check(decodeRaster(raw,"raw",RasterFormat::Indexed,2,2,16)==std::vector<std::uint32_t>({0,0xffffffff,0x80000000,0x7fffffff}),"32-bit IDs reinterpreted as channels");
  rejects([&]{decodeRaster(raw,"raw",RasterFormat::Indexed,2,2,15);},ErrorKind::Limit);
  raw.pop_back();rejects([&]{decodeRaster(raw,"raw",RasterFormat::Indexed,2,2,16);},ErrorKind::Corrupt);
  rejects([&]{decodeRaster({},"raw",RasterFormat(3),1,1,4);},ErrorKind::Unsupported);
  std::cout<<"60 legacy indexed storage/layout, 48 hidden-ID remap, 78 active-frame/tile reconstruction, 4 format-cache, 3 corrupt archive and raw ID/budget boundary checks passed\n";
  return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
