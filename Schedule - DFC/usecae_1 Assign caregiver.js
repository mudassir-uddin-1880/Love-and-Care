var schedulingMasterData = input.recordId;
var masterData = input.masterData;
var caregiverAvailability = input.caregiverAvailability;
var actualSchedulingData = input.actualSchedulingData;
var primaryAvailable = "No";
var leavesData = input.leavesData || [];
var currDate = "2024-06-12";
var allClientsScheduleData = input.allClientsScheduleData || [];
var clientSchedules = input.clientSchedules || { data: [] };
var employeesDetails = input.employeesDetails || [];

var result = {
    debug: {
        inputCurrDate: currDate
    },
    conflicts: {
        total: 0,
        details: []
    },
    availabilityIssues: {
        total: 0,
        details: []
    },
    // New: unified issues array
    conflictsAndAvailabilityIssues: [],
    allClientAssignments: []
};

// ---------------------------------------------------------------------------
// STEP 1: PRIMARY CAREGIVER AVAILABILITY CHECK FROM ACTUAL SCHEDULING DATA
// ---------------------------------------------------------------------------

function getPrimaryAvailableFromActuals(data, primaryName, clientNameNorm, next7Days) {
    if (!primaryName || !isArray(data)) return "No";
    var primaryNorm = normName(primaryName);

    var startIso = (next7Days && next7Days.length) ? next7Days[0].iso : null;
    var endIso = (next7Days && next7Days.length) ? next7Days[next7Days.length - 1].iso : null;

    for (var i = 0; i < data.length; i++) {
        var rec = data[i];
        if (!rec || !rec.fields) continue;
        var f = rec.fields;

        var status = safeGetValue(f, 'Scheduling_Status.value', '');
        if (status !== 'Approved') continue;

        var recClient = safeGetValue(f, 'Client_Name.value', '');
        if (clientNameNorm && normName(recClient) !== clientNameNorm) continue;

        var recCg = safeGetValue(f, 'Actual_Caregiver.value', '');
        if (!recCg || normName(recCg) !== primaryNorm) continue;

        var s = safeGetValue(f, 'Schedule_Start_Date.value', '');
        var e = safeGetValue(f, 'Schedule_End_Date.value', s || '');
        if (!s) continue;

        // overlap: [s,e] intersects [startIso,endIso] (string compare ok for YYYY-MM-DD)
        if (!startIso || !endIso || (s <= endIso && e >= startIso)) {
            return "Yes";
        }
    }
    return "No";
}

// Add this new function to check if primary caregiver exists
function isPrimaryCaregiverAvailable(primaryName, employeesDetails, leavesData, next7Days) {
    if (!primaryName || normStr(primaryName) === "") return "No";

    // Check if primary caregiver exists in employeesDetails
    var primaryExists = false;
    var primaryNorm = normName(primaryName);

    if (isArray(employeesDetails)) {
        for (var i = 0; i < employeesDetails.length; i++) {
            var emp = employeesDetails[i];
            var empName = safeGetValue(emp, 'fields.Employee_Full_Name.value', '');
            if (empName && normName(empName) === primaryNorm) {
                primaryExists = true;
                break;
            }
        }
    }

    if (!primaryExists) return "No";

    // Check if primary is on leave during any of the next 7 days
    if (isArray(next7Days) && isArray(leavesData)) {
        for (var d = 0; d < next7Days.length; d++) {
            if (isCaregiverOnLeave(primaryName, next7Days[d].iso, leavesData)) {
                return "No"; // On leave during the period
            }
        }
    }

    return "Yes";
}

// ---------------------------------------------------------------------------
// STEP 2: INPUT VALIDATION AND SAFETY UTILITIES
// ---------------------------------------------------------------------------

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

function validateInputs() {
    var errors = [];

    if (!currDate || typeof currDate !== 'string') {
        errors.push('currDate is required and must be a string');
    }

    if (currDate && !/^\d{4}-\d{2}-\d{2}$/.test(currDate)) {
        errors.push('currDate must be in YYYY-MM-DD format');
    }

    if (!allClientsScheduleData || !isArray(allClientsScheduleData)) {
        errors.push('allClientsScheduleData is required and must be an array');
    }

    return errors;
}

// Check inputs early
var validationErrors = validateInputs();
if (validationErrors.length > 0) {
    result.error = 'Input validation failed: ' + validationErrors.join(', ');
    return result;
}

// ---------------------------------------------------------------------------
// STEP 3: DATE CALCULATION UTILITIES - GENERATE NEXT 7 DAYS FROM CURRENT DATE
// ---------------------------------------------------------------------------

function getNext7Days(inputDate) {
    var days = [];

    function zero2(n) {
        return n < 10 ? ('0' + n) : ('' + n);
    }

    var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var WEEK_START = 1; // 0=Sun, 1=Mon

    // Validate input format
    if (typeof inputDate !== 'string' || inputDate.length !== 10 || inputDate.indexOf('-') === -1) {
        result.debug.dateError = "currDate must be YYYY-MM-DD format";
        return days;
    }

    var parts = inputDate.split('-');
    if (parts.length !== 3) {
        result.debug.dateError = "Invalid date format";
        return days;
    }

    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);

    // Validate date components
    if (isNaN(y) || isNaN(m) || isNaN(d) || y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
        result.debug.dateError = "Invalid date components";
        return days;
    }

    result.debug.dateUsed = "parsed:YYYY-MM-DD";

    function isLeap(yy) {
        return (yy % 4 === 0 && yy % 100 !== 0) || (yy % 400 === 0);
    }

    function daysInMonth(yy, mm) {
        var monthDays = [31, isLeap(yy) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return monthDays[mm - 1];
    }

    function getDayOfWeek(yy, mm, dd) {
        var t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
        if (mm < 3) yy -= 1;
        return (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[mm - 1] + dd) % 7;
    }

    // Jump to the start of NEXT week
    var currDow = getDayOfWeek(y, m, d);
    var daysToWeekStart = (WEEK_START - currDow + 7) % 7;
    if (daysToWeekStart === 0) daysToWeekStart = 7; // Move to next week if already at week start

    // Build the 7 days of next week
    for (var i = 0; i < 7; i++) {
        var yy = y;
        var mm = m;
        var dd = d + daysToWeekStart + i;

        // Handle month/year overflow
        while (dd > daysInMonth(yy, mm)) {
            dd -= daysInMonth(yy, mm);
            mm += 1;
            if (mm > 12) {
                mm = 1;
                yy += 1;
            }
        }

        var iso = yy + '-' + zero2(mm) + '-' + zero2(dd);
        var dayName = DAY_NAMES[getDayOfWeek(yy, mm, dd)];

        days.push({
            date: iso,
            day: dayName,
            iso: iso
        });

        if (i === 0) {
            result.debug.nextWeekStartIso = iso;
        }
    }

    result.debug.daysGenerated = days.length;
    result.debug.next7DaysPreview = days.map(function (day) {
        return day.iso + ' ' + day.day;
    });

    return days;
}

