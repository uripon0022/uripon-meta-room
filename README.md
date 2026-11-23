# うりぽん号メタ部屋 🚢

うりぽん号コミュニティのバーチャル自習室・交流スペースです。

## 23期部屋の室内通話

23期部屋は GitHub Pages（小文字の `uripon0022` アカウントの `main`）で公開し、入室に Firebase プロジェクト `uripon-meta-room-next` の共通アカウントを使います。音声は LiveKit の `uripon-23-meta-room-voice` で中継し、最初の参加時にこのルームが作成されます。画面共有は既存の WebRTC を使います。

### 公開

1. Firebase プロジェクト `uripon-meta-room-next` が Blaze プランであることを確認します。
2. LiveKit の公開 `wss://` 接続先を用意します。リポジトリのルートで次を実行し、表示される入力欄に LiveKit のキーとシークレットを登録します。

   ```sh
   firebase functions:secrets:set LIVEKIT_API_KEY --project uripon-meta-room-next
   firebase functions:secrets:set LIVEKIT_API_SECRET --project uripon-meta-room-next
   ```

3. `functions` で `npm ci` を実行します。リポジトリのルートで次を実行し、初回の入力欄に `LIVEKIT_URL`（例 `wss://example.livekit.cloud`）を設定します。

   ```sh
   firebase deploy --only functions:room-voice:issueRoomVoiceToken --project uripon-meta-room-next
   ```

4. 関数の公開後にフロントエンドを `main` へ反映します。関数は入室アカウントの認証を確認し、2分間有効なマイク送信・音声受信用トークンを発行します。

### 公開後の確認

別々のネットワークにつながる端末を用意し、23期部屋にログインします。「通話に参加」でマイクの許可を求められずに聞けることと、「マイクをオン」で許可を求められることを確認します。2人以上で同時に話して聞く側に全員の声が届くこと、画面共有を視聴しながら聞けること、マイクオフで送信が止まり端末のマイクが解放されることを確認します。「通話を抜ける」で部屋に残れることと、「帰宅」やタブを閉じたときに通話も終了することを確認します。
