if (app_lib.txnId() == null) {
    var currentDateTime = moment().format('YYYY-MM-DD');
    if (fields["Created_By_Date"]) {
        var date = currentDateTime;
        fields["Created_By_Date"].value = date;
    }
}

// Search criteria for Employees
var EmployeeCriteriaCA = {
    "Employee_Status": "Active",
    "Role": "Care Coordinator" // Only Care Coordinator role
};

var EmployeeFieldsArrayCA = [
    "Role",
    "Employee_Full_Name"
];

var EmployeeSvcTypeCA = "SVC_TYPE_1";

// Global variable to store employees
var EmployeeListg = [];

function processEmployeeData(response) {
    if (!response || response.length === 0) {
        fields["Care_Coordinator"].options = [];
        fields["Care_Coordinator"].value = "";
        return "";
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    EmployeeListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldsObj = record.fields || {};

        var role = (fieldsObj["Role"] && fieldsObj["Role"].value) ? fieldsObj["Role"].value : "";
        var name = (fieldsObj["Employee_Full_Name"] && fieldsObj["Employee_Full_Name"].value) ? fieldsObj["Employee_Full_Name"].value : "";

        var roleStr = String(role || "");

        if (roleStr.split(",").includes("Care Coordinator")) {
            EmployeeListg.push({
                Role: roleStr,
                Employee_Full_Name: name
            });
        }

    }

    var optionsArray = EmployeeListg.map(function (emp) {
        return emp.Employee_Full_Name;
    });


    fields["Care_Coordinator"].options = optionsArray;
    fields["Care_Coordinator"].value = "";
    // ✅ Final log to confirm assigned options
    console.log("✅ Care_Coordinator field options assigned:", optionsArray);
}

// Call the function
app_lib.getTxnUsingIncFields(EmployeeCriteriaCA, EmployeeFieldsArrayCA, processEmployeeData, null, EmployeeSvcTypeCA);

var options = {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
};

var laTime = new Date().toLocaleString("en-US", options);

// Set to your field
fields["Time"].value = laTime;