#include "layer_compositor.h"
#include "canvas_resize_dialog.h"
#include "filter_preset_dialog.h"
#include "editor_implementation.h"
#include "editor.h"
#include "color_overlay_dialog.h"
#include "timelapse_session.h"

namespace moon::editor {
void Editor::openFilterPreset(FilterPreset preset,int verify,bool initialLcd){
 if(initialLcd&&smoke_&&!verify)verify=2;
 if(!documentOpen_||homeOpen_||pending_!=Pending::None||(document.active()&&!document.floating()))return;
 const bool lcdAvailable=document.timelineSelection().layers.size()==1;if(initialLcd&&!lcdAvailable)return;
 document.commitFloatingPaste();cancelStroke();playing_=false;if(!document.beginFilterPreview())return;
 const auto identity=document.identity();
 struct Result{Document::FilterPreviewTask task;std::uint64_t generation=0;bool apply=false,completed=false;std::string error;};
 std::future<Result> worker;std::shared_ptr<std::atomic<bool>> token;std::optional<PresetFilterOptions> queued;bool queuedApply=false,published=false,finished=false;std::uint64_t generation=0;
 auto valid=[&]{return document.identity()==identity;};
 auto invalidateWorker=[&]{if(token)token->store(true);++generation;queued.reset();published=false;if(valid())document.restoreFilterPreview();refresh();};
 auto launch=[&]{if(!queued||worker.valid()||!valid())return;auto options=*queued;const bool apply=queuedApply;queued.reset();auto task=document.captureFilterPreviewTask(options.preset,options.opacity,options.lcd,options.lcdWidth,options.lcdHeight);if(!task)throw std::runtime_error("Filter target changed");token=std::make_shared<std::atomic<bool>>(false);auto cancel=token;const auto current=generation;worker=std::async(std::launch::async,[task=std::move(*task),cancel,current,apply]()mutable{Result result{std::move(task),current,apply};try{result.completed=Document::runFilterPreviewTask(result.task,[cancel]{return cancel->load();});}catch(const std::exception& e){result.error=e.what();}return result;});};
 auto preview=[&](std::optional<PresetFilterOptions> options){if(finished)return;invalidateWorker();if(options){queued=options;queuedApply=false;launch();}};
 auto apply=[&](PresetFilterOptions options){invalidateWorker();queued=options;queuedApply=true;launch();};
 auto poll=[&]()->std::optional<bool>{std::optional<bool> applied;if(worker.valid()&&worker.wait_for(std::chrono::seconds(0))==std::future_status::ready){auto result=worker.get();if(valid()&&result.generation==generation){if(!result.error.empty())throw std::runtime_error(result.error);if(result.completed){if(result.apply){const bool ok=document.commitFilterPreviewTask(std::move(result.task));finished=ok;applied=ok;}else published=document.publishFilterPreviewTask(std::move(result.task));refresh();}else if(result.apply)applied=false;}}launch();return applied;};
 auto cleanup=[&]{finished=true;if(token)token->store(true);queued.reset();if(worker.valid())worker.get();if(valid())document.cancelFilterPreview();refresh();};
 try{
  PresetFilterDialog popup(font_,skin_,toolIcons_,preset,preview,apply,poll,lcdAvailable,initialLcd);popup.setDisplay(display(),false);const int width=popup.preferredWidth()*uiScale,height=popup.preferredHeight(width);const auto view=canvasViewport();popup.setBounds({view.x+(view.w-width)/2,view.y+(view.h-height)/2,width,height});
  ui::Timer timer(70,&popup);int phase=0;const auto started=std::chrono::steady_clock::now();if(verify){timer.Tick.connect([&]{if(std::chrono::steady_clock::now()-started>std::chrono::seconds(10))throw std::runtime_error("Filter dialog worker timed out");if(phase==0){if(initialLcd)popup.smokeLcdStep(0);else popup.smokeStep(0);phase=1;}else if(phase==1&&!worker.valid()&&!queued){if(initialLcd)popup.smokeLcdStep(1);else popup.smokeStep(1);phase=2;}else if(phase==2&&published){writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/(initialLcd?"lcd-filter-dialog-smoke.bmp":"filter-presets-smoke.bmp"));if(initialLcd)popup.smokeLcdStep(verify==1?2:3);else popup.smokeStep(verify==1?2:3);phase=3;timer.stop();}});timer.start();}
  popup.openWindowInForeground();timer.stop();cleanup();
 }catch(...){cleanup();throw;}requestFocus();
}

void Editor::openCanvasResize(int verify){
 if(!documentOpen_||homeOpen_||pending_!=Pending::None||(document.active()&&!document.floating()))return;
 document.commitFloatingPaste();cancelStroke();playing_=false;const auto identity=document.identity(),revision=document.revision(),history=document.historySize();const bool dirty=document.dirty();
 auto clear=[&]{canvasResizePreview_.reset();canvasResizeIdentity_=canvasResizeRevision_=0;invalidateRect(canvasViewport());};
 auto valid=[&]{return document.identity()==identity&&document.revision()==revision;};
 auto rect=[&](const CanvasResizeDraftValue& v)->std::optional<gfx::Rect>{if(!valid())return {};const double z=canvasScale();auto coordinate=[](double n){return int(std::clamp(std::floor(n+.5),-10000000.,10000000.));};const int x=coordinate(canvas_.x-double(v.offsetX)*z),y=coordinate(canvas_.y-double(v.offsetY)*z),right=coordinate(canvas_.x+(double(v.width)-v.offsetX)*z),bottom=coordinate(canvas_.y+(double(v.height)-v.offsetY)*z);return gfx::Rect(x,y,std::max(1,right-x),std::max(1,bottom-y));};
 CanvasResizeDialog* activePopup=nullptr;
 CanvasResizeDialog popup(font_,skin_,toolIcons_,document.width(),document.height(),[&](std::optional<CanvasResizeDraftValue> v){if(!v||!valid()){clear();return;}canvasResizePreview_=std::array<int,4>{v->width,v->height,v->offsetX,v->offsetY};canvasResizeIdentity_=identity;canvasResizeRevision_=revision;invalidateRect(canvasViewport());if(verify&&(document.historySize()!=history||document.dirty()!=dirty))throw std::runtime_error("Canvas resize preview edited document");},[&](const CanvasResizeDraft& d){if(!valid())return false;const auto v=d.value;const bool applied=document.resizeCanvas(v.width,v.height,d.anchor,v.offsetX,v.offsetY,d.trimOutside,selectionPivot_);if(applied){clear();refresh();}return applied;},[&](gfx::Point p)->std::optional<gfx::Point>{if(!valid()||(!canvasViewport().contains(p)&&!(activePopup&&activePopup->hasCapture())))return {};const auto q=transformCanvasPoint(p);return gfx::Point(int(std::clamp(std::floor(q.x),-10000000.,10000000.)),int(std::clamp(std::floor(q.y),-10000000.,10000000.)));},rect);
 activePopup=&popup;popup.setDisplay(display(),false);const auto view=canvasViewport();popup.setBounds({std::max(bounds().x,view.x2()-200*uiScale),std::max(bounds().y,view.y),200*uiScale,313*uiScale});
 ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{timer.stop();popup.smoke(verify==2,[&]{writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"canvas-resize-smoke.bmp");});});timer.start();}
 try{popup.openWindowInForeground();}catch(...){clear();throw;}clear();requestFocus();
}


std::vector<std::string> Editor::replaceTargets()const{std::vector<std::string> ids;const auto& state=document.timeline().state();int start=-1,end=-1;if(replaceScope_.rfind("loop-section:",0)==0){auto it=std::find_if(state.loopSections.begin(),state.loopSections.end(),[this](const auto& l){return l.id==replaceScope_.substr(13);});if(it!=state.loopSections.end()){auto range=timeline::loopRange(state,*it);start=range.start;end=range.end;}}

    for(const auto& c:state.cels){bool include=replaceScope_=="document" || (replaceScope_=="selection" && c.layerId==document.layer().id && c.frameId==document.frame().id) || (replaceScope_=="layers" && std::find(document.timelineSelection().layers.begin(),document.timelineSelection().layers.end(),c.layerId)!=document.timelineSelection().layers.end()) || (replaceScope_=="frames" && std::find(document.selectedFrames().begin(),document.selectedFrames().end(),c.frameId)!=document.selectedFrames().end()) || (replaceScope_=="cells" && c.layerId==selectedTimelineCelLayer_ && c.frameId==selectedTimelineCelFrame_);if(start>=0){auto it=std::find_if(state.frames.begin(),state.frames.end(),[&](const auto& f){return f.id==c.frameId;});auto index=int(it-state.frames.begin());include=index>=start && index<=end;}if(include)ids.push_back(c.id);}return ids;}

void Editor::cancelReplacePreview(){document.cancelColorAdjustment();document.cancelPaletteReplacement();}

void Editor::updateReplaceUi(){Pixel a,b;const bool valid=parsePaletteHex(replaceInputs_[0]->text(),a) && parsePaletteHex(replaceInputs_[1]->text(),b);bool ready=replaceScope_=="palette"?std::any_of(document.palette().entries.begin(),document.palette().entries.end(),[](const auto& entry){return entry.id!=0;}):!replaceTargets().empty() && (replaceScope_!="selection" || document.selection().has_value());discard_->setEnabled(ready && valid && replaceSource_!=replaceDestination_);replaceScopeButton_->caption=U"范围："+unicodeText(replaceScope_);replacePreviewButton_->icon=replacePreview_?"check":"checkboxUnchecked";replaceRememberButton_->icon=replaceRemember_?"check":"checkboxUnchecked";for(int i=0;i<2;++i)replaceSample_[i]->active=replaceSampling_==i;}

void Editor::previewReplace(){cancelReplacePreview();if(replaceSampling_<0){if(replaceScope_=="palette"){if(document.beginPaletteReplacement(replacePreview_?std::optional<Pixel>{replaceSource_}:std::nullopt))document.updatePaletteReplacement(replaceSource_,replaceDestination_,replacePreview_);}else if(document.beginColorReplacement(replaceTargets(),replaceScope_=="selection"))document.updateColorReplacement(replaceSource_,replaceDestination_,replacePreview_);}updateReplaceUi();saveReplacePreferences();refresh();}

void Editor::changeReplaceColor(int target,Pixel color,bool sampled){cancelReplacePreview();if(target==0){document.setPaletteRole(color,false,paletteLocked_);replaceSource_=color;}else replaceDestination_=color;replaceInputs_[target]->setText(paletteHex(color));previewReplace();}

void Editor::beginReplaceSampling(int target){if(replaceSampling_==target){finishReplaceSampling();return;}if(replaceSampling_<0){cancelReplacePreview();replaceReturnTools_={selectionTool_,shapeTool_,gradientTool_,fillTool_,handTool_,eraser_,eyedropperTool_,eyedropperHeld_,navigation_.zoomTool_};}replaceSampling_=target;selectionTool_=shapeTool_=gradientTool_=fillTool_=handTool_=eraser_=eyedropperHeld_=navigation_.zoomTool_=false;eyedropperTool_=true;playing_=false;updateReplaceUi();requestFocus();layoutToolOptions();refresh();}

void Editor::finishReplaceSampling(){if(replaceSampling_<0 || replaceSamplingFinishing_)return;replaceSamplingFinishing_=true;if(eyedropperGesture_.active())eyedropperGesture_.finish();if(hasCapture())releaseMouse();replaceSampling_=-1;selectionTool_=replaceReturnTools_[0];shapeTool_=replaceReturnTools_[1];gradientTool_=replaceReturnTools_[2];fillTool_=replaceReturnTools_[3];handTool_=replaceReturnTools_[4];eraser_=replaceReturnTools_[5];eyedropperTool_=replaceReturnTools_[6];eyedropperHeld_=replaceReturnTools_[7];navigation_.zoomTool_=replaceReturnTools_[8];replaceSamplingFinishing_=false;layoutToolOptions();previewReplace();updateNavigationCursor();}

void Editor::openReplaceColor(){if(pending_!=Pending::None || document.active())return;if(!replaceLoaded_){std::ifstream in(palettePreferencePath().parent_path()/"color-replacement.txt");if(!(in>>replaceScope_>>replacePreview_>>replaceRemember_>>replaceSource_>>replaceDestination_)){replaceScope_="layers";replacePreview_=false;replaceRemember_=true;replaceSource_=document.palette().primary;replaceDestination_=document.palette().secondary;}replaceLoaded_=true;}if(!replaceRemember_){replaceSource_=document.palette().primary;replaceDestination_=document.palette().secondary;}cancelStroke();playing_=false;pending_=Pending::ReplaceColor;menuBar_->setEnabled(false);replaceInputs_[0]->setText(paletteHex(replaceSource_));replaceInputs_[1]->setText(paletteHex(replaceDestination_));discard_->caption=U"替换";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);previewReplace();refresh();}

void Editor::createReplaceControls(){for(int i=0;i<2;++i){auto input=new PixelEntry(font_,skin_);addChild(input);replaceInputs_[i]=input;input->setVisible(false);auto changed=[this,input,i]{Pixel color;if(parsePaletteHex(input->text(),color))changeReplaceColor(i,color);else discard_->setEnabled(false);};input->Change.connect(changed);input->blur=changed;input->accept=[this]{if(discard_->isEnabled())resolve(true);};input->cancel=[this]{resolve(false);};replaceSample_[i]=button(U"",[this,i]{beginReplaceSampling(i);});replaceSample_[i]->iconSkin=&toolIcons_;replaceSample_[i]->icon="eyedropper";replaceSample_[i]->setEnabled(true);replaceSample_[i]->setVisible(false);}

    replaceScopeButton_=button(U"作用范围",[this]{PixelMenu menu(skin_);auto add=[&](const std::string& id,const std::u32string& text,bool enabled=true){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(enabled);item->checked=[this,id]{return replaceScope_==id;};item->Click.connect([this,id]{replaceScope_=id;previewReplace();});menu.addChild(item);};add("document",U"整个文档");add("selection",U"当前像素选区",document.selection().has_value());add("layers",U"选中图层",!selectedTimelineLayer_.empty());add("frames",U"选中帧",!document.selectedFrames().empty());add("cells",U"选中帧格",!selectedTimelineCelFrame_.empty());add("palette",U"调色板",std::any_of(document.palette().entries.begin(),document.palette().entries.end(),[](const auto& entry){return entry.id!=0;}));for(const auto& l:document.timeline().state().loopSections)add("loop-section:"+l.id,U"循环段："+l.name);auto at=replaceScopeButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});

    replacePreviewButton_=button(U"实时预览",[this]{replacePreview_=!replacePreview_;previewReplace();});replaceRememberButton_=button(U"记住颜色",[this]{replaceRemember_=!replaceRemember_;if(!replaceRemember_){cancelReplacePreview();replaceSource_=document.palette().primary;replaceDestination_=document.palette().secondary;replaceInputs_[0]->setText(paletteHex(replaceSource_));replaceInputs_[1]->setText(paletteHex(replaceDestination_));}previewReplace();});for(auto b:{replacePreviewButton_,replaceRememberButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}for(auto b:{replaceScopeButton_,replacePreviewButton_,replaceRememberButton_})b->setVisible(false);

  }

void Editor::stopAntiAlias(){if(aaCancel_)aaCancel_->store(true);++aaGeneration_;aaScheduled_=false;aaCommit_=false;}

void Editor::changeAntiAlias(){
 stopAntiAlias();
 try{if(document.restoreConvolutionBaseline()&&aaLive_){aaScheduled_=true;aaDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(16);}}
 catch(const std::exception& e){status_=U"抗锯齿失败："+unicodeText(e.what());aaCommit_=false;}
 refresh();
}

void Editor::launchAntiAlias(){
 try{
  auto options=aaSpec_;options.color=aaAuto_?std::optional<Pixel>{}:std::optional<Pixel>{aaCustom_};auto task=document.captureAntiAliasSurfaceTask(options);
  if(!task){status_=U"抗锯齿目标已变化";aaCommit_=false;return;}
  auto token=std::make_shared<std::atomic<bool>>(false);aaCancel_=token;auto generation=aaGeneration_;
  std::packaged_task<AntiAliasResult()> work([task=std::move(*task),token,generation]()mutable{
   AntiAliasResult result{std::move(task),generation};
   try{result.cancelled=!Document::runAntiAliasSurfaceTask(result.task,[token]{return token->load();});}
   catch(const std::exception& e){result.error=e.what();}return result;
  });aaWorker_=work.get_future();std::thread(std::move(work)).detach();
 }catch(const std::exception& e){if(aaCancel_)aaCancel_->store(true);aaWorker_=std::future<AntiAliasResult>{};aaCommit_=false;status_=U"抗锯齿失败："+unicodeText(e.what());}
}

void Editor::requestAntiAliasApply(){aaPicker_->finishInteraction();stopAntiAlias();aaCommit_=true;aaScheduled_=true;aaDue_=std::chrono::steady_clock::now();refresh();}

void Editor::antiAliasTick(){
 if(pending_!=Pending::AntiAlias)return;
 if(aaWorker_.valid()&&aaWorker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){
  try{
   auto result=aaWorker_.get();
   if(result.generation==aaGeneration_){
    if(result.cancelled)aaCommit_=false;
    else if(!result.error.empty()){status_=U"抗锯齿失败："+unicodeText(result.error);aaCommit_=false;}
    else if(std::none_of(result.task.surfaces.produced.begin(),result.task.surfaces.produced.end(),[](auto b){return b!=0;})){status_=U"没有可处理的内容";aaCommit_=false;}
    else if(document.publishAntiAliasSurfaceTask(std::move(result.task))){
     if(aaCommit_){aaCommit_=false;if(document.commitAntiAliasAdjustment()){resolve(false);return;}status_=U"没有可处理的内容";if(!document.colorAdjustmentActive())document.beginAntiAliasPreview();}
    }else{status_=U"抗锯齿结果已失效";aaCommit_=false;}
    refresh();
   }
  }catch(const std::exception& e){status_=U"抗锯齿失败："+unicodeText(e.what());aaCommit_=false;refresh();}
 }
 if(aaScheduled_&&!aaWorker_.valid()&&std::chrono::steady_clock::now()>=aaDue_){aaScheduled_=false;launchAntiAlias();refresh();}
}

void Editor::openAntiAlias(){
 if(pending_!=Pending::None||document.active())return;
 try{if(!document.beginAntiAliasPreview()){status_=U"目标图层已锁定或没有可处理的内容";invalidate();return;}}
 catch(const std::exception& e){status_=U"抗锯齿失败："+unicodeText(e.what());invalidate();return;}
 playing_=false;aaSpec_={};aaAuto_=aaLive_=true;aaCustom_=document.palette().primary;aaPicker_->syncColors(aaCustom_,aaCustom_);aaColorEntry_->setText(paletteHex(aaCustom_));aaOpacity_->setText("50");aaSource_->setSelectedIndex(0);pending_=Pending::AntiAlias;menuBar_->setEnabled(false);discard_->caption=U"应用";keep_->caption=U"取消";changeAntiAlias();
}

void Editor::createAntiAliasControls(){aaAutoButton_=button(U"自动取色",[this]{aaAuto_=!aaAuto_;changeAntiAlias();});aaInterior_=button(U"包含内部颜色",[this]{aaSpec_.interior=!aaSpec_.interior;changeAntiAlias();});aaLiveButton_=button(U"实时预览",[this]{aaLive_=!aaLive_;changeAntiAlias();});for(auto b:{aaAutoButton_,aaInterior_,aaLiveButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;b->setVisible(false);}auto source=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(source);addChild(source);aaSource_=source;source->setOptions({U"自动取色",U"画布颜色",U"调色板颜色"});source->changed=[this](int i){aaSpec_.colorSource=i;changeAntiAlias();};source->setVisible(false);

    aaOpacity_=new PixelEntry(font_,skin_);aaOpacity_->numeric=true;aaOpacity_->suffix=U"%";addChild(aaOpacity_);aaOpacity_->setVisible(false);auto opacityChanged=[this]{try{std::size_t used=0;auto n=std::stod(aaOpacity_->text(),&used);if(used!=aaOpacity_->text().size()||!std::isfinite(n))return;aaSpec_.opacity=int(std::clamp(std::floor(n+.5),0.0,100.0));changeAntiAlias();}catch(...){}};aaOpacity_->Change.connect(opacityChanged);aaOpacity_->blur=opacityChanged;aaOpacity_->accept=[this]{requestAntiAliasApply();};aaOpacity_->cancel=[this]{resolve(false);};

    aaOpacitySlider_=new PixelSlider(font_,skin_);aaOpacitySlider_->minimum=0;aaOpacitySlider_->maximum=100;aaOpacitySlider_->percentage=true;aaOpacitySlider_->changed=[this](int v){aaSpec_.opacity=v;aaOpacity_->setText(std::to_string(v));changeAntiAlias();};addChild(aaOpacitySlider_);aaOpacitySlider_->setVisible(false);

    aaColorEntry_=new PixelEntry(font_,skin_);addChild(aaColorEntry_);aaColorEntry_->setVisible(false);auto colorChanged=[this]{Pixel c;if(parsePaletteHex(aaColorEntry_->text(),c)){aaCustom_=c;aaPicker_->syncColors(c,c);changeAntiAlias();}};aaColorEntry_->Change.connect(colorChanged);aaColorEntry_->blur=colorChanged;aaColorEntry_->accept=[this]{requestAntiAliasApply();};aaColorEntry_->cancel=[this]{resolve(false);};

    auto picker=new DialogBackground<NativeColorPicker>(font_,skin_,assets_/"color-picker");configureDialogBackground(picker);addChild(picker);aaPicker_=picker;picker->changed=[this](Pixel c,bool){aaCustom_=c;aaColorEntry_->setText(paletteHex(c));changeAntiAlias();};picker->setVisible(false);

  }

void Editor::layoutAntiAlias(const gfx::Rect& modal){bool show=pending_==Pending::AntiAlias,busy=aaCommit_;for(auto c:{aaAutoButton_,aaInterior_,aaLiveButton_}){c->setVisible(show);c->setEnabled(!busy);}aaAutoButton_->icon=aaAuto_?"check":"checkboxUnchecked";aaInterior_->icon=aaSpec_.interior?"check":"checkboxUnchecked";aaLiveButton_->icon=aaLive_?"check":"checkboxUnchecked";aaAutoButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::bodyTop,90,textControlHeight)));aaSource_->setVisible(show&&aaAuto_);aaSource_->setEnabled(!busy);aaSource_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+49,modal.w-12,textControlHeight)));aaOpacity_->setVisible(show&&aaAuto_&&aaSpec_.colorSource==0);aaOpacity_->setEnabled(!busy);aaOpacity_->setBounds(toDisplay(gfx::Rect(modal.x2()-70,modal.y+75,64,textControlHeight)));aaOpacitySlider_->setVisible(show&&aaAuto_&&aaSpec_.colorSource==0);aaOpacitySlider_->setEnabled(!busy);aaOpacitySlider_->value=aaSpec_.opacity;aaOpacitySlider_->setBounds(toDisplay(gfx::Rect(modal.x+90,modal.y+75,modal.w-166,textControlHeight)));aaColorEntry_->setVisible(show&&!aaAuto_);aaColorEntry_->setEnabled(!busy);aaColorEntry_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+49,modal.w-12,textControlHeight)));aaPicker_->setVisible(show&&!aaAuto_);aaPicker_->setEnabled(!busy);aaPicker_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+75,modal.w-12,116)));aaInterior_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+(aaAuto_?101:197),130,textControlHeight)));aaLiveButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modalActionY(modal),90,textControlHeight)));if(show){discard_->setEnabled(!busy);keep_->setEnabled(true);dialogClose_->setEnabled(true);}}

void Editor::stopConvolution(){if(convolutionCancel_)convolutionCancel_->store(true);++convolutionGeneration_;convolutionScheduled_=false;convolutionCommit_=0;}

void Editor::changeConvolution(){
 stopConvolution();++convolutionRevision_;
 try{if(document.restoreConvolutionBaseline()&&convolutionLiveEnabled_){convolutionScheduled_=true;convolutionDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(40);}}
 catch(const std::exception& e){status_=U"卷积失败："+unicodeText(e.what());convolutionCommit_=0;}
 refresh();
}

void Editor::launchConvolution(){
 try{
  auto task=document.captureConvolutionSurfaceTask(convolutionSpec_);if(!task){status_=U"卷积预览目标已变化";convolutionCommit_=0;return;}
  auto token=std::make_shared<std::atomic<bool>>(false);convolutionCancel_=token;auto generation=convolutionGeneration_,revision=convolutionRevision_;
  std::packaged_task<ConvolutionResult()> work([task=std::move(*task),token,generation,revision]()mutable{
   ConvolutionResult result{std::move(task),generation,revision};
   try{result.cancelled=!Document::runConvolutionSurfaceTask(result.task,[token]{return token->load();});}
   catch(const std::exception& e){result.error=e.what();}return result;
  });convolutionWorker_=work.get_future();std::thread(std::move(work)).detach();
 }catch(const std::exception& e){if(convolutionCancel_)convolutionCancel_->store(true);convolutionWorker_=std::future<ConvolutionResult>{};convolutionCommit_=0;status_=U"卷积失败："+unicodeText(e.what());}
}

void Editor::requestConvolutionApply(bool close){if(close && convolutionApplied_ && *convolutionApplied_==convolutionRevision_){resolve(false);return;}stopConvolution();convolutionCommit_=close?2:1;convolutionScheduled_=true;convolutionDue_=std::chrono::steady_clock::now();refresh();}

void Editor::convolutionTick(){
 if(pending_!=Pending::Convolution)return;
 if(convolutionWorker_.valid()&&convolutionWorker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){
  try{
   auto result=convolutionWorker_.get();
   if(result.generation==convolutionGeneration_){
    if(result.cancelled)convolutionCommit_=0;
    else if(!result.error.empty()){status_=U"卷积失败："+unicodeText(result.error);convolutionCommit_=0;}
    else if(std::none_of(result.task.produced.begin(),result.task.produced.end(),[](auto b){return b!=0;})){status_=U"没有可处理的内容";convolutionCommit_=0;}
    else if(document.publishConvolutionSurfaceTask(std::move(result.task))){
     if(convolutionCommit_){const int commit=convolutionCommit_;convolutionCommit_=0;
      if(document.commitConvolutionAdjustment()){
       convolutionApplied_=result.optionsRevision;if(commit==2){resolve(false);return;}
       document.beginColorAdjustment(document.timelineSelection().layers);
      }else{status_=U"没有可处理的内容";if(!document.colorAdjustmentActive())document.beginColorAdjustment(document.timelineSelection().layers);}
     }
    }else{status_=U"卷积结果已失效";convolutionCommit_=0;}
    refresh();
   }
  }catch(const std::exception& e){status_=U"卷积失败："+unicodeText(e.what());convolutionCommit_=0;refresh();}
 }
 if(convolutionScheduled_&&!convolutionWorker_.valid()&&std::chrono::steady_clock::now()>=convolutionDue_){convolutionScheduled_=false;launchConvolution();refresh();}
}

void Editor::openConvolution(){
 if(pending_!=Pending::None||document.active())return;
 try{if(!document.beginColorAdjustment(document.timelineSelection().layers))return;}
 catch(const std::exception& e){status_=U"卷积失败："+unicodeText(e.what());refresh();return;}
 playing_=false;convolutionSpec_={};convolutionLiveEnabled_=true;convolutionApplied_.reset();convolutionScrollPixels_=0;pending_=Pending::Convolution;menuBar_->setEnabled(false);discard_->caption=U"完成";keep_->caption=U"取消";changeConvolution();
}

void Editor::createConvolutionControls(){for(std::size_t i=0;i<convolutionPresets().size();++i){auto control=button(unicodeText(convolutionPresets()[i].id),[this,i]{convolutionSpec_.presetId=convolutionPresets()[i].id;convolutionSpec_.channels=convolutionPresets()[i].channels;changeConvolution();});control->setVisible(false);convolutionPresets_.push_back(control);}const char32_t* names[]{U"R",U"G",U"B",U"A"};for(int i=0;i<4;++i)convolutionChannels_[i]=button(names[i],[this,i]{convolutionSpec_.channels[i]=!convolutionSpec_.channels[i];changeConvolution();});convolutionTiled_=button(U"平铺",[this]{convolutionSpec_.tiled=!convolutionSpec_.tiled;changeConvolution();});convolutionLive_=button(U"实时预览",[this]{convolutionLiveEnabled_=!convolutionLiveEnabled_;stopConvolution();try{if(document.restoreConvolutionBaseline()&&convolutionLiveEnabled_){convolutionScheduled_=true;convolutionDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(40);}}catch(const std::exception& e){status_=U"卷积失败："+unicodeText(e.what());convolutionCommit_=0;}refresh();});convolutionApply_=button(U"应用",[this]{requestConvolutionApply(false);});for(auto control:{convolutionTiled_,convolutionLive_}){control->iconSkin=&toolIcons_;control->bareIconWithCaption=true;}for(auto control:convolutionChannels_)control->setVisible(false);for(auto control:{convolutionTiled_,convolutionLive_,convolutionApply_})control->setVisible(false);auto scroll=new DialogBackground<PixelScrollBar>(skin_,true);configureDialogBackground(scroll);convolutionScroll_=scroll;addChild(scroll);convolutionScroll_->changed=[this](int v){convolutionScrollPixels_=v;refresh();};convolutionScroll_->setVisible(false);}

