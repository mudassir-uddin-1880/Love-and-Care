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


fields["User_First_Name"].value = fields["First_Name"].value;

fields["User_Last_Name"].value = fields["Last_Name"].value;

fields["Complete_Address"].value = fields["Address"].value;

fields["Phone_Number"].value = fields["Primary_Phone_Number"].value;

fields["Email_Address"].value = fields["Email"].value;


if (fields["First_Name"] && fields["First_Name"].value) {
    if (fields["User_First_Name"]) {
        fields["User_First_Name"].value = fields["First_Name"].value;
    }
}

if (fields["Last_Name"] && fields["Last_Name"].value) {
    if (fields["User_Last_Name"]) {
        fields["User_Last_Name"].value = fields["Last_Name"].value;
    }
}

if (fields["Address"] && fields["Address"].value) {
    if (fields["Complete_Address"]) {
        fields["Complete_Address"].value = fields["Address"].value;
    }
}

if (fields["Primary_Phone_Number"] && fields["Primary_Phone_Number"].value) {
    if (fields["Phone_Number"]) {
        fields["Phone_Number"].value = fields["Primary_Phone_Number"].value;
    }
}

if (fields["Email"] && fields["Email"].value) {
    if (fields["Email_Address"]) {
        fields["Email_Address"].value = fields["Email"].value;
    }
}

