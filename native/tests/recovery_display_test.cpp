#include "recovery_display.h"
#include "fixtures/recovery_display_legacy.h"
#include <iostream>
int main(){for(const auto& c:recoveryDisplayFixtures){const auto value=moon::recovery::displayTimestamp(c.text);if(value!=c.timestamp){std::cerr<<"Timestamp mismatch: "<<c.text<<" "<<value<<" / "<<c.timestamp<<'\n';return 1;}int i=0;for(int days:{1,7,365})if(moon::recovery::remainingDays(value,days,1700000000000.)!=c.remaining[i++]){std::cerr<<"Remaining days mismatch\n";return 1;}}std::cout<<std::size(recoveryDisplayFixtures)<<" actual legacy timestamps / retention labels passed\n";}
