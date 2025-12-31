// Emergency Leave Replacement Handler - Complete with User ID
var caregiverData = input.caregiverData;
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

var globalCaregiverHours = {};

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



// Add this new helper function
function getDayOfWeekNameFromISO(isoDate) {
    var date = new Date(isoDate + 'T00:00:00Z'); // Use UTC to avoid timezone issues
    var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[date.getUTCDay()];
}

// Copy this function from assignCaregiver.js
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


// Add this new function to LeaveData.js
function isCaregiverAvailableForTimeBand(emp, dayName, startMin, endMin) {
    if (!emp || !emp.fields || !dayName) return false;

    // Helper to normalize day names for field lookups
    function dayToKey(day) {
        return normStr(day).toUpperCase();
    }

    var dayKey = dayToKey(dayName);
    var segments = getShiftSegmentsForWindow(startMin, endMin);

    if (segments.length === 0) return true; // No specific segment, so no restriction

    // All overlapped segments must be affirmative
    for (var s = 0; s < segments.length; s++) {
        var seg = segments[s]; // 'AM' | 'PM' | 'NOC'
        var key = dayKey + '_' + seg; // e.g., MONDAY_AM
        var raw = safeGetValue(emp.fields, key + '.value', '');
        var val = normStr(String(raw)).toLowerCase();
        if (!(val === 'yes' || val === 'true')) {
            return false; // If any segment is not 'yes' or 'true', caregiver is unavailable
        }
    }
    return true;
}

