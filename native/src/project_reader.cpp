#include "project_reader.h"
#include "zlib.h"
#include <algorithm>
#include <limits>
#include <set>
namespace moon::project {
namespace {
[[noreturn]] void corrupt(const std::string& message) {throw Error(ErrorKind::Corrupt,message);}
void span(const Bytes& b,std::size_t at,std::size_t n) {if(at>b.size() || n>b.size()-at) corrupt("Truncated project archive");}
std::uint16_t u16(const Bytes& b,std::size_t at) {span(b,at,2);return b[at]|std::uint16_t(b[at+1])<<8;}
std::uint32_t u32(const Bytes& b,std::size_t at) {span(b,at,4);return b[at]|std::uint32_t(b[at+1])<<8|std::uint32_t(b[at+2])<<16|std::uint32_t(b[at+3])<<24;}
std::string text(const Bytes& b,std::size_t at,std::size_t n) {span(b,at,n);return std::string(b.begin()+at,b.begin()+at+n);}
}
Archive::Archive(std::shared_ptr<const Bytes> bytes,Limits limits):bytes_(std::move(bytes)),limits_(limits) {
  if(!bytes_) corrupt("Missing project archive");
  const auto& b=*bytes_;
  if(b.size()>limits.archiveBytes) throw Error(ErrorKind::Limit,"Project archive exceeds input budget");
  if(b.size()<22) corrupt("Missing ZIP directory");
  const auto minimum=b.size()>65557?b.size()-65557:0;
  std::size_t end=b.size()-22;
  for(;;) {
    if(u32(b,end)==0x06054b50 && u16(b,end+20)==b.size()-end-22) break;
    if(end==minimum) corrupt("Missing ZIP directory");
    --end;
  }
  const auto count=u16(b,end+10);
  if(u16(b,end+4)!=0 || u16(b,end+6)!=0 || u16(b,end+8)!=count) throw Error(ErrorKind::Unsupported,"Split ZIP archives are unsupported");
  centralOffset_=u32(b,end+16);const auto centralSize=u32(b,end+12);
  if(count==0xffff || centralOffset_==0xffffffff || centralSize==0xffffffff) throw Error(ErrorKind::Unsupported,"ZIP64 project archives are unsupported");
  if(count>limits.maxEntries) throw Error(ErrorKind::Limit,"Too many project archive entries");
  if(centralOffset_>end || centralSize!=end-centralOffset_) corrupt("Invalid ZIP directory bounds");
  std::size_t at=centralOffset_,expanded=0;
  for(unsigned i=0;i<count;++i) {
    span(b,at,46);if(u32(b,at)!=0x02014b50) corrupt("Invalid ZIP directory entry");
    ZipEntry e;e.flags=u16(b,at+8);e.method=u16(b,at+10);e.crc=u32(b,at+16);e.compressed=u32(b,at+20);e.size=u32(b,at+24);e.offset=u32(b,at+42);
    const auto nameLen=u16(b,at+28),extra=u16(b,at+30),comment=u16(b,at+32);
    if(u16(b,at+34)!=0 || e.size==0xffffffff || e.compressed==0xffffffff || e.offset==0xffffffff) throw Error(ErrorKind::Unsupported,"ZIP64 or split entries are unsupported");
    if(e.flags&1) throw Error(ErrorKind::Unsupported,"Encrypted project archives are unsupported");
    if(e.method!=0 && e.method!=8) throw Error(ErrorKind::Unsupported,"Unsupported ZIP compression method");
    const auto name=text(b,at+46,nameLen);
    if(name.empty() || name.find('\0')!=std::string::npos || !entries_.emplace(name,e).second) corrupt("Duplicate or empty ZIP filename");
    if(e.size>limits.expandedBytes-expanded) throw Error(ErrorKind::Limit,"Project archive exceeds expanded budget");
    expanded+=e.size;
    at+=46u+nameLen+extra+comment;
    if(at>end) corrupt("Invalid ZIP directory entry length");
  }
  if(at!=end) corrupt("ZIP directory size mismatch");
}
Bytes Archive::read(const std::string& name,std::size_t limit) const {
  auto it=entries_.find(name);if(it==entries_.end()) corrupt("Missing project resource: "+name);
  const auto& e=it->second;const auto& b=*bytes_;
  if(e.size>limit) throw Error(ErrorKind::Limit,"Resource exceeds read budget: "+name);
  const std::size_t at=e.offset;span(b,at,30);
  if(u32(b,at)!=0x04034b50 || u16(b,at+6)!=e.flags || u16(b,at+8)!=e.method) corrupt("ZIP local header mismatch: "+name);
  const auto n=u16(b,at+26),extra=u16(b,at+28);
  if(text(b,at+30,n)!=name) corrupt("ZIP filename mismatch: "+name);
  const std::size_t start=at+30u+n+extra;
  if(start>centralOffset_ || e.compressed>centralOffset_-start) corrupt("ZIP resource overlaps directory: "+name);
  if(!(e.flags&8) && (u32(b,at+14)!=e.crc || u32(b,at+18)!=e.compressed || u32(b,at+22)!=e.size)) corrupt("ZIP size/CRC header mismatch: "+name);
  Bytes out(e.size);
  if(e.method==0) {
    if(e.compressed!=e.size) corrupt("Stored ZIP resource length mismatch");
    std::copy_n(b.begin()+start,e.size,out.begin());
  } else {
    z_stream stream{};unsigned char empty=0;
    stream.next_in=const_cast<Bytef*>(b.data()+start);stream.avail_in=e.compressed;
    stream.next_out=out.empty()?&empty:out.data();stream.avail_out=out.empty()?1:e.size;
    if(inflateInit2(&stream,-MAX_WBITS)!=Z_OK) throw Error(ErrorKind::Limit,"Cannot initialize ZIP inflater");
    const int result=inflate(&stream,Z_FINISH);
    const bool valid=result==Z_STREAM_END && stream.total_out==e.size && stream.total_in==e.compressed;
    inflateEnd(&stream);
    if(!valid) corrupt("Invalid deflated resource: "+name);
  }
  if(crc32(0,out.empty()?Z_NULL:out.data(),static_cast<uInt>(out.size()))!=e.crc) corrupt("ZIP CRC mismatch: "+name);
  return out;
}
std::vector<std::uint32_t> decodeRgba(const Bytes& b,const std::string& encoding,std::uint32_t w,std::uint32_t h,std::size_t maxBytes) {
  if(!w || !h) corrupt("Invalid raster dimensions");
  const std::uint64_t pixels=std::uint64_t(w)*h;
  if(pixels>maxBytes/4 || pixels>std::numeric_limits<std::size_t>::max()/4) throw Error(ErrorKind::Limit,"Raster exceeds memory budget");
  const auto size=pixels*4;
  if(encoding!="raw" && encoding!="sparse-tiles-v1") throw Error(ErrorKind::Unsupported,"Unsupported raster encoding: "+encoding);
  if(encoding=="raw") {
    if(b.size()!=size) corrupt("RGBA byte length mismatch");
    std::vector<std::uint32_t> out(static_cast<std::size_t>(size/4));
    for(std::size_t i=0;i<out.size();++i) out[i]=u32(b,i*4);
    return out;
  }
  span(b,0,24);
  if(u32(b,0)!=0x3154534d || u16(b,4)!=64 || b[6]!=1 || u32(b,8)!=w || u32(b,12)!=h) corrupt("Invalid sparse RGBA header");
  const auto count=u32(b,16);const std::uint64_t end=24ull+16ull*count;
  if(end>b.size() || u32(b,20)!=b.size()-end || count>std::uint64_t((w+63ull)/64)*((h+63ull)/64)) corrupt("Invalid sparse RGBA table");
  std::set<std::pair<std::uint32_t,std::uint32_t>> slots;
  std::size_t expected=static_cast<std::size_t>(end);
  // Validate the complete payload before allocating the dense surface.
  for(std::uint32_t i=0;i<count;++i) {
    const auto at=24u+std::size_t(i)*16;const auto x=u32(b,at),y=u32(b,at+4);const auto tw=u16(b,at+8),th=u16(b,at+10);
    if(x>=w || y>=h || x%64 || y%64 || tw!=std::min(64u,w-x) || th!=std::min(64u,h-y) || u32(b,at+12)!=expected || !slots.emplace(x,y).second) corrupt("Invalid sparse RGBA tile");
    const std::size_t bytes=std::size_t(tw)*th*4;span(b,expected,bytes);expected+=bytes;
  }
  if(expected!=b.size()) corrupt("Trailing sparse RGBA data");
  std::vector<std::uint32_t> out(static_cast<std::size_t>(size/4));
  for(std::uint32_t i=0;i<count;++i) {
    const auto at=24u+std::size_t(i)*16;const auto x=u32(b,at),y=u32(b,at+4);const auto tw=u16(b,at+8),th=u16(b,at+10);auto offset=std::size_t(u32(b,at+12));
    for(unsigned row=0;row<th;++row) for(unsigned col=0;col<tw;++col,offset+=4) out[std::size_t(y+row)*w+x+col]=u32(b,offset);
  }
  return out;
}
}
