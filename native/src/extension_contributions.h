#pragma once
#include "extension_localization.h"
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
inline std::string panelVisibilityKey(const std::string& panel){return "moonsprite.extension-panel-visible.v1."+panel;}
inline std::map<std::string,bool> reconcilePanelVisibility(const std::vector<RuntimeCandidate>& extensions,const std::map<std::string,bool>& current,const std::function<std::optional<std::string>(const std::string&)>& read){
 std::map<std::string,bool> result;for(auto& c:contributions(extensions,ContributionKind::Panel)){auto found=current.find(c.key);if(found!=current.end()){result[c.key]=found->second;continue;}auto stored=read(panelVisibilityKey(c.key));result[c.key]=stored?*stored=="true":c.declaration.defaultVisible;}return result;
}
inline void savePanelVisibility(const std::string& panel,bool visible,const std::function<void(const std::string&,const std::string&)>& write){write(panelVisibilityKey(panel),visible?"true":"false");}
}
