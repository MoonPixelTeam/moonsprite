#pragma once
#include "native_widgets.h"
#include <memory>
namespace moon::extension { struct RuntimeCandidate; struct ManifestCommand; }
namespace moon::editor {
// Legacy ExtensionPanelHost: floating command lists, independent of JS engine.
class ExtensionPanelHost {
 struct State;std::unique_ptr<State> state_;
public:
 ExtensionPanelHost(const PixelFont&,const Skin&,const Skin&,ui::Widget*,std::filesystem::path,std::function<bool()>,std::function<bool()>,std::function<bool()>,std::function<void(const std::string&,const extension::ManifestCommand&)>,std::function<void(const std::u32string&)>);
 ~ExtensionPanelHost();
 void replace(const std::vector<extension::RuntimeCandidate>&);
 void appendMenu(PixelMenu*,std::vector<ui::Widget*>&);
 void pump();
 bool visible(const std::string&)const;void toggle(const std::string&);
 ui::Window* window(const std::string&)const;
 bool writing()const;
};
void checkExtensionPanels(const PixelFont&,const Skin&,const Skin&,ui::Widget*,const std::filesystem::path&);
}
