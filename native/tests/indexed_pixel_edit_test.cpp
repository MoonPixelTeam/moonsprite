#include "raster_pixel_edit.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
using namespace moon;
using namespace moon::timeline;
namespace {
struct Entry {int id;Pixel color;};
std::string context;
void check(bool value,const std::string& message){if(!value)throw std::runtime_error(context+": "+message);}
void equal(Pixel actual,Pixel expected,const std::string& message){check(actual==expected,message+" expected "+std::to_string(expected)+" actual "+std::to_string(actual));}
}
int main(int argc,char** argv){try{
 check(argc==2,"legacy oracle required");std::ifstream in(argv[1]);check(bool(in),"cannot read oracle");
 int contexts;in>>contexts;check(contexts==288,"context coverage");
 for(int n=0;n<contexts;++n){int mode,precision,indexed,mask,count;in>>mode>>precision>>indexed>>mask>>count;context="context "+std::to_string(n);
  std::vector<Entry> palette(count);for(auto& e:palette)in>>e.id>>e.color;in>>count;std::vector<int> order(count);for(auto& id:order)in>>id;
  RasterColorContext colors(palette,order,color_mode::Mode(mode),color_mode::PixelFormat(precision));
  Surface surface{3,2,-2,3,{},{},{},indexed?RasterFormat::Indexed:RasterFormat::Rgba};std::vector<Pixel> values(6);for(auto& p:values)in>>p;surface.pixels=LinkedPixelStorage(values);
  for(std::size_t i=0;i<6;++i){Pixel packed,color;in>>packed>>color;equal(raster::readPacked(surface,i),packed,"read packed");equal(raster::readColor(surface,i,colors),color,"read color");}
  for(int i=0;i<6;++i){int x,y,present;Pixel value;in>>x>>y>>present>>value;const auto actual=raster::readPackedAt(surface,x,y);check(bool(actual)==bool(present),"world presence");if(actual)equal(*actual,value,"world packed");}
  in>>count;for(int i=0;i<count;++i){Pixel color,expected;in>>color>>expected;surface.pixels=LinkedPixelStorage(values);raster::writeColor(surface,1,color,colors,mask);equal(surface.pixels[1],expected,"color write");}
  in>>count;for(int i=0;i<count;++i){Pixel value,expected;in>>value>>expected;surface.pixels=LinkedPixelStorage(values);raster::writePacked(surface,1,value,colors,mask);equal(surface.pixels[1],expected,"packed write");surface.pixels=LinkedPixelStorage(values);check(raster::writePackedRun(surface,1,5,value,colors,mask)==2,"row truncation");for(std::size_t j=0;j<6;++j){in>>expected;equal(surface.pixels[j],expected,"packed row write");}}
  in>>count;for(int i=0;i<count;++i){Pixel current,original,color,expected;int present,flags;in>>current>>present>>original>>color>>flags>>expected;const auto actual=raster::paintValue(surface.format,current,present?std::optional<Pixel>{original}:std::nullopt,color,colors,flags&1,flags&2);equal(actual,expected,"paint "+std::to_string(i));}
  in>>count;for(int i=0;i<count;++i){Pixel destination,value,current,before,over,edit;int present;in>>destination>>value>>current>>present>>before>>over>>edit;equal(raster::selectionOver(surface.format,destination,value,colors,mask),over,"selection over "+std::to_string(i));equal(raster::selectionForEdit(surface.format,current,present?std::optional<Pixel>{before}:std::nullopt,value,colors,mask),edit,"selection edit "+std::to_string(i));}
  check(in.good(),"incomplete fixture");
 }
 context="alpha pairs";int count;in>>count;check(count==65536,"alpha coverage");for(int i=0;i<count;++i){Pixel destination,value,expected;in>>destination>>value>>expected;equal(raster::selectionRgbaOver(destination,value),expected,"pair "+std::to_string(i));}check(in.good(),"incomplete alpha fixture");
 // Native checked storage adapts legal legacy local indices; malformed writes
 // fail before mutating instead of permitting typed-array out-of-bounds writes.
 context="storage guards";Surface s{3,2,-2,3,{},{},{1,2,3,4,5,6}};RasterColorContext colors;
 check(raster::writePackedRun(s,99,0,0,colors)==0,"empty run");const auto before=s.pixels;
 bool rejected=false;try{raster::writePackedRun(s,6,1,0,colors);}catch(const std::out_of_range&){rejected=true;}check(rejected&&s.pixels==before,"invalid run atomic");
 check(!raster::readPackedAt(s,std::numeric_limits<std::int64_t>::max(),3),"large world coordinate");
 std::cout<<contexts<<" legacy contexts and 65536 alpha pairs passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
