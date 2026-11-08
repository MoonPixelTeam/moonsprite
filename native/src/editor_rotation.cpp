#include "editor_implementation.h"
#include "editor.h"
#include <iomanip>
#include "latest_task_queue.h"
#include "layer_panel_storage.h"
#include <fstream>
#include <thread>
#include "ui/property.h"
namespace moon::editor {
namespace {
struct PanelMemory final:ui::Property {
 std::filesystem::path file;paneljson::JsonObject store;bool loaded=false,failed=false;std::string lastPath;std::optional<LayerPanelState> last;
 PanelMemory():ui::Property("moonsprite.panel-memory"){}
 bool load(const std::filesystem::path& path){
  if(loaded)return !failed;loaded=true;file=path;
  try{if(std::filesystem::exists(file)){std::ifstream in(file,std::ios::binary);if(!in)throw std::runtime_error("Cannot read layer-panel state");store=paneljson::JsonObject::Parse(winrt::to_hstring(std::string(std::istreambuf_iterator<char>(in),{})));}return true;}catch(const winrt::hresult_error& e){failed=true;throw std::runtime_error("Cannot parse local layer-panel state; HRESULT="+std::to_string(e.code().value));}catch(...){failed=true;throw;}
 }
};
struct ViewWrite {std::filesystem::path path;std::string text;};
// One ordered queue per document, reusing the legacy latest-task adapter.
// Workers receive only immutable bytes and paths, never an Editor pointer.
struct ViewWrites final:ui::Property {
 struct Writer {
   using Runner=LatestTaskQueue<ViewWrite>::Runner;
   static std::future<void> run(std::shared_ptr<const ViewWrite> value){return std::async(std::launch::async,[value]{std::filesystem::create_directories(value->path.parent_path());writeExportBytesAtomic(value->path,{value->text.begin(),value->text.end()});});}
   LatestTaskQueue<ViewWrite> queue;
   explicit Writer(Runner runner=run):queue(std::move(runner),[]{}){}
   std::vector<LatestTaskQueue<ViewWrite>::Acknowledgement> acknowledgements;
 };
 std::map<std::filesystem::path,std::unique_ptr<Writer>> writers;
 ui::Timer timer;std::function<void(const std::string&)> error;
 ViewWrites(ui::Widget* owner,std::function<void(const std::string&)> failure):ui::Property("moonsprite.view-writes"),timer(16,owner),error(std::move(failure)){timer.Tick.connect([this]{poll(false);});}
 void poll(bool wait){
   for(auto it=writers.begin();it!=writers.end();){auto& w=*it->second;if(wait)w.queue.waitIdle();else w.queue.poll();
     for(auto a=w.acknowledgements.begin();a!=w.acknowledgements.end();){if((*a)->wait_for(std::chrono::seconds(0))!=std::future_status::ready){++a;continue;}try{(*a)->get();}catch(const std::exception& e){if(error)error(e.what());}a=w.acknowledgements.erase(a);}
     if(!w.queue.busy())it=writers.erase(it);else ++it;
   }
   if(writers.empty())timer.stop();
 }
 void enqueue(ViewWrite value){poll(false);auto& writer=writers[value.path];if(!writer)writer=std::make_unique<Writer>();
   // Compare the last scheduled state, not merely the running one: A/B/A
   // must replace pending B even when A is still being written.
   const auto pending=writer->queue.pendingValue();
   const auto latest=pending?pending:writer->queue.runningValue();
   if(latest && latest->text==value.text)return;
   auto ack=writer->queue.enqueue(std::make_shared<const ViewWrite>(std::move(value)));if(writer->acknowledgements.empty()||writer->acknowledgements.back()!=ack)writer->acknowledgements.push_back(ack);timer.start();}
 ~ViewWrites(){timer.stop();error={};poll(true);}
};
}
static SkinPatch rotationIndicatorPatch(const std::filesystem::path& path){static std::map<std::filesystem::path,SkinPatch> cache;auto it=cache.find(path);if(it==cache.end())it=cache.emplace(path,importSkinPng(path,256)).first;return it->second;}
static os::SurfaceRef skinPatchSurface(const SkinPatch& patch){static std::map<std::shared_ptr<const SkinBitmap>,os::SurfaceRef> cache;auto& surface=cache[patch.bitmap];if(!surface){const auto& b=*patch.bitmap;surface=os::instance()->makeRgbaSurface(b.width,b.height);os::SurfaceLock lock(surface.get());for(int y=0;y<b.height;++y)for(int x=0;x<b.width;++x){const auto p=b.pixels[y*b.width+x];surface->putPixel(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),x,y);}}return surface;}

