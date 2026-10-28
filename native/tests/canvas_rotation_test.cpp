#include "canvas_rotation.h"
#include <stdexcept>
#include <iostream>
int main(){try{using namespace moon::view;for(double a:{0.,22.5,90.,180.,270.,337.5})for(bool x:{false,true})for(bool y:{false,true}){Rotation r{a,x,y};Point p{-23.25,45.5},pivot{13,17};auto q=r.inverse(r.forward(p,pivot),pivot);if(std::abs(q.x-p.x)>1e-9||std::abs(q.y-p.y)>1e-9)throw std::runtime_error("Rotation/mirror inverse");}if(Rotation::snap(-11.25)!=0||Rotation::normalize(-90)!=270)throw std::runtime_error("Legacy snap/normalization");std::cout<<"View rotation and mirror geometry passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what();return 1;}}
