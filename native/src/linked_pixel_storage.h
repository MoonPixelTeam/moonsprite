#pragma once
#include <vector>
#include <atomic>
#include <memory>
#include <initializer_list>
#include <utility>
#include <cstdint>
namespace moon::timeline {
class LinkedPixelStorage {
 using Vector=std::vector<std::uint32_t>;std::shared_ptr<Vector> data_=std::make_shared<Vector>();
 inline static std::atomic<std::uint64_t> clock_{0};std::shared_ptr<std::uint64_t> revision_=std::make_shared<std::uint64_t>(++clock_);void touch(){*revision_=++clock_;}
public:
 using value_type=Vector::value_type;using size_type=Vector::size_type;using iterator=Vector::iterator;using const_iterator=Vector::const_iterator;
 LinkedPixelStorage()=default;
 LinkedPixelStorage(std::initializer_list<value_type> values):data_(std::make_shared<Vector>(values)){}
 explicit LinkedPixelStorage(const Vector& v):data_(std::make_shared<Vector>(v)){}
 explicit LinkedPixelStorage(Vector&& v):data_(std::make_shared<Vector>(std::move(v))){}
 LinkedPixelStorage(const LinkedPixelStorage& other):data_(std::make_shared<Vector>(*other.data_)),revision_(std::make_shared<std::uint64_t>(*other.revision_)){}
 LinkedPixelStorage(LinkedPixelStorage&& other) noexcept:data_(other.data_),revision_(other.revision_){}
 LinkedPixelStorage& operator=(const LinkedPixelStorage& other){if(this!=&other){data_=std::make_shared<Vector>(*other.data_);revision_=std::make_shared<std::uint64_t>(*other.revision_);}return *this;}
 LinkedPixelStorage& operator=(LinkedPixelStorage&& other)noexcept{if(this!=&other){data_=other.data_;revision_=other.revision_;}return *this;}
 LinkedPixelStorage& operator=(const Vector& v){touch();*data_=v;return *this;}
 LinkedPixelStorage& operator=(Vector&& v){touch();*data_=std::move(v);return *this;}
 LinkedPixelStorage& operator=(std::initializer_list<value_type> v){touch();*data_=v;return *this;}
 operator Vector&(){touch();return *data_;}operator const Vector&()const{return *data_;}
 void share(const LinkedPixelStorage& other){data_=other.data_;revision_=other.revision_;}
 std::uint64_t revision()const{return *revision_;}
 const void* identity()const{return data_.get();}
 std::size_t size()const{return data_->size();}bool empty()const{return data_->empty();}std::size_t capacity()const{return data_->capacity();}
 value_type* data(){touch();return data_->data();}const value_type* data()const{return data_->data();}
 iterator begin(){touch();return data_->begin();}iterator end(){touch();return data_->end();}const_iterator begin()const{return data_->begin();}const_iterator end()const{return data_->end();}const_iterator cbegin()const{return data_->cbegin();}const_iterator cend()const{return data_->cend();}
 value_type& operator[](size_type i){touch();return (*data_)[i];}const value_type& operator[](size_type i)const{return (*data_)[i];}value_type& at(size_type i){touch();return data_->at(i);}const value_type& at(size_type i)const{return data_->at(i);}value_type& front(){touch();return data_->front();}const value_type& front()const{return data_->front();}value_type& back(){touch();return data_->back();}const value_type& back()const{return data_->back();}
 void resize(size_type n){touch();data_->resize(n);}void resize(size_type n,value_type v){touch();data_->resize(n,v);}void reserve(size_type n){touch();data_->reserve(n);}void clear(){touch();data_->clear();}void shrink_to_fit(){touch();data_->shrink_to_fit();}void push_back(value_type v){touch();data_->push_back(v);}void pop_back(){touch();data_->pop_back();}
 template<class... Args> decltype(auto) emplace_back(Args&&... args){touch();return data_->emplace_back(std::forward<Args>(args)...);}
 template<class... Args> decltype(auto) insert(Args&&... args){touch();return data_->insert(std::forward<Args>(args)...);}
 template<class... Args> decltype(auto) erase(Args&&... args){touch();return data_->erase(std::forward<Args>(args)...);}
 template<class... Args> void assign(Args&&... args){touch();data_->assign(std::forward<Args>(args)...);}
 void swap(Vector& other)noexcept{data_->swap(other);touch();}
 void swap(LinkedPixelStorage& other)noexcept{data_.swap(other.data_);revision_.swap(other.revision_);}
 friend bool operator==(const LinkedPixelStorage& a,const LinkedPixelStorage& b){return *a.data_==*b.data_;}friend bool operator!=(const LinkedPixelStorage& a,const LinkedPixelStorage& b){return !(a==b);}
 friend bool operator==(const LinkedPixelStorage& a,const Vector& b){return *a.data_==b;}friend bool operator==(const Vector& a,const LinkedPixelStorage& b){return a==*b.data_;}friend bool operator!=(const LinkedPixelStorage& a,const Vector& b){return !(a==b);}friend bool operator!=(const Vector& a,const LinkedPixelStorage& b){return !(a==b);}
};
}
