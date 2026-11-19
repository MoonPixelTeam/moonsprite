#pragma once
#include "native_widgets.h"
#include "lua_script_result.h"
#include "native_text_clipboard.h"
#include "pixel_input_menu.h"
#include "text_edit_navigation.h"
#include "ui/system.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include <iomanip>
#include <sstream>
namespace moon {
// LuaScriptResultDialog.tsx: file, summary, output/error and one Close action.
// Pre-wrap once per width; painting visits visible lines only, even for large
// script output. No worker or Document reference belongs to the report window.
class ScriptReportPane final:public ui::Widget {
 struct Line {int start,end;};
 const PixelFont& font_;const Skin& skin_;PixelScrollBar* bar_;
 std::u32string text_;std::vector<Line> lines_;int offset_=0,width_=-1,anchor_=0,caret_=0,preferredX_=-1;bool selecting_=false;
 gfx::Point pointer_;ui::Timer selectionTimer_{30,this};
 std::function<bool(const std::string&)> copy_=[](const std::string& value){return trySetInputClipboardText(value);};
 int lineFor(int index)const{auto it=std::upper_bound(lines_.begin(),lines_.end(),index,[](int value,const Line& line){return value<line.start;});return std::max(0,int(it-lines_.begin())-1);}
 int xAt(int row,int index)const{return font_.measure(text_.substr(lines_[row].start,std::clamp(index,lines_[row].start,lines_[row].end)-lines_[row].start));}
 int columnAt(int row,int x)const{int used=0;for(int i=lines_[row].start;i<lines_[row].end;++i){const int advance=font_.measure(text_.substr(i,1));if(x<used+(advance+1)/2)return i;used+=advance;}return lines_[row].end;}
 void scrollTo(int value){offset_=std::clamp(value,0,std::max(0,(int(lines_.size())+1)*12-bounds().h/uiScale));bar_->configure((int(lines_.size())+1)*12,std::max(1,bounds().h/uiScale),offset_);invalidate();}
 void layout(){const auto r=bounds();const int width=std::max(1,r.w/uiScale-15);if(width!=width_){width_=width;lines_.clear();int start=0,used=0;for(int i=0;i<int(text_.size());++i){if(text_[i]==U'\n'){lines_.push_back({start,i});start=i+1;used=0;continue;}const int advance=font_.measure(text_.substr(i,1));if(i>start&&used+advance>width){lines_.push_back({start,i});start=i;used=0;}used+=advance;}lines_.push_back({start,int(text_.size())});}bar_->setBounds({r.x2()-7*uiScale,r.y,7*uiScale,r.h});bar_->setVisible((int(lines_.size())+1)*12>r.h/uiScale);scrollTo(offset_);}
 int indexAt(gfx::Point point)const{const auto r=bounds();const int y=std::clamp((point.y-r.y)/uiScale+offset_,0,std::max(0,int(lines_.size())*12-1));return columnAt(y/12,(point.x-r.x)/uiScale);}
 void stopSelection(){selectionTimer_.stop();selecting_=false;if(hasCapture())releaseMouse();}
 void move(int index,bool extend,bool vertical=false){caret_=std::clamp(index,0,int(text_.size()));if(!extend)anchor_=caret_;if(!vertical)preferredX_=-1;const int y=lineFor(caret_)*12;if(y<offset_)scrollTo(y);else if(y+12>offset_+bounds().h/uiScale)scrollTo(y+12-bounds().h/uiScale);invalidate();}
 void copySelection(){if(caret_!=anchor_)copy_(utf8Text(text_.substr(std::min(caret_,anchor_),std::abs(caret_-anchor_))));}
 void menu(gfx::Point position){PixelInputMenu menu(skin_);auto copy=new PixelMenuItem(font_,skin_,U"复制",U"Ctrl+C");copy->setEnabled(anchor_!=caret_);copy->Click.connect([this]{copySelection();});menu.addChild(copy);auto all=new PixelMenuItem(font_,skin_,U"全选",U"Ctrl+A");all->Click.connect([this]{anchor_=0;caret_=int(text_.size());invalidate();});menu.addChild(all);menu.showPopup(position,display());requestFocus();}
public:
 ScriptReportPane(const PixelFont& font,const Skin& skin,std::vector<std::u32string> blocks):ui::Widget(ui::kGenericWidget),font_(font),skin_(skin){for(std::size_t i=0;i<blocks.size();++i){if(i)text_+=U"\n\n";for(std::size_t c=0;c<blocks[i].size();++c){if(blocks[i][c]==U'\r'){text_+=U'\n';if(c+1<blocks[i].size()&&blocks[i][c+1]==U'\n')++c;}else text_+=blocks[i][c];}}setTransparent(true);setFocusStop(true);bar_=new PixelScrollBar(skin,true);addChild(bar_);bar_->wheelStep=36;bar_->changed=[this](int v){scrollTo(v);};selectionTimer_.Tick.connect([this]{if(!selecting_||!hasCapture()){stopSelection();return;}const auto r=bounds();if(pointer_.y<r.y)scrollTo(offset_-12);else if(pointer_.y>=r.y2())scrollTo(offset_+12);caret_=indexAt(pointer_);invalidate();});}
 ~ScriptReportPane(){stopSelection();}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layout();}
 void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());g.saveClip();g.clipRect({r.x,r.y,std::max(0,r.w-9),r.h});const auto lo=std::min(anchor_,caret_),hi=std::max(anchor_,caret_);const int first=offset_/12,last=std::min(int(lines_.size()),(offset_+r.h+11)/12);for(int i=first;i<last;++i){const auto line=lines_[i];if(lo<=line.end&&hi>line.start){const int left=xAt(i,std::max(lo,line.start)),right=xAt(i,std::min(hi,line.end));g.fillRect(skin_["accent"],{r.x+left,r.y+i*12-offset_,std::max(hi>line.end?3:0,right-left),10});}font_.draw(g,text_.substr(line.start,line.end-line.start),r.x,r.y+i*12-offset_,skin_["text"]);}g.restoreClip();}
 bool onProcessMessage(ui::Message* msg)override{
  if(msg->type()==ui::kFocusLeaveMessage)stopSelection();
  if(msg->type()==ui::kMouseDownMessage){auto mouse=static_cast<ui::MouseMessage*>(msg);requestFocus();pointer_=mouse->position();if(mouse->right()){stopSelection();const int index=indexAt(pointer_);if(index<std::min(anchor_,caret_)||index>std::max(anchor_,caret_))anchor_=caret_=index;menu(pointer_);return true;}if(mouse->left()){caret_=indexAt(pointer_);if(!mouse->shiftPressed())anchor_=caret_;selecting_=true;captureMouse();selectionTimer_.start();invalidate();return true;}}
  if(msg->type()==ui::kDoubleClickMessage&&static_cast<ui::MouseMessage*>(msg)->left()){stopSelection();auto range=inputWordRange(text_,indexAt(static_cast<ui::MouseMessage*>(msg)->position()),true);anchor_=range.first;caret_=range.second;invalidate();return true;}
  if(selecting_&&(msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseUpMessage)){if(!hasCapture()){stopSelection();return true;}pointer_=static_cast<ui::MouseMessage*>(msg)->position();caret_=indexAt(pointer_);invalidate();if(msg->type()==ui::kMouseUpMessage)stopSelection();return true;}
  if(msg->type()==ui::kMouseWheelMessage){scrollTo(offset_+static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*36);return true;}
  if(msg->type()==ui::kKeyDownMessage){auto input=static_cast<ui::KeyMessage*>(msg);const auto key=input->scancode();const bool ctrl=input->ctrlPressed()||input->cmdPressed(),shift=input->shiftPressed();
   if(ctrl&&key==ui::kKeyA){anchor_=0;caret_=int(text_.size());invalidate();return true;}if((ctrl&&key==ui::kKeyC)||(ctrl&&!shift&&key==ui::kKeyInsert)){copySelection();return true;}
   if(key==ui::kKeyMenu||(shift&&key==ui::kKeyF10)){menu(bounds().origin());return true;}
   if(key==ui::kKeyLeft||key==ui::kKeyRight){const bool left=key==ui::kKeyLeft;const int next=!ctrl&&!shift&&anchor_!=caret_?(left?std::min(anchor_,caret_):std::max(anchor_,caret_)):ctrl?inputWordStep(text_,caret_,left):inputGraphemeStep(text_,caret_,left);move(next,shift);return true;}
   if(key==ui::kKeyHome||key==ui::kKeyEnd){move(ctrl?(key==ui::kKeyHome?0:int(text_.size())):(key==ui::kKeyHome?lines_[lineFor(caret_)].start:lines_[lineFor(caret_)].end),shift);return true;}
   if(key==ui::kKeyUp||key==ui::kKeyDown||key==ui::kKeyPageUp||key==ui::kKeyPageDown){const bool up=key==ui::kKeyUp||key==ui::kKeyPageUp,page=key==ui::kKeyPageUp||key==ui::kKeyPageDown;const int rows=page?std::max(1,bounds().h/uiScale/12):1;if(!shift){scrollTo(offset_+(up?-1:1)*rows*12);return true;}const int row=lineFor(caret_);if(preferredX_<0)preferredX_=xAt(row,caret_);move(columnAt(std::clamp(row+(up?-rows:rows),0,int(lines_.size())-1),preferredX_),true,true);return true;}
   // A report is immutable: consume edit shortcuts and text input locally.
   if((ctrl&&(key==ui::kKeyX||key==ui::kKeyV||key==ui::kKeyZ||key==ui::kKeyY))||key==ui::kKeyBackspace||key==ui::kKeyDel||key==ui::kKeyEnter||input->unicodeChar()>=32)return true;
  }return ui::Widget::onProcessMessage(msg);
 }
 int scroll()const{return offset_;}int lineCount()const{return int(lines_.size())+1;}void scrollEnd(){scrollTo((int(lines_.size())+1)*12);}
 void verifySelection(){
  const auto original=text_;std::string copied;auto originalWriter=std::move(copy_);struct Restore{std::function<bool(const std::string&)>& target;std::function<bool(const std::string&)> value;~Restore(){target=std::move(value);}} restore{copy_,std::move(originalWriter)};copy_=[&](const std::string& value){copied=value;return true;};auto require=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};
  auto key=[&](ui::KeyScancode code,ui::KeyModifiers modifiers){ui::KeyMessage message(ui::kKeyDownMessage,code,modifiers,0,0);onProcessMessage(&message);};key(ui::kKeyA,ui::kKeyCtrlModifier);key(ui::kKeyC,ui::kKeyCtrlModifier);require(copied==utf8Text(text_),"Script report full copy differs");key(ui::kKeyHome,ui::kKeyCtrlModifier);key(ui::kKeyRight,ui::kKeyShiftModifier);key(ui::kKeyC,ui::kKeyCtrlModifier);require(copied==utf8Text(text_.substr(0,inputGraphemeStep(text_,0,false))),"Script report keyboard selection differs");const int anchor=anchor_,caret=caret_;const auto old=bounds();setBounds({old.x,old.y,std::max(100*uiScale,old.w/2),old.h});require(anchor_==anchor&&caret_==caret,"Script report resize lost selection");setBounds(old);
  scrollTo(0);auto pointer=[&](ui::MessageType type,int x,int y){ui::MouseMessage message(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,{old.x+x*uiScale,old.y+y*uiScale});onProcessMessage(&message);};pointer(ui::kMouseDownMessage,0,3);pointer(ui::kMouseMoveMessage,40,3);pointer(ui::kMouseUpMessage,40,3);require(!hasCapture()&&anchor_==0&&caret_==columnAt(0,40),"Script report drag selection/capture differs");key(ui::kKeyC,ui::kKeyCtrlModifier);require(copied==utf8Text(text_.substr(0,caret_)),"Script report drag copy differs");
  pointer(ui::kMouseDownMessage,0,3);pointer_=gfx::Point(old.x,old.y2()+12*uiScale);if(lines_.size()*12>std::size_t(old.h/uiScale)){selectionTimer_.Tick();require(offset_>0,"Script report drag did not scroll");}ui::Message focus(ui::kFocusLeaveMessage);onProcessMessage(&focus);require(!hasCapture()&&!selecting_,"Script report blur retained capture");for(auto code:{ui::kKeyX,ui::kKeyV,ui::kKeyZ})key(code,ui::kKeyCtrlModifier);require(text_==original,"Script report editing changed output");anchor_=caret_=0;scrollTo(0);
 }

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
 int preferredHeight()const{return std::max(180,DialogLayout::bodyTop+body_->lineCount()*12+6+textControlHeight+6);}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale,footer=DialogLayout::footer(h);layoutHeaderButton(close_);body_->setBounds(uiPhysical({6,DialogLayout::bodyTop,w-12,std::max(1,footer-6-DialogLayout::bodyTop)}).offset(r.origin()));done_->setBounds(uiPhysical({w-62,footer,56,textControlHeight}).offset(r.origin()));}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);drawDialogTitle(font_,g,uiLogical(clientBounds()),failed_?U"脚本错误":U"脚本输出");}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelDialog::onProcessMessage(msg);}
 void verifyLayout(){const auto r=bounds();if(body_->bounds().y!=r.y+DialogLayout::bodyTop*uiScale||body_->bounds().y2()+6*uiScale!=done_->bounds().y||done_->bounds().y2()+6*uiScale!=r.y2())throw std::runtime_error("Script report body/footer spacing");if(body_->lineCount()<1)throw std::runtime_error("Script report has no lines");body_->scrollEnd();if(body_->lineCount()>100&&body_->scroll()==0)throw std::runtime_error("Script report did not scroll");body_->verifySelection();}
 void verifyClose(){done_->Click();}
};
}
