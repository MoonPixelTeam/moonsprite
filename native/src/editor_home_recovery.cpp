#include "recovery_commit.h"
#include "editor_implementation.h"
#include "editor.h"
namespace moon::editor {
void Editor::discardHomeRecovery(const std::string& id){
 if(pending_!=Pending::None||recoveryCatalogWorker_.valid()||recoveryDiscardWorker_.valid()||!recoveryCatalog_.find(id)||!project::isSafeRecoveryId(id))return;
 // Legacy workspace-commands-recovery suppresses autosave before enqueuing
 // deletion, including on failure. Wait for any already issued writer off UI.
 std::vector<std::future<void>> previous;
 auto suppress=[&](RecoverySession& session){if(session.originId!=id&&session.ownedId!=id)return;session.suppressed=true;session.snapshot.reset();if(session.ticket)session.queue.complete(*session.ticket,false);session.ticket.reset();if(session.worker.valid())previous.push_back(std::move(session.worker));};
 suppress(recovery_);for(std::size_t i=0;i<projects_.size();++i)if(i!=activeProject_)suppress(projects_[i]->recovery);
 const auto directory=recoveryDirectory();recoveryDiscardId_=id;
 recoveryDiscardWorker_=std::async(std::launch::async,[previous=std::move(previous),directory,id]()mutable{for(auto& worker:previous)try{worker.get();}catch(...){}project::removeOwnedRecovery(directory,id);});
 status_=U"正在放弃恢复草稿";invalidate();
}
void Editor::homeRecoveryTick(){
 if(recoveryCatalogWorker_.valid()&&recoveryCatalogWorker_.wait_for(std::chrono::milliseconds(0))==std::future_status::ready){
  try{recoveryCatalog_.loaded(recoveryCatalogWorker_.get());if(recoveryCatalog_.visible())status_=U"发现可恢复工程 · 文件 → 恢复工程";}
  catch(const std::exception&){recoveryCatalog_.loadFailed("Cannot list recovery records");status_=U"读取恢复记录失败";}
  if(homeOpen_)refresh();
 }
 if(!recoveryDiscardWorker_.valid()||recoveryDiscardWorker_.wait_for(std::chrono::milliseconds(0))!=std::future_status::ready)return;
 const auto id=std::move(recoveryDiscardId_);recoveryDiscardId_.clear();
 try{recoveryDiscardWorker_.get();recoveryCatalog_.markDiscarded(id);auto clear=[&](RecoverySession& session){if(session.originId==id)session.originId.clear();if(session.ownedId==id){session.ownedId.clear();session.cleanup.reset();}};clear(recovery_);for(auto& slot:projects_)clear(slot->recovery);status_=U"已放弃并删除恢复草稿";}
 catch(const std::exception& e){status_=U"恢复草稿删除失败："+unicodeText(e.what());}
 homeEntries_.clear();for(const auto& record:recoveryCatalog_.rows())homeEntries_.push_back({unicodeText(record.name),recoveryDirectory()/std::filesystem::u8path(record.id+".moonsprite"),record.id});if(homeOpen_)refresh();else invalidate();
}
void Editor::smokeHomeRecoveries(){
 smoke_=true;pending_=Pending::None;documentOpen_=false;homeOpen_=true;homeSection_=2;homeSectionId_="recovery";
 recentSettingsOverride_=assets_.parent_path()/("home-recovery-test-owned-"+std::to_string(recent::now()));recoveryDirectory_=recentSettingsOverride_/"recovery";std::filesystem::create_directories(recoveryDirectory_);std::ofstream(recentSettingsOverride_/"test-owned.marker")<<"Recovery operation tests only";
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};
 Document seed(3,2);seed.beginStroke({2,1},0xff123456);seed.commitStroke();const auto savedPixels=seed.pixels();auto bytes=project::encodeRecoveryProject(seed);project::writeRecoveryFiles(recoveryDirectory_,{"complete","完整作品",std::to_string(recent::now())},*bytes.bytes);
 project::writeRecoveryFiles(recoveryDirectory_,{"broken","损坏草稿",std::to_string(recent::now()-1)},{1,2,3});
 loadHomeSection();refresh();check(recentPane_->count()==2,"Recovery cards not populated");
 auto index=[&](const std::string& id){for(std::size_t i=0;i<recoveryCatalog_.rows().size();++i)if(recoveryCatalog_.rows()[i].id==id)return i;throw std::runtime_error("Missing recovery row");};
 auto until=GetTickCount64()+8000;while(!recentPane_->smokePreview(index("complete"))&&GetTickCount64()<until)Sleep(5);check(recentPane_->smokePreview(index("complete")),"Recovery preview not uploaded");
 check(recentPane_->smokeCard(0).h==90*uiScale,"Recovery four-line geometry");
 recentPane_->smokeOpen(index("broken"));check(pending_==Pending::OpenError&&recoveryCatalog_.find("broken"),"Corrupt recovery did not retain error row");resolve(false);refresh();
 ui::Manager::getDefault()->dispatchMessages();writeSmokeFrame(display()->nativeSurface().get(),recentSettingsOverride_/"home-recovery-smoke.bmp");
 recentPane_->smokeOpen(index("complete"));check(pending_==Pending::None&&document.dirty()&&documentPath_.empty()&&document.pixels()==savedPixels&&recovery_.originId=="complete"&&recovery_.ownedId=="complete","Recovery restore pixels, source ownership and unsaved state");
 recoveryTick(true);until=GetTickCount64()+8000;while((recovery_.ticket||recovery_.snapshot||recovery_.worker.valid())&&GetTickCount64()<until){if(recovery_.worker.valid())recovery_.worker.wait();recoveryTick(true);}check(project::listRecoveryRecords(recoveryDirectory_).size()==2,"Recovered autosave duplicated source ID");
 showHome(true);loadHomeSection();refresh();
 const auto lockedPath=recoveryDirectory_/"broken.moonsprite";HANDLE handle=CreateFileW(lockedPath.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);check(handle!=INVALID_HANDLE_VALUE,"Owned locked recovery setup");
 recentPane_->smokeRemove(index("broken"));until=GetTickCount64()+8000;while(recoveryDiscardWorker_.valid()&&GetTickCount64()<until){homeRecoveryTick();Sleep(2);}CloseHandle(handle);check(recoveryCatalog_.find("broken")&&std::filesystem::exists(lockedPath),"Failed discard lost record");
 recentPane_->smokeRemove(index("broken"));until=GetTickCount64()+8000;while(recoveryDiscardWorker_.valid()&&GetTickCount64()<until){homeRecoveryTick();Sleep(2);}check(!recoveryCatalog_.find("broken")&&!std::filesystem::exists(lockedPath),"Discard retry did not remove owned files");
 recentPane_->smokeRemove(index("complete"));until=GetTickCount64()+8000;while(recoveryDiscardWorker_.valid()&&GetTickCount64()<until){homeRecoveryTick();Sleep(2);}check(recoveryCatalog_.count()==0&&document.pixels()==savedPixels&&document.dirty()&&recovery_.suppressed&&recovery_.originId.empty(),"Discard changed live drawing or retained origin");recoveryTick(true);check(project::listRecoveryRecords(recoveryDirectory_).empty()&&!recovery_.worker.valid(),"Discarded recovery recreated");
 project::writeRecoveryFiles(recoveryDirectory_,{"save-source","保存来源",std::to_string(recent::now())},*bytes.bytes);restoreRecovery(recoveryDirectory_/"save-source.moonsprite","save-source",U"保存来源");if(pending_==Pending::Open)resolve(true);check(recovery_.originId=="save-source","Restored source missing before save");check(savePath(recentSettingsOverride_/"restored.moonsprite"),"Recovered document save failed");check(!std::filesystem::exists(recoveryDirectory_/"save-source.moonsprite")&&recovery_.originId.empty()&&!document.dirty(),"Successful save retained source recovery");
 project::writeRecoveryFiles(recoveryDirectory_,{"close-source","关闭来源",std::to_string(recent::now())},*bytes.bytes);restoreRecovery(recoveryDirectory_/"close-source.moonsprite","close-source",U"关闭来源");check(recovery_.originId=="close-source","Close source not attached");closeDocumentTab();check(std::filesystem::exists(recoveryDirectory_/"close-source.moonsprite"),"Closing recovered tab deleted recovery origin");showHome(true);loadHomeSection();refresh();
 // Interrupted payload-only commit is discoverable through the actual home UI.
 {std::ofstream orphan(recoveryDirectory_/"orphan-source.moonsprite",std::ios::binary);orphan.write(reinterpret_cast<const char*>(bytes.bytes->data()),std::streamsize(bytes.bytes->size()));check(bool(orphan),"Orphan recovery fixture write");}
 loadHomeSection();refresh();check(recoveryCatalog_.find("orphan-source")&&!std::filesystem::exists(recoveryDirectory_/"orphan-source.json"),"Payload-only recovery not discovered");
 recentPane_->smokeOpen(index("orphan-source"));check(pending_==Pending::None&&document.dirty()&&documentPath_.empty()&&document.pixels()==savedPixels&&recovery_.originId=="orphan-source"&&document.name()==seed.name()+U"（恢复）","Orphan recovery actual restore and archive name");
 showHome(true);loadHomeSection();refresh();recentPane_->smokeRemove(index("orphan-source"));until=GetTickCount64()+8000;while(recoveryDiscardWorker_.valid()&&GetTickCount64()<until){homeRecoveryTick();Sleep(2);}check(!recoveryCatalog_.find("orphan-source")&&!std::filesystem::exists(recoveryDirectory_/"orphan-source.moonsprite")&&document.pixels()==savedPixels,"Orphan recovery discard lost live pixels");
 // Independent binary fixture for a pending name equal to its safe ID. The
 // archive still has a different name and the public JSON is intentionally old.
 project::writeRecoveryFiles(recoveryDirectory_,{"pending-id","old pending name","1700000000000"},*bytes.bytes);
 const auto metadata=project::encodeRecoveryRecord({"pending-id","pending-id","1900000000000"});project::Bytes descriptor{'M','S','R','E','C','0','1','\n'};const auto length=std::uint64_t(bytes.bytes->size());for(int i=0;i<8;++i)descriptor.push_back(std::uint8_t(length>>(8*i)));
 std::uint32_t crc=~0u;for(auto byte:*bytes.bytes){crc^=byte;for(int bit=0;bit<8;++bit)crc=(crc>>1)^(0xedb88320u&(0u-(crc&1u)));}crc=~crc;for(int i=0;i<4;++i)descriptor.push_back(std::uint8_t(crc>>(8*i)));descriptor.insert(descriptor.end(),metadata.begin(),metadata.end());
 {std::ofstream file(recoveryDirectory_/"pending-id.recovery-pending",std::ios::binary);file.write(reinterpret_cast<const char*>(descriptor.data()),std::streamsize(descriptor.size()));check(bool(file),"Pending descriptor fixture write");}
 loadHomeSection();refresh();check(recoveryCatalog_.find("pending-id")&&recoveryCatalog_.find("pending-id")->name=="pending-id","Pending metadata not authoritative in home list");recentPane_->smokeOpen(index("pending-id"));check(pending_==Pending::None&&document.name()==U"pending-id（恢复）"&&document.pixels()==savedPixels&&recovery_.originId=="pending-id","Pending name equal to ID restored archive fallback instead");
 recoveryTick(true);until=GetTickCount64()+8000;while((recovery_.ticket||recovery_.snapshot||recovery_.worker.valid())&&GetTickCount64()<until){if(recovery_.worker.valid())recovery_.worker.wait();recoveryTick(true);}check(!std::filesystem::exists(recoveryDirectory_/"pending-id.recovery-pending")&&!project::readPendingRecoveryRecord(recoveryDirectory_/"pending-id.moonsprite","pending-id"),"Autosave did not complete interrupted descriptor");
 showHome(true);loadHomeSection();refresh();recentPane_->smokeRemove(index("pending-id"));until=GetTickCount64()+8000;while(recoveryDiscardWorker_.valid()&&GetTickCount64()<until){homeRecoveryTick();Sleep(2);}check(!recoveryCatalog_.find("pending-id")&&document.pixels()==savedPixels,"Pending recovery discard lost live drawing");
 std::vector<project::RecoveryRecord> many;for(int i=0;i<10000;++i)many.push_back({"row-"+std::to_string(i),"虚拟恢复行","0"});recentPane_->setRecoveries(many,recoveryDirectory_,7);recentPane_->smokeScrollTo(5000*92*uiScale);check(recentPane_->count()==10000&&recentPane_->controlRows()<128,"Recovery list created every control");
 auto bar=recentPane_->smokeScrollBar();check(bar->isVisible(),"Recovery scrollbar hidden");auto point=bar->thumbBounds().center();const auto before=recentPane_->smokeScroll();ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);bar->onProcessMessage(&down);check(bar->hasCapture(),"Recovery scrollbar capture");point.y+=3;ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);bar->onProcessMessage(&move);ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,point);bar->onProcessMessage(&up);check(!bar->hasCapture()&&recentPane_->smokeScroll()!=before,"Recovery scrollbar drag mapping");recentPane_->setActive(false);
}
}
