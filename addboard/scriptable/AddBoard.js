// addboard ロック画面ウィジェット (Scriptable 用)
//
// 使い方:
//  1. iPhone に App Store から「Scriptable」(無料) を入れる
//  2. Scriptable で新規スクリプトを作り、このファイルの中身を貼り付けて
//     「AddBoard」という名前で保存する
//  3. 下の SERVER を自宅サーバーのアドレスに、MY_NAME を自分の名前
//     (addboard のメンバー名と同じもの) に書き換える
//  4. ロック画面を長押し → カスタマイズ → ウィジェット追加 → Scriptable を選び、
//     Script に「AddBoard」を指定する
//
// メモ: ロック画面の更新は iOS 任せ (15〜30分おき程度) です。
//       自宅の Wi-Fi にいる時だけ取得できます。外出先でも見たい場合は
//       Tailscale などの VPN を入れると SERVER のアドレスのまま届きます。

const SERVER = "http://192.168.1.20:8720"; // ← 自宅サーバーのアドレスに変更
const MY_NAME = "メンバー1";               // ← 自分のメンバー名に変更

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let board = null;
try {
  const req = new Request(`${SERVER}/api/board`);
  req.timeoutInterval = 10;
  board = await req.loadJSON();
} catch (e) {
  board = null;
}

const widget = new ListWidget();
const isLock = config.widgetFamily && config.widgetFamily.startsWith("accessory");

if (!isLock) {
  widget.backgroundColor = new Color("#10141d");
}

if (!board) {
  const t = widget.addText("addboard に接続できません(自宅Wi-Fi外?)");
  t.font = Font.systemFont(isLock ? 12 : 14);
  t.textColor = isLock ? Color.white() : new Color("#8b95a8");
} else {
  const me = board.members.find(m => m.name === MY_NAME) || board.members[0];
  const today = todayStr();
  const events = board.events
    .filter(e => e.memberId === me.id && e.date === today)
    .slice(0, isLock ? 2 : 5);
  const todos = board.todos
    .filter(t => t.memberId === me.id && !t.done && (!t.date || t.date <= today))
    .slice(0, isLock ? 1 : 4);

  const lines = [];
  for (const e of events) lines.push(`${e.time ? e.time + " " : ""}${e.title}`);
  for (const t of todos) lines.push(`☐ ${t.text}`);
  if (!lines.length) lines.push("今日は予定なし 🎉");

  if (isLock) {
    // ロック画面 (accessoryRectangular): 3行程度が限界
    for (const line of lines.slice(0, 3)) {
      const t = widget.addText(line);
      t.font = Font.mediumSystemFont(12);
      t.lineLimit = 1;
    }
  } else {
    // ホーム画面ウィジェット
    const head = widget.addText(`${me.name} の今日`);
    head.font = Font.boldSystemFont(13);
    head.textColor = new Color(me.color || "#ffd166");
    widget.addSpacer(4);
    for (const line of lines) {
      const t = widget.addText(line);
      t.font = Font.systemFont(14);
      t.textColor = new Color("#e8ecf4");
      t.lineLimit = 1;
      widget.addSpacer(2);
    }
  }
}

// 15分後を目安に更新をリクエスト(実際の更新タイミングは iOS が決める)
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
