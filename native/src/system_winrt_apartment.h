#pragma once

namespace moon::platform {
// Retains the process MTA across short worker jobs. Each instance balances only
// its own thread initialization, and accepts an already initialized STA caller.
// Instances are thread-affine and must be destroyed on their creating thread.
class RuntimeApartment final {
public:
  explicit RuntimeApartment(const char* errorContext);
  ~RuntimeApartment();
  RuntimeApartment(const RuntimeApartment&) = delete;
  RuntimeApartment& operator=(const RuntimeApartment&) = delete;
  RuntimeApartment(RuntimeApartment&&) = delete;
  RuntimeApartment& operator=(RuntimeApartment&&) = delete;

private:
  bool initialized_ = false;
};
}
