// Working code without Dynamic Setting changes


var settingsrecords = input.settingsrecords || [];
var settingsTableData = input.settingsTableData || [];
var currDate = input.currDate;
var actualSchedulingData = input.actualSchedulingData;
var leavesData = input.leavesData || [];
var employeesDetails = input.employeesDetails || [];
var allClientsScheduleData = input.allClientsScheduleData || [];
var clientSchedules = input.clientSchedules || { data: [] };
var primaryAvailable = "No";

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
// Add this function early in the file, after initial variable declarations
function getScoringWeights() {
    // Default values in case settings are not provided
    var weights = {
        workHours: 40,
        language: 25,
        skills: 20,
        historical: 15
    };

    // Try to get values from settingsrecords
    if (isArray(settingsrecords) && settingsrecords.length > 0 && settingsrecords[0].fields) {
        var fields = settingsrecords[0].fields;

        // Extract values with fallbacks to defaults
        weights.workHours = safeParseNumber(
            safeGetValue(fields, 'Worked_Hours_.value', weights.workHours),
            weights.workHours);

        weights.language = safeParseNumber(
            safeGetValue(fields, 'Language_.value', weights.language),
            weights.language);

        weights.skills = safeParseNumber(
            safeGetValue(fields, 'Skills_.value', weights.skills),
            weights.skills);

        weights.historical = safeParseNumber(
            safeGetValue(fields, 'Client_History_.value', weights.historical),
            weights.historical);
    }

    // Add to debug output
    result.debug.scoringWeights = weights;

    return weights;
}

// Get the weights once at the start
var scoringWeights = getScoringWeights();

