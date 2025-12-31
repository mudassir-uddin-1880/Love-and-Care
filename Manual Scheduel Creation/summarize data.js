var scheduleData = input.scheduleData || {};
var retunPushedQBSchedule = input.retunPushedQBSchedule || {};
var currDate = input.currDate || new Date().toISOString().split('T')[0];

// Helper function to safely get nested values
function safeGet(obj, path, defaultValue) {
    if (defaultValue === undefined) defaultValue = "";
    var keys = path.split('.');
    var current = obj;
    for (var i = 0; i < keys.length; i++) {
        if (current && current[keys[i]] !== undefined) {
            current = current[keys[i]];
        } else {
            return defaultValue;
        }
    }
    return current;
}

// Helper function to extract field value
function getFieldValue(fields, fieldName, defaultValue) {
    if (defaultValue === undefined) defaultValue = "";
    return safeGet(fields, fieldName + '.value', defaultValue);
}

// Helper function to convert to number safely
function toNumber(value, defaultValue) {
    if (defaultValue === undefined) defaultValue = 0;
    var num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
}

// Helper function to convert to integer safely
function toInt(value, defaultValue) {
    if (defaultValue === undefined) defaultValue = 0;
    var num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
}

// Helper function to filter out empty summary lines
function filterSummaryLines(lines) {
    var filtered = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf(': ') === -1 ||
            (!line.match(/: $/) && !line.match(/: 0$/) && !line.match(/: \$0$/) && !line.match(/: N\/A$/) && !line.match(/: None$/))) {
            filtered.push(line);
        }
    }
    return filtered;
}

// Extract schedule details from internal scheduleData
var fields = scheduleData.fields || {};

// Calculate schedule metrics
var expectedCaregiver = getFieldValue(fields, 'Expected_Caregiver');
var shiftStatus = getFieldValue(fields, 'Shift_Status');
var isScheduled = shiftStatus === "Scheduled";
var isAssigned = expectedCaregiver !== "";

var scheduleDetails = {
    totalSchedules: 1,
    assignedShifts: isAssigned ? 1 : 0,
    unassignedShifts: isAssigned ? 0 : 1,
    openShifts: isScheduled ? 1 : 0,
    completedShifts: shiftStatus === "Completed" ? 1 : 0,
    cancelledShifts: shiftStatus === "Cancelled" ? 1 : 0,
    pendingShifts: shiftStatus === "Pending" ? 1 : 0,
    ghostShiftsTotal: getFieldValue(fields, 'Gosht_Shift_Caregiver_Available') ? 1 : 0,
    ghostShiftsAssigned: 0,
    ghostShiftsUnassigned: 0,
    conflicts: toInt(getFieldValue(fields, 'Conflicts', 0)),
    availabilityIssues: toInt(getFieldValue(fields, 'Availability_Issues', 0)),
    overlappingShifts: 0,
    withPushData: 1, // Since we have schedule data
    withoutPushData: 0,
    // Core schedule information
    scheduleId: getFieldValue(fields, 'ID'),
    clientName: getFieldValue(fields, 'Client_Name'),
    caregiverName: expectedCaregiver,
    dayOfWeek: getFieldValue(fields, 'Day'),
    startDate: getFieldValue(fields, 'Schedule_Start_Date'),
    endDate: getFieldValue(fields, 'Schedule_End_Date'),
    startTime: getFieldValue(fields, 'Schedule_Start_Time'),
    endTime: getFieldValue(fields, 'Schedule_End_Time'),
    expectedHours: toNumber(getFieldValue(fields, 'Expected_Hours', 0)),
    actualHours: toNumber(getFieldValue(fields, 'Actual_Hours', 0)),
    publishedHours: toNumber(getFieldValue(fields, 'Published_Hours_Client', 0)),
    unpublishedHours: toNumber(getFieldValue(fields, 'Unpublished_Hours_Client', 0)),
    billRate: toNumber(getFieldValue(fields, 'Bill_Rate', 0)),
    payRate: toNumber(getFieldValue(fields, 'Pay_Rate', 0)),
    serviceType: getFieldValue(fields, 'Service_Type'),
    planType: getFieldValue(fields, 'Plan_Type'),
    clientGender: getFieldValue(fields, 'Clients_Gender'),
    clientPhone: getFieldValue(fields, 'Client_Phone_Number'),
    recordStatus: getFieldValue(fields, 'Record_Status'),
    schedulingStatus: getFieldValue(fields, 'Scheduling_Status'),
    creationType: getFieldValue(fields, 'Schedule_Creation_Type'),
    notes: getFieldValue(fields, 'Notes_for_Schedule'),
    lastModifiedBy: getFieldValue(fields, 'Last_Modified_By'),
    createdBy: getFieldValue(fields, 'Created_By'),
    clockInAddress: getFieldValue(fields, 'ClockIn_Address'),
    clockOutAddress: getFieldValue(fields, 'ClockOut_Address'),
    checkInTime: getFieldValue(fields, 'CheckIn_Time'),
    checkOutTime: getFieldValue(fields, 'CheckOut_Time'),
    userId: toInt(getFieldValue(fields, 'User_Id', 0)),
    caregiverId: toInt(getFieldValue(fields, 'Caregiver_Id', 0)),
    clientId: toInt(getFieldValue(fields, 'Client_ID', 0)),
    clientMasterId: getFieldValue(fields, 'Client_Master_ID'),
    maxWeeklyHours: toNumber(getFieldValue(fields, 'Max_Weekly_Hours', 0)),
    targetWeeklyHours: toNumber(getFieldValue(fields, 'Target_Weekly_Hours', 0)),
    caregiverScore: toNumber(getFieldValue(fields, 'Caregiver_Score_', 0)),
    availableCaregivers: getFieldValue(fields, 'List_of_Available_Caregivers'),
    issues: getFieldValue(fields, 'Issue_With_Selected_Caregiver'),
    slotCode: getFieldValue(fields, 'Slot_Code')
};

