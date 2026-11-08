#pragma once
// Native modal adaptation of legacy/store/pending-gradient-io.ts.
// Include after editor_implementation.h for the shared pixel dialog controls.
namespace moon::editor {
class PendingGradientDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;std::vector<PixelButton*> actions_;PixelButton* close_;int choice_=0;
 const std::u32string message_=U"画布中有尚未应用的渐变。请先应用或放弃渐变，再继续保存、导出或关闭。";
 std::vector<std::u32string> lines(int width)const{std::vector<std::u32string> result;std::u32string line;for(auto c:message_){if(!line.empty()&&font_.measure(line+c)>width){result.push_back(line);line.clear();}line+=c;}if(!line.empty())result.push_back(line);return result;}
 int width()const{int sum=12;for(auto b:actions_)sum+=font_.measure(b->caption)+12;return std::max(300,sum+4);}
 int height(int w)const{return DialogLayout::fit(DialogLayout::bodyTop+int(lines(w-12).size())*12);}
 void choose(int value){choice_=value;closeWindow(nullptr);}
public:
 PendingGradientDialog(const PixelFont& f,const Skin& s,const Skin& icons):PixelDialog(s,"",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(f),skin_(s){setAutoRemap(false);setWantFocus(true);auto add=[&](std::u32string text,int value){auto b=new PixelButton(f,s,std::move(text),[this,value]{choose(value);});actions_.push_back(b);addChild(b);};add(U"继续编辑",0);add(U"放弃渐变并继续",1);add(U"应用",2);close_=new PixelButton(f,s,U"",[this]{choose(0);});close_->icon="close";close_->iconSkin=&icons;close_->skinStyle="icon_button";addChild(close_);}
 int result()const{return choice_;}
 void smokeChoose(int choice){if(choice<0)close_->Click();else actions_.at(std::size_t(choice))->Click();}
 gfx::Size initialSize()const{return {width()*uiScale,height(width())*uiScale};}
 gfx::Size minimumDialogSize(int physicalWidth)const override{const int w=std::max(width(),physicalWidth/uiScale);return {width()*uiScale,height(w)*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());auto r=bounds();int x=r.x+6*uiScale,y=r.y2()-(6+textControlHeight)*uiScale;for(auto b:actions_){const int w=(font_.measure(b->caption)+12)*uiScale;b->setBounds({x,y,w,textControlHeight*uiScale});x+=w+2*uiScale;}layoutHeaderButton(close_);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"渐变待确认");int y=r.y+DialogLayout::bodyTop;for(const auto& line:lines(r.w-12)){font_.draw(g,line,r.x+6,y,skin_["text"]);y+=12;}}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(key==ui::kKeyEsc){choose(0);return true;}}return PixelDialog::onProcessMessage(msg);}
};
}
