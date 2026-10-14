#pragma once
#include <cstdint>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
namespace moon::project {
using Bytes=std::vector<std::uint8_t>;
enum class ErrorKind { Corrupt, Unsupported, Limit };
struct Error:std::runtime_error { ErrorKind kind; Error(ErrorKind k,const std::string& message):std::runtime_error(message),kind(k) {} };
struct Limits { std::size_t archiveBytes=256u*1024*1024,expandedBytes=256u*1024*1024,manifestBytes=8u*1024*1024,maxEntries=100000; };
struct ZipEntry { std::uint16_t flags=0,method=0;std::uint32_t crc=0,size=0,compressed=0,offset=0; };
// Reads memory only: never extracts filenames onto the filesystem.
class Archive {
  std::shared_ptr<const Bytes> bytes_;
  std::map<std::string,ZipEntry> entries_;
  Limits limits_;
  std::size_t centralOffset_=0;
public:
  explicit Archive(std::shared_ptr<const Bytes> bytes,Limits limits={});
  const std::map<std::string,ZipEntry>& entries() const {return entries_;}
  Bytes read(const std::string& name,std::size_t limit) const;
};
// The dense destination preserves exact RGBA bytes, including transparent RGB.
std::vector<std::uint32_t> decodeRgba(const Bytes& data,const std::string& encoding,std::uint32_t width,std::uint32_t height,std::size_t maxBytes);
}
