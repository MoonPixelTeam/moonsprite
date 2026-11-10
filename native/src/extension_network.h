#pragma once
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Web.Http.h>
#include <winrt/Windows.Web.Http.Filters.h>
#include <winrt/Windows.Storage.Streams.h>
#include <atomic>
#include <vector>
#include <cwctype>
#include <stdexcept>
#include <memory>
#include <chrono>
#include <future>
#include <thread>

namespace moon::extension {
// Worker owns every WinRT object. Only UTF-16 JSON crosses the event-thread boundary.
// A packaged-task future never joins on destruction, so disabling cannot freeze UI.
struct NetworkTask {
 std::shared_ptr<std::atomic<bool>> cancelled;
 std::future<std::wstring> response;
 void cancel(){*cancelled=true;}
};
inline NetworkTask startNetworkRequest(std::wstring requestId,std::wstring encodedParams){
 auto cancelled=std::make_shared<std::atomic<bool>>(false);
 std::packaged_task<std::wstring()> work([cancelled,requestId=std::move(requestId),encodedParams=std::move(encodedParams)]{
  winrt::init_apartment(winrt::apartment_type::multi_threaded);
  struct Apartment{~Apartment(){winrt::uninit_apartment();}} apartment;
  using namespace winrt::Windows::Data::Json;
  JsonObject envelope;envelope.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-response"));envelope.Insert(L"requestId",JsonValue::CreateStringValue(requestId));
  try{
   const auto params=JsonObject::Parse(encodedParams);
   if(!params.HasKey(L"url")||params.GetNamedValue(L"url").ValueType()!=JsonValueType::String)throw std::invalid_argument("参数 url 必须是字符串。");
   const winrt::Windows::Foundation::Uri uri(params.GetNamedString(L"url"));
   if(uri.SchemeName()!=L"http"&&uri.SchemeName()!=L"https")throw std::invalid_argument("扩展网络请求仅支持 HTTP(S)。");
   using namespace winrt::Windows::Web::Http;using namespace winrt::Windows::Web::Http::Filters;
   HttpBaseProtocolFilter filter;filter.CookieUsageBehavior(HttpCookieUsageBehavior::NoCookies);filter.AllowUI(false);
   HttpClient client(filter);
   const auto method=params.HasKey(L"method")&&params.GetNamedValue(L"method").ValueType()==JsonValueType::String?params.GetNamedString(L"method"):winrt::hstring(L"GET");
   HttpRequestMessage request(HttpMethod(method),uri);
   if(params.HasKey(L"body")&&params.GetNamedValue(L"body").ValueType()==JsonValueType::String){
    if(method==L"GET"||method==L"HEAD")throw std::invalid_argument("GET/HEAD 请求不能包含 body。");
    request.Content(HttpStringContent(params.GetNamedString(L"body"),winrt::Windows::Storage::Streams::UnicodeEncoding::Utf8,L"text/plain"));
   }
   const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(15);
   auto wait=[&](const auto& operation){
    while(operation.Status()==winrt::Windows::Foundation::AsyncStatus::Started){
     if(*cancelled||std::chrono::steady_clock::now()>=deadline){operation.Cancel();throw std::runtime_error(*cancelled?"扩展网络请求已取消。":"扩展网络请求超时。");}
     std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
    if(*cancelled)throw std::runtime_error("扩展网络请求已取消。");
    return operation.GetResults();
   };
   const auto response=wait(client.SendRequestAsync(request,HttpCompletionOption::ResponseHeadersRead));
   const auto stream=wait(response.Content().ReadAsInputStreamAsync());
   constexpr std::size_t limit=2*1024*1024;std::vector<std::uint8_t> bytes;
   // Stream to enforce the response limit before allocating an unbounded body.
   for(;;){using namespace winrt::Windows::Storage::Streams;
    const auto chunk=wait(stream.ReadAsync(Buffer(65536),65536,InputStreamOptions::Partial));
    if(!chunk.Length())break;if(chunk.Length()>limit-bytes.size())throw std::length_error("扩展网络响应超过 2 MiB 限制。");
    const auto reader=DataReader::FromBuffer(chunk);const auto offset=bytes.size();bytes.resize(offset+chunk.Length());reader.ReadBytes(winrt::array_view<std::uint8_t>(bytes.data()+offset,bytes.data()+bytes.size()));
   }
   JsonObject result,headers;const auto status=unsigned(response.StatusCode());result.Insert(L"status",JsonValue::CreateNumberValue(status));result.Insert(L"ok",JsonValue::CreateBooleanValue(status>=200&&status<300));
   auto appendHeaders=[&](const auto& collection){for(const auto& pair:collection){std::wstring key(pair.Key());for(auto& ch:key)ch=std::towlower(ch);if(key!=L"set-cookie"&&key!=L"set-cookie2")headers.Insert(key,JsonValue::CreateStringValue(pair.Value()));}};
   appendHeaders(response.Headers());appendHeaders(response.Content().Headers());result.Insert(L"headers",headers);
   JsonArray data;for(const auto byte:bytes)data.Append(JsonValue::CreateNumberValue(byte));result.Insert(L"bytes",data);
   envelope.Insert(L"ok",JsonValue::CreateBooleanValue(true));envelope.Insert(L"result",result);
  }catch(const winrt::hresult_error& e){envelope.Insert(L"ok",JsonValue::CreateBooleanValue(false));envelope.Insert(L"error",JsonValue::CreateStringValue(e.message()));}
  catch(const std::exception& e){envelope.Insert(L"ok",JsonValue::CreateBooleanValue(false));envelope.Insert(L"error",JsonValue::CreateStringValue(winrt::to_hstring(e.what())));}
  return std::wstring(envelope.Stringify());
 });
 auto future=work.get_future();std::thread(std::move(work)).detach();return {std::move(cancelled),std::move(future)};
}
}
