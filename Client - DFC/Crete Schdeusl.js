// Merge pushed schedule events into summarizeData while keeping the summarizeData shape

var summarizeData = input.summarizeData || {};
var pushedSchedulesArr = Array.isArray(input.retunPushedQBSchedules) ? input.retunPushedQBSchedules : [];
var currDate = input.currDate;
var calendarItems = summarizeData.calendarPayload && summarizeData.calendarPayload.data || [];
var currDateAndTime = input.currDateAndTime || "";  // eg: "2025-12-10 10:55:41"
var extractedTime = currDateAndTime.split(' ')[1]; // Extracts "10:55:41"

// Helper function to get object values (js2py doesn't support Object.values)
function getObjectValues(obj) {
    var values = [];
    for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            values.push(obj[key]);
        }
    }
    return values;
}

// Simple left-pad to 2 chars (avoids padStart which js2py lacks)
function pad2(v) {
    v = String(v == null ? '' : v);
    return ('00' + v).slice(-2);
}

function buildDateTimeString(startDate, startTime) {
    if (!startDate || !startTime) return null;
    var timeParts = String(startTime).split(':');
    var hour = pad2(timeParts[0] || '00');
    var minute = pad2(timeParts[1] || '00');
    return startDate + 'T' + hour + ':' + minute + ':00+00:00';
}

var clientIds = {};
var caregiverIds = {};

// Index schedule events by start|end ISO for fast lookup
var eventIndex = {};

// QB Details - summary of QuickBooks push operations
var qbDetails = {
    totalPushed: 0,
    pushSuccess: 0,
    pushFailed: 0,
    pendingPush: 0,
    syncedWithQB: 0,
    notSyncedWithQB: 0,
    lastSyncTime: "",
    errorLogs: [],
    pushDate: null,
    pushTime: null,
    mode: "Create Record",
    clients: [],
    caregivers: [],
    failureReasons: []
};

// Process pushed schedules and build index
for (var arrIdx = 0; arrIdx < pushedSchedulesArr.length; arrIdx++) {
    var pushedItem = pushedSchedulesArr[arrIdx];
    if (!pushedItem || !pushedItem.results) continue;

    var scheduleEventsObj = pushedItem.results.schedule_events || {};
    var supplemental = pushedItem.supplemental_data || {};

    for (var k in scheduleEventsObj) {
        if (!Object.prototype.hasOwnProperty.call(scheduleEventsObj, k)) continue;

        var ev = scheduleEventsObj[k];

        // Set push date/time from first event
        if (!qbDetails.pushDate && ev.created) {
            var dt = new Date(ev.created.replace('+00:00', 'Z'));
            qbDetails.pushDate = dt.toISOString().slice(0, 10);
            qbDetails.pushTime = dt.toISOString().slice(11, 19);
            qbDetails.lastSyncTime = ev.created;
        }

        qbDetails.totalPushed++;

        // Count different types of QB operations
        if (ev._status_message === "Created") {
            qbDetails.pushSuccess++;
            qbDetails.syncedWithQB++;
        } else if (ev._status_message && ev._status_message !== "Created") {
            qbDetails.pushFailed++;
            qbDetails.notSyncedWithQB++;
            if (qbDetails.failureReasons.indexOf(ev._status_message) === -1) {
                qbDetails.failureReasons.push(ev._status_message);
                qbDetails.errorLogs.push("Event " + ev.id + ": " + ev._status_message);
            }
        }

        // Build index key using QB event's start/end times
        var eventStartIso = null;
        var eventEndIso = null;

        // QB events have start/end in ISO format
        if (ev.start && ev.end) {
            eventStartIso = ev.start;
            eventEndIso = ev.end;
            var eventKey = eventStartIso + '|' + eventEndIso;
            eventIndex[eventKey] = ev;
        }

        // Collect caregiver
        if (ev.id && supplemental.users && supplemental.users[ev.user_id]) {
            caregiverIds[ev.user_id] = ev.id;
        }

        // Collect client from jobcodes (contains actual client details)
        if (ev.jobcode_id && supplemental.jobcodes && supplemental.jobcodes[ev.jobcode_id]) {
            clientIds[ev.jobcode_id] = supplemental.jobcodes[ev.jobcode_id];
        }

        // Also collect calendar info as backup
        if (ev.schedule_calendar_id && supplemental.calendars && supplemental.calendars[ev.schedule_calendar_id]) {
            if (!clientIds[ev.schedule_calendar_id]) {
                clientIds[ev.schedule_calendar_id] = supplemental.calendars[ev.schedule_calendar_id];
            }
        }
    }
}

