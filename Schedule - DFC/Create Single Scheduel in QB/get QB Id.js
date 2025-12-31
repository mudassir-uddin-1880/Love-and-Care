var retunPushedQBSchedule = input.retunPushedQBSchedule || {};

var qbId = 0;
if (
    retunPushedQBSchedule &&
    retunPushedQBSchedule.results &&
    retunPushedQBSchedule.results.schedule_events
) {
    var events = retunPushedQBSchedule.results.schedule_events;
    for (var key in events) {
        if (events.hasOwnProperty(key) && events[key].id) {
            qbId = events[key].id;
            break;
        }
    }
}
return qbId;