void Editor::layoutConvolution(const gfx::Rect& modal){bool show=pending_==Pending::Convolution,busy=convolutionCommit_!=0;auto viewport=toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::bodyTop,std::max(70,modal.w-109),modal.h-59));int total=int(convolutionPresets_.size())*DialogLayout::rowStep*uiScale;convolutionScrollPixels_=std::clamp(convolutionScrollPixels_,0,std::max(0,total-viewport.h));convolutionScroll_->setVisible(show);convolutionScroll_->setEnabled(!busy);convolutionScroll_->setDockBounds(gfx::Rect(viewport.x2()-7*uiScale,viewport.y,7*uiScale,viewport.h));convolutionScroll_->configure(total,viewport.h,convolutionScrollPixels_);convolutionScroll_->wheelStep=DialogLayout::rowStep*uiScale;viewport.w-=8*uiScale;for(std::size_t i=0;i<convolutionPresets_.size();++i){auto control=convolutionPresets_[i];control->setBounds(gfx::Rect(viewport.x,viewport.y+int(i)*DialogLayout::rowStep*uiScale-convolutionScrollPixels_,viewport.w,textControlHeight*uiScale));control->paletteViewport=[viewport]{return viewport;};control->active=convolutionSpec_.presetId==convolutionPresets()[i].id;control->setEnabled(!busy);control->setVisible(show&&viewport.intersects(control->bounds()));}int x=modal.x2()-96;for(int i=0;i<4;++i){auto c=convolutionChannels_[i];c->setVisible(show);c->setEnabled(!busy);c->active=convolutionSpec_.channels[i];c->setBounds(toDisplay(gfx::Rect(x+i*22,modal.y+DialogLayout::bodyTop,20,textControlHeight)));}int y=modal.y+49;for(auto c:{convolutionTiled_,convolutionLive_,convolutionApply_}){c->setVisible(show);c->setEnabled(!busy);c->setBounds(toDisplay(gfx::Rect(x,y,88,textControlHeight)));y+=DialogLayout::rowStep;}convolutionTiled_->icon=convolutionSpec_.tiled?"check":"checkboxUnchecked";convolutionLive_->icon=convolutionLiveEnabled_?"check":"checkboxUnchecked";if(show){discard_->setEnabled(!busy);keep_->setEnabled(!busy);dialogClose_->setEnabled(!busy);}}

void Editor::cancelGradientMapJob(){if(gmCancel_)gmCancel_->store(true);++gmGeneration_;gmScheduled_=false;gmCommit_=false;}

void Editor::scheduleGradientMap(bool commit){
 cancelGradientMapJob();
 try{if(document.restoreGradientMapBaseline()){gmCommit_=commit;gmScheduled_=commit||adjustmentPreviewEnabled_;}}
 catch(const std::exception& e){gmCommit_=false;gmScheduled_=false;status_=U"渐变映射失败："+unicodeText(e.what());}
 updateAdjustmentControls();invalidate();
}

void Editor::gradientMapTick(){
 if(editingLayerAdjustment_||pending_!=Pending::ColorAdjustment||adjustmentSpec_.kind!=ColorAdjustmentKind::GradientMap)return;
 if(gmWorker_.valid()&&gmWorker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){
  try{
   auto result=gmWorker_.get();
   if(result.generation==gmGeneration_){
    if(result.cancelled){gmCommit_=false;}
    else if(!result.error.empty()){status_=U"渐变映射失败："+unicodeText(result.error);gmCommit_=false;}
    else if(document.publishGradientMapTask(std::move(result.task))){
     if(gmCommit_){gmCommit_=false;([&]{Document::HistoryLabelScope historyLabel(document,pending_==Pending::ReplaceColor?U"替换颜色":historyAdjustmentLabel());return document.commitColorAdjustment();})();resolve(false);return;}
    }else{gmCommit_=false;status_=U"渐变映射结果已失效";}
    refresh();
   }
  }catch(const std::exception& e){gmCommit_=false;status_=U"渐变映射失败："+unicodeText(e.what());refresh();}
 }
 if(gmScheduled_&&!gmWorker_.valid()){
  gmScheduled_=false;
  try{
   auto task=document.captureGradientMapTask();if(!task){gmCommit_=false;status_=U"渐变映射结果已失效";refresh();return;}
   auto token=std::make_shared<std::atomic<bool>>(false);gmCancel_=token;auto settings=adjustmentSpec_.gradientMap;auto generation=gmGeneration_;
   std::packaged_task<GradientMapResult()> work([task=std::move(*task),token,settings,generation]()mutable{
    GradientMapResult result{std::move(task),generation};
    try{result.cancelled=!Document::runGradientMapTask(result.task,settings,[token]{return token->load();});}
    catch(const std::exception& e){result.error=e.what();}
    return result;
   });
   gmWorker_=work.get_future();std::thread(std::move(work)).detach();
  }catch(const std::exception& e){if(gmCancel_)gmCancel_->store(true);gmWorker_=std::future<GradientMapResult>{};gmCommit_=false;status_=U"渐变映射失败："+unicodeText(e.what());refresh();}
 }
}

GradientMapPresetStore Editor::gradientMapStore()const{return GradientMapPresetStore(palettePreferencePath().parent_path());}

void Editor::gmChanged(bool controlsChanged){if(editingLayerAdjustment_&&controlsChanged)layerAdjustmentEnabled_=true;auto& settings=adjustmentSpec_.gradientMap;settings=normalizeGradientMap(settings);gmStop_=std::clamp(gmStop_,0,int(settings.stops.size())-1);auto stop=settings.stops[gmStop_];if(!gmPosition_->hasFocus())gmPosition_->setText(std::to_string(gradientRound(stop.position*100)));if(!gmColor_->hasFocus())gmColor_->setText(paletteHex(stop.color));gmPicker_->syncColors(stop.color,stop.color);int match=-1;for(int i=0;i<int(gmKeys_.size());++i){int key=gmKeys_[i];if(gradientMapSignature(settings)==gradientMapSignature(key<8?gradientMapBuiltins()[key].settings:gmSaved_[key-8].settings)){match=i;break;}}gmPreset_->setSelectedIndex(match);if(match<0)gmPreset_->caption=U"自定义";previewAdjustment();}

void Editor::gmRefreshPresets(){std::vector<std::u32string> names;gmKeys_.clear();for(int i=0;i<8;++i)if(std::find(gmHidden_.begin(),gmHidden_.end(),i)==gmHidden_.end()){names.push_back(gradientMapBuiltins()[i].name);gmKeys_.push_back(i);}for(int i=0;i<int(gmSaved_.size());++i){names.push_back(unicodeText(gmSaved_[i].name));gmKeys_.push_back(8+i);}gmPreset_->setOptions(names);gmPreset_->setSelectedIndex(-1);}

void Editor::openGradientMapLayer(bool create){if(pending_!=Pending::None||document.active())return;try{if(create)document.createGradientMapLayer();if(!document.beginLayerAdjustment())return;editingLayerAdjustment_=true;playing_=false;adjustmentSpec_={};adjustmentSpec_.kind=ColorAdjustmentKind::GradientMap;adjustmentSpec_.gradientMap=document.layer().adjustment->gradientMap;layerAdjustmentEnabled_=document.layer().adjustment->enabled;adjustmentPreviewEnabled_=true;pending_=Pending::ColorAdjustment;menuBar_->setEnabled(false);discard_->caption=U"应用";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);gmReadable_=true;try{gmSaved_=gradientMapStore().load();gmHidden_=gradientMapStore().hidden();}catch(const std::exception& e){gmSaved_.clear();gmHidden_.clear();gmReadable_=false;status_=U"预设读取失败："+unicodeText(e.what());}gmName_->setText("");gmRefreshPresets();gmStop_=0;gmDither_->setSelectedIndex(adjustmentSpec_.gradientMap.dither);gmChanged(false);refresh();}catch(const std::exception& e){status_=unicodeText(e.what());if(editingLayerAdjustment_){document.cancelLayerAdjustment();editingLayerAdjustment_=false;}refresh();}}
void Editor::openGradientMap(){openColorAdjustment(ColorAdjustmentKind::GradientMap);if(pending_!=Pending::ColorAdjustment)return;gmReadable_=true;gmError_.clear();try{gmSaved_=gradientMapStore().load();gmHidden_=gradientMapStore().hidden();}catch(const std::exception& e){gmSaved_.clear();gmHidden_.clear();gmReadable_=false;gmError_=U"预设读取失败";status_=U"预设读取失败："+unicodeText(e.what());}gmName_->setText("");gmRefreshPresets();gmStop_=0;gmDither_->setSelectedIndex(0);gmChanged();}

void Editor::createGradientMapControls(){gmTrack_=new GradientStopsTrack(toolIcons_);gmTrack_->stops=&adjustmentSpec_.gradientMap.stops;gmTrack_->selected=&gmStop_;gmTrack_->changed=[this]{gmChanged();};addChild(gmTrack_);gmTrack_->setVisible(false);auto dropdown=[this](){auto d=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(d);addChild(d);d->setVisible(false);return d;};gmPreset_=dropdown();gmPreset_->changed=[this](int i){if(i<0||i>=int(gmKeys_.size()))return;auto key=gmKeys_[i];adjustmentSpec_.gradientMap=key<8?gradientMapBuiltins()[key].settings:gmSaved_[key-8].settings;gmStop_=0;gmDither_->setSelectedIndex(adjustmentSpec_.gradientMap.dither);gmChanged();};gmDither_=dropdown();gmDither_->setOptions({U"无",U"Bayer 2",U"Bayer 4",U"Bayer 8",U"棋盘",U"斜线",U"反向斜线",U"水平",U"垂直"});gmDither_->changed=[this](int i){adjustmentSpec_.gradientMap.dither=i;gmChanged();};auto entry=[this](){auto e=new PixelEntry(font_,skin_);addChild(e);e->setVisible(false);e->cancel=[this]{resolve(false);};return e;};gmPosition_=entry();gmPosition_->numeric=true;gmPosition_->suffix=U"%";gmPosition_->Change.connect([this]{try{double position=std::stod(gmPosition_->text())/100;if(!std::isfinite(position))return;auto& stops=adjustmentSpec_.gradientMap.stops;auto stop=stops[gmStop_];double original=stop.position;stop.position=std::clamp(position,0.0,1.0);if(stop.position==0||stop.position==1)for(int i=0;i<int(stops.size());++i)if(i!=gmStop_&&stops[i].position==stop.position)stops[i].position=original;stops[gmStop_]=stop;std::stable_sort(stops.begin(),stops.end(),[](auto a,auto b){return a.position<b.position;});gmStop_=int(std::find_if(stops.begin(),stops.end(),[&](auto v){return v.position==stop.position&&v.color==stop.color;})-stops.begin());gmChanged();}catch(...){}});gmColor_=entry();gmColor_->Change.connect([this]{Pixel color;if(parsePaletteHex(gmColor_->text(),color)){adjustmentSpec_.gradientMap.stops[gmStop_].color=color|0xff000000;gmChanged();}});gmName_=entry();gmName_->Change.connect([this]{refresh();});

 auto picker=new DialogBackground<NativeColorPicker>(font_,skin_,assets_/"color-picker");configureDialogBackground(picker);addChild(picker);gmPicker_=picker;picker->changed=[this](Pixel c,bool){adjustmentSpec_.gradientMap.stops[gmStop_].color=c|0xff000000;gmChanged();};picker->setVisible(false);

 gmMode_=button(U"连续",[this]{adjustmentSpec_.gradientMap.steps=!adjustmentSpec_.gradientMap.steps;gmChanged();});gmReverse_=button(U"反向",[this]{adjustmentSpec_.gradientMap.reverse=!adjustmentSpec_.gradientMap.reverse;gmChanged();});gmPalette_=button(U"来自色卡",[this]{std::vector<Pixel> colors;for(auto e:document.palette().entries)if((e.color>>24)&&std::find(document.palette().slots.begin(),document.palette().slots.end(),e.id)!=document.palette().slots.end()&&colors.size()<256)colors.push_back(e.color);std::stable_sort(colors.begin(),colors.end(),[](auto a,auto b){return (int(a&255)-int(b&255))*.2126+(int((a>>8)&255)-int((b>>8)&255))*.7152+(int((a>>16)&255)-int((b>>16)&255))*.0722<0;});auto& stops=adjustmentSpec_.gradientMap.stops;stops.clear();for(int i=0;i<int(colors.size());++i)stops.push_back({colors.size()==1?0:double(i)/(colors.size()-1),colors[i]|0xff000000});gmStop_=0;gmChanged();});gmSave_=button(U"保存预设",[this]{try{auto next=gradientMapStore().save(gmName_->text(),adjustmentSpec_.gradientMap);gmSaved_=std::move(next);gmName_->setText("");gmRefreshPresets();gmError_.clear();status_=U"预设已保存";}catch(const std::exception& e){gmError_=U"预设保存失败";status_=U"保存失败："+unicodeText(e.what());}refresh();});gmDelete_=button(U"删除预设",[this]{int i=gmPreset_->selectedIndex();if(i<0||i>=int(gmKeys_.size()))return;int key=gmKeys_[i];try{if(key<8)gmHidden_=gradientMapStore().hide(key);else gmSaved_=gradientMapStore().remove(gmSaved_[key-8].name);gmRefreshPresets();gmError_.clear();}catch(const std::exception& e){gmError_=U"预设删除失败";status_=U"删除失败："+unicodeText(e.what());}refresh();});gmAdd_=button(U"添加色标",[this]{auto& stops=adjustmentSpec_.gradientMap.stops;if(stops.size()>=256)return;int i=0;double gap=-1;for(int n=0;n<int(stops.size())-1;++n)if(stops[n+1].position-stops[n].position>gap){gap=stops[n+1].position-stops[n].position;i=n;}double p=std::clamp((stops[i].position+stops[i+1].position)/2,.001,.999);if(gap<.002)return;GradientSpec s;s.stops=stops;auto color=GradientSampler(s).forAmount(p,0,0);stops.insert(stops.begin()+i+1,{p,color});gmStop_=i+1;gmChanged();});gmRemove_=button(U"删除色标",[this]{auto& stops=adjustmentSpec_.gradientMap.stops;if(stops.size()<=2)return;stops.erase(stops.begin()+gmStop_);gmStop_=std::max(0,gmStop_-1);gmChanged();});gmRestore_=button(U"重置颜色",[this]{auto& stops=adjustmentSpec_.gradientMap.stops;auto first=stops.front().color,last=stops.back().color;stops={{0,first},{1,last}};gmStop_=0;gmChanged();});gmFlipStops_=button(U"反转色标",[this]{auto& stops=adjustmentSpec_.gradientMap.stops;auto selected=stops[gmStop_];for(auto& stop:stops)stop.position=1-stop.position;std::reverse(stops.begin(),stops.end());std::stable_sort(stops.begin(),stops.end(),[](auto a,auto b){return a.position<b.position;});gmStop_=int(std::find_if(stops.begin(),stops.end(),[&](auto v){return v.position==1-selected.position&&v.color==selected.color;})-stops.begin());gmChanged();});gmReverse_->skinStyle="checkbox";for(auto b:{gmMode_,gmReverse_,gmPalette_,gmSave_,gmDelete_,gmAdd_,gmRemove_,gmRestore_,gmFlipStops_})b->setVisible(false);gmRemove_->caption.clear();gmRemove_->icon="delete";gmRemove_->iconSkin=&toolIcons_;}

void Editor::updateAdjustmentControls(){

    if(adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap){adjustmentPreview_->active=adjustmentPreviewEnabled_;gmReverse_->active=adjustmentSpec_.gradientMap.reverse;gmMode_->active=adjustmentSpec_.gradientMap.steps;gmMode_->caption=adjustmentSpec_.gradientMap.steps?U"阶梯":U"连续";gmReverse_->invalidate();gmMode_->invalidate();gmTrack_->invalidate();return;}

    if(adjustmentSpec_.kind==ColorAdjustmentKind::Curves){const char32_t* names[]{U"RGB",U"红色",U"绿色",U"蓝色"};curveChannelButton_->caption=names[curveChannel_];curveEditor_->points=&adjustmentSpec_.curves[curveChannel_];curveEditor_->histogram=&curveHistogram_[curveChannel_];curveEditor_->channel=curveChannel_;int index=curveEditor_->selected>=0&&curveEditor_->selected<int(curveEditor_->points->size())?curveEditor_->selected:0;auto p=(*curveEditor_->points)[index];for(int axis=0;axis<2;++axis)if(!adjustmentInputs_[axis]->hasFocus())adjustmentInputs_[axis]->setText(std::to_string(int(axis?p.y:p.x)));adjustmentInputs_[0]->setEnabled(index>0&&index<int(curveEditor_->points->size())-1);curveDeleteButton_->setEnabled(index>0&&index<int(curveEditor_->points->size())-1);adjustmentPreview_->active=adjustmentPreviewEnabled_;curveEditor_->invalidate();return;}for(auto input:adjustmentInputs_)input->setEnabled(true);

    for(int i=0;i<3;++i){double value=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance?adjustmentSpec_.balance[adjustmentTone_][i]:adjustmentSpec_.kind==ColorAdjustmentKind::BrightnessContrast?(i?adjustmentSpec_.contrast:adjustmentSpec_.brightness):i==0?adjustmentSpec_.hue:i==1?adjustmentSpec_.saturation:adjustmentSpec_.lightness;auto slider=adjustmentSliders_[i];slider->minimum=-100;slider->maximum=100;

      if(adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation){if(i==0){slider->minimum=adjustmentSpec_.colorize?0:-180;slider->maximum=adjustmentSpec_.colorize?360:180;}else if(i==1&&adjustmentSpec_.colorize)slider->minimum=0;}

      slider->value=int(value);slider->invalidate();if(!adjustmentInputs_[i]->hasFocus())adjustmentInputs_[i]->setText(std::to_string(int(value)));}adjustmentColorize_->active=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance?adjustmentSpec_.preserveLuminosity:adjustmentSpec_.colorize;adjustmentPreview_->active=adjustmentPreviewEnabled_;adjustmentColorize_->caption=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance?U"保持亮度":U"着色";adjustmentColorize_->icon=(adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance?adjustmentSpec_.preserveLuminosity:adjustmentSpec_.colorize)?"check":"checkboxUnchecked";for(int i=0;i<3;++i)if(adjustmentToneButtons_[i]){adjustmentToneButtons_[i]->active=i==adjustmentTone_;adjustmentToneButtons_[i]->invalidate();}

  }

void Editor::previewAdjustment(){if(editingLayerAdjustment_){document.previewLayerAdjustment(adjustmentSpec_.gradientMap,adjustmentPreviewEnabled_,layerAdjustmentEnabled_);updateAdjustmentControls();invalidate();return;}if(adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap){scheduleGradientMap();return;}try{document.updateColorAdjustment(adjustmentSpec_,adjustmentPreviewEnabled_);}catch(const std::exception& e){status_=U"颜色调整失败："+unicodeText(e.what());}updateAdjustmentControls();invalidate();}

void Editor::openColorAdjustment(ColorAdjustmentKind kind){if(pending_!=Pending::None || document.active())return;document.commitFloatingPaste();cancelStroke();try{if(!document.beginColorAdjustment(kind==ColorAdjustmentKind::GradientMap?document.timelineSelection().layers:std::vector<std::string>{}))return;}catch(const std::exception& e){status_=U"颜色调整失败："+unicodeText(e.what());refresh();return;}playing_=false;adjustmentSpec_={};adjustmentSpec_.kind=kind;curveChannel_=0;if(kind==ColorAdjustmentKind::Curves){curveHistogram_=buildCurveHistogram(document.activeSurface().pixels);curveEditor_->selectChannel();}adjustmentTone_=1;adjustmentPreviewEnabled_=true;relativeHsl_={};hasColorizedHsl_=false;pending_=Pending::ColorAdjustment;menuBar_->setEnabled(false);discard_->caption=U"应用";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);previewAdjustment();refresh();}

void Editor::updateResizeFields(){resizeUpdating_=true;for(int i=0;i<4;++i)if(!resizeInputs_[i]->hasFocus()){const double value=i==0?resizeWidth_:i==1?resizeHeight_:i==2?100.0*resizeWidth_/document.width():100.0*resizeHeight_/document.height();resizeInputs_[i]->setText(std::to_string(int(std::floor(value+.5))));}resizeLock_->icon=resizeLocked_?"lock":"unlock";resizeMethod_->caption=resizeMethodValue_==ImageInterpolation::Nearest?U"最近邻":U"平滑";resizeUpdating_=false;}

void Editor::openImageResize(){if(pending_!=Pending::None||document.active())return;document.commitFloatingPaste();cancelStroke();playing_=false;resizeWidth_=document.width();resizeHeight_=document.height();resizeLocked_=true;resizeMethodValue_=ImageInterpolation::Nearest;pending_=Pending::ImageResize;menuBar_->setEnabled(false);discard_->caption=U"应用";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);updateResizeFields();refresh();resizeInputs_[0]->requestFocus();resizeInputs_[0]->selectAllText();}

bool Editor::framePngBusy()const{return framePngSnapshot_.has_value()||framePngWorker_.valid();}

bool Editor::supportedExportPreference(int index)const{return index==1||index==2||index==3||index==4||index==5||index==6||index==7;}

void Editor::unsupportedExportPreference(){status_=U"默认导出格式尚未接入，请在首选项选择已支持格式";refresh();}

void Editor::openFramePngExport(bool usePreference){if(usePreference&&pending_==Pending::None&&!document.active()&&restoreExportMemory(true))return;const int preferred=usePreference?runtimePreferences_.index("files.exportFormat.Select"):1;openGifExport();if(pending_==Pending::GifExport){framePngMode_=true;framePngAutomatic_=true;frameBmp_=false;frameIco_=false;frameSvg_=false;frameJpeg_=false;setFrameSequenceFormat(preferred==2?FrameSequenceFormat::Jpeg:preferred==4?FrameSequenceFormat::Svg:preferred==6?FrameSequenceFormat::Bmp:preferred==7?FrameSequenceFormat::Ico:FrameSequenceFormat::Png,preferred!=2&&preferred!=4&&preferred!=6&&preferred!=7);refresh();}}

ExportConflictChoice Editor::framePngConflict(const std::filesystem::path& path,const std::filesystem::path& suggested){PixelMenu menu(skin_);ExportConflictChoice choice=ExportConflictChoice::Cancel;auto label=new PixelMenuItem(font_,skin_,U"文件已存在："+path.filename().u32string());label->setEnabled(false);menu.addChild(label);auto add=[&](const std::u32string& text,ExportConflictChoice value){auto item=new PixelMenuItem(font_,skin_,text);item->Click.connect([&choice,value]{choice=value;});menu.addChild(item);};add(U"覆盖",ExportConflictChoice::Overwrite);add(U"重命名为："+suggested.filename().u32string(),ExportConflictChoice::Rename);add(U"全部覆盖",ExportConflictChoice::OverwriteAll);add(U"全部重命名",ExportConflictChoice::RenameAll);add(U"取消导出",ExportConflictChoice::Cancel);auto at=discard_->bounds();menu.showPopup({at.x,at.y2()},display());return choice;}

void Editor::beginFramePngExport(const std::filesystem::path& path,const ExportConflictResolver& resolver){

   animationLayerJob_=false;auto options=gifOptions_;options.protection=ExportProtection(runtimePreferences_.index("files.exportProtection.Select"));if(!gifExplicitRange_&&options.loopSectionId.empty()){options.frameStart=1;options.frameEnd=int(document.timeline().state().frames.size());}FramePngExportOptions requested{options,framePngAutomatic_,frameBmp_,frameIco_,frameSvg_,frameJpeg_};auto ids=framePngExportFrameIds(document.timeline().state(),requested);auto paths=planFrameSequencePaths(path.parent_path(),path.filename().u32string(),ids.size(),resolver,requested.jpeg?FrameSequenceFormat::Jpeg:requested.svg?FrameSequenceFormat::Svg:requested.ico?FrameSequenceFormat::Ico:requested.bmp?FrameSequenceFormat::Bmp:FrameSequenceFormat::Png);if(!paths){status_=U"已取消导出";return;}exportSequenceMemoryName_=path.filename().u8string();framePngOptions_=requested;framePngPaths_=std::move(*paths);exportedDirectory_=path.parent_path();framePngJob_=std::make_shared<FramePngJobState>();framePngJob_->total=ids.size();framePngSnapshot_.emplace(document);refresh();

  }

bool Editor::saveFramePngExport(){wchar_t filename[32768]{};auto name=std::filesystem::path(document.name()).stem().wstring()+(frameJpeg_?L".jpg":frameSvg_?L".svg":frameIco_?L".ico":frameBmp_?L".bmp":L".png");std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=frameJpeg_?L"JPEG 帧序列\0*.jpg;*.jpeg\0\0":frameSvg_?L"SVG 帧序列\0*.svg\0\0":frameIco_?L"ICO 帧序列\0*.ico\0\0":frameBmp_?L"BMP 帧序列\0*.bmp\0\0":framePngAutomatic_?L"PNG 自动 帧序列\0*.png\0\0":L"PNG RGBA 帧序列\0*.png\0\0";dialog.lpstrDefExt=frameJpeg_?L"jpg":frameSvg_?L"svg":frameIco_?L"ico":frameBmp_?L"bmp":L"png";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST;if(!chooseFormExportFile(&dialog)){if(CommDlgExtendedError())status_=U"无法打开导出文件对话框";return false;}try{beginFramePngExport(filename,[this](const auto& path,const auto& suggested){return framePngConflict(path,suggested);});}catch(const std::exception& e){status_=U"导出失败："+unicodeText(e.what());}return false;}

void Editor::framePngTick(){try{if(framePngSnapshot_){if(framePngJob_->cancel){framePngSnapshot_.reset();status_=U"已取消导出";resolve(false);return;}if(!framePngSnapshot_->advance(document,std::chrono::steady_clock::now()+std::chrono::milliseconds(2)))return;auto snapshot=std::move(*framePngSnapshot_);framePngSnapshot_.reset();auto options=framePngOptions_;auto paths=framePngPaths_;auto job=framePngJob_;const bool layerJob=animationLayerJob_;auto layerOptions=animationLayerOptions_;auto layerPlan=animationLayerPlan_;std::packaged_task<std::string()> work([snapshot=std::move(snapshot),options,paths=std::move(paths),job,layerJob,layerOptions,layerPlan=std::move(layerPlan)]()mutable{try{auto copy=snapshot.finish();auto cancel=[job]{return job->cancel.load();};auto progress=[job](std::size_t n,std::size_t){job->written=n;};auto count=layerJob?writeAnimationLayerExport(copy,layerOptions,layerPlan,cancel,progress):writeFramePngSequence(copy,options,paths,cancel,progress);return job->cancel?std::string("cancel"):std::to_string(count);}catch(const std::exception& e){return std::string("error:")+e.what();}});framePngWorker_=work.get_future();std::thread(std::move(work)).detach();refresh();}if(framePngWorker_.valid()){if(framePngWorker_.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready){invalidate();return;}auto result=framePngWorker_.get();if(result=="cancel")status_=U"已取消导出，保留已写入的文件";else if(result.rfind("error:",0)==0){status_=(animationLayerJob_?U"图层批量导出失败：":U"帧序列导出失败：")+unicodeText(result.substr(6));exportOpenFolderRequested_=false;refresh();return;}else status_=U"已导出 "+unicodeText(result)+(animationLayerJob_?(animationLayerOptions_.staticImage?U" 个图层":animationLayerOptions_.webp?U" 个图层 WebP":U" 个图层 GIF"):framePngOptions_.jpeg?U" 帧 JPEG":framePngOptions_.svg?U" 帧 SVG":framePngOptions_.ico?U" 帧 ICO":framePngOptions_.bmp?U" 帧 BMP":U" 帧 PNG");if(result!="cancel"){rememberSuccessfulExport(exportedDirectory_/std::filesystem::u8path(exportSequenceMemoryName_));usageStatistics_.recordExport(animationLayerJob_?(animationLayerOptions_.staticImage?(animationLayerOptions_.format==5?"jpeg":animationLayerOptions_.format==3?"svg":animationLayerOptions_.format==2?"ico":animationLayerOptions_.format==1?"bmp":"png"):animationLayerOptions_.webp?"webp":"gif"):framePngOptions_.jpeg?"jpeg":framePngOptions_.svg?"svg":framePngOptions_.ico?"ico":framePngOptions_.bmp?"bmp":"png");if(!framePngPaths_.empty())recordRecentExportPath(framePngPaths_.back());playExportSuccessSound();}const bool openFolder=exportOpenFolderRequested_&&result!="cancel";const auto folder=exportedDirectory_;resolve(false);if(openFolder)finishExportFolder(folder);}}catch(const std::exception& e){framePngSnapshot_.reset();exportOpenFolderRequested_=false;status_=(animationLayerJob_?U"图层批量导出失败：":U"帧序列导出失败：")+unicodeText(e.what());refresh();}}

void Editor::openGifExport(){exportSlices_=false;exportSliceId_.clear();exportOpenFolderRequested_=false;exportedDirectory_.clear();if(pending_!=Pending::None||document.active())return;framePngMode_=false;exportAllLayers_=false;animationLayerJob_=false;gifWebp_=false;frameSvg_=false;frameJpeg_=false;gifInputs_[0]->suffix=U"";gifOptions_={};gifOptions_.scalePercent=runtimePreferences_.defaultExportScale();exportScaleScroll_=0;gifOptions_.frameEnd=int(document.timeline().state().frames.size());gifExplicitRange_=false;pending_=Pending::GifExport;exportDirectory_=preferredExportDirectory();exportDefaultName_.clear();exportFilename_->setText("");exportPresets_.name->setText("");updateExportPresetOptions();menuBar_->setEnabled(false);gifInputs_[0]->setText(std::to_string(gifOptions_.scalePercent));gifInputs_[1]->setText("1");gifInputs_[2]->setText(std::to_string(gifOptions_.frameEnd));discard_->caption=U"导出 GIF";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);refresh();}

void Editor::switchAnimatedExportFormat(bool webp){const bool previousSlices=exportSlices_;const auto previousSliceId=exportSliceId_;const bool animated=pending_==Pending::GifExport&&!framePngMode_;const auto previous=gifOptions_;const bool allLayers=exportAllLayers_;const bool range=gifExplicitRange_;const auto name=exportFilename_->text();const auto directory=exportDirectory_;const auto image=exportOptions_;if(pending_!=Pending::None)resolve(false);openGifExport();if(pending_!=Pending::GifExport)return;gifWebp_=webp;if(animated){gifOptions_=previous;gifExplicitRange_=range;exportAllLayers_=allLayers;}else{gifOptions_.scalePercent=image.scalePercent;gifOptions_.trim=image.trim;gifOptions_.trimCommon=image.trimCommon;gifOptions_.layerId=image.layerId;gifOptions_.selection=image.selection&&document.selection().has_value();exportAllLayers_=allLayers;}exportFilename_->setText(name);exportDirectory_=directory;gifInputs_[0]->setText(std::to_string(gifOptions_.scalePercent));gifInputs_[1]->setText(std::to_string(gifOptions_.frameStart));gifInputs_[2]->setText(std::to_string(gifOptions_.frameEnd));discard_->caption=webp?U"导出 WebP":U"导出 GIF";exportSlices_=previousSlices;exportSliceId_=previousSliceId;refresh();}

