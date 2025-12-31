var scheduledateCriteriaCA = {
    "fieldName": "Schedule_Start_Date",
    "fromDate": fields["Start_Date"].value,
    "toDate": fields["End_Date"].value
};

var schedulecriteriaCA = {
    "Record_Status": "Active",
    "Shift_Status": "Scheduled",
    "checkInPresent": "Yes"
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
    "Expected_Hours",
    "Actual_Hours",
    "CheckIn_Time",
];

var schedulesvctypeCA = "SVC_TYPE_3";
var scheduleListg = [];

// Add this function to parse time strings into minutes
function parseTimeToMinutes(timeString) {
    if (!timeString) return null;
    var parts = timeString.split(':');
    if (parts.length !== 2) return null;
    var hours = parseInt(parts[0], 10);
    var minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
}

// Add this function to check if clock-in is on-time or before scheduled time
function isOnTimeOrBefore(scheduleStartTime, checkInTime) {
    var scheduleMinutes = parseTimeToMinutes(scheduleStartTime);
    var checkInMinutes = parseTimeToMinutes(checkInTime);

    if (scheduleMinutes === null || checkInMinutes === null) {
        return false;
    }

    // Calculate the difference in minutes
    var diff = checkInMinutes - scheduleMinutes;

    // Handle midnight crossing scenario
    // If difference is greater than 12 hours (720 minutes), 
    // it means check-in was likely on the previous day
    if (diff > 720) {
        // Adjust for previous day check-in
        diff = diff - 1440; // Subtract 24 hours (1440 minutes)
    } else if (diff < -720) {
        // Handle reverse case (shouldn't occur normally, but for safety)
        diff = diff + 1440;
    }

    // On-time or before means diff <= 0
    // If you want to add a grace period (e.g., 5 minutes), use: diff <= 5
    return diff <= 0;
}

// Calculate on-time clock-ins for each caregiver
function calculateCaregiverOnTimeMetrics() {
    var caregiverStats = {};
    var overallTotalShifts = 0;
    var overallOnTimeClockIns = 0;

    for (var i = 0; i < scheduleListg.length; i++) {
        var record = scheduleListg[i];

        // Only count shifts where both Schedule_Start_Time and CheckIn_Time exist
        if (record.Schedule_Start_Time && record.CheckIn_Time &&
            record.Schedule_Start_Time !== "" && record.CheckIn_Time !== "") {

            // Get caregiver name - use Actual_Caregiver, fallback to Expected_Caregiver
            var caregiverName = record.Actual_Caregiver && record.Actual_Caregiver !== ""
                ? record.Actual_Caregiver
                : record.Expected_Caregiver;

            // Skip if no caregiver name is available
            if (!caregiverName || caregiverName === "") {
                console.log("Skipping shift - No caregiver assigned: " + record.Client_Name);
                continue;
            }

            // Initialize caregiver stats if not exists
            if (!caregiverStats[caregiverName]) {
                caregiverStats[caregiverName] = {
                    totalShifts: 0,
                    onTimeClockIns: 0
                };
            }

            caregiverStats[caregiverName].totalShifts++;
            overallTotalShifts++;

            // Check if on-time or before
            if (isOnTimeOrBefore(record.Schedule_Start_Time, record.CheckIn_Time)) {
                caregiverStats[caregiverName].onTimeClockIns++;
                overallOnTimeClockIns++;
                console.log("On-time: " + caregiverName + " - Client: " + record.Client_Name +
                    " - Schedule: " + record.Schedule_Start_Time + ", Check-in: " + record.CheckIn_Time);
            } else {
                console.log("Late: " + caregiverName + " - Client: " + record.Client_Name +
                    " - Schedule: " + record.Schedule_Start_Time + ", Check-in: " + record.CheckIn_Time);
            }
        }
    }

    // Calculate percentages and create array for table insertion
    var caregiverOnTimeArray = [];

    console.log("\n=== Caregiver-Wise On-Time Clock-In Summary ===");

    for (var caregiver in caregiverStats) {
        var stats = caregiverStats[caregiver];
        var percentage = stats.totalShifts > 0 ? (stats.onTimeClockIns / stats.totalShifts) * 100 : 0;

        console.log("Caregiver: " + caregiver);
        console.log("  Total Shifts: " + stats.totalShifts);
        console.log("  On-time Clock-ins: " + stats.onTimeClockIns);
        console.log("  Late Clock-ins: " + (stats.totalShifts - stats.onTimeClockIns));
        console.log("  On-time Percentage: " + percentage.toFixed(2) + "%");
        console.log("---");

        caregiverOnTimeArray.push({
            Caregiver: caregiver,
            Caregiver_OnTime_ClockIn_Rate: percentage.toFixed(2)
        });
    }

    // Calculate overall percentage
    var overallPercentage = overallTotalShifts > 0 ? (overallOnTimeClockIns / overallTotalShifts) * 100 : 0;
    console.log("\n=== Overall Summary ===");
    console.log("Total shifts with check-in data:", overallTotalShifts);
    console.log("Overall on-time clock-ins:", overallOnTimeClockIns);
    console.log("Overall late clock-ins:", (overallTotalShifts - overallOnTimeClockIns));
    console.log("Overall on-time percentage:", overallPercentage.toFixed(2) + "%");

    // Set the overall percentage in the field
    fields["OnTime_ClockIn_Rate"].value = overallPercentage.toFixed(2);

    return caregiverOnTimeArray;
}

// Function to add caregiver data to table
function addCaregiverOnTimeDataToTable(caregiverArray) {
    // Remove existing rows from the table
    app_lib.removeRows("Caregiver_OnTime_ClockIn_Rate");

    var addRowsArray = [];

    for (var idx = 0; idx < caregiverArray.length; idx++) {
        addRowsArray.push({
            "fields": {
                "Caregiver": {
                    "value": caregiverArray[idx].Caregiver
                },
                "Caregiver_OnTime_ClockIn_Rate": {
                    "value": caregiverArray[idx].Caregiver_OnTime_ClockIn_Rate
                }
            }
        });
    }

    // Add rows to the table
    if (addRowsArray.length > 0) {
        app_lib.addRows("Caregiver_OnTime_ClockIn_Rate", addRowsArray, true);
        console.log("\n=== Successfully added " + addRowsArray.length + " caregiver records to table ===");
    } else {
        console.log("\n=== No caregiver data to add to table ===");
    }
}

// Update the processscheduledata function to call the calculation
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

    // Calculate caregiver-wise on-time metrics
    var caregiverOnTimeData = calculateCaregiverOnTimeMetrics();

    // Add the data to the table
    addCaregiverOnTimeDataToTable(caregiverOnTimeData);
}

// Call the function
app_lib.getTxnUsingIncFields(schedulecriteriaCA, schedulefieldsArrayCA, processscheduledata, scheduledateCriteriaCA, schedulesvctypeCA);