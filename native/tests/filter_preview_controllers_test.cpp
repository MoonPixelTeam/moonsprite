#include "filter_preview_controllers.h"
#include <deque>
#include <iostream>
#include <stdexcept>
#include <type_traits>

using namespace moon;
using namespace moon::workspace;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
struct ManualExecutor {
 std::deque<std::function<void()>> jobs;
 bool fail=false;
 PreviewExecutor executor(){return [this](auto work){if(fail)throw std::runtime_error("injected scheduling failure");jobs.push_back(std::move(work));};}
 void step(){check(!jobs.empty(),"No scheduled snapshot");auto work=std::move(jobs.front());jobs.pop_front();work();}
};
static const auto now=PreviewClock::time_point{};
static const auto due=now+std::chrono::seconds(1);
template<class Controller> FilterPreviewUpdate drain(Controller& controller,Document& document,ManualExecutor& executor){
 FilterPreviewUpdate last;
 for(int n=0;controller.busy()&&n<12;++n){
  const auto update=controller.poll(document,due);
  if(update.state!=FilterPreviewUpdate::None)last=update;
  if(!executor.jobs.empty())executor.step();
 }
 check(!controller.busy(),"Controller did not settle deterministically");return last;
}
static Document diagonal(){std::vector<Pixel> pixels(25);pixels[0]=0x00112233;pixels[6]=pixels[12]=pixels[18]=0xffc06020;return Document::fromImage(5,5,pixels,U"AA");}


