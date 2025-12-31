var emergencydateCriteriaCA = {
    "fieldName": "ScheduleDate",
    "fromDate": fields["Start_Date"].value,
    "toDate": fields["End_Date"].value
};

var emergencycriteriaCA = {
    "Record_Status": "Active",
};

var emergencyfieldsArrayCA = [
    "ScheduleID",
    "CoverageSuccessful",
    "ScheduleDate",
    "ShiftStartTime",
    "ShiftEndTime",
    "emergency_Details",
    "SelectedCaregiverName",
    "ContactedCaregiverNames",
    "ProcessStage"
];

var emergencysvctypeCA = "SVC_TYPE_17";
var emergencyListNotes = [];
var FirstResponse_Fill_Rate = 0;
var Pending_FirstResponse_Fill_Score = 0;

// Function to calculate First Response Fill Rate
function calculateFirstResponseMetrics(records) {
    if (!records || records.length === 0) {
        console.log("No records to process.");
        return {
            fillRate: 0,
            pendingScore: 100
        };
    }

    // Track unique ScheduleIDs
    var broadcastSchedules = {}; // For Broadcast Fills
    var firstResponseSchedules = {}; // For First-Response Fills

    for (var i = 0; i < records.length; i++) {
        var record = records[i];
        var scheduleID = record.ScheduleID;

        // Count Broadcast Fills: CoverageSuccessful = "Pending" AND ProcessStage = "15min_emergency"
        if (record.CoverageSuccessful === "Pending") {
            broadcastSchedules[scheduleID] = true;
        }

        // Count First-Response Fills: ProcessStage = "Emergency_Check" AND SelectedCaregiverName is not empty
        if (record.ProcessStage === "Emergency_Check" && record.SelectedCaregiverName && record.SelectedCaregiverName.trim() !== "") {
            firstResponseSchedules[scheduleID] = true;
        }
    }

    // Count distinct ScheduleIDs
    var broadcastFillsCount = 0;
    for (var key in broadcastSchedules) {
        if (broadcastSchedules.hasOwnProperty(key)) {
            broadcastFillsCount++;
        }
    }

    var firstResponseFillsCount = 0;
    for (var key in firstResponseSchedules) {
        if (firstResponseSchedules.hasOwnProperty(key)) {
            firstResponseFillsCount++;
        }
    }

    console.log("Broadcast Fills (Denominator):", broadcastFillsCount);
    console.log("First-Response Fills (Numerator):", firstResponseFillsCount);

    // Calculate metrics
    var fillRate = 0;
    if (broadcastFillsCount > 0) {
        fillRate = (firstResponseFillsCount / broadcastFillsCount) * 100;
    }

    var pendingScore = 100 - fillRate;

    return {
        fillRate: fillRate,
        pendingScore: pendingScore
    };
}

// Function to process emergency data and calculate coverage success rate
function processemergencyNotesData(response) {
    if (!response || response.length === 0) {
        console.log("No valid emergency data received.");
        FirstResponse_Fill_Rate = 0;
        Pending_FirstResponse_Fill_Score = 100;
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total emergency records received:", response.length);

    emergencyListNotes = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < emergencyfieldsArrayCA.length; j++) {
            var key = emergencyfieldsArrayCA[j];
            var value = "";
            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key].value;
            }
            fieldValues[key] = value;
        }

        emergencyListNotes.push(fieldValues);
    }

    console.log("emergencyListNotes:", emergencyListNotes);

    // Calculate First Response Metrics
    var metrics = calculateFirstResponseMetrics(emergencyListNotes);

    FirstResponse_Fill_Rate = metrics.fillRate;
    Pending_FirstResponse_Fill_Score = metrics.pendingScore;

    console.log("========================================");
    console.log("FIRST RESPONSE FILL RATE METRICS");
    console.log("========================================");
    console.log("FirstResponse_Fill_Rate:", FirstResponse_Fill_Rate.toFixed(2) + "%");
    fields["FirstResponse_Fill_Rate"].value = FirstResponse_Fill_Rate.toFixed(2);
    console.log("Pending_FirstResponse_Fill_Score:", Pending_FirstResponse_Fill_Score.toFixed(2) + "%");
    fields["Pending_FirstResponse_Fill_Score"].value = Pending_FirstResponse_Fill_Score.toFixed(2);
    console.log("========================================");
}

app_lib.getTxnUsingIncFields(emergencycriteriaCA, emergencyfieldsArrayCA, processemergencyNotesData, emergencydateCriteriaCA, emergencysvctypeCA);