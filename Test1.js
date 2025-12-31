// Emergency Leave Replacement Handler - Complete with User ID (CORRECTED)
var caregiverData = input.caregiverData;
var currDate = input.currDate || '';
var getassignedCaregiverSchedules = input.getassignedCaregiverSchedules || [];
var getAvaliableCaregivers = input.getAvaliableCaregivers;
var employeesDetails = input.employeesDetails || [];
var leavesData = input.leavesData || [];
var allClientsScheduleData = input.allClientsScheduleData || [];
var actualSchedulingData = input.actualSchedulingData || [];
var settingsrecords = input.settingsrecords || [];
var settingsTableData = input.settingsTableData || {
    data: []
};
var returnAllScheduledCompletedassignedSchedules = input.returnAllScheduledCompletedassignedSchedules || [];
var returnAllGhostShiftassignedSchedules = input.returnAllGhostShiftassignedSchedules || [];
var returnAllUnassignedSchedules = input.returnAllUnassignedSchedules || [];
var caregiverAvailability = input.caregiverAvailability || [];
var globalCaregiverHours = {};

var settingsData = input.settingsrecords;
// Get the first settings record (assuming there's only one active record)
var settings = settingsData && settingsData.length > 0 ? settingsData[0].fields : {};
var currDateAndTime = input.currDateAndTime || "";  // eg: "2025-12-10 10:55:41"
var extractedTime = currDateAndTime; // Extracts "10:55:41"


// Helper function to safely get field values
function getFieldValue(fieldName) {
    return settings[fieldName] && settings[fieldName].value ? settings[fieldName].value : "";
}

var summaryData = {
    totalAffected: 0,
    replacementsFound: 0,
    unfilledShifts: 0,
    restoredShifts: 0,
    assignedToUnassigned: 0,
    totalSchedulesForCaregiver: 0,
    schedulesInDateRange: 0,
    totalPotentialCaregivers: 0
};

var remarks = [];
var detailedLogs = [];
var replacementsData = [];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function safeGetValue(obj, path, defaultValue) {
    if (!obj) return defaultValue;
    var keys = path.split('.');
    var current = obj;
    for (var i = 0; i < keys.length; i++) {
        if (current == null || typeof current !== 'object') return defaultValue;
        current = current[keys[i]];
    }
    return current == null ? defaultValue : current;
}

function normStr(v) {
    if (v == null) return '';
    return String(v).replace(/\s+/g, ' ').trim();
}

function normName(v) {
    return normStr(v).toLowerCase();
}

function parseTime(timeStr) {
    if (!timeStr) return null;
    var cleanTime = normStr(timeStr).replace(/[^0-9:]/g, '');
    var parts = cleanTime.split(':');
    if (parts.length >= 2) {
        var hours = parseInt(parts[0], 10);
        var minutes = parseInt(parts[1], 10);
        if (!isNaN(hours) && !isNaN(minutes)) {
            return hours * 60 + minutes;
        }
    }
    return null;
}

function timeOverlap(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
}

function safeParseNumber(value, defaultValue) {
    var parsed = parseFloat(value);
    return isNaN(parsed) ? (defaultValue || 0) : parsed;
}

function parseList(v) {
    var s = normStr(v);
    if (!s) return [];
    return s.split(/[,;/\n]+/).map(function (x) {
        return normStr(x).toLowerCase();
    }).filter(Boolean);
}

function normalizeSkillList(val) {
    if (Array.isArray(val)) {
        return val.map(function (x) {
            return normStr(x).toLowerCase();
        }).filter(Boolean);
    }
    return parseList(val);
}

function getDayOfWeekNameFromISO(isoDate) {
    var date = new Date(isoDate + 'T00:00:00Z'); // Use UTC to avoid timezone issues
    var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[date.getUTCDay()];
}

function isCaregiverAlreadyAssignedToThisSchedule(caregiverName, clientId, scheduleDate, startTimeStr, endTimeStr, allSchedules) {
    if (!caregiverName || !clientId || !scheduleDate || !startTimeStr || !endTimeStr) {
        return false;
    }

    var cgNorm = normName(caregiverName);
    var clientIdNorm = normName(clientId);

    for (var i = 0; i < allSchedules.length; i++) {
        var sched = allSchedules[i];
        if (!sched || !sched.fields) continue;

        var schedClientId = normName(safeGetValue(sched.fields, 'Client_Id.value', ''));
        var schedClientName = normName(safeGetValue(sched.fields, 'Client_Name.value', ''));
        var schedDate = safeGetValue(sched.fields, 'Schedule_Start_Date.value', '');
        var schedStart = safeGetValue(sched.fields, 'Schedule_Start_Time.value', '');
        var schedEnd = safeGetValue(sched.fields, 'Schedule_End_Time.value', '');

        // ✅ CRITICAL: Check ONLY Expected_Caregiver fields (not Actual_Caregiver)
        // Get Expected Caregiver from Select_Expected_Caregiver lookup
        var expectedCgId = safeGetValue(sched.fields, 'Select_Expected_Caregiver.value', '');
        var expectedCgName = '';
        if (expectedCgId) {
            for (var j = 0; j < employeesDetails.length; j++) {
                if (employeesDetails[j] && employeesDetails[j].id === expectedCgId) {
                    expectedCgName = safeGetValue(employeesDetails[j], 'fields.Employee_Full_Name.value', '');
                    break;
                }
            }
        }
        // Fallback to Expected_Caregiver field if lookup didn't resolve
        if (!expectedCgName) {
            expectedCgName = safeGetValue(sched.fields, 'Expected_Caregiver.value', '');
        }

        var schedStatus = safeGetValue(sched.fields, 'Scheduling_Status.value', '');

        // Match by client ID or client name, date, and time
        var isMatchingClient = (schedClientId === clientIdNorm) || (schedClientName === clientIdNorm);
        var isMatchingSchedule = (schedDate === scheduleDate &&
            schedStart === startTimeStr &&
            schedEnd === endTimeStr);

        // ✅ Check if this caregiver is already EXPECTED/SCHEDULED for this shift
        if (isMatchingClient && isMatchingSchedule) {
            var isAssignedAsExpected = (normName(expectedCgName) === cgNorm && expectedCgName !== '' && expectedCgName !== 'unassigned');

            if (isAssignedAsExpected) {
                // Additional check: make sure it's an active assignment (not cancelled)
                var isActive = (schedStatus === 'Scheduled Completed' ||
                    schedStatus === 'Approved' ||
                    schedStatus === 'Scheduled' ||
                    schedStatus.toLowerCase().indexOf('ghost') > -1);
                if (isActive) {
                    return true;
                }
            }
        }
    }
    return false;
}

function buildMultiCaregiverAssignmentMap() {
    var assignmentMap = {}; // Key: "clientId|date|startTime|endTime", Value: [caregiverNames]

    var allSchedulesToScan = [];
    if (getassignedCaregiverSchedules) {
        allSchedulesToScan = allSchedulesToScan.concat(getassignedCaregiverSchedules);
    }
    if (returnAllScheduledCompletedassignedSchedules) {
        allSchedulesToScan = allSchedulesToScan.concat(returnAllScheduledCompletedassignedSchedules);
    }
    if (returnAllGhostShiftassignedSchedules) {
        allSchedulesToScan = allSchedulesToScan.concat(returnAllGhostShiftassignedSchedules);
    }

    for (var i = 0; i < allSchedulesToScan.length; i++) {
        var sched = allSchedulesToScan[i];
        if (!sched || !sched.fields) continue;

        var clientId = safeGetValue(sched.fields, 'Client_Id.value', '');
        var clientName = safeGetValue(sched.fields, 'Client_Name.value', '');
        var schedDate = safeGetValue(sched.fields, 'Schedule_Start_Date.value', '');
        var startTime = safeGetValue(sched.fields, 'Schedule_Start_Time.value', '');
        var endTime = safeGetValue(sched.fields, 'Schedule_End_Time.value', '');
        var schedStatus = safeGetValue(sched.fields, 'Scheduling_Status.value', '');

        // Use client ID if available, otherwise use name
        var clientKey = clientId || clientName;
        if (!clientKey || !schedDate || !startTime || !endTime) continue;

        // Skip cancelled schedules
        if (schedStatus === 'Cancelled By Client' ||
            schedStatus === 'Cancelled By Caregiver' ||
            schedStatus === 'Canceled By Caregiver') {
            continue;
        }

        var key = normName(clientKey) + '|' + schedDate + '|' + startTime + '|' + endTime;

        if (!assignmentMap[key]) {
            assignmentMap[key] = [];
        }

        // Get all assigned caregivers for this schedule
        var assignments = getAllAssignedCaregivers(sched);
        if (assignments && Array.isArray(assignments)) {
            for (var j = 0; j < assignments.length; j++) {
                var assignment = assignments[j];
                if (assignment && assignment.name) {
                    var cgName = assignment.name;
                    if (cgName && normStr(cgName) && normName(cgName) !== 'unassigned') {
                        var cgNorm = normName(cgName);
                        // Avoid duplicate entries in the array
                        if (assignmentMap[key].indexOf(cgNorm) === -1) {
                            assignmentMap[key].push(cgNorm);
                        }
                    }
                }
            }
        }
    }

    return assignmentMap;
}


function getShiftSegmentsForWindow(startMin, endMin) {
    var segments = [];
    function overlaps(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }
    var bands = [
        { seg: 'NOC', start: 0, end: 360 },
        { seg: 'AM', start: 360, end: 720 },
        { seg: 'PM', start: 720, end: 1260 },
        { seg: 'NOC', start: 1260, end: 1440 }
    ];
    var seen = {};
    for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        if (overlaps(startMin, endMin, b.start, b.end) && !seen[b.seg]) {
            segments.push(b.seg);
            seen[b.seg] = true;
        }
    }
    return segments;
}

function isCaregiverAvailableForTimeBand(emp, dayName, startMin, endMin) {
    if (!emp || !emp.fields || !dayName) return false;

    function dayToKey(day) {
        return normStr(day).toUpperCase();
    }

    var dayKey = dayToKey(dayName);
    var segments = getShiftSegmentsForWindow(startMin, endMin);

    if (segments.length === 0) return true;

    for (var s = 0; s < segments.length; s++) {
        var seg = segments[s];
        var key = dayKey + '_' + seg;
        var raw = safeGetValue(emp.fields, key + '.value', '');
        var val = normStr(String(raw)).toLowerCase();
        if (!(val === 'yes' || val === 'true')) {
            return false;
        }
    }
    return true;
}

function getAllAssignedCaregivers(schedule) {
    if (!schedule || !schedule.fields) {
        return [];
    }

    var assignments = [];

    // Check Expected_Caregiver field
    var expectedCg = safeGetValue(schedule.fields, 'Expected_Caregiver.value', '');
    if (expectedCg && normStr(expectedCg) && normName(expectedCg) !== 'unassigned') {
        assignments.push({
            name: expectedCg,
            type: 'expected'
        });
    }

    // Check Select_Expected_Caregiver lookup
    var expectedCgId = safeGetValue(schedule.fields, 'Select_Expected_Caregiver.value', '');
    if (expectedCgId) {
        for (var i = 0; i < employeesDetails.length; i++) {
            if (employeesDetails[i] && employeesDetails[i].id === expectedCgId) {
                var cgName = safeGetValue(employeesDetails[i], 'fields.Employee_Full_Name.value', '');
                if (cgName && normStr(cgName) && normName(cgName) !== 'unassigned') {
                    // Avoid duplicates
                    var isDuplicate = false;
                    for (var j = 0; j < assignments.length; j++) {
                        if (normName(assignments[j].name) === normName(cgName)) {
                            isDuplicate = true;
                            break;
                        }
                    }
                    if (!isDuplicate) {
                        assignments.push({
                            name: cgName,
                            type: 'lookup'
                        });
                    }
                }
                break;
            }
        }
    }

    // Check Actual_Caregiver field (for completed schedules)
    var actualCg = safeGetValue(schedule.fields, 'Actual_Caregiver.value', '');
    if (actualCg && normStr(actualCg) && normName(actualCg) !== 'unassigned') {
        // Avoid duplicates
        var isDuplicate = false;
        for (var k = 0; k < assignments.length; k++) {
            if (normName(assignments[k].name) === normName(actualCg)) {
                isDuplicate = true;
                break;
            }
        }
        if (!isDuplicate) {
            assignments.push({
                name: actualCg,
                type: 'actual'
            });
        }
    }

    return assignments;
}

