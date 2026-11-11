#include "editor_implementation.h"
#include "extension_menu_adapter.h"
#include "extension_contributions.h"
#include "extension_settings_dialog.h"
#include <map>
namespace moon::editor {
struct ExtensionMenuAdapter::State:std::enable_shared_from_this<State> {
 const PixelFont& font;const Skin& skin;const Skin& icons;ui::Widget* owner;ui::MenuBar* bar;
 std::filesystem::path storagePath;std::unique_ptr<extension::Storage> storage;extension::RuntimeRegistry registry;
 std::function<bool()> ready,project,running;std::function<void(const std::string&)> run;std::function<void()> relayout;std::function<void(const std::u32string&)> error;
 std::vector<PixelMenuItem*> originals,tops;std::map<std::string,PixelMenu*> builtins;std::vector<ui::Widget*> inserted;
 std::vector<extension::RuntimeCandidate> candidates;std::set<std::string> placements;std::map<std::string,extension::MenuState> states;
 std::unique_ptr<ui::TooltipManager> tips;
 std::string snapshot;bool dirty=false,closing=false,alive=true;
 State(const PixelFont& f,const Skin& s,const Skin& i,ui::Widget* o,ui::MenuBar* b,std::filesystem::path p):font(f),skin(s),icons(i),owner(o),bar(b),storagePath(std::move(p)){
  tips=std::make_unique<ui::TooltipManager>();owner->addChild(tips.get());auto root=bar->getMenu();
  for(auto child:root->children())if(auto item=dynamic_cast<PixelMenuItem*>(child)){originals.push_back(item);if(item->hasSubmenu()&&!item->id().empty())builtins[item->id()]=static_cast<PixelMenu*>(item->getSubmenu());}
 }
 void report(){try{throw;}catch(const winrt::hresult_error& e){error(unicodeText(winrt::to_string(e.message())));}catch(const std::exception& e){try{error(unicodeText(e.what()));}catch(...){error(U"扩展操作失败。");}}}
 const extension::RuntimeCandidate* find(const std::string& id)const{for(const auto& candidate:candidates)if(candidate.extension.id==id&&candidate.enabled)return &candidate;return nullptr;}
 void activate(std::string id,extension::MenuNode node){
  if(!alive||!ready())return;auto candidate=find(id);if(!candidate)return;
  // Popup Click dispatch is still on the old menu's stack. The recipient's
  // callback is delivered only after menu close/detach messages, like Aseprite.
  auto callback=new ui::CallbackMessage([weak=weak_from_this(),id=std::move(id),node=std::move(node)]{if(auto self=weak.lock();self&&self->alive&&self->ready())try{
   auto candidate=self->find(id);if(!candidate)return;auto current=extension::presentCommand(node.command,node.key,self->states[id],true,self->project(),self->running());if(!current||current->disabled)return;
   extension::CommandHandlers handlers;handlers.runLua=self->run;handlers.openSettings=[self,candidate](const std::string&){if(!self->storage)self->storage=std::make_unique<extension::Storage>(self->storagePath);showExtensionSettings(self->font,self->skin,self->icons,self->owner->display(),self->owner->bounds(),*candidate,*self->storage,self->registry);};
   extension::activateMenuNode(*current,self->registry,candidate->extension,handlers);
  }catch(...){self->report();}});callback->setRecipient(owner);owner->manager()->enqueueMessage(callback);
 }
 ui::Widget* row(const std::string& id,const extension::MenuNode& node){
  if(node.divider){auto separator=new PixelMenuSeparator(skin);separator->setId(node.key.c_str());return separator;}
  auto item=new PixelMenuItem(font,skin,unicodeText(node.submenu?node.label:node.command.name));item->setId(node.key.c_str());item->menuMarks=&icons;if(!node.title.empty())tips->addTooltipFor(item,node.title);
  if(node.submenu){auto submenu=new PixelMenu(skin);item->setSubmenu(submenu);for(const auto& child:node.children)submenu->addChild(row(id,child));}
  else{item->checked=[weak=weak_from_this(),id,node]{if(auto self=weak.lock())return self->states[id].checked(node.command.runtime.id)||node.checked;return false;};item->available=[weak=weak_from_this(),id,node]{auto self=weak.lock();return self&&self->alive&&self->ready()&&self->find(id)&&!(node.command.runtime.handler=="lua"&&(!self->project()||self->running()));};item->Click.connect([weak=weak_from_this(),id,node]{if(auto self=weak.lock())self->activate(id,node);});}
  return item;
 }
 void clear(){tips.reset();tips=std::make_unique<ui::TooltipManager>();owner->addChild(tips.get());for(auto widget:inserted){if(widget->parent())widget->parent()->removeChild(widget);delete widget;}inserted.clear();for(auto top:tops){if(top->parent())top->parent()->removeChild(top);delete top;}tops.clear();}
 void apply(){
  if(!restoreTopMenuEntries(bar->getMenu()))return;
  clear();auto root=bar->getMenu();const auto contributions=extension::contributions(candidates,extension::ContributionKind::MenuItem);auto exists=[this](const std::string& id){return bool(find(id));};auto state=[this](const std::string& id)->const extension::MenuState&{return states[id];};
  for(auto& [id,menu]:builtins)for(const auto position:{"start","end"}){
   const auto nodes=extension::presentExistingMenus(contributions,id,position,state,exists,project(),running());std::size_t at=0;
   for(const auto& node:nodes){std::string extensionId;for(const auto& c:contributions)if(node.key.rfind(c.key,0)==0){extensionId=c.extensionId;break;}auto widget=row(extensionId,node);if(std::string(position)=="start")menu->insertChild(int(at++),widget);else menu->addChild(widget);inserted.push_back(widget);}
  }
  const auto topContributions=extension::contributions(candidates,extension::ContributionKind::TopMenu);std::map<std::string,PixelMenuItem*> byId;
  for(auto& c:topContributions){auto view=extension::presentTopMenu(c,states[c.extensionId],bool(find(c.extensionId)),project(),running());auto item=new PixelMenuItem(font,skin,unicodeText(view.name));item->setId(c.openMenuId.c_str());item->menuMarks=&icons;if(!view.title.empty())tips->addTooltipFor(item,view.title);auto menu=new PixelMenu(skin);item->setSubmenu(menu);for(auto& node:view.nodes)menu->addChild(row(c.extensionId,node));tops.push_back(item);byId[c.openMenuId]=item;}
  // Home and the legacy placeholder Pet remain at their existing boundaries.
  std::vector<std::string> ids;for(auto item:originals){if(builtins.count(item->id()))ids.push_back(item->id());if(item->parent())item->parent()->removeChild(item);}
  std::size_t originalIndex=0;while(originalIndex<originals.size()&&!builtins.count(originals[originalIndex]->id()))root->addChild(originals[originalIndex++]);for(const auto& id:extension::arrangeTopMenus(ids,topContributions)){if(auto found=byId.find(id);found!=byId.end())root->addChild(found->second);else{while(originalIndex<originals.size()){auto item=originals[originalIndex++];root->addChild(item);if(item->id()==id)break;}}}while(originalIndex<originals.size())root->addChild(originals[originalIndex++]);
  dirty=false;closing=false;relayout();
 }
};
ExtensionMenuAdapter::ExtensionMenuAdapter(const PixelFont& f,const Skin& s,const Skin& i,ui::Widget* o,ui::MenuBar* b,std::filesystem::path p,std::function<bool()> ready,std::function<bool()> project,std::function<bool()> running,std::function<void(const std::string&)> run,std::function<void()> layout,std::function<void(const std::u32string&)> error){
 restoreTopMenuEntries(b->getMenu());state_=std::make_shared<State>(f,s,i,o,b,std::move(p));state_->ready=std::move(ready);state_->project=std::move(project);state_->running=std::move(running);state_->run=std::move(run);state_->relayout=std::move(layout);state_->error=std::move(error);
}
ExtensionMenuAdapter::~ExtensionMenuAdapter(){state_->alive=false;if(restoreTopMenuEntries(state_->bar->getMenu()))state_->clear();/* Open popups retain their widgets until the owner tree closes. */}
void ExtensionMenuAdapter::request(const std::string& json){auto& s=*state_;if(s.snapshot==json)return;try{std::vector<extension::RuntimeCandidate> next;std::set<std::string> placed;using namespace winrt::Windows::Data::Json;for(auto value:JsonArray::Parse(winrt::to_hstring(json))){auto entry=value.GetObject();auto manifest=entry.GetNamedObject(L"manifest");auto candidate=extension::RuntimeDirectory::parseManifest(manifest,{},winrt::to_string(manifest.GetNamedString(L"id")));candidate.enabled=candidate.extension.enabled=entry.GetNamedBoolean(L"enabled");candidate=extension::localizedCandidate(candidate,"zh-CN");if(candidate.enabled)for(auto* groups:{&candidate.metadata.menuItems,&candidate.metadata.topMenus})for(auto& group:*groups)for(auto& id:group.commands)placed.insert(extension::commandScriptId(candidate.extension.id,id));next.push_back(std::move(candidate));}s.candidates=std::move(next);s.placements=std::move(placed);s.snapshot=json;s.dirty=true;}catch(...){s.report();}}
void ExtensionMenuAdapter::pump(){auto& s=*state_;if(!s.dirty||!s.ready())return;if(!s.closing){s.bar->cancelMenuLoop();s.closing=true;return;}try{s.apply();}catch(...){s.dirty=false;s.report();}}
bool ExtensionMenuAdapter::placed(const std::string& id)const{return state_->placements.count(id)!=0;}
void checkExtensionMenus(const PixelFont& font,const Skin& skin,const Skin& icons,ui::Widget* owner,const std::filesystem::path& directory)try{
 using namespace winrt::Windows::Data::Json;std::filesystem::create_directories(directory);std::ofstream(directory/"test-owned.marker")<<"extension menu fixture";
 auto check=[](bool condition,const char* error){if(!condition)throw std::runtime_error(error);};
 extension::Storage initial(directory/"storage.json");initial.setEncoded(u"menu-test",u"preferences",R"({"enabled":true})");
 auto bar=std::make_unique<ui::MenuBar>(ui::MenuBar::ProcessTopLevelShortcuts::kNo);auto root=new PixelMenu(skin);bar->setMenu(root);owner->addChild(bar.get());
 std::map<std::string,PixelMenu*> builtins;auto home=new PixelMenuItem(font,skin,U"Home");root->addChild(home);
 for(auto id:{"file","edit","select","canvas","layer","frame","window","help"}){auto row=new PixelMenuItem(font,skin,unicodeText(id));row->setId(id);auto submenu=new PixelMenu(skin);row->setSubmenu(submenu);submenu->addChild(new PixelMenuItem(font,skin,U"Builtin"));root->addChild(row);builtins[id]=submenu;}
 bool ready=true,project=false,running=false;int layouts=0;std::string ran;std::u32string error;
 auto layout=[&]{++layouts;auto b=owner->bounds();bar->setBounds({b.x+12,b.y+12,b.w-24,30*uiScale});};
 ExtensionMenuAdapter adapter(font,skin,icons,owner,bar.get(),directory/"storage.json",[&]{return ready;},[&]{return project;},[&]{return running;},[&](const std::string& id){ran=id;},layout,[&](const std::u32string& text){error=text;});
 auto manifest=JsonObject::Parse(LR"({"schemaVersion":2,"id":"menu-test","name":"Menu test","version":"1","commands":[{"id":"settings","name":"Settings","opensSettings":true},{"id":"paint","name":"Paint","entry":"paint.lua"}],"settingsUi":{"storageKey":"preferences","controls":[{"id":"enabled","type":"checkbox","label":"Enabled","defaultValue":true}]},"menuItems":[{"id":"file-settings","menu":"file","position":"start","name":"Options","commands":["settings"]},{"id":"edit-paint","menu":"edit","position":"end","commands":["paint"]}],"topMenus":[{"id":"extra","name":"Extra","position":"before:help","commands":["paint","settings"]}]})");
 auto snapshot=[&](bool enabled){JsonObject item;item.Insert(L"manifest",manifest);item.Insert(L"enabled",JsonValue::CreateBooleanValue(enabled));JsonArray list;list.Append(item);return winrt::to_string(list.Stringify());};
 auto publish=[&](const std::string& json){adapter.request(json);adapter.pump();owner->manager()->dispatchMessages();adapter.pump();};
 auto find=[](ui::Widget* parent,const std::string& id)->PixelMenuItem*{for(auto child:parent->children())if(auto row=dynamic_cast<PixelMenuItem*>(child);row&&row->id()==id)return row;return nullptr;};
 publish(snapshot(true));check(layouts==1&&adapter.placed("extension:menu-test:paint"),"Contribution publish/placement");
 auto top=find(root,"extension-menu:menu-test:extra");check(top&&std::find(root->children().begin(),root->children().end(),top)<std::find(root->children().begin(),root->children().end(),find(root,"help")),"Top menu order");check(root->children().front()==home,"Home prefix moved");
 auto group=find(builtins["file"],"menu-test:menu-item:file-settings");check(group&&builtins["file"]->children().front()==group,"Builtin start submenu");auto settings=find(group->getSubmenu(),"menu-test:menu-item:file-settings:settings");check(settings,"Settings command missing");
 auto paint=find(builtins["edit"],"menu-test:menu-item:edit-paint:paint");check(paint,"Lua command missing");paint->validateItem();check(!paint->isEnabled(),"Lua enabled on home");project=true;paint->validateItem();check(paint->isEnabled(),"Lua unavailable with document");running=true;paint->validateItem();check(!paint->isEnabled(),"Lua rerun allowed");running=false;paint->Click();owner->manager()->dispatchMessages();check(ran=="extension:menu-test:paint","Contribution Lua routing");
 // The actual contributed settings command opens the production modal. A
 // timer changes its actual switch, then closes it through Window's API.
 bool opened=false;std::exception_ptr failure;int ticks=0;ui::Timer driver(25,owner);driver.Tick.connect([&]{try{if(++ticks>100)throw std::runtime_error("Contributed settings timeout");for(auto child:ui::Manager::getDefault()->children())if(auto dialog=dynamic_cast<PixelDialog*>(child)){
   std::function<PixelSwitch*(ui::Widget*)> search=[&](ui::Widget* node)->PixelSwitch*{if(node->id()=="enabled")return dynamic_cast<PixelSwitch*>(node);for(auto child:node->children())if(auto result=search(child))return result;return nullptr;};auto control=search(dialog);if(!control)continue;check(dialog->bounds().h<200*uiScale,"One-control settings retained oversized empty body");control->Click();opened=true;driver.stop();ui::Manager::getDefault()->flushRedraw();ui::Manager::getDefault()->dispatchMessages();ui::Manager::getDefault()->flipAllDisplays();writeSmokeFrame(owner->display()->nativeSurface().get(),directory/"menu-settings.bmp");dialog->closeWindow(nullptr);driver.stop();break;}
  }catch(...){failure=std::current_exception();driver.stop();for(auto child:ui::Manager::getDefault()->children())if(auto dialog=dynamic_cast<PixelDialog*>(child))dialog->closeWindow(nullptr);}});driver.start();settings->Click();owner->manager()->dispatchMessages();driver.stop();if(failure)std::rethrow_exception(failure);check(opened&&error.empty(),"Contributed settings did not open");extension::Storage reopened(directory/"storage.json");check(!reopened.get(u"menu-test",u"preferences").GetObject().GetNamedBoolean(L"enabled"),"Contributed settings persistence");
 // Suppress queued commands when eligibility changes before their delivery.
 settings->Click();ready=false;owner->manager()->dispatchMessages();ready=true;check(!error.size(),"Stale command error");
 publish(snapshot(false));check(!find(root,"extension-menu:menu-test:extra")&&builtins["file"]->children().size()==1&&builtins["edit"]->children().size()==1&&!adapter.placed("extension:menu-test:paint"),"Disabled extension retained contribution");
 publish(snapshot(true));check(find(root,"extension-menu:menu-test:extra")&&builtins["file"]->children().size()==3,"Reenabled contribution duplicate");publish("[]");check(root->children().size()==9&&builtins["file"]->children().size()==1,"Removed extension retained menu");check(error.empty(),"Contribution UI error");
}catch(const winrt::hresult_error& e){throw std::runtime_error("Extension menus fixture: "+winrt::to_string(e.message()));}
}
