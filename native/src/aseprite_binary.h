#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
#include <zlib.h>
namespace moon::ase {
using Bytes=std::vector<std::uint8_t>;constexpr std::size_t Budget=256ULL*1024*1024;
[[noreturn]] inline void bad(const char* message){throw std::runtime_error(message);}
struct Reader {const Bytes& b;std::size_t p=0,end;explicit Reader(const Bytes& bytes):b(bytes),end(bytes.size()){} Reader(const Bytes& bytes,std::size_t begin,std::size_t limit):b(bytes),p(begin),end(limit){if(begin>limit||limit>bytes.size())bad("ASE 区块越界。");}void need(std::size_t n)const{if(p>end||n>end-p)bad("ASE 数据不完整。");}unsigned u8(){need(1);return b[p++];}unsigned u16(){unsigned a=u8();return a|(u8()<<8);}int s16(){return static_cast<std::int16_t>(u16());}std::uint32_t u32(){auto a=u16();return a|(std::uint32_t(u16())<<16);}void skip(std::size_t n){need(n);p+=n;}
 std::u32string str(){auto n=u16();need(n);std::u32string out;auto stop=p+n;while(p<stop){auto c=b[p++];unsigned count=0;char32_t v=c;if(c<128){}else if((c&224)==192){count=1;v=c&31;}else if((c&240)==224){count=2;v=c&15;}else if((c&248)==240){count=3;v=c&7;}else bad("ASE UTF-8 名称无效。");for(unsigned i=0;i<count;i++){if(p>=stop||(b[p]&192)!=128)bad("ASE UTF-8 名称无效。");v=(v<<6)|(b[p++]&63);}if((count==1&&v<128)||(count==2&&v<2048)||(count==3&&v<65536)||v>0x10ffff||(v>=0xd800&&v<=0xdfff))bad("ASE UTF-8 名称无效。");out+=v;}return out;}};
struct Writer {Bytes b;void u8(unsigned v){b.push_back(std::uint8_t(v));}void u16(unsigned v){u8(v);u8(v>>8);}void u32(std::uint32_t v){u16(v);u16(v>>16);}void zero(std::size_t n){if(n>Budget-b.size())bad("ASE 输出过大。");b.resize(b.size()+n);}void raw(const Bytes& bytes){if(bytes.size()>Budget-b.size())bad("ASE 输出过大。");b.insert(b.end(),bytes.begin(),bytes.end());}void patch32(std::size_t p,std::uint32_t v){for(int k=0;k<4;k++)b.at(p+k)=std::uint8_t(v>>(8*k));}
 void str(const std::u32string& s){Bytes utf;for(auto c:s){if(c<128)utf.push_back(std::uint8_t(c));else if(c<2048){utf.push_back(192|(c>>6));utf.push_back(128|(c&63));}else if(c<65536){utf.push_back(224|(c>>12));utf.push_back(128|((c>>6)&63));utf.push_back(128|(c&63));}else{utf.push_back(240|(c>>18));utf.push_back(128|((c>>12)&63));utf.push_back(128|((c>>6)&63));utf.push_back(128|(c&63));}}if(utf.size()>65535)bad("ASE 名称过长。");u16(unsigned(utf.size()));raw(utf);}void chunk(unsigned type,const Writer& payload){u32(std::uint32_t(payload.b.size()+6));u16(type);raw(payload.b);}};
inline Bytes inflate(const Bytes& bytes,std::size_t begin,std::size_t end,std::size_t expected){if(expected>Budget||begin>end||end>bytes.size())bad("ASE 像素尺寸过大。");Bytes result(expected);uLongf size=uLongf(expected);if(uncompress(result.data(),&size,bytes.data()+begin,uLong(end-begin))!=Z_OK||size!=expected)bad("ASE zlib 像素流无效。");return result;}
inline Bytes deflate(const Bytes& raw){uLongf n=compressBound(uLong(raw.size()));Bytes out(n);if(compress2(out.data(),&n,raw.data(),uLong(raw.size()),Z_DEFAULT_COMPRESSION)!=Z_OK)bad("ASE zlib 编码失败。");out.resize(n);return out;}
inline const std::vector<std::string>& blends(){static const std::vector<std::string> values={"normal","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion","hue","saturation","color","luminosity","linear-dodge","subtract","divide"};return values;}
inline std::string blend(unsigned n){if(n>=blends().size())bad("ASE 包含未支持的混合模式。");return blends()[n];}inline unsigned blend(const std::string& v){auto it=std::find(blends().begin(),blends().end(),v);if(it==blends().end())bad("ASE 无法表示此混合模式。");return unsigned(it-blends().begin());}inline unsigned alpha(double v){return unsigned(std::lround(std::clamp(v,0.,1.)*255));}
}