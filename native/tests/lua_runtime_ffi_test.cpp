#include "lua_runtime_ffi.h"
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <thread>
void check(bool value){if(!value)throw std::runtime_error("Lua C++ ABI contract failed");}
int main(){try{
 auto* runtime=moon_lua_create();check(runtime!=nullptr);
 const char request[]=R"({"type":"unknown"})";
 char* result=moon_lua_request(runtime,reinterpret_cast<const unsigned char*>(request),std::strlen(request));
 check(result&&std::strstr(result,"Unknown Lua runtime request")&&std::strstr(result,"false"));moon_lua_free(result);
 std::thread other([&]{check(!moon_lua_destroy(runtime));});other.join();
 const char close[]=R"({"type":"close","sessionId":"absent"})";
 result=moon_lua_request(runtime,reinterpret_cast<const unsigned char*>(close),std::strlen(close));
 check(result&&std::strstr(result,"true")&&std::strstr(result,"null"));moon_lua_free(result);
 check(moon_lua_destroy(runtime));check(moon_lua_destroy(nullptr));moon_lua_free(nullptr);
 std::cout<<"Lua C++ ABI contracts passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
