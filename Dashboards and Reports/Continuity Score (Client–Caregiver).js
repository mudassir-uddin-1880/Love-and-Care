// ============================================
// AUTOMATIC DATE RANGE CALCULATION - LAST 8 WEEKS
// ============================================
app_lib.removeRows("Continuity_Score_Week_Wise");
app_lib.removeRows("Caregiver_Continuity_Score");
app_lib.removeRows("Client_Continuity_Score");

var currDate = moment();
console.log("Current Date: " + currDate.format('YYYY-MM-DD'));

// Get the last 8 weeks range
var week1Monday = currDate.clone().startOf('isoWeek'); // Most recent week (Week 1)
var week8Monday = currDate.clone().subtract(7, 'weeks').startOf('isoWeek'); // 8 weeks ago
var week8Sunday = currDate.clone().endOf('isoWeek'); // End of current week

var scheduledateCriteriaContinuity = {
    "fieldName": "Schedule_Start_Date",
    "fromDate": week8Monday.format('YYYY-MM-DD'),
    "toDate": week8Sunday.format('YYYY-MM-DD')
};

console.log("Fetching data from: " + scheduledateCriteriaContinuity.fromDate + " to " + scheduledateCriteriaContinuity.toDate);

var schedulecriteriaContinuity = {
    "Record_Status": "Active",
    "Shift_Status": "Scheduled"
};

var schedulefieldsArrayContinuity = [
    "ID",
    "Client_Name",
    "Expected_Caregiver",
    "Actual_Caregiver",
    "Day",
    "Schedule_Start_Date",
    "Schedule_Start_Time",
    "Schedule_End_Time"
];

var schedulesvctypeContinuity = "SVC_TYPE_3";
var scheduleListContinuity = [];

// Helper function to get caregiver name
function getCaregiverName(shift) {
    return shift.Actual_Caregiver && shift.Actual_Caregiver.trim() !== ""
        ? shift.Actual_Caregiver
        : shift.Expected_Caregiver;
}

// Helper function to get Monday of the week
function getMondayOfWeek(dateString) {
    var date = moment(dateString);
    return date.startOf('isoWeek').format('YYYY-MM-DD');
}

// Function to calculate continuity scores
function calculateContinuityScores(scheduleData) {
    var currDate = moment();

    // Define 8 weeks (Week 1 = most recent, Week 8 = oldest)
    var weeks = [];
    for (var i = 0; i < 8; i++) {
        var weekMonday = currDate.clone().subtract(i, 'weeks').startOf('isoWeek').format('YYYY-MM-DD');
        var weekSunday = currDate.clone().subtract(i, 'weeks').endOf('isoWeek').format('YYYY-MM-DD');
        weeks.push({
            weekNumber: i + 1,
            monday: weekMonday,
            sunday: weekSunday,
            shifts: []
        });
    }

    console.log("\n=== 8 Week Period ===");
    for (var i = 0; i < weeks.length; i++) {
        console.log("Week " + weeks[i].weekNumber + ": " + weeks[i].monday + " to " + weeks[i].sunday);
    }

    // Organize shifts by week
    for (var i = 0; i < scheduleData.length; i++) {
        var shift = scheduleData[i];
        var shiftDate = shift.Schedule_Start_Date;

        for (var w = 0; w < weeks.length; w++) {
            if (shiftDate >= weeks[w].monday && shiftDate <= weeks[w].sunday) {
                weeks[w].shifts.push(shift);
                break;
            }
        }
    }

    // Create client-caregiver pairs for each week
    for (var w = 0; w < weeks.length; w++) {
        var pairs = {};
        for (var s = 0; s < weeks[w].shifts.length; s++) {
            var shift = weeks[w].shifts[s];
            var client = shift.Client_Name;
            var caregiver = getCaregiverName(shift);

            if (client && caregiver) {
                var pairKey = client + "|" + caregiver;
                if (!pairs[pairKey]) {
                    pairs[pairKey] = {
                        client: client,
                        caregiver: caregiver,
                        count: 0
                    };
                }
                pairs[pairKey].count++;
            }
        }
        weeks[w].pairs = pairs;
    }

    // Calculate week-wise continuity
    var weekWiseContinuity = calculateWeekWiseContinuity(weeks);

    // Calculate caregiver-wise continuity
    var caregiverContinuity = calculateCaregiverWiseContinuity(weeks);

    // Calculate client-wise continuity
    var clientContinuity = calculateClientWiseContinuity(weeks);

    // Calculate overall continuity
    var overallContinuity = calculateOverallContinuity(weeks);

    return {
        weekWise: weekWiseContinuity,
        caregiverWise: caregiverContinuity,
        clientWise: clientContinuity,
        overall: overallContinuity
    };
}

