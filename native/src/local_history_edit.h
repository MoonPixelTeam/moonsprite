#pragma once
#include <cstdint>
#include <memory>
#include <string>
#include <vector>
#include <variant>
namespace moon::local_history {
// Immutable payload in Document's existing Edit stack. Bytes may start/end
// inside an RGBA word; retaining only full pixels loses other history steps.
struct PixelHistoryEdit {
 enum class MetadataField { Dirty, CreatedAt, UpdatedAt, StrokeCount, OperationCount, DrawingTimeMs, Name, Loop, PixelGrid, ShowGrid, GridX, GridY, GridWidth, GridHeight,
 LayerName, LayerDescription, LayerVisible, LayerLocked, LayerAutoLink, LayerClipping,
 GroupName, GroupDescription, GroupVisible, GroupLocked, GroupClipping, GroupCumulativeBlend, FrameDuration, FrameDisabled, LayerOpacity, LayerBlend, GroupOpacity, GroupBlend, CelOpacity, CelZIndex };
 struct MetadataTarget {MetadataField field;std::string id;};
 struct MetadataPatch {
  using Value=std::variant<bool,double,std::string>;
  std::vector<MetadataTarget> fields;
  std::u32string beforeUnicode,afterUnicode;
  Value before,after;
 };
 struct Patch {
  std::vector<std::string> owners;
  std::size_t offset=0;
  std::shared_ptr<const std::vector<std::uint8_t>> before,after;
  std::shared_ptr<const MetadataPatch> metadata;
 };
 std::vector<Patch> patches;
 bool region=false,projectFrame=false;
 int x=0,y=0,width=0,height=0;
 std::string frameId;
 // Legacy declared history cost (includes scalar/patch overhead when compiled).
 std::size_t retainedBytes=0;
};
}
