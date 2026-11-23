const micConstraints = {
  echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1,
};

export function createRoomVoice({
  requestToken, notify,
  loadSDK = () => import('https://cdn.jsdelivr.net/npm/livekit-client@2.25.0/dist/livekit-client.esm.mjs'),
  captureMic = sdk => sdk.createLocalAudioTrack(micConstraints),
}) {
  const el = id=>document.getElementById(id);
  const joinButton = el('voice-join');
  const bar = el('voice-bar');
  const micButton = el('voice-mic');
  const playbackButton = el('voice-playback');
  const sound = el('voice-audio');
  let sdkPromise;
  let online = false;
  let joining = false;
  let session = null;
  let generation = 0;

  function render() {
    const connected = !!session?.joined;
    const micOn = !!session?.mic;
    const reconnecting = connected && session.room.state !== session.sdk.ConnectionState.Connected;
    joinButton.hidden = !online || connected;
    joinButton.disabled = joining;
    joinButton.textContent = joining ? '通話に接続中…' : '通話に参加';
    bar.hidden = !connected;
    if (!connected) return;
    const count = session.room.remoteParticipants.size + 1;
    const state = reconnecting ? '再接続中' : micOn ? 'マイクオン' : '聞くだけ';
    el('voice-status').textContent = `${state} ・ ${count}人`;
    micButton.disabled = session.changingMic || (reconnecting && !micOn);
    micButton.textContent = micOn ? 'マイクをオフ' : 'マイクをオン';
    micButton.setAttribute('aria-pressed',String(micOn));
    playbackButton.hidden = session.room.canPlaybackAudio;
  }

  function disconnect(ref) {
    if (!ref) return;
    ref.room.removeAllListeners();
    ref.mic?.stop();
    ref.mic = null;
    for (const [track,audio] of ref.audio) {
      track.detach(audio);
      audio.remove();
    }
    ref.audio.clear();
    void ref.room.disconnect().catch(()=>{});
  }

  function leave() {
    generation++;
    joining = false;
    const previous = session;
    session = null;
    disconnect(previous);
    render();
  }

  function bindRoom(ref) {
    const {room,sdk} = ref;
    const events = sdk.RoomEvent;
    room.on(events.TrackSubscribed,(track,publication) => {
      if (session!==ref || track.kind!==sdk.Track.Kind.Audio ||
          publication.source!==sdk.Track.Source.Microphone || ref.audio.has(track)) return;
      const audio = track.attach();
      audio.autoplay = true;
      sound.append(audio);
      ref.audio.set(track,audio);
    });
    room.on(events.TrackUnsubscribed,(track) => {
      const audio = ref.audio.get(track);
      if (!audio) return;
      track.detach(audio);
      audio.remove();
      ref.audio.delete(track);
    });
    for (const type of [events.ParticipantConnected,events.ParticipantDisconnected,events.AudioPlaybackStatusChanged,events.ConnectionStateChanged]) {
      room.on(type,() => { if (session===ref) render(); });
    }
    room.on(events.Disconnected,() => {
      if (session!==ref || !ref.joined) return;
      leave();
      notify('通話との接続が切れました');
    });
  }

  function preloadSDK() {
    sdkPromise ??= loadSDK().catch(error => {
      sdkPromise = undefined;
      throw error;
    });
    return sdkPromise;
  }

  async function join() {
    if (!online || joining || session) return;
    const attempt = ++generation;
    joining = true;
    render();
    let ref;
    try {
      const sdk = await preloadSDK();
      if (attempt!==generation) return;
      if (!sdk.isBrowserSupported()) {
        leave();
        notify('このブラウザは室内通話に対応していません');
        return;
      }
      const room = new sdk.Room();
      ref = { room,sdk,joined:false,mic:null,changingMic:false,audio:new Map() };
      session = ref;
      bindRoom(ref);
      void room.startAudio().catch(()=>{});
      const {url,token} = await requestToken();
      if (session!==ref) return;
      await room.connect(url,token);
      if (session!==ref) {
        disconnect(ref);
        return;
      }
      ref.joined = true;
    } catch (error) {
      if (attempt!==generation) return;
      leave();
      switch (error.code) {
        case 'functions/unauthenticated':
        case 'functions/permission-denied':
          notify('入室認証を確認してもう一度お試しください');
          break;
        case 'functions/failed-precondition':
          notify('室内通話の接続先は未設定です');
          break;
        default:
          notify('室内通話に接続できませんでした');
      }
    } finally {
      if (generation===attempt) {
        joining = false;
        const focusedJoin = document.activeElement===joinButton;
        render();
        if (ref?.joined && focusedJoin) micButton.focus();
      }
    }
  }

  async function toggleMic() {
    const ref = session;
    if (!ref?.joined || ref.changingMic) return;
    ref.changingMic = true;
    render();
    let track;
    try {
      if (ref.mic) {
        const previous = ref.mic;
        ref.mic = null;
        previous.stop();
        await ref.room.localParticipant.unpublishTrack(previous,true);
        return;
      }
      track = await captureMic(ref.sdk);
      if (session!==ref || ref.room.state!==ref.sdk.ConnectionState.Connected) {
        track.stop();
        return;
      }
      ref.mic = track;
      track.mediaStreamTrack.addEventListener('ended',() => {
        if (ref.mic!==track) return;
        ref.mic = null;
        void ref.room.localParticipant.unpublishTrack(track,true).catch(()=>{});
        if (session===ref) render();
      },{once:true});
      await ref.room.localParticipant.publishTrack(track,{source:ref.sdk.Track.Source.Microphone});
      if (session!==ref || ref.mic!==track) {
        await ref.room.localParticipant.unpublishTrack(track,true);
      }
    } catch {
      if (ref.mic===track) ref.mic = null;
      track?.stop();
      if (session===ref) notify('マイクを切り替えられませんでした。ブラウザのマイク設定を確認してください');
    } finally {
      ref.changingMic = false;
      if (session===ref) render();
    }
  }

  joinButton.addEventListener('click',()=>void join());
  micButton.addEventListener('click',()=>void toggleMic());
  el('voice-leave').addEventListener('click',() => {
    leave();
    joinButton.focus();
  });
  playbackButton.addEventListener('click',async () => {
    try { await session?.room.startAudio(); }
    catch { notify('音声を再生できませんでした'); }
  });

  return {
    setOnline(value) {
      online = value;
      if (!online) {
        leave();
        return;
      }
      void preloadSDK().catch(()=>{});
      render();
    },
    leave,
  };
}
