#pragma once
#include "extension_runtime.h"
#include <chrono>
#include <array>
namespace moon::extension {
inline constexpr const char* editorEventNames[]={"history.undo","history.redo","color.sampled","drawing.completed","fill.completed","document.changed","document.saved","project.created","project.opened","project.closed","project.activated","tool.changed","color.primary-changed","color.secondary-changed","selection.created","selection.cleared","layer.created","layer.deleted","layer.activated","frame.changed","animation.started","animation.stopped","view.changed"};
inline std::int64_t editorEventTime(){return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();}
inline RuntimeEvent editorEvent(std::string name,std::optional<std::string> projectId={},std::map<std::string,RuntimeEvent::DetailValue> detail={},std::int64_t timestamp=editorEventTime()){
 RuntimeEvent event;event.type="editor-event";event.name=std::move(name);event.projectId=std::move(projectId);event.detail=std::move(detail);event.timestamp=timestamp;return event;
}
inline void publishEditorEvent(const RuntimeRegistry& registry,std::string name,std::optional<std::string> projectId={},std::map<std::string,RuntimeEvent::DetailValue> detail={},std::int64_t timestamp=editorEventTime()){registry.broadcast(editorEvent(std::move(name),std::move(projectId),std::move(detail),timestamp));}
// Values only: no document, pixel, selection-mask or filesystem ownership.
// selectionIdentity is the legacy selection object's identity, not its bounds.
struct EditorProjectSnapshot {
 std::string id,tool,layer,frame,view;bool opened=false,playing=false;
 std::uint64_t revision=0;std::vector<std::string> layers;
 std::optional<std::uint64_t> selectionIdentity;
 std::array<int,4> primary{},secondary{};
};
struct EditorSnapshot {std::optional<std::string> activeId;std::vector<EditorProjectSnapshot> projects;};
inline std::vector<RuntimeEvent> changedEditorEvents(const EditorSnapshot& before,const EditorSnapshot& after,const std::function<std::int64_t()>& now=editorEventTime){
 std::vector<RuntimeEvent> result;auto add=[&](const char* name,const std::string& project,std::map<std::string,RuntimeEvent::DetailValue> detail={}){result.push_back(editorEvent(name,project,std::move(detail),now()));};
 if(after.activeId&&!after.activeId->empty()&&before.activeId!=after.activeId)add("project.activated",*after.activeId);
 for(const auto& old:before.projects)if(std::none_of(after.projects.begin(),after.projects.end(),[&](const auto& next){return next.id==old.id;}))add("project.closed",old.id);
 for(const auto& next:after.projects){auto found=std::find_if(before.projects.begin(),before.projects.end(),[&](const auto& old){return old.id==next.id;});if(found==before.projects.end()){add(next.opened?"project.opened":"project.created",next.id);continue;}const auto& old=*found;
  if(old.revision!=next.revision)add("document.changed",next.id,{{"revision",double(next.revision)}});
  if(old.tool!=next.tool)add("tool.changed",next.id,{{"tool",next.tool},{"previous",old.tool}});
  if(old.layer!=next.layer)add("layer.activated",next.id,{{"layerId",next.layer}});
  for(const auto& id:next.layers)if(std::find(old.layers.begin(),old.layers.end(),id)==old.layers.end())add("layer.created",next.id,{{"layerId",id}});
  for(const auto& id:old.layers)if(std::find(next.layers.begin(),next.layers.end(),id)==next.layers.end())add("layer.deleted",next.id,{{"layerId",id}});
  if(old.frame!=next.frame)add("frame.changed",next.id,{{"frameId",next.frame}});
  if(old.playing!=next.playing)add(next.playing?"animation.started":"animation.stopped",next.id);
  if(old.selectionIdentity!=next.selectionIdentity)add(next.selectionIdentity?"selection.created":"selection.cleared",next.id);
  if(old.primary!=next.primary)add("color.primary-changed",next.id);
  if(old.secondary!=next.secondary)add("color.secondary-changed",next.id);
  if(old.view!=next.view)add("view.changed",next.id);
 }return result;
}
// Each extension subscription captures its own baseline; events before load are
// intentionally dropped by EventLifecycle, as in the legacy host.
class EditorEventSubscription {
 EditorSnapshot previous_;std::function<void(const RuntimeEvent&)> send_;
public:
 EditorEventSubscription(EditorSnapshot initial,std::function<void(const RuntimeEvent&)> send):previous_(std::move(initial)),send_(std::move(send)){}
 void changed(EditorSnapshot next,const std::function<std::int64_t()>& now=editorEventTime){auto events=changedEditorEvents(previous_,next,now);previous_=std::move(next);for(const auto& event:events)send_(event);}
};
}
