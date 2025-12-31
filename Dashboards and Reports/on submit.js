// ============================================
// DATE VALIDATION
// ============================================
if (!fields["Start_Date"].value || fields["Start_Date"].value === "") {
    return "Please select Start Date to generate the dashboard.";
}

if (!fields["End_Date"].value || fields["End_Date"].value === "") {
    return "Please select End Date to generate the dashboard.";
}

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
    "Pending_Overall_Late_Percentage"
]);


if (fields["Dashboards_Status"].value = ""){
    return "After clicking the get all dashbaords button Dashboard data is being processed. Please wait a few minutes and resubmit.";
}