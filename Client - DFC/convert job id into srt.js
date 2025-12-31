var jobcvodedata = input.cleintCreated;
var jobcodeid = "";
if (
    jobcvodedata &&
    jobcvodedata.results &&
    jobcvodedata.results.jobcodes
) {
    var jobcodes = jobcvodedata.results.jobcodes;
    var keys = Object.keys(jobcodes);
    if (keys.length > 0 && jobcodes[keys[0]].id !== undefined) {
        jobcodeid = String(jobcodes[keys[0]].id);
    }
}
return jobcodeid;