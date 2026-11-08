#pragma once
#include "document.h"
namespace moon {
struct SheetImportOptions {int layout=2,x=0,y=0,width=16,height=16,paddingX=0,paddingY=0;bool partialTiles=false,selection=false;};
struct SheetImportPlan {int columns=0,rows=0;std::vector<Point> tiles;};
// SpriteSheetImportDialog: selection defaults ignore remembered options and
// use local coordinates; ordinary defaults use the document's grid, even hidden.
SheetImportOptions initialSheetImportOptions(GridSettings grid,const std::optional<SheetImportOptions>& remembered={},const std::optional<SelectionMask>& selection={});
int sheetImportFrameSizeFromCount(int extent,int origin,int padding,int count);
SheetImportPlan planSpriteSheetImport(int width,int height,const SheetImportOptions& options);
timeline::State buildSpriteSheetImport(const Document& source,const SheetImportOptions& options);
}