function getScoringWeights() {
    var weights = {
        workHours: 0,
        language: 0,
        skills: 0,
        historical: 0
    };
    if (settingsrecords && settingsrecords.length > 0 && settingsrecords[0].fields) {
        var fields = settingsrecords[0].fields;
        weights.workHours = parseFloat(safeGetValue(fields, 'Worked_Hours_.value', weights.workHours)) || weights.workHours;
        weights.language = parseFloat(safeGetValue(fields, 'Language_.value', weights.language)) || weights.language;
        weights.skills = parseFloat(safeGetValue(fields, 'Skills_.value', weights.skills)) || weights.skills;
        weights.historical = parseFloat(safeGetValue(fields, 'Client_History_.value', weights.historical)) || weights.historical;
    }
    return weights;
}

function isCaregiverOnLeave(caregiverName, scheduleDate, scheduleStartTime, scheduleEndTime, cancellationRecordId) {
    if (!caregiverName || !scheduleDate) return false;
    var cgNorm = normName(caregiverName);
    for (var i = 0; i < leavesData.length; i++) {
        var leave = leavesData[i];
        if (!leave || !leave.fields) continue;
        if (cancellationRecordId && leave.id === cancellationRecordId) {
            continue;
        }
        var leaveCg = safeGetValue(leave.fields, 'Caregiver.value', '');
        var leaveStatus = safeGetValue(leave.fields, 'Leave_Status.value', '');
        if (normName(leaveCg) === cgNorm && leaveStatus === 'Approved') {
            var leaveStart = safeGetValue(leave.fields, 'Start_Date.value', '');
            var leaveEnd = safeGetValue(leave.fields, 'End_Date.value', '');
            if (scheduleDate >= leaveStart && scheduleDate <= leaveEnd) {
                var leaveStartTimeValue = safeGetValue(leave.fields, 'Start_Time.value', '');
                var leaveEndTimeValue = safeGetValue(leave.fields, 'End_Time.value', '');

                // If no times specified, the leave blocks the entire day
                if (!leaveStartTimeValue || !leaveEndTimeValue) {
                    return true;
                }

                // Check time overlap if schedule times are provided
                if (scheduleStartTime !== undefined && scheduleEndTime !== undefined) {
                    var leaveStartMin = parseTime(leaveStartTimeValue);
                    var leaveEndMin = parseTime(leaveEndTimeValue);

                    // Parse schedule times if they're strings (defensive coding)
                    var schedStartMin = (typeof scheduleStartTime === 'string') ? parseTime(scheduleStartTime) : scheduleStartTime;
                    var schedEndMin = (typeof scheduleEndTime === 'string') ? parseTime(scheduleEndTime) : scheduleEndTime;

                    if (leaveStartMin !== null && leaveEndMin !== null &&
                        schedStartMin !== null && schedEndMin !== null) {
                        if (timeOverlap(schedStartMin, schedEndMin, leaveStartMin, leaveEndMin)) {
                            return true;
                        }
                    }
                } else {
                    // If schedule times not provided but date matches, assume conflict
                    return true;
                }
            }
        }
    }
    return false;
}

function isCaregiverAlreadyAssigned(caregiverName, scheduleDate, startMin, endMin) {
    if (!caregiverName || !scheduleDate || startMin == null || endMin == null) {
        return {
            isAssigned: false,
            conflictDetails: null
        };
    }
    var cgNorm = normName(caregiverName);
    var combinedSchedules = returnAllScheduledCompletedassignedSchedules.concat(returnAllGhostShiftassignedSchedules);
    for (var i = 0; i < combinedSchedules.length; i++) {
        var schedule = combinedSchedules[i];
        if (!schedule || !schedule.fields) continue;
        var assignedCgId = safeGetValue(schedule.fields, 'Select_Expected_Caregiver.value', '');
        var assignedCgName = '';
        if (assignedCgId) {
            for (var j = 0; j < employeesDetails.length; j++) {
                if (employeesDetails[j] && employeesDetails[j].id === assignedCgId) {
                    assignedCgName = safeGetValue(employeesDetails[j], 'fields.Employee_Full_Name.value', '');
                    break;
                }
            }
        }
        if (!assignedCgName) {
            assignedCgName = safeGetValue(schedule.fields, 'Expected_Caregiver.value', '');
        }
        if (normName(assignedCgName) !== cgNorm) continue;
        var schedDate = safeGetValue(schedule.fields, 'Schedule_Start_Date.value', '');
        if (schedDate !== scheduleDate) continue;
        var status = safeGetValue(schedule.fields, 'Scheduling_Status.value', '');
        if (status === 'Cancelled By Client' || status === 'Cancelled By Caregiver' || status === 'Canceled By Caregiver') continue;
        var sTime = safeGetValue(schedule.fields, 'Schedule_Start_Time.value', '');
        var eTime = safeGetValue(schedule.fields, 'Schedule_End_Time.value', '');
        var sMin = parseTime(sTime);
        var eMin = parseTime(eTime);
        if (sMin != null && eMin != null && timeOverlap(startMin, endMin, sMin, eMin)) {
            var clientName = safeGetValue(schedule.fields, 'Client_Name.value', 'another') || 'another';
            var conflict = {
                isAssigned: true,
                conflictDetails: {
                    description: "Caregiver has a conflicting schedule with " + clientName + " client from " + sTime + " to " + eTime
                }
            };
            return conflict;
        }
    }
    return {
        isAssigned: false,
        conflictDetails: null
    };
}

// ============================================================================
// ENHANCED CAREGIVER AVAILABILITY LOGIC
// ============================================================================

function dayToKey(dayName) {
    if (!dayName) return '';
    return normStr(dayName).toUpperCase();
}

function getEmployeeRecordByName(caregiverName, employeesDetails) {
    if (!caregiverName || !employeesDetails) return null;

    var caregiverNameNorm = normName(caregiverName);
    for (var i = 0; i < employeesDetails.length; i++) {
        var emp = employeesDetails[i];
        if (emp && emp.fields) {
            var empName = safeGetValue(emp.fields, 'Employee_Full_Name.value', '');
            if (normName(empName) === caregiverNameNorm) {
                return emp;
            }
        }
    }
    return null;
}

function getCaregiverEmployeeId(caregiverName, employeesDetails) {
    var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
    return empRecord ? (empRecord.id || '') : '';
}

/**
 * Check if caregiver is available for custom time slots
 * This validates against the caregiver's custom schedule entries
 */
function isCaregiverAvailableForCustomTime(caregiverName, dayName, startMin, endMin, caregiverAvailability) {
    if (!caregiverName || !dayName || startMin == null || endMin == null) {
        return true;
    }

    var availabilityData = [];
    if (caregiverAvailability) {
        if (Array.isArray(caregiverAvailability)) {
            availabilityData = caregiverAvailability;
        } else if (caregiverAvailability.data && Array.isArray(caregiverAvailability.data)) {
            availabilityData = caregiverAvailability.data;
        }
    }

    if (availabilityData.length === 0) {
        return true;
    }

    var employeeId = getCaregiverEmployeeId(caregiverName, employeesDetails);
    if (!employeeId) {
        return true;
    }

    var dayKeyNorm = dayToKey(dayName);
    var availableSlots = [];

    for (var i = 0; i < availabilityData.length; i++) {
        var schedule = availabilityData[i];
        if (!schedule || !schedule.fields) continue;

        var refId = schedule.refId || '';  // ← CHANGED: Access refId from root level
        var scheduleDay = safeGetValue(schedule.fields, 'Day.value', '');

        if (refId === employeeId && dayToKey(scheduleDay) === dayKeyNorm) {
            var startTimeStr = safeGetValue(schedule.fields, 'Schedule_Start_Time.value', '');
            var endTimeStr = safeGetValue(schedule.fields, 'Schedule_End_Time.value', '');

            var slotStartMin = parseTime(startTimeStr);
            var slotEndMin = parseTime(endTimeStr);

            if (slotStartMin !== null && slotEndMin !== null) {
                availableSlots.push({
                    start: slotStartMin,
                    end: slotEndMin
                });
            }
        }
    }


    if (availableSlots.length === 0) {
        return false;
    }

    availableSlots.sort(function (a, b) {
        return a.start - b.start;
    });

    var coveredStart = startMin;

    for (var j = 0; j < availableSlots.length; j++) {
        var slot = availableSlots[j];

        if (slot.start > coveredStart) {
            return false;
        }

        if (slot.end > coveredStart) {
            coveredStart = Math.max(coveredStart, slot.end);
        }

        if (coveredStart >= endMin) {
            return true;
        }
    }

    return coveredStart >= endMin;
}

/**
 * Smart availability checker - automatically detects and uses the correct method
 * Checks employee's Availability_Type field and routes to appropriate validation
 */
function checkCaregiverAvailabilityByType(caregiverName, dayName, startMin, endMin, employeesDetails, caregiverAvailability) {
    if (!caregiverName || !dayName || startMin == null || endMin == null) {
        return false; // Changed to false for better safety
    }

    // Get caregiver's availability type
    var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
    if (!empRecord || !empRecord.fields) {
        return false;
    }

    var availabilityType = normStr(safeGetValue(empRecord.fields, 'Availability_Type.value', '')).toLowerCase();

    // NEW: If no availability type is set, check if caregiver has custom schedules
    if (!availabilityType) {
        var caregiverEmployeeId = getCaregiverEmployeeId(caregiverName, employeesDetails);
        if (caregiverAvailability && caregiverAvailability.data) {
            var hasCustomSchedules = caregiverAvailability.data.some(function (item) {
                return item.refId === caregiverEmployeeId;
            });

            if (hasCustomSchedules) {
                availabilityType = 'custom time';
            }
        }
    }

    // Check availability based on type
    if (availabilityType === 'custom time' || availabilityType === 'customtime') {
        return isCaregiverAvailableForCustomTime(caregiverName, dayName, startMin, endMin, caregiverAvailability);
    } else {
        // Default to AM/PM/NOC availability check for any other type (including "AM, PM, NOC")
        return isCaregiverAvailableForTimeBand(empRecord, dayName, startMin, endMin);
    }
}




// ============================================================================
// WEEKLY HOURS & DATE FUNCTIONS
// ============================================================================

function getDayOfWeekIndex(y, m, d) {
    var t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    if (m < 3) y -= 1;
    return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7;
}

function daysInMonth(y, m) {
    var monthDays = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return monthDays[m - 1];
}

function zero2(n) {
    return n < 10 ? '0' + n : '' + n;
}

function getWeekStartEnd(date) {
    if (!date || typeof date !== 'string' || date.split('-').length !== 3) return {
        start: '',
        end: ''
    };
    var parts = date.split('-');
    var y = parseInt(parts[0], 10),
        m = parseInt(parts[1], 10),
        d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return {
        start: '',
        end: ''
    };
    var dow = getDayOfWeekIndex(y, m, d);
    var daysToMonday = dow === 0 ? 6 : dow - 1;
    var startD = d - daysToMonday;
    var startM = m;
    var startY = y;
    while (startD < 1) {
        startM--;
        if (startM < 1) {
            startM = 12;
            startY--;
        }
        startD += daysInMonth(startY, startM);
    }
    var endD = startD + 6;
    var endM = startM;
    var endY = startY;
    var dim = daysInMonth(endY, endM);
    if (endD > dim) {
        endD -= dim;
        endM++;
        if (endM > 12) {
            endM = 1;
            endY++;
        }
    }
    return {
        start: startY + '-' + zero2(startM) + '-' + zero2(startD),
        end: endY + '-' + zero2(endM) + '-' + zero2(endD)
    };
}

