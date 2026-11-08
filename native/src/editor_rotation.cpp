#include "editor_implementation.h"
#include "editor.h"
#include <iomanip>
#include "latest_task_queue.h"
#include "layer_panel_storage.h"
#include <fstream>
#include <thread>
#include "ui/property.h"
namespace moon::editor {
std::pair<std::uint64_t,std::uint64_t> eyedropperLensWorkCounts(const ui::Widget&);
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
bool Editor::canvasDocumentContains(gfx::Point p)const{const auto q=canvasDocumentPoint(p);if(tileRepeatIdentity_==document.identity()&&tileRepeat_!=repeat::Mode::Off)return bool(repeat::map({q.x,q.y},document.width(),document.height(),tileRepeat_));return q.x>=0&&q.y>=0&&q.x<document.width()&&q.y<document.height();}
gfx::Matrix Editor::canvasRotationMatrix()const{const auto origin=bounds().origin();const auto pivot=canvasRotationPivot();const view::Point local{pivot.x-origin.x,pivot.y-origin.y};const auto o=viewRotation_.forward({0,0},local),x=viewRotation_.forward({1,0},local),y=viewRotation_.forward({0,1},local);return gfx::Matrix::MakeAll(float(x.x-o.x),float(y.x-o.x),float(o.x),float(x.y-o.y),float(y.y-o.y),float(o.y),0,0,1);}
void Editor::setViewRotation(double degrees){if(!std::isfinite(degrees))return;viewRotation_.degrees=view::Rotation::normalize(degrees);constrainCanvas();saveDocumentView();refresh();}
void Editor::setTileRepeat(repeat::Mode mode){
 tileRepeat_=mode;tileRepeatIdentity_=document.identity();
 if(mode!=repeat::Mode::Off){const auto r=canvasViewport();zoom_=repeat::fit(double(r.w)/uiScale,double(r.h)/uiScale,document.width(),document.height(),mode,viewRotation_.degrees);const int w=int(std::lround(document.width()*canvasScale())),h=int(std::lround(document.height()*canvasScale()));canvas_={r.x+(r.w-w)/2,r.y+(r.h-h)/2,w,h};}
 layoutCanvasScrollBars();invalidateRect(canvasViewport());refresh();
}
void Editor::initializeViewRotation(){
 auto available=[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy();};
 for(const auto& entry:std::vector<std::pair<std::string,repeat::Mode>>{{"tileRepeatOff",repeat::Mode::Off},{"tileRepeatX",repeat::Mode::X},{"tileRepeatY",repeat::Mode::Y},{"tileRepeatBoth",repeat::Mode::Both}}){const auto mode=entry.second;menuCommands_.bind(entry.first,{[this,mode]{setTileRepeat(mode);},available,[this,mode]{return (tileRepeatIdentity_==document.identity()?tileRepeat_:repeat::Mode::Off)==mode;}});}

 menuCommands_.bind("rotateViewClockwise90",{[this]{setViewRotation(viewRotation_.degrees+90);},available,{}});menuCommands_.bind("rotateViewCounterClockwise90",{[this]{setViewRotation(viewRotation_.degrees+270);},available,{}});
 menuCommands_.bind("mirrorView",{[this]{viewRotation_.mirrorX=!viewRotation_.mirrorX;saveDocumentView();refresh();},available,[this]{return viewRotation_.mirrorX;}});menuCommands_.bind("mirrorViewVertical",{[this]{viewRotation_.mirrorY=!viewRotation_.mirrorY;saveDocumentView();refresh();},available,[this]{return viewRotation_.mirrorY;}});
 menuCommands_.bind("resetView",{[this]{viewRotation_={};zoom_=16;const auto r=canvasViewport();canvas_={r.x+(r.w-int(document.width()*canvasScale()))/2,r.y+(r.h-int(document.height()*canvasScale()))/2,int(document.width()*canvasScale()),int(document.height()*canvasScale())};saveDocumentView();refresh();},available,{}});
}
void Editor::smokeTileRepeat(){
 smoke_=true;documentOpen_=true;homeOpen_=false;pending_=Pending::None;playing_=false;viewRotation_={};
 document=Document(6,4);document.fillSelectionOrCanvas(0xff3366aa);document.beginStroke({0,0},0xff112233);document.commitStroke();document.markSaved();fitCanvas();refresh();ensureContentCache();
 const auto pixels=document.pixels();const auto revision=document.revision(),history=document.historySize();const auto uploads=renderer_.uploads();
 for(const auto entry:std::vector<std::pair<std::string,repeat::Mode>>{{"tileRepeatX",repeat::Mode::X},{"tileRepeatY",repeat::Mode::Y},{"tileRepeatBoth",repeat::Mode::Both}}){
  if(!shortcutSupported(entry.first)||!menuCommands_.invoke(entry.first)||tileRepeat_!=entry.second||!menuCommands_.checked(entry.first))throw std::runtime_error("Repeat menu/shortcut/state");
  const auto viewport=canvasViewport();const double expected=repeat::fit(double(viewport.w)/uiScale,double(viewport.h)/uiScale,6,4,entry.second,0);if(std::abs(zoom_-expected)>1e-12)throw std::runtime_error("Repeat fit geometry");
  runQuickCommand(entry.first,false);if(tileRepeat_!=repeat::Mode::Off)throw std::runtime_error("Repeat quick toggle off");runQuickCommand(entry.first,false);if(tileRepeat_!=entry.second)throw std::runtime_error("Repeat quick toggle on");
 }
 viewRotation_.degrees=37;menuCommands_.invoke("tileRepeatBoth");const auto viewport=canvasViewport();if(std::abs(zoom_-repeat::fit(double(viewport.w)/uiScale,double(viewport.h)/uiScale,6,4,repeat::Mode::Both,37))>1e-12)throw std::runtime_error("Rotated repeat fit");
 viewRotation_={};setTileRepeat(repeat::Mode::Both);manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();manager()->flipAllDisplays();writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"tile-repeat-smoke.bmp");ensureContentCache();
 if(renderer_.uploads()!=uploads||document.pixels()!=pixels||document.revision()!=revision||document.historySize()!=history||document.dirty())throw std::runtime_error("Repeat rebuilt upload or edited content/history");
 const auto image=os::instance()->makeRgbaSurface(canvas_.w*3,canvas_.h*3);ui::Graphics graphics(image);for(auto copy:repeat::offsets(repeat::Mode::Both))renderer_.draw(graphics,{(copy.x+1)*canvas_.w,(copy.y+1)*canvas_.h,canvas_.w,canvas_.h},canvasScale(),checkerboard_.light,checkerboard_.dark,checkerboard_.size);
 for(int y=0;y<3;++y)for(int x=0;x<3;++x){const auto color=image->getPixel(x*canvas_.w+canvas_.w/2,y*canvas_.h+canvas_.h/2);if(gfx::getr(color)!=0xaa||gfx::getg(color)!=0x66||gfx::getb(color)!=0x33)throw std::runtime_error("Repeat rendered copy pixel");}
 // Real pointer dispatch across the right seam must paint only the seam pixels.
 document=Document(8,4);viewRotation_={};setTileRepeat(repeat::Mode::X);selectionTool_=shapeTool_=eyedropperTool_=gradientTool_=fillTool_=handTool_=eraser_=smoothTool_=airbrushTool_=moveTool_=textTool_=rotateTool_=false;navigation_.zoomTool_=false;brushDynamics_={};pencilImageBrush_.reset();brushFeedback_.brushProfiles_[0]={};brushFeedback_.brushProfiles_[0].size=1;brushFeedback_.brushProfiles_[0].opacity=100;ink_=0xff123456;refresh();const auto strokeHistory=document.historySize();
 auto send=[&](ui::MessageType type,TransformPoint at){ui::MouseMessage m(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,canvasDocumentToDisplay(at));m.setDisplay(display());onProcessMessage(&m);};
 send(ui::kMouseDownMessage,{7.25,1.25});send(ui::kMouseMoveMessage,{9.25,1.25});send(ui::kMouseUpMessage,{9.25,1.25});
 if(document.active()||document.historySize()!=strokeHistory+1||document.pixels()[15]!=ink_||document.pixels()[8]!=ink_||document.pixels()[9]!=ink_||document.pixels()[12])throw std::runtime_error("Repeated pointer seam stroke/history");document.undo();if(std::any_of(document.pixels().begin(),document.pixels().end(),[](auto p){return p!=0;}))throw std::runtime_error("Repeated pointer undo");document.redo();
 document.deselectPixels();useSelectionTool(0);selectionRounded_=false;selectionMode_=0;selectionDragging_=true;selectionBoxDragging_=false;quickSelection_=false;selectionBefore_.reset();selectionStart_={7,1};selectionMoved_=true;marqueeViewAngle_=0;updateSelectionCreation({9,2});endSelectionGesture(false);
 if(!selectionContains(document.selection(),7,1)||!selectionContains(document.selection(),0,1)||!selectionContains(document.selection(),1,2)||selectionContains(document.selection(),4,1))throw std::runtime_error("Repeated marquee folds seam");
 for(int kind:{2,5}){
  document.deselectPixels();useSelectionTool(kind);const auto h=document.historyPosition();
  send(ui::kMouseDownMessage,{7.25,1.25});send(ui::kMouseMoveMessage,{9.25,1.25});
  if(kind==2){send(ui::kMouseMoveMessage,{9.25,2.25});send(ui::kMouseMoveMessage,{7.25,2.25});}
  send(ui::kMouseUpMessage,{7.25,2.25});
  const auto selected=document.selection();if(!selectionContains(selected,7,1)||!selectionContains(selected,0,1)||selectionContains(selected,4,1)||document.historyPosition()!=h+1)throw std::runtime_error("Repeated lasso/brush pointer selection");
  document.undo();if(document.selection())throw std::runtime_error("Repeated selection undo");document.redo();if(!selectionEqual(document.selection(),selected))throw std::runtime_error("Repeated selection redo");
  document.deselectPixels();send(ui::kMouseDownMessage,{7.25,1.25});send(ui::kMouseMoveMessage,{9.25,1.25});endSelectionGesture(true);if(document.selection())throw std::runtime_error("Repeated selection cancel");
 }
 runtimePreferences_.set("tools.smartAlignmentEnabled","false");runtimePreferences_.set("tools.gridAlignmentEnabled","false");document=Document(32,16);setTileRepeat(repeat::Mode::X);useSelectionTool(0);document.beginStroke({30,6},0xff112233);document.updateStroke({31,6});document.commitStroke();document.previewSelection(SelectionMask{26,2,6,10,{}});refresh();const auto movePixels=document.canvasPixels();const auto moveHistory=document.historyPosition();
 send(ui::kMouseDownMessage,{29.25,6.25});send(ui::kMouseMoveMessage,{32.25,6.25});send(ui::kMouseUpMessage,{32.25,6.25});if(!document.floating())throw std::runtime_error("Repeated floating pointer entry");
 ui::KeyMessage confirm(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);onProcessMessage(&confirm);if(document.floating()||document.canvasPixels()[6*32+1]!=0xff112233||document.canvasPixels()[6*32+2]!=0xff112233||document.canvasPixels()[6*32+30]||document.historyPosition()!=moveHistory+2||document.selection())throw std::runtime_error("Repeated floating pointer commit: floating="+std::to_string(document.floating())+" p1="+std::to_string(document.canvasPixels()[193])+" p2="+std::to_string(document.canvasPixels()[194])+" old="+std::to_string(document.canvasPixels()[222])+" history="+std::to_string(document.historyPosition())+" expected="+std::to_string(moveHistory+2));const auto movedPixels=document.canvasPixels();document.undo();if(document.canvasPixels()!=movedPixels||!document.selection())throw std::runtime_error("Repeated Enter deselection undo");document.undo();if(document.canvasPixels()!=movePixels)throw std::runtime_error("Repeated floating pointer undo");document.redo();document.redo();if(document.canvasPixels()!=movedPixels||document.selection())throw std::runtime_error("Repeated floating pointer redo");
 document=Document(10,8);document.fillSelectionOrCanvas(0xff112233);document.convertLayerToTilemap(2,2,U"Repeat input");document.setTilemapMode(tiles::Mode::Paint);setTileRepeat(repeat::Mode::X);selectionTool_=false;eraser_=true;refresh();const auto paintBefore=document.cel().tilemap->cells;const auto paintHistory=document.historyPosition();send(ui::kMouseDownMessage,{9.25,3.25});send(ui::kMouseMoveMessage,{11.25,3.25});send(ui::kMouseUpMessage,{11.25,3.25});const auto paintAfter=document.cel().tilemap->cells;if(paintAfter[9]||paintAfter[5]||paintAfter[7]!=paintBefore[7]||document.historyPosition()!=paintHistory+1)throw std::runtime_error("Repeated Paint pointer seam: first="+std::to_string(bool(paintAfter[9]))+" last="+std::to_string(bool(paintAfter[5]))+" middle="+std::to_string(paintAfter[7]==paintBefore[7])+" history="+std::to_string(document.historyPosition())+" expected="+std::to_string(paintHistory+1)+" active="+std::to_string(document.active()));document.undo();if(document.cel().tilemap->cells!=paintBefore)throw std::runtime_error("Repeated Paint undo");document.redo();if(document.cel().tilemap->cells!=paintAfter)throw std::runtime_error("Repeated Paint redo");
 document=Document(8,6);document.createFreeTileLayer(U"Repeated source input");SelectionClipboard sourceTile;sourceTile.width=3;sourceTile.height=2;sourceTile.pixels.assign(6,0xff112233);document.pasteFreeTilePixels(sourceTile,{2,2});document.setFreeTilePaintMode(false);setTileRepeat(repeat::Mode::X);eraser_=false;refresh();const auto sourceBefore=document.canvasPixels();const auto sourceHistory=document.historyPosition();const auto sourceInstances=document.cel().freeTiles->instances;
 send(ui::kMouseDownMessage,{10.25,2.25});send(ui::kMouseMoveMessage,{11.25,3.25});send(ui::kMouseUpMessage,{11.25,3.25});const auto sourceAfter=document.canvasPixels();if(sourceAfter==sourceBefore||sourceAfter[2*8+2]!=ink_||sourceAfter[3*8+3]!=ink_||document.historyPosition()!=sourceHistory+1||document.cel().freeTiles->instances!=sourceInstances)throw std::runtime_error("Repeated free source pointer/history");document.undo();if(document.canvasPixels()!=sourceBefore)throw std::runtime_error("Repeated free source undo");document.redo();if(document.canvasPixels()!=sourceAfter)throw std::runtime_error("Repeated free source redo");
 // Placement is one click even on a copy; erasing joins wrapped endpoints.
 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
  document=Document(8,6);document.createFreeTileLayer(U"Repeated placement input");SelectionClipboard tile;tile.width=tile.height=1;tile.pixels={0xff112233};document.pasteFreeTilePixels(tile,{0,2});document.setFreeTilePaintMode(true);setTileRepeat(mode);eraser_=false;refresh();
  const int ox=repeat::includesX(mode)?8:0,oy=repeat::includesY(mode)?-6:0;const auto initial=document.cel().freeTiles->instances;const auto pixels=document.canvasPixels();const auto history=document.historyPosition();
  send(ui::kMouseDownMessage,{ox+3.25,oy+2.25});send(ui::kMouseMoveMessage,{ox+5.25,oy+2.25});send(ui::kMouseUpMessage,{ox+5.25,oy+2.25});const auto placed=document.cel().freeTiles->instances;const auto placedPixels=document.canvasPixels();if(placed.size()!=initial.size()+1||placed.back().x!=3||placed.back().y!=2||document.historyPosition()!=history+1||document.active())throw std::runtime_error("Repeated free placement click/history");document.undo();if(document.cel().freeTiles->instances!=initial||document.canvasPixels()!=pixels)throw std::runtime_error("Repeated placement undo");document.redo();if(document.cel().freeTiles->instances!=placed||document.canvasPixels()!=placedPixels)throw std::runtime_error("Repeated placement redo");
  send(ui::kMouseDownMessage,{ox+6.25,oy+2.25});ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.active()||hasCapture()||document.cel().freeTiles->instances!=placed||document.historyPosition()!=history+1)throw std::runtime_error("Repeated placement Escape restores instances");
  eraser_=true;send(ui::kMouseDownMessage,{ox+3.25,oy+2.25});send(ui::kMouseUpMessage,{ox+3.25,oy+2.25});if(document.cel().freeTiles->instances!=initial||document.historyPosition()!=history+2)throw std::runtime_error("Repeated free eraser click");document.undo();if(document.cel().freeTiles->instances!=placed)throw std::runtime_error("Repeated eraser undo");document.redo();if(document.cel().freeTiles->instances!=initial)throw std::runtime_error("Repeated eraser redo");
 }
 document=Document(8,6);document.createFreeTileLayer(U"Repeated eraser seam");SelectionClipboard dot;dot.width=dot.height=1;dot.pixels={0xff112233};document.pasteFreeTilePixels(dot,{0,2});document.setFreeTilePaintMode(true);for(int x=1;x<8;++x){document.beginFreeTilePlacement({x,2});document.commitFreeTilePlacement();}setTileRepeat(repeat::Mode::X);eraser_=true;refresh();const auto seamInstances=document.cel().freeTiles->instances;const auto seamHistory=document.historyPosition();send(ui::kMouseDownMessage,{7.25,2.25});send(ui::kMouseMoveMessage,{8.25,2.25});ui::KeyMessage cancelErase(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&cancelErase);if(document.cel().freeTiles->instances!=seamInstances||document.historyPosition()!=seamHistory||hasCapture())throw std::runtime_error("Repeated eraser seam cancellation");send(ui::kMouseDownMessage,{7.25,2.25});send(ui::kMouseMoveMessage,{8.25,2.25});send(ui::kMouseUpMessage,{8.25,2.25});if(!document.cel().freeTiles->instances.empty()||document.historyPosition()!=seamHistory+1)throw std::runtime_error("Repeated eraser legacy local seam path");document.undo();if(document.cel().freeTiles->instances!=seamInstances)throw std::runtime_error("Repeated eraser seam undo");document.redo();if(!document.cel().freeTiles->instances.empty())throw std::runtime_error("Repeated eraser seam redo");
 // Instance move follows legacy local pointer deltas, including seam jumps.
 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
  document=Document(8,6);document.createFreeTileLayer(U"Repeated instance move");SelectionClipboard tile;tile.width=tile.height=1;tile.pixels={0xff112233};document.pasteFreeTilePixels(tile,{7,4});document.setFreeTileInstanceView(true);useMoveTool();setTileRepeat(mode);refresh();const auto original=document.cel().freeTiles->instances;const auto beforePixels=document.canvasPixels();const auto resources=document.timeline().state().tilesets.front().pixels;const auto h=document.historyPosition();const int ox=repeat::includesX(mode)?-8:0,oy=repeat::includesY(mode)?-6:0;const TransformPoint start{ox+7.25,oy+4.25},end{ox+(repeat::includesX(mode)?8.25:6.25),oy+(repeat::includesY(mode)?6.25:3.25)};
  send(ui::kMouseDownMessage,start);if(!document.freeTileInstanceMoving())throw std::runtime_error("Repeated instance move hit");send(ui::kMouseMoveMessage,end);send(ui::kMouseUpMessage,end);const auto moved=document.cel().freeTiles->instances;const auto movedPixels=document.canvasPixels();const int ex=repeat::includesX(mode)?0:6,ey=repeat::includesY(mode)?0:3;if(moved.size()!=original.size()||moved.front().x!=ex||moved.front().y!=ey||document.historyPosition()!=h+1||document.active()||hasCapture()||document.timeline().state().tilesets.front().pixels!=resources)throw std::runtime_error("Repeated instance local delta/history/resources mode="+std::to_string(int(mode))+" x="+std::to_string(moved.front().x)+" y="+std::to_string(moved.front().y)+" history="+std::to_string(document.historyPosition())+" expected="+std::to_string(h+1)+" active="+std::to_string(document.active())+" capture="+std::to_string(hasCapture()));document.undo();if(document.cel().freeTiles->instances!=original||document.canvasPixels()!=beforePixels)throw std::runtime_error("Repeated instance move undo");document.redo();if(document.cel().freeTiles->instances!=moved||document.canvasPixels()!=movedPixels)throw std::runtime_error("Repeated instance move redo");document.undo();
  send(ui::kMouseDownMessage,start);send(ui::kMouseMoveMessage,end);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.cel().freeTiles->instances!=original||document.canvasPixels()!=beforePixels||document.historyPosition()!=h||document.active()||hasCapture())throw std::runtime_error("Repeated instance move cancel");
  send(ui::kMouseDownMessage,start);send(ui::kMouseUpMessage,start);if(document.historyPosition()!=h||document.cel().freeTiles->instances!=original)throw std::runtime_error("Repeated instance click no history");
  // Instance moves admit only the adjacent copies; ignored outer samples must
  // settle an unchanged draft without leaving capture or creating history.
  const TransformPoint outside{repeat::includesX(mode)?24.25:7.25,repeat::includesX(mode)?4.25:18.25};send(ui::kMouseDownMessage,start);send(ui::kMouseMoveMessage,outside);send(ui::kMouseUpMessage,outside);if(document.historyPosition()!=h||document.cel().freeTiles->instances!=original||hasCapture()||document.active())throw std::runtime_error("Repeated instance outer copy ignored");
  send(ui::kMouseDownMessage,start);auto shiftMove=[&](ui::MessageType type){ui::MouseMessage m(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyShiftModifier,canvasDocumentToDisplay({ox+5.25,oy+3.25}));m.setDisplay(display());onProcessMessage(&m);};shiftMove(ui::kMouseMoveMessage);shiftMove(ui::kMouseUpMessage);if(document.cel().freeTiles->instances.front().x!=5||document.cel().freeTiles->instances.front().y!=4||document.historyPosition()!=h+1)throw std::runtime_error("Repeated instance constrained axis");document.undo();if(document.cel().freeTiles->instances!=original)throw std::runtime_error("Repeated constrained instance undo");

 }
 moveTool_=false;
 // Legacy whole-instance selection branch returns before tileRepeatStart is
 // installed. It uses local deltas and clips the moved mask to the canvas.
 for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
  document=Document(32,24);document.createFreeTileLayer(U"Repeated selected placement");SelectionClipboard tile;tile.width=tile.height=2;tile.pixels.assign(4,0xff112233);document.pasteFreeTilePixels(tile,{26,17});document.setFreeTilePaintMode(false);document.setFreeTileInstanceView(true);const auto instance=document.cel().freeTiles->instances.front().id;document.selectFreeTileInstance(instance);useSelectionTool(0);document.previewSelection(SelectionMask{20,11,12,13,{}});setTileRepeat(mode);refresh();const auto original=document.cel().freeTiles->instances;const auto beforePixels=document.canvasPixels();const auto selected=document.selection();const auto h=document.historyPosition();const TransformPoint start{27.25,18.25},end{repeat::includesX(mode)?33.25:28.25,repeat::includesY(mode)?25.25:19.25};
  auto drag=[&]{quickSelectionPress_.reset();send(ui::kMouseDownMessage,start);if(!document.freeTileSelectionPlacementMoving()||!floatingDragging_)throw std::runtime_error("Repeated whole instance selection move begins");send(ui::kMouseMoveMessage,end);};
  drag();send(ui::kMouseUpMessage,end);const auto moved=document.cel().freeTiles->instances;const auto afterPixels=document.canvasPixels();const auto afterSelection=document.selection();const int dx=repeat::includesX(mode)?-26:1,dy=repeat::includesY(mode)?-17:1;if(document.floating()||moved.front().x!=original.front().x+dx||moved.front().y!=original.front().y+dy||document.historyPosition()!=h+1||hasCapture())throw std::runtime_error("Repeated whole instance selected local delta/commit");auto expected=selected;expected->x+=dx;expected->y+=dy;expected=combineSelection(expected,SelectionMask{0,0,32,24,{}},3);if(!selectionEqual(afterSelection,expected))throw std::runtime_error("Repeated instance selection clipped mask");document.undo();if(document.cel().freeTiles->instances!=original||document.canvasPixels()!=beforePixels||!selectionEqual(document.selection(),selected))throw std::runtime_error("Repeated selected instance undo");document.redo();if(document.cel().freeTiles->instances!=moved||document.canvasPixels()!=afterPixels||!selectionEqual(document.selection(),afterSelection))throw std::runtime_error("Repeated selected instance redo");document.undo();drag();ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.floating()||document.cel().freeTiles->instances!=original||!selectionEqual(document.selection(),selected)||document.historyPosition()!=h||hasCapture())throw std::runtime_error("Repeated selected instance Escape");
 }
 // Identical random particles must edit the same pixels on a repeated copy.
 for(bool freeSource:{false,true})for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
  std::vector<Pixel> expected;for(bool copy:{false,true}){
   document=Document(16,12);if(freeSource){document.createFreeTileLayer(U"Repeated airbrush source");SelectionClipboard tile;tile.width=tile.height=4;tile.pixels.assign(16,0xff112233);document.pasteFreeTilePixels(tile,{0,0});document.setFreeTilePaintMode(false);}useAirbrushTool();setTileRepeat(mode);airbrushSettings_.particleRadius=2;airbrushSettings_.scatterRadius=2;airbrushSettings_.density=12;airbrushRandom_.seed(1729);refresh();const auto beforePixels=document.canvasPixels();const auto h=document.historyPosition();const int ox=copy&&repeat::includesX(mode)?16:0,oy=copy&&repeat::includesY(mode)?-12:0;const TransformPoint at{ox+.25,oy+.25},to{ox+1.25,oy+1.25};
   send(ui::kMouseDownMessage,at);if(!airbrushDragging_||!document.strokeActive())throw std::runtime_error("Repeated airbrush begins");airbrushTimer_.stop();send(ui::kMouseMoveMessage,to);sprayAirbrush();send(ui::kMouseUpMessage,to);const auto after=document.canvasPixels();if(after==beforePixels||document.historyPosition()!=h+1||document.active()||hasCapture())throw std::runtime_error("Repeated airbrush commit/history");if(!copy)expected=after;else if(after!=expected)throw std::runtime_error("Repeated airbrush copy differs");document.undo();if(document.canvasPixels()!=beforePixels)throw std::runtime_error("Repeated airbrush undo");document.redo();if(document.canvasPixels()!=after)throw std::runtime_error("Repeated airbrush redo");document.undo();airbrushRandom_.seed(1729);send(ui::kMouseDownMessage,at);airbrushTimer_.stop();send(ui::kMouseMoveMessage,to);sprayAirbrush();ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.canvasPixels()!=beforePixels||document.historyPosition()!=h||document.active()||hasCapture()||airbrushDragging_)throw std::runtime_error("Repeated airbrush cancel");
  }
 }
 airbrushTool_=false;
 // Bucket connectivity remains document-local; copies only change the seed.
 for(bool freeSource:{false,true})for(bool pattern:{false,true})for(bool contiguous:{false,true})for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
  std::vector<Pixel> expected;for(bool copy:{false,true}){
   document=Document(16,12);if(freeSource){document.createFreeTileLayer(U"Repeated bucket source");SelectionClipboard tile;tile.width=8;tile.height=6;tile.pixels.assign(48,0xff112233);document.pasteFreeTilePixels(tile,{2,2});document.setFreeTilePaintMode(false);}else{document.fillSelectionOrCanvas(0xff112233);document.beginStroke({7,0},0xff445566);document.updateStroke({7,11});document.commitStroke();}document.previewSelection(SelectionMask{1,1,13,9,{}});useFillTool();setTileRepeat(mode);fillOptions_={};fillOptions_.contiguous=contiguous;fillPattern_={};if(pattern)fillPattern_.texture=FillTexture::Cracks;refresh();const auto beforePixels=document.canvasPixels();const auto h=document.historyPosition();const int ox=copy&&repeat::includesX(mode)?16:0,oy=copy&&repeat::includesY(mode)?-12:0;const TransformPoint at{ox+3.25,oy+3.25};
   send(ui::kMouseDownMessage,at);send(ui::kMouseUpMessage,at);const auto after=document.canvasPixels();if(after==beforePixels||document.historyPosition()!=h+1||fillDragging_||hasCapture())throw std::runtime_error("Repeated bucket commit/history");if(!copy)expected=after;else if(after!=expected)throw std::runtime_error("Repeated bucket copy differs");if(!freeSource&&contiguous&&after[3*16+9]!=beforePixels[3*16+9])throw std::runtime_error("Repeated bucket must not join opposite regions");document.undo();if(document.canvasPixels()!=beforePixels)throw std::runtime_error("Repeated bucket undo");document.redo();if(document.canvasPixels()!=after)throw std::runtime_error("Repeated bucket redo");document.undo();send(ui::kMouseDownMessage,at);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.canvasPixels()!=beforePixels||document.historyPosition()!=h||fillDragging_||hasCapture())throw std::runtime_error("Repeated bucket Escape");
  }
 }
 fillTool_=false;fillPattern_={};
 for(bool freeSource:{false,true})for(bool confirm:{false,true})for(bool radial:{false,true})for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
  std::vector<Pixel> expected;for(bool copy:{false,true}){
   document=Document(16,12);if(freeSource){document.createFreeTileLayer(U"Repeated gradient source");SelectionClipboard tile;tile.width=8;tile.height=6;tile.pixels.assign(48,0xff112233);document.pasteFreeTilePixels(tile,{2,2});document.setFreeTilePaintMode(false);}else document.fillSelectionOrCanvas(0xff112233);document.previewSelection(SelectionMask{1,1,13,9,{}});useGradientTool();setTileRepeat(mode);gradientConfirm_=confirm;gradientSpec_.radial=radial;gradientOptions_={};refresh();const auto baseline=document.canvasPixels();const auto h=document.historyPosition();const int ox=copy&&repeat::includesX(mode)?16:0,oy=copy&&repeat::includesY(mode)?-12:0;const TransformPoint start{ox+3.25,oy+3.25},end{ox+7.25,oy+6.25};
   auto drag=[&]{send(ui::kMouseDownMessage,start);if(!gradientDragging_||!document.gradientActive())throw std::runtime_error("Repeated gradient begins");send(ui::kMouseMoveMessage,end);send(ui::kMouseUpMessage,end);};drag();if(confirm){if(!gradientPending_||document.historyPosition()!=h)throw std::runtime_error("Repeated gradient pending has no history");ui::KeyMessage enter(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);onProcessMessage(&enter);}const auto after=document.canvasPixels();if(after==baseline||document.historyPosition()!=h+1||document.gradientActive()||hasCapture())throw std::runtime_error("Repeated gradient commit");if(!copy)expected=after;else if(after!=expected)throw std::runtime_error("Repeated gradient copy differs");document.undo();if(document.canvasPixels()!=baseline)throw std::runtime_error("Repeated gradient undo");document.redo();if(document.canvasPixels()!=after)throw std::runtime_error("Repeated gradient redo");document.undo();gradientConfirm_=true;drag();ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.canvasPixels()!=baseline||document.historyPosition()!=h||document.gradientActive()||hasCapture())throw std::runtime_error("Repeated gradient Escape");
  }
 }
 gradientTool_=false;
 // Editing a pending start handle then releasing outside copies must preserve
 // its last valid geometry, not reinterpret the endpoint as a start pointer.
 for(bool radial:{false,true})for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
  document=Document(32,24);document.fillSelectionOrCanvas(0xff112233);useGradientTool();setTileRepeat(mode);gradientConfirm_=true;gradientSpec_.radial=radial;gradientOptions_={};refresh();const auto baseline=document.canvasPixels();const auto h=document.historyPosition();send(ui::kMouseDownMessage,{6.25,6.25});send(ui::kMouseMoveMessage,{20.25,16.25});send(ui::kMouseUpMessage,{20.25,16.25});if(!gradientPending_)throw std::runtime_error("Gradient handle fixture pending");const auto original=gradientSpec_;const int ox=repeat::includesX(mode)?32:0,oy=repeat::includesY(mode)?-24:0;const auto handlePoint=radial?resolveGradientGeometry(original).center:original.start;const TransformPoint handle{ox+handlePoint.x+.25,oy+handlePoint.y+.25},to{ox+handlePoint.x+2.25,oy+handlePoint.y+1.25};send(ui::kMouseDownMessage,handle);if(!gradientDragging_||gradientHandle_!=(radial?2:0))throw std::runtime_error("Repeated gradient start handle hit radial="+std::to_string(radial)+" mode="+std::to_string(int(mode))+" handle="+std::to_string(gradientHandle_)+" start="+std::to_string(gradientSpec_.start.x)+","+std::to_string(gradientSpec_.start.y));send(ui::kMouseMoveMessage,to);gradientTick();const auto moved=gradientSpec_;if(moved.start.x!=original.start.x+2||moved.start.y!=original.start.y+1)throw std::runtime_error("Repeated gradient start handle delta");const TransformPoint outside{100.25,100.25};send(ui::kMouseMoveMessage,outside);send(ui::kMouseUpMessage,outside);if(gradientDragging_||!gradientPending_||hasCapture()||gradientSpec_.start.x!=moved.start.x||gradientSpec_.start.y!=moved.start.y||gradientSpec_.end.x!=moved.end.x||gradientSpec_.end.y!=moved.end.y||document.historyPosition()!=h)throw std::runtime_error("Gradient outer handle release preserves geometry");
  const auto movedHandle=radial?resolveGradientGeometry(moved).center:moved.start;send(ui::kMouseDownMessage,{ox+movedHandle.x+.25,oy+movedHandle.y+.25});send(ui::kMouseMoveMessage,{ox+movedHandle.x+2.25,oy+movedHandle.y+1.25});ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(!gradientPending_||gradientDragging_||hasCapture()||gradientSpec_.start.x!=moved.start.x||gradientSpec_.start.y!=moved.start.y)throw std::runtime_error("Gradient handle Escape restores pending geometry");ui::KeyMessage enter(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);onProcessMessage(&enter);const auto applied=document.canvasPixels();if(document.historyPosition()!=h+1||document.gradientActive())throw std::runtime_error("Gradient edited handle commits once");document.undo();if(document.canvasPixels()!=baseline)throw std::runtime_error("Gradient edited handle undo");document.redo();if(document.canvasPixels()!=applied)throw std::runtime_error("Gradient edited handle redo");
 }
 gradientTool_=false;
 for(bool freeSource:{false,true})for(auto kind:{ShapeKind::Rectangle,ShapeKind::RectangleOutline,ShapeKind::Ellipse,ShapeKind::EllipseOutline,ShapeKind::Line,ShapeKind::Freeform,ShapeKind::Polygon,ShapeKind::Curve})for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
  std::vector<Pixel> expected;for(bool copy:{false,true}){
   document=Document(24,20);if(freeSource){document.createFreeTileLayer(U"Repeated shape source");SelectionClipboard tile;tile.width=12;tile.height=10;tile.pixels.assign(120,0xff112233);document.pasteFreeTilePixels(tile,{2,2});document.setFreeTilePaintMode(false);}useShapeTool(kind);setTileRepeat(mode);shapeRounded_=false;shapeRatio_=false;brushFeedback_.brushProfiles_[0].size=1;refresh();const auto baseline=document.canvasPixels();const auto h=document.historyPosition();const int ox=copy&&repeat::includesX(mode)?24:0,oy=copy&&repeat::includesY(mode)?-20:0;const TransformPoint start{ox+4.25,oy+4.25},end{ox+11.25,oy+10.25};
   auto draw=[&]{send(ui::kMouseDownMessage,start);if(!shapeDragging_||!document.shapeActive())throw std::runtime_error("Repeated shape begins");send(ui::kMouseMoveMessage,end);if(kind==ShapeKind::Freeform){send(ui::kMouseMoveMessage,{ox+4.25,oy+10.25});}send(ui::kMouseUpMessage,end);if(kind==ShapeKind::Polygon){send(ui::kMouseDownMessage,end);send(ui::kMouseUpMessage,end);send(ui::kMouseMoveMessage,{ox+4.25,oy+10.25});send(ui::kMouseDownMessage,{ox+4.25,oy+10.25});send(ui::kMouseUpMessage,{ox+4.25,oy+10.25});finishPolygonShape();}if(kind==ShapeKind::Curve){send(ui::kMouseMoveMessage,{ox+10.25,oy+4.25});finishCurveShape();}};
   draw();const auto after=document.canvasPixels();if(after==baseline||document.historyPosition()!=h+1||document.shapeActive()||hasCapture())throw std::runtime_error("Repeated shape commit kind="+std::to_string(int(kind)));if(!copy)expected=after;else if(after!=expected)throw std::runtime_error("Repeated shape copy differs kind="+std::to_string(int(kind)));document.undo();if(document.canvasPixels()!=baseline)throw std::runtime_error("Repeated shape undo");document.redo();if(document.canvasPixels()!=after)throw std::runtime_error("Repeated shape redo");document.undo();send(ui::kMouseDownMessage,start);send(ui::kMouseMoveMessage,end);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.canvasPixels()!=baseline||document.historyPosition()!=h||document.shapeActive()||hasCapture()||shapeDragging_)throw std::runtime_error("Repeated shape Escape");
  }
 }
 shapeTool_=false;
 // Sampling must share bounded local coordinates across foreground/background and lens.
 for(const auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(bool current:{false,true})for(bool right:{false,true}){
  document=Document(16,12);document.fillSelectionOrCanvas(0xff112233);document.addLayer();document.beginStroke({2,3},0x80445566);document.commitStroke();document.beginStroke({5,4},0xff778899);document.commitStroke();
  useEyedropperTool();eyedropperSource_=current?EyedropperSource::CurrentLayer:EyedropperSource::Composite;eyedropperLensEnabled_=true;setTileRepeat(mode);zoom_=4;{const auto v=canvasViewport();const int w=int(16*canvasScale()),h=int(12*canvasScale());canvas_={v.x+(v.w-w)/2,v.y+(v.h-h)/2,w,h};}refresh();const auto baseline=document.canvasPixels();const auto h=document.historyPosition();const auto other=right?document.palette().primary:document.palette().secondary;const int ox=repeat::includesX(mode)?-16:0,oy=repeat::includesY(mode)?12:0;
  auto sampleSend=[&](ui::MessageType type,TransformPoint at){ui::MouseMessage m(type,os::PointerType::Mouse,right?ui::kButtonRight:ui::kButtonLeft,ui::kKeyNoneModifier,canvasDocumentToDisplay(at));m.setDisplay(display());onProcessMessage(&m);};
  auto role=[&]{return right?document.palette().secondary:document.palette().primary;};
  const auto first=sampleEyedropper(document.timeline(),document.frame().id,document.layer().id,16,12,2,3,eyedropperSource_);
  sampleSend(ui::kMouseDownMessage,{ox+2.25,oy+3.25});if(!eyedropperGesture_.active()||role()!=first||!eyedropperLensSurface_)throw std::runtime_error("Repeated eyedropper initial sample");
  auto flushLens=[&]{auto target=os::instance()->makeRgbaSurface(bounds().w,bounds().h);ui::Graphics g(target);paintEyedropperLens(g);};
  const auto lens=eyedropperLensSurface_;const auto counts=eyedropperLensWorkCounts(*this);
  for(int n=0;n<100;++n)updateEyedropperLens(canvasDocumentToDisplay({2.25,3.25}),first);
  if(eyedropperLensWorkCounts(*this)!=counts)throw std::runtime_error("Eyedropper pointer burst rendered synchronously");
  flushLens();const auto flushed=eyedropperLensWorkCounts(*this);if(flushed.first!=counts.first+1||flushed.second!=counts.second)throw std::runtime_error("Eyedropper frame coalescing/source cache");
  for(int y=0;y<128;++y)for(int x=0;x<128;++x)if(lens->getPixel(x,y)!=eyedropperLensSurface_->getPixel(x,y))throw std::runtime_error("Repeated eyedropper lens differs");
  sampleSend(ui::kMouseMoveMessage,{ox+5.25,oy+4.25});flushLens();const auto movedCounts=eyedropperLensWorkCounts(*this);if(movedCounts.second!=flushed.second+1)throw std::runtime_error("Eyedropper moved region cache invalidation");if(role()!=0xff778899)throw std::runtime_error("Repeated eyedropper drag");
  sampleSend(ui::kMouseMoveMessage,{repeat::includesX(mode)?32.25:5.25,repeat::includesY(mode)?24.25:4.25});if(role()!=0xff778899)throw std::runtime_error("Repeated eyedropper outside copies changed color");
  sampleSend(ui::kMouseUpMessage,{ox+5.25,oy+4.25});const auto endedCounts=eyedropperLensWorkCounts(*this);flushLens();if(eyedropperLensWorkCounts(*this)!=endedCounts)throw std::runtime_error("Eyedropper pending preview survived finish");if(eyedropperGesture_.active()||hasCapture()||eyedropperLensSurface_||document.canvasPixels()!=baseline||document.historyPosition()!=h||(right?document.palette().primary:document.palette().secondary)!=other)throw std::runtime_error("Repeated eyedropper finish/content/other role");
 }
 eyedropperTool_=false;
 // Smooth uses mapped local samples; legacy clips its footprint and rejects tile layers.
 for(const auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(const auto shape:{BrushShape::Round,BrushShape::Square,BrushShape::Line}){
  std::vector<Pixel> expected;
  for(bool copy:{false,true}){
   document=Document(16,12);for(const auto at:{Point{2,3},Point{3,3},Point{5,4},Point{6,4}}){document.beginStroke(at,0xff112233);document.commitStroke();}
   document.previewSelection(SelectionMask{1,1,12,9,{}});useSmoothTool();smoothBrush_={};smoothBrush_.size=5;smoothBrush_.shape=shape;smoothAngle_=35;smoothStrength_=100;brushDynamics_={};setTileRepeat(mode);refresh();const auto baseline=document.canvasPixels();const auto h=document.historyPosition();const int ox=copy&&repeat::includesX(mode)?16:0,oy=copy&&repeat::includesY(mode)?-12:0;const TransformPoint start{ox+2.25,oy+3.25},end{ox+6.25,oy+4.25};
   send(ui::kMouseDownMessage,start);if(!smoothDragging_)throw std::runtime_error("Repeated smooth begins");send(ui::kMouseMoveMessage,end);if(document.canvasPixels()!=baseline||document.historyPosition()!=h)throw std::runtime_error("Smooth collection mutated before release");
   send(ui::kMouseMoveMessage,{repeat::includesX(mode)?32.25:6.25,repeat::includesY(mode)?24.25:4.25});send(ui::kMouseUpMessage,{repeat::includesX(mode)?32.25:6.25,repeat::includesY(mode)?24.25:4.25});
   const auto after=document.canvasPixels();if(after==baseline||document.historyPosition()!=h+1||smoothDragging_||hasCapture())throw std::runtime_error("Repeated smooth commit");if(!copy)expected=after;else if(after!=expected)throw std::runtime_error("Repeated smooth copy differs");document.undo();if(document.canvasPixels()!=baseline)throw std::runtime_error("Repeated smooth undo");document.redo();if(document.canvasPixels()!=after)throw std::runtime_error("Repeated smooth redo");document.undo();send(ui::kMouseDownMessage,start);send(ui::kMouseMoveMessage,end);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(smoothDragging_||hasCapture()||document.canvasPixels()!=baseline||document.historyPosition()!=h)throw std::runtime_error("Repeated smooth Escape");
  }
 }
 // Crossing the seam joins local endpoints through the interior, as legacy moveSmooth.
 for(const auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
  document=Document(16,12);useSmoothTool();smoothBrush_={};smoothBrush_.size=1;setTileRepeat(mode);refresh();
  const TransformPoint start{repeat::includesX(mode)?15.25:4.25,repeat::includesY(mode)?11.25:4.25},end{repeat::includesX(mode)?16.25:4.25,repeat::includesY(mode)?12.25:4.25};
  send(ui::kMouseDownMessage,start);send(ui::kMouseMoveMessage,end);SmoothBrushArea expectedArea;const SelectionPoint localStart{int(start.x),int(start.y)},localEnd{repeat::includesX(mode)?0:4,repeat::includesY(mode)?0:4};expectedArea.collect(16,12,localStart,localStart,smoothBrush_,smoothAngle_,{});expectedArea.collect(16,12,localStart,localEnd,smoothBrush_,smoothAngle_,{});if(smoothArea_.visited!=expectedArea.visited)throw std::runtime_error("Repeated smooth seam local path");cancelStroke();if(hasCapture())releaseMouse();
  document.createFreeTileLayer(U"Smooth rejected source");setTileRepeat(mode);refresh();const auto h=document.historyPosition();send(ui::kMouseDownMessage,{1.25,1.25});send(ui::kMouseUpMessage,{1.25,1.25});if(smoothDragging_||document.historyPosition()!=h)throw std::runtime_error("Smooth must reject free tile layer");
 }
 smoothTool_=false;
 // Continuous local liquid deformation must be identical on every adjacent copy.
 for(const auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(const auto kind:{liquify::Mode::Push,liquify::Mode::Inflate,liquify::Mode::Deflate,liquify::Mode::TwistClockwise,liquify::Mode::TwistCounterClockwise})for(bool smoothing:{false,true}){
  std::vector<Pixel> expected;
  for(bool copy:{false,true}){
   std::vector<Pixel> source;for(int y=0;y<24;++y)for(int x=0;x<32;++x)source.push_back(0xff000000u|unsigned(x*7)|(unsigned(y*9)<<8));
   document=Document::fromSpriteSheetRaster(32,24,source,U"Repeated liquify");document.previewSelection(SelectionMask{1,1,29,21,{}});paletteFocused_=false;runShortcutCommand("tool.liquify");liquifyOptions_={kind,5,100,smoothing,70};setTileRepeat(mode);zoom_=2;{const auto v=canvasViewport();const int w=int(32*canvasScale()),h=int(24*canvasScale());canvas_={v.x+(v.w-w)/2,v.y+(v.h-h)/2,w,h};}refresh();const auto h=document.historyPosition();const int ox=copy&&repeat::includesX(mode)?-32:0,oy=copy&&repeat::includesY(mode)?24:0;const TransformPoint start{ox+10.25,oy+9.25},end{ox+15.25,oy+12.25};
   send(ui::kMouseDownMessage,start);if(!liquifyDragging_||!document.liquifyActive())throw std::runtime_error("Repeated liquify begins");send(ui::kMouseMoveMessage,end);if(kind!=liquify::Mode::Push){liquifyNextTick_=std::chrono::steady_clock::now()-std::chrono::milliseconds(25);liquifyTick();}const auto preview=document.canvasPixels();send(ui::kMouseMoveMessage,{repeat::includesX(mode)?64.25:15.25,repeat::includesY(mode)?48.25:12.25});if(document.canvasPixels()!=preview)throw std::runtime_error("Liquify invalid copy move");send(ui::kMouseUpMessage,end);
   const auto after=document.canvasPixels();if(after==source||document.historyPosition()!=h+1||liquifyDragging_||document.liquifyActive()||hasCapture())throw std::runtime_error("Repeated liquify commit");if(!copy)expected=after;else if(after!=expected)throw std::runtime_error("Repeated liquify local/copy mismatch");document.undo();if(document.canvasPixels()!=source)throw std::runtime_error("Repeated liquify undo");document.redo();if(document.canvasPixels()!=after)throw std::runtime_error("Repeated liquify redo");document.undo();send(ui::kMouseDownMessage,start);send(ui::kMouseMoveMessage,end);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.canvasPixels()!=source||document.historyPosition()!=h||liquifyDragging_||hasCapture())throw std::runtime_error("Repeated liquify Escape");
  }
 }
 liquifyTool_=false;
 // Magic erase uses one local seed, live press preview, and release-only history.
 for(const auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(bool contiguous:{false,true})for(bool visible:{false,true}){
  std::vector<Pixel> expected;
  for(bool copy:{false,true}){
   document=Document(16,12);document.fillSelectionOrCanvas(0xff112233);document.beginStroke({7,0},0xff998877);document.updateStroke({7,11});document.commitStroke();document.previewSelection(SelectionMask{1,1,13,9,{}});useMagicEraserTool();wandOptions_={};wandOptions_.visibleLayers=visible;wandOptions_.connectivity=8;magicEraserContiguous_=contiguous;setTileRepeat(mode);refresh();const auto baseline=document.canvasPixels();const auto h=document.historyPosition();const int ox=copy&&repeat::includesX(mode)?16:0,oy=copy&&repeat::includesY(mode)?-12:0;const TransformPoint seed{ox+3.25,oy+4.25};
   send(ui::kMouseDownMessage,seed);if(!magicEraserDragging_||!document.strokeActive()||document.historyPosition()!=h)throw std::runtime_error("Repeated magic erase preview");const auto preview=document.canvasPixels();if(preview==baseline||preview[4*16+3]!=0||preview[4*16+10]!=(contiguous?baseline[4*16+10]:0)||preview[0]!=baseline[0])throw std::runtime_error("Repeated magic erase selection/region");
   send(ui::kMouseMoveMessage,{ox+7.25,oy+4.25});if(document.canvasPixels()!=preview)throw std::runtime_error("Magic erase drag must not reseed");send(ui::kMouseUpMessage,{repeat::includesX(mode)?32.25:3.25,repeat::includesY(mode)?24.25:4.25});const auto after=document.canvasPixels();if(magicEraserDragging_||hasCapture()||document.strokeActive()||document.historyPosition()!=h+1)throw std::runtime_error("Repeated magic erase release");if(!copy)expected=after;else if(after!=expected)throw std::runtime_error("Repeated magic erase copy differs");document.undo();if(document.canvasPixels()!=baseline)throw std::runtime_error("Repeated magic erase undo");document.redo();if(document.canvasPixels()!=after)throw std::runtime_error("Repeated magic erase redo");document.undo();
   send(ui::kMouseDownMessage,seed);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(document.canvasPixels()!=baseline||document.historyPosition()!=h||magicEraserDragging_||hasCapture())throw std::runtime_error("Repeated magic erase Escape");
   send(ui::kMouseDownMessage,seed);ui::MouseMessage cancel(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonRight,ui::kKeyNoneModifier,canvasDocumentToDisplay(seed));cancel.setDisplay(display());onProcessMessage(&cancel);if(document.canvasPixels()!=baseline||document.historyPosition()!=h||magicEraserDragging_||hasCapture())throw std::runtime_error("Repeated magic erase right cancel");
  }
 }
 fillTool_=magicEraserTool_=false;
 // Wand requests are asynchronous; release must settle the latest local seed.
 for(const auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both})for(int combine:{0,1,2,3})for(bool contiguous:{false,true})for(bool freeSource:{false,true}){
  std::optional<SelectionMask> expected;
  for(bool copy:{false,true}){
   document=Document(24,18);document.fillSelectionOrCanvas(0xff112233);document.beginStroke({12,0},0xff998877);document.updateStroke({12,17});document.commitStroke();if(freeSource){SelectionClipboard tile;tile.width=24;tile.height=18;tile.pixels=document.canvasPixels();document.createFreeTileLayer(U"Repeated wand source");document.pasteFreeTilePixels(tile,{0,0});document.setFreeTilePaintMode(false);}document.previewSelection(SelectionMask{1,1,8,8,{}});useSelectionTool(4);selectionMode_=combine;selectionPivotVisible_=false;wandOptions_={};wandOptions_.contiguous=contiguous;setTileRepeat(mode);refresh();const auto baseline=document.canvasPixels();const auto beforeSelection=document.selection();const auto h=document.historyPosition();const int ox=copy&&repeat::includesX(mode)?24:0,oy=copy&&repeat::includesY(mode)?-18:0;const TransformPoint start{ox+17.25,oy+10.25},end{ox+18.25,oy+11.25};
   auto settle=[&]{for(int step=0;selectionDragging_&&step<8;++step){if(wandWorker_.valid())wandWorker_.wait();wandTick();}if(selectionDragging_)throw std::runtime_error("Wand worker failed to settle");};
   send(ui::kMouseDownMessage,start);if(!selectionDragging_||selectionBoxDragging_||floatingDragging_)throw std::runtime_error("Repeated wand begins");send(ui::kMouseMoveMessage,end);send(ui::kMouseMoveMessage,{repeat::includesX(mode)?48.25:18.25,repeat::includesY(mode)?36.25:11.25});send(ui::kMouseUpMessage,end);settle();
   if(document.canvasPixels()!=baseline||hasCapture()||document.historyPosition()>h+1)throw std::runtime_error("Repeated wand content/history");if(!copy)expected=document.selection();else if(!selectionEqual(expected,document.selection()))throw std::runtime_error("Repeated wand copy differs");
   const auto after=document.selection();if(document.historyPosition()==h+1){document.undo();if(!selectionEqual(document.selection(),beforeSelection))throw std::runtime_error("Repeated wand undo");document.redo();if(!selectionEqual(document.selection(),after))throw std::runtime_error("Repeated wand redo");document.undo();}
   send(ui::kMouseDownMessage,start);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);if(wandWorker_.valid())wandWorker_.wait();wandTick();if(selectionDragging_||hasCapture()||!selectionEqual(document.selection(),beforeSelection)||document.canvasPixels()!=baseline)throw std::runtime_error("Repeated wand stale completion after Escape");
  }
 }
 selectionTool_=false;
 const auto before=zoom_;menuCommands_.invoke("tileRepeatOff");if(tileRepeat_!=repeat::Mode::Off||zoom_!=before)throw std::runtime_error("Repeat off changed zoom");
 setTileRepeat(repeat::Mode::Y);ensureProjects();storeActiveProject();restoreProject(activeProject_);if(tileRepeat_!=repeat::Mode::Y||tileRepeatIdentity_!=document.identity())throw std::runtime_error("Repeat session restoration");
 document=Document();tileRepeat_=repeat::Mode::Off;tileRepeatIdentity_=document.identity();refresh();
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
