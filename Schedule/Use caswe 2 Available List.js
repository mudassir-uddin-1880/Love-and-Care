var waring = ""
if (fields["Client_Name"].value == null || fields["Client_Name"].value == "") {
    waring = waring + "Client Name is required.\n"
    app_lib.showWarn(`Client Name is required`);
    return waring;
}

if (fields["Day"].value == null || fields["Day"].value == "") {
    waring = waring + "Day is required.\n"
    app_lib.showWarn(`Day is required`);
    return waring;
}

if (fields["Schedule_Start_Date"].value == null || fields["Schedule_Start_Date"].value == "") {
    waring = waring + "Schedule Start Date is required.\n"
    app_lib.showWarn(`Schedule Start is required`);

    return waring;
}

if (fields["Schedule_Start_Time"].value == null || fields["Schedule_Start_Time"].value == "") {
    waring = waring + "Schedule Start Time is required.\n"
    app_lib.showWarn(`Schedule Start Time is required`);
    return waring;
}

if (fields["Schedule_End_Time"].value == null || fields["Schedule_End_Time"].value == "") {
    waring = waring + "Schedule End Time is required.\n"
    app_lib.showWarn(`Schedule End Time is required`);
    return waring;
}

var settingscriteriaCA = {
    "Settings_Status": "Active"
};

var settingsfieldsArrayCA = [
    "Schedule_Look_back_Descriptions",
    "Worked_Hours_",
    "Language_",
    "Skills_",
    "Client_History_",
    "Priority_Based_Attributes_for_Caregiver_Segregation" // Added schedule details field to fetch in single API call
];

var settingssvctypeCA = "SVC_TYPE_7";
var settingsListg = [];
var scheduleData = [];
var pendingRequests = 0;
// Combined function to process all settings data with one API call
function getsettingsDataWithSchedules() {
    app_lib.getTxnUsingIncFields(settingscriteriaCA, settingsfieldsArrayCA, function (response) {
        // Process response for settings data first
        if (!response || response.length === 0) {
            console.log("No valid settings data received.");
            return;
        }

        if (!Array.isArray(response)) {
            response = [response];
        }

        console.log("Total settings records received:", response.length);
        settingsListg = [];
        pendingRequests = response.length;

        for (var i = 0; i < response.length; i++) {
            var record = response[i];
            var fieldValues = {};
            var fieldsObj = record.fields || {};
            var settingsId = record.id;

            // Process regular settings fields
            for (var j = 0; j < settingsfieldsArrayCA.length - 1; j++) { // Exclude Priority_Based_Attributes_for_Caregiver_Segregation from this loop
                var key = settingsfieldsArrayCA[j];
                var value = "";

                if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                    value = fieldsObj[key].value;
                }

                fieldValues[key] = value;
            }

            // Store the settings ID in the settings object for later matching
            fieldValues.settingsId = settingsId;
            settingsListg.push(fieldValues);

            // Process schedule data for this settings in the same loop
            var tableId = fieldsObj["Priority_Based_Attributes_for_Caregiver_Segregation"] ? fieldsObj["Priority_Based_Attributes_for_Caregiver_Segregation"].value : null;

            if (settingsId && tableId) {
                // Use IIFE to capture current settingsId and tableId in closure
                (function (currentsettingsId, currentTableId, index) {
                    app_lib.rowsOf(currentsettingsId, currentTableId, function (tableRows) {
                        var schedulingDetails = [];
                        if (tableRows && tableRows.length > 0) {
                            for (var j = 0; j < tableRows.length; j++) {
                                var row = tableRows[j];
                                if (row && row.fields) {
                                    schedulingDetails.push({
                                        Description: row.fields.Description ? row.fields.Description.value : "",
                                        Is_Mandatory_: row.fields.Is_Mandatory_ ? row.fields.Is_Mandatory_.value : "",
                                        Status: row.fields.Select_Status ? row.fields.Select_Status.value : "",
                                    });
                                }
                            }
                        }

                        scheduleData.push({
                            settingsId: currentsettingsId,
                            schedulingDetails: schedulingDetails
                        });

                        pendingRequests--;
                        if (pendingRequests === 0) {
                            // All schedule data processed, now combine everything
                            finalizesettingsData();
                        }
                    });
                })(settingsId, tableId, i);
            } else {
                pendingRequests--;
                if (pendingRequests === 0) {
                    finalizesettingsData();
                }
            }
        }
        console.log("settings basic data processed:", settingsListg.length);
    }, null, settingssvctypeCA);
}

// Final function to combine settings and schedule data
var completesettingsData = [];
function finalizesettingsData() {
    // Merge settings data with schedule data
    completesettingsData = settingsListg.map(function (settings) {
        var schedule = scheduleData.find(function (schedule) {
            return schedule.settingsId === settings.settingsId;
        }) || { schedulingDetails: [] };

        return {
            ...settings,
            schedulingDetails: schedule.schedulingDetails
        };
    });

    console.log("Complete settings data with schedules count:", completesettingsData.length);
    console.log("Complete settings data with schedules:", completesettingsData);

    // Return or use the complete data as needed
    return completesettingsData;
}

// Call the function to start the process
getsettingsDataWithSchedules();


var employeescriteriaCA = {
    "Employee_Status": "Active",
    "Employment_Type": "Caregiver"
};

var employeesfieldsArrayCA = [
    "Employee_Full_Name",
    "Private",
    "QB-Id",
    "Weight_Class",
    "Facility",
    "Languages",
    "Personality_Match",
    "LastMinute_Ready_Ghost_Pool_",
    "Gender", // Added for gender matching
    "Physical_Capability_lbs", // Added for physical requirements
    "Skill_Type", // Added for skill matching
    "Experience", // Alternative skill field
    "Language", // For language matching
    "Target_Weekly_Hours", // For weekly hours distribution
    "Max_Weekly_Hours", // For weekly hours limit
    "Transportation", // For transportation capability
    "Other_Employment", // For dual employment check
    "MONDAY_AM",
    "MONDAY_PM",
    "MONDAY_NOC",
    "TUESDAY_AM",
    "TUESDAY_PM",
    "TUESDAY_NOC",
    "WEDNESDAY_AM",
    "WEDNESDAY_PM",
    "WEDNESDAY_NOC",
    "THURSDAY_AM",
    "THURSDAY_PM",
    "THURSDAY_NOC",
    "FRIDAY_AM",
    "FRIDAY_PM",
    "FRIDAY_NOC",
    "SATURDAY_AM",
    "SATURDAY_PM",
    "SATURDAY_NOC",
    "SUNDAY_AM",
    "SUNDAY_PM",
    "SUNDAY_NOC",
];

var employeessvctypeCA = "SVC_TYPE_1";
var employeesListg = [];

function processemployeesdata(response) {
    if (!response || response.length === 0) {
        console.log("No valid employees data received.");
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total employees records received:", response.length);

    employeesListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < employeesfieldsArrayCA.length; j++) {
            var key = employeesfieldsArrayCA[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key] && typeof fieldsObj[key].value !== "undefined" ? fieldsObj[key].value : "";
            }

            fieldValues[key] = value;
        }

        employeesListg.push(fieldValues);
    }

    console.log("employeesListg:", employeesListg);
}

// Call the function
app_lib.getTxnUsingIncFields(employeescriteriaCA, employeesfieldsArrayCA, processemployeesdata, null, employeessvctypeCA);

// Add client data fetch
var clientcriteriaCA = {
    "Client_Status": "Active"
};

var clientfieldsArrayCA = [
    "Client_Full_Name",
    "Gender_Preference",
    "Gender_Preference_Strict",
    "Physical_Capability_lbs",
    "Language_Preferences",
    "Weight_Class",
    "Skills_Preferences",
    "Personality_Match",
    "Caregiver_Block_List",
    "Client_Type",
    "Transportation_Needed_",
    "Primary_Caregiver",
    "Effective_From",
    "Effective_To"
];

var clientsvctypeCA = "SVC_TYPE_2";
var clientListg = [];

function processclientdata(response) {
    if (!response || response.length === 0) {
        console.log("No valid client data received.");
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total client records received:", response.length);

    clientListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < clientfieldsArrayCA.length; j++) {
            var key = clientfieldsArrayCA[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key] && typeof fieldsObj[key].value !== "undefined" ? fieldsObj[key].value : "";
            }

            fieldValues[key] = value;
        }

        clientListg.push(fieldValues);
    }

    console.log("clientListg:", clientListg);
}

// Call the function
app_lib.getTxnUsingIncFields(clientcriteriaCA, clientfieldsArrayCA, processclientdata, null, clientsvctypeCA);

// Add leaves data fetch
var leavescriteriaCA = {
    "Status": "Active",
    "Leave_Status": "Approved"
};

var leavesfieldsArrayCA = [
    "Start_Date",
    "End_Date",
    "Start_Time",
    "End_Time",
    "Caregiver",
];

var leavessvctypeCA = "SVC_TYPE_5";
var leavesListg = [];

function processleavesListg(response) {
    if (!response || response.length === 0) {
        console.log("No valid leaves data received.");
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total leaves records received:", response.length);

    leavesListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < leavesfieldsArrayCA.length; j++) {
            var key = leavesfieldsArrayCA[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key] && typeof fieldsObj[key].value !== "undefined" ? fieldsObj[key].value : "";
            }

            fieldValues[key] = value;
        }

        leavesListg.push(fieldValues);
    }

    console.log("leavesListg:", leavesListg);
}

// Call the function
app_lib.getTxnUsingIncFields(leavescriteriaCA, leavesfieldsArrayCA, processleavesListg, null, leavessvctypeCA);

