#include "document.h"
#include <algorithm>
namespace moon {
bool Document::canvasReferenceHistoryRange(std::size_t target)const{
 if(target>history_.size()||target==history_.position())return false;
 for(auto i=std::min(target,history_.position());i<std::max(target,history_.position());++i)if(!history_.at(i).canvasReferenceHistory)return false;
 return true;
}
const CanvasReference* Document::canvasReference(const std::string& id,bool preview)const{
 if(preview&&canvasReferenceGesture_&&canvasReferenceGesture_->after.id==id)return &canvasReferenceGesture_->after;
 const auto it=std::find_if(canvasReferences_.begin(),canvasReferences_.end(),[&](const auto& r){return r.id==id;});return it==canvasReferences_.end()?nullptr:&*it;
}
void Document::setImportedCanvasReferences(CanvasReferences values){validateCanvasReferences(values);canvasReferences_.swap(values);canvasReferenceGesture_.reset();}
bool Document::commitCanvasReference(std::optional<CanvasReference> before,std::optional<CanvasReference> after,std::size_t oldIndex,std::size_t newIndex,std::u32string label){
 if(before&&after&&oldIndex==newIndex&&sameReference(*before,*after))return false;
 Edit e{{},state_,nextState_};e.canvasReferenceHistory=CanvasReferenceHistory{std::move(before),std::move(after),oldIndex,newIndex};reserveHistoryEntries();
 auto previous=canvasReferences_;const auto pushed=historyPushRevision_;
 applyEdit(e,true);
 try{pushEdit(std::move(e),std::move(label));}
 catch(...){if(historyPushRevision_==pushed)canvasReferences_.swap(previous);throw;}
 return true;
}
void Document::applyCanvasReferenceHistory(const CanvasReferenceHistory& history,bool forward){
 const auto& image=forward?history.after:history.before;const auto& other=forward?history.before:history.after;
 const auto& id=image?image->id:other->id;auto next=canvasReferences_;next.erase(std::remove_if(next.begin(),next.end(),[&](const auto& r){return r.id==id;}),next.end());if(image)next.insert(next.begin()+std::min(forward?history.newIndex:history.oldIndex,next.size()),*image);canvasReferences_.swap(next);
}
std::size_t Document::CanvasReferenceHistory::bytes()const{
 if(before&&after&&before->src&&after->src&&*before->src==*after->src)return 256;
 return 256+2*((before&&before->src?referenceStringLength(*before->src):0)+(after&&after->src?referenceStringLength(*after->src):0));
}
bool Document::addCanvasReference(CanvasReference image){validateCanvasReference(image);if(canvasReference(image.id))return false;image.initial=referencePlacement(image);const auto index=canvasReferences_.size();return commitCanvasReference({},std::move(image),index,index,U"添加画布参考图");}
bool Document::updateCanvasReference(const std::string& id,ReferencePatch p){
 const auto* value=canvasReference(id);if(!value)return false;
 for(const auto* n:{&p.x,&p.y,&p.width,&p.height,&p.angle})if(*n&&!std::isfinite(**n))return false;
 if((p.width&&*p.width<=0)||(p.height&&*p.height<=0)||(p.opacity&&(!std::isfinite(*p.opacity)||*p.opacity<0||*p.opacity>1))||(p.initial&&!validReferencePlacement(*p.initial)))return false;
 const auto before=*value;auto after=before;const double ratio=before.initial?before.initial->width/before.initial->height:before.width/before.height;
 if(before.locked){if(p.locked)after.locked=*p.locked;}
 else{
  if(p.x)after.x=*p.x;if(p.y)after.y=*p.y;if(p.width){after.width=*p.width;after.height=*p.width/ratio;}else if(p.height){after.height=*p.height;after.width=*p.height*ratio;}
  if(p.angle)after.angle=*p.angle;if(p.opacity)after.opacity=*p.opacity;if(p.flipX)after.flipX=*p.flipX;if(p.flipY)after.flipY=*p.flipY;if(p.locked)after.locked=*p.locked;if(p.floating)after.floating=*p.floating;if(p.initial)after.initial=*p.initial;
 }
 if(!validReferencePlacement(after)||sameReference(before,after))return false;
 if(canvasReferenceGesture_&&canvasReferenceGesture_->after.id==id){canvasReferenceGesture_->after=std::move(after);return true;}
 const auto index=std::size_t(value-canvasReferences_.data());return commitCanvasReference(before,std::move(after),index,index,U"调整画布参考图");
}
bool Document::replaceCanvasReference(const std::string& id,std::shared_ptr<const std::string> source,double width,double height){
 finishCanvasReference();const auto* r=canvasReference(id);if(!r||r->locked||!std::isfinite(width)||!std::isfinite(height)||width<=0||height<=0)return false;
 auto after=*r;after.src=std::move(source);after.height=r->width*height/width;after.initial=referencePlacement(*r);after.initial->height=after.height;after.initial->angle=0;after.initial->flipX=false;after.initial->flipY=false;validateCanvasReference(after);const auto index=std::size_t(r-canvasReferences_.data());return commitCanvasReference(*r,std::move(after),index,index,U"替换画布参考图");
}
bool Document::removeCanvasReference(const std::string& id){finishCanvasReference();const auto* r=canvasReference(id,false);if(!r||r->locked)return false;const auto index=std::size_t(r-canvasReferences_.data());return commitCanvasReference(*r,{},index,index,U"删除画布参考图");}
bool Document::resetCanvasReference(const std::string& id){finishCanvasReference();const auto* r=canvasReference(id,false);if(!r||r->locked||!r->initial)return false;auto after=*r;after.width=r->initial->width;after.height=r->initial->height;after.angle=r->initial->angle;after.flipX=r->initial->flipX;after.flipY=r->initial->flipY;const auto index=std::size_t(r-canvasReferences_.data());return commitCanvasReference(*r,std::move(after),index,index,U"重置画布参考图");}
bool Document::bringCanvasReferenceToFront(const std::string& id){finishCanvasReference();const auto* r=canvasReference(id);if(!r)return false;const auto index=std::size_t(r-canvasReferences_.data());if(std::none_of(canvasReferences_.begin()+index+1,canvasReferences_.end(),[&](const auto& v){return v.floating.value_or(false)==r->floating.value_or(false);}))return false;return commitCanvasReference(*r,*r,index,canvasReferences_.size()-1,U"置顶画布参考图");}
void Document::beginCanvasReference(const std::string& id){finishCanvasReference();const auto* r=canvasReference(id);if(r&&!r->locked)canvasReferenceGesture_=CanvasReferenceGesture{*r,*r};}
bool Document::finishCanvasReference(bool cancel){
 if(!canvasReferenceGesture_)return false;
 if(cancel){canvasReferenceGesture_.reset();return false;}
 const auto gesture=*canvasReferenceGesture_;
 const auto it=std::find_if(canvasReferences_.begin(),canvasReferences_.end(),[&](const auto& r){return r.id==gesture.before.id;});
 if(it==canvasReferences_.end()){canvasReferenceGesture_.reset();return false;}
 const auto index=std::size_t(it-canvasReferences_.begin()),pushed=historyPushRevision_;
 try{const bool changed=commitCanvasReference(gesture.before,gesture.after,index,index,U"调整画布参考图");canvasReferenceGesture_.reset();return changed;}
 catch(...){if(historyPushRevision_!=pushed)canvasReferenceGesture_.reset();throw;}
}
}
