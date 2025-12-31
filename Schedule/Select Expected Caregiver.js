var currDate = moment().format('YYYY-MM-DD');
var currTime = moment().format('HH:mm:ss');
if (fields["Select_Expected_Caregiver"].value != "" && fields["Select_Expected_Caregiver"].value != null) {

    // ✅ Pre-check mandatory fields before assigning caregiver
    var inputDate = fields["Schedule_Start_Date"]?.value || "";
    var inputStartTime = fields["Schedule_Start_Time"]?.value || "";
    var inputEndTime = fields["Schedule_End_Time"]?.value || "";

    if (!inputDate || !inputStartTime || !inputEndTime) {
        app_lib.showWarn("Please select Schedule Date, Start Time, and End Time before choosing a caregiver.");
        // Clear caregiver selection
        fields["Caregiver_Id"].value = "";
        fields["Select_Expected_Caregiver"].value = "";
        fields["Expected_Caregiver"].value = "";
        return; // stop further execution
    }

    // ✅ Populate caregiver details from fetched data
    fields["Caregiver_Id"].value = data.fields["QB_Id"] ? data.fields["QB_Id"].value : "";
    fields["Expected_Caregiver"].value = data.fields["Employee_Full_Name"] ? data.fields["Employee_Full_Name"].value : "";

    // ✅ Update shift status and record schedule time
    if (fields["Shift_Status"].value == "Open Shift" || fields["Scheduling_Status"].value == "Caregiver No Show") {
        fields["Shift_Status"].value = "Scheduled";
        fields["Scheduling_Status"].value = "Scheduled Completed";
        fields["Scheduler_End_Time"].value = currDate + " " + currTime;
        fields["Caregiver_Assigned_by_Automation"].value = "Yes"
    }
} else {
    // Clear caregiver details if no caregiver is selected
    fields["Caregiver_Id"].value = "";
    fields["Expected_Caregiver"].value = "";
}