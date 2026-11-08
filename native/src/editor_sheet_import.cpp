#include "editor_implementation.h"
#include "editor.h"
#include "sheet_import_preview.h"
#include "sheet_import_task.h"
namespace moon::editor {
SheetImportOptions Editor::effectiveSheetImportOptions()const{auto options=importSheetOptions_;if(!importSheetPaddingEnabled_)options.paddingX=options.paddingY=0;return options;}

void Editor::updateSheetImportFields(){if(importSheetUpdating_||importSheetTask_)return;if(status_.rfind(U"精灵表导入失败：",0)==0){status_.clear();invalidate();}importSheetUpdating_=true;int counts[2]{};bool hasFrames=false;try{const auto* selection=sheetImportSelection(document,importSheetOptions_);int sw=selection?selection->width:document.width(),sh=selection?selection->height:document.height();auto plan=planSpriteSheetImport(sw,sh,effectiveSheetImportOptions());counts[0]=plan.columns;counts[1]=plan.rows;hasFrames=!plan.tiles.empty();}catch(...){}discard_->setEnabled(hasFrames);for(int i=0;i<8;++i)if(!importSheetInputs_[i]->hasFocus()){int values[]{importSheetOptions_.x,importSheetOptions_.y,importSheetOptions_.width,importSheetOptions_.height,importSheetOptions_.paddingX,importSheetOptions_.paddingY,counts[0],counts[1]};importSheetInputs_[i]->setText(std::to_string(values[i]));}importSheetUpdating_=false;if(importSheetPreview_)importSheetPreview_->update(effectiveSheetImportOptions());if(pending_==Pending::SheetImport){auto r=dialogDisplayBounds();invalidateRect({r.x+6*uiScale,r.y2()-26*uiScale,160*uiScale,20*uiScale});}}

void Editor::openSheetImport(bool selected){if(pending_!=Pending::None||document.active())return;if(selected&&!document.selection())return;ensureProjects();auto& slot=*projects_[activeProject_];if(slot.sheetImportIdentity!=document.identity()){slot.sheetImportRemembered.reset();slot.sheetImportIdentity=document.identity();}try{importSheetOptions_=selected?initialSheetImportOptions(document.customGrid(),slot.sheetImportRemembered,document.selection()):initialSheetImportOptions(document.customGrid(),slot.sheetImportRemembered);}catch(const std::exception& error){status_=U"精灵表导入失败："+unicodeText(error.what());refresh();return;}importSheetPaddingEnabled_=importSheetOptions_.paddingX!=0||importSheetOptions_.paddingY!=0;pending_=Pending::SheetImport;importSheetPreview_->checkerboard=checkerboard_;importSheetPreview_->open([this]() -> const Document& {return document;},effectiveSheetImportOptions());menuBar_->setEnabled(false);discard_->caption=U"导入";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);updateSheetImportFields();refresh();}

