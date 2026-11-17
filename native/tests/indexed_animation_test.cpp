#define NOMINMAX
#include "document.h"
#include "raster_color_context.h"
#include "project_encode.h"
#include "project_import.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
using namespace moon;
using namespace winrt::Windows::Data::Json;
namespace {
std::string context;
void check(bool value,const std::string& why){if(!value)throw std::runtime_error(context+": "+why);}
std::vector<Pixel> words(const JsonArray& a){std::vector<Pixel> out;for(const auto& v:a)out.push_back(Pixel(v.GetNumber()));return out;}
void sameWords(const std::vector<Pixel>& actual,const std::vector<Pixel>& expected,const std::string& why){check(actual.size()==expected.size(),why+" size");for(std::size_t i=0;i<actual.size();++i)if(actual[i]!=expected[i])throw std::runtime_error(context+": "+why+" pixel "+std::to_string(i)+" expected "+std::to_string(expected[i])+" actual "+std::to_string(actual[i]));}
SelectionMask selection(const JsonObject& v){SelectionMask s{int(v.GetNamedNumber(L"x")),int(v.GetNamedNumber(L"y")),int(v.GetNamedNumber(L"width")),int(v.GetNamedNumber(L"height")),{}};if(v.HasKey(L"mask")&&v.GetNamedValue(L"mask").ValueType()==JsonValueType::Array)for(auto p:words(v.GetNamedArray(L"mask")))s.mask.push_back(std::uint8_t(p));return s;}

color_mode::Mode mode(const winrt::hstring& s){return s==L"indexed"?color_mode::Mode::Indexed:s==L"grayscale"?color_mode::Mode::Grayscale:color_mode::Mode::Rgba;}
void surface(const timeline::Surface& s,const JsonObject& e,const std::string& label,bool origin=false){
 check(s.width==int(e.GetNamedNumber(L"width"))&&s.height==int(e.GetNamedNumber(L"height"))&&s.offsetX==int(e.GetNamedNumber(L"x"))&&s.offsetY==int(e.GetNamedNumber(L"y")),label+" geometry");
 if(e.HasKey(L"format"))check(s.format==(e.GetNamedString(L"format")==L"indexed"?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba),label+" format");
 if(origin)check(s.storageOriginX.value_or(0)==int(e.GetNamedNumber(L"originX"))&&s.storageOriginY.value_or(0)==int(e.GetNamedNumber(L"originY")),label+" storage origin");
 sameWords(s.pixels,words(e.GetNamedArray(L"pixels")),label);
}
void encoded(const Document& d){
 if(d.colorMode()!=color_mode::Mode::Indexed)return;
 for(int kind=0;kind<3;++kind){const auto out=kind==0?project::encodeEditableProject(d):kind==1?project::encodeRecoveryProject(d):project::encodeHistoryProject(d);const auto manifest=project::readProjectManifest(out.bytes);project::Archive zip(out.bytes);check(manifest.colorMode=="indexed","encoded color mode");
  for(const auto& c:manifest.cels){const auto* runtime=d.timeline().resolveSurface(c.id).surface;check(runtime&&c.surface&&c.surface->format==project::RasterFormat::Indexed,"encoded Cel format");const auto& s=*c.surface;check(s.width==runtime->width&&s.height==runtime->height&&s.offsetX==runtime->offsetX&&s.offsetY==runtime->offsetY,"encoded Cel geometry");sameWords(project::decodeRaster(zip.read(s.dataFile,project::Limits{}.expandedBytes),s.dataEncoding,s.format,s.width,s.height,project::Limits{}.expandedBytes),runtime->pixels,"encoded raw IDs");}
  bool gated=false;try{project::prepareEditableImport(manifest);}catch(const project::Error& e){gated=e.kind==project::ErrorKind::Unsupported;}check(gated,"indexed editable admission opened");
 }
}
}
namespace moon {struct RasterHistoryFixture {
 static void frameLinks(){
  for(int variant=0;variant<4;++variant){
   Document d(2,2);d.colorMode_=color_mode::Mode::Indexed;
   d.palette_.entries={{0,U"transparent",0},{7,U"visible",0xff123456},{19,U"transparent high",0}};d.palette_.setOrder({0,7,19});
   auto state=d.timeline_.state();auto& source=*state.cels.front().surface;source.format=timeline::RasterFormat::Indexed;source.pixels.assign(4,variant==0?7:variant==1?19:variant==2?0x80000001u:0);
   if(variant==3)d.palette_.entries.front().color=0xffabcdef;
   d.timeline_=timeline::Timeline(std::move(state));const auto layer=d.layer().id,first=d.frame().id,owner=d.cel().id;const bool visible=variant==0||variant==3;
   d.addLinkedFrame();const auto added=d.frame().id;check(bool(d.cel().linkedCelId)==visible,"explicit indexed frame link");if(visible)check(*d.cel().linkedCelId==owner,"canonical indexed owner");else check(d.cel().surface&&d.cel().surface->format==timeline::RasterFormat::Indexed,"blank indexed frame format");
   d.undo();check(d.timeline_.state().frames.size()==1,"indexed frame undo");d.redo();check(d.frame().id==added&&bool(d.cel().linkedCelId)==visible,"indexed frame redo");
   d.selectFrame(first);d.setLayerAutoLinkAnimationCels(layer,true);d.addFrame();check(bool(d.cel().linkedCelId)==visible,"indexed auto link visibility");
   d.undo();d.selectFrame(added);if(visible)check(d.disconnectSelectedCels(),"prepare independent indexed target");d.selectFrame(first);d.clearTimelineSelection();d.selectTimelineCel(owner);d.selectTimelineCel(d.timeline_.findCel(layer,added)->id,1);check(d.canConnectSelectedCels()==visible,"indexed connect availability");
   if(visible){check(d.connectSelectedCels(),"indexed connect command");d.undo();d.redo();check(d.timeline_.resolveSurface(d.timeline_.findCel(layer,added)->id).source->id==owner,"indexed connect redo owner");}
  }
 }
 static void palette(Document& d,const JsonArray& entries,const JsonArray& order){d.palette_.entries.clear();d.palette_.slots.clear();for(const auto& v:entries){const auto e=v.GetObject();d.palette_.entries.push_back({int(e.GetNamedNumber(L"id")),U"color",Pixel(e.GetNamedNumber(L"color"))});}std::vector<int> ids;for(auto id:words(order))ids.push_back(int(id));d.palette_.setOrder(std::move(ids));d.palette_.nextId=500;}
 static std::unique_ptr<Document> make(const JsonObject& row,bool target=false,bool linked=false){
  auto d=std::make_unique<Document>(8,6);d->colorMode_=mode(row.GetNamedString(target?L"targetMode":L"sourceMode"));palette(*d,row.GetNamedArray(target?L"targetEntries":L"entries"),row.GetNamedArray(target?L"targetOrder":L"order"));
  auto state=d->timeline_.state();auto& c=state.cels.front();auto& s=*c.surface;s.format=d->colorMode_==color_mode::Mode::Indexed?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba;s.storageOriginX=5;s.storageOriginY=-3;
  if(target){s.width=8;s.height=6;s.offsetX=s.offsetY=0;s.pixels=std::vector<Pixel>(48,row.HasKey(L"beforeValue")?Pixel(row.GetNamedNumber(L"beforeValue")):0);}
  else {s.width=4;s.height=3;s.offsetX=-1;s.offsetY=1;s.pixels=words(row.GetNamedArray(L"initial"));c.opacity=.6;c.zIndex=3;}
  if(linked){state.frames.push_back({"linked-frame",100});timeline::Cel alias;alias.id="linked-cel";alias.layerId=c.layerId;alias.frameId="linked-frame";alias.linkedCelId=c.id;state.cels.push_back(std::move(alias));}
  d->timeline_=timeline::Timeline(std::move(state));d->projectActiveCelOpacities();d->markSaved();return d;
 }
 static void comparePortable(const Document::CelClipboardSnapshot& clip,const JsonObject& row){check(!clip.items.empty()&&clip.items.front().cel.surface.has_value(),"portable Cel surface");surface(*clip.items.front().cel.surface,row.GetNamedObject(L"portable"),"copy-time portable");}
 static void conversion(const JsonObject& row,bool linked){
  auto source=make(row,false,linked);source->selectTimelineCel(source->cel().id);if(linked)source->timelineSelection_.cels.push_back("linked-cel");check(source->copySelectedCels(),"copy Cel");comparePortable(source->exportCelClipboard(),row);
  const auto raw=source->activeSurface();for(auto& e:source->palette_.entries)e.color=0xffabcdef;
  auto clip=source->exportCelClipboard();comparePortable(clip,row);
  auto target=make(row,true);const auto before=target->activeSurface();target->selectTimelineCel(target->cel().id);check(target->copySelectedCels(),"target local copy");const auto local=target->exportCelClipboard();const auto localRaw=*target->celClipboard_.front().cel.surface;
  check(target->pasteCelClipboard(clip),"cross Cel paste");surface(target->activeSurface(),row.GetNamedObject(L"target"),"cross Cel");check(target->historySize()==1,"cross Cel single entry");
  sameWords(target->celClipboard_.front().cel.surface->pixels,localRaw.pixels,"cross paste preserves target raw clipboard");check(target->celClipboard_.front().cel.surface->format==localRaw.format,"target raw clipboard format");sameWords(target->exportCelClipboard().items.front().cel.surface->pixels,local.items.front().cel.surface->pixels,"target portable clipboard frozen");
  if(linked){const auto& state=target->timeline_.state();check(state.frames.size()==2,"append Cel frame");const auto* alias=target->timeline_.findCel(target->layer().id,state.frames.back().id);check(alias&&alias->linkedCelId&&target->timeline_.resolveSurface(alias->id).surface->pixels.identity()==target->activeSurface().pixels.identity(),"cross Cel link identity");}
  target->undo();sameWords(target->activeSurface().pixels,before.pixels,"Cel undo");check(target->timeline_.state().frames.size()==1,"Cel undo appended frames");target->redo();surface(target->activeSurface(),row.GetNamedObject(L"target"),"Cel redo");
  target->selectTimelineCel(target->cel().id);check(target->pasteCelClipboard(local),"target local paste after cross paste");sameWords(target->activeSurface().pixels,localRaw.pixels,"target local paste raw IDs");check(target->activeSurface().format==localRaw.format,"target local paste format");target->undo();
  auto stale=make(row,true);Document::CelClipboardSnapshot staleClip;staleClip.width=8;staleClip.height=6;staleClip.sourceIdentity=stale->identity_;Document::CelClipboardItem staleItem;staleItem.cel=stale->cel();staleItem.cel.surface=clip.items.front().cel.surface;staleClip.items.push_back(staleItem);check(!stale->pasteCelClipboard(staleClip)&&stale->historySize()==0,"missing same-document local clipboard rejects portable fallback");
  // Same-document portable dispatch must use raw clipboard IDs, even after a palette edit.
  source->pasteCelClipboard(clip);sameWords(source->activeSurface().pixels,raw.pixels,"same document Cel raw IDs");check(source->activeSurface().format==raw.format,"same document Cel format");source->undo();
  // Capture a fresh copy with the original palette, then freeze frame colors.
  palette(*source,row.GetNamedArray(L"entries"),row.GetNamedArray(L"order"));source->selectFrameHeader(source->timeline_.state().frames.front().id);if(linked)source->selectedFrames_.push_back("linked-frame");check(source->copySelectedFrames(),"copy frames");
  auto frames=source->exportFrameClipboard();check(frames.items.size()==(linked?2:1),"frame block size");surface(*frames.items.front().cels.front().surface,row.GetNamedObject(L"portable"),"portable frame");
  for(auto& e:source->palette_.entries)e.color=0xff135790;auto exported=source->exportFrameClipboard();surface(*exported.items.front().cels.front().surface,row.GetNamedObject(L"portable"),"frozen frame after palette edit");
  auto frameTarget=make(row,true);check(frameTarget->pasteFrameClipboard(exported),"cross frame paste");surface(frameTarget->activeSurface(),row.GetNamedObject(L"target"),"cross frame");check(frameTarget->historySize()==1,"frame single transaction");if(linked){const auto& s=frameTarget->timeline_.state();const auto* alias=frameTarget->timeline_.findCel(frameTarget->layer().id,s.frames.back().id);check(alias&&alias->linkedCelId&&frameTarget->timeline_.resolveSurface(alias->id).surface->pixels.identity()==frameTarget->activeSurface().pixels.identity(),"cross frame links");}
  frameTarget->undo();check(frameTarget->timeline_.state().frames.size()==1,"frame undo");frameTarget->redo();surface(frameTarget->activeSurface(),row.GetNamedObject(L"target"),"frame redo");
  check(source->pasteCopiedFrames(),"local frame paste");sameWords(source->activeSurface().pixels,raw.pixels,"local frame raw IDs");check(source->activeSurface().format==raw.format,"local frame format");source->undo();
  // Drag duplicate uses raw snapshots and restores the clipboard it borrowed.
  const auto clipboard=source->exportFrameClipboard();source->copyTimelineFrames(source->timeline_.state().frames.back().id,true);sameWords(source->activeSurface().pixels,raw.pixels,"drag frame raw IDs");check(source->exportFrameClipboard().items.size()==clipboard.items.size(),"drag preserves clipboard");
  source.reset();auto detached=make(row,true);check(detached->pasteCelClipboard(clip),"Cel snapshot survives source destruction");surface(detached->activeSurface(),row.GetNamedObject(L"target"),"detached Cel snapshot");auto detachedFrames=make(row,true);check(detachedFrames->pasteFrameClipboard(exported),"frame snapshot survives source destruction");surface(detachedFrames->activeSurface(),row.GetNamedObject(L"target"),"detached frame snapshot");
 }
 static void selectionPaste(const JsonObject& row,bool linked){
  auto source=make(row);source->previewSelection(selection(row.GetNamedObject(L"selection")));source->selectTimelineCel(source->cel().id);check(source->copySelectedCels(),"selection copy");const auto clip=source->exportCelClipboard();comparePortable(clip,row);
  auto target=make(row,true,linked);const auto before=target->activeSurface();const auto rev=target->revision();check(target->pasteCelClipboard(clip)&&target->floating(),"selection begin");surface(target->activeSurface(),row.GetNamedObject(L"after"),"selection preview",true);check(target->revision()==rev&&target->historySize()==0,"selection preview no history");target->cancelFloatingPaste();sameWords(target->activeSurface().pixels,before.pixels,"selection cancel");check(target->historySize()==0,"cancel no entry");
  check(target->pasteCelClipboard(clip),"selection restart");target->commitFloatingPaste();surface(target->activeSurface(),row.GetNamedObject(L"after"),"selection commit",true);check(target->historySize()==1,"pixel or selection-only history");
  target->undo();surface(target->activeSurface(),row.GetNamedObject(L"undo"),"selection undo",true);check(!target->selection(),"selection-only undo");target->redo();surface(target->activeSurface(),row.GetNamedObject(L"redo"),"selection redo",true);check(target->selection().has_value(),"selection-only redo");
  if(linked)check(target->timeline_.findCelById("linked-cel")->linkedCelId&&target->timeline_.resolveSurface("linked-cel").surface->pixels.identity()==target->activeSurface().pixels.identity(),"selection retains shared owner");
 }
 static void center(const JsonObject& row,bool linked){
  auto d=std::make_unique<Document>(8,6);d->colorMode_=color_mode::Mode::Indexed;palette(*d,row.GetNamedArray(L"entries"),row.GetNamedArray(L"order"));auto state=d->timeline_.state();auto& s=*state.cels.front().surface;const auto initial=row.GetNamedObject(L"initial");s.width=int(initial.GetNamedNumber(L"width"));s.height=int(initial.GetNamedNumber(L"height"));s.offsetX=int(initial.GetNamedNumber(L"x"));s.offsetY=int(initial.GetNamedNumber(L"y"));s.storageOriginX=5;s.storageOriginY=-3;s.format=timeline::RasterFormat::Indexed;s.pixels=words(initial.GetNamedArray(L"pixels"));
  if(linked){state.frames.push_back({"linked-frame",100});timeline::Cel alias;alias.id="linked-cel";alias.layerId=state.cels.front().layerId;alias.frameId="linked-frame";alias.linkedCelId=state.cels.front().id;state.cels.push_back(std::move(alias));}
  d->timeline_=timeline::Timeline(std::move(state));d->projectActiveCelOpacities();if(row.GetNamedValue(L"selection").ValueType()!=JsonValueType::Null)d->previewSelection(selection(row.GetNamedObject(L"selection")));const auto selected=d->selection();d->markSaved();
  const auto axis=row.GetNamedString(L"axis");const bool changed=d->centerActiveContent(axis!=L"vertical",axis!=L"horizontal");check(changed==row.GetNamedBoolean(L"changed"),"center changed");surface(d->activeSurface(),row.GetNamedObject(L"after"),"center after",true);check(d->historySize()==unsigned(changed),"center history");auto after=selected;if(after&&changed){after->x+=int(row.GetNamedNumber(L"dx"));after->y+=int(row.GetNamedNumber(L"dy"));}check(selectionEqual(after,d->selection()),"center selection");
  if(changed){d->undo();surface(d->activeSurface(),row.GetNamedObject(L"undo"),"center undo",true);check(selectionEqual(selected,d->selection()),"center undo selection");d->redo();surface(d->activeSurface(),row.GetNamedObject(L"redo"),"center redo",true);check(selectionEqual(after,d->selection()),"center redo selection");}
  if(linked)check(d->timeline_.resolveSurface("linked-cel").surface->pixels.identity()==d->activeSurface().pixels.identity(),"center linked identity");
 }
 static void multiSelection(const JsonObject& row){
  auto d=std::make_unique<Document>(8,6);d->colorMode_=mode(row.GetNamedString(L"targetMode"));palette(*d,row.GetNamedArray(L"targetEntries"),row.GetNamedArray(L"targetOrder"));auto state=d->timeline_.state();const auto layer=state.layers.front().id,first=state.frames.front().id;const auto format=d->colorMode_==color_mode::Mode::Indexed?timeline::RasterFormat::Indexed:timeline::RasterFormat::Rgba;
  auto& s=*state.cels.front().surface;s.format=format;s.width=8;s.height=6;s.pixels.assign(48,format==timeline::RasterFormat::Indexed?19:d->colorMode_==color_mode::Mode::Grayscale?0xff353535:0xff202060);
  state.frames.push_back({"second-frame",100});auto second=state.cels.front();second.id="second-cel";second.frameId="second-frame";if(row.GetNamedBoolean(L"linked")){second.linkedCelId=state.cels.front().id;second.surface.reset();}state.cels.push_back(std::move(second));
  auto spare=state.layers.front();spare.id="spare-layer";state.layers.push_back(spare);for(const auto& f:state.frames){timeline::Cel c;c.id="spare-"+f.id;c.layerId=spare.id;c.frameId=f.id;timeline::Surface blank;blank.format=format;blank.width=blank.height=1;blank.pixels.resize(1);c.surface=std::move(blank);state.cels.push_back(std::move(c));}
  d->timeline_=timeline::Timeline(state);if(row.GetNamedBoolean(L"append"))d->activeFrameId_="second-frame";d->projectActiveCelOpacities();d->markSaved();
  Document::CelClipboardSnapshot clip;clip.width=8;clip.height=6;clip.sourceIdentity=0;int column=0;for(const auto& v:row.GetNamedArray(L"input")){const auto input=v.GetObject();Document::CelClipboardItem item;item.column=column++;item.cel.id="incoming-"+std::to_string(item.column);item.cel.layerId="incoming-layer";item.cel.frameId="incoming-frame-"+std::to_string(item.column);timeline::Surface source;source.width=int(input.GetNamedNumber(L"width"));source.height=int(input.GetNamedNumber(L"height"));source.offsetX=int(input.GetNamedNumber(L"x"));source.offsetY=int(input.GetNamedNumber(L"y"));source.pixels=words(input.GetNamedArray(L"pixels"));item.cel.surface=source;SelectionClipboard pixels;pixels.width=5;pixels.height=3;pixels.originX=pixels.originY=1;pixels.pixels.resize(15);pixels.mask.resize(15);for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const auto offset=std::size_t(source.offsetY+y-1)*5+source.offsetX+x-1;pixels.pixels[offset]=source.pixels[std::size_t(y)*source.width+x];pixels.mask[offset]=1;}item.selectionPixels=std::move(pixels);clip.items.push_back(std::move(item));}
  auto compare=[&]{const auto expected=row.GetNamedArray(L"after");check(d->timeline_.state().frames.size()==expected.Size(),"multi frame count");for(unsigned i=0;i<expected.Size();++i){const auto* cel=d->timeline_.findCel(layer,d->timeline_.state().frames[i].id);surface(*d->timeline_.resolveSurface(cel->id).surface,expected.GetObjectAt(i),"multi result");}for(const auto& f:d->timeline_.state().frames){const auto* cel=d->timeline_.findCel(spare.id,f.id);check(cel&&cel->surface&&cel->surface->format==format,"spare empty slot format");}};
  check(d->pasteCelClipboard(clip)&&d->floating(),"multi begin");compare();const auto expectedSources=row.GetNamedArray(L"sources");check(d->floating_->targets.size()==expectedSources.Size(),"multi target count");for(unsigned i=0;i<expectedSources.Size();++i){const auto e=expectedSources.GetObjectAt(i);const auto& source=d->floating_->targets[i].source;sameWords(source.pixels,words(e.GetNamedArray(L"pixels")),"multi clipped values");sameWords(std::vector<Pixel>(source.mask.begin(),source.mask.end()),words(e.GetNamedArray(L"mask")),"multi union padding mask");check(bool(source.opaqueIds)==(format==timeline::RasterFormat::Indexed),"multi target opacity metadata");}
  d->cancelFloatingPaste();check(d->timeline_.state().frames.size()==2&&d->historySize()==0,"multi cancel structure/history");for(const auto& c:state.cels)if(c.surface)sameWords(d->timeline_.resolveSurface(c.id).surface->pixels,c.surface->pixels,"multi cancel raw");check(!d->selection(),"multi cancel selection");
  check(d->pasteCelClipboard(clip),"multi restart");d->commitFloatingPaste();compare();check(d->historySize()==1,"multi single transaction");encoded(*d);d->undo();check(d->timeline_.state().frames.size()==2,"multi undo appended frames");for(const auto& c:state.cels)if(c.surface)sameWords(d->timeline_.resolveSurface(c.id).surface->pixels,c.surface->pixels,"multi undo raw");encoded(*d);d->redo();compare();encoded(*d);
 }
};}
int run(int argc,wchar_t** argv){check(argc==2,"oracle path");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);const std::string bytes{std::istreambuf_iterator<char>(in),std::istreambuf_iterator<char>()};const auto root=JsonObject::Parse(winrt::to_hstring(bytes));unsigned count=0,linked=0;RasterHistoryFixture::frameLinks();
 for(const auto& value:root.GetNamedArray(L"conversions")){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::conversion(row,false);if(count%6==0){RasterHistoryFixture::conversion(row,true);++linked;}++count;}
 for(const auto& value:root.GetNamedArray(L"selections")){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::selectionPaste(row,false);if(count%9==0){RasterHistoryFixture::selectionPaste(row,true);++linked;}++count;}
 for(const auto& value:root.GetNamedArray(L"centers")){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::center(row,false);if(count%15==0){RasterHistoryFixture::center(row,true);++linked;}++count;}
 unsigned multi=0;for(const auto& value:root.GetNamedArray(L"multiSelections")){const auto row=value.GetObject();context=winrt::to_string(row.GetNamedString(L"name"));RasterHistoryFixture::multiSelection(row);++multi;}
 check(count==576&&multi==12,"oracle coverage");std::cout<<count<<" actual legacy animation/center cases, "<<linked<<" linked variants and "<<multi<<" multi-Cel pastes passed\n";return 0;}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<context<<": "<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
