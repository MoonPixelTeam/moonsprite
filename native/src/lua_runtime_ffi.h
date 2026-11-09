#pragma once
#include <cstddef>
// Legacy LuaSession is thread affine. Own the handle on a dedicated worker;
// never pass it to the UI thread. JSON results contain transactions, not edits.
extern "C" {
struct MoonLuaHandle;
MoonLuaHandle* moon_lua_create();
bool moon_lua_destroy(MoonLuaHandle*); // false on wrong thread, ownership retained
char* moon_lua_request(MoonLuaHandle*,const unsigned char*,std::size_t);
void moon_lua_free(char*); // same Rust allocator that returned the UTF-8 JSON
}
