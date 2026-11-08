#pragma once
#include "image_save.h"
#include <optional>
#include <cwctype>
#include <iterator>
namespace moon {
// legacy/core/document-save-policy.ts selects the saved identity first. An
// invalid saved path never falls back to (and overwrites) the original source.
struct DocumentSaveTarget {std::filesystem::path path;SaveImageFormat format;};
inline bool isMoonSpriteBackupPath(const std::filesystem::path& path){auto name=path.filename().wstring();for(auto& c:name)c=std::towlower(c);constexpr wchar_t suffix[]=L".moonsprite.bak";return name.size()>=std::size(suffix)-1&&name.compare(name.size()-(std::size(suffix)-1),std::size(suffix)-1,suffix)==0;}
inline std::optional<DocumentSaveTarget> documentSaveTarget(const std::filesystem::path& saved,const std::filesystem::path& source){
 const auto& path=saved.empty()?source:saved;if(path.empty())return {};
 auto ext=path.extension().wstring();for(auto& c:ext)c=std::towlower(c);if(ext==L".bak")return {};
 const auto format=saveImageFormat(path);if(format==SaveImageFormat::Native&&ext!=L".moonsprite")return {};
 return DocumentSaveTarget{path,format};
}
}