// Calculate week-wise continuity (what % of pairs from previous week continued)
// Calculate week-wise continuity (what % of pairs from previous week continued)
function calculateWeekWiseContinuity(weeks) {
    var weekWiseData = [];

    console.log("\n=== Week-Wise Continuity ===");

    // Only calculate for weeks 1-7, as week 8 has no previous week to compare
    for (var w = 0; w < weeks.length - 1; w++) {
        var currentWeek = weeks[w];
        var previousWeek = weeks[w + 1];
        var totalPairsInCurrent = Object.keys(currentWeek.pairs).length;
        var continuedPairs = 0;

        for (var pairKey in currentWeek.pairs) {
            if (previousWeek.pairs[pairKey]) {
                continuedPairs++;
            }
        }

        var continuityScore = totalPairsInCurrent > 0 ? (continuedPairs / totalPairsInCurrent) * 100 : 0;

        console.log("Week " + currentWeek.weekNumber + ": " + continuityScore.toFixed(2) + "%");

        weekWiseData.push({
            Week: "Week " + currentWeek.weekNumber,
            Percentage: continuityScore.toFixed(2)
        });
    }

    return weekWiseData;
}
// Calculate caregiver-wise weighted continuity
function calculateCaregiverWiseContinuity(weeks) {
    var caregiverData = {};

    // Track which clients each caregiver worked with each week
    for (var w = 0; w < weeks.length; w++) {
        for (var pairKey in weeks[w].pairs) {
            var pair = weeks[w].pairs[pairKey];
            var caregiver = pair.caregiver;
            var client = pair.client;

            if (!caregiverData[caregiver]) {
                caregiverData[caregiver] = {
                    weeks: [{}, {}, {}, {}, {}, {}, {}, {}] // 8 weeks of client tracking
                };
            }

            caregiverData[caregiver].weeks[w][client] = true;
        }
    }

    // Calculate weighted continuity for each caregiver
    var caregiverArray = [];
    var weights = [8, 7, 6, 5, 4, 3, 2, 1]; // Week 1 = weight 8, Week 8 = weight 1

    console.log("\n=== Caregiver-Wise Continuity ===");

    for (var caregiver in caregiverData) {
        var weeklyData = caregiverData[caregiver].weeks;
        var weightedSum = 0;
        var maxPossible = 36; // 8+7+6+5+4+3+2+1

        // For each week, check if caregiver maintained clients from previous week
        for (var w = 0; w < 8; w++) {
            var currentClients = Object.keys(weeklyData[w]);

            if (currentClients.length === 0) {
                // No work this week = 0 continuity
                continue;
            }

            if (w === 7) {
                // Week 8 (oldest) - count as continuous if they worked
                weightedSum += weights[w];
            } else {
                var nextWeekClients = Object.keys(weeklyData[w + 1]);

                if (nextWeekClients.length === 0) {
                    // No comparison possible
                    continue;
                }

                // Check if any clients continued from next week (previous in time)
                var continuedClients = 0;
                for (var c = 0; c < currentClients.length; c++) {
                    if (weeklyData[w + 1][currentClients[c]]) {
                        continuedClients++;
                    }
                }

                var continuityRatio = continuedClients / currentClients.length;
                weightedSum += weights[w] * continuityRatio;
            }
        }

        var continuityScore = (weightedSum / maxPossible) * 100;

        console.log("Caregiver: " + caregiver + " - Score: " + continuityScore.toFixed(2) + "%");

        caregiverArray.push({
            Caregiver: caregiver,
            Continuity_Score: continuityScore.toFixed(2)
        });
    }

    return caregiverArray;
}

