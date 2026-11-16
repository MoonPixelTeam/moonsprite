#pragma once
#include "native_widgets.h"
#include "canvas_references.h"
namespace moon {
namespace editor {class CanvasReferenceController;}
class CanvasReferenceDialog final:public PixelDialog {
 friend class editor::CanvasReferenceController;
 const PixelFont& font_;const Skin& skin_;
 std::function<const CanvasReference*()> read_;
 std::function<void(ReferencePatch)> update_;
 std::function<void(int)> action_;
 std::function<void(bool)> gesture_;
 std::array<PixelEntry*,5> fields_{};
 std::array<PixelSlider*,3> sliders_{};
 std::array<PixelButton*,7> buttons_{};
 PixelButton* close_=nullptr;int expanded_=-1;bool syncing_=false,finished_=false,extraFilters_=false;
 void filters(bool);
 void sync();void change(int,double);void layout();void dismiss();
public:
 CanvasReferenceDialog(const PixelFont&,const Skin&,const Skin&,
   std::function<const CanvasReference*()>,std::function<void(ReferencePatch)>,
   std::function<void(int)>,std::function<void(bool)>);
 ~CanvasReferenceDialog()override;
 gfx::Size minimumDialogSize(int)const override;
 void onResize(ui::ResizeEvent&)override;
 void paintDialogContents(ui::PaintEvent&)override;
 bool onProcessMessage(ui::Message*)override;
};
}
