// Adapted from legacy/src-tauri/src/platform_palette.rs:538-736.
// MoonSprite Source-Available License 1.0; see legacy/LICENSE.
#include "palette_adobe_import.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <optional>
#include <stdexcept>
namespace moon {namespace {
class AdobeReader {
 const std::vector<std::uint8_t>& bytes_;std::size_t offset_,end_;
public:
 explicit AdobeReader(const std::vector<std::uint8_t>& bytes):bytes_(bytes),offset_(0),end_(bytes.size()){}
 AdobeReader(const std::vector<std::uint8_t>& bytes,std::size_t start,std::size_t end):bytes_(bytes),offset_(start),end_(end){}
 std::size_t take(std::size_t count,const char* error="色板文件已截断。"){if(count>end_-offset_)throw std::runtime_error(error);auto start=offset_;offset_+=count;return start;}
 std::uint16_t u16(){auto p=take(2);return(std::uint16_t(bytes_[p])<<8)|bytes_[p+1];}
 std::uint32_t u32(){auto p=take(4);return(std::uint32_t(bytes_[p])<<24)|(std::uint32_t(bytes_[p+1])<<16)|(std::uint32_t(bytes_[p+2])<<8)|bytes_[p+3];}
 float f32(){static_assert(sizeof(float)==sizeof(std::uint32_t));auto bits=u32();float value;std::memcpy(&value,&bits,sizeof(value));return value;}
 void skipUtf16(std::uint32_t characters,const char* overflow,const char* truncated){if(std::uint64_t(characters)>std::numeric_limits<std::size_t>::max()/2)throw std::runtime_error(overflow);take(std::size_t(characters)*2,truncated);}
 AdobeReader block(std::uint32_t count){auto start=take(count,"ASE 色板文件已截断。");return AdobeReader(bytes_,start,start+count);}
 std::string model(){auto p=take(4,"ASE 色板缺少颜色模型。");return std::string(reinterpret_cast<const char*>(bytes_.data()+p),4);}
};
Pixel rgba(unsigned r,unsigned g,unsigned b){return r|(g<<8)|(b<<16)|0xff000000u;}
std::optional<unsigned> floatChannel(float value){if(!std::isfinite(value))return {};return unsigned(std::round(std::clamp(value,0.0f,1.0f)*255.0f));}
unsigned requiredFloatChannel(float value){auto channel=floatChannel(value);if(!channel)throw std::runtime_error("ASE 色板包含无效颜色值。");return *channel;}
Pixel hsvColor(float hue,float saturation,float value){const float h=std::fmod(hue,360.0f)/60.0f,chroma=value*saturation,x=chroma*(1-std::abs(std::fmod(h,2.0f)-1));float r=0,g=0,b=0;if(h<1){r=chroma;g=x;}else if(h<2){r=x;g=chroma;}else if(h<3){g=chroma;b=x;}else if(h<4){g=x;b=chroma;}else if(h<5){r=x;b=chroma;}else{r=chroma;b=x;}float m=value-chroma;return rgba(floatChannel(r+m).value_or(0),floatChannel(g+m).value_or(0),floatChannel(b+m).value_or(0));}
}
std::vector<Pixel> decodeAsePaletteColors(const std::vector<std::uint8_t>& bytes){if(bytes.size()<4||bytes[0]!='A'||bytes[1]!='S'||bytes[2]!='E'||bytes[3]!='F')throw std::runtime_error("不是 Adobe ASE 色板文件。");AdobeReader reader(bytes);reader.take(4);reader.u16();reader.u16();auto count=reader.u32();if(count>1000000)throw std::runtime_error("ASE 色板条目过多。");std::vector<Pixel> colors;for(std::uint32_t i=0;i<count;++i){auto type=reader.u16();auto length=reader.u32();auto block=reader.block(length);if(type!=1)continue;auto nameLength=block.u16();block.skipUtf16(nameLength,"ASE 色板名称过长。","ASE 色板缺少颜色模型。");auto model=block.model();if(model=="RGB "){auto r=requiredFloatChannel(block.f32()),g=requiredFloatChannel(block.f32()),b=requiredFloatChannel(block.f32());colors.push_back(rgba(r,g,b));}else if(model=="GRAY"){auto value=requiredFloatChannel(block.f32());colors.push_back(rgba(value,value,value));}else if(model=="CMYK"){auto c=std::clamp(block.f32(),0.0f,1.0f),m=std::clamp(block.f32(),0.0f,1.0f),y=std::clamp(block.f32(),0.0f,1.0f),k=std::clamp(block.f32(),0.0f,1.0f);colors.push_back(rgba(requiredFloatChannel((1-c)*(1-k)),requiredFloatChannel((1-m)*(1-k)),requiredFloatChannel((1-y)*(1-k))));}}return colors;}
std::vector<Pixel> decodeAcoPaletteColors(const std::vector<std::uint8_t>& bytes){AdobeReader reader(bytes);auto version=reader.u16();if(version!=1&&version!=2)throw std::runtime_error("不支持的 ACO 色板版本。");auto count=reader.u16();std::vector<Pixel> colors;for(unsigned i=0;i<count;++i){auto space=reader.u16();const std::uint16_t values[]{reader.u16(),reader.u16(),reader.u16(),reader.u16()};if(version==2){auto characters=reader.u32();reader.skipUtf16(characters,"ACO 色板名称过长。","ACO 色板文件已截断。");}if(space==0)colors.push_back(rgba(values[0]>>8,values[1]>>8,values[2]>>8));else if(space==1)colors.push_back(hsvColor(float(values[0])/65535.0f*360.0f,float(values[1])/65535.0f,float(values[2])/65535.0f));else if(space==8){auto value=values[0]>>8;colors.push_back(rgba(value,value,value));}}return colors;}
}
