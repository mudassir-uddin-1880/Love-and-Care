
// if (fields["Schedule_Start_Time"] && fields["Schedule_Start_Time"].value === "") {
//     fields["Shift_Status"].value = "Open Shift";
// }
// if (fields["Schedule_Start_Time"] && fields["Schedule_Start_Time"].value !== "") {
//     fields["Shift_Status"].value = "Scheduled";
// }

if (app_lib.txnId() == null) {
    var userDetails = app_lib.loginUser();
    var user = userDetails ? userDetails.name : '';
    var time = moment().format('MMMM DD YYYY, h:mm:ss a');
    var log = user + " , " + time + "\n";
    fields["Created_By"].value = log;

    if (fields["Select_Expected_Caregiver"] && fields["Select_Expected_Caregiver"].value == "") {
        fields["Shift_Status"].value = "Open Shift";
        fields["Scheduling_Status"].value = "Caregiver No Show";
    }
    if (fields["Select_Expected_Caregiver"] && fields["Select_Expected_Caregiver"].value != "") {
        fields["Shift_Status"].value = "Scheduled";
        fields["Scheduling_Status"].value = "Scheduled Completed";
    }
    var currDate = moment().format('YYYY-MM-DD');
    var currTime = moment().format('HH:mm:ss');
    // ✅ Update shift status and record schedule time
    if (fields["Shift_Status"].value == "Open Shift" || fields["Scheduling_Status"].value == "Caregiver No Show") {
        // fields["Shift_Status"].value = "Scheduled";
        // fields["Scheduling_Status"].value = "Scheduled Completed";
        fields["Scheduler_Start_Time"].value = currDate + " " + currTime;
        // fields["Caregiver_Assigned_by_Automation"].value = "Yes"
    }
}


if (fields["Last_Modified_By"]) {
    var userDetails = app_lib.loginUser();
    var user = userDetails ? userDetails.name : '';
    var time = moment().format('MMMM Do YYYY, h:mm:ss a');
    var log = user + " , " + time + "\n";
    fields["Last_Modified_By"].value = log;

    if (fields["Last_Modified_At_Location"]) {
        function onResponse(res) {
            fields["Last_Modified_At_Location"].value = res.location;
        }
        app_lib.getLocation(onResponse);
    }
}

function parseTime(timeStr) {
    // Try to parse various time formats (e.g., "14:30", "2:30 PM", "14.30", "2 PM", "10:00:00 AM", etc.)
    if (!timeStr) return null;
    // Normalize separators
    timeStr = timeStr.replace('.', ':').trim().toUpperCase();
    // If only hour is given, add :00
    if (/^\d{1,2}(AM|PM)?$/.test(timeStr)) {
        timeStr = timeStr.replace(/(AM|PM)?$/, ':00$1');
    }
    // Try Date parsing (ISO format)
    let date = new Date(`1970-01-01T${timeStr}`);
    if (!isNaN(date.getTime())) return date;
    // Try 12-hour format with optional minutes and seconds and AM/PM
    let match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/);
    if (match) {
        let hour = parseInt(match[1], 10);
        let min = parseInt(match[2] || '0', 10);
        let sec = parseInt(match[3] || '0', 10);
        if (match[4]) {
            if (match[4] === 'PM' && hour < 12) hour += 12;
            if (match[4] === 'AM' && hour === 12) hour = 0;
        }
        date = new Date(1970, 0, 1, hour, min, sec);
        return date;
    }
    // Try 12-hour format with only hour and AM/PM (e.g., "2 PM")
    match = timeStr.match(/^(\d{1,2})\s*(AM|PM)$/);
    if (match) {
        let hour = parseInt(match[1], 10);
        if (match[2] === 'PM' && hour < 12) hour += 12;
        if (match[2] === 'AM' && hour === 12) hour = 0;
        date = new Date(1970, 0, 1, hour, 0, 0);
        return date;
    }
    return null;
}

// Expected Hours calculation
const startTime = parseTime(fields["Schedule_Start_Time"].value);
const endTime = parseTime(fields["Schedule_End_Time"].value);

if (startTime && endTime) {
    let diffMs = endTime - startTime;
    if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // handle overnight shifts
    let totalHours = diffMs / (1000 * 60 * 60);

    // If the calculated hours are very close to 24 (e.g., 23.98+), round to 24
    if (Math.abs(totalHours - 24) < 0.02) {
        totalHours = 24;
    }

    fields["Expected_Hours"].value = Math.round(totalHours * 10) / 10;
} else {
    fields["Expected_Hours"].value = 0;
}




