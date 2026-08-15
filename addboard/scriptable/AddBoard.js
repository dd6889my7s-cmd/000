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
const MY_NAME = "ASM";                     // ← 自分のメンバー名に変更(ASM / TKS)

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
  widget.backgroundColor = new Color("#050505");
}

if (!board) {
  const t = widget.addText("addboard に接続できません(自宅Wi-Fi外?)");
  t.font = Font.systemFont(isLock ? 12 : 14);
  t.textColor = isLock ? Color.white() : new Color("#8a8a8a");
} else {
  const me = board.members.find(m => m.name === MY_NAME) || board.members[0];
  const shared = board.members.find(m => m.id === "both") || { color: "#6fd3e1" };
  const today = todayStr();
  // 自分の予定 + 二人共通の予定を表示(文字色で区別: 自分=本人色 / 共通=水色)
  const events = board.events
    .filter(e => (e.memberId === me.id || e.memberId === "both") && e.date === today)
    .slice(0, isLock ? 2 : 5);
  const todos = board.todos
    .filter(t => (t.memberId === me.id || t.memberId === "both") && !t.done && (!t.date || t.date <= today))
    .slice(0, isLock ? 1 : 4);

  const lines = [];
  for (const e of events) lines.push({ text: `${e.time ? e.time + " " : ""}${e.title}`, shared: e.memberId === "both" });
  for (const t of todos) lines.push({ text: `☐ ${t.text}`, shared: t.memberId === "both" });
  if (!lines.length) lines.push({ text: "今日は予定なし 🎉", shared: false });

  if (isLock) {
    // ロック画面 (accessoryRectangular): 3行程度が限界。色は付かずモノトーン表示
    for (const line of lines.slice(0, 3)) {
      const t = widget.addText(line.text);
      t.font = Font.mediumSystemFont(12);
      t.lineLimit = 1;
    }
  } else {
    // ホーム画面ウィジェット
    const head = widget.addText(`${me.name} の今日`);
    head.font = Font.boldSystemFont(13);
    head.textColor = new Color(me.color || "#e6e6e6");
    widget.addSpacer(4);
    for (const line of lines) {
      const t = widget.addText(line.text);
      t.font = Font.systemFont(14);
      t.textColor = new Color(line.shared ? shared.color : (me.color || "#e6e6e6"));
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
