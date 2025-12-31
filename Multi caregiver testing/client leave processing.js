// ============================================================================
// CLIENT LEAVE HANDLER - Complete Implementation
// ============================================================================
// Business Logic:
// 1. When creating a leave: Cancel schedules in date/time range
// 2. Reassign freed caregivers to other unassigned schedules (if they match criteria)
// 3. When cancelling a leave: Restore schedules and try to assign caregivers
// ============================================================================

// ============================================================================
// INPUT DATA EXTRACTION
// ============================================================================
var recordId = input.RecordId || '';
var currDate = input.currDate || '';
var clientLeaveRecords = input.clientLeaveRecords || [];
var getassignedClientsSchedules = input.getassignedClientsSchedules || [];
var getAvaliableCaregivers = input.employeesDetails || [];
var employeesDetails = input.employeesDetails || [];
var leavesData = input.leavesData || [];
var allClientsScheduleData = input.allClientsScheduleData || [];
var actualSchedulingData = input.actualSchedulingData || [];
var clientLeaves = input.clientLeaves || { data: [] };
var returnAllScheduledCompletedassignedSchedules = input.returnAllScheduledCompletedassignedSchedules || [];
var returnAllGhostShiftassignedSchedules = input.returnAllGhostShiftassignedSchedules || [];
var settingsrecords = input.settingsrecords || [];
var returnAllUnassignedSchedules = input.returnAllUnassignedSchedules || [];
var caregiverAvailability = input.caregiverAvailability || [];
// ============================================================================
// FIND THE SPECIFIC CLIENT LEAVE RECORD BY RecordId
// ============================================================================
var clientLeaveData = null;

// Try to find in clientLeaveRecords array first
if (recordId && clientLeaveRecords && clientLeaveRecords.length > 0) {
    for (var i = 0; i < clientLeaveRecords.length; i++) {
        if (clientLeaveRecords[i] && clientLeaveRecords[i].id === recordId) {
            clientLeaveData = clientLeaveRecords[i];
            break;
        }
    }
}

// If not found, check if clientData is provided directly (system data format)
if (!clientLeaveData && input.clientData) {
    if (input.clientData.id === recordId) {
        clientLeaveData = input.clientData;
    }
}

// If no leave record found, return error
if (!clientLeaveData) {
    return {
        success: false,
        error: "ERROR: Client leave record not found for RecordId: " + recordId,
        recordId: recordId,
        debug: {
            hasClientLeaveRecords: clientLeaveRecords.length > 0,
            hasClientData: !!input.clientData,
            clientDataId: input.clientData ? input.clientData.id : 'N/A'
        }
    };
}

// ============================================================================
// EXTRACT LEAVE DETAILS
// ============================================================================
var leaveClientId = safeGetValue(clientLeaveData, 'fields.Client_Full_Name.value', '');
var leaveStartDate = safeGetValue(clientLeaveData, 'fields.Start_Date.value', '');
var leaveEndDate = safeGetValue(clientLeaveData, 'fields.End_Date.value', '');
var leaveStartTime = safeGetValue(clientLeaveData, 'fields.Start_Time.value', '');
var leaveEndTime = safeGetValue(clientLeaveData, 'fields.End_Time.value', '');
var leaveStatus = safeGetValue(clientLeaveData, 'fields.Leave_Status.value', '');
var cancelRequest = safeGetValue(clientLeaveData, 'fields.Cancel_Request.value', '');

// Validate required fields
if (!leaveClientId || !leaveStartDate || !leaveEndDate) {
    return {
        success: false,
        error: "ERROR: Missing required leave data (Client_Full_Name, Start_Date, or End_Date)",
        leaveData: {
            clientId: leaveClientId,
            startDate: leaveStartDate,
            endDate: leaveEndDate,
            status: leaveStatus
        }
    };
}

// ============================================================================
// INITIALIZE RESULT OBJECT WITH SEPARATED CATEGORIES
// ============================================================================
var result = {
    success: true,
    recordId: recordId,
    leaveDetails: {
        clientId: leaveClientId,
        clientName: leaveClientId,
        startDate: leaveStartDate,
        endDate: leaveEndDate,
        startTime: leaveStartTime,
        endTime: leaveEndTime,
        status: leaveStatus,
        cancelRequest: cancelRequest
    },
    summary: {
        totalAffectedSchedules: 0,
        cancelledSchedules: 0,
        restoredSchedules: 0,
        reassignedSchedules: 0,
        freedCaregivers: 0,
        unassignedSchedules: 0,
        addedToAvailabilityList: 0
    },
    // Separated output categories
    cancelledSchedules: [],           // Schedules cancelled due to leave
    reassignedSchedules: [],          // Schedules where freed caregivers were reassigned
    availabilityListUpdates: [],      // Caregivers added to availability list (no matching schedules)
    unassignedSchedules: [],          // Schedules that couldn't get caregivers assigned
    restoredSchedules: [],            // Schedules restored when leave is cancelled
    availabilityListUpdatesChange: [], // NEW: Schedules with available caregivers list for easy assignment
    caregiverChangeHistory: [],       // NEW: Complete tracking of caregiver changes (removal, reassignment, availability)
    // Legacy arrays for backward compatibility
    scheduleUpdates: [],
    caregiverReassignments: [],
    remarks: [],
    // Debug information
    debug: {
        totalAvailableCaregivers: getAvaliableCaregivers ? getAvaliableCaregivers.length : 0,
        totalEmployees: employeesDetails ? employeesDetails.length : 0,
        totalSchedules: getassignedClientsSchedules ? getassignedClientsSchedules.length : 0,
        totalUnassignedSchedules: returnAllUnassignedSchedules ? returnAllUnassignedSchedules.length : 0,
        hasAvailableCaregivers: !!(getAvaliableCaregivers && getAvaliableCaregivers.length > 0),
        hasEmployeesDetails: !!(employeesDetails && employeesDetails.length > 0),
        hasAssignedSchedules: (returnAllScheduledCompletedassignedSchedules && returnAllScheduledCompletedassignedSchedules.length > 0) || (returnAllGhostShiftassignedSchedules && returnAllGhostShiftassignedSchedules.length > 0),
        hasUnassignedSchedules: !!(returnAllUnassignedSchedules && returnAllUnassignedSchedules.length > 0),
        totalAssignedSchedules: (returnAllScheduledCompletedassignedSchedules ? returnAllScheduledCompletedassignedSchedules.length : 0) + (returnAllGhostShiftassignedSchedules ? returnAllGhostShiftassignedSchedules.length : 0),
        currentWeekRestoredHours: {},
        currentWeekAssignedHours: {},
        weeklyHoursTracking: {} // NEW: Detailed tracking of hours calculations per caregiver
    }
};

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
function formatTimeFromMinutes(minutes) {
    if (typeof minutes !== 'number' || isNaN(minutes)) return '';
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    return zero2(hours) + ':' + zero2(mins);
}


function timeOverlap(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
}

function deriveRestoredHours(scheduleRecord, startMinutes, endMinutes) {
    if (!scheduleRecord || !scheduleRecord.fields) return 0;
    var fields = scheduleRecord.fields;

    var publishedRaw = safeGetValue(fields, 'Expected_Hours.value', null);
    var publishedHours = parseFloat(publishedRaw);
    if (!isNaN(publishedHours) && publishedHours > 0) {
        return publishedHours;
    }

    var actualRaw = safeGetValue(fields, 'Actual_Hours.value', null);
    var actualHours = parseFloat(actualRaw);
    if (!isNaN(actualHours) && actualHours > 0) {
        return actualHours;
    }

    var startVal = (typeof startMinutes === 'number' && !isNaN(startMinutes)) ? startMinutes : null;
    var endVal = (typeof endMinutes === 'number' && !isNaN(endMinutes)) ? endMinutes : null;

    if (startVal === null || endVal === null) {
        var startTimeStr = safeGetValue(fields, 'Schedule_Start_Time.value', '');
        var endTimeStr = safeGetValue(fields, 'Schedule_End_Time.value', '');
        if (startVal === null) {
            startVal = parseTime(startTimeStr);
        }
        if (endVal === null) {
            endVal = parseTime(endTimeStr);
        }
    }

    if (typeof startVal === 'number' && typeof endVal === 'number' && endVal > startVal) {
        return (endVal - startVal) / 60;
    }

    return 0;
}

function parseList(v) {
    var s = normStr(v);
    if (!s) return [];
    return s.split(/[,;/\n]+/).map(function (x) { return normStr(x).toLowerCase(); }).filter(Boolean);
}

function normalizeSkillList(val) {
    if (Array.isArray(val)) {
        return val.map(function (x) { return normStr(x).toLowerCase(); }).filter(Boolean);
    }
    if (typeof val === 'string') {
        return parseList(val);
    }
    // Handle the case where val might be an object with nested values
    if (val && typeof val === 'object' && val.value) {
        return normalizeSkillList(val.value);
    }
    return parseList(val);
}
function isArray(a) {
    return Object.prototype.toString.call(a) === '[object Array]';
}

function safeParseNumber(value, defaultValue) {
    if (typeof value === 'number' && !isNaN(value)) return value;
    var parsed = parseFloat(value);
    return isNaN(parsed) ? (defaultValue || 0) : parsed;
}

function getScoringWeights() {
    var weights = { workHours: 0, language: 0, skills: 0, historical: 0 };
    if (isArray(settingsrecords) && settingsrecords.length > 0 && settingsrecords[0].fields) {
        var fields = settingsrecords[0].fields;
        weights.workHours = safeParseNumber(safeGetValue(fields, 'Worked_Hours_.value', weights.workHours), weights.workHours);
        weights.language = safeParseNumber(safeGetValue(fields, 'Language_.value', weights.language), weights.language);
        weights.skills = safeParseNumber(safeGetValue(fields, 'Skills_.value', weights.skills), weights.skills);
        weights.historical = safeParseNumber(safeGetValue(fields, 'Client_History_.value', weights.historical), weights.historical);
    }
    return weights;
}

function zero2(n) { return n < 10 ? '0' + n : '' + n; }

function getDayOfWeek(y, m, d) {
    var t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    if (m < 3) y -= 1;
    return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7;
}

function daysInMonth(y, m) {
    var monthDays = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return monthDays[m - 1];
}

function getEmployeeRecordByName(caregiverName, employeesDetails) {
    if (!caregiverName || !employeesDetails || !isArray(employeesDetails)) return null;

    var cgNorm = normName(caregiverName);
    for (var i = 0; i < employeesDetails.length; i++) {
        var emp = employeesDetails[i];
        if (emp && emp.fields) {
            var empName = safeGetValue(emp, 'fields.Employee_Full_Name.value', '');
            if (normName(empName) === cgNorm) {
                return emp;
            }
        }
    }
    return null;
}

function getCaregiverEmployeeId(caregiverName, employeesDetails) {
    var emp = getEmployeeRecordByName(caregiverName, employeesDetails);
    return (emp && emp.id) ? String(emp.id) : '';
}

function isCaregiverAvailableForSchedule(caregiverName, dayName, startMin, endMin, employeesDetails) {
    if (!caregiverName || !dayName) return false;

    // If employeesDetails is not provided, don't block scheduling on this gate
    if (!isArray(employeesDetails) || employeesDetails.length === 0) {
        return true;
    }

    var cgNorm = normName(caregiverName);
    var dayKey = dayToKey(dayName);
    var segments = getShiftSegmentsForWindow(startMin, endMin);

    // Find employee record by Employee_Full_Name.value
    var emp = getEmployeeRecordByName(caregiverName, employeesDetails);
    if (!emp || !emp.fields) return false;

    // All overlapped segments must be affirmative
    for (var s = 0; s < segments.length; s++) {
        var seg = segments[s]; // 'AM' | 'PM' | 'NOC'
        var key = dayKey + '_' + seg; // e.g., MONDAY_AM
        var raw = safeGetValue(emp.fields, key + '.value', '');
        var val = normStr(String(raw)).toLowerCase();
        if (!(val === 'yes' || val === 'true')) {
            return false;
        }
    }
    return true;
}

function dayToKey(dayName) {
    var d = normStr(dayName).toUpperCase();
    var map = {
        'SUNDAY': 'SUNDAY', 'MONDAY': 'MONDAY', 'TUESDAY': 'TUESDAY',
        'WEDNESDAY': 'WEDNESDAY', 'THURSDAY': 'THURSDAY',
        'FRIDAY': 'FRIDAY', 'SATURDAY': 'SATURDAY'
    };
    return map[d] || d;
}

function isGhostShift(schedule) {
    if (!schedule || !schedule.fields) return false;

    var f = schedule.fields;

    // Check Shift_Status field
    var shiftStatus = normStr(safeGetValue(f, 'Shift_Status.value', '')).toLowerCase();
    if (shiftStatus.indexOf('ghost shift') !== -1) return true;

    // Check Scheduling_Status field
    var schedulingStatus = normStr(safeGetValue(f, 'Scheduling_Status.value', '')).toLowerCase();
    if (schedulingStatus.indexOf('ghost shift') !== -1) return true;

    // Check legacy fields
    var isGhost = safeGetValue(f, 'Is_Ghost_Shift.value', false);
    if (isGhost) return true;

    var shiftType = normStr(safeGetValue(f, 'Shift_Type.value', '')).toLowerCase();
    if (shiftType === 'ghost') return true;

    return false;
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

function getDayNameFromDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';

    var parts = dateStr.split('-');
    if (parts.length !== 3) return '';

    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return '';

    var date = new Date(year, month - 1, day);
    var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return dayNames[date.getDay()];
}

function getWeekStartEnd(date) {
    if (!date) return { start: '', end: '' };
    var parts = date.split('-');
    if (parts.length !== 3) return { start: '', end: '' };
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return { start: '', end: '' };
    var dow = getDayOfWeek(y, m, d);
    var daysToStart = (1 - dow + 7) % 7; // Monday
    var startD = d - daysToStart;
    var startM = m, startY = y;
    while (startD < 1) {
        startM--;
        if (startM < 1) { startM = 12; startY--; }
        startD += daysInMonth(startY, startM);
    }
    var endD = startD + 6;
    var endM = startM, endY = startY;
    while (endD > daysInMonth(endY, endM)) {
        endD -= daysInMonth(endY, endM);
        endM++;
        if (endM > 12) { endM = 1; endY++; }
    }
    var start = startY + '-' + zero2(startM) + '-' + zero2(startD);
    var end = endY + '-' + zero2(endM) + '-' + zero2(endD);
    return { start: start, end: end };
}

function getCaregiverWorkedHoursThisWeek(caregiverName, actualSchedulingData, weekStartDate, weekEndDate) {
    var total = 0;
    var cgNorm = normName(caregiverName);

    var combinedSchedules = (returnAllScheduledCompletedassignedSchedules || []);

    for (var i = 0; i < combinedSchedules.length; i++) {
        var schedule = combinedSchedules[i];
        if (!schedule || !schedule.fields) continue;
        var f = schedule.fields;

        // Check both Select_Expected_Caregiver (ID) and Expected_Caregiver (name)
        var assignedCgId = safeGetValue(f, 'Select_Expected_Caregiver.value', '');
        var caregiverName_check = '';
        if (assignedCgId) {
            for (var j = 0; j < employeesDetails.length; j++) {
                if (employeesDetails[j] && employeesDetails[j].id === assignedCgId) {
                    caregiverName_check = safeGetValue(employeesDetails[j], 'fields.Employee_Full_Name.value', '');
                    break;
                }
            }
        }
        if (!caregiverName_check) {
            caregiverName_check = safeGetValue(f, 'Expected_Caregiver.value', '');
        }

        if (normName(caregiverName_check) !== cgNorm) continue;

        var status = safeGetValue(f, 'Scheduling_Status.value', '');
        if (status.toLowerCase().indexOf('cancel') !== -1) continue;

        // ENHANCED: Check BOTH Shift_Status and Scheduling_Status for ghost shifts
        var shiftStatus = normStr(safeGetValue(f, 'Shift_Status.value', '')).toLowerCase();
        var schedulingStatus = normStr(status).toLowerCase();

        if (shiftStatus.indexOf('ghost shift') !== -1 || schedulingStatus.indexOf('ghost shift') !== -1) {
            // Skip ghost shifts - they don't count toward weekly hours
            continue;
        }

        // Also check the legacy ghost shift fields
        var isGhost = safeGetValue(f, 'Is_Ghost_Shift.value', false) || safeGetValue(f, 'Shift_Type.value', '') === 'Ghost';
        if (isGhost) continue;

        var sDate = safeGetValue(f, 'Schedule_Start_Date.value', '');
        if (!sDate || sDate < weekStartDate || sDate > weekEndDate) continue;

        var hours = deriveRestoredHours(schedule, null, null);
        total += hours;
    }
    return total;
}



function getClientTotalHoursThisWeek(clientId, allClientsScheduleData, weekStartDate, weekEndDate) {
    var total = 0;
    for (var i = 0; i < allClientsScheduleData.length; i++) {
        var rec = allClientsScheduleData[i];
        if (!rec || !rec.fields) continue;
        var f = rec.fields;

        // Match by client name (clientId is actually client name in this context)
        var recClientName = safeGetValue(f, 'Client_Name.value', '');
        if (normName(recClientName) !== normName(clientId)) continue;

        var status = safeGetValue(f, 'Scheduling_Status.value', '');
        if (status !== 'Approved' && status !== 'Completed' && status !== 'Scheduled Completed') continue;

        var sDate = safeGetValue(f, 'Schedule_Start_Date.value', '');
        if (!sDate || sDate < weekStartDate || sDate > weekEndDate) continue;

        // Use Expected_Hours first, then Actual_Hours as fallback
        var hours = safeParseNumber(safeGetValue(f, 'Expected_Hours.value', 0), 0);
        if (hours === 0) {
            hours = safeParseNumber(safeGetValue(f, 'Actual_Hours.value', 0), 0);
        }
        total += hours;
    }
    return total;
}

/**
 * Check if a schedule falls within the client's leave date/time range
 * @param {string} scheduleDate - Schedule date (YYYY-MM-DD)
 * @param {number} scheduleStartMin - Schedule start time in minutes
 * @param {number} scheduleEndMin - Schedule end time in minutes
 * @param {string} leaveStartDate - Leave start date (YYYY-MM-DD)
 * @param {string} leaveEndDate - Leave end date (YYYY-MM-DD)
 * @param {string} leaveStartTime - Leave start time (HH:MM format, optional)
 * @param {string} leaveEndTime - Leave end time (HH:MM format, optional)
 * @returns {boolean} True if schedule falls within leave period
 */
function isScheduleInClientLeaveRange(scheduleDate, scheduleStartMin, scheduleEndMin, leaveStartDate, leaveEndDate, leaveStartTime, leaveEndTime) {
    // Check if schedule date is within leave date range
    if (scheduleDate < leaveStartDate || scheduleDate > leaveEndDate) {
        return false;
    }

    // If no leave times specified, entire day is blocked
    if (!leaveStartTime || !leaveEndTime) {
        return true;
    }

    // If leave times are specified, check for time overlap
    var leaveStartMin = parseTime(leaveStartTime);
    var leaveEndMin = parseTime(leaveEndTime);

    if (leaveStartMin !== null && leaveEndMin !== null) {
        // Check if schedule time overlaps with leave time
        return timeOverlap(scheduleStartMin, scheduleEndMin, leaveStartMin, leaveEndMin);
    }

    // If we can't parse leave times, assume entire day is blocked
    return true;
}

// ============================================================================
// DYNAMIC WEEKLY HOURS TRACKING FUNCTIONS
// ============================================================================

/**
 * Precompute initial weekly hours for all caregivers
 * This creates a baseline that will be dynamically adjusted during script execution
 * @returns {Object} Map of caregiver names to their weekly hour data
 */
function precomputeWeeklyHours() {
    var weeklyHoursMap = {};

    if (!employeesDetails || employeesDetails.length === 0) {
        return weeklyHoursMap;
    }

    for (var i = 0; i < employeesDetails.length; i++) {
        var emp = employeesDetails[i];
        if (!emp || !emp.fields) continue;

        var caregiverName = safeGetValue(emp.fields, 'Employee_Full_Name.value', '');
        if (!caregiverName) continue;

        var maxWeeklyHours = safeParseNumber(safeGetValue(emp.fields, 'Max_Weekly_Hours.value', 0), 0);

        // Get current week for this caregiver (use today's date as reference)
        var today = new Date();
        var todayStr = today.getFullYear() + '-' +
            zero2(today.getMonth() + 1) + '-' +
            zero2(today.getDate());
        var week = getWeekStartEnd(todayStr);

        // Calculate current worked hours from actualSchedulingData
        var currentWorked = getCaregiverWorkedHoursThisWeek(
            caregiverName,
            actualSchedulingData,
            week.start,
            week.end
        );

        weeklyHoursMap[caregiverName] = {
            maxWeeklyHours: maxWeeklyHours,
            initialWorkedHours: currentWorked,
            currentWorkedHours: currentWorked, // This will be adjusted dynamically
            freedHours: 0, // Hours freed from cancelled schedules
            assignedHours: 0, // Hours assigned during this operation
            weekStart: week.start,
            weekEnd: week.end,
            history: [] // Track all changes
        };
    }

    return weeklyHoursMap;
}

/**
 * Check if assigning a caregiver to a schedule would exceed their weekly hours
 * Uses dynamic tracking that accounts for freed and newly assigned hours
 * @param {string} caregiverName - Name of the caregiver
 * @param {number} candidateHours - Hours for the schedule being considered
 * @param {Object} dynamicWeeklyHours - The dynamic weekly hours tracking object
 * @returns {Object} Check result with passed flag and detailed information
 */
