import type { SpeechStatus } from '../lib/speech';
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  StopIcon,
} from './icons';

interface PlayerBarProps {
  status: SpeechStatus;
  rate: number;
  onToggle: () => void;
  onStop: () => void;
  onPrevChunk: () => void;
  onNextChunk: () => void;
}

/**
 * Controles suspensos: uma pílula vertical à direita, espelhando o rail de
 * ações à esquerda. Sem barra inferior, o texto ocupa a altura toda.
 */
export function PlayerBar({
  status,
  rate,
  onToggle,
  onStop,
  onPrevChunk,
  onNextChunk,
}: PlayerBarProps) {
  const isPlaying = status === 'playing';

  return (
    <section className="player" aria-label="Controles de reprodução">
      <span
        className={`status-dot status-dot--${status} player__status-dot`}
        aria-hidden="true"
      />
      <button
        type="button"
        className="player__play"
        onClick={onToggle}
        aria-label={isPlaying ? 'Pausar reprodução' : 'Reproduzir'}
        title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
      >
        {isPlaying ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={onPrevChunk}
        aria-label="Parágrafo anterior"
        title="Parágrafo anterior (seta esquerda)"
      >
        <PreviousIcon />
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={onNextChunk}
        aria-label="Próximo parágrafo"
        title="Próximo parágrafo (seta direita)"
      >
        <NextIcon />
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={onStop}
        disabled={status === 'idle'}
        aria-label="Parar reprodução"
        title="Parar"
      >
        <StopIcon />
      </button>
      <span className="player__rate" title="Velocidade atual">
        {rate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x
      </span>
    </section>
  );
}
