#include "extension_contract_session.h"
#include <iostream>
int main(){try{moon::extension::SessionRegistry r;r.open("s1","ext-a");auto a=r.emit("s1","undo","{}");if(a.sequence!=1||a.extensionId!="ext-a")return 1;auto b=r.emit("s1","redo","x");if(b.sequence!=2||!r.owns("s1","ext-a"))return 1;r.close("s1");try{r.emit("s1","x","");return 1;}catch(const std::runtime_error&){}std::cout<<"extension contract/session passed\n";return 0;}catch(...){return 1;}}
