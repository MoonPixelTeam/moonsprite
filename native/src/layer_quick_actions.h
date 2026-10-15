#pragma once
#include <algorithm>
#include <filesystem>
#include <functional>
#include <string>
#include <vector>
namespace moon::layerquick {
constexpr int limit=5;
struct Metadata {const char* id;const char* icon;const char32_t* label;};
inline const std::vector<Metadata>& metadata(){static const std::vector<Metadata> values{
 {"newLayer","plus",U"新建图层"},{"newTilemapLayer","tilemap",U"新建瓦片图层"},{"newFreeTileLayer","freeTile",U"新建自由瓦片图层"},{"newBackgroundLayer","image",U"新建背景图层"},{"createLayerGroup","newFolder",U"新建图层组"},
 {"duplicateLayer","copy",U"复制所选对象"},{"deleteLayer","delete",U"删除所选图层"},{"createLinkedLayer","linkedLayer",U"创建关联图层"},{"mergeLayerDown","mergeDown",U"向下合并"},{"mergeSelectedLayers","mergeDown",U"合并所选图层"},{"mergeLayerGroup","mergeDown",U"合并图层组"},{"mergeVisibleLayers","mergeVisible",U"合并可见图层"},{"ungroupLayers","ungroupFolder",U"解组"},
 {"toggleClippingMask","clippingMask",U"剪贴蒙版"},{"toggleLayerMask","layerMask",U"新建图层蒙版"},{"toggleGroupMask","layerMask",U"新建图层组蒙版"},{"openLayerProperties","properties",U"图层属性"},{"openLayerStyles","layerStyle",U"打开图层样式"},{"toggleLayerStyles","layerStyle",U"图层样式"},{"copyLayerStyles","copy",U"复制图层样式"},{"pasteLayerStyles","paste",U"粘贴图层样式"},{"clearLayerStyles","delete",U"清除图层样式"},{"convertLayerToBackground","image",U"转换为背景图层"},{"convertLayerToTilemap","tilemap",U"转换为瓦片图层"},{"convertLayerToRaster","image",U"转换为普通图层"}};return values;}
struct Action {std::string id;bool enabled=false;bool operator==(const Action& rhs)const{return id==rhs.id&&enabled==rhs.enabled;}};
using Actions=std::vector<Action>;
inline const Metadata* find(const std::string& id){for(const auto& m:metadata())if(m.id==id)return &m;return nullptr;}
inline Actions normalize(const Actions& input){Actions out;for(const auto& a:input)if(find(a.id)&&std::none_of(out.begin(),out.end(),[&](const auto& b){return b.id==a.id;}))out.push_back(a);for(std::size_t i=0;i<metadata().size();++i)if(std::none_of(out.begin(),out.end(),[&](const auto& a){return a.id==metadata()[i].id;}))out.push_back({metadata()[i].id,i<5});return out;}
inline int count(const Actions& a){return int(std::count_if(a.begin(),a.end(),[](const auto& v){return v.enabled;}));}
inline bool toggle(Actions& a,const std::string& id,bool enabled,const std::function<bool(const std::string&)>& connected){if((enabled&&!connected(id))|| (enabled&&count(a)>=limit))return false;for(auto& v:a)if(v.id==id){if(v.enabled==enabled)return false;v.enabled=enabled;return true;}return false;}
inline bool reorder(Actions& a,const std::string& source,const std::string& target,bool after){if(source==target)return false;auto from=std::find_if(a.begin(),a.end(),[&](const auto& v){return v.id==source;});if(from==a.end()||std::none_of(a.begin(),a.end(),[&](const auto& v){return v.id==target;}))return false;auto before=a;const auto moved=*from;a.erase(from);auto to=std::find_if(a.begin(),a.end(),[&](const auto& v){return v.id==target;});a.insert(to+(after?1:0),moved);return a!=before;}
inline Actions visible(const Actions& a,const std::function<bool(const std::string&)>& connected){Actions out;for(const auto& v:a)if(v.enabled&&connected(v.id)){out.push_back(v);if(out.size()==limit)break;}return out;}
inline int edgeDirection(int x,int y,int left,int top,int width,int height){if(x<left||x>left+width)return 0;const int edge=std::min(32,std::max(16,height/4));return y<=top+edge?-1:y>=top+height-edge?1:0;}
Actions parse(const std::string& json);
std::string serialize(const Actions& actions);
Actions load(const std::filesystem::path& path);
void save(const std::filesystem::path& path,const Actions& actions);
}