// ---------------------------------------------------------------------------
// STEP 4: STRING PROCESSING AND ARRAY VALIDATION HELPERS
// ---------------------------------------------------------------------------

function normStr(v) {
    if (v == null) return '';
    return String(v).replace(/\s+/g, ' ').trim();
}

function normName(v) {
    return normStr(v).toLowerCase();
}

function isArray(a) {
    return Object.prototype.toString.call(a) === '[object Array]';
}

function safeParseNumber(value, defaultValue) {
    if (typeof value === 'number' && !isNaN(value)) {
        return value;
    }
    var parsed = parseFloat(value);
    return isNaN(parsed) ? (defaultValue || 0) : parsed;
}
// ---------------------------------------------------------------------------
// STEP 5.1: EMPLOYEE SHIFT AVAILABILITY (AM/PM/NOC) USING employeesDetails
// ---------------------------------------------------------------------------

// Map day name to key used in employeesDetails (e.g., 'Monday' -> 'MONDAY')
function dayToKey(dayName) {
    var d = normStr(dayName).toUpperCase();
    // Support common day names; fallback to given
    var map = {
        'SUNDAY': 'SUNDAY', 'MONDAY': 'MONDAY', 'TUESDAY': 'TUESDAY',
        'WEDNESDAY': 'WEDNESDAY', 'THURSDAY': 'THURSDAY',
        'FRIDAY': 'FRIDAY', 'SATURDAY': 'SATURDAY'
    };
    return map[d] || d;
}

// Return which shift segments (AM/PM/NOC) the time window overlaps
// Bands (minutes from midnight):
//   NOC: [0, 360) and [1260, 1440)
//   AM : [360, 720)
//   PM : [720, 1260)
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

// Check caregiver’s availability for given day/time from employeesDetails
// Requires "Yes" for all overlapping segments (AM/PM/NOC)
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
    var emp = null;
    for (var i = 0; i < employeesDetails.length; i++) {
        var e = employeesDetails[i];
        var nm = safeGetValue(e, 'fields.Employee_Full_Name.value', '');
        if (nm && normName(nm) === cgNorm) {
            emp = e;
            break;
        }
    }
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


// New helpers: find employee by name and get QB_Id
function getEmployeeRecordByName(caregiverName, employeesDetails) {
    if (!caregiverName || !isArray(employeesDetails)) return null;
    var target = normName(caregiverName);
    for (var i = 0; i < employeesDetails.length; i++) {
        var rec = employeesDetails[i];
        var name = safeGetValue(rec, 'fields.Employee_Full_Name.value', '');
        if (name && normName(name) === target) {
            return rec;
        }
    }
    return null;
}

function getCaregiverQBID(caregiverName, employeesDetails) {
    var emp = getEmployeeRecordByName(caregiverName, employeesDetails);
    if (!emp || !emp.fields) {
        // Debug: log when employee not found
        result.debug = result.debug || {};
        result.debug.qbIdLookupFailed = result.debug.qbIdLookupFailed || [];
        result.debug.qbIdLookupFailed.push({
            searchedName: caregiverName,
            normalizedName: normName(caregiverName),
            availableEmployees: employeesDetails.map(function (e) {
                return {
                    name: safeGetValue(e, 'fields.Employee_Full_Name.value', ''),
                    normalized: normName(safeGetValue(e, 'fields.Employee_Full_Name.value', ''))
                };
            })
        });
        return '';
    }

    // Support common variants just in case
    var candidates = [
        'QB_Id.value',
        'QB_ID.value',
        'QB ID.value',
        'QBID.value',
        'QuickBooks_Id.value',
        'QuickBooks_ID.value',
        'QuickBooks ID.value'
    ];
    for (var i = 0; i < candidates.length; i++) {
        var v = safeGetValue(emp.fields, candidates[i], '');
        if (v) return String(v);
    }
    // Final fallback if stored without .value
    var fallback = safeGetValue(emp.fields, 'QB_Id', '');
    return fallback ? String(fallback) : '';
}

// ADD: return employeesDetails record.id for a caregiver
function getCaregiverEmployeeId(caregiverName, employeesDetails) {
    var emp = getEmployeeRecordByName(caregiverName, employeesDetails);
    return (emp && emp.id) ? String(emp.id) : '';
}

// ---------------------------------------------------------------------------
// STEP 5.2: CLIENT/CAREGIVER PREFERENCE MATCHING HELPERS
// ---------------------------------------------------------------------------

function parseList(v) {
    var s = normStr(v);
    if (!s) return [];
    return s.split(/[,;/\n]+/).map(function (x) { return normStr(x).toLowerCase(); }).filter(Boolean);
}

function extractClientPrefs(clientData) {
    var f = (clientData && clientData.fields) ? clientData.fields : {};
    var genderPref = normStr(safeGetValue(f, 'Gender_Preference.value', ''));
    var physReq = safeParseNumber(safeGetValue(f, 'Physical_Capability_lbs.value', 0), 0);
    var blockList = parseList(safeGetValue(f, 'Caregiver_Block_List.value', ''));
    var skills = parseList(safeGetValue(f, 'Skills_Preferences.value', ''));
    var personality = parseList(safeGetValue(f, 'Personality_Match.value', ''));
    var langs = parseList(safeGetValue(f, 'Language_Preferences.value', ''));
    return {
        genderPref: genderPref,
        genderPrefNorm: genderPref ? genderPref.toLowerCase() : '',
        physReq: physReq > 0 ? physReq : 0,
        blockList: blockList,
        skills: skills,
        personality: personality,
        langs: langs
    };
}

function getCaregiverProfile(emp) {
    if (!emp || !emp.fields) return null;
    var ef = emp.fields;
    return {
        name: normStr(safeGetValue(ef, 'Employee_Full_Name.value', '')),
        nameNorm: normName(safeGetValue(ef, 'Employee_Full_Name.value', '')),
        gender: normStr(safeGetValue(ef, 'Gender.value', '')),
        genderNorm: normStr(safeGetValue(ef, 'Gender.value', '')).toLowerCase(),
        phys: safeParseNumber(safeGetValue(ef, 'Physical_Capability_lbs.value', 0), 0),
        skills: parseList(safeGetValue(ef, 'Experience.value', '')),
        personality: parseList(safeGetValue(ef, 'Personality_Match.value', '')),
        langs: parseList(safeGetValue(ef, 'Language.value', ''))
    };
}

