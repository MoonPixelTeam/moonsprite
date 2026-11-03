#pragma once
#include "document.h"
namespace moon {
std::vector<std::uint8_t> encodePsd(const Document&,int scalePercent=100);
std::u32string psdExportNotice(const Document&);
bool isPsdSavePath(const std::filesystem::path&);
std::filesystem::path normalizedPsdSavePath(std::filesystem::path);
std::vector<std::string> psdSaveIssues(const Document&);
}
