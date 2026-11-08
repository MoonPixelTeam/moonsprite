#pragma once
#include "document.h"
namespace moon {
struct SheetImportOptions {int layout=2,x=0,y=0,width=16,height=16,paddingX=0,paddingY=0;bool partialTiles=false,selection=false;std::shared_ptr<const SelectionMask> selectionSnapshot;};
struct SheetImportPlan {int columns=0,rows=0;std::vector<Point> tiles;};
// SpriteSheetImportDialog: selection defaults ignore remembered options and
// use local coordinates; ordinary defaults use the document's grid, even hidden.
SheetImportOptions initialSheetImportOptions(GridSettings grid,const std::optional<SheetImportOptions>& remembered={},const std::optional<SelectionMask>& selection={});
int sheetImportFrameSizeFromCount(int extent,int origin,int padding,int count);
const SelectionMask* sheetImportSelection(const Document&,const SheetImportOptions&);
SheetImportPlan planSpriteSheetImport(int width,int height,const SheetImportOptions& options);
void validateSpriteSheetImportAllocation(const Document&,const SheetImportOptions&);
struct SheetImportCancelled:std::runtime_error {SheetImportCancelled():std::runtime_error("Sprite sheet import cancelled"){};};
timeline::State buildSpriteSheetImport(const Document& source,const SheetImportOptions& options,const std::function<bool()>& cancelled={},const std::function<void(std::size_t)>& progress={});
}
