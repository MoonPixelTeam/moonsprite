#include "recovery_scheduler.h"
#include <iostream>
#include <stdexcept>
using namespace moon::recovery;void ck(bool b){if(!b)throw std::runtime_error("recovery contract failed");}
int main(){try{
 Scheduler s;ck(s.intervalMinutes()==5);ck(Scheduler::normalizeMinutes(.1)==.5&&Scheduler::normalizeMinutes(99)==60);
 Target a{"a","draft",1,2,true,true};s.request(a);auto t=s.next();ck(t&&t->kind==Kind::Save&&s.busy());
 Target newer{"a","draft",2,3,true,true};s.request(newer);ck(s.pendingCount()==1);ck(s.complete(*t,false));ck(!s.hasSavedRevision(a));auto t2=s.next();ck(t2&&t2->target.revision==2);ck(s.complete(*t2,true));ck(s.hasSavedRevision(newer));s.request(newer);ck(!s.next());
 s.requestDelete("a");ck(s.pendingCount()==1);auto td=s.next();ck(td&&td->kind==Kind::Delete);ck(!s.complete(*t2,true));ck(s.complete(*td,true));ck(!s.hasSavedRevision(newer));
 s.request(a);auto t3=s.next();ck(bool(t3));s.requestDelete("a");ck(s.complete(*t3,true));auto td2=s.next();ck(td2&&td2->kind==Kind::Delete);ck(s.complete(*td2,true));
 // Latest-only per ID with serial cross-document order; no-revision targets
 // never deduplicate, including names equal to IDs.
 Target b{"b","b",0,0,false,false};s.request(b);auto first=s.next();ck(first&&first->kind==Kind::Save);s.complete(*first,true);
 s.request(b);auto again=s.next();ck(bool(again));s.complete(*again,true);
 s.request(a);auto in=s.next();s.request(newer);s.request(b);newer.revision=20;s.request(newer);ck(s.pendingCount()==2);
 s.complete(*in,true);auto latest=s.next();ck(latest&&latest->target.revision==20);s.complete(*latest,true);auto other=s.next();ck(other&&other->target.id=="b");s.complete(*other,true);
 s.requestDelete("a");s.request(newer);auto deletion=s.next();ck(deletion&&deletion->kind==Kind::Delete);s.complete(*deletion,true);auto afterDelete=s.next();ck(bool(afterDelete));s.complete(*afterDelete,false);s.request(newer);ck(bool(s.next()));
 bool bad=false;try{s.request(Target{});}catch(...){bad=true;}ck(bad);std::cout<<"recovery scheduler contract passed\n";return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