// ---------------------------------------------------------------------------
// STEP 5.2: NEW SCORING SYSTEM AND HARD CONSTRAINTS
// ---------------------------------------------------------------------------
// New scoring system: 40% hours, 25% language, 20% skills, 15% historical
function calculateCaregiverScore(caregiverName, clientData, clientCaregiverHours, employeesDetails, actualSchedulingData) {
    var scores = {
        totalScore: 0,
        workHoursScore: 0,        // dynamically weighted
        languageScore: 0,         // dynamically weighted
        skillsScore: 0,           // dynamically weighted
        historicalScore: 0,       // dynamically weighted
        components: {},
        sumOfComponents: 0        // Add this to show the sum of all components
    };

    var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
    if (!empRecord || !empRecord.fields) return scores;

    var clientPrefs = extractClientPrefs(clientData);
    var caregiverProfile = getCaregiverProfile(empRecord);

    // 1. Total work hours with client
    var maxHours = 0;
    for (var cg in clientCaregiverHours) {
        if (clientCaregiverHours.hasOwnProperty(cg)) {
            maxHours = Math.max(maxHours, clientCaregiverHours[cg] || 0);
        }
    }
    var cgHours = clientCaregiverHours[caregiverName] || 0;
    var hoursScore = maxHours > 0 ? (cgHours / maxHours) * scoringWeights.workHours : 0;
    scores.workHoursScore = hoursScore;
    scores.components.workHours = {
        cgHours: cgHours,
        maxHours: maxHours,
        weight: scoringWeights.workHours,
        scoreValue: hoursScore
    };

    // 2. Language proficiency match
    var langScore = 0;
    if (clientPrefs.langs && clientPrefs.langs.length > 0) {
        var matchCount = 0;
        var hasEnglish = false;
        if (caregiverProfile.langs.indexOf('english') !== -1) {
            hasEnglish = true;
            matchCount++;
        }
        for (var i = 0; i < clientPrefs.langs.length; i++) {
            var lang = clientPrefs.langs[i];
            if (lang !== 'english' && caregiverProfile.langs.indexOf(lang) !== -1) {
                matchCount++;
            }
        }
        var langMatchRatio = clientPrefs.langs.length > 0 ? matchCount / clientPrefs.langs.length : 0;
        // Adjust English weight to 60% of language score
        var englishWeight = scoringWeights.language * 0.6;
        var otherLangWeight = scoringWeights.language * 0.4;
        langScore = hasEnglish ? (englishWeight + langMatchRatio * otherLangWeight) : (langMatchRatio * scoringWeights.language);
    } else {
        langScore = caregiverProfile.langs.indexOf('english') !== -1 ? scoringWeights.language : 0;
    }
    scores.languageScore = langScore;
    scores.components.language = {
        clientPrefs: clientPrefs.langs,
        caregiverLangs: caregiverProfile.langs,
        hasEnglish: caregiverProfile.langs.indexOf('english') !== -1,
        weight: scoringWeights.language,
        scoreValue: langScore
    };

    // 3. Skills compatibility
    var skillScore = 0;
    if (clientPrefs.skills && clientPrefs.skills.length > 0) {
        var skillMatches = 0;
        for (var j = 0; j < clientPrefs.skills.length; j++) {
            if (caregiverProfile.skills.indexOf(clientPrefs.skills[j]) !== -1) {
                skillMatches++;
            }
        }
        skillScore = clientPrefs.skills.length > 0 ?
            (skillMatches / clientPrefs.skills.length) * scoringWeights.skills : 0;
    }
    scores.skillsScore = skillScore;
    scores.components.skills = {
        clientPrefs: clientPrefs.skills,
        caregiverSkills: caregiverProfile.skills,
        weight: scoringWeights.skills,
        scoreValue: skillScore
    };

    // 4. Historical relationship
    var hasHistoricalRelation = false;
    if (isArray(actualSchedulingData)) {
        var clientNameNorm = normName(safeGetValue(clientData, 'fields.Client_Full_Name.value', ''));
        var caregiverNameNorm = normName(caregiverName);

        for (var k = 0; k < actualSchedulingData.length; k++) {
            var record = actualSchedulingData[k];
            if (!record || !record.fields) continue;

            var recordClientName = safeGetValue(record.fields, 'Client_Name.value', '');
            var recordCaregiverName = safeGetValue(record.fields, 'Actual_Caregiver.value', '');
            var status = safeGetValue(record.fields, 'Scheduling_Status.value', '');

            if (normName(recordClientName) === clientNameNorm &&
                normName(recordCaregiverName) === caregiverNameNorm &&
                status === 'Completed') {
                hasHistoricalRelation = true;
                break;
            }
        }
    }
    var historicalScore = hasHistoricalRelation ? scoringWeights.historical : 0;
    scores.historicalScore = historicalScore;
    scores.components.historical = {
        hasHistory: hasHistoricalRelation,
        weight: scoringWeights.historical,
        scoreValue: historicalScore
    };

    // Calculate total and sum of components
    scores.totalScore = hoursScore + langScore + skillScore + historicalScore;
    scores.sumOfComponents = hoursScore + langScore + skillScore + historicalScore;

    return scores;
}

function validateHardConstraints(caregiverName, clientData, employeesDetails) {
    var r = { passes: true, reasons: [] };
    var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
    if (!empRecord || !empRecord.fields) { r.passes = false; r.reasons.push('caregiver_not_found'); return r; }
    var clientFields = clientData.fields || {}; var empFields = empRecord.fields || {};

    // Gender preference check (unchanged)
    var genderPref = safeGetValue(clientFields, 'Gender_Preference.value', '');
    var isStrict = normStr(safeGetValue(clientFields, 'Gender_Preference_Strict.value', '')).toLowerCase() === 'yes';
    if (genderPref && isStrict) {
        var caregiverGender = safeGetValue(empFields, 'Gender.value', '');
        if (normStr(genderPref).toLowerCase() !== normStr(caregiverGender).toLowerCase()) {
            r.passes = false;
            r.reasons.push('gender_mismatch_strict');
        }
    }

    // Weight Class check - replaces Physical_Capability_lbs check
    var clientWeightClass = normStr(safeGetValue(clientFields, 'Weight_Class.value', ''));
    // Only enforce weight class matching if client has a value specified
    if (clientWeightClass) {
        var caregiverWeightClass = normStr(safeGetValue(empFields, 'Weight_Class.value', ''));
        if (!caregiverWeightClass || caregiverWeightClass.toLowerCase() !== clientWeightClass.toLowerCase()) {
            r.passes = false;
            r.reasons.push('weight_class_mismatch');
        }
    }

    // Block list check (unchanged)
    var blockList = parseList(safeGetValue(clientFields, 'Caregiver_Block_List.value', ''));
    if (blockList.indexOf(normName(caregiverName)) !== -1) {
        r.passes = false;
        r.reasons.push('blocked_by_client');
    }

    return r;
}

