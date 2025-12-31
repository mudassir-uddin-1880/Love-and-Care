var settingsData = input.settingsApp;
var refereshToken = ""

// Extract Open_AI_URL from settingsData and assign to refereshToken
if (Array.isArray(settingsData)) {
    for (var i = 0; i < settingsData.length; i++) {
        var item = settingsData[i];
        if (item && item.fields && item.fields.Open_AI_URL && item.fields.Open_AI_URL.value) {
            refereshToken = item.fields.Open_AI_URL.value;
            break;
        }
    }
}

function encodeBase64(input) {
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;

    input = String(input);

    while (i < input.length) {
        chr1 = input.charCodeAt(i++);
        chr2 = input.charCodeAt(i++);
        chr3 = input.charCodeAt(i++);

        enc1 = chr1 >> 2;
        enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        enc4 = chr3 & 63;

        if (isNaN(chr2)) {
            enc3 = 64;
            enc4 = 64;
        } else if (isNaN(chr3)) {
            enc4 = 64;
        }

        output = output +
            keyStr.charAt(enc1) +
            keyStr.charAt(enc2) +
            keyStr.charAt(enc3) +
            keyStr.charAt(enc4);
    }

    return output;
}

var clientId = "ABQz9ZWYKt14GwXJ1Cv2bVKo0gzao65vL4385OnCiT51kipRi8";
var clientSecret = "bVWPFPw7K1RR2InlWKY8Kn75KuNiAFzn58gyCUz2";
var raw = clientId + ":" + clientSecret;
var encoded = encodeBase64(raw);

var authHeader = encoded;
var refereshtoekn = "RT1-19-H0-1773297053yrdhbx7ju8xhnbd0w442";
var refresh_token = "refresh_token";
// add authHeader and refereshtoekn
return {
    "Authorization": authHeader,
    "Refereshtoekn": refereshtoekn,
    "refresh_token": refresh_token,
    "RefereshTokenURL": refereshToken
};