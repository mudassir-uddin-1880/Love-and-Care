// ============================================
// AUTOMATIC DATE RANGE CALCULATION
// ============================================
var currDate = moment();
console.log("Current Date: " + currDate.format('YYYY-MM-DD'));

// Get THIS WEEK's Monday and Sunday
var thisWeekMonday = currDate.clone().startOf('isoWeek');
var thisWeekSunday = currDate.clone().endOf('isoWeek');

// Get LAST WEEK's Monday and Sunday
var lastWeekMonday = currDate.clone().subtract(1, 'weeks').startOf('isoWeek');
var lastWeekSunday = currDate.clone().subtract(1, 'weeks').endOf('isoWeek');

// Set the date criteria to fetch ONLY these 2 weeks
var scheduledateCriteriaCA = {
    "fieldName": "Schedule_Start_Date",
    "fromDate": lastWeekMonday.format('YYYY-MM-DD'),
    "toDate": thisWeekSunday.format('YYYY-MM-DD')
};

console.log("From Date: " + scheduledateCriteriaCA.fromDate + " | To Date: " + scheduledateCriteriaCA.toDate);

var schedulecriteriaCA = {
    "Record_Status": "Active",
    "Shift_Status": "Scheduled"
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
    "Actual_Hours"
];

var schedulesvctypeCA = "SVC_TYPE_3";
var scheduleListg = [];

// Configuration object for matching criteria
var matchingConfig = {
    matchByDay: true,
    matchByTime: true,
    matchByDate: false
};

