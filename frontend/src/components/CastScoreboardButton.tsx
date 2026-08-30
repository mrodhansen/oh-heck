import { useEffect, useMemo, useState } from 'react';
import type { GameDetail } from '../api';
import { getCastAppId, isCastUserCancel } from '../cast/snapshot';
import { sendCastBoard, startCastSession } from '../cast/sender';
import { currentTvScoreboardHref } from '../cast/tvUrl';
import {
  banner,
  btnClass,
  cn,
  iconBtn,
  modal,
  modalBackdrop,
  sectionTitle,
  stack,
} from '../ui';

type Props = {
  game: GameDetail;
};

export function CastScoreboardButton({ game }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const href = useMemo(() => currentTvScoreboardHref(game.id), [game.id]);

  useEffect(() => {
    void sendCastBoard(game).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Could not update TV');
    });
  }, [game]);

  function close() {
    setOpen(false);
    setError(null);
    setCopied(false);
  }

  async function copyLink() {
    setError(null);
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(`Link: ${href}`);
    }
  }

  function openTvBoard() {
    setError(null);
    const popup = window.open(href, 'oh-heck-tv');
    if (!popup) {
      setError('Pop-up blocked — copy the link or allow pop-ups.');
      return;
    }
    close();
  }

  async function castToTv() {
    setBusy(true);
    setError(null);
    try {
      await startCastSession(getCastAppId());
      await sendCastBoard(game);
      close();
    } catch (e) {
      if (isCastUserCancel(e)) return;
      setError(e instanceof Error ? e.message : 'Could not Cast to TV');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={iconBtn}
        aria-label="Cast scoreboard"
        title="Cast scoreboard"
        onClick={() => {
          setError(null);
          setCopied(false);
          setOpen(true);
        }}
      >
        <CastIcon />
      </button>
      {open ? (
        <div className={modalBackdrop} onClick={close} role="presentation">
          <div
            className={cn(modal, stack)}
            role="dialog"
            aria-labelledby="cast-scoreboard-title"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="cast-scoreboard-title" className={cn(sectionTitle, 'm-0')}>
              Cast scoreboard
            </p>
            {error ? <div className={banner}>{error}</div> : null}
            <button
              type="button"
              className={btnClass({ kind: 'primary', block: true })}
              disabled={busy}
              onClick={() => void castToTv()}
            >
              {busy ? '…' : 'Cast to TV'}
            </button>
            <button type="button" className={btnClass({ block: true })} onClick={openTvBoard}>
              Open TV board
            </button>
            <button
              type="button"
              className={btnClass({ kind: 'ghost', block: true })}
              onClick={() => void copyLink()}
            >
              {copied ? 'Copied' : 'Copy TV link'}
            </button>
            <button type="button" className={btnClass({ kind: 'ghost', block: true })} onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CastIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1 18v3h3c0-1.66-1.34-3-3-3m0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7m0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11m20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
      />
    </svg>
  );
}