function precomputeWeeklyHours(scheduleDate, excludeScheduleIds) {
    globalCaregiverHours = {};
    if (!scheduleDate) return;
    var week = getWeekStartEnd(scheduleDate);

    // Convert excludeScheduleIds to array if it's a single value
    var excludeIds = [];
    if (excludeScheduleIds) {
        if (Array.isArray(excludeScheduleIds)) {
            excludeIds = excludeScheduleIds;
        } else {
            excludeIds = [excludeScheduleIds];
        }
    }

    var combinedSchedules = returnAllScheduledCompletedassignedSchedules.concat(returnAllGhostShiftassignedSchedules);
    for (var i = 0; i < combinedSchedules.length; i++) {
        var schedule = combinedSchedules[i];
        if (!schedule || !schedule.fields) continue;

        // FIX: Skip schedules being replaced (their hours will be freed up)
        if (excludeIds.length > 0 && excludeIds.indexOf(schedule.id) !== -1) {
            continue;
        }

        // ============================================================================
        // GHOST SHIFT EXCLUSION: Check BOTH Shift_Status and Scheduling_Status
        // ============================================================================
        var shiftStatus = normStr(safeGetValue(schedule.fields, 'Shift_Status.value', '')).toLowerCase();
        var schedulingStatus = normStr(safeGetValue(schedule.fields, 'Scheduling_Status.value', '')).toLowerCase();

        if (shiftStatus.indexOf('ghost shift') !== -1 ||
            shiftStatus.indexOf('ghost') !== -1 ||
            schedulingStatus.indexOf('ghost shift') !== -1 ||
            schedulingStatus.indexOf('ghost') !== -1) {
            // Skip ghost shifts from weekly hours calculation
            continue;
        }

        var schedDate = safeGetValue(schedule.fields, 'Schedule_Start_Date.value', '');
        if (schedDate >= week.start && schedDate <= week.end) {
            var assignedCgId = safeGetValue(schedule.fields, 'Select_Expected_Caregiver.value', '');
            var caregiverName = '';
            if (assignedCgId) {
                for (var j = 0; j < employeesDetails.length; j++) {
                    if (employeesDetails[j] && employeesDetails[j].id === assignedCgId) {
                        caregiverName = safeGetValue(employeesDetails[j], 'fields.Employee_Full_Name.value', '');
                        break;
                    }
                }
            }
            if (!caregiverName) {
                caregiverName = safeGetValue(schedule.fields, 'Expected_Caregiver.value', '');
            }
            if (caregiverName) {
                var caregiverNameNorm = normName(caregiverName);
                var startMin = parseTime(safeGetValue(schedule.fields, 'Schedule_Start_Time.value', ''));
                var endMin = parseTime(safeGetValue(schedule.fields, 'Schedule_End_Time.value', ''));
                if (startMin !== null && endMin !== null && endMin > startMin) {
                    var hours = (endMin - startMin) / 60;
                    globalCaregiverHours[caregiverNameNorm] = (globalCaregiverHours[caregiverNameNorm] || 0) + hours;
                }
            }
        }
    }
}


function weeklyDistributionCheck(employeeData, candidateShiftHours, liveHours, debugFlag) {
    var result = {
        allowed: true,
        wouldExceedMax: false,
        projectedHours: 0,
        scoreAdjustment: 0
    };
    if (debugFlag) result.reason = '';
    if (!employeeData || !employeeData.fields) {
        if (debugFlag) result.reason = 'Employee data not available';
        return result;
    }
    var empFields = employeeData.fields;
    candidateShiftHours = safeParseNumber(candidateShiftHours, 0);
    var targetWeeklyHours = safeParseNumber(safeGetValue(empFields, 'Target_Weekly_Hours.value', 0), 0);
    var maxWeeklyHours = safeParseNumber(safeGetValue(empFields, 'Max_Weekly_Hours.value', 0), 0);
    var employeeName = safeGetValue(empFields, 'Employee_Full_Name.value', '');
    var employeeNameNorm = normName(employeeName);
    var currentWeeklyHours = liveHours[employeeNameNorm] || 0;
    result.projectedHours = currentWeeklyHours + candidateShiftHours;
    result.projectedHours = Math.round(result.projectedHours * 100) / 100;
    if (maxWeeklyHours > 0 && result.projectedHours > maxWeeklyHours) {
        result.allowed = false;
        result.wouldExceedMax = true;
        if (debugFlag) {
            result.reason = 'projectedHours (' + result.projectedHours + ') > Max_Weekly_Hours (' + maxWeeklyHours + ')';
        }
        return result;
    }
    if (targetWeeklyHours > 0 && currentWeeklyHours < targetWeeklyHours) {
        var hoursBelow = targetWeeklyHours - currentWeeklyHours;
        result.scoreAdjustment = Math.min(hoursBelow * 2, 30);
    }
    if (debugFlag && !result.reason) {
        result.reason = 'Weekly hours check passed. Current (Live): ' + currentWeeklyHours +
            ', Candidate Shift: ' + candidateShiftHours + ', Projected: ' + result.projectedHours +
            ', Target: ' + targetWeeklyHours + ', Max: ' + maxWeeklyHours +
            ', ScoreBoost: ' + result.scoreAdjustment;
    }
    return result;
}

// ============================================================================
// CENTRALIZED MATCHING & VALIDATION LOGIC (UNIFIED - NO DUPLICATES)
// ============================================================================

/**
 * Validates if a caregiver matches all requirements for a specific schedule
 * Handles both time band (AM/PM/NOC) and custom time availability automatically
 * 
 * @param {string} caregiverName - Name of the caregiver to check
 * @param {object} clientData - Client data object (null for ghost shifts)
 * @param {string} scheduleDate - Date of the schedule (YYYY-MM-DD)
 * @param {number} startMin - Start time in minutes from midnight
 * @param {number} endMin - End time in minutes from midnight
 * @param {number} candidateShiftHours - Duration of shift in hours
 * @param {object} liveHours - Current weekly hours for all caregivers
 * @param {string} cancellationRecordId - ID of leave record being cancelled (if applicable)
 * @returns {object} Match details including pass/fail status and reasons
 */
function getCaregiverMatchDetails(caregiverName, clientData, scheduleDate, startMin, endMin, candidateShiftHours, liveHours, cancellationRecordId) {
    var matchDetails = {
        caregiverName: caregiverName,
        matches: false,
        failureReasons: [],
        checks: {}
    };

    // NEW: Detailed leave debugging - Log all active leaves before processing
    if (detailedLogs) {
        detailedLogs.push(">>> Leave Data Check for " + caregiverName + " on " + scheduleDate);
        detailedLogs.push("    Total leave records in system: " + leavesData.length);
        detailedLogs.push("    Cancellation Record ID (to exclude): " + (cancellationRecordId || "NONE"));

        var relevantLeaves = [];
        for (var debugIdx = 0; debugIdx < leavesData.length; debugIdx++) {
            var debugLeave = leavesData[debugIdx];
            if (debugLeave && debugLeave.fields) {
                var debugCg = safeGetValue(debugLeave.fields, 'Caregiver.value', '');
                var debugStatus = safeGetValue(debugLeave.fields, 'Leave_Status.value', '');
                var debugStart = safeGetValue(debugLeave.fields, 'Start_Date.value', '');
                var debugEnd = safeGetValue(debugLeave.fields, 'End_Date.value', '');
                var debugStartTime = safeGetValue(debugLeave.fields, 'Start_Time.value', '');
                var debugEndTime = safeGetValue(debugLeave.fields, 'End_Time.value', '');

                detailedLogs.push("    Leave #" + debugIdx + ": " + debugCg + " (" + debugStatus + ")");
                detailedLogs.push("      Dates: " + debugStart + " to " + debugEnd);
                detailedLogs.push("      Times: " + debugStartTime + " to " + debugEndTime);
                detailedLogs.push("      Leave ID: " + debugLeave.id);

                // Check if this leave affects the current caregiver and date
                if (normName(debugCg) === normName(caregiverName) &&
                    debugStatus === 'Approved' &&
                    scheduleDate >= debugStart &&
                    scheduleDate <= debugEnd) {
                    relevantLeaves.push(debugLeave.id);
                }
            }
        }

        if (relevantLeaves.length > 0) {
            detailedLogs.push("    >>> FOUND " + relevantLeaves.length + " relevant leave(s) for this caregiver/date!");
        } else {
            detailedLogs.push("    >>> No relevant leaves found for this caregiver/date.");
        }
    }
    // ========================================================================
    // STEP 1: Find Employee Record
    // ========================================================================
    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        if (normName(safeGetValue(employeesDetails[i], 'fields.Employee_Full_Name.value', '')) === normName(caregiverName)) {
            emp = employeesDetails[i];
            break;
        }
    }

    if (!emp) {
        matchDetails.failureReasons.push("Employee details not found.");
        return matchDetails;
    }

    // ========================================================================
    // STEP 2: Check Leave Status
    // ========================================================================
    var onLeave = isCaregiverOnLeave(caregiverName, scheduleDate, startMin, endMin, cancellationRecordId);
    matchDetails.checks.onLeave = {
        passed: !onLeave,
        description: onLeave ? "Caregiver is on approved leave." : "Caregiver is not on leave."
    };

    if (onLeave) {
        matchDetails.failureReasons.push("On Leave");
        return matchDetails;
    }

    // ========================================================================
    // STEP 3: ENHANCED AVAILABILITY CHECK
    // Automatically detects Availability Type and validates accordingly:
    // - "Custom Time" → Validates against custom schedule slots
    // - Other types → Validates against time bands (AM/PM/NOC)
    // ========================================================================
    var dayName = getDayOfWeekNameFromISO(scheduleDate);
    var caregiverAvailability = input.caregiverAvailability || null;

    var isAvailableForTime = checkCaregiverAvailabilityByType(
        caregiverName,
        dayName,
        startMin,
        endMin,
        employeesDetails,
        caregiverAvailability
    );

    matchDetails.checks.availabilityCheck = {
        passed: isAvailableForTime,
        description: isAvailableForTime
            ? "Caregiver is available for the requested time (validated using Availability Type: checked both time bands and custom schedules)."
            : "Caregiver is NOT available for the requested time based on their availability settings."
    };

    // Add this debugging section in getCaregiverMatchDetails function after availability check
    if (caregiverName === "Akhil Gadey") {
        var availabilityType = safeGetValue(emp.fields, 'Availability_Type.value', '');
        var employeeId = getCaregiverEmployeeId(caregiverName, employeesDetails);

        detailedLogs.push("DEBUG - Akhil's Availability Type: '" + availabilityType + "'");
        detailedLogs.push("DEBUG - Employee ID: " + employeeId);
        detailedLogs.push("DEBUG - Day: " + dayName + ", Time: " + startMin + "-" + endMin);

        // Check if custom schedules exist
        var availabilityData = caregiverAvailability ? (caregiverAvailability.data || []) : [];
        var customScheduleCount = 0;
        for (var i = 0; i < availabilityData.length; i++) {
            var schedule = availabilityData[i];
            if (schedule && schedule.fields) {
                var refId = schedule.refId || '';

                if (refId === employeeId) {
                    customScheduleCount++;
                    var schedDay = safeGetValue(schedule.fields, 'Day.value', '');
                    var startTime = safeGetValue(schedule.fields, 'Schedule_Start_Time.value', '');
                    var endTime = safeGetValue(schedule.fields, 'Schedule_End_Time.value', '');
                    detailedLogs.push("DEBUG - Custom Schedule: " + schedDay + " " + startTime + "-" + endTime);
                }
            }
        }

        detailedLogs.push("DEBUG - Custom schedules found: " + customScheduleCount);
        detailedLogs.push("DEBUG - Using: " + (customScheduleCount > 0 ? "CUSTOM SCHEDULES" : "TIME BANDS"));

        // If using time bands, show the specific band values
        if (customScheduleCount === 0) {
            var segments = getShiftSegmentsForWindow(startMin, endMin);
            detailedLogs.push("DEBUG - Shift segments: " + segments.join(", "));
            for (var s = 0; s < segments.length; s++) {
                var seg = segments[s];
                var key = dayName.toUpperCase() + '_' + seg;
                var raw = safeGetValue(emp.fields, key + '.value', '');
                detailedLogs.push("DEBUG - " + key + " = " + raw);
            }
        }
    }

    if (!isAvailableForTime) {
        matchDetails.failureReasons.push("Not available for requested time");
        return matchDetails;
    }

    // ========================================================================
    // STEP 4: Check Schedule Conflicts
    // ========================================================================
    var assignmentCheck = isCaregiverAlreadyAssigned(caregiverName, scheduleDate, startMin, endMin);
    matchDetails.checks.scheduleConflict = {
        passed: !assignmentCheck.isAssigned,
        description: assignmentCheck.isAssigned
            ? assignmentCheck.conflictDetails.description
            : "No schedule conflicts found."
    };

    if (assignmentCheck.isAssigned) {
        matchDetails.failureReasons.push("Schedule Conflict: " + assignmentCheck.conflictDetails.description);
        return matchDetails;
    }

    // ========================================================================
    // STEP 5: Check Weekly Hours
    // ========================================================================
    var weeklyCheck = weeklyDistributionCheck(emp, candidateShiftHours, liveHours, true);
    matchDetails.checks.weeklyHours = {
        passed: weeklyCheck.allowed,
        description: weeklyCheck.reason
    };

    if (!weeklyCheck.allowed) {
        matchDetails.failureReasons.push("Exceeds max weekly hours");
        return matchDetails;
    }

    // ========================================================================
    // STEP 6: Ghost Shift Handling (No client-specific checks needed)
    // ========================================================================
    if (!clientData) {
        matchDetails.matches = true;
        matchDetails.checks.ghostShift = {
            passed: true,
            description: "This is a Ghost Shift. Only availability and weekly hours are checked."
        };
        return matchDetails;
    }

    // ========================================================================
    // STEP 7: Client-Specific Checks (Only for non-ghost shifts)
    // ========================================================================
    var mandatory = getMandatoryAttributes();

    // Check 7a: Blocklist
    var blocklist = normalizeSkillList(safeGetValue(clientData.fields, 'Caregiver_Block_List.value', ''));
    var isBlocklisted = blocklist.indexOf(normName(caregiverName)) !== -1;
    matchDetails.checks.blocklist = {
        passed: !isBlocklisted,
        description: isBlocklisted
            ? "Caregiver is on the client's blocklist."
            : "Not on blocklist."
    };

    if (isBlocklisted && mandatory['Blocklisted Caregivers']) {
        matchDetails.failureReasons.push("Blocklisted by client (Mandatory)");
        return matchDetails;
    }

    // Check 7b: Physical Capability
    var physicalMatch = checkPhysicalCapability(caregiverName, clientData);
    matchDetails.checks.physicalCapability = {
        passed: physicalMatch,
        description: physicalMatch
            ? "Matches physical capability requirements."
            : "Does NOT match physical capability requirements."
    };

    if (!physicalMatch && mandatory['Caregiver Physical Capability']) {
        matchDetails.failureReasons.push("Physical capability mismatch (Mandatory)");
        return matchDetails;
    }

    // Check 7c: Gender Preference
    var genderMatch = checkGenderPreference(caregiverName, clientData);
    matchDetails.checks.genderPreference = {
        passed: genderMatch,
        description: genderMatch
            ? "Matches client's gender preference."
            : "Does NOT match client's gender preference."
    };

    if (!genderMatch && mandatory['Client Gender Preference']) {
        matchDetails.failureReasons.push("Gender preference mismatch (Mandatory)");
        return matchDetails;
    }

    // Check 7d: Client Type Compatibility
    var typeMatch = checkClientTypeCompatibility(caregiverName, clientData);
    matchDetails.checks.clientType = {
        passed: typeMatch,
        description: typeMatch
            ? "Is compatible with client type (Facility/Private)."
            : "Is NOT compatible with client type."
    };

    if (!typeMatch && mandatory['Client Type Compatibility']) {
        matchDetails.failureReasons.push("Client type incompatibility (Mandatory)");
        return matchDetails;
    }

    // ========================================================================
    // STEP 8: All Checks Passed
    // ========================================================================
    matchDetails.matches = true;
    return matchDetails;
}

