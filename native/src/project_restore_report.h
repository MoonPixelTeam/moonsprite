#pragma once
#include "project_manifest.h"
#include <algorithm>
namespace moon::project {
// Legacy ProjectDecodeReport: optional recording damage must remain visible.
struct TimelapseRestoreReport {
 std::size_t droppedTimelapseFrames=0,timelapseFrames=0;
 std::vector<std::string> dropReasons;
 void drop(const std::string& reason){++droppedTimelapseFrames;if(std::find(dropReasons.begin(),dropReasons.end(),reason)==dropReasons.end())dropReasons.push_back(reason);}
};
ReadManifest readProjectManifest(std::shared_ptr<const Bytes> bytes,Limits limits,TimelapseRestoreReport* report);
}
