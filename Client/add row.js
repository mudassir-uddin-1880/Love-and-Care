var rows = app_lib.getRows("Schedule_Details");
console.log("Rows fetched:", rows);

console.log(`[Schedule_Details] Scanning ${rows?.length || 0} rows for duplicates (Day + Start Time).`);

function getVal(row, field) {
    return row?.fields?.[field]?.value ?? "";
}
function setVal(row, field, value) {
    if (row?.fields?.[field]) row.fields[field].value = value;
}
function toMinutes(timeStr) {
    if (!timeStr) return null;
    let s = String(timeStr).trim().toUpperCase().replace(/\./g, ":");
    var m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    let min = parseInt(m[2] ?? "0", 10);
    // seconds not needed for key; ignore m[3]
    if (m[4] === "PM" && h < 12) h += 12;
    if (m[4] === "AM" && h === 12) h = 0;
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min; // minutes since midnight
}
function normalizeTimeKey(timeStr) {
    var minutes = toMinutes(timeStr);
    return minutes == null ? null : String(minutes);
}

var makeKey = (r) => `${getVal(r, "Day")}|${normalizeTimeKey(getVal(r, "Schedule_Start_Time"))}`;

var seen = new Map();
let cleared = 0;

for (let i = 0; i < (rows?.length || 0); i++) {
    var r = rows[i];
    var day = getVal(r, "Day");
    var start = getVal(r, "Schedule_Start_Time");
    if (!day || !start) continue;

    var key = makeKey(r);
    if (!key.includes("|null")) {
        if (!seen.has(key)) {
            seen.set(key, r);
            console.debug(`[unique] Row #${r.index ?? r.id ?? i + 1}: Day=${day}, Start=${start}`);
        } else {
            var kept = seen.get(key);
            var end = getVal(r, "Schedule_End_Time");
            app_lib.showWarn(`Duplicate found for ${day} at ${start}. Keeping one entry, clearing duplicates.`);
            // Clear duplicate row fields
            setVal(r, "Day", "");
            setVal(r, "Schedule_Start_Time", "");
            setVal(r, "Schedule_End_Time", "");
            setVal(r, "Expected_Hours", 0); // or "0.00" if your UI expects a string
            cleared++;
        }
    } else {
        console.log(`[skip] Row #${r.index ?? r.id ?? i + 1} has invalid/missing time; skipping duplicate check.`);
    }
}

if (cleared > 0) {
    console.log(`[Schedule_Details] Duplicates removed: ${cleared}. Unique keys kept: ${seen.size}.`);
} else {
    console.log("[Schedule_Details] No duplicates found.");
}

// Optional: log final state for verification
// console.log("Rows after duplicate cleanup:", rows);