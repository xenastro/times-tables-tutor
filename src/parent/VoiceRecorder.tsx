import { useCallback, useEffect, useRef, useState } from 'react';
import { ARABIC_CLIPS, clipWord } from '../engine/arabic';
import { api } from '../data/api';
import { t } from '../i18n';
import type { AudioClipDTO } from '../shared/api';

/** Long enough for one word, short enough to keep each clip a few KB. */
const MAX_MS = 3000;

function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * "Your voice": the parent records each Arabic number word once. Bilingual mode on the child's
 * phone then says questions and answers in this voice (56 → ستة + و + خمسون).
 */
export function VoiceRecorder() {
  const [clips, setClips] = useState<Map<string, number> | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const load = useCallback(async () => {
    try {
      const { clips: list } = await api<{ clips: AudioClipDTO[] }>('GET', '/audio');
      setClips(new Map(list.map((c) => [c.clip, c.updatedAt])));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => stream.current?.getTracks().forEach((tr) => tr.stop());
  }, [load]);

  async function record(clip: string) {
    if (recorder.current) {
      recorder.current.stop();
      return;
    }
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream.current);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        recorder.current = null;
        setRecording(null);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const res = await fetch(`/api/audio/${clip}`, {
          method: 'PUT',
          headers: { 'content-type': blob.type },
          body: blob,
          credentials: 'same-origin',
        });
        if (res.ok) {
          const { updatedAt } = (await res.json()) as AudioClipDTO;
          setClips((m) => new Map(m).set(clip, updatedAt));
          void play(clip);
        } else setError(true);
      };
      recorder.current = rec;
      setRecording(clip);
      rec.start();
      window.setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_MS);
    } catch {
      setError(true);
    }
  }

  async function play(clip: string) {
    const res = await fetch(`/api/audio/${clip}`, { credentials: 'same-origin' });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    void audio.play().catch(() => URL.revokeObjectURL(url));
  }

  async function remove(clip: string) {
    await api('DELETE', `/audio/${clip}`);
    setClips((m) => {
      const next = new Map(m);
      next.delete(clip);
      return next;
    });
  }

  const done = clips ? ARABIC_CLIPS.filter((c) => clips.has(c)).length : 0;

  return (
    <section className="card stack voice">
      <h2>{t('parent.voiceTitle')}</h2>
      <p className="muted small">{t('parent.voiceNote')}</p>
      {!canRecord() ? (
        <p className="muted">{t('parent.voiceNoMic')}</p>
      ) : (
        <details>
          <summary className="voice-summary">{t('parent.voiceProgress', { n: done, total: ARABIC_CLIPS.length })}</summary>
          <ul className="voice-list">
            {ARABIC_CLIPS.map((clip) => {
              const has = clips?.has(clip);
              const label = clip === 'and' ? t('parent.voiceAnd') : clip === 'times' ? t('parent.voiceTimes') : clip;
              return (
                <li key={clip} className={has ? 'has' : ''}>
                  <span className="voice-label">
                    <strong className="num">{label}</strong>
                    <span lang="ar" dir="rtl">
                      {clipWord(clip)}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    {has && <span className="pill good">✓</span>}
                    <button
                      className={`btn btn-small${recording === clip ? ' btn-primary' : ''}`}
                      disabled={!!recording && recording !== clip}
                      onClick={() => void record(clip)}
                      aria-label={`${recording === clip ? t('parent.voiceStop') : t('parent.voiceRecord')} ${clipWord(clip)}`}
                    >
                      {recording === clip ? `■ ${t('parent.voiceStop')}` : `● ${t('parent.voiceRecord')}`}
                    </button>
                    {has && (
                      <>
                        <button className="btn btn-small" onClick={() => void play(clip)} aria-label={`${t('parent.voicePlay')} ${clipWord(clip)}`}>
                          ▶
                        </button>
                        <button className="btn btn-small btn-ghost" onClick={() => void remove(clip)} aria-label={`${t('parent.voiceDelete')} ${clipWord(clip)}`}>
                          ✕
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {error && <p className="error-text">{t('common.error')}</p>}
    </section>
  );
}
