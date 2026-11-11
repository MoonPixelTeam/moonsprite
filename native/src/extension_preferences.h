#pragma once
#include "native_widgets.h"
#include "ui/property.h"
#include <filesystem>
namespace moon::editor {
class ExtensionPreferences:public ui::Widget {
 struct Impl;std::unique_ptr<Impl> impl_;
 friend void checkExtensionPreferences(const PixelFont&,const Skin&,const Skin&,ui::Display*,gfx::Rect,const std::filesystem::path&);
public:
 ExtensionPreferences(const PixelFont&,const Skin&,const Skin&,std::filesystem::path,std::function<void()> changed,std::function<void()> installedChanged);
 ~ExtensionPreferences();
 int contentHeight(int logicalWidth);
 void viewport(gfx::Rect);
 void refresh();
 bool busy()const;
 bool onProcessMessage(ui::Message*)override;
 void onPaint(ui::PaintEvent&)override;
 void onResize(ui::ResizeEvent&)override;
};
struct ExtensionPreferencesProperty:ui::Property {
 ExtensionPreferences* panel;
 int top=0;
 explicit ExtensionPreferencesProperty(ExtensionPreferences* p):ui::Property("moonsprite.extension-preferences"),panel(p){}
};
void checkExtensionPreferences(const PixelFont&,const Skin&,const Skin&,ui::Display*,gfx::Rect,const std::filesystem::path&);
}
