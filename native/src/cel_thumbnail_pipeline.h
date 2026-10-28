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
 Result get(const CelThumbnailOwner&,const std::string&,uint64_t,uint64_t,const Render&,bool bypass=false);
 void prune();
 void clear(){owners_.clear();}
 size_t variantCount(const CelThumbnailOwner&)const;
 size_t cachedBytes(const CelThumbnailOwner&)const;
 size_t ownerCount(){prune();return owners_.size();}
private:
 struct Entry {std::string key;uint64_t revision,storageRevision;Result pixels;};
 using WeakOwner=std::weak_ptr<const void>;
 std::map<WeakOwner,std::list<Entry>,std::owner_less<WeakOwner>> owners_;
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
