var settingsData = input.settingsData;
var currDate = input.currDate;
var emailsList = '';

if (Array.isArray(settingsData)) {
    for (var i = 0; i < settingsData.length; i++) {
        var item = settingsData[i];
        if (item && item.fields && item.fields.Weekly_Report_Emails) {
            emailsList = item.fields.Weekly_Report_Emails.value || '';
            break;
        }
    }
}

var emailsArray = emailsList
    .split(',')
    .map(function (e) { return e.trim(); })
    .filter(function (e) { return !!e; });

emailsList = emailsArray.join(', ');

var emailsForDetails = emailsArray
    .map(function (email) { return "  • " + email; })
    .join('\n');

var date = currDate.split(' ')[0]; // Extract only the date part
var time = currDate.split(' ')[1]; // Extract only the time part
var details = "Weekly report automation executed successfully.\n" +
    "Date: " + date + "\n" +
    "Time: " + time + "\n" +
    "Recipients:\n" + emailsForDetails;

return {
    "a": "Yes",
    "emailsList": emailsList,
    "date": date,
    "details": details
}