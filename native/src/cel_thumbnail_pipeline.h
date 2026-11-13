#pragma once
#include "timeline_model.h"
#include <functional>
#include <list>
#include <map>
#include <memory>
namespace moon {
using CelThumbnailPixels=std::vector<timeline::Pixel>;
using CelThumbnailOwner=std::shared_ptr<const void>;
class CelThumbnailCache {
public:
 using Result=std::shared_ptr<const CelThumbnailPixels>;
 using Render=std::function<CelThumbnailPixels()>;
 static constexpr size_t MaxVariants=8,MaxVariantBytes=128*1024;
 static constexpr size_t MaxTotalBytes=16*1024*1024,MaxOwners=4096;
 Result get(const CelThumbnailOwner&,const std::string&,uint64_t,uint64_t,const Render&,bool bypass=false);
 void prune();
 void clear(){owners_.clear();fifo_.clear();totalBytes_=0;next_=1;}
 size_t variantCount(const CelThumbnailOwner&)const;
 size_t cachedBytes(const CelThumbnailOwner&)const;
 size_t cachedBytes()const{return totalBytes_;}
 size_t ownerCount(){prune();return owners_.size();}
private:
 struct Entry {std::string key;uint64_t revision,storageRevision;Result pixels;uint64_t ticket;size_t bytes;};
 using WeakOwner=std::weak_ptr<const void>;
 using Owners=std::map<WeakOwner,std::list<Entry>,std::owner_less<WeakOwner>>;
 Owners owners_;
 std::map<uint64_t,WeakOwner> fifo_;
 size_t totalBytes_=0;uint64_t next_=1;
 void erase(Owners::iterator,std::list<Entry>::iterator);
 void enforceBudget();
};
struct CelThumbnailScheduler {
 using Handle=uint64_t;using Callback=std::function<void()>;
 std::function<Handle(Callback)> postFrame,postDeferred;
 std::function<void(Handle)> cancelFrame,cancelDeferred;
 std::function<double()> nowMs;
};
class CelThumbnailQueue {
public:
 using Cancel=std::function<void()>;
 explicit CelThumbnailQueue(CelThumbnailScheduler);
 ~CelThumbnailQueue();
 CelThumbnailQueue(const CelThumbnailQueue&)=delete;
 CelThumbnailQueue& operator=(const CelThumbnailQueue&)=delete;
 Cancel schedule(std::function<void()>);
 void cancelAll()noexcept;
 size_t pending()const;
private:
 struct State;std::shared_ptr<State> state_;
};
}