function weeklyDistributionCheck(caregiverName, candidateHours, dynamicWeeklyHours) {
    var checkResult = {
        passed: true,
        reason: '',
        details: {
            caregiverName: caregiverName,
            maxWeeklyHours: 0,
            initialWorkedHours: 0,
            freedHours: 0,
            assignedHours: 0,
            currentEffectiveHours: 0,
            candidateHours: candidateHours,
            projectedHours: 0,
            remainingHours: 0,
            wouldExceed: false
        }
    };

    // If no tracking data exists for this caregiver, fail the check
    if (!dynamicWeeklyHours || !dynamicWeeklyHours[caregiverName]) {
        checkResult.passed = false;
        checkResult.reason = 'No weekly hours tracking data found for caregiver';
        return checkResult;
    }

    var tracking = dynamicWeeklyHours[caregiverName];

    // Calculate effective current hours (initial - freed + assigned)
    var effectiveHours = tracking.initialWorkedHours - tracking.freedHours + tracking.assignedHours;
    var projectedHours = effectiveHours + candidateHours;
    var remainingHours = tracking.maxWeeklyHours - effectiveHours;

    // Populate details
    checkResult.details.maxWeeklyHours = tracking.maxWeeklyHours;
    checkResult.details.initialWorkedHours = tracking.initialWorkedHours;
    checkResult.details.freedHours = tracking.freedHours;
    checkResult.details.assignedHours = tracking.assignedHours;
    checkResult.details.currentEffectiveHours = effectiveHours;
    checkResult.details.projectedHours = projectedHours;
    checkResult.details.remainingHours = remainingHours;

    // Check if assignment would exceed max weekly hours
    if (tracking.maxWeeklyHours > 0 && projectedHours > tracking.maxWeeklyHours) {
        checkResult.passed = false;
        checkResult.details.wouldExceed = true;
        checkResult.reason = 'Would exceed max weekly hours (' +
            projectedHours.toFixed(2) + ' > ' +
            tracking.maxWeeklyHours + '). ' +
            'Current effective: ' + effectiveHours.toFixed(2) + ' hrs ' +
            '(Initial: ' + tracking.initialWorkedHours.toFixed(2) +
            ', Freed: ' + tracking.freedHours.toFixed(2) +
            ', Assigned: ' + tracking.assignedHours.toFixed(2) + ')';
    } else {
        checkResult.passed = true;
        checkResult.reason = 'Within weekly hours limit. ' +
            'Projected: ' + projectedHours.toFixed(2) + ' / ' +
            tracking.maxWeeklyHours + ' hrs. ' +
            'Remaining: ' + remainingHours.toFixed(2) + ' hrs';
    }

    return checkResult;
}

// Resolve caregiver ID to name using employeesDetails
function resolveCaregiverName(caregiverId) {
    if (!caregiverId || !employeesDetails || employeesDetails.length === 0) return '';

    for (var i = 0; i < employeesDetails.length; i++) {
        var emp = employeesDetails[i];
        if (emp && emp.id === caregiverId) {
            return safeGetValue(emp, 'fields.Employee_Full_Name.value', '');
        }
    }
    return '';
}

// Resolve caregiver name to ID using employeesDetails
function resolveCaregiverId(caregiverName) {
    if (!caregiverName || !employeesDetails || employeesDetails.length === 0) return '';

    var cgNorm = normName(caregiverName);
    for (var i = 0; i < employeesDetails.length; i++) {
        var emp = employeesDetails[i];
        if (emp && emp.fields) {
            var empName = safeGetValue(emp, 'fields.Employee_Full_Name.value', '');
            if (normName(empName) === cgNorm) {
                return emp.id;
            }
        }
    }
    return '';
}

// Resolve caregiver name to numeric Employee ID (QB_Id) using employeesDetails
function resolveCaregiverEmployeeId(caregiverName) {
    if (!caregiverName || !employeesDetails || employeesDetails.length === 0) return 0;

    var cgNorm = normName(caregiverName);
    for (var i = 0; i < employeesDetails.length; i++) {
        var emp = employeesDetails[i];
        if (emp && emp.fields) {
            var empName = safeGetValue(emp, 'fields.Employee_Full_Name.value', '');
            if (normName(empName) === cgNorm) {
                var qbId = safeGetValue(emp, 'fields.QB_Id.value', '');
                if (qbId) {
                    var numId = parseInt(qbId, 10);
                    return isNaN(numId) ? 0 : numId;
                }
            }
        }
    }
    return 0;
}

// Check if caregiver is available at a specific date and time (no overlapping assignments)
function isCaregiverAvailableAtTime(caregiverName, schedDate, startMin, endMin) {
    if (!caregiverName || !schedDate || startMin == null || endMin == null) return false;

    var cgNorm = normName(caregiverName);

    // Check in actualSchedulingData for approved/completed schedules
    for (var i = 0; i < actualSchedulingData.length; i++) {
        var rec = actualSchedulingData[i];
        if (!rec || !rec.fields) continue;

        var f = rec.fields;
        if (normName(safeGetValue(f, 'Actual_Caregiver.value', '')) !== cgNorm) continue;

        var status = safeGetValue(f, 'Scheduling_Status.value', '');
        if (status !== 'Approved' && status !== 'Completed') continue;

        var sDate = safeGetValue(f, 'Schedule_Start_Date.value', '');
        if (sDate !== schedDate) continue;

        var sTime = safeGetValue(f, 'Schedule_Start_Time.value', '');
        var eTime = safeGetValue(f, 'Schedule_End_Time.value', '');
        var sMin = parseTime(sTime);
        var eMin = parseTime(eTime);

        if (sMin != null && eMin != null && timeOverlap(startMin, endMin, sMin, eMin)) {
            return false; // Overlapping assignment found
        }
    }

    return true; // No overlapping assignments
}

function checkCaregiverAvailabilityByType(caregiverName, dayName, startMin, endMin, employeesDetails, caregiverAvailability) {
    if (!caregiverName || !dayName || startMin == null || endMin == null) {
        return false;
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
        return isCaregiverAvailableForSchedule(caregiverName, dayName, startMin, endMin, employeesDetails);
    }
}


function isCaregiverAvailableForCustomTime(caregiverName, dayName, startMin, endMin, caregiverAvailability) {
    if (!caregiverName || !dayName || startMin == null || endMin == null) {
        return false;
    }

    // If caregiverAvailability is not provided, don't block scheduling
    if (!caregiverAvailability || !caregiverAvailability.data || !isArray(caregiverAvailability.data)) {
        return true;
    }

    // Find the caregiver's employee ID first
    var caregiverEmployeeId = getCaregiverEmployeeId(caregiverName, employeesDetails);
    if (!caregiverEmployeeId) {
        return false; // Cannot find caregiver, assume not available
    }

    // Get caregiver's custom time schedules for the specific day
    var caregiverSchedules = [];
    var schedulesList = caregiverAvailability.data || [];

    for (var i = 0; i < schedulesList.length; i++) {
        var scheduleItem = schedulesList[i];
        if (!scheduleItem || !scheduleItem.fields) continue;

        // Use refId to match caregiver
        if (scheduleItem.refId !== caregiverEmployeeId) continue;

        var scheduleDayName = normStr(safeGetValue(scheduleItem.fields, 'Day.value', '')).toUpperCase();
        var requestedDayName = normStr(dayName).toUpperCase();

        if (scheduleDayName !== requestedDayName) continue;

        var startTimeStr = normStr(safeGetValue(scheduleItem.fields, 'Schedule_Start_Time.value', ''));
        var endTimeStr = normStr(safeGetValue(scheduleItem.fields, 'Schedule_End_Time.value', ''));

        var availableStartTime = parseTime(startTimeStr);
        var availableEndTime = parseTime(endTimeStr);

        if (availableStartTime === null || availableEndTime === null) continue;
        if (availableStartTime >= availableEndTime) continue;

        caregiverSchedules.push({
            startTime: availableStartTime,
            endTime: availableEndTime
        });
    }

    // If no custom schedules found for this day, caregiver is not available
    if (caregiverSchedules.length === 0) {
        return false;
    }

    // Sort schedules by start time
    caregiverSchedules.sort(function (a, b) {
        return a.startTime - b.startTime;
    });

    // Check if the requested time window is fully covered by available slots
    var coveredStart = startMin;

    for (var j = 0; j < caregiverSchedules.length; j++) {
        var schedule = caregiverSchedules[j];

        // If there's a gap before this schedule starts
        if (schedule.startTime > coveredStart) {
            return false; // Gap found, not fully covered
        }

        // Extend coverage if this schedule helps
        if (schedule.endTime > coveredStart) {
            coveredStart = Math.max(coveredStart, schedule.endTime);
        }

        // Check if we've covered the entire requested time
        if (coveredStart >= endMin) {
            return true;
        }
    }

    // Check if we covered the entire requested time
    return coveredStart >= endMin;
}


// Get all schedules for a caregiver during a specific time range
function getCaregiverSchedulesInTimeRange(caregiverName, targetDate, targetStartTime, targetEndTime) {
    var schedules = [];
    if (!caregiverName || !targetDate) return schedules;

    var cgNorm = normName(caregiverName);
    var caregiverId = resolveCaregiverId(caregiverName);

    // Search in getassignedClientsSchedules
    for (var i = 0; i < getassignedClientsSchedules.length; i++) {
        var schedule = getassignedClientsSchedules[i];
        if (!schedule || !schedule.fields) continue;

        // Get schedule details
        var scheduleStartDate = safeGetValue(schedule, 'fields.Schedule_Start_Date.value', '');
        var scheduleEndDate = safeGetValue(schedule, 'fields.Schedule_End_Date.value', '');
        var scheduleStartTime = safeGetValue(schedule, 'fields.Schedule_Start_Time.value', '');
        var scheduleEndTime = safeGetValue(schedule, 'fields.Schedule_End_Time.value', '');
        var clientName = safeGetValue(schedule, 'fields.Client_Name.value', '');
        var shiftStatus = safeGetValue(schedule, 'fields.Shift_Status.value', '');
        var schedulingStatus = safeGetValue(schedule, 'fields.Scheduling_Status.value', '');

        // Get assigned caregiver
        var assignedCaregiverId = safeGetValue(schedule, 'fields.Select_Expected_Caregiver.value', '');
        var assignedCaregiver = '';

        // Resolve caregiver name from ID
        if (assignedCaregiverId) {
            for (var j = 0; j < employeesDetails.length; j++) {
                var emp = employeesDetails[j];
                if (emp && emp.id === assignedCaregiverId) {
                    assignedCaregiver = safeGetValue(emp, 'fields.Employee_Full_Name.value', '');
                    break;
                }
            }
        }

        // Check if this schedule belongs to the target caregiver
        if (normName(assignedCaregiver) !== cgNorm) continue;

        // Check if schedule date overlaps with target date
        if (!scheduleStartDate || !scheduleEndDate) continue;

        // Check if target date is within the schedule's date range (using string comparison for YYYY-MM-DD format)
        if (targetDate >= scheduleStartDate && targetDate <= scheduleEndDate) {
            // Check time overlap
            var targetStart = parseTime(targetStartTime);
            var targetEnd = parseTime(targetEndTime);
            var schedStart = parseTime(scheduleStartTime);
            var schedEnd = parseTime(scheduleEndTime);

            // Check if times overlap
            var hasTimeOverlap = (targetStart < schedEnd && targetEnd > schedStart);

            // Get client ID
            var clientId = '';
            for (var k = 0; k < allClientsScheduleData.length; k++) {
                var client = allClientsScheduleData[k];
                if (client && client.fields) {
                    var cName = safeGetValue(client, 'fields.Client_Full_Name.value', '');
                    if (normName(cName) === normName(clientName)) {
                        clientId = client.id;
                        break;
                    }
                }
            }

            // Get schedule type from client data
            var scheduleType = '';
            for (var m = 0; m < allClientsScheduleData.length; m++) {
                var clientData = allClientsScheduleData[m];
                if (clientData && clientData.id === clientId) {
                    scheduleType = safeGetValue(clientData, 'fields.Client_Type.value', '');
                    break;
                }
            }

            schedules.push({
                scheduleId: schedule.id,
                clientName: clientName,
                clientId: clientId,
                scheduleType: scheduleType,
                startTime: scheduleStartTime,
                endTime: scheduleEndTime,
                scheduleDate: targetDate,
                dateRange: scheduleStartDate + " to " + scheduleEndDate,
                shiftStatus: shiftStatus,
                schedulingStatus: schedulingStatus,
                hasTimeOverlap: hasTimeOverlap,
                timeOverlapDetails: hasTimeOverlap ? "Overlaps with cancelled schedule time" : "No time overlap"
            });
        }
    }

    return schedules;
}

// ============================================================================
// CAREGIVER AVAILABILITY CHECK
// ============================================================================

function isCaregiverOnLeave(caregiverName, scheduleDate, scheduleStartTime, scheduleEndTime) {
    if (!caregiverName || !scheduleDate) return false;

    var cgNorm = normName(caregiverName);

    for (var i = 0; i < leavesData.length; i++) {
        var leave = leavesData[i];
        if (!leave || !leave.fields) continue;

        var leaveCg = safeGetValue(leave.fields, 'Caregiver.value', '');
        var leaveStatus = safeGetValue(leave.fields, 'Leave_Status.value', '');

        if (normName(leaveCg) !== cgNorm || leaveStatus !== 'Approved') continue;

        var leaveStart = safeGetValue(leave.fields, 'Start_Date.value', '');
        var leaveEnd = safeGetValue(leave.fields, 'End_Date.value', '');

        if (scheduleDate < leaveStart || scheduleDate > leaveEnd) continue;

        var leaveStartTime = safeGetValue(leave.fields, 'Start_Time.value', '');
        var leaveEndTime = safeGetValue(leave.fields, 'End_Time.value', '');

        if (scheduleStartTime !== undefined && scheduleEndTime !== undefined &&
            leaveStartTime && leaveEndTime) {
            var leaveStartMin = parseTime(leaveStartTime);
            var leaveEndMin = parseTime(leaveEndTime);
            if (leaveStartMin !== null && leaveEndMin !== null) {
                if (timeOverlap(scheduleStartTime, scheduleEndTime, leaveStartMin, leaveEndMin)) {
                    return true;
                }
            } else {
                return true;
            }
        } else {
            return true;
        }
    }
    return false;
}

// ============================================================================
// CHECK IF CAREGIVER IS ALREADY ASSIGNED TO ANOTHER SCHEDULE
// ============================================================================
// Enhanced to:
// 1. Exclude the current client from conflict checks (allow same caregiver for same client)
// 2. Skip cancelled schedules (only check active schedules)
// 3. Provide detailed conflict information

function isCaregiverAlreadyAssigned(caregiverName, scheduleDate, scheduleStartTime, scheduleEndTime, currentClientName, freedTimeSlots, excludeScheduleIds) {
    if (!caregiverName || !scheduleDate) {
        return { isAssigned: false, conflictDetails: null };
    }
    var cgNorm = normName(caregiverName);
    var currentClientNorm = currentClientName ? normName(currentClientName) : '';
    var excludeIds = excludeScheduleIds || [];
    var combinedAssignedSchedules = [];

    function pushSchedule(sourceSchedule, sourceType) {
        if (!sourceSchedule || !sourceSchedule.fields) return;
        if (excludeIds.indexOf(sourceSchedule.id) !== -1) return;

        var scheduleDateVal = safeGetValue(sourceSchedule.fields, 'Schedule_Start_Date.value', '') ||
            safeGetValue(sourceSchedule.fields, 'Schedule_Date.value', '');
        var scheduleStartTimeVal = safeGetValue(sourceSchedule.fields, 'Schedule_Start_Time.value', '') ||
            safeGetValue(sourceSchedule.fields, 'Start_Time.value', '');
        var scheduleEndTimeVal = safeGetValue(sourceSchedule.fields, 'Schedule_End_Time.value', '') ||
            safeGetValue(sourceSchedule.fields, 'End_Time.value', '');
        var schedulingStatus = safeGetValue(sourceSchedule.fields, 'Scheduling_Status.value', '');
        var expectedCaregiverId = safeGetValue(sourceSchedule.fields, 'Select_Expected_Caregiver.value', '');
        var expectedCaregiverName = safeGetValue(sourceSchedule.fields, 'Expected_Caregiver.value', '');
        var actualCaregiverName = safeGetValue(sourceSchedule.fields, 'Actual_Caregiver.value', '');
        var caregiverNameResolved = expectedCaregiverName ||
            (expectedCaregiverId ? resolveCaregiverName(expectedCaregiverId) : '') ||
            actualCaregiverName;

        if (!caregiverNameResolved || normName(caregiverNameResolved) !== cgNorm) return;

        combinedAssignedSchedules.push({
            scheduleId: sourceSchedule.id,
            clientName: safeGetValue(sourceSchedule.fields, 'Client_Name.value', ''),
            date: scheduleDateVal,
            startTimeRaw: scheduleStartTimeVal,
            endTimeRaw: scheduleEndTimeVal,
            startTime: parseTime(scheduleStartTimeVal),
            endTime: parseTime(scheduleEndTimeVal),
            schedulingStatus: schedulingStatus,
            sourceType: sourceType
        });
    }

    if (returnAllScheduledCompletedassignedSchedules) {
        for (var i = 0; i < returnAllScheduledCompletedassignedSchedules.length; i++) {
            pushSchedule(returnAllScheduledCompletedassignedSchedules[i], 'Client');
        }
    }
    if (returnAllGhostShiftassignedSchedules) {
        for (var g = 0; g < returnAllGhostShiftassignedSchedules.length; g++) {
            pushSchedule(returnAllGhostShiftassignedSchedules[g], 'GhostShift');
        }
    }

    if (combinedAssignedSchedules.length === 0) {
        return { isAssigned: false, conflictDetails: null };
    }

    for (var k = 0; k < combinedAssignedSchedules.length; k++) {
        var sched = combinedAssignedSchedules[k];
        if (sched.date !== scheduleDate) continue;

        // Skip cancelled
        var statusStr = (sched.schedulingStatus || '').toLowerCase();
        if (statusStr.indexOf('cancel') !== -1) continue;

        if (sched.startTime == null || sched.endTime == null ||
            scheduleStartTime == null || scheduleEndTime == null) continue;

        // ANY overlap (client or ghost) blocks
        if (timeOverlap(scheduleStartTime, scheduleEndTime, sched.startTime, sched.endTime)) {
            // Ignore if fully inside a freed (cancelled) slot (still considered free time)
            var isFreedConflict = false;
            if (freedTimeSlots && freedTimeSlots.length > 0) {
                for (var f = 0; f < freedTimeSlots.length; f++) {
                    var freed = freedTimeSlots[f];
                    if (freed.date === sched.date) {
                        var parts = freed.time.split(' - ');
                        var freedStart = parseTime(parts[0]);
                        var freedEnd = parseTime(parts[1]);
                        if (timeOverlap(freedStart, freedEnd, sched.startTime, sched.endTime)) {
                            isFreedConflict = true;
                            break;
                        }
                    }
                }
            }
            if (!isFreedConflict) {
                return {
                    isAssigned: true,
                    conflictDetails: {
                        conflictingClientName: sched.clientName || (sched.sourceType === 'GhostShift' ? 'Ghost Shift' : ''),
                        conflictingDate: sched.date,
                        conflictingTime: sched.startTimeRaw + ' - ' + sched.endTimeRaw,
                        description: 'Already assigned (blocks reassignment) [' + sched.sourceType + ']'
                    }
                };
            }
        }
    }
    return { isAssigned: false, conflictDetails: null };
}

// ============================================================================
// WEIGHTED SCORING CALCULATION
// ============================================================================

function calculateWeightedScore(caregiverName, clientData, scheduleDate) {
    var score = {
        total: 0,
        breakdown: {
            historical: 0,
            language: 0,
            skills: 0,
            workHours: 0
        },
        details: {
            historical: "No historical work with client",
            language: "No language match",
            skills: "No skills match",
            workHours: "No work hours data"
        }
    };

    if (!caregiverName || !clientData) return score;

    var cgNorm = normName(caregiverName);
    var clientName = safeGetValue(clientData.fields, 'Client_Full_Name.value', '');

    // Get weight settings from settingsrecords
    var historicalWeight = 0; // Default
    var languageWeight = 0;   // Default
    var skillsWeight = 0;     // Default
    var workHoursWeight = 0;  // Default

    if (settingsrecords && settingsrecords.length > 0) {
        var settings = settingsrecords[0];
        if (settings && settings.fields) {
            historicalWeight = safeGetValue(settings.fields, 'Client_History_.value', historicalWeight);
            languageWeight = safeGetValue(settings.fields, 'Language_.value', languageWeight);
            skillsWeight = safeGetValue(settings.fields, 'Skills_.value', skillsWeight);
            workHoursWeight = safeGetValue(settings.fields, 'Worked_Hours_.value', workHoursWeight);
        }
    }

    // 1. Historical work with client
    var hasHistoricalWork = false;
    for (var i = 0; i < actualSchedulingData.length; i++) {
        var record = actualSchedulingData[i];
        if (!record || !record.fields) continue;

        var recClient = safeGetValue(record.fields, 'Client_Name.value', '');
        var recCg = safeGetValue(record.fields, 'Actual_Caregiver.value', '');
        var recStatus = safeGetValue(record.fields, 'Scheduling_Status.value', '');

        if (normName(recClient) === normName(clientName) &&
            normName(recCg) === cgNorm &&
            (recStatus === 'Scheduled Completed' || recStatus === 'Approved')) {
            hasHistoricalWork = true;
            break;
        }
    }

    if (hasHistoricalWork) {
        score.breakdown.historical = historicalWeight;
        score.details.historical = "Has worked with client before (+" + historicalWeight + " points)";
    }

    // 2. Language match
    var clientLanguages = normalizeSkillList(safeGetValue(clientData.fields, 'Language.value', ''));
    if (clientLanguages.length > 0) {
        var emp = null;
        for (var j = 0; j < employeesDetails.length; j++) {
            var e = employeesDetails[j];
            var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
            if (nm && normName(nm) === cgNorm) {
                emp = e;
                break;
            }
        }

        if (emp && emp.fields) {
            var caregiverLanguages = normalizeSkillList(safeGetValue(emp.fields, 'Language.value', ''));
            var matchingLanguages = [];

            for (var k = 0; k < clientLanguages.length; k++) {
                for (var l = 0; l < caregiverLanguages.length; l++) {
                    if (clientLanguages[k] === caregiverLanguages[l]) {
                        matchingLanguages.push(clientLanguages[k]);
                        break;
                    }
                }
            }

            if (matchingLanguages.length > 0) {
                score.breakdown.language = languageWeight;
                score.details.language = "Language match: " + matchingLanguages.join(', ') + " (+" + languageWeight + " points)";
            } else {
                score.details.language = "No matching languages (Client: " + clientLanguages.join(', ') +
                    ", Caregiver: " + caregiverLanguages.join(', ') + ")";
            }
        }
    }

    // 3. Skills match
    var clientSkills = normalizeSkillList(safeGetValue(clientData.fields, 'Skills.value', ''));
    if (clientSkills.length > 0) {
        var emp2 = null;
        for (var m = 0; m < employeesDetails.length; m++) {
            var e2 = employeesDetails[m];
            var nm2 = safeGetValue(e2, 'fields.Employee_Full_Name.value', '');
            if (nm2 && normName(nm2) === cgNorm) {
                emp2 = e2;
                break;
            }
        }

        if (emp2 && emp2.fields) {
            var caregiverSkills = normalizeSkillList(safeGetValue(emp2.fields, 'Skills.value', ''));
            var matchingSkills = [];

            for (var n = 0; n < clientSkills.length; n++) {
                for (var o = 0; o < caregiverSkills.length; o++) {
                    if (clientSkills[n] === caregiverSkills[o]) {
                        matchingSkills.push(clientSkills[n]);
                        break;
                    }
                }
            }

            if (matchingSkills.length > 0) {
                score.breakdown.skills = skillsWeight;
                score.details.skills = "Skills match: " + matchingSkills.join(', ') + " (+" + skillsWeight + " points)";
            } else {
                score.details.skills = "No matching skills (Client needs: " + clientSkills.join(', ') +
                    ", Caregiver has: " + caregiverSkills.join(', ') + ")";
            }
        }
    }

    // 4. Work hours (simplified - just check if caregiver has capacity)
    // This is a placeholder - full implementation would check weekly hours
    score.breakdown.workHours = 0; // Default to 0 for now
    score.details.workHours = "Work hours check not fully implemented";

    // Calculate total
    score.total = score.breakdown.historical + score.breakdown.language +
        score.breakdown.skills + score.breakdown.workHours;

    return score;
}

