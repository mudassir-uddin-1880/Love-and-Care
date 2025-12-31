var settingsrecords = input.settingsrecords;

var clientIds = "";
if (Array.isArray(settingsrecords)) {
    var ids = [];
    for (var i = 0; i < settingsrecords.length; i++) {
        var item = settingsrecords[i];
        var id = item && item.id;
        if (typeof id === 'string' && id.length > 0) {
            ids.push(id);
        }
    }
    clientIds = ids.join(',');
} else {
    clientIds = '';
}

return clientIds;