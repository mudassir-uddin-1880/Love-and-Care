var assignCaregiverData = input.assignCaregiver;
var clientData = input.allClientsScheduleData;
var currentDate = input.currDate;

var summary = [];
// Create a comprehensive summary of the assignment data
// Add the date parsing function at the top
function getNewDate(date) {
    if (!date) return null;

    var dateObj;
    var parts;

    if (date.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
        parts = date.split(" ")[0].split("-");
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parts = date.split("-");
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else if (date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        parts = date.split("/");
        dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (date.match(/^\d{2}-\d{2}-\d{4}$/)) {
        parts = date.split("-");
        dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        parts = date.split("/");
        dateObj = new Date(parts[2], parts[0] - 1, parts[1]);
    } else if (date.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
        parts = date.split("/");
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
        return null;
    }

    if (isNaN(dateObj.getTime())) return null;

    var shipYear = dateObj.getFullYear();
    var shipMonth = (dateObj.getMonth() + 1) > 9 ? (dateObj.getMonth() + 1).toString() : "0" + (dateObj.getMonth() + 1);
    var shipDay = dateObj.getDate() > 9 ? dateObj.getDate().toString() : "0" + dateObj.getDate();

    return shipYear + "-" + shipMonth + "-" + shipDay;
}

// Function to calculate hours between start and end time
function calculateHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;

    var start = startTime.split(':');
    var end = endTime.split(':');

    var startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
    var endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);

    var diffMinutes = endMinutes - startMinutes;
    return diffMinutes / 60;
}

// Function to split time range into start and end times
function splitTimeRange(timeRange) {
    if (!timeRange) return { startTime: "", endTime: "" };

    var parts = timeRange.split(' - ');
    if (parts.length === 2) {
        return {
            startTime: parts[0].trim(),
            endTime: parts[1].trim()
        };
    }
    return { startTime: "", endTime: "" };
}

// Create client lookup map from allClientsScheduleData
var clientLookup = {};
for (var idx = 0; idx < clientData.length; idx++) {
    var client = clientData[idx];
    clientLookup[client.id] = {
        id: client.id || "",
        name: (client.fields.Client_Full_Name ? client.fields.Client_Full_Name.value : "") || "",
        gender: (client.fields.Gender ? client.fields.Gender.value : "") || "",
        clientId: (client.fields.ID ? client.fields.ID.value : "") || "",
        primaryCaregiver: (client.fields.Primary_Caregiver ? client.fields.Primary_Caregiver.value : "") || "",
        secondaryCaregiver: (client.fields.Secondary_Caregiver ? client.fields.Secondary_Caregiver.value : "") || "",
        tertiaryCaregiver: (client.fields.Tertiary_Caregiver ? client.fields.Tertiary_Caregiver.value : "") || "",
        defaultServiceType: (client.fields.Default_Service_Type ? client.fields.Default_Service_Type.value : "") || "",
        jobCodeId: (client.fields.JobCode_Id ? client.fields.JobCode_Id.value : "") || "" // <-- added
    };
}

summary = {
    // All scheduled services consolidated
    allSchedules: [],
    // All conflicts consolidated
    allConflicts: [],
    // All availability issues consolidated
    allAvailabilityIssues: [],
    // NEW: combined conflicts + availability issues (filtered by schedules we actually use)
    allConflictsAndAvailabilityIssues: [],
    // Client-wise breakdown
    clientBreakdown: [],
    // Caregiver utilization
    caregiverUtilization: assignCaregiverData.caregiverUtilization || {},
    // Global statistics
    globalStats: assignCaregiverData.globalSummary || {},
    // Debug information
    debugInfo: assignCaregiverData.debug || {}
};
var combinedIssuesSource = Array.isArray(assignCaregiverData.conflictsAndAvailabilityIssues)
    ? assignCaregiverData.conflictsAndAvailabilityIssues
    : [];