// Index calendar payload by start|end ISO for fast lookup
var calendarIndex = {};
for (var i = 0; i < calendarItems.length; i++) {
    var ci = calendarItems[i];
    if (ci && ci.start && ci.end) {
        calendarIndex[ci.start + '|' + ci.end] = ci;
    }
}

// Schedule Details - comprehensive summary of all schedule data
var scheduleDetails = {
    totalSchedules: 0,
    openShifts: 0,
    assignedShifts: 0,
    unassignedShifts: 0,
    ghostShifts: {
        total: 0,
        assigned: 0,
        unassigned: 0
    },
    completedShifts: 0,
    pendingShifts: 0,
    cancelledShifts: 0,
    overlappingShifts: 0,
    duplicateShifts: 0,
    withPushData: 0,
    withoutPushData: 0,
    availabilityIssues: 0,
    conflicts: 0,
    dayWiseBreakdown: {
        Monday: { total: 0, ghost: 0, assigned: 0, conflicts: 0 },
        Tuesday: { total: 0, ghost: 0, assigned: 0, conflicts: 0 },
        Wednesday: { total: 0, ghost: 0, assigned: 0, conflicts: 0 },
        Thursday: { total: 0, ghost: 0, assigned: 0, conflicts: 0 },
        Friday: { total: 0, ghost: 0, assigned: 0, conflicts: 0 },
        Saturday: { total: 0, ghost: 0, assigned: 0, conflicts: 0 },
        Sunday: { total: 0, ghost: 0, assigned: 0, conflicts: 0 }
    },
    clientBreakdown: {},
    caregiverBreakdown: {},
    otherNotes: "Analysis includes ghost shifts, regular assignments, and QB sync status"
};

// Build merged allSchedules preserving summarizeData format
var mergedAllSchedules = [];
var sourceSchedules = Array.isArray(summarizeData.allSchedules) ? summarizeData.allSchedules : [];

scheduleDetails.totalSchedules = sourceSchedules.length;

// Track time conflicts by checking overlapping schedules
var schedulesByDay = {};

