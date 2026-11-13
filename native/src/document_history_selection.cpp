#include "document.h"

namespace moon {
void Document::applyTrimPivotHistory(HistoryReplayPlan& plan)noexcept{
 if(!plan.pivot)return;
 if(!plan.pivotPrepared){plan.pivot->serial=selectionPivotHistory_.serial+1;plan.pivotPrepared=true;}
 std::swap(selectionPivotHistory_,*plan.pivot);plan.pivotApplied=!plan.pivotApplied;
}
void Document::applyPixelSelectionHistory(HistoryReplayPlan& plan)noexcept{
 if(plan.pixelsSelection){
  swapSelectionValue(*plan.pixelsSelection);plan.pixelsSelectionApplied=!plan.pixelsSelectionApplied;
 }
}
std::size_t Document::PixelSelectionHistory::bytes()const{
 std::size_t size=0;
  for(const auto* selection:{&beforePixelsSelection,&afterPixelsSelection})if(*selection)size+=48+(*selection)->mask.size();
 return size;
}
}
