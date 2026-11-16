#include "color_editor_modes.h"
#include "editor_preferences.h"
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
using namespace moon::color_editor;
void require(bool value,const char* why){if(!value)throw std::runtime_error(why);}
std::vector<Mode> raw(const std::string& text){std::istringstream input(text);std::vector<Mode> out;std::string id,value;while(input>>id>>value)out.push_back({id,value=="true"});return out;}
int main(int argc,char** argv){try{
 require(argc==2,"Oracle file required");std::ifstream oracle(argv[1]);require(bool(oracle),"Cannot open mode oracle");std::string line;int count=0;
 while(std::getline(oracle,line)){std::istringstream input(line);std::string type,a,b,c,expected;input>>std::quoted(type)>>std::quoted(a)>>std::quoted(b);
  if(type=="N"){require(normalize(raw(a))==raw(b),"Legacy mode normalization mismatch");require(decode(encode(raw(a)))==raw(b),"Mode codec normalization mismatch");}
  else{input>>std::quoted(c)>>std::quoted(expected);auto modes=defaults();for(int i=0;i<7;++i)modes[i].enabled=i%2==0;const auto before=modes;const bool changed=reorder(modes,a,b,c=="true");require(modes==raw(expected)&&changed==(before!=modes),"Legacy mode reorder mismatch");}
  ++count;
 }
 require(count>5000,"Incomplete mode oracle");
 for(const auto& broken:{"hsv","rgb maybe","hsl false cmyk","hsv true bad"})require(decode(broken)==defaults(),"Malformed native mode record fallback");
 auto only=defaults();for(auto& item:only)item.enabled=item.id=="hsl";require(!setEnabled(only,5,false)&&enabled(only,5),"Last enabled mode must survive");require(setEnabled(only,6,true)&&setEnabled(only,5,false)&&only[5].id=="hsl","Toggling must retain order");
 moon::preferences::RuntimeSettings prefs;prefs.colorEditorModes=only;require(reorder(prefs.colorEditorModes,"cmyk","hsv",false),"Persistence order fixture");std::istringstream saved(prefs.encode());const auto loaded=moon::preferences::RuntimeSettings::decode(saved);require(loaded.colorEditorModes==prefs.colorEditorModes,"Ordered modes persistence");require(!loaded.flag("colorLayers.mode.5")&&loaded.flag("colorLayers.mode.6"),"Catalog toggle typed binding");
 auto copy=loaded;bool rejected=false;try{copy.set("colorLayers.mode.6","false");}catch(const std::exception&){rejected=true;}require(rejected&&copy.colorEditorModes==loaded.colorEditorModes,"Last enabled direct setting guard");
 copy.set("colorLayers.mode.0","true");require(copy.colorEditorModes.front().id=="cmyk"&&copy.flag("colorLayers.mode.0"),"Mode activation reordered rows");
 std::cout<<count<<" actual legacy mode cases; persistence, fallback and last-enabled checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
