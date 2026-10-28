#pragma once
#include "history_catalog.h"
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>
namespace moon {
struct HistoryPanelEntry {std::size_t position=0;std::u32string label;};
struct HistoryPanelTimeline {std::vector<HistoryPanelEntry> entries;std::size_t position=0;std::uint64_t revision=0;};
struct HistoryDisplayOption {std::u32string id,label;};
inline std::u32string historyDisplayType(const std::u32string& label){for(const auto& row:historyLabelCatalog())if(row.second==label)return row.first;return U"label:"+label;}
inline bool historyTypeHidden(const std::vector<std::u32string>& hidden,const std::u32string& label){const auto key=historyDisplayType(label);return std::find(hidden.begin(),hidden.end(),key)!=hidden.end();}
inline std::vector<HistoryPanelEntry> historyVisibleEntries(const HistoryPanelTimeline& timeline,const std::vector<std::u32string>& hidden){std::vector<HistoryPanelEntry> out{{0,U"历史起点"}};for(const auto& row:timeline.entries)if(!historyTypeHidden(hidden,row.label))out.push_back(row);return out;}
inline std::vector<HistoryDisplayOption> historyDisplayOptions(const std::vector<std::u32string>& labels,const std::vector<std::u32string>& hidden){std::vector<HistoryDisplayOption> out;auto add=[&](std::u32string id,std::u32string label){if(std::none_of(out.begin(),out.end(),[&](const auto& r){return r.id==id;}))out.push_back({std::move(id),std::move(label)});};for(const auto& row:historyLabelCatalog())add(row.first,row.second);for(const auto& label:labels)add(historyDisplayType(label),label);for(const auto& id:hidden)if(id.rfind(U"label:",0)==0)add(id,id.substr(6));return out;}
inline int historyRevealScroll(int top,int bottom,int scroll,int page,int total){scroll=std::clamp(scroll,0,std::max(0,total-page));if(top<scroll)scroll=top;else if(bottom>scroll+page)scroll=bottom-page;return std::clamp(scroll,0,std::max(0,total-page));}
}
