#include "theme_atlas.h"
#include <windows.h>
#include <xmllite.h>
#include <shlwapi.h>
#include <wrl/client.h>
#include <algorithm>
#include <fstream>
#include <set>
#include <stdexcept>

namespace moon {
namespace {
void need(bool value,const std::string& error) {if(!value) throw std::runtime_error(error);}
std::string utf8(const wchar_t* p,UINT n) {
  if(!n) return {};
  const int size=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,p,int(n),nullptr,0,nullptr,nullptr);
  need(size>0,"Invalid XML text"); std::string s(size,'\0');
  need(WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,p,int(n),s.data(),size,nullptr,nullptr)>0,"Invalid XML text");return s;
}
struct Node {
  std::string tag;
  std::map<std::string,std::string> attrs;
  std::vector<Node> children;
  std::string get(const std::string& key,const std::string& fallback="") const {auto i=attrs.find(key);return i==attrs.end()?fallback:i->second;}
};
Node parse(const std::filesystem::path& path) {
  const auto size=std::filesystem::file_size(path);need(size>0 && size<=1024*1024,"Theme XML must be 1 byte..1 MiB");
  std::ifstream f(path,std::ios::binary);std::vector<BYTE> bytes(static_cast<std::size_t>(size));
  need(bool(f.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(size))),"Cannot read theme XML");
  Microsoft::WRL::ComPtr<IStream> stream;stream.Attach(SHCreateMemStream(bytes.data(),UINT(bytes.size())));need(bool(stream),"Cannot read XML stream");
  Microsoft::WRL::ComPtr<IXmlReader> reader;
  need(SUCCEEDED(CreateXmlReader(__uuidof(IXmlReader),reinterpret_cast<void**>(reader.GetAddressOf()),nullptr)),"Cannot create XML reader");
  need(SUCCEEDED(reader->SetProperty(XmlReaderProperty_DtdProcessing,DtdProcessing_Prohibit)),"Cannot disable XML DTD");
  need(SUCCEEDED(reader->SetInput(stream.Get())),"Cannot set XML input");
  Node root; std::vector<Node*> stack{&root};XmlNodeType type;HRESULT hr;int count=0;
  while((hr=reader->Read(&type))==S_OK) {
    if(type==XmlNodeType_Element) {
      need(++count<=4096 && stack.size()<8,"Theme XML is too complex");
      const wchar_t* p=nullptr;UINT n=0;need(SUCCEEDED(reader->GetLocalName(&p,&n)),"Invalid element");
      Node node;node.tag=utf8(p,n);const bool empty=reader->IsEmptyElement()!=FALSE;
      if(reader->MoveToFirstAttribute()==S_OK) {
        do {
          need(SUCCEEDED(reader->GetLocalName(&p,&n)),"Invalid attribute");const auto key=utf8(p,n);
          need(SUCCEEDED(reader->GetValue(&p,&n)),"Invalid attribute value");
          need(node.attrs.emplace(key,utf8(p,n)).second,"Duplicate attribute");
        } while(reader->MoveToNextAttribute()==S_OK);
        reader->MoveToElement();
      }
      stack.back()->children.push_back(std::move(node));
      if(!empty) stack.push_back(&stack.back()->children.back());
    } else if(type==XmlNodeType_EndElement) {
      need(stack.size()>1,"Invalid XML nesting");stack.pop_back();
    } else need(type==XmlNodeType_Whitespace || type==XmlNodeType_Comment || type==XmlNodeType_XmlDeclaration,"Unsupported XML content");
  }
  need(hr==S_FALSE && stack.size()==1 && root.children.size()==1,"Malformed theme XML");return std::move(root.children[0]);
}
void attrs(const Node& node,std::initializer_list<const char*> allowed) {
  for(const auto& [key,value]:node.attrs) need(std::find(allowed.begin(),allowed.end(),key)!=allowed.end(),"Unsupported attribute: "+node.tag+"/"+key);
}
int integer(const Node& node,const char* key,int fallback=-1,int low=0,int high=1024) {
  const auto v=node.get(key);if(v.empty()) {need(fallback!=-1,std::string("Missing attribute: ")+key);return fallback;}
  std::size_t used=0;const auto n=std::stol(v,&used);
  need(used==v.size() && n>=low && n<=high,std::string("Invalid integer: ")+key);return int(n);
}
void validId(const std::string& s) {need(!s.empty() && s.size()<=80 && s.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-")==std::string::npos,"Invalid theme id");}
std::string runtimeId(std::string id) {
  if(id=="panel_title") return "panel.title";
  if(id=="tool_pencil") return "tool.pencil";
  if(id=="tool_eraser") return "tool.eraser";
  return id;
}
bool live(const std::string& id) {
  static const std::set<std::string> ids{"button","document_frame","palette","panel_tab_active","panel_tab_inactive","panel_outer","panel_content","panel_tab_join_left","panel_tab_join_right","menu_bar","menu_popup","menu_item","menu_item_hover","menu_hover"};
  return id.rfind("cursor.",0)==0 || id.rfind("timeline.",0)==0 || id.rfind("icon.",0)==0 || ids.count(id)!=0 || id=="dialog_frame" || id.rfind("text_button.",0)==0 || id.rfind("icon_button.",0)==0 || id.rfind("entry.",0)==0 || id.rfind("slider.",0)==0 || id.rfind("role_button.",0)==0;
}
std::string state(const std::string& s) {
  if(s.empty()) return "normal";if(s=="mouse") return "hover";if(s=="selected") return "selected";
  need(s=="disabled" || s=="focus","Unsupported state combination: "+s);return s;
}
}
ThemeAtlas loadThemeAtlas(const std::filesystem::path& path) {
  auto root=parse(path);need(root.tag=="theme","Expected theme root");attrs(root,{"name","screenscaling","uiscaling"});
  need(integer(root,"screenscaling",2)==2 && integer(root,"uiscaling",1)==1,"Theme must use screen scale 2 and UI scale 1");
  std::map<std::string,const Node*> sections;
  for(const auto& child:root.children) {need(child.tag=="parts" || child.tag=="styles" || child.tag=="colors" || child.tag=="fonts","Unsupported section: "+child.tag);need(sections.emplace(child.tag,&child).second,"Duplicate theme section");attrs(child,{});}
  need(sections.count("parts") && sections.count("styles"),"Theme requires parts and styles");
  ThemeAtlas theme; theme.sheet=importSkinPng(path.parent_path()/"sheet.png",1024).bitmap;theme.assets.themeXml=std::filesystem::absolute(path);
  if(sections.count("fonts")) for(const auto& n:sections.at("fonts")->children) {
    attrs(n,{"id","font","size"});need(n.tag=="font" && n.children.empty() && n.get("id")=="default" && n.get("font")=="Fusion Pixel" && integer(n,"size",10)==10,"Only Fusion Pixel 10px default font is supported");
  }
  if(sections.count("colors")) for(const auto& n:sections.at("colors")->children) {
    attrs(n,{"id","value"});need(n.tag=="color" && n.children.empty(),"Invalid color element");const auto id=n.get("id"),v=n.get("value");validId(id);
    need(v.size()==7 && v[0]=='#' && v.substr(1).find_first_not_of("0123456789abcdefABCDEF")==std::string::npos,"Colors must be #RRGGBB");
    const auto c=std::stoul(v.substr(1),nullptr,16);const auto rgba=0xff000000u|((c&255)<<16)|(c&0xff00)|(c>>16);
    need(theme.assets.colors.emplace(id,rgba).second,"Duplicate color id");
  }
  std::map<std::string,std::size_t> partIndex;
  for(const auto& n:sections.at("parts")->children) {
    need(n.tag=="part" && n.children.empty(),"Invalid part element");attrs(n,{"id","x","y","w","h","w1","w2","w3","h1","h2","h3","focusx","focusy"});
    ThemePart p;p.id=n.get("id");validId(p.id);p.x=integer(n,"x");p.y=integer(n,"y");p.nineSlice=n.attrs.count("w1")!=0;
    int left=0,top=0,right=0,bottom=0;
    if(p.nineSlice) {
      need(!n.attrs.count("w") && !n.attrs.count("h"),"Mixed rectangle and nine-slice dimensions");
      left=integer(n,"w1");right=integer(n,"w3");top=integer(n,"h1");bottom=integer(n,"h3");
      p.w=left+integer(n,"w2",-1,1)+right;p.h=top+integer(n,"h2",-1,1)+bottom;
    } else {
      for(auto key:{"w2","w3","h1","h2","h3"}) need(!n.attrs.count(key),"Incomplete nine-slice definition");
      p.w=integer(n,"w",-1,1);p.h=integer(n,"h",-1,1);
    }
    need(p.x+p.w<=theme.sheet->width && p.y+p.h<=theme.sheet->height,"Part outside sheet: "+p.id);
    if(n.attrs.count("focusx")) integer(n,"focusx",0,0,p.w-1);
    if(n.attrs.count("focusy")) integer(n,"focusy",0,0,p.h-1);
    auto bitmap=std::make_shared<SkinBitmap>();bitmap->width=p.w;bitmap->height=p.h;bitmap->pixels.reserve(p.w*p.h);
    for(int y=0;y<p.h;++y) for(int x=0;x<p.w;++x) bitmap->pixels.push_back(theme.sheet->pixels[(p.y+y)*theme.sheet->width+p.x+x]);
    p.patch={bitmap,left,top,right,bottom};validatePatch(p.patch);
    need(partIndex.emplace(p.id,theme.parts.size()).second,"Duplicate part id: "+p.id);theme.parts.push_back(std::move(p));
    need(theme.parts.size()<=512,"Too many theme parts");
  }
  need(!theme.parts.empty(),"Theme has no parts");std::set<std::string> styleIds;
  for(const auto& n:sections.at("styles")->children) {
    need(n.tag=="style","Invalid style element");attrs(n,{"id"});const auto id=n.get("id");validId(id);need(styleIds.insert(id).second,"Duplicate style id");
    const auto runtime=runtimeId(id);
    for(const auto& layer:n.children) {
      need(layer.children.empty(),"Nested style layers unsupported");
      const auto suffix=state(layer.get("state"));const auto key=runtime+(runtime=="button"?"."+suffix:"");
      need(runtime=="button" || suffix=="normal","State variants currently supported on button style only");
      if(layer.tag=="text") {
        attrs(layer,{"color","x","y","state"});const auto color=layer.get("color");need(theme.assets.colors.count(color)!=0,"Undefined text color: "+color);
        SkinAssets::TextStyle text{color,integer(layer,"x",0,-32,32),integer(layer,"y",0,-32,32)};
        need(theme.assets.text.emplace(key,text).second,"Duplicate text layer");
        if(runtime=="button" && suffix=="selected") theme.assets.text["button.pressed"]=text;
      } else {
        need(layer.tag=="background-border" || layer.tag=="icon","Unsupported style layer: "+layer.tag);attrs(layer,{"part","state"});
        auto found=partIndex.find(layer.get("part"));need(found!=partIndex.end(),"Undefined style part: "+layer.get("part"));
        auto& p=theme.parts[found->second];need(layer.tag=="icon" || p.nineSlice,"Background-border requires a nine-slice part");
        if(runtime.rfind("tool.",0)==0) need(p.w<=20 && p.h<=20,"Tool icon must fit 20x20 pixels");
        need(theme.assets.patches.emplace(key,p.patch).second,"Multiple image layers unsupported");
        p.connected=p.connected||live(runtime);
        if(runtime=="button" && suffix=="selected") theme.assets.patches["button.pressed"]=p.patch;
      }
    }
  }
  return theme;
}
}
