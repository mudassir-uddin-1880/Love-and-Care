app_lib.hideField([
    "Caregiver_Retention_Rate",
    "ContinuityFirst_Coverage_Rate_",
    "Start_Date",
    "End_Date",
    "Get_ContinuityFirst_Coverage_Rate",
    "Report_Status",
    "Caregiver_Retention_Rate",
    "Dashbaords",
    "Report_Name",
    "Report_details",
    "Id",
    "OnTime_ClockIn_Rate_",
    "OnTime_ClockIn_Rate",
    "Dashboard_Type",
    "Get_OnTime_ClockIn_Rate",
    "Caregiver_OnTime_ClockIn_Rate",
    "Caregiver_OnTime_ClockIn_Rate_",
    "Note_Completion_Rate_",
    "Get_Note_Completion_Rate",
    
    "Note_Completion_Rate",
    "Emergency_Coverage_Success_Rate_",
    "Get_Emergency_Coverage_Success_Rate",
    "Emergency_Coverage_Success_Rate"
]);

if (fields["KPI_Type"].value == "Dashbaords") {
    app_lib.showField([
        "Dashbaords",
        "Dashboard_Type",
    ]);
}
if (fields["Dashboard_Type"].value == "Continuity-First Coverage Rate") {
    app_lib.showField([
        "Dashbaords",
        "Dashboard_Type",
        "ContinuityFirst_Coverage_Rate_",
        "Get_ContinuityFirst_Coverage_Rate",
    ]);
}
if (fields["Dashboard_Type"].value == "On-Time Clock-In Rate") {
    app_lib.showField([
        "Dashbaords",
        "Dashboard_Type",
        "Start_Date",
        "End_Date",
        "OnTime_ClockIn_Rate_",
        "Get_OnTime_ClockIn_Rate",
        "Caregiver_OnTime_ClockIn_Rate_"
    ]);
}
if (fields["Dashboard_Type"].value == "Note Completion Rate") {
    app_lib.showField([
        "Dashbaords",
        "Dashboard_Type",
        "Start_Date",
        "End_Date",
        "Note_Completion_Rate_",
        "Get_Note_Completion_Rate",
    ]);
}
if (fields["Dashboard_Type"].value == "Emergency Coverage Success Rate") {
    app_lib.showField([
        "Dashbaords",
        "Dashboard_Type",
        "Start_Date",
        "End_Date",
        "Emergency_Coverage_Success_Rate_",
        "Get_Emergency_Coverage_Success_Rate",
    ]);
}

if (fields["KPI_Type"].value == "Reports") {
    app_lib.showField([
        "Report_Name",
        "Report_details",
        "Start_Date",
        "End_Date",
        "Report_Status",
    ]);
}