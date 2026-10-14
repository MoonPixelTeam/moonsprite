#include "menu_catalog.h"
#include <set>
#include <stdexcept>
#include <iostream>
using namespace moon::menus;
void check(bool b){if(!b)throw std::runtime_error("Menu catalog contract failed");}
void checkLegacyDividers(){
 const std::map<std::string,std::vector<std::string>> expected={
  {"file",{"save","openTimelapse","scripts"}}, {"scripts",{"openScriptFolder"}},
  {"edit",{"cut","fillForeground","transform","invertColors","openShortcutSettings"}},
  {"filters",{"filter:crt-scanlines-subtle","lcdScreen"}},
  {"select",{"freeTransform","selectionConvert"}},
  {"canvas",{"canvasResize","cropCanvas"}}, {"perspective",{"openIsoViewSettings"}},
  {"layerCreate",{"newGradientMapLayer"}},
  {"layer",{"mergeLayerDown","toggleClippingMask","layerStyles","openLayerProperties"}},
  {"layerStyles",{"copyLayerStyles"}},
  {"window",{"display","rotateView","panels","advancedMode"}},
  {"help",{"openComponentLibrary"}}
 };
 std::map<std::string,std::vector<std::string>> actual;
 for(const auto& e:catalog())if(e.separatorBefore){check(*e.parent);actual[e.parent].push_back(e.id);}
 check(actual==expected);
}
int main(){checkLegacyDividers();std::set<std::string> ids;int leaves=0,top=0;for(const auto&e:catalog()){check(ids.insert(e.id).second);if(*e.parent)check(ids.count(e.parent));else ++top;if(!e.group)++leaves;check(std::string(e.id)!="skin");if(std::string(e.id)=="redo")check(std::string(e.shortcut)=="Ctrl+Shift+Z");if(std::string(e.id)=="resetView")check(std::string(e.shortcut).empty());}check(top==7&&leaves==142);Commands c;int calls=0;bool enabled=false;check(!c.invoke("undo"));check(!c.bind("file",{[]{},{},{}}));check(!c.bind("bogus",{[]{},{},{}}));check(!c.bind("undo",{}));check(c.bind("undo",{[&]{++calls;},[&]{return enabled;},[]{return true;}}));check(c.connected("undo")&&!c.invoke("undo")&&calls==0);enabled=true;check(c.invoke("undo")&&calls==1&&c.checked("undo"));std::cout<<"Menu catalog contracts passed\n";}
