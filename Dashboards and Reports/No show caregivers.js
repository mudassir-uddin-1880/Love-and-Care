var noShowCargiverscheduledateCriteriaNotes = {
    "fieldName": "Schedule_Start_Date",
    "fromDate": fields["Start_Date"].value,
    "toDate": fields["End_Date"].value
};

var noShowCargiverschedulecriteriaNotes = {
    "Record_Status": "Active",
};

// Updated fields array to include Scheduling_Status which is needed for no-show detection
var noShowCargiverschedulefieldsArrayNotes = [
    "Client_Name",
    "Expected_Caregiver",
    "Actual_Caregiver",
    "Day",
    "Schedule_Start_Date",
    "Schedule_Start_Time",
    "Schedule_End_Time",
    "Scheduling_Status",
    "Expected_Hours",
    "Actual_Hours"
];

var noShowCargiverschedulesvctypeNotes = "SVC_TYPE_3";
var noShowCargiverscheduleListNotes = [];

// Function to process schedule data and calculate no-show incident rate
function processnoShowCargiverScheduleNotesData(response) {
    if (!response || response.length === 0) {
        console.log("No valid schedule data received.");
        fields["Note_Completion_Rate"].value = "0.00";
        fields["Pending_Note_Completion_Score"].value = "100.00";
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total schedule records received:", response.length);

    noShowCargiverscheduleListNotes = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < noShowCargiverschedulefieldsArrayNotes.length; j++) {
            var key = noShowCargiverschedulefieldsArrayNotes[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key].value;
            }

            fieldValues[key] = value;
        }

        noShowCargiverscheduleListNotes.push(fieldValues);
    }

    console.log("noShowCargiverscheduleListNotes:", noShowCargiverscheduleListNotes);

    // Calculate no-show incident rate
    calculateNoShowIncidentRate();
}

// Function to calculate no-show incident rate
function calculateNoShowIncidentRate() {
    var totalScheduledShifts = 0;
    var noShowShifts = 0;

    console.log("\n=== NO-SHOW INCIDENT RATE ANALYSIS ===");
    console.log("Processing " + noShowCargiverscheduleListNotes.length + " total records");

    for (var i = 0; i < noShowCargiverscheduleListNotes.length; i++) {
        var record = noShowCargiverscheduleListNotes[i];
        var schedulingStatus = record.Scheduling_Status;

        // Count all records with valid scheduling status as scheduled shifts
        if (schedulingStatus && schedulingStatus !== "") {
            totalScheduledShifts++;

            // Check if this is a no-show
            if (schedulingStatus === "Caregiver No Show") {
                noShowShifts++;
                console.log("No-Show found - Client: " + record.Client_Name +
                    ", Date: " + record.Schedule_Start_Date +
                    ", Caregiver: " + (record.Actual_Caregiver || record.Expected_Caregiver) +
                    ", Status: " + schedulingStatus);
            }
        }
    }

    console.log("\n=== No-Show Incident Rate Summary ===");
    console.log("Total scheduled shifts:", totalScheduledShifts);
    console.log("No-show shifts:", noShowShifts);
    console.log("Completed/Other shifts:", (totalScheduledShifts - noShowShifts));

    // Calculate percentages
    var noShowPercentage = totalScheduledShifts > 0 ? (noShowShifts / totalScheduledShifts) * 100 : 0;
    var pendingPercentage = 100 - noShowPercentage;

    console.log("No-Show Incident Rate: " + noShowPercentage.toFixed(2) + "%");
    console.log("Pending No-Show Score: " + pendingPercentage.toFixed(2) + "%");

    // Set field values using existing field names
    fields["NoShow_Incident_Rate"].value = noShowPercentage.toFixed(2);
    fields["Peding_NoShow_Incident_Score"].value = pendingPercentage.toFixed(2);

    console.log("No-Show Incident Rate set to Note_Completion_Rate field: " + noShowPercentage.toFixed(2) + "%");
    console.log("Pending Score set to Pending_Note_Completion_Score field: " + pendingPercentage.toFixed(2) + "%");
}

// Call the function
app_lib.getTxnUsingIncFields(noShowCargiverschedulecriteriaNotes, noShowCargiverschedulefieldsArrayNotes, processnoShowCargiverScheduleNotesData, noShowCargiverscheduledateCriteriaNotes, noShowCargiverschedulesvctypeNotes);