void Editor::beginAnimationLayerExport(const std::filesystem::path& path,const ExportConflictResolver& resolver){auto options=gifOptions_;options.selection=false;options.layerId.clear();options.protection=ExportProtection(runtimePreferences_.index("files.exportProtection.Select"));if(!gifExplicitRange_&&options.loopSectionId.empty()){options.frameStart=1;options.frameEnd=int(document.timeline().state().frames.size());}auto plan=planAnimationLayerExport(document,{},path.parent_path(),path.filename().u32string(),gifWebp_,resolver);if(!plan){status_=U"已取消导出";return;}exportAllLayers_=true;gifOptions_.layerId.clear();gifOptions_.selection=false;animationLayerJob_=true;animationLayerOptions_={options,gifWebp_};animationLayerPlan_=std::move(*plan);framePngPaths_=animationLayerPlan_.paths;exportSequenceMemoryName_=path.filename().u8string();exportedDirectory_=path.parent_path();framePngJob_=std::make_shared<FramePngJobState>();framePngJob_->total=framePngPaths_.size();framePngSnapshot_.emplace(document);refresh();}

bool Editor::saveAnimationLayerExport(){wchar_t filename[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=gifWebp_?L"WebP 图层批量\0*.webp\0\0":L"GIF 图层批量\0*.gif\0\0";dialog.lpstrDefExt=gifWebp_?L"webp":L"gif";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST;if(!chooseFormExportFile(&dialog))return false;try{beginAnimationLayerExport(filename,[this](const auto& path,const auto& suggested){return framePngConflict(path,suggested);});}catch(const std::exception& e){status_=U"图层批量导出失败："+unicodeText(e.what());refresh();}return false;}

bool Editor::saveGifExport(){if(exportSlices_)return saveSliceExport();if(framePngMode_)return saveFramePngExport();if(!gifOptions_.layerId.empty()&&!document.timeline().hasLayer(gifOptions_.layerId)){exportAllLayers_=true;gifOptions_.layerId.clear();gifOptions_.selection=false;}if(exportAllLayers_)return saveAnimationLayerExport();const auto extension=gifWebp_?L".webp":L".gif";wchar_t filename[32768]{};auto name=std::filesystem::path(document.name()).stem().wstring()+extension;std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=gifWebp_?L"WebP 动画\0*.webp\0\0":L"GIF 动画\0*.gif\0\0";dialog.lpstrDefExt=gifWebp_?L"webp":L"gif";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|(gifOptions_.layerId.empty()?OFN_OVERWRITEPROMPT:0);if(!chooseFormExportFile(&dialog)){if(CommDlgExtendedError())status_=U"无法打开导出文件对话框";return false;}try{auto options=gifOptions_;options.protection=ExportProtection(runtimePreferences_.index("files.exportProtection.Select"));if(!gifExplicitRange_ && options.loopSectionId.empty()){options.frameStart=1;options.frameEnd=int(document.timeline().state().frames.size());}auto output=std::filesystem::path(filename);const auto requested=output;const bool layerTarget=!options.layerId.empty();if(layerTarget){const auto& layer=document.timeline().state().layers[document.timeline().layerIndex(options.layerId)];auto stem=framePngExportStem(output.filename().u32string())+U"-"+framePngExportStem(layer.name,U"layer-1");output=output.parent_path()/std::filesystem::path(stem+(gifWebp_?U".webp":U".gif"));if(std::filesystem::exists(output)){std::filesystem::path suggested;for(int n=1;n<10000;++n){auto suffix=std::to_string(n);auto path=output.parent_path()/std::filesystem::path(stem+U" ("+std::u32string(suffix.begin(),suffix.end())+U")"+(gifWebp_?U".webp":U".gif"));if(!std::filesystem::exists(path)){suggested=path;break;}}if(suggested.empty())return false;const auto choice=framePngConflict(output,suggested);if(choice==ExportConflictChoice::Cancel)return false;if(choice==ExportConflictChoice::Rename||choice==ExportConflictChoice::RenameAll)output=suggested;}}auto out=gifWebp_?encodeAnimationWebp(document,options):encodeAnimationGif(document,options);writeExportBytesAtomic(output,out.bytes);exportedDirectory_=output.parent_path();rememberSuccessfulExport(layerTarget?requested:output);recordRecentExportPath(output);usageStatistics_.recordExport(gifWebp_?"webp":"gif");playExportSuccessSound();status_=gifWebp_?U"已导出 WebP 动画":U"已导出 GIF 动画";return true;}catch(const std::exception& e){status_=(gifWebp_?U"WebP 导出失败：":U"GIF 导出失败：")+unicodeText(e.what());invalidate();return false;}}

void Editor::createGifExportControls(){for(int i=0;i<3;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;addChild(input);gifInputs_[i]=input;input->setVisible(false);auto change=[this,input,i]{try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size()||!std::isfinite(v))return;int n=int(std::floor((i==0&&framePngMode_&&frameSvg_?std::clamp(v,1.0,64.0)*100:std::clamp(v,1.0,i==0?6400.0:double(document.timeline().state().frames.size())))+.5));(i==0?gifOptions_.scalePercent:i==1?gifOptions_.frameStart:gifOptions_.frameEnd)=n;}catch(...){} };input->Change.connect(change);input->blur=change;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}

    gifRange_=button(U"全部帧",[this]{PixelMenu menu(skin_);auto add=[&](std::u32string name,std::string id,bool range){auto item=new PixelMenuItem(font_,skin_,name);item->Click.connect([this,id,range]{gifExplicitRange_=range;gifOptions_.loopSectionId=id;refresh();});menu.addChild(item);};add(U"全部帧","",false);add(U"指定帧范围","",true);for(const auto& loop:document.timeline().state().loopSections)add(U"循环段："+loop.name,loop.id,false);auto at=gifRange_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});

    gifDirection_=button(U"正向",[this]{PixelMenu menu(skin_);const char32_t* names[]{U"正向",U"反向",U"正向往返",U"反向往返"};for(int i=0;i<4;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,i]{gifOptions_.direction=GifDirection(i);refresh();});menu.addChild(item);}auto at=gifDirection_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});gifTrim_=button(U"裁切透明边",[this]{gifOptions_.trim=!gifOptions_.trim;refresh();});gifTrim_->iconSkin=&toolIcons_;gifTrim_->bareIconWithCaption=true;for(auto b:{gifRange_,gifDirection_,gifTrim_})b->setVisible(false);

  }

void Editor::updateSheetImportFields(){if(importSheetUpdating_)return;importSheetUpdating_=true;int sw=importSheetOptions_.selection&&document.selection()?document.selection()->width:document.width(),sh=importSheetOptions_.selection&&document.selection()?document.selection()->height:document.height();int counts[2]{};try{auto plan=planSpriteSheetImport(sw,sh,importSheetOptions_);counts[0]=plan.columns;counts[1]=plan.rows;}catch(...){}for(int i=0;i<8;++i)if(!importSheetInputs_[i]->hasFocus()){int values[]{importSheetOptions_.x,importSheetOptions_.y,importSheetOptions_.width,importSheetOptions_.height,importSheetOptions_.paddingX,importSheetOptions_.paddingY,counts[0],counts[1]};importSheetInputs_[i]->setText(std::to_string(values[i]));}importSheetUpdating_=false;}

void Editor::openSheetImport(bool selected){if(pending_!=Pending::None||document.active())return;if(selected&&!document.selection())return;importSheetOptions_={};importSheetOptions_.selection=selected;if(selected){importSheetOptions_.width=std::min(16,document.selection()->width);importSheetOptions_.height=std::min(16,document.selection()->height);}pending_=Pending::SheetImport;menuBar_->setEnabled(false);discard_->caption=U"导入";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);updateSheetImportFields();refresh();}

void Editor::chooseSheetSource(){importAfterOpen_=true;chooseProject();if(pending_!=Pending::Open&&pending_!=Pending::SheetImport)importAfterOpen_=false;}

void Editor::createSheetImportControls(){for(int i=0;i<8;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;addChild(input);input->setVisible(false);importSheetInputs_[i]=input;auto change=[this,input,i]{if(importSheetUpdating_)return;try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size()||!std::isfinite(v))return;int n=int(std::floor(std::clamp(v,i<2?-262144.0:i<6?0.0:1.0,262144.0)+.5));auto& o=importSheetOptions_;if(i<6){int* fields[]{&o.x,&o.y,&o.width,&o.height,&o.paddingX,&o.paddingY};*fields[i]=i==2||i==3?std::max(1,n):n;}else{bool horizontal=i==6;int extent=o.selection&&document.selection()?(horizontal?document.selection()->width:document.selection()->height):(horizontal?document.width():document.height());int origin=horizontal?o.x:o.y,gap=horizontal?o.paddingX:o.paddingY,count=std::clamp(n,1,10000);(horizontal?o.width:o.height)=std::max(1,int(std::floor(double(extent-origin-gap*(count-1))/count)));}updateSheetImportFields();}catch(...){} };input->Change.connect(change);input->blur=change;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}importSheetLayout_=button(U"排列",[this]{PixelMenu menu(skin_);const char32_t* names[]{U"横向",U"纵向",U"按行",U"按列"};for(int i=0;i<4;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,i]{importSheetOptions_.layout=i;updateSheetImportFields();refresh();});menu.addChild(item);}auto at=importSheetLayout_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});importSheetPartial_=button(U"包含不完整单元格",[this]{importSheetOptions_.partialTiles=!importSheetOptions_.partialTiles;updateSheetImportFields();refresh();});importSheetPartial_->iconSkin=&toolIcons_;importSheetPartial_->bareIconWithCaption=true;importSheetLayout_->setVisible(false);importSheetPartial_->setVisible(false);}

void Editor::openSpriteSheet(){sheetOutputFile_=false;sheetOpenAfterExport_=false;sheetExportedPath_.clear();if(pending_!=Pending::None||document.active())return;sheetOptions_={};sheetOptions_.fixedWidth=document.width()*4;sheetOptions_.fixedHeight=document.height()*4;sheetOptions_.selectedLayerIds=document.timelineSelection().layers;sheetValue_->setText("4");try{if(sheetPreview_) {sheetPreview_->setImage(buildSpriteSheetImage(document,sheetOptions_));sheetPreview_->setVisible(true);}}catch(...){} pending_=Pending::SpriteSheet;menuBar_->setEnabled(false);discard_->caption=U"新建文档";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);refresh();}

bool Editor::saveSpriteSheet(){const auto initialDirectory=preferredExportDirectory().wstring();wchar_t filename[32768]{};auto name=std::filesystem::path(document.name()).stem().wstring()+L"-sprite-sheet.png";std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"PNG 自动 精灵表\0*.png\0\0";dialog.lpstrInitialDir=initialDirectory.empty()?nullptr:initialDirectory.c_str();dialog.lpstrDefExt=L"png";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;if(!chooseExportFile_(&dialog))return false;try{writeStaticImagePngAtomic(filename,encodeSpriteSheet(document,sheetOptions_));sheetExportedPath_=filename;rememberExportDirectory(filename);recordRecentExportPath(filename);usageStatistics_.recordExport("png-sprite-sheet");status_=U"精灵表已导出";return true;}catch(const std::exception& e){status_=U"精灵表导出失败："+unicodeText(e.what());invalidate();return false;}}

void Editor::createSpriteSheetControls(){sheetPreview_=new SpriteSheetPreview(skin_);addChild(sheetPreview_);

    sheetButtons_[0]=button(U"排列",[this]{PixelMenu menu(skin_);const char32_t* names[]{U"横向",U"纵向",U"按行",U"按列"};for(int i=0;i<4;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->checked=[this,i]{return int(sheetOptions_.layout)==i;};item->Click.connect([this,i]{auto& o=sheetOptions_;o.layout=SheetLayout(i);if(i<2)o.constraint=SheetConstraint::None;else if(i==2){if(o.constraint==SheetConstraint::FixedRows)o.constraint=SheetConstraint::FixedColumns;if(o.constraint==SheetConstraint::FixedHeight)o.constraint=SheetConstraint::FixedWidth;}else{if(o.constraint==SheetConstraint::FixedColumns)o.constraint=SheetConstraint::FixedRows;if(o.constraint==SheetConstraint::FixedWidth)o.constraint=SheetConstraint::FixedHeight;}refresh();});menu.addChild(item);}auto at=sheetButtons_[0]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});

    sheetButtons_[1]=button(U"约束",[this]{PixelMenu menu(skin_);bool columns=sheetOptions_.layout==SheetLayout::Columns;const char32_t* names[]{U"无约束",columns?U"固定行数":U"固定列数",columns?U"固定高度":U"固定宽度"};for(int i=0;i<3;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,i,columns]{sheetOptions_.constraint=i==0?SheetConstraint::None:i==1?(columns?SheetConstraint::FixedRows:SheetConstraint::FixedColumns):(columns?SheetConstraint::FixedHeight:SheetConstraint::FixedWidth);refresh();});menu.addChild(item);}auto at=sheetButtons_[1]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});

    sheetButtons_[2]=button(U"帧范围",[this]{PixelMenu menu(skin_);auto add=[&](std::string id,std::u32string name){auto item=new PixelMenuItem(font_,skin_,name);item->checked=[this,id]{return sheetOptions_.frameScope==id;};item->Click.connect([this,id]{sheetOptions_.frameScope=id;refresh();});menu.addChild(item);};add("all",U"全部帧");add("selected",U"选中帧（无选择时当前帧）");for(const auto& l:document.timeline().state().loopSections)add("loop:"+l.id,l.name);auto at=sheetButtons_[2]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});

    sheetButtons_[3]=button(U"图层",[this]{PixelMenu menu(skin_);const char* ids[]{"visible","all","selected"};const char32_t* names[]{U"可见图层",U"所有图层（显示隐藏层）",U"选中图层"};for(int i=0;i<3;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,id=std::string(ids[i])]{sheetOptions_.layerScope=id;refresh();});menu.addChild(item);}for(int split=0;split<2;++split){auto item=new PixelMenuItem(font_,skin_,split==0?U"拆分图层":U"拆分循环段");item->checked=[this,split]{return split==0?sheetOptions_.splitLayers:sheetOptions_.splitLoopSections;};item->setEnabled(split==0||!document.timeline().state().loopSections.empty());item->Click.connect([this,split]{if(split==0)sheetOptions_.splitLayers=!sheetOptions_.splitLayers;else sheetOptions_.splitLoopSections=!sheetOptions_.splitLoopSections;refresh();});menu.addChild(item);}for(bool file:{false,true}){auto mode=new PixelMenuItem(font_,skin_,file?U"导出 PNG 文件":U"新建文档");mode->checked=[this,file]{return sheetOutputFile_==file;};mode->Click.connect([this,file]{sheetOutputFile_=file;refresh();});menu.addChild(mode);}if(sheetOutputFile_){auto openAfter=new PixelMenuItem(font_,skin_,U"导出后自动打开");openAfter->checked=[this]{return sheetOpenAfterExport_;};openAfter->Click.connect([this]{sheetOpenAfterExport_=!sheetOpenAfterExport_;refresh();});menu.addChild(openAfter);}auto at=sheetButtons_[3]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});

    sheetButtons_[4]=button(U"合并重复",[this]{sheetOptions_.mergeDuplicates=!sheetOptions_.mergeDuplicates;refresh();});sheetButtons_[5]=button(U"忽略空帧",[this]{sheetOptions_.ignoreEmpty=!sheetOptions_.ignoreEmpty;refresh();});sheetButtons_[6]=button(U"来源",[this]{PixelMenu menu(skin_);auto add=[&](std::u32string name,bool selection,std::string id){auto item=new PixelMenuItem(font_,skin_,name);item->setEnabled(!selection||document.selection().has_value());item->checked=[this,selection,id]{return sheetOptions_.selection==selection&&sheetOptions_.sliceId==id;};item->Click.connect([this,selection,id]{sheetOptions_.selection=selection;sheetOptions_.sliceId=id;refresh();});menu.addChild(item);};add(U"画布",false,{});add(U"像素选区",true,{});for(const auto& slice:document.slices())add(slice.name,false,slice.id);auto at=sheetButtons_[6]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});for(auto b:sheetButtons_){b->setVisible(false);b->iconSkin=&toolIcons_;}

    sheetValue_=new PixelEntry(font_,skin_);sheetValue_->numeric=true;addChild(sheetValue_);sheetValue_->setVisible(false);auto change=[this]{try{std::size_t used=0;double v=std::stod(sheetValue_->text(),&used);if(used!=sheetValue_->text().size()||!std::isfinite(v))return;auto c=sheetOptions_.constraint;int n=int(std::floor(std::clamp(v,1.0,c==SheetConstraint::FixedWidth||c==SheetConstraint::FixedHeight?262144.0:16384.0)+.5));(c==SheetConstraint::FixedColumns?sheetOptions_.fixedColumns:c==SheetConstraint::FixedRows?sheetOptions_.fixedRows:c==SheetConstraint::FixedWidth?sheetOptions_.fixedWidth:sheetOptions_.fixedHeight)=n;refresh();}catch(...){} };sheetValue_->Change.connect(change);sheetValue_->blur=change;sheetValue_->accept=[this]{resolve(true);};sheetValue_->cancel=[this]{resolve(false);};

  }

void Editor::switchStaticExportFormat(int format){const bool previousSlices=exportSlices_;const auto previousSliceId=exportSliceId_;const bool wasStatic=pending_==Pending::StaticExport,wasSvg=wasStatic&&staticSvg_;const bool wasAnimated=pending_==Pending::GifExport&&!framePngMode_;const bool previousAllLayers=exportAllLayers_;const auto animation=gifOptions_;const auto previous=exportOptions_;const auto previousName=exportFilename_->text();const auto previousDirectory=exportDirectory_;if(pending_!=Pending::None)resolve(false);openStaticExport();if(wasAnimated){exportFilename_->setText(previousName);exportDirectory_=previousDirectory;exportOptions_.scalePercent=animation.scalePercent;exportOptions_.trim=animation.trim;exportOptions_.trimCommon=animation.trimCommon;exportOptions_.selection=animation.selection&&document.selection().has_value();exportOptions_.layerId=animation.layerId;}if(wasStatic){exportFilename_->setText(previousName);exportDirectory_=previousDirectory;exportOptions_.trimCommon=previous.trimCommon;exportOptions_.layerId=previous.layerId;if(previousAllLayers||!previous.layerId.empty()){exportOptions_.scalePercent=previous.scalePercent;exportOptions_.trim=previous.trim;}}exportAllLayers_=previousAllLayers;staticBmp_=format==1;staticIco_=format==2;staticSvg_=format==3;staticJpeg_=format==5;exportOptions_.automatic=format==4;if(staticSvg_&&wasStatic){exportOptions_.trim=previous.trim;exportOptions_.selection=previous.selection;}if(wasSvg&&!staticSvg_){exportOptions_.scalePercent=previous.scalePercent;exportOptions_.trim=previous.trim;exportOptions_.selection=previous.selection;}if(staticSvg_)exportOptions_.scalePercent=100;exportScaleInput_->suffix=staticSvg_?U"x":U"%";exportScaleInput_->setText(staticSvg_?"1":std::to_string(exportOptions_.scalePercent));discard_->caption=staticJpeg_?U"导出 JPEG":staticSvg_?U"导出 SVG":staticIco_?U"导出 ICO":staticBmp_?U"导出 BMP":U"导出 PNG";exportSlices_=previousSlices;exportSliceId_=previousSliceId;refresh();}

void Editor::openSvgExport(){switchStaticExportFormat(3);}

void Editor::openIcoExport(){openStaticExport();staticIco_=true;discard_->caption=U"导出 ICO";refresh();}

void Editor::openBmpExport(){openStaticExport();staticBmp_=true;discard_->caption=U"导出 BMP";refresh();}

void Editor::writeCurrentStaticExport(const std::filesystem::path& path){auto options=exportOptions_;options.protection=ExportProtection(runtimePreferences_.index("files.exportProtection.Select"));if(staticJpeg_){auto out=encodeStaticImageJpeg(document,options);writeExportBytesAtomic(path,out.bytes);}else if(staticSvg_){auto out=encodeStaticImageSvg(document,options);writeExportBytesAtomic(path,out.bytes);}else if(staticIco_){auto out=encodeStaticImageIco(document,options);writeExportBytesAtomic(path,out.bytes);}else if(staticBmp_){auto out=encodeStaticImageBmp(document,options);writeExportBytesAtomic(path,out.bytes);}else{auto out=encodeStaticImagePng(document,options);writeStaticImagePngAtomic(path,out);}}

void Editor::openDocumentExport(){if(pending_!=Pending::None||document.active())return;if(restoreExportMemory())return;const int preferred=runtimePreferences_.index("files.exportFormat.Select");if(document.timeline().state().frames.size()>1&&preferred!=0){openGifExport();return;}if(preferred==3||preferred==5){openGifExport();gifWebp_=preferred==3;discard_->caption=gifWebp_?U"导出 WebP":U"导出 GIF";refresh();return;}if(!supportedExportPreference(preferred)){unsupportedExportPreference();return;}switchStaticExportFormat(preferred==2?5:preferred==4?3:preferred==6?1:preferred==7?2:4);}

void Editor::setFrameSequenceFormat(FrameSequenceFormat format,bool automatic){const bool wasSvg=frameSvg_;frameJpeg_=format==FrameSequenceFormat::Jpeg;frameSvg_=format==FrameSequenceFormat::Svg;frameIco_=format==FrameSequenceFormat::Ico;frameBmp_=format==FrameSequenceFormat::Bmp;framePngAutomatic_=automatic;if(frameSvg_)gifOptions_.scalePercent=100;if(frameSvg_||wasSvg){gifInputs_[0]->suffix=frameSvg_?U"x":U"";gifInputs_[0]->setText(frameSvg_?"1":std::to_string(gifOptions_.scalePercent));}discard_->caption=frameSvg_?U"导出 SVG 序列":frameIco_?U"导出 ICO 序列":frameBmp_?U"导出 BMP 序列":U"导出 PNG 序列";refresh();}

void Editor::finishExportFolder(const std::filesystem::path& directory){if(directory.empty())return;try{projectFolderLauncher_(directory);}catch(const std::exception& e){status_=unicodeText(e.what());invalidate();}}

void Editor::exportAndOpenFolder(){if(framePngBusy())return;exportedDirectory_.clear();exportOpenFolderRequested_=true;resolve(true);if(pending_!=Pending::None&&!framePngBusy())exportOpenFolderRequested_=false;}

void Editor::createExportFormatControl(){exportOpenFolderButton_=button(U"导出并打开文件夹",[this]{exportAndOpenFolder();});exportOpenFolderButton_->skinStyle="text_button";exportOpenFolderButton_->setVisible(false);exportFormatButton_=button(U"格式",[this]{PixelMenu menu(skin_);if(pending_==Pending::GifExport&&framePngMode_){for(bool automatic:{false,true}){auto item=new PixelMenuItem(font_,skin_,automatic?U"PNG 自动":U"PNG RGBA");item->Click.connect([this,automatic]{setFrameSequenceFormat(FrameSequenceFormat::Png,automatic);});menu.addChild(item);}auto bmp=new PixelMenuItem(font_,skin_,U"BMP");bmp->Click.connect([this]{setFrameSequenceFormat(FrameSequenceFormat::Bmp);});menu.addChild(bmp);auto ico=new PixelMenuItem(font_,skin_,U"ICO");ico->Click.connect([this]{setFrameSequenceFormat(FrameSequenceFormat::Ico);});menu.addChild(ico);auto svg=new PixelMenuItem(font_,skin_,U"SVG");svg->Click.connect([this]{setFrameSequenceFormat(FrameSequenceFormat::Svg);});menu.addChild(svg);auto jpeg=new PixelMenuItem(font_,skin_,U"JPEG");jpeg->Click.connect([this]{setFrameSequenceFormat(FrameSequenceFormat::Jpeg);});menu.addChild(jpeg);auto at=exportFormatButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();return;}auto add=[&](std::u32string name,std::function<void()> action){auto item=new PixelMenuItem(font_,skin_,name);item->Click.connect([this,action]{action();});menu.addChild(item);};add(U"PNG RGBA",[this]{switchStaticExportFormat(0);});add(U"GIF",[this]{switchAnimatedExportFormat(false);});add(U"WebP",[this]{switchAnimatedExportFormat(true);});add(U"PNG 自动",[this]{switchStaticExportFormat(4);});add(U"BMP",[this]{switchStaticExportFormat(1);});add(U"ICO",[this]{switchStaticExportFormat(2);});add(U"SVG",[this]{openSvgExport();});add(U"JPEG",[this]{switchStaticExportFormat(5);});for(auto text:{U"其它格式 · 未接入"}){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(false);menu.addChild(item);}auto at=exportFormatButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});exportFormatButton_->setVisible(false);}

void Editor::ensureExportScaleButtons(){

    while(exportScaleButtons_.size()<runtimePreferences_.exportScales.size()){const auto i=exportScaleButtons_.size();auto b=button(U"",[this,i]{if(i>=runtimePreferences_.exportScales.size())return;const int value=runtimePreferences_.exportScales[i];const bool animated=pending_==Pending::GifExport;const bool svg=animated?(framePngMode_&&frameSvg_):staticSvg_;(animated?gifOptions_.scalePercent:exportOptions_.scalePercent)=value;auto entry=animated?gifInputs_[0]:exportScaleInput_;std::ostringstream text;text<<(svg?value/100.:value);entry->setText(text.str());refresh();});b->setVisible(false);exportScaleButtons_.push_back(b);}

  }

void Editor::createExportScalePresets(){ensureExportScaleButtons();exportScaleBar_=new PixelScrollBar(skin_,false);addChild(exportScaleBar_);exportScaleBar_->setVisible(false);exportScaleBar_->changed=[this](int value){exportScaleScroll_=value;layoutModal();invalidateRect(dialogDisplayBounds());};exportScaleBar_->wheelStep=40*uiScale;}

PixelDropdown* Editor::exportDropdown(PixelButton*& previous) {

    auto dropdown=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(dropdown);addChild(dropdown);dropdown->setVisible(false);

    removeChild(previous);delete previous;previous=dropdown;return dropdown;

  }

std::wstring Editor::exportExtension()const {return pending_==Pending::GifExport?(framePngMode_?(frameJpeg_?L".jpg":frameSvg_?L".svg":frameIco_?L".ico":frameBmp_?L".bmp":L".png"):(gifWebp_?L".webp":L".gif")):(staticJpeg_?L".jpg":staticSvg_?L".svg":staticIco_?L".ico":staticBmp_?L".bmp":L".png");}

std::filesystem::path Editor::exportFormPath()const {auto name=std::filesystem::u8path(exportFilename_->text()).filename();if(name.empty())throw std::runtime_error("请输入导出文件名");name.replace_extension(exportExtension());return exportDirectory_/name;}

bool Editor::chooseFormExportFile(OPENFILENAMEW* dialog){

    try{auto path=exportFormPath();auto value=path.wstring();if(value.size()>=dialog->nMaxFile)throw std::runtime_error("导出路径过长");std::copy(value.begin(),value.end(),dialog->lpstrFile);dialog->lpstrFile[value.size()]=0;

      if(exportDirectory_.empty())return chooseExportFile_(dialog);

      if(!std::filesystem::is_directory(exportDirectory_))throw std::runtime_error("导出目录不存在");

      if((dialog->Flags&OFN_OVERWRITEPROMPT) && std::filesystem::exists(path) && MessageBoxW(GetActiveWindow(),L"文件已存在，是否覆盖？",L"导出",MB_YESNO|MB_ICONQUESTION)!=IDYES)return false;

      return true;

    }catch(const std::exception& e){status_=unicodeText(e.what());return false;}

  }

void Editor::chooseExportLocation(){

    wchar_t filename[32768]{};auto value=exportFormPath().wstring();std::copy_n(value.c_str(),std::min<size_t>(value.size(),32767),filename);

    OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"导出文件\0*.*\0\0";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST;

    if(chooseExportFile_(&dialog)){auto path=std::filesystem::path(filename);exportDirectory_=path.parent_path();exportFilename_->setText(path.filename().u8string());refresh();}

  }

void Editor::buildExportLocationMenu(PixelMenu& menu){

    auto add=[&](const std::u32string& text,std::function<void()> action={}){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(bool(action));if(action)item->Click.connect(std::move(action));menu.addChild(item);return item;};

    auto choose=add(U"选择路径",[this]{try{chooseExportLocation();}catch(const std::exception& e){status_=unicodeText(e.what());}});choose->iconSkin=&toolIcons_;choose->icon="folderOpen";

    add(U"本地图库 · 未接入");

    const auto project=documentPath_.empty()?document.sourceFilePath():documentPath_;

    const auto root=recent_export_paths::parent(project.u8string());

    if(!root.empty())add(U"工程根目录",[this,root]{exportDirectory_=std::filesystem::u8path(root);refresh();});

    menu.addChild(new PixelMenuSeparator(skin_));add(U"最近路径");

    const auto items=recent_export_paths::load(recentExportPathsPath());

    if(items.empty())add(U"暂无最近路径");

    for(const auto& item:items)add(unicodeText(item.filePath),[this,path=item.filePath]{exportDirectory_=std::filesystem::u8path(recent_export_paths::parent(path));refresh();});

  }

void Editor::showExportLocationMenu(){PixelMenu menu(skin_);buildExportLocationMenu(menu);const auto at=exportLocation_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}

