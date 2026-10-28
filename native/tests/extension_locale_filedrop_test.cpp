#include "extension_contract_session.h"
#include <iostream>
int main(){using namespace moon::extension;auto e=localeEvents("en-US",{"en-US","zh-CN","zh-CN",""});if(e.size()!=2||e[1]!="zh-CN")return 1;FileDropPolicy p;p.extensions={"png","gif"};if(!acceptFileDrop(p,"A.PNG",10,0)||acceptFileDrop(p,"A.txt",10,0)||acceptFileDrop(p,"A.png",12u*1024u*1024u+1,0))return 1;p.generation=2;if(acceptFileDrop(p,"A.png",1,1))return 1;p.enabled=false;if(acceptFileDrop(p,"A.png",1,2))return 1;std::cout<<"locale/file-drop passed\n";}
