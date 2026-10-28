#pragma once
#include "animation_transform.h"
#include "shape_model.h"
#include <algorithm>
#include <optional>
namespace moon {
using TweenPath=std::vector<TweenPathPoint>;
inline bool tweenPathEqual(const TweenPath& a,const TweenPath& b){if(a.size()!=b.size())return false;for(std::size_t i=0;i<a.size();++i)if(a[i].x!=b[i].x||a[i].y!=b[i].y)return false;return true;}
inline bool tweenPathReady(const TweenPath& p){return std::any_of(p.begin(),p.end(),[](auto v){return v.x!=0||v.y!=0;});}
inline double tweenPathClamp(double x){return std::clamp(std::floor(x),-16384.,16384.);}
inline void appendTweenPerfectPixel(TweenPath& path,TweenPathPoint target){if(path.empty()){path.push_back(target);return;}auto a=path.back();int x=int(a.x),y=int(a.y),tx=int(target.x),ty=int(target.y),dx=std::abs(tx-x),sx=x<tx?1:-1,dy=-std::abs(ty-y),sy=y<ty?1:-1,error=dx+dy;while(x!=tx||y!=ty){int twice=error*2;if(twice>=dy){error+=dy;x+=sx;}if(twice<=dx){error+=dx;y+=sy;}TweenPathPoint p{double(x),double(y)};if(path.size()>=2){const auto before=path[path.size()-2],previous=path.back();if(std::abs(p.x-before.x)==1&&std::abs(p.y-before.y)==1&&((previous.x==before.x&&previous.y==p.y)||(previous.y==before.y&&previous.x==p.x)))path.pop_back();}if(path.empty()||path.back().x!=p.x||path.back().y!=p.y)path.push_back(p);}}
inline TweenPath extendTweenPath(const TweenPath& path,TweenPathPoint target,bool constrained=false){if(path.empty())return {{0,0}};if(constrained){auto p=constrainShapeLine({path.back().x,path.back().y},{target.x,target.y});target={p.x,p.y};}if(target.x==path.back().x&&target.y==path.back().y)return path;TweenPath tail;const auto n=path.size();for(std::size_t i=n>2?n-2:0;i<n;++i)appendTweenPerfectPixel(tail,path[i]);appendTweenPerfectPixel(tail,target);TweenPath result(path.begin(),path.begin()+(n>2?n-2:0));for(auto p:tail){if(result.size()>=2){const auto a=result[result.size()-2],b=result.back();if((b.x-a.x)*(p.y-b.y)==(b.y-a.y)*(p.x-b.x)&&(b.x-a.x)*(p.x-b.x)+(b.y-a.y)*(p.y-b.y)>0)result.pop_back();}result.push_back(p);}return result.size()<=2048?result:path;}
struct TweenPathDraft {TweenPath path{{0,0}};TweenPathPoint anchor;};
inline bool tweenPathDraftEqual(const TweenPathDraft& a,const TweenPathDraft& b){return a.anchor.x==b.anchor.x&&a.anchor.y==b.anchor.y&&tweenPathEqual(a.path,b.path);}
struct TweenPathHistory {TweenPathDraft present;std::vector<TweenPathDraft> past,future;void commit(TweenPathDraft next){if(tweenPathDraftEqual(next,present))return;if(past.size()>=50)past.erase(past.begin());past.push_back(present);present=std::move(next);future.clear();}void undo(){if(past.empty())return;future.push_back(present);present=past.back();past.pop_back();}void redo(){if(future.empty())return;past.push_back(present);present=future.back();future.pop_back();}};
}
