#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>
namespace moon::timelapse {
using Bytes=std::vector<std::uint8_t>;
enum class Quality {Low,Medium,High};
enum class Mode {Full,Smart};
struct Reference {std::string store,chunk;std::uint64_t offset=0,length=0;std::uint32_t checksum=0;};
inline bool safeId(const std::string& s){return !s.empty()&&s.size()<=100&&std::all_of(s.begin(),s.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='-';});}
inline bool validReference(const Reference& r){constexpr std::uint64_t safe=9007199254740991ULL;return safeId(r.store)&&safeId(r.chunk)&&r.length>0&&r.length<=32*1024*1024&&r.offset<=safe-r.length;}
struct Frame {std::string id;double capturedAt=0,elapsedMs=0;int width=0,height=0;double changeScore=0;Bytes data;std::optional<Reference> local;};
struct Settings {bool enabled=false,recordUndoSteps=false;Quality quality=Quality::Medium;int fps=12,speed=8;Mode mode=Mode::Smart;std::vector<Frame> snapshots;};
inline void normalize(Settings& s){s.fps=std::clamp(s.fps,1,60);s.speed=std::clamp(s.speed,1,64);}
inline int maximumDimension(Quality q){return q==Quality::Low?640:q==Quality::High?2400:1280;}
struct Dimensions {int width=0,height=0;};
inline Dimensions imageOutputDimensions(const std::vector<Frame>& snapshots,int scalePercent){const Frame* largest=nullptr;for(const auto& f:snapshots)if(!largest||std::max(f.width,f.height)>std::max(largest->width,largest->height))largest=&f;if(!largest)return {};const double ratio=std::clamp(scalePercent,1,6400)/100.;return {std::max(1,int(std::floor(largest->width*ratio+.5))),std::max(1,int(std::floor(largest->height*ratio+.5)))};}

inline Dimensions captureDimensions(int w,int h,Quality q){if(w<1||h<1)throw std::invalid_argument("Invalid recording canvas");const double ratio=std::min(1.,double(maximumDimension(q))/std::max(w,h));return {std::max(1,int(std::floor(w*ratio+.5))),std::max(1,int(std::floor(h*ratio+.5)))};}
inline constexpr std::size_t byteBudget=256ULL*1024*1024,fullFrameLimit=100000,smartTarget=180,smartCompactTarget=120,smartRecent=60;
inline void compact(std::vector<Frame>& frames){if(frames.size()<=smartCompactTarget)return;const auto older=frames.size()-smartRecent,target=smartCompactTarget-smartRecent;std::vector<Frame> selected;selected.reserve(smartCompactTarget);for(std::size_t slot=0;slot<target;++slot){const auto begin=slot*older/target,end=std::max(begin+1,(slot+1)*older/target);auto best=begin;for(auto i=begin+1;i<end;++i)if(frames[i].changeScore>frames[best].changeScore)best=i;selected.push_back(std::move(frames[best]));}for(auto i=older;i<frames.size();++i)selected.push_back(std::move(frames[i]));frames=std::move(selected);}
inline void retainWithinBytes(std::vector<Frame>& frames,std::size_t budget=byteBudget){std::size_t total=0;for(const auto& f:frames){if(f.data.size()>std::numeric_limits<std::size_t>::max()-total)throw std::overflow_error("Recording size overflow");total+=f.data.size();}if(total<=budget||frames.size()<=1)return;std::vector<std::size_t> keep;std::size_t bytes=0,index=frames.size();while(index&&keep.size()<smartRecent){const auto next=index-1,n=frames[next].data.size();if(n>budget-bytes&&!keep.empty())break;keep.push_back(next);bytes+=n;--index;if(bytes>budget)break;}if(bytes>budget){Frame last=std::move(frames.back());frames.clear();frames.push_back(std::move(last));return;}std::vector<std::size_t> older;for(std::size_t i=0;i<index;++i)older.push_back(i);std::stable_sort(older.begin(),older.end(),[&](auto a,auto b){return frames[a].changeScore>frames[b].changeScore;});for(auto i:older){const auto n=frames[i].data.size();if(n<=budget-bytes){keep.push_back(i);bytes+=n;}}std::sort(keep.begin(),keep.end(),[&](auto a,auto b){return frames[a].capturedAt<frames[b].capturedAt;});std::vector<Frame> result;result.reserve(keep.size());for(auto i:keep)result.push_back(std::move(frames[i]));frames=std::move(result);}
class CapacityError:public std::runtime_error {public:CapacityError():std::runtime_error("Recording capacity reached; existing frames retained") {}};
// Arm remains true after first compaction, matching legacy cache. A new stream,
// clear, or explicit mode change resets it. Compact only at successful commit.
struct SmartState {bool armed=false;void reset(){armed=false;}};
inline void append(Settings& s,SmartState& smart,Frame frame,Mode capturedMode){normalize(s);frame.elapsedMs=s.snapshots.empty()?0:std::max(0.,frame.capturedAt-s.snapshots.back().capturedAt);frame.changeScore=std::clamp(frame.changeScore,0.,1.);if(s.mode==capturedMode&&s.mode==Mode::Smart&&smart.armed&&s.snapshots.size()>=smartTarget)compact(s.snapshots);if(s.mode==Mode::Full){std::size_t total=0;for(const auto& f:s.snapshots){if(f.data.size()>byteBudget-total){s.enabled=false;throw CapacityError();}total+=f.data.size();}if(s.snapshots.size()>=fullFrameLimit||frame.data.size()>byteBudget-total){s.enabled=false;throw CapacityError();}s.snapshots.push_back(std::move(frame));}else{s.snapshots.push_back(std::move(frame));retainWithinBytes(s.snapshots);}if(s.mode==Mode::Smart&&s.snapshots.size()>=smartTarget)smart.armed=true;}
inline double previewHoldMs(const Settings& s){return 1000./std::clamp(s.fps,1,60)/std::clamp(s.speed,1,64);}
struct VideoFrame {std::size_t snapshotIndex=0;double durationMs=0;};
inline std::vector<VideoFrame> videoPlan(const Settings& s,std::optional<double> seconds={}){if(s.snapshots.empty())return {};const auto fps=std::clamp(s.fps,1,60);const auto duration=seconds?std::clamp(*seconds,.1,3600.)*1000:s.snapshots.size()*1000./fps/std::clamp(s.speed,1,64);const auto count=std::max<std::size_t>(1,std::size_t(std::floor(duration*fps/1000+.5)));std::vector<VideoFrame> out;out.reserve(count);for(std::size_t i=0;i<count;++i)out.push_back({count==1?s.snapshots.size()-1:std::size_t(std::floor(double(i)*(s.snapshots.size()-1)/(count-1)+.5)),1000./fps});return out;}
}
