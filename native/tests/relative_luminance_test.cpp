#include "relative_luminance.h"
#include <iostream>
#include <stdexcept>
int main(){std::uint64_t hash=14695981039346656037ull;for(int r=0;r<256;r+=17)for(int g=0;g<256;g+=17)for(int b=0;b<256;b+=17){auto alpha=(r+g+b)%256;auto c=moon::relativeLuminancePixel(moon::timeline::Pixel(r|(g<<8)|(b<<16)|(std::uint32_t(alpha)<<24)));if((c>>24)!=alpha || (c&255)!=((c>>8)&255) || (c&255)!=((c>>16)&255))throw std::runtime_error("Gray/alpha mismatch");hash=(hash^(c&255))*1099511628211ull;}if(hash!=1805908251275535110ull)throw std::runtime_error("4096 actual legacy raster oracle mismatch");if(moon::relativeLuminancePixel(0x000000ff)!=0x007f7f7f)throw std::runtime_error("Transparent RGB preserved");std::cout<<"Relative luminance 4096 legacy colors and alpha passed\n";}