void Editor::createExportComponents() {

    exportFilename_=new DialogBackground<PixelEntry>(font_,skin_);configureDialogBackground(static_cast<DialogBackground<PixelEntry>*>(exportFilename_));addChild(exportFilename_);

    exportLocation_=button(U"",[this]{showExportLocationMenu();});

    exportLocation_->iconSkin=&toolIcons_;exportLocation_->icon="folderOpen";exportLocation_->skinStyle="icon_button";exportLocation_->iconGroupCount=1;

    auto format=exportDropdown(exportFormatButton_);

    format->setOptions({U"PNG RGBA",U"PNG 自动",U"GIF",U"BMP",U"ICO",U"SVG",U"JPEG",U"WebP",U"PSD · 未接入",U"ASE / ASEPRITE"});

    format->optionEnabled=[this](int i){return (i<8||i==9)&&!(pending_==Pending::GifExport&&framePngMode_&&(i==2||i==7||i==9));};

    format->changed=[this](int i){if(i==9){resolve(false);openAsepriteExport();return;}if(pending_==Pending::GifExport&&framePngMode_){setFrameSequenceFormat(i==6?FrameSequenceFormat::Jpeg:i==3?FrameSequenceFormat::Bmp:i==4?FrameSequenceFormat::Ico:i==5?FrameSequenceFormat::Svg:FrameSequenceFormat::Png,i==1);return;}if(i==2||i==7){switchAnimatedExportFormat(i==7);}else if(i==5)openSvgExport();else switchStaticExportFormat(i==6?5:i==1?4:i==3?1:i==4?2:0);};

    auto target=exportDropdown(exportLayerButton_);

    target->prepareOptions=[this,target]{std::vector<std::u32string> names{U"画布",U"像素选区"};const bool gif=pending_==Pending::GifExport&&!framePngMode_;const auto& id=gif?gifOptions_.layerId:exportOptions_.layerId;int selected=(gif?gifOptions_.selection:exportOptions_.selection)?1:0;int index=2;for(const auto& layer:document.timeline().state().layers){names.push_back(U"图层："+layer.name);if(layer.id==id)selected=index;++index;}if(!framePngMode_||pending_==Pending::StaticExport){if(exportAllLayers_)selected=int(names.size());names.push_back(U"全部图层");if(exportSlices_&&exportSliceId_.empty())selected=int(names.size());names.push_back(U"全部切片");for(const auto& slice:document.slices()){if(exportSlices_&&slice.id==exportSliceId_)selected=int(names.size());names.push_back(U"切片："+slice.name);}}target->setOptions(std::move(names));target->setSelectedIndex(selected);};

    target->optionEnabled=[this](int i){const int layers=int(document.timeline().state().layers.size());if(i==1)return document.selection().has_value();if(framePngMode_&&pending_!=Pending::StaticExport)return i<layers+2;if(i>=layers+3)return !document.slices().empty();return true;};

    target->changed=[this](int i){const int layers=int(document.timeline().state().layers.size());exportSlices_=i>=layers+3;exportSliceId_.clear();if(i>=layers+4&&i-layers-4<int(document.slices().size()))exportSliceId_=document.slices()[i-layers-4].id;if(pending_==Pending::GifExport){exportAllLayers_=i==layers+2;gifOptions_.selection=i==1;gifOptions_.layerId=i>=2&&i<layers+2?document.timeline().state().layers[i-2].id:std::string{};}else{exportAllLayers_=i==layers+2;exportOptions_.selection=i==1;exportOptions_.layerId=i>=2&&i<layers+2?document.timeline().state().layers[i-2].id:std::string{};}refresh();};

    auto trim=exportDropdown(exportTrimButton_);trim->setOptions({U"不修剪",U"独立修剪",U"统一修剪"});trim->changed=[this](int i){exportOptions_.trim=i!=0;exportOptions_.trimCommon=i==2;refresh();};

    auto range=exportDropdown(gifRange_);range->prepareOptions=[this,range]{std::vector<std::u32string> names{U"全部帧",U"指定帧范围"};int index=2,selected=gifExplicitRange_?1:0;for(const auto& loop:document.timeline().state().loopSections){names.push_back(U"循环段："+loop.name);if(loop.id==gifOptions_.loopSectionId)selected=index;++index;}range->setOptions(std::move(names));range->setSelectedIndex(selected);};

    range->changed=[this](int i){gifExplicitRange_=i==1;gifOptions_.loopSectionId=i>=2&&i<int(document.timeline().state().loopSections.size())+2?document.timeline().state().loopSections[i-2].id:std::string{};refresh();};

    auto animationTrim=exportDropdown(gifTrim_);animationTrim->setOptions({U"不修剪",U"独立修剪",U"统一修剪"});animationTrim->changed=[this](int i){gifOptions_.trim=i!=0;gifOptions_.trimCommon=i==2;refresh();};

    auto direction=exportDropdown(gifDirection_);direction->setOptions({U"正向",U"反向",U"正向往返",U"反向往返"});direction->changed=[this](int i){gifOptions_.direction=GifDirection(i);refresh();};

    exportPresets_=PixelPresetControls::create([this]{auto e=new DialogBackground<PixelEntry>(font_,skin_);configureDialogBackground(e);addChild(e);return e;},

      [this](std::u32string label,std::function<void()> action){return button(std::move(label),std::move(action));},

      [this]{auto d=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(d);addChild(d);return d;},toolIcons_,

      [this](int i){if(i>0&&i<=int(savedExportPresets_.size()))applyExportPreset(savedExportPresets_[i-1]);},[this]{saveExportPreset();},[this]{deleteExportPreset();});

    exportPresets_.name->Change.connect([this]{layoutModal();invalidate();});

    loadExportPresets();updateExportPresetOptions();

  }

std::filesystem::path Editor::exportPresetPath()const {return exportPresetPathOverride_.empty()?palettePreferencePath().parent_path()/"export-presets-v1.txt":exportPresetPathOverride_;}

void Editor::updateExportPresetOptions(){std::vector<std::u32string> names{U"选择预设"};int selected=0;for(const auto& preset:savedExportPresets_){names.push_back(unicodeText(preset.name+" · "+std::to_string(preset.kind?preset.animation.scalePercent:preset.image.scalePercent)+"%"));if(preset.name==exportPresets_.name->text())selected=int(names.size())-1;}exportPresets_.choices->setOptions(std::move(names));exportPresets_.choices->setSelectedIndex(selected);}

void Editor::loadExportPresets(){savedExportPresets_.clear();exportPresetsReadable_=true;try{if(!std::filesystem::exists(exportPresetPath()))return;std::ifstream in(exportPresetPath());std::string header;std::getline(in,header);const bool version5=header=="MoonSprite export-presets 5",version4=version5||header=="MoonSprite export-presets 4",version3=version4||header=="MoonSprite export-presets 3",version2=version3||header=="MoonSprite export-presets 2";if(!version2&&header!="MoonSprite export-presets 1")throw std::runtime_error("Preset version");while(in>>std::ws&&!in.eof()){ExportPreset p;int direction=0;if(!(in>>std::quoted(p.name)>>p.kind>>p.format>>p.explicitRange>>p.image.scalePercent>>p.image.trim>>p.image.trimCommon>>p.image.selection>>p.image.automatic>>std::quoted(p.image.layerId)>>p.animation.scalePercent>>p.animation.frameStart>>p.animation.frameEnd>>std::quoted(p.animation.loopSectionId)>>direction>>p.animation.trim)||p.name.empty()||p.kind<0||p.kind>2||p.format<0||p.format>6||(p.kind==1&&p.format==5)||(p.kind!=1&&p.format==6)||p.image.scalePercent<1||p.image.scalePercent>6400||p.animation.scalePercent<1||p.animation.scalePercent>6400||p.animation.frameStart<1||p.animation.frameEnd<1||direction<0||direction>3)throw std::runtime_error("Preset data");if(version2&&!(in>>p.animation.trimCommon))throw std::runtime_error("Preset trim mode");if(version3&&!(in>>std::quoted(p.animation.layerId)))throw std::runtime_error("Preset layer");if(version4&&!(in>>p.animation.selection))throw std::runtime_error("Preset selection");if(version5&&!(in>>p.allLayers))throw std::runtime_error("Preset all layers");p.animation.direction=GifDirection(direction);savedExportPresets_.push_back(std::move(p));}}catch(...){savedExportPresets_.clear();exportPresetsReadable_=false;exportPresetFeedback_=U"预设文件损坏，保存已禁用";}}

bool Editor::persistExportPresets(const std::vector<ExportPreset>& next){if(!exportPresetsReadable_)return false;try{std::ostringstream out;out<<"MoonSprite export-presets 5\n";for(const auto& p:next)out<<std::quoted(p.name)<<' '<<p.kind<<' '<<p.format<<' '<<p.explicitRange<<' '<<p.image.scalePercent<<' '<<p.image.trim<<' '<<p.image.trimCommon<<' '<<p.image.selection<<' '<<p.image.automatic<<' '<<std::quoted(p.image.layerId)<<' '<<p.animation.scalePercent<<' '<<p.animation.frameStart<<' '<<p.animation.frameEnd<<' '<<std::quoted(p.animation.loopSectionId)<<' '<<int(p.animation.direction)<<' '<<p.animation.trim<<' '<<p.animation.trimCommon<<' '<<std::quoted(p.animation.layerId)<<' '<<p.animation.selection<<' '<<p.allLayers<<'\n';auto text=out.str();std::filesystem::create_directories(exportPresetPath().parent_path());writeExportBytesAtomic(exportPresetPath(),{text.begin(),text.end()});return true;}catch(...){exportPresetFeedback_=U"预设保存失败，请重试";return false;}}

void Editor::saveExportPreset(){auto name=exportPresets_.name->text();const auto first=name.find_first_not_of(" \t\r\n"),last=name.find_last_not_of(" \t\r\n");if(first==std::string::npos){exportPresetFeedback_=U"请输入预设名称";refresh();return;}name=name.substr(first,last-first+1);ExportPreset p;p.name=name;p.kind=pending_==Pending::StaticExport?0:framePngMode_?2:1;p.format=p.kind==0?(staticJpeg_?5:staticSvg_?3:staticIco_?2:staticBmp_?1:exportOptions_.automatic?4:0):(p.kind==1&&gifWebp_?6:frameJpeg_?5:frameSvg_?3:frameIco_?2:frameBmp_?1:framePngAutomatic_?4:0);p.explicitRange=gifExplicitRange_;p.image=exportOptions_;p.animation=gifOptions_;p.allLayers=p.kind!=2&&exportAllLayers_;auto next=savedExportPresets_;next.erase(std::remove_if(next.begin(),next.end(),[&](const auto& item){return item.name==name;}),next.end());next.push_back(p);if(persistExportPresets(next)){savedExportPresets_=std::move(next);exportPresets_.name->setText(name);exportPresetFeedback_=U"预设已保存";updateExportPresetOptions();}refresh();}

void Editor::deleteExportPreset(){auto next=savedExportPresets_;auto name=exportPresets_.name->text();next.erase(std::remove_if(next.begin(),next.end(),[&](const auto& p){return p.name==name;}),next.end());if(persistExportPresets(next)){savedExportPresets_=std::move(next);exportPresets_.name->setText("");exportPresetFeedback_.clear();updateExportPresetOptions();}refresh();}

void Editor::applyExportPreset(ExportPreset p){resolve(false);if(p.kind==0){openStaticExport();switchStaticExportFormat(p.format);exportOptions_=p.image;exportAllLayers_=p.allLayers;if(!document.selection())exportOptions_.selection=false;if(!exportOptions_.layerId.empty()&&!document.timeline().hasLayer(exportOptions_.layerId)){exportAllLayers_=true;exportOptions_.layerId.clear();}if(exportAllLayers_){exportOptions_.layerId.clear();exportOptions_.selection=false;}exportScaleInput_->suffix=staticSvg_?U"x":U"%";exportScaleInput_->setText(staticSvg_?std::to_string(exportOptions_.scalePercent/100.0):std::to_string(exportOptions_.scalePercent));}else{if(p.kind==2){openFramePngExport(false);setFrameSequenceFormat(p.format==5?FrameSequenceFormat::Jpeg:p.format==3?FrameSequenceFormat::Svg:p.format==2?FrameSequenceFormat::Ico:p.format==1?FrameSequenceFormat::Bmp:FrameSequenceFormat::Png,p.format==4);}else {openGifExport();gifWebp_=p.format==6;discard_->caption=gifWebp_?U"导出 WebP":U"导出 GIF";}gifOptions_=p.animation;exportAllLayers_=p.kind==1&&p.allLayers;if(!document.selection())gifOptions_.selection=false;if(gifOptions_.selection)gifOptions_.layerId.clear();if(framePngMode_){gifOptions_.layerId.clear();gifOptions_.selection=false;}else if(!gifOptions_.layerId.empty()&&!document.timeline().hasLayer(gifOptions_.layerId)){exportAllLayers_=true;gifOptions_.layerId.clear();}if(exportAllLayers_){gifOptions_.layerId.clear();gifOptions_.selection=false;}const int count=int(document.timeline().state().frames.size());gifOptions_.frameStart=std::clamp(gifOptions_.frameStart,1,count);gifOptions_.frameEnd=std::clamp(gifOptions_.frameEnd,1,count);if(!gifOptions_.loopSectionId.empty()&&std::none_of(document.timeline().state().loopSections.begin(),document.timeline().state().loopSections.end(),[&](const auto& loop){return loop.id==gifOptions_.loopSectionId;}))gifOptions_.loopSectionId.clear();gifExplicitRange_=p.explicitRange;gifInputs_[0]->setText(framePngMode_&&frameSvg_?std::to_string(gifOptions_.scalePercent/100.0):std::to_string(gifOptions_.scalePercent));gifInputs_[1]->setText(std::to_string(gifOptions_.frameStart));gifInputs_[2]->setText(std::to_string(gifOptions_.frameEnd));}exportPresets_.name->setText(p.name);exportPresetFeedback_.clear();updateExportPresetOptions();refresh();}

int Editor::exportScaleY() const {return DialogLayout::label(pending_==Pending::GifExport?(gifExplicitRange_?5:4):2);}

void Editor::layoutExportForm(const gfx::Rect& modal) {

    const bool show=pending_==Pending::StaticExport||pending_==Pending::GifExport;

    const bool animated=pending_==Pending::GifExport,busy=framePngBusy();

    if(show){discard_->setEnabled(!busy);keep_->setEnabled(true);dialogClose_->setEnabled(true);exportScaleInput_->setEnabled(!busy);exportTrimButton_->setEnabled(!busy);for(auto c:{static_cast<ui::Widget*>(exportPresets_.choices),static_cast<ui::Widget*>(exportPresets_.name),static_cast<ui::Widget*>(exportPresets_.save),static_cast<ui::Widget*>(exportPresets_.remove)})c->setEnabled(!busy);}

    ensureExportScaleButtons();for(auto b:exportScaleButtons_)b->setVisible(false);if(exportScaleBar_)exportScaleBar_->setVisible(false);

    for(auto c:{static_cast<ui::Widget*>(exportPresets_.choices),static_cast<ui::Widget*>(exportPresets_.name),static_cast<ui::Widget*>(exportPresets_.save),static_cast<ui::Widget*>(exportPresets_.remove)})c->setVisible(show);

    exportFilename_->setVisible(show);exportLocation_->setVisible(show);

    if(!show)return;

    const int x=modal.x+6,w=modal.w-12,column=(w-2)/2,right=x+column+2;

    auto place=[&](ui::Widget* control,int left,int top,int width){control->setBounds(toDisplay({left,modal.y+top,width,textControlHeight}));};

    static_cast<PixelDropdown*>(exportFormatButton_)->setSelectedIndex((animated?framePngMode_&&frameJpeg_:staticJpeg_)?6:animated&&!framePngMode_?(gifWebp_?7:2):(animated?frameSvg_:staticSvg_)?5:(animated?frameIco_:staticIco_)?4:(animated?frameBmp_:staticBmp_)?3:(animated?framePngAutomatic_:exportOptions_.automatic)?1:0);

    auto defaultName=(exportOptions_.layerId.empty()||animated?std::filesystem::path(document.name()).stem():std::filesystem::path(staticLayerExportStem(document,exportOptions_.layerId)));if((!animated&&staticJpeg_)||(animated&&framePngMode_&&frameJpeg_))defaultName=std::filesystem::path(staticLayerExportStem(document,animated?std::string{}:exportOptions_.layerId)+U".jpg");else if(exportAllLayers_)defaultName=std::filesystem::path(framePngExportStem(document.name())+std::filesystem::path(exportExtension()).u32string());else if(animated&&!framePngMode_&&gifWebp_)defaultName=std::filesystem::path(staticLayerExportStem(document,{})+U".webp");else defaultName.replace_extension(exportExtension());

    if(exportFilename_->text().empty() || exportFilename_->text()==exportDefaultName_)exportFilename_->setText(defaultName.u8string());

    else {auto name=std::filesystem::u8path(exportFilename_->text());name.replace_extension(exportExtension());if(name.u8string()!=exportFilename_->text())exportFilename_->setText(name.u8string());}

    exportDefaultName_=defaultName.u8string();

    exportFilename_->setEnabled(!busy);exportLocation_->setEnabled(!busy);

    place(exportFilename_,x,DialogLayout::field(),w-17);exportLocation_->setBounds(toDisplay({x+w-15,modal.y+DialogLayout::field()+2,15,15}));

    place(exportFormatButton_,x,DialogLayout::field(1),column);

    exportLayerButton_->setVisible(true);exportLayerButton_->setEnabled(!busy&&(!animated||!framePngMode_));

    if(animated)exportLayerButton_->caption=exportAllLayers_?U"全部图层":gifOptions_.selection?U"像素选区":framePngMode_||gifOptions_.layerId.empty()?U"画布":document.timeline().hasLayer(gifOptions_.layerId)?document.timeline().state().layers[document.timeline().layerIndex(gifOptions_.layerId)].name:U"图层已删除 · 未接入";

    else exportLayerButton_->caption=exportAllLayers_?U"全部图层":exportOptions_.selection?U"像素选区":exportOptions_.layerId.empty()?U"画布":document.timeline().state().layers[document.timeline().layerIndex(exportOptions_.layerId)].name;

    if(!animated||!framePngMode_)static_cast<PixelDropdown*>(exportLayerButton_)->prepareOptions();

    place(exportLayerButton_,right,DialogLayout::field(1),w-column-2);

    exportSelectionButton_->setVisible(false);

    exportPresets_.layout(toDisplay({x,modal.y+exportScaleY()+88,w,42}));

    exportPresets_.save->setEnabled(exportPresetsReadable_&&!busy);exportPresets_.name->setEnabled(!busy);exportPresets_.choices->setEnabled(!busy);

    exportPresets_.remove->setEnabled(exportPresetsReadable_&&!busy&&std::any_of(savedExportPresets_.begin(),savedExportPresets_.end(),[this](const auto& p){return p.name==exportPresets_.name->text();}));

    if(animated){

      static_cast<PixelDropdown*>(gifRange_)->prepareOptions();static_cast<PixelDropdown*>(gifDirection_)->setSelectedIndex(int(gifOptions_.direction));

      place(gifRange_,x,DialogLayout::field(2),w);

      for(int i=1;i<3;++i)place(gifInputs_[i],i==1?x:right,DialogLayout::field(3),i==1?column:w-column-2);

      place(gifDirection_,x,DialogLayout::field(3)+(gifExplicitRange_?38:0),w);

      place(gifTrim_,x,exportScaleY()+50,w);static_cast<PixelDropdown*>(gifTrim_)->setSelectedIndex(gifOptions_.trimCommon?2:gifOptions_.trim?1:0);

    }else{

      static_cast<PixelDropdown*>(exportTrimButton_)->setSelectedIndex(exportOptions_.trimCommon?2:exportOptions_.trim?1:0);

      place(exportTrimButton_,x,exportScaleY()+50,w);

      // Trim is a selector; a checkbox icon incorrectly implies two states.

      exportTrimButton_->icon.clear();exportTrimButton_->bareIconWithCaption=false;

    }

    const int scaleY=exportScaleY()+12,inputWidth=70;

    place(animated?gifInputs_[0]:exportScaleInput_,x,scaleY,inputWidth);

    const bool svg=animated?(framePngMode_&&frameSvg_):staticSvg_;

    const int current=animated?gifOptions_.scalePercent:exportOptions_.scalePercent;

    const int presetX=x+inputWidth+2,presetWidth=w-inputWidth-2;

    std::vector<int> widths;int total=0;for(int value:runtimePreferences_.exportScales){std::ostringstream text;text<<(svg?value/100.:value);const auto label=unicodeText(text.str())+(svg?U"x":U"%");const int width=std::max(28,font_.measure(label)+12);widths.push_back(width);total+=width-1;}

    const int page=presetWidth*uiScale;exportScaleScroll_=std::clamp(exportScaleScroll_,0,std::max(0,total*uiScale-page));exportScaleViewport_=toDisplay({presetX,modal.y+scaleY,presetWidth,textControlHeight});int at=presetX;

    for(std::size_t i=0;i<runtimePreferences_.exportScales.size();++i){auto b=exportScaleButtons_[i];const int value=runtimePreferences_.exportScales[i];std::ostringstream text;text<<(svg?value/100.:value);b->caption=unicodeText(text.str())+(svg?U"x":U"%");b->active=current==value;b->setEnabled(!busy);place(b,at,scaleY,widths[i]);b->setBounds(b->bounds().offset(-exportScaleScroll_,0));b->paletteViewport=[this]{return exportScaleViewport_;};b->setVisible(exportScaleViewport_.intersects(b->bounds()));at+=widths[i]-1;}

    if(exportScaleBar_){exportScaleBar_->setDockBounds(PixelScrollBar::edgeBounds(toDisplay({presetX,modal.y+scaleY+textControlHeight,presetWidth,6}),false));exportScaleBar_->configure(total*uiScale,page,exportScaleScroll_);exportScaleBar_->setVisible(total*uiScale>page);exportScaleBar_->setEnabled(!busy);}

    const int action=modalActionY(modal),cancelWidth=48,folderWidth=font_.measure(exportOpenFolderButton_->caption)+12,exportWidth=std::max(66,font_.measure(discard_->caption)+12);

    keep_->setBounds(toDisplay({x,action,cancelWidth,textControlHeight}));

    discard_->setBounds(toDisplay({x+w-exportWidth,action,exportWidth,textControlHeight}));

    exportOpenFolderButton_->setBounds(toDisplay({x+w-exportWidth-2-folderWidth,action,folderWidth,textControlHeight}));

  }

void Editor::openStaticExport(){exportSlices_=false;exportSliceId_.clear();exportAllLayers_=false;animationLayerJob_=false;exportOpenFolderRequested_=false;exportedDirectory_.clear();staticBmp_=false;staticIco_=false;staticSvg_=false;staticJpeg_=false;exportScaleInput_->suffix=U"%";if(pending_!=Pending::None||document.active())return;exportOptions_={};exportOptions_.scalePercent=runtimePreferences_.defaultExportScale();exportScaleScroll_=0;pending_=Pending::StaticExport;exportDirectory_=preferredExportDirectory();exportDefaultName_.clear();exportFilename_->setText("");exportPresets_.name->setText("");updateExportPresetOptions();menuBar_->setEnabled(false);exportScaleInput_->setText(std::to_string(exportOptions_.scalePercent));discard_->caption=U"导出 PNG";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);refresh();}

void Editor::beginStaticLayerExport(const std::filesystem::path& path,const ExportConflictResolver& resolver){const int format=staticJpeg_?5:staticSvg_?3:staticIco_?2:staticBmp_?1:exportOptions_.automatic?4:0;auto plan=planStaticLayerExport(document,{},path.parent_path(),path.filename().u32string(),format,resolver);if(!plan){status_=U"已取消导出";return;}exportAllLayers_=true;exportOptions_.layerId.clear();exportOptions_.selection=false;animationLayerJob_=true;animationLayerOptions_={};animationLayerOptions_.staticImage=true;animationLayerOptions_.image=exportOptions_;animationLayerOptions_.image.protection=ExportProtection(runtimePreferences_.index("files.exportProtection.Select"));animationLayerOptions_.format=format;animationLayerPlan_=std::move(*plan);framePngPaths_=animationLayerPlan_.paths;exportSequenceMemoryName_=path.filename().u8string();exportedDirectory_=path.parent_path();framePngJob_=std::make_shared<FramePngJobState>();framePngJob_->total=framePngPaths_.size();framePngSnapshot_.emplace(document);refresh();}

bool Editor::saveStaticLayerExport(){wchar_t filename[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;const auto extension=exportExtension().substr(1);dialog.lpstrDefExt=extension.c_str();dialog.lpstrFilter=staticJpeg_?L"JPEG 图层批量\0*.jpg\0\0":staticSvg_?L"SVG 图层批量\0*.svg\0\0":staticIco_?L"ICO 图层批量\0*.ico\0\0":staticBmp_?L"BMP 图层批量\0*.bmp\0\0":L"PNG 图层批量\0*.png\0\0";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST;if(!chooseFormExportFile(&dialog))return false;try{beginStaticLayerExport(filename,[this](const auto& path,const auto& suggested){return framePngConflict(path,suggested);});}catch(const std::exception& e){status_=U"图层批量导出失败："+unicodeText(e.what());refresh();}return false;}

bool Editor::saveStaticExport(){if(exportSlices_)return saveSliceExport();if(!exportOptions_.layerId.empty()&&!document.timeline().hasLayer(exportOptions_.layerId)){exportAllLayers_=true;exportOptions_.layerId.clear();exportOptions_.selection=false;}if(exportAllLayers_)return saveStaticLayerExport();wchar_t filename[32768]{};auto name=(exportOptions_.layerId.empty()?std::filesystem::path(document.name()).stem():std::filesystem::path(staticLayerExportStem(document,exportOptions_.layerId))).wstring()+(staticJpeg_?L".jpg":staticSvg_?L".svg":staticIco_?L".ico":staticBmp_?L".bmp":L".png");std::copy_n(name.c_str(),std::min<std::size_t>(name.size(),32767),filename);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=staticJpeg_?L"JPEG 图片\0*.jpg;*.jpeg\0\0":staticSvg_?L"SVG 图片\0*.svg\0\0":staticIco_?L"ICO 图片\0*.ico\0\0":staticBmp_?L"BMP 图片\0*.bmp\0\0":exportOptions_.automatic?L"PNG 自动 图片\0*.png\0\0":L"PNG RGBA 图片\0*.png\0\0";dialog.lpstrDefExt=staticJpeg_?L"jpg":staticSvg_?L"svg":staticIco_?L"ico":staticBmp_?L"bmp":L"png";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_OVERWRITEPROMPT;if(!chooseFormExportFile(&dialog)){const auto error=CommDlgExtendedError();if(error)status_=U"无法打开导出文件对话框";return false;}try{writeCurrentStaticExport(filename);exportedDirectory_=std::filesystem::path(filename).parent_path();rememberSuccessfulExport(filename);recordRecentExportPath(filename);usageStatistics_.recordExport(staticJpeg_?"jpeg":staticSvg_?"svg":staticIco_?"ico":staticBmp_?"bmp":"png");playExportSuccessSound();status_=staticJpeg_?U"已导出 JPEG":staticSvg_?U"已导出 SVG":staticIco_?U"已导出 ICO":staticBmp_?U"已导出 BMP":U"已导出 PNG";return true;}catch(const std::exception& e){status_=U"导出失败："+unicodeText(e.what());invalidate();return false;}}

void Editor::createStaticExportControls(){exportScaleInput_=new PixelEntry(font_,skin_);exportScaleInput_->numeric=true;exportScaleInput_->suffix=U"%";addChild(exportScaleInput_);exportScaleInput_->setVisible(false);auto change=[this]{try{std::size_t used=0;double v=std::stod(exportScaleInput_->text(),&used);if(used==exportScaleInput_->text().size()&&std::isfinite(v))exportOptions_.scalePercent=int(std::floor((staticSvg_?std::clamp(v,1.0,64.0)*100:std::clamp(v,1.0,6400.0))+.5));}catch(...){} };exportScaleInput_->Change.connect(change);exportScaleInput_->blur=change;exportScaleInput_->accept=[this]{resolve(true);};exportScaleInput_->cancel=[this]{resolve(false);};exportTrimButton_=button(U"修剪",[this]{PixelMenu menu(skin_);const char32_t* names[]{U"不修剪",U"独立修剪",U"统一修剪"};for(int mode=0;mode<3;++mode){auto item=new PixelMenuItem(font_,skin_,names[mode]);item->checked=[this,mode]{return mode==(exportOptions_.trimCommon?2:exportOptions_.trim?1:0);};item->Click.connect([this,mode]{exportOptions_.trim=mode!=0;exportOptions_.trimCommon=mode==2;refresh();});menu.addChild(item);}auto at=exportTrimButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});exportSelectionButton_=button(U"仅像素选区",[this]{exportOptions_.selection=!exportOptions_.selection;exportOptions_.layerId.clear();refresh();});exportLayerButton_=button(U"导出目标",[this]{PixelMenu menu(skin_);auto add=[&](std::u32string name,std::string id){auto item=new PixelMenuItem(font_,skin_,name);item->checked=[this,id]{return !exportOptions_.selection&&exportOptions_.layerId==id;};item->Click.connect([this,id]{exportOptions_.selection=false;exportOptions_.layerId=id;refresh();});menu.addChild(item);};add(U"整幅文档",{});for(const auto& layer:document.timeline().state().layers)add(U"图层："+layer.name,layer.id);auto at=exportLayerButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});exportLayerButton_->setVisible(false);for(auto b:{exportTrimButton_,exportSelectionButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;b->setVisible(false);}}

void Editor::createResizeControls(){for(int i=0;i<4;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;input->suffix=i<2?U"px":U"%";addChild(input);resizeInputs_[i]=input;input->setVisible(false);auto changed=[this,input,i]{if(resizeUpdating_||pending_!=Pending::ImageResize)return;try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size()||!std::isfinite(v))return;v=std::clamp(v,1.0,i<2?16384.0:6400.0);if(i<2)v=std::floor(v+.5);const bool horizontal=i%2==0;int n=i<2?int(v):std::clamp(int(std::floor((horizontal?document.width():document.height())*v/100+.5)),1,16384);(horizontal?resizeWidth_:resizeHeight_)=n;if(resizeLocked_)(horizontal?resizeHeight_:resizeWidth_)=std::max(1,int(std::floor(double(n)*(horizontal?document.height():document.width())/(horizontal?document.width():document.height())+.5)));updateResizeFields();}catch(...){} };input->Change.connect(changed);input->blur=changed;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}resizeLock_=button(U"保持比例",[this]{resizeLocked_=!resizeLocked_;updateResizeFields();});resizeLock_->iconSkin=&toolIcons_;resizeLock_->setVisible(false);resizeMethod_=button(U"最近邻",[this]{resizeMethodValue_=resizeMethodValue_==ImageInterpolation::Nearest?ImageInterpolation::Smooth:ImageInterpolation::Nearest;updateResizeFields();});resizeMethod_->setVisible(false);}

