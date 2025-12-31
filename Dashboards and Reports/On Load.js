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