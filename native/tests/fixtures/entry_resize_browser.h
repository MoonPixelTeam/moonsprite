#pragma once
// Actual Edge 156.0.4314.50 input resize observations.
// Regenerate: node native/scripts/capture-entry-resize.cjs
namespace moon {
struct EntryResizeBrowserCase {const char32_t* text;int anchor,caret;bool readOnly;int narrowScroll,wideScroll,start,end;bool backward;};
inline const EntryResizeBrowserCase entryResizeBrowserCases[]{
 {U"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",78,78,false,768,0,78,78,false},
 {U"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",78,78,true,768,0,78,78,false},
 {U"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",0,78,false,768,0,0,78,false},
 {U"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",0,78,true,768,0,0,78,false},
 {U"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",78,0,false,768,0,0,78,true},
 {U"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",78,0,true,768,0,0,78,true},
 {U"\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5",60,60,false,1110,0,60,60,false},
 {U"\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5",60,60,true,1110,0,60,60,false},
 {U"\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5",0,60,false,1110,0,0,60,false},
 {U"\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5",0,60,true,1110,0,0,60,false},
 {U"\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5",60,0,false,1110,0,0,60,true},
 {U"\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5\u4e2d\u6587\u6d4b\u8bd5",60,0,true,1110,0,0,60,true},
 {U"short",5,5,false,0,0,5,5,false},
 {U"short",5,5,true,0,0,5,5,false},
 {U"short",0,5,false,0,0,0,5,false},
 {U"short",0,5,true,0,0,0,5,false},
 {U"short",5,0,false,0,0,0,5,true},
 {U"short",5,0,true,0,0,0,5,true},
 {U"",0,0,false,0,0,0,0,false},
 {U"",0,0,true,0,0,0,0,false},
 {U"",0,0,false,0,0,0,0,false},
 {U"",0,0,true,0,0,0,0,false},
 {U"",0,0,false,0,0,0,0,false},
 {U"",0,0,true,0,0,0,0,false},
};
}
