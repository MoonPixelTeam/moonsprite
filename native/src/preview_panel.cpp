#include "preview_panel.h"
#include "floating_panel_geometry.h"
#include "reference_images.h"
#include "ui/tooltips.h"
#include "ui/system.h"
#include "ui/manager.h"
#include "ui/display.h"
#include "ui/move_region.h"
#include "ui/paint.h"
#include "ui/graphics.h"
#include "ui/paint_event.h"
#include "ui/resize_event.h"
#include "os/os.h"
#include "os/window.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace moon::editor {
void PreviewPanel::syncPreview() {if(previewIdentity_!=previewDocument().identity()){previewIdentity_=previewDocument().identity();previewView_={};previewPlayback_={};previewPlayback_.mode=previewDocument().animationLoop()?"all":"once";previewPlayback_.frame=previewDocument().frame().id;previewPanning_=previewSampling_=false;}
 const auto& state=previewDocument().timeline().state();if(!previewPlayback_.playing)previewPlayback_.frame=previewDocument().frame().id;else if(std::none_of(state.frames.begin(),state.frames.end(),[this](const auto& f){return f.id==previewPlayback_.frame;}))previewPlayback_.frame=previewDocument().frame().id;
 if(!timelineAvailable||state.frames.size()<2){previewPlayback_.stop();previewPlayback_.frame=previewDocument().frame().id;}
 if(previewActions_[0]){previewActions_[0]->active=previewView_.follow;previewActions_[3]->icon=previewPlayback_.playing?"playback-pause":"playback-play";previewActions_[3]->active=previewPlayback_.playing;previewActions_[3]->setEnabled(timelineAvailable&&state.frames.size()>1);} }

double PreviewPanel::previewScale() {return previewView_.scale(previewDocument().width(),previewDocument().height(),double(previewBox_.w)/uiScale,double(previewBox_.h)/uiScale,uiScale);}

preview::Point PreviewPanel::effectivePreviewPan() {return previewView_.follow&&sourceCenter_?previewView_.followPan(previewDocument().width(),previewDocument().height(),previewScale(),sourceCenter_()):previewView_.pan;}

gfx::Rect PreviewPanel::previewImage() {const auto z=previewScale();const auto o=previewView_.origin(previewDocument().width(),previewDocument().height(),z,effectivePreviewPan(),uiScale);return {previewBox_.x+int(std::round(o.x*uiScale)),previewBox_.y+int(std::round(o.y*uiScale)),std::max(1,int(std::round(previewDocument().width()*z*uiScale))),std::max(1,int(std::round(previewDocument().height()*z*uiScale)))};}

void PreviewPanel::previewDelay() {const auto& frames=previewDocument().timeline().state().frames;const auto at=std::find_if(frames.begin(),frames.end(),[this](const auto& f){return f.id==previewPlayback_.frame;});const double delay=(at==frames.end()?100:at->duration)/std::max(.01,previewPlayback_.rate);previewDue_=std::chrono::steady_clock::now()+std::chrono::duration_cast<std::chrono::steady_clock::duration>(std::chrono::duration<double,std::milli>(delay));}

void PreviewPanel::previewTick() {if(!isVisible()){previewPlayback_.stop();return;}syncPreview();if(previewPlayback_.playing&&std::chrono::steady_clock::now()>=previewDue_){previewPlayback_.step(previewDocument().timeline().state());previewDelay();previewActions_[3]->invalidate();invalidate();}if(previewView_.follow)invalidate();}

void PreviewPanel::previewLayout() {if(!previewActions_[0])return;const auto r=uiLogical(bounds());gfx::Rect frame=r;frame.y+=frameTop;frame.h-=frameTop;PanelChromeLayout chrome(frame,managed&&!frameTop);if(floatingChrome){chrome.actions={frame.x+UiSpacing::related,FloatingColumnChrome::bodyTop(frame),frame.w-2*UiSpacing::related,UiSpacing::iconSize};chrome.content={chrome.actions.x,chrome.actions.y2()+UiSpacing::related,chrome.actions.w,std::max(0,frame.y2()-UiSpacing::related-chrome.actions.y2()-UiSpacing::related)};}for(int i=0;i<4;++i)previewActions_[i]->setBounds(uiPhysical({chrome.actions.x+i*(UiSpacing::iconSize+UiSpacing::related),chrome.actions.y,UiSpacing::iconSize,UiSpacing::iconSize}));previewBox_=uiPhysical(chrome.content);previewView_.capture(double(previewBox_.w)/uiScale,double(previewBox_.h)/uiScale);}

