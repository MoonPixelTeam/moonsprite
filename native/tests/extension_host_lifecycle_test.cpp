#include "extension_contract_session.h"
#include <iostream>
int main(){moon::extension::HostLifecycle h;h.addWindow("w");h.addPendingRead("r");if(!h.active()||h.windowCount()!=1||h.pendingCount()!=1||!h.dropPolicy().enabled)return 1;h.deactivate();if(h.active()||h.windowCount()!=0||h.pendingCount()!=0||h.dropPolicy().enabled||h.dropPolicy().generation!=1)return 1;std::cout<<"host lifecycle passed\n";}