// Calculate client-wise weighted continuity
function calculateClientWiseContinuity(weeks) {
    var clientData = {};

    // Track which caregivers each client worked with each week
    for (var w = 0; w < weeks.length; w++) {
        for (var pairKey in weeks[w].pairs) {
            var pair = weeks[w].pairs[pairKey];
            var client = pair.client;
            var caregiver = pair.caregiver;

            if (!clientData[client]) {
                clientData[client] = {
                    weeks: [{}, {}, {}, {}, {}, {}, {}, {}] // 8 weeks of caregiver tracking
                };
            }

            clientData[client].weeks[w][caregiver] = true;
        }
    }

    // Calculate weighted continuity for each client
    var clientArray = [];
    var weights = [8, 7, 6, 5, 4, 3, 2, 1];

    console.log("\n=== Client-Wise Continuity ===");

    for (var client in clientData) {
        var weeklyData = clientData[client].weeks;
        var weightedSum = 0;
        var maxPossible = 36;

        for (var w = 0; w < 8; w++) {
            var currentCaregivers = Object.keys(weeklyData[w]);

            if (currentCaregivers.length === 0) {
                continue;
            }

            if (w === 7) {
                // Week 8 (oldest) - count as continuous if they had care
                weightedSum += weights[w];
            } else {
                var nextWeekCaregivers = Object.keys(weeklyData[w + 1]);

                if (nextWeekCaregivers.length === 0) {
                    continue;
                }

                // Check if caregiver continued from next week
                var sameCaregiverContinued = false;
                for (var c = 0; c < currentCaregivers.length; c++) {
                    if (weeklyData[w + 1][currentCaregivers[c]]) {
                        sameCaregiverContinued = true;
                        break;
                    }
                }

                if (sameCaregiverContinued) {
                    weightedSum += weights[w];
                }
            }
        }

        var continuityScore = (weightedSum / maxPossible) * 100;

        console.log("Client: " + client + " - Score: " + continuityScore.toFixed(2) + "%");

        clientArray.push({
            Client: client,
            Continuity_Score: continuityScore.toFixed(2)
        });
    }

    return clientArray;
}

// Calculate overall weighted continuity
function calculateOverallContinuity(weeks) {
    var allPairs = {};

    // Track all unique client-caregiver pairs across all weeks
    for (var w = 0; w < weeks.length; w++) {
        for (var pairKey in weeks[w].pairs) {
            if (!allPairs[pairKey]) {
                allPairs[pairKey] = {
                    client: weeks[w].pairs[pairKey].client,
                    caregiver: weeks[w].pairs[pairKey].caregiver,
                    weekActivity: [0, 0, 0, 0, 0, 0, 0, 0] // Binary array for 8 weeks
                };
            }
            allPairs[pairKey].weekActivity[w] = 1;
        }
    }

    var weights = [8, 7, 6, 5, 4, 3, 2, 1];
    var totalWeightedSum = 0;
    var totalPairs = Object.keys(allPairs).length;
    var maxPossible = 36;

    console.log("\n=== Overall Continuity Calculation ===");

    for (var pairKey in allPairs) {
        var pair = allPairs[pairKey];
        var pairWeightedSum = 0;

        for (var w = 0; w < 8; w++) {
            pairWeightedSum += weights[w] * pair.weekActivity[w];
        }

        totalWeightedSum += pairWeightedSum;
    }

    var overallScore = totalPairs > 0 ? (totalWeightedSum / (totalPairs * maxPossible)) * 100 : 0;

    console.log("Total Pairs: " + totalPairs);
    console.log("Overall Continuity Score: " + overallScore.toFixed(2) + "%");

    fields["Overall_Continuity_Rate"].value = overallScore.toFixed(2);

    // Calculate Pending_Overall_Continuity_Score as 100 - Overall_Continuity_Rate (always positive)
    var overallContinuityScore = Math.abs(100 - parseFloat(overallScore.toFixed(2)));
    fields["Pending_Overall_Continuity_Score"].value = overallContinuityScore.toFixed(2);

    console.log("Overall Continuity Score (100 - Rate): " + overallContinuityScore.toFixed(2) + "%");

    return overallScore.toFixed(2);
}