void PreviewPanel::previewSample(gfx::Point p) {if(!previewBox_.contains(p)||!sampled)return;const auto r=previewImage();const double z=previewScale()*uiScale;const int x=int(std::floor((p.x-r.x)/z)),y=int(std::floor((p.y-r.y)/z));if(x<0||y<0||x>=previewDocument().width()||y>=previewDocument().height())return;const auto overlay=!previewPlayback_.playing&&previewDocument().floatingDeferred()?previewDocument().floatingOverlayRegion(PixelRegion{x,y,1,1}):std::vector<timeline::Pixel>{};const auto* staged=!previewPlayback_.playing?(previewDocument().floatingDeferred()?&overlay:previewDocument().gradientPreviewPixels()):nullptr;const int width=previewDocument().floatingDeferred()?1:previewDocument().width();const auto pixels=compositeNormalRegion(previewDocument().displayTimeline(),previewPlayback_.frame,{x,y,1,1},previewDocument().layer().id,staged,width,previewDocument().floatingDeferred()?x:0,previewDocument().floatingDeferred()?y:0);if(!pixels.empty())sampled(pixels[0],previewSecondary_);}

bool PreviewPanel::processPreview(ui::Message* msg) {syncPreview();previewLayout();if(msg->type()==ui::kFocusLeaveMessage){previewPanning_=previewSampling_=false;if(hasCapture())releaseMouse();return false;}if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc&&(previewPanning_||previewSampling_)){previewPanning_=previewSampling_=false;if(hasCapture())releaseMouse();return true;}
 auto mouse=dynamic_cast<ui::MouseMessage*>(msg);if(!mouse)return false;if((previewPanning_||previewSampling_)&&!hasCapture()){previewPanning_=previewSampling_=false;return false;}
 if(previewPanning_||previewSampling_){if(msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseUpMessage){if(previewSampling_)previewSample(mouse->position());else{previewView_.pan={previewPanStart_.x+(mouse->position().x-previewPointerStart_.x)/double(uiScale)*dragSensitivity,previewPanStart_.y+(mouse->position().y-previewPointerStart_.y)/double(uiScale)*dragSensitivity};invalidate();}if(msg->type()==ui::kMouseUpMessage){previewPanning_=previewSampling_=false;releaseMouse();}return true;}}
 if(!previewBox_.contains(mouse->position()))return false;if(msg->type()==ui::kMouseWheelMessage){if(mouse->wheelDelta().y)zoomPreview(mouse->wheelDelta().y<0,mouse->position());return true;}
 if(msg->type()==ui::kMouseDownMessage){if((eyedropper||mouse->altPressed())&&(mouse->left()||mouse->right())){previewSampling_=true;previewSecondary_=mouse->right();captureMouse();previewSample(mouse->position());return true;}if(mouse->left()||mouse->middle()){if(previewView_.follow){previewView_.pan=effectivePreviewPan();previewView_.follow=false;}previewPanning_=true;previewPointerStart_=mouse->position();previewPanStart_=previewView_.pan;captureMouse();return true;}}return false;}

void PreviewPanel::drawPreview(ui::Graphics& g) {syncPreview();previewLayout();auto box=previewBox_;box.offset(-bounds().origin());box=uiLogical(box);g.fillRect(skin_["background"],box);skin_.draw(g,"panel_content",box);auto image=previewImage();image.offset(-bounds().origin());image=uiLogical(image);g.saveClip();g.clipRect(box);if(previewPlayback_.playing)renderer_.syncFrame(previewDocument(),previewPlayback_.frame);else renderer_.sync(previewDocument());renderer_.draw(g,image,previewScale(),checkerboard.light,checkerboard.dark,checkerboard.size);g.restoreClip();}

void PreviewPanel::previewMenu() {syncPreview();PixelMenu menu(skin_);auto item=[&](std::u32string title,std::function<void()> action,std::function<bool()> checked={}){auto b=new PixelMenuItem(font_,skin_,std::move(title));b->checked=std::move(checked);b->Click.connect(std::move(action));menu.addChild(b);};item(previewPlayback_.playing?U"暂停":U"播放",[this]{togglePreviewPlayback();});menu.addChild(new PixelMenuSeparator(skin_));const double rates[]{.25,.5,1,1.5,2,3};const char32_t* names[]{U"0.25×",U"0.5×",U"1×",U"1.5×",U"2×",U"3×"};for(int i=0;i<6;++i)item(names[i],[this,r=rates[i]]{previewPlayback_.rate=r;previewDelay();},[this,r=rates[i]]{return previewPlayback_.rate==r;});menu.addChild(new PixelMenuSeparator(skin_));for(const auto mode:{"once","all","tag"})item(std::string(mode)=="once"?U"播放一次":std::string(mode)=="all"?U"循环全部":U"循环当前段",[this,value=std::string(mode)]{previewPlayback_.setMode(previewDocument().timeline().state(),value);previewDelay();invalidate();},[this,value=std::string(mode)]{return previewPlayback_.mode==value;});item(U"播放完成后返回起点",[this]{previewPlayback_.returnToStart=!previewPlayback_.returnToStart;},[this]{return previewPlayback_.returnToStart;});menu.showPopup(previewActions_[3]->bounds().origin(),display());}

