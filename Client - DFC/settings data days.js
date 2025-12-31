var currDate = input.currDate;
// Fix: Access the first element of the settingsrecords array
var noofDays = (input.settingsrecords && input.settingsrecords[0] &&
    input.settingsrecords[0].fields.Schedule_Look_back_Days.value) || 30;
var daterange = {};

// Parse noofDays to ensure it's a number
var lookbackDays = parseInt(noofDays, 10);
if (isNaN(lookbackDays) || lookbackDays < 1) {
    lookbackDays = 30; // Default to 30 if invalid value
}

// Parse current date using the provided getNewDate function
var currentDate;
if (typeof currDate === 'string') {
    // First convert to proper date format, then create Date object
    var formattedCurrentDate = getNewDate(currDate);
    if (formattedCurrentDate) {
        var parts = formattedCurrentDate.split("-");
        currentDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
        currentDate = new Date(currDate);
    }
} else if (typeof currDate === 'number') {
    currentDate = new Date(currDate);
} else {
    currentDate = currDate;
}

// Create start date by subtracting the dynamic lookbackDays from current date
var startDate = new Date(currentDate.getTime() - ((lookbackDays - 1) * 24 * 60 * 60 * 1000));

// Create end date by adding 15 days to current date
var endDate = new Date(currentDate.getTime() + (15 * 24 * 60 * 60 * 1000));

// Helper function to format Date object to YYYY-MM-DD
function formatDateToString(date) {
    var year = date.getFullYear();
    var month = (date.getMonth() + 1) > 9 ? (date.getMonth() + 1).toString() : "0" + (date.getMonth() + 1);
    var day = date.getDate() > 9 ? date.getDate().toString() : "0" + date.getDate();
    return year + "-" + month + "-" + day;
}

function getNewDate(date) {
    if (!date) return "";

    var dateObj;
    var parts;

    if (date.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
        parts = date.split(" ")[0].split("-");
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parts = date.split("-");
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else if (date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        parts = date.split("/");
        dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (date.match(/^\d{2}-\d{2}-\d{4}$/)) {
        parts = date.split("-");
        dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        parts = date.split("/");
        dateObj = new Date(parts[2], parts[0] - 1, parts[1]);
    } else if (date.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
        parts = date.split("/");
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
        return "";
    }

    if (isNaN(dateObj.getTime())) return "";

    var shipYear = dateObj.getFullYear();
    var shipMonth = (dateObj.getMonth() + 1) > 9 ? (dateObj.getMonth() + 1).toString() : "0" + (dateObj.getMonth() + 1);
    var shipDay = dateObj.getDate() > 9 ? dateObj.getDate().toString() : "0" + dateObj.getDate();

    return shipYear + "-" + shipMonth + "-" + shipDay;
}

daterange.startDate = formatDateToString(startDate);
daterange.endDate = formatDateToString(endDate);

return daterange;