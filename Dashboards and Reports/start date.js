var startDate = moment(fields["Start_Date"].value, 'YYYY-MM-DD').valueOf();
var endDate = moment(fields["End_Date"].value, 'YYYY-MM-DD').valueOf();

// Check if End Date exists and validate: Start Date must be before End Date
if (fields["End_Date"].value && startDate >= endDate) {
    app_lib.showWarn("Start Date must be before End Date");
    fields["Start_Date"].value = "";
}