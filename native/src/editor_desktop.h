#pragma once
#include "editor.h"
#include "native_canvas_color_sampling.h"
#include "native_extension_bridge.h"

namespace moon::editor {
class Desktop : public ui::Window {

public:

  Editor* editor=nullptr;

  bool approved=false;

  Desktop():ui::Window(ui::Window::DesktopWindow) {}

  void onBroadcastMouseMessage(const gfx::Point& screen,ui::WidgetsList& targets)override{

    const auto top=manager()->pickFromScreenPos(screen);

    if(editor && top && top->window()==this)

      if(auto hit=editor->frontWidgetAt(display()->nativeWindow()->pointFromScreen(screen)))targets.push_back(hit);

    ui::Window::onBroadcastMouseMessage(screen,targets);

  }

  void onBeforeClose(ui::CloseEvent& ev) override {

    if(!approved && editor) {ev.cancel(); editor->requestClose();}

  }

};

class Manager : public ui::Manager {

public:

  Desktop* desktop=nullptr;

  std::function<void()> refreshCursor;

private:
  class ExtensionDragTarget final:public os::DragTarget {
    os::DragTarget& fallback_;std::function<bool(os::DragEvent&,ui::MessageType)> route_;
  public:
    ExtensionDragTarget(os::DragTarget& fallback,std::function<bool(os::DragEvent&,ui::MessageType)> route):fallback_(fallback),route_(std::move(route)){}
    void dragEnter(os::DragEvent& event)override{if(route_(event,ui::kDragEnterMessage)){fallback_.dragLeave(event);return;}fallback_.dragEnter(event);}
    void drag(os::DragEvent& event)override{if(route_(event,ui::kDragMessage)){fallback_.dragLeave(event);return;}fallback_.drag(event);}
    void dragLeave(os::DragEvent& event)override{fallback_.dragLeave(event);}
    void drop(os::DragEvent& event)override{if(route_(event,ui::kDropMessage)){fallback_.dragLeave(event);return;}fallback_.drop(event);}
  };
  os::WindowRef extensionDropWindow_;std::shared_ptr<ExtensionDragTarget> extensionDrag_;
public:
  explicit Manager(const os::WindowRef& window):ui::Manager(window),extensionDropWindow_(window){
    extensionDrag_=std::make_shared<ExtensionDragTarget>(*static_cast<os::DragTarget*>(this),[this](auto& event,auto type){return desktop&&desktop->editor&&routeNativeExtensionDrop(*desktop->editor,event,type);});
    // Base Manager defers its native target setup. Attach this proxy afterwards.
    auto callback=new ui::CallbackMessage([window,weak=std::weak_ptr<ExtensionDragTarget>(extensionDrag_)]{if(auto target=weak.lock())window->setDragTarget(target.get());});callback->setRecipient(this);enqueueMessage(callback);
  }
  ~Manager()override{desktop=nullptr;if(extensionDropWindow_)extensionDropWindow_->setDragTarget(nullptr);extensionDrag_.reset();}

  void onNewDisplayConfiguration(ui::Display* display) override {

    ui::Manager::onNewDisplayConfiguration(display);

    // Activation/color-profile changes replace the native framebuffer even

    // when its size stays unchanged. Present the entire retained UI layer;

    // widget damage alone omits areas whose backing pixels are still valid.

    display->dirtyRect(display->bounds());

  }

  ui::Widget* pickFromScreenPos(const gfx::Point& screen)const override{

    auto hit=ui::Manager::pickFromScreenPos(screen);

    if(hit && desktop && desktop->editor && hit->window()==desktop)

      return desktop->editor->frontWidgetAt(desktop->display()->nativeWindow()->pointFromScreen(screen));

    return hit;

  }