var currDate = moment().format('YYYY-MM-DD');
var scheduledateCriteriaCA = {
    fromDate: moment().subtract(30, 'days').format('YYYY-MM-DD'),
    toDate: currDate
};

var schedulecriteriaCA = {
    "Record_Status": "Active",
    "Shift_Status": "Scheduled" || "Ghost Shift"
};

var schedulefieldsArrayCA = [
    "Client_Name",
    "Expected_Caregiver",
    "Actual_Caregiver",
    "Day",
    "Schedule_Start_Date",
    "Schedule_Start_Time",
    "Schedule_End_Time",
    "Scheduling_Status",
    "List_of_Available_Caregivers",
    "Expected_Hours",
    "Actual_Hours"

];

var schedulesvctypeCA = "SVC_TYPE_3";
var scheduleListg = [];

function processscheduledata(response) {
    if (!response || response.length === 0) {
        console.log("No valid schedule data received.");
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total schedule records received:", response.length);

    scheduleListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < schedulefieldsArrayCA.length; j++) {
            var key = schedulefieldsArrayCA[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key] && typeof fieldsObj[key].value !== "undefined" ? fieldsObj[key].value : "";
            }

            fieldValues[key] = value;
        }

        scheduleListg.push(fieldValues);
    }

    console.log("scheduleListg:", scheduleListg);
}

// Call the function
app_lib.getTxnUsingIncFields(schedulecriteriaCA, schedulefieldsArrayCA, processscheduledata, scheduledateCriteriaCA, schedulesvctypeCA);

// client details with schedule details
let clientName = fields["Client_Name"].value;
let day = fields["Day"].value;
let scheduleStartDate = fields["Schedule_Start_Date"].value;
let scheduleStartTime = fields["Schedule_Start_Time"].value;
let scheduleEndTime = fields["Schedule_End_Time"].value;
console.log("Client Name:", clientName);
console.log("Day:", day);
console.log("Schedule Start Date:", scheduleStartDate);
console.log("Schedule Start Time:", scheduleStartTime);
console.log("Schedule End Time:", scheduleEndTime);

var clientLeavecriteriaCA = {
    "Status": "Active",
    "Leave_Status": "Approved"
};

var clientLeavefieldsArrayCA = [
    "Client_Name",// this field will have the cleint record ID not Name record if of the cleitn app 
    "Client_Type",
    "Leave_Type",
    "Start_Date",
    "End_Date",
    "Start_Time",
    "End_Time",
    "Leave_Status"

];

var clientLeavesvctypeCA = "SVC_TYPE_8";
var clientLeaveListg = [];

function processclientLeavedata(response) {
    if (!response || response.length === 0) {
        console.log("No valid clientLeave data received.");
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total clientLeave records received:", response.length);

    clientLeaveListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < clientLeavefieldsArrayCA.length; j++) {
            var key = clientLeavefieldsArrayCA[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key] && typeof fieldsObj[key].value !== "undefined" ? fieldsObj[key].value : "";
            }

            fieldValues[key] = value;
        }

        clientLeaveListg.push(fieldValues);
    }
    console.log("clientLeaveListg:", clientLeaveListg);
}
// Call the function
app_lib.getTxnUsingIncFields(clientLeavecriteriaCA, clientLeavefieldsArrayCA, processclientLeavedata, null, clientLeavesvctypeCA);
// looping all the data to get the available caregivers for the client by using client details
// Helper function for schedule conflicts specific to scheduleListg format
// Execute the function and return the result
// Helper functions
// Helper functions (optimized with arrow functions)
// Helper functions (optimized with arrow functions)
const normStr = (v) => {
    if (v == null) return '';
    return String(v).replace(/\s+/g, ' ').trim();
};
const normName = (v) => normStr(v).toLowerCase();
const safeGetValue = (obj, path, defaultValue) => {
    if (!obj) return defaultValue;
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length; i++) {
        if (current == null || typeof current !== 'object') return defaultValue;
        current = current[keys[i]];
    }
    return current == null ? defaultValue : current;
};

const safeParseNumber = (value, defaultValue) => {
    if (typeof value === 'number' && !isNaN(value)) return value;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? (defaultValue || 0) : parsed;
};

const parseList = (v) => {
    // Handle arrays directly
    if (Array.isArray(v)) {
        return v.map(x => normStr(x).toLowerCase()).filter(Boolean);
    }

    const s = normStr(v);
    if (!s) return [];
    return s.split(/[,;/\n]+/).map(x => normStr(x).toLowerCase()).filter(Boolean);
};


const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const cleanTime = normStr(timeStr).replace(/[^0-9:]/g, '');
    const parts = cleanTime.split(':');
    if (parts.length >= 2) {
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        if (!isNaN(hours) && !isNaN(minutes)) {
            return hours * 60 + minutes; // Convert to minutes
        }
    }
    return null;
};





function getTransportationPreference(caregiverName, clientData, employeesData) {
    if (!caregiverName || !clientData || !Array.isArray(employeesData)) {
        return { isPreferred: false };
    }
    const clientNeeds = normStr(clientData.Transportation_Needed_ || clientData.Transportation_Needs || '').toLowerCase() === 'yes';
    if (!clientNeeds) return { isPreferred: false };

    const cgNorm = normName(caregiverName);
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === cgNorm);
    if (!emp) return { isPreferred: false };

    const canTransport = ['yes', 'true'].includes(normStr(emp.Transportation || '').toLowerCase());
    return { isPreferred: canTransport };
}


const timeOverlap = (start1, end1, start2, end2) => start1 < end2 && start2 < end1;

const dayToKey = (dayName) => {
    const d = normStr(dayName).toUpperCase();
    const map = {
        'SUNDAY': 'SUNDAY', 'MONDAY': 'MONDAY', 'TUESDAY': 'TUESDAY',
        'WEDNESDAY': 'WEDNESDAY', 'THURSDAY': 'THURSDAY',
        'FRIDAY': 'FRIDAY', 'SATURDAY': 'SATURDAY'
    };
    return map[d] || d;
};

// Enhanced date checking function
const isDateInRange = (dateToCheck, startDate, endDate) => {
    if (!dateToCheck || !startDate) return false;

    const checkDate = new Date(dateToCheck);
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : start;

    return checkDate >= start && checkDate <= end;
};

const extractScoringWeights = (settingsData) => {
    const weights = {
        workHours: 40,
        language: 25,
        skills: 20,
        historical: 15
    };

    if (Array.isArray(settingsData) && settingsData.length > 0) {
        const settings = settingsData[0];
        if (settings) {
            weights.workHours = safeParseNumber(settings.Worked_Hours_ || weights.workHours, weights.workHours);
            weights.language = safeParseNumber(settings.Language_ || weights.language, weights.language);
            weights.skills = safeParseNumber(settings.Skills_ || weights.skills, weights.skills);
            weights.historical = safeParseNumber(settings.Client_History_ || weights.historical, weights.historical);
        }
    }

    return weights;
};

const extractPrioritySettings = (settingsData) => {
    const result = { order: [], active: {}, mandatory: {} };
    if (!Array.isArray(settingsData) || !settingsData.length) return result;
    const settings = settingsData[0];
    if (!settings || !Array.isArray(settings.schedulingDetails)) return result;

    settings.schedulingDetails.forEach(row => {
        const name = normStr(row.Description);
        if (!name) return;
        result.order.push(name);
        // Active ONLY if Status === 'Active'
        result.active[name] = normStr(row.Status).toLowerCase() === 'active';
        result.mandatory[name] = normStr(row.Is_Mandatory_).toLowerCase() === 'yes';
    });
    return result;
};

const normalizePrioritySettings = (ps) => {
    if (!ps) return ps;
    const remap = { order: [], active: {}, mandatory: {} };
    ps.order.forEach(name => {
        const key = normStr(name).toLowerCase();
        if (!remap.active[key]) {
            remap.order.push(key);
            remap.active[key] = !!ps.active[name];
            remap.mandatory[key] = !!ps.mandatory[name];
        }
    });
    return remap;
};

const isCaregiverAvailableForSchedule = (caregiverName, dayName, startMin, endMin, employeesListg) => {
    if (!caregiverName || !dayName) return false;

    // If employeesListg is not provided, don't block scheduling
    if (!Array.isArray(employeesListg) || employeesListg.length === 0) {
        return true;
    }

    const cgNorm = normName(caregiverName);
    const dayKey = dayToKey(dayName);
    const segments = getShiftSegmentsForWindow(startMin, endMin);

    console.log(`Checking ${caregiverName} availability for ${dayName}, segments:`, segments);

    // Find employee record by name
    const emp = employeesListg.find(e => {
        const nm = e.Employee_Full_Name || '';
        return nm && normName(nm) === cgNorm;
    });

    if (!emp) {
        console.log(`Employee record not found for: ${caregiverName}`);
        return false;
    }

    // Special case: if checking for a full 24 hours and caregiver has ANY segment available, consider available
    if (startMin === 0 && endMin === 1439 && segments.length === 3) {
        // For full day availability, check if ANY segment is available
        const hasAnyAvailability = segments.some(seg => {
            const key = dayKey + '_' + seg; // e.g., MONDAY_AM
            const val = normStr(String(emp[key] || '')).toLowerCase();
            return val === 'yes' || val === 'true';
        });

        if (hasAnyAvailability) {
            console.log(`${caregiverName} has some availability for full day on ${dayName}`);
            return true;
        }
        return false;
    }

    // Normal case: All overlapped segments must be available
    return segments.every(seg => {
        const key = dayKey + '_' + seg; // e.g., MONDAY_AM
        const val = normStr(String(emp[key] || '')).toLowerCase();
        const isAvailable = val === 'yes' || val === 'true';
        console.log(`${caregiverName} availability for ${dayName}_${seg}: ${isAvailable}`);
        return isAvailable;
    });
};

