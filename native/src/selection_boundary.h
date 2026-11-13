#pragma once
#include "selection_model.h"
#include <array>
#include <cstdint>

namespace moon {
// Legacy selection-boundary.ts merged runs, restricted to the visible source
// pixels. Cache geometry independently of the ants phase and display transform.
// Document must advance selectionRevision for every published selection change.
class SelectionBoundaryCache {
public:
  using Segment=std::array<int,4>;
  static constexpr std::size_t maxSegments=262144; // At most 4 MiB of coordinates.
  explicit SelectionBoundaryCache(std::size_t limit=maxSegments):limit_(std::min(limit,maxSegments)){}
  const std::vector<Segment>* get(const std::optional<SelectionMask>& selection,
      std::uint64_t identity,std::uint64_t revision,int left,int top,int right,int bottom){
    const Key next{identity,revision,{left,top,right,bottom}};
    if(valid_&&key_==next)return cacheable_?&segments_:nullptr;
    key_=next;valid_=false;cacheable_=true;segments_.clear();++builds_;
    if(!selection){valid_=true;return &segments_;}
    const auto& s=*selection;
    left=std::max(left,s.x);top=std::max(top,s.y);
    right=std::min(right,s.x+s.width);bottom=std::min(bottom,s.y+s.height);
    if(left>=right||top>=bottom){valid_=true;return &segments_;}
    auto selected=[&](int x,int y){
      if(x<s.x||y<s.y||x>=s.x+s.width||y>=s.y+s.height)return false;
      const auto index=std::size_t(y-s.y)*s.width+x-s.x;
      return s.mask.empty()||(index<s.mask.size()&&s.mask[index]==1);
    };
    auto append=[&](int x,int y,int x2,int y2){
      if(segments_.size()>=limit_){cacheable_=false;valid_=true;std::vector<Segment>().swap(segments_);return false;}
      if(segments_.size()==segments_.capacity())segments_.reserve(std::min(limit_,std::max<std::size_t>(16,segments_.capacity()*2)));
      segments_.push_back({x,y,x2,y2});return true;
    };
    for(int y=top;y<=bottom;++y){
      int start=left;bool active=false;
      for(int x=left;x<=right;++x){
        const bool above=selected(x,y-1),below=selected(x,y);
        const bool boundary=x<right&&above!=below&&((above&&y>top)||(below&&y<bottom));
        if(boundary&&!active){start=x;active=true;}
        else if(!boundary&&active){if(!append(start,y,x,y))return nullptr;active=false;}
      }
    }
    for(int x=left;x<=right;++x){
      int start=top;bool active=false;
      for(int y=top;y<=bottom;++y){
        const bool before=selected(x-1,y),after=selected(x,y);
        const bool boundary=y<bottom&&before!=after&&((before&&x>left)||(after&&x<right));
        if(boundary&&!active){start=y;active=true;}
        else if(!boundary&&active){if(!append(x,start,x,y))return nullptr;active=false;}
      }
    }
    valid_=true;return &segments_;
  }
  std::size_t builds()const{return builds_;}
private:
  struct Key {
    std::uint64_t identity,revision;std::array<int,4> bounds;
    bool operator==(const Key& other)const{return identity==other.identity&&revision==other.revision&&bounds==other.bounds;}
  };
  Key key_{};bool valid_=false,cacheable_=true;
  std::size_t limit_,builds_=0;
  std::vector<Segment> segments_;
};
}
