var scheduleData = input.scheduleData || {};
var currDate = input.currDate || "";

function getNewDate(date) {
    if (!date) return null;

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
        return null;
    }

    if (isNaN(dateObj.getTime())) return null;

    var shipYear = dateObj.getFullYear();
    var shipMonth = (dateObj.getMonth() + 1) > 9 ? (dateObj.getMonth() + 1).toString() : "0" + (dateObj.getMonth() + 1);
    var shipDay = dateObj.getDate() > 9 ? dateObj.getDate().toString() : "0" + dateObj.getDate();

    return shipYear + "-" + shipMonth + "-" + shipDay;
}
function pad2(n) {
    n = n || 0;
    n = parseInt(n, 10);
    return n < 10 ? '0' + n : '' + n;
}

function ensureHHMM(t) {
    if (!t) return '00:00';
    var p = ('' + t).split(':');
    return pad2(p[0]) + ':' + pad2(p[1] || 0);
}

function toIsoWithZ(dateStr, timeStr) {
    var d = getNewDate(dateStr) || dateStr || '';
    var tt = ensureHHMM(timeStr);
    // Output: YYYY-MM-DDTHH:mm:00+00:00
    return d + 'T' + tt + ':00+00:00';
}
var fields = scheduleData.fields || {};

var startDate = fields.Schedule_Start_Date && fields.Schedule_Start_Date.value ? fields.Schedule_Start_Date.value : "";
var startTime = fields.Schedule_Start_Time && fields.Schedule_Start_Time.value ? fields.Schedule_Start_Time.value : "";
var endDate = fields.Schedule_End_Date && fields.Schedule_End_Date.value ? fields.Schedule_End_Date.value : "";
var endTime = fields.Schedule_End_Time && fields.Schedule_End_Time.value ? fields.Schedule_End_Time.value : "";

var start = (startDate && startTime) ? toIsoWithZ(startDate, startTime) : "";
var end = (startDate && endTime) ? toIsoWithZ(startDate, endTime) : "";

var event = {
    schedule_calendar_id: 162057,
    start: start,
    end: end,
    assigned_user_ids: (fields.Caregiver_Id && fields.Caregiver_Id.value) ? fields.Caregiver_Id.value : "",
    jobcode_id: (fields.Client_ID && fields.Client_ID.value) ? fields.Client_ID.value : 0,
    title: (fields.Shift_Status && fields.Shift_Status.value) ? fields.Shift_Status.value : "",
    draft: false,
    active: true
};

if (end) {
    event.end = end;
} else {
    event.all_day = true;
}

var payLoadData = JSON.stringify([event]);

return {
    payLoadData: payLoadData
};