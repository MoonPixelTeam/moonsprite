#include "editor_implementation.h"
#include "extension_menu_adapter.h"
#include "extension_contributions.h"
#include "extension_settings_dialog.h"
#include "extension_panel_host.h"
#include "extension_session_host.h"
#include "ui/message_loop.h"
#include <map>
namespace moon::editor {
struct ExtensionMenuAdapter::State:std::enable_shared_from_this<State> {
 const PixelFont& font;const Skin& skin;const Skin& icons;ui::Widget* owner;ui::MenuBar* bar;
 std::filesystem::path storagePath;std::unique_ptr<extension::Storage> storage;extension::RuntimeRegistry registry;
 std::function<bool()> ready,project,running;std::function<void(const std::string&)> run;std::function<void()> relayout;std::function<void(const std::u32string&)> error;
 std::vector<PixelMenuItem*> originals,tops;std::map<std::string,PixelMenu*> builtins;std::vector<ui::Widget*> inserted;
 std::vector<extension::RuntimeCandidate> candidates;std::set<std::string> placements;std::map<std::string,extension::MenuState> states;
 std::unique_ptr<ui::TooltipManager> tips;
 std::unique_ptr<ExtensionPanelHost> panels;
 struct Binding {std::shared_ptr<extension::SessionHost> host;extension::SessionHost::Token token;extension::MenuState::Stop stop;std::optional<std::uint64_t> revision;};
 std::map<std::string,Binding> bindings;
 struct SettingsRequest {std::string id;std::shared_ptr<extension::SessionHost> host;std::uint64_t generation=0;};
 std::optional<SettingsRequest> pendingSettings;std::string settingsId;ui::Window* settingsWindow=nullptr;bool settingsQueued=false,settingsClosing=false;
 std::string snapshot;bool dirty=false,closing=false,alive=true;
 State(const PixelFont& f,const Skin& s,const Skin& i,ui::Widget* o,ui::MenuBar* b,std::filesystem::path p):font(f),skin(s),icons(i),owner(o),bar(b),storagePath(std::move(p)){
  tips=std::make_unique<ui::TooltipManager>();owner->addChild(tips.get());auto root=bar->getMenu();
  for(auto child:root->children())if(auto item=dynamic_cast<PixelMenuItem*>(child)){originals.push_back(item);if(item->hasSubmenu()&&!item->id().empty())builtins[item->id()]=static_cast<PixelMenu*>(item->getSubmenu());}
 }
 void report(){try{throw;}catch(const winrt::hresult_error& e){error(unicodeText(winrt::to_string(e.message())));}catch(const std::exception& e){try{error(unicodeText(e.what()));}catch(...){error(U"扩展操作失败。");}}}
 const extension::RuntimeCandidate* find(const std::string& id)const{for(const auto& candidate:candidates)if(candidate.extension.id==id&&candidate.enabled)return &candidate;return nullptr;}
 void syncRuntime(){for(auto it=bindings.begin();it!=bindings.end();){auto revision=find(it->first)?it->second.host->presentationRevision(it->second.token):std::optional<std::uint64_t>{};if(!revision){it->second.stop();states.erase(it->first);it=bindings.erase(it);dirty=true;continue;}if(it->second.revision!=revision){auto snapshot=it->second.host->menus(it->second.token);it->second.revision=revision;states.erase(it->first);states.emplace(it->first,*snapshot);dirty=true;}++it;}}
 std::optional<extension::MenuNode> currentNode(const std::string& id,const extension::MenuNode& old,bool menuVisibility=true){
  if(old.key.rfind("extension-menu:"+id+":",0)==0&&std::count(old.key.begin(),old.key.end(),':')==4){auto candidate=find(id);if(!candidate)return {};for(const auto& menu:candidate->metadata.topMenus){const auto key="extension-menu:"+id+":"+menu.id+":dynamic:"+old.command.runtime.id;if(key!=old.key)continue;auto item=states[id].item(menu.id,old.command.runtime.id);if(!item||item->event!=old.command.runtime.runtimeEvent)return {};auto command=old.command;command.name=winrt::to_string(item->name);return extension::presentCommand(command,key,states[id],true,project(),running(),item->checked);}return {};}
  auto candidate=find(id);if(!candidate)return {};auto found=std::find_if(candidate->commands.begin(),candidate->commands.end(),[&](const auto& c){return c.runtime.id==old.command.runtime.id&&c.runtime.handler==old.command.runtime.handler&&c.runtime.runtimeEvent==old.command.runtime.runtimeEvent;});if(found==candidate->commands.end())return {};if(!menuVisibility){auto current=old;current.command=*found;current.disabled=found->runtime.handler=="lua"&&(!project()||running());return current;}return extension::presentCommand(*found,old.key,states[id],true,project(),running());
 }
 void closeSettings(){if(settingsWindow&&!settingsClosing){settingsClosing=true;settingsWindow->closeWindow(nullptr);}}
 void scheduleSettings(){
  if(!alive||settingsQueued||!settingsId.empty()||!pendingSettings)return;
  settingsQueued=true;auto callback=new ui::CallbackMessage([weak=weak_from_this()]{if(auto self=weak.lock())try{self->deliverSettings();}catch(...){self->report();}});callback->setRecipient(owner);owner->manager()->enqueueMessage(callback);
 }
 void deliverSettings(){
  settingsQueued=false;if(!alive||!ready()||!pendingSettings){pendingSettings.reset();return;}
  auto request=std::move(*pendingSettings);pendingSettings.reset();
  try{
   syncRuntime();if(request.generation){auto live=bindings.find(request.id);if(live==bindings.end()||live->second.host!=request.host||live->second.token.generation!=request.generation)return;}
   auto found=find(request.id);if(!found||!found->extension.hasSettings)return;
   // The manifest vector can be replaced from inside the modal message loop.
   // Keep a value snapshot and the session/storage owner alive until it unwinds.
   auto candidate=*found;settingsId=request.id;settingsClosing=false;
   if(!request.host&&!storage)storage=std::make_unique<extension::Storage>(storagePath);
   showExtensionSettings(font,skin,icons,owner->display(),owner->bounds(),candidate,request.host?request.host->storage():*storage,request.host?request.host->registry():registry,[this](ui::Window* window){settingsWindow=window;});
  }catch(...){settingsWindow=nullptr;settingsId.clear();settingsClosing=false;scheduleSettings();throw;}
  settingsWindow=nullptr;settingsId.clear();settingsClosing=false;scheduleSettings();
 }
 void openSettings(const std::string& id,const std::shared_ptr<extension::SessionHost>& host,std::uint64_t generation){
  if(!alive)return;
  // React's single extensionSettingsId keeps the current window on repeated
  // requests. A different target is opened only after this modal stack unwinds.
  if(settingsId==id&&!settingsClosing){pendingSettings.reset();return;}
  pendingSettings=SettingsRequest{id,host,generation};if(!settingsId.empty())closeSettings();else scheduleSettings();
 }
 void requestSettings(const std::string& id,std::uint64_t generation){
  auto binding=bindings.find(id);if(!alive||binding==bindings.end()||binding->second.token.generation!=generation||!find(id))throw std::runtime_error("Native extension UI is disconnected");
  openSettings(id,binding->second.host,generation);
 }
 void requestLua(const std::string& id,std::uint64_t generation,const std::string& script){
  auto binding=bindings.find(id);auto candidate=find(id);if(!alive||binding==bindings.end()||binding->second.token.generation!=generation||!candidate)throw std::runtime_error("Native extension UI is disconnected");
  auto command=std::find_if(candidate->commands.begin(),candidate->commands.end(),[&](const auto& c){return c.runtime.handler=="lua"&&extension::commandScriptId(id,c.runtime.id)==script;});if(command==candidate->commands.end())throw std::runtime_error("Extension Lua command no longer exists");
  extension::MenuNode node;node.key=script;node.command=*command;activate(id,std::move(node),false);
 }
 void activate(std::string id,extension::MenuNode node,bool menuVisibility=true){
  if(!alive||!ready())return;auto candidate=find(id);if(!candidate)return;
  // Popup Click dispatch is still on the old menu's stack. The recipient's
  // callback is delivered only after menu close/detach messages, like Aseprite.
  const auto binding=bindings.find(id);auto host=binding==bindings.end()?std::shared_ptr<extension::SessionHost>{}:binding->second.host;const auto generation=binding==bindings.end()?0:binding->second.token.generation;
  auto callback=new ui::CallbackMessage([weak=weak_from_this(),id=std::move(id),node=std::move(node),host,generation,menuVisibility]{if(auto self=weak.lock();self&&self->alive&&self->ready())try{
   self->syncRuntime();if(generation){auto live=self->bindings.find(id);if(live==self->bindings.end()||live->second.host!=host||live->second.token.generation!=generation)return;}
   auto candidate=self->find(id);if(!candidate)return;auto current=self->currentNode(id,node,menuVisibility);if(!current||current->disabled)return;auto& registry=host?host->registry():self->registry;
   extension::CommandHandlers handlers;handlers.runLua=self->run;handlers.openSettings=[self,id,host,generation](const std::string&){self->openSettings(id,host,generation);};
   extension::activateMenuNode(*current,registry,candidate->extension,handlers);
  }catch(...){self->report();}});callback->setRecipient(owner);owner->manager()->enqueueMessage(callback);
 }
 ui::Widget* row(const std::string& id,const extension::MenuNode& node){
  if(node.divider){auto separator=new PixelMenuSeparator(skin);separator->setId(node.key.c_str());return separator;}
  auto item=new PixelMenuItem(font,skin,unicodeText(node.submenu?node.label:node.command.name));item->setId(node.key.c_str());item->menuMarks=&icons;if(!node.title.empty())tips->addTooltipFor(item,node.title);
  if(node.submenu){auto submenu=new PixelMenu(skin);item->setSubmenu(submenu);for(const auto& child:node.children)submenu->addChild(row(id,child));}
  else{item->checked=[weak=weak_from_this(),id,node]{if(auto self=weak.lock()){auto current=self->currentNode(id,node);return current&&current->checked;}return false;};item->available=[weak=weak_from_this(),id,node]{auto self=weak.lock();if(!self||!self->alive||!self->ready()||!self->find(id))return false;auto current=self->currentNode(id,node);return current&&!current->disabled;};item->Click.connect([weak=weak_from_this(),id,node]{if(auto self=weak.lock())self->activate(id,node);});}
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
  panels->replace(candidates);
  if(auto it=builtins.find("window");it!=builtins.end())for(auto child:it->second->children())if(auto row=dynamic_cast<PixelMenuItem*>(child);row&&row->id()=="panels"&&row->getSubmenu())panels->appendMenu(static_cast<PixelMenu*>(row->getSubmenu()),inserted);
  dirty=false;closing=false;relayout();
 }
};
ExtensionMenuAdapter::ExtensionMenuAdapter(const PixelFont& f,const Skin& s,const Skin& i,ui::Widget* o,ui::MenuBar* b,std::filesystem::path p,std::function<bool()> ready,std::function<bool()> project,std::function<bool()> running,std::function<void(const std::string&)> run,std::function<void()> layout,std::function<void(const std::u32string&)> error){
 restoreTopMenuEntries(b->getMenu());state_=std::make_shared<State>(f,s,i,o,b,std::move(p));state_->ready=std::move(ready);state_->project=std::move(project);state_->running=std::move(running);state_->run=std::move(run);state_->relayout=std::move(layout);state_->error=std::move(error);
 auto weak=std::weak_ptr<State>(state_);state_->panels=std::make_unique<ExtensionPanelHost>(f,s,i,o,state_->storagePath.parent_path()/"extension-panels.json",state_->ready,state_->project,state_->running,[weak](const std::string& id,const extension::ManifestCommand& command){if(auto state=weak.lock()){extension::MenuNode node;node.key=extension::commandScriptId(id,command.runtime.id);node.command=command;state->activate(id,std::move(node),false);}},state_->error);
}
ExtensionMenuAdapter::~ExtensionMenuAdapter(){state_->alive=false;state_->pendingSettings.reset();state_->closeSettings();for(auto& [id,binding]:state_->bindings)binding.stop();state_->bindings.clear();if(restoreTopMenuEntries(state_->bar->getMenu()))state_->clear();/* Open popups retain their widgets until the owner tree closes. */}
void ExtensionMenuAdapter::request(const std::string& json){auto& s=*state_;if(s.snapshot==json)return;try{std::vector<extension::RuntimeCandidate> next;std::set<std::string> placed;using namespace winrt::Windows::Data::Json;for(auto value:JsonArray::Parse(winrt::to_hstring(json))){auto entry=value.GetObject();auto manifest=entry.GetNamedObject(L"manifest");auto candidate=extension::RuntimeDirectory::parseManifest(manifest,{},winrt::to_string(manifest.GetNamedString(L"id")));candidate.enabled=candidate.extension.enabled=entry.GetNamedBoolean(L"enabled");candidate=extension::localizedCandidate(candidate,"zh-CN");if(candidate.enabled)for(auto* groups:{&candidate.metadata.panels,&candidate.metadata.menuItems,&candidate.metadata.topMenus})for(auto& group:*groups)for(auto& id:group.commands)placed.insert(extension::commandScriptId(candidate.extension.id,id));next.push_back(std::move(candidate));}s.candidates=std::move(next);s.placements=std::move(placed);s.snapshot=json;s.dirty=true;if(!s.settingsId.empty()&&std::none_of(s.candidates.begin(),s.candidates.end(),[&](const auto& candidate){return candidate.extension.id==s.settingsId;}))s.closeSettings();}catch(...){s.report();}}
void ExtensionMenuAdapter::pump(){auto& s=*state_;try{s.syncRuntime();s.panels->pump();if(!s.dirty||!s.ready())return;if(!s.closing){s.bar->cancelMenuLoop();s.closing=true;return;}s.apply();}catch(...){s.dirty=false;s.report();}}
bool ExtensionMenuAdapter::bindRuntime(std::shared_ptr<extension::SessionHost> host,const std::string& id,std::uint64_t generation){auto& s=*state_;if(!host||!s.find(id))return false;extension::SessionHost::Token token{id,generation};if(!host->menus(token))return false;if(auto found=s.bindings.find(id);found!=s.bindings.end()){if(found->second.host==host&&found->second.token.generation==generation)return true;found->second.stop();s.bindings.erase(found);}State::Binding binding{host,token};binding.stop=host->subscribePresentation(token,[weak=std::weak_ptr<State>(state_)]{if(auto s=weak.lock();s&&s->alive)s->dirty=true;});auto weak=std::weak_ptr<State>(state_);auto stopHandlers=host->bindCommandHandlers(token,{[weak,id,generation](const std::string& script){if(auto live=weak.lock())live->requestLua(id,generation,script);else throw std::runtime_error("Native extension UI is disconnected");},[weak,id,generation](const std::string&){if(auto live=weak.lock())live->requestSettings(id,generation);else throw std::runtime_error("Native extension UI is disconnected");}});auto stopPresentation=std::move(binding.stop);binding.stop=[stopPresentation=std::move(stopPresentation),stopHandlers=std::move(stopHandlers)]{stopPresentation();stopHandlers();};s.bindings.emplace(id,std::move(binding));s.syncRuntime();return true;}
void ExtensionMenuAdapter::unbindRuntime(const std::string& id){auto& s=*state_;auto found=s.bindings.find(id);if(found==s.bindings.end())return;found->second.stop();s.bindings.erase(found);s.states.erase(id);s.dirty=true;}
bool ExtensionMenuAdapter::placed(const std::string& id)const{return state_->placements.count(id)!=0;}
void checkExtensionMenus(const PixelFont& font,const Skin& skin,const Skin& suppliedIcons,ui::Widget* owner,const std::filesystem::path& directory)try{
 Skin icons=suppliedIcons;for(auto name:{"check","right","properties","properties-disabled"})icons.assets.patches[name]=importSkinPng(directory.parent_path()/"assets"/"utility-icons"/(std::string(name)+".png"),32);
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
 auto panelTrigger=new PixelMenuItem(font,skin,U"Panels");panelTrigger->setId("panels");auto panelMenu=new PixelMenu(skin);panelTrigger->setSubmenu(panelMenu);builtins["window"]->addChild(panelTrigger);
 auto commands=manifest.GetNamedArray(L"commands");commands.Append(JsonObject::Parse(LR"({"id":"panel-paint","name":"Panel paint","entry":"panel.lua"})"));manifest.Insert(L"panels",JsonArray::Parse(LR"([{"id":"tools","name":"Tools","defaultVisible":false,"commands":["panel-paint"]}])"));
 auto snapshot=[&](bool enabled){JsonObject item;item.Insert(L"manifest",manifest);item.Insert(L"enabled",JsonValue::CreateBooleanValue(enabled));JsonArray list;list.Append(item);return winrt::to_string(list.Stringify());};
 auto publish=[&](const std::string& json){adapter.request(json);adapter.pump();owner->manager()->dispatchMessages();adapter.pump();};
 auto find=[](ui::Widget* parent,const std::string& id)->PixelMenuItem*{for(auto child:parent->children())if(auto row=dynamic_cast<PixelMenuItem*>(child);row&&row->id()==id)return row;return nullptr;};
 publish(snapshot(true));check(layouts==1&&adapter.placed("extension:menu-test:paint"),"Contribution publish/placement");
 check(adapter.placed("extension:menu-test:panel-paint")&&panelMenu->children().size()==2,"Panel contribution menu/placement");
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
 // Attach the existing authenticated native session, then drive the actual
 // UI through menus.setItems and command-state reports (no JS test stand-in).
 manifest.Insert(L"apiVersion",JsonValue::CreateStringValue(L"1.0.0"));manifest.Insert(L"runtime",JsonObject::Parse(LR"({"entry":"runtime.html","permissions":["runtime","commands","menus","storage","ui"]})"));commands.Append(JsonObject::Parse(LR"({"id":"run","name":"Run","runtimeEvent":"run"})"));manifest.GetNamedArray(L"topMenus").GetAt(0).GetObject().GetNamedArray(L"commands").Append(JsonValue::CreateStringValue(L"run"));manifest.GetNamedObject(L"settingsUi").GetNamedArray(L"controls").Append(JsonObject::Parse(LR"({"id":"run","type":"button","label":"Run","commandId":"run","closeOnRun":true})"));auto panelCommands=manifest.GetNamedArray(L"panels").GetAt(0).GetObject().GetNamedArray(L"commands");for(auto id:{L"run",L"settings"})panelCommands.Append(JsonValue::CreateStringValue(id));publish(snapshot(true));
 extension::Storage runtimeStorage(directory/"storage.json");extension::FileDropRouter drops;extension::RuntimeRegistry runtimeRegistry;std::vector<extension::RuntimeEvent> events;auto host=std::make_shared<extension::SessionHost>(runtimeStorage,drops,runtimeRegistry);
 auto cleanup=std::unique_ptr<int,std::function<void(int*)>>(new int,[&](int* p){adapter.unbindRuntime("menu-test");host->close("menu-test");delete p;});
 auto runtimeCandidate=extension::RuntimeDirectory::parseManifest(manifest,{},"menu-test");std::vector<extension::RuntimeCommand> runtimeCommands;for(const auto& command:runtimeCandidate.commands)runtimeCommands.push_back(command.runtime);
 auto token=host->open(runtimeCandidate.extension,runtimeCandidate.permissions,"zh-CN",[&](const auto& event){events.push_back(event);},{},runtimeCommands);host->setDeclaredMenus(token,{"extra"});extension::RuntimeEvent projectEvent;projectEvent.type="project";host->loaded(token,projectEvent);
 check(!adapter.bindRuntime(host,"menu-test",token.generation+1)&&adapter.bindRuntime(host,"menu-test",token.generation),"Runtime menu token gate");
 auto flushMenus=[&]{adapter.pump();owner->manager()->dispatchMessages();adapter.pump();};flushMenus();
 auto send=[&](const std::string& method,const std::string& params){auto response=host->request(token,JsonValue::Parse(winrt::to_hstring("{\"type\":\"moonsprite-extension-request\",\"requestId\":\"menu\",\"method\":\""+method+"\",\"params\":"+params+"}")));check(response&&response->GetNamedBoolean(L"ok"),"Runtime menu request failed");};
 ran.clear();send("commands.execute",R"({"commandId":"paint"})");check(ran.empty(),"Runtime Lua request executed within request dispatch");owner->manager()->dispatchMessages();check(ran=="extension:menu-test:paint","Runtime request did not reach native Lua handler");
 ran.clear();send("commands.execute",R"({"commandId":"paint"})");running=true;owner->manager()->dispatchMessages();check(ran.empty(),"Runtime queued Lua ignored busy gate");running=false;
 const std::string dynamic=R"({"menuId":"extra","name":"A much longer runtime menu title","items":[{"id":"paint","name":"Dynamic paint","event":"dynamic-paint","checked":true,"dividerBefore":true},{"id":"custom","name":"Custom action","event":"custom-event","checked":false}]})";
 send("menus.setItems",dynamic);flushMenus();top=find(root,"extension-menu:menu-test:extra");check(top&&top->sizeHint().w>100*uiScale,"Runtime top menu name not applied");auto dynamicPaint=find(top->getSubmenu(),"extension-menu:menu-test:extra:dynamic:paint");auto custom=find(top->getSubmenu(),"extension-menu:menu-test:extra:dynamic:custom");check(dynamicPaint&&dynamicPaint->checked()&&custom&&!custom->checked()&&!find(top->getSubmenu(),"extension-menu:menu-test:extra:paint"),"Dynamic order/replacement/check state");
 auto commandCount=[&]{return std::count_if(events.begin(),events.end(),[](const auto& event){return event.type=="command";});};auto before=commandCount();custom->Click();owner->manager()->dispatchMessages();check(commandCount()==before+1&&events.back().commandId=="custom"&&events.back().event=="custom-event","Dynamic runtime dispatch envelope");
 const int idleLayouts=layouts;send("menus.setItems",dynamic);for(int i=0;i<8;++i)adapter.pump();check(layouts==idleLayouts&&find(root,"extension-menu:menu-test:extra")==top,"Identical runtime state rebuilt menus");
 {ui::MessageLoop loop(owner->manager());top->openSubmenu();auto until=std::chrono::steady_clock::now()+std::chrono::seconds(3);while(!top->hasSubmenuOpened()&&std::chrono::steady_clock::now()<until)loop.pumpMessages();check(top->hasSubmenuOpened(),"Runtime popup did not open");const int prior=layouts;send("menus.setItems",R"({"menuId":"extra","items":[{"id":"custom","name":"Updated custom action","event":"custom-event","checked":true}]})");while(layouts==prior&&std::chrono::steady_clock::now()<until){adapter.pump();loop.pumpMessages();}check(layouts>prior,"Open runtime popup update did not settle");top=find(root,"extension-menu:menu-test:extra");custom=find(top->getSubmenu(),"extension-menu:menu-test:extra:dynamic:custom");check(custom&&custom->checked()&&!top->hasSubmenuOpened(),"Runtime popup close/rebuild state");top->openSubmenu();until=std::chrono::steady_clock::now()+std::chrono::seconds(3);while(!top->hasSubmenuOpened()&&std::chrono::steady_clock::now()<until)loop.pumpMessages();check(top->hasSubmenuOpened(),"Runtime popup reopen failed");owner->manager()->flushRedraw();owner->manager()->dispatchMessages();owner->manager()->flipAllDisplays();writeSmokeFrame(owner->display()->nativeSurface().get(),directory/"runtime-menu.bmp");bar->cancelMenuLoop();until=std::chrono::steady_clock::now()+std::chrono::seconds(3);while(top->hasSubmenuOpened()&&std::chrono::steady_clock::now()<until)loop.pumpMessages();check(!top->hasSubmenuOpened(),"Runtime popup did not close");send("menus.setItems",dynamic);flushMenus();}
 check(host->reportCommandState(token,JsonObject::Parse(LR"({"commandId":"paint","state":{"checked":true}})")),"Runtime command check report");flushMenus();paint=find(builtins["edit"],"menu-test:menu-item:edit-paint:paint");check(paint&&paint->checked(),"Static command checked not reflected");host->reportCommandState(token,JsonObject::Parse(LR"({"commandId":"paint","state":{"checked":false,"visible":false}})"));flushMenus();top=find(root,"extension-menu:menu-test:extra");check(!find(builtins["edit"],"menu-test:menu-item:edit-paint:paint")&&!find(top->getSubmenu(),"extension-menu:menu-test:extra:dynamic:paint"),"Runtime hidden command retained");host->reportCommandState(token,JsonObject::Parse(LR"({"commandId":"paint","state":{"visible":true}})"));flushMenus();paint=find(builtins["edit"],"menu-test:menu-item:edit-paint:paint");check(paint&&!paint->checked(),"Runtime false checked state lost");
 top=find(root,"extension-menu:menu-test:extra");custom=find(top->getSubmenu(),"extension-menu:menu-test:extra:dynamic:custom");before=commandCount();custom->Click();send("menus.setItems",R"({"menuId":"extra","items":[]})");owner->manager()->dispatchMessages();check(commandCount()==before,"Removed dynamic command executed from queue");flushMenus();
 // Panel commands follow ExtensionPanelHost/App.tsx, independent of menu
 // checked/visible state, while sharing the authenticated session dispatcher.
 auto panelToggle=find(panelMenu,"menu-test:tools");check(panelToggle,"Runtime panel menu missing");if(!panelToggle->checked())panelToggle->Click();flushMenus();
 ui::Widget* panel=nullptr;for(auto child:owner->manager()->children())if(child->id()=="menu-test:tools")panel=child;check(panel&&panel->isVisible(),"Runtime panel not open");
 std::function<PixelButton*(ui::Widget*,const char*)> panelButton=[&](ui::Widget* node,const char* id)->PixelButton*{if(node->id()==id)return dynamic_cast<PixelButton*>(node);for(auto child:node->children())if(auto result=panelButton(child,id))return result;return nullptr;};
 auto panelRun=panelButton(panel,"run"),panelPaint=panelButton(panel,"panel-paint"),panelSettings=panelButton(panel,"settings");check(panelRun&&panelPaint&&panelSettings,"Runtime panel commands missing");
 host->reportCommandState(token,JsonObject::Parse(LR"({"commandId":"run","state":{"visible":false,"checked":true}})"));host->reportCommandState(token,JsonObject::Parse(LR"({"commandId":"panel-paint","state":{"visible":false}})"));flushMenus();
 before=commandCount();panelRun->Click();owner->manager()->dispatchMessages();check(commandCount()==before+1&&events.back().commandId=="run"&&events.back().event=="run","Menu visibility incorrectly blocked panel runtime command");
 ran.clear();panelPaint->Click();owner->manager()->dispatchMessages();check(ran=="extension:menu-test:panel-paint","Menu visibility incorrectly blocked panel Lua command");
 ran.clear();panelPaint->Click();running=true;owner->manager()->dispatchMessages();check(ran.empty(),"Queued panel Lua ignored busy gate");adapter.pump();check(!panelPaint->isEnabled(),"Panel Lua busy presentation");running=false;adapter.pump();check(panelPaint->isEnabled(),"Panel Lua busy recovery");
 // Contributed settings and runtime requests share the same storage/registry.
 bool runtimeSettings=false;std::exception_ptr runtimeFailure;int runtimeTicks=0;ui::Timer runtimeDriver(25,owner);runtimeDriver.Tick.connect([&]{try{if(++runtimeTicks>100)throw std::runtime_error("Runtime settings timeout");for(auto child:ui::Manager::getDefault()->children())if(auto dialog=dynamic_cast<PixelDialog*>(child)){std::function<ui::Widget*(ui::Widget*,const char*)> search=[&](ui::Widget* node,const char* id)->ui::Widget*{if(node->id()==id)return node;for(auto child:node->children())if(auto found=search(child,id))return found;return nullptr;};auto toggle=dynamic_cast<PixelSwitch*>(search(dialog,"enabled"));auto run=dynamic_cast<PixelButton*>(search(dialog,"run"));if(!toggle||!run)continue;toggle->Click();runtimeSettings=true;runtimeDriver.stop();run->Click();break;}}catch(...){runtimeFailure=std::current_exception();runtimeDriver.stop();for(auto child:ui::Manager::getDefault()->children())if(auto dialog=dynamic_cast<PixelDialog*>(child))dialog->closeWindow(nullptr);}});before=commandCount();runtimeDriver.start();group=find(builtins["file"],"menu-test:menu-item:file-settings");settings=find(group->getSubmenu(),"menu-test:menu-item:file-settings:settings");send("ui.openSettings","{}");check(!runtimeSettings,"Settings opened synchronously inside runtime request");owner->manager()->dispatchMessages();runtimeDriver.stop();if(runtimeFailure)std::rethrow_exception(runtimeFailure);check(runtimeSettings&&commandCount()==before+1&&events.back().event=="run"&&runtimeStorage.get(u"menu-test",u"preferences").GetObject().GetNamedBoolean(L"enabled"),"Runtime settings storage/event/command bridge");
 // Exercise the actual modal loop: requests arriving while a settings callback
 // is on the stack must not create another foreground window or reopen on close.
 auto driveSettings=[&](const std::function<void()>& start,const std::function<bool(int,const std::vector<PixelDialog*>&)>& tick){
  std::exception_ptr failure;bool done=false;int ticks=0;ui::Timer driver(25,owner);
  driver.Tick.connect([&]{try{if(++ticks>120)throw std::runtime_error("Settings lifecycle timeout");std::vector<PixelDialog*> windows;for(auto child:owner->manager()->children())if(auto dialog=dynamic_cast<PixelDialog*>(child);dialog&&dialog->id().rfind("extension-settings:",0)==0)windows.push_back(dialog);check(windows.size()<=1,"Nested extension settings windows");if(tick(ticks,windows)){done=true;driver.stop();}}catch(...){failure=std::current_exception();driver.stop();auto children=owner->manager()->children();for(auto child:children)if(auto dialog=dynamic_cast<PixelDialog*>(child);dialog&&dialog->id().rfind("extension-settings:",0)==0)dialog->closeWindow(nullptr);}});
  driver.start();start();ui::MessageLoop loop(owner->manager());const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(!done&&!failure&&std::chrono::steady_clock::now()<deadline)loop.pumpMessages();driver.stop();if(failure)std::rethrow_exception(failure);check(done,"Settings lifecycle did not finish");
 };
 {
  PixelDialog* first=nullptr;PixelSwitch* control=nullptr;bool closed=false;int quiet=0;
  driveSettings([&]{for(int i=0;i<3;++i)send("ui.openSettings","{}");},[&](int tick,const auto& windows){
   if(windows.empty()){check(closed,"Settings missing before explicit close");return ++quiet==3;}
   check(!closed,"Duplicate request reopened closed settings");auto dialog=windows.front();
   if(!first){first=dialog;control=dynamic_cast<PixelSwitch*>(panelButton(dialog,"enabled"));check(control,"Lifecycle settings control missing");control->Click();send("ui.openSettings","{}");send("ui.openSettings","{}");panelSettings->Click();return false;}
   check(dialog==first&&panelButton(dialog,"enabled")==control,"Repeated request replaced live settings controls");if(tick>=3){closed=true;dialog->closeWindow(nullptr);}return false;
  });
 }
 {
  PixelDialog* first=nullptr;bool disabled=false,closed=false;
  driveSettings([&]{send("ui.openSettings","{}");},[&](int tick,const auto& windows){
   if(windows.empty())return closed;auto dialog=windows.front();if(!disabled){first=dialog;disabled=true;adapter.request(snapshot(false));adapter.pump();return false;}
   check(dialog==first&&dialog->isVisible(),"Disable incorrectly closed/replaced settings");if(tick>=3){closed=true;dialog->closeWindow(nullptr);}return false;
  });publish(snapshot(true));check(adapter.bindRuntime(host,"menu-test",token.generation),"Settings disable/re-enable binding");
 }
 {
  bool removed=false;driveSettings([&]{send("ui.openSettings","{}");},[&](int,const auto& windows){if(windows.empty())return removed;check(!removed,"Removed extension settings remained open");removed=true;adapter.request("[]");return false;});
  publish(snapshot(true));check(adapter.bindRuntime(host,"menu-test",token.generation),"Settings removal/reinstall binding");
 }
 {
  auto otherManifest=JsonObject::Parse(manifest.Stringify());otherManifest.Insert(L"id",JsonValue::CreateStringValue(L"menu-other"));auto other=extension::RuntimeDirectory::parseManifest(otherManifest,{},"menu-other");
  JsonArray list=JsonArray::Parse(winrt::to_hstring(snapshot(true)));JsonObject item;item.Insert(L"manifest",otherManifest);item.Insert(L"enabled",JsonValue::CreateBooleanValue(true));list.Append(item);publish(winrt::to_string(list.Stringify()));
  runtimeStorage.setEncoded(u"menu-test",u"preferences",R"({"enabled":true})");runtimeStorage.setEncoded(u"menu-other",u"preferences",R"({"enabled":false})");
  auto otherToken=host->open(other.extension,other.permissions,"zh-CN",[](const auto&){},{},runtimeCommands);host->loaded(otherToken,projectEvent);check(adapter.bindRuntime(host,"menu-other",otherToken.generation),"Second settings extension binding");
  auto otherCleanup=std::unique_ptr<int,std::function<void(int*)>>(new int,[&](int* p){adapter.unbindRuntime("menu-other");host->close(otherToken);delete p;});bool switched=false,closed=false;
  driveSettings([&]{send("ui.openSettings","{}");},[&](int,const auto& windows){
   if(windows.empty())return closed;auto dialog=windows.front();if(!switched){check(dialog->id()=="extension-settings:menu-test","Wrong initial settings target");switched=true;auto response=host->request(otherToken,JsonValue::Parse(LR"({"type":"moonsprite-extension-request","requestId":"switch","method":"ui.openSettings","params":{}})"));check(response&&response->GetNamedBoolean(L"ok"),"Cross-extension settings request failed");return false;}
   check(dialog->id()=="extension-settings:menu-other","Settings target switch did not settle");auto toggle=dynamic_cast<PixelSwitch*>(panelButton(dialog,"enabled"));check(toggle&&!toggle->checked(),"Cross-extension settings values leaked");closed=true;dialog->closeWindow(nullptr);return false;
  });check(runtimeStorage.get(u"menu-test",u"preferences").GetObject().GetNamedBoolean(L"enabled"),"Target switch changed original settings");publish(snapshot(true));
 }
 {
  // A second UI attachment owns its modal, then restores the previous request
  // handlers on destruction. Closing must not destroy a window on its own stack.
  auto temporaryBar=std::make_unique<ui::MenuBar>(ui::MenuBar::ProcessTopLevelShortcuts::kNo);temporaryBar->setMenu(new PixelMenu(skin));owner->addChild(temporaryBar.get());
  auto temporary=std::make_unique<ExtensionMenuAdapter>(font,skin,icons,owner,temporaryBar.get(),directory/"storage.json",[&]{return ready;},[&]{return project;},[&]{return running;},[&](const std::string&){},[]{},[&](const std::u32string& text){error=text;});temporary->request(snapshot(true));check(temporary->bindRuntime(host,"menu-test",token.generation),"Temporary settings owner binding");bool destroyed=false;
  driveSettings([&]{send("ui.openSettings","{}");},[&](int,const auto& windows){if(windows.empty())return destroyed;check(!destroyed,"Destroyed adapter retained settings window");destroyed=true;temporary.reset();return false;});
 }
 // A failed construction must release ownership and allow the next valid open.
 {
  auto htmlManifest=JsonObject::Parse(manifest.Stringify());htmlManifest.Remove(L"settingsUi");htmlManifest.Insert(L"settingsEntry",JsonValue::CreateStringValue(L"settings.html"));JsonObject item;item.Insert(L"manifest",htmlManifest);item.Insert(L"enabled",JsonValue::CreateBooleanValue(true));JsonArray list;list.Append(item);publish(winrt::to_string(list.Stringify()));send("ui.openSettings","{}");owner->manager()->dispatchMessages();check(!error.empty(),"Unsupported settings construction did not report failure");error.clear();publish(snapshot(true));bool closed=false;driveSettings([&]{send("ui.openSettings","{}");},[&](int,const auto& windows){if(windows.empty())return closed;closed=true;windows.front()->closeWindow(nullptr);return false;});
 }
 std::ofstream(directory/"settings-lifecycle-passed.txt")<<"Single settings owner: pending/live deduplication, disable/removal, isolated target switch, teardown and construction failure recovery passed";
 panel=nullptr;for(auto child:owner->manager()->children())if(child->id()=="menu-test:tools")panel=child;check(panel,"Panel missing after lifecycle checks");
 send("menus.setItems",dynamic);flushMenus();top=find(root,"extension-menu:menu-test:extra");custom=find(top->getSubmenu(),"extension-menu:menu-test:extra:dynamic:custom");custom->Click();panelRun=panelButton(panel,"run");check(panelRun,"Panel command missing after lifecycle checks");panelRun->Click();send("commands.execute",R"({"commandId":"paint"})");send("ui.openSettings","{}");ran.clear();before=commandCount();auto previous=token;token=host->open(runtimeCandidate.extension,runtimeCandidate.permissions,"zh-CN",[&](const auto& event){events.push_back(event);},{},runtimeCommands);host->setDeclaredMenus(token,{"extra"});host->loaded(token,projectEvent);check(adapter.bindRuntime(host,"menu-test",token.generation),"Runtime menu replacement bind");owner->manager()->dispatchMessages();check(ran.empty()&&commandCount()==before&&!host->presentationRevision(previous),"Queued old-generation command delivered");flushMenus();send("commands.execute",R"({"commandId":"paint"})");ran.clear();adapter.unbindRuntime("menu-test");owner->manager()->dispatchMessages();check(ran.empty(),"Detached runtime executed queued Lua");auto disconnected=host->request(token,JsonValue::Parse(LR"({"type":"moonsprite-extension-request","requestId":"detached","method":"ui.openSettings","params":{}})"));check(disconnected&&!disconnected->GetNamedBoolean(L"ok"),"Detached UI callbacks remained registered");check(adapter.bindRuntime(host,"menu-test",token.generation),"Runtime UI rebind failed");send("menus.setItems",dynamic);flushMenus();host->close(token);flushMenus();top=find(root,"extension-menu:menu-test:extra");check(top&&!find(top->getSubmenu(),"extension-menu:menu-test:extra:dynamic:custom"),"Closed runtime retained presentation");check(error.empty(),"Runtime menu host error");std::ofstream(directory/"runtime-menus-passed.txt")<<"Native session to actual menu/settings, state, stale generation and cleanup passed";
 publish(snapshot(false));check(!find(root,"extension-menu:menu-test:extra")&&builtins["file"]->children().size()==1&&builtins["edit"]->children().size()==1&&!adapter.placed("extension:menu-test:paint"),"Disabled extension retained contribution");
 check(panelMenu->children().empty()&&!adapter.placed("extension:menu-test:panel-paint"),"Disabled panel menu retained");
 publish(snapshot(true));check(find(root,"extension-menu:menu-test:extra")&&builtins["file"]->children().size()==3,"Reenabled contribution duplicate");publish("[]");check(root->children().size()==9&&builtins["file"]->children().size()==1,"Removed extension retained menu");check(error.empty(),"Contribution UI error");
 checkExtensionPanels(font,skin,icons,owner,directory/"panels");
}catch(const winrt::hresult_error& e){throw std::runtime_error("Extension menus fixture: "+winrt::to_string(e.message()));}
}