void Editor::createAdjustmentControls(){

    curveEditor_=new CurveEditorNative(skin_);addChild(curveEditor_);curveEditor_->changed=[this]{previewAdjustment();};curveChannelButton_=button(U"RGB",[this]{curveChannel_=(curveChannel_+1)%4;curveEditor_->selectChannel();updateAdjustmentControls();});curveResetButton_=button(U"重置通道",[this]{curveEditor_->resetChannel();});curveDeleteButton_=button(U"删除点",[this]{curveEditor_->deleteSelected();});for(auto b:{curveChannelButton_,curveResetButton_,curveDeleteButton_})b->setVisible(false);curveResetButton_->skinStyle="text_button";curveResetButton_->icon.clear();curveResetButton_->iconSkin=&toolIcons_;curveDeleteButton_->skinStyle="text_button";curveDeleteButton_->icon.clear();curveDeleteButton_->iconSkin=&toolIcons_;

    for(int i=0;i<3;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;addChild(input);adjustmentInputs_[i]=input;input->setVisible(false);auto changed=[this,input,i]{try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(v))return;if(adjustmentSpec_.kind==ColorAdjustmentKind::Curves){curveEditor_->setCoordinate(i,v);return;}double lo=-100,hi=100;if(adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation && i==0){lo=adjustmentSpec_.colorize?0:-180;hi=adjustmentSpec_.colorize?360:180;}if(adjustmentSpec_.colorize && i==1)lo=0;v=std::clamp(std::floor(v+.5),lo,hi);if(adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance)adjustmentSpec_.balance[adjustmentTone_][i]=v;else if(adjustmentSpec_.kind==ColorAdjustmentKind::BrightnessContrast)(i?adjustmentSpec_.contrast:adjustmentSpec_.brightness)=v;else (i==0?adjustmentSpec_.hue:i==1?adjustmentSpec_.saturation:adjustmentSpec_.lightness)=v;previewAdjustment();}catch(...){} };input->Change.connect(changed);input->blur=changed;input->accept=[this]{resolve(true);};input->cancel=[this]{resolve(false);};}

    for(int i=0;i<3;++i){

      auto slider=new DialogBackground<PixelSlider>(font_,skin_);configureDialogBackground(slider);addChild(slider);

      adjustmentSliders_[i]=slider;slider->percentage=false;slider->numberSuffix.clear();slider->setVisible(false);

      slider->changed=[this,i](int value){adjustmentInputs_[i]->setText(std::to_string(value));adjustmentInputs_[i]->Change();};

    }

    adjustmentPreview_=switchButton(U"实时预览",adjustmentPreviewEnabled_,[this](bool checked){adjustmentPreviewEnabled_=checked;previewAdjustment();});adjustmentPreview_->icon="eye";adjustmentColorize_=button(U"着色",[this]{if(adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance){adjustmentSpec_.preserveLuminosity=!adjustmentSpec_.preserveLuminosity;previewAdjustment();return;}auto current=std::array<double,3>{adjustmentSpec_.hue,adjustmentSpec_.saturation,adjustmentSpec_.lightness};if(!adjustmentSpec_.colorize){relativeHsl_=current;if(!hasColorizedHsl_){auto c=document.palette().primary;const double r=(c&255)/255.0,g=((c>>8)&255)/255.0,b=((c>>16)&255)/255.0,hi=std::max({r,g,b}),lo=std::min({r,g,b}),d=hi-lo;const double h=d==0?0:std::fmod((hi==r?(g-b)/d:hi==g?(b-r)/d+2:(r-g)/d+4)*60+360,360);colorizedHsl_={std::floor(h+.5),25,adjustmentSpec_.lightness};}current=colorizedHsl_;}else{colorizedHsl_=current;hasColorizedHsl_=true;current=relativeHsl_;}adjustmentSpec_.colorize=!adjustmentSpec_.colorize;adjustmentSpec_.hue=current[0];adjustmentSpec_.saturation=current[1];adjustmentSpec_.lightness=current[2];previewAdjustment();});{const char32_t* tones[]{U"阴影",U"中间调",U"高光"};for(int i=0;i<3;++i){adjustmentToneButtons_[i]=button(tones[i],[this,i]{adjustmentTone_=i;updateAdjustmentControls();invalidate();});adjustmentToneButtons_[i]->setVisible(false);}adjustmentToneButton_=adjustmentToneButtons_[1];}adjustmentColorize_->skinStyle="checkbox";for(auto tone:adjustmentToneButtons_)tone->setVisible(false);for(auto b:{adjustmentPreview_,adjustmentColorize_}){b->setVisible(false);b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}

  }

void Editor::openSelectedLayerProperties(){if(pending_!=Pending::None)return;if(!document.hasSelectedGroups()&&document.layer().kind=="adjustment"&&document.timelineSelection().layers.size()<=1){openGradientMapLayer();return;}auto ids=document.timelineSelection().layers;ids.insert(ids.end(),document.selectedGroupIds().begin(),document.selectedGroupIds().end());if(!ids.empty())showLayerOpacity(ids);}

void Editor::openLayerPropertiesFor(std::size_t index){if(pending_!=Pending::None)return;TimelineRows rows(document.timeline(),document.collapsedGroupIds(),!timelineHidden_);const auto* row=rows.at(int(index));if(!row)return;const auto id=row->id;if(row->kind==LayerPanelKind::Layer&&document.timeline().hasLayer(id)&&document.timeline().state().layers[document.timeline().layerIndex(id)].kind=="adjustment"){document.selectLayer(id);openGradientMapLayer();return;}if(timelineGesture_.kind)finishTimelineGesture(true);auto targets=document.timelineSelection().layers;targets.insert(targets.end(),document.selectedGroupIds().begin(),document.selectedGroupIds().end());if(targets.size()<2||std::find(targets.begin(),targets.end(),id)==targets.end())targets={id};showLayerOpacity(targets);}

void Editor::showLayerOpacity(const std::vector<std::string>& targets) {

    cancelStroke();document.beginLayerProperties(targets);DocumentLayer source=document.layer();if(!targets.empty()){if(const auto* g=document.findGroup(targets.front())){source.name=g->name;source.opacity=g->opacity;source.blendMode=g->blendMode;source.description=g->description;source.displayColor=g->displayColor;}else{auto at=std::find_if(document.timeline().state().layers.begin(),document.timeline().state().layers.end(),[&](const auto& l){return l.id==targets.front();});if(at==document.timeline().state().layers.end())return;source=*at;}}pending_=Pending::LayerOpacity;paletteInput_->numeric=false;paletteInput_->suffix.clear();paletteInput_->setText(utf8Text(source.name));paletteInput_->setVisible(true);

    layerOpacityRange_->value=int(std::lround(source.opacity*100));layerOpacityRange_->setVisible(true);layerBlendMode_->setSelectedIndex(int(*parseLayerBlendMode(source.blendMode)));layerBlendMode_->setVisible(true);layerDescription_->setValue(source.description);layerDisplayColor_->swatch=source.displayColor.value_or(0);

    keep_->caption=U"关闭";keep_->setVisible(true);dialogClose_->setVisible(true);menuBar_->setEnabled(false);

    for(auto b:commands_)b->setEnabled(false);for(auto b:swatches_)b->setEnabled(false);for(auto b:panelTabs_)b->setEnabled(false);

    paletteActions_->setEnabled(false);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();

  }

void Editor::showRecoveryPreferences() {

    PixelMenu popup(skin_);

    auto toggle=new PixelMenuItem(font_,skin_,U"自动恢复保存");toggle->checked=[this]{return recoveryPreferences_.enabled;};toggle->Click.connect([this]{auto p=recoveryPreferences_;p.enabled=!p.enabled;setRecoveryPreferences(p);});popup.addChild(toggle);

    const double values[]{0.5,1,2,5,10};const char32_t* names[]{U"30 秒",U"1 分钟",U"2 分钟",U"5 分钟",U"10 分钟"};

    for(int i=0;i<5;++i){auto entry=new PixelMenuItem(font_,skin_,names[i]);const double value=values[i];entry->checked=[this,value]{return recoveryPreferences_.minutes==value;};entry->Click.connect([this,value]{auto p=recoveryPreferences_;p.minutes=value;setRecoveryPreferences(p);});popup.addChild(entry);}

    for(int days:{1,7,30,365}){const auto n=std::to_string(days);auto entry=new PixelMenuItem(font_,skin_,U"保留期预览："+std::u32string(n.begin(),n.end())+U" 天");entry->checked=[this,days]{return recoveryPreferences_.retentionDays==days;};entry->Click.connect([this,days]{auto p=recoveryPreferences_;p.retentionDays=days;setRecoveryPreferences(p);});popup.addChild(entry);}

    popup.showPopup(gfx::Point(bounds().x+8,bounds().y+36),display());

  }

const char32_t* Editor::preferenceSectionTitle(int i){static const char32_t* names[]{U"常规",U"快捷命令",U"外观",U"主题",U"指针",U"编辑",U"工具",U"撤销",U"文件",U"颜色与图层",U"预设",U"扩展",U"数位板",U"重置"};return names[i];}

std::vector<int> Editor::preferencePageFields()const{

    if(preferenceSection_==6)return {1,2,3};

    if(preferenceSection_==5)return {0,4,5};

    if(preferenceSection_==8)return {6,7,8};

    return {};

  }

void Editor::createPreferencesControls(){

    for(int i=0;i<14;++i){preferenceTabs_[i]=button(preferenceSectionTitle(i),[this,i]{preferenceSection_=i;preferenceContentPixels_=0;preferenceFeedback_.clear();layoutModal();invalidate();});preferenceTabs_[i]->skinStyle="menu-row";preferenceTabs_[i]->setVisible(false);}

    const std::vector<std::u32string> choices[]{ {U"阶梯",U"平滑"},{U"合成图像",U"当前图层"},{U"关闭",U"开启"},{U"最小 · 50%",U"较小 · 75%",U"中等 · 100%",U"较大 · 125%"},{U"0.25×",U"0.5×",U"1×",U"1.5×",U"2×",U"3×"},{U"关闭",U"开启"},{U"关闭",U"开启"},{U"30 秒",U"1 分钟",U"2 分钟",U"5 分钟",U"10 分钟",U"30 分钟",U"60 分钟"},{U"1 天",U"7 天",U"30 天",U"365 天"} };

    for(int i=0;i<9;++i){auto field=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(field);addChild(field);preferenceFields_[i]=field;field->setOptions(choices[i]);field->setVisible(false);field->changed=[this,i](int value){auto& d=preferenceDraft_;const double rates[]{.25,.5,1,1.5,2,3},minutes[]{.5,1,2,5,10,30,60};const int days[]{1,7,30,365};if(i==0)d.smooth=value==1;if(i==1)d.source=value;if(i==2)d.lens=value==1;if(i==3)d.lensSize=value;if(i==4)d.rate=rates[value];if(i==5)d.returnStart=value==1;if(i==6)d.recovery.enabled=value==1;if(i==7)d.recovery.minutes=minutes[value];if(i==8)d.recovery.retentionDays=days[value];preferenceFeedback_.clear();layoutModal();invalidate();};}

    for(int i=0;i<3;++i){

      auto field=new DialogBackground<PixelEntry>(font_,skin_);configureDialogBackground(field);addChild(field);checkerboardFields_[i]=field;field->setVisible(false);field->numeric=i==0;field->suffix=i==0?U"px":U"";

      auto changed=[this,i,field]{

        if(i==0){try{const double value=std::stod(field->text());if(std::isfinite(value))checkerboardDraft_.size=int(std::floor(std::clamp(value,1.,256.)+.5));}catch(...){} }

        else {Pixel value;if(parsePaletteHex(field->text(),value)){auto c=gfx::rgba(value&255,(value>>8)&255,(value>>16)&255);(i==1?checkerboardDraft_.light:checkerboardDraft_.dark)=c;}}

        preferenceFeedback_.clear();

      };

      field->Change.connect(changed);field->blur=changed;field->accept=[this,changed]{changed();requestFocus();};field->cancel=[this]{resolve(false);};

    }

    {std::ifstream in(palettePreferencePath().parent_path()/"canvas-checkerboard.txt");int size;unsigned light,dark;if(in>>size>>light>>dark){checkerboard_.size=std::clamp(size,1,256);checkerboard_.light=gfx::rgba(light&255,(light>>8)&255,(light>>16)&255);checkerboard_.dark=gfx::rgba(dark&255,(dark>>8)&255,(dark>>16)&255);}}

    if(previewPanel_)previewPanel_->checkerboard=checkerboard_;

    try{const auto path=palettePreferencePath().parent_path()/"editor-preferences.txt";if(std::filesystem::exists(path)){std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("Cannot open editor preferences");runtimePreferences_=preferences::RuntimeSettings::decode(input);}}

    catch(const std::exception& e){runtimePreferencesReadable_=false;status_=U"首选项读取失败，保留原文件："+unicodeText(e.what());}

    runtimePreferenceDraft_=runtimePreferences_;syncPreferenceScales();syncPreferenceColors();gradientConfirm_=runtimePreferences_.index("tools.gradientApplicationMode.Select")==1;

    createPreferenceCatalogControls();

    preferenceApply_=button(U"应用",[this]{applyPreferences();});preferenceApply_->setVisible(false);

    std::ifstream lens(palettePreferencePath().parent_path()/"eyedropper-lens.txt");int enabled,size;if(lens>>enabled>>size){eyedropperLensEnabled_=enabled!=0;eyedropperLensSize_=std::clamp(size,0,3);}

  }

bool Editor::preferenceDirectoryAction(const std::string& key){return key=="files.projectBackupDirectory.choose" || key=="files.projectBackupDirectory.restore" || key=="files.saveDirectory.choose" || key=="files.saveDirectory.restore" || key=="files.exportDirectory.choose" || key=="files.exportDirectory.restore";}

void Editor::preferenceDirectoryActionRun(const std::string& action){

    const std::string key=action.find("projectBackupDirectory")!=std::string::npos?"files.projectBackupDirectory.Text":action.find("saveDirectory")!=std::string::npos?"files.saveDirectory.Text":"files.exportDirectory.Text";

    if(action.find(".restore")!=std::string::npos)runtimePreferenceDraft_.set(key,"");

    else {

      BROWSEINFOW options{};options.hwndOwner=GetActiveWindow();options.lpszTitle=L"选择文件夹";options.ulFlags=BIF_RETURNONLYFSDIRS|BIF_NEWDIALOGSTYLE;

      auto chosen=SHBrowseForFolderW(&options);if(!chosen)return;wchar_t folder[32768]{};const bool resolved=SHGetPathFromIDListEx(chosen,folder,32768,GPFIDL_DEFAULT);CoTaskMemFree(chosen);

      if(!resolved){preferenceFeedback_=U"无法读取所选文件夹";invalidate();return;}

      runtimePreferenceDraft_.set(key,std::filesystem::path(folder).u8string());

    }

    syncPreferenceCatalog();layoutModal();invalidateRect(dialogDisplayBounds());

  }

bool Editor::fixedExportScaleRow(const preferences::Item& item){const std::string key=item.id;return key.find("presets.exportScale")==0||key.find("presets.deleteScale")==0||key.find("presets.layerColor")==0||key.find("presets.deleteLayerColor")==0;}

void Editor::changePreferenceColor(std::size_t index,Pixel color){if(index>=runtimePreferenceDraft_.layerDisplayColors.size())return;runtimePreferenceDraft_.layerDisplayColors[index]=color|0xff000000u;syncPreferenceColors();layoutModal();invalidateRect(dialogDisplayBounds());}
void Editor::preferenceColorAction(const std::string& key){if(key=="presets.restoreColors")runtimePreferenceDraft_.layerDisplayColors=defaultLayerDisplayColors();else if(key=="presets.addColor"&&runtimePreferenceDraft_.layerDisplayColors.size()<12)runtimePreferenceDraft_.layerDisplayColors.push_back(0xff757575u);syncPreferenceColors();layoutModal();invalidateRect(dialogDisplayBounds());}
void Editor::syncPreferenceColors(){
 while(preferenceColorRows_.size()<runtimePreferenceDraft_.layerDisplayColors.size()){const auto index=preferenceColorRows_.size();auto color=new DialogBackground<PixelButton>(font_,skin_,U"",[this,index]{if(index>=runtimePreferenceDraft_.layerDisplayColors.size())return;if(!colorEditorPopup_)colorEditorPopup_=std::make_unique<ColorEditorPopup>(font_,skin_,toolIcons_,smoke_?assets_.parent_path()/"color-editor-smoke-size.txt":palettePreferencePath().parent_path()/"color-editor-layer-preset-size.txt");colorEditorPopup_->open(preferenceColorRows_[index].first->bounds(),bounds(),runtimePreferenceDraft_.layerDisplayColors[index],U"图层预设颜色",runtimePreferenceDraft_.layerDisplayColors,[this,index](Pixel value){if(pending_==Pending::Preferences)changePreferenceColor(index,value);},{});});configureDialogBackground(color);addChild(color);color->colorRole=true;color->setVisible(false);auto remove=button(U"",[this,index]{if(runtimePreferenceDraft_.layerDisplayColors.size()>1&&index<runtimePreferenceDraft_.layerDisplayColors.size())runtimePreferenceDraft_.layerDisplayColors.erase(runtimePreferenceDraft_.layerDisplayColors.begin()+index);syncPreferenceColors();layoutModal();invalidateRect(dialogDisplayBounds());});remove->icon="delete";remove->iconSkin=&toolIcons_;remove->skinStyle="icon_button";remove->setVisible(false);preferenceColorRows_.push_back({color,remove});}
 for(std::size_t index=0;index<runtimePreferenceDraft_.layerDisplayColors.size();++index)preferenceColorRows_[index].first->swatch=runtimePreferenceDraft_.layerDisplayColors[index];
}
void Editor::layoutLayerPresetColors(const gfx::Rect& modal){
 while(layerPresetColors_.size()<runtimePreferences_.layerDisplayColors.size()){const auto index=layerPresetColors_.size();auto field=button(U"",[this,index]{if(pending_!=Pending::LayerOpacity||index>=runtimePreferences_.layerDisplayColors.size())return;const auto color=runtimePreferences_.layerDisplayColors[index];document.previewLayerDisplayColor(color);layerDisplayColor_->swatch=color;refresh();});field->colorRole=true;field->setVisible(false);layerPresetColors_.push_back(field);}
 for(std::size_t index=0;index<layerPresetColors_.size();++index){auto field=layerPresetColors_[index];const bool visible=pending_==Pending::LayerOpacity&&index<runtimePreferences_.layerDisplayColors.size();field->setVisible(visible);field->setEnabled(visible);if(visible){field->swatch=runtimePreferences_.layerDisplayColors[index];field->active=layerDisplayColor_->swatch==field->swatch;field->setBounds(toDisplay({modal.x+6+int(index)*19,modal.y+175,20,textControlHeight}));}}
}

void Editor::readPreferenceScales(bool normalize){std::vector<double> input;for(std::size_t i=0;i<runtimePreferenceDraft_.exportScales.size();++i){auto field=preferenceScaleRows_[i].first;field->numeric=true;const bool valid=field->commitExpression();field->numeric=false;double value=runtimePreferenceDraft_.exportScales[i];if(valid)try{std::size_t used=0;const double parsed=std::stod(field->text(),&used);if(used==field->text().size()&&std::isfinite(parsed))value=parsed;}catch(...){}input.push_back(std::clamp(value,1.,6400.));}if(normalize)runtimePreferenceDraft_.exportScales=preferences::RuntimeSettings::normalizeExportScales(input);else{runtimePreferenceDraft_.exportScales.clear();for(double value:input)runtimePreferenceDraft_.exportScales.push_back(int(std::floor(value+.5)));}}

void Editor::syncPreferenceScales(){

    while(preferenceScaleRows_.size()<runtimePreferenceDraft_.exportScales.size()){const auto i=preferenceScaleRows_.size();auto field=new DialogBackground<PixelEntry>(font_,skin_);configureDialogBackground(field);field->suffix=U"%";field->numeric=false;addChild(field);field->setVisible(false);auto remove=button(U"",[this,i]{try{readPreferenceScales();if(runtimePreferenceDraft_.exportScales.size()>1&&i<runtimePreferenceDraft_.exportScales.size())runtimePreferenceDraft_.exportScales.erase(runtimePreferenceDraft_.exportScales.begin()+i);syncPreferenceScales();layoutModal();invalidateRect(dialogDisplayBounds());}catch(const std::exception& e){preferenceFeedback_=unicodeText(e.what());invalidate();}});remove->icon="delete";remove->iconSkin=&toolIcons_;remove->skinStyle="icon_button";remove->setVisible(false);preferenceScaleRows_.push_back({field,remove});}

    for(std::size_t i=0;i<runtimePreferenceDraft_.exportScales.size();++i)preferenceScaleRows_[i].first->setText(std::to_string(runtimePreferenceDraft_.exportScales[i]));

  }

void Editor::addPreferenceScale(){try{readPreferenceScales();runtimePreferenceDraft_.exportScales.push_back(100);syncPreferenceScales();layoutModal();invalidateRect(dialogDisplayBounds());}catch(const std::exception& e){preferenceFeedback_=unicodeText(e.what());invalidate();}}

bool Editor::preferenceRowEnabled(const preferences::Item& item) const {

    if(std::string(item.id)=="presets.addColor")return runtimePreferenceDraft_.layerDisplayColors.size()<12;if(std::string(item.id)=="presets.restoreColors")return true;if(std::string(item.id)=="presets.addScale")return true;if(item.binding<0 && !preferences::runtimeSetting(item.id) && !preferenceDirectoryAction(item.id))return false;

    const std::string key=item.id;

    if(key.find("files.saveDirectory")==0 && runtimePreferenceDraft_.index("files.saveLocationMode.Select")!=1)return false;

    if(key.find("files.exportDirectory")==0 && runtimePreferenceDraft_.index("files.exportLocationMode.Select")!=1)return false;

    if(key=="undo.historyLimit.Number" && !runtimePreferenceDraft_.flag("undo.historyLimitEnabled"))return false;

    if(key=="cursor.selectionPreviewColor.Color" && runtimePreferenceDraft_.index("cursor.selectionPreviewColorMode.Select")!=1)return false;

    if(key=="editing.wheelZoomMode.Select" && !runtimePreferenceDraft_.flag("editing.wheelZoomEnabled"))return false;

    if(item.binding==3 && !preferenceDraft_.lens)return false;

    return true;

  }

void Editor::createPreferenceCatalogControls(){

    for(const auto& item:preferences::catalog()){

      ui::Widget* widget=nullptr;

      if(item.binding>=0 && item.binding<9 && item.kind==preferences::Kind::Select)widget=preferenceFields_[item.binding];

      else if(item.binding>=9 && item.binding<=11)widget=checkerboardFields_[item.binding-9];

      else if(item.kind==preferences::Kind::Toggle){

        const int binding=item.binding;

        auto field=new DialogBackground<PixelSwitch>(font_,skin_,item.label,std::string(item.value)=="true",[this,binding](bool value){

          if(binding==2)preferenceFields_[2]->setSelectedIndex(value,true);

          if(binding==5)preferenceFields_[5]->setSelectedIndex(value,true);

          layoutModal();invalidateRect(dialogDisplayBounds());

        });configureDialogBackground(field);addChild(field);widget=field;

      }else if(item.kind==preferences::Kind::Select){

        auto field=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(field);addChild(field);widget=field;field->setOptions(item.options);field->setSelectedIndex(item.selected);if(std::string(item.id)=="files.saveFormat.Select"){auto labels=item.options;for(int i=0;i<int(labels.size());++i)if(i!=0&&i!=7&&i!=8)labels[i]+=U" · 未接入";field->setOptions(std::move(labels));field->optionEnabled=[](int i){return i==0||i==7||i==8;};}if(std::string(item.id)=="files.exportFormat.Select"){auto labels=item.options;for(int i=0;i<int(labels.size());++i)if(!supportedExportPreference(i))labels[i]+=U" · 未接入";field->setOptions(std::move(labels));field->optionEnabled=[this](int i){return supportedExportPreference(i);};}

        if(item.binding==12){field->changed=[this](int value){const double minutes[]{.5,1,2,5,10};preferenceDraft_.recovery.enabled=value!=0;if(value>0)preferenceDraft_.recovery.minutes=minutes[std::clamp(value-1,0,4)];layoutModal();invalidate();};}

      }else if(item.kind==preferences::Kind::Action){const std::string key=item.id;auto field=new DialogBackground<PixelButton>(font_,skin_,item.label,[this,key]{if(key=="presets.addColor"||key=="presets.restoreColors"){preferenceColorAction(key);return;}if(key=="presets.addScale"){addPreferenceScale();return;}if(preferenceDirectoryAction(key))preferenceDirectoryActionRun(key);});configureDialogBackground(field);addChild(field);if(key=="presets.addColor"||key=="presets.restoreColors"){field->iconSkin=&toolIcons_;field->icon=key=="presets.addColor"?"plus":"restore";}widget=field;}

      else if(item.kind==preferences::Kind::Color){

        auto field=new DialogBackground<PixelButton>(font_,skin_,U"",[]{});configureDialogBackground(field);addChild(field);field->colorRole=true;Pixel value;if(parsePaletteHex(item.value,value))field->swatch=value;widget=field;

      }else {

        auto field=new DialogBackground<PixelEntry>(font_,skin_);configureDialogBackground(field);addChild(field);field->numeric=item.kind==preferences::Kind::Number;field->setText(item.value);widget=field;

      }

      if(preferences::runtimeSetting(item.id)){

        const std::string key=item.id;

        auto change=[this,key](std::string value){try{if(key=="general.preferences.usageStatisticsEnabled")setUsageStatisticsEnabled(value=="true");runtimePreferenceDraft_.set(key,std::move(value));preferenceFeedback_.clear();}catch(const std::exception& e){preferenceFeedback_=unicodeText(e.what());}layoutModal();invalidateRect(dialogDisplayBounds());};

        if(auto toggle=dynamic_cast<PixelSwitch*>(widget))toggle->Click.connect([change,toggle]{if(toggle->isEnabled())change(toggle->checked()?"true":"false");});

        else if(auto select=dynamic_cast<PixelDropdown*>(widget))select->changed=[change](int value){change(std::to_string(value));};

        else if(item.kind==preferences::Kind::Color){

          removeChild(widget);delete widget;auto entry=new DialogBackground<PixelEntry>(font_,skin_);configureDialogBackground(entry);addChild(entry);widget=entry;

          entry->Change.connect([change,entry]{change(entry->text());});entry->blur=[change,entry]{change(entry->text());};entry->cancel=[this]{resolve(false);};

        }else if(auto entry=dynamic_cast<PixelEntry*>(widget)){entry->Change.connect([change,entry]{change(entry->text());});entry->blur=[change,entry]{change(entry->text());};entry->cancel=[this]{resolve(false);};}

      }

      widget->setVisible(false);widget->setEnabled(false);preferenceRows_.push_back(widget);

    }

    preferenceRowY_.resize(preferenceRows_.size());

  }

void Editor::syncPreferenceCatalog(){

    for(std::size_t i=0;i<preferenceRows_.size();++i){const auto& item=preferences::catalog()[i];

      if(preferences::runtimeSetting(item.id)){

        if(auto toggle=dynamic_cast<PixelSwitch*>(preferenceRows_[i]))toggle->setChecked(runtimePreferenceDraft_.flag(item.id));

        else if(auto select=dynamic_cast<PixelDropdown*>(preferenceRows_[i]))select->setSelectedIndex(runtimePreferenceDraft_.index(item.id));

        else if(auto entry=dynamic_cast<PixelEntry*>(preferenceRows_[i]))entry->setText(runtimePreferenceDraft_.get(item.id));

      }

      if(auto toggle=dynamic_cast<PixelSwitch*>(preferenceRows_[i])){if(item.binding==2)toggle->setChecked(preferenceDraft_.lens);if(item.binding==5)toggle->setChecked(preferenceDraft_.returnStart);}

      if(item.binding==12){int selected=0;if(preferenceDraft_.recovery.enabled){const double minutes[]{.5,1,2,5,10};selected=4;for(int j=0;j<5;++j)if(minutes[j]==preferenceDraft_.recovery.minutes)selected=j+1;}static_cast<PixelDropdown*>(preferenceRows_[i])->setSelectedIndex(selected);}

    }

  }

int Editor::preferenceCatalogHeight(){

    std::u32string group;int y=0;

    for(std::size_t i=0;i<preferenceRows_.size();++i){const auto& item=preferences::catalog()[i];if(item.section!=preferenceSection_||fixedExportScaleRow(item))continue;

      if(group!=item.group){if(y)y+=preferenceGroupGap;group=item.group;y+=preferenceGroupTitleHeight+preferenceOptionGap;}

      else y+=preferenceOptionGap;

      preferenceRowY_[i]=y;y+=textControlHeight;if(std::string(item.id)=="presets.addColor"){preferenceColorRowsY_=y+preferenceOptionGap;y+=int(runtimePreferenceDraft_.layerDisplayColors.size())*(textControlHeight+preferenceOptionGap);}if(std::string(item.id)=="presets.addScale"){preferenceScaleRowsY_=y+preferenceOptionGap;y+=int(runtimePreferenceDraft_.exportScales.size())*(textControlHeight+preferenceOptionGap);}

    }

    return y+6;

  }

