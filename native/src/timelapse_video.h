#pragma once
#include "timelapse_images.h"
namespace moon::timelapse {
// core/timelapse.ts: output geometry and constant-rate frame sampling.
struct VideoOptions {bool durationMode=true;double durationSeconds=1;};
struct VideoGeometry {int width=0,height=0,drawWidth=0,drawHeight=0,scale=1;};
VideoGeometry videoGeometry(const std::vector<Frame>&,Quality);
VideoGeometry videoGeometry(const Settings&);
std::size_t videoFrameCount(std::size_t snapshots,int fps,int speed,const VideoOptions&);
std::size_t videoFrameCount(const Settings&,const VideoOptions&);
// Canvas capture streams discard alpha; the native H.264 adapter composites
// onto black, scales with nearest sampling, and centers each source frame.
Image renderVideoFrame(const Image&,const VideoGeometry&);
// Returns false on cancellation. Existing destination stays intact until the
// completed stream has been finalized, flushed and atomically replaced.
bool writeRecordingMp4(const Settings&,const Reader&,const std::filesystem::path&,
 const VideoOptions& = {},const std::function<bool()>& cancelled={},
 const std::function<void(std::size_t,std::size_t)>& progress={});
}
