#pragma once
#include "extension_diagnostics.h"
#include <optional>
#include <map>
#include <chrono>
#include "javascript_text.h"
#include <charconv>
namespace moon::extension {
// ExtensionDialogForm's state, scoped to one authenticated window generation.
// Renderer/chooser adapters use these values on the event thread.
class FormState {
 using Object=winrt::Windows::Data::Json::JsonObject;using Value=winrt::Windows::Data::Json::IJsonValue;using Json=winrt::Windows::Data::Json::JsonValue;using Type=winrt::Windows::Data::Json::JsonValueType;using Array=winrt::Windows::Data::Json::JsonArray;
 Object view_,values_,defaults_;std::wstring pending_,error_;std::uint64_t sequence_=0,generation_=0;bool busy_=false,loaded_=false,active_=true;
 std::chrono::steady_clock::time_point started_=std::chrono::steady_clock::now();
 static Object copy(const Object& value){return Object::Parse(value.Stringify());}
 static Value property(const Object& object,const wchar_t* key){return object.HasKey(key)?object.GetNamedValue(key):Value{nullptr};}
 static bool nullish(const Value& value){return !value||value.ValueType()==Type::Null;}
 static bool truthy(const Value& value){if(nullish(value))return false;if(value.ValueType()==Type::Boolean)return value.GetBoolean();if(value.ValueType()==Type::String)return !value.GetString().empty();if(value.ValueType()==Type::Number)return value.GetNumber()!=0;return true;}
 static bool equal(const Value& a,const Value& b){if(!a||!b)return !a&&!b;if(a.ValueType()!=b.ValueType())return false;switch(a.ValueType()){case Type::Null:return true;case Type::Boolean:return a.GetBoolean()==b.GetBoolean();case Type::Number:return a.GetNumber()==b.GetNumber();case Type::String:return a.GetString()==b.GetString();default:return a==b;}}
 void defaults(const Array& nodes,Object& out,int depth=0)const{if(depth>8)return;for(const auto& value:nodes){if(value.ValueType()!=Type::Object)continue;const auto node=value.GetObject();const auto id=property(node,L"id");if(id&&id.ValueType()==Type::String&&node.HasKey(L"value"))out.Insert(id.GetString(),node.GetNamedValue(L"value"));const auto children=property(node,L"children");if(children&&children.ValueType()==Type::Array)defaults(children.GetArray(),out,depth+1);}}
 bool visible(const Object& node,const Object& defaults)const{auto condition=property(node,L"visibleWhen");if(!condition||condition.ValueType()!=Type::Object)return true;for(const auto& pair:condition.GetObject()){auto actual=property(values_,pair.Key().c_str());if(nullish(actual))actual=property(defaults,pair.Key().c_str());if(!equal(actual,pair.Value()))return false;}return true;}
 std::optional<Object> find(const Array& nodes,const std::wstring& id,const Object& defaults,int depth=0)const{
  if(depth>8)return {};const auto limit=depth==0?200u:100u;for(std::uint32_t i=0;i<std::min(limit,nodes.Size());++i){const auto value=nodes.GetAt(i);if(value.ValueType()!=Type::Object)continue;auto node=value.GetObject();const auto key=property(node,L"id"),label=property(node,L"label"),type=property(node,L"type");if(!key||key.ValueType()!=Type::String||(label&&label.ValueType()!=Type::String)||!visible(node,defaults))continue;
   if(std::wstring(key.GetString())==id)return node;
   if(!type||type.ValueType()!=Type::String)continue;const auto kind=type.GetString();if(kind!=L"dialog"&&kind!=L"split"&&kind!=L"sidebar"&&kind!=L"column"&&kind!=L"row"&&kind!=L"slot")continue;auto children=property(node,L"children");if(children&&children.ValueType()==Type::Array){auto subset=children.GetArray();const auto count=kind==L"split"?2u:kind==L"slot"?16u:100u;Array rendered;for(std::uint32_t j=0;j<std::min(count,subset.Size());++j)rendered.Append(subset.GetAt(j));if(auto result=find(rendered,id,defaults,depth+1))return result;}
  }return {};
 }
 std::optional<Object> control(const std::wstring& id)const{if(!active_||busy_)return {};auto node=find(view_.GetNamedArray(L"nodes"),id,defaults_);if(!node||truthy(property(*node,L"disabled")))return {};return node;}
 Object send(const Object& action,const Object& extra){Object message=copy(action);for(const auto& pair:extra)message.Insert(pair.Key(),pair.Value());message.Insert(L"values",copy(values_));pending_=std::to_wstring(++sequence_);message.Insert(L"requestId",Json::CreateStringValue(pending_));busy_=true;return message;}
 static Object action(const Object& node,const wchar_t* key=L"action"){const auto value=property(node,key);return value&&value.ValueType()==Type::Object?value.GetObject():Object{};}
public:
 static bool displayBoolean(const Value& value){return truthy(value);}
 // ExtensionDialogForm Number.isFinite(Number(value)): preserve coercion at
 // presentation only. Defaults and strict visibleWhen comparisons stay raw.
 static double displayNumber(const Value& value){if(!value)return 1;if(value.ValueType()==Type::Null)return 0;if(value.ValueType()==Type::Boolean)return value.GetBoolean()?1:0;if(value.ValueType()==Type::Number)return std::isfinite(value.GetNumber())?value.GetNumber():1;if(value.ValueType()==Type::Object)return 1;const auto string=diagnosticString(value);std::u32string units;for(auto c:string)units+=char32_t(c);const auto trimmed=javascriptTrim(units);if(trimmed.empty())return 0;std::string ascii;for(auto c:trimmed){if(c>127)return 1;ascii+=char(c);}if(ascii.size()>2&&ascii[0]=='0'&&(ascii[1]=='x'||ascii[1]=='X'||ascii[1]=='b'||ascii[1]=='B'||ascii[1]=='o'||ascii[1]=='O')){const int base=ascii[1]=='x'||ascii[1]=='X'?16:ascii[1]=='b'||ascii[1]=='B'?2:8;double result=0;for(std::size_t i=2;i<ascii.size();++i){const char c=ascii[i];const int digit=c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:99;if(digit>=base)return 1;result=result*base+digit;}return std::isfinite(result)?result:1;}const char* first=ascii.data();if(*first=='+')++first;if(first==ascii.data()+ascii.size())return 1;double result=0;auto parsed=std::from_chars(first,ascii.data()+ascii.size(),result,std::chars_format::general);return parsed.ec==std::errc{}&&parsed.ptr==ascii.data()+ascii.size()&&std::isfinite(result)?result:1;}
 struct File {std::wstring name,mime;std::vector<std::uint8_t> bytes;};
 using Save=std::function<bool(const File&)>;
 struct ImportTicket{std::wstring id;std::uint64_t generation,sequence;};
 struct ImportEncoding{
  ImportTicket ticket;std::vector<File> files;Array encoded,bytes;std::size_t file=0,offset=0;
  // Every pump caps both COM allocations and time spent appending bytes.
  bool advance(std::size_t budget=4096){const auto until=std::chrono::steady_clock::now()+std::chrono::milliseconds(2);while(file<files.size()){
   const auto& input=files[file];while(offset<input.bytes.size()){if(!budget||std::chrono::steady_clock::now()>=until)return false;bytes.Append(Json::CreateNumberValue(input.bytes[offset++]));--budget;}
   Object entry;entry.Insert(L"name",Json::CreateStringValue(input.name));entry.Insert(L"mime",Json::CreateStringValue(input.mime));entry.Insert(L"bytes",bytes);encoded.Append(entry);bytes=Array{};++file;offset=0;
  }return true;}
 };
 std::optional<ImportEncoding> encodeImport(const ImportTicket& ticket,std::vector<File> selected){if(!ownsImport(ticket))return {};const auto node=find(view_.GetNamedArray(L"nodes"),ticket.id,defaults_);if(!node){busy_=false;return {};}
  const bool single=node->HasKey(L"multiple")&&property(*node,L"multiple").ValueType()==Type::Boolean&&!node->GetNamedBoolean(L"multiple");
  if(single&&selected.size()!=1){fileFailed(L"请选择一个动画文件。");return {};}std::size_t total=0;for(const auto& file:selected){if(file.bytes.size()>16u*1024*1024-total){fileFailed(L"最多 16 个文件，合计不超过 16 MiB。");return {};}total+=file.bytes.size();}if(selected.size()>16){fileFailed(L"最多 16 个文件，合计不超过 16 MiB。");return {};}return ImportEncoding{ticket,std::move(selected)};
 }
 std::optional<Object> finishImport(ImportEncoding& encoding){if(!ownsImport(encoding.ticket)||encoding.file!=encoding.files.size())return {};busy_=false;auto node=control(encoding.ticket.id);if(!node||property(*node,L"type").GetString()!=L"file")return {};Object extra;extra.Insert(L"files",encoding.encoded);return send(action(*node),extra);}
 std::optional<ImportTicket> beginImport(const std::wstring& id){auto node=control(id);if(!node||property(*node,L"type").GetString()!=L"file")return {};busy_=true;return ImportTicket{id,generation_,++sequence_};}
 bool ownsImport(const ImportTicket& ticket)const{return active_&&generation_==ticket.generation&&sequence_==ticket.sequence&&busy_&&pending_.empty();}
 std::optional<Object> finishImport(const ImportTicket& ticket,const std::vector<File>& selected){if(!ownsImport(ticket))return {};busy_=false;return files(ticket.id,selected);}
 void failImport(const ImportTicket& ticket,const std::wstring& error){if(ownsImport(ticket))fileFailed(error);}
 FormState(){view_.Insert(L"nodes",Array{});}
 const Object& view()const{return view_;}Object drafts()const{return copy(values_);}bool busy()const{return busy_;}bool loaded()const{return loaded_;}bool active()const{return active_;}const std::wstring& loadError()const{return error_;}std::uint64_t generation()const{return generation_;}
 Value effectiveValue(const std::wstring& id)const{const auto& all=defaults_;auto value=property(values_,id.c_str());return nullish(value)?property(all,id.c_str()):value;}
 std::vector<std::wstring> renderedIds()const{const auto& all=defaults_;std::vector<std::wstring> ids;auto visit=[&](auto&& self,const Array& nodes,int depth,std::uint32_t limit)->void{if(depth>8)return;for(std::uint32_t i=0;i<std::min(limit,nodes.Size());++i){auto value=nodes.GetAt(i);if(value.ValueType()!=Type::Object)continue;auto node=value.GetObject();auto id=property(node,L"id"),label=property(node,L"label"),type=property(node,L"type");if(!id||id.ValueType()!=Type::String||(label&&label.ValueType()!=Type::String)||!visible(node,all))continue;ids.push_back(std::wstring(id.GetString()));if(!type||type.ValueType()!=Type::String)continue;auto kind=type.GetString();if(kind!=L"dialog"&&kind!=L"split"&&kind!=L"sidebar"&&kind!=L"column"&&kind!=L"row"&&kind!=L"slot")continue;auto children=property(node,L"children");if(children&&children.ValueType()==Type::Array)self(self,children.GetArray(),depth+1,kind==L"split"?2u:kind==L"slot"?16u:100u);}};visit(visit,view_.GetNamedArray(L"nodes"),0,200);return ids;}
 bool shown(const std::wstring& id)const{const auto& all=defaults_;return bool(find(view_.GetNamedArray(L"nodes"),id,all));}
 void tick(std::chrono::steady_clock::time_point now){if(active_&&!loaded_&&error_.empty()&&now-started_>=std::chrono::seconds(15))error_=L"Extension form did not respond.";}
 void fileFailed(std::wstring message){if(active_){view_.Insert(L"status",Json::CreateStringValue(message));busy_=false;}}
 void loadFailed(std::wstring error){if(active_)error_=std::move(error);}
 void retry(std::chrono::steady_clock::time_point now=std::chrono::steady_clock::now()){if(!active_)return;error_.clear();loaded_=false;busy_=false;values_=Object{};pending_.clear();++generation_;started_=now;}
 void close(){active_=false;busy_=false;pending_.clear();values_=Object{};}
 bool edit(const std::wstring& id,const Value& value){auto node=control(id);if(!node)return false;const auto kind=property(*node,L"type");if(!kind||kind.ValueType()!=Type::String)return false;
  if(kind.GetString()==L"input"){if(!value||value.ValueType()!=Type::String)return false;const auto text=value.GetString();values_.Insert(id,Json::CreateStringValue(winrt::hstring(text.data(),std::min<std::uint32_t>(64,text.size()))));return true;}
  if(kind.GetString()==L"number"){if(!value||value.ValueType()!=Type::Number||!std::isfinite(value.GetNumber()))return false;values_.Insert(id,value);return true;}
  if(kind.GetString()==L"select"){if(!value||value.ValueType()!=Type::String)return false;values_.Insert(id,value);return true;}return false;
 }
 std::optional<Object> click(const std::wstring& id,std::optional<bool> toggled={}){auto node=control(id);if(!node)return {};const auto type=property(*node,L"type");if(!type||type.ValueType()!=Type::String)return {};const auto kind=type.GetString();Object extra;
  if(kind==L"toggle"){if(!toggled)return {};extra.Insert(L"value",Json::CreateBooleanValue(*toggled));}
  else if(kind!=L"button"&&kind!=L"choice"&&kind!=L"dialog")return {};return send(action(*node),extra);
 }
 std::optional<Object> context(const std::wstring& id){auto node=control(id);if(!node||!node->HasKey(L"contextAction"))return {};auto message=send(action(*node,L"contextAction"),Object{});values_=Object{};return message;}
 std::optional<Object> files(const std::wstring& id,const std::vector<File>& files){auto node=control(id);if(!node||property(*node,L"type").GetString()!=L"file")return {};const bool single=node->HasKey(L"multiple")&&node->GetNamedValue(L"multiple").ValueType()==Type::Boolean&&!node->GetNamedBoolean(L"multiple");
  auto fail=[&](const wchar_t* message)->std::optional<Object>{view_.Insert(L"status",Json::CreateStringValue(message));busy_=false;return {};};if(single&&files.size()!=1)return fail(L"请选择一个动画文件。");if(files.size()>16)return fail(L"最多 16 个文件，合计不超过 16 MiB。");std::size_t total=0;for(const auto& file:files){if(file.bytes.size()>16u*1024*1024-total)return fail(L"最多 16 个文件，合计不超过 16 MiB。");total+=file.bytes.size();}
  Array encoded;for(const auto& file:files){Object entry;entry.Insert(L"name",Json::CreateStringValue(file.name));entry.Insert(L"mime",Json::CreateStringValue(file.mime));Array bytes;for(auto byte:file.bytes)bytes.Append(Json::CreateNumberValue(byte));entry.Insert(L"bytes",bytes);encoded.Append(entry);}Object extra;extra.Insert(L"files",encoded);return send(action(*node),extra);
 }
 // Synchronous native choosers can dispatch session callbacks while open.
 // Keep chooser/read failures and selected bytes within their original session.
 std::optional<Object> importFiles(const std::wstring& id,const std::function<std::optional<std::vector<File>>()>& choose){
  const auto node=control(id);if(!node||property(*node,L"type").GetString()!=L"file")return {};
  const auto generation=generation_,sequence=sequence_;
  const auto current=[&]{return active_&&generation_==generation&&sequence_==sequence;};
  try{const auto selected=choose();if(selected&&current())return files(id,*selected);}
  catch(const std::exception& error){if(current())fileFailed(winrt::to_hstring(error.what()).c_str());}
  catch(const winrt::hresult_error& error){if(current())fileFailed(error.message().c_str());}
  return {};
 }
 bool receive(const Value& value,std::uint64_t generation,const Save& save={}){
  if(!active_||generation!=generation_||!value||value.ValueType()!=Type::Object)return false;auto next=value.GetObject();auto nodes=property(next,L"nodes");if(!nodes||nodes.ValueType()!=Type::Array)return false;view_=copy(next);defaults_=Object{};defaults(view_.GetNamedArray(L"nodes"),defaults_);loaded_=true;error_.clear();
  auto result=property(next,L"result");if(pending_.empty()||!result||result.ValueType()!=Type::Object)return true;const auto reply=result.GetObject();const auto request=property(reply,L"requestId");if(!request||request.ValueType()!=Type::String||request.GetString()!=pending_)return true;
  pending_.clear();values_=Object{};
  // The native chooser pumps events. A push in this generation keeps the
  // legacy current-view status merge, but retry/close or a newer action owns
  // its own completion and must not be unlocked by this save returning.
  const auto completedSequence=sequence_;
  const auto ownsCompletion=[&]{return active_&&generation_==generation&&sequence_==completedSequence;};
  const auto status=[&](const winrt::hstring& message){if(ownsCompletion())view_.Insert(L"status",Json::CreateStringValue(message));};
  try{const auto file=property(reply,L"file");if(truthy(file)){
    if(file.ValueType()!=Type::Object)throw std::invalid_argument("扩展导出文件无效。");const auto object=file.GetObject();const auto name=property(object,L"name"),bytes=property(object,L"bytes");if(!name||name.ValueType()!=Type::String||name.GetString().empty()||name.GetString().size()>120||!bytes||bytes.ValueType()!=Type::Array||bytes.GetArray().Size()>12u*1024*1024)throw std::invalid_argument("扩展导出文件无效。");File output;output.name=name.GetString();for(auto c:output.name)if(c<32||std::wstring(L"<>:\"/\\|?*").find(c)!=std::wstring::npos)throw std::invalid_argument("扩展导出文件无效。");for(const auto& byte:bytes.GetArray()){if(byte.ValueType()!=Type::Number||byte.GetNumber()<0||byte.GetNumber()>255||std::floor(byte.GetNumber())!=byte.GetNumber())throw std::invalid_argument("扩展导出文件无效。");output.bytes.push_back(std::uint8_t(byte.GetNumber()));}
    if(!save)throw std::runtime_error("Native extension file save is not connected");status(save(output)?L"文件已导出":L"已取消导出");
   }}catch(const std::exception& e){status(winrt::to_hstring(e.what()));}catch(const winrt::hresult_error& e){status(e.message());}if(ownsCompletion())busy_=false;return true;
 }
};
}