Document& PreviewPanel::previewDocument()const {return *previewDocument_;}

void PreviewPanel::applyRelativeLuminance() {

    const bool next=relativeLuminanceOverride_.value_or(inheritedRelativeLuminance_);

    if(renderer_.relativeLuminance()!=next){renderer_.setRelativeLuminance(next);invalidate();}

  }

void PreviewPanel::configurePreviewSource(std::function<preview::Point()> source) {sourceCenter_=std::move(source);}

void PreviewPanel::togglePreviewFollow() {syncPreview();if(previewView_.follow)previewView_.pan=effectivePreviewPan();previewView_.follow=!previewView_.follow;invalidate();}

double PreviewPanel::previewZoom() {syncPreview();previewLayout();return previewScale();}

void PreviewPanel::zoomPreview(bool in,std::optional<gfx::Point> pointer) {syncPreview();previewLayout();zoomPreviewTo(referenceZoomStep(previewScale(),in),pointer);}

void PreviewPanel::togglePreviewPlayback() {syncPreview();if(!timelineAvailable||previewDocument().timeline().state().frames.size()<2)return;previewPlayback_.setPlaying(previewDocument().timeline().state(),!previewPlayback_.playing);previewDelay();invalidate();}

void PreviewPanel::smokePreviewBehavior() {syncPreview();previewLayout();const auto original=previewView_;const auto active=previewDocument().frame().id;const auto history=previewDocument().historySize();const auto initialScale=previewScale();zoomPreview(true);if(previewScale()==initialScale)throw std::runtime_error("Preview zoom no change");const auto savedScale=previewScale();const auto box=bounds();setBounds({box.x,box.y,box.w+40*uiScale,box.h+30*uiScale});previewLayout();if(previewScale()!=savedScale)throw std::runtime_error("Preview resize changed zoom");setBounds(box);togglePreviewFollow();if(!previewView_.follow)throw std::runtime_error("Preview follow toggle");togglePreviewFollow();if(previewDocument().timeline().state().frames.size()>1){togglePreviewPlayback();previewPlayback_.step(previewDocument().timeline().state());if(previewDocument().frame().id!=active||previewDocument().historySize()!=history)throw std::runtime_error("Preview playback mutated document");previewPlayback_.stop();}previewView_=original;invalidate();}

void PreviewPanel::noteContentChange() {renderer_.noteChange(previewDocument());}

std::uint64_t PreviewPanel::uploadedPixels() const {return renderer_.uploadedPixels();}

PreviewPanel::PreviewPanel(const PixelFont& font,Skin& skin,const Skin& icons,Document& document)

    :ui::Widget(ui::kGenericWidget),font_(font),skin_(skin),previewDocument_(&document) {

    close_=new DialogBackground<PixelButton>(font,skin,U"",[this]{if(closed)closed();});

    close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);close_->setVisible(false);

    geometryTimer_.Tick.connect([this]{flushGeometry();});
    icons_=&icons;auto tips=new ui::TooltipManager;addChild(tips);const char* names[]{"follow","minus","plus","playback-play"};const char32_t* labels[]{U"跟随画布视窗",U"缩小",U"放大",U"播放"};for(int i=0;i<4;++i){auto button=new PixelButton(font,skin,U"",[this,i]{if(i==0)togglePreviewFollow();else if(i==1)zoomPreview(false);else if(i==2)zoomPreview(true);else togglePreviewPlayback();});button->iconSkin=&icons;button->icon=names[i];button->skinStyle="icon_button";button->columnHeaderAction=true;addChild(button);tips->addTooltipFor(button,utf8Text(labels[i]));previewActions_[i]=button;}previewActions_[3]->context=[this]{previewMenu();};previewTimer_.Tick.connect([this]{previewTick();});previewTimer_.start();

    setVisible(false);

  }