void Editor::paintPreferenceCatalog(ui::Graphics& g,gfx::Rect modal){

    const auto view=uiLogical(preferenceViewport_.offset(-bounds().origin()));

    g.saveClip();g.clipRect(view);std::u32string group;

    const int labelWidth=std::max(50,(view.w-10)*55/100);

    for(std::size_t i=0;i<preferenceRows_.size();++i){const auto& item=preferences::catalog()[i];if(item.section!=preferenceSection_||fixedExportScaleRow(item))continue;

      const int y=view.y+preferenceRowY_[i]-preferenceContentPixels_/uiScale;

      if(group!=item.group){group=item.group;const int top=y-preferenceGroupTitleHeight-preferenceOptionGap;g.fillRect(skin_["panel"],gfx::Rect(view.x,top,view.w,preferenceGroupTitleHeight));font_.draw(g,group,view.x+3,top+3,skin_["text"]);}

      if(item.kind==preferences::Kind::Action || item.kind==preferences::Kind::Toggle)continue;

      const auto color=skin_[preferenceRowEnabled(item)?"text":"muted"];

      std::u32string line;int lineY=y+4;

      for(char32_t c:std::u32string(item.label)){if(font_.measure(line+std::u32string(1,c))>labelWidth-4 && !line.empty()){font_.draw(g,line,view.x+2,lineY,color);line.clear();lineY+=11;}line+=c;}

      font_.draw(g,line,view.x+2,lineY,color);

    }

    g.restoreClip();

  }

void Editor::showPreferences(){preferenceNavPixels_=preferenceContentPixels_=0;

    if(pending_!=Pending::None || (document.active() && !document.floating()) || selectionDragging_ || floatingDragging_ || navigation_.zoomDragging_ || eyedropperGesture_.active())return;

    preferenceDraft_={navigation_.zoomSmooth_,eyedropperLensEnabled_,playbackReturnToStart_,int(eyedropperSource_),eyedropperLensSize_,playbackRate_,recoveryPreferences_};preferenceFeedback_.clear();

    auto index=[](const auto& values,auto value,int fallback){for(int i=0;i<int(std::size(values));++i)if(values[i]==value)return i;return fallback;};

    const double rates[]{.25,.5,1,1.5,2,3},minutes[]{.5,1,2,5,10,30,60};const int days[]{1,7,30,365};

    const int selected[]{int(navigation_.zoomSmooth_),int(eyedropperSource_),int(eyedropperLensEnabled_),eyedropperLensSize_,index(rates,playbackRate_,2),int(playbackReturnToStart_),int(recoveryPreferences_.enabled),index(minutes,recoveryPreferences_.minutes,3),index(days,recoveryPreferences_.retentionDays,1)};

    for(int i=0;i<9;++i)preferenceFields_[i]->setSelectedIndex(selected[i]);

    runtimePreferenceDraft_=runtimePreferences_;syncPreferenceScales();syncPreferenceColors();

    runtimePreferenceDraft_.set("tools.gradientApplicationMode.Select",gradientConfirm_?"1":"0");

    checkerboardDraft_=checkerboard_;

    checkerboardFields_[0]->setText(std::to_string(checkerboardDraft_.size));

    for(int i=1;i<3;++i){const auto c=i==1?checkerboardDraft_.light:checkerboardDraft_.dark;checkerboardFields_[i]->setText(paletteHex(Pixel(gfx::getr(c))|(Pixel(gfx::getg(c))<<8)|(Pixel(gfx::getb(c))<<16)|0xff000000));}

    syncPreferenceCatalog();

    playing_=false;pending_=Pending::Preferences;discard_->caption=U"确定";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);saveBeforeClose_->setVisible(false);menuBar_->setEnabled(false);refresh();preferenceTabs_[preferenceSection_]->requestFocus();

  }

bool Editor::applyPreferences(){

    try{

      if(!runtimePreferencesReadable_)throw std::runtime_error("首选项文件读取失败，请先修复 editor-preferences.txt，原文件未被覆盖");

      readPreferenceScales(true);syncPreferenceScales();runtimePreferenceDraft_.layerDisplayColors=normalizeLayerDisplayColors(runtimePreferenceDraft_.layerDisplayColors);syncPreferenceColors();auto next=runtimePreferenceDraft_;

      for(std::size_t i=0;i<preferenceRows_.size();++i)if(preferences::runtimeSetting(preferences::catalog()[i].id))if(auto field=dynamic_cast<PixelEntry*>(preferenceRows_[i])){

        const auto& item=preferences::catalog()[i];

        try{next.set(item.id,field->text());}catch(const std::exception& e){throw std::runtime_error(utf8Text(item.label)+": "+e.what());}

      }

      auto d=preferenceDraft_;d.recovery=recovery::normalizePreferences(d.recovery);

      for(auto field:checkerboardFields_)if(field->blur)field->blur();

      if(!smoke_){const auto dir=palettePreferencePath().parent_path();std::filesystem::create_directories(dir);auto write=[&](const char* name,const std::string& text){try{writeExportBytesAtomic(dir/name,std::vector<std::uint8_t>(text.begin(),text.end()));}catch(const std::exception& e){throw std::runtime_error(std::string(name)+": "+e.what());}};

        auto packed=[](gfx::Color c){return unsigned(gfx::getr(c))|(unsigned(gfx::getg(c))<<8)|(unsigned(gfx::getb(c))<<16);};

        write("editor-preferences.txt",next.encode());

        write("canvas-checkerboard.txt",std::to_string(checkerboardDraft_.size)+" "+std::to_string(packed(checkerboardDraft_.light))+" "+std::to_string(packed(checkerboardDraft_.dark)));

        write("zoom-tool-drag-mode.txt",d.smooth?"smooth":"stepped");write("eyedropper-source.txt",d.source?"current-layer":"composite");write("eyedropper-lens.txt",std::to_string(int(d.lens))+" "+std::to_string(d.lensSize));write("animation-playback.txt",std::to_string(d.rate)+" "+std::to_string(int(d.returnStart))+(savedPlaybackMode_?" "+*savedPlaybackMode_:""));recovery::savePreferencesAtomic(recoveryDirectory().parent_path()/"recovery-preferences.txt",d.recovery);

      }

      runtimePreferences_=std::move(next);applyWorkspacePreferences();runtimePreferenceDraft_=runtimePreferences_;gradientConfirm_=runtimePreferences_.index("tools.gradientApplicationMode.Select")==1;

      for(auto& slot:projects_){slot->recovery.queue.setIntervalMinutes(d.recovery.minutes);slot->recovery.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(d.recovery.minutes*60000));}

      syncPreferenceCatalog();

      checkerboard_=checkerboardDraft_;if(previewPanel_){previewPanel_->checkerboard=checkerboard_;previewPanel_->invalidate();}

      navigation_.zoomSmooth_=d.smooth;eyedropperSource_=d.source?EyedropperSource::CurrentLayer:EyedropperSource::Composite;eyedropperLensEnabled_=d.lens;eyedropperLensSize_=d.lensSize;playbackRate_=d.rate;playbackReturnToStart_=d.returnStart;recoveryPreferences_=d.recovery;recovery_.queue.setIntervalMinutes(d.recovery.minutes);recovery_.due=std::chrono::steady_clock::now()+std::chrono::milliseconds(static_cast<long long>(d.recovery.minutes*60000));preferenceDraft_=d;preferenceFeedback_=U"设置已应用";refresh();return true;

    }catch(const std::exception& e){preferenceFeedback_=U"保存失败："+unicodeText(e.what());status_=preferenceFeedback_;layoutModal();invalidate();return false;}

  }

gfx::Rect Editor::preferenceFeedbackBounds(gfx::Rect modal) const {

    return {modal.x+6,modalActionY(modal)-18,modal.w-12,12};

  }

gfx::Rect Editor::preferenceBodyBounds(gfx::Rect modal) const {

    return {modal.x+90,modal.y+DialogLayout::bodyTop,modal.w-96,std::max(1,preferenceFeedbackBounds(modal).y-6-(modal.y+DialogLayout::bodyTop))};

  }

void Editor::layoutPreferences(gfx::Rect modal){

    if(!preferenceApply_)return;const bool show=pending_==Pending::Preferences;

    const auto body=preferenceBodyBounds(modal);

    auto nav=toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::bodyTop,78,body.h));

    const int navTotal=14*15*uiScale;preferenceNavPixels_=std::clamp(preferenceNavPixels_,0,std::max(0,navTotal-nav.h));const bool navOverflow=navTotal>nav.h;

    auto content=toDisplay(gfx::Rect(body.x+6,body.y+6,body.w-12,std::max(1,body.h-12)));

    const int contentTotal=preferenceCatalogHeight()*uiScale;preferenceContentPixels_=std::clamp(preferenceContentPixels_,0,std::max(0,contentTotal-content.h));

    if(preferenceNavBar_){preferenceNavBar_->setDockBounds(PixelScrollBar::edgeBounds(nav,true));preferenceNavBar_->configure(navTotal,nav.h,preferenceNavPixels_);preferenceNavBar_->wheelStep=15*uiScale;preferenceNavBar_->setVisible(show && navOverflow);preferenceNavBar_->setEnabled(show);}

    if(navOverflow)nav.w-=6*uiScale;

    const bool contentOverflow=contentTotal>content.h;

    if(preferenceContentBar_){auto trackFrame=toDisplay(gfx::Rect(body.x+2,body.y+2,body.w-4,body.h-4));preferenceContentBar_->setDockBounds(PixelScrollBar::edgeBounds(trackFrame,true));preferenceContentBar_->configure(contentTotal,content.h,preferenceContentPixels_);preferenceContentBar_->wheelStep=24*uiScale;preferenceContentBar_->setVisible(show && contentOverflow);preferenceContentBar_->setEnabled(show);}

    if(contentOverflow)content.w-=6*uiScale;

    for(int i=0;i<14;++i){auto tab=preferenceTabs_[i];tab->setEnabled(show);tab->active=preferenceSection_==i;tab->setBounds(gfx::Rect(nav.x,nav.y+i*15*uiScale-preferenceNavPixels_,nav.w,15*uiScale));tab->paletteViewport=[nav]{return nav;};tab->setVisible(show && nav.intersects(tab->bounds()));}

    preferenceViewport_=content;

    for(auto field:preferenceFields_)field->setVisible(false);

    for(auto field:checkerboardFields_)field->setVisible(false);

    const int labelWidth=std::max(50,(content.w/uiScale-10)*55/100);

    for(std::size_t i=0;i<preferenceRows_.size();++i){auto field=preferenceRows_[i];const auto& item=preferences::catalog()[i];

      if(item.section!=preferenceSection_||fixedExportScaleRow(item)){field->setVisible(false);continue;}

      const int x=content.x+(labelWidth+4)*uiScale,y=content.y+preferenceRowY_[i]*uiScale-preferenceContentPixels_;

      auto rect=gfx::Rect(x,y,std::max(24*uiScale,content.x2()-x-4*uiScale),textControlHeight*uiScale);

      if(item.kind==preferences::Kind::Action || item.kind==preferences::Kind::Toggle)rect=gfx::Rect(content.x+2*uiScale,y,content.w-6*uiScale,textControlHeight*uiScale);

      field->setBounds(rect);field->setEnabled(show && preferenceRowEnabled(item));

      if(auto button=dynamic_cast<PixelButton*>(field))button->paletteViewport=[content]{return content;};

      if(auto entry=dynamic_cast<PixelEntry*>(field))entry->paletteViewport=[content]{return content;};

      field->setVisible(show && content.intersects(rect));

    }

    for(std::size_t i=0;i<preferenceScaleRows_.size();++i){auto [entry,remove]=preferenceScaleRows_[i];const bool active=show&&preferenceSection_==10&&i<runtimePreferenceDraft_.exportScales.size();const int y=content.y+(preferenceScaleRowsY_+int(i)*(textControlHeight+preferenceOptionGap))*uiScale-preferenceContentPixels_;const auto rect=gfx::Rect(content.x+2*uiScale,y,std::max(24*uiScale,content.w-30*uiScale),textControlHeight*uiScale);entry->setBounds(rect);remove->setBounds(gfx::Rect(rect.x2()+2*uiScale,y,20*uiScale,textControlHeight*uiScale));entry->paletteViewport=[content]{return content;};remove->paletteViewport=[content]{return content;};entry->setVisible(active&&content.intersects(rect));remove->setVisible(active&&content.intersects(remove->bounds()));entry->setEnabled(active);remove->setEnabled(active&&runtimePreferenceDraft_.exportScales.size()>1);}

    for(std::size_t index=0;index<preferenceColorRows_.size();++index){auto [color,remove]=preferenceColorRows_[index];const bool active=show&&preferenceSection_==10&&index<runtimePreferenceDraft_.layerDisplayColors.size();const int y=content.y+(preferenceColorRowsY_+int(index)*(textControlHeight+preferenceOptionGap))*uiScale-preferenceContentPixels_;const auto rect=gfx::Rect(content.x+2*uiScale,y,std::max(24*uiScale,content.w-30*uiScale),textControlHeight*uiScale);color->setBounds(rect);remove->setBounds({rect.x2()+2*uiScale,y,20*uiScale,textControlHeight*uiScale});color->paletteViewport=[content]{return content;};remove->paletteViewport=[content]{return content;};color->setVisible(active&&content.intersects(rect));remove->setVisible(active&&content.intersects(remove->bounds()));color->setEnabled(active);remove->setEnabled(active&&runtimePreferenceDraft_.layerDisplayColors.size()>1);}
    preferenceApply_->setVisible(show);preferenceApply_->setEnabled(show);

    if(show){int x=modal.x2()-3*58-2*uiGap-6;keep_->setBounds(toDisplay(gfx::Rect(x,modalActionY(modal),58,textControlHeight)));preferenceApply_->setBounds(toDisplay(gfx::Rect(x+58+uiGap,modalActionY(modal),58,textControlHeight)));discard_->setBounds(toDisplay(gfx::Rect(x+116+2*uiGap,modalActionY(modal),58,textControlHeight)));}

  }

bool Editor::processPreferencesWheel(ui::MouseMessage& mouse){

    if(pending_!=Pending::Preferences)return false;

    const auto modal=modalBounds(uiLogical(clientBounds()));

    const auto body=preferenceBodyBounds(modal);

    const auto nav=toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::bodyTop,84,body.h-1));

    const auto content=toDisplay(body);

    auto bar=nav.contains(mouse.position())?preferenceNavBar_:content.contains(mouse.position())?preferenceContentBar_:nullptr;

    if(!bar)return false;

    // Route the whole container through the same scroll model as its bar.

    // This also consumes boundary events instead of changing child inputs.

    bar->onProcessMessage(&mouse);return true;

  }

void Editor::ask(Pending action) {

    if(colorEditorPopup_&&colorEditorPopup_->isVisible())colorEditorPopup_->closeWindow(nullptr);

    if(action==Pending::New){showNewDocument();return;}

    if(action==Pending::Open){acceptOpen();return;}

    if(action==Pending::Close){closingWorkspace_=true;if(!documentOpen_){closingWorkspace_=false;closeRequested();return;}}

    if(action==Pending::CloseDocument && !documentOpen_)return;

    document.commitFloatingPaste();if(!flushTimelapse()){closingWorkspace_=false;return;}

    if(colorPicker_) colorPicker_->finishInteraction();

    cancelStroke();

    if(!document.dirty()) { if(action==Pending::New) {showNewDocument();} else if(action==Pending::Open) acceptOpen(); else if(action==Pending::Close){closeDocumentTab();if(closingWorkspace_)ask(Pending::Close);} else if(action==Pending::CloseDocument)closeDocumentTab(); refresh(); return; }

    spaceHeld_=false;updateNavigationCursor();

    pending_=action;layoutModal();layoutPalette();

    layoutDocumentTab();

    menuBar_->setEnabled(false);

    paletteActions_->setEnabled(false);

    for(auto b:commands_) b->setEnabled(false);

    for(auto b:swatches_) b->setEnabled(false);

    for(auto b:panelTabs_) b->setEnabled(false);

    paletteActions_->setEnabled(false);

    dialogClose_->setVisible(true);

    saveBeforeClose_->setVisible(true);discard_->setVisible(true); keep_->setVisible(true); keep_->requestFocus(); applyHomeVisibility();invalidate();

  }

void Editor::resolve(bool discard) {

    if((pending_==Pending::StaticExport||pending_==Pending::GifExport)&&framePngBusy()){if(!discard)framePngJob_->cancel=true;return;}

    if(pending_==Pending::Saving)return;

    finishSizeDrag();

    if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap&&discard&&!editingLayerAdjustment_){gmPicker_->finishInteraction();scheduleGradientMap(true);refresh();return;}

    if(pending_==Pending::AntiAlias && discard){requestAntiAliasApply();return;}

    if(pending_==Pending::Convolution && convolutionCommit_ && !discard)return;

    if(pending_==Pending::Convolution && discard){requestConvolutionApply(true);return;}

    const auto action=pending_;

    std::optional<Document> createdSheet;

    const bool completedSheet=action==Pending::SpriteSheet&&discard;

    const bool openExportedSheet=completedSheet&&sheetOutputFile_&&sheetOpenAfterExport_;

    const bool openExportFolder=discard&&exportOpenFolderRequested_&&(action==Pending::StaticExport||action==Pending::GifExport);

    if(action==Pending::AntiAlias){aaPicker_->finishInteraction();stopAntiAlias();document.cancelColorAdjustment();for(auto c:{aaAutoButton_,aaInterior_,aaLiveButton_})c->setVisible(false);aaSource_->setVisible(false);aaOpacity_->setVisible(false);aaOpacitySlider_->setVisible(false);aaColorEntry_->setVisible(false);aaPicker_->setVisible(false);discard_->caption=U"丢弃";discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);}

    if(action==Pending::Convolution){stopConvolution();document.cancelColorAdjustment();for(auto c:convolutionPresets_)c->setVisible(false);for(auto c:convolutionChannels_)c->setVisible(false);for(auto c:{convolutionTiled_,convolutionLive_,convolutionApply_})c->setVisible(false);convolutionScroll_->setVisible(false);discard_->caption=U"丢弃";discard_->setEnabled(true);keep_->setEnabled(true);dialogClose_->setEnabled(true);}

    if(action==Pending::Preferences){if(discard && !applyPreferences())return;discard=false;discard_->caption=U"丢弃";for(auto tab:preferenceTabs_)tab->setVisible(false);for(auto field:preferenceFields_)field->setVisible(false);for(auto field:checkerboardFields_)field->setVisible(false);for(auto field:preferenceRows_)field->setVisible(false);preferenceApply_->setVisible(false);}

    if(action==Pending::ReplaceColor){finishReplaceSampling();cancelReplacePreview();if(discard){if(replaceScope_=="palette"){if(document.beginPaletteReplacement()){document.updatePaletteReplacement(replaceSource_,replaceDestination_,true);document.commitPaletteReplacement();}}else if(document.beginColorReplacement(replaceTargets(),replaceScope_=="selection")){document.updateColorReplacement(replaceSource_,replaceDestination_,true);([&]{Document::HistoryLabelScope historyLabel(document,pending_==Pending::ReplaceColor?U"替换颜色":historyAdjustmentLabel());return document.commitColorAdjustment();})();}}for(auto input:replaceInputs_)input->setVisible(false);for(auto b:replaceSample_)b->setVisible(false);for(auto b:{replaceScopeButton_,replacePreviewButton_,replaceRememberButton_})b->setVisible(false);discard_->setEnabled(true);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::BrushFolderName){if(discard){try{PatternBrushLibrary library(fillBrushLibraryDirectory());auto result=fillFolderRename_?library.renameFolder(fillFolderEditing_,paletteInput_->text()):library.createFolder(paletteInput_->text(),fillFolderEditing_);fillFolder_=result.id;applyFillLibrarySelection();}catch(const std::exception& e){status_=U"文件夹操作失败："+unicodeText(e.what());refresh();return;}}paletteInput_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::SheetImport){if(discard){try{document.importSpriteSheet(importSheetOptions_);fitCanvas();}catch(const std::exception& e){status_=U"精灵表导入失败："+unicodeText(e.what());invalidate();return;}}for(auto input:importSheetInputs_)input->setVisible(false);importSheetLayout_->setVisible(false);importSheetPartial_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::GifExport){if(discard&&!saveGifExport())return;discard_->setEnabled(true);for(auto input:gifInputs_)input->setVisible(false);for(auto b:{gifRange_,gifDirection_,gifTrim_})b->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::SpriteSheet){if(discard){if(sheetOutputFile_){if(!saveSpriteSheet())return;}else{try{createdSheet=createSpriteSheetDocument(document,sheetOptions_);}catch(const std::exception& e){status_=U"精灵表创建失败："+unicodeText(e.what());invalidate();return;}}}discard_->setEnabled(true);for(auto b:sheetButtons_)b->setVisible(false);sheetValue_->setVisible(false);if(sheetPreview_)sheetPreview_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::StaticExport){if(discard&&!saveStaticExport())return;exportScaleInput_->setVisible(false);exportTrimButton_->setVisible(false);exportSelectionButton_->setVisible(false);exportLayerButton_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::ImageResize){if(discard){try{document.resizeImage(resizeWidth_,resizeHeight_,resizeMethodValue_);fitCanvas();}catch(const std::exception& e){status_=U"调整尺寸失败："+unicodeText(e.what());invalidate();return;}}for(auto input:resizeInputs_){input->setVisible(false);}resizeLock_->setVisible(false);resizeMethod_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::ColorAdjustment){if(adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap)gmPicker_->finishInteraction();if(editingLayerAdjustment_){if(discard)document.commitLayerAdjustment(adjustmentSpec_.gradientMap,layerAdjustmentEnabled_);else document.cancelLayerAdjustment();editingLayerAdjustment_=false;discard=false;}cancelGradientMapJob();if(discard){try{document.updateColorAdjustment(adjustmentSpec_,true);([&]{Document::HistoryLabelScope historyLabel(document,pending_==Pending::ReplaceColor?U"替换颜色":historyAdjustmentLabel());return document.commitColorAdjustment();})();}catch(const std::exception& e){status_=U"颜色调整失败："+unicodeText(e.what());refresh();return;}}else document.cancelColorAdjustment();for(auto input:adjustmentInputs_)input->setVisible(false);adjustmentPreview_->setVisible(false);adjustmentColorize_->setVisible(false);for(auto tone:adjustmentToneButtons_)tone->setVisible(false);curveEditor_->setVisible(false);for(auto b:{curveChannelButton_,curveResetButton_,curveDeleteButton_})b->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::PaletteLibrary){storedPaletteScroll_->setVisible(false);for(auto b:storedPaletteRows_)b->setVisible(false);for(auto& row:storedPaletteSwatches_)for(auto b:row)b->setVisible(false);for(auto b:storedPaletteActions_)b->setVisible(false);discard=false;}

    if(action==Pending::PaletteSave){paletteSaveName_=unicodeText(paletteInput_->text());if(discard&&!savePalettePng())return;paletteSaveNew_->setVisible(false);paletteSaveCurrent_->setVisible(false);paletteInput_->setVisible(false);for(auto b:paletteSavePreview_)b->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::PaletteExtract){if(discard && !applyPaletteExtraction())return;paletteInput_->setVisible(false);extractNameInput_->setVisible(false);extractModeButton_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::LoopSection){if(discard && !commitLoopEditor())return;for(auto input:loopInputs_){input->setVisible(false);}loopDirection_->setVisible(false);loopRepeat_->setVisible(false);loopDraft_.reset();discard_->caption=U"丢弃";keep_->caption=U"取消";discard=false;}

    if(action==Pending::OnionValue){previewOnionValue();saveOnionSettings();paletteInput_->setVisible(false);paletteInput_->suffix.clear();discard=false;}

    if(action==Pending::FrameDuration){static_cast<FrameDurationPaletteEntry*>(paletteInput_)->durationMode=false;document.commitFrameDuration();paletteInput_->setVisible(false);paletteInput_->suffix.clear();discard=false;}

    if(action==Pending::LayerOpacity){if(colorEditorPopup_&&colorEditorPopup_->isVisible())colorEditorPopup_->closeWindow(nullptr);document.commitLayerOpacity();for(auto field:layerPresetColors_)field->setVisible(false);layerDescription_->setVisible(false);layerDisplayColor_->setVisible(false);layerNoColor_->setVisible(false);layerOpacityRange_->setVisible(false);layerBlendMode_->setVisible(false);paletteInput_->setVisible(false);discard=false;}

    if(action==Pending::PaletteName || action==Pending::ColorRole) {

      if(action==Pending::PaletteName && discard) document.renamePaletteColor(renameId_,unicodeText(paletteInput_->text()));

      if(action==Pending::ColorRole) commitPaletteHex();

      pending_=Pending::None;paletteInput_->setVisible(false);discard_->caption=U"丢弃";keep_->caption=U"取消";

      discard=false;

    }

    pending_=Pending::None;

    if(action==Pending::StaticExport||action==Pending::GifExport){exportOpenFolderRequested_=false;if(exportOpenFolderButton_)exportOpenFolderButton_->setVisible(false);}

    menuBar_->setEnabled(true);

    dialogClose_->setVisible(false);saveBeforeClose_->setVisible(false);

    discard_->setVisible(false); keep_->setVisible(false);

    for(auto b:commands_) b->setEnabled(true);

    for(auto b:swatches_) b->setEnabled(true);

    for(auto b:panelTabs_) b->setEnabled(true);

    if(discard) { if(action==Pending::New) {showNewDocument();} else if(action==Pending::Open) acceptOpen(); else if(action==Pending::Close){closeDocumentTab();if(closingWorkspace_)ask(Pending::Close);} else if(action==Pending::CloseDocument)closeDocumentTab(); }

    if(action==Pending::Close && !discard)closingWorkspace_=false;

    if(action==Pending::Open&&!discard)importAfterOpen_=false;

    openCandidate_.reset();candidateRecovery_=false;keep_->caption=U"取消";

    requestFocus(); refresh();

    if(openExportFolder)finishExportFolder(exportedDirectory_);

    if(createdSheet){addProject(std::move(*createdSheet));status_=U"已创建精灵表文档";invalidate();}

    if(openExportedSheet&&!sheetExportedPath_.empty()){try{openSheetOutput_(sheetExportedPath_);}catch(const std::exception& e){status_=unicodeText(e.what());invalidate();return;}}

    if(completedSheet)playExportSuccessSound();

  }

std::u32string Editor::modalHint() const {

    switch(pending_) {

      case Pending::Preferences:return U"";

      case Pending::LayerOpacity:return U"拖动预览，关闭后应用";

      case Pending::FrameDuration:return U"1–60000 ms，修改预览，关闭保存";

      case Pending::PaletteExtract:return U"扫描线顺序 · 非透明RGBA · 数量1–4096";

      case Pending::BrushFolderName:return U"文件夹名称，确定后应用";

      case Pending::PaletteName:return U"编辑名称，确定后应用";

      case Pending::ColorRole:return U"HEX：6 或 8 位；回车 / 关闭提交";

      case Pending::OnionValue:return onionField_<2?U"0–8 帧":onionField_<4?U"0–100%":U"HEX：6 或 8 位";

      case Pending::LoopSection:return U"";

      case Pending::OpenError:return U"当前内容保持不变";

      default:return U"保存成功后继续；取消保留当前内容";

    }

  }

int Editor::paletteSaveDialogWidth()const{return std::any_of(storedPalettes_.begin(),storedPalettes_.end(),[this](const auto& item){return item.id==activeStoredPalette_ && !item.builtIn;})?306:224;}

int Editor::modalPreferredWidth() const {

    if(pending_==Pending::PaletteLibrary)return 320;
    if(pending_==Pending::PaletteSave)return paletteSaveDialogWidth();

    if(pending_==Pending::StaticExport||pending_==Pending::GifExport)return 300;

    if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap)return 320;

    if(pending_==Pending::AntiAlias)return 280;

    if(pending_==Pending::Convolution)return 300;

    if(pending_==Pending::Preferences)return 310;

    const bool simple=pending_==Pending::LayerOpacity||pending_==Pending::FrameDuration||pending_==Pending::PaletteName||pending_==Pending::ColorRole||pending_==Pending::OnionValue||pending_==Pending::BrushFolderName;

    const bool confirmation=pending_==Pending::New||pending_==Pending::Open||pending_==Pending::Close||pending_==Pending::CloseDocument;

    // Legacy ModalShell: fit content first, then clamp to the available viewport.

    const int contentMinimum=simple?78:confirmation?3*66+2*uiGap+12:240;

    return std::max({contentMinimum,font_.measure(modalHint())+12,

      pending_==Pending::OpenError?font_.measure(errorTitle_)+25:0});

  }

std::vector<std::u32string> Editor::modalErrorLines(int width) const {

    std::vector<std::u32string> lines;std::u32string line;int advance=0;

    for(char32_t c:openError_) {

      if(c==U'\r')continue;

      const int glyph=font_.measure(std::u32string(1,c));

      if(c==U'\n' || (!line.empty() && advance+glyph>width)) {

        lines.push_back(line);line.clear();advance=0;

      }

      if(c!=U'\n'){line+=c;advance+=glyph;}

    }

    lines.push_back(line);return lines;

  }

int Editor::modalErrorVisibleLines(gfx::Rect modal) const {return std::max(1,(modal.h-59)/12);}

int Editor::compactModalPreferredHeight() const {if(pending_==Pending::PaletteLibrary)return 340;if(pending_==Pending::StaticExport||pending_==Pending::GifExport)return exportScaleY()+174;if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap)return 382;if(pending_==Pending::AntiAlias)return aaAuto_?175:271;if(pending_==Pending::Convolution)return 250;if(pending_==Pending::Preferences)return 260;return pending_==Pending::LayerOpacity?290:pending_==Pending::SheetImport?205:pending_==Pending::GifExport?170:pending_==Pending::SpriteSheet?205:pending_==Pending::StaticExport?142:pending_==Pending::ReplaceColor?153:pending_==Pending::BrushFolderName?75:pending_==Pending::ImageResize?164:pending_==Pending::ColorAdjustment?(adjustmentSpec_.kind==ColorAdjustmentKind::Curves?297:adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance?253:adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation?227:163):pending_==Pending::PaletteSave?152:pending_==Pending::PaletteExtract?136:pending_==Pending::LoopSection?212:pending_==Pending::OpenError?99:pending_==Pending::PaletteName || pending_==Pending::ColorRole || pending_==Pending::LayerOpacity || pending_==Pending::FrameDuration || pending_==Pending::OnionValue?75:67;}

