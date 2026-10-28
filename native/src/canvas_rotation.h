#pragma once
#include <cmath>
namespace moon::view {
struct Point {double x=0,y=0;};
// legacy core/view-geometry.ts: rotation follows mirroring; inverse reverses it.
struct Rotation {
 double degrees=0;bool mirrorX=false,mirrorY=false;
 bool active()const{return degrees!=0||mirrorX||mirrorY;}
 Point forward(Point p,Point pivot)const{const double r=degrees*3.14159265358979323846/180,c=std::cos(r),s=std::sin(r);const double x=(p.x-pivot.x)*(mirrorX?-1:1),y=(p.y-pivot.y)*(mirrorY?-1:1);return {pivot.x+c*x-s*y,pivot.y+s*x+c*y};}
 Point inverse(Point p,Point pivot)const{const double r=degrees*3.14159265358979323846/180,c=std::cos(r),s=std::sin(r),x=p.x-pivot.x,y=p.y-pivot.y;return {pivot.x+(c*x+s*y)*(mirrorX?-1:1),pivot.y+(-s*x+c*y)*(mirrorY?-1:1)};}
 static double normalize(double n){return std::fmod(std::fmod(n,360.)+360.,360.);}
 static double snap(double n){return std::floor(n/22.5+.5)*22.5;}
};
}