  bool onProcessMessage(ui::Message* msg) override {
    if(msg->fromFilter()&&desktop&&desktop->editor)desktop->editor->observeDiagnosticInput(msg);
    if(msg->fromFilter()&&desktop&&desktop->editor&&
       (msg->type()==ui::kKeyDownMessage||msg->type()==ui::kFocusLeaveMessage||msg->type()==ui::kFocusEnterMessage))
      desktop->editor->processQuickEyedropper(msg);

    if(msg->fromFilter() && msg->type()==ui::kFocusLeaveMessage && desktop && desktop->editor)desktop->editor->observeTabletInput(msg);
    if(msg->fromFilter() && msg->type()==ui::kMouseWheelMessage){

      if(!desktop || !desktop->editor || !msg->display())return false;

      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto target=desktop->editor->display();

      const auto picked=pickFromScreenPos(mouse->screenPosition());

      // Popup menus own their wheel; otherwise the preferences container

      // gets first refusal, even over disabled controls or numeric entries.

      if(!target || !picked || picked->window()!=desktop)return false;

      ui::MouseMessage translated(msg->type(),*mouse,mouse->positionForDisplay(target));

      return desktop->editor->processPreferencesWheel(translated);

    }

    if(msg->fromFilter() && (msg->type()==ui::kKeyDownMessage || msg->type()==ui::kKeyUpMessage)){if(desktop && desktop->editor)desktop->editor->observeScrollDragKey(msg);}

    if(msg->fromFilter() && msg->type()==ui::kKeyUpMessage){if(desktop && desktop->editor)desktop->editor->observeModifierRelease(msg);return false;}

    if(msg->fromFilter() && msg->type()==ui::kFocusEnterMessage){
      // LAF removes a deleted recipient, but retains FocusMessage::newFocus.
      // Filters still see that queued message. Only the current focus is live
      // and relevant to overlay order; never walk an obsolete target's parents.
      const auto focus=static_cast<ui::FocusMessage*>(msg)->newFocus();
      if(focus && focus==getFocus() && desktop && desktop->editor)desktop->editor->focusWidgetOverlay(focus);
      return false;
    }

    if(msg->fromFilter() && msg->type()==ui::kMouseDownMessage){
      const auto mouse=static_cast<ui::MouseMessage*>(msg);
      // Legacy device router gives an active eyedropper intent first refusal
      // over another registered stage, before activating its document.
      if(msg->display()&&!getCapture()&&desktop&&desktop->editor&&desktop->editor->processCrossCanvasIntent(*mouse))return true;
      if(msg->display())if(auto picked=pickFromScreenPos(mouse->screenPosition()))if(auto popup=dynamic_cast<PixelPopupWindow*>(picked->window()))if(isWidgetClickable(popup)){
        ui::MouseMessage translated(msg->type(),*mouse,mouse->positionForDisplay(popup->display()));translated.setFromFilter(true);
        if(popup->processDialogGeometry(&translated))return true;
      }
      if(!desktop || !desktop->editor)return false;const auto target=desktop->editor->display();if(!msg->display() || !target)return false;const auto picked=pickFromScreenPos(mouse->screenPosition());if(!picked || picked->window()!=desktop || !isWidgetClickable(desktop->editor))return false;ui::MouseMessage translated(msg->type(),*mouse,mouse->positionForDisplay(target));desktop->editor->observeTabletInput(&translated);if(desktop->editor->processScrollDrag(&translated))return true;if(desktop->editor->dispatchPanelGesture(&translated))return true;return desktop->editor->beginTimelineOutline(translated);}

    if(msg->fromFilter() && (msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseEnterMessage || msg->type()==ui::kMouseLeaveMessage)) {

      if(desktop && desktop->editor) {

        std::optional<gfx::Point> position;

        // Manager::setMouse emits Leave as Message, not MouseMessage.

        // Only Enter/Move carry coordinates and a source display.

        if(msg->type()!=ui::kMouseLeaveMessage) {

          const auto source=msg->display();

          const auto target=desktop->editor->display();

          if(source && target && source->nativeWindow() && target->nativeWindow())

            position=static_cast<ui::MouseMessage*>(msg)->positionForDisplay(target);

        }

        desktop->editor->updatePaletteMouse(position);

      }

      if(refreshCursor)refreshCursor();
      return false;

    }

    if(msg->type()==ui::kSetCursorMessage && refreshCursor) {

      // Aseprite emits one SetCursor after the OS mouse-event batch. Apply its

      // latest geometry before the same dispatch paints, without a 16ms wait.

      if(desktop && desktop->editor)desktop->editor->flushPanelGeometry();

      refreshCursor();return true;

    }

    if(msg->type()==ui::kCloseDisplayMessage && desktop) {desktop->closeWindow(this);return true;}

    return ui::Manager::onProcessMessage(msg);

  }

};
}