function getMandatoryAttributes() {
    var mandatory = {};
    var data = settingsTableData.data || [];
    for (var i = 0; i < data.length; i++) {
        var rec = data[i];
        if (rec.fields && safeGetValue(rec.fields, 'Status.value', '') === 'Active') {
            var desc = safeGetValue(rec.fields, 'Description.value', '');
            var isMand = safeGetValue(rec.fields, 'Is_Mandatory_.value', '') === 'Yes';
            mandatory[desc] = isMand;
        }
    }
    return mandatory;
}

function checkPhysicalCapability(caregiverName, clientData) {
    if (employeesDetails.length === 0) return true;
    var clientWeightClass = normStr(safeGetValue(clientData.fields, 'Weight_Class.value', '')).toLowerCase();
    if (!clientWeightClass) return true;
    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        if (normName(safeGetValue(e, 'fields.Employee_Full_Name.value', '')) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }
    if (!emp || !emp.fields) return false;
    var caregiverWeightClass = normStr(safeGetValue(emp.fields, 'Weight_Class.value', '')).toLowerCase();
    if (clientWeightClass === "standard") {
        return (caregiverWeightClass === "standard" || caregiverWeightClass === "heavy");
    } else if (clientWeightClass === "heavy") {
        return (caregiverWeightClass === "heavy");
    }
    return true;
}

function checkGenderPreference(caregiverName, clientData) {
    if (employeesDetails.length === 0) return true;
    var genderPref = safeGetValue(clientData.fields, 'Gender_Preference.value', '');
    var isStrict = normStr(safeGetValue(clientData.fields, 'Gender_Preference_Strict.value', '')).toLowerCase() === 'yes';
    if (!genderPref || !isStrict) {
        return true;
    }
    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        if (normName(safeGetValue(e, 'fields.Employee_Full_Name.value', '')) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }
    if (!emp || !emp.fields) return false;
    var caregiverGender = safeGetValue(emp.fields, 'Gender.value', '');
    return normStr(genderPref).toLowerCase() === normStr(caregiverGender).toLowerCase();
}

function checkClientTypeCompatibility(caregiverName, clientData) {
    if (employeesDetails.length === 0) return true;
    var clientType = safeGetValue(clientData.fields, 'Client_Type.value', '');
    var clientTypeNorm = normStr(clientType).toLowerCase();
    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        if (normName(safeGetValue(e, 'fields.Employee_Full_Name.value', '')) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }
    if (!emp || !emp.fields) return false;
    var facilityEligible = normStr(safeGetValue(emp.fields, 'Facility.value', '')).toLowerCase() === 'yes';
    var privateEligible = normStr(safeGetValue(emp.fields, 'Private.value', '')).toLowerCase() === 'yes';
    if (clientTypeNorm === 'facility') return facilityEligible;
    if (clientTypeNorm === 'private') return privateEligible;
    return true;
}

function calculateMatchScore(caregiverName, clientData, candidateShiftHours, liveHours) {
    var weights = getScoringWeights();
    var breakdown = {
        historical: 0,
        language: 0,
        skills: 0,
        workHours: 0
    };

    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        if (normName(safeGetValue(employeesDetails[i], 'fields.Employee_Full_Name.value', '')) === normName(caregiverName)) {
            emp = employeesDetails[i];
            break;
        }
    }

    if (!emp) return {
        totalScore: 0,
        breakdown: breakdown
    };

    // For Ghost Shifts (no client data), only return zero score
    if (!clientData) return {
        totalScore: 0,
        breakdown: breakdown
    };

    var clientName = safeGetValue(clientData.fields, 'Client_Full_Name.value', '');

    // === HISTORICAL SCORING (matches scheduler.js exactly) ===
    var rawHistorical = 0;
    var lookbackDays = 30;

    // Use currDate as reference point (same as scheduler)
    var now = currDate;
    if (now) {
        // Calculate cutoff date (30 days before currDate)
        var cutoff;
        (function calcCutoff() {
            var p = now.split('-');
            var y = +p[0], m = +p[1], d = +p[2];
            d -= lookbackDays;
            while (d < 1) {
                m -= 1;
                if (m < 1) { m = 12; y -= 1; }
                var dim = (function (yy, mm) {
                    var monthDays = [31, (yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0)) ? 29 : 28,
                        31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                    return monthDays[mm - 1];
                })(y, m);
                d += dim;
            }
            function z(n) { return n < 10 ? '0' + n : '' + n; }
            cutoff = y + '-' + z(m) + '-' + z(d);
        })();

        // Count historical schedules within lookback period
        for (var j = 0; j < actualSchedulingData.length; j++) {
            var rec = actualSchedulingData[j];
            if (!rec || !rec.fields) continue;
            var recClient = safeGetValue(rec.fields, 'Client_Name.value', '');
            var recCg = safeGetValue(rec.fields, 'Actual_Caregiver.value', '');
            var recDateStr = safeGetValue(rec.fields, 'Schedule_Start_Date.value', '');
            var status = safeGetValue(rec.fields, 'Scheduling_Status.value', '');

            if (normName(recClient) === normName(clientName) &&
                normName(recCg) === normName(caregiverName) &&
                (status === 'Approved' || status === 'Completed' || status === 'Scheduled Completed')) {
                if (recDateStr && recDateStr >= cutoff && recDateStr <= currDate) {
                    rawHistorical += 1;
                }
            }
        }
    }

    // Normalize historical score (max 30 shifts)
    var histScore = rawHistorical > 0 ? weights.historical : 0;
    breakdown.historical = +histScore.toFixed(2);


    // === LANGUAGE SCORING (matches scheduler.js) ===
    var clientLangs = normalizeSkillList(safeGetValue(clientData.fields, 'Language_Preferences.value', ''));
    var cgLangs = normalizeSkillList(safeGetValue(emp.fields, 'Language.value', ''));

    var langMatches = 0;
    for (var k = 0; k < clientLangs.length; k++) {
        if (cgLangs.indexOf(clientLangs[k]) > -1) {
            langMatches++;
        }
    }

    var langScore = 0;
    if (clientLangs.length > 0) {
        langScore = (langMatches / clientLangs.length) * weights.language;
    }
    breakdown.language = +langScore.toFixed(2);

    // === SKILLS SCORING (matches scheduler.js) ===
    var clientSkills = normalizeSkillList(safeGetValue(clientData.fields, 'Skills_Preferences.value', ''));
    var cgSkills = normalizeSkillList(safeGetValue(emp.fields, 'Skill_Type.value', ''));

    var skillMatches = 0;
    for (var l = 0; l < clientSkills.length; l++) {
        if (cgSkills.indexOf(clientSkills[l]) > -1) {
            skillMatches++;
        }
    }

    var skillScore = 0;
    if (clientSkills.length > 0) {
        skillScore = (skillMatches / clientSkills.length) * weights.skills;
    }
    breakdown.skills = +skillScore.toFixed(2);

    // === WORK HOURS SCORING (FIXED: matches scheduler.js - uses ALL-TIME client hours) ===
    var workScore = 0;

    // Calculate ALL-TIME hours for this client (matches scheduler.js exactly)
    var actualWorkedHoursMap = {};
    var totalClientHours = 0;

    for (var j = 0; j < actualSchedulingData.length; j++) {
        var rec = actualSchedulingData[j];
        if (!rec || !rec.fields) continue;
        var f = rec.fields;

        if (normName(safeGetValue(f, 'Client_Name.value', '')) === normName(clientName)) {
            var hours = safeParseNumber(safeGetValue(f, 'Actual_Hours.value', 0), 0);
            totalClientHours += hours;
            var cgName = safeGetValue(f, 'Actual_Caregiver.value', '');
            cgName = normStr(cgName);
            if (cgName) {
                actualWorkedHoursMap[cgName] = (actualWorkedHoursMap[cgName] || 0) + hours;
            }
        }
    }

    var workedHours = actualWorkedHoursMap[normStr(caregiverName)] || 0;
    if (totalClientHours > 0) {
        workScore = (workedHours / totalClientHours) * weights.workHours;
    }
    breakdown.workHours = +workScore.toFixed(2);

    // === CALCULATE TOTAL (matches scheduler.js - only 4 components) ===
    var totalScore = histScore + langScore + skillScore + workScore;

    return {
        totalScore: parseFloat(totalScore.toFixed(2)),
        breakdown: breakdown
    };
}

