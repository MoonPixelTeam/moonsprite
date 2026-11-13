#pragma once
#include "ui/widget.h"
#include "ui/message.h"
#include "ui/paint_event.h"
#include <functional>
namespace moon::editor {
template<class Base> class DialogBackground final : public Base {

public:

  using Base::Base;

  std::function<void(ui::Widget&,ui::PaintEvent&,const std::function<void()>&)> composite;

  std::function<bool()> blocked;

  void onPaint(ui::PaintEvent& ev) override {

    if(composite)composite(*this,ev,[&]{Base::onPaint(ev);});else Base::onPaint(ev);

  }

  bool onProcessMessage(ui::Message* msg) override {

    if(blocked && blocked() && (msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseUpMessage || msg->type()==ui::kMouseMoveMessage || msg->type()==ui::kMouseWheelMessage || msg->type()==ui::kKeyDownMessage))return true;

    return Base::onProcessMessage(msg);

  }

};
}
