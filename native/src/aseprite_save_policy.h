#pragma once
#include "document.h"
#include <algorithm>
#include <cwctype>
#include <set>
namespace moon {
inline bool isAsepriteSavePath(const std::filesystem::path& path){auto ext=path.extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return std::towlower(c);});return ext==L".ase"||ext==L".aseprite";}
inline std::vector<std::string> asepriteSaveIssues(const Document& d){std::set<std::string> issues;const auto& s=d.timeline().state();if(std::any_of(s.frames.begin(),s.frames.end(),[](const auto& f){return f.disabled;}))issues.insert("frameFlags");if(std::any_of(s.layers.begin(),s.layers.end(),[](const auto& l){return !l.kind.empty();})||std::any_of(s.cels.begin(),s.cels.end(),[](const auto& c){return c.text.has_value();}))issues.insert("editable");if(!s.masks.empty())issues.insert("effects");if(d.timelapseSettings().enabled||!d.timelapseSettings().snapshots.empty()||!d.projectBrushes().empty()||!d.slices().empty())issues.insert("resources");return {issues.begin(),issues.end()};}
inline bool asepriteApprovalCovers(const std::vector<std::string>& approved,const std::vector<std::string>& current){return std::all_of(current.begin(),current.end(),[&](const auto& issue){return std::find(approved.begin(),approved.end(),issue)!=approved.end();});}
inline std::filesystem::path normalizedAsepriteSavePath(std::filesystem::path path,const wchar_t* extension=L".aseprite"){if(isAsepriteSavePath(path))return path;auto ext=path.extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return std::towlower(c);});static const std::set<std::wstring> known={L".moonsprite",L".png",L".jpg",L".jpeg",L".webp",L".bmp",L".svg",L".gif",L".ico",L".psd"};if(known.count(ext))path.replace_extension(extension);else path+=extension;return path;}
}