// ===== Caregiver Availability Validation Logic =====
// ===== OPTIMIZED VERSION with Self-Exclusion Fix =====

var fieldsJson = [
    "Caregiver_Id",
    "Select_Expected_Caregiver",
    "Schedule_Start_Date",
    "Schedule_Start_Time",
    "Schedule_End_Time",
    "Client_Name",
    "ID"
];

var CaregiverList = [];
// NEW: Cache for parsed dates and times to improve performance
var timeCache = {};
var dateCache = {};

// ===== Fetch caregivers =====
function fetchCaregivers() {
    function onCaregiverResponse(response) {
        console.log("===== Caregiver Response =====");
        console.log(response);

        if (!Array.isArray(response) || response.length === 0) {
            console.log("No caregiver records found.");
            return;
        }

        CaregiverList = response.map(r => {
            return {
                ID: r.fields?.ID?.value || r.id || "",  // Include record ID
                Caregiver_Id: r.fields?.Caregiver_Id?.value || "",
                Schedule_Start_Date: r.fields?.Schedule_Start_Date?.value || "",
                Schedule_Start_Time: r.fields?.Schedule_Start_Time?.value || "",
                Schedule_End_Time: r.fields?.Schedule_End_Time?.value || "",
                Select_Expected_Caregiver: r.fields?.Select_Expected_Caregiver?.value || "",
                Client_Name: r.fields?.Client_Name?.value || ""
            };
        });

        console.log("Processed CaregiverList:", CaregiverList.length, "records");
    }

    app_lib.getTxnUsingIncFields(null, fieldsJson, onCaregiverResponse, null, "SVC_TYPE_3");
}

// ===== Convert time to minutes (OPTIMIZED with caching) =====
function toMinutes(t) {
    if (!t) return 0;

    // Check cache first
    if (timeCache[t] !== undefined) {
        return timeCache[t];
    }

    var cleanTime = String(t).trim();
    var parts = cleanTime.split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);

    if (isNaN(h) || isNaN(m)) {
        timeCache[t] = 0;
        return 0;
    }

    var minutes = h * 60 + m;
    timeCache[t] = minutes;
    return minutes;
}

// ===== Determine shift slot =====
function getShiftSlot(time) {
    if (!time) return "NOC";
    var cleanTime = String(time).trim();
    var parts = cleanTime.split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);

    if (isNaN(h) || isNaN(m)) return "NOC";
    var totalMin = h * 60 + m;

    if (totalMin >= 6 * 60 && totalMin < 14 * 60) return "AM";   // 6:00 – 13:59
    if (totalMin >= 14 * 60 && totalMin < 22 * 60) return "PM";  // 14:00 – 21:59
    return "NOC"; // Night shift (22:00 – 05:59)
}

// ===== Helper function to check time overlap (OPTIMIZED) =====
function timeOverlap(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
}

// ===== Convert day name to key format =====
function dayToKey(dayName) {
    var d = String(dayName).trim().toUpperCase();
    var map = {
        'SUNDAY': 'SUNDAY', 'MONDAY': 'MONDAY', 'TUESDAY': 'TUESDAY',
        'WEDNESDAY': 'WEDNESDAY', 'THURSDAY': 'THURSDAY',
        'FRIDAY': 'FRIDAY', 'SATURDAY': 'SATURDAY'
    };
    return map[d] || d;
}

