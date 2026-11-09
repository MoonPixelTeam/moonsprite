#pragma once
#include "extension_request_host.h"
namespace moon::extension {
inline RuntimeEvent projectEvent(const std::optional<ProjectSummary>& project,bool homeOpen){RuntimeEvent event;event.type="project";event.homeOpen=homeOpen;if(project)event.payload=javascriptJsonUtf8(projectSnapshot(*project).Stringify().c_str());return event;}
// React effect dependencies intentionally omit dimensions/counts: callers must
// advance contentRevision for content changes, exactly as in the legacy host.
class ProjectEventSubscription {
 std::optional<ProjectSummary> previous_;bool homeOpen_=false,initialized_=false;
 std::function<void(const RuntimeEvent&)> send_;
 static bool same(const std::optional<ProjectSummary>& a,const std::optional<ProjectSummary>& b){if(bool(a)!=bool(b))return false;return !a||(a->id==b->id&&a->name==b->name&&a->contentRevision==b->contentRevision&&a->dirty==b->dirty);}
public:
 explicit ProjectEventSubscription(std::function<void(const RuntimeEvent&)> send):send_(std::move(send)){}
 void changed(std::optional<ProjectSummary> project,bool homeOpen){
  if(initialized_&&homeOpen_==homeOpen&&same(previous_,project))return;
  const bool saved=previous_&&previous_->dirty&&project&&!project->dirty;
  previous_=project;homeOpen_=homeOpen;initialized_=true;
  send_(projectEvent(project,homeOpen));if(saved){RuntimeEvent event;event.type="document-saved";event.projectId=winrt::to_string(project->id);send_(event);}
 }
};
}
