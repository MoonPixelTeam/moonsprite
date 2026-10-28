#pragma once
#include "document.h"
#include "free_tile_instance_properties_dialog.h"
#include "timeline_button.h"
#include "ui/resize_event.h"
#include "ui/paint_event.h"
#include "ui/message.h"
#include "ui/manager.h"
#include "ui/graphics.h"
#include "ui/timer.h"
#include "ui_scale.h"
#include "os/system.h"
#include "os/surface.h"
namespace moon {
// Legacy LayersPanel integrated instance view and FreeTileInstanceLayers row
// selection. Native timeline skin/font/icons remain shared with ordinary rows.
class FreeTileInstancesPanel final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;Document& doc_;
 TimelineButton painter_;
 PixelButton* back_;PixelScrollBar* bar_;int scroll_=0;std::string target_;
 struct Toggle {int control,start;bool value;std::uint64_t identity;std::string cel;};
 std::optional<Toggle> toggle_;
 struct Drag {std::string id,target;gfx::Point start;std::uint64_t identity;std::string cel;bool moved=false,before=true,flashOnClick=false;};
 std::optional<Drag> drag_;
 void cancelDrag(){if(!drag_)return;drag_.reset();if(hasCapture())releaseMouse();invalidate();}
 void updateDrag(gfx::Point point){
  if(!drag_)return;const auto delta=point-drag_->start;if(!drag_->moved&&double(delta.x)*delta.x+double(delta.y)*delta.y<16*uiScale*uiScale)return;
  drag_->moved=true;const auto order=ids();if(order.empty()){drag_->target.clear();return;}
  const auto v=viewport();const int row=std::clamp((std::max(point.y,v.y-scroll_)-v.y+scroll_)/(20*uiScale),0,int(order.size())-1);
  drag_->target=order[row];drag_->before=point.y<rowBounds(row).center().y;invalidate();
 }
 void finishDrag(){
  if(!drag_)return;const auto d=*drag_;cancelDrag();
  if(d.identity!=doc_.identity()||d.cel!=doc_.cel().id||doc_.active())return;
  if(d.moved){if(!d.target.empty()&&d.target!=d.id)doc_.reorderFreeTileInstance(d.id,d.target,d.before);}
  else {doc_.selectFreeTileInstance(d.id);if(d.flashOnClick&&flashInstance)flashInstance(d.id);}
  notify();
 }