const getShiftSegmentsForWindow = (startMin, endMin) => {
    const segments = [];
    const bands = [
        { seg: 'NOC', start: 0, end: 360 },
        { seg: 'AM', start: 360, end: 720 },
        { seg: 'PM', start: 720, end: 1260 },
        { seg: 'NOC', start: 1260, end: 1440 }
    ];

    const seen = {};
    bands.forEach(b => {
        if (timeOverlap(startMin, endMin, b.start, b.end) && !seen[b.seg]) {
            segments.push(b.seg);
            seen[b.seg] = true;
        }
    });
    return segments;
};

// Enhanced leave check with end date support
const isCaregiverOnLeave = (caregiverName, isoDate, leavesListg, scheduleStartTime, scheduleEndTime) => {
    if (!caregiverName || !isoDate || !Array.isArray(leavesListg)) return false;

    const caregiverNameNorm = normName(caregiverName);

    return leavesListg.some(leave => {
        if (!leave) return false;

        const leaveStartDate = leave.Start_Date || '';
        const leaveEndDate = leave.End_Date || leaveStartDate; // Default to start date if end date not provided
        const leaveStartTime = leave.Start_Time || '';
        const leaveEndTime = leave.End_Time || '';
        const leaveCaregiver = leave.Caregiver || '';

        // Check if this leave applies to this caregiver
        if (normName(leaveCaregiver) !== caregiverNameNorm) return false;

        // Check if the schedule date falls within the leave date range
        if (!isDateInRange(isoDate, leaveStartDate, leaveEndDate)) return false;

        // If we have leave time info and schedule time info
        if (scheduleStartTime !== undefined && scheduleEndTime !== undefined &&
            leaveStartTime && leaveEndTime) {
            const leaveStartMin = parseTime(leaveStartTime);
            const leaveEndMin = parseTime(leaveEndTime);

            if (leaveStartMin !== null && leaveEndMin !== null) {
                // Check for time overlap
                return timeOverlap(scheduleStartTime, scheduleEndTime, leaveStartMin, leaveEndMin);
            }
        }

        // If no specific times, assume full day leave
        return true;
    });
};

const isBlockedByClient = (prefs, caregiverName) => {
    if (!prefs || !prefs.blockList || prefs.blockList.length === 0) return false;
    const nm = normName(caregiverName);
    return prefs.blockList.indexOf(nm) !== -1;
};

const getCaregiverProfile = (emp) => {
    if (!emp || !emp.fields) return {};

    const fields = emp.fields;
    return {
        name: normStr(fields.Employee_Full_Name || ''),
        nameNorm: normName(fields.Employee_Full_Name || ''),
        gender: normStr(fields.Gender || ''),
        genderNorm: normStr(fields.Gender || '').toLowerCase(),
        phys: safeParseNumber(fields.Physical_Capability_lbs || 0, 0),
        weightClass: normStr(fields.Weight_Class || ''),
        // FIX: Handle both array and string formats for skills
        skills: Array.isArray(fields.Skill_Type) ? fields.Skill_Type.map(s => normStr(s).toLowerCase()).filter(Boolean) :
            Array.isArray(fields.Experience) ? fields.Experience.map(s => normStr(s).toLowerCase()).filter(Boolean) :
                parseList(fields.Experience || fields.Skill_Type || ''),
        personality: parseList(fields.Personality_Match || ''),
        // FIX: Handle both array and string formats for languages  
        langs: Array.isArray(fields.Language) ? fields.Language.map(l => normStr(l).toLowerCase()).filter(Boolean) :
            Array.isArray(fields.Languages) ? fields.Languages.map(l => normStr(l).toLowerCase()).filter(Boolean) :
                parseList(fields.Language || fields.Languages || '')
    };
};


const getLanguageMatches = (profile, prefs) => {
    if (!profile || !profile.langs || !prefs || !prefs.langs) return 0;

    let matches = 0;
    // Give credit for English
    if (profile.langs.indexOf('english') !== -1) matches += 5;

    // Count matches with client preferences
    profile.langs.forEach(lang => {
        if (prefs.langs.indexOf(lang) !== -1) matches += 2;
    });

    return matches;
};

const getSkillMatches = (profile, prefs) => {
    if (!profile || !profile.skills || !prefs || !prefs.skills) return 0;

    let matches = 0;
    profile.skills.forEach(skill => {
        if (prefs.skills.indexOf(skill) !== -1) matches += 1;
    });

    return matches;
};

// Enhanced historical count with actual/expected caregiver logic
const getHistoricalCount = (caregiverName, clientName, scheduleData, scheduleStartDate, lookbackDays = 30) => {
    if (!caregiverName || !clientName || !Array.isArray(scheduleData) || !scheduleStartDate) return 0;

    const cgNorm = normName(caregiverName);
    const clientNorm = normName(clientName);
    const normalizedScheduleStartDate = normalizeDate(scheduleStartDate);
    const cutoffISO = moment(normalizedScheduleStartDate).subtract(lookbackDays, 'days').format('YYYY-MM-DD');

    console.log(`Historical count for ${caregiverName} - Schedule date: ${normalizedScheduleStartDate}, Cutoff: ${cutoffISO}`);

    let count = 0;
    for (let i = 0; i < scheduleData.length; i++) {
        const rec = scheduleData[i];
        if (!rec) continue;

        const recClient = normName(rec.Client_Name || '');
        if (recClient !== clientNorm) continue;

        const status = normStr(rec.Scheduling_Status || '');
        if (status !== 'Approved' && status !== 'Completed') continue;

        const sDate = normalizeDate(rec.Schedule_Start_Date || '');
        if (!sDate) continue;

        // Only consider records that are:
        // 1. Before the current schedule start date
        // 2. Within the lookback period
        if (sDate >= normalizedScheduleStartDate) {
            console.log(`Skipping future/same date record: ${sDate} >= ${normalizedScheduleStartDate}`);
            continue;
        }

        if (sDate < cutoffISO) {
            console.log(`Skipping old record: ${sDate} < ${cutoffISO}`);
            continue;
        }

        const actualCG = normName(rec.Actual_Caregiver || '');
        const expectedCG = normName(rec.Expected_Caregiver || '');
        if (actualCG === cgNorm || (actualCG === '' && expectedCG === cgNorm)) {
            count++;
            console.log(`Historical match found: ${sDate} for ${caregiverName}`);
        }
    }

    console.log(`Total historical count for ${caregiverName}: ${count}`);
    return count;
};

// Calculate total worked hours for a caregiver from scheduleListg
const calculateWorkedHours = (caregiverName, scheduleData, scheduleStartDate, lookbackDays = 7) => {
    if (!caregiverName || !Array.isArray(scheduleData) || !scheduleStartDate) return 0;

    const cgNorm = normName(caregiverName);
    const normalizedScheduleStartDate = normalizeDate(scheduleStartDate);
    let totalHours = 0;

    // Calculate cutoff date for lookback from the schedule start date
    const cutoffDate = moment(normalizedScheduleStartDate).subtract(lookbackDays, 'days').format('YYYY-MM-DD');

    console.log(`Work hours calculation for ${caregiverName} - Schedule date: ${normalizedScheduleStartDate}, Cutoff: ${cutoffDate}`);

    scheduleData.forEach(rec => {
        if (!rec) return;

        const scheduleDate = normalizeDate(rec.Schedule_Start_Date || '');
        if (!scheduleDate) return;

        // Only include schedules that are:
        // 1. Before the current schedule start date
        // 2. Within the lookback period
        if (scheduleDate >= normalizedScheduleStartDate) {
            console.log(`Skipping future/same date work hours: ${scheduleDate} >= ${normalizedScheduleStartDate}`);
            return;
        }

        if (scheduleDate < cutoffDate) {
            console.log(`Skipping old work hours record: ${scheduleDate} < ${cutoffDate}`);
            return;
        }

        const expectedCaregiver = normName(rec.Expected_Caregiver || '');
        const actualCaregiver = normName(rec.Actual_Caregiver || '');

        if (expectedCaregiver !== cgNorm && actualCaregiver !== cgNorm) return;

        const status = rec.Scheduling_Status || '';
        if (status !== 'Approved' && status !== 'Completed' && status !== 'Scheduled') return;

        const actualHours = safeParseNumber(rec.Actual_Hours, 0);
        const expectedHours = safeParseNumber(rec.Expected_Hours, 0);

        const hours = actualHours > 0 ? actualHours : expectedHours;
        totalHours += hours;
        console.log(`Added work hours: ${hours} from ${scheduleDate} for ${caregiverName}`);
    });

    console.log(`Total work hours for ${caregiverName}: ${totalHours}`);
    return totalHours;
};

// Check if client subscription is valid for the schedule date
const isClientSubscriptionValid = (clientData, scheduleDate) => {
    if (!clientData) return true;
    const effectiveFrom = clientData.Effective_From || '';
    const effectiveTo = clientData.Effective_To || '';

    // If no subscription dates are set, assume valid
    if (!effectiveFrom && !effectiveTo) return true;

    // Normalize all dates to YYYY-MM-DD format for comparison
    const normalizedScheduleDate = normalizeDate(scheduleDate);
    const normalizedEffectiveFrom = normalizeDate(effectiveFrom);
    const normalizedEffectiveTo = normalizeDate(effectiveTo);

    console.log("Checking date validity:", normalizedScheduleDate,
        "is between", normalizedEffectiveFrom, "and", normalizedEffectiveTo);

    // Check if schedule date falls within subscription period
    if (normalizedEffectiveFrom && normalizedScheduleDate < normalizedEffectiveFrom) return false;
    if (normalizedEffectiveTo && normalizedScheduleDate > normalizedEffectiveTo) return false;

    return true;
};