view::Point Editor::canvasRotationPivot()const{if(runtimePreferences_.index("editing.rotationIndicatorPosition.Select")==1)return {canvas_.x+canvas_.w/2.,canvas_.y+canvas_.h/2.};const auto r=canvasViewport();return {r.x+r.w/2.,r.y+r.h/2.};}
TransformPoint Editor::canvasDocumentPoint(gfx::Point p)const{const auto q=viewRotation_.inverse({double(p.x),double(p.y)},canvasRotationPivot());return {(q.x-canvas_.x)/canvasScale(),(q.y-canvas_.y)/canvasScale()};}
gfx::Point Editor::canvasDocumentToDisplay(TransformPoint p)const{const auto q=viewRotation_.forward({canvas_.x+p.x*canvasScale(),canvas_.y+p.y*canvasScale()},canvasRotationPivot());return {int(std::lround(q.x)),int(std::lround(q.y))};}
gfx::Point Editor::canvasUnrotatedDisplay(gfx::Point p)const{const auto q=viewRotation_.inverse({double(p.x),double(p.y)},canvasRotationPivot());return {int(std::floor(q.x)),int(std::floor(q.y))};}
bool Editor::canvasDocumentContains(gfx::Point p)const{const auto q=canvasDocumentPoint(p);return q.x>=0&&q.y>=0&&q.x<document.width()&&q.y<document.height();}
gfx::Matrix Editor::canvasRotationMatrix()const{const auto origin=bounds().origin();const auto pivot=canvasRotationPivot();const view::Point local{pivot.x-origin.x,pivot.y-origin.y};const auto o=viewRotation_.forward({0,0},local),x=viewRotation_.forward({1,0},local),y=viewRotation_.forward({0,1},local);return gfx::Matrix::MakeAll(float(x.x-o.x),float(y.x-o.x),float(o.x),float(x.y-o.y),float(y.y-o.y),float(o.y),0,0,1);}
void Editor::setViewRotation(double degrees){if(!std::isfinite(degrees))return;viewRotation_.degrees=view::Rotation::normalize(degrees);constrainCanvas();saveDocumentView();refresh();}
void Editor::initializeViewRotation(){
 auto available=[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy();};
 menuCommands_.bind("rotateViewClockwise90",{[this]{setViewRotation(viewRotation_.degrees+90);},available,{}});menuCommands_.bind("rotateViewCounterClockwise90",{[this]{setViewRotation(viewRotation_.degrees+270);},available,{}});
 menuCommands_.bind("mirrorView",{[this]{viewRotation_.mirrorX=!viewRotation_.mirrorX;saveDocumentView();refresh();},available,[this]{return viewRotation_.mirrorX;}});menuCommands_.bind("mirrorViewVertical",{[this]{viewRotation_.mirrorY=!viewRotation_.mirrorY;saveDocumentView();refresh();},available,[this]{return viewRotation_.mirrorY;}});
 menuCommands_.bind("resetView",{[this]{viewRotation_={};zoom_=16;const auto r=canvasViewport();canvas_={r.x+(r.w-int(document.width()*canvasScale()))/2,r.y+(r.h-int(document.height()*canvasScale()))/2,int(document.width()*canvasScale()),int(document.height()*canvasScale())};saveDocumentView();refresh();},available,{}});
}
void Editor::saveLayerPanelState(bool flush){
 const auto testRoot=smoke_?_wgetenv(L"MOONSPRITE_PANEL_STATE_TEST_ROOT"):nullptr;if(smoke_&&!testRoot)return;
 try{
  auto writes=std::dynamic_pointer_cast<ViewWrites>(getProperty("moonsprite.view-writes"));
  if(documentOpen_){
   const auto path=documentPath_.empty()?document.sourceFilePath():documentPath_;
   if(!path.empty()){
    auto memory=std::dynamic_pointer_cast<PanelMemory>(getProperty("moonsprite.panel-memory"));if(!memory){memory=std::make_shared<PanelMemory>();setProperty(memory);}
    if(!memory->loaded&&writes)writes->poll(true);
    if(!memory->load((testRoot?std::filesystem::path(testRoot):palettePreferencePath().parent_path())/"layer-panel-state-v1.json"))return;
    const auto state=document.layerPanelState();const auto key=paneljson::pathKey(path.u8string());
    if(!memory->last||memory->lastPath!=key||*memory->last!=state){
     paneljson::remember(memory->store,path.u8string(),state,double(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count()));
     if(!writes){writes=std::make_shared<ViewWrites>(this,[this](const std::string& message){status_=U"本地面板状态保存失败："+unicodeText(message);invalidateRect(statusBounds());});setProperty(writes);}
     writes->enqueue({memory->file,winrt::to_string(memory->store.Stringify())});memory->lastPath=key;memory->last=state;
    }
   }
  }
  if(flush&&writes)writes->poll(true);
 }catch(const std::exception& e){status_=U"本地面板状态保存失败："+unicodeText(e.what());}
}
void Editor::loadLayerPanelState(){
 const auto testRoot=smoke_?_wgetenv(L"MOONSPRITE_PANEL_STATE_TEST_ROOT"):nullptr;if(smoke_&&!testRoot)return;const auto path=documentPath_.empty()?document.sourceFilePath():documentPath_;if(path.empty())return;
 try{
  auto memory=std::dynamic_pointer_cast<PanelMemory>(getProperty("moonsprite.panel-memory"));if(!memory){memory=std::make_shared<PanelMemory>();setProperty(memory);}
  if(!memory->loaded)if(auto writes=std::dynamic_pointer_cast<ViewWrites>(getProperty("moonsprite.view-writes")))writes->poll(true);
  if(!memory->load((testRoot?std::filesystem::path(testRoot):palettePreferencePath().parent_path())/"layer-panel-state-v1.json"))return;
  if(const auto state=paneljson::storedState(memory->store,path.u8string()))document.applyLayerPanelState(paneljson::decode(state,document.layer().id));
  memory->lastPath=paneljson::pathKey(path.u8string());memory->last=document.layerPanelState();
 }catch(const std::exception& e){status_=U"本地面板状态读取失败："+unicodeText(e.what());}
}
void Editor::saveDocumentView(){
 // Explicit smoke-only storage root exercises the real durable writer without
 // touching the user's preferences. Normal smoke runs still skip persistence.
 const auto testRoot=smoke_?_wgetenv(L"MOONSPRITE_VIEW_SAVE_TEST_ROOT"):nullptr;
 if((smoke_&&!testRoot)||!documentOpen_)return;
 struct SaveProfile {
   std::filesystem::path path;std::uint64_t calls=0;double total=0,maximum=0;
   SaveProfile(){if(const auto value=_wgetenv(L"MOONSPRITE_INTERACTION_PROFILE")){path=value;path+=L".view-save.tsv";}}
   ~SaveProfile(){if(path.empty())return;try{std::ofstream out(path);out<<"calls\ttotal_ms\tmax_ms\n"<<calls<<'\t'<<total<<'\t'<<maximum<<'\n';}catch(...){}}
 };
 static SaveProfile profile;
 struct SaveScope {
   std::chrono::steady_clock::time_point start;bool enabled=!profile.path.empty();
   SaveScope(){if(enabled)start=std::chrono::steady_clock::now();}
   ~SaveScope(){if(enabled){const auto ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();++profile.calls;profile.total+=ms;profile.maximum=std::max(profile.maximum,ms);}}
 } scope;
 try{const auto root=testRoot?std::filesystem::path(testRoot):palettePreferencePath().parent_path()/"document-view-v1";const auto identity=documentPath_.empty()?std::string("session-")+std::to_string(document.identity()):documentPath_.u8string();std::uint64_t hash=1469598103934665603ULL;for(unsigned char c:identity){hash^=c;hash*=1099511628211ULL;}std::ostringstream name;name<<std::hex<<hash<<".txt";const auto r=canvasViewport();std::ostringstream out;out<<std::setprecision(17)<<"view-v1 "<<zoom_<<' '<<(canvas_.x+canvas_.w/2.-r.center().x)/uiScale<<' '<<(canvas_.y+canvas_.h/2.-r.center().y)/uiScale<<' '<<viewRotation_.degrees<<' '<<viewRotation_.mirrorX<<' '<<viewRotation_.mirrorY<<'\n';const auto text=out.str();
 static const bool synchronous=std::getenv("MOONSPRITE_VIEW_SAVE_SYNC_REFERENCE")!=nullptr;
 if(synchronous){std::filesystem::create_directories(root);writeExportBytesAtomic(root/name.str(),{text.begin(),text.end()});}
 else{auto writes=std::dynamic_pointer_cast<ViewWrites>(getProperty("moonsprite.view-writes"));if(!writes){writes=std::make_shared<ViewWrites>(this,[this](const std::string& message){status_=U"文档视图保存失败："+unicodeText(message);invalidateRect(statusBounds());});setProperty(writes);}writes->enqueue({root/name.str(),text});}}catch(const std::exception& e){status_=U"文档视图保存失败："+unicodeText(e.what());}}
