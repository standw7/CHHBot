"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleUrl = scheduleUrl;
exports.weekScheduleUrl = weekScheduleUrl;
exports.playByPlayUrl = playByPlayUrl;
exports.boxscoreUrl = boxscoreUrl;
exports.landingUrl = landingUrl;
exports.goalReplayUrl = goalReplayUrl;
exports.tvScheduleNowUrl = tvScheduleNowUrl;
exports.tvScheduleDateUrl = tvScheduleDateUrl;
exports.clubStatsUrl = clubStatsUrl;
exports.gamecenterWebUrl = gamecenterWebUrl;
const BASE_URL = 'https://api-web.nhle.com';
function scheduleUrl(teamCode) {
    return `${BASE_URL}/v1/club-schedule-season/${teamCode}/now`;
}
function weekScheduleUrl(teamCode) {
    return `${BASE_URL}/v1/club-schedule/${teamCode}/week/now`;
}
function playByPlayUrl(gameId) {
    return `${BASE_URL}/v1/gamecenter/${gameId}/play-by-play`;
}
function boxscoreUrl(gameId) {
    return `${BASE_URL}/v1/gamecenter/${gameId}/boxscore`;
}
function landingUrl(gameId) {
    return `${BASE_URL}/v1/gamecenter/${gameId}/landing`;
}
function goalReplayUrl(gameId, eventNumber) {
    return `${BASE_URL}/v1/ppt-replay/goal/${gameId}/${eventNumber}`;
}
function tvScheduleNowUrl() {
    return `${BASE_URL}/v1/network/tv-schedule/now`;
}
function tvScheduleDateUrl(date) {
    return `${BASE_URL}/v1/network/tv-schedule/${date}`;
}
function clubStatsUrl(teamCode) {
    return `${BASE_URL}/v1/club-stats/${teamCode}/now`;
}
function gamecenterWebUrl(gameId) {
    return `https://www.nhl.com/gamecenter/${gameId}`;
}
//# sourceMappingURL=endpoints.js.map