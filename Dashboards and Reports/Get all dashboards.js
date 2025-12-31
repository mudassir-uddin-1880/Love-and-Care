if (fields["Start_Date"].value === "" || fields["End_Date"].value === "" || !fields["Start_Date"].value || !fields["End_Date"].value || fields["End_Date"].value === null || fields["Start_Date"].value === null) {
    app_lib.showWarn("Please select Start Date and End Date to generate the dashboard.")
}
else {
    var perspective = app_lib.getCurrentPerspective();
    var perspectiveName = perspective.name;

    console.log("Current Perspective: " + perspectiveName);

    // ============================================
    // CONSOLIDATED DASHBOARD LOGIC
    // All Dashboards Load with Single Button Click
    // 8 Separate API Calls - One Per Dashboard


    app_lib.removeRows("Continuity_Score_Week_Wise", true);
    app_lib.removeRows("Caregiver_Continuity_Score", true);
    app_lib.removeRows("Client_Continuity_Score", true);
    app_lib.removeRows("Caregiver_OnTime_ClockIn_Rate", true);
    app_lib.removeRows("Late_Arrival_Distribution", true);
    app_lib.removeRows("Caregiver_Late_Arrivals", true);
    app_lib.removeRows("Client_Late_Impact", true);
    app_lib.removeRows("Geofence_Compliance", true);
    app_lib.removeRows("NoShow_Caregiver_Incident_Rate", true);

    // ============================================
    // GLOBAL VARIABLES
    // ============================================
    var currDate = moment();
    console.log("Current Date: " + currDate.format('YYYY-MM-DD'));

    var thisWeekMonday = currDate.clone().startOf('isoWeek');
    var thisWeekSunday = currDate.clone().endOf('isoWeek');
    var lastWeekMonday = currDate.clone().subtract(1, 'weeks').startOf('isoWeek');
    var lastWeekSunday = currDate.clone().subtract(1, 'weeks').endOf('isoWeek');
    var week8Monday = currDate.clone().subtract(7, 'weeks').startOf('isoWeek');

    var completedCalls = 0;
    var totalCalls = 8;

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    function getCaregiverName(shift) {
        return shift.Actual_Caregiver && shift.Actual_Caregiver.trim() !== ""
            ? shift.Actual_Caregiver
            : shift.Expected_Caregiver;
    }

    function cleanTime(val) {
        if (!val) return "";
        return val
            .toString()
            .trim()
            .replace(/[\u200B-\u200F\u202A-\u202E\u00A0]/g, "")
            .replace(/\s+/g, " ");
    }

    function getMondayOfWeek(dateString) {
        var date = new Date(dateString);
        var day = date.getDay();
        var diff = date.getDate() - day + (day === 0 ? -6 : 1);
        var monday = new Date(date.setDate(diff));
        return monday.toISOString().split('T')[0];
    }

    function parseTimeToMinutes(timeString) {
        if (!timeString) return null;
        var parts = timeString.split(':');
        if (parts.length !== 2) return null;
        var hours = parseInt(parts[0], 10);
        var minutes = parseInt(parts[1], 10);
        if (isNaN(hours) || isNaN(minutes)) return null;
        return hours * 60 + minutes;
    }

    function isOnTimeOrBefore(scheduleStartTime, checkInTime) {
        var scheduleMinutes = parseTimeToMinutes(scheduleStartTime);
        var checkInMinutes = parseTimeToMinutes(checkInTime);

        if (scheduleMinutes === null || checkInMinutes === null) {
            return false;
        }

        var diff = checkInMinutes - scheduleMinutes;

        if (diff > 720) {
            diff = diff - 1440;
        } else if (diff < -720) {
            diff = diff + 1440;
        }

        return diff <= 0;
    }

    function calculateMinutesLate(scheduleStartTime, checkInTime) {
        if (!scheduleStartTime || !checkInTime) {
            return null;
        }

        scheduleStartTime = cleanTime(scheduleStartTime);
        checkInTime = cleanTime(checkInTime);

        var formats = [
            "HH:mm",
            "hh:mm A",
            "h:mm A",
            "HH:mm:ss",
            "hh:mm:ss A",
            "h:mm:ss A"
        ];

        var startFull = "2000-01-01 " + scheduleStartTime;
        var checkInFull = "2000-01-01 " + checkInTime;

        var formatsWithDate = formats.map(function (f) { return "YYYY-MM-DD " + f; });

        var startTime = moment(startFull, formatsWithDate, true);
        var checkIn = moment(checkInFull, formatsWithDate, true);

        if (!startTime.isValid() || !checkIn.isValid()) {
            return null;
        }

        var diffMinutes = checkIn.diff(startTime, "minutes");
        return diffMinutes;
    }

    function categorizeLateArrival(minutesLate) {
        if (minutesLate <= 0) {
            return "On Time";
        } else if (minutesLate <= 5) {
            return "1-5 min";
        } else if (minutesLate <= 10) {
            return "6-10 min";
        } else if (minutesLate <= 15) {
            return "11-15 min";
        } else {
            return "15+ min";
        }
    }

    // ============================================
    // DASHBOARD 1: CAREGIVER RETENTION RATE
    // ============================================

    function calculateCaregiverRetention(scheduleData) {
        var lastWeekMondayStr = lastWeekMonday.format('YYYY-MM-DD');
        var lastWeekSundayStr = lastWeekSunday.format('YYYY-MM-DD');
        var thisWeekMondayStr = thisWeekMonday.format('YYYY-MM-DD');
        var thisWeekSundayStr = thisWeekSunday.format('YYYY-MM-DD');

        var filteredData = [];
        for (var i = 0; i < scheduleData.length; i++) {
            var shift = scheduleData[i];
            var shiftDate = shift.Schedule_Start_Date;
            if (shiftDate >= lastWeekMondayStr && shiftDate <= thisWeekSundayStr) {
                filteredData.push(shift);
            }
        }

        var lastWeekShifts = [];
        var thisWeekShifts = [];

        for (var i = 0; i < filteredData.length; i++) {
            var shift = filteredData[i];
            var shiftWeekMonday = getMondayOfWeek(shift.Schedule_Start_Date);

            if (shiftWeekMonday === lastWeekMondayStr) {
                lastWeekShifts.push(shift);
            } else if (shiftWeekMonday === thisWeekMondayStr) {
                thisWeekShifts.push(shift);
            }
        }

        if (thisWeekShifts.length === 0) {
            console.log("No shifts in current week for retention calculation");
            checkAllCallsComplete();
            return;
        }

        function createMatchKey(shift) {
            return [shift.Client_Name, shift.Day, shift.Schedule_Start_Time, shift.Schedule_End_Time].join("|");
        }

        var lastWeekMap = {};
        for (var i = 0; i < lastWeekShifts.length; i++) {
            var shift = lastWeekShifts[i];
            var key = createMatchKey(shift);
            lastWeekMap[key] = shift;
        }

        var totalShifts = 0;
        var shiftsKeptWithSameCaregiver = 0;

        for (var i = 0; i < thisWeekShifts.length; i++) {
            var currentShift = thisWeekShifts[i];
            var matchKey = createMatchKey(currentShift);
            var lastWeekShift = lastWeekMap[matchKey];

            if (!lastWeekShift) {
                continue;
            }

            totalShifts++;
            var currentCaregiver = getCaregiverName(currentShift);
            var lastWeekCaregiver = getCaregiverName(lastWeekShift);

            if (currentCaregiver === lastWeekCaregiver) {
                shiftsKeptWithSameCaregiver++;
            }
        }

        var percentage = totalShifts > 0 ? (shiftsKeptWithSameCaregiver / totalShifts) * 100 : 0;

        console.log("\n=== Caregiver Retention Rate ===");
        console.log("Retention Rate: " + percentage.toFixed(2) + "%");

        fields["Caregiver_Retention_Rate"].value = percentage.toFixed(2);
        fields["Pending_Caregiver_Retention_Score"].value = Math.abs(100 - percentage).toFixed(2);

        checkAllCallsComplete();
    }

    // ============================================
    // DASHBOARD 2: ON-TIME CLOCK-IN RATE
    // ============================================

    function calculateOnTimeClockIn(scheduleData) {
        var totalShifts = 0;
        var onTimeClockIns = 0;
        var caregiverStats = {};

        for (var i = 0; i < scheduleData.length; i++) {
            var record = scheduleData[i];

            if (record.Schedule_Start_Time && record.CheckIn_Time &&
                record.Schedule_Start_Time !== "" && record.CheckIn_Time !== "") {

                totalShifts++;

                var isOnTime = isOnTimeOrBefore(record.Schedule_Start_Time, record.CheckIn_Time);
                if (isOnTime) {
                    onTimeClockIns++;
                }

                var caregiverName = getCaregiverName(record);
                if (caregiverName && caregiverName !== "") {
                    if (!caregiverStats[caregiverName]) {
                        caregiverStats[caregiverName] = { totalShifts: 0, onTimeClockIns: 0 };
                    }
                    caregiverStats[caregiverName].totalShifts++;
                    if (isOnTime) {
                        caregiverStats[caregiverName].onTimeClockIns++;
                    }
                }
            }
        }

        var onTimePercentage = totalShifts > 0 ? (onTimeClockIns / totalShifts) * 100 : 0;

        console.log("\n=== On-Time Clock-In Rate ===");
        console.log("On-time percentage: " + onTimePercentage.toFixed(2) + "%");

        fields["OnTime_ClockIn_Rate"].value = onTimePercentage.toFixed(2);
        fields["Pending_OnTime_ClockIn_Score"].value = Math.abs(100 - onTimePercentage).toFixed(2);

        var caregiverArray = [];
        for (var caregiver in caregiverStats) {
            var stats = caregiverStats[caregiver];
            var percentage = stats.totalShifts > 0 ? (stats.onTimeClockIns / stats.totalShifts) * 100 : 0;
            caregiverArray.push({
                Caregiver: caregiver,
                Caregiver_OnTime_ClockIn_Rate: percentage.toFixed(2)
            });
        }

        var addRowsArray = [];
        for (var idx = 0; idx < caregiverArray.length; idx++) {
            addRowsArray.push({
                "fields": {
                    "Caregiver": { "value": caregiverArray[idx].Caregiver },
                    "Caregiver_OnTime_ClockIn_Rate": { "value": caregiverArray[idx].Caregiver_OnTime_ClockIn_Rate }
                }
            });
        }

        if (addRowsArray.length > 0) {
            app_lib.addRows("Caregiver_OnTime_ClockIn_Rate", addRowsArray, true);
        }

        checkAllCallsComplete();
    }

    // ============================================
    // DASHBOARD 3: NOTE COMPLETION RATE
    // ============================================

    function calculateNoteCompletion(scheduleData) {
        var totalShifts = scheduleData.length;
        var shiftsWithNotes = 0;

        for (var i = 0; i < scheduleData.length; i++) {
            var record = scheduleData[i];
            // Check if Notes_Status is NOT "Absent" (meaning notes are present)
            if (record.Notes_Status && record.Notes_Status !== "Absent") {
                shiftsWithNotes++;
            }
        }

        var noteCompletionPercentage = totalShifts > 0 ? (shiftsWithNotes / totalShifts) * 100 : 0;

        console.log("\n=== Note Completion Rate ===");
        console.log("Note completion percentage: " + noteCompletionPercentage.toFixed(2) + "%");

        fields["Note_Completion_Rate"].value = noteCompletionPercentage.toFixed(2);
        fields["Pending_Note_Completion_Score"].value = Math.abs(100 - noteCompletionPercentage).toFixed(2);

        checkAllCallsComplete();
    }


    // ============================================
    // DASHBOARD 4: EMERGENCY COVERAGE SUCCESS RATE
    // ============================================

    function calculateEmergencyCoverage(emergencyData) {
        var totalEmergencies = emergencyData.length;
        var successfulCoverageCount = 0;

        for (var i = 0; i < emergencyData.length; i++) {
            if (emergencyData[i].CoverageSuccessful === "Successful") {
                successfulCoverageCount++;
            }
        }

        var emergencyCoverageSuccessRate = totalEmergencies > 0 ? (successfulCoverageCount / totalEmergencies) * 100 : 0;

        console.log("\n=== Emergency Coverage Success Rate ===");
        console.log("Success Rate: " + emergencyCoverageSuccessRate.toFixed(2) + "%");

        fields["Emergency_Coverage_Success_Rate"].value = emergencyCoverageSuccessRate.toFixed(2);
        fields["Pending_Emergency_Coverage_Success_Score"].value = Math.abs(100 - emergencyCoverageSuccessRate).toFixed(2);

        checkAllCallsComplete();
    }

    // ============================================
    // DASHBOARD 5: CONTINUITY SCORES
    // ============================================

    function calculateContinuityScores(scheduleData) {
        var currDate = moment();
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

        for (var w = 0; w < weeks.length; w++) {
            var pairs = {};
            for (var s = 0; s < weeks[w].shifts.length; s++) {
                var shift = weeks[w].shifts[s];
                var client = shift.Client_Name;
                var caregiver = getCaregiverName(shift);

                if (client && caregiver) {
                    var pairKey = client + "|" + caregiver;
                    if (!pairs[pairKey]) {
                        pairs[pairKey] = { client: client, caregiver: caregiver, count: 0 };
                    }
                    pairs[pairKey].count++;
                }
            }
            weeks[w].pairs = pairs;
        }

        var weekWise = calculateWeekWiseContinuity(weeks);
        var caregiverWise = calculateCaregiverWiseContinuity(weeks);
        var clientWise = calculateClientWiseContinuity(weeks);
        var overall = calculateOverallContinuity(weeks);

        addWeekWiseDataToTable(weekWise);
        addCaregiverContinuityToTable(caregiverWise);
        addClientContinuityToTable(clientWise);

        checkAllCallsComplete();
    }

    function calculateWeekWiseContinuity(weeks) {
        var weekWiseData = [];

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

            weekWiseData.push({
                Week: "Week " + currentWeek.weekNumber,
                Percentage: continuityScore.toFixed(2)
            });
        }

        return weekWiseData;
    }

    function calculateCaregiverWiseContinuity(weeks) {
        var caregiverData = {};

        for (var w = 0; w < weeks.length; w++) {
            for (var pairKey in weeks[w].pairs) {
                var pair = weeks[w].pairs[pairKey];
                var caregiver = pair.caregiver;
                var client = pair.client;

                if (!caregiverData[caregiver]) {
                    caregiverData[caregiver] = { weeks: [{}, {}, {}, {}, {}, {}, {}, {}] };
                }

                caregiverData[caregiver].weeks[w][client] = true;
            }
        }

        var caregiverArray = [];
        var weights = [8, 7, 6, 5, 4, 3, 2, 1];

        for (var caregiver in caregiverData) {
            var weeklyData = caregiverData[caregiver].weeks;
            var weightedSum = 0;
            var maxPossible = 36;

            for (var w = 0; w < 8; w++) {
                var currentClients = Object.keys(weeklyData[w]);

                if (currentClients.length === 0) {
                    continue;
                }

                if (w === 7) {
                    weightedSum += weights[w];
                } else {
                    var nextWeekClients = Object.keys(weeklyData[w + 1]);

                    if (nextWeekClients.length === 0) {
                        continue;
                    }

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

            caregiverArray.push({
                Caregiver: caregiver,
                Continuity_Score: continuityScore.toFixed(2)
            });
        }

        return caregiverArray;
    }

    function calculateClientWiseContinuity(weeks) {
        var clientData = {};

        for (var w = 0; w < weeks.length; w++) {
            for (var pairKey in weeks[w].pairs) {
                var pair = weeks[w].pairs[pairKey];
                var client = pair.client;
                var caregiver = pair.caregiver;

                if (!clientData[client]) {
                    clientData[client] = { weeks: [{}, {}, {}, {}, {}, {}, {}, {}] };
                }

                clientData[client].weeks[w][caregiver] = true;
            }
        }

        var clientArray = [];
        var weights = [8, 7, 6, 5, 4, 3, 2, 1];

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
                    weightedSum += weights[w];
                } else {
                    var nextWeekCaregivers = Object.keys(weeklyData[w + 1]);

                    if (nextWeekCaregivers.length === 0) {
                        continue;
                    }

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

            clientArray.push({
                Client: client,
                Continuity_Score: continuityScore.toFixed(2)
            });
        }

        return clientArray;
    }

    function calculateOverallContinuity(weeks) {
        var allPairs = {};

        for (var w = 0; w < weeks.length; w++) {
            for (var pairKey in weeks[w].pairs) {
                if (!allPairs[pairKey]) {
                    allPairs[pairKey] = {
                        client: weeks[w].pairs[pairKey].client,
                        caregiver: weeks[w].pairs[pairKey].caregiver,
                        weekActivity: [0, 0, 0, 0, 0, 0, 0, 0]
                    };
                }
                allPairs[pairKey].weekActivity[w] = 1;
            }
        }

        var weights = [8, 7, 6, 5, 4, 3, 2, 1];
        var totalWeightedSum = 0;
        var totalPairs = Object.keys(allPairs).length;
        var maxPossible = 36;

        for (var pairKey in allPairs) {
            var pair = allPairs[pairKey];
            var pairWeightedSum = 0;

            for (var w = 0; w < 8; w++) {
                pairWeightedSum += weights[w] * pair.weekActivity[w];
            }

            totalWeightedSum += pairWeightedSum;
        }

        var overallScore = totalPairs > 0 ? (totalWeightedSum / (totalPairs * maxPossible)) * 100 : 0;

        console.log("\n=== Overall Continuity Score ===");
        console.log("Overall Score: " + overallScore.toFixed(2) + "%");

        fields["Overall_Continuity_Rate"].value = overallScore.toFixed(2);
        fields["Pending_Overall_Continuity_Score"].value = Math.abs(100 - overallScore).toFixed(2);

        return overallScore.toFixed(2);
    }

    function addWeekWiseDataToTable(weekWiseArray) {
        var addRowsArray = [];
        for (var idx = 0; idx < weekWiseArray.length; idx++) {
            addRowsArray.push({
                "fields": {
                    "Weeks": { "value": weekWiseArray[idx].Week },
                    "Percentage": { "value": weekWiseArray[idx].Percentage }
                }
            });
        }
        if (addRowsArray.length > 0) {
            app_lib.addRows("Continuity_Score_Week_Wise", addRowsArray, true);
        }
    }

    function addCaregiverContinuityToTable(caregiverArray) {
        var addRowsArray = [];
        for (var idx = 0; idx < caregiverArray.length; idx++) {
            addRowsArray.push({
                "fields": {
                    "Caregiver": { "value": caregiverArray[idx].Caregiver },
                    "Continuity_Score": { "value": caregiverArray[idx].Continuity_Score }
                }
            });
        }
        if (addRowsArray.length > 0) {
            app_lib.addRows("Caregiver_Continuity_Score", addRowsArray, true);
        }
    }

    function addClientContinuityToTable(clientArray) {
        var addRowsArray = [];
        for (var idx = 0; idx < clientArray.length; idx++) {
            addRowsArray.push({
                "fields": {
                    "Client": { "value": clientArray[idx].Client },
                    "Continuity_Score": { "value": clientArray[idx].Continuity_Score }
                }
            });
        }
        if (addRowsArray.length > 0) {
            app_lib.addRows("Client_Continuity_Score", addRowsArray, true);
        }
    }

    // ============================================
    // DASHBOARD 6: LATE ARRIVAL DISTRIBUTION
    // ============================================

    function analyzeLateArrivals(scheduleData) {
        console.log("\n=== LATE ARRIVAL ANALYSIS ===");

        var totalShifts = 0;
        var totalLateArrivals = 0;
        var lateByBucket = {
            "1-5 min": 0,
            "6-10 min": 0,
            "11-15 min": 0,
            "15+ min": 0
        };

        var caregiverStats = {};
        var clientStats = {};

        for (var i = 0; i < scheduleData.length; i++) {
            var shift = scheduleData[i];
            var caregiver = getCaregiverName(shift);
            var client = shift.Client_Name;
            var startTime = shift.Schedule_Start_Time;
            var checkInTime = shift.CheckIn_Time;

            if (!startTime || !checkInTime || !caregiver || !client) {
                continue;
            }

            totalShifts++;

            var minutesLate = calculateMinutesLate(startTime, checkInTime);

            if (minutesLate === null) {
                continue;
            }

            var bucket = categorizeLateArrival(minutesLate);

            if (!caregiverStats[caregiver]) {
                caregiverStats[caregiver] = {
                    totalShifts: 0,
                    lateCount: 0,
                    late_1_5: 0,
                    late_6_10: 0,
                    late_11_15: 0,
                    late_over_15: 0,
                    totalLateMinutes: 0
                };
            }

            if (!clientStats[client]) {
                clientStats[client] = {
                    totalShifts: 0,
                    lateCount: 0,
                    totalLateMinutes: 0
                };
            }

            caregiverStats[caregiver].totalShifts++;
            clientStats[client].totalShifts++;

            if (minutesLate > 0) {
                totalLateArrivals++;
                caregiverStats[caregiver].lateCount++;
                caregiverStats[caregiver].totalLateMinutes += minutesLate;
                clientStats[client].lateCount++;
                clientStats[client].totalLateMinutes += minutesLate;

                if (bucket === "1-5 min") {
                    lateByBucket["1-5 min"]++;
                    caregiverStats[caregiver].late_1_5++;
                } else if (bucket === "6-10 min") {
                    lateByBucket["6-10 min"]++;
                    caregiverStats[caregiver].late_6_10++;
                } else if (bucket === "11-15 min") {
                    lateByBucket["11-15 min"]++;
                    caregiverStats[caregiver].late_11_15++;
                } else if (bucket === "15+ min") {
                    lateByBucket["15+ min"]++;
                    caregiverStats[caregiver].late_over_15++;
                }
            }
        }

        console.log("Total Completed Shifts: " + totalShifts);
        console.log("Total Late Arrivals: " + totalLateArrivals);

        fields["Total_Completed_Shifts"].value = totalShifts;
        fields["Total_Late_Arrivals"].value = totalLateArrivals;
        var overallLatePercentage = totalShifts > 0 ? ((totalLateArrivals / totalShifts) * 100).toFixed(2) : 0;

        fields["Overall_Late_Percentage_Rate"].value = overallLatePercentage;

        // ADD THIS LINE:
        fields["Pending_Overall_Late_Percentage"].value = Math.abs(100 - parseFloat(overallLatePercentage)).toFixed(2);
        fields["Late_Within_5_Min_Count"].value = lateByBucket["1-5 min"];
        fields["Late_Within_10_Min_Count"].value = lateByBucket["6-10 min"];
        fields["Late_Within_15_Min_Count"].value = lateByBucket["11-15 min"];
        fields["Late_Over_15_Min_Count"].value = lateByBucket["15+ min"];

        addBucketDataToTable(lateByBucket, totalLateArrivals);
        addCaregiverLateDataToTable(caregiverStats);
        addClientImpactDataToTable(clientStats);
    }

    function addBucketDataToTable(lateByBucket, totalLateArrivals) {
        var addRowsArray = [];
        var buckets = ["1-5 min", "6-10 min", "11-15 min", "15+ min"];

        for (var i = 0; i < buckets.length; i++) {
            var bucket = buckets[i];
            var count = lateByBucket[bucket];
            var percentage = totalLateArrivals > 0 ? ((count / totalLateArrivals) * 100).toFixed(2) : 0;

            addRowsArray.push({
                "fields": {
                    "Delay_Bucket": { "value": bucket },
                    "Count": { "value": count },
                    "Percentage": { "value": percentage }
                }
            });
        }

        if (addRowsArray.length > 0) {
            app_lib.addRows("Late_Arrival_Distribution", addRowsArray, true);
        }
    }

    function addCaregiverLateDataToTable(caregiverStats) {
        var addRowsArray = [];

        for (var caregiver in caregiverStats) {
            var stats = caregiverStats[caregiver];

            // Calculate percentages and averages
            var latePercentage = stats.totalShifts > 0 ? ((stats.lateCount / stats.totalShifts) * 100) : 0;
            var avgLateMinutes = stats.lateCount > 0 ? (stats.totalLateMinutes / stats.lateCount) : 0;

            addRowsArray.push({
                "fields": {
                    "Caregiver": { "value": caregiver },  // Text value
                    "Total_Shifts": { "value": parseInt(stats.totalShifts) },  // Ensure it's a number
                    "Late_Count": { "value": parseInt(stats.lateCount) },
                    "Late_Percentage": { "value": parseFloat(latePercentage.toFixed(2)) },
                    "Late_1_5_Min": { "value": parseInt(stats.late_1_5) },
                    "Late_6_10_Min": { "value": parseInt(stats.late_6_10) },
                    "Late_11_15_Min": { "value": parseInt(stats.late_11_15) },
                    "Late_Over_15_Min": { "value": parseInt(stats.late_over_15) },
                    "Avg_Late_Minutes": { "value": parseFloat(avgLateMinutes.toFixed(2)) }
                }
            });
        }

        console.log("Adding " + addRowsArray.length + " caregiver late arrival records");

        if (addRowsArray.length > 0) {
            console.log("Sample caregiver data:", JSON.stringify(addRowsArray[0]));
            app_lib.addRows("Caregiver_Late_Arrivals", addRowsArray, true);
        }
    }

    function addClientImpactDataToTable(clientStats) {
        var addRowsArray = [];

        for (var client in clientStats) {
            var stats = clientStats[client];

            // Calculate percentages and averages
            var latePercentage = stats.totalShifts > 0 ? ((stats.lateCount / stats.totalShifts) * 100) : 0;
            var avgDelayMinutes = stats.lateCount > 0 ? (stats.totalLateMinutes / stats.lateCount) : 0;

            addRowsArray.push({
                "fields": {
                    "Client": { "value": client },  // Text value
                    "Total_Shifts": { "value": parseInt(stats.totalShifts) },  // Ensure it's a number
                    "Late_Arrivals": { "value": parseInt(stats.lateCount) },
                    "Late_Percentage": { "value": parseFloat(latePercentage.toFixed(2)) },
                    "Avg_Delay_Minutes": { "value": parseFloat(avgDelayMinutes.toFixed(2)) }
                }
            });
        }

        console.log("Adding " + addRowsArray.length + " client late impact records");

        if (addRowsArray.length > 0) {
            console.log("Sample Client data:", JSON.stringify(addRowsArray[0]));
            app_lib.addRows("Client_Late_Impact", addRowsArray, true);
        }
    }

    // ============================================
    // DASHBOARD 7: GEOFENCE COMPLIANCE RATE
    // ============================================

    function calculateLocationAccuracy(scheduleData) {
        var totalEvents = scheduleData.length;  // ALL records count
        var eventsWithinRadius = 0;  // Only "Inside" counts as compliant
        var eventsOutside = 0;  // "Outside" + "Cannot Calculate" + Empty

        console.log("DEBUG: Processing " + scheduleData.length + " total schedule records");

        for (var i = 0; i < scheduleData.length; i++) {
            var record = scheduleData[i];
            var geofenceStatus = record.Geofence_Status;

            // Debug: Log first few records
            if (i < 3) {
                console.log("DEBUG Record " + i + ": Geofence_Status = '" + geofenceStatus + "'");
            }

            // ONLY "Inside" is compliant
            if (geofenceStatus === "Inside") {
                eventsWithinRadius++;
            } else {
                // Everything else (Outside, Cannot Calculate, Empty) is non-compliant
                eventsOutside++;
            }
        }

        console.log("\n=== Overall Location Accuracy Summary ===");
        console.log("Total schedule records analyzed: " + totalEvents);
        console.log("Events INSIDE geofence (Compliant): " + eventsWithinRadius);
        console.log("Events OUTSIDE/Cannot Calculate/Empty (Non-Compliant): " + eventsOutside);

        // Calculate percentage from ALL events
        var locationAccuracyPercentage = totalEvents > 0 ? (eventsWithinRadius / totalEvents) * 100 : 0;

        console.log("\nGeofence Compliance Rate: " + locationAccuracyPercentage.toFixed(2) + "%");
        console.log("(Calculated as: " + eventsWithinRadius + " Inside / " + totalEvents + " Total = " + locationAccuracyPercentage.toFixed(2) + "%)");

        fields["Geofence_Compliance_Rate"].value = locationAccuracyPercentage.toFixed(2);

        var pendingLocationScore = Math.abs(100 - parseFloat(locationAccuracyPercentage.toFixed(2)));
        fields["Pending_Geofence_Compliance_Score"].value = pendingLocationScore.toFixed(2);

        var geofenceData = categorizeGeofenceStatus(scheduleData);
        addGeofenceDataToTable(geofenceData);
    }

    function categorizeGeofenceStatus(scheduleData) {
        var statusCounts = {
            "Inside": 0,
            "Outside": 0,
            "Cannot Calculate": 0,
            "Empty": 0
        };

        for (var i = 0; i < scheduleData.length; i++) {
            var record = scheduleData[i];
            var geofenceStatus = record.Geofence_Status;

            if (!geofenceStatus || geofenceStatus === "") {
                statusCounts["Empty"]++;
            } else if (geofenceStatus === "Inside") {
                statusCounts["Inside"]++;
            } else if (geofenceStatus === "Outside") {
                statusCounts["Outside"]++;
            } else if (geofenceStatus === "Cannot Calculate") {
                statusCounts["Cannot Calculate"]++;
            }
        }

        var geofenceArray = [
            { Type: "Inside", Total: statusCounts["Inside"] },
            { Type: "Outside", Total: statusCounts["Outside"] },
            { Type: "Cannot Calculate", Total: statusCounts["Cannot Calculate"] },
            { Type: "Empty", Total: statusCounts["Empty"] }
        ];

        console.log("\nGeofence Status Breakdown (ALL RECORDS):");
        console.log("  - Inside (Compliant): " + statusCounts["Inside"]);
        console.log("  - Outside (Non-Compliant): " + statusCounts["Outside"]);
        console.log("  - Cannot Calculate (Non-Compliant): " + statusCounts["Cannot Calculate"]);
        console.log("  - Empty/Missing (Non-Compliant): " + statusCounts["Empty"]);

        return geofenceArray;
    }

    function addGeofenceDataToTable(geofenceArray) {
        var addRowsArray = [];

        for (var idx = 0; idx < geofenceArray.length; idx++) {
            addRowsArray.push({
                "fields": {
                    "Type": { "value": geofenceArray[idx].Type },
                    "Total": { "value": geofenceArray[idx].Total }
                }
            });
        }

        if (addRowsArray.length > 0) {
            app_lib.addRows("Geofence_Compliance", addRowsArray, true);
        }
    }

    // ============================================
    // API RESPONSE HANDLERS
    // ============================================

    function processTwoWeekData(response) {
        console.log("\n=== API 1: Caregiver Retention (2 Weeks) ===");
        if (!response || response.length === 0) {
            console.log("No two-week data received");
            checkAllCallsComplete();
            return;
        }

        if (!Array.isArray(response)) {
            response = [response];
        }

        var twoWeekData = [];
        var fieldsArray = ["Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Day", "Schedule_Start_Date", "Schedule_Start_Time", "Schedule_End_Time", "Scheduling_Status", "Expected_Hours", "Actual_Hours"];

        for (var i = 0; i < response.length; i++) {
            var record = response[i];
            var fieldValues = {};
            var fieldsObj = record.fields || {};
            for (var j = 0; j < fieldsArray.length; j++) {
                var key = fieldsArray[j];
                fieldValues[key] = (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") ? fieldsObj[key].value : "";
            }
            twoWeekData.push(fieldValues);
        }

        console.log("Two-week data loaded: " + twoWeekData.length + " records");
        calculateCaregiverRetention(twoWeekData);
    }

    function processDateRangeOnTimeData(response) {
        console.log("\n=== API 2: On-Time Clock-In Rate (Date Range) ===");
        if (!response || response.length === 0) {
            console.log("No on-time data received");
            checkAllCallsComplete();
            return;
        }

        if (!Array.isArray(response)) {
            response = [response];
        }

        var dateRangeData = [];
        var fieldsArray = ["Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Day", "Schedule_Start_Date", "Schedule_Start_Time", "Schedule_End_Time", "Scheduling_Status", "Expected_Hours", "Actual_Hours", "CheckIn_Time"];

        for (var i = 0; i < response.length; i++) {
            var record = response[i];
            var fieldValues = {};
            var fieldsObj = record.fields || {};
            for (var j = 0; j < fieldsArray.length; j++) {
                var key = fieldsArray[j];
                fieldValues[key] = (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") ? fieldsObj[key].value : "";
            }
            dateRangeData.push(fieldValues);
        }

        console.log("On-time data loaded: " + dateRangeData.length + " records");
        calculateOnTimeClockIn(dateRangeData);
    }

    function processDateRangeNoteData(response) {
        console.log("\n=== API 3: Note Completion Rate (Date Range) ===");
        if (!response || response.length === 0) {
            console.log("No note data received");
            checkAllCallsComplete();
            return;
        }

        if (!Array.isArray(response)) {
            response = [response];
        }

        var noteData = [];
        var fieldsArray = ["Client_Name", "Schedule_Start_Date", "Notes_Status"];

        for (var i = 0; i < response.length; i++) {
            var record = response[i];
            var fieldValues = {};
            var fieldsObj = record.fields || {};
            for (var j = 0; j < fieldsArray.length; j++) {
                var key = fieldsArray[j];
                fieldValues[key] = (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") ? fieldsObj[key].value : "";
            }
            noteData.push(fieldValues);
        }

        console.log("Note data loaded: " + noteData.length + " records");
        calculateNoteCompletion(noteData);
    }


    function processEmergencyData(response) {
        console.log("\n=== API 4: Emergency Coverage (Date Range) ===");
        if (!response || response.length === 0) {
            console.log("No emergency data received");
            fields["Emergency_Coverage_Success_Rate"].value = "0.00";
            fields["Pending_Emergency_Coverage_Success_Score"].value = "100.00";
            checkAllCallsComplete();
            return;
        }

        if (!Array.isArray(response)) {
            response = [response];
        }

        var emergencyData = [];
        var fieldsArray = ["CoverageSuccessful", "ScheduleDate", "ShiftStartTime", "ShiftEndTime", "emergency_Details"];

        for (var i = 0; i < response.length; i++) {
            var record = response[i];
            var fieldValues = {};
            var fieldsObj = record.fields || {};
            for (var j = 0; j < fieldsArray.length; j++) {
                var key = fieldsArray[j];
                fieldValues[key] = (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") ? fieldsObj[key].value : "";
            }
            emergencyData.push(fieldValues);
        }

        console.log("Emergency data loaded: " + emergencyData.length + " records");
        calculateEmergencyCoverage(emergencyData);
    }

    function processEightWeekData(response) {
        console.log("\n=== API 5: Continuity Scores (8 Weeks) ===");
        if (!response || response.length === 0) {
            console.log("No eight-week data received");
            checkAllCallsComplete();
            return;
        }

        if (!Array.isArray(response)) {
            response = [response];
        }

        var eightWeekData = [];
        var fieldsArray = ["ID", "Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Day", "Schedule_Start_Date", "Schedule_Start_Time", "Schedule_End_Time"];

        for (var i = 0; i < response.length; i++) {
            var record = response[i];
            var fieldValues = {};
            var fieldsObj = record.fields || {};
            for (var j = 0; j < fieldsArray.length; j++) {
                var key = fieldsArray[j];
                fieldValues[key] = (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") ? fieldsObj[key].value : "";
            }
            eightWeekData.push(fieldValues);
        }

        console.log("Eight-week data loaded: " + eightWeekData.length + " records");
        calculateContinuityScores(eightWeekData);
    }

    function processLateArrivalData(response) {
        console.log("\n=== API 6: Late Arrival Distribution (8 Weeks) ===");
        if (!response || response.length === 0) {
            console.log("No late arrival data received");
            checkAllCallsComplete();
            return;
        }

        if (!Array.isArray(response)) {
            response = [response];
        }

        var lateData = [];
        var fieldsArray = ["ID", "Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Schedule_Start_Date", "Schedule_Start_Time", "CheckIn_Time", "Schedule_End_Time"];

        for (var i = 0; i < response.length; i++) {
            var record = response[i];
            var fieldValues = {};
            var fieldsObj = record.fields || {};
            for (var j = 0; j < fieldsArray.length; j++) {
                var key = fieldsArray[j];
                fieldValues[key] = (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") ? fieldsObj[key].value : "";
            }
            lateData.push(fieldValues);
        }

        console.log("Late arrival data loaded: " + lateData.length + " records");
        analyzeLateArrivals(lateData);
        checkAllCallsComplete();
    }

    function processGeofenceData(response) {
        console.log("\n=== API 7: Geofence Compliance (Date Range) ===");
        if (!response || response.length === 0) {
            console.log("No geofence data received");
            checkAllCallsComplete();
            return;
        }

        if (!Array.isArray(response)) {
            response = [response];
        }

        var geofenceData = [];
        var fieldsArray = ["Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Day", "Schedule_Start_Date", "Schedule_Start_Time", "Schedule_End_Time", "Scheduling_Status", "Expected_Hours", "Actual_Hours", "CheckIn_Time", "Geofence_Status"];

        for (var i = 0; i < response.length; i++) {
            var record = response[i];
            var fieldValues = {};
            var fieldsObj = record.fields || {};
            for (var j = 0; j < fieldsArray.length; j++) {
                var key = fieldsArray[j];
                fieldValues[key] = (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") ? fieldsObj[key].value : "";
            }
            geofenceData.push(fieldValues);
        }

        console.log("Geofence data loaded: " + geofenceData.length + " records");
        calculateLocationAccuracy(geofenceData);
        checkAllCallsComplete();
    }

    function checkAllCallsComplete() {
        completedCalls++;
        console.log("Completed API calls: " + completedCalls + " / " + totalCalls);

        if (completedCalls === totalCalls) {
            console.log("\n========================================");
            console.log("ALL DASHBOARDS LOADED SUCCESSFULLY");
            console.log("========================================");

            // Hide after a short delay to ensure UI has updated
            setTimeout(function () {
                app_lib.hideField("Caregiver_OnTime_ClockIn_Rate");
            }, 500);
        }
    }




    // ============================================
    // 8 API CALLS - ONE FOR EACH DASHBOARD
    // ============================================

    console.log("\n========================================");
    console.log("INITIATING ALL DASHBOARD API CALLS");
    console.log("========================================");

    // API CALL 1: Two-Week Data for Caregiver Retention
    var twoWeekCriteria = {
        "fieldName": "Schedule_Start_Date",
        "fromDate": lastWeekMonday.format('YYYY-MM-DD'),
        "toDate": thisWeekSunday.format('YYYY-MM-DD')
    };
    var twoWeekScheduleCriteria = {
        "Record_Status": "Active",
        "Shift_Status": "Scheduled"
    };
    app_lib.getTxnUsingIncFields(twoWeekScheduleCriteria, ["Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Day", "Schedule_Start_Date", "Schedule_Start_Time", "Schedule_End_Time", "Scheduling_Status", "Expected_Hours", "Actual_Hours"], processTwoWeekData, twoWeekCriteria, "SVC_TYPE_3");

    // API CALL 2: Date Range Data for On-Time Clock-In Rate
    var dateRangeOnTimeCriteria = {
        "fieldName": "Schedule_Start_Date",
        "fromDate": fields["Start_Date"].value,
        "toDate": fields["End_Date"].value
    };
    var dateRangeOnTimeScheduleCriteria = {
        "Record_Status": "Active",
        "Shift_Status": "Scheduled",
        "checkInPresent": "Yes"
    };
    app_lib.getTxnUsingIncFields(dateRangeOnTimeScheduleCriteria, ["Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Day", "Schedule_Start_Date", "Schedule_Start_Time", "Schedule_End_Time", "Scheduling_Status", "Expected_Hours", "Actual_Hours", "CheckIn_Time"], processDateRangeOnTimeData, dateRangeOnTimeCriteria, "SVC_TYPE_3");

    // API CALL 3: Date Range Data for Note Completion Rate
    var dateRangeNoteCriteria = {
        "fieldName": "Schedule_Start_Date",
        "fromDate": fields["Start_Date"].value,
        "toDate": fields["End_Date"].value
    };
    var dateRangeNoteScheduleCriteria = {
        "Record_Status": "Active",
        "Shift_Status": "Scheduled"
    };
    app_lib.getTxnUsingIncFields(dateRangeNoteScheduleCriteria, ["Client_Name", "Schedule_Start_Date", "Notes_Status"], processDateRangeNoteData, dateRangeNoteCriteria, "SVC_TYPE_3");

    // API CALL 4: Emergency Coverage Data
    var emergencyCriteria = {
        "fieldName": "ScheduleDate",
        "fromDate": fields["Start_Date"].value,
        "toDate": fields["End_Date"].value
    };
    var emergencyScheduleCriteria = {
        "Record_Status": "Active"
    };
    app_lib.getTxnUsingIncFields(emergencyScheduleCriteria, ["CoverageSuccessful", "ScheduleDate", "ShiftStartTime", "ShiftEndTime", "emergency_Details"], processEmergencyData, emergencyCriteria, "SVC_TYPE_17");

    // API CALL 5: Eight-Week Data for Continuity Scores
    var eightWeekCriteria = {
        "fieldName": "Schedule_Start_Date",
        "fromDate": week8Monday.format('YYYY-MM-DD'),
        "toDate": thisWeekSunday.format('YYYY-MM-DD')
    };
    var eightWeekScheduleCriteria = {
        "Record_Status": "Active",
        "Shift_Status": "Scheduled"
    };
    app_lib.getTxnUsingIncFields(eightWeekScheduleCriteria, ["ID", "Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Day", "Schedule_Start_Date", "Schedule_Start_Time", "Schedule_End_Time"], processEightWeekData, eightWeekCriteria, "SVC_TYPE_3");

    // API CALL 6: Eight-Week Data for Late Arrival Distribution (Completed Shifts)
    var lateArrivalCriteria = {
        "fieldName": "Schedule_Start_Date",
        "fromDate": week8Monday.format('YYYY-MM-DD'),
        "toDate": thisWeekSunday.format('YYYY-MM-DD')
    };
    var lateArrivalScheduleCriteria = {
        "Record_Status": "Active",
        "Scheduling_Status": "Completed"
    };
    app_lib.getTxnUsingIncFields(lateArrivalScheduleCriteria, ["ID", "Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Schedule_Start_Date", "Schedule_Start_Time", "CheckIn_Time", "Schedule_End_Time"], processLateArrivalData, lateArrivalCriteria, "SVC_TYPE_3");

    // API CALL 7: Date Range Data for Geofence Compliance (Completed Shifts)
    var geofenceCriteria = {
        "fieldName": "Schedule_Start_Date",
        "fromDate": fields["Start_Date"].value,
        "toDate": fields["End_Date"].value
    };
    var geofenceScheduleCriteria = {
        "Record_Status": "Active",
        "Scheduling_Status": "Completed"
    };
    app_lib.getTxnUsingIncFields(geofenceScheduleCriteria, ["Client_Name", "Expected_Caregiver", "Actual_Caregiver", "Day", "Schedule_Start_Date", "Schedule_Start_Time", "Schedule_End_Time", "Scheduling_Status", "Expected_Hours", "Actual_Hours", "CheckIn_Time", "Geofence_Status"], processGeofenceData, geofenceCriteria, "SVC_TYPE_3");

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

    var perspective = app_lib.getCurrentPerspective();
    var perspectiveName = perspective.name;

    console.log("Current Perspective: " + perspectiveName);

    // Hide admin metadata fields only
    app_lib.hideField([
        "Id",
        "Caregiver_OnTime_ClockIn_Rate",
        "Continuity_Score_Week_Wise",
        "Caregiver_Continuity_Score",
        "Client_Continuity_Score",
        "Late_Arrival_Distribution",
        "Caregiver_Late_Arrivals",
        "Client_Late_Impact",
        "Geofence_Compliance",
        "NoShow_Caregiver_Incident_Rate",
        "Caregiver_Retention_Rate",
        "Pending_Caregiver_Retention_Score",
        "OnTime_ClockIn_Rate",
        "Pending_OnTime_ClockIn_Score",
        "Note_Completion_Rate",
        "Pending_Note_Completion_Score",
        "Emergency_Coverage_Success_Rate",
        "Pending_Emergency_Coverage_Success_Score",
        "Overall_Continuity_Rate",
        "Pending_Overall_Continuity_Score",
        "Geofence_Compliance_Rate",
        "Pending_Geofence_Compliance_Score",
        "NoShow_Incident_Rate",
        "Peding_NoShow_Incident_Score",
        "Total_Completed_Shifts",
        "Total_Late_Arrivals",
        "Late_Within_5_Min_Count",
        "Overall_Late_Percentage_Rate",
        "Late_Within_15_Min_Count",
        "Late_Over_15_Min_Count",
        "Late_Within_10_Min_Count",
        "Pending_Overall_Late_Percentage",
        "FirstResponse_Fill_Rate",
        "Pending_FirstResponse_Fill_Score",
        "Dashboards_Status"
    ]);

    fields["Dashboards_Status"].value = "Completed";
}