function calculateGoodToHavePoints(caregiverName, clientData) {
    var points = 0;

    // Ghost shifts have no client-specific good-to-have criteria
    if (!clientData) return points;

    // Find employee record
    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        if (normName(safeGetValue(employeesDetails[i], 'fields.Employee_Full_Name.value', '')) === normName(caregiverName)) {
            emp = employeesDetails[i];
            break;
        }
    }

    if (!emp || !emp.fields) return points;

    // === GOOD-TO-HAVE CRITERIA (Tiebreakers Only) ===

    // 1. Transportation Match (3 points)
    var clientNeedsTransportation = normStr(safeGetValue(clientData.fields, 'Transportation_Needed_.value', '')).toLowerCase();
    if (clientNeedsTransportation === 'yes') {
        var hasCar = normStr(safeGetValue(emp.fields, 'Has_Car_.value', '')).toLowerCase();
        var hasLicense = normStr(safeGetValue(emp.fields, 'Driver_License_.value', '')).toLowerCase();

        if (hasCar === 'yes' && hasLicense === 'yes') {
            points += 5; // Higher points for both car and license
        } else if (hasCar === 'yes' || hasLicense === 'yes') {
            points += 3; // Standard points for either car or license
        }
    }

    // 2. Personality Match (3 points)
    var clientPersonality = normStr(safeGetValue(clientData.fields, 'Personality_Match.value', '')).toLowerCase();
    var caregiverPersonality = normStr(safeGetValue(emp.fields, 'Personality_Match.value', '')).toLowerCase();

    // Award points if both have personality values and they match
    if (clientPersonality && caregiverPersonality && clientPersonality === caregiverPersonality) {
        points += 3;
    }

    // 3. English Proficiency (2 points)
    var cgLangs = normalizeSkillList(safeGetValue(emp.fields, 'Language.value', ''));
    if (cgLangs.indexOf('english') > -1) {
        points += 2;
    }

    return points;
}


function getPartiallyFilledMultiCaregiverSchedules(allSchedules) {
    var scheduleMap = {}; // Key: clientId|date|startTime|endTime
    var partiallyFilled = [];

    // First pass: Build a map of all schedules grouped by client, date, and time
    for (var i = 0; i < allSchedules.length; i++) {
        var sched = allSchedules[i];
        if (!sched || !sched.fields) continue;

        var clientId = safeGetValue(sched.fields, 'Client_Id.value', '');
        var clientName = safeGetValue(sched.fields, 'Client_Name.value', '');
        var date = safeGetValue(sched.fields, 'Schedule_Start_Date.value', '');
        var startTime = safeGetValue(sched.fields, 'Schedule_Start_Time.value', '');
        var endTime = safeGetValue(sched.fields, 'Schedule_End_Time.value', '');
        var caregiversRequired = safeParseNumber(safeGetValue(sched.fields, 'Caregivers_Required.value', 1), 1);
        var assignedCaregiver = safeGetValue(sched.fields, 'Actual_Caregiver.value', '');
        var schedStatus = safeGetValue(sched.fields, 'Scheduling_Status.value', '');

        // Use client ID if available, otherwise use client name
        var clientKey = clientId || clientName;
        if (!clientKey || !date || !startTime || !endTime) continue;

        var key = normName(clientKey) + '|' + date + '|' + startTime + '|' + endTime;

        if (!scheduleMap[key]) {
            scheduleMap[key] = {
                required: caregiversRequired,
                assigned: 0,
                unassignedSchedules: [],
                allSchedules: []
            };
        }

        scheduleMap[key].allSchedules.push(sched);

        // Count as assigned only if there's a real caregiver assigned
        var isAssigned = assignedCaregiver &&
            assignedCaregiver !== '' &&
            normName(assignedCaregiver) !== 'unassigned';

        // Also check status to ensure it's an active assignment
        var isActive = (schedStatus === 'Scheduled Completed' ||
            schedStatus === 'Approved' ||
            schedStatus === 'Scheduled' ||
            schedStatus.toLowerCase().indexOf('ghost') > -1);

        if (isAssigned && isActive) {
            scheduleMap[key].assigned++;
        } else {
            scheduleMap[key].unassignedSchedules.push(sched);
        }
    }

    // Second pass: Find schedules that need more caregivers (assigned < required)
    for (var key in scheduleMap) {
        if (!scheduleMap.hasOwnProperty(key)) continue;

        var info = scheduleMap[key];

        // Only include if:
        // 1. Requires more than 1 caregiver (multi-caregiver schedule)
        // 2. Currently has fewer assigned than required
        // 3. Has at least one unassigned slot
        if (info.required > 1 && info.assigned < info.required && info.unassignedSchedules.length > 0) {
            // Add one unassigned slot from this schedule
            partiallyFilled.push(info.unassignedSchedules[0]);
        }
    }

    return partiallyFilled;
}


// ============================================================================
// MAIN PROCESSING
// ============================================================================

if (!caregiverData || !caregiverData.fields) {
    remarks.push("ERROR: No caregiver leave data provided");
    return {
        replacements: {
            data: []
        },
        summary: summaryData,
        globalRemarks: remarks
    };
}

var leaveFields = caregiverData.fields;
var caregiverOnLeave = safeGetValue(leaveFields, 'Caregiver.value', '');
var leaveStartDate = safeGetValue(leaveFields, 'Start_Date.value', '');
var leaveEndDate = safeGetValue(leaveFields, 'End_Date.value', '');
var leaveStartTime = safeGetValue(leaveFields, 'Start_Time.value', '');
var leaveEndTime = safeGetValue(leaveFields, 'End_Time.value', '');
var leaveStatus = safeGetValue(leaveFields, 'Leave_Status.value', '');
var cancelRequest = safeGetValue(leaveFields, 'Cancel_Request.value', 'No');
var isLeaveCancellation = (cancelRequest.toLowerCase() === 'yes');
var cancellationRecordId = isLeaveCancellation ? caregiverData.id : null;

var leaveStartMin = parseTime(leaveStartTime);
var leaveEndMin = parseTime(leaveEndTime);
var caregiverOnLeaveNorm = normName(caregiverOnLeave);

var affectedSchedules = [];
for (var i = 0; i < getassignedCaregiverSchedules.length; i++) {
    var schedule = getassignedCaregiverSchedules[i];
    if (!schedule || !schedule.fields) continue;
    var scheduleDate = safeGetValue(schedule.fields, 'Schedule_Start_Date.value', '');
    if (!scheduleDate || scheduleDate < leaveStartDate || scheduleDate > leaveEndDate) continue;
    var scheduleStartTimeStr = safeGetValue(schedule.fields, 'Schedule_Start_Time.value', '');
    var scheduleEndTimeStr = safeGetValue(schedule.fields, 'Schedule_End_Time.value', '');
    var schedStartMin = parseTime(scheduleStartTimeStr);
    var schedEndMin = parseTime(scheduleEndTimeStr);
    var isTimeOverlap = true;
    if (leaveStartMin !== null && leaveEndMin !== null && schedStartMin !== null && schedEndMin !== null) {
        isTimeOverlap = timeOverlap(schedStartMin, schedEndMin, leaveStartMin, leaveEndMin);
    }
    if (isTimeOverlap) {
        affectedSchedules.push(schedule);
    }
}

affectedSchedules.sort(function (a, b) {
    var dateA = safeGetValue(a.fields, 'Schedule_Start_Date.value', '');
    var dateB = safeGetValue(b.fields, 'Schedule_Start_Date.value', '');
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
    var timeA = parseTime(safeGetValue(a.fields, 'Schedule_Start_Time.value', ''));
    var timeB = parseTime(safeGetValue(b.fields, 'Schedule_Start_Time.value', ''));
    return timeA - timeB;
});

summaryData.totalSchedulesForCaregiver = getassignedCaregiverSchedules.length;
summaryData.schedulesInDateRange = affectedSchedules.length;

var liveWeeklyHours = {};
var currentWeekId = '';