int Editor::modalPreferredHeight() const {
    if(pending_==Pending::StaticExport||pending_==Pending::GifExport){int bottom=exportScaleY()+130+(exportPresetFeedback_.empty()?0:16);if(framePngMode_&&framePngBusy())bottom=std::max(bottom,exportScaleY()+156);return DialogLayout::fit(bottom);}
    if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::Curves)return DialogLayout::fit(261);
if(pending_==Pending::ColorAdjustment && adjustmentSpec_.kind!=ColorAdjustmentKind::Curves && adjustmentSpec_.kind!=ColorAdjustmentKind::GradientMap){const bool hsl=adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation,balance=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance;const int top=DialogLayout::bodyTop+(balance?26:0),count=(hsl||balance)?3:2;return DialogLayout::fit(top+count*DialogLayout::fieldStep+((hsl||balance)?22:0)+textControlHeight);}
    if(pending_==Pending::LayerOpacity)return 275;
    if(pending_==Pending::LoopSection)return 218;
    if(pending_==Pending::ReplaceColor)return 127;
    if(pending_==Pending::SheetImport)return 213;
    if(pending_==Pending::PaletteName||pending_==Pending::ColorRole||pending_==Pending::FrameDuration||pending_==Pending::OnionValue||pending_==Pending::BrushFolderName)return DialogLayout::fit(DialogLayout::field()+textControlHeight);
    return compactModalPreferredHeight()+6;}

gfx::Size Editor::modalMinimumSize() const {
    const bool confirmation=pending_==Pending::New||pending_==Pending::Open||pending_==Pending::Close||pending_==Pending::CloseDocument;
    int width=confirmation?214:std::min(240,modalPreferredWidth()),height=modalPreferredHeight();
    if(pending_==Pending::StaticExport||pending_==Pending::GifExport)width=284;
    else if(pending_==Pending::Preferences){width=310;height=190;}
    else if(pending_==Pending::PaletteLibrary){width=280;height=190;}
    else if(pending_==Pending::PaletteSave)width=paletteSaveDialogWidth();
    else if(pending_==Pending::AntiAlias||pending_==Pending::Convolution)width=260;
    else if(pending_==Pending::OpenError){width=214;height=99;}
    else if(pending_==Pending::LoopSection)width=240;
    else if(pending_==Pending::BrushFolderName || (pending_==Pending::PaletteName && renameId_!=0))width=146;
    return {width,height};
  }

gfx::Rect Editor::modalBounds(gfx::Rect rc) const {

    const auto saved=modalGeometry_.find(pending_);const int h=modalPreferredHeight();

    const int width=std::min(std::max(modalPreferredWidth(),modalMinimumSize().w),std::max(240,rc.w-2*uiGap));

    const int preferredHeight=pending_==Pending::OpenError?

      std::max(h,std::min(59+int(modalErrorLines(width-20).size())*12,std::max(h,rc.h*3/4))):pending_==Pending::Preferences?280:h;

    auto rect=saved==modalGeometry_.end()?gfx::Rect(rc.x+(rc.w-width)/2,rc.y+(rc.h-preferredHeight)/2,width,preferredHeight):saved->second;

    if(rc.w<=2*uiGap || rc.h<=2*uiGap)return rect;

    const auto floor=modalMinimumSize();rect.w=std::max(floor.w,rect.w);rect.h=std::max(floor.h,rect.h);

    // Direct MIT Aseprite reuse, in the parent display's logical coordinates.

    ui::limit_with_workarea(gfx::Rect(rc.x+uiGap,rc.y+uiGap,rc.w-2*uiGap,rc.h-2*uiGap),rect);

    return rect;

  }

Editor::SizeDrag Editor::sizeHandleAt(gfx::Point point) const {

    const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);

    if(pending_!=Pending::None) {

      const auto modal=dialogDisplayBounds();

      if(panelResizeEdges(modal,point))return SizeDrag::Modal;

      if(dialogClose_ && dialogClose_->isVisible() && dialogClose_->bounds().contains(point))return SizeDrag::None;

      if(modal.contains(point) && point.y<modal.y+16*uiScale)return SizeDrag::ModalMove;

      return SizeDrag::None;

    }

    if(docking_.custom)return SizeDrag::None;

    if(palettePanelOpen_ && colorPickerOpen_ && toDisplay(gfx::Rect(rc.x+l.rightX,rc.y+l.split-uiGap,l.right,2*uiGap)).contains(point))return SizeDrag::ColorSplit;

    if((palettePanelOpen_ || colorPickerOpen_) && toDisplay(gfx::Rect(rc.x+l.rightX+l.right-1,rc.y+l.tabY,uiGap+2,l.bottom-l.tabY)).contains(point))return SizeDrag::DockWidth;

    if(layersPanelOpen_ && toDisplay(gfx::Rect(rc.x+l.workX,rc.y+l.layerTop-uiGap,l.workW,2*uiGap)).contains(point))return SizeDrag::Timeline;

    return SizeDrag::None;

  }

void Editor::finishSizeDrag() {

    flushSizeGeometry();

    if(sizeDrag_==SizeDrag::None)return;

    if(hasCapture())releaseMouse();sizeDrag_=SizeDrag::None;sizeDragEdges_=0;

    saveWorkspaceSizes();updateNavigationCursor();

  }

void Editor::flushSizeGeometry() {

    sizeTimer_.stop();if(!pendingSizePointer_)return;

    const auto point=*pendingSizePointer_;pendingSizePointer_.reset();

    if(sizeDrag_==SizeDrag::None || !hasCapture())return;

    const gfx::Point delta((point.x-sizeDragMouse_.x)/uiScale,(point.y-sizeDragMouse_.y)/uiScale);

    const auto rc=uiLogical(clientBounds());const auto before=canvasViewport();const auto l=workspaceLayout(rc);

    const auto oldModal=modalBounds(rc);

    const auto oldWidth=dockWidth_,oldHeight=timelineHeight_;const auto oldShare=paletteShare_;

    if(sizeDrag_==SizeDrag::DockWidth)dockWidth_=std::clamp(sizeDragValue_+delta.x,116,std::max(116,rc.w-Layout::edge-l.rightX-uiGap-160));

    else if(sizeDrag_==SizeDrag::ColorSplit)paletteShare_=double(std::clamp(sizeDragValue_+delta.y,70,std::max(70,l.bottom-l.top-100)))/std::max(1,l.bottom-l.top);

    else if(sizeDrag_==SizeDrag::Timeline)timelineHeight_=std::clamp(sizeDragValue_-delta.y,65,std::max(65,l.bottom-l.top-100));

    else {

      const gfx::Rect viewport(rc.x+uiGap,rc.y+uiGap,rc.w-2*uiGap,rc.h-2*uiGap);

      auto modal=sizeDragBounds_;

      if(sizeDrag_==SizeDrag::Modal)modal=resizedPanel(modal,delta,sizeDragEdges_,viewport,modalMinimumSize());

      else {modal.offset(delta);modal.x=std::clamp(modal.x,viewport.x,viewport.x2()-modal.w);modal.y=std::clamp(modal.y,viewport.y,viewport.y2()-modal.h);}

      if(modal==oldModal)return;

      modalGeometry_[pending_]=modal;++sizeLayoutUpdates_;layoutModal();raiseDockWidgets();

      invalidateRect(toDisplay(oldModal));invalidateRect(toDisplay(modal));return;

    }

    if(oldWidth==dockWidth_ && oldHeight==timelineHeight_ && oldShare==paletteShare_)return;

    ++sizeLayoutUpdates_;

    canvas_.offset(canvasViewport().center()-before.center());

    // Resize only affected controls in the coalesced frame. A dock-width

    // change also moves the canvas property row; keep its widgets and labels

    // in this same geometry update without a full-editor refresh.

    if(sizeDrag_!=SizeDrag::Timeline)layoutPalette();

    if(sizeDrag_==SizeDrag::DockWidth){layoutPanelTabs();layoutToolOptions();}

    else if(sizeDrag_==SizeDrag::ColorSplit)layoutPanelTabs(1);

    else if(sizeDrag_==SizeDrag::Timeline)layoutPanelTabs(2);

    if(sizeDrag_!=SizeDrag::ColorSplit)layoutLayers();

    raiseDockWidgets();

    if(sizeDrag_==SizeDrag::ColorSplit)invalidateRect(toDisplay(gfx::Rect(rc.x+l.rightX,rc.y+l.top,l.right,l.bottom-l.top)));

    else invalidateRect(toDisplay(gfx::Rect(rc.x+(sizeDrag_==SizeDrag::Timeline?l.workX:l.rightX),rc.y+l.tabY,rc.w-(sizeDrag_==SizeDrag::Timeline?l.workX:l.rightX),l.bottom-l.tabY)));

  }

bool Editor::processSizeDrag(ui::Message* msg) {
    if(advancedActive()&&pending_==Pending::None&&sizeDrag_==SizeDrag::None)return false;

    if(sizeDrag_!=SizeDrag::None && !hasCapture())finishSizeDrag();

    if(sizeDrag_!=SizeDrag::None) {

      if(msg->type()==ui::kMouseUpMessage) {pendingSizePointer_=static_cast<ui::MouseMessage*>(msg)->position();finishSizeDrag();return true;}

      if((selectionDragging_ || floatingDragging_) && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()>=ui::kKeyLShift && key->scancode()<=ui::kKeyCommand){ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,selectionRight_?ui::kButtonRight:ui::kButtonLeft,key->modifiers(),selectionPointerPosition_);selectionSyntheticMove_=true;onProcessMessage(&move);selectionSyntheticMove_=false;return true;}}

    if(msg->type()==ui::kMouseLeaveMessage){selectionBrushPointer_.reset();invalidateRect(canvasViewport());}

    if(msg->type()==ui::kFocusLeaveMessage) {const auto next=static_cast<ui::FocusMessage*>(msg)->newFocus();if(!next || (next!=this && !next->hasAncestor(this)))finishSizeDrag();return false;}

      if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc) {finishSizeDrag();return true;}

      if(msg->type()==ui::kMouseMoveMessage) {

        pendingSizePointer_=static_cast<ui::MouseMessage*>(msg)->position();

        if(!sizeTimer_.isRunning())sizeTimer_.start();return true;

      }

    }

    if(msg->type()!=ui::kMouseDownMessage || (pending_==Pending::None && (document.active() || navigation_.pan_.active)))return false;

    const auto mouse=static_cast<ui::MouseMessage*>(msg);if(!mouse->left())return false;

    const auto handle=sizeHandleAt(mouse->position());if(handle==SizeDrag::None)return false;

    sizeDrag_=handle;sizeDragMouse_=mouse->position();const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);

    if(handle==SizeDrag::Modal || handle==SizeDrag::ModalMove){sizeDragBounds_=modalBounds(rc);sizeDragEdges_=panelResizeEdges(toDisplay(sizeDragBounds_),sizeDragMouse_);}

    else sizeDragValue_=handle==SizeDrag::DockWidth?l.right:handle==SizeDrag::ColorSplit?l.split-l.top:l.bottom-l.layerTop;

    captureMouse();updateNavigationCursor();return true;

  }

int Editor::modalActionY(const gfx::Rect& modal) const {return modal.y+DialogLayout::footer(modal.h);}

void Editor::layoutModal() {const auto rc=uiLogical(clientBounds());

    const auto modal=modalBounds(rc);

    layoutPreferences(modal);

    if(modalErrorContent_!=openError_){modalErrorContent_=openError_;modalErrorScroll_=errorScrollPixels_=0;}

    const int errorPage=modalErrorVisibleLines(modal)*12*uiScale,errorTotal=int(modalErrorLines(modal.w-20).size())*12*uiScale;

    errorScrollPixels_=std::clamp(errorScrollPixels_,0,std::max(0,errorTotal-errorPage));modalErrorScroll_=errorScrollPixels_/(12*uiScale);

    if(errorScrollBar_){errorScrollBar_->setDockBounds(toDisplay(gfx::Rect(modal.x2()-13,modal.y+32,7,errorPage/uiScale)));errorScrollBar_->configure(errorTotal,errorPage,errorScrollPixels_);errorScrollBar_->wheelStep=36*uiScale;errorScrollBar_->setVisible(pending_==Pending::OpenError && errorTotal>errorPage);errorScrollBar_->setEnabled(pending_==Pending::OpenError);}

    const int actionY=modalActionY(modal);

    FloatingColumnChrome::layoutHeaderButton(dialogClose_,toDisplay(modal));

    const bool confirmation=pending_==Pending::New || pending_==Pending::Open || pending_==Pending::Close || pending_==Pending::CloseDocument;

    const bool two=confirmation || pending_==Pending::PaletteSave || pending_==Pending::AntiAlias || pending_==Pending::Convolution || pending_==Pending::SheetImport || pending_==Pending::GifExport || pending_==Pending::SpriteSheet || pending_==Pending::StaticExport || pending_==Pending::ReplaceColor || pending_==Pending::BrushFolderName || pending_==Pending::ImageResize || pending_==Pending::ColorAdjustment || pending_==Pending::PaletteExtract || pending_==Pending::LoopSection || (pending_==Pending::PaletteName && renameId_!=0);

    const int count=confirmation?3:two?2:1;

    int buttonX=modal.x+(modal.w-(count*66+(count-1)*uiGap))/2;

    if(confirmation){saveBeforeClose_->setBounds(toDisplay(gfx::Rect(buttonX,actionY,66,textControlHeight)));buttonX+=66+uiGap;}

    if(two){discard_->setBounds(toDisplay(gfx::Rect(buttonX,actionY,66,textControlHeight)));buttonX+=66+uiGap;}

    keep_->setBounds(toDisplay(gfx::Rect(buttonX,actionY,66,textControlHeight)));

    if(exportOpenFolderButton_){const bool show=pending_==Pending::StaticExport||pending_==Pending::GifExport;exportOpenFolderButton_->setVisible(show);exportOpenFolderButton_->setEnabled(!framePngBusy());if(show){const int left=modal.x+(modal.w-260)/2;discard_->setBounds(toDisplay(gfx::Rect(left,actionY,66,textControlHeight)));exportOpenFolderButton_->setBounds(toDisplay(gfx::Rect(left+70,actionY,120,textControlHeight)));keep_->setBounds(toDisplay(gfx::Rect(left+194,actionY,66,textControlHeight)));}}

    if(layerOpacityRange_)layerOpacityRange_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::field(),modal.w-12,textControlHeight)));

    if(layerDescription_){bool visible=pending_==Pending::LayerOpacity;layerDescription_->setVisible(visible);layerDisplayColor_->setVisible(visible);layerNoColor_->setVisible(visible);layerDisplayColor_->setBounds(toDisplay({modal.x+6,modal.y+153,modal.w-62,textControlHeight}));layerNoColor_->setBounds(toDisplay({modal.x2()-54,modal.y+153,48,textControlHeight}));layerDescription_->setBounds(toDisplay({modal.x+6,modal.y+213,modal.w-12,52}));}

    layoutLayerPresetColors(modal);
    if(layerBlendMode_){layerBlendMode_->setVisible(pending_==Pending::LayerOpacity);layerBlendMode_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+115,modal.w-12,textControlHeight)));}

    if(pending_==Pending::LayerOpacity)layerOpacityRange_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+77,modal.w-12,textControlHeight)));

    if(loopDirection_){for(int i=0;i<4;++i)loopInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+98,modal.y+DialogLayout::bodyTop+i*DialogLayout::rowStep,modal.w-104,textControlHeight)));loopDirection_->setBounds(toDisplay(gfx::Rect(modal.x+98,modal.y+115,modal.w-104,textControlHeight)));loopRepeat_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+93,88,textControlHeight)));}

    if(paletteInput_) paletteInput_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::field(),modal.w-12,textControlHeight)));

    if(replaceScopeButton_){bool show=pending_==Pending::ReplaceColor;for(int i=0;i<2;++i){replaceInputs_[i]->setVisible(show);replaceInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+65,modal.y+DialogLayout::bodyTop+i*DialogLayout::rowStep,modal.w-81,textControlHeight)));replaceSample_[i]->setVisible(show);replaceSample_[i]->setBounds(toDisplay(gfx::Rect(modal.x+modal.w-21,modal.y+DialogLayout::bodyTop+i*DialogLayout::rowStep,15,20)));}replaceScopeButton_->setVisible(show);replaceScopeButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+53,modal.w-12,textControlHeight)));replacePreviewButton_->setVisible(show);replaceRememberButton_->setVisible(show);replacePreviewButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+75,78,textControlHeight)));replaceRememberButton_->setBounds(toDisplay(gfx::Rect(modal.x+86,modal.y+75,78,textControlHeight)));}

    if(importSheetLayout_){const bool show=pending_==Pending::SheetImport;const char32_t* layouts[]{U"横向",U"纵向",U"按行",U"按列"};importSheetLayout_->setVisible(show);importSheetLayout_->caption=layouts[importSheetOptions_.layout];importSheetLayout_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::bodyTop,modal.w-12,textControlHeight)));for(int i=0;i<8;++i){importSheetInputs_[i]->setVisible(show);importSheetInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+48+(i%2)*(modal.w/2),modal.y+53+(i/2)*DialogLayout::rowStep,modal.w/2-54,textControlHeight)));importSheetInputs_[i]->setEnabled(i!=6&&i!=7||(i==6?importSheetOptions_.layout!=1:importSheetOptions_.layout!=0));}importSheetPartial_->setVisible(show);importSheetPartial_->icon=importSheetOptions_.partialTiles?"check":"checkboxUnchecked";importSheetPartial_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+145,modal.w-12,textControlHeight)));}

    if(gifRange_){bool show=pending_==Pending::GifExport;gifInputs_[0]->setVisible(show);gifInputs_[0]->setBounds(toDisplay(gfx::Rect(modal.x+70,modal.y+DialogLayout::bodyTop,modal.w-76,textControlHeight)));for(int i=1;i<3;++i){gifInputs_[i]->setVisible(show && gifExplicitRange_);gifInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+(i==1?6:modal.w/2),modal.y+71,modal.w/2-10,textControlHeight)));}gifRange_->setVisible(show);gifRange_->caption=gifExplicitRange_?U"指定帧范围":gifOptions_.loopSectionId.empty()?U"全部帧":U"循环段";gifRange_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+48,modal.w-12,textControlHeight)));const char32_t* names[]{U"正向",U"反向",U"正向往返",U"反向往返"};gifDirection_->caption=names[int(gifOptions_.direction)];gifDirection_->setVisible(show);gifDirection_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+94,modal.w-12,textControlHeight)));gifTrim_->setVisible(show);gifTrim_->icon=gifOptions_.trim?"check":"checkboxUnchecked";gifTrim_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+117,110,textControlHeight)));if(show&&(framePngMode_||animationLayerJob_)){const bool ready=!framePngBusy();for(auto input:gifInputs_)input->setEnabled(ready);for(auto b:{gifRange_,gifDirection_,gifTrim_})b->setEnabled(ready);discard_->setEnabled(ready);keep_->setEnabled(true);dialogClose_->setEnabled(true);}else if(show){for(auto input:gifInputs_)input->setEnabled(true);for(auto b:{gifRange_,gifDirection_,gifTrim_})b->setEnabled(true);}}

    if(exportFormatButton_){const bool show=pending_==Pending::StaticExport||pending_==Pending::GifExport;exportFormatButton_->setVisible(show);exportFormatButton_->caption=pending_==Pending::GifExport?(framePngMode_?(frameJpeg_?U"JPEG":frameSvg_?U"SVG":frameIco_?U"ICO":frameBmp_?U"BMP":framePngAutomatic_?U"PNG 自动":U"PNG RGBA"):(gifWebp_?U"WebP":U"GIF")):(staticJpeg_?U"JPEG":staticSvg_?U"SVG":staticIco_?U"ICO":staticBmp_?U"BMP":exportOptions_.automatic?U"PNG 自动":U"PNG RGBA");exportFormatButton_->setEnabled(!framePngBusy());exportFormatButton_->setBounds(toDisplay(gfx::Rect(modal.x2()-80,modal.y+3,62,textControlHeight)));}

    if(sheetPreview_){sheetPreview_->setBounds(toDisplay(gfx::Rect(modal.x+modal.w-136,modal.y+DialogLayout::bodyTop,130,130)));} if(sheetValue_){const bool show=pending_==Pending::SpriteSheet;for(int i=0;i<7;++i){sheetButtons_[i]->setVisible(show);sheetButtons_[i]->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::bodyTop+i*DialogLayout::rowStep,modal.w-12,textControlHeight)));}const char32_t* layouts[]{U"横向",U"纵向",U"按行",U"按列"};sheetButtons_[0]->caption=U"排列："+std::u32string(layouts[int(sheetOptions_.layout)]);const char32_t* constraints[]{U"无约束",U"固定列数",U"固定宽度",U"固定行数",U"固定高度"};const auto c=sheetOptions_.constraint;sheetButtons_[1]->caption=constraints[int(c)];sheetButtons_[1]->setEnabled(sheetOptions_.layout==SheetLayout::Rows||sheetOptions_.layout==SheetLayout::Columns);sheetButtons_[2]->caption=sheetOptions_.frameScope=="all"?U"全部帧":sheetOptions_.frameScope=="selected"?U"选中帧":U"循环段帧";sheetButtons_[3]->caption=sheetOptions_.layerScope=="visible"?U"可见图层":sheetOptions_.layerScope=="all"?U"所有图层":U"选中图层";sheetButtons_[6]->setEnabled(true);sheetButtons_[6]->caption=sheetOptions_.selection?U"来源：像素选区":sheetOptions_.sliceId.empty()?U"来源：画布":U"来源：切片";for(int i=4;i<6;++i){bool checked=i==4?sheetOptions_.mergeDuplicates:i==5?sheetOptions_.ignoreEmpty:sheetOptions_.selection;sheetButtons_[i]->icon=checked?"check":"checkboxUnchecked";sheetButtons_[i]->bareIconWithCaption=true;}sheetValue_->setVisible(show&&c!=SheetConstraint::None);sheetValue_->setBounds(toDisplay(gfx::Rect(modal.x+modal.w-68,modal.y+49,62,textControlHeight)));if(c!=SheetConstraint::None){sheetButtons_[1]->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+49,modal.w-84,textControlHeight)));if(!sheetValue_->hasFocus())sheetValue_->setText(std::to_string(c==SheetConstraint::FixedColumns?sheetOptions_.fixedColumns:c==SheetConstraint::FixedRows?sheetOptions_.fixedRows:c==SheetConstraint::FixedWidth?sheetOptions_.fixedWidth:sheetOptions_.fixedHeight));}}

    if(exportScaleInput_){const bool show=pending_==Pending::StaticExport;exportScaleInput_->setVisible(show);exportScaleInput_->setBounds(toDisplay(gfx::Rect(modal.x+70,modal.y+DialogLayout::bodyTop,modal.w-76,textControlHeight)));exportTrimButton_->setVisible(show);exportSelectionButton_->setVisible(show);exportSelectionButton_->setEnabled(document.selection().has_value());exportTrimButton_->caption=exportOptions_.trimCommon?U"统一修剪":exportOptions_.trim?U"独立修剪":U"不修剪";exportTrimButton_->icon=(exportOptions_.trim||exportOptions_.trimCommon)?"check":"checkboxUnchecked";exportSelectionButton_->icon=exportOptions_.selection?"check":"checkboxUnchecked";exportTrimButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+50,110,textControlHeight)));exportSelectionButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+73,110,textControlHeight)));exportLayerButton_->setVisible(show);exportLayerButton_->caption=exportOptions_.layerId.empty()?U"目标：整幅文档":U"目标：图层 "+document.timeline().state().layers[document.timeline().layerIndex(exportOptions_.layerId)].name;exportLayerButton_->setBounds(toDisplay(gfx::Rect(modal.x+124,modal.y+73,modal.w-130,textControlHeight)));}

    layoutExportForm(modal);

    if(resizeMethod_){const bool show=pending_==Pending::ImageResize;for(int i=0;i<4;++i){resizeInputs_[i]->setVisible(show);resizeInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+65+(i/2)*85,modal.y+DialogLayout::bodyTop+(i%2)*DialogLayout::rowStep,76,textControlHeight)));}resizeLock_->setVisible(show);resizeMethod_->setVisible(show);resizeLock_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+75,100,textControlHeight)));resizeMethod_->setBounds(toDisplay(gfx::Rect(modal.x+108,modal.y+75,modal.w-114,textControlHeight)));}

    if(aaPicker_)layoutAntiAlias(modal);

    if(convolutionScroll_)layoutConvolution(modal);

    if(curveEditor_){const bool show=pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::Curves;curveEditor_->setVisible(show);curveEditor_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+49,modal.w-12,160)));for(auto b:{curveChannelButton_,curveResetButton_,curveDeleteButton_})b->setVisible(show);curveChannelButton_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+DialogLayout::bodyTop,58,textControlHeight)));curveResetButton_->setBounds(toDisplay(gfx::Rect(modal.x+66,modal.y+DialogLayout::bodyTop,65,textControlHeight)));curveDeleteButton_->setBounds(toDisplay(gfx::Rect(modal.x+133,modal.y+DialogLayout::bodyTop,55,textControlHeight)));if(show){for(int i=0;i<3;++i){adjustmentInputs_[i]->setVisible(i<2);adjustmentInputs_[i]->setBounds(toDisplay(gfx::Rect(modal.x+25+i*85,modal.y+215,55,textControlHeight)));}adjustmentPreview_->setVisible(true);adjustmentPreview_->setBounds(toDisplay(gfx::Rect(modal.x+6,modal.y+241,90,textControlHeight)));adjustmentColorize_->setVisible(false);for(auto tone:adjustmentToneButtons_)tone->setVisible(false);}}

    const bool basicAdjustment=pending_==Pending::ColorAdjustment && adjustmentSpec_.kind!=ColorAdjustmentKind::Curves && adjustmentSpec_.kind!=ColorAdjustmentKind::GradientMap;

    for(auto slider:adjustmentSliders_)slider->setVisible(basicAdjustment);

    if(adjustmentPreview_ && adjustmentSpec_.kind!=ColorAdjustmentKind::Curves){

      const bool show=basicAdjustment,hsl=adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation,balance=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance;

      const int count=(hsl||balance)?3:2,top=balance?DialogLayout::bodyTop+textControlHeight+DialogLayout::group:DialogLayout::bodyTop,w=modal.w-12;

      for(int i=0;i<3;++i){const bool row=show&&i<count;adjustmentInputs_[i]->setVisible(row);adjustmentSliders_[i]->setVisible(row);

        const auto slider=adjustmentSliders_[i];const int width=std::max(adjustmentInputs_[i]->widthForValue(unicodeText(std::to_string(slider->minimum))),adjustmentInputs_[i]->widthForValue(unicodeText(std::to_string(slider->maximum))));adjustmentInputs_[i]->setFixedContentWidth(width);

        slider->setBounds(toDisplay({modal.x+6,modal.y+top+12+i*DialogLayout::fieldStep,w-width-2,textControlHeight}));

        adjustmentInputs_[i]->setBounds(toDisplay({modal.x+6+w-width,modal.y+top+12+i*DialogLayout::fieldStep,width,textControlHeight}));}

      for(int i=0;i<3;++i){auto tone=adjustmentToneButtons_[i];tone->setVisible(show&&balance);const int left=i*(w-1)/3,right=(i+1)*(w-1)/3;tone->setBounds(toDisplay({modal.x+6+left,modal.y+DialogLayout::bodyTop,right-left+1,textControlHeight}));}

      const int options=top+count*DialogLayout::fieldStep;

      adjustmentColorize_->setVisible(show&&(hsl||balance));adjustmentColorize_->setBounds(toDisplay({modal.x+6,modal.y+options,w,textControlHeight}));

      adjustmentPreview_->setVisible(show);adjustmentPreview_->setBounds(toDisplay({modal.x+6,modal.y+options+((hsl||balance)?22:0),w,textControlHeight}));

    }

    if(gmPicker_)layoutGradientMap(modal);

    if(pending_==Pending::ColorAdjustment){

      discard_->setBounds(toDisplay({modal.x2()-72,actionY,66,textControlHeight}));

      keep_->setBounds(toDisplay({modal.x2()-140,actionY,66,textControlHeight}));

    }

    {const auto colors=pending_==Pending::PaletteSave?paletteSaveColors():std::vector<Pixel>{};for(std::size_t i=0;i<paletteSavePreview_.size();++i){auto b=paletteSavePreview_[i];b->setVisible(i<colors.size()&&pending_==Pending::PaletteSave);if(i<colors.size()){b->swatch=colors[i];b->setBounds(toDisplay(gfx::Rect(modal.x+6+int(i%12)*16,modal.y+65+int(i/12)*16,16,16)));}}if(pending_==Pending::PaletteSave)discard_->setEnabled(!colors.empty());}

    layoutStoredPaletteControls(modal);

    if(extractModeButton_){const bool show=pending_==Pending::PaletteExtract;extractModeButton_->setVisible(show);extractNameInput_->setVisible(show && extractMode_==0);if(show){const char32_t* modes[]{U"新建",U"替换",U"追加"};extractModeButton_->caption=modes[extractMode_];extractModeButton_->setBounds(toDisplay(gfx::Rect(modal.x+64,modal.y+DialogLayout::bodyTop,modal.w-70,textControlHeight)));paletteInput_->setBounds(toDisplay(gfx::Rect(modal.x+64,modal.y+49,modal.w-70,textControlHeight)));extractNameInput_->setBounds(toDisplay(gfx::Rect(modal.x+64,modal.y+71,modal.w-70,textControlHeight)));}}

    layoutPreferences(modal);

  }

void Editor::layoutTopMenu(gfx::Rect bar) {
    if(workspaceMenuButton_){const int size=UiSpacing::iconSize*uiScale;workspaceMenuButton_->setBounds({bar.x2()-size,bar.y+(bar.h-size)/2,size,size});workspaceMenuButton_->setVisible(!advancedActive());workspaceMenuButton_->setEnabled(pending_==Pending::None&&!document.active()&&!workspacePresetDialogOpen_);bar.w-=(UiSpacing::iconSize+UiSpacing::related)*uiScale;}

    if(!menuBar_)return;auto menu=menuBar_->getMenu();

    std::vector<PixelMenuItem*> entries;

    for(auto child:menu->children())if(auto entry=dynamic_cast<PixelMenuItem*>(child)){entry->barInsetReduction=0;entries.push_back(entry);}

    // Aseprite Menu wraps overflowing labels. Our fixed-height menu bar must

    // fit its labels before layout, otherwise their painted/hit regions escape.

    auto required=[&]{int width=menu->border().width()+menuBar_->border().width();for(auto entry:entries)width+=entry->sizeHint().w;return width+std::max(0,int(entries.size())-1)*menu->childSpacing();};

    for(int reduction=1;required()>bar.w && reduction<=32;++reduction)for(auto entry:entries)entry->barInsetReduction=reduction;

    menuBar_->setBounds(bar);

    // Center the actual menu rows, rather than only their taller container.

    for(auto entry:entries){auto r=entry->bounds();r.y=bar.y+(bar.h-r.h)/2;entry->setBounds(r);}

  }

