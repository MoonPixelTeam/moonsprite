#include "system_winrt_apartment.h"
#include <windows.h>
#include <roapi.h>
#include <winrt/base.h>
#include <stdexcept>
#include <string>

namespace moon::platform {
namespace {
// COM's process MTA usage cookie is independent of the caller's apartment.
// Without it, the final short-lived worker can tear down WinRT JSON services
// while the next wave is activating them (CO_E_SERVER_STOPPING).
class ProcessMta final {
public:
  ProcessMta() { winrt::check_hresult(CoIncrementMTAUsage(&cookie_)); }
  ~ProcessMta() {
    winrt::clear_factory_cache();
    CoDecrementMTAUsage(cookie_);
  }
private:
  CO_MTA_USAGE_COOKIE cookie_{};
};
void retainProcessMta() {
  static ProcessMta lifetime;
}
}

RuntimeApartment::RuntimeApartment(const char* errorContext) {
  retainProcessMta();
  const auto status = RoInitialize(RO_INIT_MULTITHREADED);
  if (FAILED(status) && status != RPC_E_CHANGED_MODE)
    throw std::runtime_error(std::string(errorContext) + "; HRESULT=" + std::to_string(status));
  initialized_ = SUCCEEDED(status);
}
RuntimeApartment::~RuntimeApartment() {
  if (initialized_) RoUninitialize();
}
}
