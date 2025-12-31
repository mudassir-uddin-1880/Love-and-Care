// var clientcriteriaCA = {
//     "Client_Status": "Active"

// };

// var clientfieldsArrayCA = [
//     "Client_Full_Name",
//     "Client_Type",
//     "Gender_Preference",
//     "Gender_Preference_Strict",
//     "Caregiver_Block_List",
//     "Weight_Class",
//     "Skills_Preferences",
//     "Personality_Match",
//     "Exclusion_Avoid_Caregiver",
//     "Schedule_Details" // Added schedule details field to fetch in single API call
// ];

// var clientsvctypeCA = "SVC_TYPE_2";
// var clientListg = [];
// var scheduleData = [];
// var pendingRequests = 0;

// // Combined function to process all client data with one API call
// function getClientDataWithSchedules() {
//     app_lib.getTxnUsingIncFields(clientcriteriaCA, clientfieldsArrayCA, function (response) {
//         // Process response for client data first
//         if (!response || response.length === 0) {
//             console.log("No valid client data received.");
//             return;
//         }

//         if (!Array.isArray(response)) {
//             response = [response];
//         }

//         console.log("Total client records received:", response.length);
//         clientListg = [];
//         pendingRequests = response.length;

//         for (var i = 0; i < response.length; i++) {
//             var record = response[i];
//             var fieldValues = {};
//             var fieldsObj = record.fields || {};
//             var clientId = record.id;

//             // Process regular client fields
//             for (var j = 0; j < clientfieldsArrayCA.length - 1; j++) { // Exclude Schedule_Details from this loop
//                 var key = clientfieldsArrayCA[j];
//                 var value = "";

//                 if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
//                     value = fieldsObj[key].value;
//                 }

//                 fieldValues[key] = value;
//             }

//             // Store the client ID in the client object for later matching
//             fieldValues.clientId = clientId;
//             clientListg.push(fieldValues);

//             // Process schedule data for this client in the same loop
//             var tableId = fieldsObj["Schedule_Details"] ? fieldsObj["Schedule_Details"].value : null;

//             if (clientId && tableId) {
//                 // Use IIFE to capture current clientId and tableId in closure
//                 (function (currentClientId, currentTableId, index) {
//                     app_lib.rowsOf(currentClientId, currentTableId, function (tableRows) {
//                         var schedulingDetails = [];
//                         if (tableRows && tableRows.length > 0) {
//                             for (var j = 0; j < tableRows.length; j++) {
//                                 var row = tableRows[j];
//                                 if (row && row.fields) {
//                                     schedulingDetails.push({
//                                         Day: row.fields.Day ? row.fields.Day.value : "",
//                                         Schedule_Start_Time: row.fields.Schedule_Start_Time ? row.fields.Schedule_Start_Time.value : "",
//                                         Schedule_End_Time: row.fields.Select_Schedule_End_Time ? row.fields.Select_Schedule_End_Time.value : "",
//                                         Expected_Hours: row.fields.Expected_Hours ? row.fields.Expected_Hours.value : 0,
//                                     });
//                                 }
//                             }
//                         }

//                         scheduleData.push({
//                             clientId: currentClientId,
//                             schedulingDetails: schedulingDetails
//                         });

//                         pendingRequests--;
//                         if (pendingRequests === 0) {
//                             // All schedule data processed, now combine everything
//                             finalizeClientData();
//                         }
//                     });
//                 })(clientId, tableId, i);
//             } else {
//                 pendingRequests--;
//                 if (pendingRequests === 0) {
//                     finalizeClientData();
//                 }
//             }
//         }

//         console.log("Client basic data processed:", clientListg.length);
//     }, null, clientsvctypeCA);
// }

// // Final function to combine client and schedule data
// function finalizeClientData() {
//     // Merge client data with schedule data
//     var completeClientData = clientListg.map(function (client) {
//         var schedule = scheduleData.find(function (schedule) {
//             return schedule.clientId === client.clientId;
//         }) || { schedulingDetails: [] };

//         return {
//             ...client,
//             schedulingDetails: schedule.schedulingDetails
//         };
//     });

//     console.log("Complete client data with schedules count:", completeClientData.length);
//     console.log("Complete client data with schedules:", completeClientData);

//     // Return or use the complete data as needed
//     return completeClientData;
// }

// // Call the function to start the process
// getClientDataWithSchedules();

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

var leavescriteriaCA = {
    "Status": "Active",
    "Leave_Status": "Approved"
};

var leavesfieldsArrayCA = [
    "Start_Date",
    "End_Date",
    "Start_Time",
    "End_Time",
];

var leavessvctypeCA = "SVC_TYPE_5";
var leavesListg = [];

function processleavesdata(response) {
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
app_lib.getTxnUsingIncFields(leavescriteriaCA, leavesfieldsArrayCA, processleavesdata, null, leavessvctypeCA);

var currDate = moment().format('YYYY-MM-DD');
var scheduledateCriteriaCA = {
    fromDate: fields["Schedule_Start_Date"].value,
    toDate: fields["Schedule_Start_Date"].value
};

var schedulecriteriaCA = {
    "Record_Status": "Active",
    "Shift_Status": "Scheduled" || "Ghost Shift"
};

var schedulefieldsArrayCA = [
    "Client_Name",
    "Expected_Caregiver",
    "Day",
    "Schedule_Start_Date",
    "Schedule_Start_Time",
    "Schedule_End_Time",
    "Scheduling_Status",
    "List_of_Available_Caregivers"
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


fields["Schedule_End_Date"].value = fields["Schedule_Start_Date"].value;

