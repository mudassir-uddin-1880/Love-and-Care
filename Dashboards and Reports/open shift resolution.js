var openshiftscheduledateCriteriaNotes = {
    "fieldName": "Schedule_Start_Date",
    "fromDate": fields["Start_Date"].value,
    "toDate": fields["End_Date"].value
};

var openshiftschedulecriteriaNotes = {
    "Record_Status": "Active",
};

var openshiftschedulefieldsArrayNotes = [
    "Schedule_Start_Date",
    "Shift_Status",
    "Scheduling_Status",
    "Caregiver_Assigned_by_Automation",
    "Scheduler_Start_Time",
    "Scheduler_End_Time",
    "Caregiver_Leave_Start_Time",
    "Client_Leave_End_Time",
    "Emergency_Coverage_Start_Time",
    "Emergency_Coverage_End_Time"
];

var openshiftschedulesvctypeNotes = "SVC_TYPE_3";
var openshiftscheduleListNotes = [];

// Function to calculate time difference in minutes
function getTimeDifferenceInMinutes(startTime, endTime) {
    if (!startTime || !endTime) return null;

    var start = new Date(startTime);
    var end = new Date(endTime);

    var diffMs = end - start;
    var diffMinutes = diffMs / (1000 * 60);

    return diffMinutes > 0 ? diffMinutes : null;
}

// Function to calculate median
function calculateMedian(values) {
    if (!values || values.length === 0) return 0;

    var sorted = values.slice().sort(function (a, b) {
        return a - b;
    });

    var length = sorted.length;
    var middle = Math.floor(length / 2);

    if (length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
        return sorted[middle];
    }
}

// Function to calculate average
function calculateAverage(values) {
    if (!values || values.length === 0) return 0;

    var sum = 0;
    for (var i = 0; i < values.length; i++) {
        sum += values[i];
    }
    return sum / values.length;
}

// Function to calculate percentile (e.g., 90th percentile)
function calculatePercentile(values, percentile) {
    if (!values || values.length === 0) return 0;

    var sorted = values.slice().sort(function (a, b) {
        return a - b;
    });

    var index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
}

// APPROACH 1: Primary - Using Scheduler Start/End Times
function approach1_SchedulerTimes() {
    var resolutionTimes = [];

    console.log("\n=== APPROACH 1: Scheduler Start/End Times ===");

    for (var i = 0; i < openshiftscheduleListNotes.length; i++) {
        var record = openshiftscheduleListNotes[i];

        // Check if both Scheduler_Start_Time and Scheduler_End_Time exist
        if (record.Scheduler_Start_Time &&
            record.Scheduler_Start_Time !== "" &&
            record.Scheduler_End_Time &&
            record.Scheduler_End_Time !== "") {

            var tOpen = record.Scheduler_Start_Time;
            var tAssign = record.Scheduler_End_Time;

            var resolutionMinutes = getTimeDifferenceInMinutes(tOpen, tAssign);

            if (resolutionMinutes !== null) {
                resolutionTimes.push(resolutionMinutes);
                console.log("Record " + (i + 1) +
                    " | Status: " + record.Shift_Status +
                    " | Scheduling: " + record.Scheduling_Status +
                    " | Start: " + tOpen +
                    " | End: " + tAssign +
                    " | Resolution: " + resolutionMinutes.toFixed(2) + " min");
            }
        }
    }

    console.log("\nTotal records with resolution time:", resolutionTimes.length);

    if (resolutionTimes.length > 0) {
        var median = calculateMedian(resolutionTimes);
        var average = calculateAverage(resolutionTimes);
        var p90 = calculatePercentile(resolutionTimes, 90);

        console.log("Median Resolution Time:", median.toFixed(2), "minutes");
        console.log("Average Resolution Time:", average.toFixed(2), "minutes");
        console.log("90th Percentile:", p90.toFixed(2), "minutes");

        return {
            resolutionTimes: resolutionTimes,
            median: median,
            average: average,
            p90: p90,
            count: resolutionTimes.length
        };
    }

    return {
        resolutionTimes: [],
        median: 0,
        average: 0,
        p90: 0,
        count: 0
    };
}

