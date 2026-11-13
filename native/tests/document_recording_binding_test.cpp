#include "document.h"
#include <iostream>
#include <stdexcept>
#include <vector>

using namespace moon;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}

int main(){try{
 Document live(4,4),backup(6,6);
 live.mutableTimelapseSettings().enabled=true;
 backup.mutableTimelapseSettings().enabled=false;
 std::vector<bool> restored;
 live.setRecordingSession({}, {}, [&](const timelapse::Settings& value){restored.push_back(value.enabled);});
 check(live.rollbackProject(backup),"Rollback failed");
 check(restored==std::vector<bool>{false}&&live.width()==6,"Rollback restores bound settings");
 live.undo();
 check(restored==std::vector<bool>({false,true})&&live.width()==4,"Undo restores bound settings");
 live.redo();
 check(restored==std::vector<bool>({false,true,false})&&live.width()==6,"Redo restores bound settings");
 const auto count=restored.size();
 Document copied(live);check(copied.rollbackProject(backup),"Copied document rollback");
 check(restored.size()==count,"Copy constructor retained recording callback");
 Document assigned(2,2);assigned.setRecordingSession({}, {}, [&](const auto&){throw std::runtime_error("Copy assignment retained destination callback");});
 assigned=live;check(assigned.rollbackProject(backup),"Copy assigned rollback");
 check(restored.size()==count,"Copy assignment retained source recording callback");
 Document moved(std::move(live));check(moved.rollbackProject(backup),"Moved rollback");
 check(restored.size()==count+1,"Move constructor lost recording callback");
 Document moveAssigned(1,1);moveAssigned=std::move(moved);check(moveAssigned.rollbackProject(backup),"Move assigned rollback");
 check(restored.size()==count+2,"Move assignment lost recording callback");
 moveAssigned.setRecordingSession({},{});check(moveAssigned.rollbackProject(backup),"Detached rollback");
 check(restored.size()==count+2,"Detached binding retained settings callback");
 std::cout<<"Rollback recording notification, copy isolation, move preservation and detach passed without platform/UI linkage\n";
 return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
