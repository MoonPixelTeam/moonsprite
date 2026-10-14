#pragma once
#include <functional>
#include <map>
#include <string>
#include <vector>
namespace moon::menus {
struct Entry {const char* id;const char* parent;const char32_t* title;const char* shortcutId;const char* shortcut;bool group;bool separatorBefore=false;};
const std::vector<Entry>& catalog();
struct Binding {std::function<void()> run;std::function<bool()> enabled;std::function<bool()> checked;};
// Absent handlers are explicit migration gaps, never successful no-op commands.
class Commands {
public:
 bool bind(const std::string& id,Binding binding);
 bool connected(const std::string& id) const;
 bool enabled(const std::string& id) const;
 bool checked(const std::string& id) const;
 bool invoke(const std::string& id) const;
private: std::map<std::string,Binding> bindings_;
};
}
