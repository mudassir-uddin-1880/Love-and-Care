var scheduledateCriteriaCA = {
    "fieldName": "Schedule_Start_Date",
    "fromDate": fields["Start_Date"].value,
    "toDate": fields["End_Date"].value
};

var schedulecriteriaCA = {
    "Record_Status": "Active",
    "Scheduling_Status": "Completed",
};

var schedulefieldsArrayCA = [
    "Client_Name",
    "Expected_Caregiver",
    "Actual_Caregiver",
    "Day",
    "Schedule_Start_Date",
    "Schedule_Start_Time",
    "Schedule_End_Time",
    "Scheduling_Status",
    "Expected_Hours",
    "Actual_Hours",
    "CheckIn_Time",
    "Geofence_Status"
];

var schedulesvctypeCA = "SVC_TYPE_3";
var scheduleListg = [];

// Calculate overall Location Accuracy (for field value)
function calculateLocationAccuracy() {
    var totalEvents = 0;
    var eventsWithinRadius = 0;

    for (var i = 0; i < scheduleListg.length; i++) {
        var record = scheduleListg[i];

        // Only count events where Geofence_Status exists and is not "Cannot Calculate"
        if (record.Geofence_Status &&
            record.Geofence_Status !== "" &&
            record.Geofence_Status !== "Cannot Calculate") {
            totalEvents++;

            if (record.Geofence_Status === "Inside") {
                eventsWithinRadius++;
                console.log("Inside: " + record.Client_Name + " - Geofence Status: " + record.Geofence_Status);
            } else {
                console.log("Outside: " + record.Client_Name + " - Geofence Status: " + record.Geofence_Status);
            }
        }
    }

    console.log("\n=== Overall Location Accuracy Summary ===");
    console.log("Total events with geofence data:", totalEvents);
    console.log("Events within radius (Inside):", eventsWithinRadius);
    console.log("Events outside radius:", (totalEvents - eventsWithinRadius));

    // Calculate percentage
    var locationAccuracyPercentage = totalEvents > 0 ? (eventsWithinRadius / totalEvents) * 100 : 0;
    fields["Geofence_Compliance_Rate"].value = locationAccuracyPercentage.toFixed(2);
    console.log("Location Accuracy percentage:", locationAccuracyPercentage.toFixed(2) + "%");

    // Calculate Pending_Geofence_Compliance_Score as 100 - Location_Accuracy (always positive)
    var pendingLocationScore = Math.abs(100 - parseFloat(locationAccuracyPercentage.toFixed(2)));
    fields["Pending_Geofence_Compliance_Score"].value = pendingLocationScore.toFixed(2);
    console.log("Pending_Geofence_Compliance_Score (100 - Rate): " + pendingLocationScore.toFixed(2) + "%");

    return {
        totalEvents: totalEvents,
        eventsWithinRadius: eventsWithinRadius,
        locationAccuracyPercentage: locationAccuracyPercentage
    };
}

// Categorize all events by Geofence_Status
function categorizeGeofenceStatus() {
    var statusCounts = {
        "Inside": 0,
        "Outside": 0,
        "Cannot Calculate": 0
    };

    for (var i = 0; i < scheduleListg.length; i++) {
        var record = scheduleListg[i];
        var geofenceStatus = record.Geofence_Status;

        if (!geofenceStatus || geofenceStatus === "" || geofenceStatus === "Cannot Calculate") {
            // No geofence data available or explicitly marked as "Cannot Calculate"
            statusCounts["Cannot Calculate"]++;
        } else if (geofenceStatus === "Inside") {
            statusCounts["Inside"]++;
        } else {
            // Any other value is considered Outside
            statusCounts["Outside"]++;
        }
    }

    console.log("\n=== Geofence Status Categorization ===");
    console.log("Inside:", statusCounts["Inside"]);
    console.log("Outside:", statusCounts["Outside"]);
    console.log("Cannot Calculate:", statusCounts["Cannot Calculate"]);

    // Create array for table insertion
    var geofenceArray = [
        {
            Type: "Inside",
            Total: statusCounts["Inside"]
        },
        {
            Type: "Outside",
            Total: statusCounts["Outside"]
        },
        {
            Type: "Cannot Calculate",
            Total: statusCounts["Cannot Calculate"]
        }
    ];

    return geofenceArray;
}

// Function to add geofence data to table
function addGeofenceDataToTable(geofenceArray) {
    // Remove existing rows from the table
    app_lib.removeRows("Geofence_Compliance");

    var addRowsArray = [];

    for (var idx = 0; idx < geofenceArray.length; idx++) {
        addRowsArray.push({
            "fields": {
                "Type": {
                    "value": geofenceArray[idx].Type
                },
                "Total": {
                    "value": geofenceArray[idx].Total
                }
            }
        });
    }

    // Add rows to the table
    if (addRowsArray.length > 0) {
        app_lib.addRows("Geofence_Compliance", addRowsArray, true);
        console.log("\n=== Successfully added " + addRowsArray.length + " geofence records to table ===");
    } else {
        console.log("\n=== No geofence data to add to table ===");
    }
}

// Update the processscheduledata function to call the calculation
function processscheduledata(response) {
    if (!response || response.length === 0) {
        console.log("No valid schedule data received.");
        return;
    }

    if (!Array.isArray(response)) {
        response = [response];
    }

    console.log("Total schedule records received:", response.length);

    scheduleListg = [];

    for (var i = 0; i < response.length; i++) {
        var record = response[i];
        var fieldValues = {};
        var fieldsObj = record.fields || {};

        for (var j = 0; j < schedulefieldsArrayCA.length; j++) {
            var key = schedulefieldsArrayCA[j];
            var value = "";

            if (fieldsObj[key] && typeof fieldsObj[key].value !== "undefined") {
                value = fieldsObj[key] && typeof fieldsObj[key].value !== "undefined" ? fieldsObj[key].value : "";
            }

            fieldValues[key] = value;
        }

        scheduleListg.push(fieldValues);
    }

    console.log("scheduleListg:", scheduleListg);

    // Calculate Location Accuracy and set field values
    var locationMetrics = calculateLocationAccuracy();

    // Categorize events by Geofence_Status
    var geofenceData = categorizeGeofenceStatus();

    // Add the geofence data to the table
    addGeofenceDataToTable(geofenceData);
}

// Call the function
app_lib.getTxnUsingIncFields(schedulecriteriaCA, schedulefieldsArrayCA, processscheduledata, scheduledateCriteriaCA, schedulesvctypeCA);