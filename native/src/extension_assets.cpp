#include "extension_assets.h"
#include <winsqlite/winsqlite3.h>
#include <algorithm>
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <stdexcept>
#include <thread>
namespace moon::extension {
namespace {
constexpr std::size_t assetLimit=8u*1024u*1024u,totalLimit=64u*1024u*1024u;
// TextEncoder counts unpaired UTF-16 surrogates as U+FFFD (three bytes).
std::size_t bytes(const std::u16string& value){std::size_t count=0;for(std::size_t i=0;i<value.size();++i){const auto c=value[i];if(c<128)++count;else if(c<2048)count+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<value.size()&&value[i+1]>=0xdc00&&value[i+1]<=0xdfff){count+=4;++i;}else count+=3;}return count;}
struct Database {
 sqlite3* db=nullptr;bool transaction=false;
 explicit Database(const std::filesystem::path& path){if(!path.parent_path().empty())std::filesystem::create_directories(path.parent_path());const auto code=sqlite3_open16(path.c_str(),&db);if(code!=SQLITE_OK){const std::string error=db?sqlite3_errmsg(db):"Cannot open extension assets";if(db)sqlite3_close(db);db=nullptr;throw std::runtime_error(error);}sqlite3_busy_timeout(db,5000);}
 ~Database(){if(transaction)sqlite3_exec(db,"ROLLBACK",nullptr,nullptr,nullptr);if(db)sqlite3_close(db);}
 void exec(const char* sql){if(sqlite3_exec(db,sql,nullptr,nullptr,nullptr)!=SQLITE_OK)throw std::runtime_error(sqlite3_errmsg(db));}
};
struct Statement {
 Database& database;sqlite3_stmt* statement=nullptr;
 Statement(Database& db,const char* sql):database(db){if(sqlite3_prepare_v2(db.db,sql,-1,&statement,nullptr)!=SQLITE_OK)throw std::runtime_error(sqlite3_errmsg(db.db));}
 ~Statement(){sqlite3_finalize(statement);}
 void checked(int code){if(code!=SQLITE_OK)throw std::runtime_error(sqlite3_errmsg(database.db));}
 void owner(const std::string& id){checked(sqlite3_bind_text(statement,1,id.data(),int(id.size()),SQLITE_TRANSIENT));}
 void blob(int index,const std::u16string& value){checked(sqlite3_bind_blob(statement,index,value.c_str(),int(value.size()*sizeof(char16_t)),SQLITE_TRANSIENT));}
 int step(){const auto code=sqlite3_step(statement);if(code!=SQLITE_ROW&&code!=SQLITE_DONE)throw std::runtime_error(sqlite3_errmsg(database.db));return code;}
};
AssetResult transact(const std::filesystem::path& path,const std::string& extension,const std::string& method,const std::u16string& key,const std::optional<std::u16string>& value){
 if(key.empty()||bytes(key)>160||std::any_of(key.begin(),key.end(),[](char16_t c){return c<32;}))throw std::invalid_argument("扩展素材键无效。");
 std::size_t size=0;if(method=="assets.set"){if(!value)throw std::invalid_argument("扩展素材必须是字符串。");size=bytes(*value);if(size>assetLimit)throw std::length_error("转换后的素材超过 8 MiB，请缩小尺寸或减少帧数。");}
 Database db(path);db.exec("CREATE TABLE IF NOT EXISTS assets(extension TEXT NOT NULL,key BLOB NOT NULL,value BLOB NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(extension,key)) WITHOUT ROWID");
 if(method=="assets.get"){
  Statement query(db,"SELECT value FROM assets WHERE extension=?1 AND key=?2");query.owner(extension);query.blob(2,key);if(query.step()==SQLITE_DONE)return {};
  const auto count=sqlite3_column_bytes(query.statement,0);if(count<0||count%2||count>int(assetLimit*2))throw std::runtime_error("读取扩展素材失败。");const auto* data=static_cast<const char16_t*>(sqlite3_column_blob(query.statement,0));return count?std::u16string(data,std::size_t(count)/2):std::u16string{};
 }
 if(method!="assets.set"&&method!="assets.remove")throw std::invalid_argument("扩展窗口请求的方法不受支持。");
 db.exec("BEGIN IMMEDIATE");db.transaction=true;
 if(method=="assets.set"){
  {Statement quota(db,"SELECT COALESCE(SUM(bytes),0) FROM assets WHERE extension=?1 AND key<>?2");quota.owner(extension);quota.blob(2,key);quota.step();const auto previous=sqlite3_column_int64(quota.statement,0);if(previous<0||previous>std::int64_t(totalLimit-size))throw std::length_error("扩展素材总容量超过 64 MiB，请删除不用的素材。");}
  Statement write(db,"INSERT OR REPLACE INTO assets(extension,key,value,bytes) VALUES(?1,?2,?3,?4)");write.owner(extension);write.blob(2,key);write.blob(3,*value);write.checked(sqlite3_bind_int64(write.statement,4,sqlite3_int64(size)));write.step();
 }else{Statement remove(db,"DELETE FROM assets WHERE extension=?1 AND key=?2");remove.owner(extension);remove.blob(2,key);remove.step();}
 db.exec("COMMIT");db.transaction=false;return {};
}
// Same promise/FIFO pattern as extension_form_files.h. Metadata quota checks
// stay in the database transaction; no full asset corpus is decoded or copied.
struct Queue {
 struct Job{std::function<void()> run;std::size_t bytes;};
 std::mutex mutex;std::condition_variable ready;std::deque<Job> jobs;std::size_t queuedBytes=0,count=0;bool stopping=false;std::thread worker;
 Queue():worker([this]{for(;;){Job job;{std::unique_lock<std::mutex> lock(mutex);ready.wait(lock,[&]{return stopping||!jobs.empty();});if(stopping&&jobs.empty())return;job=std::move(jobs.front());jobs.pop_front();}job.run();{std::lock_guard<std::mutex> lock(mutex);queuedBytes-=job.bytes;--count;}}}){}
 ~Queue(){{std::lock_guard<std::mutex> lock(mutex);stopping=true;}ready.notify_one();worker.join();}
};
}
std::future<AssetResult> startAssetRequest(std::filesystem::path path,std::string extension,std::string method,std::u16string key,std::optional<std::u16string> value){
 static Queue queue;const auto weight=key.size()*2+(value?value->size()*2:0);auto promise=std::make_shared<std::promise<AssetResult>>();auto future=promise->get_future();
 auto run=[promise,path=std::move(path),extension=std::move(extension),method=std::move(method),key=std::move(key),value=std::move(value)]{try{promise->set_value(transact(path,extension,method,key,value));}catch(...){promise->set_exception(std::current_exception());}};
 {std::lock_guard<std::mutex> lock(queue.mutex);if(queue.count>=512||weight>256u*1024u*1024u-queue.queuedBytes)throw std::length_error("Extension asset request queue is full");queue.jobs.push_back({std::move(run),weight});queue.queuedBytes+=weight;++queue.count;}queue.ready.notify_one();return future;
}
}
