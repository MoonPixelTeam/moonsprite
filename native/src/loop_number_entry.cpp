#include "loop_number_entry.h"
#include "ui/message.h"
#include <algorithm>
#include <cmath>
#include <regex>
#include <sstream>
namespace moon::editor {
void LoopNumberEntry::setValue(double next) {value=next;std::ostringstream out;out.precision(12);out<<next;setText(out.str());}

void LoopNumberEntry::updateLiveValue() {

    if(!isEnabled() || isReadOnly())return;

    const auto source=text();if(source.empty() || source.find_first_of("+-*/()",1)!=std::string::npos)return;

    static const std::regex plain(R"(^\s*[+\-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+\-]?[0-9]+)?\s*$)");

    if(!std::regex_match(source,plain))return;

    try{const double next=std::stod(source);if(std::isfinite(next)){value=std::clamp(next,minimum,maximum);if(committed)committed();}}catch(...){}

  }

bool LoopNumberEntry::commitValue() {

    const auto source=text();static const std::regex token(R"((\s+|[+*/()\-]|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+\-]?[0-9]+)?))");

    std::size_t offset=0;std::smatch match;while(offset<source.size()){const auto tail=source.substr(offset);if(!std::regex_search(tail,match,token,std::regex_constants::match_continuous)){setValue(value);return false;}offset+=match.length();}

    if(source.empty() || !commitExpression()){setValue(value);return false;}try{setValue(std::clamp(std::stod(text()),minimum,maximum));}catch(...){setValue(value);return false;}if(committed)committed();return true;

  }

bool LoopNumberEntry::onProcessMessage(ui::Message* msg) {

    if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEnter){const auto source=text();const bool expression=source.size()>1 && source.find_first_of("+-*/()",1)!=std::string::npos;commitValue();if(!expression && accept)accept();return true;}

    if(isEnabled() && msg->type()==ui::kFocusLeaveMessage)commitValue();return PixelEntry::onProcessMessage(msg);

  }
}