// Extract QB push details
var qbResult = safeGet(retunPushedQBSchedule, 'results.schedule_events.1', {});

var qbUsers = safeGet(retunPushedQBSchedule, 'supplemental_data.users', {});
var qbCalendars = safeGet(retunPushedQBSchedule, 'supplemental_data.calendars', {});

var qbUser = qbUsers[qbResult.user_id] || {};
var qbCalendar = qbCalendars[qbResult.schedule_calendar_id] || {};

var hasQBData = Object.keys(qbResult).length > 0;

var qbStatusCode = qbResult._status_code || 0;

var isQBSuccess = qbStatusCode === 200;

var qbDetails = {
    hasData: hasQBData,
    scheduleEventId: qbResult.id || null,
    userId: qbResult.user_id || null,
    calendarId: qbResult.schedule_calendar_id || null,
    jobcodeId: qbResult.jobcode_id || null,
    isActive: qbResult.active || false,
    isDraft: qbResult.draft || false,
    isUnassigned: qbResult.unassigned || false,
    isAllDay: qbResult.all_day || false,
    startDateTime: qbResult.start || "",
    endDateTime: qbResult.end || "",
    timezone: qbResult.timezone || "",
    title: qbResult.title || "",
    notes: qbResult.notes || "",
    color: qbResult.color || "",
    location: qbResult.location || "",
    customFields: qbResult.customfields || "",
    assignedUserIds: qbResult.assigned_user_ids || "",
    created: qbResult.created || "",
    lastModified: qbResult.last_modified || "",
    statusCode: qbStatusCode,
    statusMessage: qbResult._status_message || "",
    // Calculated fields
    pushTime: qbResult.created || "",
    totalPushed: hasQBData ? 1 : 0,
    pushSuccess: isQBSuccess ? 1 : 0,
    pushFailed: hasQBData && !isQBSuccess ? 1 : 0,
    syncedWithQB: qbResult.active && isQBSuccess ? 1 : 0,
    notSyncedWithQB: !qbResult.active || !isQBSuccess ? 1 : 0,
    pushDate: qbResult.created ? qbResult.created.split("T")[0] : "",
    lastSyncTime: qbResult.last_modified || "",
    failureReasons: !isQBSuccess ? qbResult._status_message || "Unknown error" : "",
    errorLogs: !isQBSuccess ? qbResult._status_message || "Unknown error" : "",
    // User details
    userFirstName: qbUser.first_name || "",
    userLastName: qbUser.last_name || "",
    userDisplayName: qbUser.display_name || "",
    userEmail: qbUser.email || "",
    userActive: qbUser.active || false,
    userEmployeeNumber: qbUser.employee_number || 0,
    userPayRate: qbUser.pay_rate || 0,
    userPayInterval: qbUser.pay_interval || "",
    userHireDate: qbUser.hire_date || "",
    userTermDate: qbUser.term_date || "",
    userCompanyName: qbUser.company_name || "",
    userMobileNumber: qbUser.mobile_number || "",
    // Calendar details
    calendarName: qbCalendar.name || "",
    calendarCreated: qbCalendar.created || "",
    calendarLastModified: qbCalendar.last_modified || ""
};