// ============================================================================
// CAREGIVER MATCHING FUNCTIONS
// ============================================================================

function checkBlocklist(caregiverName, clientData) {
    if (!clientData || !clientData.fields) return false;

    var blocklist = parseList(safeGetValue(clientData.fields, 'Caregiver_Block_List.value', ''));
    var cgNorm = normName(caregiverName);

    for (var i = 0; i < blocklist.length; i++) {
        if (blocklist[i] === cgNorm) {
            return true;
        }
    }
    return false;
}

function checkPhysicalCapability(caregiverName, clientData, employeesDetails, returnDetailed) {
    var clientFields = clientData.fields || {};
    var clientWeightClass = normStr(safeGetValue(clientFields, 'Weight_Class.value', '')).toLowerCase();
    var clientLbs = safeParseNumber(safeGetValue(clientFields, 'Physical_Capability_lbs.value', 0), 0);

    if (!clientWeightClass && !clientLbs) {
        return returnDetailed ? { passes: true, reason: 'No weight class requirement', scoreBoost: 0 } : true;
    }

    if (!employeesDetails || employeesDetails.length === 0) {
        return returnDetailed ? { passes: false, reason: 'No employee details available', scoreBoost: 0 } : false;
    }

    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }
    if (!emp || !emp.fields) {
        return returnDetailed ? { passes: false, reason: 'Employee not found', scoreBoost: 0 } : false;
    }

    var caregiverWeightClass = normStr(safeGetValue(emp.fields, 'Weight_Class.value', '')).toLowerCase();
    var caregiverLbs = safeParseNumber(safeGetValue(emp.fields, 'Physical_Capability_lbs.value', 0), 0);

    var weightClassMatch = false;
    if (clientWeightClass === "standard") {
        weightClassMatch = (caregiverWeightClass === "standard" || caregiverWeightClass === "heavy");
    } else if (clientWeightClass === "heavy") {
        weightClassMatch = (caregiverWeightClass === "heavy");
    } else {
        weightClassMatch = true; // No specific requirement
    }

    var lbsMatch = clientLbs === 0 || caregiverLbs >= clientLbs;
    var passes = weightClassMatch && lbsMatch;

    if (returnDetailed) {
        return {
            passes: passes,
            reason: passes ? 'Physical capability matches requirements' :
                (!weightClassMatch ? 'Weight class mismatch (Client: ' + clientWeightClass + ', Caregiver: ' + caregiverWeightClass + ')' :
                    'Lifting capacity insufficient (Client needs: ' + clientLbs + 'lbs, Caregiver: ' + caregiverLbs + 'lbs)'),
            scoreBoost: passes ? 3 : 0
        };
    }

    return passes;
}

function checkGenderPreference(caregiverName, clientData) {
    if (employeesDetails.length === 0) return true;

    var genderPref = safeGetValue(clientData.fields, 'Gender_Preference.value', '');
    var isStrict = normStr(safeGetValue(clientData.fields, 'Gender_Preference_Strict.value', '')).toLowerCase() === 'yes';

    if (!genderPref || !isStrict) return true;

    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
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
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }

    if (!emp || !emp.fields) return false;

    var facilityEligible = normStr(safeGetValue(emp.fields, 'Facility.value', '')).toLowerCase() === 'yes';
    var privateEligible = normStr(safeGetValue(emp.fields, 'Private.value', '')).toLowerCase() === 'yes';

    if (clientTypeNorm === 'facility') return facilityEligible;
    if (clientTypeNorm === 'private') return privateEligible;
    return facilityEligible || privateEligible;
}

function calculateMatchScore(caregiverName, clientData) {
    var score = 0;

    if (employeesDetails.length === 0) return 0;

    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }

    if (!emp || !emp.fields) return 0;

    // Check if caregiver worked with this client before
    var clientName = safeGetValue(clientData.fields, 'Client_Full_Name.value', '');
    for (var j = 0; j < actualSchedulingData.length; j++) {
        var rec = actualSchedulingData[j];
        if (!rec || !rec.fields) continue;
        var recClient = safeGetValue(rec.fields, 'Client_Name.value', '');
        var recCg = safeGetValue(rec.fields, 'Actual_Caregiver.value', '');
        if (normName(recClient) === normName(clientName) && normName(recCg) === normName(caregiverName)) {
            score += 15;
            break;
        }
    }

    // Check if caregiver is primary caregiver
    var primaryCg = safeGetValue(clientData.fields, 'Primary_Caregiver.value', '');
    if (normName(primaryCg) === normName(caregiverName)) {
        score += 20;
    }

    // Language matching - FIXED: Use Language_Preferences.value
    var clientLangs = normalizeSkillList(safeGetValue(clientData.fields, 'Language_Preferences.value', ''));
    var cgLangs = normalizeSkillList(safeGetValue(emp.fields, 'Language.value', ''));

    for (var i = 0; i < clientLangs.length; i++) {
        if (cgLangs.indexOf(clientLangs[i]) !== -1) score += 2;
    }
    if (cgLangs.indexOf('english') !== -1) score += 5;

    // Skills matching - FIXED: Use Skills_Preferences.value
    var clientSkills = normalizeSkillList(safeGetValue(clientData.fields, 'Skills_Preferences.value', ''));
    var cgSkills = normalizeSkillList(safeGetValue(emp.fields, 'Skill_Type.value', ''));

    for (var j = 0; j < clientSkills.length; j++) {
        if (cgSkills.indexOf(clientSkills[j]) !== -1) score += 1;
    }

    return score;
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

// ============================================================================
// CALCULATE DETAILED MATCH SCORE WITH BREAKDOWN
// ============================================================================
function calculateDetailedMatchScore(caregiverName, clientData) {
    var breakdown = {
        historical: 0,
        language: 0,
        skills: 0,
        workHours: 0
    };

    if (employeesDetails.length === 0) {
        return { totalScore: 0, breakdown: breakdown };
    }

    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }

    if (!emp || !emp.fields) {
        return { totalScore: 0, breakdown: breakdown };
    }

    // Historical score (client history + primary caregiver)
    var clientName = safeGetValue(clientData.fields, 'Client_Full_Name.value', '');
    for (var j = 0; j < actualSchedulingData.length; j++) {
        var rec = actualSchedulingData[j];
        if (!rec || !rec.fields) continue;
        var recClient = safeGetValue(rec.fields, 'Client_Name.value', '');
        var recCg = safeGetValue(rec.fields, 'Actual_Caregiver.value', '');
        if (normName(recClient) === normName(clientName) && normName(recCg) === normName(caregiverName)) {
            breakdown.historical += 15;
            break;
        }
    }

    var primaryCg = safeGetValue(clientData.fields, 'Primary_Caregiver.value', '');
    if (normName(primaryCg) === normName(caregiverName)) {
        breakdown.historical += 20;
    }

    // Language matching - FIXED: Use Language_Preferences.value
    var clientLangs = normalizeSkillList(safeGetValue(clientData.fields, 'Language_Preferences.value', ''));
    var cgLangs = normalizeSkillList(safeGetValue(emp.fields, 'Language.value', ''));

    for (var i = 0; i < clientLangs.length; i++) {
        if (cgLangs.indexOf(clientLangs[i]) !== -1) breakdown.language += 2;
    }
    if (cgLangs.indexOf('english') !== -1) breakdown.language += 5;

    // Skills matching - FIXED: Use Skills_Preferences.value
    var clientSkills = normalizeSkillList(safeGetValue(clientData.fields, 'Skills_Preferences.value', ''));
    var cgSkills = normalizeSkillList(safeGetValue(emp.fields, 'Skill_Type.value', ''));

    for (var j = 0; j < clientSkills.length; j++) {
        if (cgSkills.indexOf(clientSkills[j]) !== -1) breakdown.skills += 1;
    }

    // Work hours score (placeholder - can be enhanced later)
    breakdown.workHours = 0;

    var totalScore = breakdown.historical + breakdown.language + breakdown.skills + breakdown.workHours;

    return { totalScore: totalScore, breakdown: breakdown };
}

// Alias for consistency with assignCaregiver.js naming
function calculateWeightedScoreForCaregiver(caregiverName, clientData, scheduleDate) {
    var breakdown = {
        historical: 0,
        language: 0,
        skills: 0,
        workHours: 0
    };

    if (!caregiverName || !clientData) {
        return { totalScore: 0, breakdown: breakdown };
    }

    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }

    if (!emp || !emp.fields) {
        return { totalScore: 0, breakdown: breakdown };
    }

    var clientName = safeGetValue(clientData.fields, 'Client_Full_Name.value', '');
    var scoringWeights = getScoringWeights();

    // === HISTORICAL SCORING (matches scheduler.js exactly) ===
    var rawHistorical = 0;
    var lookbackDays = 30;

    var now = currDate;
    if (!now) return { totalScore: 0, breakdown: breakdown };

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

    // === LANGUAGE SCORING (matches scheduler.js) ===
    var clientLangs = normalizeSkillList(safeGetValue(clientData.fields, 'Language_Preferences.value', ''));
    var cgLangs = normalizeSkillList(safeGetValue(emp.fields, 'Language.value', ''));

    var rawLanguage = 0;
    for (var k = 0; k < clientLangs.length; k++) {
        if (cgLangs.indexOf(clientLangs[k]) !== -1) {
            rawLanguage += 1;
        }
    }

    // === SKILLS SCORING (matches scheduler.js) ===
    var clientSkills = normalizeSkillList(safeGetValue(clientData.fields, 'Skills_Preferences.value', ''));
    var cgSkills = normalizeSkillList(safeGetValue(emp.fields, 'Skill_Type.value', ''));

    var rawSkills = 0;
    for (var l = 0; l < clientSkills.length; l++) {
        if (cgSkills.indexOf(clientSkills[l]) !== -1) {
            rawSkills += 1;
        }
    }

    // === WORK HOURS SCORING (matches scheduler.js - uses ALL-TIME client hours) ===
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
        workScore = (workedHours / totalClientHours) * scoringWeights.workHours;
    }

    // === WEIGHTED CALCULATIONS (matches scheduler.js exactly) ===
    var totalClientLangs = clientLangs.length;
    var totalClientSkills = clientSkills.length;

    // Historical: give full scoringWeights.historical if caregiver has at least one qualifying shift in lookback
    var histScore = rawHistorical > 0 ? scoringWeights.historical : 0;
    var langScore = totalClientLangs > 0 ? (rawLanguage / totalClientLangs) * scoringWeights.language : 0;
    var skillScore = totalClientSkills > 0 ? (rawSkills / totalClientSkills) * scoringWeights.skills : 0;

    breakdown.historical = +histScore.toFixed(2);
    breakdown.language = +langScore.toFixed(2);
    breakdown.skills = +skillScore.toFixed(2);
    breakdown.workHours = +workScore.toFixed(2);

    // CRITICAL FIX: Do NOT add targetWeeklyHoursBoost to weighted score
    // The scheduler's weighted score only includes these 4 components
    var totalScore = +(histScore + langScore + skillScore + workScore).toFixed(2);

    return { totalScore: totalScore, breakdown: breakdown };
}


function doesCaregiverMatchClientCriteria(caregiverName, clientData, scheduleDate, startMin, endMin) {
    if (!caregiverName || !clientData) return false;

    // Check blocklist
    if (checkBlocklist(caregiverName, clientData)) {
        return false;
    }

    // Check if caregiver is on leave
    if (isCaregiverOnLeave(caregiverName, scheduleDate, startMin, endMin)) {
        return false;
    }

    // Check physical capability
    if (!checkPhysicalCapability(caregiverName, clientData, employeesDetails)) {
        return false;
    }

    // Check gender preference
    if (!checkGenderPreference(caregiverName, clientData)) {
        return false;
    }

    // Check client type compatibility
    if (!checkClientTypeCompatibility(caregiverName, clientData)) {
        return false;
    }

    return true;
}

// ============================================================================
// DETAILED CAREGIVER MATCHING WITH REASONS
// ============================================================================

function getCaregiverMatchDetails(caregiverName, clientData, scheduleDate, startMin, endMin, freedTimeSlots, excludeScheduleIds) {

    var matchDetails = {
        caregiverName: caregiverName,
        matches: false,
        reasons: [],
        failureReasons: [],
        criteriaChecks: {}
    };

    if (!caregiverName || !clientData) {
        matchDetails.failureReasons.push("Missing caregiver name or client data");
        return matchDetails;
    }

    // Check 1: Blocklist
    var isBlocklisted = checkBlocklist(caregiverName, clientData);
    matchDetails.criteriaChecks.blocklist = {
        passed: !isBlocklisted,
        description: isBlocklisted ? "Caregiver is on client's blocklist" : "Not on blocklist"
    };
    if (isBlocklisted) {
        matchDetails.failureReasons.push("Caregiver is blocklisted by client");
        return matchDetails;
    } else {
        matchDetails.reasons.push("✓ Not on blocklist");
    }

    // Check 2: Caregiver Leave
    var isOnLeave = isCaregiverOnLeave(caregiverName, scheduleDate, startMin, endMin);
    matchDetails.criteriaChecks.availability = {
        passed: !isOnLeave,
        description: isOnLeave ? "Caregiver is on leave during this time" : "Available (not on leave)"
    };
    if (isOnLeave) {
        matchDetails.failureReasons.push("Caregiver is on leave during schedule time");
        return matchDetails;
    } else {
        matchDetails.reasons.push("✓ Available (not on leave)");
    }

    // Check 2.5: Already Assigned to Another Schedule (NEW: with excluded schedule IDs)
    // Get current client name to exclude from conflict checks
    var currentClientName = safeGetValue(clientData, 'fields.Client_Full_Name.value', '');
    var assignmentCheck = isCaregiverAlreadyAssigned(
        caregiverName,
        scheduleDate,
        startMin,
        endMin,
        currentClientName,
        freedTimeSlots,
        excludeScheduleIds  // NEW: Pass excluded schedule IDs
    );

    matchDetails.criteriaChecks.scheduleConflict = {
        passed: !assignmentCheck.isAssigned,
        description: assignmentCheck.isAssigned ? assignmentCheck.conflictDetails.description : "No schedule conflicts",
        conflictDetails: assignmentCheck.conflictDetails
    };
    if (assignmentCheck.isAssigned) {
        matchDetails.failureReasons.push("❌ " + assignmentCheck.conflictDetails.description);
        return matchDetails;
    } else {
        matchDetails.reasons.push("✓ No schedule conflicts");
    }

    // Check 2.6: Enhanced availability check (AM/PM/NOC or Custom Time)
    var dayName = getDayNameFromDate(scheduleDate);
    var isAvailableForTimeSlot = checkCaregiverAvailabilityByType(
        caregiverName,
        dayName,
        startMin,
        endMin,
        employeesDetails,
        caregiverAvailability
    );

    matchDetails.criteriaChecks.timeSlotAvailability = {
        passed: isAvailableForTimeSlot,
        description: isAvailableForTimeSlot ?
            "Available for time slot (passed AM/PM/NOC or Custom Time check)" :
            "Not available for time slot (failed AM/PM/NOC or Custom Time check)"
    };

    if (!isAvailableForTimeSlot) {
        matchDetails.failureReasons.push("❌ Not available for time slot: " + dayName + " " +
            formatTimeFromMinutes(startMin) + "-" + formatTimeFromMinutes(endMin));
        return matchDetails;
    } else {
        matchDetails.reasons.push("✓ Available for time slot (" + dayName + " " +
            formatTimeFromMinutes(startMin) + "-" + formatTimeFromMinutes(endMin) + ")");
    }


    // NEW: Check 2.6: Check for duplicate caregiver assignment to same client (multi-caregiver schedules)
    var isDuplicateAssignment = isCaregiverAlreadyAssignedToThisClient(
        caregiverName,
        currentClientName,
        scheduleDate,
        startMin !== null ? formatTimeFromMinutes(startMin) : '',
        endMin !== null ? formatTimeFromMinutes(endMin) : ''
    );

    matchDetails.criteriaChecks.duplicateAssignment = {
        passed: !isDuplicateAssignment,
        description: isDuplicateAssignment ? "Caregiver already assigned to this client at this time (multi-caregiver schedule)" : "Not a duplicate assignment"
    };

    if (isDuplicateAssignment) {
        matchDetails.failureReasons.push("❌ Caregiver already assigned to this client at this time (preventing duplicate in multi-caregiver schedule)");
        return matchDetails;
    } else {
        matchDetails.reasons.push("✓ Not a duplicate assignment for this client");
    }



    // Check 3: Physical Capability
    var physicalCapabilityResult = checkPhysicalCapability(caregiverName, clientData, employeesDetails, true);
    matchDetails.criteriaChecks.physicalCapability = physicalCapabilityResult;
    if (!physicalCapabilityResult.passes) {
        matchDetails.failureReasons.push("❌ Physical capability: " + physicalCapabilityResult.reason);
        return matchDetails;
    } else {
        matchDetails.reasons.push("✓ Physical capability: " + physicalCapabilityResult.reason);
    }

    // Check 3.5: Weekly Hours Limit (existing code remains the same)
    var candidateHours = (endMin - startMin) / 60;
    var week = getWeekStartEnd(scheduleDate);

    var cancelledScheduleIds = excludeScheduleIds || [];
    var workedHoursForWeek = 0;
    var schedulesInWeek = (returnAllScheduledCompletedassignedSchedules || []);
    for (var i = 0; i < schedulesInWeek.length; i++) {
        var s = schedulesInWeek[i];
        if (!s || !s.fields) continue;

        var cgId = safeGetValue(s.fields, 'Select_Expected_Caregiver.value', '');
        var cgName = cgId ? resolveCaregiverName(cgId) : safeGetValue(s.fields, 'Expected_Caregiver.value', '');
        if (normName(cgName) !== normName(caregiverName)) continue;

        var sDate = safeGetValue(s.fields, 'Schedule_Start_Date.value', '');
        if (!sDate || sDate < week.start || sDate > week.end) continue;

        if (cancelledScheduleIds.indexOf(s.id) > -1) continue;

        var status = safeGetValue(s.fields, 'Scheduling_Status.value', '');
        if (status.toLowerCase().indexOf('cancel') !== -1) continue;

        // ENHANCED: Exclude ghost shifts from weekly hours calculation
        var shiftStatus = normStr(safeGetValue(s.fields, 'Shift_Status.value', '')).toLowerCase();
        var schedulingStatus = normStr(status).toLowerCase();

        if (shiftStatus.indexOf('ghost shift') !== -1 || schedulingStatus.indexOf('ghost shift') !== -1) {
            continue; // Skip ghost shifts from hours calculation
        }

        // Also check legacy ghost shift fields
        var isGhost = safeGetValue(s.fields, 'Is_Ghost_Shift.value', false) ||
            safeGetValue(s.fields, 'Shift_Type.value', '') === 'Ghost';
        if (isGhost) continue;

        workedHoursForWeek += deriveRestoredHours(s, null, null);
    }

    var emp = null;
    for (var j = 0; j < employeesDetails.length; j++) {
        var e = employeesDetails[j];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }
    var maxWeeklyHours = emp && emp.fields ? safeParseNumber(safeGetValue(emp.fields, 'Max_Weekly_Hours.value', 0), 0) : 0;
    var projectedHours = workedHoursForWeek + candidateHours;

    if (maxWeeklyHours > 0 && projectedHours > maxWeeklyHours) {
        matchDetails.criteriaChecks.weeklyHours = {
            passed: false,
            description: "Would exceed max weekly hours",
            details: { max: maxWeeklyHours, currentInWeek: workedHoursForWeek, candidate: candidateHours, projected: projectedHours }
        };
        matchDetails.failureReasons.push("❌ Weekly hours: Would exceed max (" + maxWeeklyHours + "h). Effective hours in that week are " + workedHoursForWeek.toFixed(2) + "h. Adding " + candidateHours.toFixed(2) + "h would total " + projectedHours.toFixed(2) + "h.");
        return matchDetails;
    } else {
        matchDetails.criteriaChecks.weeklyHours = {
            passed: true,
            description: "Within weekly hours limit",
            details: { max: maxWeeklyHours, currentInWeek: workedHoursForWeek, candidate: candidateHours, projected: projectedHours }
        };
        matchDetails.reasons.push("✓ Weekly hours: OK (Max: " + maxWeeklyHours + "h, Current in week: " + workedHoursForWeek.toFixed(2) + "h, Projected: " + projectedHours.toFixed(2) + "h)");
    }

    // Check 4: Gender Preference
    var genderResult = checkGenderPreferenceDetailed(caregiverName, clientData);
    matchDetails.criteriaChecks.genderPreference = genderResult;
    if (!genderResult.passed) {
        matchDetails.failureReasons.push(genderResult.description);
        return matchDetails;
    } else {
        matchDetails.reasons.push("✓ " + genderResult.description);
    }

    // Check 5: Client Type Compatibility
    var clientTypeResult = checkClientTypeCompatibilityDetailed(caregiverName, clientData);
    matchDetails.criteriaChecks.clientTypeCompatibility = clientTypeResult;
    if (!clientTypeResult.passed) {
        matchDetails.failureReasons.push(clientTypeResult.description);
        return matchDetails;
    } else {
        matchDetails.reasons.push("✓ " + clientTypeResult.description);
    }

    // All checks passed - Calculate weighted score
    matchDetails.matches = true;

    // Calculate weighted score for this caregiver
    var weightedScore = calculateWeightedScore(caregiverName, clientData, scheduleDate);
    matchDetails.weightedScore = weightedScore.total;
    matchDetails.weightedBreakdown = weightedScore.breakdown;
    matchDetails.scoreDetails = weightedScore.details;

    // Add score information to reasons
    if (weightedScore.total > 0) {
        matchDetails.reasons.push("📊 Weighted Score: " + weightedScore.total + " points");
        if (weightedScore.breakdown.historical > 0) {
            matchDetails.reasons.push("  • " + weightedScore.details.historical);
        }
        if (weightedScore.breakdown.language > 0) {
            matchDetails.reasons.push("  • " + weightedScore.details.language);
        }
        if (weightedScore.breakdown.skills > 0) {
            matchDetails.reasons.push("  • " + weightedScore.details.skills);
        }
    }

    return matchDetails;
}

