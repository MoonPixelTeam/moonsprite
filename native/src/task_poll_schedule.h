#pragma once
#include "task_stage_profile.h"
#include <array>
#include <functional>
#include <optional>
#include <stdexcept>
#include <utility>

namespace moon::workspace {
// Immutable UI-thread poll composition. It owns callbacks, never workers or
// documents. Each domain keeps its own admission/cancellation/close protocol.
class TaskPollSchedule {
public:
 using Stage=TaskStageProfile::Stage;
 struct Task {
  std::function<void()> poll;
  std::function<std::optional<std::size_t>()> pending;
 };
 struct Catalog {Task gallery,folder,recovery;};
 struct Capture {Task timelapse,liquify,brushPreferences;};
 struct Persistence {Task save,batchExport;};
 struct Interaction {Task paletteHold,playback;};
 struct Maintenance {Task recovery,usage;};
 struct Preview {Task convolution,antiAlias,gradientMap,wand,gradient,shape;};

 TaskPollSchedule(Catalog catalog,Capture capture,Persistence persistence,
                  Interaction interaction,Maintenance maintenance,Preview preview)
  :tasks_{{std::move(catalog.gallery),std::move(catalog.folder),std::move(catalog.recovery),
           std::move(capture.timelapse),std::move(capture.liquify),std::move(capture.brushPreferences),
           std::move(persistence.save),std::move(persistence.batchExport),
           std::move(interaction.paletteHold),std::move(interaction.playback),
           std::move(maintenance.recovery),std::move(maintenance.usage),
           std::move(preview.convolution),std::move(preview.antiAlias),std::move(preview.gradientMap),
           std::move(preview.wand),std::move(preview.gradient),std::move(preview.shape)}} {
  for(const auto& task:tasks_)if(!task.poll)throw std::invalid_argument("Missing workspace poll domain");
 }
 void poll(TaskStageProfile& profile)const {
  auto cycle=profile.cycle(std::chrono::milliseconds(16));
  // Preserve the established dependency boundaries: captures before saves;
  // save acknowledgements before recovery; playback before recovery sampling;
  // preview publication after persistence's safe-point checks. Exceeding the
  // observation budget never drops a must-finish save or defers another lane.
  for(std::size_t i=0;i<tasks_.size();++i){const auto& task=tasks_[i];
   profile.run(Stage(i),task.poll,[&]{return task.pending?task.pending():std::optional<std::size_t>{};});
  }
 }
private:
 std::array<Task,std::size_t(Stage::Count)> tasks_;
};
}
