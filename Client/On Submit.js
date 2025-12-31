if (app_lib.txnId() == null) {
    var userDetails = app_lib.loginUser();
    var user = userDetails ? userDetails.name : '';
    var time = moment().format('MMMM DD YYYY, h:mm:ss a');
    var log = user + " , " + time + "\n";
    fields["Created_By"].value = log;
    if (fields["Apply_From"] && fields["Apply_From"].value == null || fields["Apply_From"].value == "") {
        return "Please select Apply From";
    }
}

if (fields["Gender_Preference"].value == "Either" && fields["Gender_Preference_Strict"].value == "Yes") {
    return "Gender Preference cannot be 'Either' when Gender Preference Strict is 'Yes'";
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

var firstName = fields["Client_First_Name"] && fields["Client_First_Name"].value;
var middleName = fields["Client_Middle_Name"] && fields["Client_Middle_Name"].value;
var lastName = fields["Client_Last_Name"] && fields["Client_Last_Name"].value;

var fullName = "";

// Build full name by combining available parts
var nameParts = [];

if (firstName && firstName.trim() !== "") {
    nameParts.push(firstName.trim());
}

if (middleName && middleName.trim() !== "") {
    nameParts.push(middleName.trim());
}

if (lastName && lastName.trim() !== "") {
    nameParts.push(lastName.trim());
}

fullName = nameParts.join(" ");

// Store in Full_Name field
if (fields["Client_Full_Name"]) {
    fields["Client_Full_Name"].value = fullName;
}


// --------------------------------------------------------------------------------------------------------------


var rows = app_lib.getRows("Schedule_Details");

// Validate time format for Schedule_Start_Time and Schedule_End_Time in rows
function isValidTimeFormat(timeStr) {
    if (!timeStr || timeStr.trim() === "") return true; // Allow empty values
    // Check for HH:MM or HH:MM:SS format (24-hour)
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;
    return timeRegex.test(timeStr.trim());
}

// Function to parse time for expected hours calculation
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

// Function to calculate expected hours for a row
function calculateExpectedHours(row, rowNumber) {
    if (!row.fields || !row.fields.Schedule_Start_Time || !row.fields.Schedule_End_Time) {
        return;
    }

    const startTimeValue = row.fields.Schedule_Start_Time.value;
    const endTimeValue = row.fields.Schedule_End_Time.value;

    if (!startTimeValue || !endTimeValue) {
        if (row.fields.Expected_Hours) {
            row.fields.Expected_Hours.value = "0.00";
        }
        return;
    }

    const startTime = parseTime(startTimeValue);
    const endTime = parseTime(endTimeValue);

    console.log(`Row ${rowNumber} - StartTime:`, startTime, "EndTime:", endTime);

    if (startTime && endTime) {
        let diffMs = endTime - startTime;
        if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // handle overnight shifts

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        const expectedHours = `${hours}.${mins.toString().padStart(2, '0')}`;

        if (row.fields.Expected_Hours) {
            row.fields.Expected_Hours.value = expectedHours;
        }

        console.log(`✅ Row ${rowNumber} Expected Hours calculated:`, expectedHours);
    } else {
        if (row.fields.Expected_Hours) {
            row.fields.Expected_Hours.value = "0.00";
        }
        console.log(`❌ Row ${rowNumber} Failed to calculate Expected Hours, setting 0.00`);
    }
}

// Function to check for duplicate schedule entries
function checkDuplicateSchedules(rows) {
    const scheduleMap = new Map();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1;

        if (!row.fields) continue;

        const day = row.fields.Day ? row.fields.Day.value : "";
        const startTime = row.fields.Schedule_Start_Time ? row.fields.Schedule_Start_Time.value : "";
        const endTime = row.fields.Schedule_End_Time ? row.fields.Schedule_End_Time.value : "";

        // Skip rows with empty values
        if (!day || !startTime || !endTime ||
            day.trim() === "" || startTime.trim() === "" || endTime.trim() === "") {
            continue;
        }

        // Create a unique key combining day, start time, and end time
        const scheduleKey = `${day.trim()}|${startTime.trim()}|${endTime.trim()}`;

        console.log(`Row ${rowNumber}: Checking schedule key: ${scheduleKey}`);

        if (scheduleMap.has(scheduleKey)) {
            const previousRowNumber = scheduleMap.get(scheduleKey);
            const errorMessage = `Duplicate schedule found: Row ${rowNumber} has the same Day (${day}), Start Time (${startTime}), and End Time (${endTime}) as Row ${previousRowNumber}`;
            console.log("❌ " + errorMessage);
            return errorMessage;
        }

        scheduleMap.set(scheduleKey, rowNumber);
    }

    console.log("✅ No duplicate schedules found");
    return null; // No duplicates found
}

// Check time format in all rows
for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;

    if (row.fields && row.fields.Schedule_Start_Time) {
        const startTime = row.fields.Schedule_Start_Time.value;
        if (!isValidTimeFormat(startTime)) {
            return `Enter valid data in row ${rowNumber} Schedule Start Time cell`;
        }
    }

    if (row.fields && row.fields.Schedule_End_Time) {
        const endTime = row.fields.Schedule_End_Time.value;
        if (!isValidTimeFormat(endTime)) {
            return `Enter valid data in row ${rowNumber} Schedule End Time cell`;
        }
    }

    // Calculate expected hours for this row (NEW FUNCTIONALITY)
    calculateExpectedHours(row, rowNumber);

    // Check for Caregivers_Required validation (NEW FUNCTIONALITY)
    if (row.fields && row.fields.Caregivers_Required) {
        const caregiversRequired = row.fields.Caregivers_Required.value;

        // Check if value is 0, empty, null, or undefined
        if (caregiversRequired === 0 ||
            caregiversRequired === null || caregiversRequired === undefined ||
            caregiversRequired === "") {
            return `Please enter the number of caregivers required in row ${rowNumber}`;
        }

        // Check if it's a valid positive number
        if (isNaN(caregiversRequired) || Number(caregiversRequired) < 1) {
            return `Please enter a valid number of caregivers required in row ${rowNumber}`;
        }
    }
}

// Check for duplicate schedules
const duplicateError = checkDuplicateSchedules(rows);
if (duplicateError) {
    return duplicateError;
}

//if (!fields || !fields["Apply_From"] || !fields["Apply_From"].value || fields["Apply_From"].value.trim() //== "") {
//  return "Please select data in Apply From field";
//}