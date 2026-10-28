#include "editor_implementation.h"
#include "editor.h"
namespace moon::editor {
std::filesystem::path Editor::liquifyPreferencePath()const{return liquifyPreferenceOverride_.empty()?palettePreferencePath().parent_path()/"liquify-options.txt":liquifyPreferenceOverride_;}
void Editor::loadLiquifyPreferences(){std::ifstream in(liquifyPreferencePath());std::string version;int mode,radius,strength,smoothing,smoothStrength;if(in>>version>>mode>>radius>>strength>>smoothing>>smoothStrength&&version=="liquify-v1"&&mode>=0&&mode<5){liquifyOptions_=liquify::normalize({liquify::Mode(mode),radius,strength,smoothing!=0,smoothStrength});}}
void Editor::saveLiquifyPreferences(){if(smoke_&&liquifyPreferenceOverride_.empty())return;try{std::filesystem::create_directories(liquifyPreferencePath().parent_path());std::ostringstream out;out<<"liquify-v1 "<<int(liquifyOptions_.mode)<<" "<<liquifyOptions_.radius<<" "<<liquifyOptions_.strength<<" "<<int(liquifyOptions_.smoothing)<<" "<<liquifyOptions_.smoothingStrength<<"\n";const auto text=out.str();writeExportBytesAtomic(liquifyPreferencePath(),{text.begin(),text.end()});}catch(const std::exception& e){status_=U"液化设置保存失败："+unicodeText(e.what());}}
void Editor::showLiquifyRange(int field){
 if(!liquifyTool_||document.active())return;
 auto entry=field==0?liquifyRadiusInput_:field==1?liquifyStrengthInput_:liquifySmoothingInput_;
 openParameterRange(entry,field==2?0:1,field==0?64:100);
}
void Editor::createLiquifyOptions(){
 loadLiquifyPreferences();const char* icons[]{"liquify-mode-push","liquify-mode-inflate","liquify-mode-deflate","liquify-mode-twist-clockwise","liquify-mode-twist-counter-clockwise"};const char32_t* names[]{U"推移",U"膨胀",U"收缩",U"顺时针扭转",U"逆时针扭转"};
 for(int i=0;i<5;++i){auto b=button(U"",[this,i]{liquifyOptions_.mode=liquify::Mode(i);saveLiquifyPreferences();layoutToolOptions();invalidateRect(canvasViewport());});b->icon=icons[i];b->iconSkin=&toolIcons_;b->skinStyle="icon_button";b->iconGroupIndex=i;b->iconGroupCount=5;b->hover=[this,i,names]{status_=names[i];invalidate();};liquifyModeButtons_[i]=b;liquifyControls_.push_back({b,15});}
 auto number=[&](int field,int width,const char32_t* suffix){auto entry=new PixelEntry(font_,skin_);entry->numeric=true;entry->deferredNumeric=true;entry->numericMounted=[this,field]{return liquifyTool_&&(field!=2||(liquifyOptions_.smoothing&&liquify::temporaryMode(liquifyOptions_.mode,brushFeedback_.brushPreviewShift_)==liquify::Mode::Push));};entry->numericMinimum=field==2?0:1;entry->numericMaximum=field==0?64:100;entry->numericValue=[this,field]{return double(field==0?liquifyOptions_.radius:field==1?liquifyOptions_.strength:liquifyOptions_.smoothingStrength);};entry->suffix=suffix;entry->focus=[this,field]{showLiquifyRange(field);};addChild(entry);liquifyControls_.push_back({entry,width});auto commit=[this,entry,field]{try{std::size_t used=0;double n=std::stod(entry->text(),&used);if(used==entry->text().size()&&std::isfinite(n)){const int value=int(std::floor(std::clamp(n,-10000.,10000.)+.5));if(field==0)liquifyOptions_.radius=std::clamp(value,1,64);else if(field==1)liquifyOptions_.strength=std::clamp(value,1,100);else liquifyOptions_.smoothingStrength=std::clamp(value,0,100);saveLiquifyPreferences();}}catch(...){}layoutToolOptions();invalidateRect(canvasViewport());};entry->deferredCommit=commit;entry->Change.connect(commit);entry->blur=commit;entry->accept=[this,commit]{commit();closeParameterRange();requestFocus();};entry->cancel=[this]{closeParameterRange();};entry->wheel=[this,entry,field](int delta){int& value=field==0?liquifyOptions_.radius:field==1?liquifyOptions_.strength:liquifyOptions_.smoothingStrength;value=std::clamp(value+delta,field==2?0:1,field==0?64:100);entry->setText(std::to_string(value));saveLiquifyPreferences();layoutToolOptions();invalidateRect(canvasViewport());};return entry;};
 auto label=[&](std::u32string text){auto b=button(std::move(text),[]{});b->labelOnly=true;liquifyControls_.push_back({b,font_.measure(b->caption)});return b;};
 label(U"半径");liquifyRadiusInput_=number(0,42,U"px");label(U"强度");liquifyStrengthInput_=number(1,45,U"%");
 liquifySmoothingButton_=button(U"平滑算法",[this]{liquifyOptions_.smoothing=!liquifyOptions_.smoothing;saveLiquifyPreferences();layoutToolOptions();});liquifySmoothingButton_->iconSkin=&toolIcons_;liquifySmoothingButton_->bareIconWithCaption=true;liquifyControls_.push_back({liquifySmoothingButton_,11+uiGap+font_.measure(U"平滑算法")});
 liquifySmoothingInput_=number(2,45,U"%");liquifyResetButton_=button(U"重置",[this]{if(liquifyResetPosition_&&liquifyResetIdentity_==document.identity()&&document.historyPosition()>*liquifyResetPosition_){document.setHistoryPosition(*liquifyResetPosition_);liquifyResetRevision_=document.historyRevision();refresh();}});liquifyControls_.push_back({liquifyResetButton_,font_.measure(U"重置")+12});
 for(auto& control:liquifyControls_)control.first->setVisible(false);
}
bool Editor::layoutLiquifyOptions(){
 if(liquifyResetIdentity_==document.identity()&&liquifyResetPosition_&&liquifyResetRevision_!=document.historyRevision())liquifyResetPosition_.reset();
 if(!liquifyTool_){for(auto& control:liquifyControls_)control.first->setVisible(false);return false;}
 for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);for(auto& c:fillControls_)c.first->setVisible(false);for(auto& c:gradientControls_)c.first->setVisible(false);for(auto& c:shapeControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);
 const auto rc=uiLogical(bounds());int x=rc.x+workspaceLayout(rc).workX;const bool usable=pending_==Pending::None&&!document.active();const auto shown=liquify::temporaryMode(liquifyOptions_.mode,brushFeedback_.brushPreviewShift_);
 for(int i=0;i<5;++i)liquifyModeButtons_[i]->active=shown==liquify::Mode(i);
 if(!liquifyRadiusInput_->hasFocus())liquifyRadiusInput_->setText(std::to_string(liquifyOptions_.radius));if(!liquifyStrengthInput_->hasFocus())liquifyStrengthInput_->setText(std::to_string(liquifyOptions_.strength));if(!liquifySmoothingInput_->hasFocus())liquifySmoothingInput_->setText(std::to_string(liquifyOptions_.smoothingStrength));
 liquifySmoothingButton_->icon=liquifyOptions_.smoothing?"check":"checkboxUnchecked";
 for(std::size_t i=0;i<liquifyControls_.size();++i){auto [w,width]=liquifyControls_[i];const bool visible=!(w==liquifySmoothingInput_&&(!liquifyOptions_.smoothing||shown!=liquify::Mode::Push))&&!(w==liquifySmoothingButton_&&shown!=liquify::Mode::Push);w->setVisible(visible);if(!visible)continue;placePropertyControl(w,x,width);w->setVisible(true);w->setEnabled(usable);x+=propertyControlWidth(w,width)+(i<4?-1:uiGap);}
 liquifyResetButton_->setEnabled(usable&&liquifyResetPosition_&&liquifyResetIdentity_==document.identity()&&document.historyPosition()>*liquifyResetPosition_);syncParameterRange();return true;
}
void Editor::finishLiquifyGesture(bool cancel){
 if(!liquifyDragging_)return;liquifyDragging_=false;bool changed=false;if(cancel)document.cancelLiquify();else changed=document.commitLiquify();if(hasCapture())releaseMouse();if(changed){liquifyResetRevision_=document.historyRevision();usageStatistics_.recordDrawing(true,std::max<usage::Milliseconds>(1,usage::now()-usageStrokeStarted_));}usageStrokeStarted_=0;refresh();
}
void Editor::liquifyTick(){
 if(!liquifyDragging_)return;if(!document.liquifyActive()||document.identity()!=liquifyGestureIdentity_||!hasCapture()){finishLiquifyGesture(true);return;}if(liquifyGestureMode_==liquify::Mode::Push)return;
 try{const auto now=std::chrono::steady_clock::now();int steps=0;const auto revision=document.contentRevision();while(now>=liquifyNextTick_&&steps<4){document.holdLiquify();liquifyNextTick_+=std::chrono::milliseconds(50);++steps;}if(steps==4&&now>=liquifyNextTick_)liquifyNextTick_=now+std::chrono::milliseconds(50);invalidateStrokePixels(revision);}catch(const std::exception& e){finishLiquifyGesture(true);status_=unicodeText(e.what());}
}
bool Editor::processLiquifyInput(ui::Message* msg){
 if(liquifyTool_&&(msg->type()==ui::kKeyDownMessage||msg->type()==ui::kKeyUpMessage)){brushFeedback_.brushPreviewShift_=msg->shiftPressed();layoutLiquifyOptions();}
 if(liquifyDragging_){if(msg->type()==ui::kFocusLeaveMessage||!hasCapture()||(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)){finishLiquifyGesture(true);return true;}if(auto m=dynamic_cast<ui::MouseMessage*>(msg)){if(msg->type()==ui::kMouseMoveMessage){const auto at=canvasDocumentPoint(m->position());const auto revision=document.contentRevision();document.updateLiquify({at.x,at.y});invalidateStrokePixels(revision);return true;}if(msg->type()==ui::kMouseUpMessage&&m->button()==strokeButton_){finishLiquifyGesture(false);return true;}}return false;}
 if(!liquifyTool_)return false;auto m=dynamic_cast<ui::MouseMessage*>(msg);if(!m)return false;if(spaceHeld_||m->middle()||moveModifierHeld("brushSizeAdjust",*msg)||moveModifierHeld("brushSizeWheelAdjust",*msg))return false;if(pending_!=Pending::None||homeOpen_||!documentOpen_||!canvasViewport().contains(m->position())||!canvasOwnsPointer(m->position()))return false;
 if(msg->type()==ui::kMouseDownMessage&&(m->left()||m->right())){if(playing_||document.active()||!document.rasterToolsAvailable())return true;const auto at=canvasDocumentPoint(m->position());if(!std::isfinite(at.x)||!std::isfinite(at.y))return true;auto options=liquifyOptions_;options.mode=liquify::temporaryMode(options.mode,m->shiftPressed());if(!liquifyResetPosition_||liquifyResetIdentity_!=document.identity()||liquifyResetRevision_!=document.historyRevision()){liquifyResetPosition_=document.historyPosition();liquifyResetRevision_=document.historyRevision();liquifyResetIdentity_=document.identity();}
 if(!document.beginLiquify({at.x,at.y},options))return true;liquifyGestureIdentity_=document.identity();liquifyGestureMode_=options.mode;liquifyDragging_=true;strokeButton_=m->button();usageStrokeStarted_=usage::now();captureMouse();requestFocus();const auto revision=document.contentRevision();if(options.mode!=liquify::Mode::Push)document.holdLiquify();liquifyNextTick_=std::chrono::steady_clock::now()+std::chrono::milliseconds(50);invalidateStrokePixels(revision);layoutToolOptions();return true;}return false;
}
}

