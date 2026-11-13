#include "history_commands.h"
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
using namespace moon::workspace;
#define CHECK(...) do { if (!(__VA_ARGS__)) throw std::runtime_error(#__VA_ARGS__); } while (false)
int main() { try {
  HistoryCommands commands;
  HistoryContext context{11, false, false};
  std::vector<HistoryRequest> applied;
  auto execute = [&](const HistoryRequest& request) { applied.push_back(request); };
  CHECK(commands.submit({11,HistoryAction::Undo},context,execute).state==HistoryCommandResult::Executed);
  CHECK(applied.size()==1 && !commands.pending());
  context.gesture=true;
  CHECK(commands.submit({11,HistoryAction::Undo},context,execute).state==HistoryCommandResult::Queued);
  commands.submit({11,HistoryAction::Redo},context,execute);
  commands.submit({11,HistoryAction::Jump,2},context,execute);
  commands.submit({11,HistoryAction::Jump,7},context,execute);
  CHECK(applied.size()==1 && commands.poll(context,execute).state==HistoryCommandResult::Queued);
  context.gesture=false; context.modal=true;
  CHECK(commands.poll(context,execute).state==HistoryCommandResult::Queued && applied.size()==1);
  CHECK(commands.submit({11,HistoryAction::Redo},context,execute).state==HistoryCommandResult::Unavailable);
  context.modal=false;
  commands.poll(context,execute); commands.poll(context,execute); commands.poll(context,execute);
  CHECK(!commands.pending() && applied.size()==4);
  CHECK(applied[1].action==HistoryAction::Undo && applied[2].action==HistoryAction::Redo);
  CHECK(applied[3].action==HistoryAction::Jump && applied[3].position==7);
  context.gesture=true; commands.submit({11,HistoryAction::Undo},context,execute);
  context.document=22; context.gesture=false;
  commands.poll(context,execute); context.document=11; commands.poll(context,execute);
  CHECK(applied.size()==4 && !commands.pending());
  CHECK(commands.submit({22,HistoryAction::Undo},context,execute).state==HistoryCommandResult::Unavailable);
  CHECK(commands.submit({0,HistoryAction::Undo},{},execute).state==HistoryCommandResult::Unavailable);
  context.gesture=true;
  commands.submit({11,HistoryAction::Undo},context,execute);
  commands.submit({11,HistoryAction::Redo},context,execute);
  context.gesture=false;
  auto failure=commands.poll(context,[](const auto&){throw std::runtime_error("injected");});
  CHECK(failure.state==HistoryCommandResult::Failed && failure.error && commands.pending());
  bool observed=false; try { std::rethrow_exception(failure.error); } catch(const std::runtime_error& e) { observed=std::string(e.what())=="injected"; }
  CHECK(observed); commands.poll(context,execute);
  CHECK(!commands.pending() && applied.back().action==HistoryAction::Redo);
  // A newly submitted command cannot overtake an already queued one.
  context.gesture=true; commands.submit({11,HistoryAction::Undo},context,execute);
  context.gesture=false;
  CHECK(commands.submit({11,HistoryAction::Redo},context,execute).state==HistoryCommandResult::Queued);
  commands.poll(context,execute); commands.poll(context,execute);
  CHECK(applied[applied.size()-2].action==HistoryAction::Undo && applied.back().action==HistoryAction::Redo);
  bool allowed=true;
  context.gesture=true; commands.submit({11,HistoryAction::Undo,0,[&]{return allowed;}},context,execute);
  allowed=false; context.gesture=false; const auto beforeRevoke=applied.size();
  CHECK(commands.poll(context,execute).state==HistoryCommandResult::Unavailable && applied.size()==beforeRevoke);
  context.gesture=true; commands.submit({11,HistoryAction::Undo},context,execute);
  commands.poll({},execute); CHECK(!commands.pending());
  std::cout << "History application queue: identity, gestures, modal, ordering, jumps and failures passed\n";
  return 0;
} catch(const std::exception& error) { std::cerr<<error.what()<<'\n'; return 1; } }
