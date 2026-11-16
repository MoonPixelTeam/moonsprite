#pragma once

namespace moon {
// Legacy core/eyedropper-quick-select.ts, including the one-shot repeat gate.
struct EyedropperQuickSelectContext {
 bool enabled,shortcutMatched,repeat,pointerVisible,activeDocument;
 bool dragActive,spaceHeld,modifierChordActive,canvasContextBlocked,interactionBlocked;
};
inline bool shouldQuickSelectEyedropper(const EyedropperQuickSelectContext& c){
 return c.enabled&&c.shortcutMatched&&!c.repeat&&c.pointerVisible&&c.activeDocument&&
  !c.dragActive&&!c.spaceHeld&&!c.modifierChordActive&&!c.canvasContextBlocked&&!c.interactionBlocked;
}
}
