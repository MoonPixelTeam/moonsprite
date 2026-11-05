#include "local_history_restore.h"
#include "document.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
namespace moon::local_history {
std::string documentFingerprint(const Fingerprint& source){
 using namespace winrt::Windows::Data::Json;
 const auto initialized=RoInitialize(RO_INIT_MULTITHREADED);
 if(FAILED(initialized)&&initialized!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize history fingerprint JSON");
 std::string result;try{{
  JsonArray fields;auto text=[](const auto& s){return JsonValue::CreateStringValue(winrt::to_hstring(s));};auto number=[](int v){return JsonValue::CreateNumberValue(v);};
  fields.Append(text(source.updatedAt));fields.Append(number(source.width));fields.Append(number(source.height));fields.Append(text(source.colorMode));
  JsonArray layers;for(const auto& layer:source.layers){JsonArray row;row.Append(text(layer.id));row.Append(number(layer.width));row.Append(number(layer.height));row.Append(number(layer.offsetX));row.Append(number(layer.offsetY));row.Append(text(layer.format));layers.Append(row);}fields.Append(layers);
  fields.Append(source.activeFrameId?text(*source.activeFrameId):JsonValue::CreateNullValue());result=winrt::to_string(fields.Stringify());
 }}catch(...){if(initialized==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(initialized))RoUninitialize();throw;}
 if(initialized==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(initialized))RoUninitialize();return result;
}
std::string documentFingerprint(const Document& document){
 Fingerprint fields;fields.updatedAt=document.projectInformation().updatedAt;fields.width=document.width();fields.height=document.height();fields.activeFrameId=document.frame().id;
 // Project serialization reverses native UI stacking into legacy document order.
 const auto& layers=document.timeline().state().layers;
 for(auto it=layers.rbegin();it!=layers.rend();++it){
  const auto& layer=*it;
  const auto* cel=document.timeline().findCel(layer.id,document.frame().id);
  if(!cel)throw std::runtime_error("Missing local-history fingerprint cel");
  const auto surface=document.timeline().resolveSurface(cel->id);
  if(!surface.surface)throw std::runtime_error("Missing local-history fingerprint surface");
  const auto& value=*surface.surface;fields.layers.push_back({layer.id,value.width,value.height,value.offsetX,value.offsetY,"rgba"});
 }return documentFingerprint(fields);
}
RestoreTicket::RestoreTicket(const Document& document):document_(&document),identity_(document.identity()),revision_(document.revision()),contentMutationRevision_(document.contentMutationRevision()),historyRevision_(document.historyRevision()){}
RestoreDecision RestoreTicket::decision(const Document& document,const std::optional<std::string>& savedFingerprint)const{
 if(savedFingerprint&&!savedFingerprint->empty()&&*savedFingerprint!=documentFingerprint(document))return RestoreDecision::SavedGenerationMismatch;
 if(&document!=document_||document.identity()!=identity_||document.revision()!=revision_||document.contentMutationRevision()!=contentMutationRevision_||document.historyRevision()!=historyRevision_||document.active())return RestoreDecision::LiveDocumentChanged;
 return RestoreDecision::Ready;
}
}
