#include "project_import.h"
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
   rejects([&]{prepareEditableImport(m);},ErrorKind::Unsupported);
   rejects([&]{prepareEditablePalette(m);},ErrorKind::Unsupported);
  }
  for(const auto* mode:{"rgba","grayscale"})for(int linked:{0,1}){
   const auto m=readProjectManifest(load(dir/(std::string("mixed-")+mode+"-"+std::to_string(linked)+".moonsprite")));
   check(m.unsupported.empty()&&m.cels.size()==2,"Mixed format evidence not decoded");
   check(m.layers[0].surface==m.cels[0].surface&&m.cels[0].surface!=m.cels[1].surface,"Raster cache omitted format");
   check(m.cels[0].surface->format==RasterFormat::Rgba&&m.cels[1].surface->format==RasterFormat::Indexed,"Inactive/fallback format lost");
   rejects([&]{prepareEditableImport(m);},ErrorKind::Unsupported);
  }
  for(const auto* failure:{"tag","truncated","missing"})rejects([&]{readProjectManifest(load(dir/(std::string("reject-")+failure+".moonsprite")));},ErrorKind::Corrupt);
  Bytes raw{0,0,0,0,255,255,255,255,0,0,0,128,255,255,255,127};
  check(decodeRaster(raw,"raw",RasterFormat::Indexed,2,2,16)==std::vector<std::uint32_t>({0,0xffffffff,0x80000000,0x7fffffff}),"32-bit IDs reinterpreted as channels");
  rejects([&]{decodeRaster(raw,"raw",RasterFormat::Indexed,2,2,15);},ErrorKind::Limit);
  raw.pop_back();rejects([&]{decodeRaster(raw,"raw",RasterFormat::Indexed,2,2,16);},ErrorKind::Corrupt);
  rejects([&]{decodeRaster({},"raw",RasterFormat(3),1,1,4);},ErrorKind::Unsupported);
  std::cout<<"60 legacy indexed storage/layout, 4 format-cache, 3 corrupt archive and raw ID boundary checks passed\n";
  return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
