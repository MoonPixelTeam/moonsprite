#include "floating_column_surface.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include "ui/paint_event.h"
namespace moon::editor {
FloatingColumnSurface::FloatingColumnSurface():ui::Widget(ui::kGenericWidget) {setTransparent(false);setVisible(false);}

void FloatingColumnSurface::onResize(ui::ResizeEvent& ev) {const auto previous=bounds();setBoundsQuietly(ev.bounds());invalidate();if(parent())parent()->invalidateRect(previous);}

bool FloatingColumnSurface::onProcessMessage(ui::Message* msg) {

    if(pointer && pointer(msg))return true;

    if(msg->type()==ui::kMouseDownMessage || msg->type()==ui::kMouseUpMessage || msg->type()==ui::kMouseWheelMessage)return true;

    return ui::Widget::onProcessMessage(msg);

  }

void FloatingColumnSurface::onPaint(ui::PaintEvent& ev) {if(paint)paint(*ev.graphics());}

DockFeedback::DockFeedback():ui::Widget(ui::kGenericWidget) {setTransparent(true);setVisible(false);}

void DockFeedback::onPaint(ui::PaintEvent& ev) {if(paint)paint(*ev.graphics());}
}
