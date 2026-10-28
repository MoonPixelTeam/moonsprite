#include "grid_snap.h"
#include "quick_grid_selection.h"
#include "document.h"
#include <iostream>
#include <stdexcept>
#define CHECK(...) do{if(!(__VA_ARGS__))throw std::runtime_error(#__VA_ARGS__);}while(false)
using namespace moon;
int main(){try{
 auto p=snapPointToGrid({5,14},{});CHECK(p.x==0&&p.y==16);p=snapPointToGrid({8,8},{});CHECK(p.x==0&&p.y==0);p=snapPointToGrid({-6,-5},{-3,-2,4,4});CHECK(p.x==-3&&p.y==-2);p=snapPointToGrid({9,7},{1,2,4,3});CHECK(p.x==9&&p.y==8);
 auto b=snapSelectionBoundsToGrid({5,6,7,5},{1,2,4,3});CHECK(b.x==5&&b.y==5&&b.width==8&&b.height==6);b=snapSelectionBoundsToGrid({0,0,1,1},{-3,-2,4,4});CHECK(b.x==-3&&b.y==-2&&b.width==4&&b.height==4);p=snapSelectionTranslationToGrid({1,2,21,10},{7,8},{});CHECK(p.x==15&&p.y==14);
 const GridSettings grid{-3,-2,4,4};auto first=gridCellBoundsAt(0,0,grid,10,10),last=gridCellBoundsAt(9,9,grid,10,10);CHECK(selectionEqual(first,SelectionMask{0,0,1,2,{}}));CHECK(selectionEqual(last,SelectionMask{9,6,1,4,{}}));CHECK(selectionEqual(quickSelectCellDragBounds(*first,*last),SelectionMask{0,0,10,10,{}}));CHECK(!gridCellBoundsAt(10,0,grid,10,10));CHECK(selectionEqual(gridCellBoundsAt(8,8,{0,0,7,7},32,32),SelectionMask{7,7,7,7,{}}));
 const QuickSelectionPress press{10,20,1,1000};CHECK(isQuickSelectionSecondPress(press,{16,20,1,1500}));CHECK(!isQuickSelectionSecondPress(press,{16.01,20,1,1500}));CHECK(!isQuickSelectionSecondPress(press,{10,20,1,999}));CHECK(!isQuickSelectionSecondPress(press,{10,20,2,1100}));CHECK(isQuickSelectionSecondPress({},press,2));
 Document d(10,10);d.commitSelection({},SelectionMask{0,0,5,5,{}});d.markSaved();auto before=d.selection();const auto h=d.historySize(),pixels=d.pixels().size();d.previewSelection(*last);CHECK(d.historySize()==h);d.previewSelection(before);d.commitSelection(before,quickSelectCellDragBounds(*first,*last),true);CHECK(d.historySize()==h+1&&!d.dirty());d.undo();CHECK(selectionEqual(d.selection(),before));d.redo();CHECK(d.selection()->width==10&&d.pixels().size()==pixels);
 std::cout<<"Legacy grid snap and quick selection fixtures passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
