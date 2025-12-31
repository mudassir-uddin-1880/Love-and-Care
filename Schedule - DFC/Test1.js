var settingsrecords = input.settingsrecords || [];
var settingsTableData = input.settingsTableData || [];
var currDate = input.currDate;
var actualSchedulingData = input.actualSchedulingData;
var leavesData = input.leavesData || [];
var employeesDetails = input.employeesDetails || [];
var allClientsScheduleData = input.allClientsScheduleData || [];
var clientSchedules = input.clientSchedules || { data: [] };
var clientLeaves = input.clientLeaves || { data: [] };

var result = {
  debug: { inputCurrDate: currDate },
  conflicts: { total: 0, details: [] },
  availabilityIssues: { total: 0, details: [] },
  conflictsAndAvailabilityIssues: [],
  allClientAssignments: [],
  globalSummary: {},
  caregiverUtilization: {}
};

var globalCaregiverTimeSlots = {};
var ghostShifts = [];

// ---------------------------------------------------------------------------
// UTILITY FUNCTIONS
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
  if (typeof value === 'number' && !isNaN(value)) return value;
  var parsed = parseFloat(value);
  return isNaN(parsed) ? (defaultValue || 0) : parsed;
}

function parseList(v) {
  var s = normStr(v);
  if (!s) return [];
  return s.split(/[,;/\n]+/).map(function (x) { return normStr(x).toLowerCase(); }).filter(Boolean);
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

function minutesToHHMM(mins) {
  mins = Math.max(0, Math.min(1439, mins | 0));
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  return pad2(h) + ':' + pad2(m);
}

// ---------------------------------------------------------------------------
// NEW VALIDATION FUNCTIONS
// ---------------------------------------------------------------------------

function isClientSubscriptionValid(clientData, scheduleDate) {
  if (!clientData || !clientData.fields || !scheduleDate) return true;

  var effectiveFrom = safeGetValue(clientData.fields, 'Effective_From.value', '');
  var effectiveTo = safeGetValue(clientData.fields, 'Effective_To.value', '');

  // If no subscription dates are set, assume valid
  if (!effectiveFrom && !effectiveTo) return true;

  // Validate date format YYYY-MM-DD
  var datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (effectiveFrom && !datePattern.test(effectiveFrom)) return true;
  if (effectiveTo && !datePattern.test(effectiveTo)) return true;

  // Check if schedule date falls within subscription period
  if (effectiveFrom && scheduleDate < effectiveFrom) return false;
  if (effectiveTo && scheduleDate > effectiveTo) return false;

  return true;
}


// Updated isClientOnLeave — now accepts clientId and clientName (to support matching by id OR name)
function isClientOnLeave(clientId, scheduleDate, scheduleStartTime, scheduleEndTime, clientLeaves) {
  if (!clientId || !scheduleDate || !clientLeaves) return false;

  // Handle both array and object with data property
  var leavesArray = Array.isArray(clientLeaves) ? clientLeaves : (clientLeaves.data || []);

  for (var i = 0; i < leavesArray.length; i++) {
    var leave = leavesArray[i];
    if (!leave || !leave.fields) continue;

    var leaveClientId = safeGetValue(leave.fields, 'Client_Name.value', '');
    var leaveStartDate = safeGetValue(leave.fields, 'Start_Date.value', '');
    var leaveEndDate = safeGetValue(leave.fields, 'End_Date.value', '');
    var leaveStartTime = safeGetValue(leave.fields, 'Start_Time.value', '');
    var leaveEndTime = safeGetValue(leave.fields, 'End_Time.value', '');
    var leaveStatus = safeGetValue(leave.fields, 'Leave_Status.value', '');

    // Debugging: Log leave details for verification
    result.debug = result.debug || {};
    result.debug.leaveCheckDetails = result.debug.leaveCheckDetails || [];
    result.debug.leaveCheckDetails.push({
      leaveClientId: leaveClientId,
      leaveStartDate: leaveStartDate,
      leaveEndDate: leaveEndDate,
      leaveStartTime: leaveStartTime,
      leaveEndTime: leaveEndTime,
      leaveStatus: leaveStatus,
      scheduleDate: scheduleDate,
      scheduleStartTime: scheduleStartTime,
      scheduleEndTime: scheduleEndTime,
      matched: leaveClientId === clientId && leaveStatus === "Approved"
    });

    // Match client ID and ensure leave is approved
    if (leaveClientId !== clientId || leaveStatus !== "Approved") continue;

    // Check if the schedule date falls within the leave date range
    if (scheduleDate < leaveStartDate || scheduleDate > leaveEndDate) continue;

    // If leave times are specified, check for time overlap
    if (scheduleStartTime !== undefined && scheduleEndTime !== undefined &&
      leaveStartTime && leaveEndTime) {
      var leaveStartMin = parseTime(leaveStartTime);
      var leaveEndMin = parseTime(leaveEndTime);

      if (leaveStartMin !== null && leaveEndMin !== null) {
        if (timeOverlap(scheduleStartTime, scheduleEndTime, leaveStartMin, leaveEndMin)) {
          return true;
        }
      } else {
        // If leave times can't be parsed, assume full-day leave
        return true;
      }
    } else {
      // No time specified, assume full-day leave
      return true;
    }
  }

  return false;
}


// ---------------------------------------------------------------------------
// INPUT VALIDATION
// ---------------------------------------------------------------------------

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

var validationErrors = validateInputs();
if (validationErrors.length > 0) {
  result.error = 'Input validation failed: ' + validationErrors.join(', ');
  return result;
}

// ---------------------------------------------------------------------------
// DATE UTILITIES
// ---------------------------------------------------------------------------

function getNext7Days(inputDate) {
  var days = [];
  function zero2(n) { return n < 10 ? ('0' + n) : ('' + n); }
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var WEEK_START = 1;

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

  var currDow = getDayOfWeek(y, m, d);
  var daysToWeekStart = (WEEK_START - currDow + 7) % 7;
  if (daysToWeekStart === 0) daysToWeekStart = 7;

  for (var i = 0; i < 7; i++) {
    var yy = y;
    var mm = m;
    var dd = d + daysToWeekStart + i;

    while (dd > daysInMonth(yy, mm)) {
      dd -= daysInMonth(yy, mm);
      mm += 1;
      if (mm > 12) { mm = 1; yy += 1; }
    }

    var iso = yy + '-' + zero2(mm) + '-' + zero2(dd);
    var dayName = DAY_NAMES[getDayOfWeek(yy, mm, dd)];

    days.push({ date: iso, day: dayName, iso: iso });

    if (i === 0) result.debug.nextWeekStartIso = iso;
  }

  result.debug.daysGenerated = days.length;
  result.debug.next7DaysPreview = days.map(function (day) {
    return day.iso + ' ' + day.day;
  });

  return days;
}

// ---------------------------------------------------------------------------
// EMPLOYEE AND SETTINGS FUNCTIONS
// ---------------------------------------------------------------------------

function dayToKey(dayName) {
  var d = normStr(dayName).toUpperCase();
  var map = {
    'SUNDAY': 'SUNDAY', 'MONDAY': 'MONDAY', 'TUESDAY': 'TUESDAY',
    'WEDNESDAY': 'WEDNESDAY', 'THURSDAY': 'THURSDAY',
    'FRIDAY': 'FRIDAY', 'SATURDAY': 'SATURDAY'
  };
  return map[d] || d;
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

function isEligibleGhostCaregiver(caregiverName, employeesDetails) {
  if (!caregiverName || !isArray(employeesDetails)) return false;
  var caregiverNameNorm = normName(caregiverName);

  for (var i = 0; i < employeesDetails.length; i++) {
    var emp = employeesDetails[i];
    if (!emp || !emp.fields) continue;

    var isEmergencyAvailable = normStr(safeGetValue(emp.fields, 'LastMinute_Ready_Ghost_Pool_.value', '')).toLowerCase() === 'yes';
    var empName = safeGetValue(emp.fields, 'Employee_Full_Name.value', '');

    if (isEmergencyAvailable && normName(empName) === caregiverNameNorm) {
      return true;
    }
  }
  return false;
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

function isCaregiverAvailable(caregiverName, targetClientId, targetDate, targetStartTime, targetEndTime) {
  if (isGhostCaregiverForDate(caregiverName, targetDate, ghostShifts || [])) return false;
  // FIX: Check if caregiver is eligible for ghost shifts and exclude them from regular schedules
  // if (isEligibleGhostCaregiver(caregiverName, employeesDetails)) return false;
  if (!caregiverName || !targetDate) return true;

  if (globalCaregiverTimeSlots[caregiverName]) {
    var assignments = globalCaregiverTimeSlots[caregiverName];

    for (var i = 0; i < assignments.length; i++) {
      var assignment = assignments[i];
      if (assignment.clientId === targetClientId) continue;

      if (assignment.date === targetDate) {
        if (timeOverlap(targetStartTime, targetEndTime, assignment.startTime, assignment.endTime)) {
          result.debug = result.debug || {};
          result.debug.conflictDetections = result.debug.conflictDetections || [];
          result.debug.conflictDetections.push({
            caregiverName: caregiverName,
            targetClientId: targetClientId,
            targetDate: targetDate,
            targetTime: targetStartTime + '-' + targetEndTime,
            conflictClientId: assignment.clientId,
            conflictTime: assignment.startTime + '-' + assignment.endTime,
            reason: 'time_overlap'
          });
          return false;
        }
      }
    }
  }
  return true;
}

function getEmployeeRecordByName(caregiverName, employeesDetails) {
  if (!caregiverName || !isArray(employeesDetails)) return null;
  var target = normName(caregiverName);
  for (var i = 0; i < employeesDetails.length; i++) {
    var rec = employeesDetails[i];
    var name = safeGetValue(rec, 'fields.Employee_Full_Name.value', '');
    if (name && normName(name) === target) return rec;
  }
  return null;
}

function getCaregiverQBID(caregiverName, employeesDetails) {
  var emp = getEmployeeRecordByName(caregiverName, employeesDetails);
  if (!emp || !emp.fields) {
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

  var candidates = [
    'QB_Id.value', 'QB_ID.value', 'QB ID.value', 'QBID.value',
    'QuickBooks_Id.value', 'QuickBooks_ID.value', 'QuickBooks ID.value'
  ];
  for (var i = 0; i < candidates.length; i++) {
    var v = safeGetValue(emp.fields, candidates[i], '');
    if (v) return String(v);
  }
  var fallback = safeGetValue(emp.fields, 'QB_Id', '');
  return fallback ? String(fallback) : '';
}

function getCaregiverEmployeeId(caregiverName, employeesDetails) {
  var emp = getEmployeeRecordByName(caregiverName, employeesDetails);
  return (emp && emp.id) ? String(emp.id) : '';
}

function getAllCaregiverNames(employeesDetails) {
  var names = [];
  if (!isArray(employeesDetails)) return names;
  for (var i = 0; i < employeesDetails.length; i++) {
    var emp = employeesDetails[i];
    var name = safeGetValue(emp, 'fields.Employee_Full_Name.value', '');
    if (name) names.push(normStr(name));
  }
  return names;
}

function getScoringWeights() {
  var weights = { workHours: 40, language: 25, skills: 20, historical: 15 };

  if (isArray(settingsrecords) && settingsrecords.length > 0 && settingsrecords[0].fields) {
    var fields = settingsrecords[0].fields;
    weights.workHours = safeParseNumber(safeGetValue(fields, 'Worked_Hours_.value', weights.workHours), weights.workHours);
    weights.language = safeParseNumber(safeGetValue(fields, 'Language_.value', weights.language), weights.language);
    weights.skills = safeParseNumber(safeGetValue(fields, 'Skills_.value', weights.skills), weights.skills);
    weights.historical = safeParseNumber(safeGetValue(fields, 'Client_History_.value', weights.historical), weights.historical);
  }

  result.debug.scoringWeights = weights;
  return weights;
}

var scoringWeights = getScoringWeights();

var HISTORICAL_LOOKBACK_DAYS = safeParseNumber(
  safeGetValue((settingsrecords[0] && settingsrecords[0].fields) || {}, 'Historical_Lookback_Days.value', 30), 30
);

// ---------------------------------------------------------------------------
// LEAVE AND CONFLICT CHECKING
// ---------------------------------------------------------------------------

function isCaregiverOnLeave(caregiverName, isoDate, leavesData, scheduleStartTime, scheduleEndTime) {
  if (!caregiverName || !isoDate || !isArray(leavesData)) return false;

  var caregiverNameNorm = normName(caregiverName);

  for (var i = 0; i < leavesData.length; i++) {
    var leave = leavesData[i];
    if (!leave || !leave.fields) continue;

    var fields = leave.fields;
    var leaveCaregiver = safeGetValue(fields, 'Caregiver.value', '');
    var leaveStatus = safeGetValue(fields, 'Leave_Status.value', '');
    var leaveDate = safeGetValue(fields, 'Start_Date.value', '');
    var leaveStartTime = safeGetValue(fields, 'Start_Time.value', '');
    var leaveEndTime = safeGetValue(fields, 'End_Time.value', '');

    if (!leaveCaregiver || !leaveDate || leaveStatus !== "Approved") continue;
    if (normName(leaveCaregiver) !== caregiverNameNorm || leaveDate !== isoDate) continue;

    if (scheduleStartTime !== undefined && scheduleEndTime !== undefined && leaveStartTime && leaveEndTime) {
      var leaveStartMin = parseTime(leaveStartTime);
      var leaveEndMin = parseTime(leaveEndTime);

      if (leaveStartMin !== null && leaveEndMin !== null) {
        var hasTimeOverlap = timeOverlap(scheduleStartTime, scheduleEndTime, leaveStartMin, leaveEndMin);

        result.debug = result.debug || {};
        result.debug.leaveBlockingInfo = result.debug.leaveBlockingInfo || [];
        result.debug.leaveBlockingInfo.push({
          caregiver: caregiverName,
          date: isoDate,
          leaveDate: leaveDate,
          leaveStartTime: leaveStartTime,
          leaveEndTime: leaveEndTime,
          scheduleStartTime: scheduleStartTime,
          scheduleEndTime: scheduleEndTime,
          leaveType: safeGetValue(fields, 'Leave_Type.value', ''),
          timeOverlap: hasTimeOverlap,
          blocked: hasTimeOverlap
        });

        return hasTimeOverlap;
      }
    }

    result.debug = result.debug || {};
    result.debug.leaveBlockingInfo = result.debug.leaveBlockingInfo || [];
    result.debug.leaveBlockingInfo.push({
      caregiver: caregiverName,
      date: isoDate,
      leaveDate: leaveDate,
      leaveStartTime: leaveStartTime || 'not_specified',
      leaveEndTime: leaveEndTime || 'not_specified',
      leaveType: safeGetValue(fields, 'Leave_Type.value', ''),
      fullDayLeave: true,
      blocked: true
    });

    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// PRIORITY SETTINGS
// ---------------------------------------------------------------------------

function getPrioritySettings(settingsTableData) {
  var result = { order: [], active: {}, mandatory: {} };

  if (!settingsTableData || !settingsTableData.data || !isArray(settingsTableData.data)) return result;

  var seen = {};

  for (var i = 0; i < settingsTableData.data.length; i++) {
    var row = settingsTableData.data[i];
    if (!row || !row.fields) continue;

    var fields = row.fields;
    var description = safeGetValue(fields, 'Description.value', '');
    var isMandatory = safeGetValue(fields, 'Is_Mandatory_.value', '');
    var status = safeGetValue(fields, 'Status.value', '');

    var normalizedName = normStr(description);
    if (!normalizedName || seen[normalizedName]) continue;
    seen[normalizedName] = true;

    result.order.push(normalizedName);
    result.active[normalizedName] = normStr(status).toLowerCase() === 'active';
    result.mandatory[normalizedName] = normStr(isMandatory).toLowerCase() === 'yes';
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLIENT PREFERENCE FUNCTIONS
// ---------------------------------------------------------------------------

function extractClientPrefs(clientData) {
  if (!clientData || !clientData.fields) return {};
  var fields = clientData.fields;
  return {
    genderPref: normStr(safeGetValue(fields, 'Gender_Preference.value', '')),
    genderPrefNorm: normStr(safeGetValue(fields, 'Gender_Preference.value', '')).toLowerCase(),
    physReq: safeParseNumber(safeGetValue(fields, 'Physical_Capability_lbs.value', 0), 0),
    langs: parseList(safeGetValue(fields, 'Language_Preferences.value', '')),
    skills: parseList(safeGetValue(fields, 'Skills_Preferences.value', '')),
    personality: parseList(safeGetValue(fields, 'Personality_Match.value', '')),
    blockList: parseList(safeGetValue(fields, 'Caregiver_Block_List.value', ''))
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

function scoreOptional(prefs, profile) {
  if (!prefs || !profile) return 0;
  var score = 0;

  if (profile.langs.indexOf('english') !== -1) score += 5;

  if (prefs.langs.length) {
    for (var i = 0; i < profile.langs.length; i++) {
      if (prefs.langs.indexOf(profile.langs[i]) !== -1) score += 2;
    }
  }

  if (prefs.skills.length) {
    for (var j = 0; j < profile.skills.length; j++) {
      if (prefs.skills.indexOf(profile.skills[j]) !== -1) score += 1;
    }
  }

  if (prefs.personality.length) {
    for (var k = 0; k < profile.personality.length; k++) {
      if (prefs.personality.indexOf(profile.personality[k]) !== -1) score += 1;
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// HISTORICAL AND SCORING FUNCTIONS
// ---------------------------------------------------------------------------

function getHistoricalCount(caregiverName, clientName, actualSchedulingData, lookbackDays) {
  if (!caregiverName || !clientName || !isArray(actualSchedulingData)) return 0;
  var now = currDate;
  if (!now) return 0;

  var cutoff;
  (function calcCutoff() {
    var p = now.split('-');
    var y = +p[0], m = +p[1], d = +p[2];
    d -= lookbackDays;
    while (d < 1) {
      m -= 1;
      if (m < 1) { m = 12; y -= 1; }
      var dim = new Date(y, m, 0).getDate();
      d += dim;
    }
    function z(n) { return n < 10 ? '0' + n : '' + n; }
    cutoff = y + '-' + z(m) + '-' + z(d);
  })();

  var cgNorm = normName(caregiverName);
  var clientNorm = normName(clientName);
  var count = 0;
  for (var i = 0; i < actualSchedulingData.length; i++) {
    var rec = actualSchedulingData[i];
    if (!rec || !rec.fields) continue;
    var f = rec.fields;
    if (normName(safeGetValue(f, 'Actual_Caregiver.value', '')) !== cgNorm) continue;
    if (normName(safeGetValue(f, 'Client_Name.value', '')) !== clientNorm) continue;
    var status = safeGetValue(f, 'Scheduling_Status.value', '');
    if (status !== 'Approved' && status !== 'Completed') continue;
    var sDate = safeGetValue(f, 'Schedule_Start_Date.value', '');
    if (!sDate) continue;
    if (sDate >= cutoff && sDate <= currDate) count++;
  }
  return count;
}

function calculateTotalScore(debugReasons) {
  var total = 0;
  if (!debugReasons || !isArray(debugReasons)) return total;

  for (var i = 0; i < debugReasons.length; i++) {
    var reason = debugReasons[i];
    if (reason && typeof reason.scoreAdjustment === 'number') {
      total += reason.scoreAdjustment;
    }
  }
  return total;
}


// ---------------------------------------------------------------------------
// WEEKLY HOURS DISTRIBUTION
// ---------------------------------------------------------------------------

function weeklyDistributionCheck(employeeData, candidateShiftHours, settingsSnapshot, debugFlag) {
  var result = { allowed: true, wouldExceedMax: false, projectedHours: 0, scoreAdjustment: 0 };

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
  var currentWeeklyHours = 0;

  for (var assignmentKey in globalAssignedCaregivers) {
    if (globalAssignedCaregivers.hasOwnProperty(assignmentKey)) {
      var assignedCaregiver = globalAssignedCaregivers[assignmentKey];
      if (normName(assignedCaregiver) === employeeNameNorm) {
        var keyParts = assignmentKey.split('_');
        if (keyParts.length >= 3) {
          var clientId = keyParts[0];
          var date = keyParts[1];
          var startTime = parseInt(keyParts[2], 10);

          var shiftHours = 2;
          if (allClientSchedules[date] && allClientSchedules[date][clientId]) {
            var clientSchedules = allClientSchedules[date][clientId];
            for (var i = 0; i < clientSchedules.length; i++) {
              var schedule = clientSchedules[i];
              if (schedule.startTime === startTime) {
                shiftHours = (schedule.endTime - schedule.startTime) / 60;
                break;
              }
            }
          }
          currentWeeklyHours += shiftHours;
        }
      }
    }
  }

  result.projectedHours = currentWeeklyHours + candidateShiftHours;

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
    result.reason = 'Weekly hours check passed. Current: ' + currentWeeklyHours +
      ', Candidate: ' + candidateShiftHours + ', Projected: ' + result.projectedHours +
      ', Target: ' + targetWeeklyHours + ', Max: ' + maxWeeklyHours +
      ', ScoreBoost: ' + result.scoreAdjustment;
  }

  return result;
}

// ---------------------------------------------------------------------------
// PRIORITY EVALUATION FUNCTIONS
// ---------------------------------------------------------------------------

function getLastWeekCaregiver(clientData, actualSchedulingData) {
  if (!clientData || !isArray(actualSchedulingData)) return null;

  var clientName = safeGetValue(clientData, 'fields.Client_Full_Name.value', '');
  var clientNameNorm = normName(clientName);

  function parseISODate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    var parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return { year: y, month: m, day: d };
  }

  function dateToISO(dateObj) {
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    return dateObj.year + '-' + pad2(dateObj.month) + '-' + pad2(dateObj.day);
  }

  function addDays(dateObj, days) {
    var result = { year: dateObj.year, month: dateObj.month, day: dateObj.day + days };

    function isLeap(year) {
      return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    }

    function daysInMonth(year, month) {
      var monthDays = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return monthDays[month - 1];
    }

    while (result.day <= 0) {
      result.month--;
      if (result.month <= 0) { result.month = 12; result.year--; }
      result.day += daysInMonth(result.year, result.month);
    }

    while (result.day > daysInMonth(result.year, result.month)) {
      result.day -= daysInMonth(result.year, result.month);
      result.month++;
      if (result.month > 12) { result.month = 1; result.year++; }
    }

    return result;
  }

  var todayObj = parseISODate(currDate);
  if (!todayObj) return null;

  var lastWeekStart = addDays(todayObj, -14);
  var lastWeekEnd = addDays(todayObj, -7);
  var lastWeekStartISO = dateToISO(lastWeekStart);
  var lastWeekEndISO = dateToISO(lastWeekEnd);

  result.debug = result.debug || {};
  result.debug.lastWeekDateCalculation = {
    currDate: currDate,
    lastWeekStartISO: lastWeekStartISO,
    lastWeekEndISO: lastWeekEndISO
  };

  for (var i = 0; i < actualSchedulingData.length; i++) {
    var record = actualSchedulingData[i];
    if (!record || !record.fields) continue;

    var fields = record.fields;
    var recordClientName = safeGetValue(fields, 'Client_Name.value', '');
    var status = safeGetValue(fields, 'Scheduling_Status.value', '');
    var caregiverName = safeGetValue(fields, 'Actual_Caregiver.value', '');
    var scheduleDate = safeGetValue(fields, 'Schedule_Start_Date.value', '');

    if (status === 'Completed' && normName(recordClientName) === clientNameNorm &&
      caregiverName && scheduleDate >= lastWeekStartISO && scheduleDate <= lastWeekEndISO) {
      return caregiverName;
    }
  }
  return null;
}

function calculateClientSpecificHours(caregiverName, clientData, actualSchedulingData) {
  if (!caregiverName || !clientData || !isArray(actualSchedulingData)) return 0;

  var clientName = safeGetValue(clientData, 'fields.Client_Full_Name.value', '');
  var clientNameNorm = normName(clientName);
  var caregiverNameNorm = normName(caregiverName);
  var totalHours = 0;

  for (var i = 0; i < actualSchedulingData.length; i++) {
    var record = actualSchedulingData[i];
    if (!record || !record.fields) continue;

    var fields = record.fields;
    var recordClientName = safeGetValue(fields, 'Client_Name.value', '');
    var recordCaregiverName = safeGetValue(fields, 'Actual_Caregiver.value', '');
    var status = safeGetValue(fields, 'Scheduling_Status.value', '');
    var hours = safeParseNumber(safeGetValue(fields, 'Actual_Hours.value', 0), 0);

    if ((status === 'Completed' || status === 'Approved') &&
      normName(recordClientName) === clientNameNorm &&
      normName(recordCaregiverName) === caregiverNameNorm) {
      totalHours += hours;
    }
  }
  return totalHours;
}

function isFacilityClient(clientData) {
  if (!clientData || !clientData.fields) return false;
  var clientType = safeGetValue(clientData.fields, 'Client_Type.value', '');
  var facilityName = safeGetValue(clientData.fields, 'Facility_Name.value', '');
  return normStr(clientType).toLowerCase() === 'facility' || normStr(facilityName) !== '';
}

function checkGenderPreference(caregiverName, clientData, employeesDetails, isMandatory) {
  var clientFields = clientData.fields || {};
  var genderPref = safeGetValue(clientFields, 'Gender_Preference.value', '');
  var isStrict = normStr(safeGetValue(clientFields, 'Gender_Preference_Strict.value', '')).toLowerCase() === 'yes';

  if (!genderPref) return { passes: true, reason: 'no_gender_preference', scoreBoost: 0 };

  var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
  if (!empRecord || !empRecord.fields) {
    return { passes: false, reason: 'employee_not_found', scoreBoost: 0 };
  }

  var caregiverGender = safeGetValue(empRecord.fields, 'Gender.value', '');
  var genderMatch = normStr(genderPref).toLowerCase() === normStr(caregiverGender).toLowerCase();
  var shouldEnforce = isMandatory || isStrict;

  return {
    passes: shouldEnforce ? genderMatch : true,
    reason: genderMatch ? 'gender_match' : 'gender_mismatch',
    scoreBoost: genderMatch ? 5 : 0
  };
}

function checkLanguagePreference(caregiverName, clientData, employeesDetails, isMandatory) {
  var clientFields = clientData.fields || {};
  var requiredLangs = parseList(safeGetValue(clientFields, 'Language_Preferences.value', ''));

  if (requiredLangs.length === 0) return { passes: true, reason: 'no_language_preference', scoreBoost: 0, matchCount: 0, totalRequired: 0 };

  var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
  if (!empRecord || !empRecord.fields) {
    return { passes: false, reason: 'employee_not_found', scoreBoost: 0, matchCount: 0, totalRequired: requiredLangs.length };
  }

  var caregiverLangs = parseList(safeGetValue(empRecord.fields, 'Language.value', ''));
  var matchCount = 0;
  var hasEnglish = caregiverLangs.indexOf('english') !== -1;

  for (var i = 0; i < requiredLangs.length; i++) {
    if (caregiverLangs.indexOf(requiredLangs[i]) !== -1) matchCount++;
  }

  var allMatch = matchCount === requiredLangs.length;
  var scoreBoost = hasEnglish ? 5 : 0;
  scoreBoost += matchCount * 2;

  return {
    passes: isMandatory ? allMatch : true,
    reason: allMatch ? 'all_languages_match' : 'partial_language_match',
    scoreBoost: scoreBoost,
    matchCount: matchCount,
    totalRequired: requiredLangs.length
  };
}

function checkPhysicalCapability(caregiverName, clientData, employeesDetails, isMandatory) {
  var clientFields = clientData.fields || {};
  var clientWeightClass = normStr(safeGetValue(clientFields, 'Weight_Class.value', ''));

  if (!clientWeightClass) return { passes: true, reason: 'no_weight_class_requirement', scoreBoost: 0 };

  var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
  if (!empRecord || !empRecord.fields) {
    return { passes: false, reason: 'employee_not_found', scoreBoost: 0 };
  }

  var caregiverWeightClass = normStr(safeGetValue(empRecord.fields, 'Weight_Class.value', ''));
  var weightClassMatch = clientWeightClass.toLowerCase() === caregiverWeightClass.toLowerCase();

  return {
    passes: isMandatory ? weightClassMatch : true,
    reason: weightClassMatch ? 'weight_class_match' : 'weight_class_mismatch',
    scoreBoost: weightClassMatch ? 3 : 0
  };
}

function checkSkillsRequirement(caregiverName, clientData, employeesDetails, isMandatory) {
  var clientFields = clientData.fields || {};
  var requiredSkills = parseList(safeGetValue(clientFields, 'Skills_Preferences.value', ''));

  if (requiredSkills.length === 0) return { passes: true, reason: 'no_skills_requirement', scoreBoost: 0, matchCount: 0, totalRequired: 0 };

  var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
  if (!empRecord || !empRecord.fields) {
    return { passes: false, reason: 'employee_not_found', scoreBoost: 0, matchCount: 0, totalRequired: requiredSkills.length };
  }

  var caregiverSkills = parseList(safeGetValue(empRecord.fields, 'Experience.value', ''));
  var matchCount = 0;

  for (var i = 0; i < requiredSkills.length; i++) {
    if (caregiverSkills.indexOf(requiredSkills[i]) !== -1) matchCount++;
  }

  var allMatch = matchCount === requiredSkills.length;
  var scoreBoost = matchCount * 1;

  return {
    passes: isMandatory ? allMatch : true,
    reason: allMatch ? 'all_skills_match' : 'partial_skills_match',
    scoreBoost: scoreBoost,
    matchCount: matchCount,
    totalRequired: requiredSkills.length
  };
}

function checkPersonalityMatch(caregiverName, clientData, employeesDetails, isMandatory) {
  var clientFields = clientData.fields || {};
  var requiredPersonality = parseList(safeGetValue(clientFields, 'Personality_Match.value', ''));

  if (requiredPersonality.length === 0) return { passes: true, reason: 'no_personality_preference', scoreBoost: 0, matchCount: 0 };

  var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
  if (!empRecord || !empRecord.fields) {
    return { passes: false, reason: 'employee_not_found', scoreBoost: 0, matchCount: 0 };
  }

  var caregiverPersonality = parseList(safeGetValue(empRecord.fields, 'Personality_Match.value', ''));
  var matchCount = 0;

  for (var i = 0; i < requiredPersonality.length; i++) {
    if (caregiverPersonality.indexOf(requiredPersonality[i]) !== -1) matchCount++;
  }

  var hasMatch = matchCount > 0;
  var scoreBoost = matchCount * 1;

  return {
    passes: isMandatory ? hasMatch : true,
    reason: hasMatch ? 'personality_match' : 'personality_mismatch',
    scoreBoost: scoreBoost,
    matchCount: matchCount
  };
}

function checkBlocklistStatus(caregiverName, clientData) {
  var clientFields = clientData.fields || {};
  var blockList = parseList(safeGetValue(clientFields, 'Caregiver_Block_List.value', ''));

  if (blockList.length === 0) return { passes: true, reason: 'no_blocklist' };

  var caregiverNameNorm = normName(caregiverName);
  var isBlocked = false;

  for (var i = 0; i < blockList.length; i++) {
    if (blockList[i] === caregiverNameNorm) {
      isBlocked = true;
      break;
    }
  }

  return {
    passes: !isBlocked,
    reason: isBlocked ? 'caregiver_blocked' : 'caregiver_not_blocked'
  };
}

function checkCaregiverAvailability(caregiverName, employeesDetails) {
  var empRecord = getEmployeeRecordByName(caregiverName, employeesDetails);
  if (!empRecord || !empRecord.fields) {
    return { passes: false, reason: 'employee_not_found', scoreBoost: 0 };
  }
  return { passes: true, reason: 'caregiver_available', scoreBoost: 0 };
}

// ---------------------------------------------------------------------------
// PRIORITY EVALUATION MAIN FUNCTION
// ---------------------------------------------------------------------------

function evaluateCandidateWithPriorities(candidateName, employeeData, candidateShiftHours, settings, clientData, debugReasons, isPrimary) {
  var allowed = true;
  var optionalScoreAdjustment = 0;

  var isFacility = isFacilityClient(clientData);
  var lastWeekCaregiver = getLastWeekCaregiver(clientData, actualSchedulingData);
  var isLastWeekCaregiver = lastWeekCaregiver && normName(lastWeekCaregiver) === normName(candidateName);

  for (var i = 0; i < settings.order.length; i++) {
    var priorityName = settings.order[i];

    if (!settings.active[priorityName]) continue;

    var isMandatory = settings.mandatory[priorityName];
    var debugEntry = {
      priority: priorityName,
      allowed: true,
      scoreAdjustment: 0,
      reason: ''
    };

    if (priorityName === "Last Week Caregiver" || priorityName === "Last Week Caregivers") {
      debugEntry.allowed = true;
      debugEntry.scoreAdjustment = isLastWeekCaregiver ? 10 : 0;
      debugEntry.reason = isLastWeekCaregiver ? 'worked_last_week' : 'did_not_work_last_week';
      optionalScoreAdjustment += debugEntry.scoreAdjustment;
    }
    else if (priorityName === "Caregiver Availability") {
      var availabilityResult = checkCaregiverAvailability(candidateName, employeesDetails);
      debugEntry.allowed = true;
      debugEntry.scoreAdjustment = availabilityResult.scoreBoost || 0;
      debugEntry.reason = availabilityResult.reason || 'availability_checked';
      optionalScoreAdjustment += debugEntry.scoreAdjustment;
    }
    else if (priorityName === "Client Gender Preference" || priorityName === "Gender Preference") {
      var genderResult = checkGenderPreference(candidateName, clientData, employeesDetails, isMandatory);
      debugEntry.allowed = genderResult.passes;
      debugEntry.scoreAdjustment = genderResult.scoreBoost || 0;
      debugEntry.reason = genderResult.reason || 'gender_checked';

      var clientFields = clientData.fields || {};
      var hasStrictGenderReq = normStr(safeGetValue(clientFields, 'Gender_Preference_Strict.value', '')).toLowerCase() === 'yes';

      if ((isMandatory || hasStrictGenderReq) && !genderResult.passes) {
        allowed = false;
        debugReasons.push(debugEntry);
        return false;
      }

      if (!isMandatory || genderResult.passes) {
        optionalScoreAdjustment += debugEntry.scoreAdjustment;
      }
    }
    else if (priorityName === "Client Language Preference" || priorityName === "Language Preference") {
      var langResult = checkLanguagePreference(candidateName, clientData, employeesDetails, isMandatory);
      debugEntry.allowed = langResult.passes;
      debugEntry.scoreAdjustment = langResult.scoreBoost || 0;
      debugEntry.reason = langResult.reason + ' (' + (langResult.matchCount || 0) + '/' + (langResult.totalRequired || 0) + ')';

      var clientFields = clientData.fields || {};
      var hasLangReq = parseList(safeGetValue(clientFields, 'Language_Preferences.value', '')).length > 0;

      if (isMandatory && hasLangReq && !langResult.passes) {
        allowed = false;
        debugReasons.push(debugEntry);
        return false;
      }

      optionalScoreAdjustment += debugEntry.scoreAdjustment;
    }
    else if (priorityName === "Caregiver Physical Capability" || priorityName === "Physical Capability") {
      var physResult = checkPhysicalCapability(candidateName, clientData, employeesDetails, isMandatory);
      debugEntry.allowed = physResult.passes;
      debugEntry.scoreAdjustment = physResult.scoreBoost || 0;
      debugEntry.reason = physResult.reason || 'physical_capability_checked';

      var clientFields = clientData.fields || {};
      var hasPhysicalReq = safeParseNumber(safeGetValue(clientFields, 'Physical_Capability_lbs.value', 0), 0) > 0 ||
        normStr(safeGetValue(clientFields, 'Weight_Class.value', '')) !== '';

      if ((isMandatory || hasPhysicalReq) && !physResult.passes) {
        allowed = false;
        debugReasons.push(debugEntry);
        return false;
      }

      optionalScoreAdjustment += debugEntry.scoreAdjustment;
    }
    else if (priorityName === "Caregiver Skills" || priorityName === "Skills") {
      var skillsResult = checkSkillsRequirement(candidateName, clientData, employeesDetails, isMandatory);
      debugEntry.allowed = skillsResult.passes;
      debugEntry.scoreAdjustment = skillsResult.scoreBoost || 0;
      debugEntry.reason = skillsResult.reason + ' (' + (skillsResult.matchCount || 0) + '/' + (skillsResult.totalRequired || 0) + ')';

      var clientFields = clientData.fields || {};
      var hasSkillReq = parseList(safeGetValue(clientFields, 'Skills_Preferences.value', '')).length > 0;

      if (isMandatory && hasSkillReq && !skillsResult.passes) {
        allowed = false;
        debugReasons.push(debugEntry);
        return false;
      }

      optionalScoreAdjustment += debugEntry.scoreAdjustment;
    }
    else if (priorityName === "Personality Match" || priorityName === "Personality") {
      var personalityResult = checkPersonalityMatch(candidateName, clientData, employeesDetails, isMandatory);
      debugEntry.allowed = true;
      debugEntry.scoreAdjustment = personalityResult.scoreBoost || 0;
      debugEntry.reason = personalityResult.reason + ' (matches: ' + (personalityResult.matchCount || 0) + ')';
      optionalScoreAdjustment += debugEntry.scoreAdjustment;
    }
    else if (priorityName === "Blocklisted Caregivers") {
      var blockResult = checkBlocklistStatus(candidateName, clientData);
      debugEntry.allowed = blockResult.passes;
      debugEntry.scoreAdjustment = 0;
      debugEntry.reason = blockResult.reason || 'blocklist_checked';

      if (!blockResult.passes) {
        allowed = false;
        debugReasons.push(debugEntry);
        return false;
      }
    }
    else if (priorityName === "Max Service Hours with Client" || priorityName === "Max Service Hours with Client (based on selected days)" || priorityName === "Client Service Hours") {
      var clientHours = calculateClientSpecificHours(candidateName, clientData, actualSchedulingData);
      var scoreBoost = Math.min(clientHours * 0.5, 15);

      debugEntry.allowed = true;
      debugEntry.scoreAdjustment = scoreBoost;
      debugEntry.reason = 'client_hours: ' + clientHours + ', score_boost: ' + scoreBoost;
      optionalScoreAdjustment += debugEntry.scoreAdjustment;
    }
    else if (priorityName === "Facility Clients Priority" || priorityName === "Facility Priority") {
      var facilityBoost = isFacility ? 8 : 0;
      debugEntry.allowed = true;
      debugEntry.scoreAdjustment = facilityBoost;
      debugEntry.reason = isFacility ? 'facility_client_priority' : 'non_facility_client';
      optionalScoreAdjustment += debugEntry.scoreAdjustment;
    }
    else if (priorityName === "Weekly Min/Max Hours Compliance") {
      var weeklyResult = weeklyDistributionCheck(employeeData, candidateShiftHours, settings, true);

      debugEntry.allowed = weeklyResult.allowed;
      debugEntry.scoreAdjustment = weeklyResult.scoreAdjustment || 0;
      debugEntry.reason = weeklyResult.reason || 'weekly_hours_checked';

      if (weeklyResult.wouldExceedMax) {
        allowed = false;
        debugReasons.push(debugEntry);
        return false;
      }

      optionalScoreAdjustment += weeklyResult.scoreAdjustment;
    }
    else {
      debugEntry.allowed = true;
      debugEntry.scoreAdjustment = 0;
      debugEntry.reason = 'priority_not_implemented: ' + priorityName;
    }

    debugReasons.push(debugEntry);
  }

  return allowed;
}

// ---------------------------------------------------------------------------
// CONFLICT CHECKING
// ---------------------------------------------------------------------------

function checkScheduleConflicts(caregiverName, targetClientId, targetStartTime, targetEndTime, targetDate, allSchedules, globalAssignedCaregivers) {
  var conflicts = [];

  if (!isCaregiverAvailable(caregiverName, targetClientId, targetDate, targetStartTime, targetEndTime)) {
    if (globalCaregiverTimeSlots[caregiverName]) {
      var assignments = globalCaregiverTimeSlots[caregiverName];

      for (var i = 0; i < assignments.length; i++) {
        var assignment = assignments[i];

        if (assignment.clientId === targetClientId) continue;

        if (assignment.date === targetDate &&
          timeOverlap(targetStartTime, targetEndTime, assignment.startTime, assignment.endTime)) {

          conflicts.push({
            caregiverName: caregiverName,
            conflictType: 'time_overlap',
            date: targetDate,
            existingClient: assignment.clientId,
            existingTime: assignment.startTime + '-' + assignment.endTime,
            targetTime: targetStartTime + '-' + targetEndTime
          });
        }
      }
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// GHOST SHIFTS FUNCTIONALITY
// ---------------------------------------------------------------------------

function isGhostCaregiverForDate(caregiverName, date, ghostShifts) {
  if (!caregiverName || !date || !ghostShifts || !ghostShifts.length) return false;

  var caregiverNameNorm = normName(caregiverName);

  for (var i = 0; i < ghostShifts.length; i++) {
    var shift = ghostShifts[i];
    // FIX: Use normalized name comparison for reliability
    if (shift.date === date && normName(shift.caregiverName) === caregiverNameNorm) {
      return true;
    }
  }
  return false;
}

function getEligibleGhostCaregivers(employeesDetails) {
  var eligible = [];

  if (!isArray(employeesDetails)) return eligible;

  for (var i = 0; i < employeesDetails.length; i++) {
    var emp = employeesDetails[i];
    if (!emp || !emp.fields) continue;

    var isEmergencyAvailable = normStr(safeGetValue(emp.fields, 'LastMinute_Ready_Ghost_Pool_.value', '')).toLowerCase() === 'yes';

    if (isEmergencyAvailable) {
      var name = safeGetValue(emp.fields, 'Employee_Full_Name.value', '');
      var empId = emp.id || '';

      if (name) {
        eligible.push({ name: name, id: empId });
      }
    }
  }

  return eligible;
}

function assignGhostCaregiversToShifts(shifts, employeesDetails, caregiverTimeSlots) {
  var eligibleCaregivers = getEligibleGhostCaregivers(employeesDetails);

  for (var i = eligibleCaregivers.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = eligibleCaregivers[i];
    eligibleCaregivers[i] = eligibleCaregivers[j];
    eligibleCaregivers[j] = temp;
  }

  if (!eligibleCaregivers.length) return shifts;

  for (var i = 0; i < shifts.length; i++) {
    var shift = shifts[i];

    for (var c = 0; c < eligibleCaregivers.length; c++) {
      var caregiver = eligibleCaregivers[c];
      var isAvailable = true;

      // Check if caregiver is on leave
      var isOnLeave = isCaregiverOnLeave(caregiver.name, shift.date, leavesData, shift.startTime, shift.endTime);
      if (isOnLeave) {
        isAvailable = false;
        continue;
      }

      // Check if caregiver has ANY client assignments on this date
      if (caregiverTimeSlots[caregiver.name]) {
        var assignments = caregiverTimeSlots[caregiver.name];
        for (var a = 0; a < assignments.length; a++) {
          if (assignments[a].date === shift.date) {
            // Caregiver has a client assignment on this date, not eligible for ghost shift
            isAvailable = false;
            break;
          }
        }
      }

      if (!isAvailable) continue;

      // Check for existing ghost shift assignments for this caregiver on the same date
      for (var g = 0; g < i; g++) {
        // Check if shifts[g].caregiverName exists before comparing
        if (shifts[g].caregiverName && shifts[g].caregiverName === caregiver.name && shifts[g].date === shift.date) {
          var currentShiftIsAM = shift.startTime < 720;
          var existingShiftIsAM = shifts[g].startTime < 720;

          if (currentShiftIsAM === existingShiftIsAM) {
            isAvailable = false;
            break;
          }
        }
      }

      if (isAvailable) {
        shift.caregiverName = caregiver.name;
        shift.caregiverEmployeeId = caregiver.id;
        break;
      }
    }
  }

  return shifts;
}

function createGhostShifts(next7Days, employeesDetails) {
  var shifts = [];
  var shiftsPerDay = 4;

  var shiftTimes = [
    { startTime: 0, endTime: 720 },    // 12:00 AM - 12:00 PM (AM1)
    { startTime: 0, endTime: 720 },    // 12:00 AM - 12:00 PM (AM2)
    { startTime: 720, endTime: 1440 }, // 12:00 PM - 12:00 AM (PM1)
    { startTime: 720, endTime: 1440 }  // 12:00 PM - 12:00 AM (PM2)
  ];

  for (var d = 0; d < next7Days.length; d++) {
    var day = next7Days[d];

    for (var s = 0; s < shiftsPerDay; s++) {
      shifts.push({
        id: 'ghost_' + day.iso + '_' + s,
        date: day.iso,
        day: day.day,
        startTime: shiftTimes[s].startTime,
        endTime: shiftTimes[s].endTime,
        startTimeStr: minutesToHHMM(shiftTimes[s].startTime),
        endTimeStr: minutesToHHMM(shiftTimes[s].endTime),
        caregiverName: '',
        caregiverEmployeeId: '',
        isGhostShift: true
      });
    }
  }

  return assignGhostCaregiversToShifts(shifts, employeesDetails, globalCaregiverTimeSlots);
}

// ---------------------------------------------------------------------------
// MAIN ASSIGNMENT FUNCTION
// ---------------------------------------------------------------------------

function assignCaregiverToSchedule(clientData, dayObj, schedule, employeesDetails,
  leavesData, allClientSchedules, globalAssignedCaregivers,
  clientCaregiverHours, globalCaregiverHours, actualSchedulingData) {

  var res = {
    assignedCaregiver: '',
    isAvailable: false,
    conflictsFound: [],
    availabilityIssues: [],
    finalAvailabilityIssue: null,
    primaryCaregiverChecked: false,
    availableCaregiversList: [],
    assignedCaregiverScore: null,
    assignedCaregiverWeightedTotal: null,
    assignedCaregiverWeightedBreakdown: null,
    debugReasons: []
  };

  var clientId = clientData.id;
  var clientName = safeGetValue(clientData, 'fields.Client_Full_Name.value', '');
  var primaryCaregiverName = normStr(safeGetValue(clientData, 'fields.Primary_Caregiver.value', ''));

  var candidateShiftHours = Math.round(((schedule.endTime - schedule.startTime) / 60) * 10) / 10;

  // Check if the client subscription is valid
  if (!isClientSubscriptionValid(clientData, dayObj.iso)) {
    res.finalAvailabilityIssue = 'client_subscription_invalid';
    res.debugReasons.push({
      priority: 'Client Subscription Validity',
      allowed: false,
      scoreAdjustment: 0,
      reason: "Client subscription is not valid for the given date (" + dayObj.iso + "). Valid range: " +
        safeGetValue(clientData.fields, 'Effective_From.value', 'N/A') + " to " +
        safeGetValue(clientData.fields, 'Effective_To.value', 'N/A')
    });
    return null; // Return null to indicate no service should be created
  }

  // FIXED: Check if the client is on leave - corrected function call parameters and using clientLeaves variable
  if (isClientOnLeave(clientId, dayObj.iso, schedule.startTime, schedule.endTime, clientLeaves)) {
    res.finalAvailabilityIssue = 'client_on_leave';
    res.debugReasons.push({
      priority: 'Client Leave Status',
      allowed: false,
      scoreAdjustment: 0,
      reason: 'Client is on leave during the scheduled time'
    });
    // FIXED: Return null instead of res to prevent schedule creation
    return null;
  }

  var settings = getPrioritySettings(settingsTableData);
  var prefs = extractClientPrefs(clientData);

  var allNames = getAllCaregiverNames(employeesDetails);
  var availableCaregivers = [];
  var basicAvailableCaregivers = [];

  var dimensionStats = [];

  for (var ac = 0; ac < allNames.length; ac++) {
    var cand = allNames[ac];
    var candidateResult = {
      caregiverName: cand,
      status: 'Evaluating',
      totalScore: 0,
      priorityScore: 0,
      optionalScore: 0,
      evaluationResults: [],
      isPrimary: primaryCaregiverName && normName(cand) === normName(primaryCaregiverName),
      clientHours: clientCaregiverHours[cand] || 0,
      globalHours: globalCaregiverHours[cand] || 0,
      rank: 0,
      rejectionReason: null,
      passedBasicChecks: false
    };

    var isBasicAvailable = isCaregiverAvailableForSchedule(cand, dayObj.day, schedule.startTime, schedule.endTime, employeesDetails);
    if (!isBasicAvailable) {
      candidateResult.status = 'Not Available - Time Slot';
      candidateResult.rejectionReason = 'not_available_for_time_slot';
      continue;
    }

    var isOnLeave = isCaregiverOnLeave(cand, dayObj.iso, leavesData, schedule.startTime, schedule.endTime);
    if (isOnLeave) {
      candidateResult.status = 'Not Available - On Leave';
      candidateResult.rejectionReason = 'on_leave';
      continue;
    }

    var isAvailableForTimeSlot = isCaregiverAvailable(cand, clientId, dayObj.iso, schedule.startTime, schedule.endTime);
    if (!isAvailableForTimeSlot) {
      candidateResult.status = 'Not Available - Time Conflict';
      candidateResult.rejectionReason = 'time_slot_conflict';
      continue;
    }

    var candConflicts = checkScheduleConflicts(cand, clientId, schedule.startTime, schedule.endTime, dayObj.iso, allClientSchedules, globalAssignedCaregivers);
    if (candConflicts.length > 0) {
      candidateResult.status = 'Not Available - Conflict';
      candidateResult.rejectionReason = 'schedule_conflict';
      candidateResult.conflictDetails = candConflicts;
      continue;
    }

    var empRec = getEmployeeRecordByName(cand, employeesDetails);
    if (!empRec) {
      candidateResult.status = 'Not Available - No Record';
      candidateResult.rejectionReason = 'employee_record_not_found';
      continue;
    }

    var profile = getCaregiverProfile(empRec);

    if (prefs.blockList && prefs.blockList.length && isBlockedByClient(prefs, cand)) {
      candidateResult.status = 'Not Available - Blocked';
      candidateResult.rejectionReason = 'blocked_by_client';
      continue;
    }

    var weeklyResult = weeklyDistributionCheck(empRec, candidateShiftHours, {}, false);
    if (weeklyResult.wouldExceedMax) {
      candidateResult.status = 'Not Available - Max Hours Exceeded';
      candidateResult.rejectionReason = 'exceeds_max_weekly_hours';
      continue;
    }

    candidateResult.passedBasicChecks = true;
    basicAvailableCaregivers.push(candidateResult);

    var candidateDebugReasons = [];
    var passedPriorityCheck = evaluateCandidateWithPriorities(cand, empRec, candidateShiftHours, settings, clientData, candidateDebugReasons, candidateResult.isPrimary);

    candidateResult.evaluationResults = candidateDebugReasons;

    var priorityScore = calculateTotalScore(candidateDebugReasons);
    var optScore = scoreOptional(prefs, profile);
    var totalScore = priorityScore + optScore;

    candidateResult.totalScore = totalScore;
    candidateResult.priorityScore = priorityScore;
    candidateResult.optionalScore = optScore;

    var rawLanguageMatches = 0;
    if (prefs.langs.length && profile && profile.langs.length) {
      for (var li = 0; li < prefs.langs.length; li++) {
        if (profile.langs.indexOf(prefs.langs[li]) !== -1) rawLanguageMatches++;
      }
    }

    var rawSkillMatches = 0;
    if (prefs.skills.length && profile && profile.skills.length) {
      for (var si = 0; si < prefs.skills.length; si++) {
        if (profile.skills.indexOf(prefs.skills[si]) !== -1) rawSkillMatches++;
      }
    }

    var rawHistoricalCount = getHistoricalCount(cand, clientName, actualSchedulingData, HISTORICAL_LOOKBACK_DAYS);

    var maxWeeklyHours = safeParseNumber(safeGetValue((empRec || {}).fields || {}, 'Max_Weekly_Hours.value', 0), 0);
    var workedSoFar = (globalCaregiverHours[cand] || 0);
    var remainingCapacity = maxWeeklyHours > 0 ? Math.max(0, maxWeeklyHours - workedSoFar) : 0;
    var rawWorkHours = remainingCapacity;

    dimensionStats.push({
      caregiverName: cand,
      rawLanguage: rawLanguageMatches,
      rawSkills: rawSkillMatches,
      rawHistorical: rawHistoricalCount,
      rawWorkHours: rawWorkHours
    });

    if (passedPriorityCheck) {
      candidateResult.status = 'Available';
      availableCaregivers.push(candidateResult);
    } else {
      candidateResult.status = 'Not Available - Priority Check Failed';
      candidateResult.rejectionReason = 'failed_priority_checks';
    }
  }

  if (availableCaregivers.length === 0) {
    for (var i = 0; i < basicAvailableCaregivers.length; i++) {
      var candidate = basicAvailableCaregivers[i];

      candidate.status = 'Available (Fallback)';
      candidate.totalScore = candidate.optionalScore;
      candidate.priorityScore = 0;

      candidate.evaluationResults.push({
        priority: 'Fallback Assignment',
        allowed: true,
        scoreAdjustment: 0,
        reason: 'assigned_as_fallback_due_to_no_priority_matches'
      });

      availableCaregivers.push(candidate);
    }
  }

  if (availableCaregivers.length > 0) {
    var rawMap = {};
    for (var d = 0; d < dimensionStats.length; d++) {
      rawMap[dimensionStats[d].caregiverName] = dimensionStats[d];
    }

    var maxLang = 0, maxSkills = 0, maxHist = 0, maxWork = 0;
    for (var a = 0; a < availableCaregivers.length; a++) {
      var rn = availableCaregivers[a].caregiverName;
      var m = rawMap[rn];
      if (!m) continue;
      if (m.rawLanguage > maxLang) maxLang = m.rawLanguage;
      if (m.rawSkills > maxSkills) maxSkills = m.rawSkills;
      if (m.rawHistorical > maxHist) maxHist = m.rawHistorical;
      if (m.rawWorkHours > maxWork) maxWork = m.rawWorkHours;
    }

    availableCaregivers.forEach(function (c) {
      var metrics = rawMap[c.caregiverName] || {};
      var wLang = maxLang ? (metrics.rawLanguage / maxLang) * scoringWeights.language : 0;
      var wSkills = maxSkills ? (metrics.rawSkills / maxSkills) * scoringWeights.skills : 0;
      var wHist = maxHist ? (metrics.rawHistorical / maxHist) * scoringWeights.historical : 0;
      var wWork = maxWork ? (metrics.rawWorkHours / maxWork) * scoringWeights.workHours : 0;

      c.weightedBreakdown = {
        language: +wLang.toFixed(2),
        skills: +wSkills.toFixed(2),
        historical: +wHist.toFixed(2),
        workHours: +wWork.toFixed(2)
      };
      c.weightedTotalScore = +(wLang + wSkills + wHist + wWork).toFixed(2);
    });

    availableCaregivers.sort(function (a, b) {
      if (b.weightedTotalScore !== a.weightedTotalScore) return b.weightedTotalScore - a.weightedTotalScore;
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.clientHours !== a.clientHours) return b.clientHours - a.clientHours;
      if (b.globalHours !== a.globalHours) return b.globalHours - a.globalHours;
      return a.caregiverName < b.caregiverName ? -1 : (a.caregiverName > b.caregiverName ? 1 : 0);
    });
  }

  var availableCaregiversForList = [];

  for (var i = 0; i < availableCaregivers.length; i++) {
    var caregiver = availableCaregivers[i];

    if (i === 0) {
      caregiver.rank = 1;
      caregiver.status = caregiver.status.indexOf('Fallback') !== -1 ? 'Selected (Fallback)' : 'Selected';
    } else {
      var isAvailableForAssignment = isCaregiverAvailable(
        caregiver.caregiverName,
        clientId,
        dayObj.iso,
        schedule.startTime,
        schedule.endTime
      );

      if (isAvailableForAssignment) {
        caregiver.rank = availableCaregiversForList.length + 2;
        caregiver.status = caregiver.status.indexOf('Fallback') !== -1 ?
          'Available (Fallback) - Rank ' + caregiver.rank :
          'Available - Rank ' + caregiver.rank;
        availableCaregiversForList.push(caregiver);
      } else {
        caregiver.rank = 0;
        caregiver.status = 'Unavailable - Time Conflict';
        caregiver.rejectionReason = 'time_slot_conflict';
      }
    }
  }

  res.availableCaregiversList = availableCaregiversForList;

  if (availableCaregivers.length > 0) {
    var bestCandidate = availableCaregivers[0];
    res.assignedCaregiver = bestCandidate.caregiverName;
    res.isAvailable = true;
    res.debugReasons = bestCandidate.evaluationResults;
    res.assignedCaregiverScore = bestCandidate.weightedTotalScore != null
      ? bestCandidate.weightedTotalScore
      : bestCandidate.totalScore;

    res.assignedCaregiverWeightedTotal = bestCandidate.weightedTotalScore;
    res.assignedCaregiverWeightedBreakdown = bestCandidate.weightedBreakdown || null;

    var assignmentKey = clientId + '_' + dayObj.iso + '_' + schedule.startTime;
    globalAssignedCaregivers[assignmentKey] = bestCandidate.caregiverName;

    // FIXED: Correct hours calculation with one decimal place
    var shiftHours = Math.round(((schedule.endTime - schedule.startTime) / 60) * 10) / 10;
    globalCaregiverHours[bestCandidate.caregiverName] =
      (globalCaregiverHours[bestCandidate.caregiverName] || 0) + shiftHours;

    clientCaregiverHours[bestCandidate.caregiverName] =
      (clientCaregiverHours[bestCandidate.caregiverName] || 0) + shiftHours;

    if (!globalCaregiverTimeSlots[bestCandidate.caregiverName]) {
      globalCaregiverTimeSlots[bestCandidate.caregiverName] = [];
    }

    globalCaregiverTimeSlots[bestCandidate.caregiverName].push({
      clientId: clientId,
      date: dayObj.iso,
      startTime: schedule.startTime,
      endTime: schedule.endTime
    });

    if (primaryCaregiverName) {
      res.primaryCaregiverChecked = true;
    }
  } else {
    res.finalAvailabilityIssue = 'no_caregiver_available';
    res.primaryCaregiverChecked = primaryCaregiverName ? true : false;

    res.debugReasons.push({
      priority: 'Assignment Result',
      allowed: false,
      scoreAdjustment: 0,
      reason: 'No caregivers passed basic availability checks (time slot, leave status, conflicts, blocklist, max hours)'
    });
  }


  return res;
}

function rebuildAvailableCaregiversList(clientAssignments) {
  for (var c = 0; c < clientAssignments.length; c++) {
    var clientAssignment = clientAssignments[c];
    var clientId = clientAssignment.clientId;

    for (var s = 0; s < clientAssignment.scheduledServices.length; s++) {
      var service = clientAssignment.scheduledServices[s];
      var availableList = service.availableCaregiversList;
      var updatedList = [];

      for (var i = 0; i < availableList.length; i++) {
        var caregiver = availableList[i];

        if (isGhostCaregiverForDate(caregiver.caregiverName, service.date, ghostShifts)) {
          continue;
        }

        var isAvailable = isCaregiverAvailable(
          caregiver.caregiverName,
          clientId,
          service.date,
          service.startTime,
          service.endTime
        );

        if (isAvailable) {
          updatedList.push(caregiver);
        }
      }

      service.availableCaregiversList = updatedList;
    }
  }

  return clientAssignments;
}

// ---------------------------------------------------------------------------
// SCHEDULE BUILDING FUNCTIONS
// ---------------------------------------------------------------------------

function buildAllClientSchedules(allClientsData, clientSchedulesData, next7Days) {
  var allSchedules = {};

  for (var d = 0; d < next7Days.length; d++) {
    var dayObj = next7Days[d];
    allSchedules[dayObj.iso] = {};
  }

  var schedulesList = clientSchedulesData.data || [];

  for (var i = 0; i < schedulesList.length; i++) {
    var scheduleItem = schedulesList[i];
    if (!scheduleItem || !scheduleItem.fields) continue;

    var clientId = scheduleItem.refId;
    var dayName = normStr(safeGetValue(scheduleItem.fields, 'Day.value', ''));
    var startTimeStr = normStr(safeGetValue(scheduleItem.fields, 'Schedule_Start_Time.value', ''));
    var endTimeStr = normStr(safeGetValue(scheduleItem.fields, 'Schedule_End_Time.value', ''));

    var startTime = parseTime(startTimeStr);
    var endTime = parseTime(endTimeStr);

    if (startTime === null || endTime === null || startTime >= endTime) continue;

    var clientName = '';
    for (var c = 0; c < allClientsData.length; c++) {
      var client = allClientsData[c];
      if (client && client.id === clientId) {
        clientName = safeGetValue(client.fields, 'Client_Full_Name.value', 'Unknown Client');
        break;
      }
    }

    for (var d2 = 0; d < next7Days.length; d2++) {
      var dayObj = next7Days[d2];
      if (normStr(dayObj.day).toUpperCase() === normStr(dayName).toUpperCase()) {
        if (!allSchedules[dayObj.iso][clientId]) {
          allSchedules[dayObj.iso][clientId] = [];
        }

        allSchedules[dayObj.iso][clientId].push({
          clientName: clientName,
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

function getClientSchedulesFromAPI(clientId, clientSchedulesData) {
  var schedules = [];
  var schedulesList = (clientSchedulesData && clientSchedulesData.data) ? clientSchedulesData.data : [];

  for (var i = 0; i < schedulesList.length; i++) {
    var scheduleItem = schedulesList[i];
    if (!scheduleItem || !scheduleItem.fields) continue;
    if (scheduleItem.refId !== clientId) continue;

    var dayName = normStr(safeGetValue(scheduleItem.fields, 'Day.value', ''));
    var startTimeStrRaw = normStr(safeGetValue(scheduleItem.fields, 'Schedule_Start_Time.value', ''));
    var endTimeStrRaw = normStr(safeGetValue(scheduleItem.fields, 'Schedule_End_Time.value', ''));

    var startTime = parseTime(startTimeStrRaw);
    var endTime = parseTime(endTimeStrRaw);

    if (startTime === null || endTime === null) continue;
    if (startTime >= endTime) continue;

    schedules.push({
      day: dayName,
      startTime: startTime,
      endTime: endTime,
      startTimeStr: minutesToHHMM(startTime),
      endTimeStr: minutesToHHMM(endTime)
    });
  }

  return schedules;
}
// ---------------------------------------------------------------------------
// MAIN PROCESSING LOGIC
// ---------------------------------------------------------------------------

var next7Days = getNext7Days(currDate);
if (!next7Days || next7Days.length === 0) {
  result.error = "Failed to generate next 7 days";
  return result;
}

var allClientSchedules = buildAllClientSchedules(allClientsScheduleData, clientSchedules, next7Days);

var globalAssignedCaregivers = {};

function getClientType(rec) {
  var v = normStr(safeGetValue(rec, 'fields.Client_Type.value', ''));
  return (v && v.toUpperCase() === 'PRIVATE') ? 'Private' : 'Facility';
}

var clientsToProcess = allClientsScheduleData.slice();
clientsToProcess.sort(function (a, b) {
  var ta = getClientType(a);
  var tb = getClientType(b);
  if (ta !== tb) return ta === 'Private' ? -1 : 1;
  var na = normStr(safeGetValue(a, 'fields.Client_Full_Name.value', ''));
  var nb = normStr(safeGetValue(b, 'fields.Client_Full_Name.value', ''));
  return na < nb ? -1 : (na > nb ? 1 : 0);
});

var globalCaregiverHours = {};

for (var clientIndex = 0; clientIndex < clientsToProcess.length; clientIndex++) {
  var clientData = clientsToProcess[clientIndex];
  if (!clientData || !clientData.fields) continue;

  var clientName = safeGetValue(clientData, 'fields.Client_Full_Name.value', '');
  var clientId = clientData.id || '';
  var primaryCaregiverName = safeGetValue(clientData, 'fields.Primary_Caregiver.value', '');

  var clientScheduleRows = getClientSchedulesFromAPI(clientId, clientSchedules);
  var clientScheduledServices = [];
  var clientConflicts = [];
  var clientAvailabilityIssues = [];

  for (var dayIndex = 0; dayIndex < next7Days.length; dayIndex++) {
    var dayObj = next7Days[dayIndex];

    for (var scheduleIndex = 0; scheduleIndex < clientScheduleRows.length; scheduleIndex++) {
      var schedule = clientScheduleRows[scheduleIndex];

      if (schedule.day === dayObj.day) {
        var assignmentResult = assignCaregiverToSchedule(
          clientData,
          dayObj,
          schedule,
          employeesDetails,
          leavesData,
          allClientSchedules,
          globalAssignedCaregivers,
          {},
          globalCaregiverHours,
          actualSchedulingData
        );
        if (!assignmentResult) {
          continue;
        }

        var assignedCaregiver = assignmentResult.assignedCaregiver;
        var isAvailable = assignmentResult.isAvailable;
        var conflictsFound = assignmentResult.conflictsFound;
        var availabilityIssues = assignmentResult.availabilityIssues;

        if (conflictsFound.length > 0) {
          clientConflicts = clientConflicts.concat(conflictsFound);
        }

        if (!isAvailable && availabilityIssues.length > 0) {
          clientAvailabilityIssues = clientAvailabilityIssues.concat(availabilityIssues);
        }

        var serviceTime = schedule.startTimeStr + " - " + schedule.endTimeStr;
        var requestedHours = Math.round(((schedule.endTime - schedule.startTime) / 60) * 10) / 10;
        var finalCaregiverName = isAvailable ? assignedCaregiver : "Unassigned";
        var caregiverAvailabilityStatus = isAvailable ? "Available" : "Not Available";
        var shiftStatus = isAvailable ? "Scheduled" : "Open Shift";
        var isPrimaryAssigned = isAvailable && primaryCaregiverName &&
          normName(assignedCaregiver) === normName(primaryCaregiverName);

        var finalCaregiverQBID = isAvailable ? getCaregiverQBID(assignedCaregiver, employeesDetails) : '';
        var finalCaregiverEmployeeId = isAvailable ? getCaregiverEmployeeId(assignedCaregiver, employeesDetails) : '';

        var serviceObj = {
          clientId: clientId,
          clientName: clientName || "Unknown Client",
          caregiverName: finalCaregiverName,
          caregiverQBID: finalCaregiverQBID,
          caregiverEmployeeId: finalCaregiverEmployeeId,
          day: dayObj.day,
          date: dayObj.iso,
          serviceTime: serviceTime,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          caregiverAvailability: caregiverAvailabilityStatus,
          shiftStatus: shiftStatus,
          conflictsCount: conflictsFound.length,
          availabilityIssue: assignmentResult.finalAvailabilityIssue,
          caregiverIssuesEncountered: availabilityIssues.length,
          isPrimaryCaregiver: isPrimaryAssigned,
          primaryCaregiverChecked: assignmentResult.primaryCaregiverChecked,
          clientRequestedHours: Math.round(requestedHours * 100) / 100,
          availableCaregiversList: assignmentResult.availableCaregiversList || [],
          debugReasons: assignmentResult.debugReasons || [],
          weightedScore: assignmentResult.assignedCaregiverWeightedTotal || null,
          weightedBreakdown: assignmentResult.assignedCaregiverWeightedBreakdown || null
        };

        if (isAvailable) {
          serviceObj.caregiverScheduledHours = requestedHours;
        }

        clientScheduledServices.push(serviceObj);
      }
    }
  }

  result.allClientAssignments.push({
    clientId: clientId,
    clientName: clientName,
    primaryCaregiverName: primaryCaregiverName,
    scheduledServices: clientScheduledServices,
    conflicts: {
      total: clientConflicts.length,
      details: clientConflicts
    },
    availabilityIssues: {
      total: clientAvailabilityIssues.length,
      details: clientAvailabilityIssues
    }
  });

  result.conflicts.total += clientConflicts.length;
  result.conflicts.details = result.conflicts.details.concat(clientConflicts);
  result.availabilityIssues.total += clientAvailabilityIssues.length;
  result.availabilityIssues.details = result.availabilityIssues.details.concat(clientAvailabilityIssues);
}

result.allClientAssignments = rebuildAvailableCaregiversList(result.allClientAssignments);

var totalScheduledServices = 0;
var totalSuccessfulAssignments = 0;
var totalOpenShifts = 0;
var uniqueCaregiversUsed = {};

for (var c = 0; c < result.allClientAssignments.length; c++) {
  var clientAssignment = result.allClientAssignments[c];
  totalScheduledServices += clientAssignment.scheduledServices.length;

  for (var s = 0; s < clientAssignment.scheduledServices.length; s++) {
    var service = clientAssignment.scheduledServices[s];
    if (service.shiftStatus === "Scheduled") {
      totalSuccessfulAssignments++;
    } else {
      totalOpenShifts++;
    }

    if (service.caregiverName && service.caregiverName !== "Unassigned") {
      uniqueCaregiversUsed[service.caregiverName] = true;
    }
  }
}

result.globalSummary = {
  totalClients: result.allClientAssignments.length,
  totalScheduledServices: totalScheduledServices,
  totalSuccessfulAssignments: totalSuccessfulAssignments,
  totalOpenShifts: totalOpenShifts,
  totalConflicts: result.conflicts.total,
  totalAvailabilityIssues: result.availabilityIssues.total,
  uniqueCaregiversUsed: Object.keys(uniqueCaregiversUsed).length,
  caregiverNames: Object.keys(uniqueCaregiversUsed),
  globalSuccessRate: totalScheduledServices > 0 ?
    (totalSuccessfulAssignments / totalScheduledServices * 100).toFixed(1) + '%' : '0%'
};

var caregiverUtilization = {};
var caregiverHoursUtilization = {};

var ghostShifts = createGhostShifts(next7Days, employeesDetails);

result.ghostShifts = ghostShifts;
result.globalSummary.totalGhostShifts = ghostShifts.length;

result.globalSummary.filledGhostShifts = ghostShifts.filter(function (shift) {
  return shift.caregiverName !== '';
}).length;
result.globalSummary.emptyGhostShifts = ghostShifts.filter(function (shift) {
  return shift.caregiverName === '';
}).length;

result.globalSummary.ghostPoolSize = getEligibleGhostCaregivers(employeesDetails).length;
result.globalSummary.ghostShiftsPerDay = ghostShifts.length / next7Days.length;

result.ghostShiftStats = {
  totalGhostShifts: ghostShifts.length,
  filledGhostShifts: ghostShifts.filter(function (shift) { return shift.caregiverName !== ''; }).length,
  emptyGhostShifts: ghostShifts.filter(function (shift) { return shift.caregiverName === ''; }).length,
  ghostPoolSize: getEligibleGhostCaregivers(employeesDetails).length,
  shiftsPerDay: ghostShifts.length / next7Days.length
};

for (var c = 0; c < result.allClientAssignments.length; c++) {
  var clientAssignment = result.allClientAssignments[c];

  for (var s = 0; s < clientAssignment.scheduledServices.length; s++) {
    var service = clientAssignment.scheduledServices[s];
    if (service.caregiverName && service.caregiverName !== "Unassigned") {
      caregiverUtilization[service.caregiverName] = (caregiverUtilization[service.caregiverName] || 0) + 1;

      if (service.caregiverScheduledHours) {
        caregiverHoursUtilization[service.caregiverName] =
          (caregiverHoursUtilization[service.caregiverName] || 0) + service.caregiverScheduledHours;
      }
    }
  }
}

result.caregiverUtilization = caregiverUtilization;
result.caregiverHoursUtilization = caregiverHoursUtilization;

result.debug.processedClients = result.allClientAssignments.length;
result.debug.globalAssignments = Object.keys(globalAssignedCaregivers).length;
result.debug.next7DaysCount = next7Days.length;

result.debug.clientSubscriptionCheck = isClientSubscriptionValid(clientData, dayObj.iso);
result.debug.clientLeaveCheck = isClientOnLeave(clientId, dayObj.iso, schedule.startTime, schedule.endTime, clientLeaves);

return result;