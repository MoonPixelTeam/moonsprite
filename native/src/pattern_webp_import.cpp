#include "pattern_webp_import.h"
#include "pattern_brush_import.h"
#include "include/codec/SkWebpDecoder.h"
#include "include/core/SkColorSpace.h"
#include "include/core/SkData.h"
#include <fstream>
namespace moon {
PatternBrush decodeWebpPatternBrush(const std::filesystem::path& path){
 std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("Cannot read WebP brush file");
 std::vector<char> bytes((std::istreambuf_iterator<char>(input)),{});if(!input.eof()&&input.fail())throw std::runtime_error("Cannot read WebP brush file");
 auto data=SkData::MakeWithCopy(bytes.data(),bytes.size());SkCodec::Result status;auto codec=SkWebpDecoder::Decode(std::move(data),&status);if(!codec)throw std::runtime_error("Cannot decode WebP brush file");
 const auto dimensions=codec->dimensions();if(dimensions.width()<1||dimensions.height()<1||dimensions.width()>64||dimensions.height()>64)throw std::runtime_error("Image brushes must be 1..64 pixels");
 auto info=SkImageInfo::Make(dimensions.width(),dimensions.height(),kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,SkColorSpace::MakeSRGB());
 std::vector<std::uint8_t> rgba(std::size_t(dimensions.width())*dimensions.height()*4,0);SkCodec::Options options;options.fFrameIndex=0;options.fZeroInitialized=SkCodec::kYes_ZeroInitialized;
 if(codec->getPixels(info,rgba.data(),dimensions.width()*4,&options)!=SkCodec::kSuccess)throw std::runtime_error("Invalid WebP brush pixels");
 // Browser ImageBitmap -> Canvas2D reads transparent pixels as transparent black.
 for(std::size_t i=0;i<rgba.size();i+=4)if(!rgba[i+3])rgba[i]=rgba[i+1]=rgba[i+2]=0;
 return createPatternBrushFromRgba(dimensions.width(),dimensions.height(),rgba);
}
}
