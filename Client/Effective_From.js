const fromDate = new Date(fields["Effective_From"].value);
const toDate = new Date(fields["Effective_To"].value);

if (toDate < fromDate) {
    fields["Effective_To"].value = null || "";
    app_lib.showWarn("The 'To' date cannot be earlier than the 'From' date.");
}