function getScoringWeights() {
    var weights = {
        workHours: 40,
        language: 25,
        skills: 20,
        historical: 15
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
                if (!leaveStartTimeValue || !leaveEndTimeValue) return true;
                if (scheduleStartTime !== undefined && scheduleEndTime !== undefined) {
                    var leaveStartMin = parseTime(leaveStartTimeValue);
                    var leaveEndMin = parseTime(leaveEndTimeValue);
                    if (leaveStartMin !== null && leaveEndMin !== null) {
                        if (timeOverlap(scheduleStartTime, scheduleEndTime, leaveStartMin, leaveEndMin)) {
                            return true;
                        }
                    }
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

function precomputeWeeklyHours(scheduleDate) {
    globalCaregiverHours = {};
    if (!scheduleDate) return;
    var week = getWeekStartEnd(scheduleDate);
    var combinedSchedules = returnAllScheduledCompletedassignedSchedules.concat(returnAllGhostShiftassignedSchedules);
    for (var i = 0; i < combinedSchedules.length; i++) {
        var schedule = combinedSchedules[i];
        if (!schedule || !schedule.fields) continue;
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
// CENTRALIZED MATCHING & VALIDATION LOGIC
// ============================================================================
function getCaregiverMatchDetails(caregiverName, clientData, scheduleDate, startMin, endMin, candidateShiftHours, liveHours, cancellationRecordId) {
    var matchDetails = {
        caregiverName: caregiverName,
        matches: false,
        failureReasons: [],
        checks: {}
    };
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
    var onLeave = isCaregiverOnLeave(caregiverName, scheduleDate, startMin, endMin, cancellationRecordId);
    matchDetails.checks.onLeave = {
        passed: !onLeave,
        description: onLeave ? "Caregiver is on approved leave." : "Caregiver is not on leave."
    };
    if (onLeave) {
        matchDetails.failureReasons.push("On Leave");
        return matchDetails;

    }

    // --- NEW VALIDATION START ---
    var dayName = getDayOfWeekNameFromISO(scheduleDate);
    var isAvailableForBand = isCaregiverAvailableForTimeBand(emp, dayName, startMin, endMin);

    matchDetails.checks.timeBandAvailability = {
        passed: isAvailableForBand,
        description: isAvailableForBand ? "Caregiver is available for the required time band (AM/PM/NOC)." : "Caregiver is NOT available for the required time band."
    };

    if (!isAvailableForBand) {
        matchDetails.failureReasons.push("Not available for time band");
        return matchDetails;
    }
    // --- NEW VALIDATION END ---



    var assignmentCheck = isCaregiverAlreadyAssigned(caregiverName, scheduleDate, startMin, endMin);
    matchDetails.checks.scheduleConflict = {
        passed: !assignmentCheck.isAssigned,
        description: assignmentCheck.isAssigned ? assignmentCheck.conflictDetails.description : "No schedule conflicts found."
    };
    if (assignmentCheck.isAssigned) {
        matchDetails.failureReasons.push("Schedule Conflict: " + assignmentCheck.conflictDetails.description);
        return matchDetails;
    }
    var weeklyCheck = weeklyDistributionCheck(emp, candidateShiftHours, liveHours, true);
    matchDetails.checks.weeklyHours = {
        passed: weeklyCheck.allowed,
        description: weeklyCheck.reason
    };
    if (!weeklyCheck.allowed) {
        matchDetails.failureReasons.push("Exceeds max weekly hours");
        return matchDetails;
    }
    if (!clientData) {
        matchDetails.matches = true;
        matchDetails.checks.ghostShift = {
            passed: true,
            description: "This is a Ghost Shift. Only availability and weekly hours are checked."
        };
        return matchDetails;
    }
    var mandatory = getMandatoryAttributes();
    var blocklist = normalizeSkillList(safeGetValue(clientData.fields, 'Caregiver_Block_List.value', ''));
    var isBlocklisted = blocklist.indexOf(normName(caregiverName)) !== -1;
    matchDetails.checks.blocklist = {
        passed: !isBlocklisted,
        description: isBlocklisted ? "Caregiver is on the client's blocklist." : "Not on blocklist."
    };
    if (isBlocklisted && mandatory['Blocklisted Caregivers']) {
        matchDetails.failureReasons.push("Blocklisted by client (Mandatory)");
        return matchDetails;
    }
    var physicalMatch = checkPhysicalCapability(caregiverName, clientData);
    matchDetails.checks.physicalCapability = {
        passed: physicalMatch,
        description: physicalMatch ? "Matches physical capability requirements." : "Does NOT match physical capability requirements."
    };
    if (!physicalMatch && mandatory['Caregiver Physical Capability']) {
        matchDetails.failureReasons.push("Physical capability mismatch (Mandatory)");
        return matchDetails;
    }
    var genderMatch = checkGenderPreference(caregiverName, clientData);
    matchDetails.checks.genderPreference = {
        passed: genderMatch,
        description: genderMatch ? "Matches client's gender preference." : "Does NOT match client's gender preference."
    };
    if (!genderMatch && mandatory['Client Gender Preference']) {
        matchDetails.failureReasons.push("Gender preference mismatch (Mandatory)");
        return matchDetails;
    }
    var typeMatch = checkClientTypeCompatibility(caregiverName, clientData);
    matchDetails.checks.clientType = {
        passed: typeMatch,
        description: typeMatch ? "Is compatible with client type (Facility/Private)." : "Is NOT compatible with client type."
    };
    if (!typeMatch && mandatory['Client Type Compatibility']) {
        matchDetails.failureReasons.push("Client type incompatibility (Mandatory)");
        return matchDetails;
    }
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
    var score = 0;
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

    var weeklyCheck = weeklyDistributionCheck(emp, candidateShiftHours, liveHours, false);
    breakdown.workHours = weeklyCheck.scoreAdjustment;
    score += weeklyCheck.scoreAdjustment;

    if (!clientData) return {
        totalScore: parseFloat(score.toFixed(2)),
        breakdown: breakdown
    };

    var hasWorkedBefore = false;
    var clientName = safeGetValue(clientData.fields, 'Client_Full_Name.value', '');
    for (var j = 0; j < actualSchedulingData.length; j++) {
        var rec = actualSchedulingData[j];
        if (normName(safeGetValue(rec.fields, 'Client_Name.value', '')) === normName(clientName) &&
            normName(safeGetValue(rec.fields, 'Actual_Caregiver.value', '')) === normName(caregiverName)) {
            hasWorkedBefore = true;
            break;
        }
    }
    if (hasWorkedBefore) {
        breakdown.historical = weights.historical;
        score += weights.historical;
    }

    var clientLangs = normalizeSkillList(safeGetValue(clientData.fields, 'Language_Preferences.value', ''));
    var cgLangs = normalizeSkillList(safeGetValue(emp.fields, 'Language.value', ''));
    var langMatches = 0;
    for (var k = 0; k < clientLangs.length; k++) {
        if (cgLangs.indexOf(clientLangs[k]) > -1) {
            langMatches++;
        }
    }
    if (clientLangs.length > 0) {
        var langScore = (langMatches / clientLangs.length) * weights.language;
        breakdown.language = langScore;
        score += langScore;
    }

    var clientSkills = normalizeSkillList(safeGetValue(clientData.fields, 'Skills_Preferences.value', ''));
    var cgSkills = normalizeSkillList(safeGetValue(emp.fields, 'Skill_Type.value', ''));
    var skillMatches = 0;
    for (var l = 0; l < clientSkills.length; l++) {
        if (cgSkills.indexOf(clientSkills[l]) > -1) {
            skillMatches++;
        }
    }
    if (clientSkills.length > 0) {
        var skillScore = (skillMatches / clientSkills.length) * weights.skills;
        breakdown.skills = skillScore;
        score += skillScore;
    }

    return {
        totalScore: parseFloat(score.toFixed(2)),
        breakdown: breakdown
    };
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

    for (var i = 0; i < affectedSchedules.length; i++) {
        var schedule = affectedSchedules[i];
        summaryData.totalAffected++;
        var scheduleId = schedule.id;
        var scheduleDate = safeGetValue(schedule.fields, 'Schedule_Start_Date.value', '');
        var startMin = parseTime(safeGetValue(schedule.fields, 'Schedule_Start_Time.value', ''));
        var endMin = parseTime(safeGetValue(schedule.fields, 'Schedule_End_Time.value', ''));
        var shiftHours = (endMin > startMin) ? (endMin - startMin) / 60 : 0;
        var isGhostShift = !safeGetValue(schedule.fields, 'Client_Name.value', '') || safeGetValue(schedule.fields, 'Scheduling_Status.value', '').toLowerCase().indexOf('ghost') > -1;

        var week = getWeekStartEnd(scheduleDate);
        if (week.start !== currentWeekId) {
            currentWeekId = week.start;
            precomputeWeeklyHours(scheduleDate);
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
                remarks: ["FAILURE: Cannot restore schedule. Original caregiver has a new conflicting assignment: " + assignmentCheck.conflictDetails.description]
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
                scoreBreakdown: {
                    restoration: 100
                },
                remarks: ["SUCCESS: Schedule restored to original caregiver."]
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

    // PHASE 1: Try to fill Open Client Shifts first
    detailedLogs.push("--------------------------------------------------");
    detailedLogs.push("STEP 2: Checking for unassigned CLIENT shifts (Open Shifts) to fill for " + caregiverOnLeave);
    var openShifts = (returnAllUnassignedSchedules || []).sort(function (a, b) {
        var dateA = safeGetValue(a.fields, 'Schedule_Start_Date.value', '') + safeGetValue(a.fields, 'Schedule_Start_Time.value', '');
        var dateB = safeGetValue(b.fields, 'Schedule_Start_Date.value', '') + safeGetValue(b.fields, 'Schedule_Start_Time.value', '');
        return dateA.localeCompare(dateB);
    });

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

            detailedLogs.push("--- Checking Open Shift " + unassignedSchedule.id + " for client " + (clientName || "N/A") + " on " + unassignedDate);
            var matchDetails = getCaregiverMatchDetails(caregiverOnLeave, clientData, unassignedDate, unassignedStartMin, unassignedEndMin, unassignedHours, liveWeeklyHours, cancellationRecordId);

            for (var check in matchDetails.checks) {
                detailedLogs.push("  - " + check + ": " + (matchDetails.checks[check].passed ? "PASS" : "FAIL") + " (" + matchDetails.checks[check].description + ")");
            }

            if (matchDetails.matches) {
                summaryData.assignedToUnassigned++;
                var scoreResult = calculateMatchScore(caregiverOnLeave, clientData, unassignedHours, liveWeeklyHours);
                liveWeeklyHours[caregiverOnLeaveNorm] = (liveWeeklyHours[caregiverOnLeaveNorm] || 0) + unassignedHours;
                replacementsData.push({
                    scheduleId: unassignedSchedule.id,
                    userId: safeGetValue(unassignedSchedule.fields, 'User_Id.value', ''),
                    employeeId: caregiverEmpRecord.id,
                    qbId: parseInt(safeGetValue(caregiverEmpRecord.fields, 'QB_Id.value', 0), 10) || 0,
                    replacementCaregiver: caregiverOnLeave,
                    scheduleStatus: "Scheduled Completed",
                    shiftStatus: "Scheduled",
                    weightedScore: scoreResult.totalScore,
                    scoreBreakdown: scoreResult.breakdown,
                    remarks: ["SUCCESS: Assigned caregiver to a previously unassigned Open Shift."]
                });
                detailedLogs.push("SUCCESS: Assigned " + caregiverOnLeave + " to Open Shift " + unassignedSchedule.id + ". Live hours now: " + liveWeeklyHours[caregiverOnLeaveNorm]);
            } else {
                detailedLogs.push("INFO: Caregiver did not match criteria for Open Shift " + unassignedSchedule.id + ". Reasons: " + matchDetails.failureReasons.join(", "));
            }
        }
    }

    // PHASE 2: Try to fill Ghost Shifts
    detailedLogs.push("--------------------------------------------------");
    detailedLogs.push("STEP 3: Checking for unassigned GHOST shifts to fill for " + caregiverOnLeave);

    var unassignedGhostShifts = [];
    (returnAllGhostShiftassignedSchedules || []).forEach(function (s) {
        if (safeGetValue(s.fields, 'Scheduling_Status.value', '') === 'Ghost Shift - Unassigned') {
            unassignedGhostShifts.push(s);
        }
    });
    unassignedGhostShifts.sort(function (a, b) {
        var dateA = safeGetValue(a.fields, 'Schedule_Start_Date.value', '') + safeGetValue(a.fields, 'Schedule_Start_Time.value', '');
        var dateB = safeGetValue(b.fields, 'Schedule_Start_Date.value', '') + safeGetValue(b.fields, 'Schedule_Start_Time.value', '');
        return dateA.localeCompare(dateB);
    });

    for (var j = 0; j < unassignedGhostShifts.length; j++) {
        var unassignedSchedule = unassignedGhostShifts[j];
        var unassignedDate = safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Date.value', '');

        if (unassignedDate >= leaveStartDate && unassignedDate <= leaveEndDate) {
            if (caregiverEmpRecord) {
                var isGhostPoolReady = safeGetValue(caregiverEmpRecord, 'fields.LastMinute_Ready_Ghost_Pool_.value', 'No').toLowerCase() === 'yes';
                if (!isGhostPoolReady) {
                    detailedLogs.push("--- SKIPPING Ghost Shift " + unassignedSchedule.id + ". Caregiver is not in the ghost pool.");
                    continue;
                }
            }

            var unassignedStartMin = parseTime(safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Time.value', ''));
            var unassignedEndMin = parseTime(safeGetValue(unassignedSchedule.fields, 'Schedule_End_Time.value', ''));
            var unassignedHours = (unassignedEndMin > unassignedStartMin) ? (unassignedEndMin - unassignedStartMin) / 60 : 0;

            var week = getWeekStartEnd(unassignedDate);
            if (week.start !== currentWeekId) {
                currentWeekId = week.start;
                precomputeWeeklyHours(unassignedDate);
                liveWeeklyHours = JSON.parse(JSON.stringify(globalCaregiverHours));
            }

            detailedLogs.push("--- Checking Ghost Shift " + unassignedSchedule.id + " on " + unassignedDate);
            var matchDetails = getCaregiverMatchDetails(caregiverOnLeave, null, unassignedDate, unassignedStartMin, unassignedEndMin, unassignedHours, liveWeeklyHours, cancellationRecordId);

            for (var check in matchDetails.checks) {
                detailedLogs.push("  - " + check + ": " + (matchDetails.checks[check].passed ? "PASS" : "FAIL") + " (" + matchDetails.checks[check].description + ")");
            }

            if (matchDetails.matches) {
                summaryData.assignedToUnassigned++;
                var scoreResult = calculateMatchScore(caregiverOnLeave, null, unassignedHours, liveWeeklyHours);
                liveWeeklyHours[caregiverOnLeaveNorm] = (liveWeeklyHours[caregiverOnLeaveNorm] || 0) + unassignedHours;
                replacementsData.push({
                    scheduleId: unassignedSchedule.id,
                    userId: safeGetValue(unassignedSchedule.fields, 'User_Id.value', ''),
                    employeeId: caregiverEmpRecord.id,
                    qbId: parseInt(safeGetValue(caregiverEmpRecord.fields, 'QB_Id.value', 0), 10) || 0,
                    replacementCaregiver: caregiverOnLeave,
                    scheduleStatus: "Ghost Shift - Assigned",
                    shiftStatus: "Ghost Shift",
                    weightedScore: scoreResult.totalScore,
                    scoreBreakdown: scoreResult.breakdown,
                    remarks: ["SUCCESS: Assigned caregiver to a previously unassigned Ghost Shift."]
                });
                detailedLogs.push("SUCCESS: Assigned " + caregiverOnLeave + " to Ghost Shift " + unassignedSchedule.id + ". Live hours now: " + liveWeeklyHours[caregiverOnLeaveNorm]);
            } else {
                detailedLogs.push("INFO: Caregiver did not match criteria for Ghost Shift " + unassignedSchedule.id + ". Reasons: " + matchDetails.failureReasons.join(", "));
            }
        }
    }

} else if (leaveStatus === 'Approved') {
    // SCENARIO: NEW LEAVE CREATION
    remarks.push("INFO: Processing NEW LEAVE for " + caregiverOnLeave + ". Found " + affectedSchedules.length + " affected schedules.");
    detailedLogs.push("START: Processing NEW LEAVE for " + caregiverOnLeave);

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
            precomputeWeeklyHours(scheduleDate);
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
        for (var k = 0; k < employeesDetails.length; k++) {
            var emp = employeesDetails[k];
            var caregiverName = safeGetValue(emp, 'fields.Employee_Full_Name.value', '');
            if (!caregiverName || normName(caregiverName) === caregiverOnLeaveNorm) continue;
            candidateLogs.push("--- Checking: " + caregiverName + " ---");
            var matchDetails = getCaregiverMatchDetails(caregiverName, clientData, scheduleDate, schedStartMin, schedEndMin, candidateShiftHours, liveWeeklyHours, cancellationRecordId);
            for (var check in matchDetails.checks) {
                candidateLogs.push("  - " + check + ": " + (matchDetails.checks[check].passed ? "PASS" : "FAIL") + " (" + matchDetails.checks[check].description + ")");
            }
            if (matchDetails.matches) {
                candidateLogs.push("  => RESULT: MATCHES. Calculating score...");
                var scoreResult = calculateMatchScore(caregiverName, clientData, candidateShiftHours, liveWeeklyHours);
                candidates.push({
                    caregiverName: caregiverName,
                    score: scoreResult.totalScore,
                    breakdown: scoreResult.breakdown
                });
                candidateLogs.push("  => SCORE: " + scoreResult.totalScore);
            } else {
                candidateLogs.push("  => RESULT: NO MATCH. Reasons: " + matchDetails.failureReasons.join(", "));
            }
        }
        detailedLogs.push.apply(detailedLogs, candidateLogs);
        if (candidates.length > 0) {
            candidates.sort(function (a, b) {
                return b.score - a.score;
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
            liveWeeklyHours[bestCandidateNorm] = (liveWeeklyHours[bestCandidateNorm] || 0) + candidateShiftHours;

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
                remarks: ["SUCCESS: Best candidate '" + bestCandidate.caregiverName + "' assigned with score " + bestCandidate.score + "."]
            });
            detailedLogs.push("SUCCESS: Assigned " + bestCandidate.caregiverName + " to schedule " + scheduleId + ". UPDATING their live weekly hours to: " + liveWeeklyHours[bestCandidateNorm]);
        } else {
            summaryData.unfilledShifts++;
            var unfilledScheduleStatus = isGhostShift ? "Ghost Shift - Unassigned" : "Canceled By Caregiver";
            var unfilledShiftStatus = isGhostShift ? "Ghost Shift" : "Open Shift";
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
                remarks: ["FAILURE: No suitable replacement found after checking " + (employeesDetails.length - 1) + " potential caregivers."]
            });
            detailedLogs.push("FAILURE: No replacement found for schedule " + scheduleId);
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

return {
    replacements: {
        data: replacementsData
    },
    summary: summaryData,
    detailedLogs: detailedLogs,
    globalRemarks: remarks
};