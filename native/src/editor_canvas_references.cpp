#include "editor.h"
#include "editor_canvas_references.h"
#include "editor_canvas_references_state.h"
#include "os/sampling.h"
#include "ui/paint.h"
#include "ui/message.h"
#include "native_canvas_color_sampling.h"
#include "image_export.h"
#include "ui_frame_capture.h"
namespace moon::editor {
CanvasReferenceUiState::CanvasReferenceUiState(Editor& e):ui::Property("moonsprite.canvas-references"),importTimer(16,&e),animationTimer(16,&e){
 importTimer.Tick.connect([&e]{CanvasReferenceController::completeImport(e);});
 animationTimer.Tick.connect([&e]{CanvasReferenceController::tick(e);});
}
void CanvasReferenceController::completeImport(Editor& e){auto& s=canvasReferenceState(e);
 for(std::size_t i=0;i<s.imports.size();){
  if(s.imports[i].result.wait_for(std::chrono::seconds(0))!=std::future_status::ready){++i;continue;}
  auto pending=std::move(s.imports[i]);s.imports.erase(s.imports.begin()+i);const auto& request=pending.request;
  try{auto result=pending.result.get();const auto owner=request.owner.lock();if(!owner||owner->identity()!=request.identity)continue;
   const bool active=e.activeDocument_==owner;
   if(!active&&!e.resolveSession(request.identity))continue;
   std::string id=request.replace;bool changed=false;
   if(id.empty()){id="reference-"+std::to_string(owner->identity())+"-"+std::to_string(GetTickCount64());while(owner->canvasReference(id))id+='x';}
   // Prepare the display allocation before publishing a document/history edit.
   // A failed upload must leave an existing reference and its source untouched.
   CanvasReferenceUiState::Cached prepared;
   if(active){prepared.source=result.source;prepared.image=std::move(result.image);prepared.started=GetTickCount64();prepared.surface=os::instance()->makeRgbaSurface(prepared.image.width,prepared.image.height);if(!prepared.surface)throw std::bad_alloc();uploadRgbaRegion(*prepared.surface,prepared.image.pixels.data(),prepared.image.width,prepared.image.height,prepared.image.width,0,0);s.cache.try_emplace(id);}
   auto& selection=s.selected.try_emplace(request.identity).first->second;
   const auto& image=active?prepared.image:result.image;
   if(!request.replace.empty())changed=owner->replaceCanvasReference(id,result.source,image.width,image.height);
   else{CanvasReference r;r.id=id;r.name=request.name;r.src=result.source;r.x=request.point.x;r.y=request.point.y;const double scale=std::min(1.,240./std::max(image.width,image.height))/request.zoom;r.width=image.width*scale;r.height=image.height*scale;auto selected=id;changed=owner->addCanvasReference(r);if(changed)selection.swap(selected);}
   if(active&&changed){s.cache.at(id)=std::move(prepared);if(s.cache.at(id).image.animation)s.animationTimer.start();}
   if(active)e.refresh();
  }catch(const std::exception& ex){e.status_=U"参考图导入失败："+unicodeText(ex.what());e.refresh();}
 }
 if(s.imports.empty())s.importTimer.stop();
}
CanvasReferenceUiState::~CanvasReferenceUiState(){importTimer.stop();animationTimer.stop();dialog.reset();if(gestureOwner)gestureOwner->finishCanvasReference(true);}
void CanvasReferenceController::tick(Editor& e){
 auto& s=canvasReferenceState(e);bool active=false,changed=false;
 for(auto it=s.cache.begin();it!=s.cache.end();){const auto* r=e.currentDocument().canvasReference(it->first);if(!r||r->src!=it->second.source){it=s.cache.erase(it);continue;}auto& c=it->second;
  if(c.image.animation&&!c.failed){active=true;try{if(advanceCanvasReferenceImage(c.image,GetTickCount64()-c.started)){uploadRgbaRegion(*c.surface,c.image.pixels.data(),c.image.width,c.image.height,c.image.width,0,0);changed=true;}}catch(const std::exception& ex){c.failed=true;e.status_=U"参考图动画读取失败："+unicodeText(ex.what());changed=true;}}++it;
 }
 if(!active)s.animationTimer.stop();if(changed)e.invalidateRect(e.canvasViewport());
}
CanvasReferenceUiState& canvasReferenceState(Editor& e){auto p=std::dynamic_pointer_cast<CanvasReferenceUiState>(e.getProperty("moonsprite.canvas-references"));if(!p){p=std::make_shared<CanvasReferenceUiState>(e);e.setProperty(p);}return *p;}
ReferencePlacement CanvasReferenceController::screen(const Editor& e,const ReferencePlacement& r,bool floating){
 const auto stage=e.canvasViewport();const auto& rotation=e.currentView().rotation;
 return referenceScreenPlacement(r,floating,e.canvasScale()/uiScale,rotation.degrees,rotation.mirrorX,rotation.mirrorY,[&](TransformPoint p){const auto q=rotation.forward({e.currentView().canvas.x+p.x*e.canvasScale(),e.currentView().canvas.y+p.y*e.canvasScale()},e.canvasRotationPivot());return TransformPoint{(q.x-stage.x)/uiScale,(q.y-stage.y)/uiScale};});
}
ReferencePlacement CanvasReferenceController::document(const Editor& e,const ReferencePlacement& r){
 const auto stage=e.canvasViewport();const auto& rotation=e.currentView().rotation;
 return referenceDocumentPlacement(r,e.canvasScale()/uiScale,rotation.degrees,rotation.mirrorX,rotation.mirrorY,[&](TransformPoint p){const auto q=rotation.inverse({stage.x+p.x*uiScale,stage.y+p.y*uiScale},e.canvasRotationPivot());return TransformPoint{(q.x-e.currentView().canvas.x)/e.canvasScale(),(q.y-e.currentView().canvas.y)/e.canvasScale()};});
}
TransformPoint CanvasReferenceController::point(const Editor& e,gfx::Point p,bool floating){const auto stage=e.canvasViewport();return floating?TransformPoint{double(p.x-stage.x)/uiScale,double(p.y-stage.y)/uiScale}:e.canvasDocumentPoint(p);}
std::vector<const CanvasReference*> canvasReferenceDrawOrder(const Editor& e){std::vector<const CanvasReference*> out;for(const auto& r:e.currentDocument().canvasReferences())out.push_back(e.currentDocument().canvasReference(r.id));std::stable_sort(out.begin(),out.end(),[](auto a,auto b){return a->floating.value_or(false)<b->floating.value_or(false);});return out;}
CanvasReferenceUiState::Cached& canvasReferenceCached(Editor& e,const CanvasReference& r){
 auto& c=canvasReferenceState(e).cache[r.id];if(c.source==r.src)return c;c={};c.source=r.src;
 try{c.image=decodeCanvasReferenceImage(*r.src);c.started=GetTickCount64();c.surface=os::instance()->makeRgbaSurface(c.image.width,c.image.height);if(!c.surface)throw std::bad_alloc();uploadRgbaRegion(*c.surface,c.image.pixels.data(),c.image.width,c.image.height,c.image.width,0,0);if(c.image.animation)canvasReferenceState(e).animationTimer.start();}
 catch(const std::exception& ex){c.failed=true;e.status_=U"参考图读取失败："+unicodeText(ex.what());}return c;
}
std::optional<std::uint32_t> CanvasReferenceController::sample(Editor& e,gfx::Point p){
 if(!e.documentOpen_||e.homeOpen_||!e.canvasViewport().contains(p))return {};
 auto order=canvasReferenceDrawOrder(e);for(auto it=order.rbegin();it!=order.rend();++it){const auto& r=**it;const auto screen=CanvasReferenceController::screen(e,r,r.floating.value_or(false));const auto atPoint=CanvasReferenceController::point(e,p,true);auto& c=canvasReferenceCached(e,r);if(c.failed)continue;if(const auto at=referenceSourcePoint(screen,atPoint,c.image.width,c.image.height))return c.image.pixels[std::size_t(at->y)*c.image.width+at->x];}return {};
}
void CanvasReferenceController::paint(Editor& e,ui::Graphics& g){
 if(e.homeOpen_||!e.documentOpen_)return;
 auto& state=canvasReferenceState(e);
 for(auto it=state.cache.begin();it!=state.cache.end();){const auto* r=e.currentDocument().canvasReference(it->first);if(!r||r->src!=it->second.source)it=state.cache.erase(it);else ++it;}
 if(e.currentDocument().canvasReferences().empty())return;const auto stage=e.canvasViewport();const auto origin=e.bounds().origin();
 for(const auto* r:canvasReferenceDrawOrder(e)){auto& c=canvasReferenceCached(e,*r);if(c.failed)continue;auto screen=CanvasReferenceController::screen(e,*r,r->floating.value_or(false));const double a=screen.angle*3.141592653589793/180,co=std::cos(a),si=std::sin(a),w=screen.width*uiScale,h=screen.height*uiScale,cx=stage.x-origin.x+(screen.x+screen.width/2)*uiScale,cy=stage.y-origin.y+(screen.y+screen.height/2)*uiScale;
  const double sx=w/c.image.width*(screen.flipX?-1:1),sy=h/c.image.height*(screen.flipY?-1:1);g.save();g.concat(gfx::Matrix::MakeAll(float(co*sx),float(-si*sy),float(cx-co*sx*c.image.width/2+si*sy*c.image.height/2),float(si*sx),float(co*sy),float(cy-si*sx*c.image.width/2-co*sy*c.image.height/2),0,0,1));ui::Paint paint(gfx::rgba(255,255,255,int(std::floor(r->opacity.value_or(1)*255+.5))));paint.blendMode(os::BlendMode::SrcOver);const bool pixelated=e.runtimePreferences_.index("editing.referenceScaling.Select")==1;g.drawSurface(c.surface.get(),{0,0,c.image.width,c.image.height},{0,0,c.image.width,c.image.height},os::Sampling(pixelated?os::Sampling::Filter::Nearest:os::Sampling::Filter::Linear),&paint);g.restore();
 }
 const auto* selected=e.currentDocument().canvasReference(state.selected[e.currentDocument().identity()]);if(!selected)return;
 borderHit(e,screen(e,*selected,selected->floating.value_or(false)),stage.origin());
 if(state.outline)g.drawSurface(state.outline.get(),stage.x-origin.x,stage.y-origin.y);
}
void CanvasReferenceController::finish(Editor& e,bool cancel){auto& s=canvasReferenceState(e);if(!s.gestureOwner)return;const auto owner=s.gestureOwner;
 try{owner->finishCanvasReference(cancel);}catch(...){owner->finishCanvasReference(true);s.gestureOwner.reset();s.gestureId.clear();s.handle.clear();if(e.hasCapture())e.releaseMouse();e.refresh();throw;}
 s.gestureOwner.reset();s.gestureId.clear();s.handle.clear();if(e.hasCapture())e.releaseMouse();e.refresh();}
void CanvasReferenceController::close(Editor& e){const auto p=std::dynamic_pointer_cast<CanvasReferenceUiState>(e.getProperty("moonsprite.canvas-references"));if(!p)return;if(p->dialog){p->dialog->closeWindow(nullptr);p->dialog.reset();}CanvasReferenceController::finish(e,true);p->animationTimer.stop();p->cache.clear();}
void CanvasReferenceController::dispose(Editor& e){
 const auto p=std::dynamic_pointer_cast<CanvasReferenceUiState>(e.getProperty("moonsprite.canvas-references"));if(!p)return;
 p->importTimer.stop();p->animationTimer.stop();if(p->dialog){p->dialog->closeWindow(nullptr);p->dialog.reset();}
 if(p->gestureOwner){p->gestureOwner->finishCanvasReference(true);p->gestureOwner.reset();}
 e.removeProperty("moonsprite.canvas-references");
}
bool CanvasReferenceController::dragging(const Editor& e){const auto p=std::dynamic_pointer_cast<CanvasReferenceUiState>(e.getProperty("moonsprite.canvas-references"));return p&&bool(p->gestureOwner);}
bool CanvasReferenceController::borderHit(const Editor& editor,const ReferencePlacement& r,gfx::Point p){
 auto& e=const_cast<Editor&>(editor);auto& s=canvasReferenceState(e);const auto stage=e.canvasViewport();
 const auto material=e.skin_.assets.patches.find("selection.normal");if(stage.isEmpty()||material==e.skin_.assets.patches.end())return false;
 const auto& patch=material->second;const std::vector<double> key{r.x,r.y,r.width,r.height,r.angle,double(stage.w),double(stage.h),double(patch.left),double(patch.top),double(patch.right),double(patch.bottom)};
 if(key!=s.outlineKey||patch.bitmap.get()!=s.outlineMaterial){
  s.outlineKey=key;s.outlineMaterial=patch.bitmap.get();s.outline=os::instance()->makeRgbaSurface(stage.w,stage.h);s.outline->clear();
  // Rasterize the shared material once in the same physical display plane used
  // for hit testing. Rotation/fractional placement cannot disagree with alpha.
  if(r.width<100000000&&r.height<100000000){
   ui::Graphics g(s.outline);const double a=r.angle*3.141592653589793/180,c=std::cos(a),sn=std::sin(a);
   const int w=std::max(uiScale,int(std::floor(r.width+.5))*uiScale),h=std::max(uiScale,int(std::floor(r.height+.5))*uiScale);
   const double cx=(r.x+r.width/2)*uiScale,cy=(r.y+r.height/2)*uiScale;
   g.concat(gfx::Matrix::MakeAll(float(c),float(-sn),float(cx-c*w/2+sn*h/2),float(sn),float(c),float(cy-sn*w/2-c*h/2),0,0,1));
   UiPaintScale scale(g);e.skin_.drawSelectionBorder(g,{0,0,w,h},false);
  }
 }
 if(!stage.contains(p)||!s.outline||r.width>=100000000||r.height>=100000000)return false;
 const double a=r.angle*3.141592653589793/180,c=std::cos(a),sn=std::sin(a);
 const int w=std::max(uiScale,int(std::floor(r.width+.5))*uiScale),h=std::max(uiScale,int(std::floor(r.height+.5))*uiScale);
 const double dx=p.x-stage.x+.5-(r.x+r.width/2)*uiScale,dy=p.y-stage.y+.5-(r.y+r.height/2)*uiScale;
 const gfx::Point local{int(std::floor(dx*c+dy*sn+w/2)),int(std::floor(-dx*sn+dy*c+h/2))};
 // Skia rounds transformed nine-slice edges in device space. At fractional
 // edges its sampled texel can be adjacent to the analytic pixel-center texel.
 // Keep shared material hit semantics, then use the rendered alpha to resolve
 // that raster phase exactly, including transparent corners and center.
 if(!gfx::geta(s.outline->getPixel(p.x-stage.x,p.y-stage.y)))return false;
 const auto bounds=e.skin_.selectionMaterialBounds({0,0,w,h});
 for(int y=-1;y<=1;++y)for(int x=-1;x<=1;++x)
  if(e.skin_.selectionContains(bounds,{local.x+x,local.y+y}))return true;
 return false;
}
void CanvasReferenceController::properties(Editor& e,const std::string& id,gfx::Point position){
 auto& s=canvasReferenceState(e);if(s.dialog){s.dialog->closeWindow(nullptr);s.dialog.reset();}
 const auto owner=e.activeDocument_;const auto identity=owner->identity();s.selected[identity]=id;s.dialogId=id;
 auto read=[owner,id]{return owner->canvasReference(id);};
 auto changed=[&e,owner,id](ReferencePatch p){owner->updateCanvasReference(id,std::move(p));e.refresh();};
 auto action=[&e,owner,id](int n){const auto* value=owner->canvasReference(id);if(!value)return;const auto r=*value;ReferencePatch p;
  if(n==0)p.flipX=!r.flipX;else if(n==1)p.flipY=!r.flipY;else if(n==2)p.locked=!r.locked;
  else if(n==3){const bool fixed=r.floating.value_or(false);const auto target=fixed?document(e,r):screen(e,r,false);p.x=target.x;p.y=target.y;p.width=target.width;p.height=target.height;p.angle=target.angle;p.flipX=target.flipX;p.flipY=target.flipY;p.floating=!fixed;if(r.initial)p.initial=fixed?document(e,*r.initial):screen(e,*r.initial,false);}
  else if(n==4)owner->resetCanvasReference(id);else if(n==5)owner->bringCanvasReferenceToFront(id);else if(n==6)owner->removeCanvasReference(id);
  if(n<4)owner->updateCanvasReference(id,p);
  if(n==2||n==6)canvasReferenceState(e).selected[owner->identity()].clear();e.refresh();};
 s.dialog=std::make_unique<CanvasReferenceDialog>(e.font_,e.skin_,e.toolIcons_,read,changed,action,[owner,id](bool end){if(end)owner->finishCanvasReference();else owner->beginCanvasReference(id);});
 s.dialog->setDisplay(e.display(),false);const auto size=s.dialog->minimumDialogSize(0);const auto box=e.bounds();
 s.dialog->setBounds({std::clamp(position.x,box.x,std::max(box.x,box.x2()-size.w)),std::clamp(position.y,box.y,std::max(box.y,box.y2()-size.h)),size.w,size.h});s.dialog->openWindow();e.invalidate();
}
void CanvasReferenceController::paste(Editor& e,TransformPoint at,double zoom,const std::string& replace){
 auto& s=canvasReferenceState(e);if(std::any_of(s.imports.begin(),s.imports.end(),[&](const auto& p){return p.request.paste&&p.request.identity==e.currentDocument().identity();}))return;
 try{const auto clipboard=e.pixelClipboard_.readReferenceImage();if(!clipboard){e.status_=U"剪贴板中没有图像";e.refresh();return;}
  auto bytes=encodeRgbaImagePng(clipboard->width,clipboard->height,clipboard->pixels).png;
  auto source=std::make_shared<const std::string>(canvasReferenceDataUrl(bytes));
  std::promise<CanvasReferenceUiState::Loaded> ready;ready.set_value({source,{clipboard->width,clipboard->height,clipboard->pixels}});s.imports.push_back({{e.activeDocument_,e.currentDocument().identity(),at,zoom,"粘贴的参考图",replace,true},ready.get_future()});completeImport(e);
 }catch(const std::exception& ex){e.status_=U"参考图粘贴失败："+unicodeText(ex.what());e.refresh();}
}
void CanvasReferenceController::importFile(Editor& e,TransformPoint at,double zoom){
 auto& s=canvasReferenceState(e);const auto owner=e.activeDocument_;const auto identity=owner->identity();
 wchar_t file[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=file;dialog.nMaxFile=32768;dialog.lpstrFilter=L"参考图像\0*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp;*.ico;*.svg\0所有文件\0*.*\0\0";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_FILEMUSTEXIST;
 if(!e.chooseOpenFile_(&dialog))return;const std::filesystem::path path(file);
 s.imports.push_back({{owner,identity,at,zoom,path.filename().u8string(),{}},std::async(std::launch::async,[path]{auto source=std::make_shared<const std::string>(readCanvasReferenceSource(path));return CanvasReferenceUiState::Loaded{source,decodeCanvasReferenceImage(*source)};})});s.importTimer.start();
}
void CanvasReferenceController::addMenu(Editor& e,gfx::Point p){
 const auto at=point(e,p,false);const double zoom=e.canvasScale()/uiScale;PixelMenu menu(e.skin_);int chosen=-1;
 auto add=[&](const char32_t* label,int n){auto item=new PixelMenuItem(e.font_,e.skin_,label);item->Click.connect([&chosen,n]{chosen=n;});menu.addChild(item);return item;};
 add(U"添加画布参考图",0);auto clipboard=add(U"粘贴为画布参考图",1);try{clipboard->setEnabled(bool(e.pixelClipboard_.readReferenceImage()));}catch(const std::exception&){clipboard->setEnabled(false);}
 menu.showPopup(p,e.display());e.requestFocus();if(chosen==0)importFile(e,at,zoom);else if(chosen==1)paste(e,at,zoom);
}
bool CanvasReferenceController::command(Editor& e,const std::string& command){
 if(command!="paste"&&command!="deleteSelection"&&command!="deleteLayer")return false;
 const auto state=std::dynamic_pointer_cast<CanvasReferenceUiState>(e.getProperty("moonsprite.canvas-references"));if(!state||!e.documentOpen_||e.homeOpen_)return false;
 const auto* r=e.currentDocument().canvasReference(state->selected[e.currentDocument().identity()]);if(!r)return false;
 if(r->locked||state->gestureOwner)return true;const auto id=r->id;
 if(command=="paste")paste(e,{0,0},e.canvasScale()/uiScale,id);else{e.currentDocument().removeCanvasReference(id);state->selected[e.currentDocument().identity()].clear();if(state->dialog)state->dialog->closeWindow(nullptr);e.refresh();}return true;
}
const char* CanvasReferenceController::cursor(const Editor& e,gfx::Point p){
 const auto state=std::dynamic_pointer_cast<CanvasReferenceUiState>(e.getProperty("moonsprite.canvas-references"));if(!state||!e.canvasViewport().contains(p))return nullptr;
 if(!state->gestureOwner&&(e.spaceHeld_||e.currentPlayback().playing||e.currentTools().handTool||e.currentTools().zoomTool||e.currentTools().rotateTool))return nullptr;
 const auto id=state->gestureOwner?state->gestureId:state->selected[e.currentDocument().identity()];
 auto order=canvasReferenceDrawOrder(e);for(auto it=order.rbegin();it!=order.rend();++it){const auto& r=**it;if(r.locked)continue;const auto q=point(e,p,r.floating.value_or(false));
  const auto handle=state->gestureOwner?state->handle:r.id==id?referenceTransformHit(r,q,r.floating.value_or(false)?1:uiScale/e.canvasScale()):std::string{};
  if(r.id!=id&&state->gestureOwner)continue;
  if(!state->gestureOwner&&!referenceSourcePoint(r,q,1,1)&&handle.empty()&&!(r.id==id&&borderHit(e,screen(e,r,r.floating.value_or(false)),p)))continue;
  if(e.currentTools().eyedropperTool||e.eyedropperHeld_||e.paletteSamplingHeld_)return "eyedropper";
  if(handle.empty())return "move";const auto displayed=screen(e,r,r.floating.value_or(false));
  if(handle.rfind("rotate-",0)==0){const auto local=referenceUnrotate(displayed,point(e,p,true));const double dx=local.x-displayed.x-displayed.width/2,dy=local.y-displayed.y-displayed.height/2;const double a=displayed.angle*3.141592653589793/180;const double x=dx*std::cos(a)-dy*std::sin(a),y=dx*std::sin(a)+dy*std::cos(a);if(std::abs(x)<=std::abs(y)*(std::sqrt(2.)-1))return y<0?"selection-rotate-n":"selection-rotate-s";return y<0?(x<0?"selection-rotate-nw":"selection-rotate-ne"):(x<0?"selection-rotate-sw":"selection-rotate-se");}
  const double direction=displayed.angle+(handle=="n"||handle=="s"?90:handle=="nw"||handle=="se"?45:handle=="ne"||handle=="sw"?-45:0);const int bucket=(int(std::floor(direction/45+.5))%4+4)%4;return bucket==0?"ew-resize":bucket==1?"nwse-resize":bucket==2?"ns-resize":"nesw-resize";
 }return nullptr;
}
bool CanvasReferenceController::process(Editor& e,ui::Message* msg){
 const auto state=std::dynamic_pointer_cast<CanvasReferenceUiState>(e.getProperty("moonsprite.canvas-references"));
 if(state&&state->dialog&&state->dialog->isVisible()&&(msg->type()==ui::kMouseWheelMessage||msg->type()==ui::kMouseDownMessage||msg->type()==ui::kKeyDownMessage))state->dialog->closeWindow(nullptr);
 if(e.pending_!=Editor::Pending::None||!e.documentOpen_||e.homeOpen_){if(state&&state->gestureOwner)finish(e,true);return false;}
 if(state&&state->gestureOwner){auto& s=*state;
  if(s.gestureOwner!=e.activeDocument_||!e.hasCapture()||msg->type()==ui::kFocusLeaveMessage){finish(e,true);return false;}
  if(msg->type()==ui::kMouseUpMessage){finish(e,static_cast<ui::MouseMessage*>(msg)->button()!=ui::kButtonLeft);return true;}
  if(auto key=dynamic_cast<ui::KeyMessage*>(msg);key&&msg->type()==ui::kKeyDownMessage&&(key->scancode()==ui::kKeyEsc||key->scancode()==ui::kKeyEnter)){finish(e,key->scancode()==ui::kKeyEsc);return true;}
  const bool moving=msg->type()==ui::kMouseMoveMessage;const bool modifier=msg->type()==ui::kKeyDownMessage||msg->type()==ui::kKeyUpMessage;
  if(moving||modifier){if(moving){s.lastDisplay=static_cast<ui::MouseMessage*>(msg)->position();s.last=point(e,s.lastDisplay,s.start.floating.value_or(false));}
   const TransformPoint delta{s.last.x-s.pointerStart.x,s.last.y-s.pointerStart.y};ReferencePatch p;
   if(s.handle.rfind("rotate-",0)==0){const double cx=s.start.x+s.start.width/2,cy=s.start.y+s.start.height/2;double angle=s.start.angle+(std::atan2(s.last.y-cy,s.last.x-cx)-std::atan2(s.pointerStart.y-cy,s.pointerStart.x-cx))*180/3.141592653589793;if(e.moveModifierHeld("snapSelectionRotation",*msg))angle=std::floor(angle/45+.5)*45;p.angle=angle;}
   else if(!s.handle.empty()){const auto target=resizeReferenceBounds(s.start,delta,s.handle,e.moveModifierHeld("integerSelectionScale",*msg),msg->altPressed()||e.tabletAssist_.modifier(e.currentDocument().identity(),1));p.x=target.x;p.y=target.y;p.width=target.width;p.height=target.height;p.flipX=target.flipX;p.flipY=target.flipY;}
   else{auto d=delta;if(e.moveModifierHeld("constrainAxis",*msg)){if(std::abs(d.x)>=std::abs(d.y))d.y=0;else d.x=0;}p.x=s.start.x+d.x;p.y=s.start.y+d.y;}
   s.gestureOwner->updateCanvasReference(s.gestureId,p);e.refresh();e.updateNavigationCursor();return true;
  }return dynamic_cast<ui::MouseMessage*>(msg)!=nullptr;
 }
 const auto mouse=dynamic_cast<ui::MouseMessage*>(msg);if(!mouse)return false;const auto p=mouse->position();
 if(!e.canvasViewport().contains(p)||e.hasCapture()||e.topFloatingColumnAt(p)>=0)return false;
 const bool navigation=e.spaceHeld_||e.currentPlayback().playing||e.currentTools().handTool||e.currentTools().zoomTool||e.currentTools().rotateTool||mouse->middle();if(navigation)return false;
 const bool sampling=e.currentTools().eyedropperTool||e.eyedropperHeld_||e.paletteSamplingHeld_||e.replaceSampling_>=0||e.colorEditorSampling_;
 if(msg->type()!=ui::kMouseDownMessage&&msg->type()!=ui::kDoubleClickMessage)return false;
 auto& s=canvasReferenceState(e);auto& selected=s.selected[e.currentDocument().identity()];auto order=canvasReferenceDrawOrder(e);
 for(auto it=order.rbegin();it!=order.rend();++it){const auto& r=**it;const bool wasSelected=r.id==selected;const auto q=point(e,p,r.floating.value_or(false));const auto handle=wasSelected&&!r.locked?referenceTransformHit(r,q,r.floating.value_or(false)?1:uiScale/e.canvasScale()):std::string{};
  if(!referenceSourcePoint(r,q,1,1)&&handle.empty()&&!(wasSelected&&borderHit(e,screen(e,r,r.floating.value_or(false)),p)))continue;
  const bool centerResize=wasSelected&&!handle.empty()&&mouse->altPressed();if(sampling&&!centerResize)return false;
  if(r.locked&&!mouse->right())continue;
  selected=r.id;if(mouse->right()){properties(e,r.id,p);return true;}if(!mouse->left())return false;
  e.requestFocus();s.start=r;s.gestureId=r.id;s.handle=handle;s.pointerStart=s.last=q;s.lastDisplay=p;s.gestureOwner=e.activeDocument_;s.gestureOwner->beginCanvasReference(r.id);e.captureMouse();e.updateNavigationCursor();e.refresh();return true;
 }
 if(mouse->left())selected.clear();
 if(msg->type()==ui::kDoubleClickMessage&&!e.canvasDocumentContains(p)){addMenu(e,p);return true;}return false;
}
void Editor::smokeCanvasReferences(){CanvasReferenceController::check(*this);}
void CanvasReferenceController::check(Editor& e){
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};
 e.smoke_=true;e.documentOpen_=true;e.homeOpen_=false;e.pending_=Editor::Pending::None;
 close(e);e.replaceDocumentForSmoke(Document(16,16));e.currentTools().handTool=e.currentTools().zoomTool=e.currentTools().rotateTool=e.currentTools().eyedropperTool=false;
 e.eyedropperHeld_=e.paletteSamplingHeld_=e.spaceHeld_=false;e.currentPlayback().playing=false;e.currentView().rotation={};e.currentView().zoom=2;e.refresh();
 const auto pixels=e.currentDocument().pixels();const auto content=e.currentDocument().contentRevision();
 CanvasReference r;r.id="ui-reference";r.name="参考图.png";r.src=std::make_shared<const std::string>(canvasReferenceDataUrl(encodeRgbaImagePng(2,1,{0x800000ff,0xff00ff00}).png));r.x=40;r.y=32;r.width=96;r.height=64;r.floating=true;
 e.currentDocument().addCanvasReference(r);auto& s=canvasReferenceState(e);const auto stage=e.canvasViewport();
 auto pointer=[&](ui::MessageType type,int x,int y,ui::MouseButton button=ui::kButtonLeft,ui::KeyModifiers modifiers=ui::kKeyNoneModifier){ui::MouseMessage msg(type,os::PointerType::Mouse,button,modifiers,{stage.x+x,stage.y+y});return process(e,&msg);};
 check(sample(e,{stage.x+100,stage.y+90})==0x800000ff,"Reference samples original alpha");
 check(sample(e,{stage.x+220,stage.y+90})==0xff00ff00,"Reference source coordinate mapping");
 check(pointer(ui::kMouseDownMessage,176,128)&&dragging(e),"Reference actual pointer selection");
 check(pointer(ui::kMouseMoveMessage,196,148),"Reference pointer preview");
 check(e.currentDocument().canvasReference(r.id)->x==50&&e.currentDocument().canvasReferences()[0].x==40,"Reference preview is separate from persistence");
 check(pointer(ui::kMouseUpMessage,216,168)&&!dragging(e)&&e.currentDocument().historySize()==2&&e.currentDocument().canvasReference(r.id)->x==50,"Reference release commits last move once");
 e.currentPlayback().playing=true;e.requestHistoryAction(workspace::HistoryAction::Undo);check(!e.currentPlayback().playing&&e.currentDocument().canvasReference(r.id)->x==40,"Reference UI undo stops playback");e.requestHistoryAction(workspace::HistoryAction::Redo);
 SelectionClipboard floating;floating.width=floating.height=1;floating.pixels={0xff123456};check(e.currentDocument().beginFloatingPaste(floating,0,0),"Reference floating undo fixture");const auto history=e.currentDocument().historyPosition();
 e.requestHistoryAction(workspace::HistoryAction::Undo);check(!e.currentDocument().floating()&&e.currentDocument().historyPosition()==history&&e.currentDocument().canvasReference(r.id)->x==50,"Floating cancel precedes reference undo");
 check(e.currentDocument().pixels()==pixels,"Floating fixture restores artwork");const auto settledContent=e.currentDocument().contentRevision();
 check(pointer(ui::kMouseDownMessage,196,148),"Reference second drag");pointer(ui::kMouseMoveMessage,206,158);
 ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);check(process(e,&escape)&&e.currentDocument().canvasReference(r.id)->x==50&&e.currentDocument().historySize()==2,"Escape cancels reference drag");
 e.spaceHeld_=true;check(!pointer(ui::kMouseDownMessage,196,148),"Space navigation precedes reference selection");e.spaceHeld_=false;
 check(!pointer(ui::kMouseDownMessage,196,148,ui::kButtonMiddle),"Middle navigation precedes reference selection");
 ReferencePatch p;p.locked=true;e.currentDocument().updateCanvasReference(r.id,p);check(!pointer(ui::kMouseDownMessage,196,148),"Locked reference left click passes through");
 check(pointer(ui::kMouseDownMessage,196,148,ui::kButtonRight)&&s.dialog&&s.dialog->isVisible(),"Locked reference reserves right pointer before painting");
 check(command(e,"deleteSelection")&&e.currentDocument().canvasReference(r.id),"Locked selected delete consumed");
 s.dialog->buttons_[2]->Click();check(!e.currentDocument().canvasReference(r.id)->locked,"Reference dialog unlock control");
 s.dialog->fields_[0]->setText("62.5");s.dialog->fields_[0]->Change();check(e.currentDocument().canvasReference(r.id)->x==62.5,"Reference numeric X field");
 const auto beforeSlider=e.currentDocument().historySize();s.dialog->sliders_[2]->interactionBegin();s.dialog->sliders_[2]->changed(60);s.dialog->sliders_[2]->changed(35);s.dialog->sliders_[2]->interactionCommit();check(e.currentDocument().historySize()==beforeSlider+1&&e.currentDocument().canvasReference(r.id)->opacity==.35,"Reference opacity slider groups one entry");
 s.dialog->buttons_[0]->Click();check(e.currentDocument().canvasReference(r.id)->flipX,"Reference flip control");s.dialog->buttons_[4]->Click();check(!e.currentDocument().canvasReference(r.id)->flipX,"Reference reset control");
 s.dialog->buttons_[3]->Click();check(!e.currentDocument().canvasReference(r.id)->floating.value_or(false),"Reference reattach control");s.dialog->buttons_[3]->Click();check(e.currentDocument().canvasReference(r.id)->floating.value_or(false),"Reference fixed control");
 ui::FocusMessage outside(ui::kFocusLeaveMessage,s.dialog->fields_[0],&e);s.dialog->onProcessMessage(&outside);check(!s.dialog->isVisible(),"Reference properties dismiss on outside focus");s.dialog.reset();e.requestFocus();
 for(double angle:{0.,37.,90.,-45.}){
  ReferencePlacement placement;placement.x=30.25;placement.y=24.75;placement.width=96;placement.height=64;placement.angle=angle;
  borderHit(e,placement,stage.origin());check(bool(s.outline),"Reference outline surface");
  for(int y=0;y<std::min(stage.h,300);++y)for(int x=0;x<std::min(stage.w,360);++x){
   const bool visible=gfx::geta(s.outline->getPixel(x,y))!=0;
   if(borderHit(e,placement,{stage.x+x,stage.y+y})!=visible)throw std::runtime_error("Reference shared selection material alpha/hit mismatch angle="+std::to_string(angle)+" x="+std::to_string(x)+" y="+std::to_string(y)+" visible="+std::to_string(visible));
  }
 }
 e.currentView().rotation.degrees=37;e.currentView().rotation.mirrorX=true;
 const auto original=*e.currentDocument().canvasReference(r.id);const auto normal=document(e,original);const auto fixed=screen(e,normal,false);
 check(std::abs(fixed.x-original.x)<1e-8&&std::abs(fixed.y-original.y)<1e-8&&std::abs(fixed.angle-original.angle)<1e-8,"Reference fixed conversion preserves continuous placement");
 e.currentView().rotation={};s.selected[e.currentDocument().identity()]=r.id;
 // Exercise the actual Editor input adapter, including overlay sampling outside
 // the finite artwork. Transparent source alpha must survive the registry.
 const auto samplePoint=gfx::Point(stage.x+150,stage.y+100);const auto raw=sample(e,samplePoint);check(raw.has_value(),"Reference routed sampling fixture");
 e.currentTools().eyedropperTool=true;ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,samplePoint);e.onProcessMessage(&down);ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,samplePoint);e.onProcessMessage(&up);check(e.currentDocument().palette().primary==*raw&&!dragging(e),"Reference actual eyedropper routing");e.currentTools().eyedropperTool=false;
 check(sampleNativeCanvasColor(e.display()->nativeWindow()->pointToScreen(samplePoint))==raw,"Reference native registered raw sample");
 properties(e,r.id,{stage.x+300,stage.y+40});e.refresh();e.invalidate();e.manager()->flushRedraw();e.manager()->dispatchMessages();
 writeSmokeFrame(e.display()->nativeSurface().get(),e.assets_.parent_path()/"canvas-references-smoke.bmp");
 check(e.currentDocument().pixels()==pixels&&e.currentDocument().contentRevision()==settledContent,"Reference UI must not modify artwork");
 close(e);
 // Pending reads retain their original document, even while another tab is
 // active. Closed or replaced owners and failed replacements publish no edit.
 e.ensureProjects();const auto originalOwner=e.activeDocument_;const auto originalIndex=e.activeProject_;
 std::promise<CanvasReferenceUiState::Loaded> pending;
 s.imports.push_back({{originalOwner,originalOwner->identity(),{3,4},2,"async.png",{}},pending.get_future()});
 e.addProject(Document(4,4));const auto other=e.activeDocument_;const auto otherHistory=other->historySize();
 pending.set_value({r.src,decodeCanvasReferenceImage(*r.src)});completeImport(e);
 check(originalOwner->canvasReferences().size()==2&&other->canvasReferences().empty()&&other->historySize()==otherHistory,"Import completion belongs to original open document");
 auto closed=std::make_shared<Document>(2,2);std::promise<CanvasReferenceUiState::Loaded> orphan;
 s.imports.push_back({{closed,closed->identity(),{0,0},1,"closed.png",{}},orphan.get_future()});
 orphan.set_value({r.src,decodeCanvasReferenceImage(*r.src)});completeImport(e);
 check(closed->canvasReferences().empty(),"Closed import owner is not mutated");
 e.activateProject(originalIndex);const auto beforeFailure=*originalOwner->canvasReference(r.id);const auto beforeFailureHistory=originalOwner->historySize();
 std::promise<CanvasReferenceUiState::Loaded> failed;
 s.imports.push_back({{originalOwner,originalOwner->identity(),{},1,"",r.id,true},failed.get_future()});failed.set_exception(std::make_exception_ptr(std::runtime_error("Decode failure fixture")));completeImport(e);
 check(sameReference(*originalOwner->canvasReference(r.id),beforeFailure)&&originalOwner->historySize()==beforeFailureHistory&&s.imports.empty(),"Failed replacement preserves source, placement and history");
 close(e);e.replaceDocumentForSmoke(Document());e.refresh();
}
}