 std::vector<PixelButton*> properties_;
 std::vector<std::string> ids()const{std::vector<std::string> out;if(doc_.freeTileInstanceView()&&doc_.cel().freeTiles)for(auto i=doc_.cel().freeTiles->instances.rbegin();i!=doc_.cel().freeTiles->instances.rend();++i)out.push_back(i->id);return out;}
 gfx::Rect viewport()const{const auto b=bounds();return {b.x,b.y+22*uiScale,std::max(1,b.w-7*uiScale),std::max(1,b.h-22*uiScale)};}
 gfx::Rect rowBounds(int row)const{auto v=viewport();return {v.x,v.y+row*20*uiScale-scroll_,v.w,20*uiScale};}
 int rowAt(gfx::Point p)const{const auto v=viewport();if(!v.contains(p))return -1;const int row=(p.y-v.y+scroll_)/(20*uiScale);return row<int(ids().size())?row:-1;}
 int controlAt(gfx::Point p,int row)const{const auto b=rowBounds(row);for(int c=0;c<2;++c)if(gfx::Rect(b.x+(1+c*12)*uiScale,b.y+4*uiScale,11*uiScale,11*uiScale).contains(p))return c;return -1;}
 void notify(){if(changed)changed();invalidate();}
 void finishToggle(){if(!toggle_)return;const auto gesture=*toggle_;toggle_.reset();if(hasCapture())releaseMouse();if(gesture.identity==doc_.identity()&&gesture.cel==doc_.cel().id&&doc_.freeTileInstanceFlagsActive())doc_.commitFreeTilePlacement();notify();}
 void updateToggle(int row){if(!toggle_)return;const auto order=ids();std::vector<std::string> range;for(int n=std::min(row,toggle_->start);n<=std::max(row,toggle_->start)&&n<int(order.size());++n)range.push_back(order[n]);doc_.previewFreeTileInstanceFlags(range,toggle_->value);notify();}
 std::vector<std::string> deleteTargets(const std::string& id)const{auto selected=doc_.selectedFreeTileInstances();return std::find(selected.begin(),selected.end(),id)!=selected.end()?selected:std::vector<std::string>{id};}
 void deleteSelection(){if(doc_.deleteFreeTileInstances(doc_.selectedFreeTileInstances()))notify();}
 void showOnly(const std::string& id){if(doc_.showOnlyFreeTileInstance(id))notify();}
 void rotateClockwise(const std::string& id){const auto& all=doc_.cel().freeTiles->instances;const auto it=std::find_if(all.begin(),all.end(),[&](const auto& instance){return instance.id==id;});if(it==all.end()||it->locked)return;Document::FreeTileInstanceChanges changes;changes.rotation=(it->rotation+1)%4;if(doc_.setFreeTileInstanceProperties(id,changes))notify();}
 void mirror(const std::string& id,bool horizontal){const auto& all=doc_.cel().freeTiles->instances;const auto it=std::find_if(all.begin(),all.end(),[&](const auto& instance){return instance.id==id;});if(it==all.end()||it->locked)return;Document::FreeTileInstanceChanges changes;if(horizontal)changes.flipHorizontal=!it->flipHorizontal;else changes.flipVertical=!it->flipVertical;if(doc_.setFreeTileInstanceProperties(id,changes))notify();}
 void showProperties(const std::string& id,bool verify=false){
  if(!doc_.freeTileInstanceView()||!doc_.cel().freeTiles)return;
  const auto& instances=doc_.cel().freeTiles->instances;const auto found=std::find_if(instances.begin(),instances.end(),[&](const auto& i){return i.id==id;});
  if(found==instances.end())return;const auto instance=*found;const auto& sources=doc_.layer().freeTiles->sources;const auto sourceId=instance.sourceId.empty()?instance.tileId:instance.sourceId;
  const auto source=std::find_if(sources.begin(),sources.end(),[&](const auto& s){return s.id==sourceId||s.tilesetId==sourceId;});const auto rect=doc_.freeTileInstanceBounds(id);if(source==sources.end()||!rect)return;
  const auto initialSource=*source;const auto targets=deleteTargets(id);if(targets.size()==1&&doc_.selectedFreeTileInstances()!=targets){doc_.selectFreeTileInstance(id);if(flashInstance)flashInstance(id);notify();}const auto identity=doc_.identity();
  if(!doc_.beginFreeTileInstanceProperties(targets))return;
  try{FreeTileInstancePropertiesDialog popup(font_,skin_,icons_,instance,initialSource,*rect,targets.size()>1,caption?caption(initialSource.name):U"",[this,identity](const auto& changes){if(doc_.identity()==identity&&doc_.previewFreeTileInstanceProperties(changes))notify();});popup.setDisplay(display(),false);const auto size=popup.minimumDialogSize(0);const auto center=bounds().center();popup.setBounds({center.x-size.w/2,center.y-size.h/2,size.w,size.h});ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{timer.stop();popup.smoke();});timer.start();}popup.openWindowInForeground();if(doc_.identity()==identity&&doc_.freeTileInstancePropertiesActive())doc_.commitFreeTilePlacement();}
  catch(...){if(doc_.identity()==identity&&doc_.freeTileInstancePropertiesActive())doc_.cancelFreeTilePlacement();notify();throw;}
  notify();requestFocus();
 }
 void buildContextMenu(PixelMenu& menu,const std::string& id){
  const auto selected=doc_.selectedFreeTileInstances();if(std::find(selected.begin(),selected.end(),id)==selected.end()){doc_.selectFreeTileInstance(id);if(flashInstance)flashInstance(id);notify();}
  const auto targets=deleteTargets(id);const auto& all=doc_.cel().freeTiles->instances;const auto instance=std::find_if(all.begin(),all.end(),[&](const auto& value){return value.id==id;});if(instance==all.end())return;const bool transformable=!instance->locked;
  auto add=[&](std::u32string label,const char* icon,std::function<void()> action,bool enabled=true){auto item=new PixelMenuItem(font_,skin_,std::move(label));item->iconSkin=&icons_;item->icon=icon;item->setEnabled(enabled);item->Click.connect(std::move(action));menu.addChild(item);return item;};
  add(U"仅显示此实例","eye",[this,id]{showOnly(id);});
  add(U"属性","properties",[this,id]{showProperties(id);});menu.addChild(new PixelMenuSeparator(skin_));
  add(U"顺时针旋转 90°","rotateClockwise90",[this,id]{rotateClockwise(id);},transformable);
  add(U"水平镜像","selectionFlipHorizontal",[this,id]{mirror(id,true);},transformable);
  add(U"垂直镜像","selectionFlipVertical",[this,id]{mirror(id,false);},transformable);menu.addChild(new PixelMenuSeparator(skin_));
  add(U"删除","delete",[this,targets]{if(doc_.deleteFreeTileInstances(targets))notify();},doc_.canDeleteFreeTileInstances(targets));
 }
 void showContext(const std::string& id,gfx::Point at){PixelMenu menu(skin_);buildContextMenu(menu,id);menu.showPopup(at,display());requestFocus();
 }
 std::vector<gfx::Rect> selectionBorders()const{
  const auto order=ids(),selected=doc_.selectedFreeTileInstances();std::vector<gfx::Rect> result;
  for(int i=0;i<int(order.size());++i)if(std::find(selected.begin(),selected.end(),order[i])!=selected.end()){
   auto b=rowBounds(i);const int controls=std::min(b.w,24*uiScale);b.x+=controls;b.w-=controls;if(b.isEmpty())continue;if(!result.empty()&&result.back().y2()==b.y)result.back().h+=b.h;else result.push_back(b);
  }return result;
 }
 void layout(){const auto b=bounds();back_->setBounds({b.x,b.y,15*uiScale,15*uiScale});const auto v=viewport();const int total=int(ids().size())*20*uiScale;scroll_=std::clamp(scroll_,0,std::max(0,total-v.h));bar_->setDockBounds(PixelScrollBar::gridBounds(v,true));bar_->configure(total,v.h,scroll_);bar_->setVisible(total>v.h);const auto order=ids();while(properties_.size()<order.size()){const auto n=properties_.size();auto button=new PixelButton(font_,skin_,U"",[this,n]{const auto current=ids();if(n<current.size())showProperties(current[n]);});button->iconSkin=&icons_;button->icon="properties";addChild(button);properties_.push_back(button);}for(std::size_t n=0;n<properties_.size();++n){const auto row=rowBounds(int(n));properties_[n]->setBounds({row.x2()-17*uiScale,row.y+2*uiScale,15*uiScale,15*uiScale});properties_[n]->setVisible(n<order.size()&&row.y>=v.y&&row.y2()<=v.y2());}}
