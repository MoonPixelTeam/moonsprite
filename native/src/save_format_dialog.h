#pragma once
// Shared native adaptation of legacy file.save compatibility dialog.
// Included after editor_implementation.h (shared pixel controls and layout).
namespace moon::editor {
class SaveFormatDecisionDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;bool projectPreferred_;std::u32string message_;std::vector<PixelButton*> actions_;PixelButton* close_;int choice_=0;
 std::vector<std::u32string> lines(int width)const{std::vector<std::u32string> result;std::u32string line;for(auto c:message_){if(c==U'\n'){result.push_back(line);line.clear();continue;}if(!line.empty()&&font_.measure(line+c)>width){result.push_back(line);line.clear();}line+=c;}if(!line.empty())result.push_back(line);return result;}
 int width()const{int sum=12;for(auto* button:actions_)sum+=font_.measure(button->caption)+12+2;return std::max(sum,300);}
 int height(int w)const{return DialogLayout::fit(DialogLayout::bodyTop+int(lines(w-12).size())*12);}
 void choose(int result){choice_=result;closeWindow(nullptr);}
public:
 SaveFormatDecisionDialog(const PixelFont& f,const Skin& s,const Skin& icons,bool preferred,const std::vector<std::string>& issues,std::u32string format):PixelDialog(s,"",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(f),skin_(s),projectPreferred_(preferred){setAutoRemap(false);setWantFocus(true);message_=preferred?U"首选项已关闭“沿用原格式保存”。是否另存为 .moonsprite 工程？原文件将保留。":U"当前工程包含 "+format+U" 无法完整保留的内容。请选择保存方式：";if(!preferred)for(const auto& issue:issues){message_+=U'\n';if(issue=="layers")message_+=U"图层和分组会合并，隐藏图层内容不会保留。";else if(issue=="transparency")message_+=U"透明度无法保留，透明区域会被填充。";else if(issue=="gifColors")message_+=U"GIF 仅支持有限颜色及完全透明，颜色或半透明效果会改变。";else if(issue=="frames")message_+=U"仅保存当前帧，其他动画帧不会保留。";else if(issue=="loops")message_+=U"动画循环段不会保留。";else if(issue=="timelapse")message_+=U"缩时记录不会保留。";else if(issue=="editable")message_+=U"文字与瓦片内容会栅格化，失去原有编辑能力。";else if(issue=="effects")message_+=U"蒙版、裁剪或图层效果会烘焙，无法继续独立编辑。";else if(issue=="resources")message_+=U"工程笔刷、瓦片资源或切片定义不会完整保留。";else if(issue=="frameFlags")message_+=U"禁用帧状态或内容无法完整保留。";}
 auto add=[&](std::u32string label,int choice){auto button=new PixelButton(f,s,std::move(label),[this,choice]{choose(choice);});actions_.push_back(button);addChild(button);};add(U"另存为 MoonSprite（完整保留）",1);if(!preferred)add(U"仍保存为 "+format,2);add(U"取消",0);close_=new PixelButton(f,s,U"",[this]{choose(0);});close_->icon="close";close_->iconSkin=&icons;close_->skinStyle="icon_button";addChild(close_);}
 int result()const{return choice_;}
 void smokeChoose(int choice){choose(choice==1?1:choice==2&&!projectPreferred_?2:0);}
 gfx::Size initialSize()const{return {width()*uiScale,height(width())*uiScale};}
 gfx::Size minimumDialogSize(int physicalWidth)const override{int w=std::max(width(),physicalWidth/uiScale);return {width()*uiScale,height(w)*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());auto r=bounds();int x=r.x+6*uiScale,y=r.y2()-(6+textControlHeight)*uiScale;for(auto button:actions_){int w=(font_.measure(button->caption)+12)*uiScale;button->setBounds({x,y,w,textControlHeight*uiScale});x+=w+2*uiScale;}layoutHeaderButton(close_);}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,projectPreferred_?U"保存为 MoonSprite 工程":U"保存格式兼容性");int y=r.y+DialogLayout::bodyTop;for(const auto& line:lines(r.w-12)){font_.draw(g,line,r.x+6,y,skin_["text"]);y+=12;}}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage){auto code=static_cast<ui::KeyMessage*>(msg)->scancode();if(code==ui::kKeyEsc){choose(0);return true;}if(code==ui::kKeyEnter){choose(1);return true;}}return PixelDialog::onProcessMessage(msg);}
};
}
