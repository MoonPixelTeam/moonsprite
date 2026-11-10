#include "extension_form_image.h"
#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Storage.Streams.h>
#include "include/codec/SkPngDecoder.h"
#include "include/core/SkData.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
namespace moon::extension {
double formImageExtent(const winrt::Windows::Data::Json::JsonObject& node,const wchar_t* key){using namespace winrt::Windows::Data::Json;if(!node.HasKey(key)||node.GetNamedValue(key).ValueType()!=JsonValueType::Number)return 48;const auto n=node.GetNamedNumber(key);return std::isfinite(n)?std::clamp(n,16.,512.):48;}
FormImage decodeFormImage(const std::wstring& source){
 const std::wstring prefix=L"data:image/png;base64,";if(source.compare(0,prefix.size(),prefix)!=0)throw std::invalid_argument("扩展表单仅支持 PNG data URL。");
 // Native working-memory admission; no disk files or network reads for previews.
 constexpr std::size_t encodedLimit=32u*1024*1024,pixelLimit=16u*1024*1024;
 if(source.size()-prefix.size()>encodedLimit)throw std::length_error("扩展表单图片超过原生内存预算。");
 const auto buffer=winrt::Windows::Security::Cryptography::CryptographicBuffer::DecodeFromBase64String(source.substr(prefix.size()));
 winrt::com_array<std::uint8_t> bytes;winrt::Windows::Security::Cryptography::CryptographicBuffer::CopyToByteArray(buffer,bytes);
 auto data=SkData::MakeWithCopy(bytes.data(),bytes.size());SkCodec::Result status;auto codec=SkPngDecoder::Decode(std::move(data),&status);if(!codec)throw std::invalid_argument("扩展表单 PNG 图片无效。");const auto size=codec->dimensions();if(size.width()<=0||size.height()<=0||std::uint64_t(size.width())*size.height()>pixelLimit)throw std::length_error("扩展表单图片超过原生像素预算。");
 FormImage image;image.width=size.width();image.height=size.height();image.pixels.resize(std::size_t(image.width)*image.height);const auto info=SkImageInfo::Make(image.width,image.height,kRGBA_8888_SkColorType,kUnpremul_SkAlphaType,nullptr);if(codec->getPixels(info,image.pixels.data(),std::size_t(image.width)*4)!=SkCodec::kSuccess)throw std::invalid_argument("扩展表单 PNG 像素无效。");return image;
}
}
