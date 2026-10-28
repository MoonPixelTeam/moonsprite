#include "help_articles.h"
#include "shortcut_model.h"
#include <set>
#include <stdexcept>
#include <iostream>
int main(){try{auto check=[](bool b){if(!b)throw std::runtime_error("Legacy help content fixture");};using namespace moon;check(help::helpArticles().size()==24&&help::tipsArticles().size()==14);check(help::helpArticles().front().id=="first-art"&&help::tipsArticles().front().id=="modifier-brushSizeAdjust");std::set<std::string> modifierCoverage;for(const auto* catalog:{&help::helpArticles(),&help::tipsArticles()}){std::set<std::string> ids;for(const auto& a:*catalog){check(ids.insert(a.id).second);check(!a.title[0].empty()&&!a.title[1].empty()&&!a.steps.empty());for(const auto& step:a.steps)check(!step[0].empty()&&!step[1].empty());for(const auto& id:a.shortcuts){check(shortcuts::find(id)!=nullptr);if(catalog==&help::tipsArticles()&&a.id.rfind("modifier-",0)==0)check(modifierCoverage.insert(id).second);}}}check(modifierCoverage.size()==13);std::cout<<"Legacy help24/tips14 bilingual content, unique topics, current shortcut references and all13 modifiers passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