void Editor::loadDocumentView(){if(smoke_||documentPath_.empty())return;if(auto writes=std::dynamic_pointer_cast<ViewWrites>(getProperty("moonsprite.view-writes")))writes->poll(true);try{std::uint64_t hash=1469598103934665603ULL;for(unsigned char c:documentPath_.u8string()){hash^=c;hash*=1099511628211ULL;}std::ostringstream name;name<<std::hex<<hash<<".txt";const auto file=palettePreferencePath().parent_path()/"document-view-v1"/name.str();if(!std::filesystem::exists(file))return;std::ifstream in(file);std::string version;double zoom,x,y,angle;int mx,my;if(!(in>>version>>zoom>>x>>y>>angle>>mx>>my)||version!="view-v1"||!std::isfinite(zoom)||!std::isfinite(x)||!std::isfinite(y)||!std::isfinite(angle)||zoom<.0625||zoom>64||(mx!=0&&mx!=1)||(my!=0&&my!=1))throw std::runtime_error("Invalid stored view");zoom_=zoom;viewRotation_={view::Rotation::normalize(angle),mx!=0,my!=0};const auto r=canvasViewport();canvas_={int(std::lround(r.center().x+x*uiScale-document.width()*canvasScale()/2)),int(std::lround(r.center().y+y*uiScale-document.height()*canvasScale()/2)),int(std::lround(document.width()*canvasScale())),int(std::lround(document.height()*canvasScale()))};constrainCanvas();}catch(const std::exception& e){status_=U"文档视图读取失败："+unicodeText(e.what());}}
bool Editor::processViewRotation(ui::Message* msg){
 if(rotationDragging_){if(msg->type()==ui::kFocusLeaveMessage||!hasCapture()||(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)){viewRotation_.degrees=rotationStart_;canvas_=rotationCanvas_;rotationDragging_=false;if(hasCapture())releaseMouse();refresh();return true;}
 if(auto m=dynamic_cast<ui::MouseMessage*>(msg);m&&(msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseUpMessage)){const auto p=m->position();double next=rotationStart_+(std::atan2(p.y-rotationPivot_.y,p.x-rotationPivot_.x)*180/3.14159265358979323846)-rotationAngle_;if(moveModifierHeld("snapViewRotation",*msg))next=view::Rotation::snap(next);if(moveModifierHeld("resetViewRotation",*msg))next=0;canvas_=rotationCanvas_;viewRotation_.degrees=rotationStart_;const auto before=viewRotation_.inverse(rotationPivot_,canvasRotationPivot());viewRotation_.degrees=view::Rotation::normalize(next);if(runtimePreferences_.index("editing.rotationIndicatorPosition.Select")!=1){const auto after=viewRotation_.inverse(rotationPivot_,canvasRotationPivot());canvas_.x+=int(std::lround(after.x-before.x));canvas_.y+=int(std::lround(after.y-before.y));}constrainCanvas();if(msg->type()==ui::kMouseUpMessage){rotationDragging_=false;if(hasCapture())releaseMouse();saveDocumentView();}refresh();return true;}return true;}
 if(!rotateTool_)return false;if(shortcutInputBlocked())return false;auto m=dynamic_cast<ui::MouseMessage*>(msg);if(!m)return false;if(m->middle()||spaceHeld_)return false;if(!canvasViewport().contains(m->position())||!canvasOwnsPointer(m->position()))return false;
 if(msg->type()==ui::kMouseDownMessage&&m->left()){if(historyGestureBusy())return true;const auto r=canvasViewport();const auto pointer=m->position();const int mode=runtimePreferences_.index("editing.rotationIndicatorPosition.Select");rotationPivot_=canvasRotationPivot();auto clamp=[](double n,int start,int size,int half){return size<=half*2?start+size/2.:std::clamp(n,double(start+half),double(start+size-half));};if(mode==0){const auto center=canvasDocumentToDisplay({document.width()/2.,document.height()/2.});rotationPivot_={clamp((pointer.x+center.x)/2.,r.x,r.w,64*uiScale),clamp((pointer.y+center.y)/2.,r.y,r.h,96*uiScale)};}else if(mode==2)rotationPivot_={clamp(pointer.x-160*uiScale,r.x,r.w,64*uiScale),clamp(pointer.y,r.y,r.h,96*uiScale)};rotationStart_=viewRotation_.degrees;rotationCanvas_=canvas_;rotationAngle_=std::atan2(pointer.y-rotationPivot_.y,pointer.x-rotationPivot_.x)*180/3.14159265358979323846;rotationDragging_=true;captureMouse();requestFocus();refresh();}return true;
}
gfx::Rect Editor::canvasPaintViewport(gfx::Rect r)const{if(!viewRotation_.active())return r;double l=1e20,t=1e20,right=-1e20,bottom=-1e20;const auto origin=bounds().origin();for(auto p:{r.origin(),gfx::Point(r.x2(),r.y),gfx::Point(r.x,r.y2()),gfx::Point(r.x2(),r.y2())}){const auto q=viewRotation_.inverse({double(p.x+origin.x),double(p.y+origin.y)},canvasRotationPivot());l=std::min(l,q.x-origin.x);t=std::min(t,q.y-origin.y);right=std::max(right,q.x-origin.x);bottom=std::max(bottom,q.y-origin.y);}return {int(std::floor(l)),int(std::floor(t)),int(std::ceil(right)-std::floor(l)),int(std::ceil(bottom)-std::floor(t))};}
gfx::Rect Editor::canvasDisplayBounds()const{const auto center=canvasDocumentToDisplay({document.width()/2.,document.height()/2.});const double a=viewRotation_.degrees*3.14159265358979323846/180;const int w=int(std::ceil(std::abs(std::cos(a))*canvas_.w+std::abs(std::sin(a))*canvas_.h)),h=int(std::ceil(std::abs(std::sin(a))*canvas_.w+std::abs(std::cos(a))*canvas_.h));return {center.x-w/2,center.y-h/2,w,h};}
void Editor::panCanvasDisplay(double x,double y){const auto d=runtimePreferences_.index("editing.rotationIndicatorPosition.Select")==1?view::Point{x,y}:viewRotation_.inverse({x,y},{0,0});canvas_.x+=int(std::lround(d.x));canvas_.y+=int(std::lround(d.y));}
void Editor::paintViewRotationIndicator(ui::Graphics& g){if(!rotationDragging_)return;const auto origin=bounds().origin();const auto pivot=rotationPivot_;const int x=int(std::lround(pivot.x-origin.x-61.5*uiScale)),y=int(std::lround(pivot.y-origin.y-97.5*uiScale));for(int i=0;i<6;++i){const auto patch=rotationIndicatorPatch(assets_/"rotation-indicator"/("background-"+std::to_string(i+1)+".png"));const auto surface=skinPatchSurface(patch);g.drawSurface(surface.get(),{0,0,surface->width(),surface->height()},{x+(i%2)*64*uiScale,y+(i/2)*64*uiScale,64*uiScale,64*uiScale},os::Sampling(),nullptr);}
 const auto patch=rotationIndicatorPatch(assets_/"rotation-indicator"/"pointer.png");const auto surface=skinPatchSurface(patch);view::Rotation rotation{viewRotation_.degrees,false,false};const view::Point local{pivot.x-origin.x,pivot.y-origin.y};const auto o=rotation.forward({0,0},local),u=rotation.forward({1,0},local),v=rotation.forward({0,1},local);g.save();g.concat(gfx::Matrix::MakeAll(float(u.x-o.x),float(v.x-o.x),float(o.x),float(u.y-o.y),float(v.y-o.y),float(o.y),0,0,1));g.drawSurface(surface.get(),{0,0,surface->width(),surface->height()},{x+32*uiScale,y,64*uiScale,192*uiScale},os::Sampling(),nullptr);g.restore();}