// Detailed check functions that return reasons
function checkPhysicalCapability(caregiverName, clientData, employeesDetails, isMandatory) {
    var clientFields = clientData.fields || {};
    var clientWeightClass = normStr(safeGetValue(clientFields, 'Weight_Class.value', '')).toLowerCase();
    var clientLbs = safeParseNumber(safeGetValue(clientFields, 'Physical_Capability_lbs.value', 0), 0);

    if (!clientWeightClass && !clientLbs) {
        return { passes: true, reason: 'no_weight_class_requirement', scoreBoost: 0 };
    }

    if (!employeesDetails || employeesDetails.length === 0) {
        return { passes: false, reason: 'no_employee_details_available', scoreBoost: 0 };
    }

    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }
    if (!emp || !emp.fields) {
        return { passes: false, reason: 'employee_not_found', scoreBoost: 0 };
    }

    var caregiverWeightClass = normStr(safeGetValue(emp.fields, 'Weight_Class.value', '')).toLowerCase();
    var caregiverLbs = safeParseNumber(safeGetValue(emp.fields, 'Physical_Capability_lbs.value', 0), 0);

    var weightClassMatch = false;
    if (clientWeightClass === "standard") {
        weightClassMatch = (caregiverWeightClass === "standard" || caregiverWeightClass === "heavy");
    } else if (clientWeightClass === "heavy") {
        weightClassMatch = (caregiverWeightClass === "heavy");
    }

    // NEW: Check lbs requirement
    var lbsMatch = true;
    if (clientLbs > 0) {
        lbsMatch = caregiverLbs >= clientLbs;
    }

    var passes = isMandatory ? (weightClassMatch && lbsMatch) : true;

    // Debug log
    if (!weightClassMatch || !lbsMatch) {
        if (!result.debug) { result.debug = {}; }
        if (!result.debug.physicalCapabilityRejects) { result.debug.physicalCapabilityRejects = []; }
        result.debug.physicalCapabilityRejects.push({
            caregiverName: caregiverName,
            caregiverWeightClass: caregiverWeightClass,
            caregiverLbs: caregiverLbs,
            clientWeightClass: clientWeightClass,
            clientLbs: clientLbs,
            isMandatory: isMandatory,
            weightClassMatch: weightClassMatch,
            lbsMatch: lbsMatch
        });
    }

    return {
        passes: passes,
        reason: (weightClassMatch && lbsMatch) ? 'weight_class_and_lbs_match'
            : (!weightClassMatch ? 'weight_class_mismatch' : 'lbs_mismatch'),
        scoreBoost: (weightClassMatch && lbsMatch) ? 3 : 0
    };
}

function checkGenderPreferenceDetailed(caregiverName, clientData) {
    var result = { passed: false, description: "" };

    if (employeesDetails.length === 0) {
        result.passed = true;
        result.description = "Gender preference check skipped (no employee data)";
        return result;
    }

    var genderPref = safeGetValue(clientData.fields, 'Gender_Preference.value', '');
    var isStrict = normStr(safeGetValue(clientData.fields, 'Gender_Preference_Strict.value', '')).toLowerCase() === 'yes';

    if (!genderPref || !isStrict) {
        result.passed = true;
        result.description = "Gender preference check passed (no strict preference)";
        return result;
    }

    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }

    if (!emp || !emp.fields) {
        result.description = "Caregiver not found in employee details";
        return result;
    }

    var caregiverGender = safeGetValue(emp.fields, 'Gender.value', '');
    if (normStr(genderPref).toLowerCase() === normStr(caregiverGender).toLowerCase()) {
        result.passed = true;
        result.description = "Gender preference matches (Client prefers: " + genderPref + ", Caregiver: " + caregiverGender + ")";
    } else {
        result.description = "Gender preference mismatch (Client prefers: " + genderPref + ", Caregiver: " + caregiverGender + ")";
    }

    return result;
}

function checkClientTypeCompatibilityDetailed(caregiverName, clientData) {
    var result = { passed: false, description: "" };

    if (employeesDetails.length === 0) {
        result.passed = true;
        result.description = "Client type compatibility check skipped (no employee data)";
        return result;
    }

    var clientType = safeGetValue(clientData.fields, 'Client_Type.value', '');
    var clientTypeNorm = normStr(clientType).toLowerCase();

    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === normName(caregiverName)) {
            emp = e;
            break;
        }
    }

    if (!emp || !emp.fields) {
        result.description = "Caregiver not found in employee details";
        return result;
    }

    var facilityEligible = normStr(safeGetValue(emp.fields, 'Facility.value', '')).toLowerCase() === 'yes';
    var privateEligible = normStr(safeGetValue(emp.fields, 'Private.value', '')).toLowerCase() === 'yes';

    if (clientTypeNorm === 'facility') {
        if (facilityEligible) {
            result.passed = true;
            result.description = "Client type compatible (Facility client, caregiver is facility-eligible)";
        } else {
            result.description = "Client type incompatible (Facility client, caregiver not facility-eligible)";
        }
    } else if (clientTypeNorm === 'private') {
        if (privateEligible) {
            result.passed = true;
            result.description = "Client type compatible (Private client, caregiver is private-eligible)";
        } else {
            result.description = "Client type incompatible (Private client, caregiver not private-eligible)";
        }
    } else {
        if (facilityEligible || privateEligible) {
            result.passed = true;
            result.description = "Client type compatible (Caregiver eligible for: " + (facilityEligible ? "Facility" : "") + (facilityEligible && privateEligible ? ", " : "") + (privateEligible ? "Private" : "") + ")";
        } else {
            result.description = "Client type incompatible (Caregiver not eligible for any client type)";
        }
    }

    return result;
}

// ============================================================================
// FIND CLIENT DATA
// ============================================================================

function findClientData(clientName) {
    for (var i = 0; i < allClientsScheduleData.length; i++) {
        var client = allClientsScheduleData[i];
        if (!client || !client.fields) continue;
        var cName = safeGetValue(client.fields, 'Client_Full_Name.value', '');
        if (normName(cName) === normName(clientName)) {
            return client;
        }
    }
    return null;
}

// ============================================================================
// CHECK IF CAREGIVER IS ALREADY ASSIGNED TO THIS CLIENT ON SAME DATE/TIME
// ============================================================================
/**
 * Checks if a caregiver is already assigned to the same client on the same date and time
 * This prevents duplicate caregiver assignments in multi-caregiver schedules
 */
function isCaregiverAlreadyAssignedToThisClient(caregiverName, clientName, scheduleDate, scheduleStartTime, scheduleEndTime) {
    if (!caregiverName || !clientName || !scheduleDate) {
        return false;
    }

    var cgNorm = normName(caregiverName);
    var clientNorm = normName(clientName);

    // Parse the schedule time range
    var schedStartMin = parseTime(scheduleStartTime);
    var schedEndMin = parseTime(scheduleEndTime);

    if (schedStartMin === null || schedEndMin === null) {
        return false;
    }

    // Check in all assigned schedules
    var allSchedules = (returnAllScheduledCompletedassignedSchedules || []).concat(returnAllGhostShiftassignedSchedules || []);

    for (var i = 0; i < allSchedules.length; i++) {
        var schedule = allSchedules[i];
        if (!schedule || !schedule.fields) continue;

        var f = schedule.fields;

        // Check if it's the same client
        var schedClientName = safeGetValue(f, 'Client_Name.value', '');
        if (normName(schedClientName) !== clientNorm) continue;

        // Check if it's the same date
        var schedDate = safeGetValue(f, 'Schedule_Start_Date.value', '');
        if (schedDate !== scheduleDate) continue;

        // Get assigned caregiver
        var assignedCgId = safeGetValue(f, 'Select_Expected_Caregiver.value', '');
        var assignedCgName = '';
        if (assignedCgId) {
            assignedCgName = resolveCaregiverName(assignedCgId);
        }
        if (!assignedCgName) {
            assignedCgName = safeGetValue(f, 'Expected_Caregiver.value', '');
        }

        // Skip if no caregiver assigned
        if (!assignedCgName || !normStr(assignedCgName)) continue;

        // Check if it's the same caregiver
        if (normName(assignedCgName) !== cgNorm) continue;

        // Check if schedule times overlap
        var existingStartTime = safeGetValue(f, 'Schedule_Start_Time.value', '');
        var existingEndTime = safeGetValue(f, 'Schedule_End_Time.value', '');
        var existingStartMin = parseTime(existingStartTime);
        var existingEndMin = parseTime(existingEndTime);

        if (existingStartMin !== null && existingEndMin !== null) {
            // Check for time overlap
            if (timeOverlap(schedStartMin, schedEndMin, existingStartMin, existingEndMin)) {
                return true; // Caregiver is already assigned to this client at overlapping time
            }
        }
    }

    return false; // Caregiver is not already assigned to this client
}

// === MULTI CAREGIVER HELPERS (INSERT BEFORE // MAIN PROCESSING LOGIC) ===
function getCaregiversRequired(schedule) {
    if (!schedule || !schedule.fields) return 1;
    var val = safeParseNumber(safeGetValue(schedule.fields, 'Caregivers_Required.value', 1), 1);
    return Math.max(1, val || 1);
}
function getAllAssignedCaregivers(schedule) {
    if (!schedule || !schedule.fields) return [];
    var out = [];
    var f = schedule.fields;

    // Primary
    var primaryId = safeGetValue(f, 'Select_Expected_Caregiver.value', '');
    var primaryName = primaryId ? resolveCaregiverName(primaryId) : safeGetValue(f, 'Expected_Caregiver.value', '');
    if (primaryName && normStr(primaryName).toLowerCase() !== 'unassigned') {
        out.push({
            name: primaryName,
            caregiverId: primaryId || resolveCaregiverId(primaryName),
            caregiverEmployeeId: resolveCaregiverEmployeeId(primaryName),
            slot: 1
        });
    }
    // Secondary (if system supports it)
    var secondaryId = safeGetValue(f, 'Select_Secondary_Caregiver.value', '');
    var secondaryName = secondaryId ? resolveCaregiverName(secondaryId) : safeGetValue(f, 'Secondary_Caregiver.value', '');
    if (secondaryName && normStr(secondaryName).toLowerCase() !== 'unassigned') {
        out.push({
            name: secondaryName,
            caregiverId: secondaryId || resolveCaregiverId(secondaryName),
            caregiverEmployeeId: resolveCaregiverEmployeeId(secondaryName),
            slot: 2
        });
    }
    return out;
}
function isCaregiverAssignedToSchedule(caregiverName, scheduleId) {
    if (!caregiverName || !scheduleId) return false;
    var cgNorm = normName(caregiverName);
    var all = (returnAllScheduledCompletedassignedSchedules || []).concat(returnAllGhostShiftassignedSchedules || []);
    for (var i = 0; i < all.length; i++) {
        var s = all[i];
        if (!s || s.id !== scheduleId) continue;
        var assigned = getAllAssignedCaregivers(s);
        for (var j = 0; j < assigned.length; j++) {
            if (normName(assigned[j].name) === cgNorm) return true;
        }
        break;
    }
    return false;
}


// ============================================================================
// MAIN PROCESSING LOGIC
// ============================================================================

// Parse leave times
var leaveStartMin = parseTime(leaveStartTime);
var leaveEndMin = parseTime(leaveEndTime);
var hasLeaveTime = (leaveStartMin !== null && leaveEndMin !== null);

result.remarks.push("Processing client leave for: " + leaveClientId);
result.remarks.push("Leave period: " + leaveStartDate + " to " + leaveEndDate);
result.remarks.push("Leave status: " + leaveStatus);

// ============================================================================
// DETERMINE SCENARIO BASED ON Cancel_Request AND Leave_Status
// ============================================================================
// If Cancel_Request is "Yes", treat as leave cancellation (restore schedules)
// Otherwise, check Leave_Status to determine action

var isLeaveCancellation = (cancelRequest === "Yes") || (leaveStatus === "Cancelled") || (leaveStatus === "Rejected");

// ============================================================================
// SCENARIO 1: LEAVE IS APPROVED (Cancel schedules and reassign caregivers)
// ============================================================================

