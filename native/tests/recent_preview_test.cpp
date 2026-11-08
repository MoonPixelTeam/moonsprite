#include "recent_preview_queue.h"
#include "image_export.h"
#include "project_file.h"
#include "project_encode.h"
#include "aseprite_io.h"
#include "webp_export.h"
#include "fixtures/recent_preview_legacy.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <atomic>
using namespace moon;
using namespace moon::recent;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
std::uint64_t hash(const std::vector<std::uint32_t>& pixels){std::uint64_t value=14695981039346656037ull;for(auto p:pixels){value^=p;value*=1099511628211ull;}return value;}
int wmain(int argc,wchar_t** argv){try{
 check(argc==2,"Supply absolute owned test directory");const std::filesystem::path root=argv[1];check(root.is_absolute(),"Owned root must be absolute");std::filesystem::create_directories(root);std::ofstream(root/"test-owned.marker")<<"Recent preview generated fixtures only";
 std::size_t mismatch=0,index=0;
 for(const auto& c:legacyPreviewFixtures){const auto path=root/(std::to_string(index)+"."+c.extension);{std::ofstream file(path,std::ios::binary);file.write(reinterpret_cast<const char*>(c.bytes.data()),std::streamsize(c.bytes.size()));}bool accepted=false;Preview result;try{result=readPreview({path.u8string(),1,false},{},[]{return false;});accepted=true;}catch(const std::exception&){}
  if(accepted!=c.accepted||(accepted&&(result.width!=c.width||result.height!=c.height||result.previewWidth!=c.previewWidth||result.previewHeight!=c.previewHeight||hash(result.pixels)!=c.hash))){std::ofstream raw(root/(std::to_string(index)+".rgba"),std::ios::binary);raw.write(reinterpret_cast<const char*>(result.pixels.data()),std::streamsize(result.pixels.size()*4));std::cout<<"Mismatch "<<index<<" accepted "<<accepted<<'/'<<c.accepted<<" hash "<<hash(result.pixels)<<'/'<<c.hash<<'\n';++mismatch;}++index;
 }
 check(!mismatch,"Actual legacy browser thumbnail mismatch");
 std::cout<<index<<" actual legacy browser thumbnail cases passed\n";
 const auto cache=root/"cache",file=root/L"缓存 空格.png";auto png=encodeRgbaImagePng(3,1,{0xff332211,0x7f554433,0x00123456}).png;writeExportBytesAtomic(file,png);
 const auto first=readPreview({file.u8string(),1,false},cache,[]{return false;});const auto second=readPreview({file.u8string(),1,false},cache,[]{return false;});check(first.pixels==second.pixels&&first.png==second.png,"Warm cache changes preview pixels");
 std::filesystem::path metadata,cachedPng;for(const auto& entry:std::filesystem::directory_iterator(cache)){if(entry.path().extension()==".txt")metadata=entry.path();else if(entry.path().extension()==".png")cachedPng=entry.path();}check(!metadata.empty()&&!cachedPng.empty(),"Disk cache pair missing");
 {std::ofstream out(cachedPng,std::ios::binary);out<<"broken";}check(readPreview({file.u8string(),1,false},cache,[]{return false;}).pixels==first.pixels,"Corrupt cached PNG must regenerate");
 {std::ifstream in(metadata);std::string text((std::istreambuf_iterator<char>(in)),{});text.replace(0,15,"moon-preview-v1");std::ofstream out(metadata);out<<text;}check(readPreview({file.u8string(),1,false},cache,[]{return false;}).pixels==first.pixels,"Old version cache must regenerate");
 const auto time=std::filesystem::last_write_time(file);writeExportBytesAtomic(file,encodeRgbaImagePng(4,1,{0xff887766,0xff112233,0xff445566,0xff778899}).png);std::filesystem::last_write_time(file,time+std::chrono::seconds(2));auto changed=readPreview({file.u8string(),1,false},cache,[]{return false;});check(changed.width==4&&changed.pixels!=first.pixels,"Source fingerprint invalidation");
 const auto badCache=root/"cache-is-file";std::ofstream(badCache)<<"owned";check(readPreview({file.u8string(),1,false},badCache,[]{return false;}).pixels==changed.pixels,"Cache write failure hides valid preview");
 bool canceled=false;try{readPreview({file.u8string(),1,false},cache,[]{return true;});}catch(const std::exception&){canceled=true;}check(canceled,"Canceled reader must not publish");
 Document document(3,2);document.beginStroke({2,1},0xff332211);document.commitStroke();const auto project=root/"project.moonsprite";project::saveDocumentAtomic(document,project);auto embedded=readPreview({project.u8string(),1,false},{},[]{return false;});check(embedded.width==3&&embedded.height==2&&embedded.pixels==document.pixels(),"Embedded project preview");
 const auto recovery=root/"missing-preview.moonsprite";auto archive=project::encodeRecoveryProject(document);writeExportBytesAtomic(recovery,*archive.bytes);check(readPreview({recovery.u8string(),1,false},{},[]{return false;}).pixels==embedded.pixels,"Missing preview document fallback");
 for(const auto& extension:{"ase","aseprite"}){const auto path=root/(std::string("import.")+extension);writeExportBytesAtomic(path,encodeAseprite(document));check(readPreview({path.u8string(),1,false},{},[]{return false;}).pixels==embedded.pixels,"ASE fallback preserves raster");}
 {const auto psd=root.parent_path().parent_path()/"tests/fixtures/psd-import/merged.psd";auto value=readPreview({psd.u8string(),1,false},{},[]{return false;});check(value.width==2&&value.height==1&&value.pixels==std::vector<Pixel>({0xff38220c,0xff46505a}),"PSD fallback actual merged fixture");}
 for(const auto& pair:std::vector<std::pair<std::string,std::vector<std::uint8_t>>>{{"bmp",encodeImageBmp(3,2,document.pixels())},{"jpg",encodeImageJpeg(3,2,document.pixels()).bytes},{"webp",encodeAnimationWebp(document).bytes}}){const auto path=root/("image."+pair.first);writeExportBytesAtomic(path,pair.second);auto value=readPreview({path.u8string(),1,false},{},[]{return false;});check(value.width==3&&value.height==2&&!value.pixels.empty(),"Other raster preview dispatch");}
 std::atomic<int> running{0},maximum{0},calls{0};PreviewQueue queue([&](const Project&,const auto&,const auto&){const int n=++running;maximum.store(std::max(maximum.load(),n));++calls;std::this_thread::sleep_for(std::chrono::milliseconds(3));--running;Preview v;v.png.resize(32);return v;});
 auto wait=[&](std::size_t count){std::vector<PreviewQueue::Result> results;const auto end=std::chrono::steady_clock::now()+std::chrono::seconds(8);while(results.size()<count&&std::chrono::steady_clock::now()<end){auto next=queue.take();results.insert(results.end(),next.begin(),next.end());std::this_thread::sleep_for(std::chrono::milliseconds(1));}check(results.size()==count,"Preview queue completion timeout");return results;};
 std::vector<Project> records;for(int i=0;i<30;++i)records.push_back({std::to_string(i),1,false});queue.request(records,{});wait(30);check(maximum<=3&&queue.cacheCount()==24&&queue.cacheBytes()==24*32,"Worker/cache count bounds");int before=calls;queue.request({records.back()},{});wait(1);check(calls==before,"Memory LRU hit decodes twice");
 queue.request({{"stale",1,false}},{});queue.cancel();queue.request({{"current",1,false}},{});auto newest=wait(1);check(newest[0].key==previewKey({"current",1,false}),"Canceled generation publishes stale preview");while(running)std::this_thread::sleep_for(std::chrono::milliseconds(1));
 {PreviewQueue large([](const Project&,const auto&,const auto&){Preview v;v.png.resize(20u*1024u*1024u);return v;});large.request({{"large-a",1,false},{"large-b",1,false}},{});std::size_t completed=0;const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(8);while(completed<2&&std::chrono::steady_clock::now()<until){completed+=large.take().size();std::this_thread::sleep_for(std::chrono::milliseconds(1));}check(completed==2&&large.cacheCount()==1&&large.cacheBytes()==20u*1024u*1024u,"32MiB LRU byte cap");}
 std::cout<<"Cache regeneration, format dispatch, cancellation, 3-worker queue and 24-item LRU passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