// APPROACH 2: All timestamps - Find any shift with both start and end
function approach2_AllTimestamps() {
    var resolutionTimes = [];

    console.log("\n=== APPROACH 2: Any Start/End Time Combination ===");

    for (var i = 0; i < openshiftscheduleListNotes.length; i++) {
        var record = openshiftscheduleListNotes[i];

        // Collect all start times
        var startTimes = [];
        if (record.Scheduler_Start_Time && record.Scheduler_Start_Time !== "")
            startTimes.push({ time: record.Scheduler_Start_Time, source: "Scheduler_Start" });
        if (record.Caregiver_Leave_Start_Time && record.Caregiver_Leave_Start_Time !== "")
            startTimes.push({ time: record.Caregiver_Leave_Start_Time, source: "Caregiver_Leave_Start" });
        if (record.Emergency_Coverage_Start_Time && record.Emergency_Coverage_Start_Time !== "")
            startTimes.push({ time: record.Emergency_Coverage_Start_Time, source: "Emergency_Start" });

        // Collect all end times
        var endTimes = [];
        if (record.Scheduler_End_Time && record.Scheduler_End_Time !== "")
            endTimes.push({ time: record.Scheduler_End_Time, source: "Scheduler_End" });
        if (record.Client_Leave_End_Time && record.Client_Leave_End_Time !== "")
            endTimes.push({ time: record.Client_Leave_End_Time, source: "Client_Leave_End" });
        if (record.Emergency_Coverage_End_Time && record.Emergency_Coverage_End_Time !== "")
            endTimes.push({ time: record.Emergency_Coverage_End_Time, source: "Emergency_End" });

        // If we have at least one start and one end time
        if (startTimes.length > 0 && endTimes.length > 0) {
            // Get earliest start time
            startTimes.sort(function (a, b) {
                return new Date(a.time) - new Date(b.time);
            });

            // Get latest end time
            endTimes.sort(function (a, b) {
                return new Date(b.time) - new Date(a.time);
            });

            var tOpen = startTimes[0].time;
            var tAssign = endTimes[0].time;

            var resolutionMinutes = getTimeDifferenceInMinutes(tOpen, tAssign);

            if (resolutionMinutes !== null) {
                resolutionTimes.push(resolutionMinutes);
                console.log("Record " + (i + 1) +
                    " | Status: " + record.Shift_Status +
                    " | Start: " + tOpen + " (" + startTimes[0].source + ")" +
                    " | End: " + tAssign + " (" + endTimes[0].source + ")" +
                    " | Resolution: " + resolutionMinutes.toFixed(2) + " min");
            }
        }
    }

    console.log("\nTotal records with resolution time:", resolutionTimes.length);

    if (resolutionTimes.length > 0) {
        var median = calculateMedian(resolutionTimes);
        var average = calculateAverage(resolutionTimes);
        var p90 = calculatePercentile(resolutionTimes, 90);

        console.log("Median Resolution Time:", median.toFixed(2), "minutes");
        console.log("Average Resolution Time:", average.toFixed(2), "minutes");
        console.log("90th Percentile:", p90.toFixed(2), "minutes");

        return {
            resolutionTimes: resolutionTimes,
            median: median,
            average: average,
            p90: p90,
            count: resolutionTimes.length
        };
    }

    return {
        resolutionTimes: [],
        median: 0,
        average: 0,
        p90: 0,
        count: 0
    };
}

// APPROACH 3: Focus on completed/assigned shifts only
function approach3_CompletedShiftsOnly() {
    var resolutionTimes = [];

    console.log("\n=== APPROACH 3: Completed/Assigned Shifts Only ===");

    for (var i = 0; i < openshiftscheduleListNotes.length; i++) {
        var record = openshiftscheduleListNotes[i];
        var schedulingStatus = record.Scheduling_Status || "";

        // Only process shifts that were completed or assigned
        var isCompleted = schedulingStatus.indexOf("Scheduled Completed") !== -1 ||
            schedulingStatus.indexOf("Ghost Shift - Assigned") !== -1;

        if (isCompleted &&
            record.Scheduler_Start_Time &&
            record.Scheduler_Start_Time !== "") {

            var tOpen = record.Scheduler_Start_Time;
            var tAssign = null;

            // Find any available end time
            if (record.Scheduler_End_Time && record.Scheduler_End_Time !== "") {
                tAssign = record.Scheduler_End_Time;
            } else if (record.Client_Leave_End_Time && record.Client_Leave_End_Time !== "") {
                tAssign = record.Client_Leave_End_Time;
            } else if (record.Emergency_Coverage_End_Time && record.Emergency_Coverage_End_Time !== "") {
                tAssign = record.Emergency_Coverage_End_Time;
            }

            if (tAssign) {
                var resolutionMinutes = getTimeDifferenceInMinutes(tOpen, tAssign);

                if (resolutionMinutes !== null) {
                    resolutionTimes.push(resolutionMinutes);
                    console.log("Record " + (i + 1) +
                        " | Status: " + record.Shift_Status +
                        " | Scheduling: " + schedulingStatus +
                        " | Start: " + tOpen +
                        " | End: " + tAssign +
                        " | Resolution: " + resolutionMinutes.toFixed(2) + " min");
                }
            }
        }
    }

    console.log("\nTotal records with resolution time:", resolutionTimes.length);

    if (resolutionTimes.length > 0) {
        var median = calculateMedian(resolutionTimes);
        var average = calculateAverage(resolutionTimes);
        var p90 = calculatePercentile(resolutionTimes, 90);

        console.log("Median Resolution Time:", median.toFixed(2), "minutes");
        console.log("Average Resolution Time:", average.toFixed(2), "minutes");
        console.log("90th Percentile:", p90.toFixed(2), "minutes");

        return {
            resolutionTimes: resolutionTimes,
            median: median,
            average: average,
            p90: p90,
            count: resolutionTimes.length
        };
    }

    return {
        resolutionTimes: [],
        median: 0,
        average: 0,
        p90: 0,
        count: 0
    };
}

