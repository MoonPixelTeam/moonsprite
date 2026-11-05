#include "project_information.h"
#include <algorithm>
namespace moon {
void ProjectInformation::operation(){
 // legacy normalizeProjectStatistics + recordDocumentOperation: unsafe prior
 // values reset to zero. This operation may itself transiently produce 2^53.
 strokeCount=projectCounter(double(strokeCount));
 drawingTimeMs=projectCounter(double(drawingTimeMs));
 operationCount=projectCounter(double(operationCount))+1;
 updatedAt=projectTimestamp();
}
void ProjectInformation::drawing(std::int64_t duration){
 strokeCount=projectCounter(double(strokeCount))+1;
 // JS adds milliseconds as a Number. Reproduce its rounding near 2^53,
 // rather than saturating or silently retaining extra integer precision.
 const auto elapsed=double(std::max<std::int64_t>(0,duration));
 drawingTimeMs=std::uint64_t(double(projectCounter(double(drawingTimeMs)))+elapsed);
}
}
