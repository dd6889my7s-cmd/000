#!/usr/bin/env node
'use strict';

// addboard — 家庭内スケジュール掲示板サーバー
// 依存ライブラリなし。Node.js だけで動く。
//   起動:  node server.js
//   テレビ表示:   http://<このPC>:8720/tv
//   編集ページ:   http://<このPC>:8720/edit
//   ウィジェットAPI: http://<このPC>:8720/api/board

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8720);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'board.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function defaultBoard() {
  return {
    members: [
      { id: 'm1', name: 'メンバー1', color: '#5b8def' },
      { id: 'm2', name: 'メンバー2', color: '#e0708a' },
    ],
    events: [], // { id, memberId, date: 'YYYY-MM-DD', time: 'HH:MM'|'', title }
    todos: [],  // { id, memberId, text, date: 'YYYY-MM-DD'|'', done }
    note: { text: '', updatedAt: null }, // 朝会メモ(自由記述)
  };
}

let board;
try {
  board = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch {
  board = defaultBoard();
}

function todayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function pruneOld() {
  // 終わって2週間過ぎた予定・完了して2日過ぎた日付なしTODOは自動で消す
  const cutoff = todayStr(-14);
  board.events = board.events.filter((e) => e.date >= cutoff);
  board.todos = board.todos.filter((t) => !(t.done && t.doneAt && Date.now() - t.doneAt > 2 * 86400000));
}

let saveTimer = null;
function save() {
  pruneOld();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(board, null, 2));
  }, 200);
  broadcast();
}

// ---- SSE(テレビ画面へのリアルタイム反映) ----
const sseClients = new Set();
function broadcast() {
  const msg = `data: ${JSON.stringify({ type: 'update', at: Date.now() })}\n\n`;
  for (const res of sseClients) res.write(msg);
}

// ---- HTTP まわり ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(res, name) {
  const file = path.join(PUBLIC_DIR, name);
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const m = req.method;

  try {
    // 画面
    if (m === 'GET' && (p === '/' || p === '/tv')) return serveFile(res, 'tv.html');
    if (m === 'GET' && p === '/edit') return serveFile(res, 'edit.html');

    // リアルタイム更新ストリーム
    if (m === 'GET' && p === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('data: {"type":"hello"}\n\n');
      sseClients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(ping);
        sseClients.delete(res);
      });
      return;
    }

    // データ全体
    if (m === 'GET' && p === '/api/board') {
      pruneOld();
      return sendJSON(res, 200, board);
    }

    // 朝会メモ
    if (m === 'PUT' && p === '/api/note') {
      const b = await readBody(req);
      board.note = { text: String(b.text || ''), updatedAt: Date.now() };
      save();
      return sendJSON(res, 200, board.note);
    }

    // メンバー名の変更
    let mm = p.match(/^\/api\/members\/([\w-]+)$/);
    if (m === 'PUT' && mm) {
      const member = board.members.find((x) => x.id === mm[1]);
      if (!member) return sendJSON(res, 404, { error: 'no such member' });
      const b = await readBody(req);
      if (b.name) member.name = String(b.name).slice(0, 20);
      if (b.color) member.color = String(b.color).slice(0, 20);
      save();
      return sendJSON(res, 200, member);
    }

    // 予定
    if (m === 'POST' && p === '/api/events') {
      const b = await readBody(req);
      if (!b.title || !b.date) return sendJSON(res, 400, { error: 'title and date required' });
      const ev = {
        id: crypto.randomUUID(),
        memberId: String(b.memberId || 'm1'),
        date: String(b.date),
        time: String(b.time || ''),
        title: String(b.title).slice(0, 100),
      };
      board.events.push(ev);
      board.events.sort((a, x) => (a.date + (a.time || '99:99')).localeCompare(x.date + (x.time || '99:99')));
      save();
      return sendJSON(res, 200, ev);
    }
    mm = p.match(/^\/api\/events\/([\w-]+)$/);
    if (m === 'DELETE' && mm) {
      board.events = board.events.filter((e) => e.id !== mm[1]);
      save();
      return sendJSON(res, 200, { ok: true });
    }

    // やること
    if (m === 'POST' && p === '/api/todos') {
      const b = await readBody(req);
      if (!b.text) return sendJSON(res, 400, { error: 'text required' });
      const todo = {
        id: crypto.randomUUID(),
        memberId: String(b.memberId || 'm1'),
        text: String(b.text).slice(0, 100),
        date: String(b.date || ''),
        done: false,
      };
      board.todos.push(todo);
      save();
      return sendJSON(res, 200, todo);
    }
    mm = p.match(/^\/api\/todos\/([\w-]+)\/toggle$/);
    if (m === 'POST' && mm) {
      const todo = board.todos.find((t) => t.id === mm[1]);
      if (!todo) return sendJSON(res, 404, { error: 'no such todo' });
      todo.done = !todo.done;
      todo.doneAt = todo.done ? Date.now() : null;
      save();
      return sendJSON(res, 200, todo);
    }
    mm = p.match(/^\/api\/todos\/([\w-]+)$/);
    if (m === 'DELETE' && mm) {
      board.todos = board.todos.filter((t) => t.id !== mm[1]);
      save();
      return sendJSON(res, 200, { ok: true });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  } catch (err) {
    sendJSON(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  const nets = require('os').networkInterfaces();
  const addrs = Object.values(nets)
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
  console.log('addboard が起動しました。');
  console.log(`  テレビ表示:  http://localhost:${PORT}/tv`);
  for (const a of addrs) {
    console.log(`  スマホから:  http://${a}:${PORT}/edit`);
  }
});
