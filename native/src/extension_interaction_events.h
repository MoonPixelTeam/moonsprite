#pragma once
#include "extension_runtime.h"
namespace moon::extension {
// Application event thread owns native listeners and a 30,000 ms repeating
// timer. Each timer callback calls clock(); no catch-up loop or worker thread.
class InteractionEvents {
 std::int64_t lastPointer_=0;std::function<void(const RuntimeEvent&)> send_;
public:
 static constexpr int clockIntervalMs=30000;
 explicit InteractionEvents(std::function<void(const RuntimeEvent&)> send):send_(std::move(send)){}
 void pointer(std::int64_t now){if(static_cast<long double>(now)-lastPointer_<500)return;lastPointer_=now;RuntimeEvent event;event.type="interaction";event.kind="pointer";send_(event);}
 void keyboard(){RuntimeEvent event;event.type="interaction";event.kind="keyboard";send_(event);}
 void clock(std::int64_t now){RuntimeEvent event;event.type="clock";event.timestamp=now;send_(event);}
};
}
