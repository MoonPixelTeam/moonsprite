#pragma once
#include "document.h"
namespace moon {
struct SheetImportOptions {int layout=2,x=0,y=0,width=16,height=16,paddingX=0,paddingY=0;bool partialTiles=false,selection=false;};
struct SheetImportPlan {int columns=0,rows=0;std::vector<Point> tiles;};
SheetImportPlan planSpriteSheetImport(int width,int height,const SheetImportOptions& options);
timeline::State buildSpriteSheetImport(const Document& source,const SheetImportOptions& options);
}
