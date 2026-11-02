#pragma once
#include "project_encode.h"
#include "image_export.h"
#include "document.h"
#include <roapi.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#ifdef GetObject
#undef GetObject
#endif
namespace moon::tests {
// Test-only repacking, matching legacy project-format-timelapse-restore.test.ts.
inline project::Bytes recordingZip(const std::map<std::string,project::Bytes>& files){
 project::Bytes bytes,central;auto u16=[](auto& b,std::uint32_t n){b.push_back(n&255);b.push_back((n>>8)&255);};auto u32=[&](auto& b,std::uint32_t n){u16(b,n);u16(b,n>>16);};
 for(const auto& [name,data]:files){std::uint32_t crc=0xffffffff;for(auto v:data){crc^=v;for(int bit=0;bit<8;++bit)crc=(crc>>1)^((crc&1)?0xedb88320:0);}crc^=0xffffffff;const auto offset=std::uint32_t(bytes.size()),size=std::uint32_t(data.size());
  u32(bytes,0x04034b50);u16(bytes,20);u16(bytes,0x800);u16(bytes,0);u16(bytes,0);u16(bytes,33);u32(bytes,crc);u32(bytes,size);u32(bytes,size);u16(bytes,std::uint32_t(name.size()));u16(bytes,0);bytes.insert(bytes.end(),name.begin(),name.end());bytes.insert(bytes.end(),data.begin(),data.end());
  u32(central,0x02014b50);u16(central,20);u16(central,20);u16(central,0x800);u16(central,0);u16(central,0);u16(central,33);u32(central,crc);u32(central,size);u32(central,size);u16(central,std::uint32_t(name.size()));u16(central,0);u16(central,0);u16(central,0);u16(central,0);u32(central,0);u32(central,offset);central.insert(central.end(),name.begin(),name.end());
 }const auto offset=std::uint32_t(bytes.size());bytes.insert(bytes.end(),central.begin(),central.end());u32(bytes,0x06054b50);u16(bytes,0);u16(bytes,0);u16(bytes,std::uint32_t(files.size()));u16(bytes,std::uint32_t(files.size()));u32(bytes,std::uint32_t(central.size()));u32(bytes,offset);u16(bytes,0);return bytes;
}
inline std::shared_ptr<const project::Bytes> timelapseRestoreArchive(int mode){
 using namespace winrt::Windows::Data::Json;
 struct Apartment{HRESULT result=RoInitialize(RO_INIT_MULTITHREADED);~Apartment(){if(result==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(result))RoUninitialize();}} apartment;
 auto source=Document::fromImage(4,4,std::vector<Pixel>(16,0xff123456),U"缩时恢复样本");timelapse::Settings recording;recording.enabled=true;recording.mode=timelapse::Mode::Full;
 for(int i=0;i<3;++i){timelapse::Frame f;f.id="frame-"+std::to_string(i);f.width=f.height=4;f.capturedAt=i;f.elapsedMs=i?1:0;f.data=encodeRgbaImagePng(4,4,std::vector<Pixel>(16,0xff000000|((i+1)*10))).png;recording.snapshots.push_back(std::move(f));}source.setImportedTimelapse(recording);
 const auto encoded=project::encodeEditableProject(source);project::Archive archive(encoded.bytes);std::map<std::string,project::Bytes> files;for(const auto& item:archive.entries())files[item.first]=archive.read(item.first,project::Limits{}.expandedBytes);
 const auto& data=files.at("manifest.json");auto manifest=JsonObject::Parse(winrt::to_hstring(std::string(data.begin(),data.end())));auto snapshots=manifest.GetNamedObject(L"document").GetNamedObject(L"timelapse").GetNamedArray(L"snapshots");auto middle=snapshots.GetObjectAt(1);
 if(mode==1)files.erase("timelapse/frame-1.png");
 if(mode==2||mode==6)middle.Insert(L"width",JsonValue::CreateNumberValue(0));
 if(mode==3)middle.Remove(L"id");
 if(mode==4)for(int i=0;i<3;++i)files.erase("timelapse/frame-"+std::to_string(i)+".png");
 if(mode==5)files["timelapse/frame-1.png"].clear();
 if(mode==6)files.erase("timelapse/frame-2.png");
 if(mode==7)middle.Insert(L"futureField",JsonValue::CreateBooleanValue(true));
 if(mode==8)files["timelapse/frame-1.png"][0]=0;
 if(mode==9)middle.Insert(L"width",JsonValue::CreateNumberValue(2401));
 auto settings=manifest.GetNamedObject(L"document").GetNamedObject(L"timelapse");
 if(mode==10){middle.Insert(L"width",JsonValue::CreateStringValue(L" 4 "));middle.Insert(L"height",JsonValue::CreateStringValue(L"0x4"));middle.Insert(L"capturedAt",JsonValue::CreateStringValue(L"19.8"));middle.Insert(L"elapsedMs",JsonValue::CreateStringValue(L"bad"));middle.Insert(L"changeScore",JsonValue::CreateStringValue(L"0.9"));}
 if(mode==11){settings.Insert(L"enabled",JsonValue::CreateStringValue(L"true"));settings.Insert(L"recordUndoSteps",JsonValue::CreateNumberValue(1));settings.Insert(L"quality",JsonValue::CreateBooleanValue(false));settings.Insert(L"fps",JsonValue::CreateStringValue(L"24"));settings.Insert(L"speed",JsonValue::CreateBooleanValue(true));settings.Insert(L"mode",JsonObject{});}
 if(mode==12)settings.Insert(L"snapshots",JsonObject{});
 if(mode==13)manifest.GetNamedObject(L"document").Insert(L"timelapse",JsonValue::CreateNullValue());
 if(mode==14){JsonObject ignored;ignored.Insert(L"futureLocalField",JsonValue::CreateBooleanValue(true));middle.Insert(L"local",ignored);}
 if(mode==15||mode==16||mode==22){JsonObject local;local.Insert(L"store",JsonValue::CreateStringValue(L"store"));local.Insert(L"chunk",JsonValue::CreateStringValue(L"chunk"));local.Insert(L"offset",mode==22?IJsonValue(JsonValue::CreateStringValue(L"0")):IJsonValue(JsonValue::CreateNumberValue(0)));local.Insert(L"length",JsonValue::CreateNumberValue(16));local.Insert(L"checksum",JsonValue::CreateNumberValue(42));middle.Insert(L"local",local);if(mode==15)middle.Insert(L"dataFile",JsonValue::CreateStringValue(L""));else if(mode==16)middle.Insert(L"dataFile",JsonValue::CreateNumberValue(17));else middle.Remove(L"dataFile");}
 if(mode==17){middle.Insert(L"width",JsonArray::Parse(L"[4]"));middle.Insert(L"height",JsonArray::Parse(L"[[4]]"));middle.Insert(L"capturedAt",JsonArray::Parse(L"[19.8]"));middle.Insert(L"elapsedMs",JsonValue::CreateBooleanValue(true));middle.Insert(L"changeScore",JsonValue::CreateBooleanValue(true));}
 if(mode==18||mode==19)middle.Insert(L"width",JsonValue::CreateStringValue(mode==18?L"not-a-number":L"4.5"));
 if(mode==20)manifest.GetNamedObject(L"document").Insert(L"timelapse",JsonArray{});
 if(mode==21){settings.Insert(L"fps",JsonValue::CreateNumberValue(12.5));settings.Insert(L"speed",JsonValue::CreateNumberValue(999));settings.Insert(L"quality",JsonValue::CreateStringValue(L"high"));middle.Insert(L"changeScore",JsonValue::CreateNumberValue(1.5));middle.Insert(L"capturedAt",JsonValue::CreateNumberValue(-8.5));middle.Insert(L"elapsedMs",JsonValue::CreateStringValue(L"-3"));}
 auto text=winrt::to_string(manifest.Stringify());files["manifest.json"]={text.begin(),text.end()};return std::make_shared<project::Bytes>(recordingZip(files));
}
}
