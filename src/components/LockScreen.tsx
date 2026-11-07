import { useId, useRef, useState, type FormEvent } from 'react';
import { checkPassword, markUnlocked } from '../lib/gate';
import { LogoIcon, ShieldIcon } from './icons';

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const ok = await checkPassword(value);
    if (ok) {
      markUnlocked();
      onUnlock();
      return;
    }
    setBusy(false);
    setValue('');
    setError('Senha incorreta. Tente novamente.');
    inputRef.current?.focus();
  };

  return (
    <main className="lock-screen">
      <div className="lock-card">
        <span className="lock-card__mark" aria-hidden="true">
          <LogoIcon size={46} />
        </span>
        <h1 className="lock-card__title">Audiobook Marcio</h1>
        <p className="lock-card__tagline">Seus PDFs em audiolivro</p>
        <p className="lock-card__text">
          Este site é particular. Digite a senha para abrir sua biblioteca.
        </p>

        <form className="lock-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="visually-hidden" htmlFor={inputId}>
            Senha do site
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className="text-input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError('');
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            disabled={busy}
          />
          {error ? (
            <p className="lock-error" id={errorId} role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="button button--primary" disabled={busy || value.length === 0}>
            <ShieldIcon size={17} /> {busy ? 'Conferindo…' : 'Entrar'}
          </button>
        </form>

        <p className="lock-card__footer">Nenhum dado sai do seu aparelho</p>
      </div>
    </main>
  );
}
