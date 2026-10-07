"use strict";
(() => {
  const $ = id => document.getElementById(id), status = $("messageStatus");
  let media = null, previewUrl = null, person = null, sending = false, busy = false, lastState = "";
  let clientId = crypto.randomUUID();
  const errors = {unrecognized:"Bu tarayıcının tanıtımı geçersiz. Yeni tanıtma bağlantısı iste.",too_large:"Görsel en fazla 512 KB olabilir.",invalid_media:"JPEG, PNG, WebP veya GIF seç.",storage_full:"Mesaj alanı dolu. Kayıtların düzenlenmesi gerekiyor.",storage_unavailable:"Bağlantı gecikti. Biraz sonra yeniden dene.",maintenance:"Site bakımda."};
  async function api(url, options={}) {
    const response = await fetch(url,{cache:"no-store",credentials:"same-origin",...options});
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "İşlem tamamlanamadı. Sayfayı yenileyip yeniden dene.");
    return data;
  }
  function writeHeaders() {return {"X-Message-CSRF":document.querySelector('meta[name="message-csrf"]').content};}
  async function badge(n) {try {if(n && navigator.setAppBadge) await navigator.setAppBadge(n);else if(!n && navigator.clearAppBadge) await navigator.clearAppBadge();} catch {}}
  async function load() {
    if (busy || document.hidden) return; busy = true;
    try {
      const data = await api("/api/messages");person = data.person;
      const signature = JSON.stringify(data.messages);
      if(signature !== lastState) {
        const fragment = document.createDocumentFragment();
        data.messages.forEach(message => {
          const item = document.createElement("article");item.className = "message"+(message.sender===person?" mine":"");
          const text = document.createElement("p");text.textContent = message.text;item.append(text);
          if(message.mime) {const image = document.createElement("img");image.src = `/api/messages/${encodeURIComponent(message.id)}/media`;image.alt = "Eşinin gönderdiği görsel";image.loading = "lazy";item.append(image);}
          const detail = document.createElement("small");detail.textContent = `${message.sender===person?"Sen":"Eşin"} · ${new Date(message.created_at).toLocaleString("tr-TR")} ${message.sender===person && message.read_at?"· Okundu":""}`;item.append(detail);fragment.append(item);
        });
        $("conversation").replaceChildren(fragment);lastState = signature;
      }
      status.textContent = data.messages.length?"":"Henüz mesaj yok. İlk notu sen bırak.";
      const unread = data.messages.filter(m=>m.recipient===person && !m.read_at).map(m=>m.id);
      if (unread.length) await api("/api/messages/read",{method:"POST",headers:{...writeHeaders(),"Content-Type":"application/json"},body:JSON.stringify({ids:unread})});
      await badge(Math.max(0,data.unread-unread.length));
    } catch(error) {status.textContent = error.message;} finally {busy=false;}
  }
  function setMedia(blob) {
    if(previewUrl) URL.revokeObjectURL(previewUrl);
    media=blob;previewUrl=blob?URL.createObjectURL(blob):null;$("mediaPreview").hidden=!blob;
    if(blob) $("previewImage").src=previewUrl; else $("previewImage").removeAttribute("src");
  }
  async function prepare(file) {
    if(!file) return;
    if(file.type==="image/gif") {if(file.size>512*1024) throw new Error(errors.too_large);return file;}
    if(!file.type.startsWith("image/") || file.type==="image/svg+xml") throw new Error(errors.invalid_media);
    if(file.size>20*1024*1024) throw new Error("Fotoğraf en fazla 20 MB olabilir.");
    const bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
    const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    let blob=await new Promise(r=>canvas.toBlob(r,"image/jpeg",.8));
    if(blob.size>512*1024) blob=await new Promise(r=>canvas.toBlob(r,"image/jpeg",.5));
    if(!blob || blob.size>512*1024) throw new Error(errors.too_large);return blob;
  }
  ["attachment","camera"].forEach(id=>$(id).addEventListener("change",async event=>{try{setMedia(await prepare(event.target.files[0]));clientId=crypto.randomUUID();status.textContent="";}catch(e){status.textContent=e.message;}event.target.value="";}));
  $("removeMedia").addEventListener("click",()=>{setMedia(null);clientId=crypto.randomUUID();});
  $("messageText").addEventListener("input",()=>{clientId=crypto.randomUUID();});
  $("emojiPicker").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{const t=$("messageText");t.setRangeText(b.textContent,t.selectionStart,t.selectionEnd,"end");t.focus();clientId=crypto.randomUUID();}));
  $("composer").addEventListener("submit",async event=>{
    event.preventDefault();if(sending) return;
    if(!$("messageText").value.trim() && !media){status.textContent="Bir mesaj yaz veya görsel ekle.";return;}
    sending=true;$("composer").querySelectorAll("input,textarea,button").forEach(el=>el.disabled=true);status.textContent="Gönderiliyor…";
    const form=new FormData();form.append("text",$("messageText").value);form.append("client_id",clientId);if(media) form.append("media",media,"gorsel");
    try {await api("/api/messages",{method:"POST",headers:writeHeaders(),body:form});$("messageText").value="";setMedia(null);clientId=crypto.randomUUID();lastState="";await load();}
    catch(e){status.textContent=e.message;}finally{sending=false;$("composer").querySelectorAll("input,textarea,button").forEach(el=>el.disabled=false);}
  });
  const canvas=$("drawing"),ctx=canvas.getContext("2d");let drawing=false;
  function clear(){ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);}clear();
  $("openDrawing").addEventListener("click",()=>{$("drawingArea").hidden=false;});
  $("cancelDrawing").addEventListener("click",()=>{$("drawingArea").hidden=true;});
  $("clearDrawing").addEventListener("click",clear);
  function point(event){const r=canvas.getBoundingClientRect();return [(event.clientX-r.left)*canvas.width/r.width,(event.clientY-r.top)*canvas.height/r.height];}
  canvas.addEventListener("pointerdown",e=>{drawing=true;canvas.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(...point(e));ctx.strokeStyle=$("penColor").value;ctx.lineWidth=Number($("penWidth").value);ctx.lineCap="round";ctx.lineJoin="round";});
  canvas.addEventListener("pointermove",e=>{if(!drawing)return;ctx.lineTo(...point(e));ctx.stroke();});
  ["pointerup","pointercancel"].forEach(type=>canvas.addEventListener(type,()=>{drawing=false;}));
  $("attachDrawing").addEventListener("click",()=>canvas.toBlob(blob=>{setMedia(blob);clientId=crypto.randomUUID();$("drawingArea").hidden=true;},"image/png"));
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)load();});
  load();setInterval(load,60000);
})();
