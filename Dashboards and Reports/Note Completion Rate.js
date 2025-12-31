var scheduledateCriteriaNotes = {
    "fieldName": "Schedule_Start_Date",
    "fromDate": fields["Start_Date"].value,
    "toDate": fields["End_Date"].value
};

var schedulecriteriaNotes = {
    "Record_Status": "Active",
    "Shift_Status": "Scheduled"
};

var schedulefieldsArrayNotes = [
    "Client_Name",
    "Schedule_Start_Date",
    "Notes_Status"
];

var schedulesvctypeNotes = "SVC_TYPE_3";
var scheduleListNotes = [];

// Function to process schedule data and calculate note completion rate
function processScheduleNotesData(response) {
    if (!response || response.length === 0) {
        console.log("No valid schedule data received.");
        fields["Note_Completion_Rate"].value = "0.00";
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total schedule records received:", response.length);

    scheduleListNotes = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < schedulefieldsArrayNotes.length; j++) {
            var key = schedulefieldsArrayNotes[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key].value;
            }

            fieldValues[key] = value;
        }

        scheduleListNotes.push(fieldValues);
    }

    console.log("scheduleListNotes:", scheduleListNotes);

    // Calculate note completion rate
    calculateNoteCompletionRate();
}

// Function to calculate note completion rate
function calculateNoteCompletionRate() {
    var totalShifts = scheduleListNotes.length;
    var shiftsWithNotes = 0;

    for (var i = 0; i < scheduleListNotes.length; i++) {
        var record = scheduleListNotes[i];

        // Check if Notes_Status is NOT "Absent" (meaning notes are present)
        if (record.Notes_Status && record.Notes_Status !== "Absent") {
            shiftsWithNotes++;
            console.log("Shift with note - Client: " + record.Client_Name +
                ", Date: " + record.Schedule_Start_Date + ", Notes_Status: " + record.Notes_Status);
        } else {
            console.log("Shift without note - Client: " + record.Client_Name +
                ", Date: " + record.Schedule_Start_Date + ", Notes_Status: " + record.Notes_Status);
        }
    }

    console.log("\n=== Note Completion Rate Summary ===");
    console.log("Total shifts:", totalShifts);
    console.log("Shifts with notes:", shiftsWithNotes);
    console.log("Shifts without notes:", (totalShifts - shiftsWithNotes));

    // Calculate percentage
    var noteCompletionPercentage = totalShifts > 0 ? (shiftsWithNotes / totalShifts) * 100 : 0;
    fields["Note_Completion_Rate"].value = noteCompletionPercentage.toFixed(2);
    console.log("Note completion percentage:", noteCompletionPercentage.toFixed(2) + "%");
    // Calculate Pending_Note_Completion_Score as 100 - Overall_Continuity_Rate (always positive)
    var notepercentagefullscoree = Math.abs(100 - parseFloat(noteCompletionPercentage.toFixed(2)));
    fields["Pending_Note_Completion_Score"].value = notepercentagefullscoree.toFixed(2);

    console.log("Pending_Note_Completion_Score (100 - Rate): " + notepercentagefullscoree.toFixed(2) + "%");

}

// Call the function
app_lib.getTxnUsingIncFields(schedulecriteriaNotes, schedulefieldsArrayNotes, processScheduleNotesData, scheduledateCriteriaNotes, schedulesvctypeNotes);