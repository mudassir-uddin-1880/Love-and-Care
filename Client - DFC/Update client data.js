var clientsdata = (input && input.returnclientdata) || {};
var fieldsdata = (clientsdata && clientsdata.fields) || {};

var clientname = (fieldsdata.Client_Full_Name && fieldsdata.Client_Full_Name.value) || "";
var JobCode_Id = (fieldsdata.JobCode_Id && fieldsdata.JobCode_Id.value) || "";

// Ensure JobCode_Id is a string
JobCode_Id = parseInt(JobCode_Id);

//console.log("📌 clientname:", clientname);
//console.log("📌 JobCode_Id (string):", JobCode_Id);

return {
    clientname: clientname,
    JobCode_Id: JobCode_Id
};