// ===== Custom Time Availability Check =====
function checkCustomTimeAvailability(caregiverRecordId, tableId, dayName, startMin, endMin, callback) {
    console.log("=== Checking Custom Time Availability ===");
    console.log("Day:", dayName, "Time:", startMin, "-", endMin, "minutes");

    if (!caregiverRecordId || !tableId) {
        console.log("Missing caregiverRecordId or tableId");
        callback({
            available: false,
            reason: "Missing availability details",
            details: "Custom time availability is not properly configured for this caregiver"
        });
        return;
    }

    app_lib.rowsOf(caregiverRecordId, tableId, function (rows) {
        console.log("Custom availability rows retrieved:", rows ? rows.length : 0);

        if (!Array.isArray(rows) || rows.length === 0) {
            console.log("No custom availability rows found");
            callback({
                available: false,
                reason: "No custom availability defined",
                details: "This caregiver has Custom Time availability type but no time windows are defined. Please add available time windows in the caregiver's Availability Details."
            });
            return;
        }

        var dayKey = dayToKey(dayName);
        var matchedRow = null;
        var availableWindows = [];
        var requestedStartTime = minutesToTime(startMin);
        var requestedEndTime = minutesToTime(endMin);

        // OPTIMIZED: Single pass through rows
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || !row.fields) continue;

            var rowDay = dayToKey(row.fields.Day?.value || row.fields.Day || '');

            // Skip if not the right day
            if (rowDay !== dayKey) continue;

            var rowStartTime = row.fields.Schedule_Start_Time?.value || row.fields.Schedule_Start_Time || '';
            var rowEndTime = row.fields.Schedule_End_Time?.value || row.fields.Schedule_End_Time || '';

            // Skip if no times
            if (!rowStartTime || !rowEndTime) continue;

            var rowStart = toMinutes(rowStartTime);
            var rowEnd = toMinutes(rowEndTime);

            // Add to available windows
            availableWindows.push({
                start: rowStartTime,
                end: rowEndTime,
                startMin: rowStart,
                endMin: rowEnd
            });

            console.log("Checking row:", rowDay, rowStartTime, "-", rowEndTime, "(", rowStart, "-", rowEnd, "minutes)");

            // Check if the schedule is fully inside this custom availability window
            if (rowStart <= startMin && rowEnd >= endMin && !matchedRow) {
                matchedRow = {
                    Day: rowDay,
                    Schedule_Start_Time: rowStartTime,
                    Schedule_End_Time: rowEndTime
                };
                console.log("✅ Custom availability window matched:", matchedRow);
                // Don't break - continue collecting all windows for detailed error message
            }
        }

        if (matchedRow) {
            callback({
                available: true,
                matchedRow: matchedRow,
                reason: "Matched custom availability window",
                details: "Available in custom time window: " + matchedRow.Schedule_Start_Time + " - " + matchedRow.Schedule_End_Time
            });
        } else {
            var detailMsg = "The requested time (" + requestedStartTime + " - " + requestedEndTime +
                ") does not fall within any available custom time window for " + dayName;

            if (availableWindows.length > 0) {
                detailMsg += "\n\nAvailable time windows on " + dayName + ":";
                for (var j = 0; j < availableWindows.length; j++) {
                    detailMsg += "\n  • " + availableWindows[j].start + " - " + availableWindows[j].end;
                }
                detailMsg += "\n\nYour requested shift must fall completely within one of these windows.";
            } else {
                detailMsg += "\n\nNo time windows are defined for " + dayName + " in the caregiver's availability settings.";
            }

            detailMsg += "\n\nPlease either:\n" +
                "1. Adjust your schedule to fit within an available window, or\n" +
                "2. Update the caregiver's custom availability windows, or\n" +
                "3. Select another caregiver";

            callback({
                available: false,
                reason: "No custom window covers the requested schedule time",
                details: detailMsg,
                availableWindows: availableWindows
            });
        }
    });
}

// ===== Helper function to convert minutes to time string =====
function minutesToTime(minutes) {
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    return String(hours).padStart(2, '0') + ":" + String(mins).padStart(2, '0');
}

// ===== Enhanced availability check supporting all types =====
function checkCaregiverAvailability(caregiverRecord, dayName, startMin, endMin, callback) {
    console.log("\n=== Checking Caregiver Availability ===");
    console.log("Day:", dayName, "Time Range:", startMin, "-", endMin, "minutes");

    if (!caregiverRecord || !caregiverRecord.fields) {
        callback({ available: false, reason: "Missing caregiver record", details: "" });
        return;
    }

    var availabilityType = String(caregiverRecord.fields.Availability_Type?.value || caregiverRecord.fields.Availability_Type || '').toLowerCase();
    console.log("Availability Type:", availabilityType);

    // Check if Custom Time availability
    if (availabilityType.indexOf('custom time') !== -1) {
        console.log("Using Custom Time availability check");
        var tableId = caregiverRecord.fields.Availability_Details?.value || caregiverRecord.fields.Availability_Details || '';
        var recordId = caregiverRecord.id || '';

        checkCustomTimeAvailability(recordId, tableId, dayName, startMin, endMin, callback);
        return;
    }

    // Standard AM/PM/NOC availability check
    console.log("Using standard AM/PM/NOC availability check");

    var dayKey = dayToKey(dayName);
    var segments = getShiftSegmentsForWindow(startMin, endMin);

    console.log("Checking segments:", segments, "for day:", dayKey);

    var availableSegments = [];
    var unavailableSegments = [];

    // OPTIMIZED: Single loop with early exit option
    for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        var fieldKey = dayKey + '_' + seg;
        var availability = String(caregiverRecord.fields[fieldKey]?.value || caregiverRecord.fields[fieldKey] || '').toLowerCase();

        console.log("Segment", fieldKey, "availability:", availability);

        var isAvailable = (availability === 'yes' || availability === 'true');

        if (isAvailable) {
            availableSegments.push(seg);
        } else {
            unavailableSegments.push(seg);
            console.log("❌ Segment", fieldKey, "not available");
        }
    }

    if (unavailableSegments.length === 0) {
        callback({
            available: true,
            reason: "All required segments available",
            segments: segments,
            availableSegments: availableSegments,
            details: "Available for: " + availableSegments.join(", ")
        });
    } else {
        var detailMsg = "Not available for: " + unavailableSegments.join(", ") + " shift(s) on " + dayName;
        if (availableSegments.length > 0) {
            detailMsg += ". Available only for: " + availableSegments.join(", ");
        }

        callback({
            available: false,
            reason: "One or more required segments not available",
            segments: segments,
            availableSegments: availableSegments,
            unavailableSegments: unavailableSegments,
            details: detailMsg
        });
    }
}

