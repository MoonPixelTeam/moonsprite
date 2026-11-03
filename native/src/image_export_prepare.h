#pragma once
#include "image_export.h"
namespace moon {
// Shared scale/composite preparation; save encoders do not encode PNG first.
StaticImageExport prepareStaticImage(const Document&,StaticImageExportOptions,bool bmp=false);
}
