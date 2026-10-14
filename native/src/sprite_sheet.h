#pragma once
#include "image_export.h"
namespace moon {
enum class SheetLayout {Horizontal,Vertical,Rows,Columns};
enum class SheetConstraint {None,FixedColumns,FixedWidth,FixedRows,FixedHeight};
struct SpriteSheetOptions {
 SheetLayout layout=SheetLayout::Rows;SheetConstraint constraint=SheetConstraint::None;
 int fixedColumns=4,fixedRows=4,fixedWidth=4,fixedHeight=4;
 bool mergeDuplicates=false,ignoreEmpty=false,selection=false;
 std::string frameScope="all",layerScope="visible";
 std::vector<std::string> selectedLayerIds;
};
struct SheetMetrics {int columns=0,rows=0,width=0,height=0;};
SheetMetrics spriteSheetMetrics(int count,int width,int height,const SpriteSheetOptions& options);
StaticImageExport encodeSpriteSheet(const Document& document,const SpriteSheetOptions& options);
}
