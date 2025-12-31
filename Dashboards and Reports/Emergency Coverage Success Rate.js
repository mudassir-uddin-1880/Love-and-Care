var emergencydateCriteriaCA = {
    "fieldName": "ScheduleDate",
    "fromDate": fields["Start_Date"].value,
    "toDate": fields["End_Date"].value
};

var emergencycriteriaCA = {
    "Record_Status": "Active",
};

var emergencyfieldsArrayCA = [
    "CoverageSuccessful",
    "ScheduleDate",
    "ShiftStartTime",
    "ShiftEndTime",
    "emergency_Details",
];

var emergencysvctypeCA = "SVC_TYPE_17";
var emergencyListNotes = [];
var emergencyCoverageSuccessRate = 0;

// Function to process emergency data and calculate coverage success rate
function processemergencyNotesData(response) {
    if (!response || response.length === 0) {
        console.log("No valid emergency data received.");
        emergencyCoverageSuccessRate = 0;
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total emergency records received:", response.length);

    emergencyListNotes = [];
    var successfulCoverageCount = 0;

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

        // Count successful coverages
        if (fieldValues["CoverageSuccessful"] === "Successful") {
            successfulCoverageCount++;
        }
    }

    // Calculate Emergency Coverage Success Rate: (Successful coverages / Total Emergencies) × 100
    var totalEmergencies = emergencyListNotes.length;
    if (totalEmergencies > 0) {
        emergencyCoverageSuccessRate = (successfulCoverageCount / totalEmergencies) * 100;
    } else {
        emergencyCoverageSuccessRate = 0;
    }

    console.log("emergencyListNotes:", emergencyListNotes);
    console.log("Total Emergencies:", totalEmergencies);
    console.log("Successful Coverages:", successfulCoverageCount);
    console.log("Emergency Coverage Success Rate:", emergencyCoverageSuccessRate.toFixed(2) + "%");
    fields["Emergency_Coverage_Success_Rate"].value = emergencyCoverageSuccessRate.toFixed(2);
    // Calculate Pending_Emergency_Coverage_Success_Score as 100 - Overall_Continuity_Rate (always positive)
    var emergencyCoverageSuccessRatefullscoree = Math.abs(100 - parseFloat(emergencyCoverageSuccessRate.toFixed(2)));
    fields["Pending_Emergency_Coverage_Success_Score"].value = emergencyCoverageSuccessRatefullscoree.toFixed(2);

    console.log("emergencyCoverageSuccessRate (100 - Rate): " + emergencyCoverageSuccessRatefullscoree.toFixed(2) + "%");

}

app_lib.getTxnUsingIncFields(emergencycriteriaCA, emergencyfieldsArrayCA, processemergencyNotesData, emergencydateCriteriaCA, emergencysvctypeCA);