function buildFilteredCombinedIssues(schedules, combined) {
    if (!Array.isArray(schedules) || !schedules.length || !Array.isArray(combined) || !combined.length) {
        return [];
    }

    function splitTimeRangeLocal(timeRange) {
        if (!timeRange || typeof timeRange !== 'string') return { startTime: '', endTime: '' };
        var parts = timeRange.split(' - ');
        return parts.length === 2
            ? { startTime: (parts[0] || '').trim(), endTime: (parts[1] || '').trim() }
            : { startTime: '', endTime: '' };
    }
    function makeSchedKey(clientId, date, start, end) {
        return [String(clientId || ''), String(date || ''), String(start || ''), String(end || '')].join('|');
    }
    function makeDateTimeKey(date, start, end) {
        return [String(date || ''), String(start || ''), String(end || '')].join('|');
    }

    // Build lookups for schedules actually present
    var usedSchedKeys = Object.create(null);
    var usedDateTimeKeys = Object.create(null);
    for (var i = 0; i < schedules.length; i++) {
        var s = schedules[i];
        var kFull = makeSchedKey(s.clientId, s.startDate, s.startTime, s.endTime);
        var kDT = makeDateTimeKey(s.startDate, s.startTime, s.endTime);
        usedSchedKeys[kFull] = true;
        usedDateTimeKeys[kDT] = true;
    }

    var out = [];
    var dedupe = Object.create(null);

    for (var j = 0; j < combined.length; j++) {
        var issue = combined[j];
        if (!issue || !issue.issueType) continue;

        var include = false;

        if (issue.issueType === 'availability') {
            // Expect: clientId, date, timeSlot
            var dateA = issue.date || '';
            var clientIdA = issue.clientId || '';
            var tA = splitTimeRangeLocal(issue.timeSlot || '');
            if (dateA && clientIdA && tA.startTime && tA.endTime) {
                var keyA = makeSchedKey(clientIdA, dateA, tA.startTime, tA.endTime);
                include = !!usedSchedKeys[keyA];
            }
        } else if (issue.issueType === 'conflict') {
            var dateC = issue.date || '';
            // Try conflicting side (clientId + conflictingTimeSlot)
            var tConf = splitTimeRangeLocal(issue.conflictingTimeSlot || '');
            if (dateC && issue.conflictingClientId && tConf.startTime && tConf.endTime) {
                var keyC = makeSchedKey(issue.conflictingClientId, dateC, tConf.startTime, tConf.endTime);
                include = !!usedSchedKeys[keyC];
            }
            // Fallback: try target side (date + targetTimeSlot only)
            if (!include) {
                var tTarget = splitTimeRangeLocal(issue.targetTimeSlot || '');
                if (dateC && tTarget.startTime && tTarget.endTime) {
                    var keyT = makeDateTimeKey(dateC, tTarget.startTime, tTarget.endTime);
                    include = !!usedDateTimeKeys[keyT];
                }
            }
        }

        if (include) {
            // Normalize copy and dedupe
            var copy = {};
            for (var prop in issue) {
                if (Object.prototype.hasOwnProperty.call(issue, prop)) {
                    copy[prop] = issue[prop] || (prop === 'date' ? null : '');
                }
            }
            var uKey = JSON.stringify(copy);
            if (!dedupe[uKey]) {
                out.push(copy);
                dedupe[uKey] = true;
            }
        }
    }

    return out;
}

summary.allConflictsAndAvailabilityIssues = buildFilteredCombinedIssues(summary.allSchedules, combinedIssuesSource);