for (var s = 0; s < sourceSchedules.length; s++) {
    var sched = sourceSchedules[s];

    var startIso = buildDateTimeString(sched.startDate, sched.startTime);
    var endIso = buildDateTimeString(sched.endDate, sched.endTime);
    var key = (startIso || '') + '|' + (endIso || '');

    // Deep clone summarize schedule to preserve its format/keys
    var merged = JSON.parse(JSON.stringify(sched));

    // Track day-wise breakdown
    var day = sched.day || 'Unknown';
    if (scheduleDetails.dayWiseBreakdown[day]) {
        scheduleDetails.dayWiseBreakdown[day].total++;
    }

    // Count conflicts from the schedule data
    if (sched.conflictsCount && sched.conflictsCount > 0) {
        scheduleDetails.conflicts += sched.conflictsCount;
        if (scheduleDetails.dayWiseBreakdown[day]) {
            scheduleDetails.dayWiseBreakdown[day].conflicts += sched.conflictsCount;
        }
    }

    // Count availability issues
    if (sched.scheduleavailabilityissues && sched.scheduleavailabilityissues > 0) {
        scheduleDetails.availabilityIssues += sched.scheduleavailabilityissues;
    }

    // Categorize schedule types
    var isGhostShift = sched.isGhostShift || (sched.shiftStatus && sched.shiftStatus.indexOf("Ghost") !== -1);
    var isAssigned = sched.caregiverName && sched.caregiverName !== "";
    var isUnassigned = sched.scheduleStatus && sched.scheduleStatus.indexOf("Unassigned") !== -1;
    var isCompleted = sched.scheduleStatus && sched.scheduleStatus.indexOf("Completed") !== -1;

    if (isGhostShift) {
        scheduleDetails.ghostShifts.total++;
        if (scheduleDetails.dayWiseBreakdown[day]) {
            scheduleDetails.dayWiseBreakdown[day].ghost++;
        }

        if (isAssigned || sched.scheduleStatus.indexOf("Assigned") !== -1) {
            scheduleDetails.ghostShifts.assigned++;
        } else {
            scheduleDetails.ghostShifts.unassigned++;
            scheduleDetails.unassignedShifts++;
        }
    } else if (isAssigned) {
        scheduleDetails.assignedShifts++;
        if (scheduleDetails.dayWiseBreakdown[day]) {
            scheduleDetails.dayWiseBreakdown[day].assigned++;
        }
    } else if (isUnassigned) {
        scheduleDetails.unassignedShifts++;
    }

    if (isCompleted) {
        scheduleDetails.completedShifts++;
    } else if (sched.scheduleStatus && sched.scheduleStatus !== "") {
        scheduleDetails.pendingShifts++;
    }

    // Track client breakdown
    if (sched.clientName) {
        if (!scheduleDetails.clientBreakdown[sched.clientName]) {
            scheduleDetails.clientBreakdown[sched.clientName] = { total: 0, hours: 0 };
        }
        scheduleDetails.clientBreakdown[sched.clientName].total++;
        if (sched.hours) {
            // Round to one decimal place
            scheduleDetails.clientBreakdown[sched.clientName].hours += Math.round(sched.hours * 10) / 10;
        }
    }

    // Track caregiver breakdown
    if (sched.caregiverName) {
        if (!scheduleDetails.caregiverBreakdown[sched.caregiverName]) {
            scheduleDetails.caregiverBreakdown[sched.caregiverName] = { total: 0, hours: 0 };
        }
        scheduleDetails.caregiverBreakdown[sched.caregiverName].total++;
        if (sched.caregiverScheduledHours) {
            // Round to one decimal place
            scheduleDetails.caregiverBreakdown[sched.caregiverName].hours += Math.round(sched.caregiverScheduledHours * 10) / 10;
        }
    }

    // Check for overlapping schedules (same day, overlapping times)
    var dayKey = sched.startDate;
    if (!schedulesByDay[dayKey]) {
        schedulesByDay[dayKey] = [];
    }

    // Simple overlap detection
    for (var existingIdx = 0; existingIdx < schedulesByDay[dayKey].length; existingIdx++) {
        var existing = schedulesByDay[dayKey][existingIdx];
        if (sched.caregiverName && existing.caregiverName === sched.caregiverName) {
            // Check for time overlap
            var schedStart = parseInt(sched.startTime.replace(':', ''));
            var schedEnd = parseInt(sched.endTime.replace(':', ''));
            var existStart = parseInt(existing.startTime.replace(':', ''));
            var existEnd = parseInt(existing.endTime.replace(':', ''));

            if ((schedStart < existEnd && schedEnd > existStart)) {
                scheduleDetails.overlappingShifts++;
                break;
            }
        }
    }
    schedulesByDay[dayKey].push(sched);

    // Attach matched pushed schedule event (kept nested so format remains intact)
    if (eventIndex[key]) {
        merged.scheduleEvent = eventIndex[key];
        scheduleDetails.withPushData++;
    } else {
        scheduleDetails.withoutPushData++;
    }

    // Attach matched calendar item (optional)
    if (calendarIndex[key]) {
        merged.calendarItem = calendarIndex[key];
    }

    mergedAllSchedules.push(merged);
}
// Add extracted time to each schedule in mergedAllSchedules
for (var s = 0; s < mergedAllSchedules.length; s++) {
    mergedAllSchedules[s].extractedTime = extractedTime; // Add the time to each schedule
}

// Calculate open shifts (unassigned non-ghost shifts)
scheduleDetails.openShifts = scheduleDetails.unassignedShifts - scheduleDetails.ghostShifts.unassigned;
if (scheduleDetails.openShifts < 0) scheduleDetails.openShifts = 0;