// Check if client is on leave
const isClientOnLeave = (clientId, clientName, scheduleDate, scheduleStartTime, scheduleEndTime, clientLeaves) => {
    if (!clientId && !clientName || !scheduleDate || !Array.isArray(clientLeaves)) return false;
    const clientNameNorm = normName(clientName);

    return clientLeaves.some(leave => {
        if (!leave) return false;
        // Match by client ID or name
        const leaveClientId = leave.Client_Name || '';
        const leaveClientType = normName(leave.Client_Type || '');

        // Skip if this leave doesn't apply to this client
        if (clientId && leaveClientId !== clientId && leaveClientType !== clientNameNorm) return false;
        if (!clientId && leaveClientType !== clientNameNorm) return false;

        const leaveStartDate = leave.Start_Date || '';
        const leaveEndDate = leave.End_Date || leaveStartDate;

        // Check if schedule date falls within leave date range
        if (!isDateInRange(scheduleDate, leaveStartDate, leaveEndDate)) return false;
        // If we have leave time info and schedule time info
        if (scheduleStartTime !== undefined && scheduleEndTime !== undefined) {
            const leaveStartTime = parseTime(leave.Start_Time || '');
            const leaveEndTime = parseTime(leave.End_Time || '');

            if (leaveStartTime !== null && leaveEndTime !== null) {
                // Check for time overlap
                return timeOverlap(scheduleStartTime, scheduleEndTime, leaveStartTime, leaveEndTime);
            }
        }

        // If no specific times, assume full day leave
        return true;
    });
};

// Check client type compatibility
const checkClientTypeCompatibility = (caregiverName, clientData, employeesData) => {
    if (!caregiverName || !clientData || !Array.isArray(employeesData)) return true;

    const cgNorm = normName(caregiverName);
    const clientType = normStr(clientData.Client_Type || '').toLowerCase();

    // If no client type specified, assume compatible
    if (!clientType || clientType === 'any') return true;

    // Find employee record
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === cgNorm);
    if (!emp) return false;

    console.log(`Checking client type compatibility for ${caregiverName}:`, {
        clientType: clientType,
        caregiverPrivate: emp.Private,
        caregiverFacility: emp.Facility
    });

    // Check compatibility based on Private and Facility fields
    if (clientType === 'private') {
        // For private clients, caregiver must have Private = "Yes"
        const canWorkPrivate = normStr(emp.Private || '').toLowerCase() === 'yes';
        console.log(`Private client compatibility: ${canWorkPrivate}`);
        return canWorkPrivate;
    } else if (clientType === 'facility') {
        // For facility clients, caregiver must have Facility = "Yes"  
        const canWorkFacility = normStr(emp.Facility || '').toLowerCase() === 'yes';
        console.log(`Facility client compatibility: ${canWorkFacility}`);
        return canWorkFacility;
    }

    // If client type is something else, assume compatible
    return true;
};


// Check transportation match
const checkTransportationMatch = (caregiverName, clientData, employeesData) => {
    if (!caregiverName || !clientData || !Array.isArray(employeesData)) return true;

    const clientTransportNeeded = normStr(clientData.Transportation_Needs || '').toLowerCase();

    // If client doesn't need transportation, any caregiver is fine
    if (!clientTransportNeeded || clientTransportNeeded === 'no') return true;

    const cgNorm = normName(caregiverName);

    // Find employee record
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === cgNorm);
    if (!emp) return false;

    const caregiverTransport = normStr(emp.Transportation || '').toLowerCase();

    // Check if caregiver can provide transportation
    return caregiverTransport === 'yes' || caregiverTransport === 'true';
};

// Check weekly hours distribution
const weeklyDistributionCheck = (caregiverName, candidateShiftHours, employeesData, scheduleData) => {
    if (!caregiverName || !employeesData) {
        return { allowed: true, projectedHours: 0, scoreAdjustment: 0 };
    }

    const cgNorm = normName(caregiverName);
    candidateShiftHours = safeParseNumber(candidateShiftHours, 0);

    // Find employee record
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === cgNorm);
    if (!emp) return { allowed: true, projectedHours: 0, scoreAdjustment: 0 };

    const targetWeeklyHours = safeParseNumber(emp.Target_Weekly_Hours, 0);
    const maxWeeklyHours = safeParseNumber(emp.Max_Weekly_Hours, 0);

    // Calculate current weekly hours from schedule data
    let currentWeeklyHours = 0;
    if (Array.isArray(scheduleData)) {
        const startOfWeek = moment().startOf('week').format('YYYY-MM-DD');
        const endOfWeek = moment().endOf('week').format('YYYY-MM-DD');

        scheduleData.forEach(schedule => {
            if (!schedule) return;

            const expectedCaregiver = normName(schedule.Expected_Caregiver || '');
            const actualCaregiver = normName(schedule.Actual_Caregiver || '');

            if (expectedCaregiver !== cgNorm && actualCaregiver !== cgNorm) return;

            const scheduleDate = schedule.Schedule_Start_Date || '';
            if (scheduleDate < startOfWeek || scheduleDate > endOfWeek) return;

            const actualHours = safeParseNumber(schedule.Actual_Hours, 0);
            const expectedHours = safeParseNumber(schedule.Expected_Hours, 0);

            currentWeeklyHours += actualHours > 0 ? actualHours : expectedHours;
        });
    }

    const projectedHours = currentWeeklyHours + candidateShiftHours;
    let scoreAdjustment = 0;
    let allowed = true;

    // Check if exceeding max hours
    if (maxWeeklyHours > 0 && projectedHours > maxWeeklyHours + 1) {
        allowed = false;
    }

    // Favor caregivers who are under their target hours
    if (targetWeeklyHours > 0 && currentWeeklyHours < targetWeeklyHours) {
        // Give bonus points proportional to how much they are under target
        const underHours = targetWeeklyHours - currentWeeklyHours;
        scoreAdjustment = Math.min(15, (underHours / targetWeeklyHours) * 15);
    }

    return {
        allowed: allowed,
        wouldExceedMax: maxWeeklyHours > 0 && projectedHours > maxWeeklyHours,
        projectedHours: projectedHours,
        scoreAdjustment: scoreAdjustment
    };
};

// Priority check helper functions
const checkGenderPreference = (caregiverName, clientData, employeesData, isMandatory) => {
    const result = { passed: true, score: 0 };

    if (!caregiverName || !clientData || !Array.isArray(employeesData)) return result;

    const clientGenderPref = normStr(clientData.Gender_Preference || '').toLowerCase();
    const genderPrefStrict = normStr(clientData.Gender_Preference_Strict || '').toLowerCase();

    // No preference or "Either"/"Any" = automatic pass with neutral score
    if (!clientGenderPref || clientGenderPref === 'any' || clientGenderPref === 'either') {
        result.score = 0; // Neutral - no preference to check or accepts all genders
        return result;
    }

    const cgNorm = normName(caregiverName);
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === cgNorm);

    if (!emp) {
        result.passed = false;
        return result;
    }

    const caregiverGender = normStr(emp.Gender || '').toLowerCase();

    // If caregiver gender matches client preference
    if (caregiverGender === clientGenderPref) {
        result.score = 10; // Perfect match = bonus points
    } else {
        // Mismatch handling - only enforce if Gender_Preference_Strict is "Yes"
        if (genderPrefStrict === 'yes' && isMandatory) {
            result.passed = false; // EXCLUDE if strict AND mandatory
        } else if (genderPrefStrict === 'yes') {
            result.passed = false; // EXCLUDE if strict (regardless of mandatory setting)
        } else {
            result.score = 0; // No penalty if not strict, just no bonus points
        }
    }

    return result;
};

const checkPhysicalCapability = (caregiverName, clientData, employeesData, isMandatory) => {
    const result = { passed: true, score: 0 };

    if (!caregiverName || !clientData || !Array.isArray(employeesData)) return result;

    const clientPhysReq = safeParseNumber(clientData.Physical_Capability_lbs, 0);
    const clientWeightClass = normStr(clientData.Weight_Class || '').toLowerCase();

    // If no physical requirements, return neutral
    if (clientPhysReq <= 0 && !clientWeightClass) {
        result.score = 0;
        return result;
    }

    const cgNorm = normName(caregiverName);
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === cgNorm);

    if (!emp) {
        result.passed = false;
        return result;
    }

    const caregiverPhysCap = safeParseNumber(emp.Physical_Capability_lbs, 0);
    const caregiverWeightClass = normStr(emp.Weight_Class || '').toLowerCase();

    let physicalScore = 0;
    let physicalPassed = true;

    // Check lbs capability if specified
    if (clientPhysReq > 0) {
        if (caregiverPhysCap >= clientPhysReq) {
            const ratio = Math.min(caregiverPhysCap / clientPhysReq, 2);
            physicalScore += 5 + (ratio - 1) * 5; // 5 to 10 points
        } else {
            physicalPassed = false;
        }
    }

    // Check weight class compatibility (SAME LOGIC AS checkandAssignCaregiver.js)
    if (clientWeightClass) {
        let weightClassMatch = false;

        if (clientWeightClass === "standard") {
            weightClassMatch = (caregiverWeightClass === "standard" || caregiverWeightClass === "heavy");
        } else if (clientWeightClass === "heavy") {
            weightClassMatch = (caregiverWeightClass === "heavy");
        }

        if (weightClassMatch) {
            physicalScore += 3; // Bonus for weight class compatibility
        } else {
            physicalPassed = false;
        }

        // Debug logging (match the checkandAssignCaregiver.js pattern)
        if (!weightClassMatch) {
            console.log("Physical capability reject:", {
                caregiverName: caregiverName,
                caregiverWeightClass: caregiverWeightClass,
                clientWeightClass: clientWeightClass,
                isMandatory: isMandatory
            });
        }
    }

    if (physicalPassed) {
        result.score = physicalScore;
    } else {
        if (isMandatory) {
            result.passed = false; // EXCLUDE if mandatory
        } else {
            result.score = 0; // No penalty, just no bonus points
        }
    }

    return result;
};

