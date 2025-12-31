var clientcriteriaCA = {
    "Client_Status": "Active",
    "Client_Full_Name": fields["Client_Name"].value
};

var clientfieldsArrayCA = [
    "Client_Full_Name",
    "JobCode_Id"
];

var clientsvctypeCA = "SVC_TYPE_2";
var clientListg = [];

function processclientdata(response) {
    if (!response || response.length === 0) {
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    clientListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < clientfieldsArrayCA.length; j++) {
            var key = clientfieldsArrayCA[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key].value;
            }

            fieldValues[key] = value;
        }

        clientListg.push(fieldValues);
    }

    console.log("client Data:", clientListg);
    
    // Move this inside the callback after data is processed
    if (clientListg.length > 0 && clientListg[0]["JobCode_Id"]) {
        fields["Client_ID"].value = clientListg[0]["JobCode_Id"];
    }
}

// INITIATE API CALL
app_lib.getTxnUsingIncFields(clientcriteriaCA, clientfieldsArrayCA, processclientdata, null, clientsvctypeCA);