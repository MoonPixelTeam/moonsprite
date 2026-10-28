#include "text_font_service.h"
#include "include/core/SkBitmap.h"
#include "include/core/SkCanvas.h"
#include "include/core/SkData.h"
#include "include/core/SkFont.h"
#include "include/core/SkFontMgr.h"
#include "include/core/SkFontStyle.h"
#include "include/core/SkPaint.h"
#include "include/core/SkStream.h"
#include "include/core/SkString.h"
#include "include/ports/SkTypeface_win.h"
#include <windows.h>
#include <cctype>
#include <cmath>
#include <dwrite_3.h>
#include <wrl/client.h>
#include <fstream>
#include <iomanip>
#include <map>
#include <set>
#include <tuple>
#include <stdexcept>
namespace moon {
namespace {
using Microsoft::WRL::ComPtr;
std::string usageKey(std::string s){while(!s.empty()&&std::isspace(static_cast<unsigned char>(s.front())))s.erase(s.begin());while(!s.empty()&&std::isspace(static_cast<unsigned char>(s.back())))s.pop_back();if(!s.empty())CharLowerBuffA(s.data(),DWORD(s.size()));return s;}
std::vector<char> fontBytes(const std::filesystem::path& p){std::ifstream in(p,std::ios::binary);if(!in)throw std::runtime_error("Cannot read text font");return {(std::istreambuf_iterator<char>(in)),{}};}
sk_sp<SkData> fontData(const std::vector<char>& bytes){
 if(bytes.size()>128*1024*1024)throw std::length_error("Font exceeds memory limit");
 if(bytes.size()>=4&&bytes[0]=='w'&&bytes[1]=='O'&&bytes[2]=='F'&&(bytes[3]=='F'||bytes[3]=='2')){ComPtr<IDWriteFactory5> factory;const auto hr=DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED,__uuidof(IDWriteFactory5),reinterpret_cast<IUnknown**>(factory.GetAddressOf()));if(FAILED(hr))throw std::runtime_error("Windows font unpacker unavailable");ComPtr<IDWriteFontFileStream> stream;if(FAILED(factory->UnpackFontFile(bytes[3]=='2'?DWRITE_CONTAINER_TYPE_WOFF2:DWRITE_CONTAINER_TYPE_WOFF,bytes.data(),UINT32(bytes.size()),&stream)))throw std::runtime_error("Invalid WOFF font");UINT64 size=0;if(FAILED(stream->GetFileSize(&size))||size>128*1024*1024)throw std::runtime_error("Unpacked font exceeds memory limit");const void* fragment=nullptr;void* context=nullptr;if(FAILED(stream->ReadFileFragment(&fragment,0,size,&context)))throw std::runtime_error("Cannot unpack font");auto data=SkData::MakeWithCopy(fragment,std::size_t(size));stream->ReleaseFileFragment(context);return data;}return SkData::MakeWithCopy(bytes.data(),bytes.size());
}
const char* builtinFiles[]{"moonsprite-builtin-fusion-pixel-10px-prop-zh-hans.woff2","moonsprite-builtin-silkscreen-regular.ttf","moonsprite-builtin-tiny5-regular.ttf"};
const char* builtinFamilies[]{defaultTextFontFamily,"Silkscreen","Tiny5"};
}
struct TextFontService::Impl {
 std::filesystem::path library,settings;sk_sp<SkFontMgr> manager=SkFontMgr_New_DirectWrite();std::vector<TextFontOption> fonts;std::map<std::string,int> usage;int size=10;std::map<std::string,sk_sp<SkTypeface>> faces;
 void save(){std::filesystem::create_directories(settings.parent_path());auto temp=settings;temp+=L".tmp";{std::ofstream out(temp);out<<"MoonSprite text-font-usage 1\n"<<size<<'\n';for(const auto& [family,count]:usage)out<<std::quoted(family)<<' '<<count<<'\n';out.close();if(!out)throw std::runtime_error("Text font preference save failed");}if(!MoveFileExW(temp.c_str(),settings.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Text font preference replace failed");}
 sk_sp<SkTypeface> face(const std::string& family){auto cached=faces.find(family);if(cached!=faces.end())return cached->second;sk_sp<SkTypeface> result;for(const auto& font:fonts)if(font.family==family){result=manager->makeFromData(fontData(fontBytes(font.file)),font.faceIndex);break;}if(!result)result=manager->matchFamilyStyle(family.c_str(),SkFontStyle());faces[family]=result;return result;}
 TextFontOption option(const std::filesystem::path& p){int index=0;auto sidecar=p;sidecar+=L".face";{std::ifstream in(sidecar);if(!(in>>index)||index<0)index=0;}auto face=manager->makeFromData(fontData(fontBytes(p)),index);if(!face)throw std::runtime_error("Cannot decode text font");SkString family;face->getFamilyName(&family);TextFontOption result{family.c_str(),p,true,false,index,p.filename().u8string()};for(int i=0;i<3;++i)if(p.filename()==builtinFiles[i]){result.family=builtinFamilies[i];result.builtIn=true;result.imported=false;}return result;}
};
TextFontService::TextFontService(std::filesystem::path library,std::filesystem::path bundled,std::filesystem::path settings):impl_(std::make_shared<Impl>()){
 auto& p=*impl_;if(!p.manager)throw std::runtime_error("Windows font service unavailable");p.library=std::move(library);p.settings=std::move(settings);std::filesystem::create_directories(p.library);
 for(const auto* file:builtinFiles){const auto target=p.library/file;if(!std::filesystem::exists(target))std::filesystem::copy_file(bundled/file,target);}
 std::filesystem::create_directories(p.library/"licenses");for(const auto& entry:std::filesystem::directory_iterator(bundled/"licenses"))if(entry.is_regular_file()&&!std::filesystem::exists(p.library/"licenses"/entry.path().filename()))std::filesystem::copy_file(entry.path(),p.library/"licenses"/entry.path().filename());
 for(const auto& entry:std::filesystem::directory_iterator(p.library)){if(!entry.is_regular_file())continue;auto ext=entry.path().extension().string();std::transform(ext.begin(),ext.end(),ext.begin(),[](unsigned char c){return char(std::tolower(c));});if(ext!=".ttf"&&ext!=".ttc"&&ext!=".otf"&&ext!=".woff"&&ext!=".woff2")continue;try{p.fonts.push_back(p.option(entry.path()));}catch(...){}}
 std::ifstream in(p.settings);std::string header;if(std::getline(in,header)&&header=="MoonSprite text-font-usage 1"){int size;if(in>>size)p.size=std::clamp(size,1,512);std::string family;int count;while(in>>std::quoted(family)>>count)if(count>0)p.usage[usageKey(family)]=count;}
}
std::vector<TextFontOption> TextFontService::catalog()const{
 auto files=impl_->fonts;std::sort(files.begin(),files.end(),[](const auto& a,const auto& b){return std::tie(a.family,a.id)<std::tie(b.family,b.id);});std::vector<TextFontOption> result;std::set<std::string> seen;for(const auto& f:files)if(f.imported&&seen.insert(usageKey(f.family)).second)result.push_back(f);for(int i=0;i<3;++i)for(const auto& f:files)if(f.builtIn&&f.family==builtinFamilies[i]&&seen.insert(usageKey(f.family)).second)result.push_back(f);if(seen.insert(usageKey("Noto Sans SC")).second)result.push_back({"Noto Sans SC",{},false,true,0,{}});auto rank=[](const std::string& f){for(int i=0;i<3;++i)if(f==builtinFamilies[i])return i;return f=="Noto Sans SC"?3:4;};std::stable_sort(result.begin(),result.end(),[&](const auto& a,const auto& b){const auto ua=impl_->usage.find(usageKey(a.family)),ub=impl_->usage.find(usageKey(b.family));const int ca=ua==impl_->usage.end()?0:ua->second,cb=ub==impl_->usage.end()?0:ub->second;return ca!=cb?ca>cb:rank(a.family)<rank(b.family);});return result;
}
std::vector<std::string> TextFontService::systemFamilies()const{std::vector<std::string> result;for(int i=0;i<impl_->manager->countFamilies();++i){SkString name;impl_->manager->getFamilyName(i,&name);if(name.size())result.emplace_back(name.c_str());}std::sort(result.begin(),result.end());result.erase(std::unique(result.begin(),result.end()),result.end());return result;}
TextFontOption TextFontService::importFile(const std::filesystem::path& source){
 auto ext=source.extension().string();std::transform(ext.begin(),ext.end(),ext.begin(),[](unsigned char c){return char(std::tolower(c));});if(ext!=".ttf"&&ext!=".ttc"&&ext!=".otf"&&ext!=".woff"&&ext!=".woff2")throw std::runtime_error("Select TTF, TTC, OTF, WOFF or WOFF2");auto result=impl_->option(source);const auto bytes=fontBytes(source);auto target=impl_->library/source.filename();if(std::filesystem::exists(target)&&fontBytes(target)!=bytes)target=impl_->library/(source.stem().wstring()+L"-"+std::to_wstring(GetTickCount64())+source.extension().wstring());if(!std::filesystem::exists(target)){auto temporary=target;temporary+=L".tmp";std::ofstream out(temporary,std::ios::binary);out.write(bytes.data(),std::streamsize(bytes.size()));out.close();if(!out||!MoveFileExW(temporary.c_str(),target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Cannot import text font");}result=impl_->option(target);impl_->fonts.erase(std::remove_if(impl_->fonts.begin(),impl_->fonts.end(),[&](const auto& option){return option.id==result.id;}),impl_->fonts.end());impl_->fonts.push_back(result);impl_->faces.erase(result.family);return result;
}
TextFontOption TextFontService::importSystem(const std::string& family){
 auto face=impl_->manager->matchFamilyStyle(family.c_str(),SkFontStyle());if(!face)throw std::runtime_error("System font unavailable");int index=0;auto stream=face->openStream(&index);if(!stream||!stream->getLength()||stream->getLength()>128*1024*1024)throw std::runtime_error("System font cannot be imported");std::vector<char> bytes(stream->getLength());if(stream->read(bytes.data(),bytes.size())!=bytes.size())throw std::runtime_error("Cannot read system font");auto target=impl_->library/(L"system-"+std::to_wstring(GetTickCount64())+L".ttc");auto temporary=target;temporary+=L".tmp";{std::ofstream out(temporary,std::ios::binary);out.write(bytes.data(),std::streamsize(bytes.size()));out.close();if(!out)throw std::runtime_error("Cannot write system font");}if(!MoveFileExW(temporary.c_str(),target.c_str(),MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Cannot import system font");auto sidecar=target;sidecar+=L".face";{std::ofstream out(sidecar);out<<index;if(!out)throw std::runtime_error("Cannot save system font face");}auto result=impl_->option(target);impl_->fonts.erase(std::remove_if(impl_->fonts.begin(),impl_->fonts.end(),[&](const auto& f){return f.id==result.id;}),impl_->fonts.end());impl_->fonts.push_back(result);impl_->faces.erase(result.family);return result;
}
void TextFontService::erase(const std::string& id){auto it=std::find_if(impl_->fonts.begin(),impl_->fonts.end(),[&](const auto& f){return f.id==id;});if(it==impl_->fonts.end()||!it->imported||it->builtIn)throw std::runtime_error("Only imported fonts can be deleted");const auto family=it->family;std::filesystem::remove(it->file);auto sidecar=it->file;sidecar+=L".face";std::error_code error;std::filesystem::remove(sidecar,error);impl_->fonts.erase(it);impl_->faces.erase(family);}
int TextFontService::lastSize()const{return impl_->size;}
void TextFontService::recordSize(int value){impl_->size=std::clamp(value,1,512);impl_->save();}
void TextFontService::recordUsage(const std::string& family){auto& n=impl_->usage[usageKey(family)];if(n<2147483647)++n;impl_->save();}
TextGlyphProvider TextFontService::provider()const{return [p=impl_](const std::string& family,int size,char32_t code,int threshold)->std::optional<TextGlyph>{
 auto face=p->face(family);if(!face||!face->unicharToGlyph(SkUnichar(code))){const char* languages[]={"zh-Hans"};auto fallback=p->manager->matchFamilyStyleCharacter(family.c_str(),SkFontStyle(),languages,1,SkUnichar(code));if(fallback)face=std::move(fallback);}if(!face)return {};
 SkFont font(face,SkScalar(size));font.setEdging(SkFont::Edging::kAntiAlias);SkRect bounds;const auto advance=font.measureText(&code,sizeof(code),SkTextEncoding::kUTF32,&bounds);const int origin=int(std::ceil(size*2+std::max(0.f,-bounds.left()))),baseline=int(std::ceil(size*2+std::max(1.f,-bounds.top())));const int width=std::max(size*4+16,origin+int(std::ceil(bounds.right()))+size*2+8),height=std::max(size*4+16,baseline+int(std::ceil(bounds.bottom()))+size*2+8);if(width<1||height<1||double(width)*height>64.*1024*1024)throw std::length_error("Glyph exceeds memory limit");SkBitmap bitmap;if(!bitmap.tryAllocN32Pixels(width,height))throw std::bad_alloc();bitmap.eraseColor(SK_ColorTRANSPARENT);SkCanvas canvas(bitmap);SkPaint paint;paint.setColor(SK_ColorWHITE);canvas.drawSimpleText(&code,sizeof(code),SkTextEncoding::kUTF32,SkScalar(origin),SkScalar(baseline),font,paint);
 int left=width,top=height,right=-1,bottom=-1;for(int y=0;y<height;++y)for(int x=0;x<width;++x)if(SkColorGetA(bitmap.getColor(x,y))>=threshold){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}if(right<left)return {};TextGlyph out;out.left=left-origin;out.top=top-baseline;out.width=right-left+1;out.height=bottom-top+1;out.advance=advance;out.alpha.resize(std::size_t(out.width)*out.height);for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const auto alpha=SkColorGetA(bitmap.getColor(left+x,top+y));out.alpha[std::size_t(y)*out.width+x]=alpha<threshold?0:threshold==192?255:alpha;}return out;
};}
}
