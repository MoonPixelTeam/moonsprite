#pragma once
#include "ui/entry.h"
#include "ui/property.h"
#include <functional>
#include <memory>
#include <vector>
namespace moon {
// Legacy input history is supplied by the browser. Keep this native adapter
// owned by the existing MIT Component property lifetime, never by the document.
class EntryEditHistory final : public ui::Property {
public:
 static constexpr const char* propertyName="moonsprite.input-edit-history";
 // The pinned Entry setter adapter clears history on application-driven
 // value changes. Identical controlled refreshes retain it; active edits and
 // Undo transactions bypass external-change detection.
 class Active {
  ui::Entry& input_;ui::PropertyPtr previous_;
 public:
  explicit Active(ui::Entry& input):input_(input),previous_(input.getProperty("moonsprite.input-edit-history-active")){input_.setProperty(std::make_shared<ui::Property>("moonsprite.input-edit-history-active"));}
  ~Active(){if(previous_)input_.setProperty(previous_);else input_.removeProperty("moonsprite.input-edit-history-active");}
 };
 struct State {std::string text;int anchor=0,caret=0,scroll=0;};
 struct Edit {State before,after;int kind=0;};
 std::vector<Edit> undo,redo;int group=0;std::string observed;
 explicit EntryEditHistory(const std::string& text):ui::Property(propertyName),observed(text){}
 static std::shared_ptr<EntryEditHistory> get(ui::Entry& input){
  auto history=std::dynamic_pointer_cast<EntryEditHistory>(input.getProperty(propertyName));
  if(!history){history=std::make_shared<EntryEditHistory>(input.text());input.setProperty(history);}
  history->sync(input);return history;
 }
 void sync(const ui::Entry& input){if(observed!=input.text()){undo.clear();redo.clear();group=0;observed=input.text();}}
 static State state(ui::Entry& input){
  State out;out.text=input.text();out.caret=input.caretPos();out.anchor=out.caret;
  const auto range=input.selectedRange();if(!range.isEmpty()&&!input.selectedText().empty())out.anchor=out.caret==range.from?range.to:range.from;
  input.getEntryThemeInfo(&out.scroll,nullptr,nullptr,nullptr);return out;
 }
 void record(const State& before,const State& after,int kind){
  // Replacing a selection with identical text still has a browser Undo step:
  // it restores that selection. Copy/failed edits leave both states unchanged.
  if(before.text==after.text&&before.anchor==after.anchor&&before.caret==after.caret)return;
  if(kind&&kind==group&&!undo.empty()&&undo.back().kind==kind&&
     undo.back().after.text==before.text&&undo.back().after.caret==before.caret&&before.anchor==before.caret)
   undo.back().after=after;
  else undo.push_back({before,after,kind});
  redo.clear();group=kind;observed=after.text;
 }
 bool restore(ui::Entry& input,bool forward,const std::function<void()>& notify){
  sync(input);group=0;if(!input.isEnabled()||input.isReadOnly())return false;
  auto& from=forward?redo:undo;auto& to=forward?undo:redo;if(from.empty())return false;
  Active active(input);
  auto edit=std::move(from.back());from.pop_back();const auto target=forward?edit.after:edit.before;
  const bool changed=input.text()!=target.text;
  input.setText(target.text);input.setCaretPos(input.lastCaretPos());input.setCaretPos(target.scroll);input.selectText(target.anchor,target.caret);
  observed=input.text();to.push_back(std::move(edit));if(changed)notify();sync(input);return true;
 }
 class Record {
  ui::Entry& input_;std::shared_ptr<EntryEditHistory> history_;State before_;int kind_;Active active_;
 public:
  Record(ui::Entry& input,int kind):input_(input),history_(get(input)),before_(state(input)),kind_(kind),active_(input){}
  ~Record(){history_->record(before_,state(input_),kind_);}
  Record(const Record&)=delete;Record& operator=(const Record&)=delete;
 };
};
}
