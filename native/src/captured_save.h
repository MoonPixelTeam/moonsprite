#pragma once
#include "document_snapshot.h"
#include "image_save.h"
#include "project_encode.h"
#include "project_file.h"
#include "timelapse_images.h"

namespace moon::workspace {
// Frozen inputs for the worker. No active tab, controls or live Document are
// consulted after snapshot ownership has transferred from the UI thread.
struct CapturedSaveRequest {
 std::filesystem::path path;
 SaveImageFormat format=SaveImageFormat::Native;
 bool portableTimelapse=false;
 int scale=100;
 project::BackupPolicy backup{false,10,30,{}};
};
struct CapturedSaveOperations {
 project::EncodedProject native(Document& document,const CapturedSaveRequest& request){
  project::saveDocumentAtomic(document,request.path,request.backup);
  return {document.sourceArchive(),document.projectId()};
 }
 std::vector<std::uint8_t> image(const Document& document,const CapturedSaveRequest& request){
  return encodeSaveImage(document,request.format,request.scale);
 }
 void write(const CapturedSaveRequest& request,const std::vector<std::uint8_t>& bytes){
  writeExportBytesAtomic(request.path,bytes);
 }
};
// Operations are the existing codec/commit boundaries. Tests can reject those
// operations without adding global hooks or constructing the workspace. The
// same function executes in the application's real asynchronous worker.
template<class Operations=CapturedSaveOperations>
project::EncodedProject runCapturedSave(DocumentSnapshot snapshot,const CapturedSaveRequest& request,
                                       const timelapse::Reader& reader={},Operations operations={}){
 auto copy=snapshot.finish();
 if(request.portableTimelapse){
  auto settings=copy.timelapseSettings();
  for(auto& frame:settings.snapshots){
   if(reader){frame.data=reader(frame);frame.historyDataBacking.reset();}
   else if(frame.data.empty())throw std::runtime_error("Cannot carry unavailable recording frames");
   frame.local.reset();
  }
  copy.setImportedTimelapse(std::move(settings));
 }
 if(request.format!=SaveImageFormat::Native){
  auto bytes=operations.image(copy,request);
  operations.write(request,bytes);
  return {};
 }
 return operations.native(copy,request);
}
}
