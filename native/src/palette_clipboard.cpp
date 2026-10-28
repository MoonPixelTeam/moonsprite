#include "palette_clipboard.h"
#include <windows.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <algorithm>
#include <cmath>
#include <sstream>
namespace moon {namespace {
struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};
}
std::optional<PaletteClipboardData> parsePaletteClipboard(const std::string& text){
 using namespace winrt::Windows::Data::Json;
 const bool v2=text.rfind("MOONSPRITE_PALETTE_V2:",0)==0;
 if(!v2 && text.rfind("MOONSPRITE_PALETTE_V1:",0)!=0)return {};
 try{Apartment apartment;if(FAILED(apartment.status)&&apartment.status!=RPC_E_CHANGED_MODE)return {};
  auto root=JsonValue::Parse(winrt::to_hstring(text.substr(22)));
  IJsonValue source=root;
  if(v2){if(root.ValueType()!=JsonValueType::Object)return {};auto object=root.GetObject();if(!object.HasKey(L"colors"))return {};source=object.GetNamedValue(L"colors");}
  if(source.ValueType()!=JsonValueType::Array)return {};const auto array=source.GetArray();if(!array.Size())return {};
  PaletteClipboardData out;out.colors.reserve(array.Size());
  for(const auto& value:array){if(value.ValueType()!=JsonValueType::Object)return {};auto color=value.GetObject();timeline::Pixel pixel=0;int shift=0;for(const auto* key:{L"r",L"g",L"b",L"a"}){if(!color.HasKey(key))return {};auto channel=color.GetNamedValue(key);if(channel.ValueType()!=JsonValueType::Number)return {};const double n=channel.GetNumber();if(!std::isfinite(n))return {};pixel|=timeline::Pixel(std::floor(std::clamp(n,0.,255.)+.5))<<shift;shift+=8;}out.colors.push_back(pixel);}
  if(!v2)return out;auto object=root.GetObject();if(!object.HasKey(L"layout"))return {};auto layoutValue=object.GetNamedValue(L"layout");if(layoutValue.ValueType()!=JsonValueType::Object)return {};auto layout=layoutValue.GetObject();if(!layout.HasKey(L"columns")||!layout.HasKey(L"slots"))return {};auto columns=layout.GetNamedValue(L"columns"),slots=layout.GetNamedValue(L"slots");if(columns.ValueType()!=JsonValueType::Number||slots.ValueType()!=JsonValueType::Array)return {};const double n=columns.GetNumber();if(!std::isfinite(n)||n<1||n>256||std::floor(n)!=n)return {};out.columns=int(n);auto cells=slots.GetArray();if(!cells.Size()||cells.Size()%out.columns)return {};out.slots.reserve(cells.Size());
  for(const auto& cell:cells){if(cell.ValueType()==JsonValueType::Null){out.slots.push_back({});continue;}if(cell.ValueType()!=JsonValueType::Number)return {};const double index=cell.GetNumber();if(!std::isfinite(index)||index<0||index>=out.colors.size()||std::floor(index)!=index)return {};out.slots.push_back(std::size_t(index));}return out;
 }catch(...){return {};}
}
std::string encodePaletteClipboard(const PaletteClipboardData& data){const bool layout=data.columns>0&&!data.slots.empty();std::ostringstream out;out<<(layout?"MOONSPRITE_PALETTE_V2:{\"colors\":[":"MOONSPRITE_PALETTE_V1:[");for(std::size_t i=0;i<data.colors.size();++i){if(i)out<<',';const auto c=data.colors[i];out<<"{\"r\":"<<(c&255)<<",\"g\":"<<((c>>8)&255)<<",\"b\":"<<((c>>16)&255)<<",\"a\":"<<(c>>24)<<'}';}out<<']';if(layout){out<<",\"layout\":{\"columns\":"<<data.columns<<",\"slots\":[";for(std::size_t i=0;i<data.slots.size();++i){if(i)out<<',';if(data.slots[i])out<<*data.slots[i];else out<<"null";}out<<"]}}";}return out.str();}

}
