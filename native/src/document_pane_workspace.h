#pragma once
#include "document_pane_layout.h"
namespace moon::workspace::panes {
// useAppDocumentPanes.ts: UI-independent session/layout transitions. IDs are
// document session IDs; this state never owns or changes document content.
struct Floating {std::string document;Rect initial;bool pinned=false;};
struct Workspace {
 Layout layout;
 std::vector<std::string> paneOnly,open;
 std::vector<Floating> floating;
 std::string main,active;
 std::vector<std::string> floatingIds()const{std::vector<std::string> ids;for(const auto& f:floating)ids.push_back(f.document);return ids;}
 bool hidden(const std::string& id)const{return has(paneOnly,id)||has(floatingIds(),id);}
 Layout visible()const{return main.empty()?Layout{}:committed(layout,main);}
 void reconcileMain(){
  auto available=[&](const std::string& id){return !id.empty()&&has(open,id)&&!hidden(id);};
  if(available(active))main=active;
  else if(!available(main)){main.clear();for(auto i=open.rbegin();i!=open.rend();++i)if(available(*i)){main=*i;break;}}
  if(!main.empty())layout=selectMain(layout,main,paneOnly);
 }
 void activateTab(const std::string& id){if(!has(open,id))return;main=active=id;layout=selectMain(layout,main,paneOnly);}
 void activate(const std::string& id){if(!has(open,id))return;active=id;reconcileMain();}
 void split(const Placement& placement,const IdFactory& ids){
  if(main.empty()||placement.document==placement.target)return;
  const auto before=main;layout=splitFromTab(layout,main,placement,ids);
  if(!has(paneOnly,placement.document))paneOnly.push_back(placement.document);
  if(before==placement.document){paneOnly.erase(std::remove(paneOnly.begin(),paneOnly.end(),placement.target),paneOnly.end());main=placement.target;if(active==placement.document)active=placement.target;}
 }
 void movePane(const std::string& id,const std::string& target,Direction direction,const IdFactory& ids){if(layout)layout=move(layout,id,target,direction,ids);}
 void reorderReturned(const std::string& id,int index){
  std::vector<std::string> visibleIds,hiddenIds;
  for(const auto& item:open)if(item!=id)(hidden(item)?hiddenIds:visibleIds).push_back(item);
  visibleIds.insert(visibleIds.begin()+std::clamp(index,0,int(visibleIds.size())),id);
  visibleIds.insert(visibleIds.end(),hiddenIds.begin(),hiddenIds.end());open=std::move(visibleIds);
 }
 void floatDocument(const std::string& id,Rect initial){
  if(!has(open,id)||has(floatingIds(),id))return;
  auto available=open;const auto floats=floatingIds();available.erase(std::remove_if(available.begin(),available.end(),[&](const auto& item){return item==id||has(floats,item);}),available.end());std::reverse(available.begin(),available.end());
  auto next=detach(layout,id,main,paneOnly,available);floating.push_back({id,initial,false});layout=next.layout;paneOnly=std::move(next.paneOnly);main=next.workspace;active=id;
 }
 void activateFloating(const std::string& id){
  if(!has(open,id))return;auto it=std::find_if(floating.begin(),floating.end(),[&](const auto& f){return f.document==id;});
  if(it!=floating.end()&&it+1!=floating.end()){auto f=*it;floating.erase(it);floating.push_back(std::move(f));}active=id;
 }
 void pin(const std::string& id,bool value){auto it=std::find_if(floating.begin(),floating.end(),[&](const auto& f){return f.document==id;});if(it==floating.end()||it->pinned==value)return;auto f=*it;f.pinned=value;floating.erase(it);floating.push_back(std::move(f));}
 void returnFloating(const std::string& id,std::optional<int> index={}){
  if(!has(open,id))return;
  floating.erase(std::remove_if(floating.begin(),floating.end(),[&](const auto& f){return f.document==id;}),floating.end());
  if(index)reorderReturned(id,*index);
  const bool preserve=index&&!main.empty()&&main!=id&&has(open,main)&&!has(floatingIds(),main);
  paneOnly.erase(std::remove(paneOnly.begin(),paneOnly.end(),id),paneOnly.end());if(!preserve)main=id;active=main;layout=selectMain(layout,main,paneOnly);
 }
 void returnPane(const std::string& id,int index){
  if(!layout)return;std::vector<std::string> available;for(const auto& item:open)if(item!=id&&!has(floatingIds(),item))available.push_back(item);
  auto next=detach(layout,id,main,paneOnly,available);layout=next.layout;paneOnly=std::move(next.paneOnly);reorderReturned(id,index);main=next.workspace.empty()?id:next.workspace;active=main;
 }
 // Reconcile closed sessions in one transaction, preserving secondary nodes.
 void reconcile(const std::vector<std::string>& sessions,const std::string& selected){
  std::vector<std::string> closed;for(const auto& id:open)if(!has(sessions,id))closed.push_back(id);
  std::vector<std::string> candidates;for(const auto& id:sessions)if(!hidden(id)&&!has(closed,id))candidates.push_back(id);
  std::string closedMain;for(const auto& id:closed)if(layout&&!layout->leaf&&contains(layout,id)&&!has(paneOnly,id)){closedMain=id;break;}
  auto remaining=closedMain.empty()?Layout{}:remove(layout,closedMain);std::string promoted;
  for(const auto& id:leafIds(remaining))if(has(sessions,id)){promoted=id;break;}
  for(const auto& id:closed){if(!contains(layout,id))continue;std::string replacement;if(id==closedMain)for(const auto& candidate:candidates)if(!contains(layout,candidate)){replacement=candidate;break;}layout=replacement.empty()?remove(layout,id):replace(layout,id,replacement);}
  if(layout&&layout->leaf)layout.reset();open=sessions;active=selected;
  if(!closedMain.empty()){const auto replacement=candidates.empty()?promoted:candidates.front();if(!replacement.empty()){main=active=replacement;if(candidates.empty())paneOnly.erase(std::remove(paneOnly.begin(),paneOnly.end(),replacement),paneOnly.end());}}
  paneOnly.erase(std::remove_if(paneOnly.begin(),paneOnly.end(),[&](const auto& id){return !has(open,id)||!layout||layout->leaf||!contains(layout,id);}),paneOnly.end());
  floating.erase(std::remove_if(floating.begin(),floating.end(),[&](const auto& f){return !has(open,f.document);}),floating.end());reconcileMain();
 }
};
inline Rect floatingPosition(Point anchor,const Rect& viewport,const Rect& source){
 const double width=std::min(std::max(280.,viewport.width-16),std::max(360.,std::min(720.,source.width*.72)));
 const double height=std::min(std::max(200.,viewport.height-16),std::max(240.,std::min(560.,source.height*.72)));
 const double x=std::max(4.,std::min(std::max(4.,viewport.width-width-4),anchor.x-48)),y=std::max(4.,std::min(std::max(4.,viewport.height-height-4),anchor.y-14));
 return {x,y,x+width,y+height,width,height};
}
}
