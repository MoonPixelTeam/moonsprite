#pragma once
#include "native_widgets.h"
#include "lua_script_result.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include <iomanip>
#include <sstream>
namespace moon {
// LuaScriptResultDialog.tsx: file, summary, output/error and one Close action.
// Pre-wrap once per width; painting visits visible lines only, even for large
// script output. No worker or Document reference belongs to the report window.
class ScriptReportPane final:public ui::Widget {
 const PixelFont& font_;const Skin& skin_;PixelScrollBar* bar_;
 std::vector<std::u32string> blocks_,lines_;int offset_=0,width_=-1;
 void scrollTo(int value){offset_=std::clamp(value,0,std::max(0,int(lines_.size())*12-bounds().h/uiScale));bar_->configure(int(lines_.size())*12,std::max(1,bounds().h/uiScale),offset_);invalidate();}
 void layout(){
  const auto r=bounds();const int width=std::max(1,r.w/uiScale-15);
  if(width!=width_){width_=width;lines_.clear();for(const auto& text:blocks_){std::u32string line;int used=0;for(auto c:text){if(c==U'\r')continue;if(c==U'\n'){lines_.push_back(std::move(line));line.clear();used=0;continue;}const int advance=font_.measure(std::u32string(1,c));if(!line.empty()&&used+advance>width){lines_.push_back(std::move(line));line.clear();used=0;}line+=c;used+=advance;}lines_.push_back(std::move(line));lines_.push_back({});}}
  bar_->setBounds({r.x2()-7*uiScale,r.y,7*uiScale,r.h});bar_->setVisible(int(lines_.size())*12>r.h/uiScale);scrollTo(offset_);
 }
public:
 ScriptReportPane(const PixelFont& font,const Skin& skin,std::vector<std::u32string> blocks):ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),blocks_(std::move(blocks)){setTransparent(true);setFocusStop(true);bar_=new PixelScrollBar(skin,true);addChild(bar_);bar_->wheelStep=36;bar_->changed=[this](int v){scrollTo(v);};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layout();}
 void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());g.saveClip();g.clipRect({r.x,r.y,std::max(0,r.w-9),r.h});const int first=offset_/12,last=std::min(int(lines_.size()),(offset_+r.h+11)/12);for(int i=first;i<last;++i)font_.draw(g,lines_[i],r.x,r.y+i*12-offset_,skin_["text"]);g.restoreClip();}
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kMouseWheelMessage){scrollTo(offset_+static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*36);return true;}
  if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(key==ui::kKeyUp||key==ui::kKeyDown){scrollTo(offset_+(key==ui::kKeyUp?-12:12));return true;}if(key==ui::kKeyPageUp||key==ui::kKeyPageDown){scrollTo(offset_+(key==ui::kKeyPageUp?-1:1)*bounds().h/uiScale);return true;}}
  return ui::Widget::onProcessMessage(msg);
 }
 int scroll()const{return offset_;}int lineCount()const{return int(lines_.size());}
 void scrollEnd(){scrollTo(int(lines_.size())*12);}
};
class ScriptReportDialog final:public PixelDialog {
 const PixelFont& font_;bool failed_;ScriptReportPane* body_;PixelButton *close_,*done_;
 static std::vector<std::u32string> blocks(const std::optional<script::RunSummary>& summary,const std::string& error){
  std::vector<std::u32string> out;
  if(summary){out.push_back(unicodeText(summary->fileName));if(!summary->filePath.empty())out.push_back(unicodeText(summary->filePath));std::ostringstream elapsed;elapsed<<std::setprecision(15)<<summary->elapsedMs;
   out.push_back(U"修改 "+unicodeText(std::to_string(summary->changedPixelCount))+U" 个像素 · "+unicodeText(std::to_string(summary->transactionCount))+U" 个撤销步骤 · "+unicodeText(elapsed.str())+U" ms");
   if(!summary->output.empty()){out.push_back(U"输出");std::string text;for(std::size_t i=0;i<summary->output.size();++i){if(i)text+='\n';text+=summary->output[i];}out.push_back(unicodeText(text));}
  }else{out.push_back(U"错误");out.push_back(unicodeText(error));}return out;
 }
public:
 ScriptReportDialog(const PixelFont& font,const Skin& skin,const Skin& icons,std::optional<script::RunSummary> summary,std::string error={})
 :PixelDialog(skin,"",ClickBehavior::CloseOnClickInOtherWindow,EnterBehavior::DoNothingOnEnter),font_(font),failed_(!summary){setAutoRemap(false);setWantFocus(true);body_=new ScriptReportPane(font,skin,blocks(summary,error));addChild(body_);done_=new PixelButton(font,skin,U"关闭",[this]{closeWindow(nullptr);});addChild(done_);close_=new PixelButton(font,skin,U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);}
 gfx::Size minimumDialogSize(int)const override{return {360*uiScale,180*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale,footer=DialogLayout::footer(h);layoutHeaderButton(close_);body_->setBounds(uiPhysical({6,DialogLayout::bodyTop,w-12,std::max(1,footer-6-DialogLayout::bodyTop)}).offset(r.origin()));done_->setBounds(uiPhysical({w-62,footer,56,textControlHeight}).offset(r.origin()));}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);drawDialogTitle(font_,g,uiLogical(clientBounds()),failed_?U"脚本错误":U"脚本输出");}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelDialog::onProcessMessage(msg);}
 void verifyLayout(){const auto r=bounds();if(body_->bounds().y!=r.y+DialogLayout::bodyTop*uiScale||body_->bounds().y2()+6*uiScale!=done_->bounds().y||done_->bounds().y2()+6*uiScale!=r.y2())throw std::runtime_error("Script report body/footer spacing");if(body_->lineCount()<1)throw std::runtime_error("Script report has no lines");body_->scrollEnd();if(body_->lineCount()>100&&body_->scroll()==0)throw std::runtime_error("Script report did not scroll");}
 void verifyClose(){done_->Click();}
};
}