function isBlockedByClient(prefs, caregiverName) {
    if (!prefs || !prefs.blockList || prefs.blockList.length === 0) return false;
    var nm = normName(caregiverName);
    for (var i = 0; i < prefs.blockList.length; i++) {
        if (prefs.blockList[i] === nm) return true;
    }
    return false;
}

function passesMandatory(prefs, profile) {
    if (!prefs) return { ok: true };
    // Gender Preference (mandatory if set)
    if (prefs.genderPrefNorm) {
        if (!profile || profile.genderNorm !== prefs.genderPrefNorm) {
            return { ok: false, reason: 'gender_mismatch' };
        }
    }
    // Physical Capability (mandatory if > 0)
    if (prefs.physReq > 0) {
        if (!profile || profile.phys < prefs.physReq) {
            return { ok: false, reason: 'insufficient_physical_capability' };
        }
    }
    return { ok: true };
}

// Optional scoring: English prioritized, then language, skills, personality
function scoreOptional(prefs, profile) {
    if (!prefs || !profile) return 0;
    var score = 0;
    // English first priority
    if (profile.langs.indexOf('english') !== -1) score += 5;

    // Language preference overlap
    if (prefs.langs.length) {
        for (var i = 0; i < profile.langs.length; i++) {
            if (prefs.langs.indexOf(profile.langs[i]) !== -1) score += 2;
        }
    }
    // Skills overlap
    if (prefs.skills.length) {
        for (var j = 0; j < profile.skills.length; j++) {
            if (prefs.skills.indexOf(profile.skills[j]) !== -1) score += 1;
        }
    }
    // Personality overlap
    if (prefs.personality.length) {
        for (var k = 0; k < profile.personality.length; k++) {
            if (prefs.personality.indexOf(profile.personality[k]) !== -1) score += 1;
        }
    }
    return score;
}

function getAllCaregiverNames(employeesDetails) {
    var list = [];
    if (!isArray(employeesDetails)) return list;
    for (var i = 0; i < employeesDetails.length; i++) {
        var n = normStr(safeGetValue(employeesDetails[i], 'fields.Employee_Full_Name.value', ''));
        if (n) list.push(n);
    }
    // de-dup by normalized name
    var seen = {};
    var out = [];
    for (var j = 0; j < list.length; j++) {
        var key = normName(list[j]);
        if (!seen[key]) { out.push(list[j]); seen[key] = true; }
    }
    return out;
}

// ---------------------------------------------------------------------------
// STEP 5: TIME PARSING AND CONFLICT DETECTION UTILITIES
// ---------------------------------------------------------------------------

function parseTime(timeStr) {
    if (!timeStr) return null;

    var cleanTime = normStr(timeStr).replace(/[^0-9:]/g, '');
    var parts = cleanTime.split(':');

    if (parts.length >= 2) {
        var hours = parseInt(parts[0], 10);
        var minutes = parseInt(parts[1], 10);

        if (!isNaN(hours) && !isNaN(minutes)) {
            return hours * 60 + minutes; // Convert to minutes for easy comparison
        }
    }

    return null;
}

// Time overlap detection for schedule conflicts
function timeOverlap(start1, end1, start2, end2) {
    // All times should be in minutes from midnight
    return start1 < end2 && start2 < end1;
}

function minutesToHHMM(mins) {
    mins = Math.max(0, Math.min(1439, mins | 0));
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    return pad2(h) + ':' + pad2(m);
}

// ---------------------------------------------------------------------------
// STEP 6: CAREGIVER HOURS COMPUTATION AND RANKING SYSTEM
// ---------------------------------------------------------------------------

function computeCaregiverHours(data, clientNameNorm) {
    var hours = {};
    var foundApproved = false;

    if (!isArray(data)) {
        result.debug.caregiverHoursError = "actualSchedulingData is not an array";
        return hours;
    }

    // Pass 1: Approved schedules only
    for (var i = 0; i < data.length; i++) {
        var rec = data[i];
        if (!rec || !rec.fields) continue;

        var fields = rec.fields;
        var recClientName = safeGetValue(fields, 'Client_Name.value', '');

        // Skip if client name doesn't match (when specified)
        if (clientNameNorm && normName(recClientName) !== clientNameNorm) {
            continue;
        }

        var status = safeGetValue(fields, 'Scheduling_Status.value', '');
        if (status !== "Approved") continue;

        var caregiverName = safeGetValue(fields, 'Actual_Caregiver.value', '');
        var actualHours = safeParseNumber(safeGetValue(fields, 'Actual_Hours.value', 0));

        if (caregiverName) {
            foundApproved = true;
            hours[caregiverName] = (hours[caregiverName] || 0) + actualHours;
        }
    }

    // Pass 2: All statuses if no approved found
    if (!foundApproved) {
        for (var j = 0; j < data.length; j++) {
            var rec2 = data[j];
            if (!rec2 || !rec2.fields) continue;

            var fields2 = rec2.fields;
            var recClientName2 = safeGetValue(fields2, 'Client_Name.value', '');

            if (clientNameNorm && normName(recClientName2) !== clientNameNorm) {
                continue;
            }

            var caregiverName2 = safeGetValue(fields2, 'Actual_Caregiver.value', '');
            var actualHours2 = safeParseNumber(safeGetValue(fields2, 'Actual_Hours.value', 0));

            if (caregiverName2) {
                hours[caregiverName2] = (hours[caregiverName2] || 0) + actualHours2;
            }
        }
    }

    return hours;
}

