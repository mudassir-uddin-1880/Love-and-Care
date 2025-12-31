if (app_lib.txnId() == null) {
    var userDetails = app_lib.loginUser();
    var user = userDetails ? userDetails.name : '';
    var time = moment().format('MMMM DD YYYY, h:mm:ss a');
    var log = user + " , " + time + "\n";
    fields["Created_By"].value = log;
}


if (fields["Last_Modified_By"]) {
    var userDetails = app_lib.loginUser();
    var user = userDetails ? userDetails.name : '';
    var time = moment().format('MMMM Do YYYY, h:mm:ss a');
    var log = user + " , " + time + "\n";
    fields["Last_Modified_By"].value = log;

    if (fields["Last_Modified_At_Location"]) {
        function onResponse(res) {
            fields["Last_Modified_At_Location"].value = res.location;
        }
        app_lib.getLocation(onResponse);
    }
}






var firstName = fields["Client_First_Name"] && fields["Client_First_Name"].value;
var lastName = fields["Client_Last_Name"] && fields["Client_Last_Name"].value;

var fullName = "";

if (firstName && lastName) {
    fullName = firstName + " " + lastName; // Both present → combine
} else if (firstName) {
    fullName = firstName; // Only first name
} else if (lastName) {
    fullName = lastName; // Only last name
}

// Store in Full_Name field
if (fields["Client_Full_Name"]) {
    fields["Client_Full_Name"].value = fullName;
}