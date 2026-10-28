// Native adaptation of legacy animation-cel-thumbnail cache and queue.
#include "cel_thumbnail_pipeline.h"
#include <limits>
#include <optional>
#include <stdexcept>
namespace moon {
void CelThumbnailCache::prune(){for(auto i=owners_.begin();i!=owners_.end();)if(i->first.expired())i=owners_.erase(i);else ++i;}
size_t CelThumbnailCache::variantCount(const CelThumbnailOwner& owner)const{const auto i=owners_.find(WeakOwner(owner));return i==owners_.end()?0:i->second.size();}
size_t CelThumbnailCache::cachedBytes(const CelThumbnailOwner& owner)const{size_t bytes=0;const auto i=owners_.find(WeakOwner(owner));if(i!=owners_.end())for(const auto& e:i->second)bytes+=e.pixels->size()*sizeof(timeline::Pixel);return bytes;}
CelThumbnailCache::Result CelThumbnailCache::get(const CelThumbnailOwner& owner,const std::string& key,uint64_t revision,uint64_t storageRevision,const Render& render,bool bypass){
 const CelThumbnailOwner heldOwner=owner;
 if(!heldOwner||bypass)return std::make_shared<const CelThumbnailPixels>(render());
 {const auto i=owners_.find(WeakOwner(heldOwner));if(i!=owners_.end())for(const auto& e:i->second)if(e.key==key&&e.storageRevision==storageRevision&&(revision==0||e.revision==revision))return e.pixels;}
 auto result=std::make_shared<const CelThumbnailPixels>(render());auto& entries=owners_[WeakOwner(heldOwner)];
 for(auto i=entries.begin();i!=entries.end();++i)if(i->key==key){entries.erase(i);break;}
 entries.push_back({key,revision,storageRevision,result});size_t bytes=0;for(const auto& e:entries)bytes+=e.pixels->size()*sizeof(timeline::Pixel);
 while(entries.size()>MaxVariants||(entries.size()>1&&bytes>MaxVariantBytes)){bytes-=entries.front().pixels->size()*sizeof(timeline::Pixel);entries.pop_front();}return result;
}
struct CelThumbnailQueue::State:std::enable_shared_from_this<State>{
 CelThumbnailScheduler scheduler;std::map<uint64_t,std::function<void()>> tasks;std::optional<uint64_t> frame,deferred;uint64_t next=1;bool stopped=false;
 explicit State(CelThumbnailScheduler s):scheduler(std::move(s)){}
 void cancelHandles()noexcept{if(frame){auto h=*frame;frame.reset();try{scheduler.cancelFrame(h);}catch(...){}}if(deferred){auto h=*deferred;deferred.reset();try{scheduler.cancelDeferred(h);}catch(...){}}}
 void clear()noexcept{tasks.clear();cancelHandles();}void stop()noexcept{stopped=true;clear();}
 void cancel(uint64_t id){tasks.erase(id);if(tasks.empty())cancelHandles();}
 void postDeferred(){std::weak_ptr<State> weak=shared_from_this();deferred=scheduler.postDeferred([weak]{if(auto s=weak.lock()){s->deferred.reset();if(!s->stopped)s->flush();}});}
 void wake(){if(stopped||frame||deferred)return;if(!scheduler.postFrame){postDeferred();return;}std::weak_ptr<State> weak=shared_from_this();frame=scheduler.postFrame([weak]{if(auto s=weak.lock()){s->frame.reset();if(!s->stopped&&!s->tasks.empty())s->postDeferred();}});}
 void flush(){const double started=scheduler.nowMs();size_t rendered=0;try{while(!stopped&&!tasks.empty()){auto i=tasks.begin();auto render=std::move(i->second);tasks.erase(i);render();++rendered;if(rendered>=64||scheduler.nowMs()-started>=8)break;}}catch(...){if(!stopped&&!tasks.empty())wake();throw;}if(!stopped&&!tasks.empty())wake();}
};
CelThumbnailQueue::CelThumbnailQueue(CelThumbnailScheduler scheduler){if(!scheduler.postDeferred||!scheduler.cancelDeferred||!scheduler.nowMs||(scheduler.postFrame&&!scheduler.cancelFrame))throw std::invalid_argument("Incomplete thumbnail scheduler");state_=std::make_shared<State>(std::move(scheduler));}
CelThumbnailQueue::~CelThumbnailQueue(){state_->stop();}
CelThumbnailQueue::Cancel CelThumbnailQueue::schedule(std::function<void()> render){auto s=state_;if(!render)throw std::invalid_argument("Missing thumbnail render callback");if(s->next==std::numeric_limits<uint64_t>::max())throw std::overflow_error("Thumbnail task IDs exhausted");auto id=s->next++;s->tasks.emplace(id,std::move(render));s->wake();return [weak=std::weak_ptr<State>(s),id]{if(auto current=weak.lock())current->cancel(id);};}
void CelThumbnailQueue::cancelAll()noexcept{state_->clear();}size_t CelThumbnailQueue::pending()const{return state_->tasks.size();}
}