// Process each client assignment
for (var i = 0; i < assignCaregiverData.allClientAssignments.length; i++) {
    var client = assignCaregiverData.allClientAssignments[i];

    // Add all scheduled services to consolidated list
    for (var j = 0; j < client.scheduledServices.length; j++) {
        var service = client.scheduledServices[j];
        var timeSplit = splitTimeRange(service.serviceTime);
        var hours = calculateHours(timeSplit.startTime, timeSplit.endTime);

        // NEW: carry forward hour-related fields and useful deltas
        var caregiverScheduledHours = Number(service.caregiverScheduledHours) || 0;
        var clientRequestedHours = Number(service.clientRequestedHours) || 0;
        var hoursDeltaScheduledMinusCalculated = caregiverScheduledHours - (hours || 0);
        var hoursDeltaRequestedMinusCalculated = clientRequestedHours - (hours || 0);
        var hoursDeltaScheduledMinusRequested = caregiverScheduledHours - clientRequestedHours;

        // NEW: per-schedule availability issues count (numeric)
        var scheduleAvailabilityIssues = 0;
        if (typeof service.availabilityIssuesCount === 'number') {
            scheduleAvailabilityIssues = service.availabilityIssuesCount;
        } else if (Array.isArray(service.availabilityIssues)) {
            scheduleAvailabilityIssues = service.availabilityIssues.length;
        } else if (service.availabilityIssues && Array.isArray(service.availabilityIssues.details)) {
            scheduleAvailabilityIssues = service.availabilityIssues.details.length;
        } else if (service.availabilityIssue) {
            // presence of a single availability issue flag (e.g., "partial_availability_issues")
            scheduleAvailabilityIssues = 1;
        }

        // Determine schedule status
        var scheduleStatus = "Scheduled Completed";
        if (service.caregiverName === "Unassigned" || !service.caregiverName) {
            scheduleStatus = "Caregiver No Show";
        }

        // Get client details from lookup
        var clientDetails = clientLookup[client.clientId] || {};
        var resolvedJobCodeId = (service.jobCodeId || client.jobCodeId || clientDetails.jobCodeId || 0);

        summary.allSchedules.push({
            clientId: client.clientId || "",
            clientName: client.clientName || "",
            caregiverName: service.caregiverName || "",
            caregiverQBID: service.caregiverQBID || 0,
            caregiverEmployeeId: service.caregiverEmployeeId || "",
            startDate: service.date || null,
            endDate: service.date || null,
            day: service.day || "",
            serviceTime: service.serviceTime || "",
            startTime: timeSplit.startTime || "",
            endTime: timeSplit.endTime || "",
            hours: hours || 0,
            // NEW hour-related fields
            caregiverScheduledHours: caregiverScheduledHours,
            clientRequestedHours: clientRequestedHours,
            hoursDeltaScheduledMinusCalculated: hoursDeltaScheduledMinusCalculated,
            hoursDeltaRequestedMinusCalculated: hoursDeltaRequestedMinusCalculated,
            hoursDeltaScheduledMinusRequested: hoursDeltaScheduledMinusRequested,
            // NEW: numeric availability issues count per schedule
            scheduleavailabilityissues: scheduleAvailabilityIssues,

            shiftStatus: service.shiftStatus || "",
            scheduleStatus: scheduleStatus || "",
            conflictsCount: service.conflictsCount || 0,
            availabilityIssue: service.availabilityIssue || "",
            jobCodeId: resolvedJobCodeId || "",
            // Include client details in each schedule record
            clientDetails: {
                id: clientDetails.id || client.clientId || "",
                name: clientDetails.name || client.clientName || "",
                gender: clientDetails.gender || "",
                clientId: clientDetails.clientId || "",
                primaryCaregiver: clientDetails.primaryCaregiver || "",
                secondaryCaregiver: clientDetails.secondaryCaregiver || "",
                tertiaryCaregiver: clientDetails.tertiaryCaregiver || "",
                defaultServiceType: clientDetails.defaultServiceType || "",
                jobCodeId: resolvedJobCodeId || 0
            }
        });
    }


    // Add client-specific conflicts to consolidated list
    for (var k = 0; k < client.conflicts.details.length; k++) {
        var conflict = client.conflicts.details[k];
        var conflictCopy = {};
        for (var prop in conflict) {
            if (conflict.hasOwnProperty(prop)) {
                conflictCopy[prop] = conflict[prop] || (prop === 'date' ? null : "");
            }
        }
        conflictCopy.clientId = client.clientId || "";
        conflictCopy.clientName = client.clientName || "";
        summary.allConflicts.push(conflictCopy);
    }

    // Add client-specific availability issues to consolidated list
    for (var l = 0; l < client.availabilityIssues.details.length; l++) {
        var issue = client.availabilityIssues.details[l];
        var issueCopy = {};
        for (var prop in issue) {
            if (issue.hasOwnProperty(prop)) {
                issueCopy[prop] = issue[prop] || (prop === 'date' ? null : "");
            }
        }
        issueCopy.clientId = client.clientId || "";
        issueCopy.clientName = client.clientName || "";
        summary.allAvailabilityIssues.push(issueCopy);
    }

    // Add client breakdown
    summary.clientBreakdown.push({
        clientId: client.clientId || "",
        clientName: client.clientName || "",
        primaryCaregiverName: client.primaryCaregiverName || "",
        primaryAvailable: client.primaryAvailable || false,
        caregiverRanking: client.caregiverRanking || [],
        clientCaregiverHours: client.clientCaregiverHours || {},
        summary: client.summary || {}
    });
}

// Add global conflicts and availability issues if they exist
if (assignCaregiverData.conflicts && assignCaregiverData.conflicts.details) {
    for (var m = 0; m < assignCaregiverData.conflicts.details.length; m++) {
        var conflict = assignCaregiverData.conflicts.details[m];
        var conflictExists = false;

        for (var n = 0; n < summary.allConflicts.length; n++) {
            var c = summary.allConflicts[n];
            if ((c.caregiverName || "") === (conflict.caregiverName || "") &&
                (c.date || null) === (conflict.date || null) &&
                (c.conflictingClientId || "") === (conflict.conflictingClientId || "")) {
                conflictExists = true;
                break;
            }
        }

        if (!conflictExists) {
            var globalConflict = {};
            for (var prop in conflict) {
                if (conflict.hasOwnProperty(prop)) {
                    globalConflict[prop] = conflict[prop] || (prop === 'date' ? null : "");
                }
            }
            summary.allConflicts.push(globalConflict);
        }
    }
}

