#pragma once
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <fstream>
namespace moon {
// legacy document-files.ts::hasGifSignature: chat caches can use a static
// image suffix. Recognize the data before dispatching a static decoder.
inline bool hasGifSignature(const std::uint8_t* data,std::size_t size){
 return size>=6&&data[0]=='G'&&data[1]=='I'&&data[2]=='F'&&data[3]=='8'&&(data[4]=='7'||data[4]=='9')&&data[5]=='a';
}
inline bool hasGifFileSignature(const std::filesystem::path& path){
 std::ifstream file(path,std::ios::binary);std::uint8_t prefix[6]{};
 file.read(reinterpret_cast<char*>(prefix),sizeof(prefix));
 return hasGifSignature(prefix,std::size_t(file.gcount()));
}
}
