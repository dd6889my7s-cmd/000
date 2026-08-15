# addboard を AWS で動かす手順

家のPCを常時起動する代わりに、AWS 上の小さなサーバーで addboard を動かす構成です。

```
  AWS Lightsail (月 約$5 / 東京リージョン)
  ┌─────────────────────────────────┐
  │ Caddy(HTTPS化) → addboard      │
  └───────────────▲─────────────────┘
                  │ https://○○○.duckdns.org
   ┌──────────┬───┴──────┬──────────┐
   │ テレビのPC│ iPhone×2 │ iPad     │  ← 家でも外出先でもOK
   └──────────┴──────────┴──────────┘
```

**この構成のメリット**
- テレビ側のPCはブラウザでURLを開くだけ(サーバーを動かさなくてよい)
- 外出先からも予定を編集できる
- ロック画面ウィジェットが自宅Wi-Fi外でも動く(VPN不要)

**必ずやること(セキュリティ)**
- `BOARD_KEY`(アクセスキー)を設定する — 家族の予定を誰でも見られる状態にしない
- HTTPS で公開する(下記の Caddy が自動でやってくれます)
- addboard のポート(8720)自体はインターネットに開けない

AWS のサービスは色々ありますが、このアプリはリアルタイム通信(SSE)を使う
常駐型の小さなサーバーなので、**Lightsail(固定料金の仮想サーバー)が最適**です。
Lambda などのサーバーレス構成は SSE と相性が悪く、構築も複雑になるので不要です。

---

## 手順

### 1. Lightsail インスタンスを作る(約5分)

1. AWS にログイン → サービス検索で「Lightsail」→「インスタンスの作成」
2. リージョン: **東京 (ap-northeast-1)**
3. プラットフォーム: **Linux/Unix** → 設計図: **OS のみ → Ubuntu 24.04 LTS**
4. プラン: 一番安いもの(512MB RAM で十分。月 $5 前後)
5. 名前を `addboard` などにして作成

作成後:

6. インスタンスの「ネットワーキング」タブ → **静的IPをアタッチ**(無料。IPが変わらなくなる)
7. 同じタブのファイアウォールで **HTTPS (443)** と **HTTP (80)** を追加
   (SSH (22) は最初から開いています。**8720 は開けないこと**)

### 2. 無料のドメインを取る(DuckDNS・約3分)

HTTPS 化に必要です。

1. https://www.duckdns.org に GitHub アカウント等でログイン
2. 好きな名前(例: `○○○-addboard`)で subdomain を作成
3. その行の「current ip」に **手順1の静的IP** を入れて update

これで `○○○-addboard.duckdns.org` が AWS のサーバーを指すようになります。

### 3. サーバーの設定(約10分)

Lightsail のインスタンス画面の「SSH を使用して接続」(ブラウザ内ターミナル)を開き、
以下を順に貼り付けて実行します。

```bash
# Node.js 22 と Caddy(HTTPS用)のインストール
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs caddy git

# addboard のファイルを置く
sudo mkdir -p /opt/addboard
sudo chown ubuntu:ubuntu /opt/addboard
```

addboard のファイルを `/opt/addboard` に置きます。リポジトリを clone できるなら:

```bash
git clone -b claude/addboard-schedule-sharing-10s1px https://github.com/dd6889my7s-cmd/000.git /tmp/000
cp -r /tmp/000/addboard/* /opt/addboard/
```

(リポジトリがプライベートで clone できない場合は、手元のPCで
`scp -r addboard ubuntu@静的IP:/opt/` のようにアップロードするか、
GitHub の Personal Access Token を使って clone してください)

次に、**アクセスキーを決めて**(長めのランダム文字列。例は下のコマンドで生成)
常駐サービスとして登録します:

```bash
# キーの生成(表示された文字列をメモしておく — 家族だけの合言葉になります)
openssl rand -hex 16
```

```bash
# systemd サービス登録(BOARD_KEY= の後を↑で生成したキーに置き換える)
sudo tee /etc/systemd/system/addboard.service > /dev/null <<'EOF'
[Unit]
Description=addboard
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/addboard
Environment=BOARD_KEY=ここに生成したキーを貼る
ExecStart=/usr/bin/node /opt/addboard/server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now addboard
```

最後に Caddy で HTTPS 化します(ドメインは手順2で作ったものに置き換え):

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
○○○-addboard.duckdns.org {
    reverse_proxy localhost:8720
}
EOF
sudo systemctl restart caddy
```

Caddy が Let's Encrypt の証明書を自動取得してくれるので、1〜2分待てば完了です。

### 4. 各端末から開く

キーを `abc123...` とした場合:

- **テレビのPC**: ブラウザで `https://○○○-addboard.duckdns.org/tv?key=abc123...` を開いて F11 で全画面
- **iPhone / iPad**: Safari で `https://○○○-addboard.duckdns.org/edit?key=abc123...` → ホーム画面に追加
- 一度キー付きURLで開けば1年間は記憶される(クッキー)ので、以後はキーなしのURLでも開けます
- **ロック画面ウィジェット**: `scriptable/AddBoard.js` の冒頭を
  `SERVER = "https://○○○-addboard.duckdns.org"`、`KEY = "abc123..."` に設定。
  AWS 構成なら**外出先でもウィジェットが更新されます**

## 運用メモ

- **料金**: Lightsail 最小プランで月 $5 前後 + わずかな通信費。DuckDNS は無料
- **アプリの更新**: ファイルを置き直して `sudo systemctl restart addboard`
- **データのバックアップ**: `/opt/addboard/data/board.json` をコピーするだけ
- **ログ確認**: `journalctl -u addboard -f`
- キーを変えたいときは service ファイルの `BOARD_KEY=` を書き換えて
  `sudo systemctl daemon-reload && sudo systemctl restart addboard`