// Build caregiver priority ranking based on primary caregiver and hours worked
function buildCaregiverRanking(primaryName, caregiverHours) {
    var seen = {};
    var ranking = [];

    // Add primary caregiver first (if valid)
    if (primaryName && normStr(primaryName) !== "") {
        ranking.push(primaryName);
        seen[normName(primaryName)] = true;
    }

    // Sort other caregivers by hours (descending)
    var caregiverList = [];
    for (var caregiverName in caregiverHours) {
        if (caregiverHours.hasOwnProperty(caregiverName)) {
            caregiverList.push({
                name: caregiverName,
                hours: caregiverHours[caregiverName] || 0
            });
        }
    }

    // Sort by hours (highest first), then by name for consistency
    caregiverList.sort(function (a, b) {
        if (b.hours !== a.hours) {
            return b.hours - a.hours;
        }
        return a.name.localeCompare(b.name);
    });

    // Add to ranking (skip if already added)
    for (var i = 0; i < caregiverList.length; i++) {
        var caregiverNameNorm = normName(caregiverList[i].name);
        if (!seen[caregiverNameNorm]) {
            ranking.push(caregiverList[i].name);
            seen[caregiverNameNorm] = true;
        }
    }

    return ranking;
}

// ---------------------------------------------------------------------------
// STEP 7: CAREGIVER LEAVE STATUS CHECKING
// ---------------------------------------------------------------------------

function isCaregiverOnLeave(caregiverName, isoDate, leavesData) {
    if (!caregiverName || !isoDate) return false;

    if (!isArray(leavesData)) {
        return false;
    }

    var caregiverNameNorm = normName(caregiverName);

    // Check each leave record for matching caregiver and date range
    for (var i = 0; i < leavesData.length; i++) {
        var leave = leavesData[i];
        if (!leave || !leave.fields) continue;

        var fields = leave.fields;
        var leaveCaregiver = safeGetValue(fields, 'Caregiver_Name.value', '');
        var leaveStatus = safeGetValue(fields, 'Leave_Status.value', '');
        var startDate = safeGetValue(fields, 'Start_Date.value', '');
        var endDate = safeGetValue(fields, 'End_Date.value', '');

        // Check if caregiver matches, leave is approved, and date falls within leave period
        if (caregiverNameNorm &&
            normName(leaveCaregiver) === caregiverNameNorm &&
            leaveStatus === "Approved" &&
            startDate && endDate &&
            startDate <= isoDate &&
            endDate >= isoDate) {
            return true;
        }
    }

    return false;
}

// ---------------------------------------------------------------------------
// STEP 8: CLIENT NAME RESOLUTION WITH MULTIPLE FALLBACK OPTIONS
// ---------------------------------------------------------------------------

function resolveClientName(clientData) {
    if (!clientData || !clientData.fields) {
        return '';
    }

    var fields = clientData.fields;

    // Try different client name fields in order of preference
    var clientNameFields = [
        'Client_Name.value',
        'Client_Full_Name.value'
    ];

    for (var i = 0; i < clientNameFields.length; i++) {
        var clientName = safeGetValue(fields, clientNameFields[i], '');
        if (clientName) {
            return normStr(clientName);
        }
    }

    // Fallback: combine first and last name
    var firstNameFields = ['Client_First_Name.value', 'First_Name.value'];
    var lastNameFields = ['Client_Last_Name.value', 'Last_Name.value'];

    var firstName = '';
    var lastName = '';

    for (var j = 0; j < firstNameFields.length; j++) {
        firstName = safeGetValue(fields, firstNameFields[j], '');
        if (firstName) break;
    }

    for (var k = 0; k < lastNameFields.length; k++) {
        lastName = safeGetValue(fields, lastNameFields[k], '');
        if (lastName) break;
    }

    return normStr(firstName + " " + lastName);
}

// ---------------------------------------------------------------------------
// STEP 9: CLIENT SCHEDULE EXTRACTION FROM API DATA
// ---------------------------------------------------------------------------

function getClientSchedulesFromAPI(clientId, clientSchedulesData) {
    var schedules = [];
    var schedulesList = (clientSchedulesData && clientSchedulesData.data) ? clientSchedulesData.data : [];

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function minutesToHHMM(mins) {
        mins = Math.max(0, Math.min(1439, mins | 0));
        var h = Math.floor(mins / 60);
        var m = mins % 60;
        function pad2(n) { return n < 10 ? '0' + n : '' + n; }
        return pad2(h) + ':' + pad2(m);
    }


    for (var i = 0; i < schedulesList.length; i++) {
        var scheduleItem = schedulesList[i];
        if (!scheduleItem || !scheduleItem.fields) continue;
        if (scheduleItem.refId !== clientId) continue;

        var dayName = normStr(safeGetValue(scheduleItem.fields, 'Day.value', ''));
        var startTimeStrRaw = normStr(safeGetValue(scheduleItem.fields, 'Schedule_Start_Time.value', ''));
        var endTimeStrRaw = normStr(safeGetValue(scheduleItem.fields, 'Schedule_End_Time.value', ''));

        var startTime = parseTime(startTimeStrRaw);
        var endTime = parseTime(endTimeStrRaw);

        // Accept 00:00 (0 mins). Skip only when parsing failed or invalid window.
        if (startTime === null || endTime === null) continue;

        if (startTime < endTime) {
            // Normal shift, same day
            schedules.push({
                day: dayName,
                startTime: startTime,
                endTime: endTime,
                startTimeStr: minutesToHHMM(startTime),
                endTimeStr: minutesToHHMM(endTime)
            });
        } else if (startTime > endTime) {
            // Overnight shift: split into two parts
            // Part 1: from startTime to midnight (23:59)
            schedules.push({
                day: dayName,
                startTime: startTime,
                endTime: 1440, // midnight
                startTimeStr: minutesToHHMM(startTime),
                endTimeStr: "24:00"
            });
            // Part 2: from midnight to endTime on the next day
            // You may want to handle the "next day" logic in downstream code
            schedules.push({
                day: getNextDayName(dayName),
                startTime: 0,
                endTime: endTime,
                startTimeStr: "00:00",
                endTimeStr: minutesToHHMM(endTime)
            });
        }
        // else if startTime == endTime, skip (zero-length)
    }

    return schedules;
}
function getNextDayName(dayName) {
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var idx = -1;
    for (var i = 0; i < days.length; i++) {
        if (days[i].toLowerCase() === dayName.toLowerCase()) {
            idx = i;
            break;
        }
    }
    if (idx === -1) return dayName;
    return days[(idx + 1) % 7];
}
// ---------------------------------------------------------------------------
// STEP 10: BUILD COMPREHENSIVE SCHEDULE STRUCTURE FOR ALL CLIENTS
// ---------------------------------------------------------------------------

