#include "recovery_codec.h"
#include <windows.h>
#include <roapi.h>
#include <future>
#include <iostream>
#include <string>
#include <vector>

namespace {
void check(bool yes, const char* why) {
  if (!yes) throw std::runtime_error(why);
}
void roundtrip(const moon::project::RecoveryRecord& record) {
  const auto decoded = moon::project::decodeRecoveryRecord(moon::project::encodeRecoveryRecord(record));
  check(record.id == decoded.id && record.name == decoded.name && record.updatedAt == decoded.updatedAt,
        "Recovery metadata roundtrip mismatch");
}
void concurrent() {
  const moon::project::RecoveryRecord record{"shared-origin", "中文并发 metadata", "42"};
  for (int wave = 0; wave < 24; ++wave) {
    std::promise<void> start;
    const auto ready = start.get_future().share();
    std::vector<std::future<void>> workers;
    for (int thread = 0; thread < 8; ++thread)
      workers.push_back(std::async(std::launch::async, [ready, record] {
        ready.get();
        for (int i = 0; i < 24; ++i) roundtrip(record);
        // A process MTA anchor must not leak a per-thread initialization count.
        const auto initialized = RoInitialize(RO_INIT_MULTITHREADED);
        if (SUCCEEDED(initialized)) RoUninitialize();
        check(initialized == S_OK, "Recovery codec leaked a thread apartment initialization");
      }));
    start.set_value();
    for (auto& worker : workers) worker.get();
  }
}
void compatibility() {
  using namespace moon::project;
  roundtrip({"doc-1", "中文 工程", "1760000000000"});
  for (auto id : {"../x", "a/b", "", "ok_id-1"})
    check(isSafeRecoveryId(id) == (std::string(id) == "ok_id-1"), "Recovery safe ID mismatch");
  for (auto bad : {"{}", "{broken", "{\"id\":\"../x\",\"name\":\"n\",\"updatedAt\":\"1\"}"}) {
    bool rejected = false;
    try { decodeRecoveryRecord(bad); } catch (const Error&) { rejected = true; }
    check(rejected, "Invalid recovery metadata accepted");
  }
}
}

int main(int argc, char** argv) {
  const bool sta = argc == 2 && std::string(argv[1]) == "--sta-parallel";
  struct Apartment {
    bool initialized = false;
    ~Apartment() { if (initialized) RoUninitialize(); }
  } root;
  try {
    if (sta) {
      const auto status = RoInitialize(RO_INIT_SINGLETHREADED);
      check(SUCCEEDED(status), "Cannot initialize STA regression fixture");
      root.initialized = true;
    }
    if (argc == 2) {
      check(sta || std::string(argv[1]) == "--parallel", "Unknown recovery codec test mode");
      concurrent();
    }
    compatibility();
    if (sta) {
      APTTYPE type;
      APTTYPEQUALIFIER qualifier;
      check(SUCCEEDED(CoGetApartmentType(&type, &qualifier)) &&
            (type == APTTYPE_STA || type == APTTYPE_MAINSTA),
            "Recovery codec changed or uninitialized its STA caller");
    }
    std::cout << (argc == 2 ? "4608 concurrent recovery metadata pairs and apartment ownership passed\n"
                           : "Legacy recovery metadata checks passed\n");
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
