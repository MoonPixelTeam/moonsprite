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
 static void resource(Document& d){auto state=d.timeline_.state();auto t=tiles::blankTileset("independent",U"Tiles",1,1,"tile",1);t.pixels[0]=0x9729537b;state.tilesets.push_back(std::move(t));d.timeline_=timeline::Timeline(std::move(state));}
 static void run(Document& d){Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.cel().id;e.contentHistory.runs={{0,2,0,0x7f29537b}};d.applyEdit(e,true);d.pushEdit(std::move(e),U"Run");}
};}
static void dot(Document& d,Point p,Pixel value){d.beginStroke(p,value);CHECK(d.commitStroke());}
static void normalized(const Document& d,const std::vector<Pixel>& pixels){for(auto p:pixels)CHECK(d.normalizeCanvasPacked(p)==p);}
static Document snapshot(const Document& d){DocumentSnapshot s(d);while(!s.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(2))){}return s.finish();}
static void roundtrip(Document& d){for(int type=0;type<3;++type){auto encoded=type==0?project::encodeEditableProject(d):type==1?project::encodeRecoveryProject(d):project::encodeHistoryProject(d);auto m=project::readProjectManifest(encoded.bytes);CHECK(m.unsupported.empty()&&m.pixelFormat==color_mode::name(d.pixelFormat()));auto copy=project::createEditableDocument(project::prepareEditableImport(m));CHECK(copy.pixelFormat()==d.pixelFormat()&&copy.canvasPixels()==d.canvasPixels());auto again=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(copy).bytes)));CHECK(again.pixelFormat()==d.pixelFormat()&&again.canvasPixels()==d.canvasPixels());}}
static void conversion(Format format,bool sparse){
 Document d(5,4);RasterHistoryFixture::install(d,sparse);d.addLinkedFrame();const auto alias=d.cel().id;const auto root=d.timeline().resolveSurface(alias).source->id;const auto before=d.timeline().resolveSurface(root).surface->pixels;
 const auto owner=d.layer().id,frame=d.frame().id;CHECK(d.createAttachedMask(owner,frame));CHECK(d.fillSelectionOrCanvas(0xff808080));const auto masks=d.timeline().state().masks;d.exitAttachedMask();
 const auto identity=d.timeline().resolveSurface(root).surface->pixels.identity();const auto history=d.historyPosition();d.markSaved();const auto changed=d.setPixelFormat(format);CHECK(changed==(format!=Format::Rgba32));CHECK(d.historyPosition()==history&&d.pixelFormat()==format);CHECK(d.timeline().resolveSurface(alias).source->id==root&&d.timeline().resolveSurface(root).surface->pixels.identity()==identity);
 const auto& actual=d.timeline().resolveSurface(root).surface->pixels;for(std::size_t i=0;i<before.size();++i)CHECK(actual[i]==color_mode::quantizePixelColor(before[i],format));CHECK(d.timeline().state().masks.front().mask.surface.pixels==masks.front().mask.surface.pixels);
 const auto revision=d.revision();CHECK(!d.setPixelFormat(format)&&d.revision()==revision);CHECK(snapshot(d).pixelFormat()==format);roundtrip(d);
}
static void tools(Format format){
 Document d(8,6);d.setImportedPixelFormat(format);const auto blank=d.canvasPixels();constexpr Pixel color=0x9729537b;BrushOptions brush{1,100,BrushShape::Square};
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
static void localHistoryFormat(Format format){
 Document source=Document::withBuiltinPalette(3,2,U"History format");source.setImportedPixelFormat(format);
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
int main(){try{winrt::init_apartment();for(unsigned i=0;i<8;++i){std::cout<<"format "<<i<<std::endl;const auto format=Format(i);conversion(format,false);conversion(format,true);tools(format);scriptsAndHistory(format);transforms(format);dynamicsAndAa(format);linkedLayersAndResources(format);localHistoryFormat(format);preferences::RuntimeSettings p;p.set("colorLayers.pixelFormat.Select",std::to_string(i));std::istringstream encoded(p.encode());CHECK(preferences::RuntimeSettings::decode(encoded).index("colorLayers.pixelFormat.Select")==int(i));}manifestFallback();std::cout<<"Eight RGBA pixel formats: conversion/tools/preview/history/script/save/recovery passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