public:
 std::function<void()> changed;
 std::function<void(const std::string&)> flashInstance;
 void openSelectedProperties(){if(!isVisible()||doc_.active()||!doc_.freeTileInstanceView())return;auto id=doc_.primaryFreeTileInstance();const auto selected=doc_.selectedFreeTileInstances();if(id.empty()&&!selected.empty())id=selected.front();if(!id.empty())showProperties(id); }
 FreeTileInstancesPanel(const PixelFont& font,const Skin& skin,const Skin& icons,Document& doc):ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),icons_(icons),doc_(doc),painter_(font,skin,U"",{}){
  setTransparent(false);setFocusStop(true);
  back_=new PixelButton(font,skin,U"",[this]{doc_.setFreeTileInstanceView(false);if(changed)changed();});back_->iconSkin=&icons;back_->icon="left";addChild(back_);
  bar_=new PixelScrollBar(skin,true);addChild(bar_);bar_->wheelStep=20*uiScale;bar_->changed=[this](int v){scroll_=v;layout();invalidate();};
 }
 void sync(){const auto key=std::to_string(doc_.identity())+"/"+doc_.layer().id+"/"+doc_.frame().id;if(target_!=key){target_=key;scroll_=0;toggle_.reset();cancelDrag();if(hasCapture())releaseMouse();}layout();setEnabled(!doc_.active()||(toggle_&&doc_.freeTileInstanceFlagsActive()));invalidate();}
 bool borderHit(gfx::Point p)const{if(!viewport().contains(p))return false;for(const auto& b:selectionBorders())if(skin_.selectionContains(skin_.selectionMaterialBounds(b),p))return true;return false;}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layout();}
 bool onProcessMessage(ui::Message* msg)override{
  if(drag_){
   if(drag_->identity!=doc_.identity()||drag_->cel!=doc_.cel().id||doc_.active()||!doc_.freeTileInstanceView()||!hasCapture()||msg->type()==ui::kFocusLeaveMessage)cancelDrag();
   else if(msg->type()==ui::kMouseUpMessage){finishDrag();return true;}
   else if(msg->type()==ui::kMouseMoveMessage){auto m=static_cast<ui::MouseMessage*>(msg);if(!m->left())cancelDrag();else updateDrag(m->position());return true;}
  }

  if(toggle_){
   if(toggle_->identity!=doc_.identity()||toggle_->cel!=doc_.cel().id||!doc_.freeTileInstanceFlagsActive()){toggle_.reset();if(hasCapture())releaseMouse();}
   else if(!hasCapture()||msg->type()==ui::kFocusLeaveMessage)finishToggle();
   else if(msg->type()==ui::kMouseUpMessage){finishToggle();return true;}
   else if(msg->type()==ui::kMouseMoveMessage){auto m=static_cast<ui::MouseMessage*>(msg);if(!m->left())finishToggle();else {const int row=rowAt(m->position());if(row>=0&&controlAt(m->position(),row)==toggle_->control)updateToggle(row);}return true;}
  }
  if(handleCommand(msg))return true;
  if(auto m=dynamic_cast<ui::MouseMessage*>(msg)){
   if(msg->type()==ui::kMouseWheelMessage){scroll_+=m->wheelDelta().y*20*uiScale;layout();invalidate();return true;}
   if(msg->type()==ui::kMouseDownMessage){if(!isEnabled())return true;requestFocus();const int index=rowAt(m->position());const auto order=ids();if(index>=0){if(m->right()){showContext(order[index],m->position());return true;}if(m->left()){const int control=controlAt(m->position(),index);if(control>=0){const auto& all=doc_.cel().freeTiles->instances;const auto it=std::find_if(all.begin(),all.end(),[&](const auto& i){return i.id==order[index];});const bool value=!(control==1?it->locked:it->visible);if(doc_.beginFreeTileInstanceFlags(control==1)){toggle_=Toggle{control,index,value,doc_.identity(),doc_.cel().id};manager()->setCapture(this,true);updateToggle(index);}return true;}const auto id=order[index];const auto selected=doc_.selectedFreeTileInstances();const bool modified=m->shiftPressed()||m->ctrlPressed()||m->cmdPressed();
   const bool alreadySelected=std::find(selected.begin(),selected.end(),id)!=selected.end();
   if(modified||!alreadySelected){doc_.selectFreeTileInstance(id,(m->ctrlPressed()||m->cmdPressed())?1:m->shiftPressed()?2:0);if(flashInstance)flashInstance(id);}
   if(!modified){const auto& all=doc_.cel().freeTiles->instances;const auto it=std::find_if(all.begin(),all.end(),[&](const auto& i){return i.id==id;});if(it!=all.end()&&!it->locked){drag_=Drag{id,{},m->position(),doc_.identity(),doc_.cel().id};drag_->flashOnClick=alreadySelected;manager()->setCapture(this,true);}else if(alreadySelected&&flashInstance)flashInstance(id);}
   notify();}}return true;}
  }return ui::Widget::onProcessMessage(msg);
 }
 bool handleCommand(ui::Message* msg){if(msg->type()!=ui::kKeyDownMessage||!isVisible()||!doc_.freeTileInstanceView()||ui::Manager::getDefault()->getFocus()!=this)return false;const auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(drag_&&key==ui::kKeyEsc){cancelDrag();return true;}if(drag_&&(key==ui::kKeyDel||key==ui::kKeyBackspace))cancelDrag();if(key==ui::kKeyDel||key==ui::kKeyBackspace){finishToggle();deleteSelection();return true;}return false;}
 void onPaint(ui::PaintEvent& ev)override{
  auto& g=*ev.graphics();{UiPaintScale scale(g);const auto r=uiLogical(clientBounds());g.fillRect(skin_["panel"],r);g.saveClip();g.clipRect({r.x+17,r.y,r.w-17,20});font_.draw(g,U"实例图层 · "+doc_.layer().name,r.x+17,r.y+3,skin_["text"]);g.restoreClip();}
  if(!doc_.freeTileInstanceView())return;
  const auto order=ids(),selected=doc_.selectedFreeTileInstances();const auto v=viewport().offset(-bounds().origin());g.saveClip();g.clipRect(v);
  if(order.empty()){UiPaintScale scale(g);font_.draw(g,U"暂无实例",2,24,skin_["text"]);}
  for(int n=0;n<int(order.size());++n){const auto physical=rowBounds(n).offset(-bounds().origin());if(!physical.intersects(v))continue;
   const auto& instances=doc_.cel().freeTiles->instances;const auto it=instances.begin()+std::ptrdiff_t(instances.size()-1-std::size_t(n));
   const auto& sources=doc_.layer().freeTiles->sources;const auto source=std::find_if(sources.begin(),sources.end(),[&](const auto& s){return s.id==(it->sourceId.empty()?it->tileId:it->sourceId)||s.tilesetId==(it->sourceId.empty()?it->tileId:it->sourceId);});
   auto& row=painter_;row.caption.clear();row.skinStyle="timeline-row";row.active=std::find(selected.begin(),selected.end(),it->id)!=selected.end();row.timelineDisplayColor=source==sources.end()?std::nullopt:source->displayColor;row.timelineCaptionPadding=26;
   const auto name=source==sources.end()?std::string{}:source->name;if(caption)row.caption=caption(name);const auto number=std::to_string(instances.size()-std::size_t(n));row.caption+=U" 实例"+std::u32string(number.begin(),number.end());if(const auto b=doc_.freeTileInstanceBounds(it->id)){const auto position=std::to_string(b->x)+", "+std::to_string(b->y);row.caption+=U"  ("+std::u32string(position.begin(),position.end())+U")";}g.saveClip();g.clipRect({physical.x,physical.y,std::max(0,physical.w-19*uiScale),physical.h});row.paintTimelineContent(g,{0,0,physical.w/uiScale,20},physical.origin());g.restoreClip();
   {const bool hidden=!doc_.layerEffectivelyVisible(doc_.layer())||(source!=sources.end()&&!source->visible);const bool locked=doc_.layerEffectivelyLocked(doc_.layer())||(source!=sources.end()&&source->locked);UiPaintScale scale(g,physical.origin());icons_.draw(g,std::string(it->visible?"eye":"eyeOff")+(hidden?"-disabled":""),{1,4,11,11},true);icons_.draw(g,std::string(it->locked?"lock":"unlock")+(locked?"-disabled":""),{13,4,11,11},true);}
  }
  for(const auto& border:selectionBorders()){const auto local=gfx::Rect(border).offset(-bounds().origin());const auto material=skin_.selectionMaterialBounds(local);UiPaintScale scale(g,{material.x%uiScale,material.y%uiScale});skin_.drawSelectionBorder(g,local,false);}
  if(drag_&&drag_->moved&&drag_->target!=drag_->id){const auto it=std::find(order.begin(),order.end(),drag_->target);if(it!=order.end()){const auto b=rowBounds(int(it-order.begin())).offset(-bounds().origin());const int y=(drag_->before?b.y:b.y2())/uiScale;UiPaintScale scale(g);const auto color=skin_["accent"];g.fillRect(color,{b.x/uiScale+8,y-1,std::max(1,b.w/uiScale-12),2});g.fillRect(color,{b.x/uiScale+3,y-3,2,6});g.fillRect(color,{b.x/uiScale+5,y-2,2,4});g.fillRect(color,{b.x2()/uiScale-7,y-3,2,6});g.fillRect(color,{b.x2()/uiScale-9,y-2,2,4});}}
  g.restoreClip();
 }
 // The application uses its common UTF-8 decoder rather than a second codec.
 std::function<std::u32string(const std::string&)> caption;
 void smokeReorder(){
  const auto order=ids();if(order.size()<3)throw std::runtime_error("Reorder fixture");const auto before=*doc_.cel().freeTiles;const auto history=doc_.historyPosition();const auto from=rowBounds(0).center(),to=rowBounds(2).center();
  ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,from);onProcessMessage(&down);
  ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,to);onProcessMessage(&move);
  if(!drag_||!drag_->moved||drag_->target!=order[2])throw std::runtime_error("Actual instance drag target");
  ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,to);onProcessMessage(&up);
  const auto after=ids();if(doc_.historyPosition()!=history+1||after.size()!=order.size()||after[0]!=order[1]||after[1]!=order[2]||after[2]!=order[0])throw std::runtime_error("Actual instance row reorder");doc_.undo();if(*doc_.cel().freeTiles!=before)throw std::runtime_error("Actual instance row reorder Undo");notify();
 }
 void smokeContext(){
  const auto order=ids();if(order.empty())throw std::runtime_error("Context menu fixture");const auto before=*doc_.cel().freeTiles;
  for(const auto icon:{"eye","rotateClockwise90","selectionFlipHorizontal","selectionFlipVertical"}){
   PixelMenu menu(skin_);buildContextMenu(menu,order.front());PixelMenuItem* action=nullptr;for(auto child:menu.children())if(auto item=dynamic_cast<PixelMenuItem*>(child);item&&item->icon==icon)action=item;
   if(!action||!action->isEnabled())throw std::runtime_error("Instance context action absent or disabled");const auto h=doc_.historyPosition();action->Click();if(doc_.historyPosition()!=h+1)throw std::runtime_error("Instance context action disconnected");doc_.undo();if(*doc_.cel().freeTiles!=before)throw std::runtime_error("Instance context action undo");notify();
  }
 }
 void smokeProperties(){const auto order=ids();if(order.empty())throw std::runtime_error("Instance properties fixture");const auto before=*doc_.cel().freeTiles;const auto h=doc_.historyPosition();doc_.selectFreeTileInstance(order.front());showProperties(order.front(),true);if(doc_.active()||doc_.historyPosition()!=h+1)throw std::runtime_error("Instance properties Esc commits once");const auto& all=doc_.cel().freeTiles->instances;const auto it=std::find_if(all.begin(),all.end(),[&](const auto& i){return i.id==order.front();});if(it==all.end()||it->opacity!=.37||it->rotation!=1||!it->flipHorizontal||it->blendMode!=std::optional<std::string>{"multiply"}||doc_.freeTileInstanceBounds(it->id)->x!=3)throw std::runtime_error("Instance properties controls not connected");doc_.undo();if(*doc_.cel().freeTiles!=before)throw std::runtime_error("Instance properties Undo");notify();}
 void smokeFlagsAndDelete(const std::function<void(ui::Message*)>& route){
  const auto order=ids();if(order.size()<3)throw std::runtime_error("Free instance flags fixture needs three rows");
  const auto before=*doc_.cel().freeTiles;const auto selection=doc_.selectedFreeTileInstances();const auto h=doc_.historyPosition();
  const auto send=[&](ui::MessageType type,int row,int control){auto b=rowBounds(row);ui::MouseMessage m(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,{b.x+(6+control*12)*uiScale,b.y+9*uiScale});onProcessMessage(&m);};
  const auto flag=[&](const std::string& id,bool lock){const auto& all=doc_.cel().freeTiles->instances;const auto it=std::find_if(all.begin(),all.end(),[&](const auto& i){return i.id==id;});return lock?it->locked:it->visible;};
  send(ui::kMouseDownMessage,0,0);if(!hasCapture()||!doc_.freeTileInstanceFlagsActive())throw std::runtime_error("Instance eye captures gesture");
  ui::MouseMessage observed(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,rowBounds(0).center());route(&observed);if(!doc_.freeTileInstanceFlagsActive())throw std::runtime_error("Editor stole panel flag gesture");
  send(ui::kMouseMoveMessage,2,0);if(flag(order[0],false)||flag(order[1],false)||flag(order[2],false))throw std::runtime_error("Actual eye range sweep");
  send(ui::kMouseMoveMessage,0,0);if(!flag(order[1],false)||!flag(order[2],false))throw std::runtime_error("Actual eye range shrink");send(ui::kMouseUpMessage,0,0);
  if(doc_.active()||hasCapture()||doc_.historyPosition()!=h+1||doc_.selectedFreeTileInstances()!=selection)throw std::runtime_error("Actual eye commit history and selection");doc_.undo();notify();
  send(ui::kMouseDownMessage,0,1);send(ui::kMouseMoveMessage,1,1);ui::Message blur(ui::kFocusLeaveMessage);onProcessMessage(&blur);if(doc_.active()||!flag(order[0],true)||!flag(order[1],true))throw std::runtime_error("Flag focus loss commits once");doc_.undo();notify();
  doc_.selectFreeTileInstance(order[0]);notify();requestFocus();ui::KeyMessage del(ui::kKeyDownMessage,ui::kKeyDel,ui::kKeyNoneModifier,0,0);route(&del);
  if(doc_.cel().freeTiles->instances.size()+1!=before.instances.size())throw std::runtime_error("Focused instance Delete routes before canvas shortcuts");doc_.undo();notify();
  if(*doc_.cel().freeTiles!=before)throw std::runtime_error("Actual panel flags delete Undo restores content");
 }
 void smokeRowSelection(){
  const auto order=ids();if(order.size()<3)throw std::runtime_error("Free instance selection fixture needs three rows");
  const auto click=[&](int n,ui::KeyModifiers mods){const auto point=rowBounds(n).center();ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,mods,point);onProcessMessage(&down);ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,mods,point);onProcessMessage(&up);};
  click(0,ui::kKeyNoneModifier);click(2,ui::kKeyShiftModifier);if(doc_.selectedFreeTileInstances()!=std::vector<std::string>({order[0],order[1],order[2]}))throw std::runtime_error("Free instance actual Shift row range");smokeSelectionMaterial();
  click(1,ui::kKeyCtrlModifier);if(doc_.selectedFreeTileInstances()!=std::vector<std::string>({order[0],order[2]}))throw std::runtime_error("Free instance actual Ctrl row toggle");smokeSelectionMaterial();
 }
 void smokeSelectionMaterial(){
  const auto v=viewport();auto surface=os::instance()->makeRgbaSurface(std::max(1,bounds().x2()+8),std::max(1,bounds().y2()+8));surface->clear();
  {ui::Graphics g(nullptr,surface,0,0);g.clipRect(v);for(const auto& border:selectionBorders()){const auto material=skin_.selectionMaterialBounds(border);UiPaintScale scale(g,{material.x%uiScale,material.y%uiScale});skin_.drawSelectionBorder(g,border,false);}}
  os::SurfaceLock lock(surface.get());int visible=0;for(int y=v.y;y<v.y2();++y)for(int x=v.x;x<v.x2();++x){const bool alpha=bool(surface->getPixel(x,y)>>24);if(alpha!=borderHit({x,y}))throw std::runtime_error("Free instance selection alpha/hit mismatch");visible+=alpha;}if(!visible)throw std::runtime_error("Free instance selection border missing");
 }
};
}
