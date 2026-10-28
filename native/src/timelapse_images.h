#pragma once
#include "timelapse.h"
#include "image_export.h"
#include <functional>
namespace moon::timelapse {
struct Image {int width=0,height=0;std::vector<Pixel> pixels;};
Image decodeRecordingPng(const Bytes& bytes);
using Reader=std::function<Bytes(const Frame&)>;
std::size_t writeRecordingSequence(const Settings&,const Reader&,const std::vector<std::filesystem::path>&,bool jpeg,int scalePercent=100,const std::function<bool()>& cancelled={},const std::function<void(std::size_t,std::size_t)>& progress={},ExportProtection protection=ExportProtection::Off);
}
