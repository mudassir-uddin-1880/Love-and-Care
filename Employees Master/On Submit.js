if (fields["Alternate_Email"] && fields["Alternate_Email"].value &&
    fields["Email"] && fields["Email"].value &&
    fields["Alternate_Email"].value === fields["Email"].value) {
    return "Alternate Email cannot be same as Email";
}

if (
    fields["Employment_Type"] &&
    fields["Employment_Type"].value == "Caregiver"
) {
    if (fields["Availability_Type"] && fields["Availability_Type"].value == "") {
        return "Please select Availability Type";
    }
    if (fields["Caregiver_Phone_Number"] && fields["Caregiver_Phone_Number"].value == null || fields["Caregiver_Phone_Number"].value == "") {
        var Warn3 = "Please Enter Caregiver Phone Number";
        return Warn3;
    }
    if (fields["Private"] && fields["Private"].value == null || fields["Private"].value == "") {
        var Warn8 = "Please Enter Private";
        return Warn8;
    }
    if (fields["Facility"] && fields["Facility"].value == null || fields["Facility"].value == "") {
        var Warn8 = "Please Enter Facility";
        return Warn8;
    }
    if (fields["Availability_Type"] && fields["Availability_Type"].value == null || fields["Availability_Type"].value == "") {
        var Warn8 = "Please Enter Availability Type";
        return Warn8;
    }
    if (fields["Weight_Class"] && fields["Weight_Class"].value == null || fields["Weight_Class"].value == "") {
        var Warn8 = "Please Enter Weight _Class";
        return Warn8;
    }
    if (fields["Max_Weekly_Hours"] && fields["Max_Weekly_Hours"].value == 0 || fields["Max_Weekly_Hours"].value < 0) {
        return "Max Weekly Hours cannot be zero";
    }
    if (fields["Target_Weekly_Hours"] && fields["Target_Weekly_Hours"].value == 0 || fields["Target_Weekly_Hours"].value < 0) {
        return "Target Weekly Hours cannot be zero";
    }
    if (fields["Max_Weekly_Hours"] && fields["Max_Weekly_Hours"].value < fields["Target_Weekly_Hours"].value) {
        return "Max Weekly Hours cannot be less than Target Weekly Hours";
    }
    if (fields["Private"] && fields["Private"].value == "") {
        return "Please select Private as Yes or No";
    }
    if (fields["Facility"] && fields["Facility"].value == "") {
        return "Please select Facility as Yes or No";
    }
    if (fields["Driver_License_"] && fields["Driver_License_"].value == "") {
        return "Please select Driver License as Yes or No";
    }
    if (fields["LastMinute_Ready_Ghost_Pool_"] && fields["LastMinute_Ready_Ghost_Pool_"].value == "") {
        return "Please select Last-Minute Ready (Ghost Pool)? as Yes or No";
    }


}
(function () {
    var nameKeys = ["First_Name", "Middle_Name", "Last_Name"];
    var parts = nameKeys
        .map(function (k) {
            var v = (fields[k] && fields[k].value != null) ? String(fields[k].value).trim() : "";
            return v;
        })
        .filter(function (s) {
            return s.length > 0 && !/^(null|undefined)$/i.test(s);
        });

    if (fields["Employee_Full_Name"]) {
        fields["Employee_Full_Name"].value = parts.join(" ");
    }
})();

