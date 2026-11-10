#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winrt/Windows.Data.Json.h>
#include "lua_script_invocation.h"
#include "raster_geometry.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace moon::script {
bool SurfaceSnapshot::matches(const timeline::Surface& s)const{
 return width==s.width&&height==s.height&&x==s.offsetX&&y==s.offsetY&&pixels&&s.pixels==*pixels;
}
void Target::capturePreview(const Document& d){previewGuard=true;expectedFloating=d.floating();overlayRevision=d.floatingOverlayRevision();contentMutationRevision=d.contentMutationRevision();expectedSelection=d.selection();}
bool Target::matches(const Document& d,bool requireExpected,bool rasterOnly)const{
 if(identity!=d.identity()||documentId!=d.projectId()||layerId!=d.layer().id||frameId!=d.frame().id||!d.activeMaskId().empty()||(rasterOnly&&!d.layer().kind.empty())||d.layerEffectivelyLocked(d.layer()))return false;
 if(!requireExpected)return true;
 if(revision!=d.revision())return false;
 if(previewGuard&&(d.contentMutationRevision()!=contentMutationRevision||d.floating()!=expectedFloating||d.floatingOverlayRevision()!=overlayRevision||!selectionEqual(d.selection(),expectedSelection)))return false;
 const auto* s=d.activeSurfaceIfPresent();
 if(s)return expected.matches(*s);
 // Reading an absent Cel is transparent, without materializing it or history.
 const auto g=d.displayedLayerGeometry(layerId);
 return expected.pixels&&g==std::array<int,4>{expected.width,expected.height,expected.x,expected.y}&&std::all_of(expected.pixels->begin(),expected.pixels->end(),[](Pixel p){return p==0;});
}
InvocationCapture::InvocationCapture(const Document& d,std::string mse,std::optional<std::filesystem::path> path,bool allowFloating){
 if(!d.activeMaskId().empty())throw std::invalid_argument("Lua scripts cannot edit a layer mask");
 if(!d.layer().kind.empty())throw std::invalid_argument("Lua scripts require a raster layer");
 if(d.layerEffectivelyLocked(d.layer()))throw std::invalid_argument("Lua script layer is locked");
 if(d.active(false)||(d.floating()&&!allowFloating))throw std::logic_error("Finish the active edit before running a Lua script");
 auto budget=[](int w,int h,std::size_t remaining){if(w<1||h<1||std::uint64_t(w)*h>remaining)throw std::length_error("Lua image pixel budget exceeded");};
 const auto g=d.displayedLayerGeometry(d.layer().id);budget(g[0],g[1],maxImagePixels);
 const auto& state=d.timeline().state();std::size_t total=0;
 // Complete the per-frame plan before allocating or reading the first pixel.
 for(const auto& f:state.frames)if(const auto* c=d.timeline().findCel(d.layer().id,f.id)){
  const auto r=d.timeline().resolveSurface(c->id);if(r.issue!=timeline::LinkIssue::None||!r.surface||!r.source)throw std::invalid_argument("Invalid Lua Cel owner");
  budget(r.surface->width,r.surface->height,maxCelPixels-total);raster::validate(*r.surface);total+=std::size_t(r.surface->width)*r.surface->height;
 }
 auto& out=invocation_;out.target={d.identity(),d.revision(),d.projectId(),d.layer().id,d.frame().id,{}};
 out.target.capturePreview(d);
 out.documentName=d.name();out.layerName=d.layer().name;out.filePath=path.value_or(d.sourceFilePath());out.width=d.width();out.height=d.height();
 out.opacity=int(std::clamp(std::floor(d.layer().opacity*255+.5),0.,255.));out.visible=d.layer().visible;out.locked=d.layer().locked;out.groupId=d.layer().groupId;
 out.stackIndex=state.layers.size()-std::size_t(std::find_if(state.layers.begin(),state.layers.end(),[&](const auto& l){return l.id==d.layer().id;})-state.layers.begin());
 out.foreground=d.palette().primary;out.background=d.palette().secondary;out.selection=d.selection();out.mseSnapshotJson=std::move(mse);
 for(std::size_t i=0;i<state.frames.size();++i){const auto& f=state.frames[i];if(f.id==d.frame().id)out.frameNumber=i+1;
  const auto* c=d.timeline().findCel(d.layer().id,f.id);if(!c)continue;const auto r=d.timeline().resolveSurface(c->id);const auto& s=*r.surface;
  auto pixels=std::make_shared<std::vector<Pixel>>();SurfaceSnapshot snapshot{s.width,s.height,s.offsetX,s.offsetY,pixels};
  sources_.push_back({r.source->id,s.width,s.height,s.offsetX,s.offsetY,s.pixels.identity(),s.pixels.revision(),pixels});out.cels.push_back({c->id,f.id,i+1,snapshot});
  if(f.id==d.frame().id){out.target.expected=snapshot;out.target.expectedStorage=s.pixels.identity();out.target.expectedStorageRevision=s.pixels.revision();}
 }
 if(!out.target.expected.pixels){auto pixels=std::make_shared<std::vector<Pixel>>();out.target.expected={g[0],g[1],g[2],g[3],pixels};sources_.push_back({{},g[0],g[1],g[2],g[3],nullptr,0,pixels});}
}
bool InvocationCapture::unchanged(const Document& d)const{
 if(d.contentMutationRevision()!=invocation_.target.contentMutationRevision||d.active(false)||!invocation_.target.matches(d,false)||d.revision()!=invocation_.target.revision||d.floating()!=invocation_.target.expectedFloating||d.floatingOverlayRevision()!=invocation_.target.overlayRevision||!selectionEqual(d.selection(),invocation_.target.expectedSelection))return false;
 for(const auto& p:sources_){if(p.owner.empty()){if(d.activeSurfaceIfPresent()||d.displayedLayerGeometry(d.layer().id)!=std::array<int,4>{p.width,p.height,p.x,p.y})return false;continue;}
  const auto r=d.timeline().resolveSurface(p.owner);const auto* s=r.surface;if(r.issue!=timeline::LinkIssue::None||!s||s->width!=p.width||s->height!=p.height||s->offsetX!=p.x||s->offsetY!=p.y||s->pixels.size()!=std::uint64_t(p.width)*p.height||s->pixels.identity()!=p.storage||s->pixels.revision()!=p.revision)return false;
 }
 return true;
}
bool InvocationCapture::advance(const Document& d,std::chrono::steady_clock::time_point deadline,std::size_t maxPixels){
 if(taken_)throw std::logic_error("Lua invocation already consumed");
 if(!unchanged(d))throw std::logic_error("Document changed during Lua capture");
 std::size_t copied=0;
 while(source_<sources_.size()){
  if(copied>=maxPixels||std::chrono::steady_clock::now()>=deadline)return false;
  auto& p=sources_[source_];const auto size=std::size_t(p.width)*p.height;
  if(!offset_)p.pixels->reserve(size);
  const auto n=std::min({RasterSnapshot::chunkPixels,size-offset_,maxPixels-copied});
  if(p.owner.empty())p.pixels->insert(p.pixels->end(),n,0);
  else{const auto& pixels=d.timeline().resolveSurface(p.owner).surface->pixels;p.pixels->insert(p.pixels->end(),pixels.begin()+offset_,pixels.begin()+offset_+n);}
  copied+=n;copied_+=n;offset_+=n;if(offset_==size){offset_=0;++source_;}
 }
 return true;
}
Invocation InvocationCapture::take(){if(taken_||source_!=sources_.size())throw std::logic_error("Lua invocation capture is incomplete or consumed");taken_=true;return std::move(invocation_);}
namespace {
std::string utf8(const std::u32string& text){std::wstring wide;for(auto c:text){if(c>0x10ffff||(c>=0xd800&&c<=0xdfff))c=0xfffd;if(c<=0xffff)wide.push_back(wchar_t(c));else{c-=0x10000;wide.push_back(wchar_t(0xd800+(c>>10)));wide.push_back(wchar_t(0xdc00+(c&1023)));}}return winrt::to_string(wide);}
std::string quote(const std::string& s){return winrt::to_string(winrt::Windows::Data::Json::JsonValue::CreateStringValue(winrt::to_hstring(s)).Stringify());}
template<class Values>void array(std::string& out,const Values& pixels){out+='[';bool comma=false;for(auto p:pixels){if(comma)out+=',';comma=true;out+=std::to_string(p);}out+=']';}
void surface(std::string& out,const SurfaceSnapshot& s){out+="{\"format\":\"rgba\",\"width\":"+std::to_string(s.width)+",\"height\":"+std::to_string(s.height)+",\"offsetX\":"+std::to_string(s.x)+",\"offsetY\":"+std::to_string(s.y)+",\"pixels\":";array(out,*s.pixels);out+='}';}
}
std::string Invocation::contextJson()const{
 // Validate the caller's real workspace JSON before crossing into LuaSession.
 winrt::Windows::Data::Json::JsonValue::Parse(winrt::to_hstring(mseSnapshotJson));
 std::string out="{";auto field=[&](const char* key,const std::string& value){if(out.size()>1)out+=',';out+='"';out+=key;out+="\":";out+=value;};
 auto text=[&](const char* key,const std::string& value){field(key,quote(value));};auto number=[&](const char* key,auto value){field(key,std::to_string(value));};
 text("documentId",target.documentId);text("documentName",utf8(documentName));number("documentWidth",width);number("documentHeight",height);text("documentFilePath",winrt::to_string(filePath.wstring()));text("colorMode","rgba");
 text("layerId",target.layerId);text("layerName",utf8(layerName));number("layerWidth",target.expected.width);number("layerHeight",target.expected.height);number("layerOffsetX",target.expected.x);number("layerOffsetY",target.expected.y);number("layerOpacity",opacity);
 field("layerVisible",visible?"true":"false");field("layerLocked",locked?"true":"false");text("layerFormat","rgba");field("layerGroupId",groupId?quote(*groupId):"null");number("layerStackIndex",stackIndex);number("frameNumber",frameNumber);
 field("pixels","");array(out,*target.expected.pixels);field("activeLayerCels","");out+='[';bool comma=false;for(const auto& c:cels){if(comma)out+=',';comma=true;out+="{\"id\":"+quote(c.id)+",\"frameId\":"+quote(c.frameId)+",\"frameNumber\":"+std::to_string(c.frameNumber)+",\"surface\":";surface(out,c.surface);out+='}';}out+=']';
 field("selection","");if(selection){const auto& s=*selection;out+="{\"x\":"+std::to_string(s.x)+",\"y\":"+std::to_string(s.y)+",\"width\":"+std::to_string(s.width)+",\"height\":"+std::to_string(s.height)+",\"mask\":";if(s.mask.empty())out+="null";else array(out,s.mask);out+='}';}else out+="null";
 number("transparentColor",0);number("foreground",foreground);number("background",background);field("mseSnapshot",mseSnapshotJson);out+='}';return out;
}
}