void Editor::smokeViewRotation(){
 if(const auto root=_wgetenv(L"MOONSPRITE_VIEW_SAVE_TEST_ROOT")){
   const auto directory=std::filesystem::path(root);std::filesystem::create_directories(directory);
   // Gate the first worker so duplicate and A/B/A order checks are independent
   // of disk speed. Release before checking/throwing to keep teardown finite.
   {
     std::promise<void> release;const auto gate=release.get_future().share();
     std::vector<std::string> seen;
     ViewWrites ordered(this,{});const auto path=directory/"queue-ordered.txt";
     auto writer=std::make_unique<ViewWrites::Writer>([&](auto value){seen.push_back(value->text);return std::async(std::launch::async,[gate]{gate.wait();});});
     auto* state=writer.get();writer->acknowledgements.push_back(writer->queue.enqueue(std::make_shared<const ViewWrite>(ViewWrite{path,"A"})));ordered.writers.emplace(path,std::move(writer));
     ordered.enqueue({path,"A"});ordered.enqueue({path,"A"});
     const bool duplicateActive=!state->queue.pendingValue();
     ordered.enqueue({path,"B"});const auto pending=state->queue.pendingValue();
     ordered.enqueue({path,"B"});const bool duplicatePending=state->queue.pendingValue()==pending;
     ordered.enqueue({path,"A"});const bool latestWins=state->queue.pendingValue()&&state->queue.pendingValue()->text=="A";
     release.set_value();ordered.poll(true);
     if(!duplicateActive||!duplicatePending||!latestWins||seen!=std::vector<std::string>{"A","A"})throw std::runtime_error("View duplicate suppression changed latest state ordering");
   }
   // Reload a fresh cache while an immutable local-state generation is still
   // owned by the worker. A delayed worker deterministically exposes stale reads.
   {
    const auto oldSmoke=smoke_,oldOpen=documentOpen_;const auto oldPath=documentPath_;auto oldDocument=std::move(document);
    struct Restore {Editor& editor;Document& saved;bool smoke,open;std::filesystem::path path;std::wstring environment;bool hadEnvironment=false;
     Restore(Editor& e,Document& d,bool s,bool o,std::filesystem::path p):editor(e),saved(d),smoke(s),open(o),path(std::move(p)){if(const auto value=_wgetenv(L"MOONSPRITE_PANEL_STATE_TEST_ROOT")){environment=value;hadEnvironment=true;}}
     ~Restore(){editor.removeProperty("moonsprite.panel-memory");editor.removeProperty("moonsprite.view-writes");editor.document=std::move(saved);editor.documentPath_=path;editor.smoke_=smoke;editor.documentOpen_=open;_wputenv_s(L"MOONSPRITE_PANEL_STATE_TEST_ROOT",hadEnvironment?environment.c_str():L"");}
    } restore(*this,oldDocument,oldSmoke,oldOpen,oldPath);
    smoke_=true;documentOpen_=true;document=Document(4,2);document.addLayer();document.createLayerGroup();const auto group=document.timeline().state().groups.front().id;documentPath_=directory/"reload.moonsprite";
    const auto root=directory/"reload-preferences";std::filesystem::create_directories(root);_wputenv_s(L"MOONSPRITE_PANEL_STATE_TEST_ROOT",root.c_str());
    removeProperty("moonsprite.panel-memory");removeProperty("moonsprite.view-writes");saveLayerPanelState(true);const auto file=root/"layer-panel-state-v1.json";
    document.toggleGroupCollapsed(group);const auto expected=document.layerPanelState();
    auto memory=std::dynamic_pointer_cast<PanelMemory>(getProperty("moonsprite.panel-memory"));paneljson::remember(memory->store,documentPath_.u8string(),expected,1);const auto text=winrt::to_string(memory->store.Stringify());
    auto pending=std::make_shared<std::promise<void>>();auto gate=pending->get_future().share();auto writes=std::make_shared<ViewWrites>(this,[&](const std::string& message){throw std::runtime_error(message);});
    auto writer=std::make_unique<ViewWrites::Writer>([gate](auto value){return std::async(std::launch::async,[gate,value]{gate.wait();writeExportBytesAtomic(value->path,{value->text.begin(),value->text.end()});});});
    writer->acknowledgements.push_back(writer->queue.enqueue(std::make_shared<const ViewWrite>(ViewWrite{file,text})));writes->writers.emplace(file,std::move(writer));setProperty(writes);removeProperty("moonsprite.panel-memory");document.toggleGroupCollapsed(group);
    auto release=std::async(std::launch::async,[pending]{std::this_thread::sleep_for(std::chrono::milliseconds(40));pending->set_value();});
    loadLayerPanelState();release.get();if(document.layerPanelState()!=expected)throw std::runtime_error("Local panel reload raced pending immutable write");
    // Save's fresh-cache read must see the prior generation's new project too;
    // otherwise the second writer silently removes that entry when it commits.
    auto staged=std::dynamic_pointer_cast<PanelMemory>(getProperty("moonsprite.panel-memory"))->store;
    const auto background=directory/"background.moonsprite";paneljson::remember(staged,background.u8string(),expected,2);const auto stagedText=winrt::to_string(staged.Stringify());
    auto pendingSave=std::make_shared<std::promise<void>>();auto saveGate=pendingSave->get_future().share();
    auto heldWriter=std::make_unique<ViewWrites::Writer>([saveGate](auto value){return std::async(std::launch::async,[saveGate,value]{saveGate.wait();writeExportBytesAtomic(value->path,{value->text.begin(),value->text.end()});});});
    heldWriter->acknowledgements.push_back(heldWriter->queue.enqueue(std::make_shared<const ViewWrite>(ViewWrite{file,stagedText})));writes->writers.emplace(file,std::move(heldWriter));
    documentPath_=directory/"second-reload.moonsprite";removeProperty("moonsprite.panel-memory");
    auto releaseSave=std::async(std::launch::async,[pendingSave]{std::this_thread::sleep_for(std::chrono::milliseconds(40));pendingSave->set_value();});saveLayerPanelState(true);releaseSave.get();
    std::ifstream in(file,std::ios::binary);const auto stored=paneljson::JsonObject::Parse(winrt::to_hstring(std::string(std::istreambuf_iterator<char>(in),{})));
    if(!paneljson::storedState(stored,(directory/"reload.moonsprite").u8string())||!paneljson::storedState(stored,background.u8string())||!paneljson::storedState(stored,documentPath_.u8string()))throw std::runtime_error("Fresh panel writer dropped another document entry");
   }
   int errors=0;ViewWrites writes(this,[&](const std::string&){++errors;});
   const auto first=directory/"queue-first.txt",second=directory/"queue-second.txt";
   for(int i=0;i<40;++i){writes.enqueue({first,std::to_string(i)});writes.enqueue({second,"second-"+std::to_string(i)});}
   writes.poll(true);
   auto read=[](const auto& path){std::ifstream in(path);return std::string(std::istreambuf_iterator<char>(in),{});};
   if(read(first)!="39"||read(second)!="second-39"||errors)throw std::runtime_error("View queue final state/document isolation failed");
   const auto blocker=directory/"queue-blocker.txt";{std::ofstream out(blocker);out<<"file";}
   writes.enqueue({blocker/"impossible.txt","failure"});writes.poll(true);
   if(errors!=1)throw std::runtime_error("View queue failure was not delivered");
   writes.enqueue({first,"recovered"});writes.poll(true);
   if(read(first)!="recovered")throw std::runtime_error("View queue failed after write error");
   {ViewWrites closing(this,{});closing.enqueue({second,"closed-final"});}
   if(read(second)!="closed-final")throw std::runtime_error("View queue close did not flush final state");
 }
auto check=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;document=Document(64,48);zoom_=4;refresh();const auto pixels=document.pixels();const auto history=document.historySize();for(double angle:{0.,22.5,90.,180.,270.,337.5})for(bool mx:{false,true})for(bool my:{false,true}){viewRotation_={angle,mx,my};for(auto p:{TransformPoint{3.25,5.25},TransformPoint{32.25,24.25},TransformPoint{60.25,44.25}}){const auto q=canvasDocumentPoint(canvasDocumentToDisplay(p));check(std::abs(q.x-p.x)<=.13&&std::abs(q.y-p.y)<=.13,"View coordinate roundtrip");}const auto anchor=canvasDocumentToDisplay({30.25,22.25});const auto before=canvasDocumentPoint(anchor);setCanvasZoom(anchor,zoom_==4?5:4);const auto after=canvasDocumentPoint(anchor);check(std::abs(before.x-after.x)<.4&&std::abs(before.y-after.y)<.4,"Rotated anchor zoom");}viewRotation_={33,true,false};refresh();rotateTool_=true;const auto at=canvasViewport().center()+gfx::Point(80,30);ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at);processViewRotation(&down);check(rotationDragging_&&hasCapture(),"Rotation drag capture");ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyShiftModifier,at+gfx::Point(25,60));processViewRotation(&move);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);processViewRotation(&escape);check(!rotationDragging_&&!hasCapture()&&viewRotation_.degrees==33,"Rotation Escape restore");check(document.pixels()==pixels&&document.historySize()==history,"View rotation changed document");refresh();invalidate();manager()->flushRedraw();manager()->dispatchMessages();writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"view-rotation-smoke.bmp");viewRotation_={};rotateTool_=false;document=Document();refresh();}

}
