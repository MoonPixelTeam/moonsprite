#pragma once
#include <chrono>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>
namespace moon::extension {
struct RuntimeEvent;
// Single UI-thread owner. Each extension has an independent runtime/context.
class JsEngine final {
 struct State;std::unique_ptr<State> state_;
public:
 struct Message{std::string json;};
 JsEngine();explicit JsEngine(const std::string& windowId);~JsEngine();JsEngine(const JsEngine&)=delete;JsEngine& operator=(const JsEngine&)=delete;
 void evaluate(const std::string&,const std::string& filename,bool module=false);
 void deliver(const std::string& envelope);
 bool deliverFiles(const RuntimeEvent&,std::chrono::steady_clock::time_point deadline);
 void pump(std::chrono::steady_clock::time_point deadline);
 std::vector<Message> takeMessages();
 bool pending()const;
};
struct RuntimeScript{std::string source;bool module=false;};
std::vector<RuntimeScript> runtimeScripts(const std::string& html);
}
