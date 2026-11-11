#pragma once
#include <filesystem>
#include <string>
#include <vector>
#include <utility>
#include <winrt/Windows.Data.Json.h>
namespace moon::extension {
// setEncoded consumes the exact JSON.stringify result from the runtime bridge;
// it does not reserialize numbers or reorder object properties for quotas.
class Storage {
 std::filesystem::path path_;
 std::vector<std::pair<std::u16string,std::string>> values_;
 void publish(std::vector<std::pair<std::u16string,std::string>>);
 static std::u16string prefix(const std::u16string&);
 static void validateKey(const std::u16string&);
public:
 explicit Storage(std::filesystem::path);
 const std::filesystem::path& path()const{return path_;}
 winrt::Windows::Data::Json::IJsonValue get(const std::u16string& extension,const std::u16string& key)const;
 void setEncoded(const std::u16string& extension,const std::u16string& key,const std::string& json);
 void remove(const std::u16string& extension,const std::u16string& key);
 std::vector<std::u16string> list(const std::u16string& extension)const;
};
}