void Editor::paintScrollbarCorner(ui::Graphics& g,gfx::Rect physicalViewport) {

    const auto r=uiLogical(physicalViewport.offset(-bounds().origin()));

    // Reuse sheet track black and panel fill; both paired bars share this cap.

    skin_.draw(g,"scrollbar.horizontal.track",gfx::Rect(r.x2(),r.y2(),7,7));

    skin_.draw(g,"timeline.row",gfx::Rect(r.x2(),r.y2()+1,6,5));

  }

void Editor::paintPanelBackdrops(ui::Graphics& g,bool includeFloating) {

    UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);const auto pl=columnLayout(rc,0),cl=columnLayout(rc,1),ll=columnLayout(rc,2);
    if(advancedActive()){g.fillRect(skin_["background"],rc);if(advancedMode_==1)g.fillRect(skin_["panel"],gfx::Rect(0,0,rc.w,Layout::optionsHeight+Layout::gap));return;}

    auto label=[&](const std::u32string& s,int x,int y,bool muted=false){font_.draw(g,s,x,y,skin_[muted?"muted":"text"]);};

    g.fillRect(skin_["background"],rc);

    paintWorkLayer(g,rc);

    const int colorPanelTop=pl.tabY;

    const gfx::Rect colorPanel=docking_.custom?columnFrame(0):gfx::Rect(pl.rightX,colorPanelTop,pl.right,pl.paletteBottom(colorPickerOpen_)-colorPanelTop);

    auto colorContent=uiLogical(paletteContentBounds().offset(-bounds().origin()));

    auto panel=[&](const gfx::Rect& box,const char* slot,const char* fill) {

      g.fillRect(skin_[fill],box);

      if(!skin_.draw(g,slot,box)) g.drawRect(skin_["border"],box);

    };

    g.saveClip();clipColumn(g,-1,true);panel(l.workspacePanel(),"panel_outer","panel");panel(l.workspaceContent(),"panel_content","background");

    if(canvasHorizontal_ && canvasHorizontal_->isVisible() && canvasVertical_->isVisible())paintScrollbarCorner(g,canvasViewport());

    g.restoreClip();

    if(columnShown(0) && (includeFloating || !columnFloating(0))){g.saveClip();clipColumn(g,0,true);if(columnFloating(0))FloatingColumnChrome::paint(skin_,g,colorPanel);else panel(colorPanel,"panel_outer","panel");g.restoreClip();}

    if(columnShown(0) && (includeFloating || !columnFloating(0))){g.saveClip();clipColumn(g,0,true);panel(colorContent,"panel_content","background");g.restoreClip();}

    for(int id=1;id<panels::columnCount;++id)if(panels::isPicker(id)&&columnShown(id)&&(includeFloating||!columnFloating(id))){const auto pickerLayout=columnLayout(rc,id);g.saveClip();clipColumn(g,id,true);if(columnFloating(id))FloatingColumnChrome::paint(skin_,g,columnFrame(id));else panel(docking_.custom?columnFrame(id):pickerLayout.pickerPanel(),"panel_outer","panel");panel(pickerLayout.pickerGradient(runtimePreferences_.flag("colorLayers.recentColorsVisible")&&!recentColors_.values().empty()),"panel_content","background");g.restoreClip();}

    if(columnShown(8)&&documentOpen_&&(includeFloating||!columnFloating(8))){g.saveClip();clipColumn(g,8,true);if(columnFloating(8))FloatingColumnChrome::paint(skin_,g,columnFrame(8));else panel(columnFrame(8),"panel_outer","panel");panel(columnChrome(8).content,"panel_content","background");g.restoreClip();}
    if(columnShown(2) && documentOpen_ && (includeFloating || !columnFloating(2))){

      paintTimelineBackground(g,ll);

    }

}

void Editor::paintChrome(ui::Graphics& g,bool includeFloating) {
  ++chromePaints_;paintPanelBackdrops(g,includeFloating);
  if(advancedActive() || includeFloating)return;
  UiPaintScale scale(g);
  paintDocumentTab(g);paintStatusText(g);
}

void Editor::paintStatusText(ui::Graphics& g) {
    if(advancedActive())return;

    // Called with the same logical 2x transform as paintChrome.

    const auto rc=uiLogical(clientBounds());

    auto label=[&](const std::u32string& s,int x,int y,bool muted=false){font_.draw(g,s,x,y,skin_[muted?"muted":"text"]);};

    auto percent=std::to_string(zoom_*100);

    while(percent.back()=='0') percent.pop_back();if(percent.back()=='.') percent.pop_back();

    const std::u32string zoomText=std::u32string(percent.begin(),percent.end())+U"%  滚轮缩放 / F 适应";

    const auto statusInk=font_.inkBounds(status_),zoomInk=font_.inkBounds(zoomText);

    // Status starts immediately after the workspace's final frame pixel.

    // No extra external gap: its 2px top/bottom padding is the visible separation.

    const int statusInkY=rc.h-Layout::statusHeight+uiGap;

    const int zoomInkX=std::max(uiGap,rc.w-uiGap-zoomInk.w);

    g.saveClip();

    g.clipRect(gfx::Rect(uiGap,statusInkY,std::max(0,zoomInkX-2*uiGap),Layout::labelInkHeight));

    label(status_,uiGap-statusInk.x,statusInkY-statusInk.y,true);

    g.restoreClip();

    g.saveClip();

    g.clipRect(gfx::Rect(zoomInkX,statusInkY,std::max(0,rc.w-uiGap-zoomInkX),Layout::labelInkHeight));

    label(zoomText,zoomInkX-zoomInk.x,statusInkY-zoomInk.y,true);

    g.restoreClip();

  }

void Editor::paintDialog(ui::Graphics& g) {

    UiPaintScale scale(g);const auto rc=uiLogical(clientBounds());

    auto label=[&](const std::u32string& text,int x,int y,bool muted=false) {const auto modal=modalBounds(rc);if(x==modal.x+6 && y==modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2){FloatingColumnChrome::drawTitle(skin_,font_,g,modal,text);return;}font_.draw(g,text,x,y,skin_[muted?"muted":"text"]);};

    if(pending_!=Pending::None) {

      const auto modal=modalBounds(rc);

      skin_.drawDialogBackground(g,modal);

      if(pending_==Pending::Saving){label(U"正在保存工程…",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"保存完成后继续",modal.x+6,modal.y+DialogLayout::bodyTop);return;}

      if(pending_==Pending::ReplaceColor){label(U"替换颜色",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"源 HEX",modal.x+6,modal.y+32);label(U"目标 HEX",modal.x+6,modal.y+54);return;}

      if(pending_==Pending::Preferences){

        label(U"首选项",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"灰色项尚未接入",modal.x+98,modal.y+6,true);

        const auto body=preferenceBodyBounds(modal);g.fillRect(skin_["background"],body);skin_.draw(g,"panel_outer",body);

        paintPreferenceCatalog(g,modal);

        if(!preferenceFeedback_.empty()){

          const auto feedback=preferenceFeedbackBounds(modal);auto text=preferenceFeedback_;

          while(!text.empty() && font_.measure(text)>feedback.w)text.pop_back();

          if(text.size()<preferenceFeedback_.size()){while(!text.empty() && font_.measure(text+U"…")>feedback.w)text.pop_back();text+=U"…";}

          g.saveClip();g.clipRect(feedback);label(text,feedback.x,feedback.y);g.restoreClip();

        }return;

      }

      if(pending_==Pending::SheetImport){label(U"导入精灵表 · RGBA",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);const char32_t* names[]{U"X",U"Y",U"宽",U"高",U"间距X",U"间距Y",U"列数",U"行数"};for(int i=0;i<8;++i)label(names[i],modal.x+6+(i%2)*(modal.w/2),modal.y+58+(i/2)*DialogLayout::rowStep);label(U"单帧 1–1024 px；独立 Cel / 可撤销",modal.x+6,modal.y+171);return;}

      if(pending_==Pending::GifExport){

        label(U"导出设置",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);

        const int right=modal.x+6+(modal.w-18)/2+6;

        label(U"导出文件",modal.x+6,modal.y+DialogLayout::label());label(U"格式",modal.x+6,modal.y+DialogLayout::label(1));label(U"导出区域",right,modal.y+DialogLayout::label(1));

        label(U"帧范围",modal.x+6,modal.y+DialogLayout::label(2));

        if(gifExplicitRange_){label(U"开始帧",modal.x+6,modal.y+DialogLayout::label(3));label(U"结束帧",right,modal.y+DialogLayout::label(3));}

        label(U"播放方向",modal.x+6,modal.y+DialogLayout::label(3)+(gifExplicitRange_?38:0));

        label(framePngMode_&&frameSvg_?U"比例":U"比例（百分比）",modal.x+6,modal.y+exportScaleY());

        label(U"修剪",modal.x+6,modal.y+exportScaleY()+38);

        label(U"导出预设",modal.x+6,modal.y+exportScaleY()+76);if(!exportPresetFeedback_.empty())label(exportPresetFeedback_,modal.x+6,modal.y+exportScaleY()+132,true);

        if(framePngMode_&&framePngBusy())label(U"处理中："+unicodeText(std::to_string(framePngJob_->written.load()))+U" / "+unicodeText(std::to_string(framePngJob_->total)),modal.x+6,modal.y+exportScaleY()+146);return;

      }

      if(pending_==Pending::SpriteSheet){label(U"精灵表 · PNG文件输出子集",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"原尺寸单元格 / 透明背景",modal.x+6,modal.y+174);return;}

      if(pending_==Pending::StaticExport){

        label(U"导出设置",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);

        label(U"导出文件",modal.x+6,modal.y+DialogLayout::label());label(U"格式",modal.x+6,modal.y+DialogLayout::label(1));label(U"导出区域",modal.x+6+(modal.w-18)/2+6,modal.y+DialogLayout::label(1));

        label(staticSvg_?U"比例":U"比例（百分比）",modal.x+6,modal.y+exportScaleY());

        label(U"修剪",modal.x+6,modal.y+exportScaleY()+38);

        label(U"导出预设",modal.x+6,modal.y+exportScaleY()+76);if(!exportPresetFeedback_.empty())label(exportPresetFeedback_,modal.x+6,modal.y+exportScaleY()+132,true);return;

      }

      if(pending_==Pending::ImageResize){label(U"调整图像尺寸",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"宽度",modal.x+6,modal.y+32);label(U"高度",modal.x+6,modal.y+54);label(U"当前原生可编辑范围 1–1024 px",modal.x+6,modal.y+101);return;}

      if(pending_==Pending::AntiAlias){label(U"自动抗锯齿",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);if(aaAuto_&&aaSpec_.colorSource==0)label(U"不透明度",modal.x+6,modal.y+76);if(aaWorker_.valid()||aaScheduled_)label(U"处理中…",modal.x+6,modal.y+(aaAuto_?125:221));return;}

      if(pending_==Pending::Convolution){label(U"卷积矩阵",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);if(convolutionWorker_.valid() || convolutionScheduled_)label(U"处理中…",modal.x2()-96,modal.y+124);return;}

      if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap){label(U"渐变映射",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);if(!gmError_.empty())label(gmError_,modal.x+6,modal.y2()-45);else if(gmWorker_.valid()||gmScheduled_)label(U"处理中…",modal.x+6,modal.y2()-45);return;}

      if(pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::Curves){label(U"曲线",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"X",modal.x+6,modal.y+220);label(U"Y",modal.x+91,modal.y+220);return;}

      if(pending_==Pending::ColorAdjustment){const bool hsl=adjustmentSpec_.kind==ColorAdjustmentKind::HueSaturation;const bool balance=adjustmentSpec_.kind==ColorAdjustmentKind::ColorBalance;label(balance?U"色彩平衡":hsl?U"色相/饱和度":U"亮度/对比度",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);const char32_t* names[]{balance?U"青色 / 红色":hsl?U"色相":U"亮度",balance?U"洋红 / 绿色":hsl?U"饱和度":U"对比度",balance?U"黄色 / 蓝色":U"明度"};for(int i=0;i<((hsl || balance)?3:2);++i)label(names[i],modal.x+6,modal.y+(balance?DialogLayout::bodyTop+textControlHeight+DialogLayout::group:DialogLayout::bodyTop)+i*DialogLayout::fieldStep);return;}

      if(pending_==Pending::PaletteLibrary){label(U"本地色板",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);if(storedPalettes_.empty())label(U"色板库为空",modal.x+6,modal.y+28);return;}

      if(pending_==Pending::PaletteSave){label(U"保存色板",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"名称",modal.x+6,modal.y+27);label(U"颜色："+unicodeText(std::to_string(paletteSaveColors().size())),modal.x+6,modal.y+103);g.saveClip();g.clipRect(gfx::Rect(modal.x+6,modal.y+115,modal.w-12,12));label(paletteLibraryDirectory().u32string(),modal.x+6,modal.y+115,true);g.restoreClip();return;}

      if(pending_==Pending::PaletteExtract){label(U"提取颜色",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"方式",modal.x+6,modal.y+32);label(U"数量",modal.x+6,modal.y+54);if(extractMode_==0)label(U"名称",modal.x+6,modal.y+76);return;}

      if(pending_==Pending::LoopSection){label(U"循环节属性",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);const char32_t* labels[]{U"名称",U"开始帧",U"结束帧",U"",U"方向"};for(int i=0;i<5;++i)if(i!=3)label(labels[i],modal.x+6,modal.y+32+i*DialogLayout::rowStep);const auto range=loopDisplayRange();const int count=int(document.timeline().state().frames.size());label(U"范围："+unicodeText(std::to_string(range.second-range.first+1))+U" / "+unicodeText(std::to_string(count))+U" 帧",modal.x+6,modal.y+141);const auto bar=gfx::Rect(modal.x+6,modal.y+153,modal.w-12,5);g.fillRect(skin_["panel"],bar);g.fillRect(skin_["accent"],gfx::Rect(bar.x+(range.first-1)*bar.w/count,bar.y,std::max(1,(range.second-range.first+1)*bar.w/count),bar.h));g.saveClip();g.clipRect(gfx::Rect(modal.x+6,modal.y+160,modal.w-12,26));label(loopDisplayName(),modal.x+6,modal.y+160);const char32_t* directions[]{U"正向",U"反向",U"正向往返",U"反向往返"};int direction=0;for(int i=0;i<4;++i)if(loopDraft_->direction==std::array<const char*,4>{"forward","reverse","ping-pong","ping-pong-reverse"}[i])direction=i;label(unicodeText(std::to_string(range.first))+U"–"+unicodeText(std::to_string(range.second))+U" · "+directions[direction]+U" · "+(loopFinite_?unicodeText(std::to_string(int(std::trunc(static_cast<LoopNumberEntry*>(loopInputs_[3])->value)))):U"无限"),modal.x+6,modal.y+172);g.restoreClip();return;}

      if(pending_==Pending::OnionValue){label(U"洋葱皮设置",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(onionField_<2?U"0–8 帧":onionField_<4?U"0–100%":U"HEX：6 或 8 位",modal.x+6,modal.y+DialogLayout::bodyTop);return;}

      if(pending_==Pending::FrameDuration){label(U"帧时长",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"1–60000 ms，修改预览，关闭保存",modal.x+6,modal.y+DialogLayout::bodyTop);return;}

      if(pending_==Pending::LayerOpacity){label(U"图层属性",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"名称",modal.x+6,modal.y+DialogLayout::bodyTop);label(U"不透明度",modal.x+6,modal.y+65);label(U"混合模式",modal.x+6,modal.y+103);label(U"显示颜色",modal.x+6,modal.y+141);label(U"说明",modal.x+6,modal.y+201);return;}

      if(pending_==Pending::BrushFolderName){label(fillFolderRename_?U"重命名文件夹":U"新建文件夹",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);label(U"文件夹名称，确定后应用",modal.x+6,modal.y+DialogLayout::bodyTop);return;}

      if(pending_==Pending::PaletteName || pending_==Pending::ColorRole) {

        label(pending_==Pending::PaletteName?U"颜色名称":editingSecondary_?U"背景色":U"前景色",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);

        label(pending_==Pending::PaletteName?U"编辑名称，确定后应用":U"HEX：6 或 8 位；回车 / 关闭提交",modal.x+6,modal.y+DialogLayout::bodyTop);

        return;

      }

      if(pending_==Pending::OpenError) {

        label(errorTitle_,modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);

        label(U"当前内容保持不变",modal.x+6,modal.y+18,true);

        const auto lines=modalErrorLines(modal.w-20);const int visible=modalErrorVisibleLines(modal);

        const int first=errorScrollPixels_/(12*uiScale),remainder=errorScrollPixels_%(12*uiScale);

        g.saveClip();g.clipRect(gfx::Rect(modal.x+6,modal.y+32,modal.w-20,visible*12));

        // Graphics is already at UI scale here; preserve sub-row scrolling.

        g.save();g.concat(gfx::Matrix::MakeAll(1,0,0,0,1,-double(remainder)/uiScale,0,0,1));

        for(int i=0;i<=visible && first+i<int(lines.size());++i)label(lines[first+i],modal.x+6,modal.y+32+i*12);

        g.restore();g.restoreClip();

        return;

      }

      label(U"未保存的绘画",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);

      label(U"是否保存当前工程的修改？",modal.x+6,modal.y+DialogLayout::bodyTop);

      label(U"保存成功后继续；取消保留当前内容",modal.x+6,modal.y+DialogLayout::field(),true);

    }

  }


bool Editor::processModalInput(ui::Message* msg){
    if(modalNumberScrub_ && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseUpMessage)){

      const auto mouse=static_cast<ui::MouseMessage*>(msg);

      if(msg->type()==ui::kMouseMoveMessage){const int dx=mouse->position().x-numberScrubLastX_;numberScrubLastX_=mouse->position().x;modalNumberScrub_->adjustNumber(dx*(mouse->shiftPressed()?10:1));}

      else{modalNumberScrub_=nullptr;if(hasCapture())releaseMouse();}return true;

    }

    if(pending_!=Pending::None && msg->type()==ui::kMouseDownMessage){

      const auto mouse=static_cast<ui::MouseMessage*>(msg);

      if(mouse->left())for(auto child:children())if(auto entry=dynamic_cast<PixelEntry*>(child)){

        if(!entry->numeric || !entry->isVisible() || !entry->isEnabled())continue;

        const auto rect=entry->bounds();const auto at=mouse->position();

        if(at.x<rect.x && at.x>=rect.x-60*uiScale && at.y>=rect.y && at.y<rect.y2()){

          modalNumberScrub_=entry;numberScrubLastX_=at.x;captureMouse();return true;

        }

      }

    }

    if(msg->type()==ui::kMouseWheelMessage && processPreferencesWheel(*static_cast<ui::MouseMessage*>(msg)))return true;

    if(pending_==Pending::OpenError && msg->type()==ui::kMouseWheelMessage) {

      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto modal=modalBounds(uiLogical(bounds()));

      if(uiPhysical(modal).contains(mouse->position())) {

        const int maximum=std::max(0,int(modalErrorLines(modal.w-20).size())-modalErrorVisibleLines(modal));

        // View::scrollByMessage uses three text rows per ordinary wheel step.

        errorScrollPixels_=std::clamp(errorScrollPixels_+mouse->wheelDelta().y*36*uiScale,0,maximum*12*uiScale);layoutModal();

        invalidateRect(uiPhysical(modal));return true;

      }

    }

    return false;
}
void Editor::layoutGradientMap(const gfx::Rect& modal){bool show=pending_==Pending::ColorAdjustment&&adjustmentSpec_.kind==ColorAdjustmentKind::GradientMap;auto place=[&](ui::Widget* w,gfx::Rect r){w->setVisible(show);w->setEnabled(!gmCommit_);w->setBounds(toDisplay(r));};int x=modal.x+6,y=modal.y+DialogLayout::bodyTop,w=modal.w-12;place(gmPreset_,{x,y,w-80,textControlHeight});place(gmDelete_,{x+w-78,y,78,textControlHeight});y+=26;place(gmTrack_,{x,y,w,22});y+=28;place(gmPosition_,{x,y,64,textControlHeight});place(gmColor_,{x+66,y,w-140,textControlHeight});place(gmAdd_,{x+w-72,y,54,textControlHeight});place(gmRemove_,{x+w-16,y,16,textControlHeight});y+=26;place(gmPicker_,{x,y,w,85});y+=91;place(gmMode_,{x,y,58,textControlHeight});place(gmReverse_,{x+60,y,58,textControlHeight});place(gmPalette_,{x+120,y,72,textControlHeight});y+=26;place(gmRestore_,{x,y,90,textControlHeight});place(gmFlipStops_,{x+92,y,90,textControlHeight});y+=26;place(gmDither_,{x,y,w,textControlHeight});y+=26;place(gmName_,{x,y,w-82,textControlHeight});place(gmSave_,{x+w-80,y,80,textControlHeight});gmMode_->caption=adjustmentSpec_.gradientMap.steps?U"阶梯":U"连续";gmReverse_->active=adjustmentSpec_.gradientMap.reverse;gmMode_->active=adjustmentSpec_.gradientMap.steps;gmRemove_->setEnabled(!gmCommit_&&adjustmentSpec_.gradientMap.stops.size()>2);gmAdd_->setEnabled(!gmCommit_&&adjustmentSpec_.gradientMap.stops.size()<256);gmSave_->setEnabled(!gmCommit_&&gmReadable_&&GradientMapPresetStore::validName(gmName_->text()));gmDelete_->setEnabled(!gmCommit_&&gmReadable_&&gmPreset_->selectedIndex()>=0);gmPalette_->setEnabled(std::any_of(document.palette().entries.begin(),document.palette().entries.end(),[](auto e){return e.color>>24;}));if(show){for(auto e:adjustmentInputs_)e->setVisible(false);adjustmentColorize_->setVisible(false);for(auto tone:adjustmentToneButtons_)tone->setVisible(false);adjustmentPreview_->setVisible(true);adjustmentPreview_->setBounds(toDisplay(gfx::Rect(x,modal.y+302,w,textControlHeight)));}}

void Editor::showColorOverlay(bool verify,bool gradient,bool stroke,bool shadow,bool innerGlow,int mapCheck,const std::string& source){if(pending_!=Pending::None||document.active()||document.layerStyleTargets().empty())return;playing_=false;if(!document.beginLayerStyle())return;try{ColorOverlayDialog popup(font_,skin_,toolIcons_,assets_/"color-picker",document,[this]{refresh();},[](Pixel p){return paletteHex(p);},[](const std::string& text,Pixel& p){return parsePaletteHex(text,p);},[this]{return gradientMapStore();},source);popup.setDisplay(display(),false);auto minimum=popup.minimumDialogSize(0);popup.setBounds({bounds().center().x-minimum.w/2,bounds().center().y-minimum.h/2,minimum.w,minimum.h});ui::Timer timer(100,&popup);if(verify){timer.Tick.connect([&]{timer.stop();if(mapCheck)popup.smokeMap(mapCheck==1);else if(innerGlow)popup.smokeInnerGlow(true);else if(shadow)popup.smokeShadow(true);else if(stroke)popup.smokeStroke(true);else if(gradient)popup.smokeGradient(true);else popup.smokeEdit(true);});timer.start();}popup.openWindowInForeground();timer.stop();}catch(...){document.cancelLayerStyle();throw;}requestFocus();refresh();}
void Editor::smokeColorOverlay(){smoke_=true;documentOpen_=true;homeOpen_=false;document=Document(1,1);document.beginStroke({0,0},0x800000ff);document.commitStroke();refresh();if(!menuCommands_.connected("openLayerStyles")||!menuCommands_.enabled("openLayerStyles"))throw std::runtime_error("Layer style menu unavailable");showColorOverlay(true);if(!document.layer().layerStyles||!document.layer().layerStyles->overlayEnabled||document.active())throw std::runtime_error("Layer style dialog commit");auto style=document.layer().layerStyles;menuCommands_.invoke("toggleLayerStyles");if(document.layer().layerStyles->enabled)throw std::runtime_error("Style toggle");document.undo();menuCommands_.invoke("copyLayerStyles");menuCommands_.invoke("clearLayerStyles");if(document.layer().layerStyles)throw std::runtime_error("Style clear");menuCommands_.invoke("pasteLayerStyles");if(timeline::styleSignature(document.layer().layerStyles)!=timeline::styleSignature(style))throw std::runtime_error("Style paste");showColorOverlay(true,true);if(!document.layer().layerStyles->gradientEnabled||document.layer().layerStyles->gradientAngle!=90)throw std::runtime_error("Gradient overlay actual controls commit");showColorOverlay(true,false,true);if(!document.layer().layerStyles->stroke.enabled||document.layer().layerStyles->stroke.size!=2||!document.layer().layerStyles->stroke.smartHue||!document.layer().layerStyles->stroke.followOpacity)throw std::runtime_error("Stroke actual dialog controls commit");showColorOverlay(true,false,false,true);if(!document.layer().layerStyles->shadow.enabled||document.layer().layerStyles->shadow.offsetX!=-2||document.layer().layerStyles->shadow.offsetY!=3||document.layer().layerStyles->shadow.blur!=2||!document.layer().layerStyles->shadow.smart||document.layer().layerStyles->shadow.darkness!=37)throw std::runtime_error("Shadow actual dialog controls commit");showColorOverlay(true,false,false,false,true);if(!document.layer().layerStyles->innerGlow.enabled||document.layer().layerStyles->innerGlow.size!=3||document.layer().layerStyles->innerGlow.color!=0x80eeccee)throw std::runtime_error("Inner glow actual dialog controls commit");style=document.layer().layerStyles;menuCommands_.invoke("copyLayerStyles");menuCommands_.invoke("clearLayerStyles");menuCommands_.invoke("pasteLayerStyles");if(timeline::styleSignature(document.layer().layerStyles)!=timeline::styleSignature(style))throw std::runtime_error("Inner glow actual menu copy paste");style=document.layer().layerStyles;const auto beforeMapHistory=document.historySize();showColorOverlay(true,false,false,false,false,2);if(timeline::styleSignature(document.layer().layerStyles)!=timeline::styleSignature(style)||document.historySize()!=beforeMapHistory)throw std::runtime_error("Gradient map actual cancel");showColorOverlay(true,false,false,false,false,1);const auto& mapped=*document.layer().layerStyles;if(!mapped.gradientMapEnabled||mapped.gradientMap.stops.size()!=3||mapped.gradientMap.stops[1].position!=.37||mapped.gradientMap.stops[1].color!=0xffef3412||!mapped.gradientMap.steps||!mapped.gradientMap.reverse||mapped.gradientMap.dither!=3||document.historySize()!=beforeMapHistory+1)throw std::runtime_error("Gradient map actual controls commit");style=document.layer().layerStyles;menuCommands_.invoke("copyLayerStyles");menuCommands_.invoke("clearLayerStyles");menuCommands_.invoke("pasteLayerStyles");if(timeline::styleSignature(document.layer().layerStyles)!=timeline::styleSignature(style))throw std::runtime_error("Gradient map actual copy paste");const auto sourceId=document.layer().id;const auto beforeSplit=document.historyPosition();const auto raw=document.pixels();if(!menuCommands_.enabled("splitLayerStyles")||!menuCommands_.invoke("splitLayerStyles")||document.layer().layerStyles||document.historyPosition()!=beforeSplit+1||document.timeline().state().groups.size()!=1||document.pixels()!=raw)throw std::runtime_error("Style split actual main menu");document.undo();if(!document.layer().layerStyles||document.layer().id!=sourceId)throw std::runtime_error("Style split actual undo");{prepareLayerContext(document.layer().id);PixelMenu context(skin_);buildLayerContextMenu(&context,1);PixelMenuItem* split=nullptr;for(auto child:context.children())if(auto branch=dynamic_cast<PixelMenuItem*>(child);branch&&branch->getSubmenu()&&branch->icon=="layerStyle"){for(auto child:branch->getSubmenu()->children())if(auto item=dynamic_cast<PixelMenuItem*>(child);item&&item->icon=="layerStyle")split=item;}if(!split||!split->isEnabled())throw std::runtime_error("Style split actual context menu available");split->Click();if(document.layer().layerStyles||document.historyPosition()!=beforeSplit+1)throw std::runtime_error("Style split actual context menu executes");}document.undo();const auto bakeComposite=[&]{return compositeNormalRegion(document.timeline(),document.frame().id,{0,0,document.width(),document.height()});};const auto bakePixels=bakeComposite();const auto bakeHistory=document.historyPosition();if(!menuCommands_.enabled("convertLayerToRaster")||!menuCommands_.invoke("convertLayerToRaster")||document.layer().layerStyles||document.historyPosition()!=bakeHistory+1||bakeComposite()!=bakePixels)throw std::runtime_error("Styled rasterize actual main menu");document.undo();{prepareLayerContext(document.layer().id);PixelMenu context(skin_);buildLayerContextMenu(&context,1);PixelMenuItem* raster=nullptr;for(auto child:context.children())if(auto branch=dynamic_cast<PixelMenuItem*>(child);branch&&branch->getSubmenu()&&branch->icon=="convertTo"){auto& children=branch->getSubmenu()->children();if(children.size()>2)raster=dynamic_cast<PixelMenuItem*>(children[2]);}if(!raster||!raster->isEnabled())throw std::runtime_error("Styled rasterize actual context available");raster->Click();if(document.layer().layerStyles||document.historyPosition()!=bakeHistory+1||bakeComposite()!=bakePixels)throw std::runtime_error("Styled rasterize actual context executes");}document.undo();}

}
