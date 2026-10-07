const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Sheet {
 constructor(){this.rows=[];}
 getLastRow(){return this.rows.length;}
 setFrozenRows(){}
 getRange(row,col,height=1,width=1){const self=this;return {
 getValues(){return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>self.rows[row+i-1]?.[col+j-1]??''));},
 setValues(values){values.forEach((r,i)=>{self.rows[row+i-1]??=[];r.forEach((v,j)=>self.rows[row+i-1][col+j-1]=v);});},
 setValue(value){self.rows[row-1][col-1]=value;}};}
}
const sheets={};const book={getSheetByName:name=>sheets[name],insertSheet:name=>(sheets[name]=new Sheet())};
const context={SpreadsheetApp:{openById:()=>book,flush(){}},PropertiesService:{getScriptProperties:()=>({getProperty:()=>"private"})},Utilities:{getUuid:()=>"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}};
vm.createContext(context);vm.runInContext(fs.readFileSync('integrations/device_storage.gs','utf8')+'\n'+fs.readFileSync('integrations/message_storage.gs','utf8'),context);
const ridvan='a'.repeat(64),seyda='b'.repeat(64),devices=[['ridvan-phone','ridvan','Telefon','','',ridvan,'','',false],['seyda-phone','seyda','Telefon','','',seyda,'','',false]];
const call=(action,device_hash,params={})=>context.handleMessages_({action,device_hash,...params},devices,Date.now());
assert.equal(call('messages_list','c'.repeat(64)).error,'unrecognized');assert.equal(Object.keys(sheets).length,0);
const payload={text:'=HYPERLINK("private") ❤️',client_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',mime:'image/gif',media:'R0lGODlh'};
assert.equal(call('messages_send',ridvan,payload).sent,true);
assert.equal(call('messages_send',ridvan,payload).sent,true);assert.equal(sheets.Mesajlar.getLastRow(),2);
assert.equal(sheets.Mesajlar.rows[1][4][0],'"');
assert.equal(call('messages_list',ridvan).unread,0);assert.equal(call('messages_list',seyda).unread,1);
assert.equal(call('messages_media','c'.repeat(64),{message_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}).error,'unrecognized');
assert.equal(call('messages_media',seyda,{message_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}).media,payload.media);
call('messages_read',ridvan,{ids:['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']});assert.equal(call('messages_list',seyda).unread,1);
call('messages_read',seyda,{ids:['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']});assert.equal(call('messages_list',seyda).unread,0);
devices[1][8]=true;assert.equal(call('messages_list',seyda).error,'unrecognized');
assert.equal(call('messages_send',ridvan,{...payload,media:'x'.repeat(699053)}).error,'invalid_request');
console.log('Messages: authorization, revocation, idempotent send, private media, read ownership, formula protection and size checks passed.');
