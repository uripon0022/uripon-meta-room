import { randomUUID } from 'node:crypto';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';

const roomAccountEmail = 'room-access@uripon-meta-room.invalid';
const voiceRoom = 'uripon-23-meta-room-voice';
const livekitUrl = defineString('LIVEKIT_URL');
const livekitKey = defineSecret('LIVEKIT_API_KEY');
const livekitSecret = defineSecret('LIVEKIT_API_SECRET');
const emulator = process.env.FUNCTIONS_EMULATOR === 'true';

function getLiveKitOrigin() {
  try {
    const url = new URL(livekitUrl.value());
    const local = emulator && url.protocol === 'ws:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol === 'wss:' || local) && !url.username && !url.password &&
        url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch {
    // Invalid or missing deploy-time configuration.
  }
  throw new HttpsError('failed-precondition', '室内通話の接続先は未設定です');
}

export const issueRoomVoiceToken = onCall({
  region: 'asia-northeast1',
  cors: [
    'https://uripon0022.github.io',
    ...(emulator ? [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/] : []),
  ],
  secrets: [livekitKey, livekitSecret],
  maxInstances: 3,
}, async ({ auth }) => {
  if (!auth) throw new HttpsError('unauthenticated', '入室認証が必要です');
  if (auth.token.email !== roomAccountEmail || auth.token.firebase?.sign_in_provider !== 'password') {
    throw new HttpsError('permission-denied', '23期部屋の入室認証が必要です');
  }

  const url = getLiveKitOrigin();
  const key = livekitKey.value();
  const secret = livekitSecret.value();
  if (!key || !secret) throw new HttpsError('failed-precondition', '室内通話の接続先は未設定です');

  // Firebaseの部屋アカウントは共通なので、通話ごとに別の参加者IDを採番する。
  const token = new AccessToken(key, secret, { identity: randomUUID(), ttl: '2m' });
  token.addGrant({
    roomJoin: true,
    room: voiceRoom,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return { url, token: await token.toJwt() };
});
