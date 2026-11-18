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
// zip 4.6.1 read.rs decodes unflagged names with FromCp437.
std::string cp437Name(const std::string& raw) {
  static constexpr unsigned mapping[128]={0x00c7,0x00fc,0x00e9,0x00e2,0x00e4,0x00e0,0x00e5,0x00e7,0x00ea,0x00eb,0x00e8,0x00ef,0x00ee,0x00ec,0x00c4,0x00c5,0x00c9,0x00e6,0x00c6,0x00f4,0x00f6,0x00f2,0x00fb,0x00f9,0x00ff,0x00d6,0x00dc,0x00a2,0x00a3,0x00a5,0x20a7,0x0192,0x00e1,0x00ed,0x00f3,0x00fa,0x00f1,0x00d1,0x00aa,0x00ba,0x00bf,0x2310,0x00ac,0x00bd,0x00bc,0x00a1,0x00ab,0x00bb,0x2591,0x2592,0x2593,0x2502,0x2524,0x2561,0x2562,0x2556,0x2555,0x2563,0x2551,0x2557,0x255d,0x255c,0x255b,0x2510,0x2514,0x2534,0x252c,0x251c,0x2500,0x253c,0x255e,0x255f,0x255a,0x2554,0x2569,0x2566,0x2560,0x2550,0x256c,0x2567,0x2568,0x2564,0x2565,0x2559,0x2558,0x2552,0x2553,0x256b,0x256a,0x2518,0x250c,0x2588,0x2584,0x258c,0x2590,0x2580,0x03b1,0x00df,0x0393,0x03c0,0x03a3,0x03c3,0x00b5,0x03c4,0x03a6,0x0398,0x03a9,0x03b4,0x221e,0x03c6,0x03b5,0x2229,0x2261,0x00b1,0x2265,0x2264,0x2320,0x2321,0x00f7,0x2248,0x00b0,0x2219,0x00b7,0x221a,0x207f,0x00b2,0x25a0,0x00a0};
  std::string result;
  for(unsigned char c:raw){if(c<128){result+=char(c);continue;}auto code=mapping[c-128];
    if(code<0x800){result+=char(0xc0|(code>>6));result+=char(0x80|(code&63));}
    else {result+=char(0xe0|(code>>12));result+=char(0x80|((code>>6)&63));result+=char(0x80|(code&63));}
  }return result;
}
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
    ZipEntry e;e.madeBy=u16(b,at+4);e.externalAttributes=u32(b,at+38);e.flags=u16(b,at+8);e.method=u16(b,at+10);e.crc=u32(b,at+16);e.compressed=u32(b,at+20);e.size=u32(b,at+24);e.offset=u32(b,at+42);
    const auto nameLen=u16(b,at+28),extra=u16(b,at+30),comment=u16(b,at+32);
    if(u16(b,at+34)!=0 || e.size==0xffffffff || e.compressed==0xffffffff || e.offset==0xffffffff) throw Error(ErrorKind::Unsupported,"ZIP64 or split entries are unsupported");
    if(e.flags&1) throw Error(ErrorKind::Unsupported,"Encrypted project archives are unsupported");
    if(e.method!=0 && e.method!=8) throw Error(ErrorKind::Unsupported,"Unsupported ZIP compression method");
    e.rawName=text(b,at+46,nameLen);
    const auto name=limits.decodeCp437Names && !(e.flags&0x800)?cp437Name(e.rawName):e.rawName;
    if(name.empty() || name.find('\0')!=std::string::npos || !entries_.emplace(name,e).second) corrupt("Duplicate or empty ZIP filename");
    // Extension archives follow inspect_archive: directory entries consume no
    // expanded budget. Project archives retain their existing strict accounting.
    const auto expandedSize=limits.ignoreDirectoryExpandedBytes && name.back()=='/'?0u:e.size;
    if(expandedSize>limits.expandedBytes-expanded) throw Error(ErrorKind::Limit,"Project archive exceeds expanded budget");
    expanded+=expandedSize;
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
  if(text(b,at+30,n)!=e.rawName) corrupt("ZIP filename mismatch: "+name);
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
std::vector<std::uint32_t> decodeRaster(const Bytes& b,const std::string& encoding,RasterFormat format,std::uint32_t w,std::uint32_t h,std::size_t maxBytes) {
  if(format!=RasterFormat::Rgba&&format!=RasterFormat::Indexed) throw Error(ErrorKind::Unsupported,"Unsupported raster format");
  if(!w || !h) corrupt("Invalid raster dimensions");
  const std::uint64_t pixels=std::uint64_t(w)*h;
  if(pixels>maxBytes/4 || pixels>std::numeric_limits<std::size_t>::max()/4) throw Error(ErrorKind::Limit,"Raster exceeds memory budget");
  const auto size=pixels*4;
  if(encoding!="raw" && encoding!="sparse-tiles-v1") throw Error(ErrorKind::Unsupported,"Unsupported raster encoding: "+encoding);
  if(encoding=="raw") {
    if(b.size()!=size) corrupt("Raster byte length mismatch");
    std::vector<std::uint32_t> out(static_cast<std::size_t>(size/4));
    for(std::size_t i=0;i<out.size();++i) out[i]=u32(b,i*4);
    return out;
  }
  span(b,0,24);
  if(u32(b,0)!=0x3154534d || u16(b,4)!=64 || b[6]!=unsigned(format) || u32(b,8)!=w || u32(b,12)!=h) corrupt("Invalid sparse raster header");
  const auto count=u32(b,16);const std::uint64_t end=24ull+16ull*count;
  if(end>b.size() || u32(b,20)!=b.size()-end || count>std::uint64_t((w+63ull)/64)*((h+63ull)/64)) corrupt("Invalid sparse raster table");
  std::set<std::pair<std::uint32_t,std::uint32_t>> slots;
  std::size_t expected=static_cast<std::size_t>(end);
  // Validate the complete payload before allocating the dense surface.
  for(std::uint32_t i=0;i<count;++i) {
    const auto at=24u+std::size_t(i)*16;const auto x=u32(b,at),y=u32(b,at+4);const auto tw=u16(b,at+8),th=u16(b,at+10);
    if(x>=w || y>=h || x%64 || y%64 || tw!=std::min(64u,w-x) || th!=std::min(64u,h-y) || u32(b,at+12)!=expected || !slots.emplace(x,y).second) corrupt("Invalid sparse raster tile");
    const std::size_t bytes=std::size_t(tw)*th*4;span(b,expected,bytes);expected+=bytes;
  }
  if(expected!=b.size()) corrupt("Trailing sparse raster data");
  std::vector<std::uint32_t> out(static_cast<std::size_t>(size/4));
  for(std::uint32_t i=0;i<count;++i) {
    const auto at=24u+std::size_t(i)*16;const auto x=u32(b,at),y=u32(b,at+4);const auto tw=u16(b,at+8),th=u16(b,at+10);auto offset=std::size_t(u32(b,at+12));
    for(unsigned row=0;row<th;++row) for(unsigned col=0;col<tw;++col,offset+=4) out[std::size_t(y+row)*w+x+col]=u32(b,offset);
  }
  return out;
}
std::vector<std::uint32_t> decodeRgba(const Bytes& b,const std::string& encoding,std::uint32_t w,std::uint32_t h,std::size_t maxBytes) {
  return decodeRaster(b,encoding,RasterFormat::Rgba,w,h,maxBytes);
}
}
