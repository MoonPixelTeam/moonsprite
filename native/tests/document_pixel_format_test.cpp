#include "document_snapshot.h"
#include "project_encode.h"
#include "project_import.h"
#include "project_zip_writer.h"
#include "lua_script_result.h"
#include "editor_preferences.h"
#include "local_history_diff.h"
#include "local_history_resource_cost.h"
#include <iostream>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
#define CHECK(x) do{if(!(x))throw std::runtime_error(std::string("line ")+std::to_string(__LINE__)+": "+#x);}while(false)
using namespace moon;
using Format=color_mode::PixelFormat;
namespace moon {struct RasterHistoryFixture {
 static void install(Document& d,bool sparse){auto state=d.timeline_.state();auto& s=*state.cels.front().surface;s.width=sparse?2:d.width_;s.height=sparse?2:d.height_;s.offsetX=sparse?-1:0;s.offsetY=sparse?1:0;s.pixels.assign(std::size_t(s.width)*s.height,0x7f29537b);s.pixels[0]=0x00123456;d.timeline_=timeline::Timeline(std::move(state));}
 static void raw(Document& d,std::vector<Pixel> pixels,int w=0,int h=0,int x=0,int y=0){auto state=d.timeline_.state();auto& s=*state.cels.front().surface;s.width=w?w:d.width_;s.height=h?h:d.height_;s.offsetX=x;s.offsetY=y;s.pixels=std::move(pixels);d.timeline_=timeline::Timeline(std::move(state));}
 static void timelineState(Document& d,timeline::State state){d.timeline_=timeline::Timeline(std::move(state));}
 static void resource(Document& d){auto state=d.timeline_.state();auto t=tiles::blankTileset("independent",U"Tiles",1,1,"tile",1);t.pixels[0]=0x9729537b;state.tilesets.push_back(std::move(t));d.timeline_=timeline::Timeline(std::move(state));}
 static void run(Document& d){Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.cel().id;e.contentHistory.runs={{0,2,0,0x7f29537b}};d.applyEdit(e,true);d.pushEdit(std::move(e),U"Run");}
 static void colorModeResourceRejection(Document& d){
  const auto position=d.historyPosition();auto& edit=const_cast<Document::Edit&>(d.history_.at(position-1));
  const auto resources=edit.snapshotHistory.colorModeResources;CHECK(resources&&!resources->cels.empty()&&!resources->sets.empty()&&!resources->sources.empty());
  const auto pixels=d.canvasPixels();const auto mode=d.colorMode();const auto identity=d.cel().surface->pixels.identity();const auto bytes=d.historyBytes(),revision=d.revision();const auto state=d.timeline_.state();
  auto unchanged=[&]{const auto& current=d.timeline_.state();for(std::size_t i=0;i<state.layers.size();++i)CHECK(current.layers[i].freeTiles==state.layers[i].freeTiles);for(std::size_t i=0;i<state.cels.size();++i)CHECK(current.cels[i].freeTiles==state.cels[i].freeTiles);for(std::size_t i=0;i<state.tilesets.size();++i){const auto& a=current.tilesets[i];const auto& b=state.tilesets[i];CHECK(a.tileWidth==b.tileWidth&&a.tileHeight==b.tileHeight&&a.columns==b.columns&&a.rows==b.rows&&a.pixels==b.pixels);}};
  for(int missing=0;missing<3;++missing){auto bad=std::make_shared<Document::ColorModeResources>(*resources);if(missing==0)bad->cels.back().id="missing-owner";if(missing==1)bad->sets.back().id="missing-set";if(missing==2)bad->sources.back().id="missing-source";edit.snapshotHistory.colorModeResources=std::move(bad);bool rejected=false;try{d.undo();}catch(const std::logic_error&){rejected=true;}CHECK(rejected&&d.colorMode()==mode&&d.canvasPixels()==pixels&&d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.cel().surface->pixels.identity()==identity);}
  unchanged();edit.snapshotHistory.colorModeResources=resources;
  // A later leaf validation error must compensate the resource/mode exchange.
  const auto target=edit.contentHistory.surfaceChanges.back().ownerId;edit.contentHistory.surfaceChanges.back().ownerId="missing-surface";bool rejected=false;try{d.undo();}catch(const std::logic_error&){rejected=true;}edit.contentHistory.surfaceChanges.back().ownerId=target;CHECK(rejected&&d.colorMode()==mode&&d.canvasPixels()==pixels&&d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.cel().surface->pixels.identity()==identity);unchanged();
 }
};}
static void dot(Document& d,Point p,Pixel value){d.beginStroke(p,value);CHECK(d.commitStroke());}
static void normalized(const Document& d,const std::vector<Pixel>& pixels){for(auto p:pixels)CHECK(d.normalizeCanvasPacked(p)==p);}
static Document snapshot(const Document& d){DocumentSnapshot s(d);while(!s.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(2))){}return s.finish();}
static void roundtrip(Document& d){for(int type=0;type<3;++type){auto encoded=type==0?project::encodeEditableProject(d):type==1?project::encodeRecoveryProject(d):project::encodeHistoryProject(d);auto m=project::readProjectManifest(encoded.bytes);CHECK(m.unsupported.empty()&&m.pixelFormat==color_mode::name(d.pixelFormat())&&m.colorMode==color_mode::name(d.colorMode()));auto copy=project::createEditableDocument(project::prepareEditableImport(m));CHECK(copy.colorMode()==d.colorMode()&&copy.pixelFormat()==d.pixelFormat()&&copy.canvasPixels()==d.canvasPixels());auto again=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(copy).bytes)));CHECK(again.colorMode()==d.colorMode()&&again.pixelFormat()==d.pixelFormat()&&again.canvasPixels()==d.canvasPixels());}}
static void conversion(Format format,bool sparse){
 Document d(5,4);RasterHistoryFixture::install(d,sparse);d.addLinkedFrame();const auto alias=d.cel().id;const auto root=d.timeline().resolveSurface(alias).source->id;const auto before=d.timeline().resolveSurface(root).surface->pixels;
 const auto owner=d.layer().id,frame=d.frame().id;CHECK(d.createAttachedMask(owner,frame));CHECK(d.fillSelectionOrCanvas(0xff808080));const auto masks=d.timeline().state().masks;d.exitAttachedMask();
 const auto identity=d.timeline().resolveSurface(root).surface->pixels.identity();const auto history=d.historyPosition();d.markSaved();const auto changed=d.setPixelFormat(format);CHECK(changed==(format!=Format::Rgba32));CHECK(d.historyPosition()==history&&d.pixelFormat()==format);CHECK(d.timeline().resolveSurface(alias).source->id==root&&d.timeline().resolveSurface(root).surface->pixels.identity()==identity);
 const auto& actual=d.timeline().resolveSurface(root).surface->pixels;for(std::size_t i=0;i<before.size();++i)CHECK(actual[i]==color_mode::quantizePixelColor(before[i],format));CHECK(d.timeline().state().masks.front().mask.surface.pixels==masks.front().mask.surface.pixels);
 const auto revision=d.revision();CHECK(!d.setPixelFormat(format)&&d.revision()==revision);CHECK(snapshot(d).pixelFormat()==format);roundtrip(d);
}
static void tools(Format format,color_mode::Mode mode=color_mode::Mode::Rgba){
 Document d(8,6);d.setImportedPixelFormat(format);d.setImportedColorMode(mode);const auto blank=d.canvasPixels();constexpr Pixel color=0x9729537b;BrushOptions brush{1,100,BrushShape::Square};
 auto preview=d.brushPreview({2,2},{2,2},color,brush);CHECK(preview.at(18)==d.normalizeCanvasPacked(color));d.beginStroke({2,2},color,brush);CHECK(d.pixels()[18]==preview.at(18));d.cancelStroke();CHECK(d.canvasPixels()==blank);
 d.beginStroke({2,2},color,brush);CHECK(d.commitStroke());const auto drawn=d.canvasPixels();d.undo();CHECK(d.canvasPixels()==blank);d.redo();CHECK(d.canvasPixels()==drawn);normalized(d,drawn);
 d.beginStroke({2,2},0,brush);CHECK(d.commitStroke());CHECK(d.pixels()[18]==0);d.undo();CHECK(d.canvasPixels()==drawn);
 PatternBrush image;image.width=image.height=1;image.coverage={193};image.colors={color};image.intrinsicSize=true;preview=d.brushPreview({4,2},{4,2},color,brush,&image);d.beginStroke({4,2},color,brush,&image);CHECK(d.commitStroke()&&d.pixels()[20]==preview.at(20));
 CHECK(d.fillPixels({0,0},color));normalized(d,d.canvasPixels());const auto filled=d.canvasPixels();d.undo();d.redo();CHECK(d.canvasPixels()==filled);
 CHECK(d.beginGradient({0,0}));GradientSpec gradient;gradient.start={0,0};gradient.end={7,5};gradient.first=0x53275391;gradient.last=0x91275314;CHECK(d.updateGradient(gradient,{}));auto expected=d.displayPixels();normalized(d,expected);d.cancelGradient();CHECK(d.canvasPixels()==filled);CHECK(d.beginGradient({0,0})&&d.updateGradient(gradient,{})&&d.commitGradient());CHECK(d.canvasPixels()==expected);d.undo();CHECK(d.canvasPixels()==filled);d.redo();CHECK(d.canvasPixels()==expected);
 ShapeSpec shape;shape.bounds={2,1,3,3};CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,color));expected=d.displayPixels();normalized(d,expected);d.commitShapePreview();CHECK(d.canvasPixels()==expected);
 ColorAdjustment adjust;adjust.kind=ColorAdjustmentKind::Invert;CHECK(d.beginColorAdjustment()&&d.updateColorAdjustment(adjust));expected=d.displayPixels();normalized(d,expected);CHECK(d.commitColorAdjustment()&&d.canvasPixels()==expected);
 CHECK(d.beginColorAdjustment());auto task=d.captureConvolutionSurfaceTask(ConvolutionOptions{});CHECK(task&&Document::runConvolutionSurfaceTask(*task,[]{return false;})&&d.publishConvolutionSurfaceTask(std::move(*task)));expected=d.displayPixels();normalized(d,expected);d.commitConvolutionAdjustment();CHECK(d.canvasPixels()==expected);
 OutlineSettings outline;outline.color=0xa345789b;outline.sampling.position=0;auto outlineTask=d.captureOutlineTask(outline);CHECK(Document::runOutlineTask(outlineTask,[]{return false;}));CHECK(outlineTask.draft->pixelFormat()==format);normalized(*outlineTask.draft,outlineTask.draft->canvasPixels());d.cancelColorAdjustment();
 roundtrip(d);
}
static void scriptsAndHistory(Format format){
 Document d(4,2);d.setImportedPixelFormat(format);auto pixels=std::make_shared<const std::vector<Pixel>>(d.pixels());script::RasterBatch b;b.before={4,2,0,0,pixels};b.changes={{0,0,0x9729537b}};CHECK(d.commitScriptRasterBatch(b));CHECK(d.pixels()[0]==d.normalizeCanvasPacked(0x9729537b));d.undo();CHECK(d.pixels()[0]==0);d.redo();
 // Whole surface replacement is raw in lua-script-service, including hidden RGB.
 b.before.pixels=std::make_shared<const std::vector<Pixel>>(d.pixels());b.changes.clear();auto raw=std::make_shared<std::vector<Pixel>>(8,0x12345678);b.after=script::SurfaceSnapshot{4,2,0,0,raw};CHECK(d.commitScriptRasterBatch(b)&&d.pixels()[0]==0x12345678);d.undo();CHECK(d.pixels()[0]==d.normalizeCanvasPacked(0x9729537b));d.redo();CHECK(d.pixels()[0]==0x12345678);
 Document run(4,2);RasterHistoryFixture::run(run);run.setPixelFormat(format);run.undo();CHECK(run.pixels()[0]==0);run.redo();CHECK(run.pixels()[0]==run.normalizeCanvasPacked(0x7f29537b));
 Document backup(4,2);backup.setImportedPixelFormat(format);dot(backup,{1,1},0xff123456);Document live(4,2);CHECK(live.rollbackProject(backup)&&live.pixelFormat()==format);live.undo();CHECK(live.pixelFormat()==Format::Rgba32);live.redo();CHECK(live.pixelFormat()==format);
}
static void linkedLayersAndResources(Format format){
 Document d(4,2);dot(d,{0,0},0x9729537b);const auto first=d.layer().id;const auto peer=d.createLinkedLayer(first);CHECK(!peer.empty());RasterHistoryFixture::resource(d);const auto raw=d.timeline().state().tilesets[0].pixels;const auto* a=d.timeline().findCel(first,d.frame().id);const auto* b=d.timeline().findCel(peer,d.frame().id);const auto identity=d.timeline().resolveSurface(a->id).surface->pixels.identity();const auto history=d.historyPosition();d.setPixelFormat(format);CHECK(d.historyPosition()==history&&d.timeline().resolveSurface(a->id).surface->pixels.identity()==identity&&d.timeline().resolveSurface(b->id).surface->pixels.identity()==identity);CHECK(d.timeline().state().tilesets[0].pixels==raw);CHECK(d.timeline().resolveSurface(a->id).surface->pixels[0]==color_mode::quantizePixelColor(0x9729537b,format));roundtrip(d);
}
static void transforms(Format format){
 constexpr Pixel raw=0x9729537b;
 // flipLayer records swapped pixels, leaving the odd middle column untouched.
 for(bool sparse:{false,true}){Document d(5,3);std::vector<Pixel> source(sparse?3:15);source[0]=raw;source[1]=0x81436587;source[2]=0x61234567;RasterHistoryFixture::raw(d,source,sparse?3:5,sparse?1:3,sparse?1:0,sparse?1:0);d.setImportedPixelFormat(format);const auto before=d.canvasPixels();CHECK(d.flipContent(true));const auto& after=d.timeline().resolveSurface(d.cel().id).surface->pixels;if(sparse){CHECK(after[0]==d.normalizeCanvasPacked(source[2])&&after[1]==source[1]&&after[2]==d.normalizeCanvasPacked(source[0]));}else{CHECK(after[4]==d.normalizeCanvasPacked(source[0])&&after[3]==d.normalizeCanvasPacked(source[1])&&after[2]==source[2]);}d.undo();CHECK(d.canvasPixels()==before);d.redo();}
 for(bool sparse:{false,true}){Document d(5,3);std::vector<Pixel> source(sparse?3:15);source[0]=raw;source[1]=0x81436587;RasterHistoryFixture::raw(d,source,sparse?3:5,sparse?1:3,0,0);d.setImportedPixelFormat(format);d.previewSelection(SelectionMask{0,0,2,1,{}});const auto before=d.canvasPixels();CHECK(d.flipContent(true));CHECK(d.canvasPixels()[0]==d.normalizeCanvasPacked(source[1])&&d.canvasPixels()[1]==d.normalizeCanvasPacked(raw));d.undo();CHECK(d.canvasPixels()==before);d.redo();}
 // The deferred and immediate raster paths must quantize the same writes.
 for(auto mode:{repeat::Mode::Off,repeat::Mode::Both}){Document deferred(320,320),reference(320,320);reference.setDeferredFloatingDisplaySupported(false);for(auto* d:{&deferred,&reference}){d->setImportedPixelFormat(format);dot(*d,{10,10},raw);dot(*d,{11,10},0x81436587);d->previewSelection(SelectionMask{10,10,2,2,{}});d->setFloatingRepeat(mode);CHECK(d->beginSelectionContentMove(false));}CHECK(deferred.floatingDeferred()&&!reference.floatingDeferred());auto tr=*deferred.floatingTransform();tr.x=20;tr.y=18;if(mode==repeat::Mode::Off){tr.width=3;tr.height=4;tr.angle=23;}for(auto* d:{&deferred,&reference})d->transformFloatingPaste(tr);auto overlay=deferred.floatingOverlayRegion({0,0,32,32});const auto referencePixels=reference.canvasPixels();for(int y=0;y<32;++y)for(int x=0;x<32;++x)CHECK(overlay[y*32+x]==referencePixels[std::size_t(y)*320+x]);CHECK(deferred.commitFloatingPaste()&&reference.commitFloatingPaste());CHECK(deferred.canvasPixels()==reference.canvasPixels());const auto committed=deferred.canvasPixels();deferred.undo();deferred.redo();CHECK(deferred.canvasPixels()==committed);}
}
static void dynamicsAndAa(Format format){
 Document d(8,6);d.setImportedPixelFormat(format);BrushOptions brush{1,73,BrushShape::Square};d.beginStroke({1,1},0x9729537b,brush,nullptr,0,nullptr,false);d.configureStrokeDynamics(brush,nullptr,0x9129537b,0x536b9513,0);d.updateDynamicStroke({1,1},{1,1,1,73,0,.25},true);d.updateDynamicStroke({5,3},{5,3,2,57,0,.75});CHECK(d.commitStroke());normalized(d,d.canvasPixels());const auto painted=d.canvasPixels();d.undo();d.redo();CHECK(d.canvasPixels()==painted);
 Document aa(5,5);aa.setImportedPixelFormat(format);for(int i=1;i<4;++i)dot(aa,{i,i},0xffc06020);const auto before=aa.canvasPixels();CHECK(aa.beginAntiAliasPreview());auto task=aa.captureAntiAliasSurfaceTask({});CHECK(task&&Document::runAntiAliasSurfaceTask(*task,[]{return false;}));aa.publishAntiAliasSurfaceTask(std::move(*task));const auto preview=aa.displayPixels();normalized(aa,preview);aa.commitAntiAliasAdjustment();CHECK(aa.canvasPixels()==preview);aa.undo();CHECK(aa.canvasPixels()==before);aa.redo();CHECK(aa.canvasPixels()==preview);
}
static void localHistoryFormat(Format format,color_mode::Mode mode=color_mode::Mode::Rgba){
 Document source=Document::withBuiltinPalette(3,2,U"History format");source.setImportedPixelFormat(format);source.setImportedColorMode(mode);
 const auto saved=project::encodeHistoryProject(source);auto manifest=std::make_shared<const project::ReadManifest>(project::readProjectManifest(saved.bytes));auto d=project::createEditableDocument(project::prepareEditableImport(*manifest));
 local_history::HistoryCompareDocument comparison;const auto root=local_history::appendDecodedHistoryMetadataValues(comparison,d,*manifest,"runtime-format");
 const auto& fields=comparison.values[root].properties;const auto field=std::find_if(fields.begin(),fields.end(),[](const auto& p){return p.first=="pixelFormat";});CHECK(field!=fields.end());const auto text=std::string(color_mode::name(format));CHECK(comparison.values[field->second].text==std::u16string(text.begin(),text.end()));
 local_history::HistoryDecodeContext context{"runtime-format",{}};local_history::InitialHistoryDocumentCost plan(manifest,d,context);local_history::HistoryCostGraph graph;local_history::HistoryCostBuilder builder(graph);const auto costRoot=plan.append(builder,d);CHECK(graph[graph[costRoot].children.at(6)].string==std::u16string(text.begin(),text.end()));CHECK(plan.bytes(d)==local_history::historyTransferGraphBytes(graph,costRoot));
 d.setImportedPixelFormat(Format((unsigned(format)+1)%8));bool mismatch=false;try{local_history::InitialHistoryDocumentCost stale(manifest,d,context);}catch(const std::invalid_argument&){mismatch=true;}CHECK(mismatch);mismatch=false;try{local_history::appendDecodedHistoryMetadataValues(comparison,d,*manifest,"runtime-format");}catch(const std::invalid_argument&){mismatch=true;}CHECK(mismatch);
}
static void manifestFallback(){
 using namespace project;using namespace winrt::Windows::Data::Json;
 Document d(2,2);const auto saved=encodeEditableProject(d);Archive archive(saved.bytes);std::map<std::string,Bytes> files;for(const auto& [name,entry]:archive.entries())files[name]=archive.read(name,256*1024*1024);
 auto& bytes=files.at("manifest.json");const std::string json(bytes.begin(),bytes.end());
 for(int kind=0;kind<4;++kind){auto root=JsonObject::Parse(winrt::to_hstring(json));auto doc=root.GetNamedObject(L"document");if(kind==0)doc.Remove(L"pixelFormat");if(kind==1)doc.Insert(L"pixelFormat",JsonValue::CreateStringValue(L"unknown"));if(kind==2)doc.Insert(L"pixelFormat",JsonValue::CreateNumberValue(42));if(kind==3)doc.Insert(L"pixelFormat",JsonValue::CreateNullValue());const auto text=winrt::to_string(root.Stringify());bytes.assign(text.begin(),text.end());auto m=readProjectManifest(std::make_shared<const Bytes>(encodeResourceArchive(files)));CHECK(m.unsupported.empty()&&m.pixelFormat=="rgba32");CHECK(createEditableDocument(prepareEditableImport(m)).pixelFormat()==Format::Rgba32);}
}
static void grayscaleTiles(){
 using Mode=color_mode::Mode;
 // Grid display is document-normalized; its independent source remains color.
 Document grid(4,2);dot(grid,{0,0},0xff29537b);CHECK(grid.convertLayerToTilemap(2,2,U"Gray grid"));const auto resources=grid.timeline().state().tilesets;const auto cells=grid.cel().tilemap->cells;
 CHECK(grid.convertColorMode(Mode::Grayscale));CHECK(grid.timeline().state().tilesets.front().pixels==resources.front().pixels&&grid.cel().tilemap->cells==cells);roundtrip(grid);
 const auto gray=grid.canvasPixels();grid.undo();CHECK(grid.colorMode()==Mode::Rgba&&grid.canvasPixels()[0]==0xff29537b);grid.redo();CHECK(grid.canvasPixels()==gray);
 CHECK(grid.resizeImage(8,4));normalized(grid,grid.canvasPixels());roundtrip(grid);grid.undo();CHECK(grid.canvasPixels()==gray);
 // Overlapping free instances normalize each source before blend, not the output.
 Document free(4,2);CHECK(free.createFreeTileLayer(U"Gray free"));auto state=free.timeline().state();auto& layer=*std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==free.layer().id;});auto& cel=*std::find_if(state.cels.begin(),state.cels.end(),[&](const auto& c){return c.layerId==layer.id;});
 auto& data=*layer.freeTiles;const auto first=data.sources.front();auto& set=*std::find_if(state.tilesets.begin(),state.tilesets.end(),[&](const auto& t){return t.id==first.tilesetId;});set.pixels[0]=0xff29537b;
 auto secondSet=set;secondSet.id="gray-second-set";secondSet.pixels[0]=0x975b1997;state.tilesets.push_back(secondSet);auto second=first;second.id="gray-second-source";second.tilesetId=secondSet.id;data.sources.push_back(second);
 free_tiles::Instance a;a.id="gray-instance-a";a.sourceId=first.id;free_tiles::Instance b=a;b.id="gray-instance-b";b.sourceId=second.id;b.opacity=.73;cel.freeTiles->instances={a,b};cel.surface->pixels=free_tiles::render(data,*cel.freeTiles,state.tilesets,4,2,true);
 const auto expected=cel.surface->pixels;auto colored=free_tiles::render(data,*cel.freeTiles,state.tilesets,4,2);CHECK(expected[0]!=relativeLuminancePixel(colored[0]));
 const auto layerId=layer.id;RasterHistoryFixture::timelineState(free,std::move(state));free.setImportedColorMode(Mode::Grayscale);free.selectLayer(layerId);const auto sourcePixels=free.timeline().state().tilesets.front().pixels;CHECK(free.canvasPixels()==expected);roundtrip(free);
 CHECK(free.setFreeTileInstanceView(true));const auto instance=free.freeTileCel().freeTiles->instances.front().id;Document::FreeTileInstanceChanges move;move.x=1;CHECK(free.setFreeTileInstanceProperties(instance,move));normalized(free,free.canvasPixels());CHECK(free.timeline().state().tilesets.front().pixels==sourcePixels);roundtrip(free);free.undo();CHECK(free.canvasPixels()==expected);free.redo();roundtrip(free);
}
static void grayscaleResourceHistory(){
 using Mode=color_mode::Mode;
 Document d(6,4);CHECK(d.createFreeTileLayer(U"Resource history"));const auto owner=d.layer().id;const auto shared=d.layer().freeTiles->setId;CHECK(d.createFreeTileLayer(U"Shared",shared));d.selectLayer(owner);
 auto state=d.timeline().state();const auto setId=d.layer().freeTiles->sources.front().tilesetId,sourceId=d.layer().freeTiles->sources.front().id;
 for(auto& set:state.tilesets)if(set.id==setId){set.tileWidth=2;set.pixels={0xff29537b,0x9729537b};}
 for(auto& layer:state.layers)if(layer.freeTiles){layer.freeTiles->sources.front().offsetX=1;layer.freeTiles->sources.front().offsetY=1;for(auto& cel:state.cels)if(cel.layerId==layer.id){free_tiles::Instance i;i.id="resource-instance-"+layer.id;i.sourceId=sourceId;i.x=1;i.y=0;cel.freeTiles->instances={i};cel.surface->pixels=free_tiles::render(*layer.freeTiles,*cel.freeTiles,state.tilesets,6,4);}}
 RasterHistoryFixture::timelineState(d,std::move(state));RasterHistoryFixture::resource(d);d.addLinkedFrame();const auto alias=d.cel().id,root=d.timeline().resolveSurface(alias).source->id;const auto firstFrame=d.timeline().state().frames.front().id;
 CHECK(d.convertColorMode(Mode::Grayscale));const auto captured=d.timeline().state();d.selectFrame(firstFrame);d.previewSelection(SelectionMask{0,0,2,1,{}});const auto selection=d.selection();
 auto mutate=[&]{auto next=d.timeline().state();for(auto& layer:next.layers)if(layer.freeTiles){auto& source=layer.freeTiles->sources.front();source.offsetX=2;source.offsetY=0;source.name="later-source";source.locked=true;}for(auto& cel:next.cels)if(cel.freeTiles&&!cel.linkedCelId){if(!cel.freeTiles->instances.empty()){cel.freeTiles->instances.front().x=3;cel.freeTiles->instances.front().rotation=1;}cel.freeTiles->preservedJson=R"({"later":true})";}for(auto& set:next.tilesets){set.name=U"Later name";if(set.id==setId){set.tileWidth=1;set.tileHeight=2;set.pixels={0xff010203,0xff040506};}else set.pixels[0]=0xff778899;}RasterHistoryFixture::timelineState(d,std::move(next));};
 auto verify=[&]{const auto& current=d.timeline().state();CHECK(d.frame().id==firstFrame&&selectionEqual(d.selection(),selection)&&d.timeline().resolveSurface(alias).source->id==root);for(const auto& layer:current.layers)if(layer.freeTiles){const auto& source=layer.freeTiles->sources.front();CHECK(source.offsetX==1&&source.offsetY==1&&source.name=="later-source"&&source.locked);}for(const auto& cel:current.cels)if(cel.freeTiles&&!cel.linkedCelId){const auto original=std::find_if(captured.cels.begin(),captured.cels.end(),[&](const auto& c){return c.id==cel.id;});CHECK(cel.freeTiles->instances==original->freeTiles->instances&&cel.freeTiles->preservedJson==R"({"later":true})");}for(const auto& set:current.tilesets){CHECK(set.name==U"Later name");if(set.id==setId)CHECK(set.tileWidth==2&&set.tileHeight==1&&set.columns==1&&set.rows==1&&set.pixels==std::vector<Pixel>({0xff29537b,0x9729537b}));else CHECK(set.pixels[0]==0xff778899);}};
 mutate();RasterHistoryFixture::colorModeResourceRejection(d);d.undo();CHECK(d.colorMode()==Mode::Rgba);verify();mutate();d.redo();CHECK(d.colorMode()==Mode::Grayscale);verify();roundtrip(d);d.undo();d.redo();verify();roundtrip(d);
}
static void grayscaleContract(){
 using Mode=color_mode::Mode;
 constexpr Pixel source=0x7f29537b,hidden=0x00123456;
 Document d(5,4);RasterHistoryFixture::install(d,true);d.setImportedPixelFormat(Format::Rgb565);
 const auto firstFrame=d.frame().id;d.addLinkedFrame();
 const auto alias=d.cel().id,root=d.timeline().resolveSurface(alias).source->id;
 const auto before=d.timeline().resolveSurface(root).surface->pixels;
 const auto palette=d.palette();const auto h=d.historyPosition();
 CHECK(d.convertColorMode(Mode::Grayscale)&&d.colorMode()==Mode::Grayscale);
 CHECK(d.pixelFormat()==Format::Rgb565&&d.historyPosition()==h+1);
 const auto& converted=d.timeline().resolveSurface(root).surface->pixels;
 for(std::size_t i=0;i<before.size();++i)CHECK(converted[i]==relativeLuminancePixel(before[i]));
 CHECK(converted[0]==relativeLuminancePixel(hidden));
 CHECK(d.timeline().resolveSurface(alias).source->id==root);
 CHECK(d.palette().entries.size()==palette.entries.size()&&d.palette().primary==palette.primary);
 CHECK(!d.convertColorMode(Mode::Grayscale)&&d.historyPosition()==h+1);
 const auto revision=d.revision();CHECK(!d.setPixelFormat(Format::Rgb24)&&d.revision()==revision&&d.pixelFormat()==Format::Rgb565);
 d.selectFrame(firstFrame);d.previewSelection(SelectionMask{1,1,2,1,{}});const auto selection=d.selection();
 d.undo();CHECK(d.colorMode()==Mode::Rgba&&d.frame().id==firstFrame&&selectionEqual(d.selection(),selection));
 CHECK(d.timeline().resolveSurface(root).surface->pixels==before);
 d.redo();CHECK(d.colorMode()==Mode::Grayscale&&d.frame().id==firstFrame&&selectionEqual(d.selection(),selection));
 CHECK(snapshot(d).colorMode()==Mode::Grayscale);roundtrip(d);
 const auto gray=d.canvasPixels();CHECK(d.convertColorMode(Mode::Rgba));
 CHECK(d.canvasPixels()==gray&&d.pixelFormat()==Format::Rgb565);
 d.undo();CHECK(d.colorMode()==Mode::Grayscale&&d.canvasPixels()==gray);
 bool rejected=false;try{d.convertColorMode(Mode::Indexed);}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected&&d.colorMode()==Mode::Grayscale);
 Document linked(4,2);dot(linked,{0,0},source);const auto original=linked.layer().id;
 const auto peer=linked.createLinkedLayer(original);CHECK(!peer.empty());
 RasterHistoryFixture::resource(linked);const auto resource=linked.timeline().state().tilesets[0].pixels;
 CHECK(linked.createAttachedMask(original,linked.frame().id));CHECK(linked.fillSelectionOrCanvas(0xff808080));linked.exitAttachedMask();
 const auto masks=linked.timeline().state().masks;
 CHECK(linked.convertColorMode(Mode::Grayscale));
 auto checkLinked=[&]{const auto* a=linked.timeline().findCel(original,linked.frame().id);const auto* b=linked.timeline().findCel(peer,linked.frame().id);CHECK(linked.timeline().resolveSurface(a->id).surface->pixels.identity()==linked.timeline().resolveSurface(b->id).surface->pixels.identity());};checkLinked();
 CHECK(linked.timeline().state().tilesets[0].pixels==resource);
 CHECK(linked.timeline().state().masks[0].mask.surface.pixels==masks[0].mask.surface.pixels);
 linked.undo();CHECK(linked.colorMode()==Mode::Rgba&&linked.canvasPixels()[0]==source);checkLinked();
 linked.redo();CHECK(linked.colorMode()==Mode::Grayscale);checkLinked();
 Document drawing(5,4);drawing.setImportedColorMode(Mode::Grayscale);
 CHECK(drawing.normalizeCanvasPacked(hidden)==hidden&&drawing.normalizeCanvasColor(hidden)==relativeLuminancePixel(hidden));
 const auto preview=drawing.brushPreview({2,2},{2,2},source,BrushOptions{1,100,BrushShape::Square});
 dot(drawing,{2,2},source);CHECK(drawing.canvasPixels()[12]==relativeLuminancePixel(source)&&drawing.canvasPixels()[12]==preview.at(12));
 const auto drawn=drawing.canvasPixels();drawing.undo();CHECK(drawing.canvasPixels()[12]==0);drawing.redo();CHECK(drawing.canvasPixels()==drawn);
 CHECK(drawing.fillPixels({0,0},0xff1937b9));normalized(drawing,drawing.canvasPixels());
 Document live(5,4);CHECK(live.rollbackProject(drawing)&&live.colorMode()==Mode::Grayscale);
 live.undo();CHECK(live.colorMode()==Mode::Rgba);live.redo();CHECK(live.colorMode()==Mode::Grayscale);
 for(unsigned i=0;i<8;++i){tools(Format(i),Mode::Grayscale);localHistoryFormat(Format(i),Mode::Grayscale);}
}

int main(){try{winrt::init_apartment();grayscaleContract();grayscaleTiles();grayscaleResourceHistory();for(unsigned i=0;i<8;++i){std::cout<<"format "<<i<<std::endl;const auto format=Format(i);conversion(format,false);conversion(format,true);tools(format);scriptsAndHistory(format);transforms(format);dynamicsAndAa(format);linkedLayersAndResources(format);localHistoryFormat(format);preferences::RuntimeSettings p;p.set("colorLayers.pixelFormat.Select",std::to_string(i));std::istringstream encoded(p.encode());CHECK(preferences::RuntimeSettings::decode(encoded).index("colorLayers.pixelFormat.Select")==int(i));}manifestFallback();std::cout<<"Eight RGBA pixel formats: conversion/tools/preview/history/script/save/recovery passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
