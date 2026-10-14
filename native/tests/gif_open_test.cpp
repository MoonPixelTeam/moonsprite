#include "gif_export.h"
#include "image_decode.h"
#include <fstream>
#include <iostream>
int main(int argc,char**argv){try{if(argc<2)throw std::runtime_error("fixture path");moon::Document d(2,1);d.beginStroke({0,0},0xff0000ff);d.commitStroke();d.setFrameDuration(40);d.addFrame();d.beginStroke({1,0},0xffff0000);d.commitStroke();d.setFrameDuration(230);auto gif=moon::encodeAnimationGif(d);auto path=std::filesystem::path(argv[1]);std::filesystem::create_directories(path.parent_path());std::ofstream(path,std::ios::binary).write((const char*)gif.bytes.data(),gif.bytes.size());auto opened=moon::openGifAnimation(path);if(opened.timeline().state().frames.size()!=2||opened.timeline().state().frames[0].duration!=40||opened.timeline().state().frames[1].duration!=230||opened.palette().entries.size()<2||opened.dirty())throw std::runtime_error("GIF open mismatch");std::cout<<"gif open checks passed\n";return 0;}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
