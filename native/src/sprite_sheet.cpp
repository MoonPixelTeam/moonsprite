#include "sprite_sheet.h"
#include "layer_compositor.h"
#include <limits>
#include <unordered_map>
namespace moon {namespace {
int product(int a,int b){auto n=std::int64_t(a)*b;if(n<1||n>std::numeric_limits<int>::max())throw std::runtime_error("Sprite sheet dimensions exceed range");return int(n);}
std::uint32_t hashPixels(const std::vector<Pixel>& pixels){std::uint32_t hash=0x811c9dc5;for(auto p:pixels)for(int c=0;c<4;++c)hash=(hash^std::uint8_t(p>>(c*8)))*0x01000193;return hash;}
}
SheetMetrics spriteSheetMetrics(int n,int w,int h,const SpriteSheetOptions& o){
 if(n<1||w<1||h<1)throw std::invalid_argument("No sprite sheet items or invalid area");
 if(o.layout==SheetLayout::Horizontal)return {n,1,product(w,n),h};if(o.layout==SheetLayout::Vertical)return {1,n,w,product(h,n)};
 if(o.layout==SheetLayout::Rows){const int width=o.constraint==SheetConstraint::FixedWidth?std::max(w,o.fixedWidth):0;const int columns=width?std::max(1,width/w):o.constraint==SheetConstraint::FixedColumns?std::max(1,o.fixedColumns):n;const int rows=int((std::int64_t(n)+columns-1)/columns);return {columns,rows,width?width:product(w,columns),product(h,rows)};}
 const int height=o.constraint==SheetConstraint::FixedHeight?std::max(h,o.fixedHeight):0;const int rows=height?std::max(1,height/h):o.constraint==SheetConstraint::FixedRows?std::max(1,o.fixedRows):n;const int columns=int((std::int64_t(n)+rows-1)/rows);return {columns,rows,product(w,columns),height?height:product(h,rows)};
}
static StaticImageExport buildSingleSpriteSheet(const Document& d,const SpriteSheetOptions& o){
 if(d.active())throw std::runtime_error("Commit or cancel active operation before exporting");auto state=d.timeline().state();CompositeRegion area{0,0,d.width(),d.height()};if(o.selection){if(!d.selection())throw std::runtime_error("Sprite sheet selection missing");auto& s=*d.selection();area={s.x,s.y,s.width,s.height};}
 if(area.x<0||area.y<0||area.width<1||area.height<1||std::int64_t(area.x)+area.width>d.width()||std::int64_t(area.y)+area.height>d.height())throw std::runtime_error("Invalid sprite sheet area");
 if(o.layerScope!="visible"){auto ids=o.selectedLayerIds;if(o.layerScope=="all"){ids.clear();for(const auto& l:state.layers)ids.push_back(l.id);}else if(o.layerScope=="selected"&&ids.empty())ids={d.layer().id};else if(o.layerScope!="selected")throw std::runtime_error("Unknown sheet layer scope");for(auto& l:state.layers)l.visible=std::find(ids.begin(),ids.end(),l.id)!=ids.end();}
 timeline::Timeline timeline(std::move(state));std::vector<std::string> frames;const auto& source=d.timeline().state();
 if(o.frameScope.rfind("loop:",0)==0){const auto id=o.frameScope.substr(5);auto it=std::find_if(source.loopSections.begin(),source.loopSections.end(),[&](const auto& l){return l.id==id;});if(it==source.loopSections.end())throw std::runtime_error("Sprite sheet loop missing");auto range=timeline::loopRange(source,*it);if(range.start<0)throw std::runtime_error("Invalid sprite sheet loop");for(int i=range.start;i<=range.end;++i)frames.push_back(source.frames[i].id);if(it->direction=="reverse")std::reverse(frames.begin(),frames.end());}
 else if(o.frameScope=="selected"){for(const auto& f:source.frames)if(std::find(d.selectedFrames().begin(),d.selectedFrames().end(),f.id)!=d.selectedFrames().end())frames.push_back(f.id);if(frames.empty())frames.push_back(d.frame().id);}
 else if(o.frameScope=="all")for(const auto& f:source.frames)frames.push_back(f.id);else throw std::runtime_error("Unknown sheet frame scope");
 std::vector<std::vector<Pixel>> items;std::unordered_map<std::uint32_t,std::vector<std::size_t>> buckets;
 for(const auto& f:frames){auto pixels=compositeNormalRegion(timeline,f,area);if(o.selection)for(int y=0;y<area.height;++y)for(int x=0;x<area.width;++x)if(!selectionContains(d.selection(),area.x+x,area.y+y))pixels[std::size_t(y)*area.width+x]&=0xffffff;
  if(o.ignoreEmpty&&std::none_of(pixels.begin(),pixels.end(),[](Pixel p){return p>>24;}))continue;
  auto hash=hashPixels(pixels);auto& matches=buckets[hash];if(o.mergeDuplicates&&std::any_of(matches.begin(),matches.end(),[&](std::size_t i){return items[i]==pixels;}))continue;matches.push_back(items.size());items.push_back(std::move(pixels));
 }
 if(items.empty()&&o.ignoreEmpty)return {};
 const auto m=spriteSheetMetrics(int(items.size()),area.width,area.height,o);if(std::uint64_t(m.width)*m.height>64*1024*1024)throw std::runtime_error("Sprite sheet exceeds native PNG budget");std::vector<Pixel> sheet(std::size_t(m.width)*m.height,0);
 for(std::size_t i=0;i<items.size();++i){const int row=o.layout==SheetLayout::Columns?int(i)%m.rows:int(i)/m.columns,col=o.layout==SheetLayout::Columns?int(i)/m.rows:int(i)%m.columns;for(int y=0;y<area.height;++y)std::copy_n(items[i].begin()+std::size_t(y)*area.width,area.width,sheet.begin()+std::size_t(row*area.height+y)*m.width+col*area.width);}
 return {m.width,m.height,std::move(sheet),{}};
}
// legacy core/sprite-sheet.ts: createSpriteSheetExportTargets and
// stackSpriteSheetDocuments. Target order is layer first, loop section second.
StaticImageExport buildSpriteSheetImage(const Document& d,const SpriteSheetOptions& options){
 if(d.active())throw std::runtime_error("Commit or cancel active operation before exporting");
 std::vector<SpriteSheetOptions> layers;
 if(options.splitLayers){
  for(const auto& layer:d.timeline().state().layers){
   bool include=options.layerScope=="all" || (options.layerScope=="visible"&&layer.visible);
   if(options.layerScope=="selected")include=options.selectedLayerIds.empty()?layer.id==d.layer().id:std::find(options.selectedLayerIds.begin(),options.selectedLayerIds.end(),layer.id)!=options.selectedLayerIds.end();
   if(include){auto target=options;target.layerScope="selected";target.selectedLayerIds={layer.id};layers.push_back(std::move(target));}
  }
  if(options.layerScope!="all"&&options.layerScope!="visible"&&options.layerScope!="selected")throw std::runtime_error("Unknown sheet layer scope");
 }else layers.push_back(options);
 std::vector<StaticImageExport> parts;int width=0;std::int64_t height=0;
 for(const auto& layer:layers){
  auto append=[&](SpriteSheetOptions target){target.splitLayers=target.splitLoopSections=false;auto part=buildSingleSpriteSheet(d,target);if(part.pixels.empty())return;width=std::max(width,part.width);height+=part.height;if(height>std::numeric_limits<int>::max()||std::uint64_t(width)*height>64*1024*1024)throw std::runtime_error("Sprite sheet exceeds native PNG budget");parts.push_back(std::move(part));};
  if(options.splitLoopSections){for(const auto& section:d.timeline().state().loopSections){const auto range=timeline::loopRange(d.timeline().state(),section);if(range.start<0)continue;auto target=layer;target.frameScope="loop:"+section.id;append(std::move(target));}}
  else append(layer);
 }
 if(parts.empty())throw std::runtime_error("No sprite sheet items");
 StaticImageExport image;image.width=width;image.height=int(height);image.pixels.resize(std::size_t(width)*image.height,0);int top=0;
 for(const auto& part:parts){for(int y=0;y<part.height;++y)std::copy_n(part.pixels.begin()+std::size_t(y)*part.width,part.width,image.pixels.begin()+std::size_t(top+y)*width);top+=part.height;}
 return image;
}
StaticImageExport encodeSpriteSheet(const Document& d,const SpriteSheetOptions& o){auto image=buildSpriteSheetImage(d,o);return encodeRgbaImagePng(image.width,image.height,std::move(image.pixels));}

}