function hasWorkedLastWeek(caregiverName, clientName, actualSchedulingData) {
    if (!isArray(actualSchedulingData)) return false;
    var caregiverNameNorm = normName(caregiverName); var clientNameNorm = normName(clientName);
    for (var i = 0; i < actualSchedulingData.length; i++) {
        var rec = actualSchedulingData[i]; if (!rec || !rec.fields) continue;
        var recClientName = safeGetValue(rec.fields, 'Client_Name.value', '');
        var recCaregiver = safeGetValue(rec.fields, 'Actual_Caregiver.value', '');
        var status = safeGetValue(rec.fields, 'Scheduling_Status.value', '');
        if (normName(recClientName) === clientNameNorm && normName(recCaregiver) === caregiverNameNorm && status === 'Completed') return true;
    }
    return false;
}
function getAvailableCaregivers(clientData, dayObj, schedule, employeesDetails,
    leavesData, allClientSchedules, globalAssignedCaregivers,
    clientCaregiverHours, actualSchedulingData, alreadyAssignedCaregiverName) {

    var list = [];
    var clientName = safeGetValue(clientData, 'fields.Client_Full_Name.value', '');
    var clientId = clientData.id;
    var allEmployees = getAllCaregiverNames(employeesDetails);

    for (var i = 0; i < allEmployees.length; i++) {
        var caregiverName = allEmployees[i];

        // Skip if this is the already assigned caregiver
        if (alreadyAssignedCaregiverName &&
            normName(caregiverName) === normName(alreadyAssignedCaregiverName)) {
            continue;
        }

        // Rest of the function remains unchanged
        if (!isCaregiverAvailableForSchedule(caregiverName, dayObj.day,
            schedule.startTime, schedule.endTime, employeesDetails)) continue;

        if (isCaregiverOnLeave(caregiverName, dayObj.iso, leavesData)) continue;

        var conflicts = checkScheduleConflicts(caregiverName, clientId,
            schedule.startTime, schedule.endTime, dayObj.iso,
            allClientSchedules, globalAssignedCaregivers);

        if (conflicts.length > 0) continue;

        var hard = validateHardConstraints(caregiverName, clientData, employeesDetails);
        if (!hard.passes) continue;

        var score = calculateCaregiverScore(caregiverName, clientData,
            clientCaregiverHours, employeesDetails, actualSchedulingData);

        var workedLastWeek = hasWorkedLastWeek(caregiverName, clientName, actualSchedulingData);

        var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
        var empFields = empRecord ? empRecord.fields : {};

        list.push({
            name: caregiverName,
            score: score.totalScore,
            scoreDetails: score,
            workedLastWeek: workedLastWeek,
            qbId: getCaregiverQBID(caregiverName, employeesDetails),
            employeeId: getCaregiverEmployeeId(caregiverName, employeesDetails),
            languages: empRecord ? parseList(safeGetValue(empFields, 'Language.value', '')) : [],
            hasEnglish: empRecord ? (parseList(safeGetValue(empFields, 'Language.value', '')).indexOf('english') !== -1) : false,
            clientHours: clientCaregiverHours[caregiverName] || 0,
            skills: empRecord ? parseList(safeGetValue(empFields, 'Experience.value', '')) : []
        });
    }

    // Same sorting logic
    list.sort(function (a, b) {
        if (a.workedLastWeek !== b.workedLastWeek) return a.workedLastWeek ? -1 : 1;
        if (Math.abs(b.score - a.score) > 0.01) return b.score - a.score;
        if (a.hasEnglish !== b.hasEnglish) return a.hasEnglish ? -1 : 1;
        if (b.clientHours !== a.clientHours) return b.clientHours - a.clientHours;
        return a.name.localeCompare(b.name);
    });

    return list;
}
function assignCaregiverToSchedule(clientData, dayObj, schedule, employeesDetails,
    leavesData, allClientSchedules, globalAssignedCaregivers,
    clientCaregiverHours, globalCaregiverHours, actualSchedulingData) {
    var res = { assignedCaregiver: '', isAvailable: false, conflictsFound: [], availabilityIssues: [], finalAvailabilityIssue: null, primaryCaregiverChecked: false, availableCaregiversList: [], assignedCaregiverScore: null };
    var clientId = clientData.id; var clientName = safeGetValue(clientData, 'fields.Client_Full_Name.value', '');
    var primaryCaregiverName = normStr(safeGetValue(clientData, 'fields.Primary_Caregiver.value', ''));
    // P1: last week caregivers
    var lastWeekCaregivers = [];
    if (isArray(actualSchedulingData)) {
        var clientNameNorm = normName(clientName);
        for (var i = 0; i < actualSchedulingData.length; i++) {
            var record = actualSchedulingData[i]; if (!record || !record.fields) continue;
            var recordClientName = safeGetValue(record.fields, 'Client_Name.value', '');
            var recordCaregiverName = safeGetValue(record.fields, 'Actual_Caregiver.value', '');
            var status = safeGetValue(record.fields, 'Scheduling_Status.value', '');
            if (normName(recordClientName) === clientNameNorm && recordCaregiverName && status === 'Completed') {
                lastWeekCaregivers.push(normStr(recordCaregiverName));
            }
        }
    }
    var seen = {}; var uniqueLastWeekCaregivers = [];
    for (var j = 0; j < lastWeekCaregivers.length; j++) { var cg = lastWeekCaregivers[j]; if (!seen[cg]) { uniqueLastWeekCaregivers.push(cg); seen[cg] = true; } }
    for (var k = 0; k < uniqueLastWeekCaregivers.length; k++) {
        var lastWeekCg = uniqueLastWeekCaregivers[k];
        if (!isCaregiverAvailableForSchedule(lastWeekCg, dayObj.day, schedule.startTime, schedule.endTime, employeesDetails)) { res.availabilityIssues.push({ issueType: 'availability', reason: 'Not Available by Employees', caregiverName: lastWeekCg, date: dayObj.iso, clientId: clientId, clientName: clientName, timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr, day: dayObj.day, isPrimaryCaregiver: (normName(lastWeekCg) === normName(primaryCaregiverName)) }); continue; }
        if (isCaregiverOnLeave(lastWeekCg, dayObj.iso, leavesData)) { res.availabilityIssues.push({ issueType: 'availability', reason: 'On Leave', caregiverName: lastWeekCg, date: dayObj.iso, clientId: clientId, clientName: clientName, timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr, day: dayObj.day, isPrimaryCaregiver: (normName(lastWeekCg) === normName(primaryCaregiverName)) }); continue; }
        var conflicts = checkScheduleConflicts(lastWeekCg, clientId, schedule.startTime, schedule.endTime, dayObj.iso, allClientSchedules, globalAssignedCaregivers);
        if (conflicts.length > 0) { res.conflictsFound = res.conflictsFound.concat(conflicts); res.availabilityIssues.push({ issueType: 'availability', reason: 'Schedule Conflict', caregiverName: lastWeekCg, date: dayObj.iso, clientId: clientId, clientName: clientName, timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr, day: dayObj.day, conflictDetails: conflicts, isPrimaryCaregiver: (normName(lastWeekCg) === normName(primaryCaregiverName)) }); continue; }
        var hardConstraints = validateHardConstraints(lastWeekCg, clientData, employeesDetails);
        if (!hardConstraints.passes) { res.availabilityIssues.push({ issueType: 'availability', reason: hardConstraints.reasons.join(', '), caregiverName: lastWeekCg, date: dayObj.iso, clientId: clientId, clientName: clientName, timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr, day: dayObj.day, isPrimaryCaregiver: (normName(lastWeekCg) === normName(primaryCaregiverName)) }); continue; }

        // Add score for assigned caregiver
        var score = calculateCaregiverScore(lastWeekCg, clientData, clientCaregiverHours, employeesDetails, actualSchedulingData);
        res.assignedCaregiverScore = score;

        res.assignedCaregiver = lastWeekCg;
        res.isAvailable = true;
        var assignmentKey = clientId + '_' + dayObj.iso + '_' + schedule.startTime;
        globalAssignedCaregivers[assignmentKey] = lastWeekCg;
        if (normName(lastWeekCg) === normName(primaryCaregiverName)) res.primaryCaregiverChecked = true;
        return res;
    }
    if (primaryCaregiverName && !res.primaryCaregiverChecked) {
        res.primaryCaregiverChecked = true;
        var primaryAvailable = isCaregiverAvailableForSchedule(primaryCaregiverName, dayObj.day, schedule.startTime, schedule.endTime, employeesDetails);
        if (!primaryAvailable) { res.availabilityIssues.push({ issueType: 'availability', reason: 'Not Available by Employees', caregiverName: primaryCaregiverName, date: dayObj.iso, clientId: clientId, clientName: clientName, timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr, day: dayObj.day, isPrimaryCaregiver: true }); }
        else if (isCaregiverOnLeave(primaryCaregiverName, dayObj.iso, leavesData)) { res.availabilityIssues.push({ issueType: 'availability', reason: 'On Leave', caregiverName: primaryCaregiverName, date: dayObj.iso, clientId: clientId, clientName: clientName, timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr, day: dayObj.day, isPrimaryCaregiver: true }); }
        else {
            var primaryConflicts = checkScheduleConflicts(primaryCaregiverName, clientId, schedule.startTime, schedule.endTime, dayObj.iso, allClientSchedules, globalAssignedCaregivers);
            if (primaryConflicts.length === 0) {
                var primaryHard = validateHardConstraints(primaryCaregiverName, clientData, employeesDetails);
                if (primaryHard.passes) {
                    // Add score for primary caregiver
                    var primaryScore = calculateCaregiverScore(primaryCaregiverName, clientData, clientCaregiverHours, employeesDetails, actualSchedulingData);
                    res.assignedCaregiverScore = primaryScore;

                    res.assignedCaregiver = primaryCaregiverName;
                    res.isAvailable = true;
                    var assignmentKeyPrim = clientId + '_' + dayObj.iso + '_' + schedule.startTime;
                    globalAssignedCaregivers[assignmentKeyPrim] = primaryCaregiverName;
                    return res;
                } else {
                    res.availabilityIssues.push({ issueType: 'availability', reason: primaryHard.reasons.join(', '), caregiverName: primaryCaregiverName, date: dayObj.iso, clientId: clientId, clientName: clientName, timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr, day: dayObj.day, isPrimaryCaregiver: true });
                }
            } else {
                res.conflictsFound = res.conflictsFound.concat(primaryConflicts);
                res.availabilityIssues.push({ issueType: 'availability', reason: 'Schedule Conflict', caregiverName: primaryCaregiverName, date: dayObj.iso, clientId: clientId, clientName: clientName, timeSlot: schedule.startTimeStr + ' - ' + schedule.endTimeStr, day: dayObj.day, conflictDetails: primaryConflicts, isPrimaryCaregiver: true });
            }
        }
    }
    var availableCgs = getAvailableCaregivers(clientData, dayObj, schedule,
        employeesDetails, leavesData, allClientSchedules, globalAssignedCaregivers,
        clientCaregiverHours, actualSchedulingData, res.assignedCaregiver);
    res.availableCaregiversList = availableCgs.slice(0, 10);
    if (availableCgs.length > 0) {
        res.assignedCaregiver = availableCgs[0].name;
        res.isAvailable = true;
        // Add score for assigned caregiver from available list
        res.assignedCaregiverScore = availableCgs[0].scoreDetails;
        var assignmentKey2 = clientId + '_' + dayObj.iso + '_' + schedule.startTime;
        globalAssignedCaregivers[assignmentKey2] = availableCgs[0].name;
    } else {
        res.finalAvailabilityIssue = 'no_caregiver_available';
    }
    return res;
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

    // Pass 1: Approved schedules - consider Expected_Caregiver when Actual_Caregiver is empty
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
        if (status !== "Approved" && status !== "Completed") continue;

        var caregiverName = safeGetValue(fields, 'Actual_Caregiver.value', '');
        // If no Actual_Caregiver, use Expected_Caregiver
        if (!caregiverName) {
            caregiverName = safeGetValue(fields, 'Expected_Caregiver.value', '');
        }

        var actualHours = safeParseNumber(safeGetValue(fields, 'Actual_Hours.value', 0));
        if (actualHours === 0) {
            actualHours = safeParseNumber(safeGetValue(fields, 'Expected_Hours.value', 0));
        }

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
            if (!caregiverName2) {
                caregiverName2 = safeGetValue(fields2, 'Expected_Caregiver.value', '');
            }

            var actualHours2 = safeParseNumber(safeGetValue(fields2, 'Actual_Hours.value', 0));
            if (actualHours2 === 0) {
                actualHours2 = safeParseNumber(safeGetValue(fields2, 'Expected_Hours.value', 0));
            }

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
        var leaveCaregiver = safeGetValue(fields, 'Caregiver.value', '');
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
        if (startTime >= endTime) continue; // overnight not handled here

        schedules.push({
            day: dayName,
            startTime: startTime,
            endTime: endTime,
            // Normalize to HH:mm to satisfy downstream validators/APIs
            startTimeStr: minutesToHHMM(startTime),
            endTimeStr: minutesToHHMM(endTime)
        });
    }

    return schedules;
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
    // Check for both new and old values for backward compatibility
    return (v && (v.toUpperCase() === 'PRIVATE' || v.toUpperCase() === 'Private')) ? 'Private' : 'Facility';
}