const checkLanguagePreference = (caregiverName, clientData, employeesData, isMandatory) => {
    const result = { passed: true, score: 0 };

    if (!caregiverName || !clientData || !Array.isArray(employeesData)) return result;

    const clientLangs = parseList(clientData.Language_Preferences || '');

    // No language preferences = automatic pass
    if (!clientLangs.length) {
        result.score = 0; // Neutral - no preference to check
        return result;
    }

    const cgNorm = normName(caregiverName);
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === cgNorm);

    if (!emp) {
        result.passed = false;
        return result;
    }

    const caregiverLangs = parseList(emp.Language || emp.Languages || '');

    // Check if caregiver has English (always a small bonus)
    if (caregiverLangs.some(lang => lang === 'english')) {
        result.score += 2;
    }

    // Count matches with client preferences
    let matches = 0;
    for (const clientLang of clientLangs) {
        if (caregiverLangs.some(lang => lang === clientLang)) {
            matches++;
        }
    }

    if (matches > 0) {
        // More matches = higher score
        result.score += Math.min(matches * 3, 8);
    } else {
        // No language matches
        if (isMandatory) {
            result.passed = false; // EXCLUDE if mandatory
        } else {
            // Keep existing score (from English bonus if any), no penalty
        }
    }

    return result;
};

const checkSkillsRequirement = (caregiverName, clientData, employeesData, isMandatory) => {
    const result = { passed: true, score: 0 };

    if (!caregiverName || !clientData || !Array.isArray(employeesData)) return result;

    const clientSkills = parseList(clientData.Skills_Preferences || '');

    // No skill requirements = automatic pass
    if (!clientSkills.length) {
        result.score = 0; // Neutral - no requirement to check
        return result;
    }

    const cgNorm = normName(caregiverName);
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === cgNorm);

    if (!emp) {
        result.passed = false;
        return result;
    }

    const caregiverSkills = parseList(emp.Skill_Type || emp.Experience || '');

    // Count matches
    let matches = 0;
    for (const clientSkill of clientSkills) {
        if (caregiverSkills.some(skill => skill === clientSkill)) {
            matches++;
        }
    }

    if (matches > 0) {
        // Proportion of matched skills
        const matchRatio = matches / clientSkills.length;
        result.score = Math.min(matchRatio * 10, 10);
    } else {
        // No skill matches
        if (isMandatory) {
            result.passed = false; // EXCLUDE if mandatory
        } else {
            result.score = 0; // No penalty, just no bonus points
        }
    }

    return result;
};

const checkPersonalityMatch = (caregiverName, clientData, employeesData, isMandatory) => {
    const result = { passed: true, score: 0 };

    if (!caregiverName || !clientData || !Array.isArray(employeesData)) return result;

    const clientPersonality = parseList(clientData.Personality_Match || '');

    // No personality preferences = automatic pass
    if (!clientPersonality.length) {
        result.score = 0; // Neutral - no preference to check
        return result;
    }

    const cgNorm = normName(caregiverName);
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === cgNorm);

    if (!emp) {
        result.passed = false;
        return result;
    }

    const caregiverPersonality = parseList(emp.Personality_Match || '');

    // Count matches
    let matches = 0;
    for (const trait of clientPersonality) {
        if (caregiverPersonality.some(t => t === trait)) {
            matches++;
        }
    }

    if (matches > 0) {
        // Proportion of matched traits
        const matchRatio = matches / clientPersonality.length;
        result.score = Math.min(matchRatio * 8, 8);
    } else {
        // No personality matches
        if (isMandatory) {
            result.passed = false; // EXCLUDE if mandatory
        } else {
            result.score = 0; // No penalty, just no bonus points
        }
    }

    return result;
};

// Evaluate candidate with priorities
const evaluateCandidateWithPriorities = (candidateName, candidateShiftHours, clientData, employeesData, scheduleData, prioritySettings) => {
    if (!candidateName || !clientData || !prioritySettings) {
        return { eligible: true, reasons: [], score: 0, mandatory: { passed: true, reasons: [] } };
    }

    const reasons = [];
    let score = 0;
    let mandatoryPassed = true;
    const mandatoryReasons = [];

    // Check if priorities exist
    if (!prioritySettings.order || prioritySettings.order.length === 0) {
        return { eligible: true, reasons, score, mandatory: { passed: true, reasons: [] } };
    }

    // Get caregiver employee record
    const caregiverNameNorm = normName(candidateName);
    const emp = employeesData.find(e => normName(e.Employee_Full_Name || '') === caregiverNameNorm);

    if (!emp) {
        return { eligible: false, reasons: ["Caregiver not found in employee records"], score: 0, mandatory: { passed: false, reasons: ["Caregiver not found"] } };
    }

    // Weekly hours check
    const hoursCheck = weeklyDistributionCheck(candidateName, candidateShiftHours, employeesData, scheduleData);
    if (!hoursCheck.allowed) {
        return {
            eligible: false,
            reasons: [`Weekly hours limit exceeded (${hoursCheck.projectedHours}/${emp.Max_Weekly_Hours})`],
            score: 0,
            mandatory: { passed: false, reasons: ["Weekly hours limit exceeded"] }
        };
    }

    // Add hours distribution score adjustment
    score += hoursCheck.scoreAdjustment;
    if (hoursCheck.scoreAdjustment > 0) {
        reasons.push(`Weekly hours distribution bonus: +${hoursCheck.scoreAdjustment.toFixed(2)}`);
    }

    // Process each priority in order
    prioritySettings.order.forEach(priority => {
        const priorityName = normStr(priority);
        const isMandatory = !!prioritySettings.mandatory[priorityName];
        const isActive = !!prioritySettings.active[priorityName];

        if (!isActive) return;

        // Check each priority type
        switch (priorityName.toLowerCase()) {
            case 'gender preference':
                const genderResult = checkGenderPreference(candidateName, clientData, employeesData, isMandatory);
                if (genderResult.passed) {
                    score += genderResult.score;
                    reasons.push(`Gender match: +${genderResult.score.toFixed(2)}`);
                } else if (isMandatory) {
                    mandatoryPassed = false;
                    mandatoryReasons.push("Gender preference not matched (mandatory)");
                }
                break;

            case 'physical capability':
                const physicalResult = checkPhysicalCapability(candidateName, clientData, employeesData, isMandatory);
                if (physicalResult.passed) {
                    score += physicalResult.score;
                    reasons.push(`Physical capability: +${physicalResult.score.toFixed(2)}`);
                } else if (isMandatory) {
                    mandatoryPassed = false;
                    mandatoryReasons.push("Physical capability not sufficient (mandatory)");
                }
                break;

            case 'language preference':
                const languageResult = checkLanguagePreference(candidateName, clientData, employeesData, isMandatory);
                if (languageResult.passed) {
                    score += languageResult.score;
                    reasons.push(`Language match: +${languageResult.score.toFixed(2)}`);
                } else if (isMandatory) {
                    mandatoryPassed = false;
                    mandatoryReasons.push("Language preference not matched (mandatory)");
                }
                break;

            case 'skill requirements':
                const skillResult = checkSkillsRequirement(candidateName, clientData, employeesData, isMandatory);
                if (skillResult.passed) {
                    score += skillResult.score;
                    reasons.push(`Skills match: +${skillResult.score.toFixed(2)}`);
                } else if (isMandatory) {
                    mandatoryPassed = false;
                    mandatoryReasons.push("Required skills not matched (mandatory)");
                }
                break;

            case 'personality match':
                const personalityResult = checkPersonalityMatch(candidateName, clientData, employeesData, isMandatory);
                if (personalityResult.passed) {
                    score += personalityResult.score;
                    reasons.push(`Personality match: +${personalityResult.score.toFixed(2)}`);
                } else if (isMandatory) {
                    mandatoryPassed = false;
                    mandatoryReasons.push("Personality traits not matched (mandatory)");
                }
                break;

            case 'client type compatibility':
                if (!checkClientTypeCompatibility(candidateName, clientData, employeesData)) {
                    if (isMandatory) {
                        mandatoryPassed = false;
                        mandatoryReasons.push("Client type not compatible (mandatory)");
                    }
                } else {
                    score += 5;
                    reasons.push("Client type compatible: +5.00");
                }
                break;

            case 'transportation requirements':
                if (!checkTransportationMatch(candidateName, clientData, employeesData)) {
                    if (isMandatory) {
                        mandatoryPassed = false;
                        mandatoryReasons.push("Transportation requirements not met (mandatory)");
                    }
                } else if (clientData.Transportation_Needs) {
                    score += 5;
                    reasons.push("Transportation requirements met: +5.00");
                }
                break;

            case 'blocklist status':
                if (isBlockedByClient(clientData, candidateName)) {
                    mandatoryPassed = false;
                    mandatoryReasons.push("Caregiver is on client's blocklist");
                }
                break;
        }
    });

    return {
        eligible: mandatoryPassed,
        reasons: reasons,
        score: score,
        mandatory: {
            passed: mandatoryPassed,
            reasons: mandatoryReasons
        }
    };
};

