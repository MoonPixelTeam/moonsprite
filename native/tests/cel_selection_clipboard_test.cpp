#include "document.h"
#include "gradient_map_presets.h"
#include <iostream>
using namespace moon;
void require(bool value){static int count=0;++count;if(!value)throw std::runtime_error("Cel selection clipboard regression check "+std::to_string(count));}
inline void verifyConvolutionOracle(){
std::vector<Pixel> source{0u,4285614373u,4293038666u,1062460271u,12854420u,4281691577u,1067890398u,4279762691u,8931368u,1073320269u,4285192818u,4292551575u,5008572u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1072833178u,4284705727u};
{ConvolutionOptions options{"brightness",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4286140717u,4293565010u,1062986615u,12854420u,4282217921u,1068416742u,4280286987u,8931368u,1073715541u,4285719162u,4293077919u,5008572u,4291149289u,4281794318u,1067929395u,1085520u,4287226237u,1073359522u,4285232071u});}
{ConvolutionOptions options{"brightness",{true,true,true,false},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4286140717u,4293565010u,1062986615u,12854420u,4282217921u,1068416742u,4280286987u,8931368u,1073715541u,4285719162u,4293077919u,5008572u,4291149289u,4281794318u,1067929395u,1085520u,4287226237u,1073359522u,4285232071u});}
{ConvolutionOptions options{"brightness",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4286140717u,4293038666u,1062986615u,12854420u,4281691577u,1067890398u,4280286987u,8931368u,1073320269u,4285192818u,4293077919u,5008572u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1073359522u,4284705727u});}
{ConvolutionOptions options{"brightness",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614381u,4293038674u,1062460279u,12854420u,4281691585u,1067890406u,4279762699u,8931368u,1073320277u,4285192826u,4292551583u,5008572u,4290622953u,4281269774u,1067403059u,1085520u,4286699901u,1072833186u,4284705735u});}
{ConvolutionOptions options{"brightness",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4293038666u,1196677999u,12854420u,4281691577u,1202108126u,4279762691u,8931368u,1207537997u,4285192818u,4292551575u,5008572u,4290622945u,4281269766u,1201620779u,1085520u,4286699893u,1207050906u,4284705727u});}
{ConvolutionOptions options{"brightness",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"darken",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285088029u,4292512322u,1061933927u,12854420u,4281165233u,1067364054u,4279236352u,8931368u,1072793925u,4284666474u,4292025231u,5008572u,4290096601u,4280743424u,1066876707u,1085520u,4286173549u,1072306834u,4284179383u});}
{ConvolutionOptions options{"darken",{true,true,true,false},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285088029u,4292512322u,1061933927u,12854420u,4281165233u,1067364054u,4279236352u,8931368u,1072793925u,4284666474u,4292025231u,5008572u,4290096601u,4280743424u,1066876707u,1085520u,4286173549u,1072306834u,4284179383u});}
{ConvolutionOptions options{"darken",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285088029u,4293038666u,1061933927u,12854420u,4281691577u,1067890398u,4279236352u,8931368u,1073320269u,4285192818u,4292025231u,5008572u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1072306834u,4284705727u});}
{ConvolutionOptions options{"darken",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614365u,4293038658u,1062460263u,12854420u,4281691569u,1067890390u,4279762688u,8931368u,1073320261u,4285192810u,4292551567u,5008572u,4290622937u,4281269760u,1067403043u,1085520u,4286699885u,1072833170u,4284705719u});}
{ConvolutionOptions options{"darken",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4151396645u,4158820938u,928242543u,12854420u,4147473849u,933672670u,4145544963u,8931368u,939102541u,4150975090u,4158333847u,5008572u,4156405217u,4147052038u,933185323u,1085520u,4152482165u,938615450u,4150487999u});}
{ConvolutionOptions options{"darken",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"negative",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{16777215u,4287543002u,4280118709u,1068246160u,16777215u,4291465798u,1062816033u,4293394684u,16777215u,1057386162u,4287964557u,4280605800u,16777215u,4282534430u,4291887609u,1063303380u,16777215u,4286457482u,1057873253u,4288451648u});}
{ConvolutionOptions options{"negative",{true,true,true,false},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{16777215u,4287543002u,4280118709u,1068246160u,16777215u,4291465798u,1062816033u,4293394684u,16777215u,1057386162u,4287964557u,4280605800u,16777215u,4282534430u,4291887609u,1063303380u,16777215u,4286457482u,1057873253u,4288451648u});}
{ConvolutionOptions options{"negative",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4287543002u,4293038666u,1068246160u,12854420u,4281691577u,1067890398u,4293394684u,8931368u,1073320269u,4285192818u,4280605800u,16777215u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1057873253u,4284705727u});}
{ConvolutionOptions options{"negative",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{255u,4285614554u,4293038773u,1062460304u,12854527u,4281691462u,1067890209u,4279762940u,8931583u,1073320370u,4285192845u,4292551528u,5008639u,4290622750u,4281270009u,1067403220u,1085695u,4286699914u,1072833125u,4284705600u});}
{ConvolutionOptions options{"negative",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{4278190080u,7424293u,14848586u,3226721135u,4291044500u,3501497u,3232151262u,1572611u,4287121448u,3237581133u,7002738u,14361495u,4283198652u,12432865u,3079686u,3231663915u,4279275600u,8509813u,3237094042u,6515647u});}
{ConvolutionOptions options{"negative",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-3x3",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1667131518u,3079109458u,3213861450u,1535361880u,396801630u,3076819104u,2944504194u,2608576094u,1871235163u,1538111562u,3212676222u,2610201735u,2274926472u,2610473094u,3212948064u,1670866499u,1805418595u,2343408524u,2812966809u,3682172311u});}
{ConvolutionOptions options{"blur-3x3",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1602316401u,2609218906u,2945427030u,1804837739u,1200783486u,2675806599u,2944504194u,2608576094u,1871235163u,1938730599u,3212744050u,2610201735u,2274926472u,2610473094u,3212879980u,2139190616u,2275242840u,2611712120u,2543881613u,2474674044u});}
{ConvolutionOptions options{"blur-3x3",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,3079109458u,4293038666u,1535361880u,12854420u,4281691577u,1067890398u,2608576094u,8931368u,1073320269u,4285192818u,2610201735u,2274926472u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2812966809u,4284705727u});}
{ConvolutionOptions options{"blur-3x3",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{126u,4285614418u,4293038666u,1062460248u,12854366u,4281691552u,1067890306u,4279762782u,8931419u,1073320266u,4285192830u,4292551559u,5008520u,4290622854u,4281269856u,1067403075u,1085539u,4286699916u,1072833177u,4284705687u});}
{ConvolutionOptions options{"blur-3x3",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1660944384u,3077654821u,3219296842u,1532222319u,398730388u,3073732025u,2946938590u,2602041091u,1871202344u,1543082317u,3211450994u,2614829975u,2269932732u,2612901345u,3207527942u,1671382827u,1796247632u,2340542837u,2817663642u,3680725951u});}
{ConvolutionOptions options{"blur-3x3",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-5x5",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2289599854u,2525203556u,2408422491u,1955507288u,1351925837u,2524154228u,2558627699u,2475466090u,2173937255u,1955639643u,2457699690u,2425195126u,2542835573u,2509478264u,2693112432u,2122873178u,2040036975u,2392230781u,2694154124u,3280308874u});}
{ConvolutionOptions options{"blur-5x5",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2475135854u,2458815856u,2408617840u,2374933875u,2424806509u,2340917105u,2374734704u,2425265009u,2358286199u,2357891701u,2408092017u,2576126062u,2593102446u,2391645811u,2307496563u,2391379319u,2441777270u,2425068143u,2274334833u,2291044979u});}
{ConvolutionOptions options{"blur-5x5",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,2525203556u,4293038666u,1955507288u,12854420u,4281691577u,1067890398u,2475466090u,8931368u,1073320269u,4285192818u,2425195126u,2542835573u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2694154124u,4284705727u});}
{ConvolutionOptions options{"blur-5x5",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{110u,4285614436u,4293038683u,1062460248u,12854349u,4281691508u,1067890291u,4279762794u,8931431u,1073320283u,4285192810u,4292551542u,5008501u,4290622840u,4281269872u,1067403098u,1085551u,4286699901u,1072833164u,4284705674u});}
{ConvolutionOptions options{"blur-5x5",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2281701376u,2524006693u,2413990474u,1951652719u,1355031700u,2520083897u,2561062622u,2467823363u,2173192232u,1962512717u,2456476274u,2430280599u,2538368188u,2512238049u,2687434246u,2124367659u,2031128656u,2390874485u,2700223130u,3278072767u});}
{ConvolutionOptions options{"blur-5x5",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-7x7",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2021427817u,2139459171u,2123143264u,1921884256u,1720690011u,2172552556u,2273741930u,2307691881u,2190383723u,2106498666u,2173140839u,2307622507u,2458685551u,2475463286u,2559088248u,1989178206u,2173795434u,2458879349u,2643297922u,2911209866u});}
{ConvolutionOptions options{"blur-7x7",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2441844595u,2358154614u,2424871024u,2391642486u,2509018736u,2408355696u,2375062130u,2441844079u,2391642230u,2475398767u,2324403570u,2324534387u,2424871021u,2324533364u,2374865776u,2425002610u,2391643508u,2441648493u,2374735219u,2441845358u});}
{ConvolutionOptions options{"blur-7x7",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,2139459171u,4293038666u,1921884256u,12854420u,4281691577u,1067890398u,2307691881u,8931368u,1073320269u,4285192818u,2307622507u,2458685551u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2643297922u,4284705727u});}
{ConvolutionOptions options{"blur-7x7",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{105u,4285614435u,4293038688u,1062460256u,12854363u,4281691500u,1067890282u,4279762793u,8931435u,1073320298u,4285192807u,4292551531u,5008495u,4290622838u,4281269880u,1067403102u,1085546u,4286699893u,1072833154u,4284705674u});}
{ConvolutionOptions options{"blur-7x7",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2013265920u,2138130725u,2128777802u,1918098287u,1724130452u,2167762361u,2275849950u,2300051203u,2189969448u,2113507661u,2171263602u,2312840087u,2454482108u,2478683617u,2553216518u,1990149931u,2165346384u,2457983349u,2649891482u,2908974015u});}
{ConvolutionOptions options{"blur-7x7",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-9x9",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1820493667u,1921485922u,1955238755u,1871419493u,1787534181u,1971618405u,2089256807u,2156564329u,2123076206u,2122945904u,2039053410u,2190115432u,2324334958u,2391379061u,2475003770u,1989047134u,2173598056u,2391572594u,2542437245u,2743371398u});}
{ConvolutionOptions options{"blur-9x9",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2374866543u,2374735726u,2341245809u,2408224109u,2374800496u,2391578738u,2391382385u,2357957748u,2424936304u,2391512691u,2475530354u,2475399537u,2441909364u,2508887920u,2475464307u,2391708530u,2391577713u,2358087797u,2425131632u,2391642483u});}
{ConvolutionOptions options{"blur-9x9",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1921485922u,4293038666u,1871419493u,12854420u,4281691577u,1067890398u,2156564329u,8931368u,1073320269u,4285192818u,2190115432u,2324334958u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2542437245u,4284705727u});}
{ConvolutionOptions options{"blur-9x9",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{99u,4285614434u,4293038691u,1062460261u,12854373u,4281691493u,1067890279u,4279762793u,8931438u,1073320304u,4285192802u,4292551528u,5008494u,4290622837u,4281269882u,1067403102u,1085544u,4286699890u,1072833149u,4284705670u});}
{ConvolutionOptions options{"blur-9x9",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1811939328u,1920026917u,1961005642u,1867766639u,1791239316u,1966435769u,2091300574u,2149056259u,2122860584u,2130284877u,2037045874u,2195399575u,2320264380u,2394797537u,2469330438u,1990149931u,2165346384u,2390874485u,2549228186u,2741201855u});}
{ConvolutionOptions options{"blur-9x9",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-17x17",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1518893664u,1602714980u,1669824873u,1703248750u,1736672627u,1653110625u,1753709158u,1837596267u,1887797361u,1937998455u,1770615905u,1871214439u,1988524909u,2055503220u,2139193210u,1837789025u,1971941992u,2106029679u,2189719671u,2306964094u});}
{ConvolutionOptions options{"blur-17x17",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2391578224u,2374800753u,2391447152u,2374800241u,2408355184u,2391512946u,2374801011u,2408224369u,2391512179u,2408289905u,2441910130u,2425132659u,2441778801u,2425132147u,2458687089u,2391577970u,2374866035u,2408289393u,2391577203u,2425132145u});}
{ConvolutionOptions options{"blur-17x17",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1602714980u,4293038666u,1703248750u,12854420u,4281691577u,1067890398u,1837596267u,8931368u,1073320269u,4285192818u,1871214439u,1988524909u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2189719671u,4284705727u});}
{ConvolutionOptions options{"blur-17x17",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{96u,4285614436u,4293038697u,1062460270u,12854387u,4281691489u,1067890278u,4279762795u,8931441u,1073320311u,4285192801u,4292551527u,5008493u,4290622836u,4281269882u,1067403105u,1085544u,4286699887u,1072833143u,4284705662u});}
{ConvolutionOptions options{"blur-17x17",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1509949440u,1601259813u,1675792970u,1699994479u,1740907668u,1647668665u,1755756254u,1830289155u,1887979560u,1945735501u,1768610418u,1876632471u,1984720060u,2059253217u,2133786118u,1839154987u,1964019792u,2105661813u,2196906650u,2304994239u});}
{ConvolutionOptions options{"blur-17x17",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-5x1",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1722379575u,1921815114u,1921815114u,1921815114u,1067103836u,3628439708u,2773066644u,2138745977u,1487648094u,1489022010u,3431378043u,3432752023u,3431771260u,3430790497u,3427920700u,1486318397u,1487692377u,2141023102u,2777576611u,3632624296u});}
{ConvolutionOptions options{"blur-5x1",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1921815114u,1921815114u,1921815114u,1921815114u,1921815114u,2138745977u,2138745977u,2138745977u,2138745977u,2138745977u,3431771260u,3431771260u,3431771260u,3431771260u,3431771260u,2141023102u,2141023102u,2141023102u,2141023102u,2141023102u});}
{ConvolutionOptions options{"blur-5x1",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1921815114u,4293038666u,1921815114u,12854420u,4281691577u,1067890398u,2138745977u,8931368u,1073320269u,4285192818u,3432752023u,3431771260u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2777576611u,4284705727u});}
{ConvolutionOptions options{"blur-5x1",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{55u,4285614410u,4293038666u,1062460234u,12854364u,4281691548u,1067890324u,4279762809u,8931422u,1073320250u,4285192827u,4292551575u,5008508u,4290622817u,4281269820u,1067403069u,1085529u,4286699902u,1072833187u,4284705704u});}
{ConvolutionOptions options{"blur-5x1",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1711276032u,1920026917u,1927451210u,1918098287u,1069819028u,3627380153u,2779166430u,2132279043u,1485326376u,1492750669u,3429554802u,3436913559u,3427560636u,3434984929u,3425631750u,1486833451u,1477480528u,2139216245u,2784109210u,3630394303u});}
{ConvolutionOptions options{"blur-5x1",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-1x5",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1716495253u,3633338208u,3434065208u,1483592075u,1066649385u,1919583346u,2778225263u,3432496963u,1486201750u,1921230939u,2138535264u,1923506312u,3430862925u,1488811425u,2776340852u,2340383829u,1069575354u,3429294680u,1491355307u,3631648899u});}
{ConvolutionOptions options{"blur-1x5",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2775226994u,2779992460u,2575224384u,2142214578u,2775498310u,2138535264u,1923506312u,3430862925u,1488811425u,2776340852u,1919583346u,2778225263u,3432496963u,1486201750u,1921230939u,2774302339u,2141615774u,3429161521u,1286312099u,2141233751u});}
{ConvolutionOptions options{"blur-1x5",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,3633338208u,4293038666u,1483592075u,12854420u,4281691577u,1067890398u,3432496963u,8931368u,1073320269u,4285192818u,1923506312u,3430862925u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1491355307u,4284705727u});}
{ConvolutionOptions options{"blur-1x5",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{149u,4285614432u,4293038648u,1062460299u,12854313u,4281691506u,1067890287u,4279762755u,8931478u,1073320283u,4285192800u,4292551560u,5008461u,4290622881u,4281269876u,1067403093u,1085626u,4286699864u,1072833195u,4284705667u});}
{ConvolutionOptions options{"blur-1x5",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1711276032u,3631302949u,3437400650u,1481890671u,1069819028u,1916104121u,2779166430u,3424124675u,1485326376u,1928958285u,2137709170u,1926964119u,3427560636u,1488827873u,2771320326u,2342471467u,1058050128u,3431061877u,1492263578u,3630394303u});}
{ConvolutionOptions options{"blur-1x5",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-9x1",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1066177098u,1066177098u,1066177098u,1066177098u,1066177098u,3092745369u,2725286283u,2374538622u,2023856752u,1656331875u,3799761783u,3799238505u,3798781020u,3798257742u,3797800257u,1654544724u,2023120231u,2374984313u,2726782604u,3095423902u});}
{ConvolutionOptions options{"blur-9x1",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2139918922u,1670553681u,1669042762u,2023260994u,2139918922u,1904522608u,2255793003u,1904845194u,2373627001u,2255007872u,3331368317u,3330326392u,3800870012u,3330648685u,3331956876u,2258464906u,2375904126u,1906400127u,2257679738u,1906666357u});}
{ConvolutionOptions options{"blur-9x1",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1066177098u,4293038666u,1066177098u,12854420u,4281691577u,1067890398u,2374538622u,8931368u,1073320269u,4285192818u,3799238505u,3798781020u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2726782604u,4284705727u});}
{ConvolutionOptions options{"blur-9x1",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{74u,4285614410u,4293038666u,1062460234u,12854346u,4281691545u,1067890315u,4279762814u,8931440u,1073320291u,4285192823u,4292551529u,5008476u,4290622798u,4281269825u,1067403092u,1085543u,4286699897u,1072833164u,4284705694u});}
{ConvolutionOptions options{"blur-9x1",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1056964608u,1064388901u,1071813194u,1062460271u,1069819028u,3090509241u,2728834782u,2367160067u,2022197288u,1660522829u,3798653554u,3806012311u,3796659388u,3804083681u,3794730502u,1654605611u,2014351440u,2374097269u,2733777562u,3093523391u});}
{ConvolutionOptions options{"blur-9x1",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-1x9",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1182233952u,2978435919u,3803230539u,1300801672u,1551604084u,1300196437u,2492159062u,3802446417u,1302040717u,2021036163u,1417962830u,2022725472u,3801662294u,1303345554u,2490599821u,1535664457u,1553488495u,3800878172u,1304650392u,2976941460u});}
{ConvolutionOptions options{"blur-1x9",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2137687154u,2610847098u,3331114306u,1537121179u,2139334747u,2606924156u,2259053716u,3329217847u,1420529827u,2257888601u,2607452274u,2611828618u,2860437056u,1907201452u,2608313423u,2255584103u,2141610120u,3330199368u,1538621602u,2608766825u});}
{ConvolutionOptions options{"blur-1x9",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,2978435919u,4293038666u,1300801672u,12854420u,4281691577u,1067890398u,3802446417u,8931368u,1073320269u,4285192818u,2022725472u,3801662294u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1304650392u,4284705727u});}
{ConvolutionOptions options{"blur-1x9",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{96u,4285614415u,4293038667u,1062460296u,12854388u,4281691477u,1067890262u,4279762769u,8931469u,1073320323u,4285192782u,4292551520u,5008470u,4290622866u,4281269901u,1067403081u,1085551u,4286699868u,1072833176u,4284705684u});}
{ConvolutionOptions options{"blur-1x9",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1174405120u,2976991525u,3806499402u,1297341295u,1556358292u,1295347129u,2493953758u,3793223427u,1300777000u,2029621581u,1416288882u,2027627415u,3796659388u,1304278497u,2486107654u,1537165099u,1544589392u,3800160629u,1307714202u,2976082879u});}
{ConvolutionOptions options{"blur-1x9",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-17x1",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{562860618u,562860618u,562860618u,562860618u,562860618u,2893514126u,2692974727u,2509212288u,2325515385u,2141752947u,4033075033u,4032813394u,4032617548u,4032355909u,4032094270u,2140100964u,2324388718u,2508742007u,2693029760u,2894094985u});}
{ConvolutionOptions options{"blur-17x1",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2005899341u,1753651533u,1703711306u,1955170886u,2207353670u,2138289008u,1938074230u,2189338235u,2188945541u,2188817272u,3280972931u,3532173946u,3531781490u,3532629373u,3281166718u,2191617407u,2191484548u,2191091836u,1939695735u,2140894077u});}
{ConvolutionOptions options{"blur-17x1",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,562860618u,4293038666u,562860618u,12854420u,4281691577u,1067890398u,2509212288u,8931368u,1073320269u,4285192818u,4032813394u,4032617548u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2693029760u,4284705727u});}
{ConvolutionOptions options{"blur-17x1",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{74u,4285614410u,4293038666u,1062460234u,12854346u,4281691534u,1067890311u,4279762816u,8931449u,1073320307u,4285192793u,4292551506u,5008460u,4290622789u,4281269822u,1067403108u,1085550u,4286699895u,1072833152u,4284705673u});}
{ConvolutionOptions options{"blur-17x1",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{553648128u,561072421u,568496714u,559143791u,566502548u,2889182649u,2695280350u,2501377795u,2324187176u,2147062093u,4033534578u,4040893335u,4031540412u,4038964705u,4029611526u,2141144875u,2316341328u,2508314997u,2700223130u,2892196799u});}
{ConvolutionOptions options{"blur-17x1",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"blur-1x17",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{881548869u,2575257408u,4038112085u,1184207750u,1819247257u,932010818u,2323664962u,4037719896u,1184860040u,2070773661u,999250240u,2072137798u,4037327963u,1185512587u,2322365857u,1066424126u,1820610890u,4036935773u,1186164878u,2573958051u});}
{ConvolutionOptions options{"blur-1x17",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2255127666u,2510380673u,3280324929u,1571067551u,2256775259u,2506457719u,2326161295u,3279343931u,1504415907u,2324473434u,2506787698u,2510969737u,3028209216u,1756140456u,2507976532u,2322497388u,2259050632u,3279867460u,1571850402u,2508235619u});}
{ConvolutionOptions options{"blur-1x17",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,2575257408u,4293038666u,1184207750u,12854420u,4281691577u,1067890398u,4037719896u,8931368u,1073320269u,4285192818u,2072137798u,4037327963u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1186164878u,4284705727u});}
{ConvolutionOptions options{"blur-1x17",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{69u,4285614400u,4293038677u,1062460294u,12854425u,4281691458u,1067890242u,4279762776u,8931464u,1073320349u,4285192768u,4292551494u,5008475u,4290622859u,4281269921u,1067403070u,1085514u,4286699869u,1072833166u,4284705699u});}
{ConvolutionOptions options{"blur-1x17",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{872415232u,2574338341u,4041380426u,1179900783u,1824793748u,926248377u,2326181598u,4028104451u,1183336488u,2079953229u,996858482u,2077959063u,4031540412u,1186837985u,2318335494u,1067403051u,1813024848u,4035041653u,1190273690u,2573429695u});}
{ConvolutionOptions options{"blur-1x17",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"sharpen-3x3",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{6516101u,4284750080u,4294934849u,238021506u,10925662u,4278737621u,12570623u,4278255360u,8964178u,251622217u,4283891553u,4294901933u,10589841u,4292852991u,4278255360u,111357202u,9865825u,4284415841u,16711842u,4282470386u});}
{ConvolutionOptions options{"sharpen-3x3",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{9138813u,4285075968u,4294936374u,2424692u,9663102u,4278211563u,12570623u,4278255360u,8964178u,16742709u,4283367273u,4294901933u,10589841u,4292852991u,4278255360u,11675665u,10387033u,4284743536u,16711854u,4283124208u});}
{ConvolutionOptions options{"sharpen-3x3",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4284750080u,4293038666u,238021506u,12854420u,4281691577u,1067890398u,4278255360u,8931368u,1073320269u,4285192818u,4294901933u,10589841u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,16711842u,4284705727u});}
{ConvolutionOptions options{"sharpen-3x3",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{133u,4285614336u,4293038657u,1062460290u,12854366u,4281691605u,1067890431u,4279762688u,8931410u,1073320265u,4285192801u,4292551597u,5008529u,4290622975u,4281269760u,1067403026u,1085537u,4286699873u,1072833186u,4284705778u});}
{ConvolutionOptions options{"sharpen-3x3",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4293038666u,240376687u,12854420u,4281691577u,10925790u,4279762691u,8931368u,251236685u,4285192818u,4292551575u,5008572u,4290622945u,4281269766u,111101739u,1085520u,4286699893u,15868570u,4284705727u});}
{ConvolutionOptions options{"sharpen-3x3",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"sharpen-5x5",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{8293483u,4285013248u,4294937405u,3340413u,9486921u,4279066340u,12045567u,4278255360u,9476967u,16745025u,4284219259u,4294901935u,9407604u,4292463103u,4278255360u,11868675u,9796721u,4285857647u,16711846u,4282599668u});}
{ConvolutionOptions options{"sharpen-5x5",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{9214580u,4284421376u,4294937647u,3080043u,9214580u,4278212836u,11849983u,4278255360u,9407604u,16749363u,4283891573u,4294901936u,9213291u,4292462591u,4278255360u,11342336u,8952435u,4286381941u,16711858u,4283124974u});}
{ConvolutionOptions options{"sharpen-5x5",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285013248u,4293038666u,3340413u,12854420u,4281691577u,1067890398u,4278255360u,8931368u,1073320269u,4285192818u,4294901935u,9407604u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,16711846u,4284705727u});}
{ConvolutionOptions options{"sharpen-5x5",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{107u,4285614336u,4293038653u,1062460285u,12854345u,4281691620u,1067890431u,4279762688u,8931431u,1073320257u,4285192827u,4292551599u,5008500u,4290622975u,4281269760u,1067403011u,1085553u,4286699887u,1072833190u,4284705780u});}
{ConvolutionOptions options{"sharpen-5x5",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4293038666u,5495663u,12854420u,4281691577u,10925790u,4279762691u,8931368u,16355661u,4285192818u,4292551575u,5008572u,4290622945u,4281269766u,10438443u,1085520u,4286699893u,15868570u,4284705727u});}
{ConvolutionOptions options{"sharpen-5x5",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"sharpen-7x7",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{8555880u,4284950535u,4294938686u,121305205u,9280607u,4278804964u,78958079u,4278255360u,9080940u,16748091u,4283760506u,4294901937u,9143663u,4292595455u,4278255360u,145172486u,9402730u,4286185333u,16711852u,4283061732u});}
{ConvolutionOptions options{"sharpen-7x7",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{9346166u,4284225280u,4294938415u,3080039u,9214068u,4278211299u,11848191u,4278255360u,9340783u,16748858u,4283760500u,4294901930u,8949360u,4292595711u,4278255360u,11210498u,9216369u,4286577529u,16711856u,4282994418u});}
{ConvolutionOptions options{"sharpen-7x7",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4284950535u,4293038666u,121305205u,12854420u,4281691577u,1067890398u,4278255360u,8931368u,1073320269u,4285192818u,4294901937u,9143663u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,16711852u,4284705727u});}
{ConvolutionOptions options{"sharpen-7x7",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{104u,4285614343u,4293038654u,1062460277u,12854367u,4281691620u,1067890431u,4279762688u,8931436u,1073320251u,4285192826u,4292551601u,5008495u,4290622975u,4281269760u,1067403014u,1085546u,4286699893u,1072833196u,4284705764u});}
{ConvolutionOptions options{"sharpen-7x7",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4293038666u,122936175u,12854420u,4281691577u,78034654u,4279762691u,8931368u,16355661u,4285192818u,4292551575u,5008572u,4290622945u,4281269766u,144656171u,1085520u,4286699893u,15868570u,4284705727u});}
{ConvolutionOptions options{"sharpen-7x7",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"edges-find",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{8161446u,4280287232u,4294901760u,53897u,14545533u,4278193371u,12898047u,4278255360u,10743907u,16718383u,4278255360u,4294901934u,12694702u,4294021631u,4278255360u,7929856u,11838837u,4278386465u,16711795u,4278190335u});}
{ConvolutionOptions options{"edges-find",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{10979735u,4281401344u,4294917632u,65370u,11635096u,4278190335u,12898047u,4278255360u,10743907u,16722944u,4278255378u,4294901934u,12694702u,4294021631u,4278255360u,11272192u,12490859u,4278255421u,16711849u,4278190335u});}
{ConvolutionOptions options{"edges-find",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4280287232u,4293038666u,53897u,12854420u,4281691577u,1067890398u,4278255360u,8931368u,1073320269u,4285192818u,4294901934u,12694702u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,16711795u,4284705727u});}
{ConvolutionOptions options{"edges-find",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{166u,4285614336u,4293038592u,1062460297u,12854397u,4281691611u,1067890431u,4279762688u,8931427u,1073320239u,4285192704u,4292551598u,5008558u,4290622975u,4281269760u,1067403008u,1085557u,4286699809u,1072833139u,4284705791u});}
{ConvolutionOptions options{"edges-find",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4293038666u,5495663u,12854420u,4281691577u,10925790u,4279762691u,8931368u,16355661u,4285192818u,4292551575u,5008572u,4290622945u,4281269766u,10438443u,1085520u,4286699893u,15868570u,4284705727u});}
{ConvolutionOptions options{"edges-find",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"edges-horizontal",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{10485759u,4285614373u,4285792256u,1059389545u,12854420u,4278212095u,1057017492u,4279762691u,0u,1073676288u,4287154216u,4292551575u,16711935u,4290622945u,4278255360u,1067403051u,8960u,4278199040u,1064632435u,4288610559u});}
{ConvolutionOptions options{"edges-horizontal",{true,true,true,false},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{16444159u,4285614373u,4284366336u,1062460271u,16715478u,4288045532u,1057017492u,4279762691u,0u,1068761156u,4278765568u,4292551575u,16711935u,4290622945u,4278255380u,1059061920u,26624u,4286699893u,1065615529u,4290773098u});}
{ConvolutionOptions options{"edges-horizontal",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4293038666u,1059389545u,12854420u,4281691577u,1067890398u,4279762691u,8931368u,1073320269u,4285192818u,4292551575u,16711935u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1064632435u,4284705727u});}
{ConvolutionOptions options{"edges-horizontal",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{255u,4285614373u,4293038592u,1062460265u,12854420u,4281691647u,1067890324u,4279762691u,8931328u,1073320192u,4285192744u,4292551575u,5008639u,4290622945u,4281269760u,1067403051u,1085440u,4286699776u,1072833139u,4284705791u});}
{ConvolutionOptions options{"edges-horizontal",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4293038666u,5495663u,12854420u,2117430713u,2124855006u,4279762691u,8931368u,16355661u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,1067403051u,1085520u,8509813u,1072833178u,6515647u});}
{ConvolutionOptions options{"edges-horizontal",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"edges-vertical",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{16767855u,4283760725u,4291077120u,1057011928u,12854420u,4281691577u,1069809812u,4279762691u,255u,1058471936u,4278213120u,4292551575u,65280u,4290622945u,4278227200u,1061448720u,8060738u,4278255360u,1073676510u,4278246144u});}
{ConvolutionOptions options{"edges-vertical",{true,true,true,false},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4281528832u,1062460271u,10438443u,4281691577u,1069809812u,4279762691u,255u,1067403008u,4278199314u,4292551575u,65280u,4290622945u,4279486208u,1060465920u,2883612u,4286699893u,1068511429u,4284705727u});}
{ConvolutionOptions options{"edges-vertical",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4283760725u,4293038666u,1057011928u,12854420u,4281691577u,1067890398u,4279762691u,8931368u,1073320269u,4285192818u,4292551575u,65280u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1073676510u,4284705727u});}
{ConvolutionOptions options{"edges-vertical",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{111u,4285614421u,4293038592u,1062460376u,12854420u,4281691577u,1067890324u,4279762691u,8931583u,1073320192u,4285192704u,4292551575u,5008384u,4290622945u,4281269760u,1067403024u,1085506u,4286699776u,1072833246u,4284705536u});}
{ConvolutionOptions options{"edges-vertical",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,2121353509u,4293038666u,5495663u,12854420u,4281691577u,2124855006u,4279762691u,8931368u,16355661u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,2124367659u,1085520u,4286699893u,15868570u,4284705727u});}
{ConvolutionOptions options{"edges-vertical",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"contour",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{16777215u,4294901760u,4293038666u,1069088767u,16777215u,4278255615u,1073741823u,4278255360u,16777215u,1073741823u,4285192818u,4294902015u,16777215u,4294967295u,4281269766u,1073711963u,16777215u,4294967295u,1072833178u,4294967040u});}
{ConvolutionOptions options{"contour",{true,true,true,false},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{16777215u,4294901760u,4294967243u,1057030143u,16777215u,4278246655u,1073741823u,4278255360u,16777215u,1073741811u,4285192818u,4294902015u,16777215u,4294967295u,4281269766u,1073726642u,16777215u,4292345855u,1073676543u,4292773631u});}
{ConvolutionOptions options{"contour",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4294901760u,4293038666u,1069088767u,12854420u,4281691577u,1067890398u,4278255360u,8931368u,1073320269u,4285192818u,4294902015u,16777215u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1072833178u,4284705727u});}
{ConvolutionOptions options{"contour",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{255u,4285614336u,4293038666u,1062460415u,12854527u,4281691647u,1067890431u,4279762688u,8931583u,1073320447u,4285192818u,4292551679u,5008639u,4290622975u,4281269766u,1067403099u,1085695u,4286700031u,1072833178u,4284705536u});}
{ConvolutionOptions options{"contour",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{4278190080u,7424293u,4293038666u,4283685743u,4291044500u,3501497u,4289115870u,1572611u,4287121448u,4294545741u,4285192818u,14361495u,4283198652u,12432865u,4281269766u,4288628523u,4279275600u,8509813u,1072833178u,6515647u});}
{ConvolutionOptions options{"contour",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"emboss",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{14937599u,4291952578u,4294906823u,1073741823u,16711706u,4294957809u,1070394428u,4294963248u,6603956u,1070202710u,4279238655u,4294508543u,16711860u,4294934271u,4284601308u,1073741823u,1085520u,4294955996u,1070166783u,4278190335u});}
{ConvolutionOptions options{"emboss",{true,true,true,false},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{13041656u,4289265608u,4278255448u,1073741823u,12854420u,4294169087u,1070394428u,4294963248u,6603956u,1068562625u,4294967295u,4294508543u,16711860u,4294934271u,4288458653u,1070071807u,15247368u,4290903985u,1056979032u,4294967295u});}
{ConvolutionOptions options{"emboss",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4291952578u,4293038666u,1073741823u,12854420u,4281691577u,1067890398u,4294963248u,8931368u,1073320269u,4285192818u,4294508543u,16711860u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1070166783u,4284705727u});}
{ConvolutionOptions options{"emboss",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{255u,4285614530u,4293038791u,1062460415u,12854298u,4281691633u,1067890236u,4279762736u,8931508u,1073320278u,4285192959u,4292551679u,5008564u,4290622975u,4281269980u,1067403263u,1085520u,4286699996u,1072833279u,4284705791u});}
{ConvolutionOptions options{"emboss",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{4278190080u,4285614373u,14848586u,5495663u,2160338068u,4281691577u,2158409438u,1572611u,2156415016u,4294545741u,7002738u,14361495u,2152492220u,4290622945u,4281269766u,10438443u,1085520u,1048697205u,4294058650u,4284705727u});}
{ConvolutionOptions options{"emboss",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"emboss-reverse",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{16777215u,4294967295u,4294925463u,1071119035u,65510u,4294967295u,1060377796u,4291863910u,10239052u,1073741569u,4284219391u,4289248767u,65356u,4294932735u,4280418303u,1070596053u,15026851u,4294967295u,1073698303u,4294967040u});}
{ConvolutionOptions options{"emboss-reverse",{true,true,true,false},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4294508543u,4294901928u,1070394598u,16748497u,4294967295u,1060377796u,4291863910u,10239052u,1073741823u,4291428274u,4289248767u,65356u,4294932735u,4292214745u,1066926033u,1595640u,4294967295u,1073727656u,4294901759u});}
{ConvolutionOptions options{"emboss-reverse",{true,true,true,false},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4294967295u,4293038666u,1071119035u,12854420u,4281691577u,1067890398u,4291863910u,8931368u,1073320269u,4285192818u,4289248767u,65356u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1073698303u,4284705727u});}
{ConvolutionOptions options{"emboss-reverse",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{255u,4285614591u,4293038743u,1062460347u,12854502u,4281691647u,1067890372u,4279762790u,8931404u,1073320193u,4285192959u,4292551679u,5008460u,4290622975u,4281270015u,1067403221u,1085603u,4286700031u,1072833279u,4284705536u});}
{ConvolutionOptions options{"emboss-reverse",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,7424293u,4293038666u,4283685743u,2160338068u,3501497u,2158409438u,4279762691u,2156415016u,16355661u,4285192818u,4292551575u,2152492220u,12432865u,3079686u,4288628523u,3205533776u,3263289717u,15868570u,6515647u});}
{ConvolutionOptions options{"emboss-reverse",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-3x3_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1919842708u,3429339466u,2140380015u,2140258114u,430356062u,3430575225u,1923528328u,3632109673u,1720240168u,2139998056u,2138673549u,3631516003u,432827580u,3632903546u,2141161323u,2141217367u,1921230939u,2780984481u,2776734069u,3632760985u});}
{ConvolutionOptions options{"drunk-3x3_x",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1286312099u,3630141773u,1288927382u,2993994851u,1284982655u,3429594462u,1923528328u,3632109673u,1720240168u,2140978819u,2140906391u,3631516003u,432827580u,3632903546u,2138928481u,2777050171u,1722201694u,3633484160u,1923846222u,2776085920u});}
{ConvolutionOptions options{"drunk-3x3_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,3429339466u,4293038666u,2140258114u,12854420u,4281691577u,1067890398u,3632109673u,8931368u,1073320269u,4285192818u,3631516003u,432827580u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2776734069u,4284705727u});}
{ConvolutionOptions options{"drunk-3x3_x",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{148u,4285614410u,4293038703u,1062460226u,12854366u,4281691513u,1067890312u,4279762793u,8931368u,1073320296u,4285192845u,4292551523u,5008572u,4290622842u,4281269867u,1067403095u,1085531u,4286699937u,1072833141u,4284705689u});}
{ConvolutionOptions options{"drunk-3x3_x",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1912602624u,3429976357u,2145555018u,2136202095u,432284820u,3426053561u,1923528414u,3625451267u,1720207400u,2147062093u,2137709170u,3638240151u,424438972u,3636311521u,2133786118u,2141144875u,1913688144u,2776750453u,2784109210u,3630394303u});}
{ConvolutionOptions options{"drunk-3x3_x",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-3x3_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1716738927u,2778363484u,3632703291u,1283637858u,430356062u,2774440624u,3631383159u,1921696355u,2139670632u,1286976821u,3632300665u,1923322274u,3431771260u,1923062912u,3632118885u,1485925180u,1923705703u,1923521665u,2998170280u,3631577490u});}
{ConvolutionOptions options{"drunk-3x3_+",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1919702104u,1923646831u,3631396420u,1287095665u,1284480382u,2140119957u,3631383159u,1921696355u,2139670632u,1920248153u,3631516003u,1923322274u,3431771260u,1923062912u,3632903546u,1920566388u,2778424151u,1925678195u,2996082591u,2139649122u});}
{ConvolutionOptions options{"drunk-3x3_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,2778363484u,4293038666u,1283637858u,12854420u,4281691577u,1067890398u,1921696355u,8931368u,1073320269u,4285192818u,1923322274u,3431771260u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2998170280u,4284705727u});}
{ConvolutionOptions options{"drunk-3x3_+",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{111u,4285614428u,4293038651u,1062460258u,12854366u,4281691568u,1067890295u,4279762787u,8931432u,1073320245u,4285192825u,4292551586u,5008508u,4290622848u,4281269861u,1067403068u,1085543u,4286699905u,1072833192u,4284705682u});}
{ConvolutionOptions options{"drunk-3x3_+",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1711276032u,2775664933u,3638727242u,1280564079u,432284820u,2771742137u,3634804446u,1914175235u,2139637800u,1291424077u,3630881394u,1926964119u,3427560636u,1925035489u,3626958342u,1486833451u,1913688144u,1921112437u,3002213018u,3630394303u});}
{ConvolutionOptions options{"drunk-3x3_+",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-3x3_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2271440261u,2810615651u,2540938837u,1872868931u,531019358u,2810153865u,3212544862u,2410056584u,2408106066u,1870320213u,2541908358u,2406133618u,2409731729u,2407770203u,2544339843u,2006413908u,2409007713u,1875666080u,3347423119u,3481568907u});}
{ConvolutionOptions options{"drunk-3x3_o",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2005627517u,2407441259u,2004788075u,2409731686u,1603498622u,2408945509u,3212544862u,2410056584u,2408106066u,2271200384u,2542633341u,2406133618u,2409731729u,2407770203u,2543614861u,2675214691u,2812182105u,2410836605u,2810231672u,2005508716u});}
{ConvolutionOptions options{"drunk-3x3_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,2810615651u,4293038666u,1872868931u,12854420u,4281691577u,1067890398u,2410056584u,8931368u,1073320269u,4285192818u,2406133618u,2409731729u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,3347423119u,4284705727u});}
{ConvolutionOptions options{"drunk-3x3_o",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{133u,4285614435u,4293038677u,1062460227u,12854366u,4281691529u,1067890270u,4279762824u,8931410u,1073320277u,4285192838u,4292551538u,5008529u,4290622811u,4281269891u,1067403092u,1085537u,4286699936u,1072833167u,4284705675u});}
{ConvolutionOptions options{"drunk-3x3_o",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2264924160u,2809219365u,2548208202u,1867766639u,532948116u,2805296569u,3215374046u,2400714499u,2408073256u,1878626637u,2540362354u,2413503383u,2404150460u,2411574753u,2536439302u,2006927147u,2400227408u,1870780789u,3354534554u,3479399359u});}
{ConvolutionOptions options{"drunk-3x3_o",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-5x5_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1722201694u,2776280185u,2575224384u,2775814476u,1720240168u,2777515880u,849510020u,1918734415u,1718246002u,2779748722u,2778440535u,1487886706u,1065441653u,2575661207u,3430790497u,2993197134u,1284982655u,2995356026u,1488811425u,3631720051u});}
{ConvolutionOptions options{"drunk-5x5_x",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1723708897u,4285840483u,4285192766u,3633484160u,1725637527u,2996796049u,2343132342u,2993388126u,429868843u,1923727719u,2995830112u,1283497340u,5008572u,2575986019u,4287662637u,1917108496u,435786061u,2995949952u,2340977601u,2992620672u});}
{ConvolutionOptions options{"drunk-5x5_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,2776280185u,4293038666u,2775814476u,12854420u,4281691577u,1067890398u,1918734415u,8931368u,1073320269u,4285192818u,1487886706u,1065441653u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1488811425u,4284705727u});}
{ConvolutionOptions options{"drunk-5x5_x",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{94u,4285614457u,4293038656u,1062460236u,12854312u,4281691496u,1067890308u,4279762767u,8931442u,1073320306u,4285192791u,4292551538u,5008501u,4290622871u,4281269857u,1067403086u,1085567u,4286699898u,1072833185u,4284705651u});}
{ConvolutionOptions options{"drunk-5x5_x",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1711276032u,2775664933u,2581762634u,2773736303u,1724130452u,2771742137u,849786590u,1914175235u,1720207400u,2784596301u,2775243378u,1490756503u,1061973180u,2579346913u,3425631750u,2996782891u,1276153936u,2994854261u,1492263578u,3630394303u});}
{ConvolutionOptions options{"drunk-5x5_x",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-5x5_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1722201694u,2776917076u,1726124618u,2138418553u,1720240168u,2772994152u,1919842708u,3632836187u,851022221u,2140906327u,1920706906u,3432808067u,3430862925u,2996539521u,2571095363u,2340645718u,633167755u,3630935390u,1287797414u,3632760985u});}
{ConvolutionOptions options{"drunk-5x5_+",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2776811623u,2778618480u,870486602u,2777654165u,3429610782u,2137161284u,433038229u,3631529059u,1487886770u,2994708360u,1720960937u,4287134555u,3432496963u,2995302030u,1719963726u,2994695304u,1487437509u,3629561159u,432551010u,2142607731u});}
{ConvolutionOptions options{"drunk-5x5_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,2776917076u,4293038666u,2138418553u,12854420u,4281691577u,1067890398u,3632836187u,8931368u,1073320269u,4285192818u,3432808067u,3430862925u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1287797414u,4284705727u});}
{ConvolutionOptions options{"drunk-5x5_+",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{94u,4285614420u,4293038666u,1062460281u,12854312u,4281691496u,1067890324u,4279762779u,8931469u,1073320279u,4285192794u,4292551555u,5008461u,4290622849u,4281269827u,1067403094u,1085579u,4286699870u,1072833190u,4284705689u});}
{ConvolutionOptions options{"drunk-5x5_+",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1711276032u,2775664933u,1726124618u,2136202095u,1724130452u,2771742137u,1923528414u,3625451267u,847792168u,2147062093u,1919605362u,3436913559u,3427560636u,2998777313u,2569993734u,2342471467u,621842512u,3632388469u,1290936986u,3630394303u});}
{ConvolutionOptions options{"drunk-5x5_+",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-5x5_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2860947038u,1954451823u,1956741498u,2056560482u,2324219976u,1953990215u,2323946097u,2408226145u,2493353330u,2055577188u,2054195017u,2409135214u,2844299364u,2493223041u,2406916211u,2222949743u,2308146038u,2491062124u,2676329592u,2760937603u});}
{ConvolutionOptions options{"drunk-5x5_o",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{3380849499u,2057666180u,2326555804u,2323161974u,3648636519u,2055311470u,1787734876u,2056624499u,3113318804u,2577294706u,1871088223u,2678554721u,3212940376u,2140312952u,1333115767u,2309265301u,2842143625u,2053291620u,2056164671u,2325838448u});}
{ConvolutionOptions options{"drunk-5x5_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1954451823u,4293038666u,2056560482u,12854420u,4281691577u,1067890398u,2408226145u,8931368u,1073320269u,4285192818u,2409135214u,2844299364u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2676329592u,4284705727u});}
{ConvolutionOptions options{"drunk-5x5_o",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{94u,4285614447u,4293038714u,1062460258u,12854344u,4281691463u,1067890289u,4279762785u,8931442u,1073320292u,4285192777u,4292551534u,5008484u,4290622849u,4281269875u,1067403119u,1085558u,4286699884u,1072833144u,4284705667u});}
{ConvolutionOptions options{"drunk-5x5_o",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2852126720u,1953581349u,1961005642u,2052316015u,2328110228u,1949658553u,2326181598u,2400714499u,2491959336u,2063176013u,2053823090u,2413503383u,2840358076u,2495460833u,2402221574u,2225030955u,2299564112u,2491537781u,2683445914u,2757979071u});}
{ConvolutionOptions options{"drunk-5x5_o",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-7x7_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{631336038u,1920684890u,1923181670u,1282507891u,1718246002u,1485204603u,1284339864u,1918734415u,1065441653u,1922657381u,1486063465u,1923041152u,1065441653u,1922398105u,2572587086u,849371735u,1065441653u,1921090421u,1285965441u,2573688715u});}
{ConvolutionOptions options{"drunk-7x7_x",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1921230939u,2142198130u,2996663154u,1483968908u,1919605362u,2777260948u,2138689933u,2570777129u,2576510052u,2781438804u,2776479073u,2143965327u,2139909244u,2139981736u,2774262615u,2141493873u,1919605362u,2573067599u,2779404914u,3433323121u});}
{ConvolutionOptions options{"drunk-7x7_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1920684890u,4293038666u,1282507891u,12854420u,4281691577u,1067890398u,1918734415u,8931368u,1073320269u,4285192818u,1923041152u,1065441653u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1285965441u,4284705727u});}
{ConvolutionOptions options{"drunk-7x7_x",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{102u,4285614426u,4293038694u,1062460275u,12854386u,4281691515u,1067890328u,4279762767u,8931445u,1073320293u,4285192809u,4292551552u,5008501u,4290622873u,4281269838u,1067403095u,1085557u,4286699893u,1072833153u,4284705675u});}
{ConvolutionOptions options{"drunk-7x7_x",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{620756992u,1920026917u,1927451210u,1280564079u,1724130452u,1479896505u,1285994206u,1914175235u,1065895976u,1928958285u,1483397746u,1926964119u,1061973180u,1925035489u,2569993734u,849299243u,1058050128u,1921112437u,1290936986u,2573429695u});}
{ConvolutionOptions options{"drunk-7x7_x",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-7x7_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{427397453u,1718700325u,2579605848u,629710205u,1718246002u,1918394505u,2140241794u,3632836187u,1486651011u,1488883853u,2777459836u,3430519117u,3430862925u,2995107194u,3429278296u,850607430u,1920684890u,3633616748u,1705336194u,2573429695u});}
{ConvolutionOptions options{"drunk-7x7_+",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2139261031u,1282973307u,2575224384u,1284664420u,2779477342u,2570895972u,2142923897u,2777260884u,2138746041u,2138689869u,2776535181u,2778440599u,3427593276u,2780657057u,2778302314u,2141161323u,2779266693u,2778302314u,1487437445u,2572927080u});}
{ConvolutionOptions options{"drunk-7x7_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1718700325u,4293038666u,629710205u,12854420u,4281691577u,1067890398u,3632836187u,8931368u,1073320269u,4285192818u,3430519117u,3430862925u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1705336194u,4284705727u});}
{ConvolutionOptions options{"drunk-7x7_+",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{77u,4285614373u,4293038680u,1062460285u,12854386u,4281691529u,1067890306u,4279762779u,8931459u,1073320333u,4285192828u,4292551501u,5008461u,4290622842u,4281269848u,1067403078u,1085530u,4286699884u,1072833154u,4284705727u});}
{ConvolutionOptions options{"drunk-7x7_+",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{419430400u,1718700325u,2581762634u,626252655u,1724130452u,1916104121u,2141632222u,3625451267u,1485326376u,1492750669u,2775243378u,3436913559u,3427560636u,2998777313u,3425631750u,849299243u,1913688144u,3632388469u,1710367386u,2573429695u});}
{ConvolutionOptions options{"drunk-7x7_+",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-7x7_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1333431385u,1804704109u,1804246369u,2073134446u,1871677038u,1871284579u,1938722135u,2139656292u,2340656242u,2408810366u,1939501666u,2274133339u,2475133031u,2676198258u,2408745611u,2073129308u,2475063135u,2810610025u,2542570875u,2608565635u});}
{ConvolutionOptions options{"drunk-7x7_o",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2207684999u,2474682744u,2406919270u,2677047927u,2409526645u,2610011241u,2409595259u,2676655471u,2139786606u,2541860203u,2274663546u,2004788856u,1870634863u,2408283758u,2677766761u,2541726554u,2141556078u,2676853617u,2407765123u,2608642155u});}
{ConvolutionOptions options{"drunk-7x7_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1804704109u,4293038666u,2073134446u,12854420u,4281691577u,1067890398u,2139656292u,8931368u,1073320269u,4285192818u,2274133339u,2475133031u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2542570875u,4284705727u});}
{ConvolutionOptions options{"drunk-7x7_o",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{89u,4285614445u,4293038689u,1062460270u,12854382u,4281691491u,1067890263u,4279762788u,8931442u,1073320318u,4285192802u,4292551515u,5008487u,4290622834u,4281269899u,1067403100u,1085535u,4286699881u,1072833147u,4284705667u});}
{ConvolutionOptions options{"drunk-7x7_o",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1325400064u,1802586405u,1810010698u,2069093231u,1875125396u,1865772473u,1940305630u,2132279043u,2340964392u,2415497549u,1936382578u,2279285655u,2471259324u,2680010209u,2402221574u,2074036011u,2467336272u,2810304885u,2549228186u,2606984127u});}
{ConvolutionOptions options{"drunk-7x7_o",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-9x9_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1065441653u,1920684890u,1923181670u,1282507891u,1065441653u,1919377291u,1284339864u,1918734415u,1065441653u,1286171495u,1920566388u,1923041152u,1065441653u,1922398105u,1919258704u,1284199260u,1065441653u,1921090421u,1285965441u,1920425869u});}
{ConvolutionOptions options{"drunk-9x9_x",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1718700325u,2579265853u,2994442826u,1924311638u,424926063u,1706072220u,3628054135u,1282854549u,2139670568u,1920366997u,4286553941u,2576326014u,3435949244u,2573067599u,4286567048u,1920425869u,2140180560u,1288462221u,3633023130u,1706311541u});}
{ConvolutionOptions options{"drunk-9x9_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1920684890u,4293038666u,1282507891u,12854420u,4281691577u,1067890398u,1918734415u,8931368u,1073320269u,4285192818u,1923041152u,1065441653u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1285965441u,4284705727u});}
{ConvolutionOptions options{"drunk-9x9_x",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{117u,4285614426u,4293038694u,1062460275u,12854389u,4281691531u,1067890328u,4279762767u,8931445u,1073320295u,4285192820u,4292551552u,5008501u,4290622873u,4281269840u,1067403100u,1085557u,4286699893u,1072833153u,4284705677u});}
{ConvolutionOptions options{"drunk-9x9_x",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1056964608u,1920026917u,1927451210u,1280564079u,1069819028u,1916104121u,1285994206u,1914175235u,1065895976u,1291424077u,1919605362u,1926964119u,1061973180u,1925035489u,1915682310u,1285506859u,1058050128u,1921112437u,1290936986u,1919118271u});}
{ConvolutionOptions options{"drunk-9x9_x",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-9x9_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{211765035u,1718700325u,2579605848u,629710205u,862153663u,2139122810u,2140241794u,3632836187u,1486651011u,2141355652u,2775105093u,3430519117u,3430862925u,2995107194u,3427455055u,1485852752u,1920684890u,3633616748u,1705336194u,2775736986u});}
{ConvolutionOptions options{"drunk-9x9_+",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{863062309u,3431815982u,3635319370u,1484179557u,206822255u,2993849002u,2339550890u,2772102201u,1065928744u,1489537128u,4285840483u,3435024525u,1724673212u,3432630186u,4283885639u,1485852752u,1066438736u,2778573694u,2344506778u,2995475866u});}
{ConvolutionOptions options{"drunk-9x9_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1718700325u,4293038666u,629710205u,12854420u,4281691577u,1067890398u,3632836187u,8931368u,1073320269u,4285192818u,3430519117u,3430862925u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1705336194u,4284705727u});}
{ConvolutionOptions options{"drunk-9x9_+",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{43u,4285614373u,4293038680u,1062460285u,12854463u,4281691514u,1067890306u,4279762779u,8931459u,1073320324u,4285192773u,4292551501u,5008461u,4290622842u,4281269839u,1067403088u,1085530u,4286699884u,1072833154u,4284705690u});}
{ConvolutionOptions options{"drunk-9x9_+",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{201326592u,1718700325u,2581762634u,626252655u,868492436u,2134207929u,2141632222u,3625451267u,1485326376u,2147062093u,2775243378u,3436913559u,3427560636u,2998777313u,3425631750u,1486833451u,1913688144u,3632388469u,1710367386u,2774756287u});}
{ConvolutionOptions options{"drunk-9x9_+",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-9x9_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1636995163u,1502121050u,1669303907u,1870237804u,2239925364u,1603632470u,1569552482u,1736800619u,1937734515u,2273346940u,1771272793u,1737258340u,1904572012u,2105571443u,2441118075u,2039575390u,2072802407u,2240181359u,2441180788u,2542240640u});}
{ConvolutionOptions options{"drunk-9x9_o",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2341443431u,2374998632u,2576190321u,2374342502u,2240454262u,2341772160u,2474550389u,2072286582u,2508494693u,2308278131u,2743967593u,2375260788u,2408548222u,2575734893u,2743445105u,2207683957u,2307104619u,2073135997u,2676722546u,2442231672u});}
{ConvolutionOptions options{"drunk-9x9_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1502121050u,4293038666u,1870237804u,12854420u,4281691577u,1067890398u,1736800619u,8931368u,1073320269u,4285192818u,1737258340u,1904572012u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,2441180788u,4284705727u});}
{ConvolutionOptions options{"drunk-9x9_o",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{91u,4285614426u,4293038691u,1062460268u,12854388u,4281691478u,1067890274u,4279762795u,8931443u,1073320316u,4285192793u,4292551524u,5008492u,4290622835u,4281269883u,1067403102u,1085543u,4286699887u,1072833140u,4284705664u});}
{ConvolutionOptions options{"drunk-9x9_o",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1627389952u,1500596517u,1675792970u,1867766639u,2244224148u,1597337017u,1571206878u,1729625859u,1938311208u,2281279821u,1768610418u,1742414743u,1900833980u,2109584865u,2435776006u,2040481579u,2064683088u,2239879541u,2448564890u,2539875263u});}
{ConvolutionOptions options{"drunk-9x9_o",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-17x17_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1065441653u,1920684890u,1923181670u,1282507891u,1065441653u,1919377291u,1284339864u,1918734415u,1065441653u,1286171495u,1920566388u,1923041152u,1065441653u,1922398105u,1919258704u,1284199260u,1065441653u,1921090421u,1285965441u,1920425869u});}
{ConvolutionOptions options{"drunk-17x17_x",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2140845660u,1281206870u,870486602u,1919383869u,3433655607u,2569129535u,635280765u,2994575465u,2137887179u,2340277097u,2577514940u,4287214970u,3427593276u,4289169815u,2577493094u,2343858805u,2141865644u,2994827893u,632961616u,2574759053u});}
{ConvolutionOptions options{"drunk-17x17_x",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1920684890u,4293038666u,1282507891u,12854420u,4281691577u,1067890398u,1918734415u,8931368u,1073320269u,4285192818u,1923041152u,1065441653u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1285965441u,4284705727u});}
{ConvolutionOptions options{"drunk-17x17_x",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{117u,4285614426u,4293038694u,1062460275u,12854389u,4281691531u,1067890328u,4279762767u,8931445u,1073320295u,4285192820u,4292551552u,5008501u,4290622873u,4281269840u,1067403100u,1085557u,4286699893u,1072833153u,4284705677u});}
{ConvolutionOptions options{"drunk-17x17_x",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1056964608u,1920026917u,1927451210u,1280564079u,1069819028u,1916104121u,1285994206u,1914175235u,1065895976u,1291424077u,1919605362u,1926964119u,1061973180u,1925035489u,1915682310u,1285506859u,1058050128u,1921112437u,1290936986u,1919118271u});}
{ConvolutionOptions options{"drunk-17x17_x",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-17x17_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{211765035u,1718700325u,2579605848u,629710205u,862153663u,2139122810u,2140241794u,3632836187u,1486651011u,2141355652u,2775105093u,3430519117u,3430862925u,2995107194u,3427455055u,1485852752u,1920684890u,3633616748u,1705336194u,2775736986u});}
{ConvolutionOptions options{"drunk-17x17_+",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1067103836u,2775149879u,2581762634u,1482339932u,1722379575u,3425538443u,851094713u,3628780342u,1064145355u,1706798683u,3430862989u,4289883272u,1716317244u,4289896380u,3428435754u,1705598032u,1068123820u,3632375157u,853355390u,3429533356u});}
{ConvolutionOptions options{"drunk-17x17_+",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1718700325u,4293038666u,629710205u,12854420u,4281691577u,1067890398u,3632836187u,8931368u,1073320269u,4285192818u,3430519117u,3430862925u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1705336194u,4284705727u});}
{ConvolutionOptions options{"drunk-17x17_+",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{43u,4285614373u,4293038680u,1062460285u,12854463u,4281691514u,1067890306u,4279762779u,8931459u,1073320324u,4285192773u,4292551501u,5008461u,4290622842u,4281269839u,1067403088u,1085530u,4286699884u,1072833154u,4284705690u});}
{ConvolutionOptions options{"drunk-17x17_+",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{201326592u,1718700325u,2581762634u,626252655u,868492436u,2134207929u,2141632222u,3625451267u,1485326376u,2147062093u,2775243378u,3436913559u,3427560636u,2998777313u,3425631750u,1486833451u,1913688144u,3632388469u,1710367386u,2774756287u});}
{ConvolutionOptions options{"drunk-17x17_+",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"drunk-17x17_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1351183970u,1418096743u,1485074797u,1552053107u,1618965625u,1468558691u,1535536744u,1602514798u,1669427571u,1736405625u,1585998692u,1652976745u,1719889518u,1786867571u,1853845625u,1686596197u,1753574250u,1820552303u,1887530356u,1954508664u});}
{ConvolutionOptions options{"drunk-17x17_o",{true,true,true,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{2492442220u,2341441136u,1872004218u,2542114162u,2693110880u,2340919654u,1922017137u,2508561012u,2425194107u,2609615737u,2257887610u,2810877546u,2576192878u,2676398453u,2257359986u,2542964346u,2223807107u,2507970155u,2123269219u,2409271155u});}
{ConvolutionOptions options{"drunk-17x17_o",{true,true,true,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,1418096743u,4293038666u,1552053107u,12854420u,4281691577u,1067890398u,1602514798u,8931368u,1073320269u,4285192818u,1652976745u,1719889518u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,1887530356u,4284705727u});}
{ConvolutionOptions options{"drunk-17x17_o",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{98u,4285614439u,4293038701u,1062460275u,12854393u,4281691491u,1067890280u,4279762798u,8931443u,1073320313u,4285192804u,4292551529u,5008494u,4290622835u,4281269881u,1067403109u,1085546u,4286699887u,1072833140u,4284705656u});}
{ConvolutionOptions options{"drunk-17x17_o",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{1342177280u,1416710437u,1491243594u,1548999535u,1623467156u,1463119289u,1537652446u,1595408131u,1669875752u,1744408909u,1584061042u,1658528663u,1716284604u,1790817761u,1848573446u,1688160043u,1745915984u,1820449141u,1894916762u,1952672703u});}
{ConvolutionOptions options{"drunk-17x17_o",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"outline-cross",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{4278190080u,4285614373u,4293038666u,4283685743u,4291044500u,4281691577u,4289115870u,4279762691u,4287121448u,4294545741u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,4288628523u,4279275600u,4286699893u,4294058650u,4284705727u});}
{ConvolutionOptions options{"outline-cross",{false,false,false,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{4278190080u,4285614373u,4293038666u,4283685743u,4291044500u,4281691577u,4289115870u,4279762691u,4287121448u,4294545741u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,4288628523u,4279275600u,4286699893u,4294058650u,4284705727u});}
{ConvolutionOptions options{"outline-cross",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4293038666u,4283685743u,12854420u,4281691577u,1067890398u,4279762691u,8931368u,1073320269u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,4294058650u,4284705727u});}
{ConvolutionOptions options{"outline-cross",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614336u,4293038847u,1062460160u,12854272u,4281691392u,1067890431u,4279762688u,8931328u,1073320192u,4285192959u,4292551424u,5008384u,4290622720u,4281270015u,1067403008u,1085440u,4286699776u,1072833279u,4284705791u});}
{ConvolutionOptions options{"outline-cross",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{4278190080u,4285614373u,4293038666u,4283685743u,4291044500u,4281691577u,4289115870u,4279762691u,4287121448u,4294545741u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,4288628523u,4279275600u,4286699893u,4294058650u,4284705727u});}
{ConvolutionOptions options{"outline-cross",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
{ConvolutionOptions options{"outline-square",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{4278190080u,4285614373u,4293038666u,4283685743u,4291044500u,4281691577u,4289115870u,4279762691u,4287121448u,4294545741u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,4288628523u,4279275600u,4286699893u,4294058650u,4284705727u});}
{ConvolutionOptions options{"outline-square",{false,false,false,true},true};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{4278190080u,4285614373u,4293038666u,4283685743u,4291044500u,4281691577u,4289115870u,4279762691u,4287121448u,4294545741u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,4288628523u,4279275600u,4286699893u,4294058650u,4284705727u});}
{ConvolutionOptions options{"outline-square",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,SelectionMask{1,0,3,4,{1,0,1,0,1,0,1,1,0,0,0,1}});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614373u,4293038666u,4283685743u,12854420u,4281691577u,1067890398u,4279762691u,8931368u,1073320269u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,1067403051u,1085520u,4286699893u,4294058650u,4284705727u});}
{ConvolutionOptions options{"outline-square",{true,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{0u,4285614336u,4293038592u,1062460160u,12854272u,4281691392u,1067890176u,4279762688u,8931328u,1073320192u,4285192704u,4292551424u,5008384u,4290622720u,4281269760u,1067403008u,1085440u,4286699776u,1072833024u,4284705791u});}
{ConvolutionOptions options{"outline-square",{false,false,false,true},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==true);require(*result==std::vector<Pixel>{4278190080u,4285614373u,4293038666u,4283685743u,4291044500u,4281691577u,4289115870u,4279762691u,4287121448u,4294545741u,4285192818u,4292551575u,4283198652u,4290622945u,4281269766u,4288628523u,4279275600u,4286699893u,4294058650u,4284705727u});}
{ConvolutionOptions options{"outline-square",{false,false,false,false},false};auto result=convolvePixels(source,5,4,options,{});require(bool(result)==false);}
require(!convolvePixels(source,5,4,{}, {},[]{return true;}));
{std::vector<Pixel> row{0xff140a1e,0xff140a3c,0xff140a78};ConvolutionOptions blur{"blur-5x1",{true,true,true,true},false};require(((*convolvePixels(row,3,1,blur))[0]&255)==54);blur.tiled=true;require(((*convolvePixels(row,3,1,blur))[0]&255)==78);blur.tiled=false;auto masked=convolvePixels(row,3,1,blur,SelectionMask{1,0,1,1,{}});require(((*masked)[1]&255)==72&&(*masked)[0]==row[0]);std::vector<Pixel> sparse(25);sparse[12]=0xff1450f0;auto out=convolvePixels(sparse,5,5,{});require((*out)[12]==0x3f1450f0&&((*out)[6]>>24)==15);auto outline=convolvePixels(sparse,5,5,{"outline-cross",{false,false,false,true},false});require((*outline)[11]==0xff000000&&(*outline)[6]==0);}

Document d=Document::fromImage(5,4,source,U"convolution");auto history=d.historySize();require(d.beginColorAdjustment());auto task=d.captureConvolutionTask();require(bool(task));auto out=convolvePixels(task->targets[0].second,5,4,{"negative",{true,true,true,false},false});require(d.publishConvolutionTask(*task,{*out}));require(d.pixels()==source && d.displayPixels()!=source);require(d.commitColorAdjustment());require(d.historySize()==history+1);auto applied=d.pixels();require(d.beginColorAdjustment());auto next=d.captureConvolutionTask();require(d.publishConvolutionTask(*next,{source}));d.cancelColorAdjustment();require(d.pixels()==applied);d.undo();require(d.pixels()==source);require(d.beginColorAdjustment());auto stale=d.captureConvolutionTask();d.cancelColorAdjustment();require(!d.publishConvolutionTask(*stale,{source}));
}
inline void verifyAntiAliasOracle(){
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-automatic-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-automatic-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-automatic-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-automatic-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,1589665824u,0u,0u,0u,0u,0u,1589665824u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-automatic-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-automatic-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-palette-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-palette-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-palette-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-palette-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-palette-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-palette-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-canvas-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-canvas-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-canvas-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-canvas-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-canvas-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-canvas-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-custom-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-custom-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-custom-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-custom-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,2353449070u,0u,0u,0u,0u,0u,2353449070u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-custom-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-custom-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-empty-palette-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-empty-palette-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-empty-palette-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-empty-palette-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-empty-palette-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle diagonal-empty-palette-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,1589665824u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-automatic-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,1589665824u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-automatic-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-automatic-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,1589665824u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-automatic-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,1589665824u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-automatic-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-automatic-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-palette-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-palette-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-palette-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-palette-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-palette-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-palette-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-canvas-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-canvas-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-canvas-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-canvas-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-canvas-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-canvas-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,2353449070u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-custom-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,2353449070u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-custom-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-custom-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,2353449070u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-custom-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,2353449070u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-custom-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-custom-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-empty-palette-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-empty-palette-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-empty-palette-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-empty-palette-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,4290797600u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-empty-palette-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4290797600u,0u,0u,0u,0u,0u,0u,4290797600u,4280821980u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle dominant-empty-palette-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-automatic-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-automatic-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-automatic-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4280855000u,4282436863u,4282436863u,0u,0u,4282436863u,4280855000u,4278218133u,4280855000u,4282436863u,0u,0u,4282436863u,4282436863u,4280855000u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-automatic-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4280855000u,4282436863u,4282436863u,0u,0u,4282436863u,4280855000u,4278218133u,4280855000u,4282436863u,0u,0u,4282436863u,4282436863u,4280855000u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-automatic-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-automatic-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-palette-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-palette-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-palette-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4289309097u,4282436863u,4282436863u,0u,0u,4282436863u,4289309097u,4278218133u,4289309097u,4282436863u,0u,0u,4282436863u,4282436863u,4289309097u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-palette-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4289309097u,4282436863u,4282436863u,0u,0u,4282436863u,4289309097u,4278218133u,4289309097u,4282436863u,0u,0u,4282436863u,4282436863u,4289309097u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-palette-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-palette-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-canvas-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-canvas-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-canvas-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4278218133u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-canvas-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4278218133u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-canvas-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-canvas-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-custom-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-custom-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-custom-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282632879u,4282436863u,4282436863u,0u,0u,4282436863u,4282632879u,4278218133u,4282632879u,4282436863u,0u,0u,4282436863u,4282436863u,4282632879u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-custom-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282632879u,4282436863u,4282436863u,0u,0u,4282436863u,4282632879u,4278218133u,4282632879u,4282436863u,0u,0u,4282436863u,4282436863u,4282632879u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-custom-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-custom-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-empty-palette-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-empty-palette-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-empty-palette-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4278218133u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-empty-palette-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4278218133u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-empty-palette-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4278218133u,4282436863u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4278218133u,4282436863u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4278218133u,4282436863u,0u,0u,4282436863u,4282436863u,4282436863u,4282436863u,4282436863u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle interior-empty-palette-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,400974868u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-automatic-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,400974868u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-automatic-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-automatic-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,400974868u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-automatic-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,400974868u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-automatic-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-automatic-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,4290797600u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-palette-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,4290797600u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-palette-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-palette-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,4290797600u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-palette-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,4290797600u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-palette-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-palette-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,1072063508u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-canvas-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,1072063508u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-canvas-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-canvas-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,1072063508u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-canvas-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,1072063508u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-canvas-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-canvas-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,2353449070u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-custom-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,2353449070u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-custom-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-custom-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,2353449070u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-custom-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,2353449070u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-custom-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{2353449070u,37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-custom-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,1072063508u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-empty-palette-false-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,1072063508u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-empty-palette-false-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,false,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-empty-palette-false-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",{},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,1072063508u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-empty-palette-true-full");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{1,1,5,5,{}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,1072063508u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-empty-palette-true-tight");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,1});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
Document::AntiAliasTask job{{7,7,0,0,"l0","f",SelectionMask{0,0,7,7,{0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},{{"c0",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{}};AntiAliasOptions options{{},37,true,2};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle partial-empty-palette-true-mask");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,3700879380u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,809271908u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle normal-stack-automatic-false");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",false,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,3700879380u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,809271908u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle hidden-top-automatic-false");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,9891860u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,809271908u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle transparent-upper-automatic-false");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,3700879380u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,809271908u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle normal-stack-automatic-true");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",false,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,3700879380u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,809271908u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle hidden-top-automatic-true");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,9891860u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,0};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,809271908u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle transparent-upper-automatic-true");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,3700879380u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,3357497281u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle normal-stack-canvas-false");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",false,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,3700879380u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,3357497281u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle hidden-top-canvas-false");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,9891860u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,false,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,3357497281u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle transparent-upper-canvas-false");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,3700879380u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,3357497281u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle normal-stack-canvas-true");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",false,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,3700879380u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,3357497281u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle hidden-top-canvas-true");}
{timeline::State state;state.frames.push_back({"f",100,false});
state.layers.push_back({"l0",U"layer",true,false,0.5});state.cels.push_back({"c0","l0","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,9891860u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l1",U"layer",true,false,0.75});state.cels.push_back({"c1","l1","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}});
state.layers.push_back({"l2",U"layer",true,false,1});state.cels.push_back({"c2","l2","f",{},{},{},0,timeline::Surface{7,7,0,0,{},{},{2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u,2185003620u}}});
Document::AntiAliasTask job{{7,7,0,0,"l1","f",{},{{"c1",{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,0u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u}}}},timeline::Timeline(state),{"f"},{4278190080u,4294967295u,4289309097u,4290797600u}};AntiAliasOptions options{{},37,true,1};auto result=Document::runAntiAliasTask(job,options,[]{return false;});if(!result || (*result)[0]!=std::vector<Pixel>{0u,0u,0u,0u,0u,0u,0u,0u,1072063508u,1342837810u,0u,0u,0u,0u,0u,3357497281u,3188999910u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u,0u})throw std::runtime_error("AA oracle transparent-upper-canvas-true");}
}
inline void verifyAntiAliasTargets(){
 Document d=Document::fromImage(5,5,std::vector<Pixel>(25),U"AA");for(int i=1;i<4;++i){d.beginStroke({i,i},0xffc06020);d.commitStroke();}auto base=d.pixels();auto layer=d.layer().id,first=d.frame().id;d.addLinkedFrame();auto linked=d.frame().id,alias=d.cel().id;d.addFrame();auto second=d.frame().id;for(int i=1;i<4;++i){d.beginStroke({i,i},0xff3060c0);d.commitStroke();}auto other=d.pixels();d.selectTimelineCel(d.timeline().findCel(layer,first)->id);d.selectTimelineCel(alias,1);d.selectTimelineCel(d.timeline().findCel(layer,second)->id,1);auto history=d.historySize();require(d.beginAntiAliasPreview());auto task=d.captureAntiAliasTask();require(task&&task->captured.targets.size()==2);auto result=Document::runAntiAliasTask(*task,{},[]{return false;});require(result&&d.publishConvolutionTask(task->captured,*result));require(d.pixels()==other);d.cancelColorAdjustment();require(d.historySize()==history&&d.pixels()==other);require(d.beginAntiAliasPreview());task=d.captureAntiAliasTask();result=Document::runAntiAliasTask(*task,{},[]{return false;});require(result&&d.publishConvolutionTask(task->captured,*result)&&d.commitColorAdjustment());require(d.historySize()==history+1&&d.pixels()!=other);require(d.timeline().resolveSurface(alias).surface->pixels!=base);d.undo();require(d.pixels()==other&&d.timeline().resolveSurface(alias).surface->pixels==base);d.redo();require(d.pixels()!=other);d.cancelColorAdjustment();require(!Document::runAntiAliasTask(*task,{},[]{return true;}));
 d.clearTimelineSelection();d.selectFrame(first);d.addLayer();auto upper=d.layer().id;d.setLayerLocked(true);d.selectTimelineLayer(layer);d.selectTimelineLayer(upper,1);require(!d.beginAntiAliasPreview()&&!d.colorAdjustmentActive());d.clearTimelineSelection();d.selectFrameHeader(first);require(d.beginAntiAliasPreview());task=d.captureAntiAliasTask();require(task&&task->captured.targets.size()==1);d.cancelColorAdjustment();
 d.selectLayer(layer);d.clearTimelineSelection();d.commitSelection({},SelectionMask{0,0,2,2,{1,0,0,1}});require(d.beginAntiAliasPreview());task=d.captureAntiAliasTask();result=Document::runAntiAliasTask(*task,{},[]{return false;});require(result&&d.publishConvolutionTask(task->captured,*result));d.commitSelection(d.selection(),SelectionMask{0,0,1,1,{}});require(!d.publishConvolutionTask(task->captured,*result));d.cancelColorAdjustment();
}
inline void verifyGradientMapOracle(){
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5166248254924816933ull)throw std::runtime_error("GM oracle gradientMap.grayscale none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1064465010u);
require(sampler(1057970918u,-1,3)==1064465010u);
require(sampler(1057970918u,2,5)==1064465010u);
require(sampler(4278896710u,-9,-7)==4288651167u);
require(sampler(4278896710u,-1,3)==4288651167u);
require(sampler(4278896710u,2,5)==4288651167u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=629789991736132901ull)throw std::runtime_error("GM oracle gradientMap.grayscale none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1066241421u);
require(sampler(1057970918u,-1,3)==1066241421u);
require(sampler(1057970918u,2,5)==1066241421u);
require(sampler(4278896710u,-9,-7)==4284506208u);
require(sampler(4278896710u,-1,3)==4284506208u);
require(sampler(4278896710u,2,5)==4284506208u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15688678923172079269ull)throw std::runtime_error("GM oracle gradientMap.grayscale none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,2,5)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,2,5)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12439528089614247589ull)throw std::runtime_error("GM oracle gradientMap.grayscale none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,2,5)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,2,5)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18171781887483220261ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13817092899212742949ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18171781887483220261ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13817092899212742949ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13689317812209234725ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,5,11)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,5,11)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6909643539244909349ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,5,11)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,5,11)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13689317812209234725ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,5,11)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,5,11)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6909643539244909349ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,5,11)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,5,11)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3386920343859968293ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,9,19)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,9,19)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2774769441757777189ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,9,19)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,9,19)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3386920343859968293ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,9,19)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,9,19)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2774769441757777189ull)throw std::runtime_error("GM oracle gradientMap.grayscale bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,9,19)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,9,19)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11181174875560522021ull)throw std::runtime_error("GM oracle gradientMap.grayscale checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1249537048904970533ull)throw std::runtime_error("GM oracle gradientMap.grayscale checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11181174875560522021ull)throw std::runtime_error("GM oracle gradientMap.grayscale checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1249537048904970533ull)throw std::runtime_error("GM oracle gradientMap.grayscale checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6399915066274224461ull)throw std::runtime_error("GM oracle gradientMap.grayscale diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4922608280495602941ull)throw std::runtime_error("GM oracle gradientMap.grayscale diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6399915066274224461ull)throw std::runtime_error("GM oracle gradientMap.grayscale diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4922608280495602941ull)throw std::runtime_error("GM oracle gradientMap.grayscale diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10323693717238716749ull)throw std::runtime_error("GM oracle gradientMap.grayscale diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15822410823069220093ull)throw std::runtime_error("GM oracle gradientMap.grayscale diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10323693717238716749ull)throw std::runtime_error("GM oracle gradientMap.grayscale diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15822410823069220093ull)throw std::runtime_error("GM oracle gradientMap.grayscale diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1335369868571288517ull)throw std::runtime_error("GM oracle gradientMap.grayscale horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13472435510477376133ull)throw std::runtime_error("GM oracle gradientMap.grayscale horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1335369868571288517ull)throw std::runtime_error("GM oracle gradientMap.grayscale horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13472435510477376133ull)throw std::runtime_error("GM oracle gradientMap.grayscale horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17197637606210282593ull)throw std::runtime_error("GM oracle gradientMap.grayscale vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18269192528540281321ull)throw std::runtime_error("GM oracle gradientMap.grayscale vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17197637606210282593ull)throw std::runtime_error("GM oracle gradientMap.grayscale vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18269192528540281321ull)throw std::runtime_error("GM oracle gradientMap.grayscale vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2255733362820365820ull)throw std::runtime_error("GM oracle gradientMap.silver none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1072159700u);
require(sampler(1057970918u,-1,3)==1072159700u);
require(sampler(1057970918u,2,5)==1072159700u);
require(sampler(4278896710u,-9,-7)==4292134588u);
require(sampler(4278896710u,-1,3)==4292134588u);
require(sampler(4278896710u,2,5)==4292134588u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17281018540101671454ull)throw std::runtime_error("GM oracle gradientMap.silver none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1072554458u);
require(sampler(1057970918u,-1,3)==1072554458u);
require(sampler(1057970918u,2,5)==1072554458u);
require(sampler(4278896710u,-9,-7)==4291279278u);
require(sampler(4278896710u,-1,3)==4291279278u);
require(sampler(4278896710u,2,5)==4291279278u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7238011413650854021ull)throw std::runtime_error("GM oracle gradientMap.silver none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,2,5)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,2,5)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10829467389667417733ull)throw std::runtime_error("GM oracle gradientMap.silver none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,2,5)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,2,5)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=678518286775391141ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,3,7)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,3,7)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4154563766822650789ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,3,7)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,3,7)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=678518286775391141ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,3,7)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,3,7)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4154563766822650789ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,3,7)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,3,7)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7148657930703723877ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,5,11)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,5,11)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3384626359637176037ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,5,11)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,5,11)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7148657930703723877ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,5,11)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,5,11)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3384626359637176037ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,5,11)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,5,11)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11588299081392001061ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,9,19)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,9,19)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4934032445396408485ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,9,19)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,9,19)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11588299081392001061ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,9,19)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,9,19)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4934032445396408485ull)throw std::runtime_error("GM oracle gradientMap.silver bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,9,19)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,9,19)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12699171899811811749ull)throw std::runtime_error("GM oracle gradientMap.silver checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,3,7)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,3,7)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17850221522848971173ull)throw std::runtime_error("GM oracle gradientMap.silver checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,3,7)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,3,7)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12699171899811811749ull)throw std::runtime_error("GM oracle gradientMap.silver checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,3,7)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,3,7)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17850221522848971173ull)throw std::runtime_error("GM oracle gradientMap.silver checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,3,7)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,3,7)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13983001300353386673ull)throw std::runtime_error("GM oracle gradientMap.silver diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,7,15)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8897322348714243097ull)throw std::runtime_error("GM oracle gradientMap.silver diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,7,15)==4287527787u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13983001300353386673ull)throw std::runtime_error("GM oracle gradientMap.silver diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4289238407u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,7,15)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8897322348714243097ull)throw std::runtime_error("GM oracle gradientMap.silver diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,7,15)==4287527787u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9716671829300187553ull)throw std::runtime_error("GM oracle gradientMap.silver diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,7,15)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7514347189421043721ull)throw std::runtime_error("GM oracle gradientMap.silver diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4287527787u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,7,15)==4287527787u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9716671829300187553ull)throw std::runtime_error("GM oracle gradientMap.silver diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4289238407u);
require(sampler(4278896710u,7,15)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7514347189421043721ull)throw std::runtime_error("GM oracle gradientMap.silver diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4287527787u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,7,15)==4287527787u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9562494382869194189ull)throw std::runtime_error("GM oracle gradientMap.silver horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1066302315u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,7,15)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1588621929199027909ull)throw std::runtime_error("GM oracle gradientMap.silver horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4287527787u);
require(sampler(4278896710u,-1,3)==4287527787u);
require(sampler(4278896710u,7,15)==4287527787u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9562494382869194189ull)throw std::runtime_error("GM oracle gradientMap.silver horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1066302315u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,7,15)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1588621929199027909ull)throw std::runtime_error("GM oracle gradientMap.silver horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4287527787u);
require(sampler(4278896710u,-1,3)==4287527787u);
require(sampler(4278896710u,7,15)==4287527787u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6707072770982293681ull)throw std::runtime_error("GM oracle gradientMap.silver vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1066302315u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,7,15)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4902701327884160169ull)throw std::runtime_error("GM oracle gradientMap.silver vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4287527787u);
require(sampler(4278896710u,-1,3)==4287527787u);
require(sampler(4278896710u,7,15)==4294964720u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6707072770982293681ull)throw std::runtime_error("GM oracle gradientMap.silver vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1066302315u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4294964720u);
require(sampler(4278896710u,-1,3)==4294964720u);
require(sampler(4278896710u,7,15)==4289238407u);
}
{GradientMapSettings settings{{{0,4280687380u},{0.25,4287527787u},{0.5,4294964720u},{0.75,4289238407u},{1,4294967295u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4902701327884160169ull)throw std::runtime_error("GM oracle gradientMap.silver vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073739248u);
require(sampler(1057970918u,-1,3)==1073739248u);
require(sampler(1057970918u,7,15)==1073739248u);
require(sampler(4278896710u,-9,-7)==4287527787u);
require(sampler(4278896710u,-1,3)==4287527787u);
require(sampler(4278896710u,7,15)==4294964720u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4244508502157028347ull)throw std::runtime_error("GM oracle gradientMap.gold none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1062451425u);
require(sampler(1057970918u,-1,3)==1062451425u);
require(sampler(1057970918u,2,5)==1062451425u);
require(sampler(4278896710u,-9,-7)==4282359502u);
require(sampler(4278896710u,-1,3)==4282359502u);
require(sampler(4278896710u,2,5)==4282359502u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6308067796443642299ull)throw std::runtime_error("GM oracle gradientMap.gold none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1062451941u);
require(sampler(1057970918u,-1,3)==1062451941u);
require(sampler(1057970918u,2,5)==1062451941u);
require(sampler(4278896710u,-9,-7)==4282292678u);
require(sampler(4278896710u,-1,3)==4282292678u);
require(sampler(4278896710u,2,5)==4282292678u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6573967747146991941ull)throw std::runtime_error("GM oracle gradientMap.gold none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,2,5)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,2,5)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14314851422868673349ull)throw std::runtime_error("GM oracle gradientMap.gold none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,2,5)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,2,5)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13555115810421784613ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,3,7)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,3,7)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15799793169534163237ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,3,7)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,3,7)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13555115810421784613ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,3,7)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,3,7)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15799793169534163237ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,3,7)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,3,7)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8783014350109480357ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,5,11)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,5,11)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=144176298311718565ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,5,11)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,5,11)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8783014350109480357ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,5,11)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,5,11)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=144176298311718565ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,5,11)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,5,11)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13017421245528253253ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,9,19)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,9,19)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8472684398983961605ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,9,19)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,9,19)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13017421245528253253ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,9,19)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,9,19)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8472684398983961605ull)throw std::runtime_error("GM oracle gradientMap.gold bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,9,19)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,9,19)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17962095393532547493ull)throw std::runtime_error("GM oracle gradientMap.gold checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,3,7)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,3,7)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9710392160911389093ull)throw std::runtime_error("GM oracle gradientMap.gold checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,3,7)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,3,7)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17962095393532547493ull)throw std::runtime_error("GM oracle gradientMap.gold checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,3,7)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,3,7)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9710392160911389093ull)throw std::runtime_error("GM oracle gradientMap.gold checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,3,7)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,3,7)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16241600037668132749ull)throw std::runtime_error("GM oracle gradientMap.gold diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,7,15)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5995897159199235293ull)throw std::runtime_error("GM oracle gradientMap.gold diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,7,15)==4279853460u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16241600037668132749ull)throw std::runtime_error("GM oracle gradientMap.gold diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4280052901u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,7,15)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5995897159199235293ull)throw std::runtime_error("GM oracle gradientMap.gold diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,7,15)==4279853460u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6280280679047334205ull)throw std::runtime_error("GM oracle gradientMap.gold diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,7,15)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7199353197691640717ull)throw std::runtime_error("GM oracle gradientMap.gold diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4279853460u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,7,15)==4279853460u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6280280679047334205ull)throw std::runtime_error("GM oracle gradientMap.gold diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4280052901u);
require(sampler(4278896710u,7,15)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7199353197691640717ull)throw std::runtime_error("GM oracle gradientMap.gold diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4279853460u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,7,15)==4279853460u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6388713177411199317ull)throw std::runtime_error("GM oracle gradientMap.gold horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058627988u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,7,15)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3712734193941629733ull)throw std::runtime_error("GM oracle gradientMap.gold horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4279853460u);
require(sampler(4278896710u,-1,3)==4279853460u);
require(sampler(4278896710u,7,15)==4279853460u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6388713177411199317ull)throw std::runtime_error("GM oracle gradientMap.gold horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058627988u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,7,15)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3712734193941629733ull)throw std::runtime_error("GM oracle gradientMap.gold horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4279853460u);
require(sampler(4278896710u,-1,3)==4279853460u);
require(sampler(4278896710u,7,15)==4279853460u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4800501580237706321ull)throw std::runtime_error("GM oracle gradientMap.gold vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1058627988u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,7,15)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15633788347003732841ull)throw std::runtime_error("GM oracle gradientMap.gold vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4279853460u);
require(sampler(4278896710u,-1,3)==4279853460u);
require(sampler(4278896710u,7,15)==4284665846u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4800501580237706321ull)throw std::runtime_error("GM oracle gradientMap.gold vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1058627988u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4284665846u);
require(sampler(4278896710u,-1,3)==4284665846u);
require(sampler(4278896710u,7,15)==4280052901u);
}
{GradientMapSettings settings{{{0,4278655536u},{0.25,4279853460u},{0.5,4284665846u},{0.75,4280052901u},{1,4290836479u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15633788347003732841ull)throw std::runtime_error("GM oracle gradientMap.gold vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063440374u);
require(sampler(1057970918u,-1,3)==1063440374u);
require(sampler(1057970918u,7,15)==1063440374u);
require(sampler(4278896710u,-9,-7)==4279853460u);
require(sampler(4278896710u,-1,3)==4279853460u);
require(sampler(4278896710u,7,15)==4284665846u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7249399339373717472ull)throw std::runtime_error("GM oracle gradientMap.copper none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1062699730u);
require(sampler(1057970918u,-1,3)==1062699730u);
require(sampler(1057970918u,2,5)==1062699730u);
require(sampler(4278896710u,-9,-7)==4283200709u);
require(sampler(4278896710u,-1,3)==4283200709u);
require(sampler(4278896710u,2,5)==4283200709u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10614251929729778470ull)throw std::runtime_error("GM oracle gradientMap.copper none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1062831832u);
require(sampler(1057970918u,-1,3)==1062831832u);
require(sampler(1057970918u,2,5)==1062831832u);
require(sampler(4278896710u,-9,-7)==4282870712u);
require(sampler(4278896710u,-1,3)==4282870712u);
require(sampler(4278896710u,2,5)==4282870712u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6504524705299768357ull)throw std::runtime_error("GM oracle gradientMap.copper none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,2,5)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,2,5)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7223818081263620261ull)throw std::runtime_error("GM oracle gradientMap.copper none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,2,5)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,2,5)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12487349215934515173ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,3,7)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,3,7)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14631103382731659749ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,3,7)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,3,7)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12487349215934515173ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,3,7)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,3,7)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14631103382731659749ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,3,7)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,3,7)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4257746708363722853ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,5,11)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,5,11)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17617814299251879653ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,5,11)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,5,11)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4257746708363722853ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,5,11)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,5,11)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17617814299251879653ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,5,11)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,5,11)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10716375073665154213ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,9,19)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,9,19)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11639978918881004517ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,9,19)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,9,19)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10716375073665154213ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,9,19)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,9,19)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11639978918881004517ull)throw std::runtime_error("GM oracle gradientMap.copper bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,9,19)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,9,19)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13411135679481955621ull)throw std::runtime_error("GM oracle gradientMap.copper checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,3,7)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,3,7)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4081542309286016293ull)throw std::runtime_error("GM oracle gradientMap.copper checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,3,7)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,3,7)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13411135679481955621ull)throw std::runtime_error("GM oracle gradientMap.copper checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,3,7)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,3,7)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4081542309286016293ull)throw std::runtime_error("GM oracle gradientMap.copper checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,3,7)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,3,7)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3484308860825835445ull)throw std::runtime_error("GM oracle gradientMap.copper diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,7,15)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6648491636802916269ull)throw std::runtime_error("GM oracle gradientMap.copper diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,7,15)==4281025416u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3484308860825835445ull)throw std::runtime_error("GM oracle gradientMap.copper diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281685155u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,7,15)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6648491636802916269ull)throw std::runtime_error("GM oracle gradientMap.copper diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,7,15)==4281025416u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7206386744515825301ull)throw std::runtime_error("GM oracle gradientMap.copper diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,7,15)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2032203082888907053ull)throw std::runtime_error("GM oracle gradientMap.copper diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281025416u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,7,15)==4281025416u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7206386744515825301ull)throw std::runtime_error("GM oracle gradientMap.copper diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4281685155u);
require(sampler(4278896710u,7,15)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2032203082888907053ull)throw std::runtime_error("GM oracle gradientMap.copper diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281025416u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,7,15)==4281025416u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16733631808217972417ull)throw std::runtime_error("GM oracle gradientMap.copper horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1059799944u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,7,15)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4532301916745423249ull)throw std::runtime_error("GM oracle gradientMap.copper horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281025416u);
require(sampler(4278896710u,-1,3)==4281025416u);
require(sampler(4278896710u,7,15)==4281025416u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16733631808217972417ull)throw std::runtime_error("GM oracle gradientMap.copper horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1059799944u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,7,15)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4532301916745423249ull)throw std::runtime_error("GM oracle gradientMap.copper horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281025416u);
require(sampler(4278896710u,-1,3)==4281025416u);
require(sampler(4278896710u,7,15)==4281025416u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15133946238094674857ull)throw std::runtime_error("GM oracle gradientMap.copper vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1059799944u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,7,15)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14032871538137863505ull)throw std::runtime_error("GM oracle gradientMap.copper vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281025416u);
require(sampler(4278896710u,-1,3)==4281025416u);
require(sampler(4278896710u,7,15)==4284716006u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15133946238094674857ull)throw std::runtime_error("GM oracle gradientMap.copper vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1059799944u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4284716006u);
require(sampler(4278896710u,-1,3)==4284716006u);
require(sampler(4278896710u,7,15)==4281685155u);
}
{GradientMapSettings settings{{{0,4279243817u},{0.25,4281025416u},{0.5,4284716006u},{0.75,4281685155u},{1,4289847807u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14032871538137863505ull)throw std::runtime_error("GM oracle gradientMap.copper vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063490534u);
require(sampler(1057970918u,-1,3)==1063490534u);
require(sampler(1057970918u,7,15)==1063490534u);
require(sampler(4278896710u,-9,-7)==4281025416u);
require(sampler(4278896710u,-1,3)==4281025416u);
require(sampler(4278896710u,7,15)==4284716006u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8239118673117047596ull)throw std::runtime_error("GM oracle gradientMap.ocean none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1066432030u);
require(sampler(1057970918u,-1,3)==1066432030u);
require(sampler(1057970918u,2,5)==1066432030u);
require(sampler(4278896710u,-9,-7)==4289963053u);
require(sampler(4278896710u,-1,3)==4289963053u);
require(sampler(4278896710u,2,5)==4289963053u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4856674623629547594ull)throw std::runtime_error("GM oracle gradientMap.ocean none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1067815207u);
require(sampler(1057970918u,-1,3)==1067815207u);
require(sampler(1057970918u,2,5)==1067815207u);
require(sampler(4278896710u,-9,-7)==4286735128u);
require(sampler(4278896710u,-1,3)==4286735128u);
require(sampler(4278896710u,2,5)==4286735128u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13052934666843063424ull)throw std::runtime_error("GM oracle gradientMap.ocean none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,2,5)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,2,5)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6639707171348925734ull)throw std::runtime_error("GM oracle gradientMap.ocean none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,2,5)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,2,5)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7141867229002117533ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,3,7)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,3,7)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3643820225580151353ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,3,7)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,3,7)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7141867229002117533ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,3,7)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,3,7)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3643820225580151353ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,3,7)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,3,7)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1082881891517941245ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,5,11)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,5,11)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8038470914338872857ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,5,11)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,5,11)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1082881891517941245ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,5,11)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,5,11)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8038470914338872857ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,5,11)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,5,11)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=438400063758379421ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,9,19)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,9,19)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5001293144919524665ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,9,19)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,9,19)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=438400063758379421ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,9,19)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,9,19)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5001293144919524665ull)throw std::runtime_error("GM oracle gradientMap.ocean bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,9,19)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,9,19)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12150286842515290425ull)throw std::runtime_error("GM oracle gradientMap.ocean checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,3,7)==1069330224u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,3,7)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9403213465168819249ull)throw std::runtime_error("GM oracle gradientMap.ocean checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,3,7)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,3,7)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12150286842515290425ull)throw std::runtime_error("GM oracle gradientMap.ocean checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,3,7)==1069330224u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,3,7)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9403213465168819249ull)throw std::runtime_error("GM oracle gradientMap.ocean checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,3,7)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,3,7)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14269269405454979193ull)throw std::runtime_error("GM oracle gradientMap.ocean diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,7,15)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7491126478297210737ull)throw std::runtime_error("GM oracle gradientMap.ocean diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14269269405454979193ull)throw std::runtime_error("GM oracle gradientMap.ocean diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,7,15)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7491126478297210737ull)throw std::runtime_error("GM oracle gradientMap.ocean diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17878610171165296185ull)throw std::runtime_error("GM oracle gradientMap.ocean diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,7,15)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6543501856456949233ull)throw std::runtime_error("GM oracle gradientMap.ocean diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17878610171165296185ull)throw std::runtime_error("GM oracle gradientMap.ocean diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,7,15)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6543501856456949233ull)throw std::runtime_error("GM oracle gradientMap.ocean diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5607326969536381033ull)throw std::runtime_error("GM oracle gradientMap.ocean horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,7,15)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2632464405265732001ull)throw std::runtime_error("GM oracle gradientMap.ocean horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,7,15)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5607326969536381033ull)throw std::runtime_error("GM oracle gradientMap.ocean horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1064917013u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4290555696u);
require(sampler(4278896710u,7,15)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2632464405265732001ull)throw std::runtime_error("GM oracle gradientMap.ocean horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1069330224u);
require(sampler(1057970918u,7,15)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14901608943011373213ull)throw std::runtime_error("GM oracle gradientMap.ocean vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1069330224u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10658594251289691093ull)throw std::runtime_error("GM oracle gradientMap.ocean vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4286142485u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14901608943011373213ull)throw std::runtime_error("GM oracle gradientMap.ocean vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064917013u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1069330224u);
require(sampler(4278896710u,-9,-7)==4290555696u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4290555696u);
}
{GradientMapSettings settings{{{0,4281932552u},{0.3333333333333333,4286142485u},{0.6666666666666666,4290555696u},{1,4293391570u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10658594251289691093ull)throw std::runtime_error("GM oracle gradientMap.ocean vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1069330224u);
require(sampler(1057970918u,-1,3)==1064917013u);
require(sampler(1057970918u,7,15)==1069330224u);
require(sampler(4278896710u,-9,-7)==4286142485u);
require(sampler(4278896710u,-1,3)==4286142485u);
require(sampler(4278896710u,7,15)==4286142485u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2955497619013081846ull)throw std::runtime_error("GM oracle gradientMap.sunset none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1064260006u);
require(sampler(1057970918u,-1,3)==1064260006u);
require(sampler(1057970918u,2,5)==1064260006u);
require(sampler(4278896710u,-9,-7)==4284772574u);
require(sampler(4278896710u,-1,3)==4284772574u);
require(sampler(4278896710u,2,5)==4284772574u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10476609785983663584ull)throw std::runtime_error("GM oracle gradientMap.sunset none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1063806151u);
require(sampler(1057970918u,-1,3)==1063806151u);
require(sampler(1057970918u,2,5)==1063806151u);
require(sampler(4278896710u,-9,-7)==4285744527u);
require(sampler(4278896710u,-1,3)==4285744527u);
require(sampler(4278896710u,2,5)==4285744527u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7341982665779236270ull)throw std::runtime_error("GM oracle gradientMap.sunset none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,2,5)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,2,5)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2824206876147492428ull)throw std::runtime_error("GM oracle gradientMap.sunset none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,2,5)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,2,5)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15825155489497997109ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,3,7)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,3,7)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7230378872533927721ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,3,7)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,3,7)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15825155489497997109ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,3,7)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,3,7)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7230378872533927721ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,3,7)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,3,7)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9436552883189545677ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,5,11)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,5,11)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4584759479872625265ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,5,11)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,5,11)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9436552883189545677ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,5,11)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,5,11)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4584759479872625265ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,5,11)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,5,11)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13966067514617959965ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,9,19)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,9,19)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12421737693776660345ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,9,19)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,9,19)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13966067514617959965ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,9,19)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,9,19)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12421737693776660345ull)throw std::runtime_error("GM oracle gradientMap.sunset bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,9,19)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,9,19)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17486057040188359089ull)throw std::runtime_error("GM oracle gradientMap.sunset checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,3,7)==1063418092u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,3,7)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10333247151664429369ull)throw std::runtime_error("GM oracle gradientMap.sunset checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,3,7)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,3,7)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17486057040188359089ull)throw std::runtime_error("GM oracle gradientMap.sunset checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,3,7)==1063418092u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,3,7)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10333247151664429369ull)throw std::runtime_error("GM oracle gradientMap.sunset checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,3,7)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,3,7)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6110131791265862385ull)throw std::runtime_error("GM oracle gradientMap.sunset diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,7,15)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12104084095721813705ull)throw std::runtime_error("GM oracle gradientMap.sunset diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6110131791265862385ull)throw std::runtime_error("GM oracle gradientMap.sunset diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,7,15)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12104084095721813705ull)throw std::runtime_error("GM oracle gradientMap.sunset diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7215230255394550065ull)throw std::runtime_error("GM oracle gradientMap.sunset diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,7,15)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9722848050356678857ull)throw std::runtime_error("GM oracle gradientMap.sunset diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7215230255394550065ull)throw std::runtime_error("GM oracle gradientMap.sunset diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,7,15)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9722848050356678857ull)throw std::runtime_error("GM oracle gradientMap.sunset diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9744828792449510625ull)throw std::runtime_error("GM oracle gradientMap.sunset horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,7,15)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6050156942560974153ull)throw std::runtime_error("GM oracle gradientMap.sunset horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,7,15)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9744828792449510625ull)throw std::runtime_error("GM oracle gradientMap.sunset horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1064648065u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4284643564u);
require(sampler(4278896710u,7,15)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6050156942560974153ull)throw std::runtime_error("GM oracle gradientMap.sunset horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1063418092u);
require(sampler(1057970918u,7,15)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7971964213583461261ull)throw std::runtime_error("GM oracle gradientMap.sunset vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1063418092u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4507538699137899477ull)throw std::runtime_error("GM oracle gradientMap.sunset vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4285873537u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7971964213583461261ull)throw std::runtime_error("GM oracle gradientMap.sunset vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1064648065u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1063418092u);
require(sampler(4278896710u,-9,-7)==4284643564u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4284643564u);
}
{GradientMapSettings settings{{{0,4282192677u},{0.3333333333333333,4285873537u},{0.6666666666666666,4284643564u},{1,4288866047u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4507538699137899477ull)throw std::runtime_error("GM oracle gradientMap.sunset vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063418092u);
require(sampler(1057970918u,-1,3)==1064648065u);
require(sampler(1057970918u,7,15)==1063418092u);
require(sampler(4278896710u,-9,-7)==4285873537u);
require(sampler(4278896710u,-1,3)==4285873537u);
require(sampler(4278896710u,7,15)==4285873537u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17994932713736545508ull)throw std::runtime_error("GM oracle gradientMap.gameboy none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1059421007u);
require(sampler(1057970918u,-1,3)==1059421007u);
require(sampler(1057970918u,2,5)==1059421007u);
require(sampler(4278896710u,-9,-7)==4279476863u);
require(sampler(4278896710u,-1,3)==4279476863u);
require(sampler(4278896710u,2,5)==4279476863u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3642856834616395298ull)throw std::runtime_error("GM oracle gradientMap.gameboy none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1058706284u);
require(sampler(1057970918u,-1,3)==1058706284u);
require(sampler(1057970918u,2,5)==1058706284u);
require(sampler(4278896710u,-9,-7)==4281101372u);
require(sampler(4278896710u,-1,3)==4281101372u);
require(sampler(4278896710u,2,5)==4281101372u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6971521904872663028ull)throw std::runtime_error("GM oracle gradientMap.gameboy none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,2,5)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,2,5)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12726803792225553774ull)throw std::runtime_error("GM oracle gradientMap.gameboy none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,2,5)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,2,5)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2527549698732402653ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,3,7)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,3,7)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2287265427512157957ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,3,7)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,3,7)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2527549698732402653ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,3,7)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,3,7)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2287265427512157957ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,3,7)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,3,7)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5912405671598821421ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,5,11)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,5,11)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13240403104035570637ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,5,11)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,5,11)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5912405671598821421ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,5,11)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,5,11)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13240403104035570637ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,5,11)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,5,11)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5411533805972219101ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,9,19)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,9,19)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=376438270814326917ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,9,19)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,9,19)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5411533805972219101ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,9,19)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,9,19)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=376438270814326917ull)throw std::runtime_error("GM oracle gradientMap.gameboy bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,9,19)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,9,19)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3725871026442620725ull)throw std::runtime_error("GM oracle gradientMap.gameboy checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,3,7)==1057991819u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,3,7)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12842334463904121677ull)throw std::runtime_error("GM oracle gradientMap.gameboy checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,3,7)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,3,7)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3725871026442620725ull)throw std::runtime_error("GM oracle gradientMap.gameboy checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,3,7)==1057991819u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,3,7)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12842334463904121677ull)throw std::runtime_error("GM oracle gradientMap.gameboy checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,3,7)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,3,7)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7435448855101585781ull)throw std::runtime_error("GM oracle gradientMap.gameboy diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,7,15)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11230333482550731069ull)throw std::runtime_error("GM oracle gradientMap.gameboy diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7435448855101585781ull)throw std::runtime_error("GM oracle gradientMap.gameboy diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,7,15)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11230333482550731069ull)throw std::runtime_error("GM oracle gradientMap.gameboy diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13720957363376334005ull)throw std::runtime_error("GM oracle gradientMap.gameboy diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,7,15)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3679643618026702909ull)throw std::runtime_error("GM oracle gradientMap.gameboy diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13720957363376334005ull)throw std::runtime_error("GM oracle gradientMap.gameboy diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,7,15)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3679643618026702909ull)throw std::runtime_error("GM oracle gradientMap.gameboy diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16967771489322140357ull)throw std::runtime_error("GM oracle gradientMap.gameboy horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,7,15)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18429006546331191245ull)throw std::runtime_error("GM oracle gradientMap.gameboy horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,7,15)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16967771489322140357ull)throw std::runtime_error("GM oracle gradientMap.gameboy horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1060135472u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4279217291u);
require(sampler(4278896710u,7,15)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18429006546331191245ull)throw std::runtime_error("GM oracle gradientMap.gameboy horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1057991819u);
require(sampler(1057970918u,7,15)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5040621682892365805ull)throw std::runtime_error("GM oracle gradientMap.gameboy vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1057991819u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12130724614487404861ull)throw std::runtime_error("GM oracle gradientMap.gameboy vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4281360944u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5040621682892365805ull)throw std::runtime_error("GM oracle gradientMap.gameboy vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060135472u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1057991819u);
require(sampler(4278896710u,-9,-7)==4279217291u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4279217291u);
}
{GradientMapSettings settings{{{0,4279187471u},{0.3333333333333333,4281360944u},{0.6666666666666666,4279217291u},{1,4279221403u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12130724614487404861ull)throw std::runtime_error("GM oracle gradientMap.gameboy vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057991819u);
require(sampler(1057970918u,-1,3)==1060135472u);
require(sampler(1057970918u,7,15)==1057991819u);
require(sampler(4278896710u,-9,-7)==4281360944u);
require(sampler(4278896710u,-1,3)==4281360944u);
require(sampler(4278896710u,7,15)==4281360944u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14281061044398904907ull)throw std::runtime_error("GM oracle gradientMap.sepia none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1063155336u);
require(sampler(1057970918u,-1,3)==1063155336u);
require(sampler(1057970918u,2,5)==1063155336u);
require(sampler(4278896710u,-9,-7)==4286421934u);
require(sampler(4278896710u,-1,3)==4286421934u);
require(sampler(4278896710u,2,5)==4286421934u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2696905759575383883ull)throw std::runtime_error("GM oracle gradientMap.sepia none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1064340639u);
require(sampler(1057970918u,-1,3)==1064340639u);
require(sampler(1057970918u,2,5)==1064340639u);
require(sampler(4278896710u,-9,-7)==4283524985u);
require(sampler(4278896710u,-1,3)==4283524985u);
require(sampler(4278896710u,2,5)==4283524985u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9896167446307892389ull)throw std::runtime_error("GM oracle gradientMap.sepia none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1057887784u);
require(sampler(1057970918u,2,5)==1057887784u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,2,5)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8239961346402266277ull)throw std::runtime_error("GM oracle gradientMap.sepia none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,2,5)==1069608191u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,2,5)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15420006760401925925ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,3,7)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,3,7)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14292098768418356005ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,3,7)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,3,7)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15420006760401925925ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,3,7)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,3,7)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14292098768418356005ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,3,7)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,3,7)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16347718772996058405ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,5,11)==1057887784u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,5,11)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18446523138867326757ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,5,11)==1069608191u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,5,11)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16347718772996058405ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,5,11)==1057887784u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,5,11)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18446523138867326757ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,5,11)==1069608191u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,5,11)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15213279187766128805ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,9,19)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,9,19)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16475753023300567845ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,9,19)==1069608191u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,9,19)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15213279187766128805ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,9,19)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,9,19)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16475753023300567845ull)throw std::runtime_error("GM oracle gradientMap.sepia bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,9,19)==1069608191u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,9,19)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11917988786659604773ull)throw std::runtime_error("GM oracle gradientMap.sepia checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,3,7)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,3,7)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2881245320818794789ull)throw std::runtime_error("GM oracle gradientMap.sepia checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,3,7)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,3,7)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11917988786659604773ull)throw std::runtime_error("GM oracle gradientMap.sepia checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,3,7)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,3,7)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2881245320818794789ull)throw std::runtime_error("GM oracle gradientMap.sepia checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,3,7)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,3,7)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2127066312424510813ull)throw std::runtime_error("GM oracle gradientMap.sepia diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14235737491877850189ull)throw std::runtime_error("GM oracle gradientMap.sepia diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2127066312424510813ull)throw std::runtime_error("GM oracle gradientMap.sepia diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14235737491877850189ull)throw std::runtime_error("GM oracle gradientMap.sepia diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1069608191u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2844129237544962589ull)throw std::runtime_error("GM oracle gradientMap.sepia diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16170447041842763501ull)throw std::runtime_error("GM oracle gradientMap.sepia diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2844129237544962589ull)throw std::runtime_error("GM oracle gradientMap.sepia diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16170447041842763501ull)throw std::runtime_error("GM oracle gradientMap.sepia diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1069608191u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6078709156892066645ull)throw std::runtime_error("GM oracle gradientMap.sepia horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1057887784u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,7,15)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11142723629457590901ull)throw std::runtime_error("GM oracle gradientMap.sepia horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1057887784u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6078709156892066645ull)throw std::runtime_error("GM oracle gradientMap.sepia horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1057887784u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4290833663u);
require(sampler(4278896710u,7,15)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11142723629457590901ull)throw std::runtime_error("GM oracle gradientMap.sepia horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1057887784u);
require(sampler(1057970918u,7,15)==1057887784u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4279113256u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16064037851753604657ull)throw std::runtime_error("GM oracle gradientMap.sepia vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1057887784u);
require(sampler(1057970918u,7,15)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9309055209501814665ull)throw std::runtime_error("GM oracle gradientMap.sepia vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1057887784u);
require(sampler(1057970918u,7,15)==1069608191u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16064037851753604657ull)throw std::runtime_error("GM oracle gradientMap.sepia vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1057887784u);
require(sampler(1057970918u,7,15)==1069608191u);
require(sampler(4278896710u,-9,-7)==4290833663u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4290833663u);
}
{GradientMapSettings settings{{{0,4279113256u},{1,4290833663u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9309055209501814665ull)throw std::runtime_error("GM oracle gradientMap.sepia vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057887784u);
require(sampler(1057970918u,-1,3)==1057887784u);
require(sampler(1057970918u,7,15)==1069608191u);
require(sampler(4278896710u,-9,-7)==4279113256u);
require(sampler(4278896710u,-1,3)==4279113256u);
require(sampler(4278896710u,7,15)==4290833663u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11549811004150810857ull)throw std::runtime_error("GM oracle custom-duplicate none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1062945341u);
require(sampler(1057970918u,-1,3)==1062945341u);
require(sampler(1057970918u,2,5)==1062945341u);
require(sampler(4278896710u,-9,-7)==4285300090u);
require(sampler(4278896710u,-1,3)==4285300090u);
require(sampler(4278896710u,2,5)==4285300090u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15657496462906630701ull)throw std::runtime_error("GM oracle custom-duplicate none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1061187494u);
require(sampler(1057970918u,-1,3)==1061187494u);
require(sampler(1057970918u,2,5)==1061187494u);
require(sampler(4278896710u,-9,-7)==4283445109u);
require(sampler(4278896710u,-1,3)==4283445109u);
require(sampler(4278896710u,2,5)==4283445109u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11092788629010106451ull)throw std::runtime_error("GM oracle custom-duplicate none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,2,5)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4280181960u);
require(sampler(4278896710u,2,5)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15201273627305675715ull)throw std::runtime_error("GM oracle custom-duplicate none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,2,5)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,2,5)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9632905264212916897ull)throw std::runtime_error("GM oracle custom-duplicate bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,3,7)==1063538708u);
require(sampler(4278896710u,-9,-7)==4292648970u);
require(sampler(4278896710u,-1,3)==4292648970u);
require(sampler(4278896710u,3,7)==4292648970u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4378706028423100437ull)throw std::runtime_error("GM oracle custom-duplicate bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,3,7)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,3,7)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9632905264212916897ull)throw std::runtime_error("GM oracle custom-duplicate bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,3,7)==1063538708u);
require(sampler(4278896710u,-9,-7)==4292648970u);
require(sampler(4278896710u,-1,3)==4292648970u);
require(sampler(4278896710u,3,7)==4292648970u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4378706028423100437ull)throw std::runtime_error("GM oracle custom-duplicate bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,3,7)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,3,7)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8566041479691392821ull)throw std::runtime_error("GM oracle custom-duplicate bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,5,11)==1063538708u);
require(sampler(4278896710u,-9,-7)==4292648970u);
require(sampler(4278896710u,-1,3)==4292648970u);
require(sampler(4278896710u,5,11)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11311799709566450905ull)throw std::runtime_error("GM oracle custom-duplicate bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,5,11)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,5,11)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8566041479691392821ull)throw std::runtime_error("GM oracle custom-duplicate bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,5,11)==1063538708u);
require(sampler(4278896710u,-9,-7)==4292648970u);
require(sampler(4278896710u,-1,3)==4292648970u);
require(sampler(4278896710u,5,11)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11311799709566450905ull)throw std::runtime_error("GM oracle custom-duplicate bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,5,11)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,5,11)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18331241190191416693ull)throw std::runtime_error("GM oracle custom-duplicate bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,9,19)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4292648970u);
require(sampler(4278896710u,9,19)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14295413030881887961ull)throw std::runtime_error("GM oracle custom-duplicate bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,9,19)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,9,19)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18331241190191416693ull)throw std::runtime_error("GM oracle custom-duplicate bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,9,19)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4292648970u);
require(sampler(4278896710u,9,19)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=14295413030881887961ull)throw std::runtime_error("GM oracle custom-duplicate bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,9,19)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,9,19)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12036175834229208773ull)throw std::runtime_error("GM oracle custom-duplicate checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,3,7)==1063538708u);
require(sampler(4278896710u,-9,-7)==4292648970u);
require(sampler(4278896710u,-1,3)==4292648970u);
require(sampler(4278896710u,3,7)==4292648970u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17224545570608596581ull)throw std::runtime_error("GM oracle custom-duplicate checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,3,7)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,3,7)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12036175834229208773ull)throw std::runtime_error("GM oracle custom-duplicate checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,3,7)==1063538708u);
require(sampler(4278896710u,-9,-7)==4292648970u);
require(sampler(4278896710u,-1,3)==4292648970u);
require(sampler(4278896710u,3,7)==4292648970u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17224545570608596581ull)throw std::runtime_error("GM oracle custom-duplicate checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,3,7)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,3,7)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13118518140244436293ull)throw std::runtime_error("GM oracle custom-duplicate diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,7,15)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4280181960u);
require(sampler(4278896710u,7,15)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5891861044001694413ull)throw std::runtime_error("GM oracle custom-duplicate diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,7,15)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,7,15)==4281532671u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13118518140244436293ull)throw std::runtime_error("GM oracle custom-duplicate diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,7,15)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4280181960u);
require(sampler(4278896710u,7,15)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5891861044001694413ull)throw std::runtime_error("GM oracle custom-duplicate diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,7,15)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,7,15)==4281532671u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13007238474799702037ull)throw std::runtime_error("GM oracle custom-duplicate diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,7,15)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4280181960u);
require(sampler(4278896710u,7,15)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2569084337824764861ull)throw std::runtime_error("GM oracle custom-duplicate diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,7,15)==1058956488u);
require(sampler(4278896710u,-9,-7)==4281532671u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,7,15)==4281532671u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13007238474799702037ull)throw std::runtime_error("GM oracle custom-duplicate diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,7,15)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4280181960u);
require(sampler(4278896710u,7,15)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2569084337824764861ull)throw std::runtime_error("GM oracle custom-duplicate diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,7,15)==1058956488u);
require(sampler(4278896710u,-9,-7)==4281532671u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,7,15)==4281532671u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5224170688214499877ull)throw std::runtime_error("GM oracle custom-duplicate horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060307199u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,7,15)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4280181960u);
require(sampler(4278896710u,7,15)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10705035895544633957ull)throw std::runtime_error("GM oracle custom-duplicate horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,7,15)==1058956488u);
require(sampler(4278896710u,-9,-7)==4281532671u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,7,15)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5224170688214499877ull)throw std::runtime_error("GM oracle custom-duplicate horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1060307199u);
require(sampler(1057970918u,-1,3)==1063538708u);
require(sampler(1057970918u,7,15)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4280181960u);
require(sampler(4278896710u,7,15)==4280181960u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10705035895544633957ull)throw std::runtime_error("GM oracle custom-duplicate horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,7,15)==1058956488u);
require(sampler(4278896710u,-9,-7)==4281532671u);
require(sampler(4278896710u,-1,3)==4284764180u);
require(sampler(4278896710u,7,15)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1027984248105505809ull)throw std::runtime_error("GM oracle custom-duplicate vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1060307199u);
require(sampler(1057970918u,7,15)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4280181960u);
require(sampler(4278896710u,7,15)==4292648970u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8773336167593850353ull)throw std::runtime_error("GM oracle custom-duplicate vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,7,15)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4281532671u);
require(sampler(4278896710u,7,15)==4284764180u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1027984248105505809ull)throw std::runtime_error("GM oracle custom-duplicate vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1063538708u);
require(sampler(1057970918u,-1,3)==1060307199u);
require(sampler(1057970918u,7,15)==1063538708u);
require(sampler(4278896710u,-9,-7)==4280181960u);
require(sampler(4278896710u,-1,3)==4280181960u);
require(sampler(4278896710u,7,15)==4292648970u);
}
{GradientMapSettings settings{{{0.2,4281532671u},{0.5,4284764180u},{0.5,4280181960u},{0.8,4292648970u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8773336167593850353ull)throw std::runtime_error("GM oracle custom-duplicate vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1058956488u);
require(sampler(1057970918u,-1,3)==1058956488u);
require(sampler(1057970918u,7,15)==1058956488u);
require(sampler(4278896710u,-9,-7)==4284764180u);
require(sampler(4278896710u,-1,3)==4281532671u);
require(sampler(4278896710u,7,15)==4284764180u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=5166248254924816933ull)throw std::runtime_error("GM oracle custom-missing none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1064465010u);
require(sampler(1057970918u,-1,3)==1064465010u);
require(sampler(1057970918u,2,5)==1064465010u);
require(sampler(4278896710u,-9,-7)==4288651167u);
require(sampler(4278896710u,-1,3)==4288651167u);
require(sampler(4278896710u,2,5)==4288651167u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=629789991736132901ull)throw std::runtime_error("GM oracle custom-missing none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1066241421u);
require(sampler(1057970918u,-1,3)==1066241421u);
require(sampler(1057970918u,2,5)==1066241421u);
require(sampler(4278896710u,-9,-7)==4284506208u);
require(sampler(4278896710u,-1,3)==4284506208u);
require(sampler(4278896710u,2,5)==4284506208u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15688678923172079269ull)throw std::runtime_error("GM oracle custom-missing none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,2,5)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,2,5)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12439528089614247589ull)throw std::runtime_error("GM oracle custom-missing none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,2,5)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,2,5)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18171781887483220261ull)throw std::runtime_error("GM oracle custom-missing bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13817092899212742949ull)throw std::runtime_error("GM oracle custom-missing bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18171781887483220261ull)throw std::runtime_error("GM oracle custom-missing bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13817092899212742949ull)throw std::runtime_error("GM oracle custom-missing bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13689317812209234725ull)throw std::runtime_error("GM oracle custom-missing bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,5,11)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,5,11)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6909643539244909349ull)throw std::runtime_error("GM oracle custom-missing bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,5,11)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,5,11)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13689317812209234725ull)throw std::runtime_error("GM oracle custom-missing bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,5,11)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,5,11)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6909643539244909349ull)throw std::runtime_error("GM oracle custom-missing bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,5,11)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,5,11)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3386920343859968293ull)throw std::runtime_error("GM oracle custom-missing bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,9,19)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,9,19)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2774769441757777189ull)throw std::runtime_error("GM oracle custom-missing bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,9,19)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,9,19)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=3386920343859968293ull)throw std::runtime_error("GM oracle custom-missing bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,9,19)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,9,19)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2774769441757777189ull)throw std::runtime_error("GM oracle custom-missing bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,9,19)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,9,19)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11181174875560522021ull)throw std::runtime_error("GM oracle custom-missing checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1249537048904970533ull)throw std::runtime_error("GM oracle custom-missing checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=11181174875560522021ull)throw std::runtime_error("GM oracle custom-missing checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1249537048904970533ull)throw std::runtime_error("GM oracle custom-missing checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,3,7)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,3,7)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6399915066274224461ull)throw std::runtime_error("GM oracle custom-missing diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4922608280495602941ull)throw std::runtime_error("GM oracle custom-missing diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6399915066274224461ull)throw std::runtime_error("GM oracle custom-missing diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4922608280495602941ull)throw std::runtime_error("GM oracle custom-missing diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1073741823u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10323693717238716749ull)throw std::runtime_error("GM oracle custom-missing diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15822410823069220093ull)throw std::runtime_error("GM oracle custom-missing diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10323693717238716749ull)throw std::runtime_error("GM oracle custom-missing diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15822410823069220093ull)throw std::runtime_error("GM oracle custom-missing diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1073741823u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1335369868571288517ull)throw std::runtime_error("GM oracle custom-missing horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13472435510477376133ull)throw std::runtime_error("GM oracle custom-missing horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1335369868571288517ull)throw std::runtime_error("GM oracle custom-missing horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4294967295u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=13472435510477376133ull)throw std::runtime_error("GM oracle custom-missing horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1056964608u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4278190080u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17197637606210282593ull)throw std::runtime_error("GM oracle custom-missing vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18269192528540281321ull)throw std::runtime_error("GM oracle custom-missing vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17197637606210282593ull)throw std::runtime_error("GM oracle custom-missing vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1073741823u);
require(sampler(4278896710u,-9,-7)==4294967295u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278190080u},{1,4294967295u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18269192528540281321ull)throw std::runtime_error("GM oracle custom-missing vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1056964608u);
require(sampler(1057970918u,-1,3)==1056964608u);
require(sampler(1057970918u,7,15)==1073741823u);
require(sampler(4278896710u,-9,-7)==4278190080u);
require(sampler(4278896710u,-1,3)==4278190080u);
require(sampler(4278896710u,7,15)==4294967295u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8111348376082640421ull)throw std::runtime_error("GM oracle custom-clamped none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1063226738u);
require(sampler(1057970918u,-1,3)==1063226738u);
require(sampler(1057970918u,2,5)==1063226738u);
require(sampler(4278896710u,-9,-7)==4286603423u);
require(sampler(4278896710u,-1,3)==4286603423u);
require(sampler(4278896710u,2,5)==4286603423u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10270774030561499429ull)throw std::runtime_error("GM oracle custom-clamped none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1064530573u);
require(sampler(1057970918u,-1,3)==1064530573u);
require(sampler(1057970918u,2,5)==1064530573u);
require(sampler(4278896710u,-9,-7)==4283604832u);
require(sampler(4278896710u,-1,3)==4283604832u);
require(sampler(4278896710u,2,5)==4283604832u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,false,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=10313159765611117733ull)throw std::runtime_error("GM oracle custom-clamped none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1057685248u);
require(sampler(1057970918u,2,5)==1057685248u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,2,5)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,true,0};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<1;++y)for(int x=0;x<1;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=9137393695351176357ull)throw std::runtime_error("GM oracle custom-clamped none");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,2,5)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,2,5)==1070072063u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,2,5)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1958816341327755045ull)throw std::runtime_error("GM oracle custom-clamped bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,3,7)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,3,7)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16243098016018830117ull)throw std::runtime_error("GM oracle custom-clamped bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,3,7)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,3,7)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,false,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1958816341327755045ull)throw std::runtime_error("GM oracle custom-clamped bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,3,7)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,3,7)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,true,1};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=16243098016018830117ull)throw std::runtime_error("GM oracle custom-clamped bayer-2");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,3,7)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,3,7)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18201881873035394341ull)throw std::runtime_error("GM oracle custom-clamped bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,5,11)==1057685248u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,5,11)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1965701182252806437ull)throw std::runtime_error("GM oracle custom-clamped bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,5,11)==1070072063u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,5,11)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,false,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18201881873035394341ull)throw std::runtime_error("GM oracle custom-clamped bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,5,11)==1057685248u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,5,11)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,true,2};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<4;++y)for(int x=0;x<4;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1965701182252806437ull)throw std::runtime_error("GM oracle custom-clamped bayer-4");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,5,11)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,5,11)==1070072063u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,5,11)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12354451444868821797ull)throw std::runtime_error("GM oracle custom-clamped bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,9,19)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,9,19)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12056357806087709989ull)throw std::runtime_error("GM oracle custom-clamped bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,9,19)==1070072063u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,9,19)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,false,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12354451444868821797ull)throw std::runtime_error("GM oracle custom-clamped bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,9,19)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,9,19)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,true,3};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<8;++y)for(int x=0;x<8;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=12056357806087709989ull)throw std::runtime_error("GM oracle custom-clamped bayer-8");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,9,19)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,9,19)==1070072063u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,9,19)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4576507300779484453ull)throw std::runtime_error("GM oracle custom-clamped checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,3,7)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,3,7)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6755419061393843493ull)throw std::runtime_error("GM oracle custom-clamped checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,3,7)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,3,7)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,false,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=4576507300779484453ull)throw std::runtime_error("GM oracle custom-clamped checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,3,7)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,3,7)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,true,4};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<2;++y)for(int x=0;x<2;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=6755419061393843493ull)throw std::runtime_error("GM oracle custom-clamped checker");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,3,7)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,3,7)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,3,7)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2143668225539425613ull)throw std::runtime_error("GM oracle custom-clamped diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2241329749728276221ull)throw std::runtime_error("GM oracle custom-clamped diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,false,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2143668225539425613ull)throw std::runtime_error("GM oracle custom-clamped diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,true,5};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=2241329749728276221ull)throw std::runtime_error("GM oracle custom-clamped diagonal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1070072063u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17200224810047835981ull)throw std::runtime_error("GM oracle custom-clamped diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8197558318723994877ull)throw std::runtime_error("GM oracle custom-clamped diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,false,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=17200224810047835981ull)throw std::runtime_error("GM oracle custom-clamped diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,true,6};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=8197558318723994877ull)throw std::runtime_error("GM oracle custom-clamped diagonal-reverse");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1070072063u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1761115601171199429ull)throw std::runtime_error("GM oracle custom-clamped horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1057685248u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,7,15)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7827798911742974597ull)throw std::runtime_error("GM oracle custom-clamped horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1057685248u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,false,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=1761115601171199429ull)throw std::runtime_error("GM oracle custom-clamped horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1057685248u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4291297535u);
require(sampler(4278896710u,7,15)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,true,7};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=7827798911742974597ull)throw std::runtime_error("GM oracle custom-clamped horizontal");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1057685248u);
require(sampler(1057970918u,7,15)==1057685248u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4278910720u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15285096204053287009ull)throw std::runtime_error("GM oracle custom-clamped vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1057685248u);
require(sampler(1057970918u,7,15)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},false,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18057361473622130153ull)throw std::runtime_error("GM oracle custom-clamped vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1057685248u);
require(sampler(1057970918u,7,15)==1070072063u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,false,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=15285096204053287009ull)throw std::runtime_error("GM oracle custom-clamped vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1057685248u);
require(sampler(1057970918u,7,15)==1070072063u);
require(sampler(4278896710u,-9,-7)==4291297535u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4291297535u);
}
{GradientMapSettings settings{{{0,4278910720u},{1,4291297535u}},true,true,8};GradientMapSampler sampler(settings);std::uint64_t hash=14695981039346656037ull;for(int y=0;y<6;++y)for(int x=0;x<6;++x)for(int n=0;n<256;++n){hash^=sampler(0xff000000u|(n*0x010101u),x,y)&0xffffff;hash*=1099511628211ull;}if(hash!=18057361473622130153ull)throw std::runtime_error("GM oracle custom-clamped vertical");
require(sampler(15093780u,-9,-7)==15093780u);
require(sampler(15093780u,-1,3)==15093780u);
require(sampler(15093780u,7,15)==15093780u);
require(sampler(1057970918u,-9,-7)==1057685248u);
require(sampler(1057970918u,-1,3)==1057685248u);
require(sampler(1057970918u,7,15)==1070072063u);
require(sampler(4278896710u,-9,-7)==4278910720u);
require(sampler(4278896710u,-1,3)==4278910720u);
require(sampler(4278896710u,7,15)==4291297535u);
}
}
inline void verifyGradientMapHistoryAndStore(){
 wchar_t modulePath[32768]{};GetModuleFileNameW(nullptr,modulePath,32768);auto directory=std::filesystem::path(modulePath).parent_path().parent_path()/"gm-store-test-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(directory);GradientMapPresetStore store(directory);require(store.load().empty()&&store.hidden().empty());auto gold=gradientMapBuiltins()[2].settings;gold.dither=3;gold.reverse=true;auto saved=store.save(" Silver ",gold);require(saved.size()==1&&saved[0].name=="Silver");store.save("Gold",gradientMapBuiltins()[1].settings);store.save("Silver",gradientMapBuiltins()[0].settings);saved=store.load();require(saved.size()==2&&saved[0].name=="Gold"&&saved[1].name=="Silver");require(gradientMapSignature(saved[0].settings)==gradientMapSignature(gradientMapBuiltins()[1].settings));store.remove("Silver");require(store.load().size()==1);store.hide(1);store.hide(1);require(store.hidden()==std::vector<int>{1});require(gradientMapBuiltins().size()==8);std::ofstream(store.path(),std::ios::trunc)<<"{broken";bool refused=false;try{store.save("New",gold);}catch(...){refused=true;}require(refused);std::ifstream corrupt(store.path());std::string original;std::getline(corrupt,original);require(original=="{broken");auto blocker=directory/"blocked";std::ofstream(blocker)<<"file";refused=false;try{GradientMapPresetStore(blocker).save("Failure",gold);}catch(...){refused=true;}require(refused);
 Document d=Document::fromImage(3,1,{0x00112233,0x3f806020,0xffffffff},U"gradient map");auto before=d.pixels();auto h=d.historySize();require(d.beginColorAdjustment());ColorAdjustment spec;spec.kind=ColorAdjustmentKind::GradientMap;spec.gradientMap=gold;require(d.updateColorAdjustment(spec));require(d.displayPixels()!=before&&d.pixels()==before&&(d.displayPixels()[1]>>24)==63&&d.displayPixels()[0]==before[0]);d.cancelColorAdjustment();require(d.historySize()==h&&d.pixels()==before);d.commitSelection({},SelectionMask{1,0,1,1,{}});require(d.beginColorAdjustment());require(d.updateColorAdjustment(spec));auto after=d.displayPixels();require(after[0]==before[0]&&after[2]==before[2]);require(d.commitColorAdjustment()&&d.historySize()==h+2);d.undo();require(d.pixels()==before);d.redo();require(d.pixels()==after);
}
int main(){try{verifyGradientMapOracle();verifyGradientMapHistoryAndStore();}catch(const winrt::hresult_error& e){std::cerr<<"GM HRESULT "<<winrt::to_string(e.message());return 1;}catch(const std::exception& e){std::cerr<<"GM "<<e.what();return 1;}verifyAntiAliasOracle();verifyAntiAliasTargets();verifyConvolutionOracle();
 Document fullDelete(2,1);fullDelete.beginStroke({0,0},0xff123456);fullDelete.commitStroke();fullDelete.beginStroke({1,0},0xffabcdef);fullDelete.commitStroke();fullDelete.selectTimelineCel(fullDelete.cel().id);fullDelete.commitSelection({},SelectionMask{0,0,1,1,{}});bool blocked=false;try{fullDelete.deleteSelectedCels();}catch(const std::runtime_error&){blocked=true;}require(blocked);const auto fullHistory=fullDelete.historySize();require(fullDelete.deleteSelectedCels(true)&&fullDelete.pixels()[0]==0&&fullDelete.pixels()[1]==0&&fullDelete.selection()&&fullDelete.historySize()==fullHistory+1);fullDelete.undo();require(fullDelete.pixels()[0]==0xff123456&&fullDelete.pixels()[1]==0xffabcdef);fullDelete.clearTimelineSelection();fullDelete.addFrame();fullDelete.commitSelection({},SelectionMask{0,0,1,1,{}});const auto frameDeleteHistory=fullDelete.historySize();fullDelete.deleteSelectedFrames(true);require(fullDelete.timeline().state().frames.size()==1&&!fullDelete.selection()&&fullDelete.historySize()==frameDeleteHistory+1);fullDelete.undo();require(fullDelete.timeline().state().frames.size()==2&&!fullDelete.selection());
try{
 Document d(3,2);d.beginStroke({1,0},0xff0000ff);d.commitStroke();d.beginStroke({2,0},0xff00ff00);d.commitStroke();const auto first=d.frame().id;const auto layer=d.layer().id;d.addFrame();const auto second=d.frame().id;d.beginStroke({0,1},0xffff0000);d.commitStroke();d.selectFrame(first);
 d.commitSelection({},SelectionMask{1,0,2,1,{1,0}});d.selectTimelineCel(d.timeline().findCel(layer,first)->id,0);const auto copyHistory=d.historySize();require(d.copySelectedCels());require(d.historySize()==copyHistory);d.selectTimelineCel(d.timeline().findCel(layer,second)->id,0);const auto before=d.pixels();const auto frames=d.timeline().state().frames.size();d.markSaved();const auto history=d.historySize();require(d.pasteCopiedCels()&&d.floating());require(d.pixels()[1]==0xff0000ff&&d.pixels()[2]==0&&d.pixels()[3]==0xffff0000);require(!d.dirty()&&d.historySize()==history);d.moveFloatingPaste(0,0);require(d.pixels()[0]==0xff0000ff&&d.pixels()[1]==0);d.cancelFloatingPaste();require(d.pixels()==before&&d.historySize()==history&&!d.dirty());require(d.pasteCopiedCels());require(d.commitFloatingPaste());require(d.historySize()==history+1&&d.dirty());d.undo();require(d.pixels()==before);d.redo();require(d.pixels()[1]==0xff0000ff);
 // Multi-frame selection paste appends a frame provisionally and cancels it.
 d.deselectPixels();d.selectTimelineCel(d.timeline().findCel(layer,first)->id,0);d.selectTimelineCel(d.timeline().findCel(layer,second)->id,1);d.commitSelection({},SelectionMask{0,0,3,2,{}});require(d.copySelectedCels());d.selectTimelineCel(d.timeline().findCel(layer,second)->id,0);const auto count=d.timeline().state().frames.size();const auto h=d.historySize();require(d.pasteCopiedCels()&&d.timeline().state().frames.size()==count+1);d.cancelFloatingPaste();require(d.timeline().state().frames.size()==count&&d.historySize()==h);
 // Selected linked destination detaches while its unselected source stays intact.
 Document linked(2,1);linked.beginStroke({0,0},0xff123456);linked.commitStroke();auto source=linked.frame().id;auto li=linked.layer().id;linked.addLinkedFrame();auto dest=linked.frame().id;linked.commitSelection({},SelectionMask{0,0,1,1,{}});linked.selectTimelineCel(linked.timeline().findCel(li,source)->id,0);require(linked.copySelectedCels());linked.selectTimelineCel(linked.timeline().findCel(li,dest)->id,0);const auto beforeLink=linked.timeline().findCel(li,dest)->linkedCelId;require(linked.pasteCopiedCels());linked.moveFloatingPaste(1,0);require(!linked.cel().linkedCelId&&linked.pixels()[1]==0xff123456);require(linked.timeline().resolveSurface(linked.timeline().findCel(li,source)->id).surface->pixels[1]==0);linked.cancelFloatingPaste();require(linked.timeline().findCel(li,dest)->linkedCelId==beforeLink);require(linked.timeline().state().frames.size()==2);
 // Clipboard bounds stay rectangular across common transforms even when the
 // primary Cel is empty and only another Cel has nonrectangular source pixels.
 Document transform(6,6);auto layerId=transform.layer().id;auto a=transform.frame().id;transform.addFrame();auto b=transform.frame().id;transform.beginStroke({1,1},0xffaabbcc);transform.commitStroke();transform.commitSelection({},SelectionMask{1,1,2,2,{1,0,0,0}});transform.selectTimelineCel(transform.timeline().findCel(layerId,a)->id,0);transform.selectTimelineCel(transform.timeline().findCel(layerId,b)->id,1);require(transform.copySelectedCels());auto snapshot=transform.exportCelClipboard();transform.selectTimelineCel(transform.timeline().findCel(layerId,a)->id,0);transform.markSaved();const auto transformHistory=transform.historySize();require(transform.pasteCelClipboard(snapshot));
 auto target=*transform.floatingTransform();target.x=2;target.y=2;target.flipHorizontal=true;transform.transformFloatingPaste(target);require(selectionContains(transform.selection(),2,2)&&selectionContains(transform.selection(),3,3));require(transform.timeline().resolveSurface(transform.timeline().findCel(layerId,b)->id).surface->pixels[2*6+3]==0xffaabbcc);require(transform.timeline().resolveSurface(transform.timeline().findCel(layerId,a)->id).surface->pixels[2*6+3]==0);
 target.flipHorizontal=false;target.width=4;target.height=4;target.x=0;target.y=0;transform.transformFloatingPaste(target);require(selectionContains(transform.selection(),3,3));require(transform.timeline().resolveSurface(transform.timeline().findCel(layerId,b)->id).surface->pixels[0]==0xffaabbcc);
 target.width=2;target.height=2;target.x=2;target.y=2;target.angle=90;transform.transformFloatingPaste(target,true);require(selectionContains(transform.selection(),2,2)&&selectionContains(transform.selection(),3,3));require(transform.historySize()==transformHistory&&!transform.dirty());transform.cancelFloatingPaste();require(transform.historySize()==transformHistory&&!transform.dirty());require(transform.timeline().resolveSurface(transform.timeline().findCel(layerId,b)->id).surface->pixels[1*6+1]==0xffaabbcc);
 require(transform.pasteCelClipboard(snapshot));transform.transformFloatingPaste(target);require(transform.commitFloatingPaste());require(transform.historySize()==transformHistory+1);transform.undo();require(transform.timeline().resolveSurface(transform.timeline().findCel(layerId,b)->id).surface->pixels[1*6+1]==0xffaabbcc);transform.redo();require(selectionContains(transform.selection(),3,3));
 // Selection-only Cel cut clears a mask across exact selected canonical sources,
 // retaining linked slots, hidden layers, other pixels, and one undo transaction.
 Document cut(3,1);cut.beginStroke({0,0},0xff112233);cut.commitStroke();cut.beginStroke({1,0},0xff445566);cut.commitStroke();auto cl=cut.layer().id;auto cf=cut.frame().id;cut.addLinkedFrame();auto alias=cut.frame().id;auto aliasId=cut.cel().id;auto link=cut.cel().linkedCelId;cut.addFrame();auto independent=cut.frame().id;cut.beginStroke({0,0},0xffabcdef);cut.commitStroke();cut.beginStroke({1,0},0xff778899);cut.commitStroke();cut.setLayerVisible(false);
 cut.commitSelection({},SelectionMask{0,0,2,1,{1,0}});cut.selectTimelineCel(cut.timeline().findCel(cl,cf)->id,0);cut.selectTimelineCel(aliasId,1);cut.selectTimelineCel(cut.timeline().findCel(cl,independent)->id,1);const auto selected=cut.timelineSelection().cels;const auto active=cut.frame().id;cut.markSaved();const auto cutHistory=cut.historySize();require(cut.cutSelectedCels());require(cut.historySize()==cutHistory+1&&cut.dirty()&&!cut.selection());require(cut.timelineSelection().cels==selected&&cut.frame().id==active);require(cut.timeline().findCelById(aliasId)->linkedCelId==link);require(cut.timeline().state().frames.size()==3);require(cut.timeline().resolveSurface(aliasId).surface->pixels[0]==0&&cut.timeline().resolveSurface(aliasId).surface->pixels[1]==0xff445566);require(cut.pixels()[0]==0&&cut.pixels()[1]==0xff778899);const auto cutClipboard=cut.exportCelClipboard();require(cutClipboard.items.size()==3&&cutClipboard.items[0].selectionPixels->pixels[0]==0xff112233);
 cut.undo();require(cut.selection()&&cut.selection()->mask==std::vector<unsigned char>({1,0}));require(cut.timelineSelection().cels==selected&&cut.frame().id==active);require(cut.timeline().resolveSurface(aliasId).surface->pixels[0]==0xff112233&&cut.pixels()[0]==0xffabcdef);cut.redo();require(!cut.selection()&&cut.pixels()[0]==0&&cut.timeline().findCelById(aliasId)->linkedCelId==link);
 // Empty cuts copy but preserve the pixel selection and add no content history.
 cut.commitSelection({},SelectionMask{2,0,1,1,{}});const auto emptyHistory=cut.historySize();require(cut.cutSelectedCels());require(cut.selection()&&cut.historySize()==emptyHistory);const auto emptyClipboard=cut.exportCelClipboard();require(emptyClipboard.items[0].selectionPixels->width==1);
 // Locked preflight leaves both the pixels and the previous clipboard intact.
 cut.setLayerLocked(true);cut.commitSelection(cut.selection(),SelectionMask{1,0,1,1,{}});const auto lockedHistory=cut.historySize();bool rejected=false;try{cut.cutSelectedCels();}catch(const std::runtime_error&){rejected=true;}require(rejected&&cut.historySize()==lockedHistory&&cut.pixels()[1]==0xff778899);require(cut.exportCelClipboard().items[0].selectionPixels->originX==emptyClipboard.items[0].selectionPixels->originX);
 // Explicit Cel selection moves only exact pairs, including multiple layers;
 // unselected neighbors remain unchanged, linked canonical sources move once.
 Document move(3,1);const auto ml=move.layer().id;const auto mf=move.frame().id;move.beginStroke({0,0},0xff111111);move.commitStroke();move.addLinkedFrame();const auto ma=move.frame().id;move.addFrame();const auto mt=move.frame().id;move.beginStroke({0,0},0xff222222);move.commitStroke();move.addLayer();const auto nl=move.layer().id;move.beginStroke({0,0},0xff333333);move.commitStroke();move.selectFrame(mf);move.beginStroke({0,0},0xff444444);move.commitStroke();
 const auto sourceId=move.timeline().findCel(ml,mf)->id;const auto aliasId2=move.timeline().findCel(ml,ma)->id;const auto exactId=move.timeline().findCel(nl,mt)->id;const auto neighborId=move.timeline().findCel(nl,mf)->id;const auto otherId=move.timeline().findCel(ml,mt)->id;
 move.selectTimelineCel(sourceId,0);move.selectTimelineCel(aliasId2,1);move.selectTimelineCel(exactId,1);move.commitSelection({},SelectionMask{0,0,2,1,{1,0}});const auto moveSelected=move.timelineSelection().cels;move.markSaved();const auto mh=move.historySize();require(move.nudgeSelectionContent(1,0));require(move.floating()&&move.historySize()==mh&&!move.dirty());require(move.pixels()[0]==0&&move.pixels()[1]==0xff333333);require(move.timeline().resolveSurface(sourceId).surface->pixels[0]==0&&move.timeline().resolveSurface(sourceId).surface->pixels[1]==0xff111111);require(move.timeline().resolveSurface(neighborId).surface->pixels[0]==0xff444444&&move.timeline().resolveSurface(otherId).surface->pixels[0]==0xff222222);move.cancelFloatingPaste();require(move.pixels()[0]==0xff333333&&move.pixels()[1]==0&&move.historySize()==mh&&!move.dirty());require(move.timelineSelection().cels==moveSelected&&move.selection()->x==0);
 require(move.nudgeSelectionContent(1,0));require(move.commitFloatingPaste()&&move.historySize()==mh+1);move.undo();require(move.pixels()[0]==0xff333333&&move.selection()->x==0&&move.timelineSelection().cels==moveSelected);require(move.timeline().resolveSurface(sourceId).surface->pixels[0]==0xff111111);move.redo();require(move.pixels()[1]==0xff333333&&move.selection()->x==1);move.undo();
 // Copy mode retains the originals across the same exact targets.
 require(move.beginSelectionContentMove(true));move.moveFloatingPaste(1,0);require(move.pixels()[0]==0xff333333&&move.pixels()[1]==0xff333333);require(move.timeline().resolveSurface(sourceId).surface->pixels[0]==0xff111111&&move.timeline().resolveSurface(sourceId).surface->pixels[1]==0xff111111);move.cancelFloatingPaste();require(move.pixels()[1]==0&&move.timeline().resolveSurface(sourceId).surface->pixels[1]==0);
 // Hidden or locked nonactive selected layers reject all targets before preview.
 move.selectLayer(ml);move.setLayerVisible(false);move.selectLayer(nl);const auto blockedHistory=move.historySize();require(!move.beginSelectionContentMove(false)&&!move.floating()&&move.historySize()==blockedHistory);require(move.pixels()[0]==0xff333333&&move.timeline().resolveSurface(sourceId).surface->pixels[0]==0xff111111);move.selectLayer(ml);move.setLayerVisible(true);move.setLayerLocked(true);move.selectLayer(nl);require(!move.beginSelectionContentMove(true)&&!move.floating());
 // Delete selected pixels across exact Cel targets, preserving slots/links.
 Document erase(3,1);auto el=erase.layer().id;auto ef=erase.frame().id;erase.beginStroke({0,0},0xff111111);erase.commitStroke();erase.beginStroke({1,0},0xff222222);erase.commitStroke();erase.addLinkedFrame();auto ea=erase.frame().id;auto eaId=erase.cel().id;auto eaLink=erase.cel().linkedCelId;erase.addFrame();auto eb=erase.frame().id;erase.beginStroke({0,0},0xff333333);erase.commitStroke();erase.addLayer();auto ll=erase.layer().id;erase.beginStroke({0,0},0xff444444);erase.commitStroke();erase.setLayerLocked(true);auto lockedId=erase.cel().id;erase.selectLayer(el);erase.setLayerVisible(false);erase.selectTimelineCel(erase.timeline().findCel(el,ef)->id,0);erase.selectTimelineCel(eaId,1);erase.selectTimelineCel(lockedId,1);erase.commitSelection({},SelectionMask{0,0,2,1,{1,0}});auto eraseSelection=erase.timelineSelection().cels;auto eraseActive=erase.cel().id;erase.markSaved();auto eh=erase.historySize();require(erase.deleteSelectedPixels());require(erase.historySize()==eh+1&&!erase.selection()&&erase.cel().id==eraseActive&&erase.timelineSelection().cels==eraseSelection);require(erase.timeline().resolveSurface(eaId).surface->pixels[0]==0&&erase.timeline().resolveSurface(eaId).surface->pixels[1]==0xff222222&&erase.timeline().findCelById(eaId)->linkedCelId==eaLink);require(erase.pixels()[0]==0xff444444&&erase.timeline().resolveSurface(erase.timeline().findCel(el,eb)->id).surface->pixels[0]==0xff333333);erase.undo();require(erase.selection()&&erase.selection()->mask==std::vector<unsigned char>({1,0})&&erase.timeline().resolveSurface(eaId).surface->pixels[0]==0xff111111);erase.redo();require(!erase.selection()&&erase.timeline().resolveSurface(eaId).surface->pixels[0]==0);erase.commitSelection({},SelectionMask{2,0,1,1,{}});auto emptyDeleteHistory=erase.historySize();require(!erase.deleteSelectedPixels()&&erase.selection()&&erase.historySize()==emptyDeleteHistory);
 // Explicit layers expand across selected frames; implicit frames use editable
 // visible layers. Plain active-layer delete also permits hidden RGBA layers.
 Document layerErase(2,1);auto left=layerErase.layer().id;auto frame0=layerErase.frame().id;layerErase.beginStroke({0,0},0xff123456);layerErase.commitStroke();layerErase.addLayer();auto right=layerErase.layer().id;layerErase.beginStroke({0,0},0xffabcdef);layerErase.commitStroke();layerErase.selectTimelineLayer(left,0);layerErase.selectTimelineLayer(right,1);layerErase.commitSelection({},SelectionMask{0,0,1,1,{}});auto lh=layerErase.historySize();require(layerErase.deleteSelectedPixels()&&layerErase.historySize()==lh+1);require(layerErase.timeline().resolveSurface(layerErase.timeline().findCel(left,frame0)->id).surface->pixels[0]==0&&layerErase.pixels()[0]==0);layerErase.undo();layerErase.clearTimelineSelection();layerErase.setLayerVisible(false);require(layerErase.deleteSelectedPixels()&&layerErase.pixels()[0]==0);layerErase.undo();layerErase.selectFrameHeader(frame0);require(layerErase.deleteSelectedPixels());require(layerErase.pixels()[0]==0xffabcdef&&layerErase.timeline().resolveSurface(layerErase.timeline().findCel(left,frame0)->id).surface->pixels[0]==0);
 // Clipboard-origin floating Delete cancels rather than clearing destinations.
 Document pendingDelete(2,1);pendingDelete.beginStroke({0,0},0xff123456);pendingDelete.commitStroke();pendingDelete.commitSelection({},SelectionMask{0,0,1,1,{}});auto pendingClipboard=pendingDelete.copyPixels();auto pendingHistory=pendingDelete.historySize();require(pendingDelete.beginFloatingPaste(*pendingClipboard,1,0));require(pendingDelete.deleteSelectedPixels()&&!pendingDelete.floating()&&pendingDelete.pixels()[0]==0xff123456&&pendingDelete.pixels()[1]==0&&pendingDelete.historySize()==pendingHistory);
 // Command fill replaces exact packed RGBA, including alpha=0 hidden RGB,
 // rather than compositing; preserves mask, targets and a single transaction.
 Document filled(3,1);auto fl=filled.layer().id;auto ff=filled.frame().id;filled.beginStroke({0,0},0xff112233);filled.commitStroke();filled.addLinkedFrame();auto fa=filled.cel().id;filled.addFrame();auto untouched=filled.cel().id;filled.beginStroke({0,0},0xffaabbcc);filled.commitStroke();filled.selectTimelineCel(filled.timeline().findCel(fl,ff)->id,0);filled.selectTimelineCel(fa,1);filled.commitSelection({},SelectionMask{0,0,2,1,{1,0}});auto fillMask=filled.selection();auto fillSelected=filled.timelineSelection().cels;auto fh=filled.historySize();require(filled.fillSelectionOrCanvas(0x00123456)&&filled.historySize()==fh+1);require(filled.pixels()[0]==0x00123456&&filled.pixels()[1]==0&&selectionEqual(fillMask,filled.selection())&&filled.timelineSelection().cels==fillSelected);require(filled.timeline().resolveSurface(untouched).surface->pixels[0]==0xffaabbcc&&filled.timeline().findCelById(fa)->linkedCelId);filled.undo();require(filled.pixels()[0]==0xff112233&&selectionEqual(fillMask,filled.selection()));filled.redo();require(filled.pixels()[0]==0x00123456);auto noFillHistory=filled.historySize();require(!filled.fillSelectionOrCanvas(0x00123456)&&filled.historySize()==noFillHistory);
 // Any explicitly selected hidden/locked layer prevents all fill targets.
 filled.addLayer();auto blockedLayer=filled.layer().id;auto blockedCel=filled.cel().id;filled.selectTimelineCel(fa,0);filled.selectTimelineCel(blockedCel,1);filled.setLayerVisible(false);auto blockedFillHistory=filled.historySize();require(!filled.fillSelectionOrCanvas(0xff999999)&&filled.historySize()==blockedFillHistory&&filled.timeline().resolveSurface(fa).surface->pixels[0]==0x00123456);filled.setLayerVisible(true);filled.setLayerLocked(true);require(!filled.fillSelectionOrCanvas(0xff999999));
 // Dense selection uses the legacy 512-square threshold while retaining holes.
 Document largeFill(512,512);SelectionMask denseMask{0,0,512,512,std::vector<unsigned char>(512*512,1)};denseMask.mask[1]=0;largeFill.commitSelection({},denseMask);auto denseHistory=largeFill.historySize();require(largeFill.fillSelectionOrCanvas(0x80445566)&&largeFill.historySize()==denseHistory+1);require(largeFill.pixels()[0]==0x80445566&&largeFill.pixels()[1]==0&&largeFill.pixels().back()==0x80445566);largeFill.undo();require(largeFill.pixels()[0]==0&&largeFill.pixels().back()==0&&largeFill.selection()->mask[1]==0);largeFill.redo();require(largeFill.pixels()[0]==0x80445566&&largeFill.pixels()[1]==0);
 // No selection fills the full canvas; pending content is committed first.
 Document fullFill(2,1);require(fullFill.fillSelectionOrCanvas(0xffabcdef)&&fullFill.pixels()[0]==0xffabcdef&&fullFill.pixels()[1]==0xffabcdef&&!fullFill.selection());fullFill.commitSelection({},SelectionMask{0,0,1,1,{}});require(fullFill.nudgeSelectionContent(1,0));auto beforeFillCommit=fullFill.historySize();require(fullFill.fillSelectionOrCanvas(0xff123456)&&!fullFill.floating()&&fullFill.historySize()==beforeFillCommit+2&&fullFill.pixels()[0]==0&&fullFill.pixels()[1]==0xff123456&&fullFill.selection()->x==1);fullFill.undo();require(fullFill.pixels()[1]==0xffabcdef&&fullFill.selection()->x==1);fullFill.undo();require(fullFill.pixels()[0]==0xffabcdef&&fullFill.selection()->x==0);
 // Merged copy samples the visible normal stack including opacity and linked
 // surfaces, without requiring selection or modifying document history.
 Document merged(3,1);merged.fillSelectionOrCanvas(0xffff0000);auto baseLayer=merged.layer().id;merged.addLayer();merged.fillSelectionOrCanvas(0xff0000ff);merged.setLayerOpacity(.5);auto topLayer=merged.layer().id;merged.addLayer();merged.fillSelectionOrCanvas(0xff00ff00);merged.setLayerVisible(false);merged.markSaved();auto mergedHistory=merged.historySize();auto mergedRevision=merged.revision();auto allMerged=merged.copyMergedPixels();require(allMerged&&allMerged->width==3&&allMerged->height==1&&allMerged->originX==0&&allMerged->originY==0);require(allMerged->pixels[0]==0xff800080&&allMerged->mask==std::vector<unsigned char>({1,1,1}));require(merged.historySize()==mergedHistory&&merged.revision()==mergedRevision&&!merged.dirty()&&!merged.selection());
 merged.commitSelection({},SelectionMask{1,0,2,1,{0,1}});auto mergedMask=merged.selection();require(merged.copySelectedFrames()&&merged.hasFrameClipboard());auto maskedMerged=merged.copyMergedPixels();require(maskedMerged&&maskedMerged->originX==1&&maskedMerged->width==2&&maskedMerged->pixels[0]==0&&maskedMerged->mask[0]==0&&maskedMerged->pixels[1]==0xff800080);require(!merged.hasFrameClipboard()&&selectionEqual(mergedMask,merged.selection()));
 // Fully transparent output is empty; transparent hidden RGB is not copied.
 Document blankMerged(2,1);blankMerged.fillSelectionOrCanvas(0x00123456);require(!blankMerged.copyMergedPixels());
 // Clipboard-origin floating preview commits first, then merged copy captures
 // its final position and only that commit changes history/dirty state.
 Document mergePending(3,1);mergePending.beginStroke({0,0},0xff123456);mergePending.commitStroke();mergePending.commitSelection({},SelectionMask{0,0,1,1,{}});auto mergeSource=mergePending.copyPixels();require(mergePending.beginFloatingPaste(*mergeSource,2,0));const auto pendingMergeHistory=mergePending.historySize();auto committedMerged=mergePending.copyMergedPixels();require(committedMerged&&!mergePending.floating()&&committedMerged->originX==2&&committedMerged->pixels[0]==0xff123456&&mergePending.historySize()==pendingMergeHistory+1);mergePending.undo();require(mergePending.pixels()[2]==0&&mergePending.selection()->x==0);
 // Legacy 8x8 active content centering fixture and selection axis variants.
 Document center(8,8);for(auto p:std::vector<Point>{{0,0},{1,0},{0,1},{1,1}}){center.beginStroke(p,0xff123456);center.commitStroke();}auto centerHistory=center.historySize();require(center.centerActiveContent()&&center.historySize()==centerHistory+1&&!center.selection());require(center.pixels()[3*8+3]==0xff123456&&center.pixels()[4*8+4]==0xff123456&&center.pixels()[0]==0);center.undo();require(center.pixels()[0]==0xff123456&&center.pixels()[27]==0);center.commitSelection({},SelectionMask{0,0,2,2,{1,0,0,1}});require(center.centerActiveContent(true,false)&&center.selection()->x==3&&center.selection()->y==0&&center.pixels()[3]==0xff123456&&center.pixels()[12]==0xff123456&&center.pixels()[1]==0xff123456);center.undo();require(center.selection()->x==0&&center.selection()->mask==std::vector<unsigned char>({1,0,0,1}));require(center.centerActiveContent(false,true)&&center.selection()->x==0&&center.selection()->y==3);center.undo();
 // Negative half-delta rounds toward positive infinity and active layer only.
 Document negativeCenter(8,1);negativeCenter.beginStroke({7,0},0xffabcdef);negativeCenter.commitStroke();require(negativeCenter.centerActiveContent(true,false)&&negativeCenter.pixels()[4]==0xffabcdef);negativeCenter.undo();negativeCenter.addLayer();negativeCenter.beginStroke({0,0},0xff123456);negativeCenter.commitStroke();auto activeCenterLayer=negativeCenter.layer().id;auto passiveCenterLayer=negativeCenter.timeline().state().layers.back().id;negativeCenter.selectTimelineLayer(passiveCenterLayer,0);negativeCenter.selectTimelineLayer(activeCenterLayer,1);negativeCenter.setLayerVisible(false);require(negativeCenter.centerActiveContent(true,false)&&negativeCenter.pixels()[4]==0xff123456);require(negativeCenter.timeline().resolveSurface(negativeCenter.timeline().findCel(passiveCenterLayer,negativeCenter.frame().id)->id).surface->pixels[7]==0xffabcdef);negativeCenter.undo();negativeCenter.setLayerLocked(true);auto lockedCenterHistory=negativeCenter.historySize();require(!negativeCenter.centerActiveContent()&&negativeCenter.historySize()==lockedCenterHistory);
 // Pending clipboard stays floating and is cancellable with unchanged history.
 Document pendingCenter(8,8);pendingCenter.beginStroke({0,0},0xff123456);pendingCenter.commitStroke();pendingCenter.commitSelection({},SelectionMask{0,0,2,2,{}});auto centerClipboard=pendingCenter.copyPixels();auto pendingCenterHistory=pendingCenter.historySize();require(pendingCenter.beginFloatingPaste(*centerClipboard,0,0));require(pendingCenter.centerActiveContent()&&pendingCenter.floating()&&pendingCenter.selection()->x==3&&pendingCenter.selection()->y==3&&pendingCenter.pixels()[27]==0xff123456&&pendingCenter.historySize()==pendingCenterHistory);pendingCenter.cancelFloatingPaste();require(pendingCenter.pixels()[27]==0&&pendingCenter.selection()->x==0&&pendingCenter.historySize()==pendingCenterHistory);
 // Rotate 180 uses one union content rectangle across selected owning layers
 // at active frame, and creates a selection when none previously existed.
 Document rotation(4,2);rotation.beginStroke({0,0},0xff111111);rotation.commitStroke();auto lower=rotation.layer().id;rotation.addLayer();rotation.beginStroke({3,1},0xff222222);rotation.commitStroke();auto upper=rotation.layer().id;rotation.selectTimelineLayer(lower,0);rotation.selectTimelineLayer(upper,1);auto rh=rotation.historySize();require(rotation.rotateContent180()&&rotation.historySize()==rh+1&&rotation.selection()->width==4&&rotation.selection()->height==2);require(rotation.pixels()[0]==0xff222222&&rotation.pixels()[7]==0);require(rotation.timeline().resolveSurface(rotation.timeline().findCel(lower,rotation.frame().id)->id).surface->pixels[7]==0xff111111);rotation.undo();require(!rotation.selection()&&rotation.pixels()[7]==0xff222222);rotation.redo();require(rotation.pixels()[0]==0xff222222&&rotation.selection());rotation.undo();
 // Irregular mask flips, destination outside original mask composites, original
 // selected transparent pixels clear; undo restores the exact selection mask.
 Document maskRotate(3,1);maskRotate.beginStroke({0,0},0x80123456);maskRotate.commitStroke();maskRotate.beginStroke({2,0},0xffabcdef);maskRotate.commitStroke();maskRotate.commitSelection({},SelectionMask{0,0,3,1,{1,0,0}});auto beforeRotate=maskRotate.pixels();require(maskRotate.rotateContent180()&&maskRotate.pixels()[0]==0&&maskRotate.selection()->mask==std::vector<unsigned char>({0,0,1}));require(maskRotate.pixels()[2]!=0xffabcdef&&maskRotate.pixels()[2]!=0x80123456);maskRotate.undo();require(maskRotate.pixels()==beforeRotate&&maskRotate.selection()->mask==std::vector<unsigned char>({1,0,0}));
 // Explicit Cel keys determine owning layers, but rotation stays in active frame.
 Document frameRotate(3,1);auto rotateLayer=frameRotate.layer().id;auto rotateFirst=frameRotate.frame().id;frameRotate.beginStroke({0,0},0xff112233);frameRotate.commitStroke();frameRotate.addFrame();auto rotateSecond=frameRotate.frame().id;frameRotate.beginStroke({2,0},0xff445566);frameRotate.commitStroke();frameRotate.selectTimelineCel(frameRotate.timeline().findCel(rotateLayer,rotateFirst)->id,0);frameRotate.selectTimelineCel(frameRotate.timeline().findCel(rotateLayer,rotateSecond)->id,1);frameRotate.commitSelection({},SelectionMask{0,0,3,1,{}});require(frameRotate.rotateContent180());require(frameRotate.pixels()[0]==0xff445566&&frameRotate.timeline().resolveSurface(frameRotate.timeline().findCel(rotateLayer,rotateFirst)->id).surface->pixels[0]==0xff112233);frameRotate.undo();frameRotate.setLayerVisible(false);auto brh=frameRotate.historySize();require(!frameRotate.rotateContent180()&&frameRotate.historySize()==brh);frameRotate.setLayerVisible(true);frameRotate.setLayerLocked(true);require(!frameRotate.rotateContent180());
 // 90-degree command keeps document size, clips destination pixels but retains
 // selection geometry outside the canvas (legacy clipToCanvas=false).
 Document turn(6,4);turn.beginStroke({1,1},0xff111111);turn.commitStroke();turn.beginStroke({4,2},0xff222222);turn.commitStroke();turn.commitSelection({},SelectionMask{1,1,4,2,{}});auto th=turn.historySize();auto beforeTurn=turn.pixels();require(turn.rotateContent(90)&&turn.historySize()==th+1&&turn.width()==6&&turn.height()==4);require(turn.pixels()[0*6+3]==0xff111111&&turn.pixels()[3*6+2]==0xff222222);require(turn.selection()->x==2&&turn.selection()->y==0&&turn.selection()->width==2&&turn.selection()->height==4);turn.undo();require(turn.pixels()==beforeTurn&&turn.selection()->x==1&&turn.selection()->width==4);turn.redo();require(turn.pixels()[3]==0xff111111);turn.undo();require(turn.rotateContent(-90));require(turn.pixels()[3*6+2]==0xff111111&&turn.pixels()[3]==0xff222222);
 Document clippedTurn(6,2);clippedTurn.beginStroke({0,0},0xff123456);clippedTurn.commitStroke();clippedTurn.beginStroke({2,0},0xffabcdef);clippedTurn.commitStroke();clippedTurn.commitSelection({},SelectionMask{0,0,6,2,{}});require(clippedTurn.rotateContent(90)&&clippedTurn.width()==6&&clippedTurn.height()==2);require(clippedTurn.selection()->x==2&&clippedTurn.selection()->y==-2&&clippedTurn.selection()->width==2&&clippedTurn.selection()->height==6);require(clippedTurn.pixels()[3]==0xffabcdef);require(std::count(clippedTurn.pixels().begin(),clippedTurn.pixels().end(),Pixel(0xff123456))==0);clippedTurn.undo();require(clippedTurn.pixels()[0]==0xff123456);
 // Odd-by-even source exercises half-pixel pivot and masked geometry. Alpha0
 // source is cleared but never materialized as opaque destination payload.
 Document parityTurn(5,4);parityTurn.fillSelectionOrCanvas(0x00112233);parityTurn.beginStroke({1,1},0x80123456);parityTurn.commitStroke();parityTurn.commitSelection({},SelectionMask{1,1,3,2,{1,0,0,0,0,1}});auto parityPixels=parityTurn.pixels();auto parityMask=parityTurn.selection();auto parityHistory=parityTurn.historySize();require(parityTurn.rotateContent(90)&&parityTurn.historySize()==parityHistory+1);require(parityTurn.selection()&&parityTurn.selection()->width<=3&&parityTurn.selection()->height<=4);require(std::count(parityTurn.pixels().begin(),parityTurn.pixels().end(),Pixel(0x80123456))>=1);parityTurn.undo();require(parityTurn.pixels()==parityPixels&&selectionEqual(parityTurn.selection(),parityMask));parityTurn.redo();require(parityTurn.historySize()==parityHistory+1);
 // Whole mirror exchanges exact RGBA including alpha0 RGB, and selection
 // mirror reflects mask, preserves unselected pixels, and restores via undo.
 Document mirrored(3,2);mirrored.fillSelectionOrCanvas(0x00123456);mirrored.beginStroke({0,0},0xff112233);mirrored.commitStroke();auto mirrorPixels=mirrored.pixels();auto mirrorHistory=mirrored.historySize();require(mirrored.flipContent(true)&&mirrored.pixels()[2]==0xff112233&&mirrored.pixels()[0]==0x00123456&&mirrored.historySize()==mirrorHistory+1&&!mirrored.selection());mirrored.undo();require(mirrored.pixels()==mirrorPixels);mirrored.commitSelection({},SelectionMask{0,0,3,2,{1,0,0,0,0,0}});require(mirrored.flipContent(false)&&mirrored.pixels()[3]==0xff112233&&mirrored.selection()->mask==std::vector<unsigned char>({0,0,0,1,0,0}));mirrored.undo();require(mirrored.pixels()==mirrorPixels&&mirrored.selection()->mask[0]==1);
 // Explicit layers whole mirror every frame; exact linked Cel targets mirror
 // shared pixels once and keep links. Hidden timeline layers are skipped.
 Document allFramesFlip(3,1);allFramesFlip.beginStroke({0,0},0xff123456);allFramesFlip.commitStroke();auto aflayer=allFramesFlip.layer().id;auto affirst=allFramesFlip.frame().id;allFramesFlip.addFrame();allFramesFlip.beginStroke({0,0},0xffabcdef);allFramesFlip.commitStroke();allFramesFlip.selectTimelineLayer(aflayer,0);require(allFramesFlip.flipContent(true)&&allFramesFlip.pixels()[2]==0xffabcdef&&allFramesFlip.timeline().resolveSurface(allFramesFlip.timeline().findCel(aflayer,affirst)->id).surface->pixels[2]==0xff123456);allFramesFlip.undo();allFramesFlip.setLayerVisible(false);auto skipped=allFramesFlip.historySize();require(!allFramesFlip.flipContent(true)&&allFramesFlip.historySize()==skipped);allFramesFlip.clearTimelineSelection();require(allFramesFlip.flipContent(true)&&allFramesFlip.pixels()[2]==0xffabcdef);
 Document linkedFlip(3,1);linkedFlip.beginStroke({0,0},0xff123456);linkedFlip.commitStroke();auto lfsource=linkedFlip.cel().id;linkedFlip.addLinkedFrame();auto lfalias=linkedFlip.cel().id;linkedFlip.selectTimelineCel(lfsource,0);linkedFlip.selectTimelineCel(lfalias,1);require(linkedFlip.flipContent(true)&&linkedFlip.pixels()[2]==0xff123456&&linkedFlip.cel().linkedCelId);linkedFlip.undo();require(linkedFlip.pixels()[0]==0xff123456);
 // Pending source flip rebuilds existing rotated preview without committing,
 // retaining original removal mask; cancel and one final commit remain exact.
 Document pendingFlip(5,3);pendingFlip.beginStroke({0,0},0xff123456);pendingFlip.commitStroke();pendingFlip.beginStroke({1,0},0xffabcdef);pendingFlip.commitStroke();pendingFlip.commitSelection({},SelectionMask{0,0,3,1,{1,0,0}});auto pfBefore=pendingFlip.pixels();auto pfh=pendingFlip.historySize();require(pendingFlip.beginSelectionContentMove(false));pendingFlip.moveFloatingPaste(1,1);require(pendingFlip.flipContent(true)&&pendingFlip.floating()&&pendingFlip.historySize()==pfh);require(pendingFlip.pixels()[0]==0&&pendingFlip.pixels()[1]==0xffabcdef&&pendingFlip.pixels()[8]==0xff123456);pendingFlip.cancelFloatingPaste();require(pendingFlip.pixels()==pfBefore&&pendingFlip.selection()->mask[0]==1&&pendingFlip.historySize()==pfh);require(pendingFlip.beginSelectionContentMove(false));pendingFlip.moveFloatingPaste(1,1);pendingFlip.flipContent(true);require(pendingFlip.commitFloatingPaste()&&pendingFlip.historySize()==pfh+1);pendingFlip.undo();require(pendingFlip.pixels()==pfBefore);pendingFlip.redo();require(pendingFlip.pixels()[8]==0xff123456);
 // CtrlT computes one current-frame visible content union for selected layers,
 // then ordinary selection movement captures all those layers, not neighbors.
 Document groupTransform(6,3);groupTransform.beginStroke({0,0},0xff111111);groupTransform.commitStroke();auto gtLower=groupTransform.layer().id;groupTransform.addLayer();groupTransform.beginStroke({3,1},0xff222222);groupTransform.commitStroke();auto gtUpper=groupTransform.layer().id;groupTransform.addLayer();groupTransform.beginStroke({5,2},0xff333333);groupTransform.commitStroke();auto gtNeighbor=groupTransform.layer().id;groupTransform.selectTimelineLayer(gtLower,0);groupTransform.selectTimelineLayer(gtUpper,1);groupTransform.markSaved();auto gth=groupTransform.historySize();auto gtr=groupTransform.revision();require(groupTransform.beginLayerTransform());require(groupTransform.selection()->x==0&&groupTransform.selection()->y==0&&groupTransform.selection()->width==4&&groupTransform.selection()->height==2);require(groupTransform.historySize()==gth&&groupTransform.revision()==gtr&&!groupTransform.dirty()&&!groupTransform.floating());auto gtSelection=groupTransform.timelineSelection().layers;require(groupTransform.nudgeSelectionContent(1,0));require(groupTransform.pixels()[1*6+4]==0xff222222&&groupTransform.timeline().resolveSurface(groupTransform.timeline().findCel(gtLower,groupTransform.frame().id)->id).surface->pixels[1]==0xff111111);require(groupTransform.timeline().resolveSurface(groupTransform.timeline().findCel(gtNeighbor,groupTransform.frame().id)->id).surface->pixels[17]==0xff333333);groupTransform.cancelFloatingPaste();require(groupTransform.pixels()[9]==0xff222222&&groupTransform.historySize()==gth&&groupTransform.timelineSelection().layers==gtSelection);require(groupTransform.nudgeSelectionContent(1,0));require(groupTransform.commitFloatingPaste()&&groupTransform.historySize()==gth+1);groupTransform.undo();require(groupTransform.pixels()[9]==0xff222222&&groupTransform.selection()->x==0&&groupTransform.timelineSelection().layers==gtSelection);groupTransform.redo();require(groupTransform.pixels()[10]==0xff222222);groupTransform.undo();
 // A nonactive selected hidden/locked layer blocks both start and preview,
 // preserving the pre-existing selection and document/history.
 groupTransform.selectLayer(gtLower);groupTransform.setLayerVisible(false);groupTransform.selectLayer(gtUpper);auto gtMask=groupTransform.selection();auto blockedGth=groupTransform.historySize();require(!groupTransform.beginLayerTransform()&&!groupTransform.beginSelectionContentMove(false)&&selectionEqual(gtMask,groupTransform.selection())&&groupTransform.historySize()==blockedGth);groupTransform.selectLayer(gtLower);groupTransform.setLayerVisible(true);groupTransform.setLayerLocked(true);groupTransform.selectLayer(gtUpper);require(!groupTransform.beginLayerTransform()&&!groupTransform.beginSelectionContentMove(true));
 // CtrlT commits pending first, and never creates an extra selection history.
 Document pendingTransform(4,1);pendingTransform.beginStroke({0,0},0xff123456);pendingTransform.commitStroke();pendingTransform.commitSelection({},SelectionMask{0,0,1,1,{}});require(pendingTransform.nudgeSelectionContent(2,0));auto pth=pendingTransform.historySize();require(pendingTransform.beginLayerTransform()&&!pendingTransform.floating()&&pendingTransform.historySize()==pth+1&&pendingTransform.selection()->x==2&&pendingTransform.selection()->width==1);
 // Legacy menu and CtrlD finalize pending paste without a second deselect edit.
 Document deselectPending(4,1);deselectPending.beginStroke({0,0},0xff123456);deselectPending.commitStroke();deselectPending.commitSelection({},SelectionMask{0,0,1,1,{}});auto dpBefore=deselectPending.pixels();auto dph=deselectPending.historySize();require(deselectPending.nudgeSelectionContent(2,0));deselectPending.deselectPixels();require(!deselectPending.floating()&&deselectPending.pixels()[2]==0xff123456&&deselectPending.selection()&&deselectPending.selection()->x==2&&deselectPending.historySize()==dph+1);deselectPending.undo();require(deselectPending.pixels()==dpBefore&&deselectPending.selection()&&deselectPending.selection()->x==0);deselectPending.redo();require(deselectPending.selection()&&deselectPending.selection()->x==2&&deselectPending.pixels()[2]==0xff123456);deselectPending.deselectPixels();require(!deselectPending.selection());deselectPending.undo();require(deselectPending.selection()&&deselectPending.selection()->x==2);
 // A pending no-op move still finalizes without clearing the source selection.
 Document deselectNoop(2,1);deselectNoop.beginStroke({0,0},0xffabcdef);deselectNoop.commitStroke();deselectNoop.commitSelection({},SelectionMask{0,0,1,1,{}});auto dnh=deselectNoop.historySize();require(deselectNoop.beginSelectionContentMove(false));deselectNoop.deselectPixels();require(!deselectNoop.floating()&&deselectNoop.selection()&&deselectNoop.selection()->x==0&&deselectNoop.historySize()==dnh);
 // Legacy setSelection(full canvas) is state only: no history/revision/dirty,
 // while an existing pending content move commits its ordinary pixel history.
 Document allPixels(4,2);allPixels.beginStroke({0,0},0xff123456);allPixels.commitStroke();allPixels.markSaved();allPixels.commitSelection({},SelectionMask{0,0,1,1,{}});allPixels.selectFrameHeader(allPixels.frame().id);auto aph=allPixels.historySize();auto apr=allPixels.revision();auto apf=allPixels.selectedFrames();allPixels.selectAllPixels();require(allPixels.selection()&&allPixels.selection()->width==4&&allPixels.selection()->height==2&&allPixels.selection()->mask.empty()&&allPixels.historySize()==aph&&allPixels.revision()==apr&&!allPixels.dirty()&&allPixels.selectedFrames()==apf);allPixels.previewSelection(SelectionMask{0,0,1,1,{}});require(allPixels.nudgeSelectionContent(2,0));allPixels.selectAllPixels();require(!allPixels.floating()&&allPixels.selection()->width==4&&allPixels.pixels()[2]==0xff123456&&allPixels.historySize()==aph+1);allPixels.undo();require(allPixels.pixels()[0]==0xff123456&&allPixels.pixels()[2]==0);allPixels.redo();require(allPixels.pixels()[2]==0xff123456);
 // Successful pixel copy replaces timeline clipboards; failures preserve them.
 Document copyPriority(4,1);copyPriority.beginStroke({0,0},0xff123456);copyPriority.commitStroke();copyPriority.selectTimelineCel(copyPriority.cel().id);require(copyPriority.copySelectedCels());copyPriority.selectFrameHeader(copyPriority.frame().id);require(copyPriority.copySelectedFrames());copyPriority.commitSelection({},SelectionMask{1,0,1,1,{}});require(!copyPriority.copyPixels()&&copyPriority.hasFrameClipboard());copyPriority.clearTimelineSelection();copyPriority.selectTimelineCel(copyPriority.cel().id);require(copyPriority.copySelectedCels());copyPriority.previewSelection(SelectionMask{1,0,1,1,{}});require(!copyPriority.copyPixels()&&copyPriority.hasCelClipboard());copyPriority.previewSelection(SelectionMask{0,0,1,1,{}});auto cph=copyPriority.historySize();auto copiedPriority=copyPriority.copyPixels();require(copiedPriority&&!copyPriority.hasCelClipboard()&&!copyPriority.hasFrameClipboard()&&copyPriority.historySize()==cph);copyPriority.selectTimelineCel(copyPriority.cel().id);require(copyPriority.copySelectedCels());copyPriority.selectFrameHeader(copyPriority.frame().id);require(copyPriority.copySelectedFrames());copyPriority.previewSelection(SelectionMask{0,0,1,1,{}});require(copyPriority.nudgeSelectionContent(2,0));auto cpPendingHistory=copyPriority.historySize();copiedPriority=copyPriority.copyPixels();require(copiedPriority&&copiedPriority->originX==2&&copyPriority.floating()&&copyPriority.historySize()==cpPendingHistory&&!copyPriority.hasCelClipboard()&&!copyPriority.hasFrameClipboard());copyPriority.cancelFloatingPaste();require(copyPriority.pixels()[0]==0xff123456);
 // Exact parameters/pixels from legacy adjustments.test.ts color-balance case;
 // expected packed output captured from the actual legacy TS algorithm via Node.
 ColorAdjustment balance;balance.kind=ColorAdjustmentKind::ColorBalance;balance.balance[1][0]=20;balance.balance[1][1]=-15;balance.balance[2][2]=10;ColorAdjustmentSampler balanceSampler(balance);std::vector<Pixel> balanceInput{0xff1e140a,0xb4463c32,0x006e645a,0xff8c8278,0xdcb4aaa0,0xffdcd2c8},balanceExpected{4280226320u,3024762436u,7234650u,4288050591u,3703546299u,4293447126u};for(std::size_t i=0;i<balanceInput.size();++i)require(balanceSampler(balanceInput[i])==balanceExpected[i]);ColorAdjustment identityBalance;identityBalance.kind=ColorAdjustmentKind::ColorBalance;require(ColorAdjustmentSampler(identityBalance)(0x80123456)==0x80123456);identityBalance.balance[0][0]=100;identityBalance.preserveLuminosity=false;require(ColorAdjustmentSampler(identityBalance)(0xff000000)==0xff000064);identityBalance.balance={};identityBalance.balance[2][2]=-100;require(ColorAdjustmentSampler(identityBalance)(0xffffffff)==0xff9bffff);
 Document balanced=Document::fromImage(3,2,balanceInput,U"balance");balanced.previewSelection(SelectionMask{0,0,3,2,{1,0,1,0,1,0}});auto balanceBefore=balanced.pixels();auto balanceHistory=balanced.historySize();require(balanced.beginColorAdjustment());require(balanced.updateColorAdjustment(balance));require(balanced.pixels()==balanceBefore&&balanced.displayPixels()[0]==balanceExpected[0]&&balanced.displayPixels()[1]==balanceInput[1]&&balanced.displayPixels()[2]==balanceInput[2]);balanced.cancelColorAdjustment();require(balanced.historySize()==balanceHistory&&balanced.pixels()==balanceBefore);require(balanced.beginColorAdjustment()&&balanced.updateColorAdjustment(balance)&&balanced.commitColorAdjustment());require(balanced.historySize()==balanceHistory+1&&balanced.pixels()[4]==balanceExpected[4]);balanced.undo();require(balanced.pixels()==balanceBefore);balanced.redo();require(balanced.pixels()[0]==balanceExpected[0]);
 // Actual legacy buildCurveLut oracle, including same-x last point and empty input.
 {auto lut=buildCurveLut({{0,0},{128,170},{255,255}});std::array<int,256> expected{0,1,3,4,5,7,8,9,11,12,14,15,16,18,19,20,22,23,25,26,27,29,30,32,33,34,36,37,39,40,42,43,44,46,47,49,50,52,53,55,56,57,59,60,62,63,65,66,67,69,70,72,73,75,76,77,79,80,82,83,85,86,87,89,90,92,93,94,96,97,99,100,101,103,104,106,107,108,110,111,112,114,115,116,118,119,120,122,123,124,126,127,128,130,131,132,133,135,136,137,138,140,141,142,143,145,146,147,148,149,150,152,153,154,155,156,157,158,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,179,180,181,182,183,184,185,186,186,187,188,189,190,190,191,192,193,194,194,195,196,197,197,198,199,199,200,201,202,202,203,204,204,205,206,206,207,208,208,209,210,210,211,211,212,213,213,214,214,215,216,216,217,217,218,219,219,220,220,221,222,222,223,223,224,224,225,225,226,227,227,228,228,229,229,230,231,231,232,232,233,233,234,234,235,236,236,237,237,238,238,239,240,240,241,241,242,242,243,244,244,245,245,246,247,247,248,249,249,250,250,251,252,252,253,254,254,255};require(lut==expected);}
 {auto lut=buildCurveLut({{100,40},{100,90},{200,160}});std::array<int,256> expected{90,90,90,90,90,90,90,90,90,90,90,90,90,89,89,89,89,89,89,89,89,89,89,89,88,88,88,88,88,88,88,88,88,87,87,87,87,87,87,87,87,87,86,86,86,86,86,86,86,86,86,86,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,86,86,86,86,86,86,86,87,87,87,87,87,88,88,88,88,89,89,89,90,90,90,91,91,92,92,92,93,93,94,94,95,95,96,97,97,98,98,99,100,100,101,102,102,103,104,104,105,106,107,107,108,109,110,111,111,112,113,114,115,115,116,117,118,119,120,120,121,122,123,124,125,125,126,127,128,129,130,131,131,132,133,134,135,136,136,137,138,139,140,140,141,142,143,144,144,145,146,147,147,148,149,149,150,151,152,152,153,153,154,155,155,156,156,157,158,158,159,159,160,160,160,161,161,162,162,162,162,163,163,163,163,163,163,164,164,164,164,164,164,164,164,164,164,163,163,163,163,163,163,163,163,163,162,162,162,162,162,162,161,161,161,161,161,161,161,161,160,160,160,160,160,160,160,160,160};require(lut==expected);}
 {auto lut=buildCurveLut({});std::array<int,256> expected{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0};require(lut==expected);}
 ColorAdjustment curves;curves.kind=ColorAdjustmentKind::Curves;curves.curves[0]={{0,0},{128,170},{255,255}};curves.curves[1]={{0,255},{255,0}};auto curveSampler=ColorAdjustmentSampler(curves);require(curveSampler(0x00123456)==0x00123456);auto curveHistogram=buildCurveHistogram({0xff1e140a,0x801e140a,0x001e140a});require(curveHistogram[0][20]==2&&curveHistogram[1][10]==2&&curveHistogram[2][20]==2&&curveHistogram[3][30]==2);Document curveDoc=Document::fromImage(2,1,{0x801e140a,0xff654321},U"curves");curveDoc.previewSelection(SelectionMask{0,0,2,1,{1,0}});auto curveBefore=curveDoc.pixels();auto curveHistory=curveDoc.historySize();require(curveDoc.beginColorAdjustment()&&curveDoc.updateColorAdjustment(curves));require(curveDoc.pixels()==curveBefore&&curveDoc.displayPixels()[0]==curveSampler(curveBefore[0])&&curveDoc.displayPixels()[1]==curveBefore[1]);curveDoc.cancelColorAdjustment();require(curveDoc.historySize()==curveHistory);require(curveDoc.beginColorAdjustment()&&curveDoc.updateColorAdjustment(curves)&&curveDoc.commitColorAdjustment());require(curveDoc.historySize()==curveHistory+1);curveDoc.undo();require(curveDoc.pixels()==curveBefore);curveDoc.redo();require(curveDoc.pixels()[0]==curveSampler(curveBefore[0]));
 // Global frame snapshot survives source lifetime and maps layers by visual index.
 Document::FrameClipboardSnapshot globalFrames;{Document source(2,1);source.beginStroke({0,0},0xff112233);source.commitStroke();source.setFrameDuration(125);source.addLayer();source.beginStroke({1,0},0xff445566);source.commitStroke();source.selectLayer(source.timeline().state().layers[1].id);source.setLayerVisible(false);source.setLayerOpacity(.4);source.setLayerLocked(true);source.addLinkedFrame(true);source.setFrameDuration(275);const auto sourceFrames=source.timeline().state().frames;source.selectFrameHeader(sourceFrames[0].id);source.selectFrameHeader(sourceFrames[1].id,1);source.setSelectedFramesDisabled(true);
 require(source.copySelectedFrames());globalFrames=source.exportFrameClipboard();source.clearTimelineSelection();source.selectLayer(source.timeline().state().layers[0].id);source.selectFrame(sourceFrames[0].id);source.beginStroke({0,0},0xffabcdef);source.commitStroke();}
 Document crossFrames(2,1);crossFrames.beginStroke({1,0},0xff778899);crossFrames.commitStroke();crossFrames.setLayerLocked(true);const auto crossOriginal=crossFrames.timeline().state();const auto crossActive=crossFrames.frame().id;const auto crossHistory=crossFrames.historySize();
 require(crossFrames.pasteFrameClipboard(globalFrames)&&crossFrames.historySize()==crossHistory+1);const auto crossState=crossFrames.timeline().state();
 require(crossState.layers.size()==2&&crossState.frames.size()==3&&crossState.layers[0].locked&&crossState.layers[1].locked&&!crossState.layers[1].visible&&crossState.layers[1].opacity==.4);
 require(crossState.frames[1].duration==125&&crossState.frames[2].duration==275&&crossState.frames[1].disabled&&crossState.frames[2].disabled);
 require(crossFrames.frame().id==crossState.frames[1].id&&crossFrames.selectedFrames()==std::vector<std::string>({crossState.frames[1].id,crossState.frames[2].id}));const auto* pastedBase=crossFrames.timeline().findCel(crossState.layers[0].id,crossState.frames[1].id);const auto* pastedAlias=crossFrames.timeline().findCel(crossState.layers[0].id,crossState.frames[2].id);
 require(crossFrames.timeline().resolveSurface(pastedBase->id).surface->pixels[1]==0xff445566&&pastedAlias->linkedCelId&&*pastedAlias->linkedCelId==pastedBase->id);
 require(crossFrames.timeline().resolveSurface(crossFrames.timeline().findCel(crossState.layers[0].id,crossActive)->id).surface->pixels[1]==0xff778899);
 require(crossFrames.timeline().resolveSurface(crossFrames.timeline().findCel(crossState.layers[1].id,crossActive)->id).surface->pixels==std::vector<Pixel>({0,0}));crossFrames.undo();
 require(crossFrames.timeline().state().layers.size()==1&&crossFrames.timeline().state().frames.size()==1&&crossFrames.pixels()[1]==0xff778899&&crossFrames.frame().id==crossActive);crossFrames.redo();
 require(crossFrames.timeline().state().layers.size()==2&&crossFrames.timeline().state().frames.size()==3);
 Document sizeMismatch(3,1);const auto mismatchRevision=sizeMismatch.revision(),mismatchHistory=sizeMismatch.historySize();bool refused=false;try{sizeMismatch.pasteFrameClipboard(globalFrames);}catch(const std::runtime_error&){refused=true;}require(refused&&sizeMismatch.revision()==mismatchRevision&&sizeMismatch.historySize()==mismatchHistory&&sizeMismatch.timeline().state().frames.size()==1&&sizeMismatch.timeline().state().layers.size()==1);auto invalidFrames=globalFrames;invalidFrames.items[0].cels[0].surface->offsetX=1;refused=false;try{crossFrames.pasteFrameClipboard(invalidFrames);}catch(const std::runtime_error&){refused=true;}require(refused&&crossFrames.timeline().state().frames.size()==3&&crossFrames.timeline().state().layers.size()==2);
 // Timeline GIF layer import overlays existing time slots, appends only overflow,
 // and leaves the target loop, old durations, old pixels and existing layers intact.
 Document gifSource(2,1);gifSource.beginStroke({0,0},0xff123456);gifSource.commitStroke();gifSource.setFrameDuration(125);gifSource.addFrame();gifSource.beginStroke({1,0},0xffabcdef);gifSource.commitStroke();gifSource.setFrameDuration(275);gifSource.setSelectedFramesDisabled(true);gifSource.setImportedLoop(false);
 Document gifTarget(2,1);gifTarget.beginStroke({0,0},0xff778899);gifTarget.commitStroke();const auto gtLayer=gifTarget.layer().id;gifTarget.addFrame();gifTarget.setFrameDuration(350);gifTarget.selectFrameHeader(gifTarget.frame().id);const auto gifTargetSelection=gifTarget.selectedFrames();const auto gtActive=gifTarget.frame().id;const auto gtHistory=gifTarget.historySize();const auto gtLoop=gifTarget.animationLoop();
 require(gifTarget.importGifAnimationLayer(gifSource,1));const auto gtState=gifTarget.timeline().state();require(gtState.layers.size()==2 && gtState.frames.size()==3 && gifTarget.historySize()==gtHistory+1 && gifTarget.animationLoop()==gtLoop);require(gtState.frames[1].duration==350 && gtState.frames[2].duration==275 && gtState.frames[2].disabled && !gtState.frames[1].disabled);require(gifTarget.layer().id==gtState.layers.back().id && gifTarget.frame().id==gtState.frames[1].id && gifTarget.timelineSelection().layers==std::vector<std::string>{gifTarget.layer().id} && gifTarget.timelineSelection().cels.size()==2 && gifTarget.selectedFrames().empty());require(gifTarget.pixels()==std::vector<Pixel>({0xff123456,0}) && gifTarget.timeline().resolveSurface(gifTarget.timeline().findCel(gifTarget.layer().id,gtState.frames[2].id)->id).surface->pixels==std::vector<Pixel>({0,0xffabcdef}));require(gifTarget.timeline().resolveSurface(gifTarget.timeline().findCel(gtLayer,gtState.frames[0].id)->id).surface->pixels[0]==0xff778899 && gifTarget.timeline().resolveSurface(gifTarget.timeline().findCel(gtLayer,gtState.frames[2].id)->id).surface->pixels==std::vector<Pixel>({0,0}));gifTarget.undo();require(gifTarget.timeline().state().layers.size()==1 && gifTarget.timeline().state().frames.size()==2 && gifTarget.selectedFrames()==gifTargetSelection && gifTarget.frame().id==gtActive && gifTarget.layer().id==gtLayer);gifTarget.redo();require(gifTarget.timeline().state().layers.size()==2 && gifTarget.timeline().state().frames.size()==3 && gifTarget.pixels()[0]==0xff123456);
 Document gifMismatch(3,1);const auto gmRevision=gifMismatch.revision();refused=false;try{gifMismatch.importGifAnimationLayer(gifSource,0);}catch(const std::runtime_error&){refused=true;}require(refused && gifMismatch.revision()==gmRevision && gifMismatch.timeline().state().layers.size()==1 && gifMismatch.timeline().state().frames.size()==1);
 Document gifLeading(2,1);gifLeading.addFrame();gifLeading.addFrame();gifLeading.setLayerLocked(true);const auto glHistory=gifLeading.historySize();require(gifLeading.importGifAnimationLayer(gifSource,-5) && gifLeading.timeline().state().frames.size()==3 && gifLeading.activeFrameIndex()==0 && gifLeading.historySize()==glHistory+1);Document gifTrailing(2,1);require(gifTrailing.importGifAnimationLayer(gifSource,100) && gifTrailing.timeline().state().frames.size()==3 && gifTrailing.activeFrameIndex()==1 && gifTrailing.timeline().state().frames[1].duration==125);
 Document gifPending(2,1);gifPending.beginStroke({0,0},0xff112233);gifPending.commitStroke();gifPending.previewSelection(SelectionMask{0,0,1,1,{}});const auto gpHistory=gifPending.historySize();require(gifPending.nudgeSelectionContent(1,0));require(gifPending.importGifAnimationLayer(gifSource,0) && !gifPending.floating() && gifPending.historySize()==gpHistory+2);gifPending.undo();require(gifPending.timeline().state().layers.size()==1 && gifPending.pixels()==std::vector<Pixel>({0,0xff112233}));gifPending.undo();require(gifPending.pixels()==std::vector<Pixel>({0xff112233,0}));
 std::cout<<"Cel selection clipboard checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