void Editor::chooseSheetSource(){
 if(importSheetTask_)return;
 const bool replacing=pending_==Pending::SheetImport;
 if(replacing&&importSheetOptions_.selection)return;
 const auto oldIdentity=document.identity();const auto draft=importSheetOptions_;const bool padding=importSheetPaddingEnabled_;const auto previousStatus=status_;const auto previousView=importSheetPreview_->view();
 wchar_t filename[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrTitle=L"选择精灵表来源";
 dialog.lpstrFilter=L"当前支持的文件\0*.moonsprite;*.moonsprite.bak;*.ase;*.aseprite;*.psd;*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif\0所有文件\0*.*\0\0";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_FILEMUSTEXIST;
 if(!chooseSheetFile_(&dialog)){if(CommDlgExtendedError()){status_=U"精灵表导入失败：无法打开文件选择器";invalidate();}return;}
 if(replacing){importSheetPreview_->close();pending_=Pending::None;refresh();}
 importAfterOpen_=false;openPath(filename);
 if(pending_==Pending::OpenError){if(!replacing)return;const auto error=openError_;resolve(false);if(replacing){openSheetImport(false);importSheetOptions_=draft;importSheetPaddingEnabled_=padding;updateSheetImportFields();importSheetPreview_->restoreView(previousView);status_=U"精灵表导入失败："+error;refresh();}return;}
 if(document.identity()!=oldIdentity){openSheetImport(false);return;}
 if(replacing){openSheetImport(false);importSheetOptions_=draft;importSheetPaddingEnabled_=padding;updateSheetImportFields();importSheetPreview_->restoreView(previousView);status_=previousStatus;refresh();}else openSheetImport(false);
}

void Editor::createSheetImportControls(){importSheetTimer_.Tick.connect([this]{tickSheetImport();});importSheetPreview_=new SheetImportPreview(skin_,font_);addChild(importSheetPreview_);importSheetPreview_->changed=[this](const SheetImportOptions& next){if(pending_!=Pending::SheetImport||importSheetTask_)return;importSheetOptions_=next;updateSheetImportFields();};importSheetChoose_=button(U"选择来源",[this]{chooseSheetSource();});importSheetChoose_->setVisible(false);importSheetFit_=button(U"适合窗口",[this]{if(!importSheetTask_)importSheetPreview_->fit();});importSheetFit_->setVisible(false);importSheetPreview_->viewChanged=[this]{const auto p=importSheetPreview_->bounds(),b=importSheetFit_->bounds();invalidateRect({p.x,b.y,std::max(1,b.x-p.x),b.h});};for(int i=0;i<8;++i){auto input=new PixelEntry(font_,skin_);input->numeric=true;addChild(input);input->setVisible(false);importSheetInputs_[i]=input;auto change=[this,input,i]{if(importSheetUpdating_||pending_!=Pending::SheetImport||importSheetTask_)return;try{std::size_t used=0;double v=std::stod(input->text(),&used);if(used!=input->text().size()||!std::isfinite(v))return;int n=int(std::floor(std::clamp(v,i<2?-262144.0:i<6?0.0:1.0,262144.0)+.5));auto& o=importSheetOptions_;if(i<6){int* fields[]{&o.x,&o.y,&o.width,&o.height,&o.paddingX,&o.paddingY};*fields[i]=i==2||i==3?std::max(1,n):n;}else{bool horizontal=i==6;const auto* selection=sheetImportSelection(document,o);int extent=selection?(horizontal?selection->width:selection->height):(horizontal?document.width():document.height());int origin=horizontal?o.x:o.y,gap=importSheetPaddingEnabled_?(horizontal?o.paddingX:o.paddingY):0,count=std::clamp(n,1,10000);(horizontal?o.width:o.height)=sheetImportFrameSizeFromCount(extent,origin,gap,count);}updateSheetImportFields();}catch(...){} };input->Change.connect(change);input->blur=change;input->accept=[this]{if(pending_==Pending::SheetImport&&discard_->isEnabled())resolve(true);};input->cancel=[this]{resolve(false);};}importSheetLayout_=button(U"排列",[this]{if(importSheetTask_)return;PixelMenu menu(skin_);const char32_t* names[]{U"横向",U"纵向",U"按行",U"按列"};for(int i=0;i<4;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->Click.connect([this,i]{if(importSheetTask_)return;importSheetOptions_.layout=i;updateSheetImportFields();refresh();});menu.addChild(item);}auto at=importSheetLayout_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});importSheetPadding_=button(U"间距",[this]{if(importSheetTask_)return;importSheetPaddingEnabled_=!importSheetPaddingEnabled_;updateSheetImportFields();refresh();});importSheetPadding_->iconSkin=&toolIcons_;importSheetPadding_->bareIconWithCaption=true;importSheetPadding_->setVisible(false);importSheetPartial_=button(U"包含不完整单元格",[this]{if(importSheetTask_)return;importSheetOptions_.partialTiles=!importSheetOptions_.partialTiles;updateSheetImportFields();refresh();});importSheetPartial_->iconSkin=&toolIcons_;importSheetPartial_->bareIconWithCaption=true;importSheetLayout_->setVisible(false);importSheetPartial_->setVisible(false);}


void Editor::layoutSheetImport(gfx::Rect modal){
 const bool show=pending_==Pending::SheetImport;const int side=222,x=modal.x+6,y=modal.y+DialogLayout::bodyTop;
 importSheetChoose_->setVisible(show&&!importSheetOptions_.selection);importSheetChoose_->setBounds(toDisplay({x,y,side,20}));
 const int settingsY=y+(!importSheetOptions_.selection?38:16);
 const char32_t* layouts[]{U"横向",U"纵向",U"按行",U"按列"};importSheetLayout_->setVisible(show);importSheetLayout_->caption=layouts[importSheetOptions_.layout];importSheetLayout_->setBounds(toDisplay({x,settingsY,side,20}));
 for(int i=0;i<8;++i){const int row=i<4?i/2:i<6?4:2;importSheetInputs_[i]->setVisible(show&&(i!=4&&i!=5||importSheetPaddingEnabled_));importSheetInputs_[i]->setBounds(toDisplay({x+38+(i%2)*112,settingsY+26+row*DialogLayout::rowStep,72,20}));importSheetInputs_[i]->setEnabled(i!=6&&i!=7||(i==6?importSheetOptions_.layout!=1:importSheetOptions_.layout!=0));}
 importSheetPadding_->setVisible(show);importSheetPadding_->icon=importSheetPaddingEnabled_?"check":"checkboxUnchecked";importSheetPadding_->setBounds(toDisplay({x,settingsY+92,side,20}));
 importSheetPartial_->setVisible(show);importSheetPartial_->icon=importSheetOptions_.partialTiles?"check":"checkboxUnchecked";importSheetPartial_->setBounds(toDisplay({x,settingsY+118+(importSheetPaddingEnabled_?22:0),side,20}));
 importSheetPreview_->setVisible(show);importSheetPreview_->setBounds(toDisplay({x+side+6,y,modal.w-side-18,modal.h-DialogLayout::bodyTop-54}));
 importSheetFit_->setVisible(show);importSheetFit_->setBounds(toDisplay({modal.x2()-86,modal.y2()-48,80,20}));
 if(show)setSheetImportBusyControls();
}
void Editor::paintSheetImport(ui::Graphics& g,gfx::Rect modal){
 auto label=[&](const std::u32string& text,int x,int y){font_.draw(g,text,x,y,skin_["text"]);};
 label(U"导入精灵表 · RGBA",modal.x+6,modal.y+(FloatingColumnChrome::headerHeight-PixelFont::cell)/2);
 const int x=modal.x+6,y=modal.y+DialogLayout::bodyTop,settingsY=y+(!importSheetOptions_.selection?38:16);
 g.saveClip();g.clipRect({x,y+(!importSheetOptions_.selection?22:0),222,12});label(document.name(),x,y+(!importSheetOptions_.selection?22:0));g.restoreClip();
 const char32_t* names[]{U"X",U"Y",U"宽",U"高",U"间距X",U"间距Y",U"列数",U"行数"};for(int i=0;i<8;++i){if((i==4||i==5)&&!importSheetPaddingEnabled_)continue;const int row=i<4?i/2:i<6?4:2;label(names[i],x+(i%2)*112,settingsY+31+row*22);}
 label(U"拖动首格／边缘／间距调整切片",x,settingsY+150+(importSheetPaddingEnabled_?22:0));label(U"空格或中键平移；滚轮缩放",x,settingsY+164+(importSheetPaddingEnabled_?22:0));
 label(U"帧数："+unicodeText(std::to_string(importSheetPreview_->frameCount())),x,modal.y2()-21);
 label(unicodeText(std::to_string(int(std::round(importSheetPreview_->zoom()*100))))+U"%",modal.x+234,modal.y2()-43);
}

void Editor::setSheetImportBusyControls(){
 const bool enabled=!importSheetTask_;
 for(auto control:{importSheetChoose_,importSheetFit_,importSheetLayout_,importSheetPartial_,importSheetPadding_})control->setEnabled(enabled);
 importSheetPreview_->setEnabled(enabled);keep_->setEnabled(enabled);dialogClose_->setEnabled(enabled);
 for(int i=0;i<8;++i)importSheetInputs_[i]->setEnabled(enabled&&(i!=6&&i!=7||(i==6?importSheetOptions_.layout!=1:importSheetOptions_.layout!=0)));
 if(!enabled)discard_->setEnabled(false);
}
void Editor::beginSheetImport(){
 if(importSheetTask_)return;
 try{
  importSheetPreview_->finishDraft();if(document.floating())document.commitFloatingPaste();if(document.active())document.cancelStroke();
  importSheetTask_=std::make_shared<SheetImportTask>(document,effectiveSheetImportOptions(),importSheetExecutor_);
  if(status_.rfind(U"精灵表导入失败：",0)==0)status_.clear();setSheetImportBusyControls();importSheetTimer_.start();invalidate();
 }catch(const std::exception& error){status_=U"精灵表导入失败："+unicodeText(error.what());invalidate();}
}
void Editor::tickSheetImport(){
 if(!importSheetTask_){importSheetTimer_.stop();return;}
 if(pending_!=Pending::SheetImport){importSheetTask_->cancel();importSheetTask_.reset();importSheetTimer_.stop();return;}
 auto task=importSheetTask_;task->tick(document);if(task->busy())return;
 bool applied=false;
 if(task->phase()==SheetImportTask::Phase::Ready)applied=task->commit(document,selectionPivot_);
 importSheetTimer_.stop();importSheetTask_.reset();setSheetImportBusyControls();
 if(applied){
  if(!importSheetOptions_.selection){auto& slot=*projects_[activeProject_];slot.sheetImportIdentity=document.identity();slot.sheetImportRemembered=importSheetOptions_;}
  brushFeedback_.brushLineAnchors_[0].reset();brushFeedback_.brushLineAnchors_[1].reset();fitCanvas();resolve(false);
 }else{updateSheetImportFields();status_=U"精灵表导入失败："+unicodeText(task->error().empty()?"Sprite sheet import cancelled":task->error());invalidate();}
}
void Editor::waitSheetImportForSmoke(){
 const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(30);
 while(importSheetTask_&&std::chrono::steady_clock::now()<until){tickSheetImport();Sleep(1);}
 if(importSheetTask_)throw std::runtime_error("Asynchronous sheet import timed out");
}

void Editor::smokeSheetImportPreview(){
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};
 const auto oldChooser=chooseSheetFile_;const auto pivot=selectionPivot_;const auto pivotMask=selectionPivotMask_;const auto pivotIdentity=selectionPivotIdentity_;
 // Hold the actual submitted worker while native timer/paint/resize messages run.
 std::function<void()> held;const auto previousExecutor=importSheetExecutor_;
 importSheetExecutor_=[&](std::function<void()> job){check(!held,"Duplicate UI import worker");held=std::move(job);};
 document=Document::fromImage(64,32,std::vector<Pixel>(2048,0xff123456),U"后台导入");document.setCustomGrid(false,{0,0,16,16},false);openSheetImport(false);
 const auto uiHistory=document.historySize();resolve(true);check(bool(importSheetTask_)&&importSheetTimer_.isRunning(),"Actual submit did not start async timer");
 const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);
 while(!held&&std::chrono::steady_clock::now()<until){manager()->generateMessages();manager()->dispatchMessages();Sleep(1);}
 check(bool(held)&&bool(importSheetTask_),"Actual timer did not capture/dispatch worker");
 const auto busyDraft=importSheetOptions_;const auto busyZoom=importSheetPreview_->zoom();
 check(!discard_->isEnabled()&&!keep_->isEnabled()&&!dialogClose_->isEnabled()&&!importSheetChoose_->isEnabled()&&!importSheetFit_->isEnabled()&&!importSheetPreview_->isEnabled(),"Busy modal controls not disabled");
 for(auto input:importSheetInputs_)check(!input->isEnabled(),"Busy numeric input enabled");
 resolve(true);resolve(false);requestClose();ask(Pending::CloseDocument);importSheetInputs_[2]->accept();importSheetInputs_[2]->cancel();importSheetPartial_->Click();importSheetPadding_->Click();
 importSheetInputs_[2]->setText("3");importSheetInputs_[2]->Change();
 check(importSheetTask_&&pending_==Pending::SheetImport&&document.historySize()==uiHistory&&importSheetOptions_.width==busyDraft.width&&importSheetOptions_.partialTiles==busyDraft.partialTiles&&!importSheetPaddingEnabled_,"Busy callbacks changed transaction/draft");
 ui::MouseMessage busyWheel(ui::kMouseWheelMessage,ui::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,importSheetPreview_->bounds().center(),{0,-1});importSheetPreview_->onProcessMessage(&busyWheel);check(importSheetPreview_->zoom()==busyZoom,"Disabled preview accepted wheel");
 importSheetInputs_[2]->setText(std::to_string(busyDraft.width));const auto hwnd=static_cast<HWND>(display()->nativeWindow()->nativeHandle());RECT original{},moved{};check(GetWindowRect(hwnd,&original)!=0,"Busy window bounds");
 check(SetWindowPos(hwnd,nullptr,original.left+3,original.top+5,original.right-original.left+24,original.bottom-original.top+16,SWP_NOZORDER|SWP_NOACTIVATE)!=0,"Busy window move/resize");manager()->generateMessages();manager()->dispatchMessages();manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();check(GetWindowRect(hwnd,&moved)!=0&&(moved.left!=original.left||moved.top!=original.top||moved.right-moved.left!=original.right-original.left),"Busy window geometry did not change");
 check(importSheetTask_&&!keep_->isEnabled()&&importSheetPreview_->bounds().w>0,"Busy resize/paint lost job/control lock");check(SetWindowPos(hwnd,nullptr,original.left,original.top,original.right-original.left,original.bottom-original.top,SWP_NOZORDER|SWP_NOACTIVATE)!=0,"Busy window restore");manager()->generateMessages();manager()->dispatchMessages();manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"sheet-import-busy.bmp");
 auto job=std::move(held);job();const auto finish=std::chrono::steady_clock::now()+std::chrono::seconds(5);
 while(importSheetTask_&&std::chrono::steady_clock::now()<finish){manager()->generateMessages();manager()->dispatchMessages();Sleep(1);}
 check(!importSheetTask_&&pending_==Pending::None&&document.width()==16&&document.historySize()==uiHistory+1&&keep_->isEnabled()&&dialogClose_->isEnabled(),"Actual timer did not commit/restore controls");
 // A changed document fails safely and leaves the existing draft editable.
 document=Document(64,32);document.setCustomGrid(false,{0,0,16,16},false);openSheetImport(false);resolve(true);
 const auto staleDeadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(!held&&std::chrono::steady_clock::now()<staleDeadline){tickSheetImport();Sleep(1);}check(bool(held),"Stale UI setup");document.beginStroke({0,0},0xffabcdef);document.commitStroke();const auto staleHistory=document.historySize();tickSheetImport();job=std::move(held);job();
 check(!importSheetTask_&&pending_==Pending::SheetImport&&discard_->isEnabled()&&keep_->isEnabled()&&importSheetInputs_[2]->isEnabled()&&document.historySize()==staleHistory&&document.pixels()[0]==0xffabcdef&&!status_.empty(),"Stale UI result altered live source/locked retry");
 resolve(true);check(importSheetTask_&&status_.rfind(U"精灵表导入失败：",0)!=0,"Retry did not clear old error/start worker");const auto retryDeadline=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(!held&&std::chrono::steady_clock::now()<retryDeadline){tickSheetImport();Sleep(1);}check(bool(held),"Retry worker missing");job=std::move(held);job();waitSheetImportForSmoke();check(pending_==Pending::None&&document.historySize()==staleHistory+1,"Failed import could not retry");document.undo();check(document.width()==64&&document.pixels()[0]==0xffabcdef,"Retry undo lost intervening edit");importSheetExecutor_=previousExecutor;
 auto wait=[&]{const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(10);while(!importSheetPreview_->imageReady()&&importSheetPreview_->error().empty()&&std::chrono::steady_clock::now()<until){importSheetPreview_->tick();Sleep(1);}check(importSheetPreview_->imageReady(),"Actual import preview did not finish");};
 auto pointer=[&](ui::MessageType type,gfx::Point point,ui::MouseButton button=ui::kButtonLeft,gfx::Point wheel=gfx::Point{}){ui::MouseMessage msg(type,ui::PointerType::Mouse,button,ui::kKeyNoneModifier,point,wheel);return importSheetPreview_->onProcessMessage(&msg);};
 auto point=[&](double x,double y){const auto o=importSheetPreview_->origin();const auto z=importSheetPreview_->zoom();const auto b=importSheetPreview_->bounds();return gfx::Point(b.x+int(std::round((o.x+x*z)*uiScale)),b.y+int(std::round((o.y+y*z)*uiScale)));};
 document=Document::fromImage(64,32,std::vector<Pixel>(64*32,0xff123456),U"交互预览 / 64×32");document.markSaved();document.setCustomGrid(false,{0,0,16,16},false);openSheetImport(false);wait();
 check(importSheetPreview_->isVisible()&&modalControl(importSheetPreview_)&&modalControl(importSheetChoose_)&&modalControl(importSheetFit_),"Preview modal input routing");
 const auto composites=importSheetPreview_->composites,uploads=importSheetPreview_->uploads,refreshes=panelFullRefreshes_,revision=document.revision(),history=document.historySize();
 const auto start=point(8,8);check(std::string(cursorAt(start))=="crosshair","Preview did not reuse legacy crosshair cursor");pointer(ui::kMouseDownMessage,start);check(importSheetPreview_->dragging()&&importSheetPreview_->hasCapture(),"Preview pointer did not capture");
 for(int i=1;i<=40;++i)pointer(ui::kMouseMoveMessage,point(8+i,9));
 check(importSheetOptions_.x==40&&importSheetOptions_.y==1&&importSheetInputs_[0]->text()=="40"&&panelFullRefreshes_==refreshes&&importSheetPreview_->composites==composites&&importSheetPreview_->uploads==uploads,"Preview drag rebuilt source/full workspace or lost field sync");
 ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);importSheetPreview_->onProcessMessage(&escape);check(!importSheetPreview_->dragging()&&!importSheetPreview_->hasCapture()&&importSheetOptions_.x==0&&importSheetOptions_.y==0&&pending_==Pending::SheetImport,"Preview Escape did not cancel only draft drag");
 pointer(ui::kMouseDownMessage,point(16,8));pointer(ui::kMouseMoveMessage,point(19,8));pointer(ui::kMouseUpMessage,point(19,8));check(importSheetOptions_.width==19,"Preview edge resize");
 pointer(ui::kMouseDownMessage,point(8,8));pointer(ui::kMouseMoveMessage,point(9,10));ui::FocusMessage blur(ui::kFocusLeaveMessage,importSheetPreview_,nullptr);importSheetPreview_->onProcessMessage(&blur);check(importSheetOptions_.x==0&&importSheetOptions_.y==0&&!importSheetPreview_->dragging(),"Preview blur draft rollback");
 const auto z=importSheetPreview_->zoom();const auto anchored=point(12,10);const auto before=importSheetPreview_->origin();const double logicalX=double(anchored.x-importSheetPreview_->bounds().x)/uiScale,logicalY=double(anchored.y-importSheetPreview_->bounds().y)/uiScale;const double sourceX=(logicalX-before.x)/z,sourceY=(logicalY-before.y)/z;
 pointer(ui::kMouseWheelMessage,anchored,ui::kButtonNone,{0,-1});const auto after=importSheetPreview_->origin();check(std::abs((logicalX-after.x)/importSheetPreview_->zoom()-sourceX)<1e-7&&std::abs((logicalY-after.y)/importSheetPreview_->zoom()-sourceY)<1e-7,"Actual preview wheel lost pointer anchor");
 const auto draft=importSheetOptions_;pointer(ui::kMouseDownMessage,point(8,8),ui::kButtonMiddle);pointer(ui::kMouseMoveMessage,point(11,10),ui::kButtonMiddle);pointer(ui::kMouseUpMessage,point(11,10),ui::kButtonMiddle);check(importSheetOptions_.x==draft.x&&importSheetOptions_.width==draft.width,"Preview pan changed slicing parameters");importSheetFit_->Click();check(!importSheetPreview_->view().zoom&&importSheetPreview_->view().pan.x==0,"Preview fit did not restore automatic fit");
 check(document.revision()==revision&&document.historySize()==history&&document.pixels().front()==0xff123456,"Preview edited live document/history");
 if(manager()&&display()){manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();const auto visible=point(8,12);const auto actual=display()->nativeSurface()->getPixel(visible.x,visible.y);check(gfx::getr(actual)==0x56&&gfx::getg(actual)==0x34&&gfx::getb(actual)==0x12,"Preview framebuffer was covered by panel background");writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"sheet-import-preview.bmp");}
 // Cancel preserves the exact draft; failure preserves source/draft/view; a new
 // source remounts with its own defaults, as the legacy document-id key does.
 const auto sourceIdentity=document.identity();const auto sourceCount=projects_.size();
 chooseSheetFile_=[](OPENFILENAMEW*){return false;};importSheetChoose_->Click();check(pending_==Pending::SheetImport&&document.identity()==sourceIdentity&&importSheetOptions_.width==19&&projects_.size()==sourceCount,"Cancelled source chooser changed source/draft");
 const auto root=assets_.parent_path()/"sheet-import-preview-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root);
 const auto bad=root/"broken.png",good=root/"source.png";{std::ofstream out(bad,std::ios::binary);out<<"broken";}writeStaticImagePngAtomic(good,encodeRgbaImagePng(20,10,std::vector<Pixel>(200,0xff4080c0)));
 auto choose=[&](const std::filesystem::path& file){chooseSheetFile_=[file,check](OPENFILENAMEW* dialog){check(!(dialog->Flags&OFN_ALLOWMULTISELECT),"Source chooser admitted a file sequence");const auto text=file.wstring();check(text.size()+1<dialog->nMaxFile,"Source chooser fixture path overflow");std::copy(text.begin(),text.end(),dialog->lpstrFile);dialog->lpstrFile[text.size()]=0;return true;};importSheetChoose_->Click();};
 pointer(ui::kMouseWheelMessage,point(10,8),ui::kButtonNone,{0,-1});const auto failedView=importSheetPreview_->view();choose(bad);check(pending_==Pending::SheetImport&&document.identity()==sourceIdentity&&importSheetOptions_.width==19&&projects_.size()==sourceCount&&importSheetPreview_->view().zoom==failedView.zoom&&status_.find(U"精灵表导入失败：")==0,"Failed source replacement lost source/draft/view");
 choose(good);check(pending_==Pending::SheetImport&&document.identity()!=sourceIdentity&&document.width()==20&&document.height()==10&&projects_.size()==sourceCount+1&&importSheetOptions_.width==16&&!importSheetPreview_->view().zoom&&document.sourceFilePath()==good&&documentPath_.empty(),"New source did not reset defaults/source identity");wait();
 importSheetInputs_[2]->setText("5");importSheetInputs_[2]->Change();importSheetInputs_[3]->setText("5");importSheetInputs_[3]->Change();const auto goodIdentity=document.identity();choose(good);check(document.identity()==goodIdentity&&importSheetOptions_.width==5&&projects_.size()==sourceCount+1,"Same open source reset live draft/created duplicate tab");
 const auto size=std::filesystem::file_size(good);resolve(true);waitSheetImportForSmoke();check(document.width()==5&&document.historySize()==1&&std::filesystem::file_size(good)==size,"Replacement source import failed/changed original file");document.undo();check(document.width()==20&&document.height()==10&&document.pixels()[0]==0xff4080c0,"Replacement source undo");
 document=Document::fromImage(6,2,{0xff000001,0xff000002,0xff000003,0xff000004,0xff000005,0xff000006,0xff000007,0xff000008,0xff000009,0xff00000a,0xff00000b,0xff00000c},U"冻结选区预览");document.previewSelection(SelectionMask{1,0,3,2,{1,0,1,0,1,1}});openSheetImport(true);document.previewSelection({});wait();check(!importSheetChoose_->isVisible()&&gfx::getr(importSheetPreview_->imagePixel(0,0))==2&&gfx::geta(importSheetPreview_->imagePixel(1,0))==0&&gfx::getr(importSheetPreview_->imagePixel(2,1))==10,"Preview selection did not use frozen mask/local origin");
 if(manager()&&display()){manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"sheet-import-selection-preview.bmp");}resolve(false);
 // Close while work is active, then open another source: cancelled output must
 // not publish into the new generation or keep the dialog close waiting.
 document=Document::fromImage(2049,3,std::vector<Pixel>(2049*3,0xff112233),U"Cancelled preview");openSheetImport(false);importSheetPreview_->tick();resolve(false);document=Document::fromImage(4,2,std::vector<Pixel>(8,0xffabcdef),U"New preview generation");openSheetImport(false);wait();check(gfx::getr(importSheetPreview_->imagePixel(0,0))==0xef,"Cancelled preview published into new source");
 const auto rendered=importSheetPreview_->composites;document.beginStroke({0,0},0xff123456);document.commitStroke();importSheetPreview_->tick();wait();check(importSheetPreview_->composites>rendered&&gfx::getr(importSheetPreview_->imagePixel(0,0))==0x56,"Preview did not refresh on content revision");resolve(false);
 document=Document(2,2);document.previewSelection(SelectionMask{0,0,8192,8192,{}});openSheetImport(true);check(!importSheetPreview_->error().empty()&&!importSheetPreview_->imageReady(),"Preview budget did not reject before allocation");resolve(false);
 // Exercise the actual modal transaction with special resource documents.
 for(bool free:{false,true}){
  document=Document(6,4);if(free)check(document.createFreeTileLayer(U"导入实例源"),"Free import fixture layer");document.beginStroke({1,1},0xff123456);document.commitStroke();if(!free)check(document.convertLayerToTilemap(2,2,U"导入瓦片源"),"Grid import fixture conversion");
  const auto before=document.timeline().state();const auto layer=document.layer().id;const auto original= document.canvasPixels();const auto h=document.historyPosition();document.setCustomGrid(false,{0,0,2,2},false);openSheetImport(false);wait();
  check(importSheetPreview_->imageReady()&&gfx::getr(importSheetPreview_->imagePixel(1,1))==0x56,"Special source preview lost actual source pixels");
  if(manager()&&display()){manager()->invalidate();manager()->flushRedraw();manager()->dispatchMessages();writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/(free?"sheet-import-free-resource.bmp":"sheet-import-grid-resource.bmp"));}
  discard_->Click();waitSheetImportForSmoke();check(pending_==Pending::None&&!document.hasTilemapContent()&&!document.hasFreeTileContent()&&document.timeline().state().tilesets.empty()&&document.timeline().state().frames.size()==6&&document.historyPosition()==h+1&&document.pixels()[3]==0xff123456,"Actual special import modal transaction");
  document.undo();refresh();check(document.layer().id==layer&&document.canvasPixels()==original&&document.timeline().state().tilesets.size()==before.tilesets.size()&&(free?document.hasFreeTileContent():document.hasTilemapContent()),"Special import UI Undo resource authority");document.redo();refresh();check(!document.hasTilemapContent()&&!document.hasFreeTileContent()&&document.pixels()[3]==0xff123456,"Special import UI Redo");
 }
 chooseSheetFile_=oldChooser;selectionPivot_=pivot;selectionPivotMask_=pivotMask;selectionPivotIdentity_=pivotIdentity;
}

}
