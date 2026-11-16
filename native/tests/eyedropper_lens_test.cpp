#define NOMINMAX
#include "eyedropper_lens.h"
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
using namespace moon;
using namespace moon::eyedropper_lens;
using namespace winrt::Windows::Data::Json;
namespace {
void check(bool ok,const std::string& message){if(!ok)throw std::runtime_error(message);}
std::vector<Pixel> words(const JsonArray& a){std::vector<Pixel> out;out.reserve(a.Size());for(auto v:a)out.push_back(Pixel(v.GetNumber()));return out;}
view::Point point(const JsonObject& o){return {o.GetNamedNumber(L"x"),o.GetNamedNumber(L"y")};}
int run(int argc,wchar_t** argv){
 check(argc==3,"oracle and assets paths");std::ifstream in(std::filesystem::path(argv[1]),std::ios::binary);check(bool(in),"missing lens oracle");
 const std::string bytes{std::istreambuf_iterator<char>(in),{}};const auto data=JsonObject::Parse(winrt::to_hstring(bytes));
 const auto pixels=words(data.GetNamedArray(L"pixels"));unsigned n=0;
 for(auto value:data.GetNamedArray(L"cases")){
  const auto row=value.GetObject();Field field{pixels,point(row.GetNamedObject(L"point")),int(row.GetNamedNumber(L"startX")),int(row.GetNamedNumber(L"startY")),row.GetNamedNumber(L"zoom"),{row.GetNamedNumber(L"degrees"),row.GetNamedBoolean(L"mx"),row.GetNamedBoolean(L"my")},row.GetNamedBoolean(L"distortion")};
  const auto expected=words(row.GetNamedArray(L"output"));check(expected.size()==10404,"field coverage");
  for(int y=0;y<102;++y)for(int x=0;x<102;++x){const auto actual=field.at({(x+.5)*2,(y+.5)*2});check(actual==expected[y*102+x],"legacy lens case "+std::to_string(n)+" pixel "+std::to_string(x)+","+std::to_string(y)+" actual "+std::to_string(actual)+" expected "+std::to_string(expected[y*102+x]));}
  ++n;
 }
 check(n==320,"case coverage");
 for(auto v:data.GetNamedArray(L"placements")){const auto row=v.GetObject(),b=row.GetNamedObject(L"bounds");const auto p=position(point(row.GetNamedObject(L"point")),{b.GetNamedNumber(L"width"),b.GetNamedNumber(L"height")},row.GetNamedNumber(L"size"));check(std::abs(p.x-row.GetNamedNumber(L"left"))<1e-10&&std::abs(p.y-row.GetNamedNumber(L"top"))<1e-10,"legacy lens placement");}
 for(auto v:data.GetNamedArray(L"invalid")){const auto row=v.GetObject();const auto z=row.GetNamedValue(L"zoom");double zoom;if(z.ValueType()==JsonValueType::Number)zoom=z.GetNumber();else{const auto s=z.GetString();zoom=s==L"NaN"?std::numeric_limits<double>::quiet_NaN():s==L"Infinity"?std::numeric_limits<double>::infinity():-std::numeric_limits<double>::infinity();}check(pixelScale(zoom)==row.GetNamedNumber(L"scale"),"legacy safe zoom");}
 for(auto v:data.GetNamedArray(L"blends")){const auto row=v.GetObject();check(over(Pixel(row.GetNamedNumber(L"bottom")),Pixel(row.GetNamedNumber(L"top")))==Pixel(row.GetNamedNumber(L"output")),"legacy checker alpha");}
 Field invalid{pixels,{0,0},-12,-12,0,{std::numeric_limits<double>::quiet_NaN(),false,false},false};auto identity=invalid;identity.rotation.degrees=0;check(invalid.at({115,121})==identity.at({115,121}),"invalid rotation identity");
 check(luminance(0xff00d200)>145&&luminance(0xffff0000)<145,"legacy pointer luminance threshold");
 check(clampedByte(10.5)==10&&clampedByte(11.5)==12&&clampedByte(-1)==0&&clampedByte(256)==255,"typed-array nearest-even rounding");
 const auto assets=std::filesystem::path(argv[2]);std::array<SkinPatch,4> masks;int index=0;for(const auto name:{"viewport","eyedropper-magnifier-sampled-mask","eyedropper-magnifier-previous-mask","eyedropper-magnifier-frame"})masks[index++]=importSkinPng(assets/"eyedropper"/(std::string(name)+".png"),64);
 const auto pointer=importSkinPng(assets/"cursors/02-Slice-2.png",32);const std::array<const SkinBitmap*,4> bitmap{masks[0].bitmap.get(),masks[1].bitmap.get(),masks[2].bitmap.get(),masks[3].bitmap.get()};
 Field field{pixels,{3.25,4.125},-9,-8,8,{37.25,true,false},false};const Pixel sampled=0x80443322,previous=0x40665544,ink=0xff090a0d;
 const auto pixel=shell(field,bitmap,*pointer.bitmap,sampled,previous,ink,false),line=shell(field,bitmap,*pointer.bitmap,sampled,previous,ink,true);check(pixel!=line,"both styles consumed");
 int partial=0;for(int y=0;y<128;++y)for(int x=0;x<128;++x){const int i=y*128+x,m=(y/2)*64+x/2;const auto a=masks[3].bitmap->pixels[m]>>24;if(a>0&&a<255){++partial;check(pixel[i]!=ink,"material alpha retained");}if(x<13||x>=115||y<13||y>=115){if(!(masks[1].bitmap->pixels[m]>>24)&&!(masks[2].bitmap->pixels[m]>>24)&&!a)check(pixel[i]==0,"204 canvas is transparent outside field");}}
 check(partial>0,"real partial-alpha frame");check(line[0]==0&&line[64*128+64]>>24==255,"line circle clipping");
 field.distortion=true;check(shell(field,bitmap,*pointer.bitmap,sampled,previous,ink,true)!=line,"distortion consumed by shell");
 std::cout<<n<<" legacy lens fields / "<<n*10404<<" pixels, 64 placements, safe inputs, alpha, original material and both styles passed\n";return 0;
}
}
int wmain(int argc,wchar_t** argv){const auto hr=RoInitialize(RO_INIT_MULTITHREADED);try{const auto result=run(argc,argv);if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return result;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';if(hr==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(hr))RoUninitialize();return 1;}}