if (app_lib.txnId() == null && fields["Created_By"]) {
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



app_lib.hideField([
    "Preferred_Name",
    "Availability_Type",
    "Availability_Details",
    "Transfer_Capability",
    "MONDAY_AM",
    "MONDAY_PM",
    "MONDAY_NOC",
    "TUESDAY_AM",
    "TUESDAY_PM",
    "TUESDAY_NOC",
    "WEDNESDAY_AM",
    "WEDNESDAY_PM",
    "WEDNESDAY_NOC",
    "THURSDAY_AM",
    "THURSDAY_PM",
    "THURSDAY_NOC",
    "FRIDAY_AM",
    "FRIDAY_PM",
    "FRIDAY_NOC",
    "SATURDAY_AM",
    "SATURDAY_PM",
    "SATURDAY_NOC",
    "SUNDAY_AM",
    "SUNDAY_PM",
    "SUNDAY_NOC",
    "Weight_Class",
    "Lift_Capacity_Class",
    "Exclusion_Never_Client_IDs",
    "Exclusion_Avoid_Client_IDs",
    "Max_Weekly_Hours",
    "Target_Weekly_Hours",
    "Driver_License_",
    "Has_Car_",
    "Timezone",
    "Time",
    "LastMinute_Ready_Ghost_Pool_",
    "Reliability_Score_0100",
    "Personality_Match",
    "Physical_Capability_lbs",
    "System_Information",
    "Created_By",
    "Last_Modified_By",
    "Last_Modified_At_Location",
    "Physical_Capability_lbs",
    "Personality_Match",
    "Location",
    "Employee_Details",
    "Caregiver_Details",
    "Profile_Picture",
    "First_Name",
    "Middle_Name",
    "Last_Name",
    "Gender",
    "Email",
    "Role",
    "Address",
    "Caregiver_Agreement_Details",
    "Facility",
    "Private",
    "Shift_Details",
    "Additional_Shifts",
    "Max_Hours",
    "Min_Hours",
    "Personal_Information",
    "Office",
    "SSN",
    "Salutation",
    "User_Name",
    "Alternate_Email",
    "Date_of_Birth",
    "Marital_status",
    "Race",
    "Suffix",
    "Caregiver_Type",
    "State_ID",
    "Caregiver_License_Number",
    "Caregiver_Medicaid_ID",
    "Hire_Date",
    "WOTC_Status",
    "Address_Information",
    "Alternate_Address",
    "ZipPostal_Code",
    "City",
    "State",
    "Country",
    "Contact_Details",
    "Primary",
    "Time_Tracking",
    "Phone_Type",
    "Caregiver_Phone_Number",
    "Notes",
    "Emergency_Contact",
    "Full_Name",
    "Email_Address",
    "Relation",
    "Mobile_Number",
    "Note",
    "Referral_Sources",
    "Referred_By",
    "Referral_Date",
    "Referral_Notes",
    "Summary_Notes",
    "Skills_Experience",
    "Date_of_Hire",
    "Experience",
    "Skill_Type",
    "Availability",
    "Cooking_Skills",
    "General",
    "Language",
    "Level_of_Ability",
    "Personal_Care",
    "Pets",
    "Transportation",
    "Vehicle_Type",
    "Pet_Restriction",
    "Smoking_Restriction",
    "Additional_Information",
    "Caregiver_Preferences",
    "Exempt_From_Holiday_Pay_Calculation",
    "Distance_Willing_to_Travel",
    "Miscellaneous_Details",
    "Medical_Information"
]);


if (fields["Employment_Type"].value == "Employee") {
    app_lib.showField([
        "Employee_Details",
        "Profile_Picture",
        "First_Name",
        "Middle_Name",
        "Last_Name",
        "Gender",
        "Email",
        "Role",
        "Address",
        "System_Information",
        "Created_By",
        "Last_Modified_By",
        "Last_Modified_At_Location",
        "User_Name"
    ]);
}

if (fields["Employment_Type"].value == "Caregiver") {
    app_lib.showField([
        "Availability_Type",
        "Preferred_Name",
        "Transfer_Capability",
        "Weight_Class",
        "Lift_Capacity_Class",
        "Exclusion_Never_Client_IDs",
        "Exclusion_Avoid_Client_IDs",
        "Max_Weekly_Hours",
        "Target_Weekly_Hours",
        "Driver_License_",
        "Has_Car_",
        "Timezone",
        "Time",
        "LastMinute_Ready_Ghost_Pool_",
        "Reliability_Score_0100",
        "Personality_Match",
        "Physical_Capability_lbs",
        "System_Information",
        "Created_By",
        "Last_Modified_By",
        "Last_Modified_At_Location",
        "Physical_Capability_lbs",
        "Personality_Match",
        "Location",
        "Caregiver_Details",
        "Profile_Picture",
        "First_Name",
        "Middle_Name",
        "Last_Name",
        "Gender",
        "Email",
        "Role",
        "Address",
        "Caregiver_Agreement_Details",
        "Facility",
        "Private",
        "Additional_Shifts",
        "Max_Hours",
        "Min_Hours",
        "Personal_Information",
        "Office",
        "SSN",
        "Salutation",
        "User_Name",
        "Alternate_Email",
        "Date_of_Birth",
        "Marital_status",
        "Race",
        "Suffix",
        "Caregiver_Type",
        "State_ID",
        "Caregiver_License_Number",
        "Caregiver_Medicaid_ID",
        "Hire_Date",
        "WOTC_Status",
        "Address_Information",
        "Alternate_Address",
        "ZipPostal_Code",
        "City",
        "State",
        "Country",
        "Contact_Details",
        "Primary",
        "Time_Tracking",
        "Phone_Type",
        "Caregiver_Phone_Number",
        "Notes",
        "Emergency_Contact",
        "Full_Name",
        "Email_Address",
        "Relation",
        "Mobile_Number",
        "Note",
        "Referral_Sources",
        "Referred_By",
        "Referral_Date",
        "Referral_Notes",
        "Summary_Notes",
        "Skills_Experience",
        "Date_of_Hire",
        "Experience",
        "Skill_Type",
        "Availability",
        "Cooking_Skills",
        "General",
        "Language",
        "Level_of_Ability",
        "Personal_Care",
        "Pets",
        "Transportation",
        "Vehicle_Type",
        "Pet_Restriction",
        "Smoking_Restriction",
        "Additional_Information",
        "Caregiver_Preferences",
        "Exempt_From_Holiday_Pay_Calculation",
        "Distance_Willing_to_Travel",
        "Miscellaneous_Details",
        "Medical_Information"
    ]);
}

if (fields["Employment_Type"].value == "Caregiver" && fields["Availability_Type"].value == "AM, PM, NOC") {
    app_lib.showField([
        "Shift_Details",
        "MONDAY_AM",
        "MONDAY_PM",
        "MONDAY_NOC",
        "TUESDAY_AM",
        "TUESDAY_PM",
        "TUESDAY_NOC",
        "WEDNESDAY_AM",
        "WEDNESDAY_PM",
        "WEDNESDAY_NOC",
        "THURSDAY_AM",
        "THURSDAY_PM",
        "THURSDAY_NOC",
        "FRIDAY_AM",
        "FRIDAY_PM",
        "FRIDAY_NOC",
        "SATURDAY_AM",
        "SATURDAY_PM",
        "SATURDAY_NOC",
        "SUNDAY_AM",
        "SUNDAY_PM",
        "SUNDAY_NOC",
    ]);
}

if (fields["Employment_Type"].value == "Caregiver" && fields["Availability_Type"].value == "Custom Time") {
    app_lib.showField([
        "Shift_Details",
        "Availability_Details",
    ]);
}



var rows = app_lib.getRows("Availability_Details");

// Validate time format for Schedule_Start_Time and Schedule_End_Time in rows
function isValidTimeFormat(timeStr) {
    if (!timeStr || timeStr.trim() === "") return true; // Allow empty values
    // Check for HH:MM or HH:MM:SS format (24-hour)
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;
    return timeRegex.test(timeStr.trim());
}

// Function to check for duplicate schedule entries
function checkDuplicateSchedules(rows) {
    const scheduleMap = new Map();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1;

        if (!row.fields) continue;

        const day = row.fields.Day ? row.fields.Day.value : "";
        const startTime = row.fields.Schedule_Start_Time ? row.fields.Schedule_Start_Time.value : "";
        const endTime = row.fields.Schedule_End_Time ? row.fields.Schedule_End_Time.value : "";

        // Skip rows with empty values
        if (!day || !startTime || !endTime ||
            day.trim() === "" || startTime.trim() === "" || endTime.trim() === "") {
            continue;
        }

        // Create a unique key combining day, start time, and end time
        const scheduleKey = `${day.trim()}|${startTime.trim()}|${endTime.trim()}`;

        console.log(`Row ${rowNumber}: Checking schedule key: ${scheduleKey}`);

        if (scheduleMap.has(scheduleKey)) {
            const previousRowNumber = scheduleMap.get(scheduleKey);
            const errorMessage = `Duplicate schedule found: Row ${rowNumber} has the same Day (${day}), Start Time (${startTime}), and End Time (${endTime}) as Row ${previousRowNumber}`;
            console.log("❌ " + errorMessage);
            return errorMessage;
        }

        scheduleMap.set(scheduleKey, rowNumber);
    }

    console.log("✅ No duplicate schedules found");
    return null; // No duplicates found
}

// Check time format in all rows
for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;

    if (row.fields && row.fields.Schedule_Start_Time) {
        const startTime = row.fields.Schedule_Start_Time.value;
        if (!isValidTimeFormat(startTime)) {
            return `Enter valid data in row ${rowNumber} Schedule Start Time cell`;
        }
    }

    if (row.fields && row.fields.Schedule_End_Time) {
        const endTime = row.fields.Schedule_End_Time.value;
        if (!isValidTimeFormat(endTime)) {
            return `Enter valid data in row ${rowNumber} Schedule End Time cell`;
        }
    }
}

// Check for duplicate schedules
const duplicateError = checkDuplicateSchedules(rows);
if (duplicateError) {
    return duplicateError;
}