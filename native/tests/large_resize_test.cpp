#include "document.h"
#include "project_file.h"
#include "project_import.h"
#include "project_encode.h"
#include "fixtures/large_resize_legacy.h"
#include <fstream>
#include <iostream>
#include <string>
#include <windows.h>
using namespace moon;
namespace {
void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
std::uint32_t hash(const std::vector<Pixel>& pixels){std::uint32_t h=2166136261u;for(auto p:pixels)for(unsigned shift=0;shift<32;shift+=8){h^=(p>>shift)&255;h*=16777619u;}return h;}
Document fixture(const LargeResizeOracle& c){
 timeline::State state;state.layers={{"layer-a",U"Visible"},{"layer-b",U"Hidden locked"}};state.layers[1].visible=false;state.layers[1].locked=true;
 state.frames={{"frame-a",40},{"frame-b",210,true},{"frame-c",75}};state.loopSections={{"loop",U"Loop","frame-a","frame-c","reverse",2}};
 timeline::Surface s;s.width=c.lw;s.height=c.lh;s.offsetX=c.ox;s.offsetY=c.oy;s.storageOriginX=91;s.storageOriginY=-73;s.pixels.resize(std::size_t(c.lw)*c.lh);
 for(int y=0;y<c.lh;++y)for(int x=0;x<c.lw;++x){const unsigned alpha[]{0,1,127,255};s.pixels[std::size_t(y)*c.lw+x]=((x*17+y*3)&255)|(((x*5+y*29)&255)<<8)|(((x*11+y*7)&255)<<16)|(alpha[(x+y)%4]<<24);}
 for(const auto& layer:state.layers){DocumentCel owner;owner.id=layer.id+"-owner";owner.layerId=layer.id;owner.frameId="frame-a";owner.surface=s;owner.opacity=.7;owner.zIndex=3;state.cels.push_back(owner);auto link=owner;link.id=layer.id+"-link";link.frameId="frame-b";link.linkedCelId=owner.id;state.cels.push_back(link);auto shared=owner;shared.id=layer.id+"-shared";shared.frameId="frame-c";shared.runtimeSharedCelId=owner.id;state.cels.push_back(shared);}
 Document seed(1,1);auto doc=Document::fromImported(c.sw,c.sh,std::move(state),seed.palette(),"large-resize-owned",U"Resize oracle",std::make_shared<const std::vector<std::uint8_t>>());doc.clearSourceArchiveForNewSnapshot();return doc;
}
void matches(const Document& doc,const LargeResizeOracle& c,bool reopened=false){
 check(doc.width()==c.tw&&doc.height()==c.th,"Large resized canvas dimensions");
 for(const auto& cel:doc.timeline().state().cels){const auto r=doc.timeline().resolveSurface(cel.id);check(r.surface&&r.surface->width==c.width&&r.surface->height==c.height&&r.surface->offsetX==c.x&&r.surface->offsetY==c.y&&hash(r.surface->pixels)==c.hash,"Actual legacy resized geometry/pixel hash");check(cel.opacity==std::optional<double>{.7}&&cel.zIndex==std::optional<int>{3},"Resize changed Cel metadata");}
 check(doc.timeline().state().layers[1].locked&&!doc.timeline().state().layers[1].visible&&doc.timeline().state().frames[1].disabled&&doc.timeline().state().frames[1].duration==210&&doc.timeline().state().loopSections[0].direction=="reverse","Resize changed layer/frame/loop metadata");
 check(doc.timeline().findCelById("layer-a-link")->linkedCelId==std::optional<std::string>{"layer-a-owner"},"Resize detached linked owner");if(!reopened)check(doc.timeline().findCelById("layer-b-shared")->runtimeSharedCelId==std::optional<std::string>{"layer-b-owner"},"Resize detached transient shared owner");
}
void run(const LargeResizeOracle& c,const std::filesystem::path& root,unsigned n){
 auto doc=std::make_unique<Document>(fixture(c));const auto before=*doc->timeline().resolveSurface("layer-a-owner").surface;const auto h=doc->historySize();const auto identity=doc->identity();
 const bool image=std::string(c.kind)=="nearest"||std::string(c.kind)=="smooth";
 check(image?doc->resizeImage(c.tw,c.th,std::string(c.kind)=="nearest"?ImageInterpolation::Nearest:ImageInterpolation::Smooth):doc->resizeCanvas(c.tw,c.th,CanvasAnchor::Center,c.dx,c.dy,std::string(c.kind)=="trim"),"Large resize rejected");
 matches(*doc,c);check(doc->identity()==identity&&doc->historySize()==h+1&&doc->dirty(),"Large resize single transaction");
 doc->undo();const auto* restored=doc->timeline().resolveSurface("layer-a-owner").surface;check(doc->width()==c.sw&&doc->height()==c.sh&&restored->width==before.width&&restored->height==before.height&&restored->offsetX==before.offsetX&&restored->offsetY==before.offsetY&&restored->pixels==before.pixels&&restored->storageOriginX==before.storageOriginX,"Large resize undo");
 doc->redo();matches(*doc,c);
 const auto path=root/(std::to_string(n)+"-"+c.kind+".moonsprite");project::saveDocumentAtomic(*doc,path);std::ifstream input(path,std::ios::binary);auto bytes=std::make_shared<const project::Bytes>(std::istreambuf_iterator<char>(input),std::istreambuf_iterator<char>());auto reopened=std::make_unique<Document>(project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(bytes))));matches(*reopened,c,true);check(!reopened->dirty()&&!reopened->canUndo(),"Large resize save/reopen baseline");
}
void boundaries(){
 auto doc=std::make_unique<Document>(1025,3);doc->beginStroke({1024,2},0xff2040c0);doc->commitStroke();doc->markSaved();const auto pixels=doc->pixels();const auto history=doc->historySize(),revision=doc->revision();
 for(const auto wh:{std::pair<int,int>{0,1},{1,0},{-1,2},{32769,1},{1,32769},{8192,8193}})for(bool image:{false,true}){bool rejected=false;try{if(image)doc->resizeImage(wh.first,wh.second);else doc->resizeCanvas(wh.first,wh.second);}catch(const std::length_error&){rejected=true;}check(rejected&&doc->width()==1025&&doc->height()==3&&doc->pixels()==pixels&&doc->historySize()==history&&doc->revision()==revision&&!doc->dirty(),"Invalid resize changed live document");}
 bool rejected=false;try{doc->resizeImage(8192,8192);}catch(const std::length_error&){rejected=true;}check(rejected&&doc->width()==1025&&doc->pixels()==pixels&&doc->historySize()==history&&!doc->dirty(),"Resize working-budget failure changed document");
 check(!doc->resizeImage(1025,3)&&doc->historySize()==history,"Same image size must be no-op");
 // Retaining off-canvas storage needs only an offset change, even at maximum canvas area.
 check(doc->resizeCanvas(32768,2048,CanvasAnchor::NorthWest,0,0,false)&&doc->width()==32768&&doc->timeline().resolveSurface(doc->cel().id).surface->width==1025,"Maximum admitted canvas without full-canvas allocation");doc->undo();check(doc->width()==1025&&doc->pixels()==pixels,"Maximum canvas undo");
 doc->commitSelection({},SelectionMask{1024,2,1,1,{1}});const auto selectedHistory=doc->historySize();check(doc->resizeImage(2050,6)&&doc->selection()->x==2048&&doc->selection()->y==4&&doc->selection()->width==2&&doc->selection()->height==2,"Large image selection scaling");doc->undo();check(doc->width()==1025&&doc->selection()->x==1024&&doc->historySize()==selectedHistory+1,"Large image selection undo");doc->redo();
}
}
int wmain(int argc,wchar_t** argv){try{const auto root=std::filesystem::path(argc>1?argv[1]:L"large-resize-test-owned")/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root);unsigned count=0;for(const auto& c:largeResizeOracle){try{run(c,root,++count);}catch(const std::exception& e){throw std::runtime_error("Case "+std::to_string(count)+" "+c.kind+": "+e.what());}}boundaries();std::ofstream(root/"result.txt")<<count<<" actual legacy large resize geometry/pixel cases, links/shared/hidden/disabled metadata, single undo/redo, real native save/reopen and admission/working budgets passed.\n";std::cout<<root.u8string()<<" : "<<count<<" cases passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