const findAvailableCaregivers = () => {
    // Extract client slot information from fields
    const clientNameInput = fields["Client_Name"].value;
    const day = fields["Day"].value;
    const scheduleStartDate = fields["Schedule_Start_Date"].value;
    const scheduleStartTimeStr = fields["Schedule_Start_Time"].value;
    const scheduleEndTimeStr = fields["Schedule_End_Time"].value;

    // Get expected caregiver to exclude from the list
    const expectedCaregiver = fields["Expected_Caregiver"].value;
    const expectedCaregiverNorm = expectedCaregiver ? normName(expectedCaregiver) : null;

    console.log("=== FINDING AVAILABLE CAREGIVERS ===");
    console.log("Client:", clientNameInput);
    console.log("Day:", day);
    console.log("Date:", scheduleStartDate);
    console.log("Time:", scheduleStartTimeStr, "-", scheduleEndTimeStr);
    console.log("Expected Caregiver to exclude:", expectedCaregiver);

    // Parse times
    const scheduleStartTime = parseTime(scheduleStartTimeStr);
    const scheduleEndTime = parseTime(scheduleEndTimeStr);

    console.log("Parsed times - Start:", scheduleStartTime, "minutes, End:", scheduleEndTime, "minutes");

    // Calculate shift duration in hours
    const shiftDurationMinutes = scheduleEndTime - scheduleStartTime;
    const shiftDurationHours = shiftDurationMinutes / 60;

    console.log("Shift duration:", shiftDurationHours, "hours");

    // Find the client record
    const clientNameNorm = normName(clientNameInput);
    const clientData = Array.isArray(clientListg) ?
        clientListg.find(c => normName(c.Client_Full_Name || '') === clientNameNorm) : null;

    console.log("Client data found:", !!clientData);
    if (clientData) {
        console.log("Client preferences:", {
            Gender: clientData.Gender_Preference,
            Physical: clientData.Physical_Capability_lbs,
            Languages: clientData.Language_Preferences,
            Skills: clientData.Skills_Preferences,
            Personality: clientData.Personality_Match,
            BlockList: clientData.Caregiver_Block_List,
            Primary: clientData.Primary_Caregiver
        });
    }

    // Check client subscription validity
    if (clientData && !isClientSubscriptionValid(clientData, scheduleStartDate)) {
        console.log("❌ CLIENT SUBSCRIPTION NOT VALID - returning empty list");
        return [];
    }

    // Check if client is on leave
    if (clientData && isClientOnLeave(
        clientData.id,
        clientNameInput,
        scheduleStartDate,
        scheduleStartTime,
        scheduleEndTime,
        clientLeaveListg
    )) {
        console.log("❌ CLIENT IS ON LEAVE - returning empty list");
        return [];
    }

    // Get settings for scoring weights from completesettingsData
    const scoringWeights = extractScoringWeights(completesettingsData);
    const rawPriorities = extractPrioritySettings(completesettingsData);
    const priorities = normalizePrioritySettings(rawPriorities);

    console.log("Scoring weights:", scoringWeights);
    console.log("Priority settings:", priorities);

    // Helper function to check if a condition is mandatory from settings
    const isConditionMandatory = (name) => priorities && priorities.mandatory
        ? !!priorities.mandatory[normStr(name).toLowerCase()] : false;

    // Helper function to check if a condition is active from settings
    const isConditionActive = (name) => priorities && priorities.active
        ? !!priorities.active[normStr(name).toLowerCase()] : false;

    // Track all available caregivers and their scores
    const availableCaregivers = [];
    const dimensionStats = [];

    // Generate a temporary client ID for conflict checking
    const clientId = "client-" + clientNameInput.replace(/\s+/g, '-').toLowerCase();

    // Extract client preferences like Crete Schdeusl.js
    const clientPrefs = clientData ? {
        genderPref: normStr(clientData.Gender_Preference || ''),
        genderPrefNorm: normStr(clientData.Gender_Preference || '').toLowerCase(),
        physReq: safeParseNumber(clientData.Physical_Capability_lbs || 0, 0),
        langs: parseList(clientData.Language_Preferences || ''),
        skills: parseList(clientData.Skills_Preferences || ''),
        personality: parseList(clientData.Personality_Match || ''),
        blockList: parseList(clientData.Caregiver_Block_List || '')
    } : {
        genderPref: '', genderPrefNorm: '', physReq: 0,
        langs: [], skills: [], personality: [], blockList: []
    };

    console.log("Processed client preferences:", clientPrefs);
    console.log("Total employees to check:", employeesListg.length);

    // Process each employee from employeesListg
    employeesListg.forEach((employee, index) => {
        const caregiverName = employee.Employee_Full_Name;

        console.log(`\n=== CHECKING CAREGIVER ${index + 1}/${employeesListg.length}: ${caregiverName} ===`);

        // Skip if name is empty
        if (!caregiverName) {
            console.log("❌ EXCLUDED: No name provided");
            return;
        }

        // Skip if this is the expected caregiver (exclude from available list)
        if (expectedCaregiverNorm && normName(caregiverName) === expectedCaregiverNorm) {
            console.log("❌ EXCLUDED: Is the expected caregiver - excluding from available list");
            return;
        }

        // Create a wrapper with fields structure for compatibility with helper functions
        const empRecord = {
            id: employee.id || "",
            fields: employee
        };

        console.log("Employee details:", {
            Gender: employee.Gender,
            Physical_Capability: employee.Physical_Capability_lbs,
            Languages: employee.Language || employee.Languages,
            Skills: employee.Skill_Type || employee.Experience,
            Personality: employee.Personality_Match,
            Target_Hours: employee.Target_Weekly_Hours,
            Max_Hours: employee.Max_Weekly_Hours
        });

        // Check if caregiver is available for this time slot based on their schedule preferences
        const timeSlotAvailable = isCaregiverAvailableForSchedule(caregiverName, day, scheduleStartTime, scheduleEndTime, employeesListg);
        console.log("Time slot availability check:", timeSlotAvailable);
        if (!timeSlotAvailable) {
            console.log("❌ EXCLUDED: Not available for time slot on", day);
            return;
        }

        // Enhanced leave check with end date support
        const onLeave = isCaregiverOnLeave(caregiverName, scheduleStartDate, leavesListg, scheduleStartTime, scheduleEndTime);
        console.log("Leave check:", onLeave);
        if (onLeave) {
            console.log("❌ EXCLUDED: On leave on", scheduleStartDate);
            return;
        }

        // Check for schedule conflicts using scheduleListg
        const hasConflict = hasScheduleConflict(caregiverName, clientId, scheduleStartDate, scheduleStartTime, scheduleEndTime, scheduleListg);
        console.log("Schedule conflict check:", hasConflict);
        if (hasConflict) {
            console.log("❌ EXCLUDED: Has scheduling conflict");
            return;
        }

        // 1. GENDER PREFERENCE CHECK (ALWAYS ENFORCE IF SET)
        if (clientData && clientData.Gender_Preference) {
            const clientGenderPref = normStr(clientData.Gender_Preference || '').toLowerCase();
            const genderPrefStrict = normStr(clientData.Gender_Preference_Strict || '').toLowerCase();
            const caregiverGender = normStr(employee.Gender || '').toLowerCase();

            console.log("Gender check:", {
                clientPreference: clientGenderPref,
                caregiverGender: caregiverGender,
                isStrict: genderPrefStrict === 'yes',
                match: caregiverGender === clientGenderPref
            });

            // Handle "Either" preference - both male and female are acceptable
            if (clientGenderPref === 'either' || clientGenderPref === 'any') {
                console.log("ℹ️  Client preference is 'Either' - all genders acceptable");
                // Continue without exclusion - no gender restriction
            } else if (clientGenderPref && clientGenderPref !== 'any') {
                // Only enforce gender preference as mandatory if Gender_Preference_Strict is "Yes"
                if (genderPrefStrict === 'yes' && caregiverGender !== clientGenderPref) {
                    console.log("❌ EXCLUDED: Gender preference not matched (strict enforcement)");
                    return;
                }

                // If not strict, we still prefer the gender match but don't exclude non-matches
                if (genderPrefStrict !== 'yes' && caregiverGender !== clientGenderPref) {
                    console.log("ℹ️  Gender preference not matched but not strict - continuing evaluation");
                }
            }
        }


        // 2. PHYSICAL CAPABILITY CHECK (ALWAYS ENFORCE IF SET)
        if (clientData && (clientData.Physical_Capability_lbs || clientData.Weight_Class)) {
            const clientPhysReq = safeParseNumber(clientData.Physical_Capability_lbs, 0);
            const clientWeightClass = normStr(clientData.Weight_Class || '').toLowerCase();
            const caregiverPhysCap = safeParseNumber(employee.Physical_Capability_lbs, 0);
            const caregiverWeightClass = normStr(employee.Weight_Class || '').toLowerCase();

            console.log("Physical capability check:", {
                clientRequirement: clientPhysReq,
                clientWeightClass: clientWeightClass,
                caregiverCapability: caregiverPhysCap,
                caregiverWeightClass: caregiverWeightClass
            });

            // Check weight class compatibility first
            if (clientWeightClass) {
                let weightClassMatch = false;

                if (clientWeightClass === "standard") {
                    weightClassMatch = (caregiverWeightClass === "standard" || caregiverWeightClass === "heavy");
                } else if (clientWeightClass === "heavy") {
                    weightClassMatch = (caregiverWeightClass === "heavy");
                }

                if (!weightClassMatch) {
                    console.log("❌ EXCLUDED: Weight class requirement not met");
                    return;
                }
            }

            // Check physical capability in lbs
            if (clientPhysReq > 0 && caregiverPhysCap < clientPhysReq) {
                console.log("❌ EXCLUDED: Physical capability requirement not met");
                return;
            }
        }

        // 3. BLOCK LIST CHECK
        if (clientData && isBlockedByClient(clientPrefs, caregiverName)) {
            console.log("❌ EXCLUDED: Blocked by client");
            return;
        }

        // 4. CLIENT TYPE COMPATIBILITY CHECK
        if (clientData && clientData.Client_Type) {
            const clientTypeCompatible = checkClientTypeCompatibility(caregiverName, clientData, employeesListg);
            if (!clientTypeCompatible) {
                console.log("❌ EXCLUDED: Not compatible with client type");
                return;
            }
        }

        // 5. TRANSPORTATION REQUIREMENTS CHECK
        if (clientData && normStr(clientData.Transportation_Needed_ || '').toLowerCase() === 'yes') {
            const transportationOk = checkTransportationMatch(caregiverName, clientData, employeesListg);
            if (!transportationOk) {
                console.log("❌ EXCLUDED: Cannot meet transportation requirements");
                return;
            }
        }

        // Remove all the conditional settings-based checks below this point
        // (Remove the blocklistActive, clientTypeActive, transportActive sections)

        // 6. WEEKLY HOURS CHECK
        const hoursCheck = weeklyDistributionCheck(caregiverName, shiftDurationHours, employeesListg, scheduleListg);
        console.log("Hours check result:", hoursCheck);
        if (!hoursCheck.allowed) {
            console.log("❌ EXCLUDED: Would exceed maximum weekly hours");
            return;
        }

        console.log("✅ PASSED ALL BASIC CHECKS - Adding to available list");

        // Calculate raw scores exactly like Crete Schdeusl.js
        const profile = getCaregiverProfile(empRecord);
        console.log("Caregiver profile:", profile);

        // Add debugging for skills specifically
        console.log("Raw Skill_Type from employee:", employee.Skill_Type);
        console.log("Raw Experience from employee:", employee.Experience);
        console.log("Processed skills in profile:", profile.skills);

        // Raw language matches
        let rawLanguageMatches = 0;
        if (clientPrefs.langs.length && profile && profile.langs.length) {
            console.log("Checking language matches:");
            console.log("Client languages:", clientPrefs.langs);
            console.log("Caregiver languages:", profile.langs);
            for (let li = 0; li < clientPrefs.langs.length; li++) {
                if (profile.langs.indexOf(clientPrefs.langs[li]) !== -1) {
                    rawLanguageMatches++;
                    console.log("✅ Language match found:", clientPrefs.langs[li]);
                }
            }
        }
        console.log("Raw language matches:", rawLanguageMatches);

        // Raw skill matches
        let rawSkillMatches = 0;
        if (clientPrefs.skills.length && profile && profile.skills.length) {
            console.log("Checking skill matches:");
            console.log("Client skills:", clientPrefs.skills);
            console.log("Caregiver skills:", profile.skills);
            for (let si = 0; si < clientPrefs.skills.length; si++) {
                if (profile.skills.indexOf(clientPrefs.skills[si]) !== -1) {
                    rawSkillMatches++;
                    console.log("✅ Skill match found:", clientPrefs.skills[si]);
                }
            }
        } else {
            console.log("❌ Skill matching skipped - Client skills:", clientPrefs.skills.length, "Caregiver skills:", profile.skills ? profile.skills.length : 0);
        }
        console.log("Raw skill matches:", rawSkillMatches);

        // Raw historical count
        const rawHistorical = getHistoricalCount(caregiverName, clientNameInput, scheduleListg, scheduleStartDate, 30);
        console.log("Historical work count (30 days before schedule date):", rawHistorical);

        // Calculate client-specific worked hours (like Crete Schdeusl.js) - updated to filter by date
        let clientSpecificHours = 0;
        const caregiverNameNorm = normName(caregiverName);
        const clientNameForHistory = normName(clientNameInput);
        const normalizedScheduleStartDate = normalizeDate(scheduleStartDate);

        console.log("Calculating client-specific hours before schedule date...");
        scheduleListg.forEach(rec => {
            if (!rec) return;

            const recordDate = normalizeDate(rec.Schedule_Start_Date || '');
            if (!recordDate) return;

            // Only consider records before the schedule start date
            if (recordDate >= normalizedScheduleStartDate) {
                console.log(`Skipping future/same date client hours: ${recordDate} >= ${normalizedScheduleStartDate}`);
                return;
            }

            const recordClientName = normName(rec.Client_Name || '');
            const recordCaregiverName = normName(rec.Actual_Caregiver || '');
            const status = rec.Scheduling_Status || '';
            const hours = safeParseNumber(rec.Actual_Hours || 0, 0);

            if (recordClientName === clientNameForHistory &&
                recordCaregiverName === caregiverNameNorm &&
                (status === 'Approved' || status === 'Completed' || status === 'Scheduled Completed')) {
                clientSpecificHours += hours;
                console.log("Added client-specific hours from record:", hours, "Date:", recordDate, "Status:", status);
            }
        });
        console.log("Total client-specific hours (before schedule date):", clientSpecificHours);

        // Check if this is the primary caregiver
        const isPrimary = clientData && normName(clientData.Primary_Caregiver || '') === normName(caregiverName);
        console.log("Is primary caregiver:", isPrimary);

        let priorityScore = 0;
        let priorityEligible = true;
        if (priorities.order.length) {
            const evalRes = evaluateCandidateWithPriorities(
                caregiverName,
                shiftDurationHours,
                clientData,
                employeesListg,
                scheduleListg,
                priorities
            );
            priorityEligible = evalRes.eligible;
            priorityScore = evalRes.score;
            if (!priorityEligible) {
                console.log("❌ EXCLUDED: Failed mandatory priority checks:", evalRes.mandatory.reasons);
                return;
            }
        }

        // Store dimension stats for later normalization
        dimensionStats.push({
            caregiverName: caregiverName,
            rawLanguage: rawLanguageMatches,
            rawSkills: rawSkillMatches,
            rawHistorical: rawHistorical,
            clientSpecificHours: clientSpecificHours
        });

        // Add to available caregivers list
        availableCaregivers.push({
            caregiverId: empRecord.id,
            name: caregiverName,
            isPrimary: isPrimary,
            profile: profile,
            priorityScore: priorityScore,
            hoursCheck: hoursCheck,
            rawScores: {
                language: rawLanguageMatches,
                skills: rawSkillMatches,
                historical: rawHistorical,
                clientHours: clientSpecificHours
            }
        });

        console.log("✅ ADDED TO AVAILABLE LIST");
    });


    console.log(`\n=== SCORING PHASE ===`);
    console.log("Available caregivers count:", availableCaregivers.length);

    if (availableCaregivers.length === 0) {
        console.log("❌ No available caregivers found");
        return [];
    }

    // Calculate total client hours for work hours scoring (exactly like Crete Schdeusl.js)
    let totalClientHours = 0;
    const actualWorkedHoursMap = {};
    const normalizedScheduleStartDate = normalizeDate(scheduleStartDate);

    console.log("\n=== CALCULATING TOTAL CLIENT HOURS (BEFORE SCHEDULE DATE) ===");
    scheduleListg.forEach(rec => {
        if (!rec) return;
        if (normName(rec.Client_Name || '') !== normName(clientNameInput)) return;

        const recordDate = normalizeDate(rec.Schedule_Start_Date || '');
        if (!recordDate) return;

        // Only consider records before the schedule start date
        if (recordDate >= normalizedScheduleStartDate) {
            console.log(`Skipping future/same date total hours: ${recordDate} >= ${normalizedScheduleStartDate}`);
            return;
        }

        const status = normStr(rec.Scheduling_Status || '');
        // ✅ FIXED: Include 'Scheduled Completed' status
        if (status !== 'Approved' && status !== 'Completed' && status !== 'Scheduled Completed') return;

        // ✅ FIXED: Use Expected_Hours when Actual_Hours is 0 or missing
        const actualHours = safeParseNumber(rec.Actual_Hours, 0);
        const expectedHours = safeParseNumber(rec.Expected_Hours, 0);
        const hours = actualHours > 0 ? actualHours : expectedHours;

        if (hours <= 0) return;

        // ✅ FIXED: Use Actual_Caregiver if available, otherwise Expected_Caregiver
        const actualCG = normName(rec.Actual_Caregiver || '');
        const expectedCG = normName(rec.Expected_Caregiver || '');
        const cgName = actualCG || expectedCG;

        if (!cgName) return;

        console.log(`Adding total hours for ${cgName}: ${hours} from ${recordDate} (Status: ${status}, Actual: ${actualHours}, Expected: ${expectedHours})`);

        totalClientHours += hours;
        actualWorkedHoursMap[cgName] = (actualWorkedHoursMap[cgName] || 0) + hours;
    });

    console.log("Total client hours (before schedule date):", totalClientHours);
    console.log("Worked hours map (before schedule date):", actualWorkedHoursMap);

    console.log("\n=== CALCULATING WEIGHTED SCORES ===");
    availableCaregivers.forEach(c => {
        console.log(`\n--- SCORING ${c.name} ---`);

        const stats = dimensionStats.find(d => d.caregiverName === c.name);
        if (!stats) {
            console.log("❌ No stats found for caregiver");
            return;
        }

        console.log("Raw stats:", stats);

        const totalClientLangs = clientPrefs.langs.length;
        const totalClientSkills = clientPrefs.skills.length;

        // Language scoring
        const langScore = (totalClientLangs > 0)
            ? (stats.rawLanguage / totalClientLangs) * scoringWeights.language : 0;
        console.log(`Language: ${stats.rawLanguage}/${totalClientLangs} × ${scoringWeights.language} = ${langScore.toFixed(2)}`);

        // Skills scoring
        const skillScore = (totalClientSkills > 0)
            ? (stats.rawSkills / totalClientSkills) * scoringWeights.skills : 0;
        console.log(`Skills: ${stats.rawSkills}/${totalClientSkills} × ${scoringWeights.skills} = ${skillScore.toFixed(2)}`);

        // Historical scoring
        const histScore = stats.rawHistorical > 0 ? scoringWeights.historical : 0;
        console.log(`Historical: ${stats.rawHistorical > 0 ? 'YES' : 'NO'} × ${scoringWeights.historical} = ${histScore.toFixed(2)}`);

        // Work hours scoring
        const worked = actualWorkedHoursMap[normName(c.name)] || 0;
        const workHoursScore = totalClientHours > 0
            ? (worked / totalClientHours) * scoringWeights.workHours : 0;
        console.log(`Work Hours: ${worked}/${totalClientHours} × ${scoringWeights.workHours} = ${workHoursScore.toFixed(2)}`);

        c.weightedBreakdown = {
            language: +langScore.toFixed(2),
            skills: +skillScore.toFixed(2),
            historical: +histScore.toFixed(2),
            workHours: +workHoursScore.toFixed(2)
        };
        c.weightedTotalScore = +(langScore + skillScore + histScore + workHoursScore).toFixed(2);

        console.log("Weighted breakdown:", c.weightedBreakdown);
        console.log("TOTAL WEIGHTED SCORE:", c.weightedTotalScore);
    });

    availableCaregivers.forEach(c => {
        c.totalScore = (c.priorityScore || 0); // extend later if needed
    });

    console.log("\n=== BEFORE SORTING ===");
    availableCaregivers.forEach((c, i) => {
        console.log(`${i + 1}. ${c.name} - Weighted: ${c.weightedTotalScore}, Priority: ${c.priorityScore || 0}, Primary: ${c.isPrimary}`);
    });

    // SORT (align with multi-client logic)
    availableCaregivers.sort((a, b) => {
        if (b.weightedTotalScore !== a.weightedTotalScore) return b.weightedTotalScore - a.weightedTotalScore;
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
        const aTrans = getTransportationPreference(a.name, clientData, employeesListg);
        const bTrans = getTransportationPreference(b.name, clientData, employeesListg);
        if (aTrans.isPreferred !== bTrans.isPreferred) return aTrans.isPreferred ? -1 : 1;
        const aClientH = a.rawScores ? a.rawScores.clientHours : 0;
        const bClientH = b.rawScores ? b.rawScores.clientHours : 0;
        if (bClientH !== aClientH) return bClientH - aClientH;
        return a.name.localeCompare(b.name);
    });

    console.log("\n=== AFTER SORTING ===");
    availableCaregivers.forEach((c, i) => {
        console.log(`${i + 1}. ${c.name} - Score: ${c.weightedTotalScore}, Primary: ${c.isPrimary}`);
        console.log(`   Breakdown: L:${c.weightedBreakdown.language} S:${c.weightedBreakdown.skills} H:${c.weightedBreakdown.historical} W:${c.weightedBreakdown.workHours}`);
    });

    console.log("\n=== FINAL RESULTS ===");
    console.log("Total available caregivers:", availableCaregivers.length);

    // Add final summary with detailed breakdown
    console.log("\n=== DETAILED FINAL BREAKDOWN ===");
    availableCaregivers.forEach((c, i) => {
        console.log(`\n${i + 1}. ${c.name} (Total: ${c.weightedTotalScore})`);
        console.log(`   Language Score: ${c.weightedBreakdown.language} (${c.rawScores.language} matches)`);
        console.log(`   Skills Score: ${c.weightedBreakdown.skills} (${c.rawScores.skills} matches)`);
        console.log(`   Historical Score: ${c.weightedBreakdown.historical} (${c.rawScores.historical} past assignments)`);
        console.log(`   Work Hours Score: ${c.weightedBreakdown.workHours} (${actualWorkedHoursMap[normName(c.name)] || 0} hours worked)`);
        console.log(`   Priority Score: ${c.priorityScore || 0}`);
        console.log(`   Is Primary: ${c.isPrimary}`);
    });

    return availableCaregivers;
};

