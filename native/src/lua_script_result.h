#pragma once
#include "lua_script_invocation.h"
namespace moon::script {
// Validates every batch and created structure before the caller may apply any
// result. Returns the final raster baseline; does not execute MSE operations.
SurfaceSnapshot validateResult(const Target&,const std::string& resultJson);
}