if (assignCaregiverData.availabilityIssues && assignCaregiverData.availabilityIssues.details) {
    for (var o = 0; o < assignCaregiverData.availabilityIssues.details.length; o++) {
        var issue = assignCaregiverData.availabilityIssues.details[o];
        var issueExists = false;

        for (var p = 0; p < summary.allAvailabilityIssues.length; p++) {
            var i = summary.allAvailabilityIssues[p];
            if ((i.caregiverName || "") === (issue.caregiverName || "") &&
                (i.date || null) === (issue.date || null) &&
                (i.clientId || "") === (issue.clientId || "")) {
                issueExists = true;
                break;
            }
        }

        if (!issueExists) {
            var globalIssue = {};
            for (var prop in issue) {
                if (issue.hasOwnProperty(prop)) {
                    globalIssue[prop] = issue[prop] || (prop === 'date' ? null : "");
                }
            }
            summary.allAvailabilityIssues.push(globalIssue);
        }
    }
}

// Sort schedules by date and time - using getNewDate to parse dates
summary.allSchedules.sort(function (a, b) {
    var dateA = getNewDate(a.startDate);
    var dateB = getNewDate(b.startDate);
    if (dateA !== dateB) {
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
        return 0;
    }
    return (a.serviceTime || "").localeCompare(b.serviceTime || "");
});

// Sort conflicts by date - using getNewDate to parse dates
summary.allConflicts.sort(function (a, b) {
    var dateA = getNewDate(a.date);
    var dateB = getNewDate(b.date);
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
    return 0;
});

// Sort availability issues by date - using getNewDate to parse dates
summary.allAvailabilityIssues.sort(function (a, b) {
    var dateA = getNewDate(a.date);
    var dateB = getNewDate(b.date);
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
    return 0;
});

// Sort combined issues by date then time
summary.allConflictsAndAvailabilityIssues.sort(function (a, b) {
    var da = getNewDate(a.date);
    var db = getNewDate(b.date);
    if (da < db) return -1;
    if (da > db) return 1;
    function getTimeRange(x) {
        var tr = x.timeSlot || x.targetTimeSlot || x.conflictingTimeSlot || '';
        var parts = tr.split(' - ');
        return parts.length === 2 ? parts[0] + '-' + parts[1] : tr;
    }
    return getTimeRange(a).localeCompare(getTimeRange(b));
});

// Add current date to all schedules
for (var q = 0; q < summary.allSchedules.length; q++) {
    summary.allSchedules[q].currDate = currentDate || null;
}

// -------------------------- NEW: API payload format --------------------------
function pad2(n) { n = parseInt(n, 10) || 0; return n < 10 ? '0' + n : '' + n; }
function ensureHHMM(t) {
    if (!t) return '00:00';
    var p = ('' + t).split(':');
    return pad2(p[0]) + ':' + pad2(p[1] || 0);
}
function toIsoWithZ(dateStr, timeStr) {
    var d = getNewDate(dateStr) || dateStr || '';
    var tt = ensureHHMM(timeStr);
    // Output: YYYY-MM-DDTHH:mm:00+00:00
    return d + 'T' + tt + ':00+00:00';
}
// Deterministic unique numeric id generator (djb2 hash), avoids duplicates in one run
function makeUniqueId(seed, usedMap) {
    var str = String(seed || '');
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
        hash = hash | 0; // 32-bit
    }
    var id = Math.abs(hash % 900000000) + 100000000; // 9-digit
    while (usedMap[id]) { id = (id + 1) % 2000000000; if (id < 100000000) id += 100000000; }
    usedMap[id] = true;
    return id;
}

(function buildApiCalendarPayload() {
    var usedScheduleIds = {};
    var events = [];

    for (var i = 0; i < summary.allSchedules.length; i++) {
        var s = summary.allSchedules[i];
        // Require dates and times
        if (!s.startDate || !s.endDate || !s.startTime || !s.endTime) continue;

        var key = [s.clientId, s.startDate, s.startTime, s.endDate, s.endTime, s.caregiverName || ''].join('|');
        var scheduleId = makeUniqueId('sched|' + key, usedScheduleIds);

        // Use caregiverQBID if available, otherwise use a fallback or empty string
        var assignedUserId = s.caregiverQBID || 0;

        // Normalize job code id (keep as string if non-numeric)
        var jobcodeIdVal = s.jobCodeId || 0;
        var parsedJc = parseInt(jobcodeIdVal, 10);
        if (!isNaN(parsedJc)) jobcodeIdVal = parsedJc;

        events.push({
            schedule_calendar_id: 162057,
            start: toIsoWithZ(s.startDate, s.startTime),
            end: toIsoWithZ(s.endDate, s.endTime),
            assigned_user_ids: assignedUserId,
            jobcode_id: jobcodeIdVal,
            title: s.shiftStatus || 'Scheduled',
            draft: true,
            active: true
        });
    }

    summary.calendarPayload = {
        data: events,
        team_events: 'base'
    };
})();


// Return the organized summary
return summary;