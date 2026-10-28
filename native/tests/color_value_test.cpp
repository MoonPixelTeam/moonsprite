// Oracles evaluated from original legacy/core/color-values.ts + raster.ts via Node stripTypeScriptTypes.
#include "color_value_model.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
int main(){
{auto v=colorToValues(1945249476u,ColorValueMode::Rgb);ColorValues e{196,38,242,115};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{0,25.5,51,76.5},1945249476u)!=1295194624u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(1683030867u,ColorValueMode::Rgb);ColorValues e{83,3,81,100};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{25.5,51,76.5,102},1683030867u)!=1716335386u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(4009373846u,ColorValueMode::Rgb);ColorValues e{150,48,250,238};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{51,76.5,102,127.5},4009373846u)!=2154188083u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(3441766141u,ColorValueMode::Rgb);ColorValues e{253,46,37,205};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{76.5,102,127.5,153},3441766141u)!=2575328845u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(247473208u,ColorValueMode::Rgb);ColorValues e{56,36,192,14};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{102,127.5,153,178.5},247473208u)!=3013181542u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(337058359u,ColorValueMode::Rgb);ColorValues e{55,26,23,20};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{127.5,153,178.5,204},337058359u)!=3434322304u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(90976810u,ColorValueMode::Rgb);ColorValues e{42,50,108,5};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{153,178.5,204,229.5},90976810u)!=3872175001u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2231647105u,ColorValueMode::Rgb);ColorValues e{129,59,4,133};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{178.5,204,229.5,255},2231647105u)!=4293315763u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2096389868u,ColorValueMode::Rgb);ColorValues e{236,94,244,124};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{204,229.5,255,0},2096389868u)!=16770764u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(934661467u,ColorValueMode::Rgb);ColorValues e{91,205,181,55};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{229.5,255,0,25.5},934661467u)!=436273126u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2388632318u,ColorValueMode::Rgb);ColorValues e{254,162,95,142};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{255,0,25.5,51},2388632318u)!=857342207u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2097770053u,ColorValueMode::Rgb);ColorValues e{69,110,9,125};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{0,25.5,51,76.5},2097770053u)!=1295194624u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(479595232u,ColorValueMode::Rgb);ColorValues e{224,10,150,28};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{25.5,51,76.5,102},479595232u)!=1716335386u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2286076095u,ColorValueMode::Rgb);ColorValues e{191,192,66,136};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{51,76.5,102,127.5},2286076095u)!=2154188083u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2470827794u,ColorValueMode::Rgb);ColorValues e{18,215,69,147};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{76.5,102,127.5,153},2470827794u)!=2575328845u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2339244873u,ColorValueMode::Rgb);ColorValues e{73,11,110,139};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{102,127.5,153,178.5},2339244873u)!=3013181542u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(1134926868u,ColorValueMode::Rgb);ColorValues e{20,156,165,67};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{127.5,153,178.5,204},1134926868u)!=3434322304u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(3858487395u,ColorValueMode::Rgb);ColorValues e{99,216,251,229};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{153,178.5,204,229.5},3858487395u)!=3872175001u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(1679516262u,ColorValueMode::Rgb);ColorValues e{102,98,27,100};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{178.5,204,229.5,255},1679516262u)!=4293315763u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(3606943373u,ColorValueMode::Rgb);ColorValues e{141,150,253,214};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{204,229.5,255,0},3606943373u)!=16770764u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(3843081864u,ColorValueMode::Rgb);ColorValues e{136,198,16,229};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{229.5,255,0,25.5},3843081864u)!=436273126u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(4037752903u,ColorValueMode::Rgb);ColorValues e{71,56,171,240};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{255,0,25.5,51},4037752903u)!=857342207u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(746330362u,ColorValueMode::Rgb);ColorValues e{250,24,124,44};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{0,25.5,51,76.5},746330362u)!=1295194624u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(1629082641u,ColorValueMode::Rgb);ColorValues e{17,212,25,97};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{25.5,51,76.5,102},1629082641u)!=1716335386u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(719748668u,ColorValueMode::Rgb);ColorValues e{60,126,230,42};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{51,76.5,102,127.5},719748668u)!=2154188083u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2487960683u,ColorValueMode::Rgb);ColorValues e{107,68,75,148};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{76.5,102,127.5,153},2487960683u)!=2575328845u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(1878462158u,ColorValueMode::Rgb);ColorValues e{206,14,247,111};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{102,127.5,153,178.5},1878462158u)!=3013181542u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(3456026581u,ColorValueMode::Rgb);ColorValues e{213,199,254,205};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{127.5,153,178.5,204},3456026581u)!=3434322304u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(3117086512u,ColorValueMode::Rgb);ColorValues e{48,247,202,185};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{153,178.5,204,229.5},3117086512u)!=3872175001u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2917834959u,ColorValueMode::Rgb);ColorValues e{207,160,234,173};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{178.5,204,229.5,255},2917834959u)!=4293315763u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(1101174754u,ColorValueMode::Rgb);ColorValues e{226,151,162,65};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{204,229.5,255,0},1101174754u)!=16770764u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(793163225u,ColorValueMode::Rgb);ColorValues e{217,181,70,47};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values rgb");}
if(colorFromValues(ColorValueMode::Rgb,ColorValues{229.5,255,0,25.5},793163225u)!=436273126u)throw std::runtime_error("Legacy color-from-values rgb");
{auto v=colorToValues(2443945316u,ColorValueMode::Hsv);ColorValues e{185.07042253521126,41.52046783625731,67.05882352941175,145};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{0,10,20,76.5},2443945316u)!=1294872115u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(751841651u,ColorValueMode::Hsv);ColorValues e{264.9056603773585,76.4423076923077,81.56862745098039,44};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{36,20,30,102},751841651u)!=1715291725u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(1257261110u,ColorValueMode::Hsv);ColorValues e{234.19354838709677,77.5,94.11764705882352,74};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{72,30,40,127.5},1257261110u)!=2152162912u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3568181789u,ColorValueMode::Hsv);ColorValues e{237.93103448275863,83.33333333333333,68.23529411764706,212};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{108,40,50,153},3568181789u)!=2571993175u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3216194776u,ColorValueMode::Hsv);ColorValues e{314.2307692307692,72.22222222222223,84.70588235294117,191};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{144,50,60,178.5},3216194776u)!=3010173261u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(1407130199u,ColorValueMode::Hsv);ColorValues e{258.5786802030457,88.34080717488789,87.45098039215686,83};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{180,60,70,204},1407130199u)!=3434328903u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(4123063242u,ColorValueMode::Hsv);ColorValues e{108.23529411764706,20.98765432098765,95.29411764705881,245};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{216,70,80,229.5},4123063242u)!=3872159293u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(1729613985u,ColorValueMode::Hsv);ColorValues e{75.24324324324324,88.9423076923077,81.56862745098039,103};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{252,80,90,255},1729613985u)!=4293275219u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(1434300812u,ColorValueMode::Hsv);ColorValues e{102.69230769230768,29.37853107344633,69.41176470588235,85};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{288,90,100,0},1434300812u)!=16718289u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(4282040187u,ColorValueMode::Hsv);ColorValues e{90.67669172932332,69.63350785340315,74.90196078431373,255};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{324,100,0,25.5},4282040187u)!=436207616u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(1303948958u,ColorValueMode::Hsv);ColorValues e{203.07692307692307,14.130434782608692,72.15686274509804,77};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{360,0,10,51},1303948958u)!=857348634u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3520120165u,ColorValueMode::Hsv);ColorValues e{186.1682242990654,51.4423076923077,81.56862745098039,209};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{0,10,20,76.5},3520120165u)!=1294872115u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(1502361472u,ColorValueMode::Hsv);ColorValues e{291.52941176470586,60.71428571428572,54.90196078431373,89};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{36,20,30,102},1502361472u)!=1715291725u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(304792799u,ColorValueMode::Hsv);ColorValues e{51.04972375690608,81.16591928251121,87.45098039215686,18};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{72,30,40,127.5},304792799u)!=2152162912u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(1825754290u,ColorValueMode::Hsv);ColorValues e{191.24999999999994,15.238095238095239,82.35294117647058,108};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{108,40,50,153},1825754290u)!=2571993175u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3188999273u,ColorValueMode::Hsv);ColorValues e{33.88235294117647,80.95238095238095,41.17647058823529,190};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{144,50,60,178.5},3188999273u)!=3010173261u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(2767798964u,ColorValueMode::Hsv);ColorValues e{277.3770491803279,73.49397590361446,97.6470588235294,164};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{180,60,70,204},2767798964u)!=3434328903u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(1899957891u,ColorValueMode::Hsv);ColorValues e{334.87179487179486,89.31297709923663,51.37254901960784,113};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{216,70,80,229.5},1899957891u)!=3872159293u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(2268455430u,ColorValueMode::Hsv);ColorValues e{132.81818181818184,97.34513274336283,88.62745098039215,135};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{252,80,90,255},2268455430u)!=4293275219u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(2765083053u,ColorValueMode::Hsv);ColorValues e{176.66666666666669,17.224880382775112,81.96078431372548,164};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{288,90,100,0},2765083053u)!=16718289u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3798763304u,ColorValueMode::Hsv);ColorValues e{162.94736842105263,70.37037037037037,52.94117647058824,226};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{324,100,0,25.5},3798763304u)!=436207616u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(749977703u,ColorValueMode::Hsv);ColorValues e{171.23595505617976,46.354166666666664,75.29411764705883,44};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{360,0,10,51},749977703u)!=857348634u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3930571418u,ColorValueMode::Hsv);ColorValues e{79.51219512195122,63.4020618556701,76.07843137254902,234};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{0,10,20,76.5},3930571418u)!=1294872115u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3131519281u,ColorValueMode::Hsv);ColorValues e{240,70.65868263473054,65.49019607843137,186};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{36,20,30,102},3131519281u)!=1715291725u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(575600860u,ColorValueMode::Hsv);ColorValues e{69.88235294117646,68.54838709677419,97.25490196078431,34};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{72,30,40,127.5},575600860u)!=2152162912u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3205840523u,ColorValueMode::Hsv);ColorValues e{20.847457627118644,84.89208633093526,54.509803921568626,191};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{108,40,50,153},3205840523u)!=2571993175u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(2197914222u,ColorValueMode::Hsv);ColorValues e{69.30232558139534,99.23076923076923,50.98039215686274,131};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{144,50,60,178.5},2197914222u)!=3010173261u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(976774901u,ColorValueMode::Hsv);ColorValues e{14.603174603174605,77.14285714285715,96.07843137254902,58};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{180,60,70,204},976774901u)!=3434328903u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3091123152u,ColorValueMode::Hsv);ColorValues e{57.945205479452056,70.1923076923077,81.56862745098039,184};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{216,70,80,229.5},3091123152u)!=3872159293u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(2216963311u,ColorValueMode::Hsv);ColorValues e{2.3645320197044333,84.93723849372385,93.72549019607843,132};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{252,80,90,255},2216963311u)!=4293275219u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3213063554u,ColorValueMode::Hsv);ColorValues e{295.7142857142857,10.687022900763354,51.37254901960784,191};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{288,90,100,0},3213063554u)!=16718289u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(3500127993u,ColorValueMode::Hsv);ColorValues e{15.333333333333336,36.144578313253014,97.6470588235294,208};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsv");}
if(colorFromValues(ColorValueMode::Hsv,ColorValues{324,100,0,25.5},3500127993u)!=436207616u)throw std::runtime_error("Legacy color-from-values hsv");
{auto v=colorToValues(1438872580u,ColorValueMode::Hsl);ColorValues e{204.8167539267016,95.97989949748745,39.01960784313725,85};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{0,10,20,76.5},1438872580u)!=1294872120u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(3422121875u,ColorValueMode::Hsl);ColorValues e{255.6521739130435,91.99999999999997,70.58823529411764,203};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{36,20,30,102},3422121875u)!=1715294300u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(3756601302u,ColorValueMode::Hsl);ColorValues e{293.8709677419355,80.8695652173913,54.90196078431373,223};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{72,30,40,127.5},3756601302u)!=2152170872u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(809215293u,ColorValueMode::Hsl);ColorValues e{118.8679245283019,47.32142857142858,43.92156862745098,48};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{108,40,50,153},809215293u)!=2572006241u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(2520884600u,ColorValueMode::Hsl);ColorValues e{87,43.47826086956522,45.09803921568628,150};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{144,50,60,178.5},2520884600u)!=3012545638u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(778709623u,ColorValueMode::Hsl);ColorValues e{310.12987012987014,47.82608695652175,31.56862745098039,46};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{180,60,70,204},778709623u)!=3437289605u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(173901162u,ColorValueMode::Hsl);ColorValues e{100.5,17.699115044247797,44.31372549019608,10};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{216,70,80,229.5},173901162u)!=3874538920u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(229701057u,ColorValueMode::Hsl);ColorValues e{105.21739130434781,77.52808988764043,82.54901960784314,13};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{252,80,90,255},229701057u)!=4294627801u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(1882149932u,ColorValueMode::Hsl);ColorValues e{124.5,31.25,25.098039215686274,112};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{288,90,100,0},1882149932u)!=16777215u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(44810651u,ColorValueMode::Hsl);ColorValues e{145.26315789473688,23.456790123456795,68.23529411764706,2};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{324,100,0,25.5},44810651u)!=436207616u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(3060697662u,ColorValueMode::Hsl);ColorValues e{157.8947368421052,37.99999999999999,39.21568627450981,182};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{360,0,10,51},3060697662u)!=857348634u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(187608197u,ColorValueMode::Hsl);ColorValues e{78.57142857142856,57.798165137614674,42.74509803921569,11};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{0,10,20,76.5},187608197u)!=1294872120u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(1065858080u,ColorValueMode::Hsl);ColorValues e{161.75675675675677,69.81132075471699,41.568627450980394,63};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{36,20,30,102},1065858080u)!=1715294300u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(523753727u,ColorValueMode::Hsl);ColorValues e{48.30000000000001,100.00000000000003,60.7843137254902,31};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{72,30,40,127.5},523753727u)!=2152170872u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(1134662226u,ColorValueMode::Hsl);ColorValues e{191.3924050632911,32.51028806584362,47.647058823529406,67};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{108,40,50,153},1134662226u)!=2572006241u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(1441926537u,ColorValueMode::Hsl);ColorValues e{272.4890829694323,89.80392156862744,50,85};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{144,50,60,178.5},1441926537u)!=3012545638u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(1568618836u,ColorValueMode::Hsl);ColorValues e{263.1428571428571,38.04347826086957,36.07843137254902,93};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{180,60,70,204},1568618836u)!=3437289605u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(1173378211u,ColorValueMode::Hsl);ColorValues e{270.38461538461536,83.87096774193549,63.52941176470588,69};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{216,70,80,229.5},1173378211u)!=3874538920u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(3477549478u,ColorValueMode::Hsl);ColorValues e{348.71794871794873,54.418604651162795,42.15686274509804,207};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{252,80,90,255},3477549478u)!=4294627801u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(4194999501u,ColorValueMode::Hsl);ColorValues e{44.923076923076906,90.69767441860466,42.15686274509804,250};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{288,90,100,0},4194999501u)!=16777215u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(2037880776u,ColorValueMode::Hsl);ColorValues e{23.703703703703695,42.40837696335078,62.549019607843135,121};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{324,100,0,25.5},2037880776u)!=436207616u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(3766704263u,ColorValueMode::Hsl);ColorValues e{305.10638297872345,21.076233183856505,43.72549019607843,224};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{360,0,10,51},3766704263u)!=857348634u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(2643409978u,ColorValueMode::Hsl);ColorValues e{238.58823529411768,42.28855721393035,39.411764705882355,157};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{0,10,20,76.5},2643409978u)!=1294872120u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(811474513u,ColorValueMode::Hsl);ColorValues e{287.8125,51.61290322580645,24.31372549019608,48};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{36,20,30,102},811474513u)!=1715294300u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(657703804u,ColorValueMode::Hsl);ColorValues e{89.58333333333331,58.53658536585367,48.23529411764705,39};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{72,30,40,127.5},657703804u)!=2152170872u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(4044310699u,ColorValueMode::Hsl);ColorValues e{21.923076923076906,83.87096774193547,36.470588235294116,241};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{108,40,50,153},4044310699u)!=2572006241u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(2849818126u,ColorValueMode::Hsl);ColorValues e{186.4077669902913,88.03418803418803,45.88235294117647,169};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{144,50,60,178.5},2849818126u)!=3012545638u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(720147989u,ColorValueMode::Hsl);ColorValues e{204,84.98023715415019,50.3921568627451,42};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{180,60,70,204},720147989u)!=3437289605u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(1447817328u,ColorValueMode::Hsl);ColorValues e{106.54545454545456,84.61538461538461,61.76470588235294,86};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{216,70,80,229.5},1447817328u)!=3874538920u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(1527171343u,ColorValueMode::Hsl);ColorValues e{117.23076923076923,94.20289855072464,40.588235294117645,91};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{252,80,90,255},1527171343u)!=4294627801u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(844768034u,ColorValueMode::Hsl);ColorValues e{238.92857142857144,45.16129032258064,24.31372549019608,50};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{288,90,100,0},844768034u)!=16777215u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(592726041u,ColorValueMode::Hsl);ColorValues e{192.2033898305085,54.12844036697248,21.372549019607842,35};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values hsl");}
if(colorFromValues(ColorValueMode::Hsl,ColorValues{324,100,0,25.5},592726041u)!=436207616u)throw std::runtime_error("Legacy color-from-values hsl");
{auto v=colorToValues(2799800996u,ColorValueMode::Gray);ColorValues e{156,166};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{0,25.5},2799800996u)!=436207616u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3897867699u,ColorValueMode::Gray);ColorValues e{179,232};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{25.5,51},3897867699u)!=857348634u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(1389160310u,ColorValueMode::Gray);ColorValues e{205,82};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{51,76.5},1389160310u)!=1295201075u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2945824861u,ColorValueMode::Gray);ColorValues e{162,175};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{76.5,102},2945824861u)!=1716342093u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3482541592u,ColorValueMode::Gray);ColorValues e{83,207};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{102,127.5},3482541592u)!=2154194534u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2931837591u,ColorValueMode::Gray);ColorValues e{99,174};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{127.5,153},2931837591u)!=2575335552u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(44689162u,ColorValueMode::Gray);ColorValues e{180,2};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{153,178.5},44689162u)!=3013187993u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2702682849u,ColorValueMode::Gray);ColorValues e{171,161};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{178.5,204},2702682849u)!=3434329011u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2293319372u,ColorValueMode::Gray);ColorValues e{106,136};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{204,229.5},2293319372u)!=3872181452u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3113276347u,ColorValueMode::Gray);ColorValues e{201,185};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{229.5,255},3113276347u)!=4293322470u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(174667230u,ColorValueMode::Gray);ColorValues e{93,10};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{255,0},174667230u)!=16777215u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(4058719141u,ColorValueMode::Gray);ColorValues e{77,241};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{0,25.5},4058719141u)!=436207616u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2964357312u,ColorValueMode::Gray);ColorValues e{145,176};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{25.5,51},2964357312u)!=857348634u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(460455199u,ColorValueMode::Gray);ColorValues e{196,27};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{51,76.5},460455199u)!=1295201075u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3290048498u,ColorValueMode::Gray);ColorValues e{81,196};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{76.5,102},3290048498u)!=1716342093u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2219796137u,ColorValueMode::Gray);ColorValues e{115,132};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{102,127.5},2219796137u)!=2154194534u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2648670196u,ColorValueMode::Gray);ColorValues e{159,157};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{127.5,153},2648670196u)!=2575335552u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3432491715u,ColorValueMode::Gray);ColorValues e{174,204};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{153,178.5},3432491715u)!=3013187993u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3140964678u,ColorValueMode::Gray);ColorValues e{77,187};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{178.5,204},3140964678u)!=3434329011u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3094738925u,ColorValueMode::Gray);ColorValues e{235,184};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{204,229.5},3094738925u)!=3872181452u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3512334440u,ColorValueMode::Gray);ColorValues e{206,209};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{229.5,255},3512334440u)!=4293322470u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(4179755175u,ColorValueMode::Gray);ColorValues e{38,249};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{255,0},4179755175u)!=16777215u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2142930394u,ColorValueMode::Gray);ColorValues e{155,127};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{0,25.5},2142930394u)!=436207616u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(478583665u,ColorValueMode::Gray);ColorValues e{145,28};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{25.5,51},478583665u)!=857348634u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2134695452u,ColorValueMode::Gray);ColorValues e{169,127};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{51,76.5},2134695452u)!=1295201075u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2747359947u,ColorValueMode::Gray);ColorValues e{127,163};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{76.5,102},2747359947u)!=1716342093u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(1081137582u,ColorValueMode::Gray);ColorValues e{200,64};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{102,127.5},1081137582u)!=2154194534u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3135460661u,ColorValueMode::Gray);ColorValues e{88,186};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{127.5,153},3135460661u)!=2575335552u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2686084368u,ColorValueMode::Gray);ColorValues e{78,160};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{153,178.5},2686084368u)!=3013187993u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3231348015u,ColorValueMode::Gray);ColorValues e{105,192};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{178.5,204},3231348015u)!=3434329011u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(9347266u,ColorValueMode::Gray);ColorValues e{166,0};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{204,229.5},9347266u)!=3872181452u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(3400296761u,ColorValueMode::Gray);ColorValues e{100,202};for(int i=0;i<2;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values gray");}
if(colorFromValues(ColorValueMode::Gray,ColorValues{229.5,255},3400296761u)!=4293322470u)throw std::runtime_error("Legacy color-from-values gray");
{auto v=colorToValues(2142110020u,ColorValueMode::Lab);ColorValues e{24.658329826552553,61.04599690954124,-73.54223005394552,127};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{0,-102.5,-77,76.5},2142110020u)!=1299198208u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(745151443u,ColorValueMode::Lab);ColorValues e{46.548760985631134,70.29596966378637,4.350514819401807,44};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{10,-77,-51.5,102},745151443u)!=1717777408u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(2088988438u,ColorValueMode::Lab);ColorValues e{43.028554955901505,-17.52609508422634,-18.158781177797056,124};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{20,-51.5,-26,127.5},2088988438u)!=2153136128u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(3330562941u,ColorValueMode::Lab);ColorValues e{43.51965849258992,21.59835729065379,-17.468334309050416,198};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{30,-26,-0.5,153},3330562941u)!=2571587840u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(4241516216u,ColorValueMode::Lab);ColorValues e{56.33568190300991,49.64365158200279,-41.455215893835714,252};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{40,-0.5,25,178.5},4241516216u)!=3006618987u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(602503863u,ColorValueMode::Lab);ColorValues e{61.54191313864216,44.150867828284255,-47.28044020972748,35};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{50,25,50.5,204},602503863u)!=3424412847u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(302913706u,ColorValueMode::Lab);ColorValues e{36.430782398193934,55.63909962375082,44.64703415690225,18};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{60,50.5,76,229.5},302913706u)!=3858785778u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(764669953u,ColorValueMode::Lab);ColorValues e{84.18828150451938,-68.63077037864446,31.78674595318025,45};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{70,76,101.5,255},764669953u)!=4278213887u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(4004219244u,ColorValueMode::Lab);ColorValues e{56.10643135799607,-1.5992275200095163,-21.23427515057683,238};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{80,101.5,127,0},4004219244u)!=17151u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(527562203u,ColorValueMode::Lab);ColorValues e{92.37921552001826,-26.981186376434874,59.76013563817393,31};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{90,127,-128,25.5},527562203u)!=452945663u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(1066447230u,ColorValueMode::Lab);ColorValues e{67.94111772359439,-23.825785909932616,11.550594944495884,63};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{100,-128,-102.5,51},1066447230u)!=872414976u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(1926113989u,ColorValueMode::Lab);ColorValues e{49.47777985523756,76.12910753796464,-51.08382522923334,114};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{0,-102.5,-77,76.5},1926113989u)!=1299198208u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(1663999328u,ColorValueMode::Lab);ColorValues e{58.78611176505187,-38.591849591671505,49.431813212221975,99};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{10,-77,-51.5,102},1663999328u)!=1717777408u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(920727871u,ColorValueMode::Lab);ColorValues e{35.37643652565113,58.78753793431504,-85.67422181805532,54};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{20,-51.5,-26,127.5},920727871u)!=2153136128u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(2393148818u,ColorValueMode::Lab);ColorValues e{59.74479668202328,6.516846448673286,-11.452787256251362,142};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{30,-26,-0.5,153},2393148818u)!=2571587840u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(3732164553u,ColorValueMode::Lab);ColorValues e{51.00609723979851,51.75590306346945,4.440308917445002,222};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{40,-0.5,25,178.5},3732164553u)!=3006618987u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(2864846484u,ColorValueMode::Lab);ColorValues e{39.18272669616621,70.23020124310946,-61.12309320943916,170};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{50,25,50.5,204},2864846484u)!=3424412847u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(1908216035u,ColorValueMode::Lab);ColorValues e{52.26404450612641,83.70401884472334,-36.50696760392089,113};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{60,50.5,76,229.5},1908216035u)!=3858785778u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(4260249830u,ColorValueMode::Lab);ColorValues e{58.66409414666562,81.5250230912109,-54.25437336401602,253};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{70,76,101.5,255},4260249830u)!=4278213887u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(1708778253u,ColorValueMode::Lab);ColorValues e{81.85346723890984,-46.60972995272711,-7.997208520824817,101};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{80,101.5,127,0},1708778253u)!=17151u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(1698408712u,ColorValueMode::Lab);ColorValues e{60.55266430877995,-59.30950237276189,45.22295228546055,101};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{90,127,-128,25.5},1698408712u)!=452945663u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(2811738311u,ColorValueMode::Lab);ColorValues e{75.23841520584519,0.0885112850368408,18.722085356225058,167};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{100,-128,-102.5,51},2811738311u)!=872414976u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(1043439482u,ColorValueMode::Lab);ColorValues e{60.918431478749824,-29.376189708859247,50.899069234454394,62};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{0,-102.5,-77,76.5},1043439482u)!=1299198208u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(3177752721u,ColorValueMode::Lab);ColorValues e{65.76760203148429,-19.04972458976856,30.465951569639916,189};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{10,-77,-51.5,102},3177752721u)!=1717777408u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(68307132u,ColorValueMode::Lab);ColorValues e{46.14104644745023,44.486248053141665,51.69739643295169,4};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{20,-51.5,-26,127.5},68307132u)!=2153136128u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(3568536811u,ColorValueMode::Lab);ColorValues e{69.23862678559614,40.94540132563351,-4.796216398301811,212};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{30,-26,-0.5,153},3568536811u)!=2571587840u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(1453702478u,ColorValueMode::Lab);ColorValues e{69.9854159169424,-37.4284463938529,2.6981570443198155,86};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{40,-0.5,25,178.5},1453702478u)!=3006618987u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(686072917u,ColorValueMode::Lab);ColorValues e{65.02649619082563,-5.003858774756842,-39.50305770822058,40};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{50,25,50.5,204},686072917u)!=3424412847u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(1976707504u,ColorValueMode::Lab);ColorValues e{46.27209283251325,73.25692872402401,-58.71513334782386,117};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{60,50.5,76,229.5},1976707504u)!=3858785778u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(115814735u,ColorValueMode::Lab);ColorValues e{37.164189758827085,61.86794645448796,-86.10321179370071,6};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{70,76,101.5,255},115814735u)!=4278213887u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(2223566434u,ColorValueMode::Lab);ColorValues e{84.75072682840081,-59.41187461912728,38.25685128099625,132};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{80,101.5,127,0},2223566434u)!=17151u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(3455064665u,ColorValueMode::Lab);ColorValues e{36.276090002710696,73.11666753156612,-92.65768006620199,205};for(int i=0;i<4;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values lab");}
if(colorFromValues(ColorValueMode::Lab,ColorValues{90,127,-128,25.5},3455064665u)!=452945663u)throw std::runtime_error("Legacy color-from-values lab");
{auto v=colorToValues(4006658020u,ColorValueMode::Cmyk);ColorValues e{0,16.2280701754386,8.771929824561408,10.588235294117643,238};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{0,10,20,30,102},4006658020u)!=1720689075u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(1187088883u,ColorValueMode::Cmyk);ColorValues e{0,43.62139917695473,20.576131687242796,4.705882352941182,70};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{10,20,30,40,127.5},1187088883u)!=2154527370u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(1777649334u,ColorValueMode::Cmyk);ColorValues e{25.40983606557377,18.852459016393443,0,4.313725490196074,105};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{20,30,40,50,153},1777649334u)!=2571983206u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(2362412701u,ColorValueMode::Cmyk);ColorValues e{24.154589371980673,31.400966183574873,0,18.823529411764707,140};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{30,40,50,60,178.5},2362412701u)!=3006479687u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(52477784u,ColorValueMode::Cmyk);ColorValues e{53.92670157068062,0,83.24607329842932,25.098039215686274,3};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{40,50,60,70,204},52477784u)!=3424593454u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(552450775u,ColorValueMode::Cmyk);ColorValues e{9.282700421940932,21.51898734177216,0,7.058823529411762,32};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{50,60,70,80,229.5},552450775u)!=3859747865u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(3757185610u,ColorValueMode::Cmyk);ColorValues e{69.42148760330578,89.25619834710744,0,5.098039215686279,223};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{60,70,80,90,255},3757185610u)!=4278519818u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(2741880097u,ColorValueMode::Cmyk);ColorValues e{83.24873096446701,0,44.670050761421315,22.745098039215684,163};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{70,80,90,100,0},2741880097u)!=0u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(2244353036u,ColorValueMode::Cmyk);ColorValues e{93.93939393939394,85.85858585858585,0,22.352941176470587,133};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{80,90,100,0,25.5},2244353036u)!=436214067u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(3017222139u,ColorValueMode::Cmyk);ColorValues e{0,84.4621513944223,14.34262948207171,1.5686274509803977,179};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{90,100,0,10,51},3017222139u)!=870711319u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(4291624222u,ColorValueMode::Cmyk);ColorValues e{88.14229249011858,0,19.36758893280632,0.7843137254901933,255};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{100,0,10,20,76.5},4291624222u)!=1303956480u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(2661269989u,ColorValueMode::Cmyk);ColorValues e{0,15.720524017467255,30.567685589519648,10.196078431372547,158};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{0,10,20,30,102},2661269989u)!=1720689075u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(3777628672u,ColorValueMode::Cmyk);ColorValues e{100,76.1904761904762,0,83.52941176470588,225};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{10,20,30,40,127.5},3777628672u)!=2154527370u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(1703769439u,ColorValueMode::Cmyk);ColorValues e{32.62411347517731,17.0212765957447,0,44.705882352941174,101};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{20,30,40,50,153},1703769439u)!=2571983206u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(933806898u,ColorValueMode::Cmyk);ColorValues e{74.35897435897436,0,13.846153846153841,23.529411764705888,55};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{30,40,50,60,178.5},933806898u)!=3006479687u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(1571342569u,ColorValueMode::Cmyk);ColorValues e{0,14.163090128755362,27.896995708154503,8.62745098039216,93};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{40,50,60,70,204},1571342569u)!=3424593454u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(3704552756u,ColorValueMode::Cmyk);ColorValues e{79.44664031620555,0,18.57707509881423,0.7843137254901933,220};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{50,60,70,80,229.5},3704552756u)!=3859747865u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(2783479555u,ColorValueMode::Cmyk);ColorValues e{98.70689655172414,41.810344827586206,0,9.019607843137257,165};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{60,70,80,90,255},2783479555u)!=4278519818u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(2119434374u,ColorValueMode::Cmyk);ColorValues e{0,100,37.31343283582091,47.45098039215686,126};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{70,80,90,100,0},2119434374u)!=0u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(738090541u,ColorValueMode::Cmyk);ColorValues e{82.28346456692913,62.99212598425197,0,0.39215686274509665,43};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{80,90,100,0,25.5},738090541u)!=436214067u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(71608744u,ColorValueMode::Cmyk);ColorValues e{0.5917159763313589,0,59.76331360946746,33.72549019607843,4};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{90,100,0,10,51},71608744u)!=870711319u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(1626112231u,ColorValueMode::Cmyk);ColorValues e{2.1186440677966147,45.76271186440678,0,7.4509803921568585,96};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{100,0,10,20,76.5},1626112231u)!=1303956480u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(4200368410u,ColorValueMode::Cmyk);ColorValues e{81.02189781021897,0,32.84671532846714,46.27450980392157,250};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{0,10,20,30,102},4200368410u)!=1720689075u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(894191025u,ColorValueMode::Cmyk);ColorValues e{0,61.016949152542374,57.06214689265536,30.58823529411765,53};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{10,20,30,40,127.5},894191025u)!=2154527370u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(593232732u,ColorValueMode::Cmyk);ColorValues e{0,96.73913043478262,0,63.921568627450974,35};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{20,30,40,50,153},593232732u)!=2571983206u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(91080459u,ColorValueMode::Cmyk);ColorValues e{94.47236180904524,0,45.226130653266324,21.96078431372549,5};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{30,40,50,60,178.5},91080459u)!=3006479687u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(2959306990u,ColorValueMode::Cmyk);ColorValues e{0,52.94117647058824,58.40336134453782,6.666666666666665,176};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{40,50,60,70,204},2959306990u)!=3424593454u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(3619193717u,ColorValueMode::Cmyk);ColorValues e{36.41304347826088,28.80434782608696,0,27.84313725490196,215};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{50,60,70,80,229.5},3619193717u)!=3859747865u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(2342207056u,ColorValueMode::Cmyk);ColorValues e{48.387096774193544,60,0,39.21568627450981,139};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{60,70,80,90,255},2342207056u)!=4278519818u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(1140129135u,ColorValueMode::Cmyk);ColorValues e{56.126482213438734,0,3.557312252964425,0.7843137254901933,67};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{70,80,90,100,0},1140129135u)!=0u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(212929538u,ColorValueMode::Cmyk);ColorValues e{98.87005649717514,93.22033898305084,0,30.58823529411765,12};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{80,90,100,0,25.5},212929538u)!=436214067u)throw std::runtime_error("Legacy color-from-values cmyk");
{auto v=colorToValues(2556910457u,ColorValueMode::Cmyk);ColorValues e{0,24.79338842975205,14.876033057851235,52.54901960784314,152};for(int i=0;i<5;++i)if(std::abs(v[i]-e[i])>1e-9)throw std::runtime_error("Legacy color-to-values cmyk");}
if(colorFromValues(ColorValueMode::Cmyk,ColorValues{90,100,0,10,51},2556910457u)!=870711319u)throw std::runtime_error("Legacy color-from-values cmyk");
std::cout<<"384 original legacy numerical checks passed\n";return 0;}