function buildAllClientSchedules(allClientsData, clientSchedulesData, next7Days) {
    var allSchedules = {};

    // Initialize schedule structure for each day
    for (var d = 0; d < next7Days.length; d++) {
        var dayObj = next7Days[d];
        allSchedules[dayObj.iso] = {};
    }

    // Process client schedules data
    var schedulesList = clientSchedulesData.data || [];

    for (var i = 0; i < schedulesList.length; i++) {
        var scheduleItem = schedulesList[i];
        if (!scheduleItem || !scheduleItem.fields) continue;

        var clientId = scheduleItem.refId;
        // Normalize day and times to avoid whitespace/case issues
        var dayName = normStr(safeGetValue(scheduleItem.fields, 'Day.value', ''));
        var startTimeStr = normStr(safeGetValue(scheduleItem.fields, 'Schedule_Start_Time.value', ''));
        var endTimeStr = normStr(safeGetValue(scheduleItem.fields, 'Schedule_End_Time.value', ''));

        var startTime = parseTime(startTimeStr);
        var endTime = parseTime(endTimeStr);

        // Accept 00:00 (0 mins). Skip only when parsing failed or invalid window.
        if (startTime === null || endTime === null || startTime >= endTime) continue;

        // Find client name and job code id
        var clientName = '';
        var clientJobCodeId = '';
        for (var c = 0; c < allClientsData.length; c++) {
            var client = allClientsData[c];
            if (client && client.id === clientId) {
                clientName = safeGetValue(client.fields, 'Client_Full_Name.value', 'Unknown Client');
                clientJobCodeId = safeGetValue(client.fields, 'JobCode_Id.value', '');
                break;
            }
        }

        // Add schedule for matching days (case-insensitive)
        for (var d2 = 0; d2 < next7Days.length; d2++) {
            var dayObj = next7Days[d2];
            if (normStr(dayObj.day).toUpperCase() === normStr(dayName).toUpperCase()) {
                if (!allSchedules[dayObj.iso][clientId]) {
                    allSchedules[dayObj.iso][clientId] = [];
                }

                allSchedules[dayObj.iso][clientId].push({
                    clientName: clientName,
                    clientJobCodeId: clientJobCodeId,
                    startTime: startTime,
                    endTime: endTime,
                    startTimeStr: startTimeStr,
                    endTimeStr: endTimeStr,
                    day: dayName
                });
            }
        }
    }

    return allSchedules;
}


// ---------------------------------------------------------------------------
// STEP 11: SCHEDULE CONFLICT DETECTION SYSTEM
// ---------------------------------------------------------------------------

function checkScheduleConflicts(caregiverName, targetClientId, targetStartTime, targetEndTime, targetDate, allSchedules, assignedCaregiver) {
    var conflicts = [];
    var daySchedules = allSchedules[targetDate] || {};

    // Check conflicts with other clients on the same day
    for (var clientId in daySchedules) {
        if (daySchedules.hasOwnProperty(clientId) && clientId !== targetClientId) {
            var clientScheduleList = daySchedules[clientId];

            for (var i = 0; i < clientScheduleList.length; i++) {
                var otherSchedule = clientScheduleList[i];

                // Check if there's a time overlap and same caregiver
                if (timeOverlap(targetStartTime, targetEndTime, otherSchedule.startTime, otherSchedule.endTime)) {
                    var otherAssignmentKey = clientId + '_' + targetDate + '_' + otherSchedule.startTime;
                    var otherAssignedCaregiver = assignedCaregiver[otherAssignmentKey];

                    if (otherAssignedCaregiver === caregiverName) {
                        conflicts.push({
                            issueType: 'conflict', // New: classify as conflict
                            conflictType: 'time_overlap',
                            caregiverName: caregiverName,
                            conflictingClientId: clientId,
                            conflictingClientName: otherSchedule.clientName,
                            conflictingTimeSlot: otherSchedule.startTimeStr + ' - ' + otherSchedule.endTimeStr,
                            targetTimeSlot: minutesToHHMM(targetStartTime) + ' - ' + minutesToHHMM(targetEndTime),
                            date: targetDate
                        });
                    }
                }
            }
        }
    }

    return conflicts;
}

// ---------------------------------------------------------------------------
// STEP 12.5: ORDER CLIENTS - B2C FIRST, THEN B2B ("" treated as B2B)
// ---------------------------------------------------------------------------

function getClientType(rec) {
    var v = normStr(safeGetValue(rec, 'fields.Client_Type.value', ''));
    return v && v.toUpperCase() === 'B2C' ? 'B2C' : 'B2B';
}

var clientsToProcess = allClientsScheduleData.slice();
clientsToProcess.sort(function (a, b) {
    var ta = getClientType(a);
    var tb = getClientType(b);
    if (ta !== tb) return ta === 'B2C' ? -1 : 1; // B2C first
    // Stable secondary by name
    var na = normStr(safeGetValue(a, 'fields.Client_Full_Name.value', ''));
    var nb = normStr(safeGetValue(b, 'fields.Client_Full_Name.value', ''));
    return na.localeCompare(nb);
});
result.debug.clientTypeOrderPreview = clientsToProcess.map(function (c) {
    return { name: safeGetValue(c, 'fields.Client_Full_Name.value', ''), type: getClientType(c) };
});

// ---------------------------------------------------------------------------
// STEP 12: INITIALIZE PROCESSING - GET NEXT 7 DAYS AND BUILD GLOBAL DATA
// ---------------------------------------------------------------------------

// Get next 7 days
var next7Days = getNext7Days(currDate);
if (!next7Days || next7Days.length === 0) {
    result.error = "Failed to generate next 7 days";
    return result;
}

// Build all client schedules for conflict detection
var allClientSchedules = buildAllClientSchedules(allClientsScheduleData, clientSchedules, next7Days);

// Global tracking variables
var globalAssignedCaregivers = {}; // Track assignments across all clients for conflict detection
var globalCaregiverHours = computeCaregiverHours(actualSchedulingData, null); // Get hours for all caregivers across all clients

// Debug information
result.debug.next7DaysCount = next7Days.length;
result.debug.allClientsCount = allClientsScheduleData.length;
result.debug.totalScheduleItemsFromAPI = clientSchedules.data ? clientSchedules.data.length : 0;
result.debug.globalCaregiverHours = globalCaregiverHours;
result.debug.employeesDetailsCount = isArray(employeesDetails) ? employeesDetails.length : 0;

// ---------------------------------------------------------------------------
// STEP 13: MAIN PROCESSING LOOP - ITERATE THROUGH ALL CLIENTS
// ---------------------------------------------------------------------------