// Add this helper function to normalize dates
// Replace your existing normalizeDate function with this improved version
const normalizeDate = (dateStr) => {
    if (!dateStr) return '';

    try {
        // Handle different date formats
        let normalizedDateStr = String(dateStr).trim();

        // Check if it's already in YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateStr)) {
            return normalizedDateStr;
        }

        // Handle DD-Month-YYYY format (like "17-October-2025")
        const monthMap = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04',
            'may': '05', 'june': '06', 'july': '07', 'august': '08',
            'september': '09', 'october': '10', 'november': '11', 'december': '12'
        };

        const ddMonthYYYY = /^(\d{1,2})-([a-zA-Z]+)-(\d{4})$/.exec(normalizedDateStr);
        if (ddMonthYYYY) {
            const day = String(parseInt(ddMonthYYYY[1])).padStart(2, '0');
            const monthName = ddMonthYYYY[2].toLowerCase();
            const year = ddMonthYYYY[3];
            const month = monthMap[monthName];

            if (month) {
                console.log(`Converted date from ${dateStr} to ${year}-${month}-${day}`);
                return `${year}-${month}-${day}`;
            }
        }

        // Fallback: try to parse as a regular date
        const date = new Date(normalizedDateStr);
        if (!isNaN(date.getTime())) {
            // Convert to YYYY-MM-DD format
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        console.log(`Warning: Could not parse date: ${dateStr}`);
        return dateStr; // Return original if parsing fails
    } catch (e) {
        console.log(`Error normalizing date: ${dateStr}`, e);
        return dateStr;
    }
};