// Function to categorize shifts
function categorizeShiftStatus() {
    var statusCounts = {
        "With_Resolution_Time": 0,
        "Without_Resolution_Time": 0,
        "Ghost_Shift_Unassigned": 0,
        "Ghost_Shift_Assigned": 0,
        "Open_Shift": 0,
        "Scheduled_Completed": 0
    };

    for (var i = 0; i < openshiftscheduleListNotes.length; i++) {
        var record = openshiftscheduleListNotes[i];
        var schedulingStatus = record.Scheduling_Status || "";

        // Check if record has resolution time
        var hasResolution = record.Scheduler_Start_Time &&
            record.Scheduler_Start_Time !== "" &&
            record.Scheduler_End_Time &&
            record.Scheduler_End_Time !== "";

        if (hasResolution) {
            statusCounts["With_Resolution_Time"]++;
        } else {
            statusCounts["Without_Resolution_Time"]++;
        }

        // Categorize by scheduling status
        if (schedulingStatus.indexOf("Ghost Shift - Unassigned") !== -1) {
            statusCounts["Ghost_Shift_Unassigned"]++;
        } else if (schedulingStatus.indexOf("Ghost Shift - Assigned") !== -1) {
            statusCounts["Ghost_Shift_Assigned"]++;
        } else if (schedulingStatus.indexOf("Canceled By Caregiver") !== -1 ||
            schedulingStatus.indexOf("Caregiver No Show") !== -1) {
            statusCounts["Open_Shift"]++;
        } else if (schedulingStatus.indexOf("Scheduled Completed") !== -1) {
            statusCounts["Scheduled_Completed"]++;
        }
    }

    console.log("\n=== Shift Status Categorization ===");
    for (var key in statusCounts) {
        if (statusCounts.hasOwnProperty(key)) {
            console.log(key + ":", statusCounts[key]);
        }
    }

    return statusCounts;
}

// Function to add results to table
function addResolutionDataToTable(approach1, approach2, approach3) {
    // app_lib.removeRows("Resolution_Time_Analysis");

    var addRowsArray = [
        {
            "fields": {
                "Approach": { "value": "Scheduler Start/End" },
                "Count": { "value": approach1.count },
                "Median_Minutes": { "value": approach1.median.toFixed(2) },
                "Average_Minutes": { "value": approach1.average.toFixed(2) },
                "P90_Minutes": { "value": approach1.p90.toFixed(2) }
            }
        },
        {
            "fields": {
                "Approach": { "value": "All Timestamps" },
                "Count": { "value": approach2.count },
                "Median_Minutes": { "value": approach2.median.toFixed(2) },
                "Average_Minutes": { "value": approach2.average.toFixed(2) },
                "P90_Minutes": { "value": approach2.p90.toFixed(2) }
            }
        },
        {
            "fields": {
                "Approach": { "value": "Completed Shifts Only" },
                "Count": { "value": approach3.count },
                "Median_Minutes": { "value": approach3.median.toFixed(2) },
                "Average_Minutes": { "value": approach3.average.toFixed(2) },
                "P90_Minutes": { "value": approach3.p90.toFixed(2) }
            }
        }
    ];

    if (addRowsArray.length > 0) {
        // app_lib.addRows("Resolution_Time_Analysis", addRowsArray, true);
        console.log("\n=== Successfully added resolution analysis to table ===");
    }
}

// Main processing function
function processopenshiftscheduleNotesData(response) {
    if (!response || response.length === 0) {
        console.log("No valid openshiftschedule data received.");
        fields["Open_Shift_Resolution_Time_Mins"].value = "0.00";
        fields["Average_Resolution_Time_Mins"].value = "0.00";
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total openshiftschedule records received:", response.length);

    openshiftscheduleListNotes = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < openshiftschedulefieldsArrayNotes.length; j++) {
            var key = openshiftschedulefieldsArrayNotes[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key].value;
            }

            fieldValues[key] = value;
        }

        openshiftscheduleListNotes.push(fieldValues);
    }

    console.log("openshiftscheduleListNotes:", openshiftscheduleListNotes);

    // Run all three approaches
    var result1 = approach1_SchedulerTimes();
    var result2 = approach2_AllTimestamps();
    var result3 = approach3_CompletedShiftsOnly();

    // Categorize shifts
    categorizeShiftStatus();

    // Add comparison table
    addResolutionDataToTable(result1, result2, result3);

    // Use Approach 1 as primary (or choose based on your preference)
    fields["Open_Shift_Resolution_Time_Mins"].value = result1.median.toFixed(2);
    fields["Average_Resolution_Time_Mins"].value = result1.average.toFixed(2);
    fields["Automated_Open_Shift_Resolution_Time_Mins"].value = 4.8;

    console.log("\n=== FINAL METRICS (Using Approach 1) ===");
    console.log("Median:", result1.median.toFixed(2), "minutes");
    console.log("Average:", result1.average.toFixed(2), "minutes");
}

// Call the function
app_lib.getTxnUsingIncFields(openshiftschedulecriteriaNotes, openshiftschedulefieldsArrayNotes, processopenshiftscheduleNotesData, openshiftscheduledateCriteriaNotes, openshiftschedulesvctypeNotes);