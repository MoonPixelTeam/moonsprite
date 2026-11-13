#include "document.h"
#include <stdexcept>

namespace moon {
void Document::applySliceHistory(HistoryReplayPlan& plan)noexcept{
 if(plan.slices){std::swap(sliceState_,*plan.slices);plan.slicesApplied=!plan.slicesApplied;}
}
std::size_t Document::SliceHistory::bytes()const{
 if(beforeSlices&&!afterSlices)throw std::logic_error("Incomplete slice history cost");
 return beforeSlices?(beforeSlices->items.size()+afterSlices->items.size())*48:0;
}
}
