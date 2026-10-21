const socket = io();
let myUsername = "";
let chatWithUser = "";
let typingTimeout;

function showTab(tab){
  document.getElementById('loginTab').style.display = tab==='login'?'block':'none';
  document.getElementById('signupTab').style.display = tab==='signup'?'block':'none';
  document.getElementById('forgotTab').style.display = tab==='forgot'?'block':'none';
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  document.getElementById('t-'+tab).classList.add('active');
}

async function signup(){
  const username=document.getElementById('s-username').value.trim();
  const email=document.getElementById('s-email').value.trim();
  const password=document.getElementById('s-password').value;
  const repeatPassword=document.getElementById('s-repeat').value;
  let res=await fetch('/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,email,password,repeatPassword})});
  let data=await res.json();
  document.getElementById('authMsg').innerText=data.msg;
  if(data.ok){showTab('login'); document.getElementById('authMsg').innerText="Account created! Now login";}
}
async function login(){
  const username=document.getElementById('l-username').value.trim();
  const password=document.getElementById('l-password').value;
  let res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  let data=await res.json();
  if(!data.ok){document.getElementById('authMsg').innerText=data.msg;return;}
  myUsername=data.username;
  document.getElementById('auth').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('myName').innerText=myUsername;
  socket.emit('join',myUsername);
}
async function forgot(){
  const email=document.getElementById('f-email').value.trim();
  let res=await fetch('/api/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
  let data=await res.json();
  document.getElementById('authMsg').innerText=data.msg;
  if(data.ok) document.getElementById('resetArea').style.display='block';
}
async function resetPass(){
  const email=document.getElementById('f-email').value.trim();
  const otp=document.getElementById('f-otp').value.trim();
  const newPassword=document.getElementById('f-newpass').value;
  let res=await fetch('/api/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,otp,newPassword})});
  let data=await res.json();
  document.getElementById('authMsg').innerText=data.msg;
  if(data.ok) showTab('login');
}

function sendMessage(){
  let input=document.getElementById('msgInput');
  let text=input.value.trim();
  if(!text||!chatWithUser)return;
  let msgData={from:myUsername,to:chatWithUser,text,time:new Date().toLocaleTimeString()};
  socket.emit('sendMessage',msgData);
  input.value='';
  socket.emit('stopTyping');
}
function onTyping(){
  if(chatWithUser){socket.emit('typing',myUsername); clearTimeout(typingTimeout); typingTimeout=setTimeout(()=>socket.emit('stopTyping'),1500);}
}
document.getElementById('msgInput').addEventListener('keypress',e=>{if(e.key==='Enter')sendMessage();});

socket.on('onlineList',(users)=>{
  let list=document.getElementById('userList'); list.innerHTML='';
  users.forEach(u=>{
    if(u===myUsername)return;
    let div=document.createElement('div'); div.className='userItem';
    div.innerHTML=`<span>${u}</span><span class="online-dot"></span>`;
    div.onclick=()=>{chatWithUser=u; document.getElementById('chatWith').innerText=u; document.getElementById('messages').innerHTML=''; socket.emit('join',myUsername); if(window.innerWidth<768)document.querySelector('.sidebar').classList.add('hide');};
    list.appendChild(div);
  });
});
socket.on('oldMessages',(msgs)=>{
  let box=document.getElementById('messages'); box.innerHTML='';
  msgs.forEach(m=>{if((m.from===myUsername&&m.to===chatWithUser)||(m.from===chatWithUser&&m.to===myUsername)||!chatWithUser) addMsg(m);});
});
socket.on('newMessage',(m)=>{addMsg(m);});
function addMsg(m){
  if(chatWithUser && m.from!==chatWithUser && m.to!==chatWithUser && m.from!==myUsername && m.to!==myUsername) return;
  if(!chatWithUser && m.from!==myUsername && m.to!==myUsername) {}
  let box=document.getElementById('messages');
  let div=document.createElement('div');
  div.className='msg '+(m.from===myUsername?'me':'other');
  div.innerHTML=`${m.text}<span class="time">${m.from} • ${m.time}</span>`;
  box.appendChild(div); box.scrollTop=box.scrollHeight;
}
socket.on('typing',(u)=>{if(u===chatWithUser)document.getElementById('typing').innerText=u+' typing...';});
socket.on('stopTyping',()=>{document.getElementById('typing').innerText='';});

// --- WebRTC Call ---
let localStream, remoteStream, pc;
let callTarget="";
const configRTC={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};

async function startCall(isVideo){
  if(!chatWithUser){alert('Select user first');return;}
  callTarget=chatWithUser;
  document.getElementById('callScreen').style.display='flex';
  document.getElementById('callStatus').innerText='Calling '+callTarget+'...';
  localStream=await navigator.mediaDevices.getUserMedia({video:isVideo,audio:true});
  document.getElementById('localVideo').srcObject=localStream;
  pc=new RTCPeerConnection(configRTC);
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack=e=>{document.getElementById('remoteVideo').srcObject=e.streams[0];};
  pc.onicecandidate=e=>{if(e.candidate)socket.emit('iceCandidate',{to:callTarget,candidate:e.candidate});};
  let offer=await pc.createOffer(); await pc.setLocalDescription(offer);
  socket.emit('callUser',{to:callTarget,from:myUsername,offer,type:isVideo?'video':'audio'});
}
socket.on('incomingCall',async(data)=>{
  let accept=confirm(data.from+' is calling you ('+data.type+'). Accept?');
  if(!accept){socket.emit('endCall',{to:data.from});return;}
  callTarget=data.from; chatWithUser=data.from; document.getElementById('chatWith').innerText=chatWithUser;
  document.getElementById('callScreen').style.display='flex';
  document.getElementById('callStatus').innerText='Connected with '+callTarget;
  localStream=await navigator.mediaDevices.getUserMedia({video:data.type==='video',audio:true});
  document.getElementById('localVideo').srcObject=localStream;
  pc=new RTCPeerConnection(configRTC);
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack=e=>{document.getElementById('remoteVideo').srcObject=e.streams[0];};
  pc.onicecandidate=e=>{if(e.candidate)socket.emit('iceCandidate',{to:callTarget,candidate:e.candidate});};
  await pc.setRemoteDescription(data.offer);
  let answer=await pc.createAnswer(); await pc.setLocalDescription(answer);
  socket.emit('answerCall',{to:callTarget,answer});
});
socket.on('callAnswered',async(answer)=>{await pc.setRemoteDescription(answer); document.getElementById('callStatus').innerText='Connected with '+callTarget;});
socket.on('iceCandidate',async(c)=>{if(pc) await pc.addIceCandidate(c);});
socket.on('callEnded',()=>{endCall();});
function endCall(){
  if(pc)pc.close(); if(localStream)localStream.getTracks().forEach(t=>t.stop());
  document.getElementById('callScreen').style.display='none';
  document.getElementById('callStatus').innerText='';
  if(callTarget) socket.emit('endCall',{to:callTarget});
  callTarget=""; pc=null; localStream=null;
}
