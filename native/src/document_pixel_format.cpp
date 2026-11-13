#include "document.h"
#include <unordered_set>

namespace moon {
bool Document::setPixelFormat(color_mode::PixelFormat format){
 if(format==pixelFormat_)return false;
 // workspace-commands-color.ts::setPixelFormat: visit document layers/cels,
 // deduplicate shared storage, leave masks and independent source resources.
 std::unordered_set<const void*> seen;
 std::vector<timeline::LinkedPixelStorage*> owners;
 owners.reserve(timeline_.state_.cels.size());seen.reserve(timeline_.state_.cels.size());
 for(auto& cel:timeline_.state_.cels)if(cel.surface&&seen.insert(cel.surface->pixels.identity()).second)owners.push_back(&cel.surface->pixels);
 for(auto* storage:owners)for(auto& value:*storage)value=color_mode::quantizePixelColor(value,format);
 pixelFormat_=format;modified_=true;projectInformation_.operation();++revision_;
 change_={0,0,width_,height_};publishChange();notifyRecording();return true;
}
}
