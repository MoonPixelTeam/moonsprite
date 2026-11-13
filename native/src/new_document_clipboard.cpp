#include "new_document_clipboard.h"
#include <condition_variable>
#include <mutex>
#include <memory>
#include <thread>
namespace moon::new_document {
std::future<std::optional<Size>> probe(std::function<std::optional<Size>()> work){
 using Task=std::packaged_task<std::optional<Size>()>;
 struct State {std::mutex mutex;std::condition_variable ready;std::optional<Task> pending;};
 static const auto state=[] {auto state=std::make_shared<State>();std::thread([state]{for(;;){Task task;{std::unique_lock<std::mutex> lock(state->mutex);state->ready.wait(lock,[&]{return state->pending.has_value();});task=std::move(*state->pending);state->pending.reset();}task();}}).detach();return state;}();
 Task task([work=std::move(work)]{try{return work();}catch(...){return std::optional<Size>{};}});auto future=task.get_future();{std::lock_guard<std::mutex> lock(state->mutex);state->pending.reset();state->pending.emplace(std::move(task));}state->ready.notify_one();return future;
}
}
