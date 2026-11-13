#include "system_clipboard_size.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

namespace moon::new_document {
std::optional<Size> readSystemSize(){
 if(!OpenClipboard(nullptr))return {};struct Close {~Close(){CloseClipboard();}} close;
 const UINT format=IsClipboardFormatAvailable(CF_DIBV5)?CF_DIBV5:IsClipboardFormatAvailable(CF_DIB)?CF_DIB:0;if(!format)return {};
 const auto handle=GetClipboardData(format);if(!handle)return {};const auto length=GlobalSize(handle);if(length<12)return {};const auto bytes=GlobalLock(handle);if(!bytes)return {};const auto size=dibSize(bytes,length);GlobalUnlock(handle);return size;
}
}
