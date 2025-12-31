// === Time Format Validation ===
function validateTimeFormat(timeStr, fieldName) {
    if (!timeStr) {
        app_lib.showWarn(`${fieldName} is required`);
        return false;
    }

    // Clean the time string
    timeStr = timeStr.trim();

    // Check if it matches HH:MM or HH:MM:SS format
    const timePattern = /^([01]?[0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;

    if (!timePattern.test(timeStr)) {
        // app_lib.showWarn(`Time must be in HH:MM or HH:MM:SS format (24-hour format)`);
        return false;
    }

    console.log(`✅ ${fieldName} format is valid:`, timeStr);
    return true;
}

// Validate time formats before processing
if (validateTimeFormat(row["Schedule_Start_Time"].value, "Schedule Start Time") &&
    validateTimeFormat(row["Schedule_End_Time"].value, "Schedule End Time")) {
    // Continue with processing only if both validations pass
    // Shared handler for changes to Schedule_Start_Time or Schedule_End_Time.
    function handleTimeChange(row, rows) {
        handleTimeChange(row, rows);
    }
    // Shared handler for changes to Schedule_Start_Time or Schedule_End_Time.
    function handleTimeChange(row, rows) {
        // Duplicate check (Day + Schedule_Start_Time)
        checkDuplicateStartByDay(row, rows);

        // Recalculate expected hours
        updateExpectedHours(row);
    }
}

// === Duplicate check for Day + Schedule_Start_Time combination ===
var comboKey = row["Day"].value + "|" + row["Schedule_Start_Time"].value;
console.log("Checking for duplicate comboKey:", comboKey);

var count = 0;
for (var i = 0; i < rows.length; i++) {
    if (!rows[i]["Day"] || !rows[i]["Schedule_Start_Time"]) continue;
    var existingKey = rows[i]["Day"].value + "|" + rows[i]["Schedule_Start_Time"].value;
    console.log("Row " + i + " existingKey:", existingKey);
    if (existingKey === comboKey) {
        count++;
    }
}
console.log("Duplicate count:", count);

if (count > 1) {
    console.log("❌ Duplicate found for", comboKey);
    throw new Error("Duplicate entry: " + row["Day"].value + " at " + row["Schedule_Start_Time"].value);
} else {
    console.log("✅ No duplicates for", comboKey);
}

// === Function to parse time ===
function parseTime(timeStr) {
    if (!timeStr) return null;
    console.log("Parsing time:", timeStr);

    timeStr = timeStr.replace('.', ':').trim().toUpperCase();

    if (/^\d{1,2}(AM|PM)?$/.test(timeStr)) {
        timeStr = timeStr.replace(/(AM|PM)?$/, ':00$1');
    }

    let date = new Date(`1970-01-01T${timeStr}`);
    if (!isNaN(date.getTime())) {
        console.log("Parsed with ISO:", date);
        return date;
    }

    let match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/);
    if (match) {
        let hour = parseInt(match[1], 10);
        let min = parseInt(match[2] || '0', 10);
        let sec = parseInt(match[3] || '0', 10);
        if (match[4]) {
            if (match[4] === 'PM' && hour < 12) hour += 12;
            if (match[4] === 'AM' && hour === 12) hour = 0;
        }
        let parsed = new Date(1970, 0, 1, hour, min, sec);
        console.log("Parsed with regex:", parsed);
        return parsed;
    }

    match = timeStr.match(/^(\d{1,2})\s*(AM|PM)$/);
    if (match) {
        let hour = parseInt(match[1], 10);
        if (match[2] === 'PM' && hour < 12) hour += 12;
        if (match[2] === 'AM' && hour === 12) hour = 0;
        let parsed = new Date(1970, 0, 1, hour, 0, 0);
        console.log("Parsed with AM/PM only:", parsed);
        return parsed;
    }

    console.log("❌ Invalid time format:", timeStr);
    return null;
}

// === Expected Hours Calculation ===
const startTime = parseTime(row["Schedule_Start_Time"].value);
const endTime = parseTime(row["Schedule_End_Time"].value);

console.log("StartTime:", startTime, "EndTime:", endTime);

if (startTime && endTime) {
    let diffMs = endTime - startTime;
    if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // handle overnight shifts

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    row["Expected_Hours"].value = `${hours}.${mins.toString().padStart(2, '0')}`;
    console.log("✅ Expected Hours calculated:",

    );
} else {
    row["Expected_Hours"].value = "0.00";
    console.log("❌ Failed to calculate Expected Hours, setting 0.00");
}