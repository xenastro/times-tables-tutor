import { useState } from 'react';
import { LESSONS, nextLesson, type LessonId } from '../engine/lessons';
import { t } from '../i18n';
import { navigate } from '../router';
import { Lesson } from './Lesson';
import { useLearner } from './LearnerContext';

/** /lesson/<id>: plays one lesson, records it, then offers the next step on the path. */
export function LessonScreen({ id }: { id: string }) {
  const { state, addEvents } = useLearner();
  const [done, setDone] = useState(false);
  const lessonId = (LESSONS as string[]).includes(id) ? (id as LessonId) : null;
  if (!lessonId) {
    navigate('/', { replace: true });
    return null;
  }

  if (!done) {
    return (
      <Lesson
        key={lessonId}
        id={lessonId}
        onExit={() => navigate('/', { replace: true })}
        onDone={() => {
          addEvents([{ type: 'lesson_done', payload: { lesson: lessonId } }]);
          setDone(true);
        }}
      />
    );
  }

  const next = nextLesson([...state.lessonsDone, lessonId]);
  return (
    <main className="screen" style={{ justifyContent: 'center' }}>
      <div className="stack" style={{ textAlign: 'center', alignItems: 'center' }}>
        <div style={{ fontSize: '3rem' }} aria-hidden="true">
          🌟
        </div>
        <h1 style={{ fontSize: '1.6rem' }}>{t('lesson.done')}</h1>
        <p className="muted">{t('lesson.doneNote', { title: t(`lesson.title_${lessonId}`) })}</p>
      </div>
      {next ? (
        <button className="btn btn-primary btn-big" onClick={() => { setDone(false); navigate(`/lesson/${next}`, { replace: true }); }}>
          {t('lesson.next', { title: t(`lesson.title_${next}`) })}
        </button>
      ) : (
        !state.checkup.started && (
          <button className="btn btn-primary btn-big" onClick={() => navigate('/practice', { replace: true })}>
            {t('home.startCheckup')}
          </button>
        )
      )}
      <button className="btn btn-big" onClick={() => navigate('/', { replace: true })}>
        {t('summary.home')}
      </button>
    </main>
  );
}
