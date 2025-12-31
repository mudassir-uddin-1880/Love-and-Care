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
    var caregiverStats = {}; // Object to store stats per caregiver

    console.log("\n=== NO-SHOW INCIDENT RATE ANALYSIS ===");
    console.log("Processing " + noShowCargiverscheduleListNotes.length + " total records");

    for (var i = 0; i < noShowCargiverscheduleListNotes.length; i++) {
        var record = noShowCargiverscheduleListNotes[i];
        var schedulingStatus = record.Scheduling_Status;
        var caregiver = record.Actual_Caregiver || record.Expected_Caregiver;

        // Count all records with valid scheduling status as scheduled shifts
        if (schedulingStatus && schedulingStatus !== "") {
            totalScheduledShifts++;

            // Initialize caregiver stats if not already present
            if (!caregiverStats[caregiver]) {
                caregiverStats[caregiver] = {
                    totalShifts: 0,
                    noShowShifts: 0
                };
            }

            // Increment total shifts for the caregiver
            caregiverStats[caregiver].totalShifts++;

            // Check if this is a no-show
            if (schedulingStatus === "Caregiver No Show") {
                noShowShifts++;
                caregiverStats[caregiver].noShowShifts++;
                console.log("No-Show found - Client: " + record.Client_Name +
                    ", Date: " + record.Schedule_Start_Date +
                    ", Caregiver: " + caregiver +
                    ", Status: " + schedulingStatus);
            }
        }
    }

    console.log("\n=== No-Show Incident Rate Summary ===");
    console.log("Total scheduled shifts:", totalScheduledShifts);
    console.log("No-show shifts:", noShowShifts);
    console.log("Completed/Other shifts:", (totalScheduledShifts - noShowShifts));

    // Calculate overall percentages
    var noShowPercentage = totalScheduledShifts > 0 ? (noShowShifts / totalScheduledShifts) * 100 : 0;
    var pendingPercentage = 100 - noShowPercentage;

    console.log("No-Show Incident Rate: " + noShowPercentage.toFixed(2) + "%");
    console.log("Pending No-Show Score: " + pendingPercentage.toFixed(2) + "%");

    // Set field values using existing field names
    fields["NoShow_Incident_Rate"].value = noShowPercentage.toFixed(2);
    fields["Peding_NoShow_Incident_Score"].value = pendingPercentage.toFixed(2);

    console.log("No-Show Incident Rate set to Note_Completion_Rate field: " + noShowPercentage.toFixed(2) + "%");
    console.log("Pending Score set to Pending_Note_Completion_Score field: " + pendingPercentage.toFixed(2) + "%");

    // Prepare caregiver data for the table
    var caregiverArray = [];
    for (var caregiver in caregiverStats) {
        var stats = caregiverStats[caregiver];
        var caregiverRate = stats.totalShifts > 0 ? (stats.noShowShifts / stats.totalShifts) * 100 : 0;

        caregiverArray.push({
            Caregiver: caregiver,
            rate: caregiverRate.toFixed(2)
        });
    }

    // Add caregiver data to the table
    addCaregiverNoShowDataToTable(caregiverArray);
}

// Function to add caregiver data to table
function addCaregiverNoShowDataToTable(caregiverArray) {
    // Remove existing rows from the table

    var addRowsArray = [];

    for (var idx = 0; idx < caregiverArray.length; idx++) {
        addRowsArray.push({
            "fields": {
                "Caregiver": {
                    "value": caregiverArray[idx].Caregiver
                },
                "Score": {
                    "value": caregiverArray[idx].rate
                }
            }
        });
    }

    // Add rows to the table
    if (addRowsArray.length > 0) {
        app_lib.addRows("NoShow_Caregiver_Incident_Rate", addRowsArray, true);
        console.log("\n=== Successfully added " + addRowsArray.length + " caregiver records to table ===");
    } else {
        console.log("\n=== No caregiver data to add to table ===");
    }
}

// Call the function
app_lib.getTxnUsingIncFields(noShowCargiverschedulecriteriaNotes, noShowCargiverschedulefieldsArrayNotes, processnoShowCargiverScheduleNotesData, noShowCargiverscheduledateCriteriaNotes, noShowCargiverschedulesvctypeNotes);