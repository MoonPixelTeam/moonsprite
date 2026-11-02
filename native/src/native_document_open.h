#pragma once
#include "ui/widget.h"
#include "ui/message.h"
#include "os/dnd.h"
#include "os/window.h"
namespace moon {
// Legacy useAppDocumentIO sends second-instance files through its shared drop
// service without a physical drop position. Reuse the native document router.
inline bool dispatchNativeDocumentPaths(ui::Widget& editor,os::Window* window,const std::vector<std::string>& paths){
 class Paths final:public os::DragDataProvider{
  base::paths paths_;
 public:explicit Paths(base::paths paths):paths_(std::move(paths)){}base::paths getPaths()override{return paths_;}os::SurfaceRef getImage()override{return {};}std::string getUrl()override{return {};}bool contains(os::DragDataItemType type)override{return type==os::DragDataItemType::Paths;}
 };
 os::DragEvent event(window,os::DropOperation::Copy,{-1,-1},std::make_unique<Paths>(paths));ui::DropMessage message(event);editor.sendMessage(&message);return event.acceptDrop();
}
}
