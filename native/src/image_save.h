#pragma once
#include "document.h"
namespace moon {
// legacy document-files.ts / document-save-policy.ts. Native is not an encoder.
enum class SaveImageFormat {Native,Png,Jpeg,Webp,Svg,Ico,Bmp,Gif,Psd,Ase,Aseprite};
SaveImageFormat saveImageFormat(const std::filesystem::path&);
SaveImageFormat preferredSaveImageFormat(int preference);
const wchar_t* saveImageExtension(SaveImageFormat);
std::u32string saveImageLabel(SaveImageFormat);
std::filesystem::path normalizedImageSavePath(std::filesystem::path,SaveImageFormat);
std::vector<std::string> imageSaveIssues(const Document&,SaveImageFormat);
std::vector<std::uint8_t> encodeSaveImage(const Document&,SaveImageFormat);
}