// Return summarizeData shape with enriched allSchedules
var mergedResult = {};
for (var prop in summarizeData) {
    if (Object.prototype.hasOwnProperty.call(summarizeData, prop)) {
        mergedResult[prop] = summarizeData[prop];
    }
}

// Use custom helper function instead of Object.values()
qbDetails.clients = getObjectValues(clientIds);
qbDetails.caregivers = getObjectValues(caregiverIds);

mergedResult.allSchedules = mergedAllSchedules;

// Convert summary objects to formatted strings
var scheduleDetailsString = "Schedule Summary:\n";
// scheduleDetailsString += "Total Schedules: " + scheduleDetails.totalSchedules + "\n";
// scheduleDetailsString += "Assigned Shifts: " + scheduleDetails.assignedShifts + "\n";
// scheduleDetailsString += "Unassigned Shifts: " + scheduleDetails.unassignedShifts + "\n";
// scheduleDetailsString += "Open Shifts: " + scheduleDetails.openShifts + "\n";
// scheduleDetailsString += "Ghost Shifts - Total: " + scheduleDetails.ghostShifts.total + " (Assigned: " + scheduleDetails.ghostShifts.assigned + ", Unassigned: " + scheduleDetails.ghostShifts.unassigned + ")\n";
// scheduleDetailsString += "Completed Shifts: " + scheduleDetails.completedShifts + "\n";
// scheduleDetailsString += "Pending Shifts: " + scheduleDetails.pendingShifts + "\n";
// scheduleDetailsString += "Conflicts: " + scheduleDetails.conflicts + "\n";
// scheduleDetailsString += "Availability Issues: " + scheduleDetails.availabilityIssues + "\n";
// scheduleDetailsString += "Overlapping Shifts: " + scheduleDetails.overlappingShifts + "\n";
// scheduleDetailsString += "With Push Data: " + scheduleDetails.withPushData + "\n";
// scheduleDetailsString += "Without Push Data: " + scheduleDetails.withoutPushData + "\n\n";

scheduleDetailsString += "Day-wise Breakdown:\n";
for (var day in scheduleDetails.dayWiseBreakdown) {
    var dayData = scheduleDetails.dayWiseBreakdown[day];
    scheduleDetailsString += day + ": Total=" + dayData.total + ", Ghost=" + dayData.ghost + ", Assigned=" + dayData.assigned + ", Conflicts=" + dayData.conflicts + "\n";
}

scheduleDetailsString += "\nClient Breakdown:\n";
for (var client in scheduleDetails.clientBreakdown) {
    var clientData = scheduleDetails.clientBreakdown[client];
    scheduleDetailsString += client + ": " + clientData.total + " shifts, " + clientData.hours + " hours\n";
}

scheduleDetailsString += "\nCaregiver Breakdown:\n";
for (var caregiver in scheduleDetails.caregiverBreakdown) {
    var caregiverData = scheduleDetails.caregiverBreakdown[caregiver];
    scheduleDetailsString += caregiver + ": " + caregiverData.total + " shifts, " + caregiverData.hours + " hours\n";
}

var qbDetailsString = "QuickBooks Summary:\n";
// qbDetailsString += "Total Pushed: " + qbDetails.totalPushed + "\n";
// qbDetailsString += "Push Success: " + qbDetails.pushSuccess + "\n";
// qbDetailsString += "Push Failed: " + qbDetails.pushFailed + "\n";
qbDetailsString += "Synced with QB: " + qbDetails.syncedWithQB + "\n";
qbDetailsString += "Not Synced with QB: " + qbDetails.notSyncedWithQB + "\n";
qbDetailsString += "Push Date: " + (qbDetails.pushDate || "N/A") + "\n";
qbDetailsString += "Push Time: " + (qbDetails.pushTime || "N/A") + "\n";
var lastSyncTimeOnly = qbDetails.lastSyncTime ? qbDetails.lastSyncTime.slice(11, 19) : "N/A";
qbDetailsString += "Last Sync Time: " + lastSyncTimeOnly + "\n";
qbDetailsString += "Mode: " + qbDetails.mode + "\n";

if (qbDetails.failureReasons.length > 0) {
    qbDetailsString += "Failure Reasons: " + qbDetails.failureReasons.join(", ") + "\n";
}

