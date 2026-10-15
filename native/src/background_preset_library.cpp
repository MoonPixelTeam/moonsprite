#include "background_preset_library.h"
#include "background_preset_seeds.h"
#include "layer_compositor.h"
#include <fstream>
namespace moon {namespace {
bool whitespace(char32_t c){return(c>=9&&c<=13)||c==32||c==0x85||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000;}
std::u32string trim(std::u32string s,bool dots=false){auto edge=[dots](char32_t c){return whitespace(c)||(dots&&c==U'.');};auto a=std::find_if_not(s.begin(),s.end(),edge);auto b=std::find_if_not(s.rbegin(),s.rend(),edge).base();return a>=b?std::u32string{}:std::u32string(a,b);}
}
std::u32string BackgroundPresetLibrary::cleanName(std::u32string name){name=trim(std::move(name));std::u32string out;for(auto c:name){if(c<=31||(c>=127&&c<=159)||std::u32string(U"/\\:*?\"<>|").find(c)!=std::u32string::npos)continue;out+=c;if(out.size()==80)break;}out=trim(std::move(out),true);return out.empty()?U"选区背景预设":out;}
void BackgroundPresetLibrary::validatePng(const std::vector<std::uint8_t>& b){
 if(b.size()>32*1024*1024)throw std::invalid_argument("背景预设文件不能超过 32 MB。");
 const std::uint8_t signature[]{137,80,78,71,13,10,26,10};if(b.size()<24||!std::equal(signature,signature+8,b.begin())||!std::equal(b.begin()+12,b.begin()+16,"IHDR"))throw std::invalid_argument("背景预设必须是有效的 PNG 图片。");
 auto be=[&](int i){return(std::uint32_t(b[i])<<24)|(std::uint32_t(b[i+1])<<16)|(std::uint32_t(b[i+2])<<8)|b[i+3];};auto w=be(16),h=be(20);if(!w||!h||w>4096||h>4096||std::uint64_t(w)*h>16777216)throw std::invalid_argument("背景预设尺寸无效或超过限制。");
}
BackgroundPresetLibrary::BackgroundPresetLibrary(std::filesystem::path directory):directory_(std::move(directory)){std::filesystem::create_directories(directory_);seedBuiltins();}
void BackgroundPresetLibrary::seedBuiltins()const{const auto marker=directory_/".moonsprite-background-presets";std::ifstream file(marker,std::ios::binary);std::vector<std::uint8_t> version((std::istreambuf_iterator<char>(file)),{});file.close();if(version==std::vector<std::uint8_t>{'2'})return;for(const auto& seed:backgroundPresetSeeds())writeExportBytesAtomic(directory_/seed.name,seed.bytes);writeExportBytesAtomic(marker,{'2'});}
StoredBackgroundPreset BackgroundPresetLibrary::save(std::u32string name,const std::vector<std::uint8_t>& bytes)const{
 validatePng(bytes);auto clean=cleanName(std::move(name));std::filesystem::path path;for(std::uint64_t suffix=1;;++suffix){auto stem=clean;if(suffix>1){auto text=std::to_string(suffix);stem+=U" ";stem.append(text.begin(),text.end());}path=directory_/std::filesystem::path(stem+U".png");if(!std::filesystem::exists(path))break;}
 writeExportBytesAtomic(path,bytes);auto readable=path.stem().u32string();for(auto& c:readable)if(c==U'-'||c==U'_')c=U' ';std::u32string display;bool space=false;for(auto c:readable){if(whitespace(c)){space=!display.empty();continue;}if(space)display+=U' ';space=false;display+=c;}return{path.filename().u8string(),std::filesystem::path(display).u8string(),path.u8string(),false};
}
std::optional<StaticImageExport> encodeSelectionBackgroundPreset(const Document& d,const SelectionMask& s){
 const int x=std::clamp(s.x,0,d.width()),y=std::clamp(s.y,0,d.height());const int right=int(std::clamp<std::int64_t>(std::int64_t(s.x)+s.width,x,d.width())),bottom=int(std::clamp<std::int64_t>(std::int64_t(s.y)+s.height,y,d.height()));const int width=right-x,height=bottom-y;if(width<1||height<1)return {};
 if(width>4096||height>4096||std::uint64_t(width)*height>16777216)throw std::invalid_argument("背景预设尺寸不能超过 4096 像素。");
 if(!s.mask.empty()&&s.mask.size()!=std::size_t(s.width)*s.height)throw std::invalid_argument("Invalid selection mask");auto pixels=compositeNormalRegion(d.timeline(),d.frame().id,{x,y,width,height});
 // Legacy single-layer fast path preserves RGB under zero alpha too.
 if(d.timeline().state().layers.size()==1){const auto& layer=d.timeline().state().layers.front();if(layer.visible&&layer.opacity==1){auto slot=d.timeline().findCel(layer.id,d.frame().id);auto resolved=d.timeline().resolveSurface(slot->id);if(resolved.surface){const auto& source=*resolved.surface;for(int row=0;row<height;++row)for(int col=0;col<width;++col){const int sx=x+col-source.offsetX,sy=y+row-source.offsetY;if(sx>=0&&sy>=0&&sx<source.width&&sy<source.height)pixels[std::size_t(row)*width+col]=source.pixels[std::size_t(sy)*source.width+sx];}}}}
 bool visible=false;
 for(int row=0;row<height;++row)for(int col=0;col<width;++col){auto& pixel=pixels[std::size_t(row)*width+col];if(!selectionContains(s,x+col,y+row))pixel=0;else visible|=(pixel>>24)!=0;}
 if(!visible)return {};return encodeRgbaImagePng(width,height,std::move(pixels));
}
}