function calculateCaregiverRetention(scheduleData, config) {
    var currDate = moment();
    var thisWeekMonday = currDate.clone().startOf('isoWeek').format('YYYY-MM-DD');
    var thisWeekSunday = currDate.clone().endOf('isoWeek').format('YYYY-MM-DD');
    var lastWeekMonday = currDate.clone().subtract(1, 'weeks').startOf('isoWeek').format('YYYY-MM-DD');
    var lastWeekSunday = currDate.clone().subtract(1, 'weeks').endOf('isoWeek').format('YYYY-MM-DD');

    // STRICT FILTERING: Only include shifts within the exact 2-week range
    var filteredData = [];

    for (var i = 0; i < scheduleData.length; i++) {
        var shift = scheduleData[i];
        var shiftDate = shift.Schedule_Start_Date;

        if (shiftDate >= lastWeekMonday && shiftDate <= thisWeekSunday) {
            filteredData.push(shift);
        }
    }

    // Helper function to get Monday of the week
    function getMondayOfWeek(dateString) {
        var date = new Date(dateString);
        var day = date.getDay();
        var diff = date.getDate() - day + (day === 0 ? -6 : 1);
        var monday = new Date(date.setDate(diff));
        return monday.toISOString().split('T')[0];
    }

    // Separate filtered shifts into last week and this week
    var lastWeekShifts = [];
    var thisWeekShifts = [];

    for (var i = 0; i < filteredData.length; i++) {
        var shift = filteredData[i];
        var shiftWeekMonday = getMondayOfWeek(shift.Schedule_Start_Date);

        if (shiftWeekMonday === lastWeekMonday) {
            lastWeekShifts.push(shift);
        } else if (shiftWeekMonday === thisWeekMonday) {
            thisWeekShifts.push(shift);
        }
    }

    if (thisWeekShifts.length === 0) {
        return {
            error: "No shifts in current week",
            lastWeek: lastWeekMonday,
            thisWeek: thisWeekMonday
        };
    }

    // Helper function to get caregiver name
    function getCaregiverName(shift) {
        return shift.Actual_Caregiver && shift.Actual_Caregiver.trim() !== ""
            ? shift.Actual_Caregiver
            : shift.Expected_Caregiver;
    }

    // Helper function to create a matching key
    function createMatchKey(shift, config) {
        var keyParts = [shift.Client_Name];

        if (config.matchByDay) {
            keyParts.push(shift.Day);
        }

        if (config.matchByDate) {
            keyParts.push(shift.Schedule_Start_Date);
        }

        if (config.matchByTime) {
            keyParts.push(shift.Schedule_Start_Time);
            keyParts.push(shift.Schedule_End_Time);
        }

        return keyParts.join("|");
    }

    // Create a map of last week shifts for quick lookup
    var lastWeekMap = {};
    for (var i = 0; i < lastWeekShifts.length; i++) {
        var shift = lastWeekShifts[i];
        var key = createMatchKey(shift, config);
        lastWeekMap[key] = shift;
    }

    // Compare this week shifts with last week
    var totalShifts = 0; // only comparable shifts
    var shiftsKeptWithSameCaregiver = 0;
    var shiftsWithDifferentCaregiver = 0;

    for (var i = 0; i < thisWeekShifts.length; i++) {
        var currentShift = thisWeekShifts[i];
        var matchKey = createMatchKey(currentShift, config);
        var currentCaregiver = getCaregiverName(currentShift);
        var lastWeekShift = lastWeekMap[matchKey];

        if (!lastWeekShift) {
            // No same-day shift last week → EXCLUDE from calculation
            continue;
        }

        totalShifts++; // Only add when last-week same-day exists

        var lastWeekCaregiver = getCaregiverName(lastWeekShift);

        if (currentCaregiver === lastWeekCaregiver) {
            shiftsKeptWithSameCaregiver++;
        } else {
            shiftsWithDifferentCaregiver++;
        }
    }

    var shiftsKeptWithSameCaregiver = 0;
    var shiftsWithDifferentCaregiver = 0;
    var newShifts = 0;

    for (var i = 0; i < thisWeekShifts.length; i++) {
        var currentShift = thisWeekShifts[i];
        var matchKey = createMatchKey(currentShift, config);
        var currentCaregiver = getCaregiverName(currentShift);

        var lastWeekShift = lastWeekMap[matchKey];

        if (lastWeekShift) {

            var lastWeekCaregiver = getCaregiverName(lastWeekShift);
            var isSameCaregiver = currentCaregiver === lastWeekCaregiver;

            if (isSameCaregiver) {
                shiftsKeptWithSameCaregiver++;
            } else {
                shiftsWithDifferentCaregiver++;
            }

        } else {
            // These shifts must be EXCLUDED from the calculation
            newShifts++;
        }

    }

    // Calculate percentage
    var percentage = totalShifts > 0
        ? (shiftsKeptWithSameCaregiver / totalShifts) * 100
        : 0;


    console.log("\nCaregiver Retention Rate: (" + shiftsKeptWithSameCaregiver + " / " + totalShifts + ") × 100 = " + percentage.toFixed(2) + "%");
    // print the percentage value only
    console.log(percentage.toFixed(2));
    fields["Caregiver_Retention_Rate"].value = percentage.toFixed(2);
    // Calculate Pending_Caregiver_Retention_Score as 100 - Overall_Continuity_Rate (always positive)
    var percentagefullscoree = Math.abs(100 - parseFloat(percentage.toFixed(2)));
    fields["Pending_Caregiver_Retention_Score"].value = percentagefullscoree.toFixed(2);

    console.log("Continuity Score (100 - Rate): " + percentagefullscoree.toFixed(2) + "%");

    return {
        totalShifts: totalShifts,
        shiftsKeptWithSameCaregiver: shiftsKeptWithSameCaregiver,
        shiftsWithDifferentCaregiver: shiftsWithDifferentCaregiver,
        newShifts: newShifts,
        percentage: percentage,
        lastWeek: lastWeekMonday,
        thisWeek: thisWeekMonday
    };
}

function processscheduledata(response) {
    if (!response || response.length === 0) {
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    scheduleListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < schedulefieldsArrayCA.length; j++) {
            var key = schedulefieldsArrayCA[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key].value;
            }

            fieldValues[key] = value;
        }

        scheduleListg.push(fieldValues);
    }

    console.log("Schedule Data:", scheduleListg);

    // Calculate caregiver retention
    var results = calculateCaregiverRetention(scheduleListg, matchingConfig);
}

// INITIATE API CALL
app_lib.getTxnUsingIncFields(schedulecriteriaCA, schedulefieldsArrayCA, processscheduledata, scheduledateCriteriaCA, schedulesvctypeCA);