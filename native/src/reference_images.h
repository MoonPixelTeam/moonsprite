#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>
namespace moon {
struct ReferenceImage {std::string id;int width=0,height=0;std::shared_ptr<const std::vector<std::uint32_t>> pixels;};
using ReferenceLibrary=std::vector<ReferenceImage>;
inline void validateReferenceImage(const ReferenceImage& image){if(image.id.empty()||image.id.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")!=std::string::npos||image.width<1||image.height<1||!image.pixels||std::uint64_t(image.width)*image.height!=image.pixels->size())throw std::invalid_argument("Invalid reference image");}
inline void validateReferenceLibrary(const ReferenceLibrary& images){std::vector<std::string> ids;for(const auto& image:images){validateReferenceImage(image);if(std::find(ids.begin(),ids.end(),image.id)!=ids.end())throw std::invalid_argument("Duplicate reference image");ids.push_back(image.id);}}
struct ReferencePoint {double x=0,y=0;};
struct ReferenceView {std::optional<double> zoom;ReferencePoint pan;std::optional<double> fit;void reset(){zoom.reset();pan={};fit.reset();}};
struct ReferenceWindow {std::string id,activeId;ReferenceView view;};
class ReferenceSession {
 std::vector<std::string> previous_;std::uint64_t serial_=0;bool initialized_=false;
public:
 std::string activeId;std::unordered_map<std::string,ReferenceView> views;std::vector<ReferenceWindow> windows;bool relativeLuminance=false;
 void synchronize(const ReferenceLibrary& images){auto valid=[&](const std::string& id){return std::any_of(images.begin(),images.end(),[&](const auto& image){return image.id==id;});};const auto old=std::find(previous_.begin(),previous_.end(),activeId);const auto index=old==previous_.end()?0:std::size_t(old-previous_.begin());const auto fallback=images.empty()?std::string{}:images[std::min(index?index-1:0,images.size()-1)].id;if(!activeId.empty()&&!valid(activeId))activeId=fallback;if(!initialized_&&activeId.empty()&&!images.empty())activeId=images.front().id;for(auto& w:windows)if(!w.activeId.empty()&&!valid(w.activeId)){w.activeId=fallback;w.view.reset();}for(auto it=views.begin();it!=views.end();)if(!valid(it->first))it=views.erase(it);else ++it;previous_.clear();for(const auto& image:images)previous_.push_back(image.id);initialized_=true;}
 ReferenceWindow* window(const std::string& id){const auto it=std::find_if(windows.begin(),windows.end(),[&](const auto& w){return w.id==id;});return it==windows.end()?nullptr:&*it;}
 std::string selected(const std::string& windowId={})const{if(windowId.empty())return activeId;const auto it=std::find_if(windows.begin(),windows.end(),[&](const auto& w){return w.id==windowId;});return it==windows.end()?std::string{}:it->activeId;}
 ReferenceView* view(const std::string& windowId={}){if(windowId.empty())return activeId.empty()?nullptr:&views[activeId];auto w=window(windowId);return w?&w->view:nullptr;}
 void chooseAdded(const std::string& id,const std::string& windowId={}){if(windowId.empty())activeId=id;else if(auto w=window(windowId)){w->activeId=id;w->view.reset();}}
 void step(const ReferenceLibrary& images,int direction,const std::string& windowId={}){if(images.empty())return;const auto id=selected(windowId);auto found=std::find_if(images.begin(),images.end(),[&](const auto& image){return image.id==id;});const auto next=found==images.end()?0:(int(found-images.begin())+direction+int(images.size()))%int(images.size());if(windowId.empty())activeId=images[next].id;else if(auto w=window(windowId)){w->activeId=images[next].id;w->view.reset();}}
 std::string openWindow(const ReferenceLibrary& images,const std::string& imageId={}){std::string id="reference-window-"+std::to_string(++serial_);const bool valid=std::any_of(images.begin(),images.end(),[&](const auto& i){return i.id==imageId;});windows.push_back({id,valid?imageId:std::string{}, {}});return id;}
 void closeWindow(const std::string& id){windows.erase(std::remove_if(windows.begin(),windows.end(),[&](const auto& w){return w.id==id;}),windows.end());}
};
inline double referenceFit(double scale,double dpr=1){if(!std::isfinite(scale)||scale<=0)return 1;if(scale<=1)return scale;if(!std::isfinite(dpr)||dpr<=0)dpr=1;return std::max(1.,std::floor(scale*dpr+.000001)/dpr);}
inline double referenceZoomStep(double zoom,bool in){constexpr std::array<double,23> levels{{.0625,.083333,.125,.166667,.25,.333333,.5,.666667,1,2,3,4,5,6,8,10,12,16,20,24,32,48,64}};if(in){for(double level:levels)if(level>zoom+.000001)return level;return 64;}for(auto it=levels.rbegin();it!=levels.rend();++it)if(*it<zoom-.000001)return *it;return .0625;}
inline ReferencePoint referenceAnchoredPan(int width,int height,double viewportW,double viewportH,ReferencePoint pointer,ReferencePoint pan,double zoom,double nextZoom){const double ox=(viewportW-width*zoom)/2+pan.x,oy=(viewportH-height*zoom)/2+pan.y;return {pointer.x-(viewportW-width*nextZoom)/2-(pointer.x-ox)/zoom*nextZoom,pointer.y-(viewportH-height*nextZoom)/2-(pointer.y-oy)/zoom*nextZoom};}
inline std::optional<std::uint32_t> sampleReference(const ReferenceImage& image,double originX,double originY,double zoom,ReferencePoint p){if(zoom<=0)return {};double x=std::floor((p.x-originX)/zoom),y=std::floor((p.y-originY)/zoom);if(x<0||y<0||x>=image.width||y>=image.height)return {};return image.pixels->at(std::size_t(y)*image.width+std::size_t(x));}
}
