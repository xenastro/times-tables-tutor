import { useCallback, useEffect, useMemo, useState } from 'react';
import { LessonPicture } from '../components/LessonPicture';
import { ExprView, exprText } from '../components/StrategyView';
import { lessonFor, type LessonId } from '../engine/lessons';
import { n, t } from '../i18n';
import { NumberPad } from './NumberPad';
import { SayAgain, spokenExpr, stopSpeaking, useReadAloud } from './ReadAloud';

/**
 * One "Understand" lesson: a picture that grows a group, row or jump at a time, and one number
 * to type at each step. A first slip asks to count again (the picture is countable); a second
 * shows the number to type, as in the guides.
 */
export function Lesson({ id, onExit, onDone }: { id: LessonId; onExit: () => void; onDone: () => void }) {
  const lesson = useMemo(() => lessonFor(id), [id]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState(false);
  const step = lesson.steps[idx];
  const { say } = useReadAloud();

  const speech = `${t(`lesson.${step.text}`, step.vars)} ${step.expr ? spokenExpr(step.expr) : ''}`;
  useEffect(() => {
    say(speech);
  }, [say, speech]);
  useEffect(() => () => stopSpeaking(), []);

  const check = useCallback(
    (value: number) => {
      if (value === step.answer) {
        setFlash(true);
        window.setTimeout(() => {
          setFlash(false);
          setInput('');
          setMisses(0);
          if (idx + 1 >= lesson.steps.length) onDone();
          else setIdx(idx + 1);
        }, 450);
      } else {
        setInput('');
        setMisses((m) => m + 1);
        say(misses === 0 ? t('lesson.countAgain') : t('guide.wrong', { v: step.answer }));
      }
    },
    [idx, lesson.steps.length, misses, onDone, say, step.answer],
  );

  const press = useCallback(
    (key: string) => {
      if (flash) return;
      if (key === 'back') return setInput((s) => s.slice(0, -1));
      if (key === 'enter') {
        if (input) check(Number(input));
        return;
      }
      const next = (input + key).replace(/^0+(?=\d)/, '').slice(0, 3);
      setInput(next);
      if (next.length >= String(step.answer).length) check(Number(next));
    },
    [check, flash, input, step.answer],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('enter');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const box = <span className={`guide-input${flash ? ' good' : ''}`}>{input ? n(input) : flash ? n(step.answer) : '?'}</span>;

  return (
    <main className="practice">
      <div className="practice-top">
        <button className="icon-btn" aria-label={t('practice.exit')} title={t('practice.exit')} onClick={onExit}>
          ✕
        </button>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((idx / lesson.steps.length) * 100)}>
          <div style={{ width: `${(idx / lesson.steps.length) * 100}%` }} />
        </div>
        <SayAgain text={speech} />
      </div>
      <div className="guide">
        <div className="guide-head">
          <p className="kicker">{t(`lesson.title_${id}`)}</p>
        </div>
        <div className="guide-body">
          <div className="guide-step lesson-step">
            <p className="guide-text">{t(`lesson.${step.text}`, step.vars)}</p>
            <LessonPicture picture={step.picture} />
            <p
              className="guide-expr num"
              dir="ltr"
              data-expr={step.expr ? exprText(step.expr) : `count ${step.answer}`}
            >
              {step.expr ? (
                <>
                  <span key={idx}>
                    <ExprView expr={step.expr} />
                  </span>{' '}
                  = {box}
                </>
              ) : (
                <>
                  <span className="lesson-count">{t('lesson.count')}</span> {box}
                </>
              )}
            </p>
            {misses > 0 && (
              <p className="guide-note" role="status">
                {misses === 1 ? t('lesson.countAgain') : t('guide.wrong', { v: step.answer })}
              </p>
            )}
          </div>
        </div>
        <NumberPad onPress={press} disabled={flash} canSubmit={input.length > 0} compact />
      </div>
    </main>
  );
}