// ===== Helper to get shift segments for a time window =====
function getShiftSegmentsForWindow(startMin, endMin) {
    var segments = [];
    var bands = [
        { seg: 'NOC', start: 0, end: 360 },      // 00:00 - 06:00
        { seg: 'AM', start: 360, end: 840 },     // 06:00 - 14:00
        { seg: 'PM', start: 840, end: 1320 },    // 14:00 - 22:00
        { seg: 'NOC', start: 1320, end: 1440 }   // 22:00 - 24:00
    ];

    var seen = {};
    for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        if (timeOverlap(startMin, endMin, b.start, b.end) && !seen[b.seg]) {
            segments.push(b.seg);
            seen[b.seg] = true;
        }
    }
    return segments;
}

// ===== Validate selected caregiver (FIXED: Excludes current record + OPTIMIZED) =====
function validateSelectedCaregiver() {
    // Get the current record ID (used to exclude self from conflicts)
    var currentRecordId = String(fields["ID"]?.value || "").trim();

    // Convert the value to a string before trimming
    var selectedId = String(fields["Caregiver_Id"]?.value || "").trim();

    var inputDate = fields["Schedule_Start_Date"]?.value || "";
    var inputStartTime = fields["Schedule_Start_Time"]?.value || "";
    var inputEndTime = fields["Schedule_End_Time"]?.value || "";

    console.log("=== Validating Caregiver ===");
    console.log("Current Record ID:", currentRecordId);
    console.log("Selected Caregiver ID:", selectedId);
    console.log("Date:", inputDate);
    console.log("Time:", inputStartTime, "-", inputEndTime);

    if (!selectedId) {
        fields["Issue_With_Selected_Caregiver"].value = "";
        return;
    }

    if (!inputDate || !inputStartTime || !inputEndTime) {
        console.log("Validation skipped: Missing user inputs.");
        return;
    }

    // Convert to comparable numbers (FIXED: handles both "4:00" and "04:00")
    var inputStart = toMinutes(inputStartTime);
    var inputEnd = toMinutes(inputEndTime);

    // Normalize the input date once
    var normalizedInputDate = normalizeDate(inputDate);

    // ===== OPTIMIZED Conflict check with self-exclusion =====
    var conflicts = [];
    var caregiverSchedulesCount = 0;

    console.log("Checking conflicts in", CaregiverList.length, "total records");

    for (var i = 0; i < CaregiverList.length; i++) {
        var schedule = CaregiverList[i];

        // OPTIMIZATION: Skip if not the same caregiver (early exit)
        if (String(schedule.Caregiver_Id) !== selectedId) continue;

        caregiverSchedulesCount++;

        // FIX: Skip if this is the current record being edited
        if (currentRecordId && String(schedule.ID) === currentRecordId) {
            console.log("Skipping self-record ID:", currentRecordId);
            continue;
        }

        // OPTIMIZATION: Skip if not the same date (early exit)
        var scheduleDate = normalizeDate(schedule.Schedule_Start_Date);
        if (scheduleDate !== normalizedInputDate) continue;

        // Check time overlap
        var sStart = toMinutes(schedule.Schedule_Start_Time);
        var sEnd = toMinutes(schedule.Schedule_End_Time);

        if (timeOverlap(inputStart, inputEnd, sStart, sEnd)) {
            conflicts.push(schedule);
            console.log("Conflict found:", schedule.Schedule_Start_Time, "-", schedule.Schedule_End_Time, "with", schedule.Client_Name);
        }
    }

    console.log("Total schedules for this caregiver:", caregiverSchedulesCount);
    console.log("Conflicts found:", conflicts.length);

    if (conflicts.length > 0) {
        var conflictMsg = "The caregiver you have selected may not be available on " + inputDate +
            " during the requested time slot " + inputStartTime + " – " + inputEndTime + ".\n\n";
        conflictMsg += "They already have the following commitments on this day:\n";

        for (var j = 0; j < conflicts.length; j++) {
            var c = conflicts[j];
            conflictMsg += (j + 1) + ". " + c.Schedule_Start_Time + " – " + c.Schedule_End_Time +
                " with client " + (c.Client_Name || "another client") + "\n";
        }

        conflictMsg += "\nWe kindly suggest choosing another caregiver or adjusting your preferred time, so that care and attention can be provided with love and comfort.";

        fields["Issue_With_Selected_Caregiver"].value = conflictMsg.trim();
        return;
    }

    // ===== If no conflicts, check availability using enhanced function =====
    console.log("No conflicts found, checking availability...");

    app_lib.findLookupTxn(
        fields["Select_Expected_Caregiver"].selectedValue,
        fields["Select_Expected_Caregiver"].lookupType,
        function (resLookupObj) {
            console.log("===== Availability Lookup Response =====");
            console.log(resLookupObj);

            var dayIndex = new Date(inputDate).getDay(); // 0=Sun, 1=Mon ...
            var dayNames = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
            var dayName = dayNames[dayIndex];

            console.log("Checking availability for:", dayName, inputStartTime, "-", inputEndTime);

            // Use enhanced availability check
            checkCaregiverAvailability(resLookupObj, dayName, inputStart, inputEnd, function (result) {
                console.log("Availability check result:", result);

                if (result.available) {
                    fields["Issue_With_Selected_Caregiver"].value = "";
                    console.log("✅ Caregiver is available");
                } else {
                    var message = "Caregiver is not available on " + inputDate + " during the requested time " +
                        inputStartTime + " – " + inputEndTime;

                    // Add detailed information about which segments are unavailable
                    if (result.details) {
                        message += "\n\nDetails: " + result.details;
                    }

                    // Add shift information
                    if (result.unavailableSegments && result.unavailableSegments.length > 0) {
                        message += "\n\nThe caregiver needs to have availability marked as 'Yes' for the following shift(s) on " + dayName + ":";
                        for (var i = 0; i < result.unavailableSegments.length; i++) {
                            var seg = result.unavailableSegments[i];
                            var timeRange = "";
                            if (seg === "AM") timeRange = " (6:00 AM - 2:00 PM)";
                            else if (seg === "PM") timeRange = " (2:00 PM - 10:00 PM)";
                            else if (seg === "NOC") timeRange = " (10:00 PM - 6:00 AM)";
                            message += "\n  • " + seg + timeRange;
                        }
                    }

                    message += "\n\nPlease either:\n" +
                        "1. Update the caregiver's availability settings, or\n" +
                        "2. Choose a different time slot, or\n" +
                        "3. Select another caregiver";

                    fields["Issue_With_Selected_Caregiver"].value = message;
                    console.log("❌ Caregiver is not available:", result.reason);
                }
            });
        }
    );
}

