// Execute the actual Apps Script state transitions against isolated row data.
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../integrations/device_storage.gs"), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const now = Date.parse("2026-10-07T09:00:00Z");
const rows = [["ridvan-phone", "ridvan", "Telefon", "", "", "", "", "", false],
  ["ridvan-laptop", "ridvan", "Laptop", "", "", "", "", "", false],
  ["seyda-phone", "seyda", "Telefon", "", "", "", "", "", false],
  ["seyda-laptop", "seyda", "Laptop", "", "", "", "", "", false]];
const invite = "a".repeat(64), device = "b".repeat(64);
const act = (message, clock = now) => sandbox.handleDeviceAction_(message, rows, clock);
assert.equal(act({action:"create_invite", device_id:"seyda-phone", invite_hash:invite, expires:now+3600000}).data.created, true);
assert.equal(act({action:"claim", invite_hash:invite, device_hash:device}).data.name, "Şeyda");
assert.equal(act({action:"claim", invite_hash:invite, device_hash:"c".repeat(64)}).data.error, "invalid_invite");
assert.equal(act({action:"recognize", device_hash:device}).data.person, "seyda");
assert.equal(act({action:"recognize", device_hash:"c".repeat(64)}).data.recognized, false);
assert.equal(act({action:"recognize", device_hash:device}).row, undefined);
assert.equal(act({action:"recognize", device_hash:device}, now+300000).row, 2);
assert.equal(rows[2][7], new Date(now+300000).toISOString());
assert.equal(act({action:"create_invite", device_id:"seyda-phone", invite_hash:invite, expires:now+3600000}).data.error, "already_registered");
rows[2][8] = true;
assert.equal(act({action:"recognize", device_hash:device}).data.recognized, false);
assert.equal(act({action:"create_invite", device_id:"seyda-phone", invite_hash:invite, expires:now+3600000}).data.created, true);
assert.equal(act({action:"claim", invite_hash:invite, device_hash:"d".repeat(64)}, now+3600001).data.error, "invalid_invite");
assert.equal(act({action:"claim", invite_hash:invite, device_hash:"d".repeat(64)}).data.name, "Şeyda");
assert.equal(act({action:"recognize", device_hash:device}).data.recognized, false);
assert.equal(act({action:"recognize", device_hash:"d".repeat(64)}).data.recognized, true);
assert.equal(act({action:"create_invite", device_id:"outsider", invite_hash:invite, expires:now+3600000}).data.error, "invalid_request");
assert.equal(act({action:"read_all"}).data.error, "invalid_request");
console.log("Apps Script: single-use, expiry, owner, revoke, replacement and last-seen checks passed.");
// Exercise authenticated doPost and lock/flush ordering using the real handler.
const crypto = require("node:crypto");
let locked = false, flushes = 0;
const seenNonces = new Map();
const gatewayRows = rows.map(row => [...row]);
gatewayRows[3] = ["seyda-laptop", "seyda", "Laptop", "e".repeat(64), new Date(Date.now()+3600000).toISOString(), "", "", "", false];
const secret = "x".repeat(64);
sandbox.Utilities = {Charset:{UTF_8:"utf8"}, computeHmacSha256Signature:(payload,key) => [...crypto.createHmac("sha256",key).update(payload).digest()]};
sandbox.PropertiesService = {getScriptProperties:() => ({getProperty:key => key === "DEVICE_STORAGE_SECRET" ? secret : "private-sheet"})};
sandbox.LockService = {getScriptLock:() => ({waitLock:() => { assert.equal(locked,false); locked=true; }, hasLock:() => locked, releaseLock:() => {locked=false;}})};
sandbox.CacheService = {getScriptCache:() => ({get:key => seenNonces.get(key), put:(key,value) => seenNonces.set(key,value)})};
sandbox.SpreadsheetApp = {openById:() => ({getSheetByName:() => ({getLastRow:() => 5, getRange:(row,col,count) => ({getValues:() => row === 1 ? [["device_id","person","label","invite_hash","invite_expires","device_hash","created_at","last_seen","revoked"]] : gatewayRows.map(r=>[...r]), setValues:values => {assert.equal(locked,true); gatewayRows[row-2]=[...values[0]];}})})}), flush:() => {assert.equal(locked,true); flushes++;}};
sandbox.ContentService = {MimeType:{JSON:"json"},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})};
const signed = (nonce, timestamp=Math.floor(Date.now()/1000)) => {
  const payload=JSON.stringify({action:"claim", timestamp, nonce, invite_hash:"e".repeat(64), device_hash:"f".repeat(64)});
  return {payload,signature:crypto.createHmac("sha256",secret).update(payload).digest("hex")};
};
const envelope=signed("n".repeat(32));
assert.equal(sandbox.doPost({postData:{contents:JSON.stringify({...envelope,signature:"0".repeat(64)})}}).error,"unauthorized");
assert.equal(flushes,0);
assert.equal(sandbox.doPost({postData:{contents:JSON.stringify(signed("o".repeat(32),Math.floor(Date.now()/1000)-601))}}).error,"unauthorized");
assert.equal(sandbox.doPost({postData:{contents:JSON.stringify(envelope)}}).device_id,"seyda-laptop");
assert.equal(flushes,1);
assert.equal(locked,false);
assert.equal(sandbox.doPost({postData:{contents:JSON.stringify(envelope)}}).error,"unauthorized");
assert.equal(sandbox.doPost({postData:{contents:JSON.stringify(signed("p".repeat(32)))}}).error,"invalid_invite");
assert.equal(flushes,1);
console.log("Apps Script: signature, timestamp, replay and atomic claim checks passed.");