struct PresetExecutor {
 using Controller=PresetFilterPreviewController;
 std::deque<std::function<void()>> jobs;
 bool failSchedule=false,failWork=false;
 Controller::Launch launch(){return [this](std::function<Controller::Result()> work){
  if(failSchedule)throw std::runtime_error("preset scheduling failure");
  const bool fail=failWork;
  auto task=std::make_shared<std::packaged_task<Controller::Result()>>([work=std::move(work),fail]()mutable{if(fail)throw std::runtime_error("preset worker failure");return work();});
  auto future=task->get_future();jobs.push_back([task]{(*task)();});return future;
 };}
 void step(){check(!jobs.empty(),"Missing preset worker");auto work=std::move(jobs.front());jobs.pop_front();work();}
 void drain(Controller& controller,Document& document){for(int i=0;controller.busy()&&i<8;++i){if(!jobs.empty())step();controller.poll(document);}check(!controller.busy(),"Preset worker did not drain");}
};
static Document presetDocument(){return Document::fromImage(4,4,std::vector<Pixel>(16,0xffa05030),U"Preset");}
static const timeline::Layer& presetLayer(const timeline::Timeline& t,const std::string& id){return t.state().layers.at(t.layerIndex(id));}
template<class Controller> static void modalSessionOwner(){
 ManualExecutor executor;auto a=std::make_shared<Document>(diagonal()),b=std::make_shared<Document>(diagonal());const auto pixels=a->pixels();
 ColorPreviewSession<Controller> session(executor.executor());check(session.begin(a),"Typed modal begin");
 if constexpr(std::is_same_v<Controller,ConvolutionPreviewController>)session.controller.change(*a,true,now);
 else session.controller.change(*a,now);
 session.poll(*a,due);check(executor.jobs.size()==1,"Typed modal did not start snapshot worker");
 check(b->beginColorAdjustment(),"Unrelated modal fixture");
 check(session.poll(*b,due).state==FilterPreviewUpdate::Close&&!session.active()&&!a->colorAdjustmentActive()&&b->colorAdjustmentActive(),"Typed modal cleanup reached active document instead of owner");
 executor.step();check(session.poll(*a,due).state==FilterPreviewUpdate::None&&!a->canUndo()&&a->pixels()==pixels,"Typed modal late result after A-B-A");
 check(a->beginColorAdjustment(),"Typed modal end idempotence fixture");session.end();check(a->colorAdjustmentActive(),"Repeated modal end cancelled a newer transaction");a->cancelColorAdjustment();b->cancelColorAdjustment();
 check(session.begin(a),"Typed modal superseded begin");const auto originalPreview=a->colorAdjustmentSession();a->cancelColorAdjustment();check(a->beginColorAdjustment()&&a->colorAdjustmentSession()!=originalPreview,"Typed modal superseded fixture");
 check(session.poll(*a,due).state==FilterPreviewUpdate::Close&&a->colorAdjustmentActive(),"Typed modal cancelled a replacement preview on the same document");a->cancelColorAdjustment();
 {ColorPreviewSession<Controller> destroyed(executor.executor());check(destroyed.begin(a),"Typed modal destructor begin");}
 check(!a->colorAdjustmentActive(),"Typed modal destructor left its preview attached");
 {ColorPreviewSession<Controller> closed(executor.executor());auto temporary=std::make_shared<Document>(diagonal());std::weak_ptr<Document> weak=temporary;check(closed.begin(temporary),"Typed modal close begin");temporary.reset();check(weak.expired(),"Typed modal retained closed document");closed.end();}
}
static void gradientModalOwner(){
 ManualExecutor executor;auto a=std::make_shared<Document>(diagonal()),b=std::make_shared<Document>(diagonal());
 ColorPreviewSession<GradientMapPreviewController> session(executor.executor());session.bind(a);check(a->beginColorAdjustment(),"GM modal begin");session.adoptPreview();
 session.controller.request(*a,GradientMapSettings{},true,false,U"渐变映射");const auto future=PreviewClock::now()+std::chrono::seconds(1);session.poll(*a,future);
 check(b->beginColorAdjustment(),"GM foreign preview fixture");
 check(session.poll(*b,future).state==FilterPreviewUpdate::Close&&!a->colorAdjustmentActive()&&b->colorAdjustmentActive(),"GM modal cleanup owner");
 executor.step();check(session.poll(*a,future).state==FilterPreviewUpdate::None&&!a->canUndo(),"GM modal late completion");b->cancelColorAdjustment();
}
static void modalConvolutionApply(){
 ManualExecutor executor;auto document=std::make_shared<Document>(diagonal());ColorPreviewSession<ConvolutionPreviewController> session(executor.executor());
 check(session.begin(document),"Typed convolution Apply begin");const auto initial=document->colorAdjustmentSession();
 session.controller.options={"negative",{true,true,true,false},false};session.controller.apply(false,now);
 session.poll(*document,due);executor.step();const auto update=session.poll(*document,due);
 check(update.state==FilterPreviewUpdate::Changed&&document->historyPosition()==1&&document->colorAdjustmentActive()&&document->colorAdjustmentSession()!=initial,"Typed convolution Apply failed to adopt reopened baseline");
 session.end();check(!document->colorAdjustmentActive()&&document->historyPosition()==1,"Typed convolution end lost committed Apply or retained baseline");
}
static void presetControllers(){
 {PresetExecutor executor;auto a=presetDocument(),b=presetDocument();
  check(a.beginFilterPreview(),"Preset stale failure begin");PresetFilterPreviewController controller(a.identity(),executor.launch());
  executor.failWork=true;controller.preview(a,PresetFilterOptions{});controller.poll(b);executor.step();
  check(!controller.poll(a).changed&&!a.canUndo(),"Preset stale failure reached returned owner");
  executor.failWork=false;controller.apply(a,PresetFilterOptions{});executor.step();
  check(controller.poll(a).applied==true,"Preset stale failure prevented a fresh Apply");controller.end(a);
 }
 for(bool apply:{false,true}){PresetExecutor executor;auto a=presetDocument(),b=presetDocument();const auto pixels=a.pixels();
  check(a.beginFilterPreview(),"Preset roundtrip begin");PresetFilterPreviewController controller(a.identity(),executor.launch());
  controller.preview(a,PresetFilterOptions{});
  if(apply)controller.apply(a,PresetFilterOptions{});
  check(!controller.poll(b).changed,"Preset switch published to foreign owner");
  executor.step();controller.poll(a);
  check(executor.jobs.empty()&&!controller.busy()&&!controller.published()&&!a.canUndo()&&a.pixels()==pixels,"Preset A-B-A revived running or queued request");
  controller.end(a);
 }
 {PresetExecutor executor;auto document=presetDocument();const auto layers=document.timeline().state().layers.size();
  check(document.beginFilterPreview(),"Preset cleanup failure begin");PresetFilterPreviewController controller(document.identity(),executor.launch());
  controller.preview(document,PresetFilterOptions{});executor.drain(controller,document);
  check(document.displayTimeline().state().layers.size()==layers+1,"Preset cleanup preview fixture");
  executor.failWork=true;controller.apply(document,PresetFilterOptions{});executor.step();
  bool failed=false;try{controller.end(document);}catch(const std::runtime_error&){failed=true;}
  check(failed&&controller.finished()&&!controller.busy()&&document.displayTimeline().state().layers.size()==layers&&!document.canUndo(),"Preset worker exception skipped owner cleanup");
  controller.apply(document,PresetFilterOptions{});controller.preview(document,PresetFilterOptions{});
  check(executor.jobs.empty()&&!controller.busy(),"Finished preset controller accepted a new request");
 }
 {PresetExecutor executor;auto document=presetDocument();const auto original=document.pixels();const auto layers=document.timeline().state().layers.size();const auto history=document.historyPosition();const bool dirty=document.dirty();
  check(document.beginFilterPreview(),"Preset begin");PresetFilterPreviewController controller(document.identity(),executor.launch());
  controller.preview(document,PresetFilterOptions{FilterPreset::Vignette,.3});executor.drain(controller,document);
  check(controller.published()&&document.displayTimeline().state().layers.size()==layers+1&&document.historyPosition()==history&&document.dirty()==dirty,"Preset preview/history isolation");
  controller.preview(document,PresetFilterOptions{FilterPreset::CrtMedium,.72});executor.drain(controller,document);
  check(document.displayTimeline().state().layers.size()==layers+1&&document.timeline().state().layers.size()==layers,"Preset stacked layers");
  controller.preview(document,std::nullopt);check(document.displayTimeline().state().layers.size()==layers&&!controller.published(),"Preset preview off");
  controller.apply(document,PresetFilterOptions{FilterPreset::CrtSubtle,.4});executor.step();const auto applied=controller.poll(document);
  check(applied.applied==true&&controller.finished()&&document.timeline().state().layers.size()==layers+1&&document.historyPosition()==history+1,"Preset apply single history step");
  check(document.layer().opacity==.4,"Preset opacity lost");controller.end(document);
  document.undo();check(document.pixels()==original&&document.timeline().state().layers.size()==layers,"Preset Undo");document.redo();check(document.timeline().state().layers.size()==layers+1,"Preset Redo");
 }
 {PresetExecutor executor;auto document=presetDocument();check(document.beginFilterPreview(),"Preset latest begin");PresetFilterPreviewController controller(document.identity(),executor.launch());
  controller.preview(document,PresetFilterOptions{FilterPreset::Vignette,.3});controller.preview(document,PresetFilterOptions{FilterPreset::CrtMedium,.72});controller.preview(document,PresetFilterOptions{FilterPreset::PhosphorGlow,.24});
  check(executor.jobs.size()==1,"Preset extra simultaneous worker");executor.step();controller.poll(document);check(!controller.published()&&executor.jobs.size()==1,"Preset published stale request");executor.drain(controller,document);
  check(document.displayTimeline().state().layers.front().name==U"滤镜 · "+std::u32string(filterPresetDefinition(FilterPreset::PhosphorGlow).name)&&document.displayTimeline().state().layers.front().opacity==.24,"Preset latest request lost");controller.end(document);check(!document.canUndo(),"Preset cancel wrote history");
 }
 {PresetExecutor executor;auto document=presetDocument();const auto original=document.pixels();check(document.beginFilterPreview(),"Preset off begin");PresetFilterPreviewController controller(document.identity(),executor.launch());
  controller.preview(document,PresetFilterOptions{});controller.preview(document,std::nullopt);executor.drain(controller,document);
  check(!controller.published()&&document.displayPixels()==original&&!document.canUndo(),"Preset late completion after off");controller.end(document);
 }
 {PresetExecutor executor;auto document=presetDocument();check(document.beginFilterPreview(),"Preset apply over preview begin");PresetFilterPreviewController controller(document.identity(),executor.launch());
  controller.preview(document,PresetFilterOptions{FilterPreset::Vignette,.3});controller.apply(document,PresetFilterOptions{FilterPreset::CrtSubtle,.4});executor.step();controller.poll(document);executor.step();auto update=controller.poll(document);
  check(update.applied==true&&document.historyPosition()==1&&document.layer().opacity==.4,"Preset apply over pending preview");controller.end(document);
 }
 for(bool schedule:{true,false}){PresetExecutor executor;auto document=presetDocument();check(document.beginFilterPreview(),"Preset failure begin");PresetFilterPreviewController controller(document.identity(),executor.launch());
  executor.failSchedule=schedule;executor.failWork=!schedule;bool failed=false;
  try{controller.preview(document,PresetFilterOptions{});executor.step();controller.poll(document);}catch(const std::runtime_error&){failed=true;}
  check(failed&&!document.canUndo()&&document.timeline().state().layers.size()==1,"Preset failure mutated document");
  executor.failSchedule=executor.failWork=false;controller.apply(document,PresetFilterOptions{});executor.step();check(controller.poll(document).applied==true,"Preset failure retry");controller.end(document);
 }
 {PresetExecutor executor;auto a=presetDocument(),b=presetDocument();check(a.beginFilterPreview()&&b.beginFilterPreview(),"Preset identity begin");PresetFilterPreviewController controller(a.identity(),executor.launch());
  controller.preview(a,PresetFilterOptions{});executor.step();check(!controller.poll(b).changed&&!b.canUndo()&&b.displayTimeline().state().layers.size()==1,"Preset result reached other identity");controller.end(a);b.cancelFilterPreview();
 }
 {PresetExecutor executor;auto document=presetDocument();check(document.beginFilterPreview(),"Preset destructor begin");
  {PresetFilterPreviewController controller(document.identity(),executor.launch());controller.preview(document,PresetFilterOptions{});}
  document.cancelFilterPreview();executor.step();check(!document.canUndo()&&document.timeline().state().layers.size()==1,"Preset destruction late publish");
 }
 {PresetExecutor executor;auto document=presetDocument();const auto source=document.layer().id;document.selectTimelineLayer(source);check(document.beginFilterPreview(),"LCD begin");PresetFilterPreviewController controller(document.identity(),executor.launch());
  controller.preview(document,PresetFilterOptions{FilterPreset::CrtSubtle,1,true,2,1});executor.drain(controller,document);
  check(document.displayTimeline().state().groups.size()==1&&!presetLayer(document.displayTimeline(),source).visible&&presetLayer(document.timeline(),source).visible,"LCD preview visibility");
  controller.preview(document,PresetFilterOptions{FilterPreset::Vignette,.3});executor.drain(controller,document);
  check(document.displayTimeline().state().groups.empty()&&presetLayer(document.displayTimeline(),source).visible,"LCD replacement source restoration");
  controller.apply(document,PresetFilterOptions{FilterPreset::CrtSubtle,1,true,2,1});executor.step();check(controller.poll(document).applied==true&&document.timeline().state().groups.size()==1,"LCD commit");controller.end(document);
  document.undo();check(document.timeline().state().groups.empty()&&presetLayer(document.timeline(),source).visible,"LCD Undo visibility");document.redo();check(document.timeline().state().groups.size()==1&&!presetLayer(document.timeline(),source).visible,"LCD Redo visibility");
 }
}
int main(){try{
 modalSessionOwner<AntiAliasPreviewController>();modalSessionOwner<ConvolutionPreviewController>();gradientModalOwner();modalConvolutionApply();
 presetControllers();
 {ManualExecutor executor;AntiAliasPreviewController controller(executor.executor());auto document=diagonal();const auto original=document.pixels();const auto history=document.historyPosition();
  check(controller.begin(document),"AA begin");controller.change(document,now);
  check(controller.poll(document,now).state==FilterPreviewUpdate::None&&executor.jobs.empty(),"AA debounce");
  controller.poll(document,due);
  controller.options.opacity=80;controller.change(document,now);
  controller.options.opacity=35;controller.change(document,now);
  check(executor.jobs.size()==1,"AA preview created extra running worker");
  auto update=drain(controller,document,executor);
  check(update.problem==FilterPreviewUpdate::NoProblem&&document.pixels()==original&&document.displayPixels()!=original&&document.historyPosition()==history,"AA latest snapshot preview/history isolation");
  const auto expected=document.displayPixels();controller.apply(now);
  controller.options.opacity=90;controller.change(document,now);
  update=drain(controller,document,executor);
  check(update.state==FilterPreviewUpdate::Close&&document.pixels()==expected&&document.historyPosition()==history+1,"AA apply did not commit exactly one step");
  document.undo();check(document.pixels()==original,"AA Undo");document.redo();check(document.pixels()==expected,"AA Redo");
 }
 {ManualExecutor executor;AntiAliasPreviewController controller(executor.executor());auto document=diagonal();const auto original=document.pixels();
  check(controller.begin(document),"AA cancel begin");controller.change(document,now);controller.poll(document,due);controller.end();document.cancelColorAdjustment();
  executor.step();check(controller.poll(document,due).state==FilterPreviewUpdate::None&&document.pixels()==original&&!document.canUndo(),"AA late cancelled task changed document");
  check(controller.begin(document),"AA reopen after cancel");controller.change(document,now);executor.fail=true;
  auto update=controller.poll(document,due);check(update.problem==FilterPreviewUpdate::Failed&&!controller.committing(),"AA scheduling failure was hidden");
  executor.fail=false;controller.change(document,now);check(drain(controller,document,executor).problem==FilterPreviewUpdate::NoProblem,"AA failure recovery");controller.end();document.cancelColorAdjustment();
 }
 {ManualExecutor executor;ConvolutionPreviewController controller(executor.executor());auto document=Document::fromImage(3,1,{0xff140a1e,0xff140a3c,0xff140a78},U"convolution");const auto original=document.pixels();const auto history=document.historyPosition();
  check(controller.begin(document),"Convolution begin");controller.options={"negative",{true,true,true,false},false};controller.change(document,true,now);
  check(drain(controller,document,executor).problem==FilterPreviewUpdate::NoProblem&&document.pixels()==original&&document.displayPixels()!=original,"Convolution isolated preview");
  const auto expected=document.displayPixels();check(!controller.apply(false,now),"Convolution Apply closed form");
  check(drain(controller,document,executor).state==FilterPreviewUpdate::Changed&&document.pixels()==expected&&document.historyPosition()==history+1,"Convolution Apply single history step");
  check(controller.apply(true,now)&&!controller.busy()&&document.historyPosition()==history+1,"Done duplicated already-applied convolution");
  controller.end();document.cancelColorAdjustment();document.undo();check(document.pixels()==original,"Convolution Undo");document.redo();check(document.pixels()==expected,"Convolution Redo");
 }
 {ManualExecutor executor;GradientMapPreviewController controller(executor.executor());auto document=Document::fromImage(3,1,{0x00112233,0x3f806020,0xffffffff},U"GM");const auto original=document.pixels();const auto history=document.historyPosition();
  check(document.beginColorAdjustment(),"GM begin");GradientMapSettings options;
  controller.request(document,options,true,false,U"渐变映射");
  // Gradient-map requests have no debounce; an explicit future time is valid.
  const auto gmDue=PreviewClock::now()+std::chrono::seconds(1);
  controller.poll(document,gmDue);executor.step();auto update=controller.poll(document,gmDue);
  check(update.problem==FilterPreviewUpdate::NoProblem&&document.pixels()==original&&document.displayPixels()!=original&&(document.displayPixels()[1]>>24)==63&&document.displayPixels()[0]==original[0],"GM alpha/transparent RGB and preview isolation");
  const auto expected=document.displayPixels();controller.request(document,options,true,true,U"渐变映射");controller.poll(document,gmDue);executor.step();update=controller.poll(document,gmDue);
  check(update.state==FilterPreviewUpdate::Close&&document.pixels()==expected&&document.historyPosition()==history+1,"GM Apply single history step");
  document.undo();check(document.pixels()==original,"GM Undo");document.redo();check(document.pixels()==expected,"GM Redo");
 }
 {ManualExecutor executor;AntiAliasPreviewController controller(executor.executor());auto a=diagonal();auto b=diagonal();const auto before=b.pixels();
  check(controller.begin(a),"AA identity begin");controller.change(a,now);controller.poll(a,due);
  check(controller.poll(b,due).state==FilterPreviewUpdate::None,"A preview reached B");executor.step();check(controller.poll(a,due).state==FilterPreviewUpdate::None&&!a.canUndo()&&b.pixels()==before,"A return revived invalidated task");controller.end();a.cancelColorAdjustment();
 }
 {ManualExecutor executor;AntiAliasPreviewController controller(executor.executor());auto document=diagonal();const auto before=document.pixels();
  check(controller.begin(document),"AA stale-context begin");controller.change(document,now);controller.poll(document,due);
  document.previewSelection(SelectionMask{0,0,1,1,{}});executor.step();
  check(controller.poll(document,due).problem==FilterPreviewUpdate::Stale&&document.pixels()==before&&!document.canUndo(),"Controller bypassed Document selection-context validation");controller.end();document.cancelColorAdjustment();
 }
 {ManualExecutor executor;auto document=diagonal();const auto before=document.pixels();
  {AntiAliasPreviewController controller(executor.executor());check(controller.begin(document),"AA destruction begin");controller.change(document,now);controller.poll(document,due);}
  document.cancelColorAdjustment();executor.step();check(document.pixels()==before&&!document.canUndo(),"Destroyed controller published a late task");
 }
 std::cout<<"Four real Document preview controllers: latest/cancel/identity/failure/destruction, alpha, one-step Apply and Undo/Redo passed without UI\n";
 return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
