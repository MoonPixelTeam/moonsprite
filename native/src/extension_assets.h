#pragma once
#include <filesystem>
#include <future>
#include <optional>
#include <string>
namespace moon::extension {
// IndexedDB transaction semantics adapted to the Windows SQLite service.
// Requests run in one FIFO worker; discarding a future never joins the worker.
using AssetResult=std::optional<std::u16string>;
std::future<AssetResult> startAssetRequest(std::filesystem::path database,std::string extensionId,std::string method,std::u16string key,std::optional<std::u16string> value={});
}
