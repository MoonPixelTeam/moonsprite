#pragma once
#include <cstddef>
#include <optional>
#include <string>
namespace moon::local_history {
// Strings are UTF-16 on Windows, matching JS charCodeAt. The locale argument
// only selects the host casing locale; null uses the Windows user locale.
std::string historyKey(const std::wstring& filePath,const std::wstring& sourceFilePath,const std::wstring& runtimeId,const char* locale=nullptr);
int parseHistorySteps(const std::optional<std::wstring>& text);
struct RestoreWindow {
  std::size_t begin=0,end=0,position=0;
};
// position is clamped before use, as in restoreLocalHistory. An absent entry
// limit represents the legacy disabled runtime history limit (Infinity).
RestoreWindow restoreWindow(std::size_t totalEntries,std::size_t position,std::optional<std::size_t> entryLimit={});
}
