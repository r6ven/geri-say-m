/* Bound Apps Script: private Sheets storage, signed server requests only. */
const DEVICE_HEADERS = ["device_id", "person", "label", "invite_hash", "invite_expires", "device_hash", "created_at", "last_seen", "revoked"];
const DEVICE_SLOTS = [
  ["ridvan-phone", "ridvan", "Telefon"], ["ridvan-laptop", "ridvan", "Laptop"],
  ["seyda-phone", "seyda", "Telefon"], ["seyda-laptop", "seyda", "Laptop"]
];

function setupDeviceStorage() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("DEVICE_STORAGE_SECRET");
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty("DEVICE_STORAGE_SECRET", secret);
  }
  props.setProperty("DEVICE_SPREADSHEET_ID", book.getId());
  let sheet = book.getSheetByName("Cihazlar");
  if (!sheet) sheet = book.insertSheet("Cihazlar");
  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, DEVICE_HEADERS.length).setValues([DEVICE_HEADERS]);
    sheet.getRange(2, 1, 4, DEVICE_HEADERS.length).setValues(DEVICE_SLOTS.map(slot => [...slot, "", "", "", "", "", false]));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, DEVICE_HEADERS.length).setFontWeight("bold");
    sheet.autoResizeColumns(1, DEVICE_HEADERS.length);
  } else { validateDeviceSheet_(sheet); }
  SpreadsheetApp.flush();
  // Show only to the owner in the UI; do not write the secret into cells or logs.
  SpreadsheetApp.getUi().alert("Render bağlantı anahtarı", "Render > geri-sayim > Environment bölümünde DEVICE_STORAGE_SECRET değeri olarak aşağıdaki anahtarı kaydet. Anahtarı sohbete veya GitHub'a gönderme.\n\n" + secret, SpreadsheetApp.getUi().ButtonSet.OK);
}

function hex_(bytes) { return bytes.map(b => (b & 255).toString(16).padStart(2, "0")).join(""); }
function constantEqual_(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
function validateDeviceSheet_(sheet) {
  const header = sheet.getRange(1, 1, 1, DEVICE_HEADERS.length).getValues()[0];
  if (header.join("|") !== DEVICE_HEADERS.join("|") || sheet.getLastRow() !== 5) throw new Error("Schema mismatch");
  const rows = sheet.getRange(2, 1, 4, DEVICE_HEADERS.length).getValues();
  rows.forEach((row, i) => {
    if (row.slice(0, 3).join("|") !== DEVICE_SLOTS[i].join("|")) throw new Error("Slot mismatch");
  });
  return rows;
}
function output_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  let lock;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 1000000) return output_({error: "invalid_request"});
    const envelope = JSON.parse(raw);
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty("DEVICE_STORAGE_SECRET");
    if (!secret || typeof envelope.payload !== "string") return output_({error: "storage_unavailable"});
    const signature = hex_(Utilities.computeHmacSha256Signature(envelope.payload, secret, Utilities.Charset.UTF_8));
    if (!constantEqual_(signature, envelope.signature)) return output_({error: "unauthorized"});
    const message = JSON.parse(envelope.payload);
    const now = Date.now();
    if (!Number.isInteger(message.timestamp) || Math.abs(now / 1000 - message.timestamp) > 300 || !/^[A-Za-z0-9_-]{32}$/.test(message.nonce || "")) return output_({error: "unauthorized"});
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    const cache = CacheService.getScriptCache();
    if (cache.get("nonce:" + message.nonce)) return output_({error: "unauthorized"});
    cache.put("nonce:" + message.nonce, "used", 600);
    const sheet = SpreadsheetApp.openById(props.getProperty("DEVICE_SPREADSHEET_ID")).getSheetByName("Cihazlar");
    if (!sheet) throw new Error("Missing sheet");
    const rows = validateDeviceSheet_(sheet);
    if (typeof message.action === "string" && message.action.startsWith("messages_")) return output_(handleMessages_(message, rows, now));
    const result = handleDeviceAction_(message, rows, now);
    if (result.row !== undefined) {
      sheet.getRange(result.row + 2, 1, 1, DEVICE_HEADERS.length).setValues([rows[result.row]]);
      SpreadsheetApp.flush();
    }
    return output_(result.data);
  } catch (_) { return output_({error: "storage_unavailable"}); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function handleDeviceAction_(message, rows, now) {
  const hashPattern = /^[a-f0-9]{64}$/;
  const stamp = new Date(now).toISOString();
  if (message.action === "create_invite") {
    const index = rows.findIndex(row => row[0] === message.device_id);
    if (index < 0 || !hashPattern.test(message.invite_hash || "") || !Number.isFinite(message.expires) || message.expires <= now || message.expires > now + 72 * 3600000) return {data: {error: "invalid_request"}};
    // An active slot is never overwritten without the owner first revoking it.
    if (rows[index][5] && rows[index][8] !== true) return {data: {error: "already_registered"}};
    rows[index][3] = message.invite_hash;
    rows[index][4] = new Date(message.expires).toISOString();
    return {row: index, data: {created: true, device_id: rows[index][0], expires: rows[index][4]}};
  }
  if (message.action === "claim") {
    if (!hashPattern.test(message.invite_hash || "") || !hashPattern.test(message.device_hash || "")) return {data: {error: "invalid_invite"}};
    const index = rows.findIndex(row => row[3] && constantEqual_(row[3], message.invite_hash));
    if (index < 0 || !(Date.parse(rows[index][4]) > now)) return {data: {error: "invalid_invite"}};
    if (rows[index][5] && rows[index][8] !== true) return {data: {error: "already_registered"}};
    rows[index][3] = "";
    rows[index][4] = "";
    rows[index][5] = message.device_hash;
    rows[index][6] = stamp;
    rows[index][7] = stamp;
    rows[index][8] = false;
    return {row: index, data: {device_id: rows[index][0], name: rows[index][1] === "ridvan" ? "Rıdvan" : "Şeyda", label: rows[index][2]}};
  }
  if (message.action === "recognize") {
    if (!hashPattern.test(message.device_hash || "")) return {data: {recognized: false}};
    const index = rows.findIndex(row => row[5] && constantEqual_(row[5], message.device_hash) && row[8] === false);
    if (index < 0) return {data: {recognized: false}};
    const data = {recognized: true, device_id: rows[index][0], person: rows[index][1], label: rows[index][2]};
    if (now - Date.parse(rows[index][7]) >= 300000) {
      rows[index][7] = stamp;
      return {row: index, data};
    }
    return {data};
  }
  return {data: {error: "invalid_request"}};
}