if (qbDetails.errorLogs.length > 0) {
    qbDetailsString += "Error Logs: " + qbDetails.errorLogs.join("; ") + "\n";
}

qbDetailsString += "Clients Involved: " + qbDetails.clients.length + "\n";
qbDetailsString += "Caregivers Involved: " + qbDetails.caregivers.length + "\n";

// Add the string versions to a connectlog object with data array
var connectLog = {
    data: [
        {
            "Details": scheduleDetailsString,
            "currentdate": currDate,
            "totalSchedules": scheduleDetails.totalSchedules,
            "assignedShifts": scheduleDetails.assignedShifts,
            "unassignedShifts": scheduleDetails.unassignedShifts,
            "openShifts": scheduleDetails.openShifts,
            "ghostShiftsTotal": scheduleDetails.ghostShifts.total,
            "ghostShiftsAssigned": scheduleDetails.ghostShifts.assigned,
            "ghostShiftsUnassigned": scheduleDetails.ghostShifts.unassigned,
            "conflicts": scheduleDetails.conflicts,
            "availabilityIssues": scheduleDetails.availabilityIssues,
            "overlappingShifts": scheduleDetails.overlappingShifts,
            "withPushData": scheduleDetails.withPushData,
            "withoutPushData": scheduleDetails.withoutPushData,
            "dayWiseBreakdown": scheduleDetails.dayWiseBreakdown,
            "clientBreakdown": scheduleDetails.clientBreakdown,
            "caregiverBreakdown": scheduleDetails.caregiverBreakdown,
            "Log_Type": "Internal Schedule",
            "Connection_Type": "Internal",
            "Mode_of_Connection": "",
            "pushTime": "",
            "failureReasons": "",
            "pushDate": "",
            "errorLogs": "",
            "totalPushed": 0,
            "pushSuccess": 0,
            "pushFailed": 0,
            "syncedWithQB": 0,
            "notSyncedWithQB": 0,
            "lastSyncTime": "",
            "clientsInvolved": "",
            "caregiversInvolved": "",
            "clients": "",
            "caregivers": "",
            "mode": ""
        },
        {
            "Details": qbDetailsString,
            "currentdate": qbDetails.pushDate,
            "totalSchedules": 0,
            "assignedShifts": 0,
            "unassignedShifts": 0,
            "openShifts": 0,
            "ghostShiftsTotal": 0,
            "ghostShiftsAssigned": 0,
            "ghostShiftsUnassigned": 0,
            "completedShifts": 0,
            "pendingShifts": 0,
            "conflicts": 0,
            "availabilityIssues": 0,
            "overlappingShifts": 0,
            "withPushData": 0,
            "withoutPushData": 0,
            "dayWiseBreakdown": "",
            "clientBreakdown": "",
            "caregiverBreakdown": "",
            "Log_Type": "Third Party",
            "Connection_Type": "QB Time",
            "Mode_of_Connection": "Create Schedule",
            "pushTime": qbDetails.pushTime,
            "totalPushed": qbDetails.totalPushed,
            "pushSuccess": qbDetails.pushSuccess,
            "pushFailed": qbDetails.pushFailed,
            "syncedWithQB": qbDetails.syncedWithQB,
            "notSyncedWithQB": qbDetails.notSyncedWithQB,
            "pushDate": qbDetails.pushDate,
            "lastSyncTime": qbDetails.lastSyncTime,
            "failureReasons": qbDetails.failureReasons,
            "errorLogs": qbDetails.errorLogs,
            "clientsInvolved": qbDetails.clients.length,
            "caregiversInvolved": qbDetails.caregivers.length,
            "clients": qbDetails.clients,
            "caregivers": qbDetails.caregivers,
            "mode": qbDetails.mode
        }
    ]
};

mergedResult.connectlog = connectLog;

// Keep backward compatibility
mergedResult.pushSummary = qbDetails; // Legacy field
mergedResult.allSchedulesSummary = scheduleDetails; // Legacy field

// Optionally include original pushed schedules and supplemental data
mergedResult.retunPushedQBSchedules = input.retunPushedQBSchedules || {};

return mergedResult;