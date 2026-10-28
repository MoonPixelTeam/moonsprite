#include "document.h"
#include "document_snapshot.h"
#include "project_encode.h"
#include "project_import.h"
#include <iostream>
#include <limits>
using namespace moon;using namespace moon::project;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
int main(){try{
 check(projectCounter(-1)==0&&projectCounter(.5)==0&&projectCounter(std::numeric_limits<double>::infinity())==0&&projectCounter(17)==17,"Legacy safe nonnegative integer metadata");
 check(projectDuration(360000123)=="100:00:00"&&projectDuration(999)=="00:00:00","Legacy duration floors seconds and retains hours");check(projectStorage(1024)=="1.0 KB"&&projectStorage(100*1024)=="100 KB","Legacy byte units");
 Document d(4,4);auto original=d.projectInformation();check(original.operationCount==0&&original.strokeCount==0&&!original.createdAt.empty()&&original.createdAt==original.updatedAt,"New project metadata defaults");
 d.beginStroke({0,0},0xff123456);d.cancelStroke();check(d.projectInformation().operationCount==0&&d.projectInformation().strokeCount==0,"Canceled preview must not count");
 d.beginStroke({0,0},0xff123456);d.commitStroke();check(d.projectInformation().operationCount==1&&d.projectInformation().strokeCount==1&&d.projectInformation().drawingTimeMs>=1,"One committed brush stroke activity");const auto duration=d.projectInformation().drawingTimeMs;
 d.beginStroke({0,0},0xff123456);d.commitStroke();check(d.projectInformation().operationCount==1&&d.projectInformation().strokeCount==1,"No-op stroke must not count");
 d.undo();d.redo();check(d.projectInformation().operationCount==3&&d.projectInformation().strokeCount==1&&d.projectInformation().drawingTimeMs==duration,"Legacy undo/redo counts operations without undoing stroke activity");
 const auto selectionHistory=d.historyPosition();d.commitSelection(std::nullopt,SelectionMask{0,0,2,2,{}});check(d.historyPosition()==selectionHistory+1,"Actual selection-only history entry");check(d.projectInformation().operationCount==3,"Selection-only history excluded");d.undo();check(d.projectInformation().operationCount==3,"Selection-only undo excluded");
 auto expected=d.projectInformation();expected.createdAt="2024-01-02T03:04:05.006Z";expected.updatedAt="2025-02-03T04:05:06.007Z";expected.strokeCount=42;expected.operationCount=81;expected.drawingTimeMs=123456;d.setImportedProjectInformation(expected);
 for(bool recovery:{false,true}){auto bytes=(recovery?encodeRecoveryProject(d):encodeEditableProject(d)).bytes;auto m=readProjectManifest(bytes);auto a=prepareEditableImport(m);check(a.information.createdAt==expected.createdAt&&a.information.updatedAt==expected.updatedAt&&a.information.strokeCount==42&&a.information.operationCount==81&&a.information.drawingTimeMs==123456,"Editable/recovery preserve exact project metadata");}
 DocumentSnapshot snapshot(d);while(!snapshot.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(1))){}auto copy=snapshot.finish();check(copy.projectInformation().createdAt==expected.createdAt&&copy.projectInformation().operationCount==81,"Stable snapshot carries statistics independently of history");
 Document backup(4,4);auto backupInfo=backup.projectInformation();backupInfo.createdAt="2020-01-01T00:00:00.000Z";backupInfo.operationCount=5;backupInfo.strokeCount=2;backupInfo.drawingTimeMs=999;backup.setImportedProjectInformation(backupInfo);
 check(d.rollbackProject(backup),"Rollback admitted");check(d.projectInformation().operationCount==6&&d.projectInformation().strokeCount==2&&d.projectInformation().createdAt==backupInfo.createdAt,"Legacy backup snapshot metadata plus rollback operation");d.undo();check(d.projectInformation().operationCount==82&&d.projectInformation().strokeCount==42&&d.projectInformation().createdAt==expected.createdAt,"Rollback undo restores previous document metadata then counts");d.redo();check(d.projectInformation().operationCount==6&&d.projectInformation().strokeCount==2,"Rollback redo restores backup metadata then counts");
 std::cout<<"Project information checks passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
