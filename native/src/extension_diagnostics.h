#pragma once
#include "runtime_diagnostics.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <charconv>
#include <functional>
#include <string>
#include <cstdlib>
#include <vector>
#include <stdexcept>
namespace moon::extension {
// String(value) for structured-clone JSON values; iterative Array#join avoids
// recursive C++ stack growth on nested arrays. Missing value means undefined.
inline std::wstring diagnosticString(winrt::Windows::Data::Json::IJsonValue value){
 using namespace winrt::Windows::Data::Json;
 struct Item{IJsonValue value;bool separator=false,arrayElement=false;};std::vector<Item> pending{{value}};std::wstring result;
 while(!pending.empty()){auto item=pending.back();pending.pop_back();if(item.separator){result+=L',';continue;}auto current=item.value;
  if(!current){if(!item.arrayElement)result+=L"undefined";continue;}
  switch(current.ValueType()){
   case JsonValueType::Null:if(!item.arrayElement)result+=L"null";break;
   case JsonValueType::String:result+=current.GetString();break;
   case JsonValueType::Boolean:result+=current.GetBoolean()?L"true":L"false";break;
   case JsonValueType::Number:{const double n=current.GetNumber();if(n==0){result+=L'0';break;}char buffer[128];auto converted=std::to_chars(buffer,buffer+sizeof(buffer),n);std::string text(buffer,converted.ptr);
    auto exponent=text.find('e');if(exponent!=std::string::npos){int power=std::stoi(text.substr(exponent+1));auto mantissa=text.substr(0,exponent);const bool negative=mantissa[0]=='-';if(negative)mantissa.erase(0,1);auto dot=mantissa.find('.');int decimal=dot==std::string::npos?int(mantissa.size()):int(dot);if(dot!=std::string::npos)mantissa.erase(dot,1);decimal+=power;
     if(power>=-6&&power<21){if(decimal<=0)text="0."+std::string(-decimal,'0')+mantissa;else if(decimal>=int(mantissa.size()))text=mantissa+std::string(decimal-mantissa.size(),'0');else{text=mantissa;text.insert(decimal,".");}if(negative)text="-"+text;}
     else{text=text.substr(0,exponent)+"e"+(power>=0?"+":"-")+std::to_string(std::abs(power));}
    }result.append(text.begin(),text.end());break;}
   case JsonValueType::Object:{auto object=current.GetObject();if(object.HasKey(L"toString"))throw std::invalid_argument("Cannot convert object to primitive value");result+=L"[object Object]";break;}
   case JsonValueType::Array:{auto array=current.GetArray();for(auto i=array.Size();i>0;--i){pending.push_back({array.GetAt(i-1),false,true});if(i>1)pending.push_back({nullptr,true});}break;}
  }
 }return result;
}
struct DiagnosticServices {
 std::function<void(const std::string&,const winrt::hstring&)> record;
 std::function<void(const winrt::hstring&)> status;
 std::function<void(const std::string&,const winrt::hstring&)> console;
};
// Bind a fixed extension identity; request parameters cannot spoof the log owner.
inline DiagnosticServices recorderDiagnosticServices(std::shared_ptr<moon::diagnostics::Recorder> recorder,std::string extensionId,std::function<void(const winrt::hstring&)> status,std::function<void(const std::string&,const winrt::hstring&)> console){
 if(!recorder)throw std::invalid_argument("Extension diagnostic recorder is missing");
 return {[recorder=std::move(recorder),extensionId=std::move(extensionId)](const auto& kind,const auto& message){recorder->record(kind,"extension.runtime",{{"extensionId",extensionId},{"message",winrt::to_string(message)}});},std::move(status),std::move(console)};
}

}
