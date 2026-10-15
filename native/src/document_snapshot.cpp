#include "document_snapshot.h"
#include <algorithm>
#include <type_traits>
namespace moon {
DocumentSnapshot::DocumentSnapshot(const Document& d,std::string newProjectId)
 :raster_(d.timeline().state()),identity_(d.identity()),revision_(d.revision()),contentRevision_(d.contentRevision()),width_(d.width()),height_(d.height()),loop_(d.animationLoop()),projectId_(d.projectId().empty()?std::move(newProjectId):d.projectId()),layer_(d.layer().id),frame_(d.frame().id),name_(d.name()),palette_(d.palette()),symmetry_(d.symmetryCenter()),archive_(d.sourceArchive()){
  for(const auto& resource:d.projectBrushes()){
    ProjectBrushResource copy;copy.metadata=resource.metadata;const auto& b=resource.brush;
    copy.brush.width=b.width;copy.brush.height=b.height;copy.brush.sourceX=b.sourceX;copy.brush.sourceY=b.sourceY;copy.brush.intrinsicSize=b.intrinsicSize;brushes_.push_back(std::move(copy));
  }
}
bool DocumentSnapshot::matches(const Document& d)const{const auto center=d.symmetryCenter();return !d.active() && identity_==d.identity() && revision_==d.revision() && contentRevision_==d.contentRevision() && symmetry_.x==center.x && symmetry_.y==center.y && loop_==d.animationLoop();}
bool DocumentSnapshot::advance(const Document& d,std::chrono::steady_clock::time_point deadline){
  if(!matches(d))throw std::logic_error("Document changed during snapshot");
  if(complete_)return true;
  const auto before=raster_.copiedPixels();
  if(!raster_.advance(d.timeline().state(),deadline))return false;
  auto remaining=(RasterSnapshot::tickPixels-(raster_.copiedPixels()-before))*sizeof(Pixel);
  while(brush_<brushes_.size()){
    if(!remaining || std::chrono::steady_clock::now()>=deadline)return false;
    auto& target=brushes_[brush_].brush;const auto& source=d.projectBrushes().at(brush_).brush;
    auto copy=[&](auto& dest,const auto& values){
      using Value=typename std::decay_t<decltype(dest)>::value_type;
      if(!offset_)dest.reserve(values.size());
      const auto count=std::min({RasterSnapshot::chunkPixels,values.size()-offset_,remaining/sizeof(Value)});
      dest.insert(dest.end(),values.begin()+offset_,values.begin()+offset_+count);offset_+=count;remaining-=count*sizeof(Value);
      if(offset_==values.size()){offset_=0;++part_;}else if(!count)remaining=0;
    };
    if(part_==0)copy(target.coverage,source.coverage);else if(part_==1)copy(target.colors,source.colors);else copy(target.paintColors,source.paintColors);
    if(part_==3){part_=0;++brush_;}
  }
  complete_=true;return true;
}
Document DocumentSnapshot::finish(){
  if(!complete_)throw std::logic_error("Document snapshot incomplete");
  auto source=archive_?archive_:std::make_shared<const std::vector<std::uint8_t>>();
  auto result=Document::fromImported(width_,height_,raster_.take(),std::move(palette_),projectId_.empty()?"snapshot":projectId_,std::move(name_),source);
  result.projectId_=std::move(projectId_);result.sourceArchive_=std::move(archive_);
  result.setImportedProjectBrushes(std::move(brushes_));result.setSymmetryCenter(symmetry_,false);result.selectLayer(layer_);result.selectFrame(frame_);result.setImportedLoop(loop_);return result;
}
}
