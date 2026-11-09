#pragma once
#include "extension_localization.h"
#include "extension_menu_state.h"
namespace moon::extension {
enum class ContributionKind {Panel,MenuItem,TopMenu};
struct Contribution {
 std::string key,openMenuId,extensionId,extensionName;
 ManifestContribution declaration;std::vector<ManifestCommand> commands;
};
inline std::string commandScriptId(const std::string& extension,const std::string& command){return "extension:"+extension+":"+command;}
inline std::vector<Contribution> contributions(const std::vector<RuntimeCandidate>& extensions,ContributionKind kind){
 std::vector<Contribution> result;for(const auto& extension:extensions){if(!extension.enabled)continue;const auto& declarations=kind==ContributionKind::Panel?extension.metadata.panels:kind==ContributionKind::MenuItem?extension.metadata.menuItems:extension.metadata.topMenus;
  // JS Map construction selects the last command with a duplicate ID. Valid
  // manifests are unique, but retain this behavior for in-memory callers.
  std::map<std::string,ManifestCommand> commands;for(auto& c:extension.commands)commands[c.runtime.id]=c;
  for(auto& declaration:declarations){Contribution c;c.extensionId=extension.extension.id;c.extensionName=extension.metadata.name;c.declaration=declaration;c.key=kind==ContributionKind::Panel?c.extensionId+":"+declaration.id:kind==ContributionKind::MenuItem?c.extensionId+":menu-item:"+declaration.id:"extension-menu:"+c.extensionId+":"+declaration.id;if(kind==ContributionKind::TopMenu)c.openMenuId=c.key;for(auto& id:declaration.commands){auto found=commands.find(id);if(found!=commands.end())c.commands.push_back(found->second);}result.push_back(std::move(c));}
 }return result;
}
inline std::vector<Contribution> menuItemsAt(const std::vector<Contribution>& items,const std::string& menu,const std::string& position){std::vector<Contribution> result;for(auto& item:items)if(item.declaration.menu==menu&&item.declaration.position==position)result.push_back(item);return result;}
inline std::vector<std::string> arrangeTopMenus(const std::vector<std::string>& builtins,const std::vector<Contribution>& items){
 std::vector<std::string> ordered;std::set<std::string> seen;auto append=[&](const std::string& id){if(seen.insert(id).second)ordered.push_back(id);};auto at=[&](const std::string& position){for(auto& c:items)if(c.declaration.position==position)append(c.openMenuId);};at("start");for(auto& id:builtins){at("before:"+id);append(id);at("after:"+id);}at("end");return ordered;
}
// Render-neutral menu nodes retain even standalone separators, as AppMenuBar
// does when visibility removes the command next to them.
struct MenuNode {
 bool divider=false,submenu=false,checked=false,disabled=false;
 std::string key,title,label;ManifestCommand command;std::vector<MenuNode> children;
};
struct PresentedMenu {std::string name,title;std::vector<MenuNode> nodes;};
inline std::optional<MenuNode> presentCommand(const ManifestCommand& command,const std::string& key,const MenuState& state,bool extensionExists,bool hasProject,bool luaRunning,std::optional<bool> checkedOverride={}){
 if(!state.visible(command.runtime.id))return {};
 MenuNode result;result.key=key;result.command=command;result.title=command.description.empty()?command.name:command.description;result.checked=checkedOverride.value_or(state.checked(command.runtime.id));result.disabled=!extensionExists||(command.runtime.handler=="lua"&&(!hasProject||luaRunning));return result;
}
inline PresentedMenu presentTopMenu(const Contribution& contribution,const MenuState& state,bool extensionExists,bool hasProject,bool luaRunning){
 PresentedMenu result;auto dynamicName=state.name(contribution.declaration.id);result.name=dynamicName?winrt::to_string(*dynamicName):contribution.declaration.name.value_or("");result.title=contribution.declaration.description.value_or("");if(result.title.empty())result.title=contribution.extensionName;
 auto append=[&](const ManifestCommand& command,const std::string& key,std::optional<bool> checked={}){auto node=presentCommand(command,key,state,extensionExists,hasProject,luaRunning,checked);if(node)result.nodes.push_back(std::move(*node));};
 const auto dynamic=state.items(contribution.declaration.id);std::set<std::string> replaced;
 for(const auto& item:dynamic){replaced.insert(item.id);if(item.dividerBefore){MenuNode divider;divider.divider=true;divider.key=contribution.key+":divider:"+item.id;result.nodes.push_back(std::move(divider));}ManifestCommand command;command.runtime={item.id,"runtime",item.event,false};command.name=winrt::to_string(item.name);append(command,contribution.key+":dynamic:"+item.id,item.checked);}
 if(!dynamic.empty()&&std::any_of(contribution.commands.begin(),contribution.commands.end(),[&](const auto& command){return !replaced.count(command.runtime.id);})){MenuNode divider;divider.divider=true;result.nodes.push_back(std::move(divider));}
 for(const auto& command:contribution.commands)if(!replaced.count(command.runtime.id))append(command,contribution.key+":"+command.runtime.id);
 return result;
}
inline std::vector<MenuNode> presentExistingMenus(const std::vector<Contribution>& contributions,const std::string& menu,const std::string& position,const std::function<const MenuState&(const std::string&)>& state,const std::function<bool(const std::string&)>& exists,bool hasProject,bool luaRunning){
 const auto selected=menuItemsAt(contributions,menu,position);std::vector<MenuNode> result;if(selected.empty())return result;
 auto divider=[&](std::string key){MenuNode node;node.divider=true;node.key=std::move(key);result.push_back(std::move(node));};
 if(position=="end")divider(menu+":"+position+":leading-divider");
 for(std::size_t i=0;i<selected.size();++i){const auto& c=selected[i];if(i)divider(c.key+":divider");std::vector<MenuNode> commands;for(const auto& command:c.commands){auto node=presentCommand(command,c.key+":"+command.runtime.id,state(c.extensionId),exists(c.extensionId),hasProject,luaRunning);if(node)commands.push_back(std::move(*node));}if(c.declaration.name&&!c.declaration.name->empty()){MenuNode node;node.submenu=true;node.key=c.key;node.label=*c.declaration.name;node.title=c.declaration.description.value_or("");node.children=std::move(commands);result.push_back(std::move(node));}else result.insert(result.end(),commands.begin(),commands.end());}
 if(position=="start")divider(menu+":"+position+":trailing-divider");return result;
}
inline std::vector<LuaEntry> unplacedLuaEntries(const std::vector<LuaEntry>& entries,const std::vector<RuntimeCandidate>& extensions){
 std::set<std::string> placed;for(const auto& extension:extensions)if(extension.enabled)for(const auto* declarations:{&extension.metadata.panels,&extension.metadata.menuItems,&extension.metadata.topMenus})for(const auto& declaration:*declarations)for(const auto& id:declaration.commands)placed.insert(commandScriptId(extension.extension.id,id));
 std::vector<LuaEntry> result;for(const auto& entry:entries)if(!entry.commandId||!placed.count(commandScriptId(entry.extensionId,*entry.commandId)))result.push_back(entry);return result;
}
inline bool activateMenuNode(const MenuNode& node,const RuntimeRegistry& registry,const RuntimeExtension& extension,const CommandHandlers& handlers){if(node.divider||node.submenu||node.disabled)return false;return executeCommand(registry,extension,node.command.runtime,handlers);}
inline std::string panelVisibilityKey(const std::string& panel){return "moonsprite.extension-panel-visible.v1."+panel;}
inline std::map<std::string,bool> reconcilePanelVisibility(const std::vector<RuntimeCandidate>& extensions,const std::map<std::string,bool>& current,const std::function<std::optional<std::string>(const std::string&)>& read){
 std::map<std::string,bool> result;for(auto& c:contributions(extensions,ContributionKind::Panel)){auto found=current.find(c.key);if(found!=current.end()){result[c.key]=found->second;continue;}auto stored=read(panelVisibilityKey(c.key));result[c.key]=stored?*stored=="true":c.declaration.defaultVisible;}return result;
}
inline void savePanelVisibility(const std::string& panel,bool visible,const std::function<void(const std::string&,const std::string&)>& write){write(panelVisibilityKey(panel),visible?"true":"false");}
}