// Function to add week-wise data to table
function addWeekWiseDataToTable(weekWiseArray) {

    var addRowsArray = [];

    for (var idx = 0; idx < weekWiseArray.length; idx++) {
        addRowsArray.push({
            "fields": {
                "Weeks": {
                    "value": weekWiseArray[idx].Week
                },
                "Percentage": {
                    "value": weekWiseArray[idx].Percentage
                }
            }
        });
    }

    if (addRowsArray.length > 0) {
        app_lib.addRows("Continuity_Score_Week_Wise", addRowsArray, true);
        console.log("\n=== Successfully added " + addRowsArray.length + " week records to table ===");
    }
}
// Function to add caregiver-wise data to table
function addCaregiverContinuityToTable(caregiverArray) {

    var addRowsArray = [];

    for (var idx = 0; idx < caregiverArray.length; idx++) {
        addRowsArray.push({
            "fields": {
                "Caregiver": {
                    "value": caregiverArray[idx].Caregiver
                },
                "Continuity_Score": {
                    "value": caregiverArray[idx].Continuity_Score
                }
            }
        });
    }

    if (addRowsArray.length > 0) {
        app_lib.addRows("Caregiver_Continuity_Score", addRowsArray, true);
        console.log("\n=== Successfully added " + addRowsArray.length + " caregiver records to table ===");
    }
}
// Function to add client-wise data to table
function addClientContinuityToTable(clientArray) {

    var addRowsArray = [];

    for (var idx = 0; idx < clientArray.length; idx++) {
        addRowsArray.push({
            "fields": {
                "Client": {
                    "value": clientArray[idx].Client
                },
                "Continuity_Score": {
                    "value": clientArray[idx].Continuity_Score
                }
            }
        });
    }

    if (addRowsArray.length > 0) {
        app_lib.addRows("Client_Continuity_Score", addRowsArray, true);
        console.log("\n=== Successfully added " + addRowsArray.length + " client records to table ===");
    }
}

// Process schedule data
function processScheduleContinuityData(response) {
    if (!response || response.length === 0) {
        console.log("No valid schedule data received.");
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total schedule records received:", response.length);

    scheduleListContinuity = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < schedulefieldsArrayContinuity.length; j++) {
            var key = schedulefieldsArrayContinuity[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key].value;
            }

            fieldValues[key] = value;
        }

        scheduleListContinuity.push(fieldValues);
    }

    console.log("Schedule data loaded:", scheduleListContinuity);

    // Calculate all continuity scores
    var results = calculateContinuityScores(scheduleListContinuity);

    // Add data to tables
    addWeekWiseDataToTable(results.weekWise);
    addCaregiverContinuityToTable(results.caregiverWise);
    addClientContinuityToTable(results.clientWise);
}

// Call the function
app_lib.getTxnUsingIncFields(schedulecriteriaContinuity, schedulefieldsArrayContinuity, processScheduleContinuityData, scheduledateCriteriaContinuity, schedulesvctypeContinuity);