// Also, let's improve the hasScheduleConflict function to better handle the date comparison
const hasScheduleConflict = (caregiverName, clientId, date, startTime, endTime, scheduleList) => {
    if (!caregiverName || !date || !Array.isArray(scheduleList)) return false;

    const caregiverNameNorm = normName(caregiverName);
    const normalizedInputDate = normalizeDate(date);

    return scheduleList.some(schedule => {
        if (!schedule) return false;

        // Check if this schedule is for the same caregiver and date
        const expectedCaregiver = normName(schedule.Expected_Caregiver || '');
        const actualCaregiver = normName(schedule.Actual_Caregiver || '');
        const scheduleDate = schedule.Schedule_Start_Date || '';
        const normalizedScheduleDate = normalizeDate(scheduleDate);

        // Check both expected and actual caregiver
        const caregiverMatches = expectedCaregiver === caregiverNameNorm ||
            actualCaregiver === caregiverNameNorm;

        if (!caregiverMatches) return false;

        // Use normalized date comparison
        if (normalizedScheduleDate !== normalizedInputDate) return false;

        // Only check for conflicts with active/scheduled appointments
        const status = normStr(schedule.Scheduling_Status || '').toLowerCase();
        if (!status || status === '' || status === 'cancelled' || status === 'no-show') {
            return false;
        }

        const scheduleStartTime = parseTime(schedule.Schedule_Start_Time);
        const scheduleEndTime = parseTime(schedule.Schedule_End_Time);

        // Check for time overlap
        if (scheduleStartTime !== null && scheduleEndTime !== null) {
            return timeOverlap(startTime, endTime, scheduleStartTime, scheduleEndTime);
        }

        return false;
    });
};

// Execute the function and return the result
const availableCaregivers = findAvailableCaregivers();

(function () {
    if (!Array.isArray(availableCaregivers)) return;

    // Keep top candidate (no exclusion) & rank starting at 1
    let display = availableCaregivers.slice();

    display.forEach((c, idx) => {
        c.rank = idx + 1;
        c.status = idx === 0 ? 'Selected' : `Available - Rank ${c.rank}`;
    });

    const availableCaregiversList = display.map(c => ({
        caregiverEmployeeId: c.caregiverId || '',
        caregiverName: c.name,
        rank: c.rank,
        status: c.status,
        weightedBreakdown: c.weightedBreakdown || {
            historical: 0,
            language: 0,
            skills: 0,
            workHours: 0
        },
        weightedTotalScore: typeof c.weightedTotalScore === 'number' ? c.weightedTotalScore : 0
    }));

    const textList = availableCaregiversList
        .map(c => `${c.rank}. ${c.caregiverName} - ${c.weightedTotalScore.toFixed(2)}`)
        .join('\n');

    fields["List_of_Available_Caregivers"].value = textList;

    if (fields["Available_Caregivers_JSON"]) {
        fields["Available_Caregivers_JSON"].value = JSON.stringify({ availableCaregiversList }, null, 2);
    }
})();


console.log("Available caregivers:", availableCaregivers);
console.log("Total available caregivers found:", availableCaregivers.length);

// Updated summary function to show weighted scores
var summarizeCaregivers = (function () {
    if (!Array.isArray(availableCaregivers) || availableCaregivers.length === 0) {
        return "No caregivers found.";
    }

    return availableCaregivers
        .map((c, i) => {
            let text = (i + 1) + ". " + (c.name || "Unknown") + " - " +
                (typeof c.weightedTotalScore === "number" ? c.weightedTotalScore.toFixed(2) : "0.00");

            if (c.isPrimary) {
                text += " [PRIMARY]";
            }

            return text;
        })
        .join("\n");
})();

console.log("" + summarizeCaregivers);

fields["List_of_Available_Caregivers"].value = summarizeCaregivers;