#include "extension_js_engine.h"
#include "extension_js_bootstrap.h"
#include "extension_js_window_bootstrap.h"
#include "quickjs.h"
#include <algorithm>
#include <cctype>
#include <stdexcept>
#include <string_view>
namespace moon::extension {
struct JsEngine::State {
 JSRuntime* runtime=nullptr;JSContext* context=nullptr;
 std::chrono::steady_clock::time_point deadline;
 const std::chrono::steady_clock::time_point origin=std::chrono::steady_clock::now();
 std::vector<Message> messages;std::size_t messageBytes=0,messageLimit=20u*1024u*1024u;
 std::vector<std::pair<JSValue,JSValue>> rejected;bool rejectionOverflow=false;
 static void rejection(JSContext* context,JSValueConst promise,JSValueConst reason,bool handled,void* opaque){auto* self=static_cast<State*>(opaque);for(auto it=self->rejected.begin();it!=self->rejected.end();++it)if(JS_VALUE_GET_PTR(it->first)==JS_VALUE_GET_PTR(promise)){if(handled){JS_FreeValue(context,it->first);JS_FreeValue(context,it->second);self->rejected.erase(it);}return;}if(!handled){if(self->rejected.size()>=256){self->rejectionOverflow=true;return;}try{self->rejected.emplace_back(JS_DupValue(context,promise),JS_DupValue(context,reason));}catch(...){self->rejectionOverflow=true;}}}
 static int interrupt(JSRuntime*,void* opaque){return std::chrono::steady_clock::now()>=static_cast<State*>(opaque)->deadline;}
 static JSValue post(JSContext* context,JSValueConst,int argc,JSValueConst* argv){
  auto* self=static_cast<State*>(JS_GetContextOpaque(context));
  if(argc!=1)return JS_ThrowTypeError(context,"Expected serialized extension message");
  size_t size=0;const char* text=JS_ToCStringLen(context,&size,argv[0]);if(!text)return JS_EXCEPTION;
  if(self->messages.size()>=512||size>self->messageLimit-self->messageBytes){JS_FreeCString(context,text);return JS_ThrowRangeError(context,"Extension message queue is full");}
  try{self->messages.push_back({std::string(text,size)});self->messageBytes+=size;}catch(...){JS_FreeCString(context,text);return JS_ThrowOutOfMemory(context);}JS_FreeCString(context,text);return JS_UNDEFINED;
 }
 std::string exception(){auto error=JS_GetException(context);const char* text=JS_ToCString(context,error);std::string message=text?text:"QuickJS exception";if(text)JS_FreeCString(context,text);auto stack=JS_IsObject(error)?JS_GetPropertyStr(context,error,"stack"):JS_UNDEFINED;if(!JS_IsException(stack)&&!JS_IsUndefined(stack)){text=JS_ToCString(context,stack);if(text){message+='\n';message+=text;JS_FreeCString(context,text);}}JS_FreeValue(context,stack);JS_FreeValue(context,error);return message;}
 void checked(JSValue value){if(JS_IsException(value))throw std::runtime_error(exception());JS_FreeValue(context,value);}
 void call(const char* name,JSValue argument){auto global=JS_GetGlobalObject(context);auto function=JS_GetPropertyStr(context,global,name);auto result=JS_Call(context,function,global,1,&argument);JS_FreeValue(context,argument);JS_FreeValue(context,function);JS_FreeValue(context,global);checked(result);}
 State(){runtime=JS_NewRuntime();if(!runtime)throw std::runtime_error("Cannot allocate QuickJS runtime");JS_SetMemoryLimit(runtime,64u*1024u*1024u);JS_SetMaxStackSize(runtime,512u*1024u);JS_SetInterruptHandler(runtime,interrupt,this);context=JS_NewContext(runtime);if(!context){JS_FreeRuntime(runtime);runtime=nullptr;throw std::runtime_error("Cannot allocate QuickJS context");}JS_SetContextOpaque(context,this);JS_SetHostPromiseRejectionTracker(runtime,rejection,this);auto global=JS_GetGlobalObject(context);JS_SetPropertyStr(context,global,"__moonPost",JS_NewCFunction(context,post,"__moonPost",1));JS_FreeValue(context,global);}
 ~State(){for(auto& item:rejected){JS_FreeValue(context,item.first);JS_FreeValue(context,item.second);}rejected.clear();if(context)JS_FreeContext(context);if(runtime)JS_FreeRuntime(runtime);}
};
JsEngine::JsEngine():state_(std::make_unique<State>()){evaluate(jsNativePrelude,"native-runtime.js");evaluate(jsRuntimeBootstrap,"legacy-runtime-bootstrap.js");}
JsEngine::JsEngine(const std::string& windowId):state_(std::make_unique<State>()){
 JS_SetMemoryLimit(state_->runtime,256u*1024u*1024u);state_->messageLimit=128u*1024u*1024u;
 evaluate(jsNativePrelude,"native-window.js");
 auto id=JS_NewStringLen(state_->context,windowId.data(),windowId.size());auto json=JS_JSONStringify(state_->context,id,JS_UNDEFINED,JS_UNDEFINED);JS_FreeValue(state_->context,id);
 if(JS_IsException(json))throw std::runtime_error(state_->exception());const char* encoded=JS_ToCString(state_->context,json);if(!encoded){JS_FreeValue(state_->context,json);throw std::runtime_error(state_->exception());}
 std::string source=jsWindowBootstrap;const auto at=source.find("__MOONSPRITE_WINDOW_ID__");source.replace(at,std::string("__MOONSPRITE_WINDOW_ID__").size(),encoded);JS_FreeCString(state_->context,encoded);JS_FreeValue(state_->context,json);source.replace(source.find("__MOONSPRITE_OVERLAY__"),std::string("__MOONSPRITE_OVERLAY__").size(),"false");evaluate(source,"legacy-window-bootstrap.js");
}
JsEngine::~JsEngine()=default;
void JsEngine::evaluate(const std::string& source,const std::string& filename,bool module){auto& s=*state_;s.deadline=std::chrono::steady_clock::now()+std::chrono::milliseconds(100);s.checked(JS_Eval(s.context,source.c_str(),source.size(),filename.c_str(),module?JS_EVAL_TYPE_MODULE:JS_EVAL_TYPE_GLOBAL));}
void JsEngine::deliver(const std::string& envelope){auto& s=*state_;s.deadline=std::chrono::steady_clock::now()+std::chrono::milliseconds(20);auto value=JS_ParseJSON(s.context,envelope.data(),envelope.size(),"host-message.json");if(JS_IsException(value))throw std::runtime_error(s.exception());s.call("__moonReceive",value);}
void JsEngine::pump(std::chrono::steady_clock::time_point deadline){auto& s=*state_;s.deadline=deadline;if(std::chrono::steady_clock::now()>=deadline)return;const auto millis=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-s.origin).count();s.call("__moonTick",JS_NewFloat64(s.context,double(millis)));while(JS_IsJobPending(s.runtime)&&std::chrono::steady_clock::now()<deadline){JSContext* context=nullptr;if(JS_ExecutePendingJob(s.runtime,&context)<0)throw std::runtime_error(s.exception());}if(s.rejectionOverflow)throw std::runtime_error("Extension Promise rejection queue is full");if(!JS_IsJobPending(s.runtime)&&!s.rejected.empty()){const auto reason=s.rejected.front().second;const char* text=JS_ToCString(s.context,reason);std::string message=text?text:"Unhandled extension Promise rejection";if(text)JS_FreeCString(s.context,text);for(auto& item:s.rejected){JS_FreeValue(s.context,item.first);JS_FreeValue(s.context,item.second);}s.rejected.clear();throw std::runtime_error(message);}}
std::vector<JsEngine::Message> JsEngine::takeMessages(){auto& s=*state_;auto result=std::move(s.messages);s.messages.clear();s.messageBytes=0;return result;}
bool JsEngine::pending()const{return JS_IsJobPending(state_->runtime);}
namespace {
std::string lower(std::string text){for(auto& c:text)if(c>='A'&&c<='Z')c=char(c-'A'+'a');return text;}
bool space(char c){return c==' '||c=='\t'||c=='\r'||c=='\n'||c=='\f';}
}
// HTML raw-text script rules: quoted tag attributes and comments are skipped;
// classic and module inline scripts run in source order. CSP blocks src scripts.
std::vector<RuntimeScript> runtimeScripts(const std::string& html){
 if(html.size()>1024u*1024u)throw std::length_error("Extension runtime entry exceeds 1 MiB");
 const auto folded=lower(html);std::vector<RuntimeScript> result;size_t at=0;
 while((at=folded.find('<',at))!=std::string::npos){
  if(folded.compare(at,4,"<!--")==0){auto end=folded.find("-->",at+4);at=end==std::string::npos?folded.size():end+3;continue;}
  const auto begin=at++;bool closing=at<html.size()&&html[at]=='/';if(closing)++at;auto start=at;while(at<html.size()&&((folded[at]>='a'&&folded[at]<='z')||(folded[at]>='0'&&folded[at]<='9')||folded[at]=='-'))++at;const auto tag=folded.substr(start,at-start);
  bool external=false,module=false,skip=false,nomodule=false;
  while(at<html.size()&&html[at]!='>'){
   while(at<html.size()&&(space(html[at])||html[at]=='/'))++at;if(at>=html.size()||html[at]=='>')break;
   start=at;while(at<html.size()&&!space(html[at])&&html[at]!='='&&html[at]!='>')++at;auto key=folded.substr(start,at-start);while(at<html.size()&&space(html[at]))++at;std::string value;
   if(at<html.size()&&html[at]=='='){++at;while(at<html.size()&&space(html[at]))++at;if(at<html.size()&&(html[at]=='\''||html[at]=='"')){auto quote=html[at++];start=at;while(at<html.size()&&html[at]!=quote)++at;value=folded.substr(start,at-start);if(at<html.size())++at;}else{start=at;while(at<html.size()&&!space(html[at])&&html[at]!='>')++at;value=folded.substr(start,at-start);}}
   if(key=="src")external=true;if(key=="nomodule")nomodule=true;if(key=="type"){module=value=="module";skip=!value.empty()&&!module&&value!="text/javascript"&&value!="application/javascript";}
  }
  if(at>=html.size())break;++at;if(closing)continue;
  if(tag=="plaintext")break;
  if(tag!="script"&&tag!="style"&&tag!="textarea"&&tag!="title"&&tag!="xmp"&&tag!="iframe"&&tag!="noembed"&&tag!="noframes")continue;
  const auto source=at;auto end=at;const auto close="</"+tag;for(;;){end=folded.find(close,end);if(end==std::string::npos){end=html.size();break;}const auto next=end+close.size();if(next==folded.size()||space(folded[next])||folded[next]=='>'||folded[next]=='/')break;end=next;}
  if(tag=="script"&&!external&&!skip&&(!nomodule||module))result.push_back({html.substr(source,end-source),module});at=folded.find('>',end+close.size());if(at==std::string::npos)break;++at;
 }
 return result;
}
}
