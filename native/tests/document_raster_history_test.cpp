#include "document.h"
#include "local_history_edit.h"
#include "layer_compositor.h"
#include "raster_geometry.h"
#include "selection_pattern_brush.h"
#include "layer_compositor.h"
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <limits>
#define CHECK(x) do{if(!(x))throw std::runtime_error(std::string("line ")+std::to_string(__LINE__)+": "+#x);}while(false)
#if defined(_MSC_VER)
#define MOON_HISTORY_FIXTURE_NOINLINE __declspec(noinline)
#else
#define MOON_HISTORY_FIXTURE_NOINLINE
#endif
namespace moon {
struct RasterHistoryFixture {
 static MOON_HISTORY_FIXTURE_NOINLINE void groupPreparationAtomicity(){
  auto document=std::make_unique<Document>(2,2);auto& d=*document;{auto scope=d.trackAnimationSelectionHistory();d.commitSelection({},SelectionMask{0,0,2,2,{}},false);}d.deselectPixels();CHECK(!d.dirty()&&d.historySize()==2);
  const auto bytes=d.historyBytes(),revision=d.historyRevision(),position=d.historyPosition();
  d.setAnimationSelectionAccess({[](const Document&)->std::optional<AnimationSessionSelection>{throw std::bad_alloc();},{}});
  bool rejected=false;try{d.groupEdits(0,{});}catch(const std::bad_alloc&){rejected=true;}
  CHECK(rejected&&d.historySize()==2&&d.historyPosition()==position&&d.historyBytes()==bytes&&d.historyRevision()==revision);
  CHECK(d.history_.at(0).pixelSelectionHistory.afterPixelsSelection&&d.history_.at(1).pixelSelectionHistory.beforePixelsSelection);
  d.setAnimationSelectionAccess({});d.groupEdits(0,{});
  CHECK(d.historySize()==1&&d.history_.latest().children.size()==2&&!d.history_.latest().documentChanged&&!d.dirty());
  const auto groupedBytes=d.historyBytes();d.undo();CHECK(!d.dirty()&&!d.selection());d.redo();CHECK(!d.dirty()&&!d.selection()&&d.historyBytes()==groupedBytes);
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void localTerminalPreparation(){
  using History=local_history::PixelHistoryEdit;using Field=History::MetadataField;
  for(bool forward:{false,true})for(int route=0;route<3;++route)for(int scenario=0;scenario<8;++scenario){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto* surface=d.activeSurfaceIfPresent();d.pixelStorage()={0x00010203,0xff112233,0,0};
   const auto pixels=d.canvasPixels();const auto storage=surface->pixels.identity();
   auto payload=std::make_shared<History>();History::Patch good,bad;
   good.owners={d.cel().id};good.before=std::make_shared<const std::vector<std::uint8_t>>(1,0x11);good.after=std::make_shared<const std::vector<std::uint8_t>>(1,0x22);
   if(scenario<5){auto metadata=std::make_shared<History::MetadataPatch>();
    switch(scenario){
     case 0:metadata->fields={{Field::Dirty,{}}};metadata->before=metadata->after=1.;break;
     case 1:metadata->fields={{Field::GridWidth,{}}};metadata->before=metadata->after=true;break;
     case 2:metadata->fields={{Field::LayerDescription,d.layer().id}};metadata->before=metadata->after=false;break;
     case 3:metadata->fields={{Field::CelZIndex,d.cel().id}};metadata->before=metadata->after=std::numeric_limits<double>::infinity();break;
     case 4:metadata->fields={{Field::StrokeCount,{}}};metadata->before=metadata->after=18446744073709551616.;break;
    }bad.metadata=std::move(metadata);
   }else{bad=good;if(scenario==5)bad.before.reset();else if(scenario==6)bad.before=std::make_shared<const std::vector<std::uint8_t>>(2,0x33);else bad.offset=100;}
   if(forward)payload->patches={good,bad};else payload->patches={bad,good};
   Document::Edit edit{{},d.state_,d.nextState_};edit.terminalHistory=Document::LocalPixelsReplay{payload};
   if(route==2){Document::Edit parent{{},d.state_,d.nextState_};parent.children.push_back(std::move(edit));d.pushEdit(std::move(parent));if(forward)d.history_.undo([](const auto&){});}
   const auto bytes=d.historyBytes(),position=d.historyPosition(),revision=d.revision(),content=d.contentRevision(),history=d.historyRevision();const bool dirty=d.dirty();const auto information=d.projectInformation_;const auto grid=d.customGrid_;
   d.change_={1,1,1,1};bool rejected=false;
   try{if(route==0)d.applyLocalHistoryPixels(*payload,forward);else if(route==1)d.applyEdit(edit,forward);else if(forward)d.redo();else d.undo();}catch(const std::logic_error&){rejected=true;}
   if(!rejected||d.canvasPixels()!=pixels||d.timeline_.resolveSurface(d.cel().id).surface->pixels.identity()!=storage)
    throw std::runtime_error("Terminal preparation forward="+std::to_string(forward)+" route="+std::to_string(route)+" scenario="+std::to_string(scenario)+" rejected="+std::to_string(rejected)+" pixels="+std::to_string(d.canvasPixels()==pixels)+" storage="+std::to_string(d.timeline_.resolveSurface(d.cel().id).surface->pixels.identity()==storage));
   CHECK(d.historyBytes()==bytes&&d.historyPosition()==position&&d.revision()==revision&&d.contentRevision()==content&&d.historyRevision()==history&&d.dirty()==dirty);
   CHECK(d.projectInformation_.createdAt==information.createdAt&&d.customGrid_.x==grid.x&&d.customGrid_.width==grid.width&&d.layer().description.empty());
   CHECK(d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);
  }
  // The projected opacity uses the last patch in replay order, including undo.
  for(bool forward:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;History edit;edit.projectFrame=true;
   for(double opacity:{.25,.75}){auto metadata=std::make_shared<History::MetadataPatch>();metadata->fields={{Field::CelOpacity,d.cel().id}};metadata->before=opacity/2;metadata->after=opacity;History::Patch patch;patch.metadata=std::move(metadata);edit.patches.push_back(std::move(patch));}
   d.applyLocalHistoryPixels(edit,forward);CHECK(d.layer().opacity==(forward?.75:.125));CHECK(d.cel().opacity==d.layer().opacity);
  }
  for(bool forward:{false,true})for(int scenario=0;scenario<2;++scenario){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;CHECK(d.fillSelectionOrCanvas(0xff123456));CHECK(d.createAttachedMask(d.layer().id,d.frame().id));d.exitAttachedMask();
   const auto& mask=d.timeline_.state().masks.front().mask;const auto pixels=mask.surface.pixels;const auto identity=mask.surface.pixels.identity();
   Document::MaskRasterHistory edit{mask.id,Document::MaskRasterGeometry::capture(mask.surface),Document::MaskRasterGeometry::capture(mask.surface),2,{{0,0,0xffffffff}}};
   if(scenario==0)edit.canvasWidth=0;else (forward?edit.after:edit.before).width=0;
   bool rejected=false;try{d.applyMaskRasterHistory(edit,forward);}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.timeline_.state().masks.front().mask.surface.pixels==pixels&&d.timeline_.state().masks.front().mask.surface.pixels.identity()==identity);
  }
  for(bool forward:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;Document::Edit edit{{},d.state_,d.nextState_};edit.terminalHistory=Document::TilemapPixelsReplay{std::make_shared<Document::TilemapPixelHistory>()};
   bool rejected=false;try{d.applyTilemapPixelHistory(edit,forward);}catch(const std::logic_error&){rejected=true;}CHECK(rejected);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void leafRetainedCompensation(){
  for(bool forward:{false,true})for(int scenario=0;scenario<5;++scenario){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;d.addLayer();
   const auto owner=d.cel().id,layer=d.layer().id,frame=d.frame().id;
   timeline::Surface fixture;fixture.width=fixture.height=2;fixture.pixels={0x00010203,0x80445566,0xff778899,0x00112233};install(d,std::move(fixture));
   CHECK(d.createAttachedMask(layer,frame));d.exitAttachedMask();
   const auto* surface=d.activeSurfaceIfPresent();
   const auto identity=surface->pixels.identity(),maskIdentity=d.timeline_.state().masks.front().mask.surface.pixels.identity();
   const auto original=*d.timeline_.findCelById(owner);const auto pixels=d.canvasPixels();const auto name=d.layer().name;const auto duration=d.frame().duration;const auto primary=d.palette_.primary;
   Document::Edit root{{},d.state_,d.nextState_},good{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   root.snapshotHistory.beforeDimensions=root.snapshotHistory.afterDimensions=std::pair<int,int>{2,2};
   good.contentHistory.targetCelId=owner;good.contentHistory.pixelAddress=Document::PixelAddressSpace{2,2,0,0};
   // Overlapping representations deliberately do not encode the actual entry
   // state. A failed transaction must restore retained bytes, not infer them.
   good.pixels={{0,0xffabcdef,0xff123456},{0,0xff000001,0xff000002}};
   good.contentHistory.runs={{0,3,0xff998877,0xff665544},{1,2,0xff101010,0xff202020}};
   good.contentHistory.dense=Document::DensePixels{1,0,1,2,{0xff010101,0xff020202},{0xff030303,0xff040404}};
   if(scenario){
    good.layerHistory.targetLayerId=layer;good.layerHistory.beforeName=good.layerHistory.afterName=U"temporary leaf name";
    good.frameHistory.targetFrameId=frame;good.frameHistory.beforeDuration=good.frameHistory.afterDuration=321;
    good.frameHistory.beforeDisabled=good.frameHistory.afterDisabled={{frame,true}};
    good.paletteHistory.paletteKind=12;good.paletteHistory.beforePalette=good.paletteHistory.afterPalette=d.palette_;
    good.paletteHistory.beforePalette->primary=good.paletteHistory.afterPalette->primary=0xffabcdef;
    CelPropertiesPlan properties;properties.groups.push_back({owner,{owner},{.2,2}});properties.after={.3,3};good.contentHistory.celProperties=std::move(properties);
    for(auto it=d.timeline_.state().layers.rbegin();it!=d.timeline_.state().layers.rend();++it)good.layerHistory.beforeOrder.push_back(it->id);good.layerHistory.afterOrder=good.layerHistory.beforeOrder;
    auto replacement=*surface;replacement.offsetX=7;replacement.pixels={1,2,3,4};good.contentHistory.surfaceChanges.push_back({owner,replacement,replacement});
   }
   if(scenario>=2){auto replacement=original;replacement.opacity=.4;replacement.surface->pixels={11,12,13,14};if(scenario==3)replacement.linkedCelId="missing-after-leaf-content";good.contentHistory.beforeCels=good.contentHistory.afterCels={replacement};}
   if(scenario==4){
    good.beforeActive=good.afterActive=layer;good.beforeFrame=good.afterFrame=frame;
    good.layerHistory.beforeLayerStructure=Document::LayerStructureSnapshot{d.timeline_.state().layers,d.timeline_.state().groups};
    auto& target=*good.layerHistory.beforeLayerStructure;target.layers.erase(std::remove_if(target.layers.begin(),target.layers.end(),[&](const auto& item){return item.id!=layer;}),target.layers.end());target.masks=d.timeline_.state().masks;
    good.layerHistory.afterLayerStructure=good.layerHistory.beforeLayerStructure;
    good.layerHistory.beforeOrder=good.layerHistory.afterOrder={layer};
   }
   bad.contentHistory.targetCelId=owner;bad.contentHistory.pixelAddress=Document::PixelAddressSpace{2,2,0,0};bad.pixels={{4,0,1}};
   if(scenario==3)root.children.push_back(std::move(good));
   else{if(forward)root.children.push_back(std::move(good));root.children.push_back(std::move(bad));if(!forward)root.children.push_back(std::move(good));}
   bool rejected=false;try{d.applyEdit(root,forward);}catch(const std::exception&){rejected=true;}
   const auto* restored=d.timeline_.findCelById(owner);
   CHECK(rejected&&restored&&restored->surface->pixels.identity()==identity&&d.canvasPixels()==pixels&&restored->opacity==original.opacity&&restored->zIndex==original.zIndex&&!restored->linkedCelId);
   CHECK(d.timeline_.state().layers.size()==2&&d.layer().name==name&&d.frame().duration==duration&&!d.frame().disabled&&d.palette_.primary==primary&&d.timeline_.state().masks.size()==1&&d.timeline_.state().masks.front().mask.surface.pixels.identity()==maskIdentity);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void leafLinkedWriteOrdering(){
  auto document=std::make_unique<Document>(2,2);auto& d=*document;d.addLayer();
  auto state=d.timeline_.state();for(auto& layer:state.layers)layer.linkedContentId="leaf-linked-owner-order";
  d.timeline_=timeline::Timeline(std::move(state));
  const auto owner=d.cel().id;const auto other=std::find_if(d.timeline_.state().cels.begin(),d.timeline_.state().cels.end(),[&](const auto& cel){return cel.id!=owner;});CHECK(other!=d.timeline_.state().cels.end());
  auto replacement=*other;replacement.surface->pixels[0]=0xffabcdef;
  Document::Edit edit{{},d.state_,d.nextState_};edit.contentHistory.targetCelId=owner;edit.pixels={{0,0,0x00112233}};
  edit.contentHistory.beforeCels={*other};edit.contentHistory.afterCels={replacement};edit.beforeActive=edit.afterActive=d.layer().id;edit.beforeFrame=edit.afterFrame=d.frame().id;
  for(const auto& layer:d.timeline_.state().layers)edit.layerHistory.beforeOrder.push_back(layer.id);edit.layerHistory.afterOrder=edit.layerHistory.beforeOrder;
  d.applyEdit(edit,true);const auto a=d.timeline_.resolveSurface(owner),b=d.timeline_.resolveSurface(replacement.id);
  CHECK(a.surface&&b.surface&&a.surface->pixels[0]==0x00112233&&b.surface->pixels[0]==0x00112233&&a.surface->pixels.identity()==b.surface->pixels.identity());
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void leafRetainedReapply(){
  auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto owner=d.cel().id;
  const auto identity=d.cel().surface->pixels.identity();const auto before=d.canvasPixels();const auto name=d.layer().name;
  Document::Edit edit{{},d.state_,d.nextState_};edit.contentHistory.targetCelId=owner;edit.pixels={{0,0,0x00010203}};
  edit.layerHistory.targetLayerId=d.layer().id;edit.layerHistory.beforeName=name;edit.layerHistory.afterName=U"retained publication";
  Document::HistoryReplayPlan plan(edit,true);
  d.applyValidatedEdit(edit,true,plan);CHECK(d.canvasPixels()[0]==0x00010203&&d.layer().name==U"retained publication");
  d.applyValidatedEdit(edit,false,plan);CHECK(d.canvasPixels()==before&&d.layer().name==name&&d.cel().surface->pixels.identity()==identity);
  d.applyValidatedEdit(edit,true,plan);CHECK(d.canvasPixels()[0]==0x00010203&&d.layer().name==U"retained publication");
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void palettePreparedOwnership(){
  auto document=std::make_unique<Document>(2,2);auto& d=*document;
  const auto baseline=d.palette_;const auto id=baseline.entries.front().id;const auto other=baseline.entries.back().color;
  Document::Edit edit{{},d.state_,d.nextState_};edit.paletteHistory.beforePalette=edit.paletteHistory.afterPalette=baseline;
  edit.paletteHistory.paletteKind=3;edit.paletteHistory.colorId=id;edit.paletteHistory.afterPalette->entries.front().color=0x00112233;
  d.palette_.primary=baseline.entries.front().color;d.palette_.secondary=other;
  auto prepared=d.preparePaletteEdit(edit,true);CHECK(prepared&&!prepared->full&&!prepared->entries&&prepared->patches.size()==1);
  d.exchangePaletteEdit(*prepared);CHECK(d.palette_.entries.front().color==0x00112233&&d.palette_.primary==0x00112233&&d.palette_.secondary==other);
  d.exchangePaletteEdit(*prepared);CHECK(d.palette_.entries.front().color==baseline.entries.front().color&&d.palette_.primary==baseline.entries.front().color&&d.palette_.secondary==other);
  edit.paletteHistory.paletteKind=7;edit.paletteHistory.afterPalette->secondary=1;edit.paletteHistory.afterPalette->secondaryId=999;d.palette_.secondary=0xffabcdef;d.palette_.secondaryId=12;
  prepared=d.preparePaletteEdit(edit,true);d.exchangePaletteEdit(*prepared);CHECK(d.palette_.secondary==0xffabcdef&&d.palette_.secondaryId==12);d.exchangePaletteEdit(*prepared);
  edit.paletteHistory.paletteKind=11;auto duplicate=edit.paletteHistory.afterPalette->entries.front();duplicate.name=U"last duplicate name";edit.paletteHistory.afterPalette->entries.push_back(duplicate);
  edit.paletteHistory.afterPalette->independentOrder.reset();d.palette_.independentOrder=std::vector<int>{id};
  prepared=d.preparePaletteEdit(edit,true);d.exchangePaletteEdit(*prepared);CHECK(d.palette_.entries.size()==baseline.entries.size()&&d.palette_.entries.front().name==duplicate.name&&!d.palette_.independentOrder);d.exchangePaletteEdit(*prepared);CHECK(d.palette_.entries.front().name==baseline.entries.front().name&&d.palette_.independentOrder==std::optional<std::vector<int>>{std::vector<int>{id}});
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void rollbackLateFailure(){
  for(bool forward:{false,true})for(bool sibling:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;
   CHECK(d.fillSelectionOrCanvas(0xff123456));
   d.selection_=SelectionMask{0,0,1,1,{}};d.selectionRevision_=17;d.selectedFrames_={d.activeFrameId_};d.frameAnchor_=d.activeFrameId_;
   d.timelapseSettings_.fps=12;std::vector<int> recordingRestores;d.recordingBinding_.restore=[&](const timelapse::Settings& settings){recordingRestores.push_back(settings.fps);};
   auto target=std::make_shared<Document::RollbackPayload>(*d.captureRollbackPayload());
   target->width=3;target->height=4;target->timelapse.fps=24;target->palette.primary=0xffabcdef;target->timeline.layers.front().name=U"rollback target";
   target->timeline.cels.front().surface->pixels[0]=0xffabcdef;
   const auto identity=d.cel().surface->pixels.identity();const auto brushRevision=d.projectBrushRevision_;const auto pixels=d.canvasPixels();const auto primary=d.palette_.primary;
   const auto active=d.activeLayerId_,frame=d.activeFrameId_;const auto name=d.layer().name;const auto selection=d.selection_;
   Document::Edit root{{},d.state_,d.nextState_},restored{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   restored.snapshotHistory.beforeRollback=restored.snapshotHistory.afterRollback=target;
   bad.contentHistory.targetCelId=d.cel().id;bad.contentHistory.pixelAddress=Document::PixelAddressSpace{2,2,0,0};bad.pixels.push_back({4,0,1});
   if(sibling){if(forward)root.children.push_back(std::move(restored));root.children.push_back(std::move(bad));if(!forward)root.children.push_back(std::move(restored));}
   else{restored.children.push_back(std::move(bad));root=std::move(restored);}
   bool rejected=false;try{d.applyEdit(root,forward);}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.width_==2&&d.height_==2&&d.layer().name==name&&d.activeLayerId_==active&&d.activeFrameId_==frame&&d.cel().surface->pixels.identity()==identity&&d.canvasPixels()==pixels);
   CHECK(d.projectBrushRevision_==brushRevision&&d.palette_.primary==primary&&selectionEqual(d.selection_,selection)&&d.selectionRevision_==17&&d.timelapseSettings_.fps==12&&recordingRestores==std::vector<int>({24,12}));
  }
  {auto document=std::make_unique<Document>(2,2);auto& d=*document;auto target=std::make_shared<Document::RollbackPayload>(*d.captureRollbackPayload());target->timelapse.fps=24;target->width=7;
   const auto identity=d.cel().surface->pixels.identity();std::vector<int> recordingRestores;
   d.recordingBinding_.restore=[&](const timelapse::Settings& settings){recordingRestores.push_back(settings.fps);if(settings.fps==24)throw std::range_error("recording restore rejected");};
   bool rejected=false;try{d.applyRollbackPayload(*target);}catch(const std::range_error&){rejected=true;}
   CHECK(rejected&&d.width_==2&&d.cel().surface->pixels.identity()==identity&&d.timelapseSettings_.fps==12&&recordingRestores==std::vector<int>({24,12}));
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void replayFailureFocus(){
  for(bool forward:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto initialFrame=d.activeFrameId_;d.addFrame();
   const auto other=d.cel().id;d.selectFrame(initialFrame);
   d.timelineSelection_.layers={d.activeLayerId_};d.timelineSelection_.layerAnchor=d.activeLayerId_;
   d.selectedFrames_={initialFrame};d.frameAnchor_=initialFrame;
   d.freeInstanceSelected_={"retained-instance"};d.freeInstancePrimary_=d.freeInstanceAnchor_="retained-instance";d.freeInstanceSelectionFrame_=initialFrame;d.freeInstanceViewLayer_=d.activeLayerId_;
   const auto before=d.captureAnimationSelection();const auto geometry=d.displayedLayerGeometry_;
   const auto content=d.contentRevision_,mutation=d.contentMutationRevision_,revision=d.revision_,selectionRevision=d.selectionRevision_;
   const auto recording=d.recordingDirty_;const auto recordingFrom=d.recordingDirtyFrom_,recordingTo=d.recordingDirtyTo_;const bool recordingValid=d.recordingDirtyValid_;
   Document::Edit parent{{},d.state_,d.nextState_},good{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   parent.snapshotHistory.beforeDimensions=parent.snapshotHistory.afterDimensions=std::pair<int,int>{2,2};
   good.contentHistory.targetCelId=other;bad.contentHistory.targetCelId=d.cel().id;
   good.contentHistory.pixelAddress=bad.contentHistory.pixelAddress=Document::PixelAddressSpace{2,2,0,0};
   good.pixels.push_back({0,forward?Pixel(0):Pixel(0xff123456),forward?Pixel(0xff123456):Pixel(0)});bad.pixels.push_back({4,0,0xffabcdef});
   if(forward)parent.children.push_back(std::move(good));parent.children.push_back(std::move(bad));if(!forward)parent.children.push_back(std::move(good));
   bool rejected=false;try{d.applyEdit(parent,forward);}catch(const std::logic_error&){rejected=true;}
   CHECK(d.timeline_.findCelById(other)->surface->pixels[0]==0);
   const auto after=d.captureAnimationSelection();CHECK(rejected&&after.activeLayer==before.activeLayer&&after.activeFrame==before.activeFrame&&after.frames==before.frames&&after.frameAnchor==before.frameAnchor&&after.selection.layers==before.selection.layers&&after.selection.layerAnchor==before.selection.layerAnchor);
   CHECK(d.freeInstanceSelected_==std::vector<std::string>{"retained-instance"}&&d.freeInstancePrimary_=="retained-instance"&&d.freeInstanceAnchor_=="retained-instance"&&d.freeInstanceSelectionFrame_==initialFrame&&d.freeInstanceViewLayer_==before.activeLayer);
   CHECK(d.displayedLayerGeometry_==geometry&&d.contentRevision_==content&&d.contentMutationRevision_==mutation&&d.revision_==revision&&d.selectionRevision_==selectionRevision);
   CHECK(d.recordingDirtyFrom_==recordingFrom&&d.recordingDirtyTo_==recordingTo&&d.recordingDirtyValid_==recordingValid&&d.recordingDirty_.x==recording.x&&d.recordingDirty_.y==recording.y&&d.recordingDirty_.w==recording.w&&d.recordingDirty_.h==recording.h);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void structuralSiblingFailure(){
  for(bool forward:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;d.addLayer();d.selectLayer(d.timeline_.state().layers.front().id);
   const auto layers=d.timeline_.state().layers;const auto active=d.activeLayerId_,frame=d.activeFrameId_;
   const auto identity=d.cel().surface->pixels.identity();d.selectionPivotHistory_={23,TransformPoint{.25,.75}};
   d.animationLoop_=false;d.sliceState_.selected={"original-selection"};
   Document::Edit root{{},d.state_,d.nextState_},structure{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   structure.beforeActive=structure.afterActive=active;structure.beforeFrame=structure.afterFrame=frame;
   structure.layerHistory.beforeLayerStructure=Document::LayerStructureSnapshot{layers,d.timeline_.state().groups};
   structure.layerHistory.beforeLayerStructure->layers.pop_back();structure.layerHistory.beforeLayerStructure->layers.front().name=U"successful structural child";
   structure.layerHistory.afterLayerStructure=structure.layerHistory.beforeLayerStructure;
   structure.sliceHistory.beforeSlices=structure.sliceHistory.afterSlices=SliceState{{},{"candidate-selection"}};
   structure.pixelSelectionHistory.beforeTrimPivot.emplace(TransformPoint{7,8});structure.pixelSelectionHistory.afterTrimPivot.emplace(TransformPoint{9,10});
   structure.frameHistory.beforeAnimationLoop=structure.frameHistory.afterAnimationLoop=true;
   bad.contentHistory.targetCelId=d.cel().id;bad.contentHistory.pixelAddress=Document::PixelAddressSpace{2,2,0,0};bad.pixels.push_back({4,0,1});
   if(forward)root.children.push_back(std::move(structure));root.children.push_back(std::move(bad));if(!forward)root.children.push_back(std::move(structure));
   bool rejected=false;try{d.applyEdit(root,forward);}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.timeline_.state().layers.size()==layers.size()&&d.layer().name==layers.front().name&&d.activeLayerId_==active&&d.activeFrameId_==frame&&d.cel().surface->pixels.identity()==identity);
   CHECK(d.selectionPivotHistory_.serial==23&&d.selectionPivotHistory_.pivot->x==.25&&!d.animationLoop_&&d.sliceState_.selected==std::vector<std::string>{"original-selection"});
   CHECK(root.children[forward?0:1].layerHistory.structureCels.empty());
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void structuralLateFailure(){
  for(bool forward:{false,true})for(bool nested:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;d.addLayer();d.selectLayer(d.timeline_.state().layers.front().id);
   const auto layer=d.activeLayerId_,frame=d.activeFrameId_;const auto originalLayers=d.timeline_.state().layers;
   std::vector<const void*> identities;for(const auto& cel:d.timeline_.state().cels)identities.push_back(cel.surface->pixels.identity());
   Document::Edit root{{},d.state_,d.nextState_},parent{{},d.state_,d.nextState_},good{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   parent.beforeActive=parent.afterActive=layer;parent.beforeFrame=parent.afterFrame=frame;
   parent.layerHistory.beforeLayerStructure=Document::LayerStructureSnapshot{originalLayers,d.timeline_.state().groups};
   parent.layerHistory.beforeLayerStructure->layers.pop_back();parent.layerHistory.beforeLayerStructure->layers.front().name=U"temporary structural replay";
   parent.layerHistory.afterLayerStructure=parent.layerHistory.beforeLayerStructure;
   good.contentHistory.targetCelId=bad.contentHistory.targetCelId=d.cel().id;
   good.contentHistory.pixelAddress=bad.contentHistory.pixelAddress=Document::PixelAddressSpace{2,2,0,0};
   good.pixels.push_back({0,forward?Pixel(0):Pixel(0xff123456),forward?Pixel(0xff123456):Pixel(0)});bad.pixels.push_back({4,0,0xffabcdef});
   if(forward)parent.children.push_back(std::move(good));parent.children.push_back(std::move(bad));if(!forward)parent.children.push_back(std::move(good));
   if(nested)root.children.push_back(std::move(parent));else root=std::move(parent);
   const auto pixels=d.canvasPixels();const auto history=d.historySize();const auto revision=d.revision(),content=d.contentRevision();
   d.change_={1,1,1,1};bool rejected=false;try{d.applyEdit(root,forward);}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.timeline_.state().layers.size()==originalLayers.size()&&d.layer().name==originalLayers.front().name);
   CHECK(d.activeLayerId_==layer&&d.activeFrameId_==frame&&d.canvasPixels()==pixels&&d.historySize()==history&&d.revision()==revision&&d.contentRevision()==content);
   const auto& replayed=nested?root.children.front():root;CHECK(replayed.layerHistory.structureCels.empty());
   for(std::size_t i=0;i<identities.size();++i)CHECK(d.timeline_.state().cels[i].surface->pixels.identity()==identities[i]);
   CHECK(d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void scalarLateFailure(){
  for(bool forward:{false,true})for(bool nested:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;
   d.sliceState_.items.push_back({"original",U"original",{0,0,1,1}});d.sliceState_.selected={"original"};
   d.selectionPivotHistory_.serial=19;d.selectionPivotHistory_.pivot=TransformPoint{.25,.75};d.animationLoop_=false;
   Document::Edit root{{},d.state_,d.nextState_},parent{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   parent.sliceHistory.beforeSlices=SliceState{{{"candidate-before",U"before",{1,1,1,1}}},{"candidate-before"}};
   parent.sliceHistory.afterSlices=SliceState{{{"candidate-after",U"after",{1,1,1,1}}},{"candidate-after"}};
   parent.pixelSelectionHistory.beforeTrimPivot.emplace(TransformPoint{3,4});parent.pixelSelectionHistory.afterTrimPivot.emplace(TransformPoint{5,6});
   parent.frameHistory.beforeAnimationLoop=true;parent.frameHistory.afterAnimationLoop=true;
   // Exercise phase recovery rather than stable-target whole-tree rejection.
   parent.snapshotHistory.beforeDimensions=parent.snapshotHistory.afterDimensions=std::pair<int,int>{2,2};
   bad.contentHistory.targetCelId=d.cel().id;bad.contentHistory.pixelAddress=Document::PixelAddressSpace{2,2,0,0};bad.pixels.push_back({4,0,0xffabcdef});
   parent.children.push_back(std::move(bad));if(nested)root.children.push_back(std::move(parent));else root=std::move(parent);
   bool rejected=false;try{d.applyEdit(root,forward);}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.sliceState_.items.size()==1&&d.sliceState_.items.front().id=="original"&&d.sliceState_.selected==std::vector<std::string>{"original"});
   CHECK(!d.animationLoop_&&d.selectionPivotHistory_.serial==19&&d.selectionPivotHistory_.pivot&&d.selectionPivotHistory_.pivot->x==.25&&d.selectionPivotHistory_.pivot->y==.75);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void snapshotLateFailure(){
  for(bool forward:{false,true})for(bool contentBeforeFailure:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;
   Document::Edit parent{{},d.state_,d.nextState_},good{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   parent.snapshotHistory.beforeTimeline=parent.snapshotHistory.afterTimeline=d.timeline_.state();
   parent.snapshotHistory.beforeTimeline->layers.front().name=U"candidate-before";parent.snapshotHistory.afterTimeline->layers.front().name=U"candidate-after";
   parent.snapshotHistory.beforeDimensions=std::pair<int,int>{7,9};parent.snapshotHistory.afterDimensions=std::pair<int,int>{11,13};
   parent.beforeActive=parent.afterActive=d.activeLayerId_;parent.beforeFrame=parent.afterFrame=d.activeFrameId_;
   good.contentHistory.targetCelId=bad.contentHistory.targetCelId=d.cel().id;good.pixels.push_back({0,0,0xff123456});bad.pixels.push_back({4,0,0xffabcdef});
   if(contentBeforeFailure&&forward)parent.children.push_back(std::move(good));parent.children.push_back(std::move(bad));if(contentBeforeFailure&&!forward)parent.children.push_back(std::move(good));
   d.pushEdit(std::move(parent));if(forward)d.history_.undo([](const auto&){},[](const auto&){});
   const auto identity=d.cel().surface->pixels.identity();const auto pixels=d.canvasPixels();const auto name=d.layer().name;
   const auto layer=d.activeLayerId_,frame=d.activeFrameId_;const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision();d.change_={1,1,1,1};
   bool rejected=false;try{if(forward)d.redo();else d.undo();}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.width_==2&&d.height_==2&&d.layer().name==name&&d.activeLayerId_==layer&&d.activeFrameId_==frame);
   CHECK(d.cel().surface->pixels.identity()==identity&&d.canvasPixels()==pixels&&d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content);
   CHECK(d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void structuralSurfaceTransferFailure(){
  for(bool forward:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;d.addLayer();
   auto& state=const_cast<timeline::State&>(d.timeline_.state());auto& first=*state.cels.front().surface;auto& second=*state.cels.back().surface;
   second.offsetX=std::numeric_limits<int>::max();second.storageOriginX=std::numeric_limits<int>::min();first.storageOriginX=0;first.pixels[0]=0xff123456;
   Document::Edit edit{{},d.state_,d.nextState_};edit.beforeActive=edit.afterActive=d.activeLayerId_;edit.beforeFrame=edit.afterFrame=d.activeFrameId_;
   edit.layerHistory.beforeLayerStructure=Document::LayerStructureSnapshot{d.timeline_.state().layers,d.timeline_.state().groups};
   edit.layerHistory.afterLayerStructure=edit.layerHistory.beforeLayerStructure;
   for(auto* snapshot:{&*edit.layerHistory.beforeLayerStructure,&*edit.layerHistory.afterLayerStructure})for(auto& layer:snapshot->layers)layer.linkedContentId="shared-structural";
   std::vector<const void*> identities;for(const auto& cel:d.timeline_.state().cels)identities.push_back(cel.surface->pixels.identity());
   bool rejected=false;try{d.applyLayerStructure(edit,forward);}catch(const std::overflow_error&){rejected=true;}
   CHECK(rejected&&edit.layerHistory.structureCels.empty());
   for(std::size_t i=0;i<identities.size();++i)CHECK(d.timeline_.state().cels[i].surface&&d.timeline_.state().cels[i].surface->pixels.identity()==identities[i]);
   CHECK(d.timeline_.state().layers.front().linkedContentId.empty()&&d.timeline_.state().cels.back().surface->offsetX==std::numeric_limits<int>::max());
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void animationSelectionSnapshot(){
  auto document=std::make_unique<Document>(3,2);auto& d=*document;
  CHECK(d.fillSelectionOrCanvas(0xff123456));const auto owner=d.layer().id,frame=d.frame().id,cel=d.cel().id;
  CHECK(d.createAttachedMask(owner,frame));d.exitAttachedMask();d.selectTimelineLayer(owner);CHECK(d.createLayerGroup());const auto group=d.timeline().state().groups.back().id;
  d.addFrame();const auto otherFrame=d.frame().id;d.selectFrame(frame);CHECK(d.selectAttachedMask(owner,frame,true));
  d.timelineSelection_={{owner},{cel},owner,cel,{owner}};d.selectedFrames_={frame,otherFrame};d.frameAnchor_=otherFrame;d.selectedGroupIds_={group};d.selectedGroupId_.reset();
  const auto snapshot=d.captureAnimationSelection();const auto position=d.historyPosition(),bytes=d.historyBytes();const auto pixels=d.canvasPixels();
  auto equal=[](const auto& a,const auto& b){return a.identity==b.identity&&a.selection.layers==b.selection.layers&&a.selection.cels==b.selection.cels&&a.selection.layerAnchor==b.selection.layerAnchor&&a.selection.celAnchor==b.selection.celAnchor&&a.selection.maskRows==b.selection.maskRows&&a.frames==b.frames&&a.groups==b.groups&&a.groupFocus==b.groupFocus&&a.activeLayer==b.activeLayer&&a.activeFrame==b.activeFrame&&a.frameAnchor==b.frameAnchor&&a.activeMask==b.activeMask&&a.activeMaskSlot==b.activeMaskSlot&&a.maskIsolated==b.maskIsolated;};
  d.exitAttachedMask();d.clearTimelineSelection();d.selectFrame(otherFrame);d.selectTimelineRow({LayerPanelKind::Group,group,0});
  CHECK(d.restoreAnimationSelection(snapshot)&&equal(d.captureAnimationSelection(),snapshot));
  CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.canvasPixels()==pixels);
  auto invalid=snapshot;invalid.identity=0;CHECK(!d.restoreAnimationSelection(invalid)&&equal(d.captureAnimationSelection(),snapshot));
  invalid=snapshot;invalid.activeFrame="missing-snapshot-frame";CHECK(!d.restoreAnimationSelection(invalid)&&equal(d.captureAnimationSelection(),snapshot));
  // A stale slot must not activate a different mask installed at that key.
  invalid=snapshot;invalid.activeMask="replaced-mask-id";CHECK(d.restoreAnimationSelection(invalid)&&d.activeMaskId().empty());
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void snapshotPreflightFailure(){
  for(bool forward:{false,true})for(bool child:{false,true})for(int failure=0;failure<8;++failure){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto layer=d.layer().id,frame=d.frame().id,cel=d.cel().id;
   CHECK(d.fillSelectionOrCanvas(0xff010203));CHECK(d.createAttachedMask(layer,frame));d.exitAttachedMask();d.markSaved();
   Document::Edit parent{{},d.state_,d.nextState_};
   parent.maskHistory.beforeMasks=parent.maskHistory.afterMasks=d.timeline_.state().masks;
   parent.maskHistory.beforeMasks->front().mask.surface.pixels[0]=0xff123456;
   parent.maskHistory.afterMasks->front().mask.surface.pixels[0]=0xff123456;
   parent.maskHistory.beforeMaskSelection=parent.maskHistory.afterMaskSelection=std::vector<Document::MaskSlotKey>{{layer,frame}};
   parent.snapshotHistory.beforeDimensions=std::pair<int,int>{7,9};parent.snapshotHistory.afterDimensions=std::pair<int,int>{11,13};
   Document::Edit snapshot{{},d.state_,d.nextState_};snapshot.snapshotHistory.beforeTimeline=snapshot.snapshotHistory.afterTimeline=d.timeline_.state();
   if(child){Document::Edit good{{},d.state_,d.nextState_};good.contentHistory.targetCelId=cel;good.pixels.push_back({0,0x00010203,0xff765432});if(forward){parent.children.push_back(std::move(good));parent.children.push_back(std::move(snapshot));}else{parent.children.push_back(std::move(snapshot));parent.children.push_back(std::move(good));}}
   else{parent.snapshotHistory.beforeTimeline=std::move(snapshot.snapshotHistory.beforeTimeline);parent.snapshotHistory.afterTimeline=std::move(snapshot.snapshotHistory.afterTimeline);}
   d.pushEdit(std::move(parent));if(forward)d.history_.undo([](const auto&){},[](const auto&){});
   auto& stored=const_cast<Document::Edit&>(d.history_.at(d.history_.size()-1));auto& entry=child?stored.children[forward?1:0]:stored;
   auto& state=*(forward?entry.snapshotHistory.afterTimeline:entry.snapshotHistory.beforeTimeline);
   switch(failure){
    case 0:state.layers.push_back(state.layers.front());break;
    case 1:state.layers.front().opacity=-1;break;
    case 2:state.frames.push_back(state.frames.front());break;
    case 3:state.frames.front().duration=0;break;
    case 4:state.cels.push_back(state.cels.front());break;
    case 5:state.cels.front().layerId="missing";break;
    case 6:state.cels.front().surface->width=0;break;
    case 7:state.layers.front().groupId="missing-group";break;
   }
   const auto pixels=d.canvasPixels();const auto mask=d.timeline_.state().masks.front().mask.surface.pixels;
   const auto maskIdentity=d.timeline_.state().masks.front().mask.surface.pixels.identity(),identity=d.cel().surface->pixels.identity();
   const auto serial=d.maskSelectionHistory_.serial,position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision(),history=d.historyRevision();
   const auto savedState=d.state_;const auto oldSlots=d.maskSelectionHistory_.slots;const auto oldActiveMask=d.activeMaskId_;const bool dirty=d.dirty();
   d.change_={1,1,1,1};int notifications=0,animations=0;d.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++notifications;});d.setAnimationChangeListener([&](const Document&,const AnimationChange&){++animations;});
   bool rejected=false;try{if(forward)d.redo();else d.undo();}catch(const std::invalid_argument&){rejected=true;}
   CHECK(rejected&&d.width_==2&&d.height_==2&&d.canvasPixels()==pixels&&d.cel().surface->pixels.identity()==identity);
   CHECK(d.timeline_.state().masks.front().mask.surface.pixels==mask);
   CHECK(d.timeline_.state().masks.front().mask.surface.pixels.identity()==maskIdentity&&d.maskSelectionHistory_.serial==serial&&d.maskSelectionHistory_.slots==oldSlots&&d.activeMaskId_==oldActiveMask);
   CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content&&d.historyRevision()==history&&d.state_==savedState&&d.dirty()==dirty);
   CHECK(d.activeLayerId_==layer&&d.activeFrameId_==frame&&!notifications&&!animations&&d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void celMetadataFailure(){
  for(bool forward:{false,true})for(int entry=0;entry<3;++entry)for(int failure=0;failure<10;++failure){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto owner=d.cel().id;d.addFrame();CHECK(d.fillSelectionOrCanvas(0xff010203));const auto original=d.timeline_.state().cels;const auto first=*d.timeline_.findCelById(owner);auto good=d.cel(),bad=first;good.opacity=0.3;
   switch(failure){
    case 0:bad.opacity=-0.1;break;
    case 1:bad.opacity=1.1;break;
    case 2:bad.opacity=std::numeric_limits<double>::quiet_NaN();break;
    case 3:bad.surface->width=0;break;
    case 4:bad.surface->height=0;break;
    case 5:bad.surface->pixels.pop_back();break;
    case 6:bad.surface->width=bad.surface->height=std::numeric_limits<int>::max();break;
    case 7:bad.layerId="missing-metadata-layer";break;
    case 8:bad.frameId="missing-metadata-frame";break;
    case 9:bad.layerId=good.layerId;bad.frameId=good.frameId;break;
   }
   Document::Edit edit{{},d.state_,d.nextState_};edit.contentHistory.beforeCels=edit.contentHistory.afterCels={good,bad};edit.layerHistory.targetLayerId=first.layerId;edit.layerHistory.beforeVisible=edit.layerHistory.afterVisible=false;edit.frameHistory.beforeDisabled=edit.frameHistory.afterDisabled={{first.frameId,true}};edit.paletteHistory.paletteKind=12;edit.paletteHistory.beforePalette=d.palette_;edit.paletteHistory.afterPalette=d.palette_;edit.paletteHistory.beforePalette->primary=edit.paletteHistory.afterPalette->primary=0xff765432;
   CelPropertiesPlan plan;plan.groups.push_back({owner,{owner,good.id},{0.4,2}});plan.after={0.6,3};edit.contentHistory.celProperties=std::move(plan);if(entry==2){edit.contentHistory.targetCelId=owner;edit.pixels.push_back({0,0x00010203,0xff123456});}
   d.pushEdit(std::move(edit));if(forward)d.history_.undo([](const auto&){},[](const auto&){});const auto& stored=d.history_.at(d.history_.size()-1);
   const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision(),history=d.historyRevision(),state=d.state_;const auto active=d.activeLayerId_,frame=d.activeFrameId_;const auto selection=d.selectedFrames_;const bool dirty=d.dirty(),visible=d.layer().visible,disabled=d.timeline_.state().frames.front().disabled;const auto primary=d.palette_.primary;const auto identity=d.timeline_.resolveSurface(owner).surface->pixels.identity();const auto stamp=d.timeline_.thumbnailStorage(owner);d.change_={1,1,1,1};int notifications=0,animations=0;d.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++notifications;});d.setAnimationChangeListener([&](const Document&,const AnimationChange&){++animations;});
   bool rejected=false;try{if(!entry)d.applyCelEdit(stored,forward);else if(forward)d.redo();else d.undo();}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);
   const auto& actual=d.timeline_.state().cels;CHECK(actual.size()==original.size());for(std::size_t i=0;i<actual.size();++i){const auto& a=actual[i];const auto& o=original[i];CHECK(a.id==o.id&&a.layerId==o.layerId&&a.frameId==o.frameId&&a.opacity==o.opacity&&a.zIndex==o.zIndex&&bool(a.surface)==bool(o.surface));if(a.surface)CHECK(a.surface->width==o.surface->width&&a.surface->height==o.surface->height&&a.surface->pixels==o.surface->pixels);}
   CHECK(d.timeline_.findCelById(owner)&&d.timeline_.resolveSurface(owner).surface->pixels.identity()==identity&&d.layer().visible==visible&&d.timeline_.state().frames.front().disabled==disabled&&d.palette_.primary==primary);
   CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content&&d.historyRevision()==history&&d.state_==state&&d.dirty()==dirty);
   CHECK(d.activeLayerId_==active&&d.activeFrameId_==frame&&d.selectedFrames_==selection&&!notifications&&!animations&&d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);const auto afterStamp=d.timeline_.thumbnailStorage(owner);CHECK(afterStamp.owner==stamp.owner&&afterStamp.revision==stamp.revision);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void indexPreparationFailure(){
  for(int failure=0;failure<6;++failure){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;CHECK(d.fillSelectionOrCanvas(0xff010203));const auto owner=d.cel().id;d.addFrame();auto& timeline=d.timeline_;auto& s=const_cast<timeline::State&>(timeline.state());const auto layer=s.layers.front().id,frame=s.frames.front().id;const auto* cel=timeline.findCelById(owner);CHECK(timeline.contentSelection(owner,2,2));const auto stats=timeline::celSelectionCacheStats();const auto stamp=timeline.thumbnailStorage(owner);const auto identity=timeline.resolveSurface(owner).surface->pixels.identity();
   const auto opacity=s.layers.front().opacity;const auto duration=s.frames.front().duration;const auto celOpacity=s.cels.front().opacity;const auto id=s.cels.back().id,celLayer=s.cels.front().layerId;
   switch(failure){case 0:s.layers.front().opacity=std::numeric_limits<double>::quiet_NaN();break;case 1:s.frames.front().duration=0;break;case 2:s.cels.front().opacity=2;break;case 3:s.cels.back().id=s.cels.front().id;break;case 4:s.cels.front().layerId="missing-index-layer";break;case 5:{timeline::Group group;group.id="cyclic-index-group";group.parentGroupId=group.id;s.groups.push_back(std::move(group));break;}}
   Document::Edit edit{{},d.state_,d.nextState_};for(const auto& l:s.layers)edit.layerHistory.beforeOrder.push_back(l.id);edit.layerHistory.afterOrder=edit.layerHistory.beforeOrder;bool rejected=false;try{d.applyLayerEdit(edit,false);}catch(const std::invalid_argument&){rejected=true;}
   // Restore only the deliberately corrupted input field. A rejected builder
   // must not need another rebuild to recover its previous indices/caches.
   switch(failure){case 0:s.layers.front().opacity=opacity;break;case 1:s.frames.front().duration=duration;break;case 2:s.cels.front().opacity=celOpacity;break;case 3:s.cels.back().id=id;break;case 4:s.cels.front().layerId=celLayer;break;case 5:s.groups.pop_back();break;}
   CHECK(rejected&&timeline.hasLayer(layer)&&timeline.hasFrame(frame)&&timeline.findCelById(owner)==cel);CHECK(timeline.resolveSurface(owner).surface->pixels.identity()==identity);const auto after=timeline.thumbnailStorage(owner);CHECK(after.owner==stamp.owner&&after.revision==stamp.revision);CHECK(timeline.contentSelection(owner,2,2)&&timeline::celSelectionCacheStats().builds==stats.builds);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void celMetadataSuccess(){
  for(int scenario=0;scenario<5;++scenario){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto owner=d.cel().id;d.addFrame();auto baseline=*d.timeline_.findCelById(owner);auto transient=baseline,last=baseline;
   if(scenario==0){transient.opacity=2;last.opacity=0.4;}
   if(scenario==1){transient.frameId=d.activeFrameId_;last.opacity=0.4;}
   if(scenario==2){last.opacity.reset();last.surface->offsetX=-7;last.surface->pixels[0]=0x00112233;}
   if(scenario==3){last.surface.reset();}
   if(scenario==4){last.linkedCelId="missing-link-is-reported";}
   Document::Edit edit{{},d.state_,d.nextState_};edit.contentHistory.beforeCels={baseline};edit.contentHistory.afterCels=scenario<2?std::vector<DocumentCel>{transient,last}:std::vector<DocumentCel>{last};
   d.applyCelEdit(edit,true);const auto* actual=d.timeline_.findCelById(owner);CHECK(actual&&actual->opacity==last.opacity&&actual->frameId==last.frameId&&bool(actual->surface)==bool(last.surface));if(scenario==2)CHECK(actual->surface->pixels[0]==0x00112233&&actual->surface->offsetX==-7);if(scenario==4)CHECK(d.timeline_.resolveSurface(owner).issue==timeline::LinkIssue::MissingTarget);
   d.applyCelEdit(edit,false);CHECK(d.timeline_.findCelById(owner)->opacity==baseline.opacity&&d.timeline_.findCelById(owner)->surface);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void contentTargetFailure(){
  for(bool forward:{false,true})for(int entry=0;entry<3;++entry)for(int failure=0;failure<13;++failure){
   if(!entry&&failure>4)continue;
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto owner=d.cel().id;d.addFrame();d.addLayer();
   const auto originalCels=d.timeline_.state().cels;const auto originalFrames=d.timeline_.state().frames;const auto originalLayers=d.timeline_.state().layers;
   const auto source=*d.timeline_.findCelById(owner);const auto firstFrame=source.frameId,secondFrame=d.activeFrameId_,firstLayer=source.layerId,secondLayer=d.activeLayerId_;
   const auto firstLayerValue=*std::find_if(originalLayers.begin(),originalLayers.end(),[&](const auto& l){return l.id==firstLayer;});
   const auto firstFrameValue=*std::find_if(originalFrames.begin(),originalFrames.end(),[&](const auto& f){return f.id==firstFrame;});
   auto futureLayer=firstLayerValue;futureLayer.id="future-target-layer";auto futureFrame=firstFrameValue;futureFrame.id="future-target-frame";
   auto future=source;future.id="future-target-cel";future.frameId=futureFrame.id;auto good=source;good.opacity=0.25;auto bad=source;bad.id="missing-replay-cel";
   Document::Edit edit{{},d.state_,d.nextState_};edit.beforeActive=edit.afterActive=secondLayer;edit.beforeFrame=edit.afterFrame=secondFrame;edit.layerHistory.targetLayerId=secondLayer;edit.layerHistory.beforeVisible=edit.layerHistory.afterVisible=false;
   edit.frameHistory.beforeDisabled=edit.frameHistory.afterDisabled={{firstFrame,true}};edit.paletteHistory.paletteKind=12;edit.paletteHistory.beforePalette=d.palette_;edit.paletteHistory.afterPalette=d.palette_;edit.paletteHistory.beforePalette->primary=edit.paletteHistory.afterPalette->primary=0xff765432;
   if(entry==2){edit.contentHistory.targetCelId=owner;edit.pixels.push_back({0,0x00010203,0xff123456});}
   auto replacements=[&](const std::vector<DocumentCel>& values){edit.contentHistory.beforeCels=edit.contentHistory.afterCels=values;};
   auto frameOrder=[&](const std::vector<std::string>& order){edit.frameHistory.beforeFrames=edit.frameHistory.afterFrames=order;};
   auto layerOrder=[&](const std::vector<std::string>& order){edit.layerHistory.beforeOrder=edit.layerHistory.afterOrder=order;};
   switch(failure){
    case 0:replacements({good,bad});break;
    case 1:edit.layerHistory.targetLayerId="missing-replay-layer";break;
    case 2:edit.layerHistory.detachedLayer=firstLayerValue;layerOrder({secondLayer});edit.layerHistory.targetLayerId=firstLayer;break;
    case 3:edit.layerHistory.detachedLayer=futureLayer;layerOrder({firstLayer,secondLayer,futureLayer.id});edit.layerHistory.targetLayerId="missing-created-layer-target";break;
    case 4:{CelPropertiesPlan plan;plan.groups.push_back({owner,{owner,"missing-frozen-member"},{0.4,2}});plan.after={0.6,3};edit.contentHistory.celProperties=std::move(plan);break;}
    case 5:edit.frameHistory.detachedFrame=firstFrameValue;frameOrder({secondFrame});replacements({good});break;
    case 6:edit.frameHistory.detachedFrames={firstFrameValue};frameOrder({secondFrame});replacements({good});break;
    case 7:edit.layerHistory.detachedLayer=firstLayerValue;layerOrder({secondLayer});replacements({good});break;
    case 8:edit.frameHistory.detachedFrame=futureFrame;frameOrder({firstFrame,secondFrame,futureFrame.id});edit.contentHistory.detachedCels={future};replacements({good,bad});break;
    case 9:{edit.frameHistory.detachedFrame=futureFrame;frameOrder({firstFrame,secondFrame,futureFrame.id});edit.contentHistory.detachedCels={future};CelPropertiesPlan plan;plan.groups.push_back({future.id,{future.id},{0.4,2}});plan.after={0.6,3};edit.contentHistory.celProperties=std::move(plan);break;}
    case 10:future.layerId=futureLayer.id;future.frameId=firstFrame;edit.layerHistory.detachedLayer=futureLayer;layerOrder({firstLayer,secondLayer,futureLayer.id});edit.contentHistory.detachedCels={future};edit.frameHistory.detachedFrames={firstFrameValue};frameOrder({secondFrame});replacements({future});break;
    case 11:edit.frameHistory.detachedFrame=futureFrame;edit.frameHistory.detachedFrames={firstFrameValue,futureFrame};frameOrder({secondFrame,futureFrame.id});edit.contentHistory.detachedCels={future};replacements({future});break;
    case 12:edit.frameHistory.detachedFrame=futureFrame;edit.frameHistory.detachedFrames={futureFrame};edit.contentHistory.detachedCels={future};replacements({future});break; // Empty order ignores detached payloads.
   }
   d.pushEdit(std::move(edit));if(forward)d.history_.undo([](const auto&){},[](const auto&){});const auto& stored=d.history_.at(d.history_.size()-1);
   const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision(),history=d.historyRevision(),state=d.state_;const auto active=d.activeLayerId_,frame=d.activeFrameId_;const auto selection=d.selectedFrames_;const bool dirty=d.dirty();const auto primary=d.palette_.primary;const auto identity=d.timeline_.resolveSurface(owner).surface->pixels.identity();const auto stamp=d.timeline_.thumbnailStorage(owner);d.change_={1,1,1,1};int notifications=0,animations=0;
   d.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++notifications;});d.setAnimationChangeListener([&](const Document&,const AnimationChange&){++animations;});
   bool rejected=false;try{if(!entry){if(failure==0)d.applyCelEdit(stored,forward);else if(failure==4)d.applyCelPropertiesEdit(stored,forward);else d.applyLayerEdit(stored,forward);}else if(forward)d.redo();else d.undo();}catch(const std::exception&){rejected=true;}
   CHECK(rejected);const auto& actual=d.timeline_.state();CHECK(actual.cels.size()==originalCels.size()&&actual.frames.size()==originalFrames.size()&&actual.layers.size()==originalLayers.size());
   for(std::size_t i=0;i<actual.cels.size();++i){const auto& a=actual.cels[i];const auto& o=originalCels[i];CHECK(a.id==o.id&&a.layerId==o.layerId&&a.frameId==o.frameId&&a.opacity==o.opacity&&a.zIndex==o.zIndex&&bool(a.surface)==bool(o.surface));if(a.surface)CHECK(a.surface->pixels==o.surface->pixels);}
   for(std::size_t i=0;i<actual.frames.size();++i)CHECK(actual.frames[i].id==originalFrames[i].id&&actual.frames[i].duration==originalFrames[i].duration&&actual.frames[i].disabled==originalFrames[i].disabled);
   for(std::size_t i=0;i<actual.layers.size();++i)CHECK(actual.layers[i].id==originalLayers[i].id&&actual.layers[i].name==originalLayers[i].name&&actual.layers[i].visible==originalLayers[i].visible&&actual.layers[i].opacity==originalLayers[i].opacity);
   CHECK(d.timeline_.resolveSurface(owner).surface->pixels.identity()==identity&&d.palette_.primary==primary);
   CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content&&d.historyRevision()==history&&d.state_==state&&d.dirty()==dirty);
   CHECK(d.activeLayerId_==active&&d.activeFrameId_==frame&&d.selectedFrames_==selection&&!notifications&&!animations&&d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);const auto afterStamp=d.timeline_.thumbnailStorage(owner);CHECK(afterStamp.owner==stamp.owner&&afterStamp.revision==stamp.revision);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void contentTargetSuccess(){
  for(int scenario=0;scenario<7;++scenario){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto owner=d.cel().id;d.addFrame();d.addLayer();const auto source=*d.timeline_.findCelById(owner);const auto firstFrame=source.frameId,secondFrame=d.activeFrameId_,firstLayer=source.layerId,secondLayer=d.activeLayerId_;
   auto newLayer=d.timeline_.state().layers.front();newLayer.id="valid-created-layer";auto newFrame=d.timeline_.state().frames.front();newFrame.id="valid-created-frame";auto future=source;future.id="valid-created-cel";future.opacity=0.5;
   Document::Edit edit{{},d.state_,d.nextState_};edit.beforeActive=edit.afterActive=secondLayer;edit.beforeFrame=edit.afterFrame=secondFrame;
   if(scenario==0){future.layerId=newLayer.id;edit.layerHistory.detachedLayer=newLayer;edit.layerHistory.afterOrder={firstLayer,secondLayer,newLayer.id};edit.layerHistory.targetLayerId=newLayer.id;edit.layerHistory.afterName=U"created target";edit.contentHistory.detachedCels={future};edit.contentHistory.afterCels={future};}
   if(scenario==1||scenario==2||scenario==4){future.frameId=newFrame.id;edit.frameHistory.afterFrames={firstFrame,secondFrame,newFrame.id};if(scenario==1)edit.frameHistory.detachedFrame=newFrame;else edit.frameHistory.detachedFrames={newFrame};edit.contentHistory.detachedCels={future};edit.contentHistory.afterCels={future};if(scenario==4){edit.contentHistory.detachedCels.push_back(future);auto last=future;last.opacity=0.7;edit.contentHistory.afterCels.push_back(last);}}
   if(scenario==3){auto oldLayer=*std::find_if(d.timeline_.state().layers.begin(),d.timeline_.state().layers.end(),[&](const auto& l){return l.id==firstLayer;});future.id=owner;future.layerId=secondLayer;future.frameId=newFrame.id;edit.layerHistory.detachedLayer=oldLayer;edit.layerHistory.afterOrder={secondLayer};edit.frameHistory.detachedFrame=newFrame;edit.frameHistory.afterFrames={firstFrame,secondFrame,newFrame.id};edit.contentHistory.detachedCels={future};edit.contentHistory.afterCels={future};}
   if(scenario==5){future.id=owner;edit.layerHistory.detachedLayer=newLayer;edit.frameHistory.detachedFrame=newFrame;edit.frameHistory.detachedFrames={newFrame};edit.contentHistory.detachedCels={future};auto last=future;last.opacity=0.7;edit.contentHistory.afterCels={future,last};} // Empty orders ignore detached structures; repeated replacements keep last-wins.
   if(scenario==6){CelPropertiesPlan plan;plan.groups.push_back({"unused-source-id",{owner,owner},{1,0}});plan.after={0.6,3};edit.contentHistory.celProperties=std::move(plan);}
   d.applyEdit(edit,true);const auto id=scenario==3||scenario>=5?owner:future.id;const auto* actual=d.timeline_.findCelById(id);CHECK(actual);CHECK(actual->opacity==std::optional<double>{scenario==4||scenario==5?0.7:scenario==6?0.6:0.5});
   if(scenario==0){CHECK(d.timeline_.hasLayer(newLayer.id));const auto& layers=d.timeline_.state().layers;CHECK(std::find_if(layers.begin(),layers.end(),[&](const auto& l){return l.id==newLayer.id;})->name==U"created target");}
   if(scenario==3)CHECK(actual->layerId==secondLayer&&actual->frameId==newFrame.id&&!d.timeline_.hasLayer(firstLayer));
   if(scenario==5)CHECK(!d.timeline_.hasLayer(newLayer.id)&&!d.timeline_.hasFrame(newFrame.id));
   if(scenario==6){CHECK(actual->zIndex==3);d.applyEdit(edit,false);CHECK(d.timeline_.findCelById(owner)->opacity==std::optional<double>{1}&&d.timeline_.findCelById(owner)->zIndex==0);}
  }
  // Preserve the original leaf order: final cel replacement overrides earlier
  // pixel and cel-property writes, while palette/layer/frame values also roundtrip.
  auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto owner=d.cel().id;auto before=d.cel(),after=before;after.opacity=0.5;after.surface->pixels[0]=0xffaabbcc;
  Document::Edit edit{{},d.state_,d.nextState_};edit.contentHistory.targetCelId=owner;edit.pixels.push_back({0,0,0xff102030});edit.contentHistory.beforeCels={before};edit.contentHistory.afterCels={after};CelPropertiesPlan plan;plan.groups.push_back({owner,{owner},{1,0}});plan.after={0.6,3};edit.contentHistory.celProperties=std::move(plan);edit.layerHistory.targetLayerId=before.layerId;edit.layerHistory.beforeName=d.layer().name;edit.layerHistory.afterName=U"mixed target";edit.frameHistory.beforeDisabled={{before.frameId,false}};edit.frameHistory.afterDisabled={{before.frameId,true}};edit.paletteHistory.beforePalette=d.palette_;edit.paletteHistory.afterPalette=d.palette_;edit.paletteHistory.afterPalette->primary=0xff765432;edit.paletteHistory.paletteKind=12;const auto primary=d.palette_.primary;const auto name=d.layer().name;
  d.applyEdit(edit,true);d.pushEdit(std::move(edit));auto verify=[&](bool forward){const auto* c=d.timeline_.findCelById(owner);CHECK(c->surface->pixels[0]==(forward?0xffaabbcc:0)&&c->opacity==std::optional<double>{forward?0.5:1.0}&&c->zIndex==0);CHECK(d.layer().name==(forward?U"mixed target":name)&&d.frame().disabled==forward&&d.palette_.primary==(forward?0xff765432:primary));};verify(true);d.undo();verify(false);d.redo();verify(true);
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void frameReplayFailure(){
  // Direct domain calls and real stack navigation share the same preflight.
  // A mixed entry must reject before its pixel, disabled flag or duration writes.
  for(bool forward:{false,true})for(int entry=0;entry<3;++entry)for(int failure=0;failure<8;++failure){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto owner=d.cel().id;d.addFrame();
   const auto original=d.timeline_.state().frames;const auto first=original.front().id,second=original.back().id;
   Document::Edit edit{{},d.state_,d.nextState_};edit.beforeFrame=edit.afterFrame=d.activeFrameId_;
   edit.frameHistory.beforeDisabled={{first,true}};edit.frameHistory.afterDisabled={{first,true}};
   if(entry==2){edit.contentHistory.targetCelId=owner;edit.pixels.push_back({0,0x00010203,0xff123456});}
   auto durationPair=[&](){edit.frameHistory.beforeScriptDurations.emplace();edit.frameHistory.afterScriptDurations.emplace();for(const auto& f:original){edit.frameHistory.beforeScriptDurations->emplace_back(f.id,201);edit.frameHistory.afterScriptDurations->emplace_back(f.id,301);}};
   auto target=[&](const std::string& id){edit.frameHistory.targetFrameId=id;edit.frameHistory.beforeDuration=211;edit.frameHistory.afterDuration=311;};
   auto future=original.front();future.id="future-history-frame";
   switch(failure){
    case 0:durationPair();edit.frameHistory.beforeScriptDurations->pop_back();edit.frameHistory.afterScriptDurations->pop_back();break;
    case 1:durationPair();edit.frameHistory.beforeScriptDurations->back().first="missing-duration-frame";edit.frameHistory.afterScriptDurations->back().first="missing-duration-frame";break;
    case 2:target("missing-duration-target");break;
    case 3:edit.frameHistory.detachedFrames={future};edit.frameHistory.beforeFrames=edit.frameHistory.afterFrames={first,future.id};break;
    case 4:edit.frameHistory.detachedFrames={original.back()};edit.frameHistory.beforeFrames=edit.frameHistory.afterFrames={first};target(second);break;
    case 5:edit.frameHistory.detachedFrame=future;edit.frameHistory.beforeFrames=edit.frameHistory.afterFrames={first,second,future.id};target("missing-created-frame-target");break;
    case 6:edit.frameHistory.detachedFrame=original.front();edit.frameHistory.detachedFrames={future};edit.frameHistory.beforeFrames=edit.frameHistory.afterFrames={second,future.id};target(first);break;
    case 7:durationPair();target("missing-final-duration-target");break;
   }
   d.pushEdit(std::move(edit));if(forward)d.history_.undo([](const auto&){},[](const auto&){});
   const auto& stored=d.history_.at(d.history_.size()-1);const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision(),history=d.historyRevision(),state=d.state_;
   const auto active=d.activeLayerId_,frame=d.activeFrameId_;const auto selection=d.selectedFrames_;const bool dirty=d.dirty();const auto pixels=d.timeline_.resolveSurface(owner).surface->pixels;const auto identity=d.timeline_.resolveSurface(owner).surface->pixels.identity();const auto stamp=d.timeline_.thumbnailStorage(owner);d.change_={1,1,1,1};int notifications=0,animations=0;
   d.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++notifications;});d.setAnimationChangeListener([&](const Document&,const AnimationChange&){++animations;});
   bool rejected=false;try{if(!entry)d.applyFrameEdit(stored,forward);else if(forward)d.redo();else d.undo();}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected);const auto& actual=d.timeline_.state().frames;CHECK(actual.size()==original.size());for(std::size_t i=0;i<actual.size();++i)CHECK(actual[i].id==original[i].id&&actual[i].duration==original[i].duration&&actual[i].disabled==original[i].disabled);
   CHECK(d.timeline_.resolveSurface(owner).surface->pixels==pixels&&d.timeline_.resolveSurface(owner).surface->pixels.identity()==identity);
   CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content&&d.historyRevision()==history&&d.state_==state&&d.dirty()==dirty);
   CHECK(d.activeLayerId_==active&&d.activeFrameId_==frame&&d.selectedFrames_==selection&&!notifications&&!animations&&d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);
   const auto afterStamp=d.timeline_.thumbnailStorage(owner);CHECK(afterStamp.owner==stamp.owner&&afterStamp.revision==stamp.revision);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void frameReplaySuccess(){
  // A duration target may be created by this very frame edit. Validate the
  // projected membership, not just the current timeline's lookup table.
  for(int scenario=0;scenario<7;++scenario){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;if(scenario!=4)d.addFrame();
   const auto first=d.timeline_.state().frames.front().id,second=d.timeline_.state().frames.back().id;
   auto future=d.timeline_.state().frames.front();future.id="created-valid-history-frame";
   Document::Edit edit{{},d.state_,d.nextState_};edit.beforeFrame=edit.afterFrame=first;
   std::vector<std::string> expected;
   if(scenario==0||scenario==1){edit.frameHistory.afterFrames={first,second,future.id};if(!scenario)edit.frameHistory.detachedFrame=future;else edit.frameHistory.detachedFrames={future};edit.frameHistory.targetFrameId=future.id;expected={first,second,future.id};}
   if(scenario==2){edit.frameHistory.beforeScriptDurations.emplace();edit.frameHistory.afterScriptDurations.emplace();for(const auto& f:d.timeline_.state().frames){edit.frameHistory.beforeScriptDurations->emplace_back(f.id,100);edit.frameHistory.afterScriptDurations->emplace_back(f.id,250);}edit.frameHistory.afterFrames={second,first};edit.frameHistory.targetFrameId=first;expected={second,first};}
   if(scenario==3){edit.frameHistory.detachedFrames={d.timeline_.state().frames.back()};edit.frameHistory.afterFrames={first};edit.frameHistory.targetFrameId=first;expected={first};}
   if(scenario==4){edit.frameHistory.detachedFrames={future};edit.frameHistory.afterFrames={"extra-order-id"};expected={first};} // One frame: original sort has no comparator lookup.
   if(scenario==5){edit.frameHistory.detachedFrames={future,future};edit.frameHistory.afterFrames={first,second,future.id,future.id,"extra-order-id"};expected={first,second,future.id};}
   if(scenario==6){edit.frameHistory.detachedFrame=future;edit.frameHistory.afterFrames={second,future.id};edit.frameHistory.targetFrameId=first;expected={second,future.id,first};} // Single-frame sort retains permissive missing-order behavior.
   if(!edit.frameHistory.targetFrameId.empty()){edit.frameHistory.beforeDuration=199;edit.frameHistory.afterDuration=299;}
   edit.frameHistory.afterDisabled={{"missing-disabled-frame-is-ignored",true}};d.applyEdit(edit,true);
   const auto& frames=d.timeline_.state().frames;CHECK(frames.size()==expected.size());for(std::size_t i=0;i<frames.size();++i){CHECK(frames[i].id==expected[i]);if(frames[i].id==edit.frameHistory.targetFrameId)CHECK(frames[i].duration==299);else if(scenario==2)CHECK(frames[i].duration==250);}
  }
  auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto owner=d.cel().id;d.addFrame();
  Document::Edit edit{{},d.state_,d.nextState_};edit.contentHistory.targetCelId=owner;edit.pixels.push_back({0,0,0xff102030});edit.frameHistory.beforeScriptDurations.emplace();edit.frameHistory.afterScriptDurations.emplace();
  for(const auto& f:d.timeline_.state().frames){edit.frameHistory.beforeScriptDurations->emplace_back(f.id,f.duration);edit.frameHistory.afterScriptDurations->emplace_back(f.id,250);}
  edit.frameHistory.targetFrameId=d.timeline_.state().frames.front().id;edit.frameHistory.beforeDuration=100;edit.frameHistory.afterDuration=500;
  d.applyEdit(edit,true);d.pushEdit(std::move(edit));
  auto verify=[&](bool forward){CHECK(d.timeline_.resolveSurface(owner).surface->pixels[0]==(forward?0xff102030:0));const auto& frames=d.timeline_.state().frames;CHECK(frames.front().duration==(forward?500:100)&&frames.back().duration==(forward?250:100));};
  verify(true);d.undo();verify(false);d.redo();verify(true);
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void historyShapeFailure(){
  // Inject corrupt private payloads only after a valid entry has been costed.
  // Both real stack directions must reject before the parent or a sibling writes.
  for(bool forward:{false,true})for(int failure=0;failure<16;++failure){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;
   Document::Edit parent{{},d.state_,d.nextState_},good{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   good.contentHistory.targetCelId=d.cel().id;good.pixels.push_back({0,0x00010203,0xff123456});
   if(forward){parent.children.push_back(std::move(good));parent.children.push_back(std::move(bad));}else{parent.children.push_back(std::move(bad));parent.children.push_back(std::move(good));}
   d.pushEdit(std::move(parent));if(forward)d.history_.undo([](const auto&){},[](const auto&){});
   auto& stored=const_cast<Document::Edit&>(d.history_.at(0));auto& invalid=stored.children[forward?1:0];
   stored.snapshotHistory.beforeDimensions=std::pair<int,int>{7,9};stored.snapshotHistory.afterDimensions=std::pair<int,int>{11,13};
   switch(failure){
    case 0:invalid.snapshotHistory.beforeDimensions.emplace();break;
    case 1:invalid.snapshotHistory.beforeRollback=d.captureRollbackPayload();break;
    case 2:invalid.snapshotHistory.beforeTimeline.emplace();break;
    case 3:invalid.snapshotHistory.beforeScriptGeometry=std::make_shared<const Document::SnapshotHistory::ScriptGeometry>();break;
    case 4:invalid.tileHistory.beforeTilesetSlots.emplace();break;
    case 5:invalid.tileHistory.beforeTileSelection.emplace();break;
    case 6:invalid.tileHistory.beforeFreeTileSelection.emplace();break;
    case 7:invalid.maskHistory.beforeMasks.emplace();break;
    case 8:invalid.sliceHistory.beforeSlices.emplace();break;
    case 9:invalid.layerHistory.beforeLayerStructure.emplace();break;
    case 10:invalid.pixelSelectionHistory.beforeTrimPivot.emplace();break;
    case 11:invalid.frameHistory.beforeAnimationLoop=false;break;
    case 12:invalid.paletteHistory.beforePalette.emplace();break;
    case 13:invalid.frameHistory.beforeScriptDurations.emplace();break;
    case 14:invalid.frameHistory.targetFrameId=d.frame().id;invalid.frameHistory.beforeDuration=100;break;
    case 15:invalid.beforeAnimationSelection=d.captureAnimationSelection();break;
   }
   const auto pixels=d.canvasPixels();const auto identity=d.cel().surface->pixels.identity();
   const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision(),history=d.historyRevision();
   const auto layer=d.activeLayerId_,frame=d.activeFrameId_;const auto state=d.state_;const bool dirty=d.dirty();d.change_={1,1,1,1};int notifications=0;
   d.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++notifications;});
   bool rejected=false;try{if(forward)d.redo();else d.undo();}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.width_==2&&d.height_==2&&d.canvasPixels()==pixels&&d.cel().surface->pixels.identity()==identity);
   CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content&&d.historyRevision()==history&&d.state_==state&&d.dirty()==dirty);
   CHECK(d.activeLayerId_==layer&&d.activeFrameId_==frame&&!notifications&&d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);
  }
  // Optional single-sided values retain skip/clear semantics, and a parent's
  // leaf-only payload remains ignored when children supply its content.
  auto document=std::make_unique<Document>(2,2);auto& d=*document;
  Document::Edit optional{{},d.state_,d.nextState_};optional.pixelSelectionHistory.beforeTrimPivot.emplace();optional.pixelSelectionHistory.afterTrimPivot.emplace();optional.maskHistory.beforeMaskSelection.emplace();optional.paletteHistory.afterPalette.emplace();
  d.applyEdit(optional,true);d.applyEdit(optional,false);
  Document::Edit parent{{},d.state_,d.nextState_};parent.children.push_back(Document::Edit{{},d.state_,d.nextState_});parent.paletteHistory.beforePalette.emplace();parent.frameHistory.beforeScriptDurations.emplace();parent.frameHistory.targetFrameId="ignored-parent-frame";d.applyEdit(parent,true);d.applyEdit(parent,false);
  // Each cost reader validates exactly the fields its arithmetic dereferences.
  for(int kind:{1,2,4,7,8,9,10,11,12})for(int missing=0;missing<2;++missing){
   if(kind==8&&missing==1)continue;Document::PaletteHistory palette;palette.paletteKind=kind;palette.beforePalette.emplace();palette.afterPalette.emplace();
   if(missing==0)palette.beforePalette.reset();else palette.afterPalette.reset();bool rejected=false;
   try{if(kind==12)palette.metadataBytes();else palette.exclusiveBytes();}catch(const std::logic_error&){rejected=true;}CHECK(rejected);
  }
  Document::PaletteHistory rename;rename.paletteKind=4;rename.beforePalette.emplace();rename.afterPalette.emplace();rename.beforePalette->entries.clear();rename.afterPalette->entries.clear();bool rejected=false;try{rename.exclusiveBytes();}catch(const std::logic_error&){rejected=true;}CHECK(rejected);
  Document::SliceHistory slices;slices.beforeSlices.emplace();rejected=false;try{slices.bytes();}catch(const std::logic_error&){rejected=true;}CHECK(rejected);
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void compoundReplayCompensation(){
  // Force the non-stable-target route without changing canvas dimensions. A
  // later child's pixel validation fails at replay time, after a valid sibling
  // has completed; compensation must restore that sibling in either direction.
  for(bool forward:{false,true})for(bool nested:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;
   const Pixel before=0x00010203,after=0xff123456;
   timeline::Surface surface;surface.width=surface.height=2;surface.pixels={forward?before:after,0,0,0};install(d,std::move(surface));
   Document::Edit parent{{},d.state_,d.nextState_},good{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   parent.snapshotHistory.beforeDimensions=parent.snapshotHistory.afterDimensions=std::pair<int,int>{2,2};
   good.contentHistory.targetCelId=d.cel().id;good.pixels.push_back({0,before,after});
   bad.contentHistory.targetCelId=d.cel().id;bad.pixels.push_back({4,0,after});
   if(nested){Document::Edit wrapper{{},d.state_,d.nextState_};wrapper.children.push_back(std::move(good));good=std::move(wrapper);}
   if(forward){parent.children.push_back(std::move(good));parent.children.push_back(std::move(bad));}
   else{parent.children.push_back(std::move(bad));parent.children.push_back(std::move(good));}
   d.pushEdit(std::move(parent));if(forward)d.history_.undo([](const auto&){},[](const auto&){});
   const auto pixels=d.canvasPixels();const auto identity=d.cel().surface->pixels.identity();
   const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision(),history=d.historyRevision();
   int notifications=0;d.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++notifications;});
   bool rejected=false;try{if(forward)d.redo();else d.undo();}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.canvasPixels()==pixels&&d.cel().surface->pixels.identity()==identity);
   CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content&&d.historyRevision()==history&&!notifications);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void resourceReplayPreparation(){
  for(bool forward:{false,true})for(bool child:{false,true}){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;
   CHECK(d.fillSelectionOrCanvas(0xff123456));const auto layer=d.layer().id,frame=d.frame().id;
   CHECK(d.createAttachedMask(layer,frame));const auto mask=d.activeMaskId();
   Document::Edit parent{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};
   parent.snapshotHistory.beforeDimensions=parent.snapshotHistory.afterDimensions=std::pair<int,int>{2,2};
   auto& resources=child?bad:parent;
   resources.maskHistory.beforeMasks=resources.maskHistory.afterMasks=d.timeline_.state().masks;
   resources.maskHistory.beforeMasks->front().mask.visible=false;resources.maskHistory.afterMasks->front().mask.visible=false;
   resources.maskHistory.beforeMaskSelection=resources.maskHistory.afterMaskSelection=std::vector<Document::MaskSlotKey>{{"different-owner",frame}};
   resources.maskHistory.maskToActivateOnRedo="missing-mask";resources.maskHistory.maskEditingOnUndo=std::make_pair("missing-mask",false);
   resources.tileHistory.beforeTileSelection=resources.tileHistory.afterTileSelection=d.tileSelection_;
   resources.tileHistory.beforeTileSelection->primary=resources.tileHistory.afterTileSelection->primary="changed";
   bad.contentHistory.targetCelId=d.cel().id;bad.pixels.push_back({4,0,0xffabcdef});parent.children.push_back(std::move(bad));
   d.pushEdit(std::move(parent));if(forward)d.history_.undo([](const auto&){},[](const auto&){});
   const auto slots=d.maskSelectionHistory_.slots;const auto selection=d.tileSelection_;const auto serial=d.maskSelectionHistory_.serial;
   const auto pixels=d.canvasPixels();const auto identity=d.timeline_.state().masks.front().mask.surface.pixels.identity();
   const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision();
   bool rejected=false;try{if(forward)d.redo();else d.undo();}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.activeMaskId()==mask&&d.maskSelectionHistory_.slots==slots&&d.maskSelectionHistory_.serial==serial);
   CHECK(d.tileSelection_.primary==selection.primary&&d.tileSelection_.tilesetId==selection.tilesetId&&d.timeline_.state().masks.front().mask.visible);
   CHECK(d.timeline_.state().masks.front().mask.surface.pixels.identity()==identity&&d.canvasPixels()==pixels);
   CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void pixelReplayFailure(){
  // A rejected private pixel history must not activate its target cel first.
  // Include both the contiguous and storage-coordinate mapping paths.
  for(bool forward:{false,true})for(bool mapped:{false,true})for(int failure=0;failure<5;++failure){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;timeline::Surface surface;surface.width=surface.height=2;surface.pixels={0x00010203,0xff123456,0x80445566,0xffffffff};install(d,std::move(surface));const auto id=d.cel().id;
   d.addLayer();d.addFrame();CHECK(d.fillSelectionOrCanvas(0xff010203));CHECK(d.createAttachedMask(d.layer().id,d.frame().id));
   Document::Edit edit{{},d.state_,d.nextState_};edit.contentHistory.targetCelId=id;const int width=mapped?3:2;edit.contentHistory.pixelAddress=Document::PixelAddressSpace{width,2,mapped?-1:0,0};const auto size=std::size_t(width)*2;
   switch(failure){
    case 0:edit.pixels.push_back({size,0,0xffabcdef});break;
    case 1:edit.contentHistory.runs.push_back({size-1,2,0,0xffabcdef});break;
    case 2:edit.contentHistory.dense=Document::DensePixels{0,0,width,2,std::vector<Pixel>(size-1),std::vector<Pixel>(size-1,0xffabcdef)};break;
    case 3:edit.contentHistory.pixelAddress->width=0;edit.pixels.push_back({0,0,0xffabcdef});break;
    case 4:edit.contentHistory.targetCelId="missing-pixel-replay-target";edit.pixels.push_back({0,0,0xffabcdef});break;
   }
   d.pushEdit(std::move(edit),U"拒绝无效像素历史");if(forward)d.history_.undo([](const auto&){},[](const auto&){});
   const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision(),history=d.historyRevision(),state=d.state_;const auto active=d.activeLayerId_,frame=d.activeFrameId_,mask=d.activeMaskId_;const auto selected=d.selectedFrames_;const bool dirty=d.dirty(),isolated=d.maskIsolated_;
   const auto identity=d.timeline_.resolveSurface(id).surface->pixels.identity();const auto original=*d.timeline_.resolveSurface(id).surface;const auto stamp=d.timeline_.thumbnailStorage(id);d.change_={1,1,1,1};int historyNotifications=0,animationNotifications=0;
   d.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++historyNotifications;});d.setAnimationChangeListener([&](const Document&,const AnimationChange&){++animationNotifications;});
   bool rejected=false;try{if(forward)d.redo();else d.undo();}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected);CHECK(d.activeLayerId_==active&&d.activeFrameId_==frame&&d.activeMaskId_==mask&&d.maskIsolated_==isolated&&d.selectedFrames_==selected);
   const auto& actual=*d.timeline_.resolveSurface(id).surface;CHECK(actual.width==original.width&&actual.height==original.height&&actual.offsetX==original.offsetX&&actual.offsetY==original.offsetY&&actual.pixels==original.pixels&&actual.pixels.identity()==identity);
   CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content&&d.historyRevision()==history&&d.state_==state&&d.dirty()==dirty);
   CHECK(d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);const auto afterStamp=d.timeline_.thumbnailStorage(id);CHECK(afterStamp.owner==stamp.owner&&afterStamp.revision==stamp.revision);CHECK(!historyNotifications&&!animationNotifications);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void terminalHistoryContract(){
  static_assert(std::variant_size_v<Document::TerminalHistory> == 6);
  auto document=std::make_unique<Document>(2,2);auto& d=*document;
  Document::Edit edit{{},d.state_,d.nextState_};CHECK(std::holds_alternative<std::monostate>(edit.terminalHistory));const auto baseCost=edit.bytes();
  auto mask=std::make_shared<Document::MaskRasterHistory>();mask->maskId="mask";mask->pixels.reserve(9);edit.terminalHistory=Document::MaskRasterReplay{mask};CHECK(edit.maskRaster()==mask.get()&&!edit.localPixels()&&!edit.localSnapshot()&&!edit.sourceProperties()&&!edit.tilemapPixels());CHECK(edit.bytes()==baseCost+sizeof(Document::MaskRasterHistory)+4+mask->pixels.capacity()*sizeof(Document::Delta));
  auto pixels=std::make_shared<local_history::PixelHistoryEdit>();pixels->retainedBytes=73;edit.terminalHistory=Document::LocalPixelsReplay{pixels};CHECK(!edit.maskRaster()&&edit.localPixels()==pixels.get()&&edit.bytes()==73);
  auto before=std::make_shared<Document::FreeTileSourceSnapshot>();auto after=std::make_shared<Document::FreeTileSourceSnapshot>();before->source.name="ab";before->source.description="d";before->source.preservedJson="{}";before->tilesetName=U"\U0001f600";after->source.name="xyz";
  edit.terminalHistory=Document::SourcePropertiesHistory{before,after};CHECK(!edit.localPixels()&&edit.sourceProperties());CHECK(edit.bytes()==268);
  auto copy=edit;CHECK(copy.sourceProperties()->before==before&&copy.sourceProperties()->after==after);edit.terminalHistory=std::monostate{};CHECK(copy.sourceProperties()&&!edit.sourceProperties()&&edit.bytes()==baseCost);
  auto tilemap=std::make_shared<Document::TilemapPixelHistory>();edit.terminalHistory=Document::TilemapPixelsReplay{tilemap};CHECK(edit.tilemapPixels()==tilemap.get()&&!edit.sourceProperties());CHECK(edit.bytes()==baseCost+tilemap->bytes());
  const auto beforePayload=d.captureRollbackPayload();d.name_=U"after local snapshot";d.modified_=true;const auto afterPayload=d.captureRollbackPayload();d.applyRollbackPayload(*beforePayload);
  Document::LocalSnapshotHistory local;local.beforeRollback=beforePayload;local.afterRollback=afterPayload;local.rollbackBytes=0;local.beforeHistoryName=U"before local snapshot";local.afterHistoryName=U"after local snapshot";local.beforeHistoryDirty=false;local.afterHistoryDirty=true;
  edit.terminalHistory=std::move(local);CHECK(edit.localSnapshot()&&!edit.tilemapPixels()&&edit.bytes()==0);d.applyEdit(edit,true);CHECK(d.name_==U"after local snapshot"&&d.modified_);d.applyEdit(edit,false);CHECK(d.name_==U"before local snapshot"&&!d.modified_);
  for(bool forward:{false,true})for(int category=0;category<5;++category){
   Document::Edit invalid{{},d.state_,d.nextState_};
   switch(category){case 0:invalid.terminalHistory=Document::MaskRasterReplay{};break;case 1:invalid.terminalHistory=Document::LocalPixelsReplay{};break;case 2:invalid.terminalHistory=Document::TilemapPixelsReplay{};break;case 3:invalid.terminalHistory=Document::LocalSnapshotHistory{};break;case 4:invalid.terminalHistory=Document::SourcePropertiesHistory{before,{}};break;}
   const auto name=d.name_;const auto current=d.canvasPixels();const auto revision=d.revision();d.change_={1,1,1,1};bool rejected=false;try{d.applyEdit(invalid,forward);}catch(const std::logic_error&){rejected=true;}CHECK(rejected&&d.name_==name&&d.canvasPixels()==current&&d.revision()==revision&&d.change_.x==1&&d.change_.y==1&&d.change_.w==1&&d.change_.h==1);
   if(category==4){rejected=false;try{invalid.bytes();}catch(const std::logic_error&){rejected=true;}CHECK(rejected);}
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void historyDamageBoundary(){
  for(bool forward:{false,true})for(bool nested:{false,true})for(int failure=0;failure<6;++failure){
   auto document=std::make_unique<Document>(4,4);auto& d=*document;timeline::Surface live;live.width=live.height=4;live.pixels.resize(16);install(d,std::move(live));const auto id=d.cel().id;
   Document::Edit parent{{},d.state_,d.nextState_},good{{},d.state_,d.nextState_},bad{{},d.state_,d.nextState_};good.contentHistory.targetCelId=id;good.pixels.push_back({0,0x00010203,0xff123456});switch(failure){
    case 0:bad.contentHistory.ownerOffsets.push_back({"missing-damage-owner",0,0,1,1});break;
    case 1:{timeline::Surface surface;surface.width=surface.height=1;surface.pixels.resize(1);bad.contentHistory.surfaceChanges.push_back({"missing-surface-owner",surface,surface});break;}
    case 2:bad.contentHistory.targetCelId=id;bad.pixels.push_back({0,0,1});break;
    case 3:{CelPropertiesPlan plan;plan.groups.push_back({id,{id,"missing-frozen-member"},{1,0}});plan.after={0.6,3};bad.contentHistory.celProperties=std::move(plan);break;}
    case 4:bad.layerHistory.targetLayerId="missing-layer";bad.layerHistory.beforeVisible=true;bad.layerHistory.afterVisible=false;break;
    case 5:bad.frameHistory.targetFrameId="missing-frame";bad.frameHistory.beforeDuration=100;bad.frameHistory.afterDuration=200;break;
   }
   if(forward){parent.children.push_back(std::move(good));parent.children.push_back(std::move(bad));}else{parent.children.push_back(std::move(bad));parent.children.push_back(std::move(good));}
   if(nested){Document::Edit wrapper{{},d.state_,d.nextState_};wrapper.children.push_back(std::move(parent));parent=std::move(wrapper);}
   d.pushEdit(std::move(parent));if(forward)d.history_.undo([](const auto&){},[](const auto&){});
   if(failure==2){auto& stored=const_cast<Document::Edit&>(d.history_.at(d.history_.size()-1));auto& compound=nested?stored.children.front():stored;compound.children[forward?1:0].contentHistory.targetCelId="missing-pixel-owner";}
   const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.historyRevision(),content=d.contentRevision(),documentRevision=d.revision(),state=d.state_;
   const auto active=d.activeLayerId_,frame=d.activeFrameId_;const bool dirty=d.dirty();const auto identity=d.timeline_.resolveSurface(id).surface->pixels.identity();
   int notifications=0,animations=0;d.setHistoryChangeListener([&](const Document&,const HistoryStackChange&){++notifications;});d.setAnimationChangeListener([&](const Document&,const AnimationChange&){++animations;});d.change_={3,3,1,1};
   bool rejected=false;try{if(forward)d.redo();else d.undo();}catch(const std::logic_error&){rejected=true;}
   CHECK(rejected&&d.historyPosition()==position&&d.historyBytes()==bytes&&d.historyRevision()==revision);
   CHECK(d.timeline_.resolveSurface(id).surface->pixels[0]==0&&d.timeline_.resolveSurface(id).surface->pixels.identity()==identity);
   CHECK(d.contentRevision()==content&&d.revision()==documentRevision&&d.state_==state&&d.dirty()==dirty&&d.activeLayerId_==active&&d.activeFrameId_==frame&&!notifications&&!animations);
   CHECK(d.change_.x==3&&d.change_.y==3&&d.change_.w==1&&d.change_.h==1);
  }
  // Creating a cel in an earlier sibling is legal: initial membership is
  // unsuitable for preflight, and undo must remove it only after pixel replay.
  {
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto first=d.frame().id;
   auto futureFrame=d.frame();futureFrame.id="compound-created-frame";
   auto futureCel=d.cel();futureCel.id="compound-created-cel";futureCel.frameId=futureFrame.id;
   Document::Edit parent{{},d.state_,d.nextState_},create{{},d.state_,d.nextState_},paint{{},d.state_,d.nextState_};
   create.frameHistory.beforeFrames={first};create.frameHistory.afterFrames={first,futureFrame.id};create.frameHistory.detachedFrame=futureFrame;
   create.beforeFrame=first;create.afterFrame=futureFrame.id;create.contentHistory.detachedCels={futureCel};
   paint.contentHistory.targetCelId=futureCel.id;paint.pixels.push_back({0,0,0xff123456});
   parent.children.push_back(std::move(create));parent.children.push_back(std::move(paint));
   d.applyEdit(parent,true);d.pushEdit(std::move(parent));CHECK(d.timeline_.resolveSurface(futureCel.id).surface->pixels[0]==0xff123456);
   d.undo();CHECK(!d.timeline_.findCelById(futureCel.id)&&!d.timeline_.hasFrame(futureFrame.id));
   d.redo();CHECK(d.timeline_.resolveSurface(futureCel.id).surface->pixels[0]==0xff123456);
  }
  // Stable nested siblings retain repeated writes and ignored parent content.
  {
   auto document=std::make_unique<Document>(2,2);auto& d=*document;const auto id=d.cel().id;
   Document::Edit parent{{},d.state_,d.nextState_},nested{{},d.state_,d.nextState_},a{{},d.state_,d.nextState_},b{{},d.state_,d.nextState_};
   parent.contentHistory.targetCelId="ignored-parent-owner";parent.contentHistory.pixelAddress=Document::PixelAddressSpace{2,2,0,0};parent.pixels.push_back({0,0,1});
   a.contentHistory.targetCelId=b.contentHistory.targetCelId=id;a.pixels.push_back({0,0,0x00010203});b.pixels.push_back({0,0x00010203,0xff123456});
   b.contentHistory.textChanges.push_back({"ignored-missing-text",{},TextCelData{}});
   nested.children.push_back(std::move(a));nested.children.push_back(std::move(b));parent.children.push_back(std::move(nested));
   d.applyEdit(parent,true);d.pushEdit(std::move(parent));CHECK(d.timeline_.resolveSurface(id).surface->pixels[0]==0xff123456);
   d.undo();CHECK(d.timeline_.resolveSurface(id).surface->pixels[0]==0);d.redo();CHECK(d.timeline_.resolveSurface(id).surface->pixels[0]==0xff123456);
  }
  auto document=std::make_unique<Document>(4,4);auto& d=*document;timeline::Surface live;live.width=live.height=4;live.pixels.resize(16);install(d,std::move(live));
  Document::Edit edit{{},d.state_,d.nextState_};edit.contentHistory.targetCelId=d.cel().id;edit.pixels.push_back({0,0x00010203,0xff123456});d.applyEdit(edit,true);d.pushEdit(std::move(edit));
  for(bool forward:{false,true}){d.change_={3,3,1,1};if(forward)d.redo();else d.undo();CHECK(d.change_.x==0&&d.change_.y==0&&d.change_.w==1&&d.change_.h==1);}
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void surfaceReplaySuccess(){
  auto document=std::make_unique<Document>(2,2);auto& d=*document;d.addLinkedFrame(true);
  const auto alias=d.cel().id,id=d.timeline_.resolveSurface(alias).source->id;
  TextCelData baseline;baseline.text=u"before";auto setup=d.timeline_.state();for(auto& cel:setup.cels)if(cel.id==id)cel.text=baseline;d.timeline_=timeline::Timeline(std::move(setup));
  const auto original=*d.timeline_.resolveSurface(id).surface;
  auto first=baseline,last=baseline;first.text=u"first";last.text=u"last";
  auto replacement=original;replacement.width=replacement.height=2;replacement.offsetX=7;replacement.offsetY=-3;replacement.pixels={0x00010203,0x80445566,0xffffffff,0xff000000};
  Document::Edit edit{{},d.state_,d.nextState_};
  edit.contentHistory.targetCelId=alias;edit.pixels.push_back({0,original.pixels[0],0xffaabbcc});
  edit.contentHistory.textChanges={{id,baseline,first},{"missing-text-is-ignored",{},last},{id,baseline,last}};
  edit.contentHistory.ownerOffsets={{id,original.offsetX,original.offsetY,std::numeric_limits<int>::max(),12},{id,original.offsetX,original.offsetY,21,22}};
  edit.contentHistory.surfaceChanges={{id,original,original},{id,original,replacement}};
  const auto position=d.historyPosition();d.applyEdit(edit,true);d.pushEdit(std::move(edit),U"组合内容回放");
  auto verify=[&](bool forward){const auto resolved=d.timeline_.resolveSurface(alias);CHECK(resolved.source&&resolved.source->id==id);const auto& live=*resolved.surface;CHECK(resolved.source->text&&resolved.source->text->text==(forward?last.text:baseline.text));const auto& expected=forward?replacement:original;CHECK(live.offsetX==expected.offsetX&&live.offsetY==expected.offsetY&&live.pixels==expected.pixels&&live.width==expected.width&&live.height==expected.height);};
  verify(true);CHECK(d.historyPosition()==position+1);d.undo();verify(false);CHECK(d.historyPosition()==position);d.redo();verify(true);CHECK(d.historyPosition()==position+1);
  // Existing text-only and offset-only entries do not acquire surface budget
  // checks, and a missing text target retains the previous skip semantics.
  Document::Edit textOnly{{},d.state_,d.nextState_};textOnly.contentHistory.textChanges={{id,last,first},{"absent",{},last}};d.applySurfaceEdit(textOnly,true);CHECK(d.timeline_.findCelById(id)->text->text==first.text);d.applySurfaceEdit(textOnly,false);CHECK(d.timeline_.findCelById(id)->text->text==last.text);
  Document::Edit offsetOnly{{},d.state_,d.nextState_};offsetOnly.contentHistory.ownerOffsets={{id,7,-3,9,10}};d.applySurfaceEdit(offsetOnly,true);CHECK(d.timeline_.resolveSurface(alias).surface->offsetX==9);d.applySurfaceEdit(offsetOnly,false);CHECK(d.timeline_.resolveSurface(alias).surface->offsetX==7);
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void surfaceReplayFailure(){
  // Malformed private histories exercise the real undo/redo boundary. The
  // valid pixel, text and offset portions must not escape a later rejected surface.
  for(bool forward:{false,true})for(int failure=0;failure<5;++failure){
   auto document=std::make_unique<Document>(2,2);auto& d=*document;
   if(failure==3){auto state=d.timeline_.state();auto& surface=*state.cels.front().surface;surface.width=surface.height=2048;surface.pixels.resize(std::size_t(2048)*2048);d.timeline_=timeline::Timeline(std::move(state));}
   const auto id=d.cel().id;TextCelData baseline;baseline.text=u"unchanged";baseline.fontSize=17;auto setup=d.timeline_.state();setup.cels.front().text=baseline;d.timeline_=timeline::Timeline(std::move(setup));const auto& cel=d.timeline_.state().cels.front();
   const auto original=*cel.surface;const auto pixelIdentity=cel.surface->pixels.identity();const auto stamp=d.timeline_.thumbnailStorage(id);
   Document::Edit edit{{},d.state_,d.nextState_};auto changed=baseline;changed.text=u"partial write";changed.fontSize=23;
   edit.contentHistory.targetCelId=id;edit.pixels.push_back({0,0x00010203,0xff123456});
   edit.contentHistory.textChanges.push_back({id,changed,changed});
   edit.contentHistory.ownerOffsets.push_back({failure==1?"missing-offset-owner":id,failure==4?std::numeric_limits<int>::max():11,12,failure==4?std::numeric_limits<int>::max():21,22});
   auto desired=original;if(failure==0)++desired.width;
   const int count=failure==3?16:1;
   for(int i=0;i<count;++i)edit.contentHistory.surfaceChanges.push_back({failure==2?"missing-surface-owner":id,desired,desired});
   d.pushEdit(std::move(edit),U"拒绝不完整回放");
   if(forward)d.history_.undo([](const auto&){},[](const auto&){});
   const auto position=d.historyPosition(),bytes=d.historyBytes(),revision=d.revision(),content=d.contentRevision(),history=d.historyRevision(),state=d.state_;
   const auto active=d.activeLayerId_,frame=d.activeFrameId_;const bool dirty=d.dirty();
   d.change_={1,1,1,1};const auto pendingDamage=d.change_;
   bool rejected=false;try{if(forward)d.redo();else d.undo();}catch(const std::exception&){rejected=true;}
   CHECK(rejected);const auto& live=d.timeline_.state().cels.front();
   CHECK(live.text&&live.text->text==baseline.text&&live.text->fontSize==baseline.fontSize);
   CHECK(live.surface->offsetX==original.offsetX&&live.surface->offsetY==original.offsetY&&live.surface->width==original.width&&live.surface->height==original.height&&live.surface->pixels==original.pixels&&live.surface->pixels.identity()==pixelIdentity);
   CHECK(d.historyPosition()==position&&d.historyBytes()==bytes&&d.revision()==revision&&d.contentRevision()==content&&d.historyRevision()==history&&d.state_==state&&d.dirty()==dirty&&d.activeLayerId_==active&&d.activeFrameId_==frame);
   CHECK(d.change_.x==pendingDamage.x&&d.change_.y==pendingDamage.y&&d.change_.w==pendingDamage.w&&d.change_.h==pendingDamage.h);
   const auto afterStamp=d.timeline_.thumbnailStorage(id);CHECK(afterStamp.owner==stamp.owner&&afterStamp.revision==stamp.revision);
  }
 }
 static MOON_HISTORY_FIXTURE_NOINLINE void lockParentGroup(Document& d){auto state=d.timeline_.state();timeline::Group parent;parent.id="paste-locked-parent";parent.name=U"Parent";parent.locked=true;timeline::Group inner;inner.id="paste-inner";inner.name=U"Inner";inner.parentGroupId=parent.id;state.groups={parent,inner};state.layers.front().groupId=inner.id;d.timeline_=timeline::Timeline(std::move(state));}
 static MOON_HISTORY_FIXTURE_NOINLINE void fillStrokeBudget(Document& d){auto state=d.timeline_.state();state.frames.push_back({"budget-other-frame",100});auto& c=state.cels.front();c.frameId="budget-other-frame";c.surface->width=c.surface->height=8192;c.surface->pixels.resize(std::size_t(8192)*8192);d.timeline_=timeline::Timeline(std::move(state));}
 static MOON_HISTORY_FIXTURE_NOINLINE void releaseStrokeBudgetRow(Document& d){auto* s=const_cast<timeline::Surface*>(d.timeline_.resolveSurface(d.timeline_.state().cels.front().id).surface);--s->height;s->pixels.resize(std::size_t(s->width)*s->height);}
 static bool lastDense(const Document& d){return !d.history_.empty()&&bool(d.history_.latest().contentHistory.dense)&&d.history_.latest().pixels.empty();}
 static MOON_HISTORY_FIXTURE_NOINLINE void fillBackdrop(Document& d){auto state=d.timeline_.state();auto layer=state.layers.front();layer.id+="-backdrop";auto c=state.cels.front();c.id+="-backdrop";c.layerId=layer.id;for(int y=0;y<d.height_;++y)for(int x=0;x<d.width_;++x)c.surface->pixels[std::size_t(y)*d.width_+x]=x==d.width_/2?0xffeeeeee:0xff334455;state.layers.push_back(std::move(layer));state.cels.push_back(std::move(c));d.timeline_=timeline::Timeline(std::move(state));}
 static MOON_HISTORY_FIXTURE_NOINLINE void removeFreeSources(Document& d){auto state=d.timeline_.state();for(auto& layer:state.layers)if(layer.id==d.layer().id){layer.freeTiles->sources.clear();layer.freeTiles->legacyTilesetId.clear();}d.timeline_=timeline::Timeline(std::move(state));}
 static MOON_HISTORY_FIXTURE_NOINLINE void emptyOnlyActiveSlot(Document& d){auto state=d.timeline_.state();const auto layer=d.layer().id,frame=d.frame().id;state.cels.erase(std::remove_if(state.cels.begin(),state.cels.end(),[&](const auto& c){return c.layerId==layer&&c.frameId==frame;}),state.cels.end());d.timeline_=timeline::Timeline(std::move(state));}
 static MOON_HISTORY_FIXTURE_NOINLINE void sparseSelection(Document& d){auto state=d.timeline_.state();state.frames.push_back({"sparse-middle",100});state.frames.push_back({"sparse-last",100});auto last=state.cels.front();last.id="sparse-last-cel";last.frameId="sparse-last";state.cels.push_back(last);d.timeline_=timeline::Timeline(std::move(state));}
 static MOON_HISTORY_FIXTURE_NOINLINE void emptyActiveSlot(Document& d){auto state=d.timeline_.state();state.cels.clear();d.timeline_=timeline::Timeline(std::move(state));}
 static MOON_HISTORY_FIXTURE_NOINLINE void install(Document& d,timeline::Surface s){auto state=d.timeline_.state();const auto id=d.timeline_.resolveSurface(d.cel().id).source->id;auto it=std::find_if(state.cels.begin(),state.cels.end(),[&](const auto& c){return c.id==id;});it->surface=std::move(s);d.timeline_=timeline::Timeline(std::move(state));}
 static MOON_HISTORY_FIXTURE_NOINLINE void expand(Document& d,raster::Rect64 r){const auto& s=*d.timeline_.resolveSurface(d.cel().id).surface;auto candidate=raster::expanded(s,r);if(candidate)install(d,std::move(*candidate));}
 static std::vector<std::string> secondAdjustmentOwner(Document& d){auto state=d.timeline_.state();auto l=state.layers.front();l.id+="-adjustment-other";auto c=state.cels.front();c.id+="-adjustment-other";c.layerId=l.id;c.linkedCelId.reset();c.runtimeSharedCelId.reset();state.layers.push_back(l);state.cels.push_back(std::move(c));auto ids=std::vector<std::string>{state.layers.front().id,l.id};d.timeline_=timeline::Timeline(std::move(state));return ids;}
 static MOON_HISTORY_FIXTURE_NOINLINE void invalidateLastAdjustmentPreview(Document& d){auto& p=*d.adjustment_;auto* s=const_cast<timeline::Surface*>(p.preview.resolveSurface(p.targets.back()).surface);++s->width;}
 static MOON_HISTORY_FIXTURE_NOINLINE void changeMaskMetadata(Document& d){auto state=d.timeline_.state();for(auto& slot:state.masks){slot.mask.moveWithOwner=false;slot.mask.autoLinkAnimationCels=true;}d.timeline_=timeline::Timeline(std::move(state));}
 static MOON_HISTORY_FIXTURE_NOINLINE void dense(Document& d,Pixel ink){Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.cel().id;Document::DensePixels dense{10,12,32,24,std::vector<Pixel>(32*24),std::vector<Pixel>(32*24,ink)};e.contentHistory.dense=std::move(dense);d.applyEdit(e,true);d.pushEdit(std::move(e));}
 static MOON_HISTORY_FIXTURE_NOINLINE void run(Document& d,Pixel ink){Document::Edit e{{},d.state_,d.nextState_};e.contentHistory.targetCelId=d.cel().id;e.contentHistory.runs.push_back({60,70,0,ink});d.applyEdit(e,true);d.pushEdit(std::move(e));}
};
}
using namespace moon;
const timeline::Surface& surface(const Document& d){return *d.timeline().resolveSurface(d.cel().id).surface;}
timeline::Surface sparse(int x=-2){timeline::Surface s;s.width=2;s.height=1;s.offsetX=x;s.offsetY=1;s.pixels={0xff0000ff,0x00030201};return s;}
__declspec(noinline) void verifyAbsentPaste(){
 for(bool backdrop:{false,true})for(int mode=0;mode<6;++mode){
  auto document=std::make_unique<Document>(8,6),oracle=std::make_unique<Document>(8,6);auto& d=*document;auto& reference=*oracle;if(backdrop){RasterHistoryFixture::fillBackdrop(d);RasterHistoryFixture::fillBackdrop(reference);}RasterHistoryFixture::emptyOnlyActiveSlot(d);d.setLayerOpacity(.57);reference.setLayerOpacity(.57);SelectionMask before{0,0,1,1,{}};d.previewSelection(before);reference.previewSelection(before);d.markSaved();const auto h=d.historySize(),content=d.contentRevision(),count=d.timeline().state().cels.size();
  SelectionClipboard clip;clip.width=3;clip.height=2;clip.pixels={0xff123456,0x80123456,0x00030201,0xffabcdef,0xff334455,0};clip.mask={1,1,1,0,1,1};
  CHECK(d.beginFloatingPaste(clip,-1,1)&&reference.beginFloatingPaste(clip,-1,1));CHECK(!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==h&&d.contentRevision()==content&&!d.dirty());
  auto preview=d.floatingOverlayRegion({0,0,8,6});CHECK(preview==reference.canvasPixels());CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,6},d.layer().id,&preview,8)==compositeNormalRegion(reference.timeline(),reference.frame().id,{0,0,8,6}));
  d.cancelFloatingPaste();reference.cancelFloatingPaste();CHECK(!d.floating()&&!d.activeSurfaceIfPresent()&&selectionEqual(d.selection(),before)&&d.historySize()==h&&!d.dirty());
  CHECK(d.beginFloatingPaste(clip,-1,1)&&reference.beginFloatingPaste(clip,-1,1));if(mode==1){CHECK(d.flipContent(true)&&reference.flipContent(true));}auto transform=*d.floatingTransform();if(mode==2)transform.angle=35;if(mode==3){transform.width=5;transform.height=4;}if(mode==4){transform.x=30;transform.y=30;}if(mode==5){transform.angle=90;}d.transformFloatingPaste(transform,mode==5);reference.transformFloatingPaste(transform,mode==5);preview=d.floatingOverlayRegion({0,0,8,6});CHECK(preview==reference.canvasPixels()&&selectionEqual(d.selection(),reference.selection()));
  const auto selected=d.selection();const bool changed=reference.commitFloatingPaste();CHECK(d.commitFloatingPaste()==changed&&d.canvasPixels()==reference.canvasPixels()&&d.historySize()==h+1);CHECK(d.timeline().state().cels.size()==count+(changed?1:0));const auto id=changed?d.cel().id:std::string{};d.undo();CHECK(d.canvasPixels()==std::vector<Pixel>(48)&&selectionEqual(d.selection(),before));if(changed)CHECK(d.cel().id==id);d.redo();CHECK(d.canvasPixels()==preview&&selectionEqual(d.selection(),selected));if(changed)CHECK(d.cel().id==id&&d.cel().opacity==.57);
 }
 for(int action=0;action<4;++action){auto document=std::make_unique<Document>(8,6),oracle=std::make_unique<Document>(8,6);auto& d=*document;auto& r=*oracle;RasterHistoryFixture::emptyActiveSlot(d);SelectionClipboard clip;clip.width=3;clip.height=2;clip.pixels={0x80123456,0xff123456,0,0xffabcdef,0,0xff334455};clip.mask={1,1,1,1,0,1};CHECK(d.beginFloatingPaste(clip,-1,1)&&r.beginFloatingPaste(clip,-1,1));d.deselectPixels();r.deselectPixels();d.undo();r.undo();CHECK(d.floating()&&r.floating());if(action==0){CHECK(d.flipContent(true)&&r.flipContent(true));}else{auto transform=*d.floatingTransform();transform.x=3;transform.y=2;if(action==2)transform.angle=35;d.transformFloatingPaste(transform,action==3);r.transformFloatingPaste(transform,action==3);}CHECK(d.canvasPixels()==r.canvasPixels()&&selectionEqual(d.selection(),r.selection()));const auto preview=d.canvasPixels();if(action==3){d.cancelFloatingPaste();r.cancelFloatingPaste();CHECK(d.canvasPixels()==r.canvasPixels()&&selectionEqual(d.selection(),r.selection()));}else{CHECK(d.commitFloatingPaste()==r.commitFloatingPaste());CHECK(d.canvasPixels()==preview);d.undo();r.undo();CHECK(d.canvasPixels()==r.canvasPixels()&&selectionEqual(d.selection(),r.selection()));d.redo();r.redo();CHECK(d.canvasPixels()==r.canvasPixels()&&d.canvasPixels()==preview);}}
 for(bool absent:{false,true})for(bool grouped:{false,true}){auto document=std::make_unique<Document>(8,6);auto& d=*document;if(absent)RasterHistoryFixture::emptyActiveSlot(d);if(grouped)RasterHistoryFixture::lockParentGroup(d);else d.setLayerLocked(true);d.previewSelection(SelectionMask{1,1,2,2,{}});d.markSaved();const auto h=d.historySize(),content=d.contentRevision(),count=d.timeline().state().cels.size();const auto selection=d.selection();SelectionClipboard clip;clip.width=clip.height=1;clip.pixels={0xff123456};CHECK(!d.beginFloatingPaste(clip,2,1)&&!d.floating()&&selectionEqual(d.selection(),selection)&&d.historySize()==h&&d.contentRevision()==content&&d.timeline().state().cels.size()==count&&!d.dirty());}
 for(bool sparseMask:{false,true}){auto document=std::make_unique<Document>(320,320);auto& d=*document;RasterHistoryFixture::emptyActiveSlot(d);SelectionClipboard clip;clip.width=clip.height=300;clip.pixels.assign(90000,0x80123456);if(sparseMask){clip.mask.assign(90000,0);clip.mask[0]=1;}CHECK(d.beginFloatingPaste(clip,2,3));CHECK(!d.activeSurfaceIfPresent()&&d.floatingDeferred());const auto preview=d.floatingOverlayRegion({0,0,320,320});CHECK(d.commitFloatingPaste()&&d.canvasPixels()==preview&&RasterHistoryFixture::lastDense(d)==!sparseMask);const auto id=d.cel().id;d.undo();CHECK(d.cel().id==id&&d.canvasPixels()==std::vector<Pixel>(320*320));d.redo();CHECK(d.canvasPixels()==preview);}
 {auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::emptyActiveSlot(d);SelectionClipboard clip;clip.width=clip.height=1;clip.pixels={0x00030201};CHECK(d.beginFloatingPaste(clip,2,1)&&!d.commitFloatingPaste()&&!d.activeSurfaceIfPresent()&&!d.dirty());}
 {auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::emptyActiveSlot(d);SelectionClipboard clip;clip.width=clip.height=1;clip.pixels={0xff123456};CHECK(d.beginFloatingPaste(clip,2,1));d.deselectPixels();const auto id=d.cel().id;CHECK(!d.selection()&&!d.floating());d.undo();CHECK(d.floating()&&d.cel().id==id);d.cancelFloatingPaste();d.undo();CHECK(d.canvasPixels()==std::vector<Pixel>(48)&&d.cel().id==id);d.redo();CHECK(d.canvasPixels()[10]==clip.pixels[0]);}
}
__declspec(noinline) void verifyAbsentFloatingCenter(){
 for(int axis=0;axis<3;++axis)for(int mode=0;mode<4;++mode){
  auto document=std::make_unique<Document>(8,6),oracle=std::make_unique<Document>(8,6);auto& d=*document;auto& r=*oracle;RasterHistoryFixture::emptyActiveSlot(d);SelectionMask before{-1,0,3,2,{1,0,1,0,1,0}};d.previewSelection(before);r.previewSelection(before);d.markSaved();const auto h=d.historySize(),content=d.contentRevision();
  if(mode==3){CHECK(d.beginSelectionContentMove(false)&&r.beginSelectionContentMove(false));}else{SelectionClipboard clip;clip.width=3;clip.height=2;clip.pixels={0x80123456,0xffabcdef,0,0xff334455,0,0xff556677};clip.mask=before.mask;CHECK(d.beginFloatingPaste(clip,-1,0)&&r.beginFloatingPaste(clip,-1,0));if(mode){auto transform=*d.floatingTransform();if(mode==1)transform.angle=35;else{transform.width=5;transform.height=3;}d.transformFloatingPaste(transform);r.transformFloatingPaste(transform);}}
  const bool horizontal=axis!=2,vertical=axis!=1;CHECK(d.centerActiveContent(horizontal,vertical)==r.centerActiveContent(horizontal,vertical));CHECK(selectionEqual(d.selection(),r.selection())&&d.historySize()==h&&d.contentRevision()==content&&!d.dirty()&&!d.activeSurfaceIfPresent());if(mode!=3)CHECK(d.floatingOverlayRegion({0,0,8,6})==r.canvasPixels());CHECK(!d.centerActiveContent(horizontal,vertical));
  d.cancelFloatingPaste();r.cancelFloatingPaste();CHECK(!d.activeSurfaceIfPresent()&&selectionEqual(d.selection(),before)&&d.historySize()==h&&!d.dirty());
 }
}
__declspec(noinline) void verifyAbsentSmooth(){
 for(bool backdrop:{false,true})for(int strength:{0,1,50,100})for(int mask=0;mask<3;++mask){auto document=std::make_unique<Document>(8,6),oracle=std::make_unique<Document>(8,6);auto& d=*document;auto& r=*oracle;if(backdrop){RasterHistoryFixture::fillBackdrop(d);RasterHistoryFixture::fillBackdrop(r);}RasterHistoryFixture::emptyOnlyActiveSlot(d);std::optional<SelectionMask> selection;if(mask){selection=SelectionMask{1,1,4,3,{}};if(mask==2)selection->mask={1,0,1,0,0,1,0,1,1,0,1,0};}d.previewSelection(selection);r.previewSelection(selection);d.markSaved();const auto h=d.historySize(),rev=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();const auto before=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,6});std::vector<std::size_t> visited;for(std::size_t i=0;i<48;++i)visited.push_back(i);CHECK(!d.applySmoothBrush(visited,strength)&&!r.applySmoothBrush(visited,strength));CHECK(!d.activeSurfaceIfPresent()&&!d.active()&&d.timeline().state().cels.size()==count&&d.historySize()==h&&d.revision()==rev&&d.contentRevision()==content&&!d.dirty()&&selectionEqual(d.selection(),selection)&&compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,6})==before);bool rejected=false;try{d.applySmoothBrush({48},strength);}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected&&!d.activeSurfaceIfPresent());}
}
__declspec(noinline) void verifyAbsentStrokeBudget(){
 auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::fillStrokeBudget(d);d.markSaved();const auto h=d.historySize(),rev=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();const auto& stored=*d.timeline().state().cels.front().surface;const auto identity=stored.pixels.identity(),data=static_cast<const void*>(stored.pixels.data());const auto storageRevision=stored.pixels.revision();bool rejected=false;try{d.beginStroke({2,3},0xff123456);}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!d.active()&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==h&&d.revision()==rev&&d.contentRevision()==content&&!d.dirty());CHECK(stored.pixels.identity()==identity&&stored.pixels.data()==data&&stored.pixels.revision()==storageRevision);
 RasterHistoryFixture::releaseStrokeBudgetRow(d);d.beginStroke({2,3},0xff123456);CHECK(d.active()&&d.canvasPixels()[26]==0xff123456&&d.timeline().state().cels.size()==count);d.cancelStroke();CHECK(!d.active()&&!d.activeSurfaceIfPresent()&&d.historySize()==h&&!d.dirty());
}
__declspec(noinline) void verifyPasteMissingAnchorDirect(){
 auto document=std::make_unique<Document>(8,6);auto& d=*document;d.selectTimelineCel(d.cel().id);CHECK(d.copySelectedCels());RasterHistoryFixture::emptyOnlyActiveSlot(d);d.clearTimelineSelection();d.markSaved();const auto h=d.historySize(),revision=d.revision(),content=d.contentRevision();CHECK(!d.pasteCopiedCels());Document::CelClipboardItem selected;selected.selectionPixels=SelectionClipboard{1,1,2,3,{0xff123456},{1}};CHECK(!d.beginCelSelectionPaste({selected}));CHECK(!d.activeSurfaceIfPresent()&&!d.floating()&&d.timeline().state().cels.empty()&&d.historySize()==h&&d.revision()==revision&&d.contentRevision()==content&&!d.dirty()&&d.hasCelClipboard());
}
__declspec(noinline) void verifySelectionPasteInactiveMissing(){
 for(bool commit:{false,true}){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::sparseSelection(d);Document::CelClipboardItem item;item.cel=d.cel();item.selectionPixels=SelectionClipboard{1,1,2,3,{0xff123456},{1}};auto missing=item;missing.column=1;missing.cel.id="selection-missing-source";const auto h=d.historySize(),count=d.timeline().state().cels.size();CHECK(d.beginCelSelectionPaste({item,missing})&&d.floating());CHECK(!d.timeline().findCel(d.layer().id,"sparse-middle")&&d.timeline().state().cels.size()==count&&d.canvasPixels()[26]==0xff123456);if(commit){CHECK(d.commitFloatingPaste());d.undo();CHECK(d.canvasPixels()==std::vector<Pixel>(48));d.redo();CHECK(d.canvasPixels()[26]==0xff123456);}else{d.cancelFloatingPaste();CHECK(d.historySize()==h&&d.canvasPixels()==std::vector<Pixel>(48));}CHECK(!d.timeline().findCel(d.layer().id,"sparse-middle")&&d.timeline().state().cels.size()==count);
 }
}
__declspec(noinline) void verifyCelPasteMissingDestination(){
 for(bool cross:{false,true})for(bool missingAnchor:{false,true}){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;d.beginStroke({2,3},0xff123456);d.commitStroke();RasterHistoryFixture::sparseSelection(d);const auto root=d.cel().id;d.selectTimelineCel(root);CHECK(d.copySelectedCels());auto clip=d.exportCelClipboard();if(!missingAnchor){auto second=clip.items.front();second.cel.id="clipboard-other";second.column=1;second.cel.frameId="sparse-middle";clip.items.push_back(second);}if(cross)++clip.sourceIdentity;
  d.clearTimelineSelection();if(missingAnchor)d.selectFrame("sparse-middle");d.markSaved();const auto h=d.historySize(),revision=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();CHECK(!d.pasteCelClipboard(clip));CHECK(d.historySize()==h&&d.revision()==revision&&d.contentRevision()==content&&!d.dirty()&&d.timeline().state().cels.size()==count&&d.timeline().state().frames.size()==3&&!d.timeline().findCel(d.layer().id,"sparse-middle")&&d.timelineSelection().cels.empty()&&d.hasCelClipboard());CHECK(d.timeline().resolveSurface(root).surface->pixels[26]==0xff123456);
 }
}
__declspec(noinline) void verifyCompactFrameBudget(){
 auto document=std::make_unique<Document>(1024,1024);auto& d=*document;const auto original=d.frame().id;for(int n=0;n<70;++n)d.addFrame();CHECK(d.timeline().state().frames.size()==71&&d.activeSurface().pixels.size()==1);const auto made=d.frame().id;d.undo();CHECK(d.timeline().state().frames.size()==70);d.redo();CHECK(d.frame().id==made&&d.timeline().state().frames.size()==71);d.selectFrame(original);CHECK(d.activeSurface().pixels.size()==1024*1024);
 auto full=std::make_unique<Document>(8,6);RasterHistoryFixture::fillStrokeBudget(*full);full->markSaved();const auto h=full->historySize(),rev=full->revision(),count=full->timeline().state().frames.size();bool rejected=false;try{full->addFrame();}catch(const std::length_error&){rejected=true;}CHECK(rejected&&full->historySize()==h&&full->revision()==rev&&!full->dirty()&&!full->activeSurfaceIfPresent()&&full->timeline().state().frames.size()==count);
}
__declspec(noinline) void verifyLinkedFrameAbsentTarget(){
 for(bool visible:{false,true})for(bool selectCell:{false,true}){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;if(visible){d.beginStroke({2,3},0xff123456);d.commitStroke();}RasterHistoryFixture::sparseSelection(d);const auto original=d.frame().id,root=d.cel().id;if(selectCell)d.selectTimelineCel(root);else d.selectFrameHeader(original);const auto selected=d.timelineSelection();const auto frames=d.selectedFrames();const auto h=d.historySize(),count=d.timeline().state().cels.size();d.addLinkedFrame();CHECK(d.frame().id=="sparse-middle"&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.timeline().state().frames.size()==3&&d.historySize()==h+1&&d.selectedFrames().empty()&&d.timelineSelection().cels.empty());d.undo();CHECK(d.frame().id==original&&d.timelineSelection().cels==selected.cels&&d.selectedFrames()==frames&&!d.timeline().findCel(d.layer().id,"sparse-middle"));d.redo();CHECK(d.frame().id=="sparse-middle"&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.selectedFrames().empty());
 }
}
__declspec(noinline) void verifyBlankFrameGeometry(){
 for(bool visible:{false,true})for(bool autoLink:{false,true}){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;timeline::Surface source;source.width=3;source.height=2;source.offsetX=-7;source.offsetY=9;source.pixels.resize(6);if(visible)source.pixels[0]=0xff123456;RasterHistoryFixture::install(d,source);d.setLayerAutoLinkAnimationCels(d.layer().id,autoLink);const auto original=d.frame().id,root=d.cel().id;d.addFrame();const auto made=d.frame().id;const auto& next=d.activeSurface();CHECK(next.width==(visible&&autoLink?3:1)&&next.height==(visible&&autoLink?2:1));CHECK(next.offsetX==(visible&&autoLink?-7:0)&&next.offsetY==(visible&&autoLink?9:0));CHECK(bool(d.cel().linkedCelId)==(visible&&autoLink));if(visible&&autoLink)CHECK(d.cel().linkedCelId==root);else CHECK(next.pixels.size()==1&&next.pixels[0]==0);d.undo();CHECK(d.frame().id==original&&d.activeSurface().width==3&&d.activeSurface().offsetX==-7);d.redo();CHECK(d.frame().id==made&&d.activeSurface().width==(visible&&autoLink?3:1));
  if(!autoLink){d.beginStroke({6,4},0xffabcdef);CHECK(d.commitStroke()&&d.canvasPixels()[38]==0xffabcdef);d.undo();CHECK(d.canvasPixels()==std::vector<Pixel>(48));d.redo();CHECK(d.canvasPixels()[38]==0xffabcdef);}
 }
}
__declspec(noinline) void verifyFrameFromAbsentSlot(){
 for(int mode=0;mode<3;++mode)for(bool autoLink:{false,true}){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;d.setLayerAutoLinkAnimationCels(d.layer().id,autoLink);RasterHistoryFixture::emptyOnlyActiveSlot(d);d.clearTimelineSelection();d.markSaved();const auto original=d.frame().id;const auto h=d.historySize(),count=d.timeline().state().cels.size();if(mode==2)d.addLinkedFrame();else d.addFrame(mode==1);const auto made=d.frame().id;CHECK(made!=original&&d.historySize()==h+1&&d.timeline().state().cels.size()==count+1&&!d.timeline().findCel(d.layer().id,original)&&!d.cel().linkedCelId);const auto& surface=d.activeSurface();CHECK(surface.width==1&&surface.height==1&&surface.offsetX==0&&surface.offsetY==0&&surface.pixels.size()==1&&surface.pixels[0]==0);d.undo();CHECK(d.frame().id==original&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count);d.redo();CHECK(d.frame().id==made&&d.timeline().state().cels.size()==count+1&&d.canvasPixels()==std::vector<Pixel>(48));
 }
}
__declspec(noinline) void verifyConnectAcrossAbsentSlot(){
 for(bool visible:{false,true}){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;if(visible){d.beginStroke({2,3},0xff123456);d.commitStroke();}RasterHistoryFixture::sparseSelection(d);const auto root=d.cel().id;d.selectTimelineCel(root);d.selectTimelineCel("sparse-last-cel",2);d.markSaved();const auto h=d.historySize(),count=d.timeline().state().cels.size();CHECK(d.canConnectSelectedCels()==visible);CHECK(d.connectSelectedCels()==visible);CHECK(!d.timeline().findCel(d.layer().id,"sparse-middle")&&d.timeline().state().cels.size()==count&&d.historySize()==h+(visible?1:0));if(visible){CHECK(d.timeline().findCelById("sparse-last-cel")->linkedCelId==root);d.undo();CHECK(!d.timeline().findCelById("sparse-last-cel")->linkedCelId&&!d.timeline().findCel(d.layer().id,"sparse-middle"));d.redo();CHECK(d.timeline().findCelById("sparse-last-cel")->linkedCelId==root&&d.timeline().resolveSurface("sparse-last-cel").surface->pixels[26]==0xff123456);}else CHECK(!d.dirty());
 }
}
__declspec(noinline) void verifyAbsentGeometryRollback(){
 auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::sparseSelection(d);const auto first=d.frame().id;timeline::Surface surface;surface.width=3;surface.height=2;surface.offsetX=-7;surface.offsetY=9;surface.pixels.resize(6);RasterHistoryFixture::install(d,std::move(surface));d.selectFrame("sparse-middle");auto backup=std::make_unique<Document>(d);d.selectFrame("sparse-last");d.selectFrame("sparse-middle");const std::array<int,4> original{8,6,0,0},saved{3,2,-7,9};CHECK(d.copySelectedFrames()&&d.exportFrameClipboard().layerGeometry[0]==original);const auto h=d.historySize(),count=d.timeline().state().cels.size();CHECK(d.rollbackProject(*backup)&&d.historySize()==h+1&&!d.activeSurfaceIfPresent());CHECK(d.copySelectedFrames()&&d.exportFrameClipboard().layerGeometry[0]==saved&&d.timeline().state().cels.size()==count);d.undo();CHECK(d.copySelectedFrames()&&d.exportFrameClipboard().layerGeometry[0]==original&&!d.activeSurfaceIfPresent());d.redo();CHECK(d.copySelectedFrames()&&d.exportFrameClipboard().layerGeometry[0]==saved&&!d.activeSurfaceIfPresent());
}
__declspec(noinline) void verifyAbsentFrameGeometry(){
 auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::sparseSelection(d);const auto first=d.frame().id;timeline::Surface surface;surface.width=3;surface.height=2;surface.offsetX=-7;surface.offsetY=9;surface.pixels.resize(6);surface.pixels[0]=0xff123456;RasterHistoryFixture::install(d,std::move(surface));d.selectFrame("sparse-middle");d.markSaved();const auto h=d.historySize(),revision=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();CHECK(d.copySelectedFrames());auto clip=d.exportFrameClipboard();const std::array<int,4> expected{3,2,-7,9};CHECK(clip.layerGeometry.size()==1&&clip.layerGeometry[0]==expected&&clip.items.size()==1&&clip.items[0].cels.empty());CHECK(!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==h&&d.revision()==revision&&d.contentRevision()==content&&!d.dirty());
 // Cross-document creation consumes retained display geometry for new layers.
 auto target=std::make_unique<Document>(2,2);auto cross=clip;auto extra=cross.layers.front();extra.id="copied-extra-layer";cross.layers.push_back(extra);cross.layerGeometry.push_back(expected);CHECK(target->pasteFrameClipboard(cross));const auto added=target->timeline().state().layers.back().id;const auto originalFrame=target->timeline().state().frames.front().id;const auto* blank=target->timeline().findCel(added,originalFrame);CHECK(blank);const auto* retained=target->timeline().resolveSurface(blank->id).surface;CHECK(retained&&retained->width==3&&retained->height==2&&retained->offsetX==-7&&retained->offsetY==9);target->undo();CHECK(target->timeline().state().layers.size()==1);target->redo();CHECK(target->timeline().state().layers.size()==2);
 d.selectFrame("sparse-last");d.selectFrame("sparse-middle");CHECK(d.copySelectedFrames());clip=d.exportFrameClipboard();const std::array<int,4> last{8,6,0,0};CHECK(clip.layerGeometry[0]==last);d.selectFrame(first);d.selectFrame("sparse-middle");CHECK(d.copySelectedFrames()&&d.exportFrameClipboard().layerGeometry[0]==expected);
}
__declspec(noinline) void verifyAbsentDisconnect(){
 for(bool selectSource:{false,true}){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;d.beginStroke({2,3},0xff123456);d.commitStroke();const auto root=d.cel().id;d.addLinkedFrame();const auto alias=d.cel().id;d.addFrame();RasterHistoryFixture::emptyOnlyActiveSlot(d);d.restoreTimelineSelection({},{});d.markSaved();const auto h=d.historySize(),revision=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();
  CHECK(!d.canDisconnectSelectedCels()&&!d.disconnectSelectedCels());d.disconnectCel();CHECK(!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==h&&d.revision()==revision&&d.contentRevision()==content&&!d.dirty()&&d.timeline().findCelById(alias)->linkedCelId==root);
  Document::TimelineSelection selected;selected.cels={selectSource?root:alias};d.restoreTimelineSelection(selected,{});CHECK(d.canDisconnectSelectedCels()&&d.disconnectSelectedCels());CHECK(!d.timeline().findCelById(alias)->linkedCelId&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==h+1);CHECK(d.timeline().resolveSurface(alias).surface->pixels[26]==0xff123456);d.undo();CHECK(d.timeline().findCelById(alias)->linkedCelId==root&&!d.activeSurfaceIfPresent());d.redo();CHECK(!d.timeline().findCelById(alias)->linkedCelId&&!d.activeSurfaceIfPresent()&&!d.canDisconnectSelectedCels());
 }
}
__declspec(noinline) void verifyAbsentCopy(){
 for(bool backdrop:{false,true})for(bool masked:{false,true}){
  Document d(8,6);if(backdrop)RasterHistoryFixture::fillBackdrop(d);CHECK(d.copySelectedFrames()&&d.hasFrameClipboard());RasterHistoryFixture::emptyOnlyActiveSlot(d);d.markSaved();
  SelectionMask selection{-1,-1,10,8,{}};if(masked){selection.mask.assign(80,1);selection.mask[22]=0;}d.previewSelection(selection);
  const auto history=d.historySize(),revision=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();const auto before=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,6});
  CHECK(!d.copyPixels()&&d.hasFrameClipboard());CHECK(selectionEqual(d.selection(),selection)&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count);
  CHECK(d.historySize()==history&&d.revision()==revision&&d.contentRevision()==content&&!d.dirty()&&compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,6})==before);
 }
}
__declspec(noinline) void verifyAbsentSelectionCommands(){
 for(bool backdrop:{false,true})for(bool masked:{false,true}){
  Document d(8,6);if(backdrop)RasterHistoryFixture::fillBackdrop(d);CHECK(d.copySelectedFrames()&&d.hasFrameClipboard());RasterHistoryFixture::emptyOnlyActiveSlot(d);d.markSaved();
  SelectionMask selection{0,1,3,2,{}};if(masked)selection.mask={1,0,1,0,1,0};d.previewSelection(selection);
  const auto history=d.historySize(),revision=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();const auto before=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,6});
  CHECK(!d.deleteSelectedPixels()&&selectionEqual(d.selection(),selection));
  for(const auto axes:{std::pair{true,false},std::pair{false,true},std::pair{true,true}})CHECK(!d.centerActiveContent(axes.first,axes.second)&&selectionEqual(d.selection(),selection));
  d.previewSelection({});CHECK(!d.centerActiveContent(true,true)&&!d.selection());d.previewSelection(selection);
  std::optional<SelectionClipboard> copied=SelectionClipboard{};CHECK(!d.cutPixels(copied)&&!copied&&!d.selection()&&d.hasFrameClipboard());
  CHECK(!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==history&&d.revision()==revision&&d.contentRevision()==content&&!d.dirty());
  CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,6})==before);
 }
}
__declspec(noinline) void verifyAbsentSelectionFill(){
 for(bool backdrop:{false,true})for(int mode=0;mode<3;++mode)for(Pixel ink:{Pixel(0x80123456),Pixel(0x00030201)}){
  auto document=std::make_unique<Document>(8,6),oracle=std::make_unique<Document>(8,6);auto& d=*document;auto& reference=*oracle;if(backdrop){RasterHistoryFixture::fillBackdrop(d);RasterHistoryFixture::fillBackdrop(reference);}d.setLayerOpacity(.57);reference.setLayerOpacity(.57);RasterHistoryFixture::emptyOnlyActiveSlot(d);
  std::optional<SelectionMask> selection;if(mode){selection=SelectionMask{1,1,4,3,{}};if(mode==2)selection->mask={1,0,1,0,0,1,0,1,1,0,1,0};}d.previewSelection(selection);reference.previewSelection(selection);d.markSaved();const auto h=d.historySize(),count=d.timeline().state().cels.size();
  CHECK(reference.fillSelectionOrCanvas(ink)&&d.fillSelectionOrCanvas(ink));CHECK(d.canvasPixels()==reference.canvasPixels()&&selectionEqual(d.selection(),selection)&&d.historySize()==h+1&&d.timeline().state().cels.size()==count+1);const auto id=d.cel().id;const auto expected=d.canvasPixels();CHECK(d.cel().opacity==.57);
  d.undo();CHECK(d.cel().id==id&&d.canvasPixels()==std::vector<Pixel>(48)&&selectionEqual(d.selection(),selection));d.redo();CHECK(d.cel().id==id&&d.canvasPixels()==expected);
 }
 for(int mode=0;mode<5;++mode){auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::emptyActiveSlot(d);if(mode==1)d.setLayerLocked(true);if(mode==2)d.setLayerVisible(false);if(mode==3)d.previewSelection(SelectionMask{0,0,8,6,std::vector<unsigned char>(48)});if(mode==4)d.previewSelection(SelectionMask{20,20,1,1,{}});d.markSaved();const auto h=d.historySize(),rev=d.revision(),content=d.contentRevision();CHECK(!d.fillSelectionOrCanvas(mode?0xff123456:0));CHECK(!d.activeSurfaceIfPresent()&&d.timeline().state().cels.empty()&&d.historySize()==h&&d.revision()==rev&&d.contentRevision()==content&&!d.dirty());}
 for(bool sparseMask:{false,true}){auto document=std::make_unique<Document>(512,512);auto& d=*document;RasterHistoryFixture::emptyActiveSlot(d);if(sparseMask){SelectionMask s{0,0,512,512,std::vector<unsigned char>(512*512)};s.mask[0]=1;d.previewSelection(std::move(s));}CHECK(d.fillSelectionOrCanvas(0xff123456)&&RasterHistoryFixture::lastDense(d)==!sparseMask);const auto expected=d.canvasPixels();CHECK(std::count(expected.begin(),expected.end(),Pixel(0xff123456))==(sparseMask?1:512*512));d.undo();CHECK(d.canvasPixels()==std::vector<Pixel>(512*512));d.redo();CHECK(d.canvasPixels()==expected);}
}
__declspec(noinline) void verifyAbsentShape(){
 for(int mode=0;mode<7;++mode)for(Pixel ink:{Pixel(0x80123456),Pixel(0x00030201)}){
  auto document=std::make_unique<Document>(20,20),oracle=std::make_unique<Document>(20,20);auto& d=*document;auto& reference=*oracle;RasterHistoryFixture::fillBackdrop(d);RasterHistoryFixture::fillBackdrop(reference);RasterHistoryFixture::emptyOnlyActiveSlot(d);
  SelectionMask selection{1,1,18,18,std::vector<unsigned char>(324,1)};selection.mask[3*18+3]=0;d.previewSelection(selection);reference.previewSelection(selection);d.symmetryAxes.vertical=reference.symmetryAxes.vertical=true;d.markSaved();const auto h=d.historySize(),rev=d.contentRevision(),count=d.timeline().state().cels.size();
  ShapeSpec spec;spec.kind=mode==0?ShapeKind::Line:mode==1?ShapeKind::Rectangle:mode==2?ShapeKind::RectangleOutline:mode==3?ShapeKind::Ellipse:ShapeKind::EllipseOutline;spec.bounds={3,4,10,10};spec.strokeWidth=3;spec.start={3,4};spec.end={13,12};spec.brush={3,100,BrushShape::Square};if(mode==4)spec.bounds.angle=25;if(mode>=5){spec.kind=mode==5?ShapeKind::Polygon:ShapeKind::Freeform;spec.polygonPath={{3,4},{12,4},{12,13},{3,13}};}
  CHECK(d.beginShapePreview()&&d.updateShapePreview(spec,ink));CHECK(d.timeline().state().cels.size()==count&&d.historySize()==h&&d.contentRevision()==rev&&!d.dirty());d.cancelShapePreview();CHECK(!d.shapeActive()&&!d.activeSurfaceIfPresent());
  CHECK(d.beginShapePreview()&&d.updateShapePreview(spec,ink)&&reference.beginShapePreview()&&reference.updateShapePreview(spec,ink));CHECK(*d.gradientPreviewPixels()==*reference.gradientPreviewPixels());spec.bounds.x+=1;spec.end.x-=1;CHECK(d.updateShapePreview(spec,ink)&&reference.updateShapePreview(spec,ink));CHECK(*d.gradientPreviewPixels()==*reference.gradientPreviewPixels());const auto expected=*d.gradientPreviewPixels();
  CHECK(d.commitShapePreview()&&reference.commitShapePreview()&&d.canvasPixels()==expected&&d.historySize()==h+1&&d.timeline().state().cels.size()==count+1);const auto id=d.cel().id;d.undo();CHECK(d.cel().id==id&&d.canvasPixels()==std::vector<Pixel>(400));d.redo();CHECK(d.cel().id==id&&d.canvasPixels()==expected);
 }
 for(bool masked:{false,true}){auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::emptyActiveSlot(d);if(masked)d.previewSelection(SelectionMask{0,0,8,6,std::vector<unsigned char>(48)});d.markSaved();ShapeSpec spec;spec.bounds={1,1,3,3};CHECK(d.beginShapePreview()&&d.updateShapePreview(spec,masked?0xff123456:0));CHECK(!d.commitShapePreview()&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.empty()&&!d.dirty()&&d.historySize()==0);}
}
__declspec(noinline) void verifyAbsentSelectionMove(){
 for(bool masked:{false,true})for(bool copy:{false,true}){
  auto document=std::make_unique<Document>(8,6),oracle=std::make_unique<Document>(8,6);auto& d=*document;auto& reference=*oracle;RasterHistoryFixture::emptyActiveSlot(d);SelectionMask selection{-1,1,4,3,{}};if(masked)selection.mask={1,0,1,0,0,1,0,1,1,1,0,0};d.previewSelection(selection);reference.previewSelection(selection);d.markSaved();const auto h=d.historySize(),content=d.contentRevision();
  CHECK(d.beginSelectionContentMove(copy,false,2,1)&&reference.beginSelectionContentMove(copy,false,2,1));CHECK(selectionEqual(d.selection(),reference.selection())&&d.floating()&&!d.activeSurfaceIfPresent());d.cancelFloatingPaste();reference.cancelFloatingPaste();CHECK(selectionEqual(d.selection(),selection)&&!d.floating()&&d.historySize()==h);
  CHECK(d.beginSelectionContentMove(copy,false,2,1)&&reference.beginSelectionContentMove(copy,false,2,1));CHECK(d.flipContent(true)&&reference.flipContent(true)&&selectionEqual(d.selection(),reference.selection()));auto transform=*d.floatingTransform();transform.angle=90;CHECK(reference.floatingTransform());d.transformFloatingPaste(transform);reference.transformFloatingPaste(transform);CHECK(selectionEqual(d.selection(),reference.selection()));const auto expected=d.selection();CHECK(!d.commitFloatingPaste()&&!reference.commitFloatingPaste());CHECK(selectionEqual(d.selection(),expected)&&d.historySize()==h+1&&!d.dirty()&&d.contentRevision()==content&&d.timeline().state().cels.empty());d.undo();CHECK(selectionEqual(d.selection(),selection)&&!d.activeSurfaceIfPresent());d.redo();CHECK(selectionEqual(d.selection(),expected)&&!d.activeSurfaceIfPresent());
 }
}
__declspec(noinline) void verifyEmptyImmediateTransforms(){
 for(bool absent:{false,true})for(bool edge:{false,true})for(bool horizontal:{false,true})for(bool animation:{false,true}){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;const auto frame=d.frame().id;if(absent)RasterHistoryFixture::emptyActiveSlot(d);if(animation)d.selectFrameHeader(frame);SelectionMask selected{edge?-1:1,1,3,2,{1,0,0,0,1,0}};d.previewSelection(selected);d.markSaved();const auto h=d.historySize(),content=d.contentRevision();auto expected=selected;for(int y=0;y<2;++y)for(int x=0;x<3;++x)expected.mask[y*3+x]=selected.mask[(horizontal?y:1-y)*3+(horizontal?2-x:x)];
  if(absent&&animation)expected=selected;const bool result=d.flipContent(horizontal);CHECK(selectionEqual(d.selection(),expected)&&result==!animation&&d.historySize()==h+(animation?0:1)&&d.contentRevision()==content&&!d.dirty());if(!animation){d.undo();CHECK(selectionEqual(d.selection(),selected));d.redo();CHECK(selectionEqual(d.selection(),expected));}CHECK(d.timeline().state().cels.size()==(absent?0:1));
 }
 for(bool absent:{false,true}){auto document=std::make_unique<Document>(8,6);auto& d=*document;if(absent)RasterHistoryFixture::emptyActiveSlot(d);d.setLayerLocked(true);SelectionMask selected{1,1,3,2,{1,0,0,0,1,0}};d.previewSelection(selected);d.markSaved();const auto h=d.historySize();CHECK(!d.flipContent(true)&&!d.flipContent(false)&&selectionEqual(d.selection(),selected)&&d.historySize()==h&&!d.dirty());}
 for(bool absent:{false,true})for(int angle:{90,-90,180}){auto document=std::make_unique<Document>(8,6);auto& d=*document;if(absent)RasterHistoryFixture::emptyActiveSlot(d);SelectionMask selected{-1,1,3,2,{1,0,0,0,1,0}};d.previewSelection(selected);d.markSaved();const auto h=d.historySize();CHECK(!d.rotateContent(angle)&&selectionEqual(d.selection(),selected)&&d.historySize()==h&&!d.dirty());}
}
__declspec(noinline) void verifyAbsentSelectionBrush(){
 auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::fillBackdrop(d);RasterHistoryFixture::emptyOnlyActiveSlot(d);d.markSaved();const auto h=d.historySize(),rev=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();
 for(bool masked:{false,true}){SelectionMask selection{-1,1,4,3,{}};if(masked)selection.mask={1,0,1,0,0,1,0,1,1,1,0,0};d.previewSelection(selection);CHECK(!createSelectionPatternBrush(d.activeSurfaceIfPresent(),8,6,selection));CHECK(selectionEqual(d.selection(),selection));}
 CHECK(!createSelectionPatternBrush(d.activeSurfaceIfPresent(),8,6,SelectionMask{20,20,1,1,{}}));
 bool rejected=false;try{createSelectionPatternBrush(static_cast<const timeline::Surface*>(nullptr),100,100,SelectionMask{0,0,65,1,{}});}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);
 rejected=false;try{createSelectionPatternBrush(d.activeSurfaceIfPresent(),8,6,SelectionMask{0,0,2,2,{1}});}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);
 CHECK(!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==h&&d.revision()==rev&&d.contentRevision()==content&&!d.dirty());
 timeline::Surface source;source.width=2;source.height=1;source.offsetX=1;source.offsetY=2;source.storageOriginX=71;source.storageOriginY=-37;source.pixels={0x00030201,0x80123456};auto brush=createSelectionPatternBrush(&source,8,6,SelectionMask{1,2,2,1,{}});CHECK(brush&&brush->colors==std::vector<Pixel>({0x00030201,0x80123456})&&brush->coverage==std::vector<unsigned char>({0,128})&&brush->sourceX==1&&brush->sourceY==2);
}
__declspec(noinline) void verifyAbsentHoverComposition(){
 for(bool backdrop:{false,true})for(Pixel ink:{Pixel(0xff123456),Pixel(0x80123456)}){
  auto document=std::make_unique<Document>(8,6),oracle=std::make_unique<Document>(8,6);auto& d=*document;auto& reference=*oracle;if(backdrop){RasterHistoryFixture::fillBackdrop(d);RasterHistoryFixture::fillBackdrop(reference);}RasterHistoryFixture::emptyOnlyActiveSlot(d);d.markSaved();const auto count=d.timeline().state().cels.size(),h=d.historySize(),content=d.contentRevision();
  const auto changes=d.brushPreview({1,2},{4,3},ink,{});CHECK(changes==reference.brushPreview({1,2},{4,3},ink,{}));std::vector<Pixel> preview(48);for(auto [index,value]:changes)preview[index]=value;
  const auto composed=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,6},d.layer().id,&preview,8,0,0);reference.beginStroke({1,2},ink);reference.updateStroke({4,3});CHECK(reference.commitStroke());CHECK(composed==compositeNormalRegion(reference.timeline(),reference.frame().id,{0,0,8,6}));
  CHECK(!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==h&&d.contentRevision()==content&&!d.dirty());
 }
}
__declspec(noinline) void verifyAbsentGradientDense(){
 {Document d(512,512);timeline::Surface s;s.width=2;s.height=1;s.offsetX=s.offsetY=2;s.storageOriginX=7;s.storageOriginY=9;s.pixels={0,0};RasterHistoryFixture::install(d,std::move(s));const auto id=d.cel().id;
  SelectionMask selection{0,0,512,512,std::vector<unsigned char>(512*512)};selection.mask[0]=1;d.previewSelection(selection);GradientSpec spec;spec.end={511,511};spec.first=spec.last=0xff123456;
  CHECK(d.beginGradient({0,0})&&d.updateGradient(spec,{}));CHECK(d.commitGradient()&&RasterHistoryFixture::lastDense(d));const auto expected=d.canvasPixels();CHECK(expected[0]==0xff123456&&std::count(expected.begin(),expected.end(),Pixel(0))==512*512-1);
  CHECK(surface(d).width==512&&surface(d).height==512&&surface(d).offsetX==0&&surface(d).offsetY==0&&surface(d).storageOriginX==5&&surface(d).storageOriginY==7);
  d.undo();CHECK(d.cel().id==id&&d.canvasPixels()==std::vector<Pixel>(512*512));d.redo();CHECK(d.cel().id==id&&d.canvasPixels()==expected&&surface(d).storageOriginX==5&&surface(d).storageOriginY==7);
 }
 for(bool absent:{false,true}){Document d(512,512);if(absent)RasterHistoryFixture::emptyActiveSlot(d);SelectionMask selection{0,0,512,512,std::vector<unsigned char>(512*512)};selection.mask[0]=1;d.previewSelection(selection);GradientSpec spec;spec.end={511,511};spec.first=spec.last=0xff123456;CHECK(d.beginGradient({0,0})&&d.updateGradient(spec,{}));CHECK(d.commitGradient()&&RasterHistoryFixture::lastDense(d));const auto expected=d.canvasPixels();CHECK(expected[0]==0xff123456&&std::count(expected.begin(),expected.end(),Pixel(0))==512*512-1);d.undo();CHECK(d.canvasPixels()==std::vector<Pixel>(512*512));d.redo();CHECK(d.canvasPixels()==expected);}

 for(int size:{511,512}){Document d(size,size);RasterHistoryFixture::emptyActiveSlot(d);GradientSpec g;g.start={0,0};g.end={double(size-1),double(size-1)};g.first=0xff112233;g.last=0xff778899;CHECK(d.beginGradient({0,0})&&d.updateGradient(g,{}));const auto expected=*d.gradientPreviewPixels();CHECK(d.commitGradient()&&d.canvasPixels()==expected);CHECK(RasterHistoryFixture::lastDense(d)==(size==512));if(size==512)CHECK(d.historyBytes()<std::size_t(size)*size*9);const auto id=d.cel().id;d.undo();CHECK(d.cel().id==id&&d.canvasPixels()==std::vector<Pixel>(std::size_t(size)*size));d.redo();CHECK(d.cel().id==id&&d.canvasPixels()==expected);}
}
__declspec(noinline) void verifySparseMigration(){
 {Document d(8,6);RasterHistoryFixture::emptyActiveSlot(d);d.setImportedLayerGeometry({{d.layer().id,{3,2,-7,9}}});const auto h=d.historySize(),rev=d.revision();CHECK(d.copySelectedFrames());CHECK((d.exportFrameClipboard().layerGeometry==std::vector<std::array<int,4>>({{3,2,-7,9}})));CHECK(!d.activeSurfaceIfPresent()&&d.historySize()==h&&d.revision()==rev);bool rejected=false;try{d.setImportedLayerGeometry({{"unknown",{1,1,0,0}}});}catch(const std::invalid_argument&){rejected=true;}CHECK((rejected&&d.copySelectedFrames()&&d.exportFrameClipboard().layerGeometry==std::vector<std::array<int,4>>({{3,2,-7,9}})));}


 for(bool patterned:{false,true}){
  auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::fillStrokeBudget(d);d.markSaved();const auto h=d.historySize(),rev=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();const auto identity=d.timeline().state().cels.front().surface->pixels.identity();bool rejected=false;PatternFillOptions pattern;pattern.texture=FillTexture::Grain;
  try{if(patterned)d.fillPatternPixels({2,3},0xff123456,pattern);else d.fillPixels({2,3},0xff123456);}catch(const std::length_error&){rejected=true;}
  CHECK(rejected&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==h&&d.revision()==rev&&d.contentRevision()==content&&!d.dirty()&&d.timeline().state().cels.front().surface->pixels.identity()==identity);
 }

 {Document d(8,6);RasterHistoryFixture::emptyActiveSlot(d);d.markSaved();const auto revision=d.revision(),content=d.contentRevision(),history=d.historySize();const auto* storage=d.timeline().state().cels.data();CHECK(!d.activeSurfaceIfPresent());CHECK(d.canvasPixels()==std::vector<Pixel>(48));CHECK(!d.selectionContentBounds(SelectionMask{0,0,8,6,{}}));CHECK(!d.selectionContentBounds(SelectionMask{-2,-3,2,2,{}}));CHECK(!d.activeSurfaceIfPresent());CHECK(d.timeline().state().cels.empty()&&d.timeline().state().cels.data()==storage);CHECK(d.revision()==revision&&d.contentRevision()==content&&d.historySize()==history&&!d.dirty());}

 {Document d(8,6);RasterHistoryFixture::sparseSelection(d);const auto first=d.cel().id;d.markSaved();const auto history=d.historySize();d.selectTimelineCel(first);d.selectTimelineCel("sparse-last-cel",2);CHECK(d.timelineSelection().cels==std::vector<std::string>({first,"sparse-last-cel"}));CHECK(d.timeline().state().cels.size()==2&&!d.timeline().findCel(d.layer().id,"sparse-middle"));d.restoreTimelineSelection({},{});d.selectFrame("sparse-middle");d.selectTimelineCel("sparse-last-cel",1);CHECK(d.timelineSelection().cels==std::vector<std::string>({"sparse-last-cel"}));d.restoreTimelineSelection({},{});d.selectFrame("sparse-middle");d.selectTimelineCel(first,2);CHECK(d.timelineSelection().cels==std::vector<std::string>({first}));CHECK(d.timeline().state().cels.size()==2&&d.historySize()==history&&!d.dirty());}
 {Document d(8,6);RasterHistoryFixture::emptyActiveSlot(d);d.markSaved();const auto h=d.historySize();constexpr Pixel ink=0xff123456;
 const auto preview=d.brushPreview({2,3},{3,3},ink,{});CHECK(preview.at(26)==ink&&preview.at(27)==ink&&d.timeline().state().cels.empty()&&!d.activeSurfaceIfPresent());
 d.beginStroke({2,3},ink);CHECK(d.active()&&d.timeline().state().cels.empty());CHECK(d.canvasPixels()[26]==ink&&d.activeSurfaceIfPresent());d.updateStroke({3,3});CHECK(d.canvasPixels()[27]==ink);d.cancelStroke();CHECK(!d.active()&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.empty()&&d.historySize()==h&&!d.dirty());
 d.beginStroke({2,3},0);CHECK(!d.commitStroke()&&d.timeline().state().cels.empty()&&!d.activeSurfaceIfPresent()&&d.historySize()==h&&!d.dirty());
 d.beginStroke({2,3},ink);CHECK(d.commitStroke()&&d.timeline().state().cels.size()==1&&d.historySize()==h+1);const auto id=d.cel().id;CHECK(d.canvasPixels()[26]==ink);d.undo();CHECK(d.timeline().state().cels.size()==1&&d.cel().id==id&&d.canvasPixels()==std::vector<Pixel>(48));d.redo();CHECK(d.cel().id==id&&d.canvasPixels()[26]==ink);
 }
 for(bool patterned:{false,true}){Document d(8,6);RasterHistoryFixture::emptyActiveSlot(d);d.markSaved();const auto h=d.historySize();PatternFillOptions pattern;pattern.texture=FillTexture::Grain;
 auto fill=[&](Point seed,Pixel ink){return patterned?d.fillPatternPixels(seed,ink,pattern):d.fillPixels(seed,ink);};
 CHECK(!fill({-1,0},0xff123456)&&d.timeline().state().cels.empty()&&!d.dirty());CHECK(!fill({0,0},0)&&d.timeline().state().cels.empty()&&d.historySize()==h);CHECK(fill({2,3},0xff123456)&&d.timeline().state().cels.size()==1&&d.historySize()==h+1);const auto id=d.cel().id;const auto after=d.canvasPixels();CHECK(after!=std::vector<Pixel>(48));d.undo();CHECK(d.cel().id==id&&d.timeline().state().cels.size()==1&&d.canvasPixels()==std::vector<Pixel>(48));d.redo();CHECK(d.cel().id==id&&d.canvasPixels()==after);
 }
 for(bool patternFill:{false,true})for(bool visible:{false,true})for(bool contiguous:{false,true})for(bool symmetry:{false,true}){
  Document reference(9,7);RasterHistoryFixture::fillBackdrop(reference);reference.previewSelection(SelectionMask{0,1,9,5,{}});reference.symmetryAxes.vertical=symmetry;auto missing=reference;RasterHistoryFixture::emptyOnlyActiveSlot(missing);WandOptions options;options.visibleLayers=visible;options.contiguous=contiguous;PatternFillOptions pattern;pattern.texture=FillTexture::Grain;
  const auto before=missing.historySize();auto run=[&](Document& d){return patternFill?d.fillPatternPixels({1,2},0x8055aacc,pattern,options):d.fillPixels({1,2},0x8055aacc,options);};CHECK(run(reference)==run(missing));if(missing.canvasPixels()!=reference.canvasPixels())throw std::runtime_error("Absent fill parity pattern="+std::to_string(patternFill)+" visible="+std::to_string(visible)+" contiguous="+std::to_string(contiguous)+" symmetry="+std::to_string(symmetry));CHECK(missing.historySize()==before+1);CHECK(selectionEqual(missing.selection(),reference.selection()));const auto id=missing.cel().id;missing.undo();CHECK(missing.cel().id==id&&missing.canvasPixels()==std::vector<Pixel>(63));missing.redo();CHECK(missing.canvasPixels()==reference.canvasPixels());
 }
 for(bool visible:{false,true})for(bool contiguous:{false,true})for(int tolerance:{0,64}){
  Document d(9,7);RasterHistoryFixture::fillBackdrop(d);RasterHistoryFixture::emptyOnlyActiveSlot(d);d.markSaved();const auto history=d.historySize(),content=d.contentRevision();const auto celCount=d.timeline().state().cels.size();WandOptions options;options.visibleLayers=visible;options.contiguous=contiguous;options.tolerance=tolerance;
  const auto source=visible?compositeNormalRegion(d.timeline(),d.frame().id,{0,0,9,7}):d.canvasPixels();auto selected=magicWandSelection(source,9,7,1,2,options);CHECK(selected);CHECK(!visible?(selected->x==0&&selected->y==0&&selected->width==9&&selected->height==7):(selected->width==(contiguous?4:9)));
  d.commitSelection({},selected);CHECK(selectionEqual(d.selection(),selected)&&d.historySize()==history+1&&!d.dirty()&&d.contentRevision()==content&&d.timeline().state().cels.size()==celCount&&!d.timeline().findCel(d.layer().id,d.frame().id));d.undo();CHECK(!d.selection()&&!d.dirty()&&d.contentRevision()==content&&d.timeline().state().cels.size()==celCount);d.redo();CHECK(selectionEqual(d.selection(),selected)&&!d.dirty()&&d.contentRevision()==content&&!d.timeline().findCel(d.layer().id,d.frame().id));
 }
 for(bool visible:{false,true})for(bool contiguous:{false,true})for(bool preview:{false,true}){
  Document d(9,7);RasterHistoryFixture::fillBackdrop(d);RasterHistoryFixture::emptyOnlyActiveSlot(d);d.previewSelection(SelectionMask{0,1,9,5,{}});d.markSaved();const auto history=d.historySize(),revision=d.revision(),content=d.contentRevision(),count=d.timeline().state().cels.size();const auto before=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,9,7});WandOptions options;options.visibleLayers=visible;options.contiguous=contiguous;CHECK(!d.eraseMatchingColor({1,2},options,preview));CHECK(!d.eraseMatchingColor({-1,2},options,preview));CHECK(!d.active()&&!d.dirty()&&d.historySize()==history&&d.revision()==revision&&d.contentRevision()==content&&d.timeline().state().cels.size()==count&&!d.timeline().findCel(d.layer().id,d.frame().id));CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,9,7})==before);
 }
 for(bool visible:{false,true}){Document reference(9,7);RasterHistoryFixture::fillBackdrop(reference);reference.previewSelection(SelectionMask{0,1,9,5,{}});auto d=reference;RasterHistoryFixture::emptyOnlyActiveSlot(d);d.markSaved();const auto history=d.historySize(),content=d.contentRevision();const auto count=d.timeline().state().cels.size();WandOptions options;options.visibleLayers=visible;GradientSpec spec;spec.start={0,0};spec.end={8,6};spec.first=0xff112233;spec.last=0xff778899;
 CHECK(d.beginGradient({1,2},options)&&d.updateGradient(spec,options));CHECK(d.timeline().state().cels.size()==count&&!d.dirty()&&d.contentRevision()==content);d.cancelGradient();CHECK(!d.active()&&d.historySize()==history&&d.timeline().state().cels.size()==count);CHECK(d.beginGradient({1,2},options)&&d.updateGradient(spec,options));CHECK(reference.beginGradient({1,2},options)&&reference.updateGradient(spec,options));CHECK(*d.gradientPreviewPixels()==*reference.gradientPreviewPixels());const auto expected=*d.gradientPreviewPixels();CHECK(d.commitGradient()&&d.historySize()==history+1&&d.timeline().state().cels.size()==count+1&&d.canvasPixels()==expected);const auto id=d.cel().id;d.undo();CHECK(d.cel().id==id&&d.canvasPixels()==std::vector<Pixel>(63));d.redo();CHECK(d.cel().id==id&&d.canvasPixels()==expected);
 }
 {Document d(4,3);RasterHistoryFixture::emptyActiveSlot(d);d.markSaved();GradientSpec spec;spec.end={3,2};spec.first=spec.last=0;CHECK(d.beginGradient({0,0})&&d.updateGradient(spec,{}));CHECK(!d.commitGradient()&&d.timeline().state().cels.empty()&&!d.dirty()&&d.historySize()==0);}
 verifyEmptyImmediateTransforms();
 verifyAbsentSelectionMove();
 verifyAbsentShape();
 verifyAbsentSelectionFill();
 verifyAbsentSelectionCommands();
 verifyAbsentCopy();
 verifyAbsentGradientDense();
 constexpr Pixel a=0xff112233,b=0xff445566,c=0xff778899;
 auto make=[=](){timeline::Surface s;s.width=3;s.height=2;s.offsetX=-1;s.offsetY=1;s.storageOriginX=-7;s.storageOriginY=9;s.pixels={a,b,c,0x00030201,a,b};return s;};
 auto same=[](const timeline::Surface& x,const timeline::Surface& y){return x.width==y.width&&x.height==y.height&&x.offsetX==y.offsetX&&x.offsetY==y.offsetY&&x.storageOriginX==y.storageOriginX&&x.storageOriginY==y.storageOriginY&&x.pixels==y.pixels;};
 Document d(4,3);RasterHistoryFixture::install(d,make());const auto root=d.cel().id;d.addLinkedFrame(true);const auto alias=d.cel().id;d.addLinkedFrame(true);const auto survivor=d.cel().id;d.selectTimelineCel(root,0);d.selectTimelineCel(alias,1);CHECK(d.copySelectedCels());const auto snapshot=d.exportCelClipboard();CHECK(snapshot.items.size()==2&&same(*snapshot.items[0].cel.surface,make())&&snapshot.items[1].cel.linkedCelId==root);
 d.selectTimelineCel(root,0);const auto h=d.historySize();CHECK(d.pasteCelClipboard(snapshot)&&d.historySize()==h+1);CHECK(d.timeline().resolveSurface(alias).source->id==root&&d.timeline().resolveSurface(survivor).source->id==survivor&&same(*d.timeline().resolveSurface(survivor).surface,make()));d.undo();CHECK(d.timeline().resolveSurface(survivor).source->id==root);d.redo();
 d.selectTimelineCel(root,0);d.selectTimelineCel(alias,1);const auto cutHistory=d.historySize();CHECK(d.cutSelectedCels()&&d.historySize()==cutHistory+1);CHECK(std::all_of(d.timeline().resolveSurface(root).surface->pixels.begin(),d.timeline().resolveSurface(root).surface->pixels.end(),[](Pixel p){return p==0;})&&same(*d.timeline().resolveSurface(survivor).surface,make()));d.undo();CHECK(same(*d.timeline().resolveSurface(root).surface,make()));
 d.selectTimelineCel(root,0);d.selectTimelineCel(alias,1);d.commitSelection({},SelectionMask{0,1,2,1,{1,0}});CHECK(d.copySelectedCels());auto clipped=d.exportCelClipboard();CHECK(clipped.items[0].selectionPixels->pixels==std::vector<Pixel>({b,0})&&clipped.items[0].selectionPixels->mask==std::vector<unsigned char>({1,0}));const auto selectionHistory=d.historySize();CHECK(d.cutSelectedCels()&&d.historySize()==selectionHistory+1&&!d.selection());auto erased=make();erased.pixels[1]=0;CHECK(same(*d.timeline().resolveSurface(root).surface,erased));d.undo();CHECK(d.selection()&&same(*d.timeline().resolveSurface(alias).surface,make()));d.redo();CHECK(!d.selection()&&same(*d.timeline().resolveSurface(root).surface,erased));
 Document cross(4,3);CHECK(cross.pasteCelClipboard(snapshot)&&cross.timeline().state().frames.size()==2&&same(surface(cross),make()));cross.undo();CHECK(cross.timeline().state().frames.size()==1);cross.redo();CHECK(same(surface(cross),make()));cross.clearTimelineSelection();cross.selectTimelineCel(cross.cel().id);cross.markSaved();const auto rev=cross.contentRevision(),badHistory=cross.historySize();auto bad=snapshot;bad.items[1].cel.linkedCelId="outside-clipboard";bool rejected=false;try{cross.pasteCelClipboard(bad);}catch(const std::runtime_error&){rejected=true;}CHECK(rejected&&!cross.dirty()&&cross.contentRevision()==rev&&cross.historySize()==badHistory&&same(surface(cross),make()));
 Document fail(4,3);auto far=make();far.offsetX=-500000000;RasterHistoryFixture::install(fail,far);fail.markSaved();const auto failRev=fail.contentRevision(),failHistory=fail.historySize();Document::CelClipboardItem item;item.cel=fail.cel();item.selectionPixels=SelectionClipboard{1,1,0,0,{a},{1}};rejected=false;try{fail.beginCelSelectionPaste({item});}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!fail.floating()&&!fail.dirty()&&fail.contentRevision()==failRev&&fail.historySize()==failHistory&&same(surface(fail),far));
 {Document flip(3,2);timeline::Surface s;s.width=3;s.height=1;s.offsetX=-1;s.offsetY=1;s.storageOriginX=71;s.storageOriginY=-37;s.pixels={a,0x00030201,b};RasterHistoryFixture::install(flip,s);flip.addLinkedFrame(true);CHECK(flip.flipContent(true));CHECK(surface(flip).pixels==std::vector<Pixel>({b,0x00030201,a})&&surface(flip).offsetX==-1&&surface(flip).height==1&&surface(flip).storageOriginX==71);flip.undo();CHECK(same(surface(flip),s));flip.redo();CHECK(surface(flip).pixels[0]==b);}
 {Document rotate(3,2);timeline::Surface s;s.width=3;s.height=1;s.offsetX=-1;s.pixels={a,0x00030201,b};RasterHistoryFixture::install(rotate,s);rotate.previewSelection(SelectionMask{-1,0,3,1,{}});CHECK(rotate.rotateContent180());CHECK(raster::readWorld(surface(rotate),-1,0)==0&&raster::readWorld(surface(rotate),0,0)==0&&raster::readWorld(surface(rotate),1,0)==a);rotate.undo();CHECK(same(surface(rotate),s));}
 {Document move(3,2);RasterHistoryFixture::install(move,sparse(-500000000));move.previewSelection(SelectionMask{0,0,1,1,{}});move.markSaved();const auto content=move.contentRevision(),history=move.historySize();bool rejected=false;try{move.nudgeSelectionContent(1,0);}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!move.floating()&&!move.dirty()&&move.historySize()==history&&move.contentRevision()==content&&surface(move).offsetX==-500000000);CHECK(!move.nudgeSelectionContent(0,0));}
}
__declspec(noinline) void verifyUnrelatedLinkedLayersAbsentTools(){
 for(int mode=0;mode<7;++mode){
  auto doc=std::make_unique<Document>(8,6);auto& d=*doc;
  const auto first=d.layer().id;d.beginStroke({0,0},0xff556677);CHECK(d.commitStroke());
  const auto peer=d.createLinkedLayer(first);CHECK(!peer.empty());d.addLayer();const auto active=d.layer().id;CHECK(d.layer().linkedContentId.empty()&&d.timeline().hasLinkedLayers());RasterHistoryFixture::emptyOnlyActiveSlot(d);d.markSaved();
  const auto h=d.historySize(),count=d.timeline().state().cels.size();
  auto checkPeers=[&]{const auto* a=d.timeline().findCel(first,d.frame().id);const auto* b=d.timeline().findCel(peer,d.frame().id);CHECK(a&&b);const auto* sa=d.timeline().resolveSurface(a->id).surface;const auto* sb=d.timeline().resolveSurface(b->id).surface;CHECK(sa&&sb&&sa->pixels[0]==0xff556677&&sb->pixels[0]==0xff556677&&sa->pixels.identity()==sb->pixels.identity());};
  checkPeers();
  if(mode==0){d.beginStroke({2,2},0xff123456);d.cancelStroke();CHECK(!d.activeSurfaceIfPresent()&&d.historySize()==h);d.beginStroke({2,2},0xff123456);CHECK(d.commitStroke());}
  if(mode==1)CHECK(d.fillPixels({2,2},0xff123456));
  if(mode==2){PatternFillOptions p;CHECK(d.fillPatternPixels({2,2},0xff123456,p));}
  if(mode==3)CHECK(d.fillSelectionOrCanvas(0xff123456));
  if(mode==4){GradientSpec g;g.end={7,5};g.first=g.last=0xff123456;CHECK(d.beginGradient({2,2})&&d.updateGradient(g,{}));d.cancelGradient();CHECK(!d.activeSurfaceIfPresent()&&d.historySize()==h);CHECK(d.beginGradient({2,2})&&d.updateGradient(g,{})&&d.commitGradient());}
  if(mode==5){ShapeSpec shape;shape.kind=ShapeKind::Rectangle;shape.bounds={1,1,3,3};CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,0xff123456)&&d.commitShapePreview());}
  if(mode==6){SelectionClipboard clip;clip.width=clip.height=1;clip.pixels={0xff123456};CHECK(d.beginFloatingPaste(clip,2,2));d.cancelFloatingPaste();CHECK(!d.activeSurfaceIfPresent()&&d.historySize()==h);CHECK(d.beginFloatingPaste(clip,2,2)&&d.commitFloatingPaste());}
  const auto expected=d.canvasPixels();CHECK(std::any_of(expected.begin(),expected.end(),[](Pixel p){return p!=0;}));CHECK(d.historySize()==h+1&&d.timeline().state().cels.size()==count+1&&d.layer().id==active);checkPeers();d.undo();CHECK(d.canvasPixels()==std::vector<Pixel>(48));checkPeers();d.redo();CHECK(d.canvasPixels()==expected);checkPeers();
 }
}
__declspec(noinline) void verifyLinkedAbsentBrush(){
 for(bool peerPresent:{false,true})for(bool alias:{false,true}){
  auto doc=std::make_unique<Document>(8,6);auto& d=*doc;const auto first=d.layer().id;
  d.beginStroke({0,0},0xff556677);CHECK(d.commitStroke());
  if(alias)d.addLinkedFrame(true);
  const auto peer=d.createLinkedLayer(first);CHECK(!peer.empty());d.selectLayer(first);RasterHistoryFixture::emptyOnlyActiveSlot(d);
  if(!peerPresent){d.selectLayer(peer);RasterHistoryFixture::emptyOnlyActiveSlot(d);d.selectLayer(first);}
  d.markSaved();const auto h=d.historySize(),count=d.timeline().state().cels.size(),revision=d.revision();
  d.beginStroke({2,2},0xff123456);CHECK(d.active()&&!d.timeline().findCel(first,d.frame().id));d.cancelStroke();CHECK(!d.activeSurfaceIfPresent()&&d.historySize()==h&&d.revision()==revision&&!d.dirty());
  d.beginStroke({2,2},0);CHECK(!d.commitStroke()&&d.timeline().state().cels.size()==count&&!d.dirty());
  d.beginStroke({2,2},0xff123456);const auto beforeCommit=d.contentRevision();CHECK(d.commitStroke()&&d.contentRevision()>beforeCommit&&d.historySize()==h+1&&d.timeline().state().cels.size()==count+1);const auto id=d.cel().id;const auto expected=d.canvasPixels();CHECK(expected[18]==0xff123456&&expected[0]==0);
  auto verify=[&](bool painted){const auto* own=d.timeline().resolveSurface(id).surface;CHECK(own);const auto* other=d.timeline().findCel(peer,d.frame().id);CHECK(bool(other)==peerPresent);if(other){const auto* shared=d.timeline().resolveSurface(other->id).surface;CHECK(shared&&shared->pixels.identity()==own->pixels.identity()&&shared->pixels[18]==(painted?0xff123456:0)&&shared->pixels[0]==0);}};
  verify(true);d.undo();CHECK(d.cel().id==id&&d.canvasPixels()==std::vector<Pixel>(48));verify(false);d.redo();CHECK(d.canvasPixels()==expected);verify(true);
 }
}
__declspec(noinline) void verifyLinkedAbsentTools(){
 for(bool peerPresent:{false,true})for(bool alias:{false,true})for(int mode=0;mode<6;++mode){
  auto doc=std::make_unique<Document>(8,6);auto& d=*doc;const auto first=d.layer().id;
  d.beginStroke({0,0},0xff556677);CHECK(d.commitStroke());if(alias)d.addLinkedFrame(true);
  const auto peer=d.createLinkedLayer(first);CHECK(!peer.empty());d.selectLayer(first);RasterHistoryFixture::emptyOnlyActiveSlot(d);
  if(!peerPresent){d.selectLayer(peer);RasterHistoryFixture::emptyOnlyActiveSlot(d);d.selectLayer(first);}
  d.markSaved();const auto h=d.historySize(),count=d.timeline().state().cels.size();
  if(mode==0)CHECK(d.fillPixels({2,2},0xff123456));
  if(mode==1){PatternFillOptions p;CHECK(d.fillPatternPixels({2,2},0xff123456,p));}
  if(mode==2)CHECK(d.fillSelectionOrCanvas(0xff123456));
  if(mode==3){GradientSpec g;g.end={7,5};g.first=g.last=0xff123456;CHECK(d.beginGradient({2,2})&&d.updateGradient(g,{}));d.cancelGradient();CHECK(!d.activeSurfaceIfPresent()&&d.historySize()==h&&!d.dirty());CHECK(d.beginGradient({2,2})&&d.updateGradient(g,{})&&d.commitGradient());}
  if(mode==4){ShapeSpec shape;shape.kind=ShapeKind::Rectangle;shape.bounds={1,1,3,3};CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,0xff123456));d.cancelShapePreview();CHECK(!d.activeSurfaceIfPresent()&&d.historySize()==h&&!d.dirty());CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,0xff123456)&&d.commitShapePreview());}
  if(mode==5){SelectionClipboard clip;clip.width=clip.height=1;clip.pixels={0xff123456};CHECK(d.beginFloatingPaste(clip,2,2));d.cancelFloatingPaste();CHECK(!d.activeSurfaceIfPresent()&&d.historySize()==h&&!d.dirty());CHECK(d.beginFloatingPaste(clip,2,2)&&d.commitFloatingPaste());}
  const auto id=d.cel().id;const auto expected=d.canvasPixels();CHECK(std::any_of(expected.begin(),expected.end(),[](Pixel p){return p==0xff123456;}));CHECK(d.historySize()==h+1&&d.timeline().state().cels.size()==count+1);
  auto verify=[&]{const auto* own=d.timeline().resolveSurface(id).surface;const auto* other=d.timeline().findCel(peer,d.frame().id);CHECK(bool(other)==peerPresent);if(other){const auto* shared=d.timeline().resolveSurface(other->id).surface;CHECK(shared&&shared->pixels.identity()==own->pixels.identity()&&shared->pixels==own->pixels);}};
  verify();d.undo();CHECK(d.cel().id==id&&d.canvasPixels()==std::vector<Pixel>(48));verify();d.redo();CHECK(d.canvasPixels()==expected);verify();
 }
}
__declspec(noinline) void verifyAbsentGradientBudget(){
 auto document=std::make_unique<Document>(8,6);auto& d=*document;RasterHistoryFixture::fillStrokeBudget(d);d.markSaved();
 const auto h=d.historySize(),revision=d.revision(),content=d.contentRevision(),preview=d.gradientRevision(),count=d.timeline().state().cels.size();
 const auto& pixels=d.timeline().state().cels.front().surface->pixels;const auto identity=pixels.identity(),data=static_cast<const void*>(pixels.data());const auto storageRevision=pixels.revision();
 for(bool visible:{false,true}){WandOptions options;options.visibleLayers=visible;bool rejected=false;try{d.beginGradient({2,3},options);}catch(const std::length_error&){rejected=true;}
  CHECK(rejected&&!d.gradientActive()&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count&&d.historySize()==h&&d.revision()==revision&&d.contentRevision()==content&&d.gradientRevision()==preview&&!d.dirty());CHECK(pixels.identity()==identity&&pixels.data()==data&&pixels.revision()==storageRevision);
 }
 RasterHistoryFixture::releaseStrokeBudgetRow(d);
 for(bool visible:{false,true}){WandOptions options;options.visibleLayers=visible;GradientSpec spec;spec.end={7,5};spec.first=spec.last=0xff123456;CHECK(d.beginGradient({2,3},options)&&d.updateGradient(spec,options));CHECK((*d.gradientPreviewPixels())[26]==0xff123456&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count);d.cancelGradient();CHECK(!d.gradientActive()&&d.historySize()==h&&d.revision()==revision&&d.contentRevision()==content&&!d.dirty());}
}
__declspec(noinline) void verifyFreeTileBlankFrameFromAbsent(){
 for(bool sources:{false,true}){
  auto doc=std::make_unique<Document>(8,6);auto& d=*doc;CHECK(d.createFreeTileLayer(U"Sparse free"));
  if(!sources)RasterHistoryFixture::removeFreeSources(d);
  if(sources){SelectionClipboard clip;clip.width=clip.height=1;clip.pixels={0xff123456};CHECK(d.pasteFreeTilePixels(clip,{2,2}));}
  const auto layer=d.layer().id,original=d.frame().id;const auto sets=d.timeline().state().tilesets;const auto refs=d.layer().freeTiles;
  CHECK(d.layer().freeTiles&&d.layer().freeTiles->sources.empty()!=sources);
  RasterHistoryFixture::emptyOnlyActiveSlot(d);d.markSaved();const auto h=d.historySize(),count=d.timeline().state().cels.size();d.addFrame();const auto made=d.frame().id,id=d.cel().id;
  auto verify=[&]{CHECK(d.layer().id==layer&&d.cel().id==id&&d.cel().freeTiles&&d.cel().freeTiles->instances.empty()&&!d.cel().linkedCelId);const auto& s=d.activeSurface();CHECK(s.width==(sources?8:1)&&s.height==(sources?6:1)&&s.offsetX==0&&s.offsetY==0&&std::all_of(s.pixels.begin(),s.pixels.end(),[](Pixel p){return p==0;}));CHECK(d.layer().freeTiles==refs);const auto& current=d.timeline().state().tilesets;CHECK(current.size()==sets.size());for(std::size_t i=0;i<sets.size();++i){const auto& a=current[i];const auto& b=sets[i];CHECK(a.id==b.id&&a.name==b.name&&a.tileWidth==b.tileWidth&&a.tileHeight==b.tileHeight&&a.columns==b.columns&&a.rows==b.rows&&a.tileIds==b.tileIds&&a.tileSlots==b.tileSlots&&a.pixels==b.pixels);}};
  CHECK(d.historySize()==h+1&&d.timeline().state().cels.size()==count+2&&!d.timeline().findCel(layer,original));verify();d.undo();CHECK(d.frame().id==original&&!d.activeSurfaceIfPresent()&&d.timeline().state().cels.size()==count);d.redo();CHECK(d.frame().id==made);verify();
 }
}
// Legacy repeated clipboard translation: source order, immutable destination baseline.
__declspec(noinline) void verifyRepeatedClipboardRegions(){
 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(Point size:std::vector<Point>{{260,260},{261,260},{260,261},{261,261},{523,522}})for(Point at:std::vector<Point>{{259,259},{-1,-2},{-261,-262}}){
  auto owned=std::make_unique<Document>(Document::fromImage(260,260,std::vector<Pixel>(260*260,0xff304050),U"Repeated clipboard"));auto& d=*owned;auto oracle=std::make_unique<Document>(d);oracle->setDeferredFloatingDisplaySupported(false);d.setFloatingRepeat(mode);oracle->setFloatingRepeat(mode);d.previewSelection(SelectionMask{2,3,1,1,{}});oracle->previewSelection(d.selection());d.markSaved();oracle->markSaved();const auto before=d.canvasPixels();const auto history=d.historyPosition();
  SelectionClipboard clip;clip.width=size.x;clip.height=size.y;clip.mask.assign(std::size_t(size.x)*size.y,1);clip.pixels.resize(clip.mask.size());for(int y=0;y<size.y;++y)for(int x=0;x<size.x;++x){const auto i=std::size_t(y)*size.x+x;clip.pixels[i]=(x%3==0?0x80000000u:0xff000000u)|Pixel((x*7057+y*1103)&0xffffff);if((x+y)%11==0)clip.mask[i]=0;if((x+y)%17==0)clip.pixels[i]&=0x00ffffff;if((x+y)%19==0)clip.mask[i]=2;}
  auto begin=[&]{CHECK(d.beginFloatingPaste(clip,at.x,at.y)&&d.floatingDeferred());CHECK(oracle->beginFloatingPaste(clip,at.x,at.y)&&!oracle->floatingDeferred());};begin();const auto preview=d.floatingOverlayRegion({0,0,260,260});CHECK(preview==oracle->canvasPixels()&&d.canvasPixels()==before&&d.historyPosition()==history&&!d.dirty());
  for(PixelRegion region:std::vector<PixelRegion>{{-2,-3,9,8},{256,257,8,7},{127,129,7,5}}){const auto piece=d.floatingOverlayRegion(region);for(int y=0;y<region.h;++y)for(int x=0;x<region.w;++x){const int wx=region.x+x,wy=region.y+y;CHECK(piece[std::size_t(y)*region.w+x]==(wx>=0&&wy>=0&&wx<260&&wy<260?preview[std::size_t(wy)*260+wx]:Pixel{}));}}
  d.cancelFloatingPaste();oracle->cancelFloatingPaste();CHECK(d.canvasPixels()==before&&d.historyPosition()==history&&!d.dirty()&&selectionEqual(d.selection(),SelectionMask{2,3,1,1,{}}));begin();CHECK(d.floatingOverlayRegion({0,0,260,260})==preview);const bool changed=d.commitFloatingPaste(),oracleChanged=oracle->commitFloatingPaste();if(changed!=(preview!=before)||oracleChanged!=changed||d.canvasPixels()!=preview||d.canvasPixels()!=oracle->canvasPixels())throw std::runtime_error("Repeated clipboard commit mode="+std::to_string(int(mode))+" size="+std::to_string(size.x)+","+std::to_string(size.y)+" at="+std::to_string(at.x)+","+std::to_string(at.y)+" changed="+std::to_string(changed)+","+std::to_string(oracleChanged)+" preview="+std::to_string(d.canvasPixels()==preview)+" oracle="+std::to_string(d.canvasPixels()==oracle->canvasPixels()));d.undo();CHECK(d.canvasPixels()==before&&selectionEqual(d.selection(),SelectionMask{2,3,1,1,{}}));d.redo();CHECK(d.canvasPixels()==preview);
 }
}
__declspec(noinline) void verifyAbsentBrushBindings(){
 for(bool linked:{false,true})for(bool failObserver:{false,true}){
  auto doc=std::make_unique<Document>(8,6);auto& d=*doc;const auto first=d.layer().id;
  d.beginStroke({0,0},0xff556677);CHECK(d.commitStroke());RasterHistoryFixture::fillBackdrop(d);
  if(linked){const auto peer=d.createLinkedLayer(first);CHECK(!peer.empty());d.selectLayer(first);}
  RasterHistoryFixture::emptyOnlyActiveSlot(d);d.clearHistory();
  const auto backdrop=d.timeline().state().cels.front().id;
  // Only the linked component may replace a binding. The independent backdrop
  // keeps its payload identity through materialization and history navigation.
  const timeline::Surface* independent=nullptr;std::string independentId;
  for(const auto& c:d.timeline().state().cels)if(c.layerId.find("backdrop")!=std::string::npos){independent=&*c.surface;independentId=c.id;break;}
  CHECK(independent);const auto identity=independent->pixels.identity();
  if(failObserver)d.setHistoryChangeListener([](const Document&,const HistoryStackChange&){throw std::runtime_error("observer failure");});
  d.beginStroke({2,2},0xff123456);bool failed=false;try{CHECK(d.commitStroke());}catch(const std::runtime_error&){if(!failObserver)throw;failed=true;}
  CHECK(failed==failObserver&&!d.active()&&d.historySize()==1);d.setHistoryChangeListener({});
  auto unchanged=[&]{CHECK(d.timeline().resolveSurface(independentId).surface->pixels.identity()==identity);};
  unchanged();CHECK(d.canvasPixels()[18]==0xff123456);d.undo();unchanged();CHECK(d.canvasPixels()[18]==0);d.redo();unchanged();CHECK(d.canvasPixels()[18]==0xff123456);
 }
}
int main(){try{RasterHistoryFixture::groupPreparationAtomicity();RasterHistoryFixture::localTerminalPreparation();RasterHistoryFixture::leafRetainedCompensation();RasterHistoryFixture::leafRetainedReapply();RasterHistoryFixture::leafLinkedWriteOrdering();RasterHistoryFixture::palettePreparedOwnership();RasterHistoryFixture::rollbackLateFailure();RasterHistoryFixture::structuralSiblingFailure();RasterHistoryFixture::replayFailureFocus();RasterHistoryFixture::structuralLateFailure();RasterHistoryFixture::scalarLateFailure();RasterHistoryFixture::snapshotLateFailure();RasterHistoryFixture::structuralSurfaceTransferFailure();RasterHistoryFixture::animationSelectionSnapshot();RasterHistoryFixture::snapshotPreflightFailure();RasterHistoryFixture::celMetadataFailure();RasterHistoryFixture::indexPreparationFailure();RasterHistoryFixture::celMetadataSuccess();RasterHistoryFixture::contentTargetFailure();RasterHistoryFixture::contentTargetSuccess();RasterHistoryFixture::frameReplayFailure();RasterHistoryFixture::frameReplaySuccess();RasterHistoryFixture::historyShapeFailure();RasterHistoryFixture::compoundReplayCompensation();RasterHistoryFixture::resourceReplayPreparation();RasterHistoryFixture::pixelReplayFailure();RasterHistoryFixture::terminalHistoryContract();RasterHistoryFixture::historyDamageBoundary();RasterHistoryFixture::surfaceReplayFailure();RasterHistoryFixture::surfaceReplaySuccess();verifyAbsentBrushBindings();verifyRepeatedClipboardRegions();verifyFreeTileBlankFrameFromAbsent();verifyAbsentGradientBudget();verifyLinkedAbsentTools();verifyLinkedAbsentBrush();verifyUnrelatedLinkedLayersAbsentTools();verifyPasteMissingAnchorDirect();verifySelectionPasteInactiveMissing();verifyCelPasteMissingDestination();verifyCompactFrameBudget();verifyLinkedFrameAbsentTarget();verifyBlankFrameGeometry();verifyFrameFromAbsentSlot();verifyConnectAcrossAbsentSlot();verifyAbsentGeometryRollback();verifyAbsentFrameGeometry();verifyAbsentDisconnect();verifyAbsentStrokeBudget();verifyAbsentSmooth();verifyAbsentFloatingCenter();verifyAbsentPaste();verifyAbsentHoverComposition();verifyAbsentSelectionBrush();verifySparseMigration();constexpr Pixel ink=0xfff07929;
 // Original legacy history.test.ts dense RGBA expansion input and expected pixels.
 {Document d(64,64);RasterHistoryFixture::dense(d,ink);RasterHistoryFixture::expand(d,{-8,-6,64,64});d.undo();CHECK(raster::readWorld(surface(d),10,12)==0&&raster::readWorld(surface(d),41,35)==0);d.redo();CHECK(raster::readWorld(surface(d),10,12)==ink&&raster::readWorld(surface(d),41,35)==ink);CHECK(surface(d).width==72&&surface(d).offsetX==-8);}
 // Native runs can cross captured rows; splitting preserves both rows after a stride change.
 {Document d(64,64);RasterHistoryFixture::run(d,ink);RasterHistoryFixture::expand(d,{-8,-6,64,64});d.undo();CHECK(raster::readWorld(surface(d),60,0)==0&&raster::readWorld(surface(d),1,2)==0);d.redo();CHECK(raster::readWorld(surface(d),60,0)==ink&&raster::readWorld(surface(d),63,1)==ink&&raster::readWorld(surface(d),1,2)==ink&&raster::readWorld(surface(d),2,2)==0);}
 for(bool image:{false,true})for(bool erase:{false,true}){
  Document d(8,8);RasterHistoryFixture::install(d,sparse());if(erase){auto s=surface(d);s.width=4;s.pixels={0xff0000ff,0x00030201,ink,ink};RasterHistoryFixture::install(d,std::move(s));}
  const auto oldOutside=raster::readWorld(surface(d),-2,1),oldHidden=raster::readWorld(surface(d),-1,1);const auto before=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8});const auto h=d.historySize();
  PatternBrush b;b.width=2;b.height=1;b.coverage={255,255};b.colors={0x800000ff,0xff00ff00};const PatternBrush* brush=image?&b:nullptr;const BrushOptions options{1,47};const auto preview=d.brushPreview({1,1},{6,4},erase?0:ink,options,brush,90);
  d.beginStroke({1,1},erase?0:ink,options,brush,90);CHECK(surface(d).offsetX==-2&&surface(d).width==10&&surface(d).height==8);d.updateStroke({6,4});const bool changed=d.commitStroke();auto expected=before;for(const auto& [i,p]:preview)expected[i]=p;CHECK(changed);CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8})==expected);CHECK(raster::readWorld(surface(d),-2,1)==oldOutside&&raster::readWorld(surface(d),-1,1)==oldHidden);
  CHECK(d.historySize()==h+1);d.undo();CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8})==before);d.redo();CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8})==expected);
 }
 {Document d(8,8);RasterHistoryFixture::install(d,sparse());d.markSaved();const auto h=d.historySize();d.beginStroke({2,3},ink);d.updateStroke({6,5});d.cancelStroke();CHECK(!d.dirty()&&d.historySize()==h&&surface(d).offsetX==-2&&surface(d).width==10);CHECK(raster::readWorld(surface(d),2,3)==0&&raster::readWorld(surface(d),-2,1)==0xff0000ff);}
 // Linked destination paints the same owner, and undo restores owner pixels through the link.
 {Document d(8,8);d.beginStroke({0,0},ink);d.commitStroke();d.addLinkedFrame(true);CHECK(d.cel().linkedCelId);const auto link=d.cel().linkedCelId;RasterHistoryFixture::install(d,sparse());const auto owner=d.timeline().resolveSurface(d.cel().id).source->id;d.beginStroke({3,2},ink);d.commitStroke();CHECK(d.cel().linkedCelId==link&&d.timeline().resolveSurface(d.cel().id).source->id==owner&&raster::readWorld(surface(d),3,2)==ink);d.undo();CHECK(d.cel().linkedCelId==link&&raster::readWorld(surface(d),3,2)==0&&raster::readWorld(surface(d),-2,1)==0xff0000ff);d.redo();CHECK(raster::readWorld(surface(d),3,2)==ink);}
 // Deterministic expansion-budget failure occurs before geometry/history/dirty mutation.
 {Document d(8,8);RasterHistoryFixture::install(d,sparse(-500000000));d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();bool rejected=false;try{d.beginStroke({1,1},ink);}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!d.active()&&!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev&&surface(d).width==2&&surface(d).offsetX==-500000000);}
 // Palette synchronization already visits stored owner pixels, including outside the canvas.
 {Document d(8,8);const int id=d.palette().entries.front().id;const Pixel old=d.palette().entries.front().color,next=old^Pixel(1);auto s=sparse();s.pixels[0]=old;RasterHistoryFixture::install(d,std::move(s));d.setPaletteColorSynchronization(true);const auto h=d.historySize();d.updatePaletteColor(id,next);CHECK(d.historySize()==h+1&&raster::readWorld(surface(d),-2,1)==next);RasterHistoryFixture::expand(d,{-4,-3,8,8});d.undo();CHECK(raster::readWorld(surface(d),-2,1)==old&&d.palette().entries.front().color==old);d.redo();CHECK(raster::readWorld(surface(d),-2,1)==next&&d.palette().entries.front().color==next);}
 { // Legacy cropped smart-fill history fixture, unchanged owner dimensions.
  Document d(500,767);timeline::Surface s;s.width=297;s.height=241;s.offsetX=20;s.offsetY=30;s.pixels.resize(297*241);for(int y=40;y<100;++y)for(int x=40;x<110;++x)s.pixels[y*297+x]=0xff3131ac;RasterHistoryFixture::install(d,std::move(s));auto before=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,500,767});WandOptions o;o.gapClosing=true;o.gapThreshold=2;CHECK(d.fillPixels({80,90},0xffd2d2f0,o));CHECK(surface(d).width==297&&surface(d).height==241&&surface(d).offsetX==20&&raster::readWorld(surface(d),80,90)==0xffd2d2f0);auto after=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,500,767});for(int cycle=0;cycle<3;++cycle){d.undo();CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,500,767})==before);d.redo();CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,500,767})==after);}
 }
 {Document d(8,8);timeline::Surface s;s.width=2;s.height=1;s.offsetX=2;s.offsetY=2;s.pixels={0,0};RasterHistoryFixture::install(d,std::move(s));WandOptions o;o.visibleLayers=true;CHECK(d.fillPixels({2,2},ink,o));CHECK(surface(d).width==2&&surface(d).height==1&&surface(d).offsetX==2&&raster::readWorld(surface(d),2,2)==ink&&raster::readWorld(surface(d),3,2)==ink);d.undo();CHECK(surface(d).pixels==std::vector<Pixel>(2));d.redo();CHECK(surface(d).pixels==std::vector<Pixel>(2,ink));}
 for(bool placeholder:{false,true}){Document d(8,8);timeline::Surface s;s.width=placeholder?1:2;s.height=1;s.offsetX=2;s.offsetY=2;s.pixels.assign(s.width,0);s.pixels[0]=0x00030201;RasterHistoryFixture::install(d,std::move(s));d.markSaved();CHECK(!d.fillPixels({0,0},0));CHECK(!d.dirty()&&d.historySize()==0&&surface(d).width==8&&surface(d).height==8&&surface(d).offsetX==0);CHECK(raster::readWorld(surface(d),2,2)==(placeholder?0:0x00030201));}
 {Document d(8,8);RasterHistoryFixture::install(d,sparse(-500000000));d.markSaved();auto before=surface(d);const auto h=d.historySize(),rev=d.contentRevision();bool rejected=false;try{d.fillPixels({1,1},ink);}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev&&surface(d).offsetX==before.offsetX&&surface(d).pixels==before.pixels);}
 {Document d(8,8);RasterHistoryFixture::install(d,sparse());d.symmetryAxes.vertical=true;PatternFillOptions p;p.texture=FillTexture::Wood;const auto before=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8});const auto h=d.historySize();CHECK(d.fillPatternPixels({1,1},ink,p));CHECK(d.historySize()==h+1&&raster::readWorld(surface(d),-2,1)==0xff0000ff&&raster::readWorld(surface(d),-1,1)==0x00030201);const auto after=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8});d.undo();CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8})==before);d.redo();CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8})==after);}
 {Document d(8,8);RasterHistoryFixture::install(d,sparse());d.markSaved();const auto before=surface(d);PatternFillOptions p;p.brushes.push_back(PatternBrush{});bool rejected=false;try{d.fillPatternPixels({0,0},ink,p);}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected&&!d.dirty()&&d.historySize()==0&&surface(d).pixels==before.pixels&&surface(d).width==before.width&&surface(d).offsetX==before.offsetX);}

 // Gradient uses the unchanged dense sampler as an oracle across sparse owner geometry.
 for(int mode=0;mode<3;++mode){
  Document d(6,4),dense(6,4);timeline::Surface src;src.width=10;src.height=6;src.offsetX=-2;src.offsetY=-1;src.pixels.resize(60);src.pixels[0]=0xff0000ff;src.pixels[11]=0x00030201;src.pixels[23]=0x00112233;src.pixels[35]=0xff22cc44;
  timeline::Surface ds;ds.width=6;ds.height=4;ds.pixels.resize(24);for(int y=0;y<4;++y)for(int x=0;x<6;++x)ds.pixels[y*6+x]=raster::readWorld(src,x,y);
  RasterHistoryFixture::install(d,src);RasterHistoryFixture::install(dense,std::move(ds));SelectionMask mask{0,0,6,4,std::vector<unsigned char>(24,1)};mask.mask[7]=0;d.commitSelection({},mask);dense.commitSelection({},mask);d.markSaved();dense.markSaved();
  const auto old=surface(d);const auto before=dense.pixels();const auto h=d.historySize(),rev=d.contentRevision();GradientSpec g;g.start={0,0};g.end={5,3};g.first=0xff0000ff;g.last=0xffff0000;WandOptions o;
  if(mode==1){g.radial=true;g.angle=23;g.first=0x400000ff;g.last=0xc0ff0000;o.visibleLayers=true;}if(mode==2){g.dither=3;g.stops={{0,0xff0000ff},{.4,0xff00ff00},{1,0xffff0000}};o.contiguous=false;o.connectivity=8;o.tolerance=8;}
  CHECK(d.beginGradient({0,0},o)&&d.updateGradient(g,o));CHECK(surface(d).pixels==old.pixels&&surface(d).offsetX==old.offsetX&&surface(d).width==old.width&&!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev);
  d.cancelGradient();CHECK(!d.gradientPreviewPixels()&&surface(d).pixels==old.pixels&&d.contentRevision()==rev);
  CHECK(d.beginGradient({0,0},o)&&d.updateGradient(g,o));CHECK(dense.beginGradient({0,0},o)&&dense.updateGradient(g,o));CHECK(*d.gradientPreviewPixels()==*dense.gradientPreviewPixels());const auto expected=*dense.gradientPreviewPixels();
  CHECK(d.commitGradient()&&dense.commitGradient());CHECK(d.historySize()==h+1&&surface(d).width==10&&surface(d).offsetX==-2);for(int y=0;y<4;++y)for(int x=0;x<6;++x)CHECK(raster::readWorld(surface(d),x,y)==expected[y*6+x]);CHECK(raster::readWorld(surface(d),-2,-1)==0xff0000ff&&raster::readWorld(surface(d),-1,0)==0x00030201&&raster::readWorld(surface(d),1,1)==0x00112233);
  d.undo();for(int y=0;y<4;++y)for(int x=0;x<6;++x)CHECK(raster::readWorld(surface(d),x,y)==before[y*6+x]);d.redo();for(int y=0;y<4;++y)for(int x=0;x<6;++x)CHECK(raster::readWorld(surface(d),x,y)==expected[y*6+x]);
 }
 {Document d(8,8);timeline::Surface src;src.width=2;src.height=1;src.offsetX=2;src.offsetY=2;src.pixels={0x00030201,0};RasterHistoryFixture::install(d,src);d.commitSelection({},SelectionMask{1,1,4,3,{}});d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();GradientSpec g;g.end={7,7};g.first=g.last=0;
  CHECK(d.beginGradient({1,1})&&d.updateGradient(g,{}));CHECK(surface(d).width==2&&surface(d).offsetX==2&&surface(d).pixels==src.pixels);CHECK(!d.commitGradient());CHECK(!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev&&!d.gradientPreviewPixels());CHECK(surface(d).width==4&&surface(d).height==3&&surface(d).offsetX==1&&surface(d).offsetY==1&&raster::readWorld(surface(d),2,2)==0x00030201);
 }
 {Document d(8,8);timeline::Surface src;src.width=src.height=1;src.offsetX=src.offsetY=2;src.storageOriginX=7;src.storageOriginY=9;src.pixels={0x00030201};RasterHistoryFixture::install(d,src);d.markSaved();const auto rev=d.contentRevision();GradientSpec g;g.end={7,7};g.first=g.last=0;
  CHECK(d.beginGradient({0,0})&&d.updateGradient(g,{}));d.cancelGradient();CHECK(surface(d).pixels==src.pixels&&surface(d).storageOriginX==7&&!d.dirty());
  CHECK(d.beginGradient({0,0})&&d.updateGradient(g,{}));CHECK(!d.commitGradient());CHECK(!d.dirty()&&d.historySize()==0&&d.contentRevision()==rev);CHECK(surface(d).width==1&&surface(d).height==1&&surface(d).offsetX==2&&surface(d).offsetY==2&&surface(d).pixels==std::vector<Pixel>{0}&&surface(d).storageOriginX==0&&surface(d).storageOriginY==0);
 }
 {Document d(8,8);d.beginStroke({0,0},ink);d.commitStroke();d.addLinkedFrame(true);CHECK(d.cel().linkedCelId);RasterHistoryFixture::install(d,sparse());const auto link=d.cel().linkedCelId;const auto owner=d.timeline().resolveSurface(d.cel().id).source->id;const auto before=compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8});const auto h=d.historySize();GradientSpec g;g.end={7,0};g.first=0xff0000ff;g.last=0xffff0000;
  CHECK(d.beginGradient({0,0})&&d.updateGradient(g,{}));const auto expected=*d.gradientPreviewPixels();CHECK(d.commitGradient()&&d.historySize()==h+1&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(d.cel().id).source->id==owner);CHECK(raster::readWorld(surface(d),-2,1)==0xff0000ff&&raster::readWorld(surface(d),-1,1)==0x00030201);for(int y=0;y<8;++y)for(int x=0;x<8;++x)CHECK(raster::readWorld(surface(d),x,y)==expected[y*8+x]);d.undo();CHECK(compositeNormalRegion(d.timeline(),d.frame().id,{0,0,8,8})==before&&d.cel().linkedCelId==link);d.redo();for(int y=0;y<8;++y)for(int x=0;x<8;++x)CHECK(raster::readWorld(surface(d),x,y)==expected[y*8+x]);
 }
 {Document d(8,8);RasterHistoryFixture::install(d,sparse(-500000000));d.markSaved();const auto before=surface(d);const auto h=d.historySize(),rev=d.contentRevision();GradientSpec g;g.end={7,7};g.first=0xff0000ff;g.last=0xffff0000;CHECK(d.beginGradient({0,0})&&d.updateGradient(g,{}));const auto preview=*d.gradientPreviewPixels();bool rejected=false;try{d.commitGradient();}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev&&surface(d).width==before.width&&surface(d).offsetX==before.offsetX&&surface(d).pixels==before.pixels&&d.gradientPreviewPixels()&&*d.gradientPreviewPixels()==preview);d.cancelGradient();CHECK(!d.gradientPreviewPixels());
 }
 // Literal packed hidden RGB is a four-connected traversal barrier in legacy gradientRegionSelection.
 {Document d(4,1);timeline::Surface src;src.width=2;src.height=1;src.offsetX=1;src.pixels={0x00112233,0};RasterHistoryFixture::install(d,src);GradientSpec g;g.end={3,0};g.first=g.last=0xff0000ff;CHECK(d.beginGradient({0,0})&&d.updateGradient(g,{}));CHECK((*d.gradientPreviewPixels())[1]==0x00112233&&(*d.gradientPreviewPixels())[0]==0xff0000ff&&(*d.gradientPreviewPixels())[2]==0);CHECK(d.commitGradient());CHECK(raster::readWorld(surface(d),1,0)==0x00112233&&raster::readWorld(surface(d),0,0)==0xff0000ff&&raster::readWorld(surface(d),2,0)==0);d.undo();CHECK(raster::readWorld(surface(d),1,0)==0x00112233&&raster::readWorld(surface(d),0,0)==0);d.redo();CHECK(raster::readWorld(surface(d),1,0)==0x00112233);}

 // Sparse shapes reuse the dense rasterizer and preserve the owner/history boundary.
 for(int mode=0;mode<7;++mode){
  Document d(20,20),dense(20,20);timeline::Surface s;s.width=8;s.height=6;s.offsetX=-2;s.offsetY=-1;s.pixels.resize(48);s.pixels[0]=0xff0000ff;s.pixels[9]=0x00030201;s.pixels[46]=0x00112233;RasterHistoryFixture::install(d,s);
  timeline::Surface ds;ds.width=ds.height=20;ds.pixels.resize(400);for(int y=0;y<20;++y)for(int x=0;x<20;++x)ds.pixels[y*20+x]=raster::readWorld(s,x,y);RasterHistoryFixture::install(dense,std::move(ds));
  if(mode==0)d.addLinkedFrame(true);const auto owner=d.timeline().resolveSurface(d.cel().id).source->id;const auto link=d.cel().linkedCelId;
  SelectionMask selection{0,0,20,20,std::vector<unsigned char>(400,1)};selection.mask[4*20+4]=0;d.commitSelection({},selection);dense.commitSelection({},selection);d.symmetryAxes.vertical=dense.symmetryAxes.vertical=true;d.markSaved();dense.markSaved();const auto h=d.historySize(),rev=d.contentRevision();const auto original=surface(d);const auto before=dense.pixels();
  ShapeSpec spec;spec.kind=mode==0?ShapeKind::Line:mode==1?ShapeKind::Rectangle:mode==2?ShapeKind::RectangleOutline:mode==3?ShapeKind::Ellipse:ShapeKind::EllipseOutline;spec.bounds={3,4,10,10};spec.strokeWidth=3;spec.start={3,4};spec.end={13,12};spec.brush={3,100,BrushShape::Square};if(mode==4)spec.bounds.angle=25;if(mode>=5){spec.kind=mode==5?ShapeKind::Polygon:ShapeKind::Freeform;spec.polygonPath={{3,4},{12,4},{12,13},{3,13}};spec.brush.ink=InkMode::LockAlpha;}
  CHECK(d.beginShapePreview()&&d.updateShapePreview(spec,0x800000ff));CHECK(surface(d).pixels==original.pixels&&surface(d).width==original.width&&surface(d).offsetX==original.offsetX&&!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev);d.cancelShapePreview();CHECK(!d.shapeActive()&&surface(d).pixels==original.pixels);
  CHECK(d.beginShapePreview()&&d.updateShapePreview(spec,0x800000ff));auto moved=spec;moved.bounds.x+=1;moved.start.x+=1;moved.end.x+=1;CHECK(d.updateShapePreview(moved,0x800000ff)&&d.updateShapePreview(spec,0x800000ff));CHECK(dense.beginShapePreview()&&dense.updateShapePreview(spec,0x800000ff));const auto expected=*dense.gradientPreviewPixels();CHECK(*d.gradientPreviewPixels()==expected);CHECK(d.commitShapePreview()&&d.historySize()==h+1);CHECK(d.cel().linkedCelId==link&&d.timeline().resolveSurface(d.cel().id).source->id==owner);CHECK(raster::readWorld(surface(d),-2,-1)==0xff0000ff&&raster::readWorld(surface(d),-1,0)==0x00030201&&raster::readWorld(surface(d),4,4)==0x00112233);
  for(int y=0;y<20;++y)for(int x=0;x<20;++x)CHECK(raster::readWorld(surface(d),x,y)==expected[y*20+x]);d.undo();for(int y=0;y<20;++y)for(int x=0;x<20;++x)CHECK(raster::readWorld(surface(d),x,y)==before[y*20+x]);d.redo();for(int y=0;y<20;++y)for(int x=0;x<20;++x)CHECK(raster::readWorld(surface(d),x,y)==expected[y*20+x]);
 }
 {Document d(512,512);timeline::Surface s;s.width=s.height=100;s.offsetX=s.offsetY=100;s.pixels.resize(10000);RasterHistoryFixture::install(d,s);ShapeSpec shape;shape.kind=ShapeKind::Rectangle;shape.bounds={100,100,1,1};CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,ink)&&d.commitShapePreview());CHECK(surface(d).width==100&&surface(d).height==100&&surface(d).offsetX==100&&surface(d).offsetY==100);}
 {Document d(512,512);timeline::Surface s;s.width=2;s.height=1;s.offsetX=s.offsetY=200;s.pixels={0x00030201,0};RasterHistoryFixture::install(d,s);d.commitSelection({},SelectionMask{0,0,1,1,{}});d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();ShapeSpec shape;shape.kind=ShapeKind::Rectangle;shape.bounds={100,100,1,1};CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,ink));CHECK(surface(d).width==2&&surface(d).offsetX==200);CHECK(!d.commitShapePreview());CHECK(surface(d).offsetX==36&&surface(d).offsetY==36&&surface(d).width==166&&surface(d).height==165&&raster::readWorld(surface(d),200,200)==0x00030201&&!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev);}
 {Document d(8,8);timeline::Surface s;s.width=s.height=1;s.offsetX=s.offsetY=2;s.pixels={0x00112233};RasterHistoryFixture::install(d,s);d.markSaved();const auto rev=d.contentRevision();ShapeSpec shape;shape.kind=ShapeKind::Rectangle;shape.bounds={0,0,1,1};CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,0));d.cancelShapePreview();CHECK(surface(d).width==1&&surface(d).pixels==s.pixels);CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,0));CHECK(!d.commitShapePreview());CHECK(surface(d).width==8&&surface(d).height==8&&surface(d).offsetX==0&&surface(d).offsetY==0&&raster::readWorld(surface(d),2,2)==0&&!d.dirty()&&d.historySize()==0&&d.contentRevision()==rev);}
 for(bool line:{false,true}){Document d(8,8);timeline::Surface s;s.width=2;s.height=1;s.offsetX=2;s.offsetY=2;s.pixels={0,0};RasterHistoryFixture::install(d,s);d.symmetryAxes.vertical=true;d.setSymmetryCenter({1,4},false);ShapeSpec shape;shape.kind=line?ShapeKind::Line:ShapeKind::Rectangle;shape.bounds={-1,2,1,1};shape.start=shape.end={-1,2};shape.brush={1,100,BrushShape::Round};CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,ink));CHECK((*d.gradientPreviewPixels())[2*8+2]==ink);CHECK(d.commitShapePreview());CHECK(raster::readWorld(surface(d),2,2)==ink);d.undo();CHECK(raster::readWorld(surface(d),2,2)==0);d.redo();CHECK(raster::readWorld(surface(d),2,2)==ink);}
 {Document d(8,8);timeline::Surface s;s.width=2;s.height=1;s.offsetX=2;s.offsetY=2;s.pixels={ink,0x00030201};RasterHistoryFixture::install(d,s);ShapeSpec shape;shape.kind=ShapeKind::Rectangle;shape.bounds={2,2,1,1};CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,0x00112233));CHECK((*d.gradientPreviewPixels())[2*8+2]==0x00112233&&raster::readWorld(surface(d),2,2)==ink);CHECK(d.commitShapePreview()&&raster::readWorld(surface(d),2,2)==0x00112233&&raster::readWorld(surface(d),3,2)==0x00030201);d.undo();CHECK(raster::readWorld(surface(d),2,2)==ink);d.redo();CHECK(raster::readWorld(surface(d),2,2)==0x00112233);}
 {Document d(8,8);RasterHistoryFixture::install(d,sparse(-500000000));d.markSaved();const auto original=surface(d);const auto h=d.historySize(),rev=d.contentRevision();ShapeSpec shape;shape.kind=ShapeKind::Rectangle;shape.bounds={1,1,3,3};CHECK(d.beginShapePreview()&&d.updateShapePreview(shape,ink));const auto preview=*d.gradientPreviewPixels();bool rejected=false;try{d.commitShapePreview();}catch(const std::length_error&){rejected=true;}CHECK(rejected&&d.shapeActive()&&*d.gradientPreviewPixels()==preview&&!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev&&surface(d).offsetX==original.offsetX&&surface(d).width==original.width&&surface(d).pixels==original.pixels);d.cancelShapePreview();CHECK(!d.shapeActive()&&surface(d).pixels==original.pixels);}
 // Legacy adjustments visit the entire owner; selections use document coordinates.
 for(int mode=0;mode<5;++mode){
  Document d(8,8);timeline::Surface s;s.width=3;s.height=2;s.offsetX=-1;s.offsetY=1;
  s.pixels={0x801e140a,0xff5ab428,0x00030201,0xff8c8278,0xdcb4aaa0,0xffdcd2c8};RasterHistoryFixture::install(d,s);
  if(mode==0)d.addLinkedFrame(true);const auto owner=d.timeline().resolveSurface(d.cel().id).source->id;const auto link=d.cel().linkedCelId;d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();
  ColorAdjustment a;Pixel expected=0;
  if(mode==0){a.kind=ColorAdjustmentKind::Invert;expected=0x80e1ebf5;}
  if(mode==1){a.kind=ColorAdjustmentKind::BrightnessContrast;a.brightness=20;a.contrast=10;expected=0x80473c31;}
  if(mode==2){a.kind=ColorAdjustmentKind::HueSaturation;a.colorize=true;a.saturation=0;expected=0x80141414;}
  if(mode==3){a.kind=ColorAdjustmentKind::ColorBalance;for(auto& tone:a.balance)tone[0]=20;a.preserveLuminosity=false;expected=0x80140a1e;}
  if(mode==4){a.kind=ColorAdjustmentKind::Curves;a.curves[0]={{0,255},{255,0}};expected=0x80e1ebf5;}
  auto preview=[&]()->const timeline::Surface&{return *d.displayTimeline().resolveSurface(d.cel().id).surface;};
  CHECK(d.beginColorAdjustment()&&d.updateColorAdjustment(a));CHECK(preview().pixels[0]==expected&&preview().pixels[2]==s.pixels[2]);CHECK(surface(d).pixels==s.pixels&&!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev);
  CHECK(d.updateColorAdjustment(a,false)&&preview().pixels==s.pixels);CHECK(d.updateColorAdjustment(a)&&d.updateColorAdjustment(a)&&preview().pixels[0]==expected);
  d.cancelColorAdjustment();CHECK(surface(d).pixels==s.pixels&&d.historySize()==h&&!d.dirty());
  CHECK(d.beginColorAdjustment()&&d.updateColorAdjustment(a));
  if(mode==0)d.setLayerAutoLinkAnimationCels(d.layer().id,true);
  const auto commitHistory=d.historySize();
  CHECK(d.commitColorAdjustment());CHECK(d.historySize()==commitHistory+1&&d.contentRevision()==rev+1&&surface(d).pixels[0]==expected&&surface(d).pixels[2]==s.pixels[2]&&surface(d).width==3&&surface(d).height==2&&surface(d).offsetX==-1&&surface(d).offsetY==1);CHECK(d.cel().linkedCelId==link&&d.timeline().resolveSurface(d.cel().id).source->id==owner);if(mode==0)CHECK(d.layer().autoLinkAnimationCels);
  RasterHistoryFixture::expand(d,{-3,-2,8,8});d.undo();CHECK(raster::readWorld(surface(d),-1,1)==s.pixels[0]&&raster::readWorld(surface(d),1,1)==s.pixels[2]&&d.cel().linkedCelId==link);d.redo();CHECK(raster::readWorld(surface(d),-1,1)==expected&&raster::readWorld(surface(d),1,1)==s.pixels[2]);
 }
 {Document d(8,8);timeline::Surface s;s.width=3;s.height=1;s.offsetX=s.offsetY=1;s.pixels={0x801e140a,0xff5ab428,0x00030201};RasterHistoryFixture::install(d,s);d.commitSelection({},SelectionMask{1,1,3,1,{0,1,0}});d.markSaved();const auto h=d.historySize();ColorAdjustment a;a.kind=ColorAdjustmentKind::Invert;CHECK(d.beginColorAdjustment()&&d.updateColorAdjustment(a)&&d.commitColorAdjustment());CHECK(surface(d).pixels==std::vector<Pixel>({0x801e140a,0xffa54bd7,0x00030201})&&d.historySize()==h+1);d.undo();CHECK(surface(d).pixels==s.pixels);d.redo();CHECK(surface(d).pixels[1]==0xffa54bd7);CHECK(d.beginColorAdjustment()&&d.updateColorAdjustment(a,false)&&!d.commitColorAdjustment()&&d.historySize()==h+1);}
 // Replacement shares the owner-local commit/history installation.
 for(bool clipped:{false,true}){Document d(2,1);timeline::Surface s;s.width=4;s.height=1;s.offsetX=-1;s.pixels.assign(4,0xff123456);RasterHistoryFixture::install(d,s);d.previewSelection(SelectionMask{-1,0,4,1,{}});const auto id=d.cel().id;const auto h=d.historyPosition();CHECK(d.beginColorReplacement({id},clipped)&&d.updateColorReplacement(0xff123456,0xffabcdef));const auto expected=clipped?std::vector<Pixel>{0xff123456,0xffabcdef,0xffabcdef,0xff123456}:std::vector<Pixel>(4,0xffabcdef);CHECK(d.displayTimeline().resolveSurface(id).surface->pixels==expected&&surface(d).pixels==s.pixels);CHECK(d.commitColorAdjustment()&&d.historyPosition()==h+1&&surface(d).pixels==expected);d.undo();CHECK(surface(d).pixels==s.pixels);d.redo();CHECK(surface(d).pixels==expected);}
 {Document d(2,1);d.fillSelectionOrCanvas(0xff123456);const auto owner=d.layer().id,frame=d.frame().id;CHECK(d.createAttachedMask(owner,frame));d.fillSelectionOrCanvas(0xffffffff);const auto id=d.activeMaskId();CHECK(d.beginColorReplacement({id})&&d.updateColorReplacement(0xffffffff,0x80000000));RasterHistoryFixture::changeMaskMetadata(d);const auto h=d.historyPosition();CHECK(d.commitColorAdjustment()&&d.historyPosition()==h+1);auto verify=[&](Pixel value){const auto* m=timeline::resolvedMask(d.timeline().state(),owner,frame);CHECK(m&&!m->moveWithOwner&&m->autoLinkAnimationCels&&m->surface.pixels==std::vector<Pixel>({value,value}));};verify(0xff7f7f7f);d.undo();verify(0xffffffff);d.redo();verify(0xff7f7f7f);}
 {Document d(8,8);auto s=sparse();RasterHistoryFixture::install(d,s);const auto id=d.timeline().resolveSurface(d.cel().id).source->id;CHECK(d.beginColorReplacement({id})&&d.updateColorReplacement(s.pixels[0],ink)&&d.commitColorAdjustment());CHECK(surface(d).pixels[0]==ink&&surface(d).pixels[1]==s.pixels[1]&&surface(d).width==2);RasterHistoryFixture::expand(d,{-4,-2,8,8});d.undo();CHECK(raster::readWorld(surface(d),-2,1)==s.pixels[0]&&raster::readWorld(surface(d),-1,1)==s.pixels[1]);d.redo();CHECK(raster::readWorld(surface(d),-2,1)==ink);}
 {Document d(8,8);auto s=sparse();RasterHistoryFixture::install(d,s);auto layers=RasterHistoryFixture::secondAdjustmentOwner(d);d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();ColorAdjustment a;a.kind=ColorAdjustmentKind::Invert;CHECK(d.beginColorAdjustment(layers)&&d.updateColorAdjustment(a));const auto previewFirst=d.displayTimeline().resolveSurface(d.cel().id).surface->pixels;RasterHistoryFixture::invalidateLastAdjustmentPreview(d);bool rejected=false;try{d.commitColorAdjustment();}catch(const std::exception&){rejected=true;}CHECK(rejected&&!d.dirty()&&d.historySize()==h&&d.contentRevision()==rev&&surface(d).pixels==s.pixels&&d.displayTimeline().resolveSurface(d.cel().id).surface->pixels==previewFirst);d.cancelColorAdjustment();CHECK(surface(d).pixels==s.pixels);}
 // Legacy blue/yellow map uses world-coordinate Bayer phases, including outside pixels.
 {Document d(8,8);timeline::Surface s;s.width=16;s.height=1;s.offsetX=-3;s.offsetY=2;s.pixels.assign(16,0x7b808080);s.pixels[7]=0x0038220c;RasterHistoryFixture::install(d,s);d.addLinkedFrame(true);const auto owner=d.timeline().resolveSurface(d.cel().id).source->id;const auto link=d.cel().linkedCelId;d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();GradientMapSettings map;map.stops={{0,0xffff0000},{1,0xff00ffff}};map.dither=2;
  std::vector<Pixel> expected(16);for(int i=0;i<16;++i)expected[i]=(i&1)?0x7b00ffff:0x7bff0000;expected[7]=s.pixels[7];
  CHECK(d.beginColorAdjustment());auto task=d.captureGradientMapTask();CHECK(task&&Document::runGradientMapTask(*task,map,[]{return false;}));CHECK(task->targets.front().surface.pixels==expected&&surface(d).pixels==s.pixels&&d.historySize()==h&&!d.dirty());
  CHECK(d.publishGradientMapTask(std::move(*task)));CHECK(d.displayTimeline().resolveSurface(d.cel().id).surface->pixels==expected&&surface(d).pixels==s.pixels);
  CHECK(d.restoreGradientMapBaseline()&&d.displayTimeline().resolveSurface(d.cel().id).surface->pixels==s.pixels);
  task=d.captureGradientMapTask();CHECK(task&&Document::runGradientMapTask(*task,map,[]{return false;}));CHECK(d.restoreGradientMapBaseline()&&!d.publishGradientMapTask(std::move(*task))&&surface(d).pixels==s.pixels);
  task=d.captureGradientMapTask();CHECK(task&&!Document::runGradientMapTask(*task,map,[]{return true;})&&!d.publishGradientMapTask(std::move(*task)));
  task=d.captureGradientMapTask();CHECK(task&&Document::runGradientMapTask(*task,map,[]{return false;})&&d.publishGradientMapTask(std::move(*task)));d.setLayerAutoLinkAnimationCels(d.layer().id,true);const auto commitHistory=d.historySize();CHECK(d.commitColorAdjustment()&&d.historySize()==commitHistory+1&&d.contentRevision()==rev+1&&d.layer().autoLinkAnimationCels);CHECK(surface(d).pixels==expected&&surface(d).width==16&&surface(d).offsetX==-3&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(d.cel().id).source->id==owner);
  RasterHistoryFixture::expand(d,{-5,-1,16,8});d.undo();for(int i=0;i<16;++i)CHECK(raster::readWorld(surface(d),i-3,2)==s.pixels[i]);d.redo();for(int i=0;i<16;++i)CHECK(raster::readWorld(surface(d),i-3,2)==expected[i]);
 }
 {Document d(8,8);timeline::Surface s;s.width=3;s.height=1;s.offsetX=s.offsetY=1;s.pixels={0x48000000,0xffffffff,0x0038220c};RasterHistoryFixture::install(d,s);d.commitSelection({},SelectionMask{1,1,3,1,{1,0,1}});d.markSaved();const auto h=d.historySize();GradientMapSettings map;map.stops={{0,0xffff0000},{1,0xffff0000}};CHECK(d.beginColorAdjustment());auto task=d.captureGradientMapTask();CHECK(task&&Document::runGradientMapTask(*task,map,[]{return false;})&&d.publishGradientMapTask(std::move(*task))&&d.commitColorAdjustment());CHECK(surface(d).pixels==std::vector<Pixel>({0x48ff0000,0xffffffff,0x0038220c})&&d.historySize()==h+1);d.undo();CHECK(surface(d).pixels==s.pixels);d.redo();CHECK(surface(d).pixels[0]==0x48ff0000);}
 {Document d(8,8);RasterHistoryFixture::install(d,sparse());d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();GradientMapSettings map;CHECK(d.beginColorAdjustment());auto task=d.captureGradientMapTask();CHECK(task&&Document::runGradientMapTask(*task,map,[]{return false;}));d.cancelColorAdjustment();CHECK(d.beginColorAdjustment()&&!d.publishGradientMapTask(std::move(*task))&&d.historySize()==h&&d.contentRevision()==rev&&!d.dirty());d.cancelColorAdjustment();}
 {Document d(8,8);auto s=sparse();RasterHistoryFixture::install(d,s);auto layers=RasterHistoryFixture::secondAdjustmentOwner(d);d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();CHECK(d.beginColorAdjustment(layers));auto task=d.captureGradientMapTask();GradientMapSettings map;CHECK(task&&Document::runGradientMapTask(*task,map,[]{return false;}));++task->targets.back().surface.offsetX;CHECK(!d.publishGradientMapTask(std::move(*task))&&surface(d).pixels==s.pixels&&d.displayTimeline().resolveSurface(d.cel().id).surface->pixels==s.pixels&&d.historySize()==h&&d.contentRevision()==rev&&!d.dirty());d.cancelColorAdjustment();}
 {Document d(8,8);auto s=sparse();RasterHistoryFixture::install(d,s);d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();CHECK(d.beginColorAdjustment());auto task=d.captureGradientMapTask();CHECK(task);task->documentBytes=256*1024*1024;bool rejected=false;try{Document::runGradientMapTask(*task,GradientMapSettings{},[]{return false;});}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!task->completed&&surface(d).pixels==s.pixels&&d.displayTimeline().resolveSurface(d.cel().id).surface->pixels==s.pixels&&d.historySize()==h&&d.contentRevision()==rev&&!d.dirty());d.cancelColorAdjustment();}
 // Legacy convolution fixtures, through capture/worker/publication/geometry history.
 for(bool tiled:{false,true}){Document d(3,1);timeline::Surface s;s.width=3;s.height=1;s.pixels={0xff140a1e,0xff140a3c,0xff140a78};RasterHistoryFixture::install(d,s);d.markSaved();auto h=d.historySize();ConvolutionOptions o{"blur-5x1",{true,true,true,true},tiled};CHECK(d.beginColorAdjustment());auto task=d.captureConvolutionSurfaceTask(o);CHECK(task&&Document::runConvolutionSurfaceTask(*task,[]{return false;}));CHECK((task->results.front().pixels[0]&255)==(tiled?78:54)&&surface(d).pixels==s.pixels);CHECK(d.publishConvolutionSurfaceTask(std::move(*task))&&d.commitConvolutionAdjustment()&&d.historySize()==h+1);d.undo();CHECK(surface(d).pixels==s.pixels);d.redo();CHECK((surface(d).pixels[0]&255)==(tiled?78:54));}
 for(bool outline:{false,true}){Document d(5,5);timeline::Surface s;s.width=s.height=1;s.offsetX=s.offsetY=2;s.storageOriginX=7;s.storageOriginY=9;s.pixels={0xff1450f0};RasterHistoryFixture::install(d,s);d.addLinkedFrame(true);const auto link=d.cel().linkedCelId;const auto owner=d.timeline().resolveSurface(d.cel().id).source->id;d.markSaved();const auto rev=d.contentRevision();ConvolutionOptions o;o.presetId=outline?"outline-cross":"blur-3x3";o.channels=outline?std::array<bool,4>{false,false,false,true}:std::array<bool,4>{true,true,true,true};CHECK(d.beginColorAdjustment());auto task=d.captureConvolutionSurfaceTask(o);CHECK(task&&Document::runConvolutionSurfaceTask(*task,[]{return false;}));const auto& result=task->results.front();CHECK(result.width==3&&result.height==3&&result.offsetX==1&&result.offsetY==1&&result.storageOriginX==6&&result.storageOriginY==8);CHECK(raster::readWorld(result,2,2)==(outline?0xff1450f0:0x3f1450f0)&&raster::readWorld(result,1,1)==(outline?0:0x0f1450f0));if(outline)CHECK(raster::readWorld(result,2,1)==0xff000000);CHECK(surface(d).pixels==s.pixels&&!d.dirty());CHECK(d.publishConvolutionSurfaceTask(std::move(*task)));d.setLayerAutoLinkAnimationCels(d.layer().id,true);const auto h=d.historySize();CHECK(d.commitConvolutionAdjustment()&&d.historySize()==h+1&&d.contentRevision()==rev+1&&d.layer().autoLinkAnimationCels&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(d.cel().id).source->id==owner);d.undo();CHECK(surface(d).width==1&&surface(d).height==1&&surface(d).offsetX==2&&surface(d).offsetY==2&&surface(d).storageOriginX==7&&surface(d).storageOriginY==9&&surface(d).pixels==s.pixels&&d.layer().autoLinkAnimationCels&&d.cel().linkedCelId==link);d.redo();CHECK(surface(d).width==3&&surface(d).offsetX==1&&surface(d).storageOriginX==6&&raster::readWorld(surface(d),2,2)==(outline?0xff1450f0:0x3f1450f0));}
 {Document d(3,1);timeline::Surface s;s.width=5;s.height=1;s.offsetX=-2;s.pixels={0xff0000ff,0x00030201,0xff3b291e,0xff3b293c,0xff3b2978};RasterHistoryFixture::install(d,s);d.commitSelection({},SelectionMask{0,0,3,1,{0,1,0}});d.markSaved();ConvolutionOptions o{"negative",{true,false,false,false},false};CHECK(d.beginColorAdjustment());auto task=d.captureConvolutionSurfaceTask(o);CHECK(task&&Document::runConvolutionSurfaceTask(*task,[]{return false;})&&d.publishConvolutionSurfaceTask(std::move(*task))&&d.commitConvolutionAdjustment());auto expected=s.pixels;expected[3]=0xff3b29c3;CHECK(surface(d).pixels==expected&&surface(d).width==5&&surface(d).offsetX==-2);d.undo();CHECK(surface(d).pixels==s.pixels);d.redo();CHECK(surface(d).pixels==expected);}
 {Document d(8,8);auto s=sparse();RasterHistoryFixture::install(d,s);d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();ConvolutionOptions o;CHECK(d.beginColorAdjustment());auto task=d.captureConvolutionSurfaceTask(o);CHECK(task&&!Document::runConvolutionSurfaceTask(*task,[]{return true;})&&!d.publishConvolutionSurfaceTask(std::move(*task)));task=d.captureConvolutionSurfaceTask(o);CHECK(task&&Document::runConvolutionSurfaceTask(*task,[]{return false;}));CHECK(d.restoreConvolutionBaseline()&&!d.publishConvolutionSurfaceTask(std::move(*task)));task=d.captureConvolutionSurfaceTask(o);CHECK(task&&Document::runConvolutionSurfaceTask(*task,[]{return false;}));d.cancelColorAdjustment();CHECK(d.beginColorAdjustment()&&!d.publishConvolutionSurfaceTask(std::move(*task)));d.cancelColorAdjustment();CHECK(surface(d).pixels==s.pixels&&d.historySize()==h&&d.contentRevision()==rev&&!d.dirty());}
 {Document d(8,8);auto s=sparse(-500000000);RasterHistoryFixture::install(d,s);d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();ConvolutionOptions o{"negative",{true,true,true,true},false};CHECK(d.beginColorAdjustment());auto task=d.captureConvolutionSurfaceTask(o);CHECK(task);bool rejected=false;try{Document::runConvolutionSurfaceTask(*task,[]{return false;});}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!task->completed&&surface(d).pixels==s.pixels&&surface(d).offsetX==s.offsetX&&d.displayTimeline().resolveSurface(d.cel().id).surface->pixels==s.pixels&&d.historySize()==h&&d.contentRevision()==rev&&!d.dirty());d.cancelColorAdjustment();}
 // Ordinary selected copy preserves clamp/mask/empty clipboard priority semantics.
 for(bool dense:{false,true})for(bool linked:{false,true}){
 Document d(4,3);timeline::Surface s;s.width=4;s.height=2;s.offsetX=-1;s.offsetY=1;s.storageOriginX=71;s.storageOriginY=-37;s.pixels={0xffabcdef,0xff123456,0x00030201,0xff998877,0xffeeeeee,0xff654321,0x80443322,0xffabcdef};
 if(dense){timeline::Surface full;full.width=4;full.height=3;full.storageOriginX=71;full.storageOriginY=-37;full.pixels.resize(12);for(int y=0;y<3;++y)for(int x=0;x<4;++x)full.pixels[std::size_t(y)*4+x]=raster::readWorld(s,x,y);s=std::move(full);}
 RasterHistoryFixture::install(d,s);if(linked)d.addLinkedFrame(true);SelectionMask selected{-1,0,5,4,std::vector<unsigned char>(20,1)};selected.mask[8]=2;selected.mask[13]=0;d.previewSelection(selected);d.markSaved();
 const auto h=d.historySize(),rev=d.revision(),content=d.contentRevision();const auto owner=d.timeline().resolveSurface(d.cel().id).source->id;const auto activeFrame=d.frame().id;const auto link=d.cel().linkedCelId;const auto original=surface(d);
 CHECK(d.copySelectedFrames()&&d.hasFrameClipboard());auto copied=d.copyPixels();CHECK(copied&&copied->width==4&&copied->height==3&&copied->originX==0&&copied->originY==0);
 CHECK(copied->pixels==std::vector<Pixel>({0,0,0,0,0xff123456,0,0,0,0xff654321,0x80443322,0,0}));CHECK(copied->mask==std::vector<unsigned char>({0,0,0,0,1,0,0,0,1,1,0,0}));CHECK(!d.hasCelClipboard()&&!d.hasFrameClipboard()&&selectionEqual(d.selection(),selected));
 CHECK(d.copySelectedFrames()&&d.hasFrameClipboard());d.previewSelection(SelectionMask{1,1,1,1,{}});CHECK(!d.copyPixels()&&d.hasFrameClipboard());d.previewSelection(SelectionMask{20,20,1,1,{}});CHECK(!d.copyPixels()&&d.hasFrameClipboard());d.previewSelection({});CHECK(!d.copyPixels()&&d.hasFrameClipboard());d.previewSelection(selected);
 CHECK(d.historySize()==h&&d.revision()==rev&&d.contentRevision()==content&&!d.dirty()&&d.frame().id==activeFrame&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(d.cel().id).source->id==owner);CHECK(surface(d).width==original.width&&surface(d).height==original.height&&surface(d).offsetX==original.offsetX&&surface(d).offsetY==original.offsetY&&surface(d).storageOriginX==original.storageOriginX&&surface(d).storageOriginY==original.storageOriginY&&surface(d).pixels==original.pixels);
 }
 // Legacy clearSelection: clear hidden RGB within alpha bounds, preserve it outside.
 for(bool masked:{false,true})for(bool linked:{false,true}){
  Document d(4,3);timeline::Surface s;s.width=5;s.height=3;s.offsetX=-1;s.offsetY=0;s.storageOriginX=71;s.storageOriginY=-37;
  s.pixels={0x00030201,0xff111111,0x00040506,0xff222222,0x00070809,0x000a0b0c,0,0,0,0,0x000d0e0f,0xff333333,0x00101112,0xff444444,0x00131415};
  RasterHistoryFixture::install(d,s);const auto first=d.cel().id;
  if(linked){d.addLinkedFrame(true);const auto alias=d.cel().id;d.selectTimelineCel(first,0);d.selectTimelineCel(alias,1);d.setLayerVisible(false);}
  SelectionMask selected{-1,0,6,3,{}};if(masked){selected.mask.assign(18,1);selected.mask[3]=2;selected.mask[14]=0;}
  d.previewSelection(selected);d.markSaved();CHECK(d.copySelectedFrames());
  const auto h=d.historySize(),rev=d.contentRevision();const auto active=d.cel().id,owner=d.timeline().resolveSurface(active).source->id;const auto link=d.cel().linkedCelId;const auto selectedCels=d.timelineSelection().cels;
  auto expected=s.pixels;for(auto i:{1,2,11,13})expected[i]=0;if(!masked){expected[3]=0;expected[12]=0;}
  CHECK(d.deleteSelectedPixels());CHECK(!d.selection());CHECK(d.dirty());CHECK(d.historySize()==h+1);CHECK(d.contentRevision()==rev+(linked?3:1));CHECK(d.hasFrameClipboard());
  CHECK(surface(d).pixels==expected&&surface(d).width==s.width&&surface(d).height==s.height&&surface(d).offsetX==s.offsetX&&surface(d).offsetY==s.offsetY&&surface(d).storageOriginX==s.storageOriginX&&surface(d).storageOriginY==s.storageOriginY);
  CHECK(d.cel().id==active&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(active).source->id==owner&&d.timelineSelection().cels==selectedCels);
  d.undo();CHECK(surface(d).pixels==s.pixels);CHECK(selectionEqual(d.selection(),selected));CHECK(d.dirty());
  d.redo();CHECK(surface(d).pixels==expected&&!d.selection());
  RasterHistoryFixture::expand(d,{-3,-2,8,6});const auto grown=surface(d);
  d.undo();for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x)CHECK(raster::readWorld(surface(d),x+s.offsetX,y+s.offsetY)==s.pixels[std::size_t(y)*s.width+x]);
  CHECK(selectionEqual(d.selection(),selected)&&surface(d).width==grown.width&&surface(d).height==grown.height&&surface(d).offsetX==grown.offsetX&&surface(d).offsetY==grown.offsetY);
  d.redo();for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x)CHECK(raster::readWorld(surface(d),x+s.offsetX,y+s.offsetY)==expected[std::size_t(y)*s.width+x]);
  CHECK(!d.selection()&&d.historySize()==h+1&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(active).source->id==owner);
 }
 for(int mode=0;mode<5;++mode){
  Document d(4,3);timeline::Surface s;s.width=3;s.height=1;s.offsetX=1;s.offsetY=1;s.storageOriginX=17;s.storageOriginY=-8;s.pixels={0x00030201,0xff123456,0x00040506};
  if(mode==0)s.pixels[1]=0x00060708;RasterHistoryFixture::install(d,s);SelectionMask selected{0,0,4,3,{}};
  if(mode==1)d.setLayerLocked(true);if(mode==2)selected={2,1,1,1,{2}};if(mode==3)selected={20,20,1,1,{}};if(mode==4)selected={1,1,1,1,{}};
  d.previewSelection(selected);d.markSaved();const auto h=d.historySize(),rev=d.revision(),content=d.contentRevision();
  CHECK(!d.deleteSelectedPixels()&&selectionEqual(d.selection(),selected)&&surface(d).pixels==s.pixels&&surface(d).width==s.width&&surface(d).offsetX==s.offsetX&&surface(d).storageOriginX==s.storageOriginX&&surface(d).storageOriginY==s.storageOriginY&&d.historySize()==h&&d.revision()==rev&&d.contentRevision()==content&&!d.dirty());
 }
 {Document d(4,3);timeline::Surface s;s.width=3;s.height=1;s.offsetX=1;s.offsetY=1;s.storageOriginX=9;s.storageOriginY=-4;s.pixels={0xff123456,0x00030201,0xff654321};RasterHistoryFixture::install(d,s);SelectionMask selected{0,0,4,3,{}};d.previewSelection(selected);d.markSaved();const auto h=d.historySize();std::optional<SelectionClipboard> copied;
  CHECK(d.cutPixels(copied)&&copied&&copied->originX==0&&copied->originY==0&&copied->width==4&&copied->height==3&&copied->pixels[5]==0xff123456&&copied->pixels[6]==0&&copied->mask[6]==0&&copied->pixels[7]==0xff654321);
  CHECK(surface(d).pixels==std::vector<Pixel>({0,0,0})&&!d.selection()&&d.historySize()==h+1&&d.dirty());d.undo();CHECK(surface(d).pixels==s.pixels);CHECK(selectionEqual(d.selection(),selected));CHECK(d.dirty());d.redo();CHECK(surface(d).pixels==std::vector<Pixel>({0,0,0})&&!d.selection());
 }
 {Document d(4,3);timeline::Surface s;s.width=1;s.height=1;s.offsetX=1;s.offsetY=1;s.pixels={0x00030201};RasterHistoryFixture::install(d,s);d.previewSelection(SelectionMask{0,0,4,3,{}});d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();std::optional<SelectionClipboard> copied;CHECK(!d.cutPixels(copied)&&!copied&&!d.selection()&&surface(d).pixels==s.pixels&&d.historySize()==h&&d.contentRevision()==rev&&!d.dirty());}
 // Legacy AA diagonal transported through cropped storage and linked owner.
 {Document d(5,5);timeline::Surface src;src.width=5;src.height=3;src.offsetX=-1;src.offsetY=1;src.storageOriginX=17;src.storageOriginY=-8;src.pixels.resize(15);src.pixels[0]=0xff123456;src.pixels[5]=0x00030201;src.pixels[2]=src.pixels[8]=src.pixels[14]=0xffc06020;RasterHistoryFixture::install(d,src);d.addLinkedFrame(true);const auto alias=d.cel().id,owner=d.timeline().resolveSurface(alias).source->id;const auto link=d.cel().linkedCelId;d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();AntiAliasOptions o;o.opacity=37;
  CHECK(d.beginAntiAliasPreview());auto cancelled=d.captureAntiAliasSurfaceTask(o);CHECK(cancelled&&!Document::runAntiAliasSurfaceTask(*cancelled,[]{return true;})&&!cancelled->surfaces.completed);CHECK(surface(d).pixels==src.pixels&&d.historySize()==h);
  auto task=d.captureAntiAliasSurfaceTask(o);CHECK(task&&task->frames==std::vector<std::string>{d.frame().id}&&task->surfaces.source.targets.size()==1&&Document::runAntiAliasSurfaceTask(*task,[]{return false;}));
  CHECK(surface(d).pixels==src.pixels&&d.publishAntiAliasSurfaceTask(std::move(*task)));const auto preview=*d.displayTimeline().resolveSurface(alias).surface;CHECK(preview.width==6&&preview.height==5&&preview.offsetX==-1&&preview.offsetY==0&&preview.storageOriginX==17&&preview.storageOriginY==-9);
  for(const auto p:{Point{2,1},Point{1,2},Point{3,2},Point{2,3}})CHECK(raster::readWorld(preview,p.x,p.y)==0x5ec06020);
  CHECK(raster::readWorld(preview,-1,1)==0xff123456&&raster::readWorld(preview,-1,2)==0x00030201&&surface(d).pixels==src.pixels&&d.historySize()==h&&d.contentRevision()==rev&&!d.dirty());
  d.cancelColorAdjustment();CHECK(surface(d).pixels==src.pixels&&!d.dirty());CHECK(d.beginAntiAliasPreview());task=d.captureAntiAliasSurfaceTask(o);CHECK(task&&Document::runAntiAliasSurfaceTask(*task,[]{return false;}));d.setLayerAutoLinkAnimationCels(d.layer().id,true);const auto commitHistory=d.historySize();CHECK(d.publishAntiAliasSurfaceTask(std::move(*task))&&d.commitAntiAliasAdjustment());const auto after=surface(d);CHECK(d.layer().autoLinkAnimationCels&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(alias).source->id==owner&&d.historySize()==commitHistory+1);
  d.undo();CHECK(surface(d).pixels==src.pixels&&surface(d).width==src.width&&surface(d).height==src.height&&surface(d).offsetX==src.offsetX&&surface(d).offsetY==src.offsetY&&surface(d).storageOriginX==src.storageOriginX&&surface(d).storageOriginY==src.storageOriginY&&d.layer().autoLinkAnimationCels&&d.cel().linkedCelId==link);
  d.redo();CHECK(surface(d).pixels==after.pixels&&surface(d).width==after.width&&surface(d).height==after.height&&surface(d).offsetX==after.offsetX&&surface(d).offsetY==after.offsetY&&surface(d).storageOriginY==after.storageOriginY);
 }
 {Document d(5,5);timeline::Surface src;src.width=src.height=3;src.offsetX=src.offsetY=1;src.pixels.resize(9);src.pixels[0]=src.pixels[4]=src.pixels[8]=0xffc06020;RasterHistoryFixture::install(d,src);const auto h=d.historySize();CHECK(d.beginAntiAliasPreview());auto task=d.captureAntiAliasSurfaceTask({});CHECK(task&&Document::runAntiAliasSurfaceTask(*task,[]{return false;}));CHECK(d.restoreConvolutionBaseline()&&!d.publishAntiAliasSurfaceTask(std::move(*task)));task=d.captureAntiAliasSurfaceTask({});CHECK(task&&Document::runAntiAliasSurfaceTask(*task,[]{return false;}));d.cancelColorAdjustment();CHECK(d.beginAntiAliasPreview()&&!d.publishAntiAliasSurfaceTask(std::move(*task)));d.cancelColorAdjustment();CHECK(surface(d).pixels==src.pixels&&d.historySize()==h);}
 {Document d(8,8);auto src=sparse(-500000000);RasterHistoryFixture::install(d,src);d.markSaved();const auto h=d.historySize(),rev=d.contentRevision();CHECK(d.beginAntiAliasPreview());auto task=d.captureAntiAliasSurfaceTask({});CHECK(task);bool rejected=false;try{Document::runAntiAliasSurfaceTask(*task,[]{return false;});}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!task->surfaces.completed&&surface(d).pixels==src.pixels&&surface(d).width==src.width&&surface(d).offsetX==src.offsetX&&d.displayTimeline().resolveSurface(d.cel().id).surface->pixels==src.pixels&&d.historySize()==h&&d.contentRevision()==rev&&!d.dirty());d.cancelColorAdjustment();}
 {Document d(5,5);timeline::Surface src;src.width=2;src.height=1;src.offsetX=src.offsetY=2;src.pixels={0x00030201,0};RasterHistoryFixture::install(d,src);d.markSaved();const auto h=d.historySize();CHECK(d.beginAntiAliasPreview());auto task=d.captureAntiAliasSurfaceTask({});CHECK(task&&Document::runAntiAliasSurfaceTask(*task,[]{return false;}));CHECK(std::none_of(task->surfaces.produced.begin(),task->surfaces.produced.end(),[](auto p){return p!=0;})&&!d.publishAntiAliasSurfaceTask(std::move(*task)));d.cancelColorAdjustment();CHECK(surface(d).pixels==src.pixels&&d.historySize()==h&&!d.dirty());}
 // Cropped inactive targets sample each selected frame, rather than the active one.
 {Document d(5,5);timeline::Surface red;red.width=red.height=3;red.offsetX=red.offsetY=1;red.pixels.resize(9);red.pixels[0]=red.pixels[4]=red.pixels[8]=0xffc06020;RasterHistoryFixture::install(d,red);const auto firstCel=d.cel().id,firstFrame=d.frame().id;d.addFrame();auto blue=red;blue.pixels[0]=blue.pixels[4]=blue.pixels[8]=0xff3060c0;RasterHistoryFixture::install(d,blue);const auto secondCel=d.cel().id,secondFrame=d.frame().id;d.selectTimelineCel(firstCel);d.selectTimelineCel(secondCel,1);d.markSaved();const auto h=d.historySize();AntiAliasOptions o;o.opacity=37;
  CHECK(d.beginAntiAliasPreview());auto task=d.captureAntiAliasSurfaceTask(o);CHECK(task&&task->frames==std::vector<std::string>({firstFrame,secondFrame})&&task->surfaces.source.targets.size()==2&&Document::runAntiAliasSurfaceTask(*task,[]{return false;}));
  CHECK(raster::readWorld(task->surfaces.results[0],2,1)==0x5ec06020&&raster::readWorld(task->surfaces.results[1],2,1)==0x5e3060c0);CHECK(d.publishAntiAliasSurfaceTask(std::move(*task))&&d.commitAntiAliasAdjustment()&&d.historySize()==h+1);
  CHECK(raster::readWorld(*d.timeline().resolveSurface(firstCel).surface,2,1)==0x5ec06020&&raster::readWorld(*d.timeline().resolveSurface(secondCel).surface,2,1)==0x5e3060c0);
  d.undo();CHECK(d.timeline().resolveSurface(firstCel).surface->pixels==red.pixels&&d.timeline().resolveSurface(firstCel).surface->width==3&&d.timeline().resolveSurface(firstCel).surface->offsetX==1&&d.timeline().resolveSurface(secondCel).surface->pixels==blue.pixels);
  d.redo();CHECK(raster::readWorld(*d.timeline().resolveSurface(firstCel).surface,2,1)==0x5ec06020&&raster::readWorld(*d.timeline().resolveSurface(secondCel).surface,2,1)==0x5e3060c0);
 }
 // Clipboard entry uses the shared sparse transaction, including hidden linked owners.
 for(bool linked:{false,true}){
  Document d(4,3);timeline::Surface s;s.width=2;s.height=1;s.offsetX=-1;s.offsetY=1;s.storageOriginX=71;s.storageOriginY=-37;s.pixels={0xff123456,0x00030201};RasterHistoryFixture::install(d,s);
  if(linked)d.addLinkedFrame(true);d.setLayerVisible(false);SelectionMask before{2,2,1,1,{}};d.previewSelection(before);d.markSaved();const auto h=d.historySize();const auto owner=d.timeline().resolveSurface(d.cel().id).source->id;const auto link=d.cel().linkedCelId;
  SelectionClipboard clip;clip.width=3;clip.height=1;clip.pixels={0x800000ff,0xffabcdef,0xff00ff00};clip.mask={1,2,1};
  CHECK(d.beginFloatingPaste(clip,0,1)&&d.floating()&&d.selection()->x==0&&d.selection()->y==1&&d.selection()->width==3&&d.selection()->height==1&&d.selection()->mask.empty());
  CHECK(raster::readWorld(surface(d),-1,1)==0xff123456&&raster::readWorld(surface(d),0,1)==0x800000ff&&raster::readWorld(surface(d),1,1)==0&&raster::readWorld(surface(d),2,1)==0xff00ff00&&d.historySize()==h&&!d.dirty());
  d.cancelFloatingPaste();CHECK(!d.floating()&&selectionEqual(d.selection(),before)&&raster::readWorld(surface(d),-1,1)==s.pixels[0]&&raster::readWorld(surface(d),0,1)==s.pixels[1]&&raster::readWorld(surface(d),2,1)==0&&d.historySize()==h&&!d.dirty());
  CHECK(d.beginFloatingPaste(clip,0,1)&&d.commitFloatingPaste()&&!d.floating()&&d.historySize()==h+1&&d.dirty());d.undo();CHECK(selectionEqual(d.selection(),before)&&raster::readWorld(surface(d),-1,1)==s.pixels[0]&&raster::readWorld(surface(d),0,1)==s.pixels[1]&&raster::readWorld(surface(d),2,1)==0);
  d.redo();CHECK(raster::readWorld(surface(d),0,1)==0x800000ff&&raster::readWorld(surface(d),1,1)==0&&raster::readWorld(surface(d),2,1)==0xff00ff00&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(d.cel().id).source->id==owner);
 }
 {Document d(4,1);SelectionClipboard clip;clip.width=6;clip.height=1;clip.pixels={0xff123456,0,0,0,0,0xffabcdef};const auto h=d.historySize();CHECK(d.beginFloatingPaste(clip,0,0)&&d.selection()->width==6&&d.selection()->mask.empty()&&d.pixels()[0]==0xff123456);d.moveFloatingPaste(-2,0);CHECK(d.selection()->x==-2&&d.selection()->width==6&&d.pixels()[3]==0xffabcdef&&d.pixels()[0]==0);d.cancelFloatingPaste();CHECK(!d.floating()&&!d.selection()&&d.historySize()==h&&!d.dirty()&&std::all_of(d.pixels().begin(),d.pixels().end(),[](auto p){return p==0;}));}
 {Document d(2,1);SelectionClipboard clip;clip.width=clip.height=1;clip.pixels={0xff123456};CHECK(d.beginFloatingPaste(clip,0,0));const auto h=d.historySize();auto invalid=clip;invalid.pixels.clear();CHECK(!d.beginFloatingPaste(invalid,1,0)&&!d.floating()&&d.pixels()[0]==0xff123456&&d.historySize()==h+1);}
 {Document d(2,1);d.previewSelection(SelectionMask{1,0,1,1,{}});const auto before=d.selection();const auto h=d.historySize();SelectionClipboard clip;clip.width=clip.height=1;clip.pixels={0xff123456};clip.mask={0};CHECK(!d.beginFloatingPaste(clip,0,0)&&!d.floating()&&selectionEqual(d.selection(),before)&&d.historySize()==h&&!d.dirty());}
 {Document d(4,3);auto s=sparse(-500000000);RasterHistoryFixture::install(d,s);SelectionMask before{2,2,1,1,{}};d.previewSelection(before);d.markSaved();const auto h=d.historySize();SelectionClipboard clip;clip.width=clip.height=1;clip.pixels={0xffabcdef};bool rejected=false;try{d.beginFloatingPaste(clip,1,1);}catch(const std::length_error&){rejected=true;}CHECK(rejected&&!d.floating()&&selectionEqual(d.selection(),before)&&surface(d).pixels==s.pixels&&surface(d).width==s.width&&surface(d).offsetX==s.offsetX&&d.historySize()==h&&!d.dirty());}
 // Materialized legacy transform preserves raw outside bytes and linked owner identity.
 for(bool rotate:{false,true}){
  Document d(5,4);timeline::Surface src;src.width=4;src.height=2;src.offsetX=-1;src.offsetY=1;src.storageOriginX=11;src.storageOriginY=-7;src.pixels={0xff112233,0x00030201,0x80403020,0x000a0b0c,0x00040506,0,0,0xffeeddcc};RasterHistoryFixture::install(d,src);const auto first=d.cel().id;d.addLinkedFrame(true);const auto alias=d.cel().id,owner=d.timeline().resolveSurface(alias).source->id;const auto link=d.cel().linkedCelId;d.selectTimelineCel(first);d.selectTimelineCel(alias,1);const SelectionMask selected{1,1,2,2,{}};d.previewSelection(selected);d.markSaved();const auto h=d.historySize();
  CHECK(d.beginSelectionContentMove(false));auto target=*d.floatingTransform();if(rotate)target.angle=90;else target.x+=1;d.transformFloatingPaste(target);
  const auto preview=surface(d);CHECK(preview.width==6&&preview.height==4&&preview.offsetX==-1&&preview.offsetY==0&&preview.storageOriginX==11&&preview.storageOriginY==-8);CHECK(raster::readWorld(preview,2,1)==0x80403020&&raster::readWorld(preview,rotate?1:3,2)==0xffeeddcc);CHECK(raster::readWorld(preview,-1,1)==0xff112233&&raster::readWorld(preview,-1,2)==0x00040506&&raster::readWorld(preview,0,1)==0x00030201&&d.historySize()==h&&!d.dirty());
  const auto previewSelection=d.selection();auto tooLarge=target;tooLarge.width=tooLarge.height=100000;bool rejected=false;try{d.transformFloatingPaste(tooLarge);}catch(const std::length_error&){rejected=true;}CHECK(rejected&&d.floating()&&surface(d).pixels==preview.pixels&&surface(d).width==preview.width&&selectionEqual(d.selection(),previewSelection)&&d.historySize()==h&&!d.dirty());
  d.cancelFloatingPaste();CHECK(!d.floating()&&surface(d).pixels==src.pixels&&surface(d).width==src.width&&surface(d).height==src.height&&surface(d).offsetX==src.offsetX&&surface(d).offsetY==src.offsetY&&surface(d).storageOriginX==src.storageOriginX&&surface(d).storageOriginY==src.storageOriginY&&selectionEqual(d.selection(),selected)&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(alias).source->id==owner);
  CHECK(d.beginSelectionContentMove(false));target=*d.floatingTransform();if(rotate)target.angle=90;else target.x+=1;d.transformFloatingPaste(target);const auto applied=surface(d);const auto appliedSelection=d.selection();CHECK(d.commitFloatingPaste()&&d.historySize()==h+1&&d.cel().linkedCelId==link&&d.timeline().resolveSurface(alias).source->id==owner);
  d.undo();CHECK(surface(d).pixels==src.pixels&&surface(d).width==src.width&&surface(d).height==src.height&&surface(d).offsetX==src.offsetX&&surface(d).offsetY==src.offsetY&&surface(d).storageOriginX==src.storageOriginX&&surface(d).storageOriginY==src.storageOriginY&&selectionEqual(d.selection(),selected)&&d.cel().linkedCelId==link);
  d.redo();CHECK(surface(d).pixels==applied.pixels&&surface(d).width==applied.width&&surface(d).height==applied.height&&surface(d).offsetX==applied.offsetX&&surface(d).offsetY==applied.offsetY&&surface(d).storageOriginX==applied.storageOriginX&&surface(d).storageOriginY==applied.storageOriginY&&selectionEqual(d.selection(),appliedSelection));
 }
 {
 Document d(8,4);timeline::Surface s;s.width=4;s.height=1;s.offsetX=-1;s.offsetY=1;s.storageOriginX=71;s.storageOriginY=-37;s.pixels={0xff112233,0x00030201,0xff445566,0xff778899};RasterHistoryFixture::install(d,s);
 const auto canvas=d.canvasPixels();CHECK(canvas.size()==32&&canvas[8]==0x00030201&&canvas[9]==0xff445566&&canvas[10]==0xff778899&&canvas[0]==0);
 SelectionMask original{-2,1,6,1,{0,1,0,1,1,0}};auto shrunk=d.selectionContentBounds(original);CHECK(shrunk&&shrunk->x==-1&&shrunk->y==1&&shrunk->width==4&&shrunk->height==1&&shrunk->mask==std::vector<unsigned char>({1,0,1,1}));
 SelectionMask bs{0,1,3,1,{1,0,1}};auto sb=createSelectionPatternBrush(d.activeSurface(),8,4,bs),db=createSelectionPatternBrush(canvas,8,4,bs);CHECK(sb&&db&&sb->colors==db->colors&&sb->coverage==db->coverage&&sb->colors==std::vector<Pixel>({0x00030201,0,0xff778899}));
 d.previewSelection(SelectionMask{-1,1,3,1,{1,0,1}});d.markSaved();const auto h=d.historySize();CHECK(d.centerActiveContent(true,false)&&d.historySize()==h+1&&d.selection()->x==3);CHECK(raster::readWorld(surface(d),-1,1)==0&&raster::readWorld(surface(d),0,1)==0x00030201&&raster::readWorld(surface(d),1,1)==0&&raster::readWorld(surface(d),2,1)==0xff778899&&raster::readWorld(surface(d),3,1)==0xff112233&&raster::readWorld(surface(d),5,1)==0xff445566);d.undo();CHECK(surface(d).pixels==s.pixels&&surface(d).offsetX==s.offsetX&&surface(d).storageOriginX==s.storageOriginX&&d.selection()->x==-1);d.redo();CHECK(raster::readWorld(surface(d),5,1)==0xff445566&&d.selection()->x==3);
 }
 {
 Document d(8,4);timeline::Surface s;s.width=2;s.height=1;s.offsetX=0;s.offsetY=1;s.storageOriginX=71;s.storageOriginY=-37;s.pixels={0xff123456,0x00030201};RasterHistoryFixture::install(d,s);d.addLinkedFrame(true);d.previewSelection(SelectionMask{0,1,2,1,{}});const auto alias=d.cel().id,owner=d.timeline().resolveSurface(alias).source->id;const auto h=d.historySize();CHECK(d.centerActiveContent(true,false)&&d.historySize()==h+1&&surface(d).width==2&&surface(d).offsetX==3&&surface(d).pixels==s.pixels&&surface(d).storageOriginX==71&&d.timeline().resolveSurface(alias).source->id==owner);d.undo();CHECK(surface(d).offsetX==0&&surface(d).pixels==s.pixels);d.redo();CHECK(surface(d).offsetX==3&&surface(d).pixels==s.pixels);
 }
 {Document d(8,4);timeline::Surface s;s.width=s.height=1;s.offsetX=std::numeric_limits<int>::min();s.offsetY=1;s.pixels={0xff123456};RasterHistoryFixture::install(d,s);CHECK(d.centerActiveContent(true,false)&&surface(d).offsetX==4&&surface(d).pixels==s.pixels);d.undo();CHECK(surface(d).offsetX==s.offsetX);}
 std::cout<<"Document raster history and sparse fill passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
