#pragma once
#include "document.h"
#include <algorithm>
#include <filesystem>
#include <string>
#include <vector>
#include <utility>

namespace moon {
enum class SaveImageFormat;
namespace workspace {
// Immutable decision input; no UI, encoder, worker or active-tab dependency.
// Editing within approved loss categories remains legal (legacy save contract).
struct SaveDecisionContext {
 std::uint64_t identity=0;
 std::filesystem::path savedPath,sourcePath;
 SaveImageFormat format{};
 std::vector<std::string> approvedIssues;

 static SaveDecisionContext capture(const Document& document,
     const std::filesystem::path& saved,SaveImageFormat format,
     std::vector<std::string> issues={}) {
  return {document.identity(),saved,document.sourceFilePath(),format,std::move(issues)};
 }
 bool matchesOwnerTarget(const Document& document,const std::filesystem::path& saved)const {
  return identity==document.identity()&&savedPath==saved&&sourcePath==document.sourceFilePath();
 }
 bool covers(SaveImageFormat selected,const std::vector<std::string>& issues)const {
  return selected==format&&std::all_of(issues.begin(),issues.end(),[this](const auto& issue){
   return std::find(approvedIssues.begin(),approvedIssues.end(),issue)!=approvedIssues.end();
  });
 }
};
}
}
