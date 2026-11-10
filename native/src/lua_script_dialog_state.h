#pragma once
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <cmath>
#include <optional>
#include <string>
namespace moon::script {
// LuaScriptDialog.tsx valuesRef and ScriptControl event semantics. This class
// belongs to one window; replacing a returned dialog resets its draft values.
class DialogState {
 using Object=winrt::Windows::Data::Json::JsonObject;
 using Value=winrt::Windows::Data::Json::IJsonValue;
 using Type=winrt::Windows::Data::Json::JsonValueType;
 using Array=winrt::Windows::Data::Json::JsonArray;
 Object dialog_{nullptr},values_;
 Object control(const std::string& id)const{
  for(const auto& item:dialog_.GetNamedArray(L"controls")){auto c=item.GetObject();if(c.GetNamedString(L"id")==winrt::to_hstring(id))return c;}
  throw std::invalid_argument("Lua dialog control does not exist");
 }
 static winrt::hstring key(const Object& c){return c.HasKey(L"dataKey")&&c.GetNamedValue(L"dataKey").ValueType()==Type::String?c.GetNamedString(L"dataKey"):winrt::hstring{};}
 bool editable(const Object& c,bool busy)const{return !busy&&c.GetNamedBoolean(L"enabled")&&c.GetNamedBoolean(L"visible");}
 std::string action(const Object* c,const wchar_t* event)const{
  using namespace winrt::Windows::Data::Json;Object out;out.Insert(L"dialogId",dialog_.GetNamedValue(L"id"));out.Insert(L"controlId",c?c->GetNamedValue(L"id"):JsonValue::CreateNullValue());out.Insert(L"event",JsonValue::CreateStringValue(event));out.Insert(L"values",values_);return winrt::to_string(out.Stringify());
 }
public:
 explicit DialogState(const std::string& json){reset(json);}
 void reset(const std::string& json){
  auto next=Object::Parse(winrt::to_hstring(json));Object values;
  for(const auto& item:next.GetNamedArray(L"controls")){auto c=item.GetObject();const auto k=key(c);if(!k.empty())values.Insert(k,c.GetNamedValue(L"value"));}
  dialog_=next;values_=values;
 }
 std::string valuesJson()const{return winrt::to_string(values_.Stringify());}
 std::string close()const{return action(nullptr,L"close");}
 // Reflect a local native widget edit. Entry/number/color/slider changes are
 // drafts until their original commit event; no callback on every keystroke.
 bool edit(const std::string& id,const std::string& valueJson,bool busy=false){
  auto c=control(id);if(!editable(c,busy))return false;const auto k=key(c);if(k.empty())return false;
  const auto kind=c.GetNamedString(L"kind");auto value=winrt::Windows::Data::Json::JsonValue::Parse(winrt::to_hstring(valueJson));
  bool valid=false;
  if(kind==L"entry"||kind==L"combobox")valid=value.ValueType()==Type::String;
  else if(kind==L"number"||kind==L"slider")valid=value.ValueType()==Type::Number&&std::isfinite(value.GetNumber());
  else if(kind==L"check")valid=value.ValueType()==Type::Boolean;
  else if(kind==L"color"&&value.ValueType()==Type::Object){valid=true;auto color=value.GetObject();for(auto channel:{L"r",L"g",L"b",L"a"})valid=valid&&color.HasKey(channel)&&color.GetNamedValue(channel).ValueType()==Type::Number&&std::isfinite(color.GetNamedNumber(channel));}
  if(!valid)return false;values_.Insert(k,value);return true;
 }
 // Click checkboxes after edit(); radio clicks update the contiguous radio
 // group, including hidden/disabled peers, as the legacy component does.
 std::optional<std::string> click(const std::string& id,bool busy=false){
  auto c=control(id);if(!editable(c,busy))return {};const auto kind=c.GetNamedString(L"kind");if(kind!=L"button"&&kind!=L"check"&&kind!=L"radio")return {};
  if(kind==L"radio"){
   auto controls=dialog_.GetNamedArray(L"controls");std::uint32_t index=0;while(index<controls.Size()&&controls.GetObjectAt(index).GetNamedString(L"id")!=c.GetNamedString(L"id"))++index;
   auto start=index,end=index;while(start&&controls.GetObjectAt(start-1).GetNamedString(L"kind")==L"radio")--start;while(end+1<controls.Size()&&controls.GetObjectAt(end+1).GetNamedString(L"kind")==L"radio")++end;
   for(auto i=start;i<=end;++i){auto peer=controls.GetObjectAt(i);const auto k=key(peer);if(!k.empty())values_.Insert(k,winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(i==index));}
  }
  return action(&c,L"click");
 }
 enum class Commit {Blur,Enter,PointerUp,Change};
 std::optional<std::string> commit(const std::string& id,Commit trigger,bool busy=false)const{
  auto c=control(id);if(!editable(c,busy))return {};const auto kind=c.GetNamedString(L"kind");
  if(kind==L"slider"&&(trigger==Commit::Blur||trigger==Commit::PointerUp))return action(&c,L"release");
  if((kind==L"entry"&&(trigger==Commit::Blur||trigger==Commit::Enter))||(kind==L"number"&&trigger==Commit::Blur)||((kind==L"color"||kind==L"combobox")&&trigger==Commit::Change))return action(&c,L"change");
  return {};
 }
};
}
