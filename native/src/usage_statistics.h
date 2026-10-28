#pragma once
#include <array>
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <vector>
namespace moon::usage {
using Milliseconds=std::int64_t;
struct Data {
 bool enabled=true;std::string firstUsedAt,updatedAt;
 std::uint64_t launchCount=0,totalUsageMs=0,longestSessionMs=0,completedSessionCount=0,newProjectCount=0,saveCount=0,exportCount=0,drawingTimeMs=0,drawingStrokeCount=0;
 std::map<std::string,std::uint64_t> exportFormats,dailyUsageMs;
 std::array<std::uint64_t,24> hourlyUsageMs{};
};
struct Period {std::string key;std::uint64_t usageMs=0;};
struct Summary {Data data;std::size_t totalUsageDays=0,consecutiveUsageDays=0;std::uint64_t last7DaysMs=0,last30DaysMs=0,averageSessionMs=0;std::optional<int> mostActiveHour;std::vector<Period> dailyTrend,weeklyTrend;};
Milliseconds now();
Milliseconds localTime(int year,int month,int day,int hour=0,int minute=0,int second=0);
std::string isoTime(Milliseconds);
std::string dateKey(Milliseconds);
std::string shiftedDateKey(Milliseconds,int days);
Data empty(bool enabled=true,Milliseconds at=now());
Data parse(const std::string&,Milliseconds at=now());
std::string encode(const Data&);
void addInterval(Data&,Milliseconds start,Milliseconds end);
Summary summarize(Data,Milliseconds at=now());
class Tracker {
 Data data_;bool initialized_=false,dirty_=false;std::optional<Milliseconds> session_,accounted_,persistAt_;Milliseconds lastPeriodic_=0;
 void account(Milliseconds);void changed(Milliseconds);
public:
 void initialize(const std::string&,Milliseconds at=now());
 void setEnabled(bool,Milliseconds at=now());
 void reset(Milliseconds at=now());
 void recordEvent(const std::string&,Milliseconds at=now());
 void recordDrawing(bool stroke,Milliseconds duration,Milliseconds at=now());
 void recordExport(const std::string&,Milliseconds at=now());
 Summary snapshot(Milliseconds at=now())const;
 void flush(Milliseconds at=now());
 bool tick(Milliseconds at=now());
 bool initialized()const{return initialized_;}
 bool dirty()const{return dirty_;}
 const Data& data()const{return data_;}
 void persisted(){dirty_=false;persistAt_.reset();}
};
}
