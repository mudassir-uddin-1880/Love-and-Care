// ******************************************************************************************
// Developer: [Mudassir Uddinm]
// Date: 2025-08-13
// Description: This script retrieves client data based on the provided criteria and populates the fields accordingly.
// ******************************************************************************************

// Build ClientcriteriaCA dynamically: only add filter if the field has a value
var ClientcriteriaCA = {
    "Client_Status": "Active",
    "Client_Full_Name": fields["Client_Name"] ? fields["Client_Name"].value : "",
};

var ClientfieldsArrayCA = [
    "Gender",
    "Phone_Number",
    "Client_Full_Name",
    "ID"
];

var ClientsvctypeCA = "SVC_TYPE_2";
var ClientListg = [];

function processClientdata(response) {
    if (!response || response.length === 0) {
        console.log("No valid Client data received.");
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total Client records received:", response.length);

    ClientListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < ClientfieldsArrayCA.length; j++) {
            var key = ClientfieldsArrayCA[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key] && typeof fieldsObj[key].value !== "undefined" ? fieldsObj[key].value : "";
            }

            fieldValues[key] = value;
        }

        ClientListg.push(fieldValues);
    }

    console.log("ClientListg:", ClientListg);
}

// Call the function
app_lib.getTxnUsingIncFields(ClientcriteriaCA, ClientfieldsArrayCA, processClientdata, null, ClientsvctypeCA);

if (ClientListg.length > 0) {
    fields["Clients_Gender"].value = ClientListg[0].Gender || "";
    fields["Client_Phone_Number"].value = ClientListg[0].Phone_Number || "";
    fields["Schedule_Master_Id"].value = ClientListg[0].ID || "";
} else {
    fields["Clients_Gender"].value = "";
    fields["Client_Phone_Number"].value = "";
    fields["Schedule_Master_Id"].value = "";
}