DialogBackground<PixelButton>* PreviewPanel::closeButton() const {return static_cast<DialogBackground<PixelButton>*>(close_);}

void PreviewPanel::bindDocument(Document& value) {previewDocument_=&value;}

PreviewPanel::~PreviewPanel() {geometryTimer_.stop();previewTimer_.stop();}

std::uint64_t PreviewPanel::geometryUpdates() const {return geometryUpdates_;}

std::uint64_t PreviewPanel::blitMoves() const {return blitMoves_;}

std::uint64_t PreviewPanel::paintCount() const {return paintCount_;}

void PreviewPanel::flushGeometry() {

    geometryTimer_.stop();if(!pendingPointer_)return;

    const auto p=*pendingPointer_;pendingPointer_.reset();if(!hasCapture())return;

    // Window position follows device pixels, independently of 2x skin size.

    const int dx=p.x-startMouse_.x,dy=p.y-startMouse_.y;

    auto next=startBounds_;

    if(dragging_) {

      if(std::hypot(p.x-startMouse_.x,p.y-startMouse_.y)<8)return;

      next.offset(dx,dy);

      next.x=std::clamp(next.x,viewport_.x-next.w+160,viewport_.x2()-120);

      next.y=std::clamp(next.y,viewport_.y,viewport_.y2()-19*uiScale);

    } else next=resizedPanel(startBounds_,gfx::Point(dx/uiScale*uiScale,dy/uiScale*uiScale),resizeEdges_,viewport_,gfx::Size(180,120));

    if(next!=bounds()){++geometryUpdates_;setBounds(next);}

  }

bool PreviewPanel::relativeLuminance()const {return renderer_.relativeLuminance();}

void PreviewPanel::syncRelativeLuminance(bool canvasView,bool inPreview) {

    if(luminanceDocumentIdentity_!=previewDocument().identity()){

      luminanceDocumentIdentity_=previewDocument().identity();relativeLuminanceOverride_.reset();

    }

    inheritedRelativeLuminance_=canvasView && inPreview;applyRelativeLuminance();

  }

void PreviewPanel::toggleRelativeLuminance() {relativeLuminanceOverride_=!relativeLuminance();applyRelativeLuminance();}

void PreviewPanel::closePanel() {close_->Click();}

void PreviewPanel::finishPointer() {

    flushGeometry();previewPanning_=previewSampling_=false;

    if(!hasCapture())return;

    releaseMouse();dragging_=false;resizeEdges_=0;if(geometryChanged)geometryChanged();

  }

const char* PreviewPanel::cursorAt(gfx::Point point) const {

    if(previewSampling_)return "eyedropper";if(previewPanning_)return "move";
    if(hasCapture())return dragging_?"move":panelResizeCursor(resizeEdges_);

    const auto edges=panelResizeEdges(bounds(),point);

    if(edges)return panelResizeCursor(edges);

    if(close_->bounds().contains(point))return "default";

    if(bounds().contains(point) && point.y<bounds().y+19*uiScale)return "move";

    return "default";

  }

void PreviewPanel::constrain(gfx::Rect viewport) {

    if(viewport.w<=0 || viewport.h<=0)return;

    if(viewport==viewport_ && !bounds().isEmpty())return;

    const auto previousViewport=viewport_;viewport_=viewport;auto next=bounds();

    if(next.isEmpty())next={viewport.x2()-250-16,viewport.y2()-260-16,250,260};

    auto old=previousViewport.isEmpty()?viewport:previousViewport;

    const auto adjusted=panels::resizeFloatingPosition({next.x,next.y,next.w,next.h},{old.x,old.y,old.w,old.h},{viewport.x,viewport.y,viewport.w,viewport.h});

    next={adjusted.x,adjusted.y,adjusted.w,adjusted.h};

    if(next!=bounds())setBounds(next);

  }

