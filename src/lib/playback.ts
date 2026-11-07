/**
 * Reprodução em segundo plano.
 *
 * O que isto resolve: registrar a sessão de mídia (Media Session API) para que
 * o sistema mostre capa, título e botões na tela de bloqueio, e manter um
 * elemento de áudio ativo para o navegador não considerar a aba ociosa.
 *
 * O que isto NÃO resolve: a Web Speech API não é mídia. No iOS, a fala é
 * suspensa quando o app vai para segundo plano e nenhum truque muda isso.
 * No Android o comportamento varia por versão do Chrome. Se a fala parar
 * com a tela apagada, o caminho definitivo é gerar áudio (TTS -> arquivo)
 * e tocar por <audio>, que é o que o sistema respeita de verdade.
 */

export interface MediaInfo {
  title: string;
  artist: string;
  album: string;
}

/**
 * Estados de reprodução da Media Session. Declarado aqui porque o nome do
 * tipo varia entre versões de lib.dom (MediaPlaybackState / MediaSessionPlaybackState).
 */
type PlaybackState = 'none' | 'paused' | 'playing';

export interface BackgroundPlaybackOptions {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export interface BackgroundPlayback {
  start: () => void;
  stop: () => void;
  setMetadata: (info: MediaInfo) => void;
  dispose: () => void;
}

/** WAV de silêncio gerado em memória: nenhum arquivo precisa ser baixado. */
function createSilentWavUrl(seconds = 0.5): string | null {
  try {
    const sampleRate = 8000;
    const samples = Math.floor(sampleRate * seconds);
    const buffer = new ArrayBuffer(44 + samples);
    const view = new DataView(buffer);
    const write = (offset: number, text: string) => {
      for (let index = 0; index < text.length; index += 1) {
        view.setUint8(offset + index, text.charCodeAt(index));
      }
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + samples, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true); // 8 bits
    write(36, 'data');
    view.setUint32(40, samples, true);
    // 128 é o silêncio em PCM de 8 bits sem sinal.
    new Uint8Array(buffer, 44).fill(128);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  } catch {
    return null;
  }
}

function setAction(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Ação não suportada neste navegador: seguir sem ela.
  }
}

export function createBackgroundPlayback(
  options: BackgroundPlaybackOptions,
): BackgroundPlayback {
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let running = false;

  const session =
    typeof navigator !== 'undefined' && 'mediaSession' in navigator
      ? navigator.mediaSession
      : null;

  const ensureAudio = (): HTMLAudioElement | null => {
    if (typeof document === 'undefined') return null;
    if (audio) return audio;
    const url = createSilentWavUrl();
    if (!url) return null;
    objectUrl = url;
    audio = document.createElement('audio');
    audio.src = url;
    audio.loop = true;
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    audio.setAttribute('aria-hidden', 'true');
    audio.style.display = 'none';
    document.body.appendChild(audio);
    return audio;
  };

  const syncState = (state: PlaybackState) => {
    if (!session) return;
    try {
      session.playbackState = state;
    } catch {
      // ignora
    }
  };

  return {
    start() {
      const element = ensureAudio();
      if (element && !running) {
        running = true;
        try {
          // Em jsdom (testes) play() não existe: não deixar estourar.
          const attempt = element.play();
          if (attempt && typeof attempt.catch === 'function') {
            attempt.catch(() => {
              running = false;
            });
          }
        } catch {
          running = false;
        }
      }
      if (session) {
        setAction('play', () => options.onPlay());
        setAction('pause', () => options.onPause());
        setAction('stop', () => options.onPause());
        setAction('nexttrack', () => options.onNext());
        setAction('previoustrack', () => options.onPrevious());
        setAction('seekbackward', () => options.onPrevious());
        setAction('seekforward', () => options.onNext());
        syncState('playing');
      }
    },

    stop() {
      running = false;
      if (audio) {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          // ignora
        }
      }
      syncState('paused');
    },

    setMetadata(info) {
      if (!session) return;
      try {
        session.metadata = new MediaMetadata({
          title: info.title,
          artist: info.artist,
          album: info.album,
        });
      } catch {
        // MediaMetadata indisponível: a sessão segue sem metadados.
      }
    },

    dispose() {
      running = false;
      if (session) {
        setAction('play', null);
        setAction('pause', null);
        setAction('stop', null);
        setAction('nexttrack', null);
        setAction('previoustrack', null);
        setAction('seekbackward', null);
        setAction('seekforward', null);
        syncState('none');
      }
      if (audio) {
        audio.pause();
        audio.remove();
        audio = null;
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    },
  };
}
