#pragma once
#include "shortcut_model.h"
#include "ui/property.h"
namespace moon::quick {
// QuickCommandBar shortcutFor uses shortcutPrimary + shortcutDisplayText(zh-CN).
inline std::string primaryShortcut(const shortcuts::Bindings& bindings,const std::string& id){
 const auto& values=shortcuts::forId(bindings,id);if(values.empty())return {};
 static const std::map<std::string,std::string> labels{{"WheelUp","滚轮向上"},{"WheelDown","滚轮向下"},{"MouseLeft","鼠标左键"},{"MouseRight","鼠标右键"},{"MouseMiddle","鼠标中键"},{"MouseDoubleLeft","鼠标左键双击"},{"MouseBack","鼠标侧键 1"},{"MouseForward","鼠标侧键 2"}};
 std::istringstream input(values.front());std::string part,result;
 while(std::getline(input,part,'+')){if(!result.empty())result+='+';auto found=labels.find(part);result+=found==labels.end()?part:found->second;}
 return result;
}
// Widget-owned adapter keeps current editor bindings live without copying the
// catalog into every bar. Existing native Widget property ownership is reused.
struct ShortcutTooltip : ui::Property {
 static constexpr const char* key="moonsprite.quick-command-shortcut-tooltip";
 std::function<std::string(const std::string&)> resolve;
 explicit ShortcutTooltip(std::function<std::string(const std::string&)> value):ui::Property(key),resolve(std::move(value)){}
};
}
