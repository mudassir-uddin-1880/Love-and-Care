var cleintCreated = input.cleintCreated;

var jobcode = cleintCreated && cleintCreated.results && cleintCreated.results.jobcodes && cleintCreated.results.jobcodes["1"] ? cleintCreated.results.jobcodes["1"] : {};

var now = new Date();
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
var pushDate = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
var pushTime = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
var lastSyncTime = pushDate + 'T' + pushTime + '+00:00';

var connectlog = {
    data: [
        {
            Connection_Type: "QB Time",
            Details: "QuickBooks Summary:\n" +
                "Synced with QB: " + (jobcode.connect_with_quickbooks ? 1 : 0) + "\n" +
                "Not Synced with QB: " + (jobcode.connect_with_quickbooks ? 0 : 1) + "\n" +
                "Push Date: " + pushDate + "\n" +
                "Push Time: " + pushTime + "\n" +
                "Last Sync Time: " + lastSyncTime + "\n" +
                "Mode: Create Record\n" +
                "Clients Involved: 1\n" +
                "Caregivers Involved: 0\n",
            Log_Type: "Third Party",
            Mode_of_Connection: "Create Client",
            lastSyncTime: lastSyncTime,
            mode: "Create Record",
            notSyncedWithQB: jobcode.connect_with_quickbooks ? 0 : 1,
            pushDate: pushDate,
            pushFailed: jobcode.connect_with_quickbooks ? 0 : 1,
            pushSuccess: jobcode.connect_with_quickbooks ? 1 : 0,
            pushTime: pushTime,
            syncedWithQB: jobcode.connect_with_quickbooks ? 1 : 0,
            totalPushed: 1,
            totalSchedules: 0,
        }
    ]
};

return connectlog;