#pragma once
#include "history_change.h"
#include <functional>
#include <cstdint>
#include <exception>
#include <memory>
#include <utility>
#include <optional>
#include <string>
#include <vector>

namespace moon {
class Document;
// Logical session selection values have no widget or display coordinates.
// Their live owner remains the session; history stores immutable snapshots.
struct AnimationCellSlot {
 std::string rowId,frameId;
 bool operator==(const AnimationCellSlot& other)const{return rowId==other.rowId&&frameId==other.frameId;}
};
struct AnimationSessionSelection {
 using MaskSlot=std::pair<std::string,std::string>;
 std::vector<MaskSlot> masks;
 std::optional<MaskSlot> maskAnchor;
 std::vector<AnimationCellSlot> groups;
 std::optional<AnimationCellSlot> groupAnchor;
 bool frameSelection=false;
};
enum class AnimationFrameOrigin { Manual, Playback };
struct AnimationChange {
  enum class Kind { FrameSelected, LoopChanged, HistoryChanged, MaskSelectionChanged, FloatingSettled, SelectionPreviewChanged };
  Kind kind;
  AnimationFrameOrigin origin=AnimationFrameOrigin::Manual;
  HistoryStackChange::Kind historyKind=HistoryStackChange::Kind::Push;
  bool selectionProjectionDeferred=false;
};

// Runtime observation belongs to a live document, never a clone/checkpoint.
// History replay emits only its final HistoryChanged notification: intermediate
// cel activation must not look like a manual playback retarget.
class AnimationChangeBinding {
public:
  using Observer=std::function<void(const Document&,const AnimationChange&)>;
  struct SelectionAccess {
   std::function<std::optional<AnimationSessionSelection>(const Document&)> capture;
   std::function<void(const Document&,AnimationSessionSelection)> restore;
  };
  AnimationChangeBinding()=default;
  AnimationChangeBinding(const AnimationChangeBinding&) {}
  AnimationChangeBinding& operator=(const AnimationChangeBinding&){observer_.reset();selectionAccess_.reset();replayDepth_=0;selectionPreviewDepth_=0;selectionProjectionPending_=false;return *this;}
  AnimationChangeBinding(AnimationChangeBinding&&)=default;
  AnimationChangeBinding& operator=(AnimationChangeBinding&&)=default;
  void set(Observer observer){observer_=observer?std::make_shared<const Observer>(std::move(observer)):nullptr;}
  void setSelectionAccess(SelectionAccess access){selectionAccess_=std::make_shared<const SelectionAccess>(std::move(access));}
  std::optional<AnimationSessionSelection> captureSessionSelection(const Document& document)const{
   const auto access=selectionAccess_;return access&&access->capture?access->capture(document):std::nullopt;
  }
  void restoreSessionSelection(const Document& document,AnimationSessionSelection value)const{
   const auto access=selectionAccess_;if(access&&access->restore)access->restore(document,std::move(value));
  }
  void publish(const Document& document,AnimationChange change)const{
    if(replayDepth_)return;
    if(selectionPreviewDepth_){
      change.selectionProjectionDeferred=true;
      if(change.kind==AnimationChange::Kind::FloatingSettled||change.kind==AnimationChange::Kind::SelectionPreviewChanged||
         (change.kind==AnimationChange::Kind::HistoryChanged&&(change.historyKind==HistoryStackChange::Kind::Undo||change.historyKind==HistoryStackChange::Kind::Redo)))selectionProjectionPending_=true;
      if(change.kind==AnimationChange::Kind::SelectionPreviewChanged)return;
    }
    const auto observer=observer_;
    if(observer)(*observer)(document,change);
  }
  class ReplayScope {
  public:
    explicit ReplayScope(AnimationChangeBinding& binding):binding_(binding){++binding_.replayDepth_;}
    ~ReplayScope(){--binding_.replayDepth_;}
    ReplayScope(const ReplayScope&)=delete;
    ReplayScope& operator=(const ReplayScope&)=delete;
  private:
    AnimationChangeBinding& binding_;
  };
  ReplayScope replayHistory(){return ReplayScope(*this);}
  // A script may temporarily detach floating content to edit stable pixels.
  // Only selection projection is deferred; history events remain observable.
  class SelectionPreviewScope {
  public:
    explicit SelectionPreviewScope(AnimationChangeBinding& binding,bool enabled):binding_(enabled?&binding:nullptr){if(binding_)++binding_->selectionPreviewDepth_;}
    ~SelectionPreviewScope(){if(binding_&&!--binding_->selectionPreviewDepth_)binding_->selectionProjectionPending_=false;}
    SelectionPreviewScope(const SelectionPreviewScope&)=delete;
    SelectionPreviewScope& operator=(const SelectionPreviewScope&)=delete;
  private:
    AnimationChangeBinding* binding_;
  };
  SelectionPreviewScope deferSelectionPreview(bool enabled=true){return SelectionPreviewScope(*this,enabled);}
  // Nested document operations expose their final selection once, after all
  // history callbacks and floating settlement. History itself stays observable.
  class SelectionOperationScope {
  public:
    SelectionOperationScope(AnimationChangeBinding& binding,const Document& document,const std::uint64_t& revision,bool force):binding_(binding),document_(document),revision_(revision),before_(revision),exceptions_(std::uncaught_exceptions()){
      ++binding_.selectionPreviewDepth_;binding_.selectionProjectionPending_|=force;
    }
    ~SelectionOperationScope()noexcept(false){
      if(std::uncaught_exceptions()>exceptions_){try{close();}catch(...){/* Preserve the operation's original failure. */}}
      else close();
    }
    SelectionOperationScope(const SelectionOperationScope&)=delete;
    SelectionOperationScope& operator=(const SelectionOperationScope&)=delete;
  private:
    void close(){
      binding_.selectionProjectionPending_|=revision_!=before_;
      if(!--binding_.selectionPreviewDepth_){
        const bool pending=std::exchange(binding_.selectionProjectionPending_,false);
        if(pending)binding_.publish(document_,{AnimationChange::Kind::SelectionPreviewChanged});
      }
    }
    AnimationChangeBinding& binding_;
    const Document& document_;
    const std::uint64_t& revision_;
    std::uint64_t before_;
    int exceptions_;
  };
  SelectionOperationScope selectionOperation(const Document& document,const std::uint64_t& revision,bool force=false){return SelectionOperationScope(*this,document,revision,force);}
private:
  std::shared_ptr<const Observer> observer_;
  std::shared_ptr<const SelectionAccess> selectionAccess_;
  unsigned replayDepth_=0;
  unsigned selectionPreviewDepth_=0;
  mutable bool selectionProjectionPending_=false;
};
}
