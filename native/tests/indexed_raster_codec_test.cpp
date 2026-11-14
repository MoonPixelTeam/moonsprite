#define NOMINMAX
#include "document.h"
#include "project_raster_encode.h"
#include "project_encode.h"
#include "project_import.h"
#include "project_preview.h"
#include "local_history_raster_cost.h"
#include "local_history_diff.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <filesystem>
#include <fstream>
#include <iostream>
#include <algorithm>
#include <zlib.h>
using namespace moon;
using namespace moon::project;
using namespace moon::local_history;
using namespace winrt::Windows::Data::Json;
namespace {
std::string context;
void check(bool v,const std::string& message){if(!v)throw std::runtime_error(context+": "+message);}
Bytes hex(const winrt::hstring& text){const auto s=winrt::to_string(text);check(s.size()%2==0,"hex size");Bytes b;for(std::size_t i=0;i<s.size();i+=2)b.push_back(std::uint8_t(std::stoul(s.substr(i,2),nullptr,16)));return b;}
std::shared_ptr<const Bytes> load(const std::filesystem::path& file){std::ifstream in(file,std::ios::binary);check(bool(in),"missing fixture");return std::make_shared<const Bytes>(std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>());}
std::vector<Pixel> words(const JsonArray& values){std::vector<Pixel> out;for(const auto& v:values)out.push_back(Pixel(v.GetNumber()));return out;}
std::size_t property(const HistoryCompareDocument& graph,std::size_t owner,const std::string& name){for(const auto& p:graph.values.at(owner).properties)if(p.first==name)return p.second;throw std::runtime_error(context+": missing property "+name);}
template<class F>void rejects(F run){bool failed=false;try{run();}catch(const std::exception&){failed=true;}check(failed,"invalid input accepted");}
Bytes previewPixels(const Bytes& png,int width,int height){
 check(png.size()>=57&&std::equal(png.begin(),png.begin()+8,Bytes{137,80,78,71,13,10,26,10}.begin()),"preview PNG signature");
 std::size_t offset=8;Bytes compressed;
 while(offset+12<=png.size()){
  const auto size=(std::uint32_t(png[offset])<<24)|(std::uint32_t(png[offset+1])<<16)|(std::uint32_t(png[offset+2])<<8)|png[offset+3];
  check(size<=png.size()-offset-12,"preview chunk bounds");const auto* type=reinterpret_cast<const char*>(png.data()+offset+4);
  if(std::string(type,4)=="IDAT")compressed.insert(compressed.end(),png.begin()+offset+8,png.begin()+offset+8+size);
  offset+=12+size;
 }
 Bytes pixels(std::size_t(height)*(1+std::size_t(width)*4));uLongf size=pixels.size();check(uncompress(pixels.data(),&size,compressed.data(),uLong(compressed.size()))==Z_OK&&size==pixels.size(),"preview PNG inflate");
 for(int y=0;y<height;++y)check(pixels[std::size_t(y)*(1+width*4)]==0,"preview row filter");return pixels;
}
void codec(const JsonArray& rows){
 check(rows.Size()==140,"codec coverage");
 for(const auto& value:rows){const auto row=value.GetObject();const auto format=row.GetNamedString(L"format")==L"indexed"?RasterFormat::Indexed:RasterFormat::Rgba;const auto w=unsigned(row.GetNamedNumber(L"width")),h=unsigned(row.GetNamedNumber(L"height"));context="codec "+std::to_string(w)+"x"+std::to_string(h)+" "+winrt::to_string(row.GetNamedString(L"format"));
  const auto pixels=words(row.GetNamedArray(L"words"));const auto before=pixels;const auto encoded=encodeRaster(pixels.data(),pixels.size(),format,w,h);check(encoded.encoding==winrt::to_string(row.GetNamedString(L"encoding"))&&encoded.data==hex(row.GetNamedString(L"hex")),"legacy encoded bytes");check(pixels==before,"encoder changed source");
  check(decodeRaster(encoded.data,encoded.encoding,format,w,h,Limits{}.expandedBytes)==pixels,"exact decode");
  const auto empty=encodeEmptyRuntimeRaster(format,w,h);check(empty.encoding=="sparse-tiles-v1"&&empty.data==hex(row.GetNamedString(L"emptyHex")),"empty runtime bytes");check(decodeRaster(empty.data,empty.encoding,format,w,h,Limits{}.expandedBytes)==std::vector<Pixel>(pixels.size()),"empty decode");
  if(encoded.encoding!="raw"){auto bad=encoded.data;bad[6]=format==RasterFormat::Indexed?1:2;rejects([&]{decodeRaster(bad,encoded.encoding,format,w,h,Limits{}.expandedBytes);});bad=encoded.data;bad.pop_back();rejects([&]{decodeRaster(bad,encoded.encoding,format,w,h,Limits{}.expandedBytes);});}
 }
 context="encoder guards";const Pixel pixel=1;rejects([&]{encodeRaster(&pixel,1,RasterFormat::Indexed,0,1);});rejects([&]{encodeRaster(&pixel,1,RasterFormat::Indexed,2,1);});rejects([&]{encodeRaster(nullptr,1,RasterFormat::Indexed,1,1);});rejects([&]{encodeRaster(&pixel,1,RasterFormat(99),1,1);});rejects([&]{encodeRaster(&pixel,1,RasterFormat::Indexed,1,1,3);});rejects([&]{encodeRaster(&pixel,1,RasterFormat::Indexed,0xffffffffu,0xffffffffu);});
}
void storage(const std::filesystem::path& directory,const JsonArray& rows){
 check(rows.Size()==74,"storage coverage");
 for(const auto& value:rows){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"file"));const auto bytes=load(directory/context);const auto m=readProjectManifest(bytes);DecodedHistoryRasterStorage plan(m,true);
  std::vector<const ManifestRaster*> surfaces;for(const auto& layer:m.layers)surfaces.push_back(layer.surface.get());for(const auto& cel:m.cels)if(cel.surface)surfaces.push_back(cel.surface.get());
  HistoryCompareDocument graph;const auto roots=plan.appendComparison(graph,surfaces);const auto expected=row.GetNamedArray(L"surfaces");check(roots.size()==expected.Size(),"surface count");
  for(std::size_t i=0;i<roots.size();++i){const auto e=expected.GetObjectAt(unsigned(i));const auto& pixels=graph.values.at(roots[i].pixels).view;check(pixels.type==winrt::to_string(e.GetNamedString(L"pixelType"))&&*pixels.buffer==hex(e.GetNamedString(L"pixelHex")),"typed pixels");
   const auto runtime=e.GetNamedValue(L"runtime");check(bool(roots[i].runtimeRaster)==(runtime.ValueType()!=JsonValueType::Null),"runtime presence");if(!roots[i].runtimeRaster)continue;
   const auto r=runtime.GetObject();const auto owner=*roots[i].runtimeRaster;check(graph.values[property(graph,owner,"format")].text==(r.GetNamedString(L"format")==L"indexed"?u"indexed":u"rgba"),"runtime format");
   for(const auto* key:{"width","height","tileSize"})check(graph.values[property(graph,owner,key)].number==r.GetNamedNumber(winrt::to_hstring(key)),"runtime geometry");
   for(const auto* key:{"data","tileOffsets"}){const auto& view=graph.values[property(graph,owner,key)].view;check(*view.buffer==hex(r.GetNamedString(winrt::to_hstring(key))),"runtime bytes");check(view.type==(std::string(key)=="data"?"Uint8Array":"Int32Array"),"runtime view type");}
   const auto bounds=r.GetNamedValue(L"visibleBounds");const auto id=property(graph,owner,"visibleBounds");check((graph.values[id].kind==HistoryCompareValue::Kind::Null)==(bounds.ValueType()==JsonValueType::Null),"runtime bounds presence");if(bounds.ValueType()!=JsonValueType::Null)for(const auto* key:{"x","y","width","height"})check(graph.values[property(graph,id,key)].number==bounds.GetObject().GetNamedNumber(winrt::to_hstring(key)),"runtime bounds");
  }
  const auto samePixels=row.GetNamedArray(L"samePixels"),sameRuntime=row.GetNamedArray(L"sameRuntime");for(std::size_t i=0;i<roots.size();++i)for(std::size_t j=0;j<roots.size();++j){const auto at=unsigned(i*roots.size()+j);check((roots[i].pixels==roots[j].pixels)==samePixels.GetBooleanAt(at),"pixel aliases");check((roots[i].runtimeRaster&&roots[i].runtimeRaster==roots[j].runtimeRaster)==sameRuntime.GetBooleanAt(at),"runtime aliases");}
  HistoryCostGraph costGraph;HistoryCostBuilder b(costGraph);const auto root=b.object(),layers=b.object(),rasters=b.object();b.add(root,layers);b.add(root,rasters);for(const auto* surface:surfaces){const auto owner=b.object();const auto r=plan.append(b,*surface);b.add(owner,r.pixels);if(r.runtimeRaster)b.add(owner,*r.runtimeRaster);b.add(rasters,owner);}const auto cost=historyTransferGraphBytes(costGraph,root);check(cost==row.GetNamedNumber(L"cost"),"legacy storage cost expected "+std::to_string(row.GetNamedNumber(L"cost"))+" got "+std::to_string(cost));
  const auto mark=b.mark();auto invalid=*surfaces.front();invalid.width++;rejects([&]{plan.append(b,invalid);});check(costGraph.size()==mark.nodes&&historyTransferGraphBytes(costGraph,root)==cost,"cost append rollback");
  const auto count=graph.values.size();auto requests=surfaces;requests.push_back(&invalid);rejects([&]{plan.appendComparison(graph,requests);});check(graph.values.size()==count,"comparison append rollback");
 }
}
}
// Deliberately bypass production indexed admission to exercise the codec only.
// UI/import/new/conversion gates remain closed until editing transactions port.
namespace moon {struct RasterHistoryFixture {
 static void source(Document& d,const ReadManifest& m){d.projectId_=m.id;d.sourceArchive_=m.sourceArchive;}
 static void wrongFormat(Document& d){auto state=d.timeline_.state();state.cels.front().surface->format=timeline::RasterFormat::Rgba;d.timeline_=timeline::Timeline(std::move(state));}
 static void preview(Document& d,bool offset){
  indexed(d,false,false);auto state=d.timeline_.state();auto& s=*state.cels.front().surface;
  s.width=2;s.height=1;s.offsetX=offset?1:0;s.offsetY=0;s.pixels={7,19};d.timeline_=timeline::Timeline(std::move(state));
 }
 static void indexed(Document& d,bool sparse,bool absent){
  auto state=d.timeline_.state();auto& s=*state.cels.front().surface;s.width=sparse?130:2;s.height=sparse?66:3;s.offsetX=-1;s.offsetY=1;s.format=timeline::RasterFormat::Indexed;s.pixels.assign(std::size_t(s.width)*s.height,0);s.pixels.back()=19;s.pixels[s.pixels.size()-2]=7;
  d.colorMode_=color_mode::Mode::Indexed;d.palette_.entries={{0,U"clear",0},{7,U"ink",0xff604020},{19,U"half",0x80645a50}};d.palette_.slots={0,7,19};d.palette_.columns=3;d.palette_.nextId=20;d.palette_.independentOrder.reset();
  if(absent)state.cels.erase(std::remove_if(state.cels.begin(),state.cels.end(),[&](const auto& c){return c.frameId==d.activeFrameId_;}),state.cels.end());d.timeline_=timeline::Timeline(std::move(state));
 }
};}
namespace {
void production(){
 for(bool offset:{false,true}){context=offset?"composed indexed preview":"direct indexed preview";auto d=std::make_unique<Document>(offset?3:2,1);RasterHistoryFixture::preview(*d,offset);const auto scan=previewPixels(encodeProjectPreview(*d),offset?3:2,1);const auto start=1+(offset?4:0);check(std::vector<std::uint8_t>(scan.begin()+start,scan.begin()+start+8)==std::vector<std::uint8_t>({32,64,96,255,80,90,100,128}),"indexed preview did not resolve palette colors");if(offset)check(std::all_of(scan.begin()+1,scan.begin()+5,[](auto p){return p==0;}),"offset preview background");}
 for(bool sparse:{false,true})for(bool absent:{false,true}){context="production "+std::to_string(sparse)+" "+std::to_string(absent);auto document=std::make_unique<Document>(8,8);auto& d=*document;d.beginStroke({0,0},0xff604020);d.commitStroke();d.addLinkedFrame(true);check(d.cel().linkedCelId.has_value(),"fixture real link");RasterHistoryFixture::indexed(d,sparse,absent);const auto history=d.historySize(),revision=d.revision();const auto frame=d.frame().id,layer=d.layer().id;const auto pixels=d.timeline().resolveSurface(d.timeline().state().cels.front().id).surface->pixels;context="production "+std::to_string(sparse)+" "+std::to_string(absent);
  for(int kind=0;kind<3;++kind){const auto out=kind==0?encodeEditableProject(d):kind==1?encodeRecoveryProject(d):encodeHistoryProject(d);const auto m=readProjectManifest(out.bytes);Archive zip(out.bytes);check(m.colorMode=="indexed"&&m.activeFrameId==frame&&m.activeLayerId==layer&&m.cels.size()==d.timeline().state().cels.size(),"document identities");check((zip.entries().count("preview.png")!=0)==(kind==0),"preview policy");check(zip.entries().at("manifest.json").method==(kind?8:0),"compression policy");
   for(const auto& c:m.cels){check(c.surface&&c.surface->format==RasterFormat::Indexed&&c.surface->dataFile.find(".idx32")!=std::string::npos,"cel format/path");const auto data=zip.read(c.surface->dataFile,Limits{}.expandedBytes);check(decodeRaster(data,c.surface->dataEncoding,RasterFormat::Indexed,c.surface->width,c.surface->height,Limits{}.expandedBytes)==pixels,"raw IDs changed");check(c.surface->dataEncoding==(sparse?"sparse-tiles-v1":"raw"),"raw/sparse choice");if(sparse)check(data[6]==2,"indexed sparse header");}
   check(m.layers.front().surface->format==RasterFormat::Indexed,"layer format");if(absent){const auto& s=*m.layers.front().surface;check(std::all_of(s.pixels.begin(),s.pixels.end(),[](auto p){return p==0;}),"absent frame display");const auto data=zip.read(s.dataFile,100);check(data.size()==24&&data[6]==2,"absent runtime header");}
   if(!absent){auto decoded=std::make_unique<Document>(d);RasterHistoryFixture::source(*decoded,m);HistoryCompareDocument graph;const auto roots=appendDecodedHistoryRasterValues(graph,*decoded,m);const auto layerRoot=property(graph,roots.layers,"0"),celRoot=property(graph,roots.cels,"0"),surfaceRoot=property(graph,celRoot,"surface");for(auto root:{layerRoot,surfaceRoot})check(graph.values[property(graph,root,"format")].text==u"indexed"&&graph.values[property(graph,root,"pixels")].view.type=="Uint32Array","decoded comparison format");RasterHistoryFixture::wrongFormat(*decoded);HistoryCompareDocument rejected;rejects([&]{appendDecodedHistoryRasterValues(rejected,*decoded,m);});check(rejected.values.empty()&&rejected.layers.empty()&&!rejected.activeFrameId,"decoded format rejection rollback");}
   bool gated=false;try{prepareEditableImport(m);}catch(const Error& e){gated=e.kind==ErrorKind::Unsupported;}check(gated,"production indexed admission accidentally opened");
  }
  check(d.historySize()==history&&d.revision()==revision&&d.frame().id==frame&&d.layer().id==layer&&d.timeline().resolveSurface(d.timeline().state().cels.front().id).surface->pixels==pixels,"encoding changed document");
 }
}
}
int run(int argc,wchar_t** argv){check(argc==2,"fixture directory required");const std::filesystem::path dir(argv[1]);const auto bytes=load(dir/"oracle.json");const auto oracle=JsonObject::Parse(winrt::to_hstring(std::string(bytes->begin(),bytes->end())));codec(oracle.GetNamedArray(L"codecs"));storage(dir,oracle.GetNamedArray(L"histories"));production();std::cout<<"140 legacy encodings, 74 history storage cases, 12 project encodings and indexed previews passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{check(SUCCEEDED(hr)||hr==RPC_E_CHANGED_MODE,"JSON apartment");const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<context<<": "<<e.what()<<'\n';if(SUCCEEDED(hr))RoUninitialize();return 1;}}
