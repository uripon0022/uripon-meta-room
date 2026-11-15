// うりぽん号メタ部屋 Firebase接続設定
// ※これはクライアント公開前提のキー（秘密情報ではない）。書き込み制御はrules.jsonのセキュリティルールで行う
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBx9XIb1ZSVBDoScnnQ-Qpj7w1JImlEfR8",
  authDomain: "uripon-meta-room-next.firebaseapp.com",
  databaseURL: "https://uripon-meta-room-next-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "uripon-meta-room-next",
  storageBucket: "uripon-meta-room-next.firebasestorage.app",
  messagingSenderId: "63375293235",
  appId: "1:63375293235:web:60bf7f871690d9bf0ddc46"
};

// Discordボイスチャンネルへのリンク（うりぽん号のボイスch）
window.DISCORD_VOICE_URL = "https://discord.com/channels/1427549476062625905/1527009272041443441";

// Discord通知などから案内する公開中のメタ部屋URL
window.META_ROOM_URL = "https://uripon0022.github.io/uripon-meta-room/";

// Discord通知用Webhook URL（作業開始・帰宅をお知らせするチャンネルのWebhook）
// ※このURLを知っている人は誰でもそのチャンネルに投稿できる。荒らされたらDiscord側でウェブフックを削除→再作成して差し替える
// 信頼できるメンバー限定の運用として、クライアントから直接通知する
// ※URLが知られた場合はDiscord側でWebhookを削除し、再発行して差し替える
window.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1529458007770136689/8naQeL4VbOdLMSK1Jgx9RuJ_6M0F82xKuJj5CurYBHt4zNz9e13rJGiyR3snXCKVqjsv";