if (isLeaveCancellation) {
    remarks.push("INFO: Processing LEAVE CANCELLATION for " + caregiverOnLeave);
    detailedLogs.push("START: Processing LEAVE CANCELLATION for " + caregiverOnLeave);

    // ========================================================================
    // STEP 1: Restore affected schedules to original caregiver
    // ========================================================================
    for (var i = 0; i < affectedSchedules.length; i++) {
        var schedule = affectedSchedules[i];
        summaryData.totalAffected++;
        var scheduleId = schedule.id;
        var scheduleDate = safeGetValue(schedule.fields, 'Schedule_Start_Date.value', '');
        var startMin = parseTime(safeGetValue(schedule.fields, 'Schedule_Start_Time.value', ''));
        var endMin = parseTime(safeGetValue(schedule.fields, 'Schedule_End_Time.value', ''));
        var shiftHours = (endMin > startMin) ? (endMin - startMin) / 60 : 0;
        var isGhostShift = !safeGetValue(schedule.fields, 'Client_Name.value', '') ||
            safeGetValue(schedule.fields, 'Scheduling_Status.value', '').toLowerCase().indexOf('ghost') > -1;

        var week = getWeekStartEnd(scheduleDate);
        if (week.start !== currentWeekId) {
            currentWeekId = week.start;
            var affectedSchedulesThisWeek = [];
            for (var wsIdx = 0; wsIdx < affectedSchedules.length; wsIdx++) {
                var ws = affectedSchedules[wsIdx];
                if (ws && ws.fields) {
                    var wsDate = safeGetValue(ws.fields, 'Schedule_Start_Date.value', '');
                    var wsWeek = getWeekStartEnd(wsDate);
                    if (wsWeek.start === week.start) {
                        affectedSchedulesThisWeek.push(ws.id);
                    }
                }
            }
            precomputeWeeklyHours(scheduleDate, affectedSchedulesThisWeek);
            liveWeeklyHours = JSON.parse(JSON.stringify(globalCaregiverHours));
        }

        detailedLogs.push("--------------------------------------------------");
        detailedLogs.push("Attempting to restore Schedule ID: " + scheduleId + " on " + scheduleDate);

        var assignmentCheck = isCaregiverAlreadyAssigned(caregiverOnLeave, scheduleDate, startMin, endMin);
        if (assignmentCheck.isAssigned) {
            summaryData.unfilledShifts++;
            replacementsData.push({
                scheduleId: scheduleId,
                userId: safeGetValue(schedule.fields, 'User_Id.value', ''),
                employeeId: "",
                qbId: 0,
                replacementCaregiver: "",
                scheduleStatus: isGhostShift ? "Ghost Shift - Unassigned" : "Open Shift",
                shiftStatus: isGhostShift ? "Ghost Shift" : "Open Shift",
                weightedScore: 0,
                scoreBreakdown: {},
                remarks: ["FAILURE: Cannot restore schedule. Original caregiver has a new conflicting assignment: " + assignmentCheck.conflictDetails.description],
                token: getFieldValue("QB_Time_Key") || "",


            });
            detailedLogs.push("FAILURE: Could not restore " + scheduleId + ". Reason: " + assignmentCheck.conflictDetails.description);
        } else {
            summaryData.restoredShifts++;
            var empId = '';
            var qbId = 0;
            for (var p = 0; p < employeesDetails.length; p++) {
                if (normName(safeGetValue(employeesDetails[p], 'fields.Employee_Full_Name.value', '')) === caregiverOnLeaveNorm) {
                    empId = employeesDetails[p].id || '';
                    qbId = parseInt(safeGetValue(employeesDetails[p].fields, 'QB_Id.value', 0), 10) || 0;
                    break;
                }
            }

            // GHOST SHIFT FIX: Only add hours if NOT a ghost shift
            if (!isGhostShift) {
                liveWeeklyHours[caregiverOnLeaveNorm] = (liveWeeklyHours[caregiverOnLeaveNorm] || 0) + shiftHours;
            }

            liveWeeklyHours[caregiverOnLeaveNorm] = (liveWeeklyHours[caregiverOnLeaveNorm] || 0) + shiftHours;
            replacementsData.push({
                scheduleId: scheduleId,
                userId: safeGetValue(schedule.fields, 'User_Id.value', ''),
                employeeId: empId,
                qbId: qbId,
                replacementCaregiver: caregiverOnLeave,
                scheduleStatus: isGhostShift ? "Ghost Shift - Assigned" : "Scheduled Completed",
                shiftStatus: isGhostShift ? "Ghost Shift" : "Scheduled",
                weightedScore: 100,
                scoreBreakdown: { restoration: 100 },
                remarks: ["SUCCESS: Schedule restored to original caregiver."],
                token: getFieldValue("QB_Time_Key") || "",
            });
            detailedLogs.push("SUCCESS: Restored schedule " + scheduleId + " to " + caregiverOnLeave + ". Live hours now: " + liveWeeklyHours[caregiverOnLeaveNorm]);
        }
    }

    var caregiverEmpRecord = null;
    for (var p = 0; p < employeesDetails.length; p++) {
        if (normName(safeGetValue(employeesDetails[p], 'fields.Employee_Full_Name.value', '')) === caregiverOnLeaveNorm) {
            caregiverEmpRecord = employeesDetails[p];
            break;
        }
    }

    // ========================================================================
    // STEP 2: BUILD ASSIGNMENT MAP (Do this ONCE before processing open shifts)
    // ========================================================================
    detailedLogs.push("--------------------------------------------------");
    detailedLogs.push("STEP 2: Checking for unassigned CLIENT shifts (Open Shifts) to fill for " + caregiverOnLeave);

    var multiCaregiverAssignmentMap = buildMultiCaregiverAssignmentMap();
    detailedLogs.push("Built assignment map for " + Object.keys(multiCaregiverAssignmentMap).length + " unique time slots");

    // Get available shifts
    var openShifts = returnAllUnassignedSchedules || [];
    var partiallyFilledSchedules = getPartiallyFilledMultiCaregiverSchedules(
        getassignedCaregiverSchedules.concat(returnAllScheduledCompletedassignedSchedules || [])
    );
    openShifts = openShifts.concat(partiallyFilledSchedules);
    openShifts.sort(function (a, b) {
        var dateA = safeGetValue(a.fields, 'Schedule_Start_Date.value', '') + safeGetValue(a.fields, 'Schedule_Start_Time.value', '');
        var dateB = safeGetValue(b.fields, 'Schedule_Start_Date.value', '') + safeGetValue(b.fields, 'Schedule_Start_Time.value', '');
        return dateA.localeCompare(dateB);
    });

    detailedLogs.push("Found " + (returnAllUnassignedSchedules || []).length + " completely unassigned shifts + " +
        partiallyFilledSchedules.length + " partially filled multi-caregiver schedules.");

    // ========================================================================
    // STEP 3: Process Open Client Shifts
    // ========================================================================
    for (var j = 0; j < openShifts.length; j++) {
        var unassignedSchedule = openShifts[j];
        var unassignedDate = safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Date.value', '');

        if (unassignedDate >= leaveStartDate && unassignedDate <= leaveEndDate) {
            var unassignedStartMin = parseTime(safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Time.value', ''));
            var unassignedEndMin = parseTime(safeGetValue(unassignedSchedule.fields, 'Schedule_End_Time.value', ''));
            var unassignedHours = (unassignedEndMin > unassignedStartMin) ? (unassignedEndMin - unassignedStartMin) / 60 : 0;
            var clientName = safeGetValue(unassignedSchedule.fields, 'Client_Name.value', '');

            var week = getWeekStartEnd(unassignedDate);
            if (week.start !== currentWeekId) {
                currentWeekId = week.start;
                precomputeWeeklyHours(unassignedDate);
                liveWeeklyHours = JSON.parse(JSON.stringify(globalCaregiverHours));
            }

            var clientData = null;
            for (var k = 0; k < allClientsScheduleData.length; k++) {
                if (normName(safeGetValue(allClientsScheduleData[k].fields, 'Client_Full_Name.value', '')) === normName(clientName)) {
                    clientData = allClientsScheduleData[k];
                    break;
                }
            }

            // Check if it's a ghost shift
            var unassignedScheduleStatus = safeGetValue(unassignedSchedule.fields, 'Scheduling_Status.value', '');
            var isUnassignedGhostShift = !clientName || unassignedScheduleStatus.toLowerCase().indexOf('ghost') > -1;

            if (isUnassignedGhostShift && caregiverEmpRecord) {
                var isGhostPoolEligible = safeGetValue(caregiverEmpRecord.fields, 'LastMinute_Ready_Ghost_Pool_.value', '');
                if (normStr(String(isGhostPoolEligible)).toLowerCase() !== 'yes') {
                    detailedLogs.push("--- Skipping Ghost Shift " + unassignedSchedule.id + " - " + caregiverOnLeave + " not eligible for ghost shifts ---");
                    continue;
                }
            }

            detailedLogs.push("--- Checking Open Shift " + unassignedSchedule.id + " for client " + (clientName || "N/A") + " on " + unassignedDate);

            // ========================================================================
            // CRITICAL: Check multi-caregiver assignment map BEFORE matching
            // ========================================================================
            var unassignedClientId = safeGetValue(unassignedSchedule.fields, 'Client_Id.value', '');
            var unassignedClientName = safeGetValue(unassignedSchedule.fields, 'Client_Name.value', '');
            var unassignedClientKey = unassignedClientId || unassignedClientName;
            var assignmentKey = normName(unassignedClientKey) + '|' + unassignedDate + '|' +
                safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Time.value', '') + '|' +
                safeGetValue(unassignedSchedule.fields, 'Schedule_End_Time.value', '');

            var caregiverNorm = normName(caregiverOnLeave);

            if (multiCaregiverAssignmentMap[assignmentKey]) {
                if (multiCaregiverAssignmentMap[assignmentKey].indexOf(caregiverNorm) !== -1) {
                    detailedLogs.push("⚠️ DUPLICATE PREVENTED: " + caregiverOnLeave + " already assigned to another slot of this multi-caregiver schedule (Pattern: " + assignmentKey + ")");
                    detailedLogs.push("   Currently assigned to this time slot: [" + multiCaregiverAssignmentMap[assignmentKey].join(", ") + "]");
                    continue;
                }
            }

            var matchDetails = getCaregiverMatchDetails(caregiverOnLeave, clientData, unassignedDate, unassignedStartMin, unassignedEndMin, unassignedHours, liveWeeklyHours, cancellationRecordId);

            for (var check in matchDetails.checks) {
                detailedLogs.push("  - " + check + ": " + (matchDetails.checks[check].passed ? "PASS" : "FAIL") + " (" + matchDetails.checks[check].description + ")");
            }

            if (matchDetails.matches) {
                summaryData.assignedToUnassigned++;
                var scoreResult = calculateMatchScore(caregiverOnLeave, clientData, unassignedHours, liveWeeklyHours);
                if (!isUnassignedGhostShift) {
                    liveWeeklyHours[caregiverOnLeaveNorm] = (liveWeeklyHours[caregiverOnLeaveNorm] || 0) + unassignedHours;
                }


                liveWeeklyHours[caregiverOnLeaveNorm] = (liveWeeklyHours[caregiverOnLeaveNorm] || 0) + unassignedHours;

                replacementsData.push({
                    scheduleId: unassignedSchedule.id,
                    userId: safeGetValue(unassignedSchedule.fields, 'User_Id.value', ''),
                    employeeId: caregiverEmpRecord.id,
                    qbId: parseInt(safeGetValue(caregiverEmpRecord.fields, 'QB_Id.value', 0), 10) || 0,
                    replacementCaregiver: caregiverOnLeave,
                    scheduleStatus: isUnassignedGhostShift ? "Ghost Shift - Assigned" : "Scheduled Completed",
                    shiftStatus: isUnassignedGhostShift ? "Ghost Shift" : "Scheduled",
                    weightedScore: scoreResult.totalScore,
                    scoreBreakdown: scoreResult.breakdown,
                    remarks: ["SUCCESS: Assigned caregiver to a previously unassigned Open Shift."],
                    token: getFieldValue("QB_Time_Key") || "",
                });
                detailedLogs.push("SUCCESS: Assigned " + caregiverOnLeave + " to Open Shift " + unassignedSchedule.id + ". Live hours now: " + liveWeeklyHours[caregiverOnLeaveNorm]);

                // ========================================================================
                // UPDATE ASSIGNMENT MAP to track this new assignment
                // ========================================================================
                if (!multiCaregiverAssignmentMap[assignmentKey]) {
                    multiCaregiverAssignmentMap[assignmentKey] = [];
                }
                if (multiCaregiverAssignmentMap[assignmentKey].indexOf(caregiverNorm) === -1) {
                    multiCaregiverAssignmentMap[assignmentKey].push(caregiverNorm);
                }
            } else {
                detailedLogs.push("INFO: Caregiver did not match criteria for Open Shift " + unassignedSchedule.id + ". Reasons: " + matchDetails.failureReasons.join(", "));
            }
        }
    }


} else if (leaveStatus === 'Approved') {
    // SCENARIO: NEW LEAVE CREATION
    remarks.push("INFO: Processing NEW LEAVE for " + caregiverOnLeave + ". Found " + affectedSchedules.length + " affected schedules.");
    detailedLogs.push("START: Processing NEW LEAVE for " + caregiverOnLeave);

    // ============================================================================
    // MULTI-CAREGIVER FIX: Track assignments during new leave processing
    // ============================================================================
    var newLeaveScheduleTracking = {}; // Key: "clientId|date|startTime|endTime", Value: array of caregiver names

    // ============================================================================
    // GHOST SHIFT FIX: Track ghost shift assignments per caregiver per day
    // ============================================================================
    var ghostShiftAssignmentsByDay = {}; // Key: "caregiverName|date", Value: true/false

    // CRITICAL: Initialize with EXISTING ghost shift assignments from the system
    // This ensures we don't assign caregivers to multiple ghost shifts on the same day
    detailedLogs.push("Initializing ghost shift tracking from existing assignments...");

    var allExistingGhostSchedules = [];
    if (returnAllGhostShiftassignedSchedules) {
        allExistingGhostSchedules = allExistingGhostSchedules.concat(returnAllGhostShiftassignedSchedules);
    }

    for (var ghostIdx = 0; ghostIdx < allExistingGhostSchedules.length; ghostIdx++) {
        var ghostSched = allExistingGhostSchedules[ghostIdx];
        if (!ghostSched || !ghostSched.fields) continue;

        var ghostDate = safeGetValue(ghostSched.fields, 'Schedule_Start_Date.value', '');
        var ghostStatus = safeGetValue(ghostSched.fields, 'Scheduling_Status.value', '');

        // Skip cancelled ghost shifts
        if (ghostStatus === 'Cancelled By Client' ||
            ghostStatus === 'Cancelled By Caregiver' ||
            ghostStatus === 'Canceled By Caregiver') {
            continue;
        }

        // Get assigned caregiver(s) for this ghost shift
        var ghostAssignments = getAllAssignedCaregivers(ghostSched);
        for (var gaIdx = 0; gaIdx < ghostAssignments.length; gaIdx++) {
            var ghostAssignment = ghostAssignments[gaIdx];
            if (ghostAssignment && ghostAssignment.name &&
                normStr(ghostAssignment.name) &&
                normName(ghostAssignment.name) !== 'unassigned') {

                var cgNameNorm = normName(ghostAssignment.name);
                var ghostDayKey = cgNameNorm + '|' + ghostDate;

                // Mark this caregiver as already having a ghost shift on this day
                if (!ghostShiftAssignmentsByDay[ghostDayKey]) {
                    ghostShiftAssignmentsByDay[ghostDayKey] = true;
                    detailedLogs.push("  Found existing ghost shift: " + ghostAssignment.name + " on " + ghostDate + " (Schedule: " + ghostSched.id + ")");
                }
            }
        }
    }

    detailedLogs.push("Ghost shift tracking initialized with " + Object.keys(ghostShiftAssignmentsByDay).length + " existing assignments");

    var affectedClientSchedules = [];
    var affectedGhostShifts = [];
    for (var i = 0; i < affectedSchedules.length; i++) {
        var schedule = affectedSchedules[i];
        if (!schedule || !schedule.fields) continue; // Add null check

        var clientNameTest = safeGetValue(schedule.fields, 'Client_Name.value', '');
        var isGhostShiftTest = !clientNameTest || safeGetValue(schedule.fields, 'Scheduling_Status.value', '').toLowerCase().indexOf('ghost') > -1;
        if (isGhostShiftTest) {
            affectedGhostShifts.push(schedule);
        } else {
            affectedClientSchedules.push(schedule);
        }
    }

    var prioritizedSchedules = affectedClientSchedules.concat(affectedGhostShifts);
    detailedLogs.push("Prioritizing " + affectedClientSchedules.length + " client schedules, followed by " + affectedGhostShifts.length + " ghost shifts.");

    // Initialize with existing assignments from all schedules
    for (var trackIdx = 0; trackIdx < prioritizedSchedules.length; trackIdx++) {
        var trackSched = prioritizedSchedules[trackIdx];
        if (!trackSched || !trackSched.id || !trackSched.fields) continue;

        var trackClientId = safeGetValue(trackSched.fields, 'Client_Id.value', '');
        var trackClientName = safeGetValue(trackSched.fields, 'Client_Name.value', '');
        var trackDate = safeGetValue(trackSched.fields, 'Schedule_Start_Date.value', '');
        var trackStartTime = safeGetValue(trackSched.fields, 'Schedule_Start_Time.value', '');
        var trackEndTime = safeGetValue(trackSched.fields, 'Schedule_End_Time.value', '');

        var trackClientKey = trackClientId || trackClientName;
        if (!trackClientKey || !trackDate || !trackStartTime || !trackEndTime) continue;

        // Create time slot key: "clientId|date|startTime|endTime"
        var timeSlotKey = normName(trackClientKey) + '|' + trackDate + '|' + trackStartTime + '|' + trackEndTime;

        if (!newLeaveScheduleTracking[timeSlotKey]) {
            newLeaveScheduleTracking[timeSlotKey] = [];
        }

        try {
            var existingAssignments = getAllAssignedCaregivers(trackSched);

            if (existingAssignments && Array.isArray(existingAssignments)) {
                for (var eaIdx = 0; eaIdx < existingAssignments.length; eaIdx++) {
                    var assignment = existingAssignments[eaIdx];

                    if (assignment && assignment.name) {
                        var cgNameTrack = assignment.name;
                        if (cgNameTrack && normStr(cgNameTrack) && normName(cgNameTrack) !== 'unassigned') {
                            var cgNorm = normName(cgNameTrack);
                            // Avoid duplicates in the tracking array
                            if (newLeaveScheduleTracking[timeSlotKey].indexOf(cgNorm) === -1) {
                                newLeaveScheduleTracking[timeSlotKey].push(cgNorm);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            detailedLogs.push("ERROR in tracking initialization for schedule " + trackSched.id + ": " + String(e));
        }
    }

    detailedLogs.push("Multi-caregiver tracking initialized for " + Object.keys(newLeaveScheduleTracking).length + " time slots");





    var affectedClientSchedules = [];
    var affectedGhostShifts = [];
    for (var i = 0; i < affectedSchedules.length; i++) {
        var schedule = affectedSchedules[i];
        var clientNameTest = safeGetValue(schedule.fields, 'Client_Name.value', '');
        var isGhostShiftTest = !clientNameTest || safeGetValue(schedule.fields, 'Scheduling_Status.value', '').toLowerCase().indexOf('ghost') > -1;
        if (isGhostShiftTest) {
            affectedGhostShifts.push(schedule);
        } else {
            affectedClientSchedules.push(schedule);
        }
    }

    var prioritizedSchedules = affectedClientSchedules.concat(affectedGhostShifts);
    detailedLogs.push("Prioritizing " + affectedClientSchedules.length + " client schedules, followed by " + affectedGhostShifts.length + " ghost shifts.");

    for (var i = 0; i < prioritizedSchedules.length; i++) {
        var schedule = prioritizedSchedules[i];
        if (!schedule || !schedule.fields) {
            detailedLogs.push("WARNING: Null or invalid schedule found at index " + i + ", skipping.");
            continue;
        }

        summaryData.totalAffected++;
        var scheduleDate = safeGetValue(schedule.fields, 'Schedule_Start_Date.value', '');
        var scheduleId = schedule.id;
        var clientName = safeGetValue(schedule.fields, 'Client_Name.value', '');
        var userId = safeGetValue(schedule.fields, 'User_Id.value', '');
        var scheduleStartTimeStr = safeGetValue(schedule.fields, 'Schedule_Start_Time.value', '');
        var scheduleEndTimeStr = safeGetValue(schedule.fields, 'Schedule_End_Time.value', '');
        var schedStartMin = parseTime(scheduleStartTimeStr);
        var schedEndMin = parseTime(scheduleEndTimeStr);
        var isGhostShift = !clientName || safeGetValue(schedule.fields, 'Scheduling_Status.value', '').toLowerCase().indexOf('ghost') > -1;
        var candidateShiftHours = (schedEndMin !== null && schedStartMin !== null && schedEndMin > schedStartMin) ? (schedEndMin - schedStartMin) / 60 : 0;


        var week = getWeekStartEnd(scheduleDate);
        if (week.start !== currentWeekId) {
            currentWeekId = week.start;
            // FIX: Exclude ALL affected schedules for this week, not just the current one
            var affectedSchedulesThisWeek = [];
            for (var wsIdx = 0; wsIdx < prioritizedSchedules.length; wsIdx++) {
                var ws = prioritizedSchedules[wsIdx];
                var wsDate = safeGetValue(ws.fields, 'Schedule_Start_Date.value', '');
                var wsWeek = getWeekStartEnd(wsDate);
                if (wsWeek.start === week.start) {
                    affectedSchedulesThisWeek.push(ws.id);
                }
            }
            precomputeWeeklyHours(scheduleDate, affectedSchedulesThisWeek);

            liveWeeklyHours = JSON.parse(JSON.stringify(globalCaregiverHours));
            detailedLogs.push("--- NEW WEEK DETECTED: " + currentWeekId + ". Resetting live hours tracker. ---");
        }

        detailedLogs.push("--------------------------------------------------");
        detailedLogs.push("Processing Affected Schedule ID: " + scheduleId + " on " + scheduleDate);
        detailedLogs.push("Client: " + (clientName || "N/A - Ghost Shift") + " | Type: " + (isGhostShift ? "Ghost Shift" : "Client Schedule") + " | Time: " + scheduleStartTimeStr + " - " + scheduleEndTimeStr + " | Hours: " + candidateShiftHours);

        var clientData = null;
        if (!isGhostShift) {
            for (var j = 0; j < allClientsScheduleData.length; j++) {
                if (normName(safeGetValue(allClientsScheduleData[j].fields, 'Client_Full_Name.value', '')) === normName(clientName)) {
                    clientData = allClientsScheduleData[j];
                    break;
                }
            }
            if (!clientData) {
                detailedLogs.push("WARNING: Client data not found for '" + clientName + "'. No client-specific checks will be performed.");
            }
        }

        var candidates = [];
        var candidateLogs = ["EVALUATION LOG for Schedule " + scheduleId + ":"];

        // ============================================================================
        // CRITICAL FIX: Get ALL related schedules for this client/date/time FIRST
        // ============================================================================
        var allRelatedSchedules = [];

        // Get all schedules that might be related (scheduled, completed, ghost, unassigned)
        var allSchedulesToSearch = [];
        if (getassignedCaregiverSchedules) {
            allSchedulesToSearch = allSchedulesToSearch.concat(getassignedCaregiverSchedules);
        }
        if (returnAllScheduledCompletedassignedSchedules) {
            allSchedulesToSearch = allSchedulesToSearch.concat(returnAllScheduledCompletedassignedSchedules);
        }
        if (returnAllGhostShiftassignedSchedules) {
            allSchedulesToSearch = allSchedulesToSearch.concat(returnAllGhostShiftassignedSchedules);
        }
        if (returnAllUnassignedSchedules) {
            allSchedulesToSearch = allSchedulesToSearch.concat(returnAllUnassignedSchedules);
        }

        // Find all schedules for the same client, date, and time
        var scheduleClientId = safeGetValue(schedule.fields, 'Client_Id.value', '');
        var scheduleClientName = clientName;
        var checkClientId = scheduleClientId || scheduleClientName;

        candidateLogs.push("MULTI-CAREGIVER DEBUG: Looking for related schedules...");
        candidateLogs.push("Target Client: " + checkClientId + " | Date: " + scheduleDate + " | Time: " + scheduleStartTimeStr + "-" + scheduleEndTimeStr);

        var relatedScheduleCount = 0;
        var currentAssignments = []; // Track who's already assigned to this time slot

        for (var relIdx = 0; relIdx < allSchedulesToSearch.length; relIdx++) {
            var relSched = allSchedulesToSearch[relIdx];
            if (!relSched || !relSched.fields) continue;

            var relClientId = safeGetValue(relSched.fields, 'Client_Id.value', '');
            var relClientName = safeGetValue(relSched.fields, 'Client_Name.value', '');
            var relDate = safeGetValue(relSched.fields, 'Schedule_Start_Date.value', '');
            var relStartTime = safeGetValue(relSched.fields, 'Schedule_Start_Time.value', '');
            var relEndTime = safeGetValue(relSched.fields, 'Schedule_End_Time.value', '');

            // Check if this schedule matches our target schedule pattern
            var isMatchingClient = false;
            if (checkClientId && relClientId) {
                isMatchingClient = (normName(checkClientId) === normName(relClientId));
            } else if (checkClientId && relClientName) {
                isMatchingClient = (normName(checkClientId) === normName(relClientName));
            }

            var isMatchingTimeSlot = (relDate === scheduleDate &&
                relStartTime === scheduleStartTimeStr &&
                relEndTime === scheduleEndTimeStr);

            if (isMatchingClient && isMatchingTimeSlot) {
                relatedScheduleCount++;

                // Get who's assigned to this related schedule
                var assignedCaregivers = getAllAssignedCaregivers(relSched);
                for (var acIdx = 0; acIdx < assignedCaregivers.length; acIdx++) {
                    var assignedCg = assignedCaregivers[acIdx];
                    if (assignedCg && assignedCg.name && normStr(assignedCg.name) && normName(assignedCg.name) !== 'unassigned') {
                        var cgNormalized = normName(assignedCg.name);
                        if (currentAssignments.indexOf(cgNormalized) === -1) {
                            currentAssignments.push(cgNormalized);
                            candidateLogs.push("Already Assigned: " + assignedCg.name + " (Schedule: " + relSched.id + ")");
                        }
                    }
                }
            }
        }

        candidateLogs.push("MULTI-CAREGIVER ANALYSIS:");
        candidateLogs.push("- Related schedules found: " + relatedScheduleCount);
        candidateLogs.push("- Currently assigned caregivers: " + currentAssignments.length);
        candidateLogs.push("- Assigned caregivers list: [" + currentAssignments.join(", ") + "]");

        // ============================================================================
        // NOW evaluate candidates with PROPER duplicate prevention
        // ============================================================================
        for (var k = 0; k < employeesDetails.length; k++) {
            var emp = employeesDetails[k];
            var caregiverName = safeGetValue(emp, 'fields.Employee_Full_Name.value', '');
            if (!caregiverName || normName(caregiverName) === caregiverOnLeaveNorm) continue;

            candidateLogs.push("--- Checking: " + caregiverName + " ---");

            // ============================================================================
            // CRITICAL FIX: Check for multi-caregiver duplicates FIRST
            // ============================================================================
            // FIXED: Check both currentAssignments AND the time slot tracking
            var cgNormalized = normName(caregiverName);

            // Build time slot key for this schedule
            var checkClientId = scheduleClientId || scheduleClientName;
            var timeSlotKey = normName(checkClientId) + '|' + scheduleDate + '|' + scheduleStartTimeStr + '|' + scheduleEndTimeStr;

            // Check initial scan results
            if (currentAssignments.indexOf(cgNormalized) !== -1) {
                candidateLogs.push("❌ DUPLICATE PREVENTED (Initial Scan): " + caregiverName + " is already assigned to this time slot");
                candidateLogs.push("  => Currently assigned: [" + currentAssignments.join(", ") + "]");
                continue;
            }

            // Check tracking map for assignments made during this processing
            if (newLeaveScheduleTracking[timeSlotKey] && newLeaveScheduleTracking[timeSlotKey].indexOf(cgNormalized) !== -1) {
                candidateLogs.push("❌ DUPLICATE PREVENTED (Live Tracking): " + caregiverName + " was already assigned to this time slot during this run");
                candidateLogs.push("  => Time slot assignments: [" + newLeaveScheduleTracking[timeSlotKey].join(", ") + "]");
                continue;
            }


            // Secondary check using the existing function
            if (checkClientId && isCaregiverAlreadyAssignedToThisSchedule(
                caregiverName,
                checkClientId,
                scheduleDate,
                scheduleStartTimeStr,
                scheduleEndTimeStr,
                allSchedulesToSearch
            )) {
                candidateLogs.push("❌ SECONDARY DUPLICATE CHECK: " + caregiverName + " found by isCaregiverAlreadyAssignedToThisSchedule()");
                candidateLogs.push("  => SKIPPING: Confirmed duplicate assignment");
                continue;
            }

            // NEW: Check Ghost Pool eligibility for ghost shifts
            if (isGhostShift) {
                var isGhostPoolEligible = safeGetValue(emp.fields, 'LastMinute_Ready_Ghost_Pool_.value', '');
                var isEligible = normStr(String(isGhostPoolEligible)).toLowerCase();

                if (!(isEligible === 'yes' || isEligible === 'true')) {
                    candidateLogs.push("--- Skipping: " + caregiverName + " (not eligible for ghost shifts - LastMinute_Ready_Ghost_Pool is not 'Yes') ---");
                    continue;
                }

                // ============================================================================
                // CRITICAL: Prevent multiple ghost shifts for same caregiver on same day
                // ============================================================================
                var ghostDayKey = normName(caregiverName) + '|' + scheduleDate;
                if (ghostShiftAssignmentsByDay[ghostDayKey]) {
                    candidateLogs.push("❌ GHOST SHIFT LIMIT: " + caregiverName + " already assigned a ghost shift on " + scheduleDate);
                    candidateLogs.push("  => SKIPPING: Each caregiver can only have ONE ghost shift per day");
                    continue;
                }
            }

            // Proceed with standard validation
            var matchDetails = getCaregiverMatchDetails(caregiverName, clientData, scheduleDate, schedStartMin, schedEndMin, candidateShiftHours, liveWeeklyHours, cancellationRecordId);

            for (var check in matchDetails.checks) {
                candidateLogs.push("  - " + check + ": " + (matchDetails.checks[check].passed ? "PASS" : "FAIL") + " (" + matchDetails.checks[check].description + ")");
            }

            if (matchDetails.matches) {
                // CRITICAL FIX: Final defensive check for leave status before adding to candidates
                var finalLeaveCheck = isCaregiverOnLeave(caregiverName, scheduleDate, schedStartMin, schedEndMin, cancellationRecordId);
                if (finalLeaveCheck) {
                    candidateLogs.push("  => FINAL LEAVE CHECK FAILED: Caregiver is currently on approved leave. SKIPPING.");
                    continue;
                }

                // ============================================================================
                // FINAL multi-caregiver duplicate prevention using tracking
                // ============================================================================
                if (newLeaveScheduleTracking[scheduleId]) {
                    var cgNormCheck = normName(caregiverName);
                    if (newLeaveScheduleTracking[scheduleId].indexOf(cgNormCheck) !== -1) {
                        candidateLogs.push("  => TRACKING DUPLICATE CHECK FAILED: " + caregiverName + " already processed for this schedule. SKIPPING.");
                        continue;
                    }
                }

                candidateLogs.push("  => RESULT: MATCHES. Calculating score...");
                var scoreResult = calculateMatchScore(caregiverName, clientData, candidateShiftHours, liveWeeklyHours);
                var goodToHavePoints = calculateGoodToHavePoints(caregiverName, clientData);
                candidates.push({
                    caregiverName: caregiverName,
                    score: scoreResult.totalScore,
                    breakdown: scoreResult.breakdown,
                    goodToHavePoints: goodToHavePoints
                });
                candidateLogs.push("  => SCORE: " + scoreResult.totalScore + " (Good-to-Have Points: " + goodToHavePoints + ")");


            } else {
                candidateLogs.push("  => RESULT: NO MATCH. Reasons: " + matchDetails.failureReasons.join(", "));
            }
        }

        detailedLogs.push.apply(detailedLogs, candidateLogs);

        // ============================================================================
        // Process the results - assign best candidate or mark as unfilled
        // ============================================================================
        if (candidates.length > 0) {
            candidates.sort(function (a, b) {
                // Primary: Sort by main score (descending)
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                // Tiebreaker: If scores are equal, use good-to-have points (descending)
                return b.goodToHavePoints - a.goodToHavePoints;
            });
            var bestCandidate = candidates[0];

            summaryData.replacementsFound++;

            var employeeId = '';
            var qbId = 0;
            for (var p = 0; p < employeesDetails.length; p++) {
                if (normName(safeGetValue(employeesDetails[p], 'fields.Employee_Full_Name.value', '')) === normName(bestCandidate.caregiverName)) {
                    employeeId = employeesDetails[p].id || '';
                    var qbIdValue = safeGetValue(employeesDetails[p].fields, 'QB_Id.value', '');
                    qbId = qbIdValue ? parseInt(qbIdValue, 10) || 0 : 0;
                    break;
                }
            }

            var bestCandidateNorm = normName(bestCandidate.caregiverName);
            if (!isGhostShift) {
                liveWeeklyHours[bestCandidateNorm] = (liveWeeklyHours[bestCandidateNorm] || 0) + candidateShiftHours;
            }

            liveWeeklyHours[bestCandidateNorm] = (liveWeeklyHours[bestCandidateNorm] || 0) + candidateShiftHours;

            // Update tracking
            // FIXED: Update tracking using time slot key
            var clientIdForKey = scheduleClientId || clientName;
            var timeSlotKey = normName(clientIdForKey) + '|' + scheduleDate + '|' + scheduleStartTimeStr + '|' + scheduleEndTimeStr;

            if (!newLeaveScheduleTracking[timeSlotKey]) {
                newLeaveScheduleTracking[timeSlotKey] = [];
            }

            // Add to tracking if not already present
            if (newLeaveScheduleTracking[timeSlotKey].indexOf(bestCandidateNorm) === -1) {
                newLeaveScheduleTracking[timeSlotKey].push(bestCandidateNorm);
                detailedLogs.push("TRACKING UPDATE: Added " + bestCandidate.caregiverName + " to time slot " + timeSlotKey);
                detailedLogs.push("Current assignments for this slot: [" + newLeaveScheduleTracking[timeSlotKey].join(", ") + "]");
            }

            // ============================================================================
            // GHOST SHIFT TRACKING: Mark this caregiver as assigned a ghost shift today
            // ============================================================================
            if (isGhostShift) {
                var ghostDayKey = bestCandidateNorm + '|' + scheduleDate;
                ghostShiftAssignmentsByDay[ghostDayKey] = true;
                detailedLogs.push("GHOST SHIFT TRACKING: Marked " + bestCandidate.caregiverName + " as assigned ghost shift on " + scheduleDate);
            }



            var newScheduleStatus = isGhostShift ? "Ghost Shift - Assigned" : "Scheduled Completed";
            var newShiftStatus = isGhostShift ? "Ghost Shift" : "Scheduled";
            replacementsData.push({
                scheduleId: scheduleId,
                userId: userId,
                employeeId: employeeId,
                qbId: qbId,
                replacementCaregiver: bestCandidate.caregiverName,
                shiftStatus: newShiftStatus,
                scheduleStatus: newScheduleStatus,
                weightedScore: bestCandidate.score,
                scoreBreakdown: bestCandidate.breakdown,
                remarks: ["SUCCESS: Best candidate '" + bestCandidate.caregiverName + "' assigned with score " + bestCandidate.score + ". (Multi-caregiver duplicate prevention applied)"],
                token: getFieldValue("QB_Time_Key") || "",
            });
            detailedLogs.push("SUCCESS: Assigned " + bestCandidate.caregiverName + " to schedule " + scheduleId + ". UPDATING their live weekly hours to: " + liveWeeklyHours[bestCandidateNorm]);
        } else {
            // No suitable candidates found
            summaryData.unfilledShifts++;
            var unfilledScheduleStatus = isGhostShift ? "Ghost Shift - Unassigned" : "Canceled By Caregiver";
            var unfilledShiftStatus = isGhostShift ? "Ghost Shift" : "Open Shift";

            var failureReason = "No suitable replacement found";
            if (currentAssignments.length > 0) {
                failureReason += " (Multi-caregiver duplicates prevented: " + currentAssignments.length + " caregivers already assigned to this time slot)";
            }

            replacementsData.push({
                scheduleId: scheduleId,
                userId: userId,
                employeeId: "",
                qbId: 0,
                replacementCaregiver: "",
                scheduleStatus: unfilledScheduleStatus,
                shiftStatus: unfilledShiftStatus,
                weightedScore: 0,
                scoreBreakdown: {},
                remarks: ["FAILURE: " + failureReason + " after checking " + (employeesDetails.length - 1) + " potential caregivers."],
                token: getFieldValue("QB_Time_Key") || "",
            });
            detailedLogs.push("FAILURE: No replacement found for schedule " + scheduleId + ". Reason: " + failureReason);
        }
    }
} else {
    remarks.push("INFO: Leave is not approved and is not a cancellation request. No action taken.");
}

if (isLeaveCancellation) {
    remarks.push("SUMMARY: Total Affected: " + summaryData.totalAffected +
        ", Schedules Restored: " + summaryData.restoredShifts +
        ", Assigned to Unassigned: " + summaryData.assignedToUnassigned +
        ", Could Not Restore: " + summaryData.unfilledShifts);
} else {
    remarks.push("SUMMARY: Total Affected: " + summaryData.totalAffected +
        ", Replacements Found: " + summaryData.replacementsFound +
        ", Unfilled: " + summaryData.unfilledShifts);
}

detailedLogs.push("--------------------------------------------------");
detailedLogs.push("END: Processing complete.");

for (var idx = 0; idx < replacementsData.length; idx++) {
    replacementsData[idx].totalAffected = summaryData.totalAffected;
    replacementsData[idx].replacementsFound = summaryData.replacementsFound;
    replacementsData[idx].unfilledShifts = summaryData.unfilledShifts;
    replacementsData[idx].restoredShifts = summaryData.restoredShifts;
    replacementsData[idx].assignedToUnassigned = summaryData.assignedToUnassigned;
}

// Add this at the end of your script before return
detailedLogs.push("FINAL REPLACEMENTS COUNT: " + replacementsData.length);
for (var i = 0; i < replacementsData.length; i++) {
    var replacement = replacementsData[i];
    detailedLogs.push("Replacement " + i + ": Schedule " + replacement.scheduleId +
        " -> " + replacement.replacementCaregiver + " (Employee ID: " + replacement.employeeId + ")");
}

for (var i = 0; i < replacementsData.length; i++) {
    replacementsData[i].extractedTime = extractedTime; // Add the time to each replacement
}


return {
    replacements: {
        data: replacementsData
    },
    summary: summaryData,
    detailedLogs: detailedLogs,
    globalRemarks: remarks
};