if (!isLeaveCancellation && leaveStatus === "Approved") {
    result.remarks.push("SCENARIO: Leave approved - cancelling schedules");

    var freedCaregivers = [];
    var freedCaregiversDetails = {}; // Track caregiver details for reassignment

    // NEW: Track cancelled schedule IDs to exclude from conflict checks
    var cancelledScheduleIds = [];


    // ============================================================================
    // INITIALIZE DYNAMIC WEEKLY HOURS TRACKING
    // ============================================================================
    // This creates a baseline of current weekly hours for all caregivers
    // that will be dynamically adjusted as we cancel and reassign schedules
    var dynamicWeeklyHours = precomputeWeeklyHours();
    result.remarks.push("Initialized dynamic weekly hours tracking for " + Object.keys(dynamicWeeklyHours).length + " caregivers");

    // Store in debug for visibility
    result.debug.dynamicWeeklyHours = dynamicWeeklyHours;

    // ============================================================================
    // STEP 1: CANCEL SCHEDULES IN LEAVE DATE RANGE
    // ============================================================================

    for (var i = 0; i < getassignedClientsSchedules.length; i++) {
        var schedule = getassignedClientsSchedules[i];
        if (!schedule || !schedule.fields) continue;

        var scheduleClientName = safeGetValue(schedule.fields, 'Client_Name.value', '');
        var scheduleDate = safeGetValue(schedule.fields, 'Schedule_Start_Date.value', '');
        var scheduleStartTime = safeGetValue(schedule.fields, 'Schedule_Start_Time.value', '');
        var scheduleEndTime = safeGetValue(schedule.fields, 'Schedule_End_Time.value', '');
        var scheduleStatus = safeGetValue(schedule.fields, 'Scheduling_Status.value', '');

        // Get User_Id from schedule fields (extract early like carvgierreffcode.js)
        var scheduleUserId = safeGetValue(schedule.fields, 'User_Id.value', 0);

        // Get assigned caregiver - try lookup ID first, then fall back to Actual_Caregiver
        var caregiverId = safeGetValue(schedule.fields, 'Select_Expected_Caregiver.value', '');
        var assignedCaregiver = caregiverId ? resolveCaregiverName(caregiverId) : safeGetValue(schedule.fields, 'Actual_Caregiver.value', '');

        // Check if this schedule belongs to the client on leave
        if (normName(scheduleClientName) !== normName(leaveClientId)) continue;

        // Check if schedule date is within leave date range
        if (scheduleDate < leaveStartDate || scheduleDate > leaveEndDate) continue;

        // Check time overlap if leave has specific times
        var hasTimeOverlap = true;
        if (hasLeaveTime && scheduleStartTime && scheduleEndTime) {
            var schedStartMin = parseTime(scheduleStartTime);
            var schedEndMin = parseTime(scheduleEndTime);
            if (schedStartMin !== null && schedEndMin !== null) {
                hasTimeOverlap = timeOverlap(schedStartMin, schedEndMin, leaveStartMin, leaveEndMin);
            }
        }

        if (!hasTimeOverlap) continue;

        result.summary.totalAffectedSchedules++;

        // Only cancel if not already cancelled
        if (scheduleStatus !== "Cancelled By Client") {
            result.summary.cancelledSchedules++;

            // REPLACE single cancelledScheduleInfo block with below multi-slot aware block
            var caregiversRequired = getCaregiversRequired(schedule);
            var assignedList = getAllAssignedCaregivers(schedule);
            // If no multi caregiver fields populated, fall back to original single assignment logic
            if (assignedList.length === 0 && assignedCaregiver && normStr(assignedCaregiver)) {
                var cancelledScheduleInfo = {
                    scheduleId: schedule.id,
                    userId: scheduleUserId,
                    clientName: scheduleClientName,
                    scheduleDate: scheduleDate,
                    scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                    previousStatus: scheduleStatus,
                    newStatus: "Cancelled By Client",
                    updateNewvalueSelectedValueEmpty: "",
                    updateNewvalueCargeiverID: 0,
                    shiftStatus: "Cancelled",
                    assignedCaregiver: assignedCaregiver || "",
                    assignedCaregiverId: assignedCaregiver ? (caregiverId || resolveCaregiverId(assignedCaregiver)) : "",
                    caregiverIdEmployee: assignedCaregiver ? resolveCaregiverEmployeeId(assignedCaregiver) : 0,
                    caregiversRequired: caregiversRequired,
                    caregiverSlotNumber: 1,
                    totalSlotsInSchedule: 1,
                    scheduleType: caregiversRequired > 1 ? "Multi Caregiver Schedule" : "Single Caregiver Schedule"
                };
                result.cancelledSchedules.push(cancelledScheduleInfo);
                cancelledScheduleIds.push(schedule.id);
                result.scheduleUpdates.push(cancelledScheduleInfo);
                // freed caregiver tracking (primary only)
                if (assignedCaregiver && freedCaregivers.indexOf(assignedCaregiver) === -1) {
                    freedCaregivers.push(assignedCaregiver);
                    freedCaregiversDetails[assignedCaregiver] = {
                        name: assignedCaregiver,
                        caregiverId: cancelledScheduleInfo.assignedCaregiverId,
                        caregiverIdEmployee: cancelledScheduleInfo.caregiverIdEmployee,
                        freedFromSchedules: [],
                        reassignedTo: null,
                        addedToAvailabilityList: false
                    };
                    result.summary.freedCaregivers++;
                }
                if (assignedCaregiver) {
                    freedCaregiversDetails[assignedCaregiver].freedFromSchedules.push({
                        scheduleId: schedule.id,
                        date: scheduleDate,
                        time: scheduleStartTime + " - " + scheduleEndTime,
                        slot: 1,
                        caregiversRequired: caregiversRequired
                    });
                }
            } else if (assignedList.length > 0) {
                // Multi caregiver cancellation entries (one per slot)
                for (var ac = 0; ac < assignedList.length; ac++) {
                    var cgSlot = assignedList[ac];
                    var cancelledSlotInfo = {
                        scheduleId: schedule.id,
                        userId: scheduleUserId,
                        clientName: scheduleClientName,
                        scheduleDate: scheduleDate,
                        scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                        previousStatus: scheduleStatus,
                        newStatus: "Cancelled By Client",
                        updateNewvalueSelectedValueEmpty: "",
                        updateNewvalueCargeiverID: 0,
                        shiftStatus: "Cancelled",
                        assignedCaregiver: cgSlot.name,
                        assignedCaregiverId: cgSlot.caregiverId,
                        caregiverIdEmployee: cgSlot.caregiverEmployeeId,
                        caregiversRequired: caregiversRequired,
                        caregiverSlotNumber: cgSlot.slot,
                        totalSlotsInSchedule: assignedList.length,
                        scheduleType: caregiversRequired > 1 ? "Multi Caregiver Schedule" : "Single Caregiver Schedule"
                    };
                    result.cancelledSchedules.push(cancelledSlotInfo);
                    cancelledScheduleIds.push(schedule.id);
                    result.scheduleUpdates.push(cancelledSlotInfo);

                    if (freedCaregivers.indexOf(cgSlot.name) === -1) {
                        freedCaregivers.push(cgSlot.name);
                        freedCaregiversDetails[cgSlot.name] = {
                            name: cgSlot.name,
                            caregiverId: cgSlot.caregiverId,
                            caregiverIdEmployee: cgSlot.caregiverEmployeeId,
                            freedFromSchedules: [],
                            reassignedTo: null,
                            addedToAvailabilityList: false
                        };
                        result.summary.freedCaregivers++;
                    }
                    freedCaregiversDetails[cgSlot.name].freedFromSchedules.push({
                        scheduleId: schedule.id,
                        date: scheduleDate,
                        time: scheduleStartTime + " - " + scheduleEndTime,
                        slot: cgSlot.slot,
                        caregiversRequired: caregiversRequired
                    });
                }
            } else {
                var cancelledScheduleInfo = {
                    scheduleId: schedule.id,
                    userId: scheduleUserId,
                    clientName: scheduleClientName,
                    scheduleDate: scheduleDate,
                    scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                    previousStatus: scheduleStatus,
                    newStatus: "Cancelled By Client",
                    updateNewvalueSelectedValueEmpty: "",
                    updateNewvalueCargeiverID: 0,
                    shiftStatus: "Cancelled",
                    assignedCaregiver: "",
                    assignedCaregiverId: "",
                    caregiverIdEmployee: 0,
                    caregiversRequired: caregiversRequired,
                    caregiverSlotNumber: 0,
                    totalSlotsInSchedule: 0,
                    scheduleType: caregiversRequired > 1 ? "Multi Caregiver Schedule (Unassigned)" : "Single Caregiver Schedule (Unassigned)"
                };
                result.cancelledSchedules.push(cancelledScheduleInfo);
                cancelledScheduleIds.push(schedule.id);
                result.scheduleUpdates.push(cancelledScheduleInfo);

                result.remarks.push("Cancelled unassigned schedule: " + scheduleClientName + " (" + scheduleDate + " " + scheduleStartTime + " - " + scheduleEndTime + ")");
            }

            // ============================================================================
            // NEW: ENHANCED CAREGIVER CHANGE TRACKING
            // ============================================================================
            // Track detailed caregiver change information for audit trail and reporting
            if (assignedCaregiver && normStr(assignedCaregiver)) {
                var changeTrackingEntry = {
                    changeType: "REMOVED_DUE_TO_LEAVE",
                    timestamp: new Date().toISOString(),

                    // Original assignment details
                    originalAssignment: {
                        scheduleId: schedule.id,
                        userId: scheduleUserId,
                        clientName: scheduleClientName,
                        scheduleDate: scheduleDate,
                        scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                        caregiverName: assignedCaregiver,
                        caregiverId: caregiverId || resolveCaregiverId(assignedCaregiver),
                        caregiverIdEmployee: resolveCaregiverEmployeeId(assignedCaregiver),
                        previousStatus: scheduleStatus
                    },

                    // Removal details
                    removalDetails: {
                        reason: "Client applied leave",
                        leaveRecordId: recordId,
                        leaveStartDate: leaveStartDate,
                        leaveEndDate: leaveEndDate,
                        leaveStartTime: leaveStartTime || "Full Day",
                        leaveEndTime: leaveEndTime || "Full Day",
                        newScheduleStatus: "Cancelled By Client",
                        shiftStatus: "Cancelled"
                    },

                    // Reassignment details (will be updated later if caregiver is reassigned)
                    reassignment: {
                        wasReassigned: false,
                        newScheduleId: null,
                        newClientName: null,
                        newScheduleDate: null,
                        newScheduleTime: null,
                        matchScore: 0,
                        matchCriteria: {},
                        reassignmentTimestamp: null
                    },

                    // Availability details (will be updated later if added to availability list)
                    availabilityStatus: {
                        addedToAvailabilityList: false,
                        otherSchedulesInTimeRange: [],
                        totalAvailableHours: 0,
                        availableForReassignment: true
                    },

                    // Human-readable remarks for schedule notes
                    remarks: "Caregiver " + assignedCaregiver + " removed due to client leave (" +
                        leaveStartDate + " to " + leaveEndDate + ")"
                };

                // Add to tracking history
                result.caregiverChangeHistory.push(changeTrackingEntry);
            }
            // ============================================================================

            // If a caregiver was assigned, add to freed caregivers list
            if (assignedCaregiver && normStr(assignedCaregiver)) {
                if (freedCaregivers.indexOf(assignedCaregiver) === -1) {
                    freedCaregivers.push(assignedCaregiver);
                    var cgId = caregiverId || resolveCaregiverId(assignedCaregiver);
                    var cgEmpId = resolveCaregiverEmployeeId(assignedCaregiver);
                    freedCaregiversDetails[assignedCaregiver] = {
                        name: assignedCaregiver,
                        caregiverId: cgId,
                        caregiverIdEmployee: cgEmpId,
                        freedFromSchedules: [],
                        reassignedTo: null,
                        addedToAvailabilityList: false
                    };
                    result.summary.freedCaregivers++;
                }
                freedCaregiversDetails[assignedCaregiver].freedFromSchedules.push({
                    scheduleId: schedule.id,
                    date: scheduleDate,
                    time: scheduleStartTime + " - " + scheduleEndTime
                });

                // ============================================================================
                // UPDATE DYNAMIC WEEKLY HOURS: Subtract freed hours
                // ============================================================================
                if (dynamicWeeklyHours[assignedCaregiver]) {
                    var schedStartMin = parseTime(scheduleStartTime);
                    var schedEndMin = parseTime(scheduleEndTime);
                    if (schedStartMin !== null && schedEndMin !== null) {
                        var freedHours = (schedEndMin - schedStartMin) / 60;
                        dynamicWeeklyHours[assignedCaregiver].freedHours += freedHours;
                        dynamicWeeklyHours[assignedCaregiver].history.push({
                            action: 'FREED',
                            scheduleId: schedule.id,
                            scheduleDate: scheduleDate,
                            scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                            hours: freedHours,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
        }
    }

    result.remarks.push("Cancelled " + result.summary.cancelledSchedules + " schedules");
    result.remarks.push("Freed " + result.summary.freedCaregivers + " caregivers");

    // ============================================================================
    // STEP 2: REASSIGN FREED CAREGIVERS TO OTHER UNASSIGNED SCHEDULES
    // ============================================================================

    if (freedCaregivers.length > 0) {
        result.remarks.push("Attempting to reassign freed caregivers...");

        for (var c = 0; c < freedCaregivers.length; c++) {
            var caregiverName = freedCaregivers[c];
            var caregiverAssigned = false;

            // ============================================================================
            // NEW: Track all schedules checked for this caregiver
            // ============================================================================
            var schedulesChecked = [];
            var schedulesSkipped = [];
            var schedulesFailedMatch = [];

            // Check if caregiver details exist
            if (!freedCaregiversDetails[caregiverName]) {
                result.remarks.push("WARNING: No details found for freed caregiver " + caregiverName + " - skipping reassignment");
                continue;
            }

            // INIT per-schedule caregiver tracker (multi-caregiver safe)
            if (!result._scheduleAssignmentTracking) {
                result._scheduleAssignmentTracking = {};
                var aggSchedules = []
                    .concat(returnAllScheduledCompletedassignedSchedules || [])
                    .concat(returnAllGhostShiftassignedSchedules || [])
                    .concat(returnAllUnassignedSchedules || []);
                for (var si = 0; si < aggSchedules.length; si++) {
                    var sch = aggSchedules[si];
                    if (!sch || !sch.id) continue;
                    if (!result._scheduleAssignmentTracking[sch.id]) {
                        result._scheduleAssignmentTracking[sch.id] = [];
                    }
                    var existingAssigned = getAllAssignedCaregivers(sch);
                    for (var ea = 0; ea < existingAssigned.length; ea++) {
                        result._scheduleAssignmentTracking[sch.id].push(normName(existingAssigned[ea].name));
                    }
                }
            }
            // BLOCK REASSIGNMENT IF CAREGIVER HAS ANY OTHER ACTIVE SCHEDULES (CLIENT OR GHOST)
            var hasOtherActive = (function () {
                var cgNorm = normName(caregiverName);
                var activeFound = false;
                function scan(arr) {
                    for (var i = 0; i < arr.length; i++) {
                        var s = arr[i];
                        if (!s || !s.fields) continue;
                        var status = safeGetValue(s.fields, 'Scheduling_Status.value', '');
                        if (status.toLowerCase().indexOf('cancel') !== -1) continue;
                        var cgId = safeGetValue(s.fields, 'Select_Expected_Caregiver.value', '');
                        var cgName = cgId ? resolveCaregiverName(cgId) : safeGetValue(s.fields, 'Expected_Caregiver.value', '');
                        if (normName(cgName) === cgNorm) {
                            activeFound = true;
                            break;
                        }
                    }
                }
                scan(returnAllScheduledCompletedassignedSchedules || []);
                if (!activeFound) scan(returnAllGhostShiftassignedSchedules || []);
                return activeFound;
            })();

            if (hasOtherActive) {
                // Add directly to availability (do not attempt reassignment)
                var cgIdSkip = resolveCaregiverId(caregiverName);
                var cgEmpIdSkip = resolveCaregiverEmployeeId(caregiverName);
                freedCaregiversDetails[caregiverName].addedToAvailabilityList = true;
                result.summary.addedToAvailabilityList++;
                result.availabilityListUpdates.push({
                    caregiverName: caregiverName,
                    caregiverId: cgIdSkip,
                    caregiverIdEmployee: cgEmpIdSkip,
                    reason: "Skipped reassignment: caregiver has other active schedules (new blocking rule)",
                    freedFromSchedules: freedCaregiversDetails[caregiverName].freedFromSchedules,
                    availableForReassignment: false
                });
                result.remarks.push("Skipped reassignment for " + caregiverName + " (already assigned elsewhere).");
                continue;
            }


            // Find unassigned schedules that this caregiver can take
            // ENHANCEMENT: Filter to schedules that match the freed time slots
            // PRIORITY: Process client schedules (returnAllScheduledCompletedassignedSchedules) first, then ghost shifts
            var relevantUnassignedSchedules = [];
            var freedTimeSlots = freedCaregiversDetails[caregiverName].freedFromSchedules;

            var clientSchedulesToProcess = returnAllScheduledCompletedassignedSchedules || [];

            // Build sortable list with client type + name + date/time
            var sortableClientSchedules = [];
            for (var sc = 0; sc < clientSchedulesToProcess.length; sc++) {
                var cs = clientSchedulesToProcess[sc];
                if (!cs || !cs.fields) continue;

                var cName = safeGetValue(cs.fields, 'Client_Name.value', '');
                if (!cName) continue; // ignore blank client (those belong to ghost shifts)

                var cData = findClientData(cName);
                var cType = cData ? safeGetValue(cData.fields, 'Client_Type.value', 'Unknown') : 'Unknown';
                var dateVal = safeGetValue(cs.fields, 'Schedule_Start_Date.value', '');
                var startT = safeGetValue(cs.fields, 'Schedule_Start_Time.value', '');
                var startM = parseTime(startT);

                // Priority key: Private = 1, Facility = 2, Unknown = 3
                var typeRank = (cType === 'Private') ? 1 : (cType === 'Facility') ? 2 : 3;

                sortableClientSchedules.push({
                    schedule: cs,
                    clientName: cName,
                    clientType: cType,
                    date: dateVal,
                    startTime: startT,
                    startMin: startM,
                    sortKey: typeRank + '_' + cName.toLowerCase() + '_' + dateVal + '_' + (startM != null ? startM : 9999)
                });
            }

            // Sort by type rank → client name → date → start time
            sortableClientSchedules.sort(function (a, b) {
                if (a.sortKey < b.sortKey) return -1;
                if (a.sortKey > b.sortKey) return 1;
                return 0;
            });

            result.remarks.push("Sorted " + sortableClientSchedules.length + " client schedules (Private first, then Facility) before ghost shifts.");

            // Iterate sorted client schedules
            for (var s = 0; s < sortableClientSchedules.length; s++) {
                var entry = sortableClientSchedules[s];
                var unassignedSchedule = entry.schedule;
                var unassignedStatus = safeGetValue(unassignedSchedule.fields, 'Scheduling_Status.value', '');
                var unassignedClientName = entry.clientName;
                var unassignedDate = safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Date.value', '');
                var unassignedStartTime = safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Time.value', '');
                var unassignedEndTime = safeGetValue(unassignedSchedule.fields, 'Schedule_End_Time.value', '');

                // Skip leave client schedules within leave period
                if (normName(unassignedClientName) === normName(leaveClientId) &&
                    unassignedDate >= leaveStartDate && unassignedDate <= leaveEndDate) {
                    schedulesSkipped.push({
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        skipReason: "Client is on leave during this period",
                        status: unassignedStatus,
                        scheduleType: 'Client Schedule'
                    });
                    continue;
                }

                // Existing caregiver check
                var existingCgId = safeGetValue(unassignedSchedule.fields, 'Select_Expected_Caregiver.value', '');
                var existingCgName = existingCgId ? resolveCaregiverName(existingCgId) : safeGetValue(unassignedSchedule.fields, 'Expected_Caregiver.value', '');
                if (existingCgName && normStr(existingCgName)) {
                    schedulesSkipped.push({
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        skipReason: "Already assigned to: " + existingCgName,
                        status: unassignedStatus,
                        scheduleType: 'Client Schedule'
                    });
                    continue;
                }

                // Skip terminal statuses
                var disallowStatuses = ["Scheduled Completed", "In Progress", "Scheduled Confirmed"];
                if (disallowStatuses.indexOf(unassignedStatus) !== -1) {
                    schedulesSkipped.push({
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        skipReason: "Non-reassignable status: " + unassignedStatus,
                        status: unassignedStatus,
                        scheduleType: 'Client Schedule'
                    });
                    continue;
                }

                // Overlap with freed slot?
                var startMinLocal = parseTime(unassignedStartTime);
                var endMinLocal = parseTime(unassignedEndTime);
                var overlapsWithFreedSlot = false;
                for (var fIdx = 0; fIdx < freedTimeSlots.length; fIdx++) {
                    var freedSlot = freedTimeSlots[fIdx];
                    if (freedSlot.date === unassignedDate) {
                        var parts = freedSlot.time.split(' - ');
                        var fStart = parseTime(parts[0]);
                        var fEnd = parseTime(parts[1]);
                        if (timeOverlap(fStart, fEnd, startMinLocal, endMinLocal)) {
                            overlapsWithFreedSlot = true;
                            break;
                        }
                    }
                }
                if (!overlapsWithFreedSlot) {
                    schedulesSkipped.push({
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        skipReason: "Does not overlap freed time",
                        status: unassignedStatus,
                        scheduleType: 'Client Schedule'
                    });
                    continue;
                }

                relevantUnassignedSchedules.push({
                    schedule: unassignedSchedule,
                    status: unassignedStatus,
                    clientName: unassignedClientName,
                    date: unassignedDate,
                    startTime: unassignedStartTime,
                    endTime: unassignedEndTime,
                    startMin: startMinLocal,
                    endMin: endMinLocal,
                    scheduleType: 'Client Schedule',
                    priority: 1
                });
            }

            // ============================================================================
            // STEP 2B: PROCESS GHOST SHIFTS SECOND (Only if caregiver not already reassigned to a client)
            // ============================================================================
            var ghostShiftsToProcess = returnAllGhostShiftassignedSchedules || [];
            for (var gs = 0; gs < ghostShiftsToProcess.length; gs++) {
                var ghost = ghostShiftsToProcess[gs];
                if (!ghost || !ghost.fields) continue;

                var gStatus = safeGetValue(ghost.fields, 'Scheduling_Status.value', '');
                var gDate = safeGetValue(ghost.fields, 'Schedule_Start_Date.value', '');
                var gStart = safeGetValue(ghost.fields, 'Schedule_Start_Time.value', '');
                var gEnd = safeGetValue(ghost.fields, 'Schedule_End_Time.value', '');

                // Skip non-reassignable statuses
                var ghostSkipStatuses = ["Scheduled Completed", "In Progress", "Scheduled Confirmed"];
                if (ghostSkipStatuses.indexOf(gStatus) !== -1) {
                    schedulesSkipped.push({
                        scheduleId: ghost.id,
                        clientName: "", // ghost
                        scheduleDate: gDate,
                        scheduleTime: gStart + " - " + gEnd,
                        skipReason: "Non-reassignable status: " + gStatus,
                        status: gStatus,
                        scheduleType: 'Ghost Shift'
                    });
                    continue;
                }

                // If caregiver already got a client schedule later we will break out before using ghost shifts.
                var existingGhostCgId = safeGetValue(ghost.fields, 'Select_Expected_Caregiver.value', '');
                var existingGhostCgName = existingGhostCgId ? resolveCaregiverName(existingGhostCgId) : safeGetValue(ghost.fields, 'Expected_Caregiver.value', '');
                if (existingGhostCgName && normStr(existingGhostCgName)) {
                    schedulesSkipped.push({
                        scheduleId: ghost.id,
                        clientName: "",
                        scheduleDate: gDate,
                        scheduleTime: gStart + " - " + gEnd,
                        skipReason: "Already assigned to: " + existingGhostCgName,
                        status: gStatus,
                        scheduleType: 'Ghost Shift'
                    });
                    continue;
                }

                // Overlap with freed slot?
                var gStartMin = parseTime(gStart);
                var gEndMin = parseTime(gEnd);
                var ghostOverlap = false;
                for (var gf = 0; gf < freedTimeSlots.length; gf++) {
                    var freedSlot2 = freedTimeSlots[gf];
                    if (freedSlot2.date === gDate) {
                        var fp = freedSlot2.time.split(' - ');
                        var fsMin = parseTime(fp[0]);
                        var feMin = parseTime(fp[1]);
                        if (timeOverlap(fsMin, feMin, gStartMin, gEndMin)) {
                            ghostOverlap = true;
                            break;
                        }
                    }
                }
                if (!ghostOverlap) {
                    schedulesSkipped.push({
                        scheduleId: ghost.id,
                        clientName: "",
                        scheduleDate: gDate,
                        scheduleTime: gStart + " - " + gEnd,
                        skipReason: "Does not overlap freed time",
                        status: gStatus,
                        scheduleType: 'Ghost Shift'
                    });
                    continue;
                }

                relevantUnassignedSchedules.push({
                    schedule: ghost,
                    status: gStatus,
                    clientName: "",
                    date: gDate,
                    startTime: gStart,
                    endTime: gEnd,
                    startMin: gStartMin,
                    endMin: gEndMin,
                    scheduleType: 'Ghost Shift',
                    priority: 2
                });
            }

            // Final sort (priority then chronological)
            relevantUnassignedSchedules.sort(function (a, b) {
                if (a.priority !== b.priority) return a.priority - b.priority;
                if (a.date !== b.date) return a.date < b.date ? -1 : 1;
                return a.startMin - b.startMin;
            });

            if (relevantUnassignedSchedules.length > 0) {
                var clientCount = 0, ghostCount = 0;
                for (var rc = 0; rc < relevantUnassignedSchedules.length; rc++) {
                    if (relevantUnassignedSchedules[rc].priority === 1) clientCount++; else ghostCount++;
                }
                result.remarks.push("Prepared " + relevantUnassignedSchedules.length + " candidate schedules (" + clientCount + " client, " + ghostCount + " ghost) for caregiver " + caregiverName);
            }

            // Now process only the relevant unassigned schedules (in chronological order)
            for (var rs = 0; rs < relevantUnassignedSchedules.length; rs++) {
                var schedInfo = relevantUnassignedSchedules[rs];
                var unassignedSchedule = schedInfo.schedule;
                var unassignedStatus = schedInfo.status;
                var unassignedClientName = schedInfo.clientName;
                var unassignedDate = schedInfo.date;
                var unassignedStartTime = schedInfo.startTime;
                var unassignedEndTime = schedInfo.endTime;
                var unassignedStartMin = schedInfo.startMin;
                var unassignedEndMin = schedInfo.endMin;

                // Find client data
                var clientData = findClientData(unassignedClientName);
                if (!clientData) {
                    schedulesSkipped.push({
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        skipReason: "Client data not found",
                        status: unassignedStatus
                    });
                    continue;
                }

                // ============================================================================
                // PROBLEM 2 FIX: Block reassignment to the same client who is on leave
                // Check if this schedule belongs to the client on leave AND falls within leave period
                // ============================================================================
                if (normName(unassignedClientName) === normName(leaveClientId)) {
                    // Check if this schedule falls within the client's leave date/time range
                    var scheduleInLeaveRange = isScheduleInClientLeaveRange(
                        unassignedDate,
                        unassignedStartMin,
                        unassignedEndMin,
                        leaveStartDate,
                        leaveEndDate,
                        leaveStartTime,
                        leaveEndTime
                    );

                    if (scheduleInLeaveRange) {
                        schedulesSkipped.push({
                            scheduleId: unassignedSchedule.id,
                            clientName: unassignedClientName,
                            scheduleDate: unassignedDate,
                            scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                            skipReason: "Cannot reassign to same client who is on leave during this time (" + leaveClientId + " leave: " + leaveStartDate + " to " + leaveEndDate + ")",
                            status: unassignedStatus
                        });
                        continue;
                    }
                }

                // NEW: Track that we're checking this schedule
                schedulesChecked.push({
                    scheduleId: unassignedSchedule.id,
                    clientName: unassignedClientName,
                    scheduleDate: unassignedDate,
                    scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                    status: unassignedStatus
                });

                // ============================================================================
                // PROBLEM 1 FIX: Check dynamic weekly hours before attempting reassignment
                // ============================================================================
                var candidateHours = (unassignedEndMin - unassignedStartMin) / 60;
                var weeklyHoursCheck = weeklyDistributionCheck(caregiverName, candidateHours, dynamicWeeklyHours);

                if (!weeklyHoursCheck.passed) {
                    schedulesFailedMatch.push({
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        failReason: "Weekly hours limit: " + weeklyHoursCheck.reason,
                        weeklyHoursDetails: weeklyHoursCheck.details,
                        status: unassignedStatus
                    });
                    continue;
                }

                // Check if caregiver matches client criteria with detailed reasons
                var freedTimeSlots = freedCaregiversDetails[caregiverName] ? freedCaregiversDetails[caregiverName].freedFromSchedules : [];
                var caregiverMatchDetails = getCaregiverMatchDetails(caregiverName, clientData, unassignedDate, unassignedStartMin, unassignedEndMin, freedTimeSlots, cancelledScheduleIds);

                if (caregiverMatchDetails.criteriaChecks &&
                    caregiverMatchDetails.criteriaChecks.duplicateAssignment &&
                    caregiverMatchDetails.criteriaChecks.duplicateAssignment.passed === false) {
                    schedulesFailedMatch.push({
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        status: unassignedStatus,
                        failureReasons: caregiverMatchDetails.failureReasons,
                        criteriaChecks: caregiverMatchDetails.criteriaChecks
                    });
                    continue;
                }

                // Check if caregiver is available at this time (no overlapping existing schedules)
                var caregiverAvailable = isCaregiverAvailableAtTime(caregiverName, unassignedDate, unassignedStartMin, unassignedEndMin);

                // Duplicate slot check
                if (result._scheduleAssignmentTracking[unassignedSchedule.id] &&
                    result._scheduleAssignmentTracking[unassignedSchedule.id].indexOf(normName(caregiverName)) !== -1) {
                    schedulesSkipped.push({
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        skipReason: "Caregiver already assigned to this schedule (multi-slot duplicate)",
                        status: unassignedStatus
                    });
                    continue;
                }

                if (caregiverMatchDetails.matches && caregiverAvailable) {
                    result.summary.reassignedSchedules++;
                    caregiverAssigned = true;

                    var matchScore = calculateMatchScore(caregiverName, clientData);
                    var cgId = resolveCaregiverId(caregiverName);
                    var cgEmpId = resolveCaregiverEmployeeId(caregiverName);

                    var weightedScoreReassigned = calculateWeightedScoreForCaregiver(caregiverName, clientData, unassignedDate);
                    var goodToHavePoints = calculateGoodToHavePoints(caregiverName, clientData);
                    var reassignmentInfo = {
                        scheduleId: unassignedSchedule.id,
                        userId: scheduleUserId,
                        caregiverName: caregiverName,
                        caregiverId: cgId,
                        caregiverIdEmployee: cgEmpId,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        previousStatus: unassignedStatus,
                        newStatus: "Scheduled Completed",
                        shiftStatus: "Scheduled",
                        matchScore: matchScore,
                        weightedScore: weightedScoreReassigned.totalScore,
                        weightedBreakdown: weightedScoreReassigned.breakdown,
                        goodToHavePoints: goodToHavePoints,
                        matchDetails: caregiverMatchDetails.criteriaChecks, // Legacy format
                        detailedMatchInfo: { // NEW: Detailed matching information
                            matches: caregiverMatchDetails.matches,
                            reasons: caregiverMatchDetails.reasons,
                            failureReasons: caregiverMatchDetails.failureReasons,
                            criteriaChecks: caregiverMatchDetails.criteriaChecks
                        }
                    };

                    // Add to separated reassigned schedules array
                    result.reassignedSchedules.push(reassignmentInfo);

                    // Also add to legacy caregiverReassignments for backward compatibility
                    result.caregiverReassignments.push(reassignmentInfo);

                    // Update caregiver details
                    freedCaregiversDetails[caregiverName].reassignedTo = {
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        date: unassignedDate,
                        time: unassignedStartTime + " - " + unassignedEndTime
                    };

                    // Update assigned hours tracking
                    var assignedHoursForSchedule = (unassignedEndMin - unassignedStartMin) / 60;
                    if (!result.debug.currentWeekAssignedHours[caregiverName]) {
                        result.debug.currentWeekAssignedHours[caregiverName] = 0;
                    }
                    result.debug.currentWeekAssignedHours[caregiverName] += assignedHoursForSchedule;

                    // ============================================================================
                    // UPDATE DYNAMIC WEEKLY HOURS: Add assigned hours
                    // ============================================================================
                    if (dynamicWeeklyHours[caregiverName]) {
                        dynamicWeeklyHours[caregiverName].assignedHours += assignedHoursForSchedule;
                        dynamicWeeklyHours[caregiverName].history.push({
                            action: 'ASSIGNED',
                            scheduleId: unassignedSchedule.id,
                            clientName: unassignedClientName,
                            scheduleDate: unassignedDate,
                            scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                            hours: assignedHoursForSchedule,
                            weeklyHoursCheck: weeklyHoursCheck,
                            timestamp: new Date().toISOString()
                        });
                    }

                    // ============================================================================
                    // NEW: UPDATE CAREGIVER CHANGE TRACKING WITH REASSIGNMENT DETAILS
                    // ============================================================================
                    // Find the tracking entry for this caregiver and update reassignment info
                    for (var t = 0; t < result.caregiverChangeHistory.length; t++) {
                        var trackingEntry = result.caregiverChangeHistory[t];
                        if (trackingEntry.originalAssignment.caregiverName === caregiverName &&
                            trackingEntry.changeType === "REMOVED_DUE_TO_LEAVE" &&
                            !trackingEntry.reassignment.wasReassigned) {

                            // Update reassignment details
                            var weightedScoreTracking = calculateWeightedScoreForCaregiver(caregiverName, clientData, unassignedDate);
                            trackingEntry.reassignment.wasReassigned = true;
                            trackingEntry.reassignment.newScheduleId = unassignedSchedule.id;
                            trackingEntry.reassignment.newClientName = unassignedClientName;
                            trackingEntry.reassignment.newScheduleDate = unassignedDate;
                            trackingEntry.reassignment.newScheduleTime = unassignedStartTime + " - " + unassignedEndTime;
                            trackingEntry.reassignment.matchScore = matchScore;
                            trackingEntry.reassignment.weightedScore = weightedScoreTracking.totalScore;
                            trackingEntry.reassignment.weightedBreakdown = weightedScoreTracking.breakdown;
                            trackingEntry.reassignment.matchCriteria = caregiverMatchDetails.criteriaChecks;
                            trackingEntry.reassignment.matchReasons = caregiverMatchDetails.reasons;
                            trackingEntry.reassignment.reassignmentTimestamp = new Date().toISOString();

                            // NEW: Add assignment decision tracking
                            trackingEntry.assignmentDecision = {
                                totalSchedulesChecked: schedulesChecked.length,
                                totalSchedulesSkipped: schedulesSkipped.length,
                                totalSchedulesFailedMatch: schedulesFailedMatch.length,
                                schedulesChecked: schedulesChecked,
                                schedulesSkipped: schedulesSkipped,
                                schedulesFailedMatch: schedulesFailedMatch,
                                finalAssignment: {
                                    assigned: true,
                                    scheduleId: unassignedSchedule.id,
                                    clientName: unassignedClientName,
                                    scheduleDate: unassignedDate,
                                    scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                                    matchScore: matchScore,
                                    matchReasons: caregiverMatchDetails.reasons
                                }
                            };

                            // Update remarks with reassignment info
                            trackingEntry.remarks += ". Reassigned to " + unassignedClientName +
                                " on " + unassignedDate + " " + unassignedStartTime + "-" + unassignedEndTime +
                                " (Match Score: " + matchScore + "). Checked " + schedulesChecked.length +
                                " schedules, skipped " + schedulesSkipped.length + ", failed match " + schedulesFailedMatch.length;

                            break; // Found and updated the entry
                        }
                    }
                    // ============================================================================
                    if (!result._scheduleAssignmentTracking[unassignedSchedule.id]) {
                        result._scheduleAssignmentTracking[unassignedSchedule.id] = [];
                    }
                    result._scheduleAssignmentTracking[unassignedSchedule.id].push(normName(caregiverName));
                    // Break after assigning to one schedule (caregiver can only work one shift at a time)
                    break;
                } else {
                    // NEW: Track why this schedule failed matching
                    var failureReasons = caregiverMatchDetails.failureReasons.slice(); // Copy array
                    if (caregiverMatchDetails.matches && !caregiverAvailable) {
                        failureReasons.push("Caregiver has conflicting schedule at this time");
                    }
                    schedulesFailedMatch.push({
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        scheduleDate: unassignedDate,
                        scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                        status: unassignedStatus,
                        failureReasons: failureReasons,
                        criteriaChecks: caregiverMatchDetails.criteriaChecks
                    });
                }
            }

            // ============================================================================
            // STEP 3: IF NO MATCHING SCHEDULE, ADD TO AVAILABILITY LIST
            // ============================================================================

            if (!caregiverAssigned) {
                result.summary.addedToAvailabilityList++;
                freedCaregiversDetails[caregiverName].addedToAvailabilityList = true;

                var cgId = resolveCaregiverId(caregiverName);
                var cgEmpId = resolveCaregiverEmployeeId(caregiverName);

                // Get detailed schedule information for this caregiver
                var caregiverSchedules = [];
                var freedSchedules = freedCaregiversDetails[caregiverName].freedFromSchedules;

                // For each freed schedule, get all other schedules in that time range
                for (var fs = 0; fs < freedSchedules.length; fs++) {
                    var freedSched = freedSchedules[fs];
                    var schedDate = freedSched.date;
                    var schedTime = freedSched.time;

                    // Parse time range
                    var timeParts = schedTime.split(' - ');
                    var startTime = timeParts[0] || '';
                    var endTime = timeParts[1] || '';

                    // Get all schedules for this caregiver during this time range
                    var schedulesInRange = getCaregiverSchedulesInTimeRange(caregiverName, schedDate, startTime, endTime);

                    // Add to caregiverSchedules array
                    for (var sr = 0; sr < schedulesInRange.length; sr++) {
                        caregiverSchedules.push(schedulesInRange[sr]);
                    }
                }

                // NEW: Build detailed summary of why not assigned
                var notAssignedReasons = [];

                // Add detailed information about skipped schedules
                if (schedulesSkipped.length > 0) {
                    notAssignedReasons.push(" SKIPPED " + schedulesSkipped.length + " SCHEDULES:");
                    for (var skipIdx = 0; skipIdx < schedulesSkipped.length; skipIdx++) {
                        var skipped = schedulesSkipped[skipIdx];
                        notAssignedReasons.push("  • " + skipped.clientName + " (" + skipped.scheduleDate + " " + skipped.scheduleTime + ") - " + skipped.skipReason + " [Status: " + skipped.status + "]");
                    }
                }

                // Add detailed information about failed schedules
                if (schedulesFailedMatch.length > 0) {
                    notAssignedReasons.push(" FAILED MATCH " + schedulesFailedMatch.length + " SCHEDULES:");
                    for (var failIdx = 0; failIdx < schedulesFailedMatch.length; failIdx++) {
                        var failed = schedulesFailedMatch[failIdx];
                        notAssignedReasons.push("  • " + failed.clientName + " (" + failed.scheduleDate + " " + failed.scheduleTime + "):");

                        // Handle both failReason (string) and failureReasons (array)
                        if (failed.failReason) {
                            notAssignedReasons.push("    - " + failed.failReason);
                        }
                        if (failed.failureReasons && failed.failureReasons.length > 0) {
                            for (var reasonIdx = 0; reasonIdx < failed.failureReasons.length; reasonIdx++) {
                                notAssignedReasons.push("    - " + failed.failureReasons[reasonIdx]);
                            }
                        }
                    }
                }

                // Add message if no schedules were available
                if (schedulesChecked.length === 0 && schedulesSkipped.length === 0) {
                    notAssignedReasons.push(" No unassigned schedules available in the system");
                }

                result.availabilityListUpdates.push({
                    caregiverName: caregiverName,
                    caregiverId: cgId,
                    caregiverIdEmployee: cgEmpId,
                    reason: "No matching unassigned schedules found",
                    notAssignedReasons: notAssignedReasons,
                    freedFromSchedules: freedCaregiversDetails[caregiverName].freedFromSchedules,
                    availableForReassignment: true,
                    caregiverSchedules: caregiverSchedules,
                    totalSchedulesInTimeRange: caregiverSchedules.length
                });

                // ============================================================================
                // NEW: UPDATE CAREGIVER CHANGE TRACKING WITH AVAILABILITY DETAILS
                // ============================================================================
                // Find the tracking entry for this caregiver and update availability info
                for (var t = 0; t < result.caregiverChangeHistory.length; t++) {
                    var trackingEntry = result.caregiverChangeHistory[t];
                    if (trackingEntry.originalAssignment.caregiverName === caregiverName &&
                        trackingEntry.changeType === "REMOVED_DUE_TO_LEAVE" &&
                        !trackingEntry.reassignment.wasReassigned) {

                        // Calculate total available hours
                        var totalHours = 0;
                        for (var fs = 0; fs < freedSchedules.length; fs++) {
                            var schedTime = freedSchedules[fs].time;
                            var timeParts = schedTime.split(' - ');
                            if (timeParts.length === 2) {
                                var startMin = parseTime(timeParts[0]);
                                var endMin = parseTime(timeParts[1]);
                                if (startMin !== null && endMin !== null) {
                                    totalHours += (endMin - startMin) / 60;
                                }
                            }
                        }

                        // Update availability details
                        trackingEntry.availabilityStatus.addedToAvailabilityList = true;
                        trackingEntry.availabilityStatus.otherSchedulesInTimeRange = caregiverSchedules;
                        trackingEntry.availabilityStatus.totalAvailableHours = totalHours;
                        trackingEntry.availabilityStatus.availableForReassignment = true;
                        trackingEntry.availabilityStatus.notAssignedReasons = notAssignedReasons;

                        // NEW: Add assignment decision tracking for NOT assigned caregivers
                        trackingEntry.assignmentDecision = {
                            totalSchedulesChecked: schedulesChecked.length,
                            totalSchedulesSkipped: schedulesSkipped.length,
                            totalSchedulesFailedMatch: schedulesFailedMatch.length,
                            schedulesChecked: schedulesChecked,
                            schedulesSkipped: schedulesSkipped,
                            schedulesFailedMatch: schedulesFailedMatch,
                            finalAssignment: {
                                assigned: false,
                                reasons: notAssignedReasons
                            }
                        };

                        // Update remarks with availability info
                        var remarksDetail = ". Added to availability list - no matching schedules found (" +
                            totalHours.toFixed(1) + " hours available). ";
                        remarksDetail += "Checked " + schedulesChecked.length + " schedules, ";
                        remarksDetail += "skipped " + schedulesSkipped.length + ", ";
                        remarksDetail += "failed match " + schedulesFailedMatch.length;

                        trackingEntry.remarks += remarksDetail;

                        break; // Found and updated the entry
                    }
                }
                // ============================================================================
            }
        }

        result.remarks.push("Reassigned " + result.summary.reassignedSchedules + " schedules to freed caregivers");
        result.remarks.push("Added " + result.summary.addedToAvailabilityList + " caregivers to availability list");
    }

    // ============================================================================
    // STEP 3: CHECK UNASSIGNED SCHEDULES IN LEAVE RANGE AND TRY TO ASSIGN CAREGIVERS
    // ============================================================================

    result.remarks.push("DEBUG: returnAllUnassignedSchedules = " + (returnAllUnassignedSchedules ? "array with " + returnAllUnassignedSchedules.length + " items" : "null/undefined"));

    if (returnAllUnassignedSchedules && returnAllUnassignedSchedules.length > 0) {
        // NEW: Sort unassigned schedules by priority (Private clients first, then Facility, then by date)
        returnAllUnassignedSchedules.sort(function (a, b) {
            var clientNameA = safeGetValue(a.fields, 'Client_Name.value', '');
            var clientNameB = safeGetValue(b.fields, 'Client_Name.value', '');

            var clientDataA = findClientData(clientNameA);
            var clientDataB = findClientData(clientNameB);

            var clientTypeA = clientDataA ? safeGetValue(clientDataA.fields, 'Client_Type.value', '') : 'Unknown';
            var clientTypeB = clientDataB ? safeGetValue(clientDataB.fields, 'Client_Type.value', '') : 'Unknown';

            // Priority 1: Private clients
            // Priority 2: Facility clients
            // Priority 3: Sort by client name alphabetically
            // Priority 4: Sort by date
            var priorityA = (clientTypeA === 'Private' ? '1_' : '2_') + clientNameA.toLowerCase();
            var priorityB = (clientTypeB === 'Private' ? '1_' : '2_') + clientNameB.toLowerCase();

            if (priorityA !== priorityB) {
                return priorityA.localeCompare(priorityB);
            }

            // If same priority and client, sort by date
            var dateA = safeGetValue(a.fields, 'Schedule_Start_Date.value', '');
            var dateB = safeGetValue(b.fields, 'Schedule_Start_Date.value', '');
            return dateA.localeCompare(dateB);
        });

        result.remarks.push("Sorted unassigned schedules by priority (Private clients first, then Facility clients, alphabetically, then by date)");


        // Count available freed caregivers (not yet reassigned)
        var availableFreedCaregivers = freedCaregivers.filter(function (cg) {
            return freedCaregiversDetails[cg] && !freedCaregiversDetails[cg].reassignedTo;
        });

        result.remarks.push("STEP 3: Checking " + returnAllUnassignedSchedules.length + " unassigned schedules in leave date range (" + leaveStartDate + " to " + leaveEndDate + "), sorted by date for priority assignment...");
        result.remarks.push("Available freed caregivers for assignment: " + availableFreedCaregivers.length + " out of " + freedCaregivers.length + " total freed caregivers");

        var unassignedSchedulesAssigned = 0;
        var unassignedSchedulesChecked = 0;
        var unassignedSchedulesSkipped = 0;
        var unassignedSchedulesFailedMatch = 0;

        // Process each unassigned schedule
        for (var us = 0; us < returnAllUnassignedSchedules.length; us++) {
            var unassignedSchedule = returnAllUnassignedSchedules[us];
            if (!unassignedSchedule || !unassignedSchedule.fields) continue;

            var unassignedClientName = safeGetValue(unassignedSchedule.fields, 'Client_Name.value', '');
            var unassignedDate = safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Date.value', '');
            var unassignedStartTime = safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Time.value', '');
            var unassignedEndTime = safeGetValue(unassignedSchedule.fields, 'Schedule_End_Time.value', '');

            // ============================================================================
            // >>>>>>>>>>>>>>>>>>>> CODE CORRECTION START <<<<<<<<<<<<<<<<<<<<<<<
            // ============================================================================
            // If this unassigned schedule belongs to the client who is ON LEAVE,
            // skip it entirely. We should not be trying to fill a schedule for a
            // client who has an approved leave for this time period.
            if (normName(unassignedClientName) === normName(leaveClientId)) {
                result.remarks.push("Skipped unassigned schedule for " + unassignedClientName + " (" + unassignedDate + ") - Client is currently on leave and their schedules should not be filled.");
                unassignedSchedulesSkipped++;
                continue; // Move to the next unassigned schedule
            }
            // ============================================================================
            // >>>>>>>>>>>>>>>>>>>> CODE CORRECTION END <<<<<<<<<<<<<<<<<<<<<<<<<
            // ============================================================================

            // Check if this unassigned schedule is within the leave date range
            if (unassignedDate < leaveStartDate || unassignedDate > leaveEndDate) {
                result.remarks.push("Skipped unassigned schedule for " + unassignedClientName + " (" + unassignedDate + ") - Date outside leave range (" + leaveStartDate + " to " + leaveEndDate + ")");
                continue; // Skip schedules outside leave date range
            }

            // Check time overlap if leave has specific times
            var hasTimeOverlap = true;
            if (hasLeaveTime && unassignedStartTime && unassignedEndTime) {
                var unassignedStartMin = parseTime(unassignedStartTime);
                var unassignedEndMin = parseTime(unassignedEndTime);
                if (unassignedStartMin !== null && unassignedEndMin !== null) {
                    hasTimeOverlap = timeOverlap(unassignedStartMin, unassignedEndMin, leaveStartMin, leaveEndMin);
                }
            }

            if (!hasTimeOverlap) {
                result.remarks.push("Skipped unassigned schedule for " + unassignedClientName + " (" + unassignedDate + " " + unassignedStartTime + " - " + unassignedEndTime + ") - Time doesn't overlap with leave (" + leaveStartTime + " - " + leaveEndTime + ")");
                continue; // Skip schedules that don't overlap with leave time
            }

            unassignedSchedulesChecked++;

            // Find client data for this unassigned schedule
            var unassignedClientData = findClientData(unassignedClientName);
            if (!unassignedClientData) {
                unassignedSchedulesSkipped++;
                result.remarks.push("Skipped unassigned schedule for " + unassignedClientName + " (" + unassignedDate + " " + unassignedStartTime + " - " + unassignedEndTime + ") - Client data not found in allClientsScheduleData (" + allClientsScheduleData.length + " records checked)");
                continue;
            }

            // Debug: Log client data details
            var clientType = safeGetValue(unassignedClientData, 'fields.Client_Type.value', 'N/A');
            var weightClass = safeGetValue(unassignedClientData, 'fields.Weight_Class.value', 'N/A');
            var genderPref = safeGetValue(unassignedClientData, 'fields.Gender_Preference.value', 'N/A');
            var blocklist = safeGetValue(unassignedClientData, 'fields.Caregiver_Block_List.value', 'N/A');

            result.remarks.push("Processing unassigned schedule: " + unassignedClientName + " (" + unassignedDate + " " + unassignedStartTime + " - " + unassignedEndTime + ") - Client Type: " + clientType + ", Weight Class: " + weightClass + ", Gender Pref: " + genderPref);

            // Try to find the best matching caregiver from available freed caregivers
            var bestMatch = null;
            var bestMatchScore = -1;
            var bestMatchDetails = null;

            // Get list of available caregivers (not yet reassigned)
            var availableCaregivers = freedCaregivers.filter(function (cg) {
                return freedCaregiversDetails[cg] && !freedCaregiversDetails[cg].reassignedTo;
            });

            if (availableCaregivers.length === 0) {
                result.remarks.push("No available freed caregivers left for assignment (all were reassigned in STEP 2)");
                unassignedSchedulesFailedMatch++;
                continue;
            } else {
                result.remarks.push("  • Checking " + availableCaregivers.length + " available freed caregivers for matching criteria");

            }

            var caregiversChecked = 0;
            var caregiversMatched = 0;

            for (var cg = 0; cg < availableCaregivers.length; cg++) {
                var caregiverName = availableCaregivers[cg];
                caregiversChecked++;

                // Check if caregiver matches the unassigned schedule's client criteria
                var matchDetails = getCaregiverMatchDetails(caregiverName, unassignedClientData, unassignedDate, unassignedStartMin, unassignedEndMin, null, cancelledScheduleIds);

                if (matchDetails.matches) {
                    caregiversMatched++;
                    var matchScore = calculateMatchScore(caregiverName, unassignedClientData);
                    var goodToHavePoints = calculateGoodToHavePoints(caregiverName, unassignedClientData);

                    result.remarks.push("  ✓ " + caregiverName + " matches criteria (Score: " + matchScore + ", Good-to-Have: " + goodToHavePoints + ") - Reasons: " + matchDetails.reasons.join(", "));

                    if (matchScore > bestMatchScore || (matchScore === bestMatchScore && goodToHavePoints > (bestMatchDetails ? bestMatchDetails.goodToHavePoints || 0 : 0))) {
                        bestMatchScore = matchScore;
                        bestMatch = caregiverName;
                        bestMatchDetails = matchDetails;
                        bestMatchDetails.goodToHavePoints = goodToHavePoints;
                    }
                } else {
                    result.remarks.push("  ✗ " + caregiverName + " doesn't match - Failed criteria: " + matchDetails.failureReasons.join(", "));
                }
            }


            result.remarks.push("Matching summary: Checked " + caregiversChecked + " caregivers, " + caregiversMatched + " matched criteria");

            if (bestMatch) {
                // Assign the best matching caregiver to this unassigned schedule
                unassignedSchedulesAssigned++;

                var cgId = resolveCaregiverId(bestMatch);
                var cgEmpId = resolveCaregiverEmployeeId(bestMatch);

                // Calculate weighted score for the best match
                var weightedScoreBest = calculateWeightedScoreForCaregiver(bestMatch, unassignedClientData, unassignedDate);

                var assignmentInfo = {
                    scheduleId: unassignedSchedule.id,
                    caregiverName: bestMatch,
                    caregiverId: cgId,
                    caregiverIdEmployee: cgEmpId,
                    clientName: unassignedClientName,
                    scheduleDate: unassignedDate,
                    scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                    previousStatus: "Unassigned",
                    newStatus: "Scheduled Completed",
                    shiftStatus: "Scheduled",
                    matchScore: bestMatchScore,
                    weightedScore: weightedScoreBest.totalScore,
                    weightedBreakdown: weightedScoreBest.breakdown,
                    goodToHavePoints: bestMatchDetails.goodToHavePoints || 0,
                    matchDetails: bestMatchDetails.criteriaChecks,
                    detailedMatchInfo: {
                        matches: bestMatchDetails.matches,
                        reasons: bestMatchDetails.reasons,
                        failureReasons: bestMatchDetails.failureReasons,
                        criteriaChecks: bestMatchDetails.criteriaChecks
                    },
                    assignmentSource: "Assigned from unassigned schedules during leave processing",
                    leaveRecordId: recordId
                };


                // Add to reassigned schedules array
                result.reassignedSchedules.push(assignmentInfo);
                result.summary.reassignedSchedules++;

                // Update caregiver details
                if (freedCaregiversDetails[bestMatch]) {
                    freedCaregiversDetails[bestMatch].reassignedTo = {
                        scheduleId: unassignedSchedule.id,
                        clientName: unassignedClientName,
                        date: unassignedDate,
                        time: unassignedStartTime + " - " + unassignedEndTime,
                        assignmentSource: "From unassigned schedules"
                    };
                }

                result.remarks.push("✓ SUCCESS: Assigned " + bestMatch + " to unassigned schedule for " + unassignedClientName + " (" + unassignedDate + " " + unassignedStartTime + " - " + unassignedEndTime + ") - Match Score: " + bestMatchScore + ", Weighted Score: " + weightedScoreBest.totalScore + ", Criteria: " + bestMatchDetails.reasons.join(", "));

                // Update caregiver change history
                for (var t = 0; t < result.caregiverChangeHistory.length; t++) {
                    var trackingEntry = result.caregiverChangeHistory[t];
                    if (trackingEntry.originalAssignment.caregiverName === bestMatch &&
                        trackingEntry.changeType === "REMOVED_DUE_TO_LEAVE" &&
                        !trackingEntry.reassignment.wasReassigned) {

                        trackingEntry.reassignment.wasReassigned = true;
                        trackingEntry.reassignment.newScheduleId = unassignedSchedule.id;
                        trackingEntry.reassignment.newClientName = unassignedClientName;
                        trackingEntry.reassignment.newScheduleDate = unassignedDate;
                        trackingEntry.reassignment.newScheduleTime = unassignedStartTime + " - " + unassignedEndTime;
                        trackingEntry.reassignment.matchScore = bestMatchScore;
                        trackingEntry.reassignment.matchCriteria = bestMatchDetails.criteriaChecks;
                        trackingEntry.reassignment.matchReasons = bestMatchDetails.reasons;
                        trackingEntry.reassignment.reassignmentTimestamp = new Date().toISOString();
                        trackingEntry.reassignment.assignmentSource = "From unassigned schedules";

                        break;
                    }
                }

            } else {
                // No matching caregiver found
                unassignedSchedulesFailedMatch++;

                var availableCaregiversCount = availableCaregivers.length;

                result.unassignedSchedules.push({
                    scheduleId: unassignedSchedule.id,
                    clientName: unassignedClientName,
                    scheduleDate: unassignedDate,
                    scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                    reason: "No matching freed caregiver available",
                    checkedCaregivers: availableCaregiversCount,
                    totalFreedCaregivers: freedCaregivers.length,
                    criteriaChecked: "Blocklist, Availability, Schedule Conflicts, Physical Capability, Gender Preference, Client Type Compatibility",
                    matchingDetails: {
                        caregiversChecked: caregiversChecked,
                        caregiversMatched: caregiversMatched,
                        bestMatchScore: bestMatchScore
                    }
                });

                result.remarks.push("✗ FAILURE: No matching caregiver found for unassigned schedule: " + unassignedClientName + " (" + unassignedDate + " " + unassignedStartTime + " - " + unassignedEndTime + ") - Checked " + availableCaregiversCount + " available caregivers, " + caregiversMatched + " matched criteria but none had high enough score");
            }
        }

        result.remarks.push("=== UNASSIGNED SCHEDULES PROCESSING SUMMARY ===");
        result.remarks.push("  • Total unassigned schedules provided: " + returnAllUnassignedSchedules.length);
        result.remarks.push("  • Schedules checked for matching: " + unassignedSchedulesChecked);
        result.remarks.push("  • Successfully assigned: " + unassignedSchedulesAssigned);
        result.remarks.push("  • Skipped (client data not found or client on leave): " + unassignedSchedulesSkipped);
        result.remarks.push("  • Failed to match any caregiver: " + unassignedSchedulesFailedMatch);
        result.remarks.push("  • Total processed schedules: " + (unassignedSchedulesChecked + unassignedSchedulesSkipped + unassignedSchedulesFailedMatch));
        result.remarks.push("  • Remaining unassigned: " + (returnAllUnassignedSchedules.length - unassignedSchedulesAssigned));

        result.summary.unassignedSchedules = returnAllUnassignedSchedules.length - unassignedSchedulesAssigned;
    } else {
        result.remarks.push("No unassigned schedules to check");
    }
}

// ============================================================================
// SCENARIO 2: LEAVE IS CANCELLED (Restore schedules and try to assign caregivers)
// ============================================================================

else if (isLeaveCancellation) {
    result.remarks.push("SCENARIO: Leave cancelled/rejected - restoring schedules");
    if (cancelRequest === "Yes") {
        result.remarks.push("Cancel Request detected: Yes");
    }

    // >>>>>>>>>>>>>>>>>>>> CODE CORRECTION START <<<<<<<<<<<<<<<<<<<<<<<
    // ============================================================================
    // SORT schedules chronologically to ensure earlier shifts are restored first.
    getassignedClientsSchedules.sort(function (a, b) {
        var dateA = safeGetValue(a.fields, 'Schedule_Start_Date.value', '');
        var dateB = safeGetValue(b.fields, 'Schedule_Start_Date.value', '');
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;

        // If dates are the same, sort by start time
        var timeA = parseTime(safeGetValue(a.fields, 'Schedule_Start_Time.value', ''));
        var timeB = parseTime(safeGetValue(b.fields, 'Schedule_Start_Time.value', ''));
        if (timeA < timeB) return -1;
        if (timeA > timeB) return 1;

        return 0;
    });
    result.remarks.push("Sorted restorable schedules chronologically to prioritize earlier shifts.");
    // ============================================================================
    // >>>>>>>>>>>>>>>>>>>> CODE CORRECTION END <<<<<<<<<<<<<<<<<<<<<<<<<
    // ============================================================================

    // ============================================================================
    // STEP 1: FIND AND RESTORE CANCELLED SCHEDULES
    // ============================================================================

    for (var i = 0; i < getassignedClientsSchedules.length; i++) {
        var schedule = getassignedClientsSchedules[i];
        if (!schedule || !schedule.fields) continue;

        var scheduleClientName = safeGetValue(schedule.fields, 'Client_Name.value', '');
        var scheduleDate = safeGetValue(schedule.fields, 'Schedule_Start_Date.value', '');
        var scheduleStartTime = safeGetValue(schedule.fields, 'Schedule_Start_Time.value', '');
        var scheduleEndTime = safeGetValue(schedule.fields, 'Schedule_End_Time.value', '');
        var scheduleStatus = safeGetValue(schedule.fields, 'Scheduling_Status.value', '');

        // Get User_Id from schedule fields (extract early like carvgierreffcode.js)
        var scheduleUserId = safeGetValue(schedule.fields, 'User_Id.value', 0);

        // Get previously assigned caregiver (if any)
        var caregiverId = safeGetValue(schedule.fields, 'Select_Expected_Caregiver.value', '');
        var previouslyAssignedCaregiver = caregiverId ? resolveCaregiverName(caregiverId) : safeGetValue(schedule.fields, 'Actual_Caregiver.value', '');

        // Check if this schedule belongs to the client
        if (normName(scheduleClientName) !== normName(leaveClientId)) continue;

        // Check if schedule date is within leave date range
        if (scheduleDate < leaveStartDate || scheduleDate > leaveEndDate) continue;

        // Check time overlap if leave has specific times
        var hasTimeOverlap = true;
        if (hasLeaveTime && scheduleStartTime && scheduleEndTime) {
            var schedStartMin = parseTime(scheduleStartTime);
            var schedEndMin = parseTime(scheduleEndTime);
            if (schedStartMin !== null && schedEndMin !== null) {
                hasTimeOverlap = timeOverlap(schedStartMin, schedEndMin, leaveStartMin, leaveEndMin);
            }
        }

        if (!hasTimeOverlap) continue;

        result.summary.totalAffectedSchedules++;

        // Check if schedule is unassigned (needs caregiver assignment)
        var isUnassigned = false;
        var unassignedStatus = "";
        if (!caregiverId) {
            isUnassigned = true;
            unassignedStatus = "No Expected Caregiver";
        } else if (scheduleStatus !== "Scheduled Completed") {
            isUnassigned = true;
            unassignedStatus = "Status: " + scheduleStatus;
        }

        // Process schedules that are either cancelled by client or unassigned
        if (scheduleStatus === "Cancelled By Client" || isUnassigned) {
            result.summary.restoredSchedules++;

            // ============================================================================
            // STEP 2: TRY TO ASSIGN CAREGIVER TO RESTORED SCHEDULE
            // ============================================================================

            var clientData = findClientData(scheduleClientName);
            var bestCaregiver = null;
            var bestScore = -1;
            var candidateCaregivers = [];
            var allCaregiversChecked = []; // Track ALL caregivers with detailed reasons

            if (clientData) {
                var schedStartMin = parseTime(scheduleStartTime);
                var schedEndMin = parseTime(scheduleEndTime);

                // PRIORITY 1: Check if previously assigned caregiver is available
                if (previouslyAssignedCaregiver && normStr(previouslyAssignedCaregiver)) {
                    var prevMatchDetails = getCaregiverMatchDetails(previouslyAssignedCaregiver, clientData, scheduleDate, schedStartMin, schedEndMin, null, null);

                    var prevCgId = caregiverId || resolveCaregiverId(previouslyAssignedCaregiver);
                    var prevCgEmpId = resolveCaregiverEmployeeId(previouslyAssignedCaregiver);

                    var prevAvailable = isCaregiverAvailableAtTime(previouslyAssignedCaregiver, scheduleDate, schedStartMin, schedEndMin);

                    if (prevMatchDetails.matches && prevAvailable) {
                        var prevScore = calculateMatchScore(previouslyAssignedCaregiver, clientData);
                        candidateCaregivers.push({
                            name: previouslyAssignedCaregiver,
                            caregiverId: prevCgId,
                            caregiverIdEmployee: prevCgEmpId,
                            score: prevScore,
                            source: "Previously Assigned",
                            matchDetails: prevMatchDetails
                        });
                        if (prevScore > bestScore) {
                            bestScore = prevScore;
                            bestCaregiver = previouslyAssignedCaregiver;
                        }
                    }

                    // Add to all caregivers checked list
                    var weightedScorePrev = calculateWeightedScoreForCaregiver(previouslyAssignedCaregiver, clientData, scheduleDate);
                    allCaregiversChecked.push({
                        name: previouslyAssignedCaregiver,
                        caregiverId: prevCgId,
                        caregiverIdEmployee: prevCgEmpId,
                        source: "Previously Assigned",
                        matches: prevMatchDetails.matches,
                        available: prevAvailable,
                        matchScore: prevMatchDetails.matches && prevAvailable ? calculateMatchScore(previouslyAssignedCaregiver, clientData) : 0,
                        weightedScore: weightedScorePrev.totalScore,
                        weightedBreakdown: weightedScorePrev.breakdown,
                        reasons: prevMatchDetails.reasons,
                        failureReasons: prevMatchDetails.failureReasons.concat(prevAvailable ? [] : ["Not available at schedule time"]),
                        criteriaChecks: prevMatchDetails.criteriaChecks
                    });
                }

                // PRIORITY 2: Check available caregivers from getAvaliableCaregivers
                // This should contain caregivers from the availability calculation
                if (getAvaliableCaregivers && Array.isArray(getAvaliableCaregivers)) {
                    result.remarks.push("Checking " + getAvaliableCaregivers.length + " available caregivers for schedule " + schedule.id);

                    for (var c = 0; c < getAvaliableCaregivers.length; c++) {
                        var caregiver = getAvaliableCaregivers[c];
                        if (!caregiver || !caregiver.fields) continue;

                        var cgName = safeGetValue(caregiver.fields, 'Employee_Full_Name.value', '');
                        if (!cgName) continue;

                        // Skip if already checked as previously assigned
                        if (previouslyAssignedCaregiver && normName(cgName) === normName(previouslyAssignedCaregiver)) continue;

                        var cgMatchDetails = getCaregiverMatchDetails(cgName, clientData, scheduleDate, schedStartMin, schedEndMin, null, null);

                        var cgId = resolveCaregiverId(cgName);
                        var cgEmpId = resolveCaregiverEmployeeId(cgName);

                        var cgAvailable = isCaregiverAvailableAtTime(cgName, scheduleDate, schedStartMin, schedEndMin);

                        if (cgMatchDetails.matches && cgAvailable) {
                            var score = calculateMatchScore(cgName, clientData);
                            var goodToHavePoints = calculateGoodToHavePoints(cgName, clientData);
                            candidateCaregivers.push({
                                name: cgName,
                                caregiverId: cgId,
                                caregiverIdEmployee: cgEmpId,
                                score: score,
                                goodToHavePoints: goodToHavePoints,
                                source: "Availability List",
                                matchDetails: cgMatchDetails
                            });
                            if (score > bestScore || (score === bestScore && goodToHavePoints > (bestMatch ? bestMatch.goodToHavePoints || 0 : 0))) {
                                bestScore = score;
                                bestCaregiver = cgName;
                                bestCaregiverDetails = {
                                    name: cgName,
                                    caregiverId: cgId,
                                    caregiverIdEmployee: cgEmpId,
                                    score: score,
                                    goodToHavePoints: goodToHavePoints,
                                    source: "Availability List",
                                    matchDetails: cgMatchDetails
                                };
                            }
                            result.remarks.push("  ✓ " + cgName + " matches criteria (score: " + score + ", Good-to-Have: " + goodToHavePoints + ")");
                        } else {
                            result.remarks.push("  ✗ " + cgName + " does not match: " + cgMatchDetails.failureReasons.join(", "));
                        }


                        // Add to all caregivers checked list
                        var weightedScoreCg = calculateWeightedScoreForCaregiver(cgName, clientData, scheduleDate);
                        allCaregiversChecked.push({
                            name: cgName,
                            caregiverId: cgId,
                            caregiverIdEmployee: cgEmpId,
                            source: "Availability List",
                            matches: cgMatchDetails.matches,
                            available: cgAvailable,
                            matchScore: cgMatchDetails.matches && cgAvailable ? score : 0,
                            weightedScore: weightedScoreCg.totalScore,
                            weightedBreakdown: weightedScoreCg.breakdown,
                            reasons: cgMatchDetails.reasons,
                            failureReasons: cgMatchDetails.failureReasons.concat(cgAvailable ? [] : ["Not available at schedule time"]),
                            criteriaChecks: cgMatchDetails.criteriaChecks
                        });
                    }
                } else {
                    result.remarks.push("WARNING: No available caregivers list provided or empty");
                }

                // PRIORITY 3: If no caregiver found in availability list, check all employees
                if (!bestCaregiver && employeesDetails && Array.isArray(employeesDetails)) {
                    for (var e = 0; e < employeesDetails.length; e++) {
                        var emp = employeesDetails[e];
                        if (!emp || !emp.fields) continue;

                        var empName = safeGetValue(emp.fields, 'Employee_Full_Name.value', '');
                        if (!empName) continue;

                        // Skip if already checked
                        var alreadyChecked = false;
                        for (var cc = 0; cc < allCaregiversChecked.length; cc++) {
                            if (normName(allCaregiversChecked[cc].name) === normName(empName)) {
                                alreadyChecked = true;
                                break;
                            }
                        }
                        if (alreadyChecked) continue;

                        var empMatchDetails = getCaregiverMatchDetails(empName, clientData, scheduleDate, schedStartMin, schedEndMin, null, null);

                        var empId = emp.id;
                        var empQbId = resolveCaregiverEmployeeId(empName);

                        var empAvailable = isCaregiverAvailableAtTime(empName, scheduleDate, schedStartMin, schedEndMin);

                        if (empMatchDetails.matches && empAvailable) {
                            var empScore = calculateMatchScore(empName, clientData);
                            var goodToHavePoints = calculateGoodToHavePoints(empName, clientData);
                            candidateCaregivers.push({
                                name: empName,
                                caregiverId: empId,
                                caregiverIdEmployee: empQbId,
                                score: empScore,
                                goodToHavePoints: goodToHavePoints,
                                source: "Employee Pool",
                                matchDetails: empMatchDetails
                            });
                            if (empScore > bestScore || (empScore === bestScore && goodToHavePoints > (bestCaregiverDetails ? bestCaregiverDetails.goodToHavePoints || 0 : 0))) {
                                bestScore = empScore;
                                bestCaregiver = empName;
                                bestCaregiverDetails = {
                                    name: empName,
                                    caregiverId: empId,
                                    caregiverIdEmployee: empQbId,
                                    score: empScore,
                                    goodToHavePoints: goodToHavePoints,
                                    source: "Employee Pool",
                                    matchDetails: empMatchDetails
                                };
                            }
                        }


                        // Add to all caregivers checked list
                        var weightedScoreEmp = calculateWeightedScoreForCaregiver(empName, clientData, scheduleDate);
                        allCaregiversChecked.push({
                            name: empName,
                            caregiverId: empId,
                            caregiverIdEmployee: empQbId,
                            source: "Employee Pool",
                            matches: empMatchDetails.matches,
                            available: empAvailable,
                            matchScore: empMatchDetails.matches && empAvailable ? empScore : 0,
                            weightedScore: weightedScoreEmp.totalScore,
                            weightedBreakdown: weightedScoreEmp.breakdown,
                            reasons: empMatchDetails.reasons,
                            failureReasons: empMatchDetails.failureReasons.concat(empAvailable ? [] : ["Not available at schedule time"]),
                            criteriaChecks: empMatchDetails.criteriaChecks
                        });
                    }
                }
            }

            // ============================================================================
            // STEP 3: UPDATE SCHEDULE BASED ON CAREGIVER AVAILABILITY
            // ============================================================================

            if (bestCaregiver) {
                var bestCgId = resolveCaregiverId(bestCaregiver);
                var bestCgEmpId = resolveCaregiverEmployeeId(bestCaregiver);
                var prevCgId = previouslyAssignedCaregiver ? (caregiverId || resolveCaregiverId(previouslyAssignedCaregiver)) : "";
                var prevCgEmpId = previouslyAssignedCaregiver ? resolveCaregiverEmployeeId(previouslyAssignedCaregiver) : 0;

                // Find the source of the best caregiver
                var assignmentSource = "Employee Pool";
                for (var cs = 0; cs < candidateCaregivers.length; cs++) {
                    if (normName(candidateCaregivers[cs].name) === normName(bestCaregiver)) {
                        assignmentSource = candidateCaregivers[cs].source;
                        break;
                    }
                }
                var restoredHours = deriveRestoredHours(schedule, schedStartMin, schedEndMin);
                if (!result.debug.currentWeekRestoredHours) {
                    result.debug.currentWeekRestoredHours = {};
                }
                var existingRestored = result.debug.currentWeekRestoredHours[bestCaregiver] || 0;
                result.debug.currentWeekRestoredHours[bestCaregiver] = existingRestored + restoredHours;
                var weightedScoreAssigned = calculateWeightedScoreForCaregiver(bestCaregiver, clientData);
                var restoredScheduleInfo = {
                    scheduleId: schedule.id,
                    userId: scheduleUserId,
                    clientName: scheduleClientName,
                    scheduleDate: scheduleDate,
                    scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                    previousStatus: scheduleStatus,
                    newStatus: "Scheduled Completed",
                    shiftStatus: "Scheduled",
                    assignedCaregiver: bestCaregiver,
                    assignedCaregiverId: bestCgId,
                    assignedCaregiverIdEmployee: bestCgEmpId,
                    updateNewvalueSelectedValueEmpty: bestCgId,
                    updateNewvalueCargeiverID: bestCgEmpId,
                    previouslyAssignedCaregiver: previouslyAssignedCaregiver || "",
                    previouslyAssignedCaregiverId: prevCgId,
                    previouslyAssignedCaregiverIdEmployee: prevCgEmpId,
                    matchScore: bestScore,
                    weightedScore: weightedScoreAssigned.totalScore,
                    weightedBreakdown: weightedScoreAssigned.breakdown,
                    goodToHavePoints: bestCaregiverDetails ? bestCaregiverDetails.goodToHavePoints || 0 : 0,
                    candidateCaregivers: candidateCaregivers,
                    assignmentSource: assignmentSource,
                    totalCandidates: candidateCaregivers.length,
                    allCaregiversChecked: allCaregiversChecked, // NEW: Detailed matching info for ALL caregivers
                    totalCaregiversChecked: allCaregiversChecked.length,
                    caregiversRequired: getCaregiversRequired(schedule),
                    caregiverSlotNumber: 1,
                    totalSlotsInSchedule: getCaregiversRequired(schedule),
                    scheduleType: getCaregiversRequired(schedule) > 1 ? "Multi Caregiver Schedule" : "Single Caregiver Schedule"
                };


                // Add to separated restored schedules array
                result.restoredSchedules.push(restoredScheduleInfo);

                // Also add to legacy scheduleUpdates for backward compatibility
                result.scheduleUpdates.push(restoredScheduleInfo);
                // MULTI-SLOT: attempt to fill remaining slots if caregiversRequired > 1
                var caregiversRequiredRestore = getCaregiversRequired(schedule);
                var existingSlots = getAllAssignedCaregivers(schedule).length || 1; // we just assigned one
                if (caregiversRequiredRestore > existingSlots) {
                    for (var slotFill = existingSlots + 1; slotFill <= caregiversRequiredRestore; slotFill++) {
                        // Find next best caregiver (exclude already chosen)
                        var nextBest = null, nextBestScore = -1, nextDetails = null;
                        for (var cand = 0; cand < candidateCaregivers.length; cand++) {
                            var cc = candidateCaregivers[cand];
                            if (!cc || !cc.name) continue;
                            if (normName(cc.name) === normName(bestCaregiver)) continue;
                            // Skip if already in tracker
                            if (result._scheduleAssignmentTracking &&
                                result._scheduleAssignmentTracking[schedule.id] &&
                                result._scheduleAssignmentTracking[schedule.id].indexOf(normName(cc.name)) !== -1) continue;
                            if (cc.score > nextBestScore) {
                                nextBest = cc;
                                nextBestScore = cc.score;
                                nextDetails = cc.matchDetails;
                            }
                        }
                        if (nextBest) {
                            if (!result._scheduleAssignmentTracking) result._scheduleAssignmentTracking = {};
                            if (!result._scheduleAssignmentTracking[schedule.id]) result._scheduleAssignmentTracking[schedule.id] = [];
                            result._scheduleAssignmentTracking[schedule.id].push(normName(nextBest.name));

                            var weightedScoreNext = calculateWeightedScoreForCaregiver(nextBest.name, clientData, scheduleDate);
                            var restoredExtra = {
                                scheduleId: schedule.id,
                                userId: scheduleUserId,
                                clientName: scheduleClientName,
                                scheduleDate: scheduleDate,
                                scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                                previousStatus: scheduleStatus,
                                newStatus: "Scheduled Completed",
                                shiftStatus: "Scheduled",
                                assignedCaregiver: nextBest.name,
                                assignedCaregiverId: nextBest.caregiverId,
                                assignedCaregiverIdEmployee: nextBest.caregiverIdEmployee,
                                caregiverSlotNumber: slotFill,
                                caregiversRequired: caregiversRequiredRestore,
                                totalSlotsInSchedule: caregiversRequiredRestore,
                                matchScore: nextBestScore,
                                weightedScore: weightedScoreNext.totalScore,
                                weightedBreakdown: weightedScoreNext.breakdown,
                                assignmentSource: nextBest.source + " (multi-slot)",
                                multiSlot: true
                            };
                            result.restoredSchedules.push(restoredExtra);
                            result.scheduleUpdates.push(restoredExtra);
                        } else {
                            // Record unfilled slot
                            result.unassignedSchedules.push({
                                scheduleId: schedule.id,
                                clientName: scheduleClientName,
                                scheduleDate: scheduleDate,
                                scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                                reason: "No caregiver for slot " + slotFill + " of " + caregiversRequiredRestore,
                                caregiverSlotNumber: slotFill,
                                caregiversRequired: caregiversRequiredRestore,
                                totalSlotsInSchedule: caregiversRequiredRestore
                            });
                            result.summary.unassignedSchedules++;
                        }
                    }
                }

            } else {
                result.summary.unassignedSchedules++;

                var prevCgId = previouslyAssignedCaregiver ? (caregiverId || resolveCaregiverId(previouslyAssignedCaregiver)) : "";
                var prevCgEmpId = previouslyAssignedCaregiver ? resolveCaregiverEmployeeId(previouslyAssignedCaregiver) : 0;

                var unassignedScheduleInfo = {
                    scheduleId: schedule.id,
                    userId: scheduleUserId,
                    clientName: scheduleClientName,
                    scheduleDate: scheduleDate,
                    scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                    previousStatus: scheduleStatus,
                    newStatus: "Caregiver No Show",
                    shiftStatus: "Open Shift",
                    assignedCaregiver: "",
                    assignedCaregiverId: "",
                    assignedCaregiverIdEmployee: 0,
                    updateNewvalueSelectedValueEmpty: "",
                    updateNewvalueCargeiverID: 0,
                    previouslyAssignedCaregiver: previouslyAssignedCaregiver || "",
                    previouslyAssignedCaregiverId: prevCgId,
                    previouslyAssignedCaregiverIdEmployee: prevCgEmpId,
                    reason: "No available caregivers match client criteria",
                    candidateCaregivers: candidateCaregivers,
                    totalCandidates: candidateCaregivers.length,
                    allCaregiversChecked: allCaregiversChecked, // NEW: Detailed matching info for ALL caregivers
                    totalCaregiversChecked: allCaregiversChecked.length
                };

                // Add to separated unassigned schedules array
                result.unassignedSchedules.push(unassignedScheduleInfo);

                // Also add to legacy scheduleUpdates for backward compatibility
                result.scheduleUpdates.push(unassignedScheduleInfo);

                // ============================================================================
                // NEW: Create availabilityListUpdatesChange entry with detailed caregiver list
                // ============================================================================
                var availableCaregiversList = [];

                // Get all available caregivers with detailed scoring
                // Show ALL available caregivers regardless of whether they match criteria
                if (getAvaliableCaregivers && getAvaliableCaregivers.length > 0) {
                    for (var k = 0; k < getAvaliableCaregivers.length; k++) {
                        var caregiver = getAvaliableCaregivers[k];
                        if (!caregiver || !caregiver.fields) continue;

                        var cgName = safeGetValue(caregiver.fields, 'Employee_Full_Name.value', '');
                        if (!cgName) continue;

                        // Calculate detailed score for ALL caregivers
                        if (clientData) {
                            var detailedScore = calculateDetailedMatchScore(cgName, clientData);
                            var cgId = resolveCaregiverId(cgName);
                            var cgEmpId = resolveCaregiverEmployeeId(cgName);

                            // Check if caregiver matches criteria (for status indication)
                            var matchesCriteria = doesCaregiverMatchClientCriteria(cgName, clientData, scheduleDate, schedStartMin, schedEndMin);

                            availableCaregiversList.push({
                                caregiverEmployeeId: cgId,
                                caregiverIdEmployee: cgEmpId,
                                caregiverName: cgName,
                                rank: 0, // Will be set after sorting
                                status: matchesCriteria ? "Available" : "Does Not Match Criteria",
                                weightedBreakdown: {
                                    historical: detailedScore.breakdown.historical,
                                    language: detailedScore.breakdown.language,
                                    skills: detailedScore.breakdown.skills,
                                    workHours: detailedScore.breakdown.workHours
                                },
                                weightedTotalScore: detailedScore.totalScore
                            });
                        }
                    }
                }

                // Sort by score (highest first) and assign ranks
                availableCaregiversList.sort(function (a, b) {
                    return b.weightedTotalScore - a.weightedTotalScore;
                });

                for (var r = 0; r < availableCaregiversList.length; r++) {
                    availableCaregiversList[r].rank = r + 1;
                    availableCaregiversList[r].status = "Available - Rank " + (r + 1);
                }

                // Add to availabilityListUpdatesChange array
                result.availabilityListUpdatesChange.push({
                    scheduleId: schedule.id,
                    userId: scheduleUserId,
                    clientName: scheduleClientName,
                    clientId: clientData ? clientData.id : "",
                    scheduleDate: scheduleDate,
                    scheduleTime: scheduleStartTime + " - " + scheduleEndTime,
                    scheduleType: clientData ? safeGetValue(clientData.fields, 'Client_Type.value', '') : "",
                    currentStatus: scheduleStatus,
                    newStatus: "Unassigned",
                    totalAvailableCaregivers: availableCaregiversList.length,
                    availableCaregiversList: availableCaregiversList
                });
            }
        }
    }

    result.remarks.push("Restored " + result.summary.restoredSchedules + " schedules");
    result.remarks.push("Successfully assigned caregivers to " + (result.summary.restoredSchedules - result.summary.unassignedSchedules) + " schedules");
    result.remarks.push("Unassigned schedules (no caregiver available): " + result.summary.unassignedSchedules);

    // Add detailed summary
    if (result.summary.restoredSchedules > 0) {
        result.remarks.push("=== RESTORATION SUMMARY ===");
        result.remarks.push("Total schedules restored: " + result.summary.restoredSchedules);
        result.remarks.push("Schedules with caregivers assigned: " + (result.summary.restoredSchedules - result.summary.unassignedSchedules));
        result.remarks.push("Schedules remaining unassigned: " + result.summary.unassignedSchedules);

        if (result.restoredSchedules.length > 0) {
            result.remarks.push("--- Assigned Schedules ---");
            for (var rs = 0; rs < result.restoredSchedules.length; rs++) {
                var restoredSched = result.restoredSchedules[rs];
                result.remarks.push("  Schedule " + restoredSched.scheduleId + ": " + restoredSched.clientName +
                    " → Assigned to " + restoredSched.assignedCaregiver +
                    " (Source: " + restoredSched.assignmentSource + ", Score: " + restoredSched.matchScore + ")");
            }
        }

        if (result.unassignedSchedules.length > 0) {
            result.remarks.push("--- Unassigned Schedules ---");
            for (var us = 0; us < result.unassignedSchedules.length; us++) {
                var unassignedSched = result.unassignedSchedules[us];
                result.remarks.push("  Schedule " + unassignedSched.scheduleId + ": " + unassignedSched.clientName +
                    " → No caregiver found (Candidates checked: " + unassignedSched.totalCandidates + ")");
            }
        }
    }

    // ============================================================================
    // STEP 4: CHECK UNASSIGNED SCHEDULES AND TRY TO ASSIGN CAREGIVERS (FOR LEAVE CANCELLATION)
    // ============================================================================

    result.remarks.push("DEBUG: returnAllUnassignedSchedules = " + (returnAllUnassignedSchedules ? "array with " + returnAllUnassignedSchedules.length + " items" : "null/undefined"));

    if (returnAllUnassignedSchedules && returnAllUnassignedSchedules.length > 0) {
        result.remarks.push("STEP 4: Checking " + returnAllUnassignedSchedules.length + " unassigned schedules for potential assignment after leave cancellation...");

        // For leave cancellation, we can use any available caregivers, not just freed ones
        // Since schedules were restored, caregivers might be available now
        var availableCaregiversForUnassigned = getAvaliableCaregivers || [];

        result.remarks.push("Available caregivers for unassigned schedules: " + availableCaregiversForUnassigned.length);

        var unassignedSchedulesAssignedCancel = 0;
        var unassignedSchedulesCheckedCancel = 0;

        // Process each unassigned schedule
        for (var us = 0; us < returnAllUnassignedSchedules.length; us++) {
            var unassignedSchedule = returnAllUnassignedSchedules[us];
            if (!unassignedSchedule || !unassignedSchedule.fields) continue;

            var unassignedClientName = safeGetValue(unassignedSchedule.fields, 'Client_Name.value', '');
            var unassignedDate = safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Date.value', '');
            var unassignedStartTime = safeGetValue(unassignedSchedule.fields, 'Schedule_Start_Time.value', '');
            var unassignedEndTime = safeGetValue(unassignedSchedule.fields, 'Schedule_End_Time.value', '');

            unassignedSchedulesCheckedCancel++;

            // Find client data for this unassigned schedule
            var unassignedClientData = findClientData(unassignedClientName);
            if (!unassignedClientData) {
                result.remarks.push("Skipped unassigned schedule for " + unassignedClientName + " - Client data not found");
                continue;
            }

            // Try to find the best matching caregiver
            var bestMatch = null;
            var bestMatchScore = -1;
            var bestMatchDetails = null;

            for (var cg = 0; cg < availableCaregiversForUnassigned.length; cg++) {
                var caregiver = availableCaregiversForUnassigned[cg];
                var caregiverName = safeGetValue(caregiver, 'fields.Employee_Full_Name.value', '');

                if (!caregiverName) continue;

                // Check if caregiver matches the unassigned schedule's client criteria
                var matchDetails = getCaregiverMatchDetails(caregiverName, unassignedClientData, unassignedDate, parseTime(unassignedStartTime), parseTime(unassignedEndTime), null, null);

                if (matchDetails.matches) {
                    var matchScore = calculateMatchScore(caregiverName, unassignedClientData);
                    var goodToHavePoints = calculateGoodToHavePoints(caregiverName, unassignedClientData);

                    if (matchScore > bestMatchScore || (matchScore === bestMatchScore && goodToHavePoints > (bestMatchDetails ? bestMatchDetails.goodToHavePoints || 0 : 0))) {
                        bestMatchScore = matchScore;
                        bestMatch = caregiverName;
                        bestMatchDetails = matchDetails;
                        bestMatchDetails.goodToHavePoints = goodToHavePoints;
                    }
                }
            }


            if (bestMatch) {
                unassignedSchedulesAssignedCancel++;

                var cgId = resolveCaregiverId(bestMatch);
                var cgEmpId = resolveCaregiverEmployeeId(bestMatch);

                var assignmentInfo = {
                    scheduleId: unassignedSchedule.id,
                    caregiverName: bestMatch,
                    caregiverId: cgId,
                    caregiverIdEmployee: cgEmpId,
                    clientName: unassignedClientName,
                    scheduleDate: unassignedDate,
                    scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                    previousStatus: "Unassigned",
                    newStatus: "Scheduled Completed",
                    shiftStatus: "Scheduled",
                    matchScore: bestMatchScore,
                    goodToHavePoints: bestMatchDetails.goodToHavePoints || 0,
                    matchDetails: bestMatchDetails.criteriaChecks,
                    detailedMatchInfo: {
                        matches: bestMatchDetails.matches,
                        reasons: bestMatchDetails.reasons,
                        failureReasons: bestMatchDetails.failureReasons,
                        criteriaChecks: bestMatchDetails.criteriaChecks
                    },
                    assignmentSource: "Assigned from unassigned schedules during leave cancellation",
                    leaveRecordId: recordId
                };


                result.reassignedSchedules.push(assignmentInfo);
                result.summary.reassignedSchedules++;

                result.remarks.push("✓ SUCCESS (Cancellation): Assigned " + bestMatch + " to unassigned schedule for " + unassignedClientName + " - Match Score: " + bestMatchScore);
            } else {
                result.unassignedSchedules.push({
                    scheduleId: unassignedSchedule.id,
                    clientName: unassignedClientName,
                    scheduleDate: unassignedDate,
                    scheduleTime: unassignedStartTime + " - " + unassignedEndTime,
                    reason: "No matching caregiver available during leave cancellation"
                });

                result.remarks.push("✗ FAILURE (Cancellation): No matching caregiver found for unassigned schedule: " + unassignedClientName);
            }
        }

        result.remarks.push("Leave cancellation unassigned schedules summary: Checked " + unassignedSchedulesCheckedCancel + ", Assigned " + unassignedSchedulesAssignedCancel);

        // Update summary
        result.summary.unassignedSchedules = returnAllUnassignedSchedules.length - unassignedSchedulesAssignedCancel;
    } else {
        result.remarks.push("No unassigned schedules to check during leave cancellation");
    }
}

// ============================================================================
// RETURN RESULT - Format similar to caregiver leave output
// ============================================================================

// Build a unified data array containing ALL affected schedules
var allSchedulesData = [];

// Add cancelled schedules
for (var i = 0; i < result.cancelledSchedules.length; i++) {
    var sched = result.cancelledSchedules[i];

    // Get QB_Id for previous caregiver (if any) - as number
    var previousCaregiverQbId = 0;
    if (sched.previousCaregiver) {
        var qbIdValue = resolveCaregiverEmployeeId(sched.previousCaregiver);
        previousCaregiverQbId = qbIdValue ? qbIdValue : 0;
    }

    // Get User_Id from schedule - as number
    var scheduleUserId = sched.userId || 0;

    allSchedulesData.push({
        userId: scheduleUserId,
        qbId: previousCaregiverQbId,
        scheduleId: sched.scheduleId || "",
        clientName: sched.clientName || "",
        clientId: sched.clientId || "",
        scheduleDate: sched.scheduleDate || "",
        scheduleTime: sched.scheduleTime || "",
        scheduleType: sched.scheduleType || "",
        previousCaregiver: sched.previousCaregiver || "",
        previousCaregiverId: sched.previousCaregiverId || "",
        currentStatus: sched.currentStatus || "",
        newStatus: sched.newStatus || "",
        action: "Cancelled",
        reason: sched.reason || ""
    });
}

// Add reassigned schedules
for (var i = 0; i < result.reassignedSchedules.length; i++) {
    var sched = result.reassignedSchedules[i];

    // Get QB_Id for new caregiver (if any) - as number
    var newCaregiverQbId = 0;
    if (sched.newCaregiver) {
        var qbIdValue = resolveCaregiverEmployeeId(sched.newCaregiver);
        newCaregiverQbId = qbIdValue ? qbIdValue : 0;
    }

    // Get User_Id from schedule - as number
    var scheduleUserId = sched.userId || 0;

    allSchedulesData.push({
        userId: scheduleUserId,
        qbId: newCaregiverQbId,
        scheduleId: sched.scheduleId || "",
        clientName: sched.clientName || "",
        clientId: sched.clientId || "",
        scheduleDate: sched.scheduleDate || "",
        scheduleTime: sched.scheduleTime || "",
        scheduleType: sched.scheduleType || "",
        previousCaregiver: sched.previousCaregiver || "",
        previousCaregiverId: sched.previousCaregiverId || "",
        newCaregiver: sched.newCaregiver || "",
        newCaregiverId: sched.newCaregiverId || "",
        currentStatus: sched.currentStatus || "",
        newStatus: sched.newStatus || "",
        action: "Reassigned",
        reason: sched.reason || ""
    });
}

// Add restored schedules (with or without caregiver assignment)
for (var i = 0; i < result.restoredSchedules.length; i++) {
    var sched = result.restoredSchedules[i];

    // Get QB_Id for assigned caregiver (if any) - as number
    var assignedCaregiverQbId = 0;
    if (sched.assignedCaregiver) {
        var qbIdValue = resolveCaregiverEmployeeId(sched.assignedCaregiver);
        assignedCaregiverQbId = qbIdValue ? qbIdValue : 0;
    }

    // Get User_Id from schedule - as number
    var scheduleUserId = sched.userId || 0;

    allSchedulesData.push({
        userId: scheduleUserId,
        qbId: assignedCaregiverQbId,
        scheduleId: sched.scheduleId || "",
        clientName: sched.clientName || "",
        clientId: sched.clientId || "",
        scheduleDate: sched.scheduleDate || "",
        scheduleTime: sched.scheduleTime || "",
        scheduleType: sched.scheduleType || "",
        assignedCaregiver: sched.assignedCaregiver || "",
        assignedCaregiverId: sched.assignedCaregiverId || "",
        currentStatus: sched.currentStatus || "",
        newStatus: sched.newStatus || "",
        action: "Restored",
        reason: sched.reason || ""
    });
}

// Add schedules with availability list updates (these include unassigned schedules with caregiver details)
for (var i = 0; i < result.availabilityListUpdatesChange.length; i++) {
    var sched = result.availabilityListUpdatesChange[i];

    // Get User_Id from schedule - as number
    var scheduleUserId = sched.userId || 0;

    // For unassigned schedules, qbId is 0
    allSchedulesData.push({
        userId: scheduleUserId,
        qbId: 0,
        scheduleId: sched.scheduleId || "",
        clientName: sched.clientName || "",
        clientId: sched.clientId || "",
        scheduleDate: sched.scheduleDate || "",
        scheduleTime: sched.scheduleTime || "",
        scheduleType: sched.scheduleType || "",
        currentStatus: sched.currentStatus || "",
        newStatus: sched.newStatus || "",
        action: "Restored - Unassigned",
        reason: "No caregiver assigned - Available caregivers listed below",
        totalAvailableCaregivers: sched.totalAvailableCaregivers || 0,
        availableCaregiversList: sched.availableCaregiversList || []
    });
}
(function computeMultiCaregiverStats() {
    var stats = {
        totalMultiCaregiverSchedulesCancelled: 0,
        totalSlotsCancelled: 0,
        totalSlotsRestored: 0,
        totalSlotsUnfilled: 0
    };
    for (var i = 0; i < result.cancelledSchedules.length; i++) {
        var c = result.cancelledSchedules[i];
        if (c.caregiversRequired > 1) {
            stats.totalMultiCaregiverSchedulesCancelled++;
            stats.totalSlotsCancelled++;
        }
    }
    for (var r = 0; r < result.restoredSchedules.length; r++) {
        var rs = result.restoredSchedules[r];
        if (rs.caregiversRequired > 1) {
            stats.totalSlotsRestored++;
        }
    }
    for (var u = 0; u < result.unassignedSchedules.length; u++) {
        var us = result.unassignedSchedules[u];
        if (us.caregiversRequired > 1) {
            stats.totalSlotsUnfilled++;
        }
    }
    result.summary.multiCaregiverStats = stats;
})();

// Build the final output in the same format as caregiver leave
var finalOutput = {
    success: result.success,
    recordId: result.recordId,
    leaveDetails: result.leaveDetails,
    summary: result.summary,
    schedules: {
        data: allSchedulesData
    },
    remarks: result.remarks,
    // Keep original arrays for backward compatibility
    cancelledSchedules: result.cancelledSchedules,
    reassignedSchedules: result.reassignedSchedules,
    restoredSchedules: result.restoredSchedules,
    unassignedSchedules: result.unassignedSchedules,
    availabilityListUpdatesChange: result.availabilityListUpdatesChange,
    availabilityListUpdates: result.availabilityListUpdates,
    scheduleUpdates: result.scheduleUpdates,
    caregiverReassignments: result.caregiverReassignments,
    debug: result.debug
};

return finalOutput;