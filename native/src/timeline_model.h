#pragma once
#include <cstdint>
#include <cstddef>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace moon {class Document;}
namespace moon::timeline {
using Pixel=std::uint32_t; // Legacy packed RGBA: red in the low byte.
struct Layer {
  std::string id;
  std::u32string name;
  bool visible=true,locked=false;
  double opacity=1;
  bool autoLinkAnimationCels=false;
};
struct Frame {std::string id;int duration=100;bool disabled=false;};
struct Surface {
  int width=0,height=0,offsetX=0,offsetY=0;
  std::optional<int> storageOriginX,storageOriginY;
  std::vector<Pixel> pixels;
};
struct Cel {
  std::string id,layerId,frameId;
  std::optional<std::string> linkedCelId;
  // Legacy deletion clears link IDs but retains shared surface objects until serialization.
  std::optional<std::string> runtimeSharedCelId;
  std::optional<double> opacity;
  int zIndex=0;
  std::optional<Surface> surface;
};
struct LoopSection {std::string id;std::u32string name;std::string startFrameId,endFrameId,direction="forward";std::optional<int> repeatCount;};
struct State {std::vector<Layer> layers;std::vector<Frame> frames;std::vector<Cel> cels;std::vector<LoopSection> loopSections;};
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
  Timeline()=default;
  explicit Timeline(State state);
  // Deep value copy: pixels are independent between timelines; links retain IDs
  // and resolve to the copied timeline's own source. No cached raw pointers.
  Timeline(const Timeline&)=default;
  Timeline& operator=(const Timeline&)=default;
  Timeline(Timeline&&) noexcept=default;
  Timeline& operator=(Timeline&&) noexcept=default;
  const State& state() const {return state_;}
  const Cel* findCel(const std::string& layerId,const std::string& frameId) const;
  const Cel* findCelById(const std::string& celId) const;
  Resolution resolveSurface(const std::string& celId) const;
  std::vector<LinkDiagnostic> diagnoseLinks() const;
  void addLayer(Layer layer);
  void addFrame(Frame frame);
  void addCel(Cel cel);
  PixelChange setPixel(const std::string& celId,std::size_t localIndex,Pixel color);
private:
  friend class ::moon::Document;
  // Document resolves once at transaction start. The borrowed storage is valid
  // only until a structural mutation; UI/extensions cannot access this entry.
  Surface* mutableOwnedSurface(const std::string& ownerCelId);
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
  void buildIndex();
  void checkCel(const Cel& cel) const;
  CachedResolution resolveIndex(const std::string& celId) const;
};
}
