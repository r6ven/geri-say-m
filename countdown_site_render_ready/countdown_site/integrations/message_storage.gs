/* Paste alongside device_storage.gs in the same PRIVATE bound project. */
const MESSAGE_HEADERS = ["id", "sender", "recipient", "created_at", "text_json", "mime", "read_at", "client_id"];
function messageSheet_(book, name, header) {
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.setFrozenRows(1);
  }
  if (sheet.getRange(1, 1, 1, header.length).getValues()[0].join("|") !== header.join("|")) throw new Error("Message schema mismatch");
  return sheet;
}
function handleMessages_(message, devices, now) {
  const device = devices.find(row => row[5] && constantEqual_(row[5], message.device_hash) && row[8] === false);
  if (!device || !/^[a-f0-9]{64}$/.test(message.device_hash || "")) return {error:"unrecognized"};
  const person = device[1], other = person === "ridvan" ? "seyda" : "ridvan";
  const book = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("DEVICE_SPREADSHEET_ID"));
  const sheet = messageSheet_(book, "Mesajlar", MESSAGE_HEADERS);
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow()-1, MESSAGE_HEADERS.length).getValues() : [];
  const visible = row => [row[1], row[2]].includes(person);
  const uuid = /^[a-f0-9-]{36}$/;
  if (message.action === "messages_list") {
    const selected = rows.filter(visible);
    return {person, unread:selected.filter(r => r[2] === person && !r[6]).length,
      messages:selected.slice(-100).map(r => ({id:r[0],sender:r[1],recipient:r[2],created_at:r[3],text:JSON.parse(r[4]),mime:r[5],read_at:r[6]}))};
  }
  if (message.action === "messages_send") {
    if (typeof message.text !== "string" || message.text.length > 2000 || !uuid.test(message.client_id || "") || typeof message.media !== "string" || message.media.length > 699052 || !/^[A-Za-z0-9+/]*={0,2}$/.test(message.media) || !["", "image/png", "image/jpeg", "image/gif", "image/webp"].includes(message.mime) || (!message.text.trim() && !message.media) || Boolean(message.media) !== Boolean(message.mime)) return {error:"invalid_request"};
    const duplicate = rows.find(r => r[1] === person && r[7] === message.client_id);
    if (duplicate) return {sent:true,id:duplicate[0]};
    if (rows.length >= 1000) return {error:"storage_full"};
    const id = Utilities.getUuid();
    if (message.media) {
      const parts = messageSheet_(book, "MesajGorselleri", ["message_id", "part", "base64_json"]);
      const chunks = [];
      for (let i=0; i<message.media.length; i+=30000) chunks.push([id, i/30000, JSON.stringify(message.media.slice(i,i+30000))]);
      parts.getRange(parts.getLastRow()+1,1,chunks.length,3).setValues(chunks);
    }
    // JSON text starts with a quote, preventing spreadsheet formula injection.
    sheet.getRange(sheet.getLastRow()+1,1,1,8).setValues([[id,person,other,new Date(now).toISOString(),JSON.stringify(message.text),message.mime,"",message.client_id]]);
    SpreadsheetApp.flush();
    return {sent:true,id};
  }
  if (message.action === "messages_read") {
    if (!Array.isArray(message.ids) || message.ids.length > 100 || message.ids.some(id => !uuid.test(id))) return {error:"invalid_request"};
    rows.forEach((r,i) => { if (r[2] === person && !r[6] && message.ids.includes(r[0])) sheet.getRange(i+2,7).setValue(new Date(now).toISOString()); });
    SpreadsheetApp.flush(); return {read:true};
  }
  if (message.action === "messages_media") {
    const row = rows.find(r => r[0] === message.message_id && visible(r) && r[5]);
    if (!row) return {error:"not_found"};
    const parts = book.getSheetByName("MesajGorselleri");
    if (!parts || parts.getLastRow()<2) return {error:"not_found"};
    const chunks = parts.getRange(2,1,parts.getLastRow()-1,3).getValues().filter(r => r[0] === row[0]).sort((a,b) => a[1]-b[1]);
    return {mime:row[5],media:chunks.map(r=>JSON.parse(r[2])).join("")};
  }
  return {error:"invalid_request"};
}

// Owner-only editor check: no test messages are sent and no content is logged.
function verifyPrivateMessageStorage() {
  const props = PropertiesService.getScriptProperties();
  const book = SpreadsheetApp.openById(props.getProperty("DEVICE_SPREADSHEET_ID"));
  messageSheet_(book, "Mesajlar", MESSAGE_HEADERS);
  messageSheet_(book, "MesajGorselleri", ["message_id", "part", "base64_json"]);
  const rows = validateDeviceSheet_(book.getSheetByName("Cihazlar"));
  const registered = rows.filter(row => row[5] && row[8] === false);
  const cases = registered.map(row => ({action:"messages_list", device_hash:row[5], person:row[1]}));
  cases.push({action:"messages_list", device_hash:"0".repeat(64), error:"unrecognized"});
  cases.forEach(test => {
    const payload = JSON.stringify({action:test.action, device_hash:test.device_hash, timestamp:Math.floor(Date.now()/1000), nonce:Utilities.getUuid().replace(/-/g, "")});
    const signature = hex_(Utilities.computeHmacSha256Signature(payload, props.getProperty("DEVICE_STORAGE_SECRET"), Utilities.Charset.UTF_8));
    const result = JSON.parse(doPost({postData:{contents:JSON.stringify({payload,signature})}}).getContent());
    if (test.person ? result.person !== test.person : result.error !== test.error) throw new Error("Private message authorization check failed");
  });
  SpreadsheetApp.flush();
  console.log("Private message storage and device authorization checks passed. No messages were sent.");
}
