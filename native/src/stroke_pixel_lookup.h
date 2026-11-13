#pragma once
#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <memory>
#include <stdexcept>
#include <utility>
#include <vector>

namespace moon {
// Legacy PixelEditPoints maps canvas indices to the first gesture delta.
// Allocate dense 64x64 pages only where this gesture actually changes pixels.
class StrokePixelLookup {
  static constexpr std::size_t side=64;
  using Page=std::array<int,side*side>;
  int width_=0,height_=0;std::size_t columns_=0;
  std::vector<std::unique_ptr<Page>> pages_;
  std::vector<std::size_t> used_;
  std::pair<std::size_t,std::size_t> address(std::size_t index)const{
    assert(width_>0&&index<std::size_t(width_)*std::size_t(height_));
    const auto x=index%std::size_t(width_),y=index/std::size_t(width_);
    return {(y/side)*columns_+x/side,(y%side)*side+x%side};
  }
public:
  StrokePixelLookup()=default;
  StrokePixelLookup(const StrokePixelLookup& other){
    reset(other.width_,other.height_);used_.reserve(other.used_.size());
    for(auto index:other.used_){pages_[index]=std::make_unique<Page>(*other.pages_[index]);used_.push_back(index);}
  }
  StrokePixelLookup& operator=(const StrokePixelLookup& other){if(this!=&other){StrokePixelLookup copy(other);swap(copy);}return *this;}
  StrokePixelLookup(StrokePixelLookup&& other)noexcept{swap(other);}
  StrokePixelLookup& operator=(StrokePixelLookup&& other)noexcept{if(this!=&other){StrokePixelLookup moved(std::move(other));swap(moved);}return *this;}
  void swap(StrokePixelLookup& other)noexcept{
    std::swap(width_,other.width_);std::swap(height_,other.height_);std::swap(columns_,other.columns_);pages_.swap(other.pages_);used_.swap(other.used_);
  }
  void clear()noexcept{for(auto index:used_)pages_[index].reset();used_.clear();}
  void reset(int width,int height){
    if(width<0||height<0||(width==0)!=(height==0))throw std::invalid_argument("Invalid stroke lookup dimensions");
    if(width_==width&&height_==height){clear();return;}
    const auto columns=(std::size_t(width)+side-1)/side,rows=(std::size_t(height)+side-1)/side;
    std::vector<std::unique_ptr<Page>> next(columns*rows);pages_.swap(next);used_.clear();width_=width;height_=height;columns_=columns;
  }
  int operator[](std::size_t index)const{
    const auto a=address(index);return pages_[a.first]?(*pages_[a.first])[a.second]:-1;
  }
  void set(std::size_t index,int value){
    const auto a=address(index);auto& page=pages_[a.first];
    if(!page){
      if(value<0)return;
      auto next=std::make_unique<Page>();next->fill(-1);
      used_.push_back(a.first);page=std::move(next);
    }
    (*page)[a.second]=value;
  }
  std::size_t allocatedPages()const{return used_.size();}
  std::size_t payloadBytes()const{return used_.size()*sizeof(Page);}
  std::size_t directoryBytes()const{return pages_.capacity()*sizeof(std::unique_ptr<Page>);}
};
}
