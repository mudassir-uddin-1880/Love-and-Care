var schedulingMasterData = input.recordId;

var fields = schedulingMasterData.fields;

var caregiverAvailability = {};
caregiverAvailability.primaryAvailable = (fields["Primary_Caregiver"] && fields["Primary_Caregiver"].value && fields["Primary_Caregiver"].value.trim() !== "") ? "Yes" : "No";
caregiverAvailability.secondaryAvailable = (fields["Secondary_Caregiver"] && fields["Secondary_Caregiver"].value && fields["Secondary_Caregiver"].value.trim() !== "") ? "Yes" : "No";
caregiverAvailability.tertiaryAvailable = (fields["Tertiary_Caregiver"] && fields["Tertiary_Caregiver"].value && fields["Tertiary_Caregiver"].value.trim() !== "") ? "Yes" : "No";

return caregiverAvailability;