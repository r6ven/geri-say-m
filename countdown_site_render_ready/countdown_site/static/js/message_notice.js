"use strict";
(() => {
  const notice=document.getElementById("messageNotice"), count=document.getElementById("messageCount"), link=document.getElementById("contactLink");
  if(!notice || !link) return;
  let busy=false,lastNotice="";
  async function refresh(){
    if(busy || document.hidden)return;busy=true;
    try {
      const response=await fetch("/api/messages",{cache:"no-store",credentials:"same-origin"});if(!response.ok)return;
      const data=await response.json();link.hidden=false;document.getElementById("contactLocked").hidden=true;
      count.textContent=data.unread?String(data.unread):"";
      document.title=data.unread?`(${data.unread}) Şeyda & Rıdvan`:"Şeyda & Rıdvan";
      try{if(data.unread && navigator.setAppBadge)await navigator.setAppBadge(data.unread);else if(!data.unread && navigator.clearAppBadge)await navigator.clearAppBadge();}catch{}
      const unread=data.messages.filter(m=>m.recipient===data.person && !m.read_at);
      const key=unread.map(m=>m.id).join("|");
      if(data.unread && key!==lastNotice && !document.querySelector("dialog[open]")) {notice.showModal();document.body.classList.add("has-dialog");lastNotice=key;}
    }catch{}finally{busy=false;}
  }
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});refresh();setInterval(refresh,60000);
})();