for (var clientIndex = 0; clientIndex < clientsToProcess.length; clientIndex++) {
    var clientData = clientsToProcess[clientIndex];
    if (!clientData || !clientData.fields) continue;


    // STEP 13.1: Resolve client information
    var clientName = resolveClientName(clientData);
    var clientNameNormalized = normName(clientName);
    var clientId = clientData.id || '';
    var clientType = getClientType(clientData);
    var jobCodeId = safeGetValue(clientData, 'fields.JobCode_Id.value', ''); // <-- added

    // STEP 13.2: Get primary caregiver (if set)
    var primaryCaregiverName = safeGetValue(clientData, 'fields.Primary_Caregiver.value', '');
    primaryCaregiverName = normStr(primaryCaregiverName);

    // STEP 13.3: Replace the existing call with the new function
    var primaryAvailableForClient = isPrimaryCaregiverAvailable(
        primaryCaregiverName,
        employeesDetails,
        leavesData,
        next7Days
    );

    // STEP 13.4: Get client-specific caregiver hours and build ranking
    var clientCaregiverHours = computeCaregiverHours(actualSchedulingData, clientNameNormalized);
    var caregiverRanking = buildCaregiverRanking(primaryCaregiverName, clientCaregiverHours);

    // If no caregivers found for this client, use global ranking
    if (caregiverRanking.length === 0) {
        caregiverRanking = buildCaregiverRanking('', globalCaregiverHours);
    }

    // STEP 13.5: Get client schedules from API
    var clientScheduleRows = getClientSchedulesFromAPI(clientId, clientSchedules);

    var clientScheduledServices = [];
    var clientConflicts = [];
    var clientAvailabilityIssues = [];
    var clientIssuesCombined = [];

    // ---------------------------------------------------------------------------
    // STEP 14: PROCESS EACH DAY AND SCHEDULE FOR CURRENT CLIENT
    // ---------------------------------------------------------------------------

    for (var dayIndex = 0; dayIndex < next7Days.length; dayIndex++) {
        var dayObj = next7Days[dayIndex];

        for (var scheduleIndex = 0; scheduleIndex < clientScheduleRows.length; scheduleIndex++) {
            var schedule = clientScheduleRows[scheduleIndex];

            // Match day of week
            if (schedule.day === dayObj.day) {
                // STEP 14.1: Initialize caregiver assignment variables
                var assignedCaregiver = "";
                var isAvailable = false;
                var conflictsFound = [];
                var availabilityIssues = [];
                var finalAvailabilityIssue = null;
                var primaryCaregiverChecked = false;

                // ---------------------------------------------------------------------------
                // STEP 15: CAREGIVER MATCHING FLOW WITH MANDATORY/OPTIONAL RULES
                // ---------------------------------------------------------------------------

                // 15.A Try Primary first (only check shift availability, leave, and conflicts)
                var triedPrimary = false;
                var triedPrimary = false;
                if (primaryCaregiverName && normStr(primaryCaregiverName) !== "") {
                    triedPrimary = true;
                    var primaryShiftAvailable = isCaregiverAvailableForSchedule(
                        primaryCaregiverName,
                        dayObj.day,
                        schedule.startTime,
                        schedule.endTime,
                        employeesDetails
                    );

                    if (!primaryShiftAvailable) {
                        availabilityIssues.push({
                            issueType: 'availability', // New
                            reason: 'Not Available by Employees',
                            caregiverName: primaryCaregiverName,
                            date: dayObj.iso,
                            clientId: clientId,
                            clientName: clientName,
                            timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr,
                            day: dayObj.day,
                            isPrimaryCaregiver: true
                        });
                        primaryCaregiverChecked = true;
                    } else if (isCaregiverOnLeave(primaryCaregiverName, dayObj.iso, leavesData)) {
                        availabilityIssues.push({
                            issueType: 'availability', // New
                            reason: 'On Leave',
                            caregiverName: primaryCaregiverName,
                            date: dayObj.iso,
                            clientId: clientId,
                            clientName: clientName,
                            timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr,
                            day: dayObj.day,
                            isPrimaryCaregiver: true
                        });
                        primaryCaregiverChecked = true;
                    } else {
                        var primaryConflicts = checkScheduleConflicts(
                            primaryCaregiverName,
                            clientId,
                            schedule.startTime,
                            schedule.endTime,
                            dayObj.iso,
                            allClientSchedules,
                            globalAssignedCaregivers
                        );
                        if (primaryConflicts.length === 0) {
                            assignedCaregiver = primaryCaregiverName;
                            isAvailable = true;
                            var assignmentKeyPrim = clientId + '_' + dayObj.iso + '_' + schedule.startTime;
                            globalAssignedCaregivers[assignmentKeyPrim] = primaryCaregiverName;
                            primaryCaregiverChecked = true;
                        } else {
                            conflictsFound = conflictsFound.concat(primaryConflicts);
                            availabilityIssues.push({
                                issueType: 'availability', // New
                                reason: 'Schedule Conflict',
                                caregiverName: primaryCaregiverName,
                                date: dayObj.iso,
                                clientId: clientId,
                                clientName: clientName,
                                timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr,
                                day: dayObj.day,
                                conflictDetails: primaryConflicts,
                                isPrimaryCaregiver: true
                            });
                            primaryCaregiverChecked = true;
                        }
                    }
                }

                // 15.B If primary not assigned, build candidate pool and apply rules
                if (!isAvailable) {
                    var prefs = extractClientPrefs(clientData);

                    // Build candidate names from all employees (exclude primary if set)
                    var allNames = getAllCaregiverNames(employeesDetails);
                    var excludeNorm = triedPrimary ? normName(primaryCaregiverName) : '';
                    var candidateNames = [];
                    for (var cn = 0; cn < allNames.length; cn++) {
                        if (!excludeNorm || normName(allNames[cn]) !== excludeNorm) {
                            candidateNames.push(allNames[cn]);
                        }
                    }

                    // Step 1: availability filter (employeesDetails + leaves)
                    var availableCandidates = [];
                    for (var ac = 0; ac < candidateNames.length; ac++) {
                        var cand = candidateNames[ac];

                        var shiftAvail = isCaregiverAvailableForSchedule(
                            cand,
                            dayObj.day,
                            schedule.startTime,
                            schedule.endTime,
                            employeesDetails
                        );
                        if (!shiftAvail) {
                            availabilityIssues.push({
                                issueType: 'availability', // New
                                reason: 'Not Available by Employees',
                                caregiverName: cand,
                                date: dayObj.iso,
                                clientId: clientId,
                                clientName: clientName,
                                timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr,
                                day: dayObj.day,
                                isPrimaryCaregiver: false
                            });
                            continue;
                        }
                        if (isCaregiverOnLeave(cand, dayObj.iso, leavesData)) {
                            availabilityIssues.push({
                                issueType: 'availability', // New
                                reason: 'On Leave',
                                caregiverName: cand,
                                date: dayObj.iso,
                                clientId: clientId,
                                clientName: clientName,
                                timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr,
                                day: dayObj.day,
                                isPrimaryCaregiver: false
                            });
                            continue;
                        }
                        availableCandidates.push(cand);
                    }

                    // Step 2: apply mandatory rules (Gender, Physical, Block List if values exist)
                    var mandatoryPass = [];
                    for (var mc = 0; mc < availableCandidates.length; mc++) {
                        var candName = availableCandidates[mc];
                        var empRec = getEmployeeRecordByName(candName, employeesDetails);
                        var profile = getCaregiverProfile(empRec);

                        // Caregiver Block List (mandatory if values exist)
                        if (prefs.blockList && prefs.blockList.length && isBlockedByClient(prefs, candName)) {
                            availabilityIssues.push({
                                issueType: 'availability', // New
                                reason: 'Blocked by Client',
                                caregiverName: candName,
                                date: dayObj.iso,
                                clientId: clientId,
                                clientName: clientName,
                                timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr,
                                day: dayObj.day,
                                isPrimaryCaregiver: false
                            });
                            continue;
                        }

                        var mres = passesMandatory(prefs, profile);
                        if (!mres.ok) {
                            availabilityIssues.push({
                                issueType: 'availability', // New
                                reason: mres.reason,
                                caregiverName: candName,
                                date: dayObj.iso,
                                clientId: clientId,
                                clientName: clientName,
                                timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr,
                                day: dayObj.day,
                                isPrimaryCaregiver: false
                            });
                            continue;
                        }

                        // Step 3+4: compute optional score and hours (client and global)
                        var optScore = scoreOptional(prefs, profile);
                        var clientHours = clientCaregiverHours[candName] || 0;
                        var globalHoursVal = globalCaregiverHours[candName] || 0;

                        mandatoryPass.push({
                            name: candName,
                            score: optScore,
                            clientHours: clientHours,
                            globalHours: globalHoursVal
                        });
                    }

                    // Sort mandatoryPass: optional score DESC, then clientHours DESC, then globalHours DESC, then name ASC
                    mandatoryPass.sort(function (a, b) {
                        if (b.score !== a.score) return b.score - a.score;
                        if (b.clientHours !== a.clientHours) return b.clientHours - a.clientHours;
                        if (b.globalHours !== a.globalHours) return b.globalHours - a.globalHours;
                        return a.name.localeCompare(b.name);
                    });

                    // Step 5: Try to assign best match without conflicts
                    for (var pick = 0; pick < mandatoryPass.length; pick++) {
                        var candidateName = mandatoryPass[pick].name;
                        var candConflicts = checkScheduleConflicts(
                            candidateName,
                            clientId,
                            schedule.startTime,
                            schedule.endTime,
                            dayObj.iso,
                            allClientSchedules,
                            globalAssignedCaregivers
                        );
                        if (candConflicts.length === 0) {
                            assignedCaregiver = candidateName;
                            isAvailable = true;
                            var assignmentKey = clientId + '_' + dayObj.iso + '_' + schedule.startTime;
                            globalAssignedCaregivers[assignmentKey] = candidateName;
                            break;
                        } else {
                            conflictsFound = conflictsFound.concat(candConflicts);
                            availabilityIssues.push({
                                issueType: 'availability', // New
                                reason: 'Schedule Conflict',
                                caregiverName: candidateName,
                                date: dayObj.iso,
                                clientId: clientId,
                                clientName: clientName,
                                timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr,
                                day: dayObj.day,
                                conflictDetails: candConflicts,
                                isPrimaryCaregiver: false
                            });
                        }
                    }

                    // Step 6: If still not assigned, do NOT break mandatory rules. Leave as open shift.
                }

                // ---------------------------------------------------------------------------
                // STEP 16: RECORD RESULTS FOR THIS SCHEDULE SLOT
                // ---------------------------------------------------------------------------

                // Track conflicts for this client
                if (conflictsFound.length > 0) {
                    clientConflicts = clientConflicts.concat(conflictsFound);
                }

                // Track availability issues - only if no caregiver was found
                if (!isAvailable && availabilityIssues.length > 0) {
                    clientAvailabilityIssues = clientAvailabilityIssues.concat(availabilityIssues);
                    finalAvailabilityIssue = 'no_caregiver_available';
                } else if (isAvailable && availabilityIssues.length > 0) {
                    finalAvailabilityIssue = 'partial_availability_issues';
                }

                if (conflictsFound && conflictsFound.length) {
                    for (var ci = 0; ci < conflictsFound.length; ci++) {
                        clientIssuesCombined.push(conflictsFound[ci]);
                        result.conflictsAndAvailabilityIssues.push(conflictsFound[ci]);
                    }
                }
                if (availabilityIssues && availabilityIssues.length) {
                    for (var ai = 0; ai < availabilityIssues.length; ai++) {
                        clientIssuesCombined.push(availabilityIssues[ai]);
                        result.conflictsAndAvailabilityIssues.push(availabilityIssues[ai]);
                    }
                }

                // Determine service details
                var serviceTime = schedule.startTimeStr + " - " + schedule.endTimeStr;

                // Calculate hours from schedule time window (minutes to hours)
                var requestedHours = (schedule.endTime - schedule.startTime) / 60;
                var clientRequestedHours = Math.round(requestedHours * 100) / 100; // Round to 2 decimals

                var finalCaregiverName = isAvailable ? assignedCaregiver : "Unassigned";
                var caregiverAvailabilityStatus = isAvailable ? "Available" : "Not Available";
                var shiftStatus = isAvailable ? "Scheduled" : "Open Shift";
                var isPrimaryAssigned = isAvailable && primaryCaregiverName &&
                    normName(assignedCaregiver) === normName(primaryCaregiverName);

                // Resolve caregiver QB_Id and Employee Id when assigned
                var finalCaregiverQBID = isAvailable ? getCaregiverQBID(assignedCaregiver, employeesDetails) : '';
                var finalCaregiverEmployeeId = isAvailable ? getCaregiverEmployeeId(assignedCaregiver, employeesDetails) : '';

                // Build the scheduled service object
                var serviceObj = {
                    clientId: clientId,
                    clientName: clientName || "Unknown Client",
                    jobCodeId: jobCodeId,
                    caregiverName: finalCaregiverName,
                    caregiverQBID: finalCaregiverQBID,
                    caregiverEmployeeId: finalCaregiverEmployeeId,
                    day: dayObj.day,
                    date: dayObj.iso,
                    serviceTime: serviceTime,
                    caregiverAvailability: caregiverAvailabilityStatus,
                    shiftStatus: shiftStatus,
                    conflictsCount: conflictsFound.length,
                    availabilityIssue: finalAvailabilityIssue,
                    caregiverIssuesEncountered: availabilityIssues.length,
                    isPrimaryCaregiver: isPrimaryAssigned,
                    primaryCaregiverChecked: primaryCaregiverChecked,
                    clientRequestedHours: clientRequestedHours // Always include client requested hours
                };

                // Only add caregiverScheduledHours when a caregiver is actually assigned
                if (isAvailable) {
                    serviceObj.caregiverScheduledHours = clientRequestedHours;
                }

                clientScheduledServices.push(serviceObj);

            }
        }
    }

    // ---------------------------------------------------------------------------
    // STEP 17: CALCULATE CLIENT SUMMARY STATISTICS
    // ---------------------------------------------------------------------------

    var clientSummary = {
        totalScheduledServices: clientScheduledServices.length,
        successfulAssignments: clientScheduledServices.filter(function (s) { return s.shiftStatus === "Scheduled"; }).length,
        openShifts: clientScheduledServices.filter(function (s) { return s.shiftStatus === "Open Shift"; }).length,
        totalConflicts: clientConflicts.length,
        totalAvailabilityIssues: clientAvailabilityIssues.length,
        primaryCaregiverAssignments: clientScheduledServices.filter(function (s) { return s.isPrimaryCaregiver === true; }).length,
        primaryCaregiverSuccessRate: primaryCaregiverName ?
            (clientScheduledServices.filter(function (s) { return s.isPrimaryCaregiver === true; }).length /
                Math.max(1, clientScheduledServices.filter(function (s) { return s.primaryCaregiverChecked === true; }).length) * 100).toFixed(1) + '%' : 'N/A'
    };

    // ---------------------------------------------------------------------------
    // STEP 18: ADD CLIENT DATA TO FINAL RESULT
    // ---------------------------------------------------------------------------

    result.allClientAssignments.push({
        clientId: clientId,
        clientName: clientName,
        jobCodeId: jobCodeId, // <-- added
        primaryCaregiverName: primaryCaregiverName,
        primaryAvailable: primaryAvailableForClient,
        caregiverRanking: caregiverRanking,
        clientCaregiverHours: clientCaregiverHours,
        scheduledServices: clientScheduledServices,
        // New: include combined issues per client
        conflictsAndAvailabilityIssues: {
            total: clientIssuesCombined.length,
            details: clientIssuesCombined
        },
        conflicts: {
            total: clientConflicts.length,
            details: clientConflicts
        },
        availabilityIssues: {
            total: clientAvailabilityIssues.length,
            details: clientAvailabilityIssues
        },
        summary: clientSummary
    });

    // Add to global totals
    result.conflicts.total += clientConflicts.length;
    result.conflicts.details = result.conflicts.details.concat(clientConflicts);
    result.availabilityIssues.total += clientAvailabilityIssues.length;
    result.availabilityIssues.details = result.availabilityIssues.details.concat(clientAvailabilityIssues);
    result.debug.combinedIssuesCount = result.conflictsAndAvailabilityIssues.length;
}

