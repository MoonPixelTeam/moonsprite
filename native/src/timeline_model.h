#pragma once
#include "text_cel_data.h"
#include "free_tile_data.h"
#include "gradient_map.h"
#include "tilemap_data.h"
#include "linked_pixel_storage.h"
#include <cstdint>
#include <cmath>
#include <limits>
#include <cstddef>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>
#include <memory>
#include "selection_model.h"

namespace moon {class Document;}
namespace moon::timeline {
struct SelectionCacheEntry;
struct SelectionCacheStats {std::uint64_t builds=0,hits=0,evictions=0;std::size_t bytes=0,entries=0;};
SelectionCacheStats celSelectionCacheStats();
using Pixel=std::uint32_t; // Legacy packed RGBA: red in the low byte.
struct BackgroundSettings {std::string mode="canvas",pattern;int repeatWidth=0,repeatHeight=0;};
// legacy core/layer-styles.ts: global visibility retains the configured effect.
struct StrokeStyle {bool enabled=false;Pixel color=0xff000000;int size=1,position=1,kernel=0;unsigned directions=0x5a;bool smartHue=false,followOpacity=false;int darkness=45;};
struct ShadowStyle {bool enabled=false;Pixel color=0xa0000000;int offsetX=2,offsetY=2,blur=0;bool smart=false;int darkness=45;};
struct InnerGlowStyle {bool enabled=false;Pixel color=0xc0ffffff;int size=2;};
struct ColorOverlayStyle {GradientMapSettings gradientMap;bool gradientMapEnabled=false;StrokeStyle stroke;ShadowStyle shadow;InnerGlowStyle innerGlow;bool enabled=true,overlayEnabled=false;std::uint32_t color=0xffff7929;bool gradientEnabled=false;std::uint32_t gradientFrom=0xff000000,gradientTo=0xffffffff;int gradientAngle=0,gradientDither=0;std::string preservedJson;};
inline std::string styleSignature(const std::optional<ColorOverlayStyle>& s){return s?gradientMapSignature(s->gradientMap)+":"+std::to_string(s->gradientMapEnabled)+":"+std::to_string(s->enabled)+":"+std::to_string(s->overlayEnabled)+":"+std::to_string(s->color)+":"+std::to_string(s->gradientEnabled)+":"+std::to_string(s->gradientFrom)+":"+std::to_string(s->gradientTo)+":"+std::to_string(s->gradientAngle)+":"+std::to_string(s->gradientDither)+":"+std::to_string(s->stroke.enabled)+":"+std::to_string(s->stroke.color)+":"+std::to_string(s->stroke.size)+":"+std::to_string(s->stroke.position)+":"+std::to_string(s->stroke.kernel)+":"+std::to_string(s->stroke.directions)+":"+std::to_string(s->stroke.smartHue)+":"+std::to_string(s->stroke.followOpacity)+":"+std::to_string(s->stroke.darkness)+":"+std::to_string(s->shadow.enabled)+":"+std::to_string(s->shadow.color)+":"+std::to_string(s->shadow.offsetX)+":"+std::to_string(s->shadow.offsetY)+":"+std::to_string(s->shadow.blur)+":"+std::to_string(s->shadow.smart)+":"+std::to_string(s->shadow.darkness)+":"+std::to_string(s->innerGlow.enabled)+":"+std::to_string(s->innerGlow.color)+":"+std::to_string(s->innerGlow.size)+s->preservedJson:"";}
inline bool styleConfigured(const std::optional<ColorOverlayStyle>& s){return s&&(s->gradientMapEnabled||s->overlayEnabled||s->gradientEnabled||s->stroke.enabled||s->shadow.enabled||s->innerGlow.enabled);}
inline bool styleVisible(const std::optional<ColorOverlayStyle>& s){return s&&s->enabled&&styleConfigured(s);}
inline std::uint32_t applyColorOverlay(std::uint32_t p,const std::optional<ColorOverlayStyle>& s){if(!(p>>24)||!s||!s->enabled||!s->overlayEnabled)return p;const double a=(s->color>>24)/255.;auto out=p&0xff000000;for(int shift:{0,8,16})out|=std::uint32_t(std::floor(((p>>shift)&255)+double(int((s->color>>shift)&255)-int((p>>shift)&255))*a+.5))<<shift;return out;}
// legacy gradientColorAt / gradientColorForAmount: world-aligned dither,
// transparent endpoint RGB normalization, and an alpha-preserving overlay.
inline Pixel applyGradientOverlay(Pixel p,const std::optional<ColorOverlayStyle>& s,int x,int y,int gx,int gy,int width,int height,Pixel* effect=nullptr){if(!(p>>24)||!s||!s->enabled||!s->gradientEnabled)return p;const double lx=width<=1?.5:double(x-gx)/(width-1),ly=height<=1?.5:double(y-gy)/(height-1),angle=s->gradientAngle*3.14159265358979323846/180.,c=std::cos(angle),n=std::sin(angle),extent=std::max(std::numeric_limits<double>::epsilon(),(std::abs(c)+std::abs(n))/2),t=std::clamp(.5+((lx-.5)*c+(ly-.5)*n)/(2*extent),0.,1.);Pixel a=s->gradientFrom,b=s->gradientTo;if(!(a>>24)&&(b>>24))a=(a&0xff000000)|(b&0xffffff);if((a>>24)&&!(b>>24))b=(b&0xff000000)|(a&0xffffff);const auto color=s->gradientDither?(t>=(gradientDitherStage(s->gradientDither,x,y)+.5)/gradientDitherCount(s->gradientDither)?b:a):gradientInterpolate(a,b,t);if(effect)*effect=color;ColorOverlayStyle overlay;overlay.overlayEnabled=true;overlay.color=color;return applyColorOverlay(p,overlay);}
struct LayerAdjustment {bool enabled=true;GradientMapSettings gradientMap;};
inline std::string adjustmentSignature(const std::optional<LayerAdjustment>& a){return a?(a->enabled?"1":"0")+gradientMapSignature(a->gradientMap):"";}
struct Layer {
  std::string id;
  std::u32string name;
  bool visible=true,locked=false;
  double opacity=1;
  bool autoLinkAnimationCels=false;
  std::string blendMode="normal";std::optional<Pixel> displayColor;std::u32string description;
  std::optional<std::string> groupId;
  std::optional<BackgroundSettings> background;
  std::string kind;
  std::string linkedContentId;
  bool clippingMask=false;
  std::optional<ColorOverlayStyle> layerStyles;
  std::string tilemapTilesetId;
  std::optional<LayerAdjustment> adjustment;
  std::optional<free_tiles::LayerData> freeTiles;
};
struct Group {
  std::string id;std::u32string name;std::optional<std::string> parentGroupId;
  bool visible=true,locked=false;double opacity=1;std::string blendMode="normal";
  std::optional<double> panelOrder;std::optional<Pixel> displayColor;std::u32string description;
  bool clippingMask=false;
  std::optional<ColorOverlayStyle> layerStyles;
};
struct Frame {std::string id;int duration=100;bool disabled=false;};
struct Surface {
  int width=0,height=0,offsetX=0,offsetY=0;
  std::optional<int> storageOriginX,storageOriginY;
  LinkedPixelStorage pixels;
};
struct AttachedMask {std::string id,linkedMaskId;bool visible=true,locked=false,autoLinkAnimationCels=false,moveWithOwner=true;Surface surface;};
struct MaskSlot {std::string ownerId,frameId;bool group=false;AttachedMask mask;};
const MaskSlot* directMask(const struct State&,const std::string&,const std::string&);
const AttachedMask* resolvedMask(const struct State&,const std::string&,const std::string&);
void validateMasks(const struct State&);
unsigned maskCoverage(Pixel);
Pixel normalizedMaskPixel(Pixel);
void applyAttachedMask(const AttachedMask*,std::vector<Pixel>&,int x,int y,int w,int h);
struct Cel {
  std::string id,layerId,frameId;
  std::optional<std::string> linkedCelId;
  // Legacy deletion clears link IDs but retains shared surface objects until serialization.
  std::optional<std::string> runtimeSharedCelId;
  std::optional<double> opacity;
  int zIndex=0;
  std::optional<Surface> surface;
  std::optional<TextCelData> text;
  std::optional<tiles::CelData> tilemap;
  std::optional<free_tiles::CelData> freeTiles;
};
struct LoopSection {std::string id;std::u32string name;std::string startFrameId,endFrameId,direction="forward";std::optional<int> repeatCount;};
struct State {std::vector<Layer> layers;std::vector<Frame> frames;std::vector<Cel> cels;std::vector<LoopSection> loopSections;std::vector<Group> groups;std::vector<MaskSlot> masks;std::vector<tiles::Tileset> tilesets;mutable int canvasWidth=0,canvasHeight=0;};
bool isGroupEffectivelyVisible(const State&,const Group&);
bool isGroupEffectivelyLocked(const State&,const Group&);
bool isLayerEffectivelyVisible(const State&,const Layer&);
bool isLayerEffectivelyLocked(const State&,const Layer&);
struct LoopRange {int start=-1,end=-1;};
struct LoopSectionLayoutItem {std::string id;int startIndex=0,span=0,lane=0,laneSpan=1;};
struct LoopSectionLayout {std::vector<LoopSectionLayoutItem> items;int laneCount=0;};
struct LoopSectionPreview {std::string id;int startIndex=0,endIndex=0;};
LoopSectionLayout layoutLoopSections(const State& state,const std::optional<LoopSectionPreview>& preview={});
int loopResizeFrameIndex(double pointer,double firstFrame,double frameWidth,int frameCount,bool startEdge);

struct LoopPlaybackContext {std::string sectionId;int iteration=0;std::optional<int> position;};
struct LoopPlayback {LoopPlaybackContext current;std::vector<LoopPlaybackContext> stack;bool repeatIndefinitely=false;};
struct LoopStep {std::string frameId;bool completed=false;};
LoopStep advanceLoopPlayback(const State& state,LoopPlayback& playback,const std::string& frameId);
LoopRange loopRange(const State& state,const LoopSection& section);
const LoopSection* loopAtFrame(const State& state,const std::string& frameId);
std::string stepFrameId(const State& state,const std::string& frameId,int direction,bool tagMode,bool skipDisabled=true);
std::vector<std::string> loopPlaybackFrames(const State& state,const LoopSection& section);
std::vector<LoopSection> reconcileLoopsReorder(const State& previous,const std::vector<Frame>& remaining,const std::vector<Frame>& reordered,const std::vector<std::string>& moving,int insertion,int dropSide);

std::vector<std::size_t> compositeLayerOrder(const class Timeline&,const std::string& frame);

enum class LinkIssue {None,UnknownCel,MissingTarget,CrossLayer,Cycle};
struct Resolution {
  const Cel* source=nullptr;
  const Surface* surface=nullptr;
  LinkIssue issue=LinkIssue::None;
  std::string offendingId;
};
struct LinkDiagnostic {std::string celId;LinkIssue issue;std::string offendingId;};
struct PixelChange {
  std::string sourceCelId;
  std::size_t index=0;
  Pixel before=0,after=0;
  LinkIssue linkIssue=LinkIssue::None;
  bool changed() const {return before!=after;}
};

// RGBA subset only. IDs come from the application/importer; no ID generation,
// active-session state, history, dirty flags, or file I/O lives in this model.
class Timeline {
public:
  std::string linkedStorageKey(const std::string& celId)const;
  bool hasLinkedLayers()const;void synchronizeLinkedLayers(const std::string& preferredOwner={});
  Timeline()=default;
  explicit Timeline(State state);
  // Deep value copy: pixels are independent between timelines; links retain IDs
  // and resolve to the copied timeline's own source. No cached raw pointers.
  Timeline(const Timeline& other);
  Timeline& operator=(const Timeline& other);
  Timeline(Timeline&&) noexcept=default;
  Timeline& operator=(Timeline&&) noexcept=default;
  const State& state() const {return state_;}
  const Cel* findCel(const std::string& layerId,const std::string& frameId) const;
  const Cel* findCelById(const std::string& celId) const;
  bool hasFrame(const std::string& frameId) const {return frames_.count(frameId)!=0;}
  bool hasLayer(const std::string& layerId) const {return layers_.count(layerId)!=0;}
  std::size_t layerIndex(const std::string& id) const {return layers_.at(id);}
  std::size_t frameIndex(const std::string& id) const {return frames_.at(id);}
  // Cache by resolved owner. Callers with a retained mutable surface (live
  // strokes) bypass caching until their transaction ends.
  bool hasVisiblePixels(const std::string& celId,bool cache=true) const;
  // Read an existing summary without scanning or caching borrowed live pixels.
  std::optional<SelectionMask> contentSelection(const std::string& celId,int canvasWidth,int canvasHeight,bool cache=true) const;
  bool isKnownEmpty(const std::string& celId) const;
  std::uint64_t contentScans() const {return contentScans_;}
  Resolution resolveSurface(const std::string& celId) const;
  struct StorageStamp {std::shared_ptr<const void> owner;std::uint64_t revision=0;};
  StorageStamp thumbnailStorage(const std::string& celId) const;
  std::vector<LinkDiagnostic> diagnoseLinks() const;
  void addLayer(Layer layer);
  void addFrame(Frame frame);
  void addCel(Cel cel);
  PixelChange setPixel(const std::string& celId,std::size_t localIndex,Pixel color);
private:
  mutable std::unordered_map<std::string,std::weak_ptr<SelectionCacheEntry>> selectionContent_;
  mutable std::unordered_map<std::string,bool> visibleContent_;
  mutable std::unordered_map<std::string,StorageStamp> thumbnailStorage_;
  mutable std::uint64_t contentScans_=0;
  friend class ::moon::Document;
  // Document resolves once at transaction start. The borrowed storage is valid
  // only until a structural mutation; UI/extensions cannot access this entry.
  Surface* mutableOwnedSurface(const std::string& ownerCelId);
  std::string linkedDirtyOwner_;
  State state_;
  std::unordered_map<std::string,std::size_t> layers_,frames_,cels_;
  // Structured pair key preserves arbitrary IDs containing ':' or '|'.
  struct SlotHash {
    std::size_t operator()(const std::pair<std::string,std::string>& slot) const {
      const auto a=std::hash<std::string>{}(slot.first),b=std::hash<std::string>{}(slot.second);
      return a^(b+std::size_t(0x9e3779b9)+(a<<6)+(a>>2));
    }
  };
  std::unordered_map<std::pair<std::string,std::string>,std::size_t,SlotHash> slots_;
  struct CachedResolution {std::size_t index;LinkIssue issue;std::string offendingId;};
  mutable std::unordered_map<std::string,CachedResolution> resolved_;
  void invalidateCompositeOrder() {compositeOrder_.clear();compositeOrderBytes_=0;}
  mutable std::unordered_map<std::string,std::vector<std::size_t>> compositeOrder_;
  mutable std::size_t compositeOrderBytes_=0;
  friend std::vector<std::size_t> compositeLayerOrder(const Timeline&,const std::string&);
  void buildIndex();
  void checkCel(const Cel& cel) const;
  CachedResolution resolveIndex(const std::string& celId) const;
};
}