// Normalize any date string to YYYY-MM-DD (OPTIMIZED with caching)
function normalizeDate(dateStr) {
    if (!dateStr) return "";

    // Check cache first
    if (dateCache[dateStr] !== undefined) {
        return dateCache[dateStr];
    }

    var dateString = String(dateStr).trim();
    var result = dateString;

    if (dateString.includes("-")) {
        var parts = dateString.split("-");
        if (parts[1].length > 2) { // e.g. "28-October-2025"
            var day = parts[0];
            var monthName = parts[1];
            var year = parts[2];

            var months = {
                January: "01", February: "02", March: "03",
                April: "04", May: "05", June: "06",
                July: "07", August: "08", September: "09",
                October: "10", November: "11", December: "12"
            };

            var month = months[monthName] || "01";
            result = year + "-" + month + "-" + day.padStart(2, "0");
        }
    }

    // Cache the result
    dateCache[dateStr] = result;
    return result;
}

// ===== NEW: Clear cache function (optional, can be called periodically) =====
function clearValidationCache() {
    timeCache = {};
    dateCache = {};
    console.log("Validation cache cleared");
}

// ===== Usage Example =====
fetchCaregivers();
validateSelectedCaregiver();





// Reset issue field if no caregiver is selected
// if (fields["Select_Expected_Caregiver"] && !fields["Select_Expected_Caregiver"].value) {
//     fields["Issue_With_Selected_Caregiver"].value = "";
// }

// // Validation: if issue exists, stop submission
// if (fields["Issue_With_Selected_Caregiver"].value &&
//     fields["Issue_With_Selected_Caregiver"].value.trim() !== "") {
//     return "Selected Caregiver is not available. Please select another.";
// }