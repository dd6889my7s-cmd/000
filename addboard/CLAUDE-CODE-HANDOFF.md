# AWSデプロイの引き継ぎ書(Claude Code に依頼する用)

このページは、addboard の AWS デプロイを **Claude Code にやってもらう**ための
引き継ぎ書です。下の「依頼文」をそのまま Claude Code に貼り付ければ、
細かい手順は Claude Code が [DEPLOY-AWS.md](DEPLOY-AWS.md) を読んで進めてくれます。

## 事前に用意するもの(人間側の作業)

Claude Code には代行できない、アカウント系の準備が3つだけあります。

1. **このリポジトリへのアクセス権**
   リポジトリのオーナー(妻)から GitHub のコラボレーター招待を受けて承認しておく
   (Claude Code が clone するのに必要)
2. **AWS アカウント**
   なければ https://aws.amazon.com/jp/ で作成(クレジットカード登録が必要)。
   Claude Code に CLI で自動化してもらう場合は、IAM のアクセスキーを発行して
   `aws configure` まで済ませておくとスムーズ(やり方が分からなければ、
   それ自体を Claude Code に聞けば案内してくれます)
3. **DuckDNS のサブドメイン**(無料・HTTPS化に必要)
   https://www.duckdns.org に GitHub アカウント等でログイン →
   好きな名前で subdomain を1つ作る → 画面上部の **token** を控えておく

## 依頼文(ここから下を Claude Code にそのまま貼り付け)

```
家庭用スケジュール掲示板「addboard」を AWS Lightsail にデプロイしてください。

1. リポジトリ https://github.com/dd6889my7s-cmd/000 のブランチ
   claude/addboard-schedule-sharing-10s1px を clone し、
   addboard/DEPLOY-AWS.md と addboard/README.md を読んでください。

2. DEPLOY-AWS.md の構成(Lightsail + DuckDNS + Caddy による自動HTTPS)に
   沿ってデプロイしてください。
   - AWS CLI で自動化できる部分(インスタンス作成、静的IP、ファイアウォール設定)は
     自動化して構いません。CLI が使えない場合は、コンソール操作を1手順ずつ
     案内してください。リージョンは東京(ap-northeast-1)。
   - 必要な情報(AWS認証情報、DuckDNSのドメイン名とtoken)は私に聞いてください。
   - アクセスキー(BOARD_KEY)は openssl rand -hex 16 で生成してください。

3. セキュリティ上、次を必ず守ってください。
   - BOARD_KEY を必ず設定する(認証なしで公開しない)
   - 公開ポートは 443/80 のみ。アプリのポート 8720 はインターネットに開けない
   - HTTPS は Caddy の自動証明書に任せる

4. 完了したら動作確認(https でページが開き、予定を追加するとテレビ用ページに
   即時反映されること)をした上で、以下を一覧で教えてください。
   - テレビ用URL(キー付き): https://○○○.duckdns.org/tv?key=○○○
   - スマホ編集用URL(キー付き): https://○○○.duckdns.org/edit?key=○○○
   - ロック画面ウィジェット用の設定値: SERVER と KEY
   - 今後の運用コマンド(再起動・ログ確認・アプリ更新のやり方)
```

## デプロイ完了後にやること

- 上記で教えてもらった**キー付きURL**を夫婦で共有する(キーは家族の合言葉なので他人に教えない)
- テレビのPCでテレビ用URLを開いて全画面(F11 / ⌘⌃F)
- 各自の iPhone で編集用URLを開いて「ホーム画面に追加」
- ロック画面ウィジェットを使う場合は README の手順で Scriptable を設定
  (SERVER と KEY は教えてもらった値を使う)
