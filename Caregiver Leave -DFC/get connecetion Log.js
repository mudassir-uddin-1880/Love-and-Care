var updatedQBdata = input.updatedQBdata || {};
var currDate = input.currDate || '';
var logarray = [];

// Check if updatedQBdata is an array (multiple logs)
if (Array.isArray(updatedQBdata)) {
    for (var i = 0; i < updatedQBdata.length; i++) {
        var qbItem = updatedQBdata[i];
        var scheduleId = qbItem.scheduleId || '';
        var clientId = qbItem.clientId || '';
        var caregiverId = qbItem.caregiverId || '';
        var startDateAndTime = qbItem.startDateAndTime || '';
        var endDateAndTime = qbItem.endDateAndTime || '';

        var isConnectionFailed = false;
        var failureDetails = '';

        if (qbItem.results && qbItem.results.schedule_events) {
            for (var key in qbItem.results.schedule_events) {
                var event = qbItem.results.schedule_events[key];
                if (event._status_code && event._status_code !== 200) {
                    isConnectionFailed = true;
                    failureDetails = "Status Code: " + event._status_code + ", " +
                        "Status Message: " + (event._status_message || 'Unknown error');
                    break;
                }
            }
        }

        var logEntry = {};

        if (isConnectionFailed) {
            logEntry = {
                status: "Connection Failed",
                scheduleId: scheduleId,
                clientId: clientId,
                caregiverId: caregiverId,
                startDateAndTime: startDateAndTime,
                endDateAndTime: endDateAndTime,
                updatecould: 0,
                Log_Type: "Third Party",
                Connection_Type: "Internal",
                Mode_of_Connection: "Update Schedule",
                date: currDate,
                details:
                    "Status: Connection Failed, " +
                    "Date: " + currDate + ", " +
                    "Schedule ID: " + scheduleId + ", " +
                    "Client ID: " + clientId + ", " +
                    "Caregiver ID: " + caregiverId + ", " +
                    "Start: " + startDateAndTime + ", " +
                    "End: " + endDateAndTime + ", " +
                    "Log Index: " + (i + 1) + ", " +
                    "Failure Details: " + failureDetails
            };
        } else {
            logEntry = {
                status: "Manually Updated",
                scheduleId: scheduleId,
                clientId: clientId,
                caregiverId: caregiverId,
                startDateAndTime: startDateAndTime,
                endDateAndTime: endDateAndTime,
                updatecould: 1,
                Log_Type: "Third Party",
                Connection_Type: "Internal",
                Mode_of_Connection: "Update Schedule",
                date: currDate,
                details:
                    "Status: Manually Updated, " +
                    "Date: " + currDate + ", " +
                    "Schedule ID: " + scheduleId + ", " +
                    "Client ID: " + clientId + ", " +
                    "Caregiver ID: " + caregiverId + ", " +
                    "Start: " + startDateAndTime + ", " +
                    "End: " + endDateAndTime + ", " +
                    "Log Index: " + (i + 1)
            };
        }

        logarray.push(logEntry);
    }
} else {
    // Handle single log (original logic)
    var scheduleId = updatedQBdata.scheduleId || '';
    var clientId = updatedQBdata.clientId || '';
    var caregiverId = updatedQBdata.caregiverId || '';
    var startDateAndTime = updatedQBdata.startDateAndTime || '';
    var endDateAndTime = updatedQBdata.endDateAndTime || '';

    var isConnectionFailed = false;
    var failureDetails = '';

    if (updatedQBdata.results && updatedQBdata.results.schedule_events) {
        for (var key in updatedQBdata.results.schedule_events) {
            var event = updatedQBdata.results.schedule_events[key];
            if (event._status_code && event._status_code !== 200) {
                isConnectionFailed = true;
                failureDetails = "Status Code: " + event._status_code + ", " +
                    "Status Message: " + (event._status_message || 'Unknown error');
                break;
            }
        }
    }

    var logEntry = {};

    if (isConnectionFailed) {
        logEntry = {
            status: "Connection Failed",
            scheduleId: scheduleId,
            clientId: clientId,
            caregiverId: caregiverId,
            startDateAndTime: startDateAndTime,
            endDateAndTime: endDateAndTime,
            updatecould: 0,
            Log_Type: "Third Party",
            Connection_Type: "Internal",
            Mode_of_Connection: "Update Schedule",
            date: currDate,
            details:
                "Status: Connection Failed, " +
                "Date: " + currDate + ", " +
                "Schedule ID: " + scheduleId + ", " +
                "Client ID: " + clientId + ", " +
                "Caregiver ID: " + caregiverId + ", " +
                "Start: " + startDateAndTime + ", " +
                "End: " + endDateAndTime + ", " +
                "Failure Details: " + failureDetails
        };
    } else {
        logEntry = {
            status: "Manually Updated",
            scheduleId: scheduleId,
            clientId: clientId,
            caregiverId: caregiverId,
            startDateAndTime: startDateAndTime,
            endDateAndTime: endDateAndTime,
            updatecould: 1,
            Log_Type: "Third Party",
            Connection_Type: "Internal",
            Mode_of_Connection: "Update Schedule",
            date: currDate,
            details:
                "Status: Manually Updated, " +
                "Date: " + currDate + ", " +
                "Schedule ID: " + scheduleId + ", " +
                "Client ID: " + clientId + ", " +
                "Caregiver ID: " + caregiverId + ", " +
                "Start: " + startDateAndTime + ", " +
                "End: " + endDateAndTime
        };
    }

    logarray.push(logEntry);
}

return {
    logarray: logarray
};