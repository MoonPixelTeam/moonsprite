#include "layer_quick_actions.h"
#include "image_export.h"
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <fstream>
#include <sstream>
namespace moon::layerquick {
namespace {struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize preferences JSON parser");}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};}
Actions parse(const std::string& json){
 Apartment apartment;Actions pending;using namespace winrt::Windows::Data::Json;
 try {JsonArray array;if(!JsonArray::TryParse(winrt::to_hstring(json),array))return normalize({});for(const auto& value:array){if(value.ValueType()!=JsonValueType::Object)continue;auto o=value.GetObject();if(!o.HasKey(L"id")||o.GetNamedValue(L"id").ValueType()!=JsonValueType::String)continue;const auto id=winrt::to_string(o.GetNamedString(L"id"));bool enabled=o.HasKey(L"enabled")&&o.GetNamedValue(L"enabled").ValueType()==JsonValueType::Boolean&&o.GetNamedBoolean(L"enabled");pending.push_back({id,enabled});}}catch(const winrt::hresult_error&){return normalize({});}return normalize(pending);
}
std::string serialize(const Actions& actions){std::string out="[";for(const auto& a:normalize(actions)){if(out.size()>1)out+=',';out+="{\"id\":\""+a.id+"\",\"enabled\":"+(a.enabled?"true":"false")+"}";}return out+"]";}
Actions load(const std::filesystem::path& path){std::error_code ec;if(!std::filesystem::exists(path,ec)){if(ec)throw std::runtime_error("Cannot inspect layer quick actions");return normalize({});}std::ifstream in(path,std::ios::binary);if(!in)throw std::runtime_error("Cannot read layer quick actions");std::ostringstream bytes;bytes<<in.rdbuf();if(in.bad())throw std::runtime_error("Cannot finish reading layer quick actions");return parse(bytes.str());}
void save(const std::filesystem::path& path,const Actions& actions){const auto bytes=serialize(actions);if(!path.parent_path().empty())std::filesystem::create_directories(path.parent_path());writeExportBytesAtomic(path,{bytes.begin(),bytes.end()});}
}