// Create arrays for summary
qbDetails.clients = qbCalendar.name ? [qbCalendar.name] : [];
qbDetails.caregivers = qbUser.display_name ? [qbUser.display_name] : [];
qbDetails.mode = qbResult.title || "";

// Create comprehensive summary
var internalSummaryLines = [
    "=== SCHEDULE SUMMARY ===",
    "Schedule ID: " + scheduleDetails.scheduleId,
    "Client: " + scheduleDetails.clientName,
    "Expected Caregiver: " + scheduleDetails.caregiverName,
    "Day: " + scheduleDetails.dayOfWeek,
    "Date: " + scheduleDetails.startDate + " to " + scheduleDetails.endDate,
    "Time: " + scheduleDetails.startTime + " - " + scheduleDetails.endTime,
    "Status: " + scheduleDetails.recordStatus + " / " + scheduleDetails.schedulingStatus,
    "Expected Hours: " + scheduleDetails.expectedHours,
    "Actual Hours: " + scheduleDetails.actualHours,
    "Service Type: " + scheduleDetails.serviceType,
    "Plan Type: " + scheduleDetails.planType,
    "Creation Type: " + scheduleDetails.creationType,
    "Bill Rate: $" + scheduleDetails.billRate,
    "Pay Rate: $" + scheduleDetails.payRate,
    "Conflicts: " + scheduleDetails.conflicts,
    "Availability Issues: " + scheduleDetails.availabilityIssues,
    "Caregiver Score: " + scheduleDetails.caregiverScore,
    "Available Caregivers: " + scheduleDetails.availableCaregivers,
    "Notes: " + scheduleDetails.notes
];

var internalSummary = filterSummaryLines(internalSummaryLines).join("\n");

var qbSummaryLines = [
    "=== QUICKBOOKS INTEGRATION ===",
    "Has QB Data: " + (qbDetails.hasData ? "Yes" : "No"),
    "QB Schedule ID: " + (qbDetails.scheduleEventId || "N/A"),
    "Status: " + qbDetails.statusMessage,
    "Synced: " + (qbDetails.syncedWithQB ? "Yes" : "No"),
    "Push Success: " + (qbDetails.pushSuccess ? "Yes" : "No"),
    "Push Date/Time: " + qbDetails.pushTime,
    "Last Modified: " + qbDetails.lastSyncTime,
    "QB User: " + qbDetails.userDisplayName + " (" + qbDetails.userEmail + ")",
    "QB Calendar: " + qbDetails.calendarName,
    "QB Title: " + qbDetails.title,
    "QB Active: " + (qbDetails.isActive ? "Yes" : "No"),
    "QB Draft: " + (qbDetails.isDraft ? "Yes" : "No"),
    "QB Start: " + qbDetails.startDateTime,
    "QB End: " + qbDetails.endDateTime,
    "QB Timezone: " + qbDetails.timezone,
    "Error Details: " + (qbDetails.errorLogs || "None")
];

var qbSummary = filterSummaryLines(qbSummaryLines).join("\n");

