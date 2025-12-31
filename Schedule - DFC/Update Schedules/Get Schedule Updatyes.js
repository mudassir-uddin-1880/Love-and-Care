var scheduleData = (input && input.scheduleData) || {};
var fields = (scheduleData && scheduleData.fields) || {};
var currDate = input.currDate || "";

function toISO(dateStr, timeStr) {
    if (!dateStr || !timeStr) return "";
    var parts = String(timeStr).trim().split(':');
    var hour = ('0' + (parts[0] || '0')).slice(-2);
    var minute = ('0' + (parts[1] || '0')).slice(-2);
    return String(dateStr).trim() + 'T' + hour + ':' + minute + ':00+00:00';
}

function getNewDate(date) {
    if (!date) return null;
    var dateObj;
    var parts;
    if (date.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/)) {
        parts = date.split(" ")[0].split("-");
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else if (date.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)) {
        parts = date.split("-");
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else if (date.match(/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/)) {
        parts = date.split("/");
        dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (date.match(/^[0-9]{2}-[0-9]{2}-[0-9]{4}$/)) {
        parts = date.split("-");
        dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
    } else if (date.match(/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/)) {
        parts = date.split("/");
        dateObj = new Date(parts[2], parts[0] - 1, parts[1]);
    } else if (date.match(/^[0-9]{4}\/[0-9]{2}\/[0-9]{2}$/)) {
        parts = date.split("/");
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
        return null;
    }
    if (isNaN(dateObj.getTime())) return null;
    var shipYear = dateObj.getFullYear();
    var shipMonth = (dateObj.getMonth() + 1) > 9 ? (dateObj.getMonth() + 1).toString() : "0" + (dateObj.getMonth() + 1);
    var shipDay = dateObj.getDate() > 9 ? dateObj.getDate().toString() : "0" + dateObj.getDate();
    return shipYear + "-" + shipMonth + "-" + shipDay;
}

function toRFC3339(dateStr, timeStr) {
    var datePart = getNewDate(dateStr);
    if (!datePart || !timeStr) return "";
    var parts = String(timeStr).trim().split(":");
    var hour = ("0" + (parts[0] || "0")).slice(-2);
    var minute = ("0" + (parts[1] || "0")).slice(-2);
    return datePart + "T" + hour + ":" + minute + ":00Z";
}

var scheduleId = (fields.User_Id && fields.User_Id.value) || 0;
var clientId = (fields.Client_ID && fields.Client_ID.value) || 0;
var caregiverId = (fields.Caregiver_Id && fields.Caregiver_Id.value) || 0;

var startDateAndTime = toRFC3339(
    fields.Schedule_Start_Date && fields.Schedule_Start_Date.value,
    fields.Schedule_Start_Time && fields.Schedule_Start_Time.value
);
var endDateAndTime = toRFC3339(
    fields.Schedule_End_Date && fields.Schedule_End_Date.value,
    fields.Schedule_End_Time && fields.Schedule_End_Time.value
);

// Ensure 'endDateAndTime' is present and valid
if (!endDateAndTime) {
    if (startDateAndTime) {
        var startDateObj = new Date(startDateAndTime);
        var endDateObj = new Date(startDateObj.getTime() + 2 * 60 * 60 * 1000); // add 2 hours
        // Format to ISO string with timezone, remove milliseconds and any .00 after seconds
        var isoEnd = endDateObj.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/\.00Z$/, "Z");
        endDateAndTime = isoEnd;
    }
}

return {
    status: "Manually Updated",
    scheduleId: scheduleId,
    clientId: clientId,
    caregiverId: caregiverId,
    startDateAndTime: startDateAndTime,
    endDateAndTime: endDateAndTime,
    "updatecould": 1,
    "Log_Type": "Third Party",
    "Connection_Type": "Internal",
    "Mode_of_Connection": "Update Schedule",
    "date": currDate,
    "details":
        "Status: Manually Updated, " +
        "Date: " + currDate + ", " +
        "Schedule ID: " + scheduleId + ", " +
        "Client ID: " + clientId + ", " +
        "Caregiver ID: " + caregiverId + ", " +
        "Start: " + startDateAndTime + ", " +
        "End: " + endDateAndTime
};