// ---------------------------------------------------------------------------
// STEP 19: CALCULATE GLOBAL SUMMARY AND STATISTICS
// ---------------------------------------------------------------------------

// Calculate global statistics
var totalScheduledServices = 0;
var totalSuccessfulAssignments = 0;
var totalOpenShifts = 0;
var totalPrimaryAssignments = 0;
var uniqueCaregiversUsed = {};

for (var c = 0; c < result.allClientAssignments.length; c++) {
    var clientAssignment = result.allClientAssignments[c];
    totalScheduledServices += clientAssignment.summary.totalScheduledServices;
    totalSuccessfulAssignments += clientAssignment.summary.successfulAssignments;
    totalOpenShifts += clientAssignment.summary.openShifts;
    totalPrimaryAssignments += clientAssignment.summary.primaryCaregiverAssignments;

    // Track unique caregivers
    for (var s = 0; s < clientAssignment.scheduledServices.length; s++) {
        var service = clientAssignment.scheduledServices[s];
        if (service.caregiverName && service.caregiverName !== "Unassigned") {
            uniqueCaregiversUsed[service.caregiverName] = true;
        }
    }
}

// Add global summary
result.globalSummary = {
    totalClients: result.allClientAssignments.length,
    totalScheduledServices: totalScheduledServices,
    totalSuccessfulAssignments: totalSuccessfulAssignments,
    totalOpenShifts: totalOpenShifts,
    totalConflicts: result.conflicts.total,
    totalAvailabilityIssues: result.availabilityIssues.total,
    uniqueCaregiversUsed: Object.keys(uniqueCaregiversUsed).length,
    caregiverNames: Object.keys(uniqueCaregiversUsed),
    totalPrimaryAssignments: totalPrimaryAssignments,
    globalSuccessRate: totalScheduledServices > 0 ?
        (totalSuccessfulAssignments / totalScheduledServices * 100).toFixed(1) + '%' : '0%',
    averageServicesPerClient: result.allClientAssignments.length > 0 ?
        (totalScheduledServices / result.allClientAssignments.length).toFixed(1) : '0'
};

// ---------------------------------------------------------------------------
// STEP 20: GENERATE CAREGIVER UTILIZATION REPORT AND FINAL DEBUG INFO
// ---------------------------------------------------------------------------

var caregiverUtilization = {};
for (var caregiverName in globalAssignedCaregivers) {
    if (globalAssignedCaregivers.hasOwnProperty(caregiverName)) {
        var assignedCaregiver = globalAssignedCaregivers[caregiverName];
        if (assignedCaregiver && assignedCaregiver !== "Unassigned") {
            caregiverUtilization[assignedCaregiver] = (caregiverUtilization[assignedCaregiver] || 0) + 1;
        }
    }
}

result.caregiverUtilization = caregiverUtilization;

// Enhanced debug information
result.debug.processedClients = result.allClientAssignments.length;
result.debug.globalAssignments = Object.keys(globalAssignedCaregivers).length;
result.debug.caregiverUtilization = caregiverUtilization;

return result;