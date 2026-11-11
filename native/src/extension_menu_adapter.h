#pragma once
#include "native_widgets.h"
#include <memory>
#include <set>
#include <cstdint>
namespace moon::extension {class SessionHost;}
namespace moon::editor {
// Call only after popup close messages have been processed. Keeps builtin rows.
bool restoreTopMenuEntries(ui::Menu*);
class ExtensionMenuAdapter {
 struct State;std::shared_ptr<State> state_;
public:
 ExtensionMenuAdapter(const PixelFont&,const Skin&,const Skin&,ui::Widget*,ui::MenuBar*,std::filesystem::path,std::function<bool()>,std::function<bool()>,std::function<bool()>,std::function<void(const std::string&)>,std::function<void()>,std::function<void(const std::u32string&)>);
 ~ExtensionMenuAdapter();
 void request(const std::string&);void pump();
 // Bind an already-open native session; this does not create a JS executor.
 bool bindRuntime(std::shared_ptr<extension::SessionHost>,const std::string&,std::uint64_t);
 void unbindRuntime(const std::string&);
 bool placed(const std::string&)const;
};
void checkExtensionMenus(const PixelFont&,const Skin&,const Skin&,ui::Widget*,const std::filesystem::path&);
}
