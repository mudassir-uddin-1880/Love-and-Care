if (fields["Effective_From"].value == null || fields["Effective_From"].value == "") {
    fields["Effective_To"].value = null;
    app_lib.showWarn("Please enter Effective To date");
}

const fromDate = new Date(fields["Effective_From"].value);
const toDate = new Date(fields["Effective_To"].value);

if (toDate < fromDate) {
    fields["Effective_To"].value = null || "";
    app_lib.showWarn("The 'To' date cannot be earlier than the 'From' date.");
}
