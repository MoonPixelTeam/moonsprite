#include "recent_colors.h"
#include <algorithm>
#include <fstream>
#include <locale>
#include <sstream>
#include <stdexcept>

namespace moon {
bool RecentColors::remember(const std::vector<std::uint32_t>& colors) {
  if(colors.size()==1 && !colors_.empty() && colors_.front()==colors.front()) return false;
  for(auto color:colors) {
    colors_.erase(std::remove(colors_.begin(),colors_.end(),color),colors_.end());
    colors_.insert(colors_.begin(),color);
    if(colors_.size()>capacity) colors_.resize(capacity);
  }
  return true;
}
void RecentColors::load(const std::filesystem::path& path) {
  if(!std::filesystem::exists(path)) {colors_.clear();return;}
  std::ifstream input(path);
  if(!input) throw std::runtime_error("Cannot read recent colors");
  std::vector<std::uint32_t> loaded;std::string line;
  while(std::getline(input,line)) {
    std::istringstream row(line);row.imbue(std::locale::classic());
    long long channels[4];
    if(!(row>>channels[0]>>channels[1]>>channels[2]>>channels[3])) continue;
    row>>std::ws;if(!row.eof()) continue;
    bool valid=true;for(auto channel:channels) if(channel<0 || channel>255) valid=false;
    if(!valid) continue;
    // Legacy load validates and truncates; it does not deduplicate persisted data.
    if(loaded.size()<capacity) loaded.push_back(std::uint32_t(channels[0])|
      (std::uint32_t(channels[1])<<8)|(std::uint32_t(channels[2])<<16)|(std::uint32_t(channels[3])<<24));
  }
  if(input.bad()) throw std::runtime_error("Cannot finish reading recent colors");
  colors_=std::move(loaded);
}
void RecentColors::save(const std::filesystem::path& path) const {
  if(!path.parent_path().empty()) std::filesystem::create_directories(path.parent_path());
  std::ofstream output(path,std::ios::trunc);
  if(!output) throw std::runtime_error("Cannot write recent colors");
  output.imbue(std::locale::classic());
  for(auto color:colors_) output<<(color&255)<<' '<<((color>>8)&255)<<' '<<((color>>16)&255)<<' '<<(color>>24)<<'\n';
  output.close();
  if(!output) throw std::runtime_error("Cannot finish writing recent colors");
}
bool RecentPaintDrag::observe(RecentColors& recent,RecentPaintKind kind,bool eraser,std::uint32_t color,
                              bool hasPixelChanges,std::optional<std::uint32_t> gradientEnd) {
  if(recorded_ || kind==RecentPaintKind::Navigation || eraser || (color>>24)==0 || !hasPixelChanges) return false;
  recorded_=true;
  return gradientEnd?recent.remember({*gradientEnd,color}):recent.remember({color});
}
}
