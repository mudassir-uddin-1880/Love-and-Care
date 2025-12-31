var currDate = input.currDate;
// Fix: Access the first element of the settingsrecords array
var noofDays = (input.settingsrecords && input.settingsrecords[0] &&
    input.settingsrecords[0].fields.Schedule_Look_back_Days.value) || 10;
var daterange = {};

// Parse noofDays to ensure it's a number
var lookbackDays = parseInt(noofDays, 30);
if (isNaN(lookbackDays) || lookbackDays < 1) {
    lookbackDays = 30; // Default to 10 if invalid value
}

// Parse current date using the provided getNewDate function
var endDate;
if (typeof currDate === 'string') {
    // First convert to proper date format, then create Date object
    var formattedEndDate = getNewDate(currDate);
    if (formattedEndDate) {
        var parts = formattedEndDate.split("-");
        endDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
        endDate = new Date(currDate);
    }
} else if (typeof currDate === 'number') {
    endDate = new Date(currDate);
} else {
    endDate = currDate;
}

// Create start date by subtracting the dynamic lookbackDays
var startDate = new Date(endDate.getTime() - ((lookbackDays - 1) * 24 * 60 * 60 * 1000));

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