void PreviewPanel::onResize(ui::ResizeEvent& ev) {

    const auto previous=bounds();

    if(previous==ev.bounds())return;

    // Aseprite Window::moveWindow offsets children for translation and only

    // relayouts for resize; its GPU path repaints instead of reading back pixels.

    if(previous.size()==ev.bounds().size()) {

      gfx::Region oldDrawable;

      if(display())getDrawableRegion(oldDrawable,kCutTopWindowsAndUseChildArea);

      gfx::Region invalidSource;

      if(display())invalidSource.createIntersection(oldDrawable,display()->getInvalidRegion());

      const bool blit=dragging_ && isVisible() && display() && !display()->nativeWindow()->gpuAcceleration() &&

        getUpdateRegion().isEmpty() && close_->getUpdateRegion().isEmpty() && invalidSource.isEmpty();

      const int dx=ev.bounds().x-previous.x,dy=ev.bounds().y-previous.y;

      offsetWidgets(dx,dy);

      if(blit) {

        // Direct reuse of Aseprite's software-surface overlap-safe scroll path.

        gfx::Region newDrawable,source,movable,uncovered;

        getDrawableRegion(newDrawable,kCutTopWindowsAndUseChildArea);

        source=newDrawable;source.offset(-dx,-dy);

        movable.createIntersection(oldDrawable,source);

        ui::move_region(display(),movable,dx,dy);++blitMoves_;

        uncovered.createSubtraction(source,movable);uncovered.offset(dx,dy);

        invalidateRegion(uncovered);

      }

      else invalidate();

    } else {

      setBoundsQuietly(ev.bounds());const auto r=uiLogical(bounds());

      close_->setBounds(uiPhysical(FloatingColumnChrome::closeBounds(uiLogical(bounds()))));

      // Recompute the drawable region after the close button has moved.

      invalidate();

    }

    if(parent()) {

      gfx::Region exposed;exposed.createSubtraction(gfx::Region(previous),gfx::Region(bounds()));

      parent()->invalidateRegion(exposed);

    }

  }

bool PreviewPanel::onProcessMessage(ui::Message* msg) {
    if(processPreview(msg))return true;

    if(msg->type()==ui::kMouseDownMessage && static_cast<ui::MouseMessage*>(msg)->right() && context) {context();return true;}

    if(managed)return ui::Widget::onProcessMessage(msg);

    if(msg->type()==ui::kMouseDownMessage) {

      auto mouse=static_cast<ui::MouseMessage*>(msg);

      if(mouse->left()) {

        startMouse_=mouse->position();startBounds_=bounds();const auto r=bounds();

        resizeEdges_=panelResizeEdges(r,startMouse_);

        dragging_=!resizeEdges_ && startMouse_.y<r.y+19*uiScale;

        if(dragging_ || resizeEdges_)captureMouse();

      }

      return true;

    }

    if(msg->type()==ui::kMouseMoveMessage && hasCapture()) {

      pendingPointer_=static_cast<ui::MouseMessage*>(msg)->position();

      if(!geometryTimer_.isRunning())geometryTimer_.start();return true;

    }

    if(msg->type()==ui::kMouseUpMessage && hasCapture()) {

      pendingPointer_=static_cast<ui::MouseMessage*>(msg)->position();

      finishPointer();return true;

    }

    if(hasCapture() && msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc) {

      finishPointer();return true;

    }

    if(msg->type()==ui::kMouseWheelMessage)return true;

    return ui::Widget::onProcessMessage(msg);

  }

void PreviewPanel::onPaint(ui::PaintEvent& ev) {

    ++paintCount_;

    auto& g=*ev.graphics();{UiPaintScale scale(g);const auto r=uiLogical(clientBounds());

    // The opaque widget owns the whole tab strip, including its empty tail.

    // Clear it too; paintTabs restores all visible sibling labels afterwards.

    auto frame=r;frame.y+=frameTop;frame.h-=frameTop;g.fillRect(skin_["panel"],r);if(floatingChrome)FloatingColumnChrome::paint(skin_,g,frame);else skin_.draw(g,"panel_outer",frame);

    if(!managed){const auto ink=font_.inkBounds(U"预览");font_.draw(g,U"预览",r.x+5-ink.x,r.y+(FloatingColumnChrome::headerHeight-ink.h)/2-ink.y,skin_["text"]);}

    drawPreview(g);

    }

    // This content widget can repaint independently while a stroke is held.

    // Restore the sibling chrome in the same clipped paint, rather than

    // relying on a later full editor refresh to repaint its labels.

    if(managed && paintTabs)paintTabs(g);

  }

void PreviewPanel::zoomPreviewTo(double next,std::optional<gfx::Point> pointer){
 syncPreview();previewLayout();
 if(!std::isfinite(next)||next<=0||previewBox_.w<=0||previewBox_.h<=0||next==previewScale())return;
 const auto position=pointer.value_or(previewBox_.center());
 previewView_.setZoom(previewDocument().width(),previewDocument().height(),double(previewBox_.w)/uiScale,double(previewBox_.h)/uiScale,next,{double(position.x-previewBox_.x)/uiScale,double(position.y-previewBox_.y)/uiScale},uiScale);
 invalidate();
}
}
