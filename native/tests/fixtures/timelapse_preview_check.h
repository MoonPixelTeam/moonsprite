#pragma once
#include "timelapse_dialog.h"
namespace moon {
// Controlled completions exercise the real dialog without disk or timing races.
struct TimelapsePreviewCheck {
 static bool shown(const TimelapseDialog& dialog,const std::string& id){return dialog.shown_==id&&dialog.error_.empty();}
 static void run(const PixelFont& font,const Skin& skin,const Skin& icons){
  auto check=[](bool ok){if(!ok)throw std::runtime_error("Timelapse preview stale-result/playback regression");};
  timelapse::Settings settings;settings.fps=1;settings.speed=1;
  for(const auto id:{"preview-first","preview-second","preview-third"}){timelapse::Frame frame;frame.id=id;frame.width=frame.height=1;settings.snapshots.push_back(frame);}
  const timelapse::Image image{1,1,{0xff123456}};
  bool exported=false;
  TimelapseDialog dialog(font,skin,icons,settings,[](const auto&){throw std::runtime_error("Unexpected preview disk read");return timelapse::Bytes{};},[]{},[&]{settings.snapshots.clear();},[&]{exported=true;});
  dialog.timer_.stop();
  CheckerboardSettings checker;checker.light=gfx::rgba(12,34,56);checker.dark=gfx::rgba(78,90,12);dialog.setPreviewCheckerboard(checker);
  check(dialog.preview_->checkerboard.light==checker.light&&dialog.preview_->checkerboard.dark==checker.dark);
  dialog.cache_.push_front({"preview-second",image});
  // Seek to a cached frame while an old read is still outstanding.
  std::promise<timelapse::Image> old;dialog.loading_=old.get_future();dialog.requested_="preview-first";dialog.requestedGeneration_=dialog.loadGeneration_;
  dialog.select(1);dialog.tick();check(dialog.shown_=="preview-second"&&dialog.seek_->value==1);
  dialog.toggle();check(dialog.playing_&&dialog.play_->icon=="playback-pause");
  old.set_exception(std::make_exception_ptr(std::runtime_error("Old missing recording")));dialog.tick();
  check(dialog.playing_&&dialog.error_.empty()&&dialog.shown_=="preview-second"&&dialog.play_->icon=="playback-pause");
  dialog.stopPlayback();
  // A stale successful decode is canceled too, without repopulating its cache.
  std::promise<timelapse::Image> success;dialog.loading_=success.get_future();dialog.requested_="preview-first";dialog.requestedGeneration_=dialog.loadGeneration_-1;
  success.set_value(image);dialog.tick();check(dialog.cache_.size()==1&&dialog.cache_.front().id=="preview-second");
  // An error for the selected frame stops playback and restores the play icon.
  std::promise<timelapse::Image> current;dialog.loading_=current.get_future();dialog.requested_="preview-second";dialog.requestedGeneration_=dialog.loadGeneration_;
  dialog.toggle();current.set_exception(std::make_exception_ptr(std::runtime_error("Current missing recording")));dialog.tick();
  check(!dialog.playing_&&dialog.play_->icon=="playback-play"&&dialog.error_==U"Current missing recording");
  dialog.cache_.push_front({"preview-first",image});dialog.select(0);dialog.tick();
  check(dialog.error_.empty()&&dialog.shown_=="preview-first");
  dialog.toggle();dialog.exportButton_->Click();check(exported&&!dialog.playing_&&dialog.play_->icon=="playback-play");
  dialog.toggle();dialog.error_=U"Previous error";dialog.clearButton_->Click();dialog.tick();
  check(settings.snapshots.empty()&&dialog.cache_.empty()&&dialog.shown_.empty()&&dialog.error_.empty()&&!dialog.playing_&&dialog.play_->icon=="playback-play"&&!dialog.play_->isEnabled());
  // Pending capture publications remain visible without a persistence barrier.
  timelapse::Frame added;added.id="late-preview";added.width=added.height=1;settings.snapshots.push_back(added);dialog.cache_.push_front({added.id,image});dialog.tick();
  check(dialog.shown_==added.id&&dialog.exportButton_->isEnabled()&&dialog.clearButton_->isEnabled()&&dialog.seek_->isEnabled()&&!dialog.play_->isEnabled());
  added.id="late-second";settings.snapshots.push_back(added);dialog.tick();check(dialog.play_->isEnabled()&&dialog.seek_->maximum==1);
  dialog.select(1);std::promise<timelapse::Image> late;dialog.loading_=late.get_future();dialog.requested_=added.id;dialog.requestedGeneration_=dialog.loadGeneration_;
  dialog.tick();late.set_value(image);dialog.tick();check(dialog.shown_==added.id&&dialog.error_.empty());
 }
};
}
