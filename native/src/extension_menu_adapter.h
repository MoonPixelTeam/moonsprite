#pragma once
#include "native_widgets.h"
#include <memory>
#include <set>
namespace moon::editor {
// Call only after popup close messages have been processed. Keeps builtin rows.
bool restoreTopMenuEntries(ui::Menu*);
class ExtensionMenuAdapter {
 struct State;std::shared_ptr<State> state_;
public:
 ExtensionMenuAdapter(const PixelFont&,const Skin&,const Skin&,ui::Widget*,ui::MenuBar*,std::filesystem::path,std::function<bool()>,std::function<bool()>,std::function<bool()>,std::function<void(const std::string&)>,std::function<void()>,std::function<void(const std::u32string&)>);
 ~ExtensionMenuAdapter();
 void request(const std::string&);void pump();
 bool placed(const std::string&)const;
};
void checkExtensionMenus(const PixelFont&,const Skin&,const Skin&,ui::Widget*,const std::filesystem::path&);
}