var clientsToProcess = allClientsScheduleData.slice();
clientsToProcess.sort(function (a, b) {
    var ta = getClientType(a);
    var tb = getClientType(b);
    if (ta !== tb) return ta === 'Private' ? -1 : 1; // Private clients first
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
                // STEP 14.1: Assign caregiver using new logic
                var assignmentResult = assignCaregiverToSchedule(
                    clientData,
                    dayObj,
                    schedule,
                    employeesDetails,
                    leavesData,
                    allClientSchedules,
                    globalAssignedCaregivers,
                    clientCaregiverHours,
                    globalCaregiverHours,
                    actualSchedulingData
                );

                // STEP 14.2: Record results for this schedule slot
                var assignedCaregiver = assignmentResult.assignedCaregiver;
                var isAvailable = assignmentResult.isAvailable;
                var conflictsFound = assignmentResult.conflictsFound;
                var availabilityIssues = assignmentResult.availabilityIssues;
                var finalAvailabilityIssue = assignmentResult.finalAvailabilityIssue;
                var primaryCaregiverChecked = assignmentResult.primaryCaregiverChecked;
                var availableCaregiversList = assignmentResult.availableCaregiversList;

                // Track conflicts for this client
                if (conflictsFound.length > 0) {
                    clientConflicts = clientConflicts.concat(conflictsFound);
                }

                // Track availability issues - only if no caregiver was found
                if (!isAvailable && availabilityIssues.length > 0) {
                    clientAvailabilityIssues = clientAvailabilityIssues.concat(availabilityIssues);
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
                    clientRequestedHours: clientRequestedHours, // Always include client requested hours
                    availableCaregiversList: availableCaregiversList, // Include available caregivers
                    caregiverScore: assignmentResult.assignedCaregiverScore // Add the caregiver score
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