#include "local_history_policy.h"
#include "local_history_store.h"
#include "local_history_restore.h"
#include "document.h"
#include "project_encode.h"
#include "image_export.h"
#include <windows.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <roapi.h>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#define CHECK(value) do{if(!(value))throw std::runtime_error("History policy check failed: " #value);}while(0)
using namespace moon;
using namespace winrt::Windows::Data::Json;
template<class F> void reject(F operation){bool failed=false;try{operation();}catch(const std::exception&){failed=true;}CHECK(failed);}
int wmain(int argc,wchar_t** argv){const auto initialized=RoInitialize(RO_INIT_MULTITHREADED);try{{
 CHECK(argc==3);std::ifstream fixture(argv[1],std::ios::binary);CHECK(bool(fixture));const std::string text((std::istreambuf_iterator<char>(fixture)),{});const auto fixtures=JsonObject::Parse(winrt::to_hstring(text));
 for(const auto& input:fixtures.GetNamedArray(L"keys")){const auto row=input.GetObject();
  auto field=[&](const wchar_t* name){return std::wstring(row.GetNamedString(name));};const auto locale=winrt::to_string(row.GetNamedString(L"locale"));
  const auto expected=winrt::to_string(row.GetNamedString(L"expected"));const auto actual=local_history::historyKey(field(L"filePath"),field(L"sourceFilePath"),field(L"id"),locale.c_str());
  if(actual!=expected){std::cerr<<"Expected "<<expected<<" got "<<actual<<'\n';throw std::runtime_error("Legacy identity mismatch");}
 }
 CHECK(local_history::historyKey(L"D:/ABC",L"",L"", "tr")==local_history::historyKey(L"d:/abc",L"",L"", "tr"));
 CHECK(local_history::historyKey(L"D:/I",L"",L"", "tr")!=local_history::historyKey(L"d:/i",L"",L"", "tr"));
 CHECK(local_history::historyKey(L"D:/ABC",L"",L"")==local_history::historyKey(L"d:/abc",L"",L""));
 for(const auto& input:fixtures.GetNamedArray(L"steps")){const auto row=input.GetObject();const auto value=row.GetNamedValue(L"text");const auto result=local_history::parseHistorySteps(value.ValueType()==JsonValueType::Null?std::optional<std::wstring>{}:std::wstring(value.GetString()));CHECK(result==row.GetNamedNumber(L"expected"));}
 for(const auto& input:fixtures.GetNamedArray(L"windows")){const auto row=input.GetObject(),expected=row.GetNamedObject(L"expected");const auto total=std::size_t(row.GetNamedNumber(L"total"));const auto raw=row.GetNamedNumber(L"position");const auto position=std::size_t(std::clamp(std::trunc(raw),0.,double(total)));const auto limit=row.GetNamedValue(L"limit");const auto result=local_history::restoreWindow(total,position,limit.ValueType()==JsonValueType::Null?std::optional<std::size_t>{}:std::size_t(limit.GetNumber()));CHECK(result.begin==expected.GetNamedNumber(L"begin")&&result.end==expected.GetNamedNumber(L"end")&&result.position==expected.GetNamedNumber(L"position"));CHECK(result.begin+result.position==position&&result.end<=total);}
 for(const auto& input:fixtures.GetNamedArray(L"fingerprints")){const auto row=input.GetObject();local_history::Fingerprint fields;fields.updatedAt=winrt::to_string(row.GetNamedString(L"updatedAt"));fields.width=int(row.GetNamedNumber(L"width"));fields.height=int(row.GetNamedNumber(L"height"));fields.colorMode=winrt::to_string(row.GetNamedString(L"colorMode"));
  if(row.HasKey(L"animation"))fields.activeFrameId=winrt::to_string(row.GetNamedObject(L"animation").GetNamedString(L"activeFrameId"));
  for(const auto& value:row.GetNamedArray(L"layers")){const auto layer=value.GetObject();fields.layers.push_back({winrt::to_string(layer.GetNamedString(L"id")),int(layer.GetNamedNumber(L"width")),int(layer.GetNamedNumber(L"height")),int(layer.GetNamedNumber(L"offsetX")),int(layer.GetNamedNumber(L"offsetY")),winrt::to_string(layer.GetNamedString(L"format"))});}
  const auto actual=local_history::documentFingerprint(fields),expected=winrt::to_string(row.GetNamedString(L"expected"));if(actual!=expected){std::cerr<<"Fingerprint expected "<<expected<<" got "<<actual<<'\n';throw std::runtime_error("Legacy fingerprint mismatch");}
 }
 Document document(4,4);const auto originalFingerprint=local_history::documentFingerprint(document);const auto identity=document.identity(),revision=document.revision(),history=document.historySize();
 local_history::RestoreTicket ticket(document);using Decision=local_history::RestoreDecision;
 CHECK(ticket.decision(document,originalFingerprint)==Decision::Ready);CHECK(ticket.decision(document,{})==Decision::Ready);
 CHECK(ticket.decision(document,"older-saved-generation")==Decision::SavedGenerationMismatch);CHECK(document.identity()==identity&&document.revision()==revision&&document.historySize()==history);
 Document other(4,4);CHECK(ticket.decision(other,{})==Decision::LiveDocumentChanged);
 document.beginStroke({0,0},0xff102030);CHECK(ticket.decision(document,{})==Decision::LiveDocumentChanged);document.commitStroke();CHECK(ticket.decision(document,{})==Decision::LiveDocumentChanged);document.undo();CHECK(ticket.decision(document,{})==Decision::LiveDocumentChanged);
 // Frame views invalidate rendered content, but not the mutation generation.
 Document viewing(3,3);viewing.addFrame();const auto originalFrame=viewing.frame().id;const auto otherFrame=viewing.timeline().state().frames.front().id;const auto savedView=local_history::documentFingerprint(viewing);local_history::RestoreTicket viewTicket(viewing);const auto rendered=viewing.contentRevision(),mutations=viewing.contentMutationRevision();viewing.selectFrame(otherFrame);CHECK(viewing.contentRevision()>rendered&&viewing.contentMutationRevision()==mutations);CHECK(viewTicket.decision(viewing,{})==Decision::Ready);CHECK(viewTicket.decision(viewing,savedView)==Decision::SavedGenerationMismatch);viewing.selectFrame(originalFrame);CHECK(viewTicket.decision(viewing,savedView)==Decision::Ready);
 local_history::RestoreTicket canceledTicket(viewing);viewing.beginStroke({0,0},0xff123456);viewing.cancelStroke();CHECK(canceledTicket.decision(viewing,{})==Decision::LiveDocumentChanged);
 Document historyOnly(2,2);historyOnly.addLayer();historyOnly.addLayer();local_history::RestoreTicket historyTicket(historyOnly);const auto stableContent=historyOnly.contentRevision(),stableRevision=historyOnly.revision();historyOnly.setHistoryEntryLimit(1);CHECK(historyOnly.contentRevision()==stableContent&&historyOnly.revision()==stableRevision);CHECK(historyTicket.decision(historyOnly,{})==Decision::LiveDocumentChanged);
 local_history::RestoreTicket trimTicket(document);const auto content=document.contentRevision();document.setHistoryEntryLimit(1);document.redo();CHECK(trimTicket.decision(document,{})==Decision::LiveDocumentChanged);CHECK(document.contentRevision()!=content);
 CHECK(local_history::restoreWindow(100,200,2).position==2);CHECK(local_history::restoreWindow(5,0,0).end==1);
 // Actual native document -> native project -> actual legacy decoder is
 // checked by make-local-history-fixtures.cjs --verify, including active frame.
 Document sample(5,3);sample.addFrame();sample.addLayer();sample.beginStroke({2,1},0x80563412);sample.commitStroke();
 auto information=sample.projectInformation();information.updatedAt="2026-11-03T01:02:03.456Z";sample.setImportedProjectInformation(information);
 const auto encoded=project::encodeEditableProject(sample);const auto sharedFixtureRoot=std::filesystem::path(argv[1]).parent_path()/"local-history-fixtures";std::filesystem::create_directories(sharedFixtureRoot);
 {std::ofstream out(sharedFixtureRoot/"policy-native.moonsprite",std::ios::binary);out.write(reinterpret_cast<const char*>(encoded.bytes->data()),encoded.bytes->size());CHECK(bool(out));}
 {std::ofstream out(sharedFixtureRoot/"policy-native-fingerprint.txt",std::ios::binary);out<<local_history::documentFingerprint(sample);CHECK(bool(out));}
 // All writes use an isolated test-owned child; retain previous runs.
 const auto directory=std::filesystem::path(argv[2])/(L"中文目录&history-"+std::to_wstring(std::chrono::steady_clock::now().time_since_epoch().count()));
 const std::string key="project-Safe_1";const project::Bytes original{0,1,2,255},replacement{9,8,7,0,6};
 CHECK(local_history::safeHistoryId(key));for(const auto id:{"","../x","a/b","a\\b","a.b","c:abc","中文","a%20b"}){CHECK(!local_history::safeHistoryId(id));reject([&]{local_history::writeHistory(directory,id,original);});reject([&]{local_history::readHistory(directory,id);});}CHECK(!std::filesystem::exists(directory));
 reject([&]{local_history::readHistory(directory,key);});CHECK(!std::filesystem::exists(directory));
 local_history::writeHistory(directory,key,original);CHECK(local_history::readHistory(directory,key)==original);const auto target=directory/(key+".history");
 HANDLE locked=CreateFileW(target.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);CHECK(locked!=INVALID_HANDLE_VALUE);
 reject([&]{local_history::writeHistory(directory,key,replacement);});CHECK(local_history::readHistory(directory,key)==original);CloseHandle(locked);
 std::size_t files=0;for(const auto& entry:std::filesystem::directory_iterator(directory)){CHECK(entry.path()==target);++files;}CHECK(files==1);
 reject([&]{local_history::writeHistory(directory,key,replacement,2);});CHECK(local_history::readHistory(directory,key)==original);reject([&]{local_history::readHistory(directory,key,2);});
 local_history::writeHistory(directory,key,replacement);CHECK(local_history::readHistory(directory,key)==replacement);
 local_history::writeHistory(directory,key,{});CHECK(local_history::readHistory(directory,key).empty());
 // Image exports retain their existing empty-payload guard after writer sharing.
 reject([&]{writeExportBytesAtomic(directory/L"empty.png",{});});CHECK(!std::filesystem::exists(directory/L"empty.png"));
 local_history::writeHistory(directory,key,original);CHECK(local_history::readHistory(directory,key)==original);
 std::cout<<"Legacy UTF16 identity/limits/windows and binary history atomic replacement/failure protection passed\n";
 }winrt::clear_factory_cache();if(SUCCEEDED(initialized))RoUninitialize();return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';winrt::clear_factory_cache();if(SUCCEEDED(initialized))RoUninitialize();return 1;}}
