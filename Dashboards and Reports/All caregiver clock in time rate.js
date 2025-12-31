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


// Calculate on-time clock-ins after scheduleListg is populated
function calculateOnTimeMetrics() {
    var totalShifts = 0;
    var onTimeClockIns = 0;

    for (var i = 0; i < scheduleListg.length; i++) {
        var record = scheduleListg[i];

        // Only count shifts where both Schedule_Start_Time and CheckIn_Time exist
        if (record.Schedule_Start_Time && record.CheckIn_Time &&
            record.Schedule_Start_Time !== "" && record.CheckIn_Time !== "") {
            totalShifts++;

            if (isOnTimeOrBefore(record.Schedule_Start_Time, record.CheckIn_Time)) {
                onTimeClockIns++;
                console.log("On-time: " + record.Client_Name + " - Schedule: " +
                    record.Schedule_Start_Time + ", Check-in: " + record.CheckIn_Time);
            } else {
                console.log("Late: " + record.Client_Name + " - Schedule: " +
                    record.Schedule_Start_Time + ", Check-in: " + record.CheckIn_Time);
            }
        }
    }

    console.log("=== On-Time Clock-In Summary ===");
    console.log("Total shifts with check-in data:", totalShifts);
    console.log("On-time clock-ins:", onTimeClockIns);
    console.log("Late clock-ins:", (totalShifts - onTimeClockIns));

    // Calculate percentage
    var onTimePercentage = totalShifts > 0 ? (onTimeClockIns / totalShifts) * 100 : 0;
    fields["OnTime_ClockIn_Rate"].value = onTimePercentage.toFixed(2);
    console.log("On-time percentage:", onTimePercentage.toFixed(2) + "%");

    return {
        totalShifts: totalShifts,
        onTimeClockIns: onTimeClockIns,
        onTimePercentage: onTimePercentage
    };
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

    // Calculate on-time metrics after data is loaded
    var metrics = calculateOnTimeMetrics();

    // You can now use metrics.onTimeClockIns, metrics.totalShifts, and metrics.onTimePercentage
}

// Call the function
app_lib.getTxnUsingIncFields(schedulecriteriaCA, schedulefieldsArrayCA, processscheduledata, scheduledateCriteriaCA, schedulesvctypeCA);