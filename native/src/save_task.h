#pragma once
#include "document_snapshot.h"
#include <chrono>
#include <filesystem>
#include <future>
#include <optional>
#include <stdexcept>
#include <utility>

namespace moon::workspace {
// The existing native save acknowledgement checks, shared by foreground and
// background jobs. Identity is checked separately before accepting any bytes.
struct SaveVersion {
  std::uint64_t identity=0,revision=0,contentRevision=0;
  SymmetryCenter symmetry;
  LayerPanelState panel;

  static SaveVersion capture(const Document& document) {
    return {document.identity(),document.revision(),document.contentRevision(),
            document.symmetryCenter(),document.layerPanelState()};
  }
  bool matches(const Document& document) const {
    const auto center=document.symmetryCenter();
    return document.identity()==identity&&document.revision()==revision&&
      document.contentRevision()==contentRevision&&center.x==symmetry.x&&
      center.y==symmetry.y&&document.layerPanelState()==panel&&!document.active();
  }
};

// A save must finish its write and report failure. Unlike a disposable preview,
// moving a job to the background transfers the complete capture/worker owner.
// Result is supplied by the existing encoder; this service has no codec or UI.
template<class Result> struct SaveTask {
  SaveVersion version;
  std::filesystem::path path;
  bool image=false,sourceOnly=false,portableTimelapse=false;
  int scale=100;
  std::chrono::steady_clock::time_point started;
  std::optional<DocumentSnapshot> snapshot;
  std::future<Result> worker;

  SaveTask()=default;
  SaveTask(SaveTask&&)=default;
  SaveTask& operator=(SaveTask&&)=default;
  SaveTask(const SaveTask&)=delete;
  SaveTask& operator=(const SaveTask&)=delete;

  void begin(const Document& document,const std::filesystem::path& destination,
             bool isImage,bool source,bool portable,int requestedScale) {
    if(snapshot||worker.valid())throw std::logic_error("Save job is still owned");
    SaveTask next;
    next.version=SaveVersion::capture(document);
    next.path=destination;next.image=isImage;next.sourceOnly=isImage&&source;
    next.portableTimelapse=portable;next.scale=requestedScale;
    next.started=std::chrono::steady_clock::now();
    next.snapshot.emplace(document);
    *this=std::move(next);
  }
  bool ready() const {
    return worker.valid()&&worker.wait_for(std::chrono::milliseconds(0))==std::future_status::ready;
  }
};

// Inject the existing image acknowledgement so the application service does
// not import image encoders. Native bytes always go through Document itself.
template<class Result,class AcceptImage>
bool acceptSaveResult(Document& document,std::filesystem::path& savedPath,
                      const SaveTask<Result>& job,Result result,
                      const AcceptImage& acceptImage) {
  if(document.identity()!=job.version.identity)
    throw std::runtime_error("Document changed during save");
  const bool exact=job.version.matches(document);
  // Allocate the target before acknowledgement can clear dirty or change the
  // document identity. Publication after successful acceptance is nonthrowing.
  auto nextPath=job.image&&job.sourceOnly?std::filesystem::path{}:job.path;
  if(job.image){
    acceptImage(document,job.path,job.sourceOnly,exact);
    if(!job.sourceOnly)savedPath.swap(nextPath);
  }else{
    document.acceptSaved(std::move(result.projectId),std::move(result.bytes),exact);
    savedPath.swap(nextPath);
  }
  return exact;
}
}
