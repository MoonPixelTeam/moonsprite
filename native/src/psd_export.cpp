// Adapted from legacy core/psd.ts and MIT ag-psd psdWriter/descriptor/helpers.
// Copyright (c) 2016 Agamnentzar. See assets/licenses/ag-psd-LICENSE.txt.
#include "psd_export.h"
#include "layer_compositor.h"
#include "layer_panel_tree.h"
#include "cel_properties.h"
#include "aseprite_save_policy.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <functional>
#include <map>
#include <limits>
#include <stdexcept>
namespace moon {namespace {
using Bytes=std::vector<std::uint8_t>;
constexpr std::size_t Budget=256ULL*1024*1024;
[[noreturn]] void bad(const char* message){throw std::runtime_error(message);}
struct Writer {
 Bytes b;
 void reserve(std::size_t n){if(n>Budget-b.size())bad("PSD 输出超出256MiB预算。");}
 void u8(unsigned n){reserve(1);b.push_back(std::uint8_t(n));}
 void u16(unsigned n){u8(n>>8);u8(n);}
 void u32(std::uint32_t n){u16(n>>16);u16(n);}
 void number(double d){std::uint64_t n;std::memcpy(&n,&d,8);u32(unsigned(n>>32));u32(unsigned(n));}
 void raw(const Bytes& data){reserve(data.size());b.insert(b.end(),data.begin(),data.end());}
 void text(const std::string& s){reserve(s.size());b.insert(b.end(),s.begin(),s.end());}
 void pad(std::size_t multiple){while(b.size()%multiple)u8(0);}
 void section(const Writer& child,unsigned alignment=1){u32(unsigned((child.b.size()+alignment-1)/alignment*alignment));raw(child.b);for(auto n=child.b.size();n%alignment;++n)u8(0);}
 void unicode(const std::u32string& name,bool terminator=false){std::vector<unsigned> units;for(auto c:name){if(c>0x10ffff||(c>=0xd800&&c<=0xdfff))bad("PSD 名称Unicode无效。");if(c>0xffff){c-=0x10000;units.push_back(0xd800+(c>>10));units.push_back(0xdc00+(c&1023));}else units.push_back(unsigned(c));}u32(unsigned(units.size()+terminator));for(auto n:units)u16(n);if(terminator)u16(0);}
 void id(const std::string& s){u32(s.size()==4?0:unsigned(s.size()));text(s);}
 void block(const std::string& key,const Writer& payload){text("8BIM");text(key);u32(unsigned(payload.b.size()));raw(payload.b);if(payload.b.size()%2)u8(0);}
};
// The Photoshop action descriptor subset emitted by legacy psdLayerEffects.
struct Field {std::string key,type;Writer value;};
struct Descriptor {
 std::string name,kind="null";std::vector<Field> fields;
 explicit Descriptor(std::string k="null",std::string n=""):name(std::move(n)),kind(std::move(k)){}
 void add(std::string key,std::string type,Writer value){fields.push_back({std::move(key),std::move(type),std::move(value)});}
 void boolean(const std::string& key,bool b){Writer w;w.u8(b);add(key,"bool",std::move(w));}
 void integer(const std::string& key,int n){Writer w;w.u32(n);add(key,"long",std::move(w));}
 void real(const std::string& key,double n){Writer w;w.number(n);add(key,"doub",std::move(w));}
 void unit(const std::string& key,const std::string& unit,double n){Writer w;w.text(unit);w.number(n);add(key,"UntF",std::move(w));}
 void enumeration(const std::string& key,const std::string& type,const std::string& value){Writer w;w.id(type);w.id(value);add(key,"enum",std::move(w));}
 void text(const std::string& key,const std::u32string& value){Writer w;w.unicode(value,true);add(key,"TEXT",std::move(w));}
 Writer encode()const{Writer w;w.unicode(std::u32string(name.begin(),name.end()),true);w.id(kind);w.u32(unsigned(fields.size()));for(const auto& f:fields){w.id(f.key);w.text(f.type);w.raw(f.value.b);}return w;}
 void object(const std::string& key,const Descriptor& d){add(key,"Objc",d.encode());}
 void list(const std::string& key,const std::vector<Descriptor>& ds){Writer w;w.u32(unsigned(ds.size()));for(const auto& d:ds){w.text("Objc");w.raw(d.encode().b);}add(key,"VlLs",std::move(w));}
};
Descriptor color(Pixel p){Descriptor d("RGBC");d.real("Rd  ",p&255);d.real("Grn ",(p>>8)&255);d.real("Bl  ",(p>>16)&255);return d;}
Descriptor effect(const std::string& kind,Pixel p){Descriptor d(kind);d.boolean("enab",true);d.boolean("present",true);d.boolean("showInDialog",true);d.enumeration("Md  ","BlnM","Nrml");d.object("Clr ",color(p));d.unit("Opct","#Prc",(p>>24)*100./255);return d;}
Writer effects(const std::optional<timeline::ColorOverlayStyle>& style,double scale){Writer out;if(!timeline::styleVisible(style))return out;const auto& s=*style;Descriptor all;all.unit("Scl ","#Prc",100);all.boolean("masterFXSwitch",true);int count=0;
 if(s.stroke.enabled){auto d=effect("FrFX",s.stroke.color);d.enumeration("Styl","FStl",s.stroke.position==0?"InsF":s.stroke.position==1?"OutF":"CtrF");d.enumeration("PntT","FrFl","SClr");d.unit("Sz  ","#Pxl",s.stroke.size*scale);all.object("FrFX",d);++count;}
 if(s.shadow.enabled){auto d=effect("DrSh",s.shadow.color);Descriptor contour("ShpC");contour.text("Nm  ",U"");contour.list("Crv ",{});d.object("TrnS",contour);d.unit("blur","#Pxl",s.shadow.blur*scale);double angle=s.shadow.offsetX||s.shadow.offsetY?std::atan2(double(s.shadow.offsetY),-double(s.shadow.offsetX))*180/3.141592653589793:90;d.unit("lagl","#Ang",std::fmod(angle+360,360));d.unit("Dstn","#Pxl",std::hypot(s.shadow.offsetX,s.shadow.offsetY)*scale);d.boolean("uglg",false);d.boolean("AntA",false);all.object("DrSh",d);++count;}
 if(s.innerGlow.enabled){auto d=effect("IrGl",s.innerGlow.color);d.unit("blur","#Pxl",s.innerGlow.size*scale);d.enumeration("glwS","IGSr","SrcE");d.enumeration("GlwT","BETE","PrBL");d.boolean("AntA",false);all.object("IrGl",d);++count;}
 if(s.overlayEnabled){all.object("SoFi",effect("SoFi",s.color));++count;}
 if(s.gradientEnabled){Descriptor d("GrFl");d.boolean("enab",true);d.boolean("present",true);d.boolean("showInDialog",true);d.enumeration("Md  ","BlnM","Nrml");d.unit("Opct","#Prc",100);d.boolean("Algn",true);d.unit("Scl ","#Prc",100);d.boolean("Dthr",s.gradientDither!=0);d.boolean("Rvrs",false);d.enumeration("Type","GrdT","Lnr ");d.unit("Angl","#Ang",(s.gradientAngle%360+360)%360);d.enumeration("gs99","gradientInterpolationMethodType","Gcls");Descriptor grad("Grdn","Gradient");grad.text("Nm  ",U"MoonSprite");grad.enumeration("GrdF","GrdF","CstS");grad.integer("Intr",4096);std::vector<Descriptor> colors,alphas;int position=0;for(auto p:{s.gradientFrom,s.gradientTo}){Descriptor c("Clrt");c.object("Clr ",color(p));c.enumeration("Type","Clry","UsrS");c.integer("Lctn",position);c.integer("Mdpn",50);colors.push_back(c);Descriptor a("TrnS");a.unit("Opct","#Prc",(p>>24)*100./255);a.integer("Lctn",position);a.integer("Mdpn",50);alphas.push_back(a);position=4096;}grad.list("Clrs",colors);grad.list("Trns",alphas);d.object("Grad",grad);all.object("GrFl",d);++count;}
 // Gradient map has no PSD effect in legacy encodePsd and is not invented here.
 if(!count)return out;all.integer("numModifyingFX",count);out.u32(0);out.u32(16);out.raw(all.encode().b);return out;
}
std::string blend(const std::string& name){static const std::map<std::string,std::string> modes={{"normal","norm"},{"multiply","mul "},{"screen","scrn"},{"overlay","over"},{"darken","dark"},{"lighten","lite"},{"color-burn","idiv"},{"linear-burn","lbrn"},{"color-dodge","div "},{"linear-dodge","lddg"},{"soft-light","sLit"},{"hard-light","hLit"},{"vivid-light","vLit"},{"linear-light","lLit"},{"pin-light","pLit"},{"hard-mix","hMix"},{"difference","diff"},{"exclusion","smud"},{"subtract","fsub"},{"divide","fdiv"},{"hue","hue "},{"saturation","sat "},{"color","colr"},{"luminosity","lum "}};auto it=modes.find(name);if(it==modes.end())bad("PSD 无法表示此混合模式。");return it->second;}
struct Raster {int x=0,y=0,w=0,h=0;Bytes rgba;};
Raster scaled(const timeline::Surface& s,double sx,double sy,bool mask=false){if(s.width<1||s.height<1||s.pixels.size()!=std::size_t(s.width)*s.height)bad("PSD 图层像素无效。");int left=s.width,top=s.height,right=0,bottom=0;for(int y=0;y<s.height;++y)for(int x=0;x<s.width;++x)if(s.pixels[std::size_t(y)*s.width+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}if(right<=left||bottom<=top)return {};const double wx=double(s.offsetX)+left,wy=double(s.offsetY)+top;Raster r;const double x=std::ceil(wx*sx),y=std::ceil(wy*sy),endX=std::ceil((double(s.offsetX)+right)*sx),endY=std::ceil((double(s.offsetY)+bottom)*sy);if(x<std::numeric_limits<int>::min()||y<std::numeric_limits<int>::min()||endX>std::numeric_limits<int>::max()||endY>std::numeric_limits<int>::max()||endX-x>std::numeric_limits<int>::max()||endY-y>std::numeric_limits<int>::max())bad("PSD 缩放后图层坐标超限。");r.x=int(x);r.y=int(y);r.w=int(endX-x);r.h=int(endY-y);if(r.w<=0||r.h<=0)return {};if(std::uint64_t(r.w)*r.h>Budget/4)bad("PSD 展开图层超出预算。");r.rgba.resize(std::size_t(r.w)*r.h*4);for(int y=0;y<r.h;++y)for(int x=0;x<r.w;++x){const int px=std::clamp(int(std::floor((double(r.x)+x)/sx)-s.offsetX),left,right-1),py=std::clamp(int(std::floor((double(r.y)+y)/sy)-s.offsetY),top,bottom-1);auto p=s.pixels[std::size_t(py)*s.width+px];if(mask){const unsigned value=p>>24?p&255:255;p=0xff000000|value|(value<<8)|(value<<16);}const auto at=(std::size_t(y)*r.w+x)*4;for(int c=0;c<4;++c)r.rgba[at+c]=std::uint8_t(p>>(8*c));}if(!mask){int l=r.w,t=r.h,right=0,bottom=0;for(int y=0;y<r.h;++y)for(int x=0;x<r.w;++x)if(r.rgba[(std::size_t(y)*r.w+x)*4+3]){l=std::min(l,x);t=std::min(t,y);right=std::max(right,x+1);bottom=std::max(bottom,y+1);}if(right<=l||bottom<=t)return {};if(l||t||right!=r.w||bottom!=r.h){Bytes trimmed(std::size_t(right-l)*(bottom-t)*4);for(int y=t;y<bottom;++y)std::copy_n(r.rgba.begin()+(std::size_t(y)*r.w+l)*4,(right-l)*4,trimmed.begin()+std::size_t(y-t)*(right-l)*4);r.x+=l;r.y+=t;r.w=right-l;r.h=bottom-t;r.rgba=std::move(trimmed);}}return r;}
// Legacy ag-psd helpers::writeDataRLE: PackBits per channel per row.
Bytes rleRow(const std::uint8_t* row,int width,int stride){
 Bytes b;const int last=width-1,last2=last-1;
 for(int p=0;p<width;++p){
  if(p<last2){auto v1=row[p*stride];auto v2=row[++p*stride];auto v3=row[++p*stride];
   if(v1==v2&&v1==v3){int count=3;while(count<128&&p<last&&row[(p+1)*stride]==v1){++count;++p;}b.push_back(std::uint8_t(1-count));b.push_back(v1);}
   else{const auto countIndex=b.size();bool writeLast=true;int count=1;b.push_back(0);b.push_back(v1);
    while(p<last&&count<128){++p;v1=v2;v2=v3;v3=row[p*stride];if(v1==v2&&v1==v3){p-=3;writeLast=false;break;}++count;b.push_back(v1);}
    if(writeLast){if(count<127){b.push_back(v2);b.push_back(v3);count+=2;}else if(count<128){b.push_back(v2);++count;--p;}else p-=2;}b[countIndex]=std::uint8_t(count-1);
   }
  }else if(p==last){b.push_back(0);b.push_back(row[p*stride]);}else{b.push_back(1);b.push_back(row[p*stride]);b.push_back(row[++p*stride]);}
 }return b;
}
Writer channel(const Raster& r,int component){Writer out;if(!r.w||!r.h){out.u16(0);return out;}Writer sizes,data;for(int y=0;y<r.h;++y){auto row=rleRow(r.rgba.data()+std::size_t(y)*r.w*4+component,r.w,4);if(row.size()>65535)bad("PSD RLE行过长。");sizes.u16(unsigned(row.size()));data.raw(row);}out.u16(1);out.raw(sizes.b);out.raw(data.b);return out;}
struct Record {std::u32string name;std::string mode="norm",groupMode;bool visible=true,locked=false,clip=false;double opacity=1;unsigned section=0;Raster pixels,mask;bool hasMask=false,maskVisible=true;Writer fx;};
void writeRecord(Writer& info,Writer& data,const Record& r){std::vector<std::pair<int,Writer>> channels;for(int c:{3,0,1,2})channels.emplace_back(c==3?-1:c,channel(r.pixels,c));if(r.hasMask)channels.emplace_back(-2,channel(r.mask,0));info.u32(r.pixels.y);info.u32(r.pixels.x);info.u32(r.pixels.y+r.pixels.h);info.u32(r.pixels.x+r.pixels.w);info.u16(unsigned(channels.size()));for(const auto& c:channels){info.u16(c.first);info.u32(unsigned(c.second.b.size()));data.raw(c.second.b);}info.text("8BIM");info.text(r.mode);info.u8(unsigned(std::floor(std::clamp(r.opacity,0.,1.)*255+.5)));info.u8(r.clip);info.u8(8|(r.locked?1:0)|(r.visible?0:2)|(r.section?16:0)|(r.fx.b.empty()?0:32));info.u8(0);Writer extra,mask;if(r.hasMask){mask.u32(r.mask.y);mask.u32(r.mask.x);mask.u32(r.mask.y+r.mask.h);mask.u32(r.mask.x+r.mask.w);mask.u8(255);mask.u8(r.maskVisible?0:2);mask.u16(0);}extra.section(mask);extra.u32(0);extra.u8(0);extra.u8(0);extra.u8(0);extra.u8(0);Writer name;name.unicode(r.name);extra.block("luni",name);if(r.locked){Writer lock;lock.u32(7);extra.block("lspf",lock);}if(r.section){Writer group;group.u32(r.section);if(r.section!=3){group.text("8BIM");group.text(r.groupMode);group.u32(0);}extra.block("lsct",group);}if(!r.fx.b.empty())extra.block("lfx2",r.fx);info.section(extra);}
}
bool isPsdSavePath(const std::filesystem::path& path){auto ext=path.extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return std::towlower(c);});return ext==L".psd";}
std::filesystem::path normalizedPsdSavePath(std::filesystem::path path){if(isPsdSavePath(path))return path;if(isAsepriteSavePath(path)){path.replace_extension(L".psd");return path;}return normalizedAsepriteSavePath(std::move(path),L".psd");}
std::vector<std::string> psdSaveIssues(const Document& d){const auto& s=d.timeline().state();std::vector<std::string> issues;if(s.frames.size()>1)issues.push_back("frames");if(!s.loopSections.empty())issues.push_back("loops");if(std::any_of(s.frames.begin(),s.frames.end(),[](const auto& f){return f.disabled;}))issues.push_back("frameFlags");if(std::any_of(s.layers.begin(),s.layers.end(),[](const auto& l){return !l.kind.empty();})||std::any_of(s.cels.begin(),s.cels.end(),[](const auto& c){return c.text.has_value();}))issues.push_back("editable");if(!d.projectBrushes().empty()||!s.tilesets.empty()||!d.slices().empty())issues.push_back("resources");if(!d.timelapseSettings().snapshots.empty())issues.push_back("timelapse");return issues;}
std::u32string psdExportNotice(const Document&){return U"PSD 导出当前帧，保留图层、图层组、透明度、混合模式、剪贴、蒙版和旧版支持的图层效果。文字、网格瓦片、自由瓦片与背景以栅格图层保存；动画及 MoonSprite 专用编辑信息不会写入 PSD。";}
std::vector<std::uint8_t> encodePsd(const Document& d,int scalePercent){const auto& timeline=d.timeline();const auto& state=timeline.state();if(state.frames.empty()||state.layers.size()+2*state.groups.size()>32767||!timeline.diagnoseLinks().empty())bad("PSD 时间轴关系无效。");const double scale=std::clamp(scalePercent/100.,.01,64.);const int w=std::max(1,int(std::floor(d.width()*scale+.5))),h=std::max(1,int(std::floor(d.height()*scale+.5)));if(w>30000||h>30000||std::uint64_t(w)*h>Budget/8)bad("PSD 画布尺寸或展开预算超限。");const double sx=double(w)/d.width(),sy=double(h)/d.height();std::map<std::string,const timeline::Layer*> layers;std::map<std::string,const timeline::Group*> groups;for(const auto& l:state.layers)layers[l.id]=&l;for(const auto& g:state.groups)groups[g.id]=&g;const auto rows=buildLayerPanelTree(state);std::vector<Record> records;std::size_t rasterBytes=0;auto charge=[&](const Raster& r){if(r.rgba.size()>Budget-rasterBytes)bad("PSD 图层总像素超出预算。");rasterBytes+=r.rgba.size();};
 auto common=[&](Record& r,const auto& owner){r.name=owner.name;r.mode=blend(owner.blendMode);r.visible=owner.visible;r.locked=owner.locked;r.clip=owner.clippingMask;r.opacity=owner.opacity;r.fx=effects(owner.layerStyles,scale);if(const auto* mask=timeline::resolvedMask(state,owner.id,d.frame().id)){r.hasMask=true;r.maskVisible=mask->visible;r.mask=scaled(mask->surface,sx,sy,true);charge(r.mask);}};
 std::function<void(std::size_t&,int)> visit=[&](std::size_t& at,int depth){if(depth>128)bad("PSD 图层组嵌套超过原生预算。");while(at<rows.size()&&rows[at].depth==depth){const auto row=rows[at++];Record r;if(row.kind==LayerPanelKind::Group){const auto& g=*groups.at(row.id);common(r,g);r.section=1;r.groupMode=g.blendMode=="normal"&&g.opacity==1&&!g.cumulativeBlend&&!r.hasMask&&r.fx.b.empty()?"pass":r.mode;r.mode=r.groupMode=="pass"?"norm":r.groupMode;records.push_back(std::move(r));visit(at,depth+1);Record end;end.name=U"</Layer group>";end.section=3;records.push_back(end);}else{const auto& l=*layers.at(row.id);common(r,l);r.opacity=frameCelOpacity(timeline,l,d.frame().id);if(!l.kind.empty()&&l.kind!="text"&&l.kind!="tilemap"&&l.kind!="free-tile")bad("PSD 包含尚未承接的图层类型。");const auto* cel=timeline.findCel(l.id,d.frame().id);if(cel){auto resolved=timeline.resolveSurface(cel->id);if(resolved.surface)r.pixels=scaled(*resolved.surface,sx,sy);}charge(r.pixels);records.push_back(std::move(r));}}};std::size_t at=0;visit(at,0);if(at!=rows.size()||records.empty()||records.size()>32767)bad("PSD 图层组关系或数量无效。");std::reverse(records.begin(),records.end());
 const auto original=compositeNormalRegion(timeline,d.frame().id,{0,0,d.width(),d.height()});Raster composite;composite.w=w;composite.h=h;composite.rgba.resize(std::size_t(w)*h*4);bool alpha=false;for(int y=0;y<h;++y)for(int x=0;x<w;++x){auto p=original[std::size_t(std::min(d.height()-1,int(std::floor(double(y)*d.height()/h))))*d.width()+std::min(d.width()-1,int(std::floor(double(x)*d.width()/w)))];alpha=alpha||(p>>24)!=255;const auto dst=(std::size_t(y)*w+x)*4;for(int c=0;c<4;++c)composite.rgba[dst+c]=std::uint8_t(p>>(c*8));}charge(composite);
 Writer out;out.text("8BPS");out.u16(1);for(int n=0;n<6;++n)out.u8(0);out.u16(alpha?4:3);out.u32(h);out.u32(w);out.u16(8);out.u16(3);out.u32(0);out.u32(0);Writer info,channelData;info.u16(alpha?-int(records.size()):int(records.size()));for(const auto& r:records)writeRecord(info,channelData,r);info.raw(channelData.b);Writer layerMask;layerMask.section(info,4);layerMask.u32(0);out.section(layerMask,2);
 // Legacy composite stores white-matted RGB, restored when global alpha is set.
 if(alpha)for(std::size_t p=0;p<composite.rgba.size();p+=4){const auto a=composite.rgba[p+3];if(a&&a!=255)for(int c=0;c<3;++c)composite.rgba[p+c]=std::uint8_t(std::nearbyint(composite.rgba[p+c]*(a/255.)+255-a));}
 Writer lengths,compressed;for(int c=0;c<(alpha?4:3);++c){auto encoded=channel(composite,c);lengths.raw(Bytes(encoded.b.begin()+2,encoded.b.begin()+2+2*h));compressed.raw(Bytes(encoded.b.begin()+2+2*h,encoded.b.end()));}out.u16(1);out.raw(lengths.b);out.raw(compressed.b);return out.b;
}
}
