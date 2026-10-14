#include "recovery_catalog.h"
#include <stdexcept>
#include <iostream>
using namespace moon::recovery;
void check(bool value){if(!value)throw std::runtime_error("Recovery catalog contract failed");}
int main(){
 RecoveryCatalog model;
 check(model.status()==CatalogStatus::Unloaded && !model.visible());
 check(model.beginLoad(true)); check(!model.beginLoad(true)); check(!model.beginLoad());
 check(model.loaded({{"old","旧工程","100"},{"new","新工程","200"}}));
 check(model.count()==2 && model.visible() && model.rows()[0].id=="new");
 check(!model.beginLoad(true)); check(!model.loaded({}));
 // Looking up a restore candidate must leave it available after failure/cancel.
 check(model.find("old") && model.find("old")->name=="旧工程");
 check(!model.find("missing") && model.count()==2);
 check(!model.markDiscarded("missing")); check(model.markDiscarded("old"));
 check(model.count()==1 && !model.find("old"));
 check(model.beginLoad()); check(model.loadFailed("read error"));
 check(model.status()==CatalogStatus::Failed && !model.visible() && model.error()=="read error");
 check(!model.beginLoad(true)); check(model.beginLoad());
 check(model.error().empty()); check(model.loaded({}));
 check(model.status()==CatalogStatus::Ready && !model.visible());
 // Follow the platform's lexicographic order, not an invented timestamp parser.
 check(model.beginLoad()); check(model.loaded({{"x","X","99"},{"y","Y","100"}}));
 check(model.rows()[0].id=="x");
 std::cout<<"Recovery catalog contracts passed\n";
}
