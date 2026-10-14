#pragma once
#include "pattern_fill.h"
#include <map>
#include <string>
namespace moon {
struct ProjectBrushMetadata {std::string id,name,dataFile,colorsFile;int width=0,height=0;std::optional<int> sourceX,sourceY;};
struct ProjectBrushResource {ProjectBrushMetadata metadata;PatternBrush brush;};
// Legacy project-format customBrushes resources, retained by Document and project IO.
inline ProjectBrushResource decodeProjectBrushResource(ProjectBrushMetadata metadata,const std::map<std::string,std::vector<std::uint8_t>>& files){
 if(metadata.id.empty()||metadata.width<1||metadata.height<1||std::uint64_t(metadata.width)*metadata.height>16*1024*1024)throw std::invalid_argument("Invalid project brush dimensions/identity");
 const auto count=std::size_t(metadata.width)*metadata.height;auto gray=files.find(metadata.dataFile);if(gray==files.end()||gray->second.size()!=count)throw std::invalid_argument("Corrupt project brush coverage");
 PatternBrush brush;brush.width=metadata.width;brush.height=metadata.height;brush.sourceX=metadata.sourceX.value_or(0);brush.sourceY=metadata.sourceY.value_or(0);brush.coverage=gray->second;
 auto colors=files.find(metadata.colorsFile);if(!metadata.colorsFile.empty()&&colors!=files.end()&&colors->second.size()==count*4){brush.colors.resize(count);for(std::size_t i=0;i<count;++i)for(int channel=0;channel<4;++channel)brush.colors[i]|=std::uint32_t(colors->second[i*4+channel])<<(channel*8);}
 return {std::move(metadata),std::move(brush)};
}
inline std::map<std::string,std::vector<std::uint8_t>> encodeProjectBrushResource(const ProjectBrushResource& resource){
 const auto& b=resource.brush;const auto count=std::size_t(b.width)*b.height;if(b.width<1||b.height<1||count>16*1024*1024||b.coverage.size()!=count)throw std::invalid_argument("Invalid project brush resource");
 std::map<std::string,std::vector<std::uint8_t>> files;files[resource.metadata.dataFile]=b.coverage;if(!resource.metadata.colorsFile.empty()&&b.colors.size()==count){auto& rgba=files[resource.metadata.colorsFile];rgba.resize(count*4);for(std::size_t i=0;i<count;++i)for(int channel=0;channel<4;++channel)rgba[i*4+channel]=std::uint8_t(b.colors[i]>>(channel*8));}return files;
}
}