namespace moon::editor {
void Editor::smokeLiquify(){
 auto require=[](bool yes,const char* why){if(!yes)throw std::runtime_error(why);};
 require(workspacePresetTestDirectory_.has_value(),"Liquify isolated preference fixture");
 auto savedDocument=std::make_unique<Document>(std::move(document));auto options=liquifyOptions_;auto file=liquifyPreferenceOverride_;const bool savedTool=liquifyTool_;const auto reset=liquifyResetPosition_;const auto resetId=liquifyResetIdentity_,resetRev=liquifyResetRevision_;
 struct Restore{std::function<void()> f;~Restore(){f();}} restore{[&]{if(liquifyDragging_)finishLiquifyGesture(true);document=std::move(*savedDocument);liquifyOptions_=options;liquifyPreferenceOverride_=file;liquifyTool_=savedTool;liquifyResetPosition_=reset;liquifyResetIdentity_=resetId;liquifyResetRevision_=resetRev;refresh();}};
 liquifyPreferenceOverride_=*workspacePresetTestDirectory_/"liquify-options.txt";homeOpen_=false;documentOpen_=true;pending_=Pending::None;
 std::vector<Pixel> pixels;for(int y=0;y<64;++y)for(int x=0;x<64;++x)pixels.push_back(0xff000000u|unsigned(x*3)|(unsigned(y*3)<<8));
 document=Document::fromSpriteSheetRaster(64,64,pixels,U"液化验收");commands_[1]->Click();runShortcutCommand("tool.liquify");refresh();
 for(int i=0;i<5;++i){liquifyModeButtons_[i]->Click();require(int(liquifyOptions_.mode)==i,"Liquify real mode click");}
 liquifyModeButtons_[0]->Click();
 liquifyRadiusInput_->setText("64");liquifyRadiusInput_->accept();liquifyStrengthInput_->setText("100");liquifyStrengthInput_->accept();liquifySmoothingButton_->Click();require(liquifyOptions_.radius==64&&liquifyOptions_.strength==100&&liquifyOptions_.smoothing,"Liquify actual property controls");
 const auto expected=liquifyOptions_;liquifyOptions_={};loadLiquifyPreferences();require(liquifyOptions_.radius==expected.radius&&liquifyOptions_.strength==expected.strength&&liquifyOptions_.smoothing==expected.smoothing,"Liquify atomic preference roundtrip");
 liquifyOptions_.radius=16;liquifyOptions_.smoothing=false;liquifyModeButtons_[0]->Click();refresh();auto at=canvasDocumentToDisplay({20,20}),to=canvasDocumentToDisplay({40,24});const auto history=document.historySize();
 ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at);processLiquifyInput(&down);require(liquifyDragging_&&document.liquifyActive()&&hasCapture(),"Liquify actual pointer capture");
 ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,to);processLiquifyInput(&move);require(document.pixels()!=pixels,"Liquify live transaction preview");
 ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,to);processLiquifyInput(&up);require(!liquifyDragging_&&!hasCapture()&&document.historySize()==history+1,"Liquify actual commit one history");const auto after=document.pixels();
 processLiquifyInput(&down);processLiquifyInput(&move);ui::KeyMessage esc(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);processLiquifyInput(&esc);require(!liquifyDragging_&&document.pixels()==after,"Liquify actual Escape rollback");
 liquifyResetButton_->Click();require(document.pixels()==pixels&&document.historyPosition()==history,"Liquify actual reset history");
 liquifyModeButtons_[1]->Click();ui::MouseMessage reverse(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonRight,ui::kKeyShiftModifier,at);processLiquifyInput(&reverse);require(liquifyGestureMode_==liquify::Mode::Deflate&&document.liquifyActive(),"Liquify actual Shift reverse and right button");liquifyNextTick_=std::chrono::steady_clock::now()-std::chrono::milliseconds(200);liquifyTick();finishLiquifyGesture(true);require(document.pixels()==pixels,"Liquify held cancel rollback");refresh();
}
}

