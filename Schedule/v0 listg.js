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
    "Client_Type", // For client type compatibility
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