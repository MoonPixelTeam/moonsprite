#include "native_canvas_color_sampling.h"
#include "canvas_color_sampling.h"
#include "ui/manager.h"
#include "ui/property.h"
#include "ui/widget.h"
namespace moon {
namespace {
constexpr auto propertyName="moon.canvas-color-surface";
CanvasColorSampling& router(){static CanvasColorSampling value;return value;}
struct Surface final:ui::Property{
 CanvasColorSampling::Token token=0;const ui::Widget* owner=nullptr;bool cursor=false,intent=false;std::function<bool(gfx::Point)> contains;
 Surface():ui::Property(propertyName){}
 ~Surface()override{if(token){router().clearIntentFor(owner);router().remove(token);}}
};
std::shared_ptr<Surface> state(const ui::Widget& widget){return std::dynamic_pointer_cast<Surface>(widget.getProperty(propertyName));}
}
void registerNativeCanvasColorSurface(ui::Widget& widget,std::function<std::optional<std::uint32_t>(gfx::Point)> sample,std::function<void(bool)> cursor,std::function<bool(gfx::Point)> contains){
 unregisterNativeCanvasColorSurface(widget);auto item=std::make_shared<Surface>();item->owner=&widget;item->contains=std::move(contains);std::weak_ptr<Surface> weak=item;
 router().canvasAtPoint=[](auto p)->const void*{auto w=ui::Manager::getDefault()->pickFromScreenPos({p.x,p.y});if(!w||!w->isVisible())return nullptr;auto live=state(*w);return live&&(!live->contains||live->contains({p.x,p.y}))?w:nullptr;};
 widget.setProperty(item);item->token=router().add({&widget,[sample=std::move(sample)](auto p){return sample({p.x,p.y});},[weak,cursor=std::move(cursor)](bool active){if(auto live=weak.lock()){live->cursor=active;cursor(active);}}});
}
void unregisterNativeCanvasColorSurface(ui::Widget& widget){if(auto item=state(widget)){router().clearIntentFor(&widget);router().remove(item->token);item->token=0;}widget.removeProperty(propertyName);}
std::optional<std::uint32_t> sampleNativeCanvasColor(gfx::Point p){return router().sample({p.x,p.y});}
void beginNativeCanvasColorSampling(ui::Widget& widget,std::function<void(std::uint32_t,gfx::Point)> apply){router().begin(&widget,0,[apply=std::move(apply)](auto c,auto p){apply(c,{p.x,p.y});});}
void endNativeCanvasColorSampling(ui::Widget& widget){if(router().activeFor(&widget))router().end();}
void syncNativeCanvasColorIntent(ui::Widget& widget,bool enabled,std::function<void(std::uint32_t,gfx::Point,bool)> apply){
 auto item=state(widget);if(!item)return;if(enabled==item->intent)return;item->intent=enabled;
 if(enabled)router().intent(&widget,[apply=std::move(apply)](auto c,auto p,bool secondary){apply(c,{p.x,p.y},secondary);});else router().clearIntentFor(&widget);
}
bool routeNativeCanvasColorSampling(gfx::Point p){return router().route({p.x,p.y});}
bool routeNativeCanvasColorIntent(gfx::Point p,bool secondary){return router().routeIntent({p.x,p.y},secondary);}
bool nativeCanvasColorCursor(const ui::Widget& widget){auto item=state(widget);return item&&item->cursor;}
}
