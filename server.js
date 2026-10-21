const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('public'));

const USERS_FILE = './users.json';
const MSG_FILE = './messages.json';

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
if (!fs.existsSync(MSG_FILE)) fs.writeFileSync(MSG_FILE, '[]');

const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE));
const saveUsers = (d) => fs.writeFileSync(USERS_FILE, JSON.stringify(d, null, 2));
const readMsgs = () => JSON.parse(fs.readFileSync(MSG_FILE));
const saveMsgs = (d) => fs.writeFileSync(MSG_FILE, JSON.stringify(d.slice(-1000)));

// EMAIL CONFIG - Render par Env Var me dalna
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // tumhara gmail
    pass: process.env.EMAIL_PASS  // Gmail App Password
  }
});

let resetTokens = {}; // email -> token

// SIGNUP
app.post('/api/signup', (req, res) => {
  const { username, email, password, repeatPassword } = req.body;
  if (!username || !email || !password || !repeatPassword) return res.json({ ok: false, msg: 'All fields required' });
  if (password !== repeatPassword) return res.json({ ok: false, msg: 'Password not match' });
  
  let users = readUsers();
  if (users[username]) return res.json({ ok: false, msg: 'Username already exists' });
  if (Object.values(users).find(u => u.email === email)) return res.json({ ok: false, msg: 'Email already used' });

  users[username] = { email, password, created: Date.now() };
  saveUsers(users);
  res.json({ ok: true, msg: 'Account created' });
});

// LOGIN
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  let users = readUsers();
  if (!users[username] || users[username].password !== password) {
    return res.json({ ok: false, msg: 'Wrong username or password' });
  }
  res.json({ ok: true, username, email: users[username].email });
});

// FORGOT PASSWORD - SEND EMAIL
app.post('/api/forgot', async (req, res) => {
  const { email } = req.body;
  let users = readUsers();
  let foundUser = Object.keys(users).find(k => users[k].email === email);
  if (!foundUser) return res.json({ ok: false, msg: 'Email not found' });

  let token = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
  resetTokens[email] = token;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'WhatsApp Clone - Password Reset',
      text: `Your password reset OTP is: ${token}\nUsername: ${foundUser}\nIt will expire in 10 min.`
    });
    res.json({ ok: true, msg: 'OTP sent to your email' });
  } catch (e) {
    console.log(e);
    res.json({ ok: false, msg: 'Email failed. Check Render EMAIL_USER/PASS. OTP is: ' + token });
  }
});

// RESET PASSWORD
app.post('/api/reset', (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (resetTokens[email] !== otp) return res.json({ ok: false, msg: 'Wrong OTP' });
  let users = readUsers();
  let foundUser = Object.keys(users).find(k => users[k].email === email);
  if (!foundUser) return res.json({ ok: false, msg: 'User not found' });
  
  users[foundUser].password = newPassword;
  saveUsers(users);
  delete resetTokens[email];
  res.json({ ok: true, msg: 'Password reset success, now login' });
});

// SOCKET CHAT + CALL
let onlineUsers = {};
io.on('connection', (socket) => {
  socket.on('join', (username) => {
    onlineUsers[username] = socket.id;
    socket.username = username;
    io.emit('onlineList', Object.keys(onlineUsers));
    socket.emit('oldMessages', readMsgs());
  });
  socket.on('sendMessage', (data) => {
    let all = readMsgs(); all.push(data); saveMsgs(all);
    io.emit('newMessage', data);
  });
  socket.on('typing', (u) => socket.broadcast.emit('typing', u));
  socket.on('stopTyping', () => socket.broadcast.emit('stopTyping'));
  
  // WebRTC
  socket.on('callUser', (d) => { if (onlineUsers[d.to]) io.to(onlineUsers[d.to]).emit('incomingCall', d); });
  socket.on('answerCall', (d) => { if (onlineUsers[d.to]) io.to(onlineUsers[d.to]).emit('callAnswered', d.answer); });
  socket.on('iceCandidate', (d) => { if (onlineUsers[d.to]) io.to(onlineUsers[d.to]).emit('iceCandidate', d.candidate); });
  socket.on('endCall', (d) => { if (onlineUsers[d.to]) io.to(onlineUsers[d.to]).emit('callEnded'); });

  socket.on('disconnect', () => {
    if (socket.username) delete onlineUsers[socket.username];
    io.emit('onlineList', Object.keys(onlineUsers));
  });
});

server.listen(process.env.PORT || 10000, () => console.log('Running'));