// Create the final connection log structure
var connectLog = {
    data: [
        {
            // Basic identifiers
            Connection_Type: "Internal",
            Log_Type: "Internal Schedule",
            Mode_of_Connection: "Manual Schedule Create" || "",
            currentdate: currDate,

            // Detailed summary
            Details: internalSummary,

            // Schedule metrics
            totalSchedules: scheduleDetails.totalSchedules,
            assignedShifts: scheduleDetails.assignedShifts,
            unassignedShifts: scheduleDetails.unassignedShifts,
            openShifts: scheduleDetails.openShifts,
            completedShifts: scheduleDetails.completedShifts,
            cancelledShifts: scheduleDetails.cancelledShifts,
            pendingShifts: scheduleDetails.pendingShifts,
            ghostShiftsTotal: scheduleDetails.ghostShiftsTotal,
            ghostShiftsAssigned: scheduleDetails.ghostShiftsAssigned,
            ghostShiftsUnassigned: scheduleDetails.ghostShiftsUnassigned,
            conflicts: scheduleDetails.conflicts,
            availabilityIssues: scheduleDetails.availabilityIssues,
            overlappingShifts: scheduleDetails.overlappingShifts,
            withPushData: scheduleDetails.withPushData,
            withoutPushData: scheduleDetails.withoutPushData,

            // Breakdown information
            dayWiseBreakdown: scheduleDetails.dayOfWeek,
            clientBreakdown: scheduleDetails.clientName,
            caregiverBreakdown: scheduleDetails.caregiverName,
            clients: scheduleDetails.clientName ? [scheduleDetails.clientName] : [],
            clientsInvolved: scheduleDetails.clientName ? 1 : 0,
            caregivers: scheduleDetails.caregiverName ? [scheduleDetails.caregiverName] : [],
            caregiversInvolved: scheduleDetails.caregiverName ? 1 : 0,

            // QB integration status
            syncedWithQB: 0,
            notSyncedWithQB: 0,
            totalPushed: 0,
            pushSuccess: 0,
            pushFailed: 0,
            pushDate: "",
            pushTime: "",
            lastSyncTime: "",
            errorLogs: "",
            failureReasons: "",
            mode: "",

            // Extended schedule details
            scheduleId: scheduleDetails.scheduleId,
            expectedHours: scheduleDetails.expectedHours,
            actualHours: scheduleDetails.actualHours,
            publishedHours: scheduleDetails.publishedHours,
            unpublishedHours: scheduleDetails.unpublishedHours,
            billRate: scheduleDetails.billRate,
            payRate: scheduleDetails.payRate,
            serviceType: scheduleDetails.serviceType,
            planType: scheduleDetails.planType,
            recordStatus: scheduleDetails.recordStatus,
            schedulingStatus: scheduleDetails.schedulingStatus,
            creationType: scheduleDetails.creationType,
            caregiverScore: scheduleDetails.caregiverScore,
            startDate: scheduleDetails.startDate,
            endDate: scheduleDetails.endDate,
            startTime: scheduleDetails.startTime,
            endTime: scheduleDetails.endTime,
            clientGender: scheduleDetails.clientGender,
            clientPhone: scheduleDetails.clientPhone,
            clockInAddress: scheduleDetails.clockInAddress,
            clockOutAddress: scheduleDetails.clockOutAddress,
            checkInTime: scheduleDetails.checkInTime,
            checkOutTime: scheduleDetails.checkOutTime,
            userId: scheduleDetails.userId,
            caregiverId: scheduleDetails.caregiverId,
            clientId: scheduleDetails.clientId,
            clientMasterId: scheduleDetails.clientMasterId,
            maxWeeklyHours: scheduleDetails.maxWeeklyHours,
            targetWeeklyHours: scheduleDetails.targetWeeklyHours,
            availableCaregivers: scheduleDetails.availableCaregivers,
            issues: scheduleDetails.issues,
            slotCode: scheduleDetails.slotCode,
            lastModifiedBy: scheduleDetails.lastModifiedBy,
            createdBy: scheduleDetails.createdBy
        },
        {
            // QB Time entry
            Connection_Type: "QB Time",
            Log_Type: "Third Party",
            Mode_of_Connection: "Manual Schedule Create",
            currentdate: currDate,

            // Detailed QB summary
            Details: qbSummary,

            // QB specific metrics
            totalSchedules: qbDetails.hasData ? 1 : 0,
            assignedShifts: qbDetails.hasData && !qbDetails.isUnassigned ? 1 : 0,
            unassignedShifts: qbDetails.isUnassigned ? 1 : 0,
            completedShifts: qbDetails.isActive && !qbDetails.isDraft ? 1 : 0,
            pendingShifts: qbDetails.isDraft ? 1 : 0,
            openShifts: qbDetails.hasData ? 1 : 0,
            ghostShiftsTotal: 0,
            ghostShiftsAssigned: 0,
            ghostShiftsUnassigned: 0,
            conflicts: 0,
            availabilityIssues: 0,
            overlappingShifts: 0,
            withPushData: qbDetails.hasData ? 1 : 0,
            withoutPushData: qbDetails.hasData ? 0 : 1,

            // Pass/Fail counts for QB connection
            passCount: qbDetails.pushSuccess,
            failCount: qbDetails.pushFailed,
            totalPushed: qbDetails.totalPushed,

            // QB breakdown
            dayWiseBreakdown: "",
            clientBreakdown: "",
            caregiverBreakdown: qbDetails.userDisplayName,
            clients: qbDetails.clients,
            clientsInvolved: qbDetails.clients.length,
            caregivers: qbDetails.caregivers,
            caregiversInvolved: qbDetails.caregivers.length,

            // QB sync status
            syncedWithQB: qbDetails.syncedWithQB,
            notSyncedWithQB: qbDetails.notSyncedWithQB,
            totalPushed: qbDetails.totalPushed,
            pushSuccess: qbDetails.pushSuccess,
            pushFailed: qbDetails.pushFailed,
            pushDate: qbDetails.pushDate,
            pushTime: qbDetails.pushTime,
            lastSyncTime: qbDetails.lastSyncTime,
            errorLogs: qbDetails.errorLogs ? [qbDetails.errorLogs] : [],
            failureReasons: qbDetails.failureReasons ? [qbDetails.failureReasons] : [],
            mode: qbDetails.mode,

            // Extended QB details
            qbScheduleId: qbDetails.scheduleEventId,
            qbUserId: qbDetails.userId,
            qbCalendarId: qbDetails.calendarId,
            qbJobcodeId: qbDetails.jobcodeId,
            qbUserName: qbDetails.userDisplayName,
            qbUserEmail: qbDetails.userEmail,
            qbUserFirstName: qbDetails.userFirstName,
            qbUserLastName: qbDetails.userLastName,
            qbUserActive: qbDetails.userActive,
            qbUserEmployeeNumber: qbDetails.userEmployeeNumber,
            qbUserPayRate: qbDetails.userPayRate,
            qbUserPayInterval: qbDetails.userPayInterval,
            qbUserHireDate: qbDetails.userHireDate,
            qbUserTermDate: qbDetails.userTermDate,
            qbUserCompanyName: qbDetails.userCompanyName,
            qbUserMobileNumber: qbDetails.userMobileNumber,
            qbCalendarName: qbDetails.calendarName,
            qbCalendarCreated: qbDetails.calendarCreated,
            qbCalendarLastModified: qbDetails.calendarLastModified,
            qbTitle: qbDetails.title,
            qbNotes: qbDetails.notes,
            qbColor: qbDetails.color,
            qbLocation: qbDetails.location,
            qbCustomFields: qbDetails.customFields,
            qbAssignedUserIds: qbDetails.assignedUserIds,
            qbActive: qbDetails.isActive,
            qbDraft: qbDetails.isDraft,
            qbUnassigned: qbDetails.isUnassigned,
            qbAllDay: qbDetails.isAllDay,
            qbStartDateTime: qbDetails.startDateTime,
            qbEndDateTime: qbDetails.endDateTime,
            qbTimezone: qbDetails.timezone,
            qbStatusCode: qbDetails.statusCode,
            qbStatusMessage: qbDetails.statusMessage,
            qbCreated: qbDetails.created,
            qbLastModified: qbDetails.lastModified
        }
    ]
};

return connectLog;