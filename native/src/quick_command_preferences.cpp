#include "quick_command_preferences.h"
#include "legacy_json_number.h"
#include <algorithm>
#include <array>
#include <set>
#include <winrt/Windows.Foundation.Collections.h>

namespace moon::quick {
using namespace winrt::Windows::Data::Json;
namespace {
const std::array<std::vector<std::string>,4> DEFAULT={{{"selectionFlipHorizontal","selectionFlipVertical","canvasMirrorHorizontal","canvasMirrorVertical","invertSelection","customGrid","tileRepeatBoth","relativeLuminance","detectImageScale","centerSelectionBoth","centerSelectionHorizontal","centerSelectionVertical","quickAntiAlias"},{"undo","redo","cut","copy","copyMerged","paste","pasteToCurrentCell","pasteAsNewDocument","pasteAsNewLayer","deleteContent","fillForeground","quickOutline","outline","selectionFlipHorizontal","selectionFlipVertical","centerSelectionBoth","centerSelectionHorizontal","centerSelectionVertical","quickAntiAlias"},{"selectionFlipHorizontal"},{"selectionFlipHorizontal"}}};
const std::array<std::vector<std::string>,4> PREVIOUS_DEFAULT={{{"selectionFlipHorizontal","selectionFlipVertical","canvasMirrorHorizontal","canvasMirrorVertical","invertSelection","customGrid","tileRepeatBoth","relativeLuminance","detectImageScale","centerSelectionBoth","centerSelectionHorizontal","centerSelectionVertical","quickAntiAlias"},{"tileRepeatX","tileRepeatY","pixelGrid","selectionOutline","resetView"},{"undo","redo","fillForeground","deleteSelection","swapForegroundBackground"},{"selectAll","deselect","createBrushFromSelection","rotateViewClockwise90","rotateViewCounterClockwise90"}}};
const std::array<std::vector<std::string>,4> EARLIER_DEFAULT={{{"selectionFlipHorizontal","selectionFlipVertical","canvasMirrorHorizontal","canvasMirrorVertical","invertSelection","customGrid","tileRepeatBoth","relativeLuminance","detectImageScale","centerSelectionBoth","centerSelectionHorizontal","centerSelectionVertical","quickAntiAlias"},{"undo","redo","relativeLuminance","resetView","rotateViewClockwise90","rotateViewCounterClockwise90"},{"tileRepeatX","tileRepeatY","pixelGrid","selectionOutline","fillForeground"},{"selectAll","deselect","deleteSelection","swapForegroundBackground","createBrushFromSelection"}}};
const std::array<std::vector<std::string>,4> RECENT_DEFAULT={{{"selectionFlipHorizontal","selectionFlipVertical","canvasMirrorHorizontal","canvasMirrorVertical","invertSelection","customGrid","tileRepeatBoth","relativeLuminance","detectImageScale","centerSelectionBoth","centerSelectionHorizontal","centerSelectionVertical","quickAntiAlias"},{"undo","redo","relativeLuminance","resetView","rotateViewClockwise90","rotateViewCounterClockwise90"},{"selectionFlipHorizontal"},{"selectionFlipHorizontal"}}};
const std::vector<std::string> ids={"cut","copy","copyMerged","paste","pasteToCurrentCell","pasteAsNewDocument","pasteAsNewLayer","deleteContent","quickOutline","outline","selectionFlipHorizontal","selectionFlipVertical","canvasMirrorHorizontal","canvasMirrorVertical","invertSelection","customGrid","tileRepeatX","tileRepeatY","tileRepeatBoth","undo","redo","selectAll","deselect","pixelGrid","selectionOutline","relativeLuminance","resetView","fillForeground","deleteSelection","quickAntiAlias","swapForegroundBackground","createBrushFromSelection","rotateViewClockwise90","rotateViewCounterClockwise90","detectImageScale","centerSelectionBoth","centerSelectionHorizontal","centerSelectionVertical"};
const std::array<std::u16string,4> names={u"默认快捷指令栏",u"编辑快捷指令栏",u"快捷指令栏1",u"快捷指令栏2"};
std::u16string units(const winrt::hstring& s){return {reinterpret_cast<const char16_t*>(s.data()),s.size()};}
winrt::hstring wide(const std::u16string& s){return {reinterpret_cast<const wchar_t*>(s.data()),std::uint32_t(s.size())};}
std::u16string trim(std::u16string s){auto space=[](char16_t c){return project::legacyjson::numberSpace(c);};while(!s.empty()&&space(s.front()))s.erase(s.begin());while(!s.empty()&&space(s.back()))s.pop_back();return s;}
IJsonValue field(const JsonObject& o,const wchar_t* key){return o.HasKey(key)?o.GetNamedValue(key):JsonValue::CreateNullValue();}
bool yes(IJsonValue v){return v.ValueType()==JsonValueType::Boolean&&v.GetBoolean();}
std::string string(IJsonValue v){return v.ValueType()==JsonValueType::String?winrt::to_string(v.GetString()):std::string();}
std::vector<Command> create(const std::vector<std::string>& group){std::vector<Command> out;for(auto& id:group)out.push_back({id,true});for(auto& id:ids)if(std::find(group.begin(),group.end(),id)==group.end())out.push_back({id,false});return out;}
std::vector<Command> commands(IJsonValue value){
 if(value.ValueType()!=JsonValueType::Array)return defaultCommands();
 std::set<std::string> seen;std::vector<Command> out;
 for(auto v:value.GetArray()){if(v.ValueType()!=JsonValueType::Object)continue;auto o=v.GetObject();auto id=string(field(o,L"id"));if(std::find(ids.begin(),ids.end(),id)==ids.end()||!seen.insert(id).second)continue;out.push_back({id,yes(field(o,L"enabled"))});}
 if(out.empty())return defaultCommands();for(auto c:defaultCommands())if(!seen.count(c.id))out.push_back(c);
 if(std::none_of(out.begin(),out.end(),[](auto& c){return c.enabled;}))out.front().enabled=true;return out;
}
bool group(const Bar& b,const std::vector<std::string>& enabled){return b.commands.size()==ids.size()&&std::all_of(b.commands.begin(),b.commands.end(),[&](auto& c){return c.enabled==(std::find(enabled.begin(),enabled.end(),c.id)!=enabled.end());});}
bool oldName(const std::u16string& name){
 std::u16string s=name;for(auto& c:s)if(c>=u'A'&&c<=u'Z')c+=32;
 for(const auto& prefix:{std::u16string(u"快捷指令栏"),std::u16string(u"quick command bar")})if(s.rfind(prefix,0)==0){auto suffix=s.substr(prefix.size());while(!suffix.empty()&&project::legacyjson::numberSpace(suffix.front()))suffix.erase(suffix.begin());if(!suffix.empty()&&std::all_of(suffix.begin(),suffix.end(),[](auto c){return c>=u'0'&&c<=u'9';}))return true;}return false;
}
constexpr const wchar_t* edges[]={L"top",L"right",L"bottom",L"left",L"none"};
}
const std::vector<std::string>& commandIds(){return ids;}
bool reorderCommands(std::vector<Command>& items,const std::string& source,const std::string& target,bool after){
 auto from=std::find_if(items.begin(),items.end(),[&](auto& c){return c.id==source;});
 auto to=std::find_if(items.begin(),items.end(),[&](auto& c){return c.id==target;});
 if(from==items.end()||to==items.end()||source==target)return false;
 auto next=items;auto item=next[std::size_t(from-items.begin())];next.erase(next.begin()+(from-items.begin()));
 auto at=std::find_if(next.begin(),next.end(),[&](auto& c){return c.id==target;});next.insert(at+(after?1:0),item);
 bool same=true;for(unsigned i=0;i<items.size();++i)same=same&&items[i].id==next[i].id;
 if(same)return false;items=std::move(next);return true;
}
std::vector<Command> defaultCommands(unsigned group){return create(DEFAULT.at(group));}
std::vector<Bar> defaultBars(){std::vector<Bar> out;for(unsigned i=0;i<4;++i)out.push_back({"quick-command-bar-"+std::to_string(i+1),names[i],i?Edge::None:Edge::Top,.5,false,defaultCommands(i)});return out;}
std::vector<Command> parseCommands(const std::string& json){try{return commands(JsonValue::Parse(winrt::to_hstring(json)));}catch(const winrt::hresult_error&){return defaultCommands();}}
std::vector<Bar> parseBars(const std::string& json,const std::vector<Command>& fallback){try{
 auto parsed=JsonValue::Parse(winrt::to_hstring(json));if(parsed.ValueType()!=JsonValueType::Array)return defaultBars();
 std::vector<Bar> bars;std::set<std::string> seen;unsigned index=0;
 for(auto value:parsed.GetArray()){
  if(bars.size()==4)break;const auto candidateIndex=index++;
  if(value.ValueType()!=JsonValueType::Object)continue;auto o=value.GetObject();Bar b;
  auto id=field(o,L"id");b.id=id.ValueType()==JsonValueType::String&&!trim(units(id.GetString())).empty()?winrt::to_string(id.GetString()):"quick-command-bar-"+std::to_string(candidateIndex+1);
  auto name=field(o,L"name");b.name=name.ValueType()==JsonValueType::String?trim(units(name.GetString())):u"";
  // Legacy out-of-range default-name indexing throws and falls back globally.
  if(b.name.empty()){if(candidateIndex>=4)return defaultBars();b.name=names[candidateIndex];}else if(b.name.size()>32)b.name.resize(32);
  auto edge=field(o,L"edge");for(int i=0;i<5;++i)if(edge.ValueType()==JsonValueType::String&&edge.GetString()==edges[i])b.edge=Edge(i);
  auto position=field(o,L"position");if(position.ValueType()==JsonValueType::Number&&std::isfinite(position.GetNumber()))b.position=std::clamp(position.GetNumber(),0.,1.);
  b.expanded=yes(field(o,L"expanded"));auto c=field(o,L"commands");b.commands=c.ValueType()==JsonValueType::Array?commands(c):fallback;if(seen.insert(b.id).second)bars.push_back(std::move(b));
 }
 if(bars.empty())return defaultBars();
 for(unsigned i=0;i<bars.size();++i)if(oldName(bars[i].name)){
  bars[i].name=names[i];if(i==1&&group(bars[i],{"undo","redo","resetView","rotateViewClockwise90","rotateViewCounterClockwise90"})){bars[i].commands=defaultCommands(1);if(bars[i].edge==Edge::None)bars[i].edge=Edge::Bottom;}
 }
 const std::vector<std::string> legacy={"selectionFlipHorizontal","selectionFlipVertical","canvasMirrorHorizontal","canvasMirrorVertical","invertSelection","customGrid","tileRepeatX","tileRepeatY","tileRepeatBoth","relativeLuminance","detectImageScale","centerSelectionBoth","centerSelectionHorizontal","centerSelectionVertical"};
 if(bars.size()==1&&group(bars[0],legacy)){bars[0].edge=Edge::Top;bars[0].commands=defaultCommands();}
 if(bars.size()==4){bool upgrade=false;for(auto* old:{&PREVIOUS_DEFAULT,&EARLIER_DEFAULT,&RECENT_DEFAULT}){bool match=true;for(unsigned i=0;i<4;++i)match=match&&group(bars[i],(*old)[i]);upgrade=upgrade||match;}if(upgrade)for(unsigned i=0;i<4;++i)bars[i].commands=defaultCommands(i);}
 auto defaults=defaultBars();for(unsigned i=unsigned(bars.size());i<4;++i){auto b=defaults[i];unsigned suffix=1;while(seen.count(b.id))b.id=defaults[i].id+"-"+std::to_string(suffix++);seen.insert(b.id);bars.push_back(std::move(b));}return bars;
 }catch(const winrt::hresult_error&){return defaultBars();}}
std::string encodeBars(const std::vector<Bar>& bars){JsonArray out;for(auto& b:bars){JsonObject o;o.Insert(L"id",JsonValue::CreateStringValue(winrt::to_hstring(b.id)));o.Insert(L"name",JsonValue::CreateStringValue(wide(b.name)));o.Insert(L"edge",JsonValue::CreateStringValue(edges[int(b.edge)]));o.Insert(L"position",JsonValue::CreateNumberValue(b.position));o.Insert(L"expanded",JsonValue::CreateBooleanValue(b.expanded));JsonArray list;for(auto& c:b.commands){JsonObject v;v.Insert(L"id",JsonValue::CreateStringValue(winrt::to_hstring(c.id)));v.Insert(L"enabled",JsonValue::CreateBooleanValue(c.enabled));list.Append(v);}o.Insert(L"commands",list);out.Append(o);}return winrt::to_string(out.Stringify());}
Position moveBar(const Drag& drag,Rect container,Rect measured,double x,double y,unsigned count){
 if(container.width<=0||container.height<=0)return {drag.startEdge,.5};
 const double distances[]={std::abs(y-container.y),std::abs(x-container.x-container.width),std::abs(y-container.y-container.height),std::abs(x-container.x)};
 unsigned edge=0;for(unsigned i=1;i<4;++i)if(distances[i]<distances[edge])edge=i;
 auto vertical=[](Edge e){return e==Edge::Left||e==Edge::Right;};bool v=vertical(Edge(edge)),start=vertical(drag.startEdge);
 double trackStart=v?container.y:container.x,trackSize=v?container.height:container.width;
 double commandSize=(double(count)+2)*28+5,size=v?(start?measured.height:commandSize):(!start?measured.width:commandSize);
 double low=trackStart+8+size/2,high=trackStart+trackSize-8-size/2,raw=(v?y:x)-(start==v?drag.grabOffset:0),middle=trackStart+trackSize/2;
 double snapped=std::abs(raw-middle)<=12?middle:raw,center=low<=high?std::clamp(snapped,low,high):middle;
 return {Edge(edge),std::clamp((center-trackStart)/trackSize,0.,1.)};
}
}
