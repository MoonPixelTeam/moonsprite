#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#ifdef GetObject
#undef GetObject
#endif
#include <set>
#include "extension_runtime.h"
#include "extension_editor_events.h"
#include "pattern_brush_library.h"
#include "ui/property.h"
#include "ui/widget.h"
#include "ui/message.h"
#include "os/dnd.h"
#include "os/window.h"
namespace moon {
// Attach the extension services to the existing native widget lifetime, as the
// canvas sampling adapter does. No Editor public-header dependency on the VM.
struct NativeExtensionBridge final:ui::Property {
 static constexpr const char* name="moon.native-extension-services";
 std::function<bool(const std::string&)> accepts;
 std::function<void(std::vector<std::string>,std::function<void(std::vector<std::string>)>)> route;
 std::function<void(const extension::RuntimeEvent&)> publish;
 std::map<std::string,std::int64_t> recent;std::uint64_t exportIdentity=0;ui::Message* replaying=nullptr;bool active=true;
 NativeExtensionBridge():ui::Property(name){}
 std::vector<std::string> fresh(const std::vector<std::string>& paths,std::int64_t now,bool remember){
  for(auto it=recent.begin();it!=recent.end();)if(now-it->second>=1000)it=recent.erase(it);else ++it;std::set<std::string> seen;std::vector<std::string> result;
  for(const auto& raw:paths){auto path=PatternBrushDropPaths::normalize(raw);if(path.empty()||(!PatternBrushDropPaths::supported(path)&&(!accepts||!accepts(path))))continue;
   auto wide=std::filesystem::u8path(path).wstring();const int size=LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,wide.data(),int(wide.size()),nullptr,0,nullptr,nullptr,0);if(!size)throw std::runtime_error("Cannot compare dropped file paths");std::wstring folded(size,wchar_t(0));if(!LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,wide.data(),int(wide.size()),folded.data(),size,nullptr,nullptr,0))throw std::runtime_error("Cannot compare dropped file paths");auto key=std::filesystem::path(folded).u8string();
   if(!seen.insert(key).second||(remember&&recent.count(key)))continue;if(remember)recent[key]=now;result.push_back(std::move(path));
  }return result;
 }
};
inline std::shared_ptr<NativeExtensionBridge> nativeExtensionBridge(const ui::Widget& widget){return std::dynamic_pointer_cast<NativeExtensionBridge>(widget.getProperty(NativeExtensionBridge::name));}
inline void publishNativeExtensionEvent(const ui::Widget& widget,const extension::RuntimeEvent& event){if(auto services=nativeExtensionBridge(widget);services&&services->publish)services->publish(event);}
inline void publishNativeOperation(const ui::Widget& widget,const char* name,std::uint64_t identity,std::map<std::string,extension::RuntimeEvent::DetailValue> detail={}){publishNativeExtensionEvent(widget,extension::editorEvent(name,std::to_string(identity),std::move(detail)));}
inline std::string extensionToolCategory(std::string tool){const auto dot=tool.find('.');return tool.substr(0,dot);}
inline void publishNativeStroke(const ui::Widget& widget,std::uint64_t identity,const std::string& tool){const auto category=extensionToolCategory(tool);publishNativeOperation(widget,category=="fill"?"fill.completed":"drawing.completed",identity,{{"tool",category}});}
inline void publishNativeExport(const ui::Widget& widget,std::uint64_t identity,std::optional<std::string> format){extension::RuntimeEvent event;event.type="export-complete";event.projectId=std::to_string(identity);event.format=std::move(format);publishNativeExtensionEvent(widget,event);}
inline void beginNativeExport(const ui::Widget& widget,std::uint64_t identity){if(auto bridge=nativeExtensionBridge(widget))bridge->exportIdentity=identity;}
inline std::uint64_t nativeExportIdentity(const ui::Widget& widget,std::uint64_t fallback){auto bridge=nativeExtensionBridge(widget);return bridge&&bridge->exportIdentity?bridge->exportIdentity:fallback;}


// Native OLE uses Manager::drag/drop directly, bypassing message filters.
// Capture registered files before hit-testing detached native popup windows.
inline bool routeNativeExtensionDrop(ui::Widget& editor,os::DragEvent& event,ui::MessageType type){
 auto services=nativeExtensionBridge(editor);if(!services||!services->active||!services->accepts)return false;auto data=event.dataProvider();if(!data||!data->contains(os::DragDataItemType::Paths))return false;const auto paths=data->getPaths();if(!std::any_of(paths.begin(),paths.end(),[&](const auto& path){return services->accepts(PatternBrushDropPaths::normalize(path));}))return false;
 if(type==ui::kDragEnterMessage){ui::DragEnterMessage message(event);message.widget(nullptr);return editor.sendMessage(&message);}if(type==ui::kDragMessage){ui::DragMessage message(event);message.widget(nullptr);return editor.sendMessage(&message);}ui::DropMessage message(event);return editor.sendMessage(&message);
}
inline void replayNativeExtensionDrop(ui::Widget& widget,os::Window* window,gfx::Point position,std::vector<std::string> paths,const std::shared_ptr<NativeExtensionBridge>& services){
 if(paths.empty())return;class Paths final:public os::DragDataProvider{base::paths paths_;public:explicit Paths(base::paths paths):paths_(std::move(paths)){}base::paths getPaths()override{return paths_;}os::SurfaceRef getImage()override{return {};}std::string getUrl()override{return {};}bool contains(os::DragDataItemType type)override{return type==os::DragDataItemType::Paths;}};
 os::DragEvent event(window,os::DropOperation::Copy,position,std::make_unique<Paths>(std::move(paths)));ui::DropMessage message(event);struct Replay{ui::Message*& value;ui::Message* before;Replay(ui::Message*& value,ui::Message* message):value(value),before(value){value=message;}~Replay(){value=before;}}replay{services->replaying,&message};widget.sendMessage(&message);
}
}
