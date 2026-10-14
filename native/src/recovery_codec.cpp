#include "recovery_codec.h"
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Data.Json.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <windows.h>
#include <limits>
namespace moon::project {
namespace {using namespace winrt::Windows::Data::Json;
struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);Apartment(){if(FAILED(status)&&status!=RPC_E_CHANGED_MODE)throw std::runtime_error("Cannot initialize recovery JSON; HRESULT="+std::to_string(status));}~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};
[[noreturn]] void bad(const char* message){throw Error(ErrorKind::Corrupt,message);}
std::string required(const JsonObject& o,const wchar_t* key) {if(!o.HasKey(key))bad("Recovery metadata field missing");auto v=o.GetNamedValue(key);if(v.ValueType()!=JsonValueType::String)bad("Recovery metadata field is not a string");auto value=winrt::to_string(v.GetString());return value;}
}
bool isSafeRecoveryId(const std::string& id) {
 if(id.empty())return false;
 for(unsigned char c:id)if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='-'||c=='_'))return false;return true;
}
std::string encodeRecoveryRecord(const RecoveryRecord& record) {
 if(!isSafeRecoveryId(record.id))throw Error(ErrorKind::Corrupt,"Invalid recovery ID");if(record.name.size()>4096)throw Error(ErrorKind::Limit,"Invalid recovery name");if(record.updatedAt.empty()||record.updatedAt.size()>128)throw Error(ErrorKind::Corrupt,"Invalid recovery timestamp");
 Apartment apartment;try {JsonObject o;o.Insert(L"id",JsonValue::CreateStringValue(winrt::to_hstring(record.id)));o.Insert(L"name",JsonValue::CreateStringValue(winrt::to_hstring(record.name)));o.Insert(L"updatedAt",JsonValue::CreateStringValue(winrt::to_hstring(record.updatedAt)));auto utf8=winrt::to_string(o.Stringify());if(utf8.size()>1024*1024)throw Error(ErrorKind::Limit,"Recovery metadata exceeds budget");return utf8;}catch(const winrt::hresult_error& e){throw Error(e.code().value==E_OUTOFMEMORY?ErrorKind::Limit:ErrorKind::Corrupt,"Recovery metadata JSON failed; HRESULT="+std::to_string(e.code().value));}
}
RecoveryRecord decodeRecoveryRecord(const std::string& utf8,std::size_t maxBytes) {
 if(utf8.empty()||utf8.size()>maxBytes||utf8.size()>std::size_t(std::numeric_limits<int>::max()))throw Error(utf8.empty()?ErrorKind::Corrupt:ErrorKind::Limit,"Invalid recovery metadata size");int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,utf8.data(),int(utf8.size()),nullptr,0);if(!n)bad("Invalid recovery metadata UTF-8");std::wstring wide(n,L'\0');MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,utf8.data(),int(utf8.size()),wide.data(),n);Apartment apartment;try {auto o=JsonObject::Parse(winrt::hstring(wide));RecoveryRecord result{required(o,L"id"),required(o,L"name"),required(o,L"updatedAt")};for(const auto& f:o)if(f.Key()!=L"id"&&f.Key()!=L"name"&&f.Key()!=L"updatedAt")throw Error(ErrorKind::Unsupported,"Unknown recovery metadata field");if(!isSafeRecoveryId(result.id))throw Error(ErrorKind::Corrupt,"Invalid recovery ID");if(result.name.size()>4096||result.updatedAt.size()>128)throw Error(ErrorKind::Limit,"Recovery metadata field exceeds budget");return result;}catch(const winrt::hresult_error& e){throw Error(ErrorKind::Corrupt,"Recovery metadata JSON failed; HRESULT="+std::to_string(e.code().value));}
}
}