namespace moon::editor {
void Editor::paintLiquifyPreview(ui::Graphics& g,const gfx::Rect& cv){
 if(!liquifyTool_||homeOpen_||!documentOpen_||pending_!=Pending::None||!paletteMousePosition_||spaceHeld_||eyedropperHeld_||eyedropperGesture_.active()||navigation_.pan_.active||runtimePreferences_.index("cursor.brushPreviewMode.Select")==0||(liquifyDragging_&&!runtimePreferences_.flag("cursor.drawingBrushPreviewEnabled"))||!canvasOwnsPointer(*paletteMousePosition_)||!canvasViewport().contains(*paletteMousePosition_))return;
 BrushOptions b;b.size=liquifyOptions_.radius*2+1;b.shape=BrushShape::Round;const auto spans=brushSpans(b,129);const auto center=gridSnapPoint(canvasPoint(*paletteMousePosition_),b.size/2,b.size/2);const double scale=canvasScale();const int thickness=runtimePreferences_.index("cursor.brushEdgeThickness.Number");
 auto contains=[&](int x,int y){if(x<0||y<0||x>=document.width()||y>=document.height())return false;const int row=y-center.y+b.size/2;if(row<0||row>=int(spans.size()))return false;return x>=center.x-b.size/2+spans[row].left&&x<=center.x-b.size/2+spans[row].right;};
 auto box=[&](int x,int y){int l=int(std::round(cv.x+x*scale)),t=int(std::round(cv.y+y*scale));return gfx::Rect(l,t,std::max(1,int(std::round(cv.x+(x+1)*scale))-l),std::max(1,int(std::round(cv.y+(y+1)*scale))-t));};
 for(const auto& span:spans){int y=center.y-b.size/2+span.y;if(y<0||y>=document.height())continue;for(int x=std::max(0,center.x-b.size/2+span.left);x<=std::min(document.width()-1,center.x-b.size/2+span.right);++x){const auto r=box(x,y);const auto color=selectionPreviewColor(x,y,false);if(!contains(x-1,y))g.fillRect(color,{r.x,r.y,thickness,r.h});if(!contains(x+1,y))g.fillRect(color,{r.x2()-thickness,r.y,thickness,r.h});if(!contains(x,y-1))g.fillRect(color,{r.x,r.y,r.w,thickness});if(!contains(x,y+1))g.fillRect(color,{r.x,r.y2()-thickness,r.w,thickness});}}
}
}
