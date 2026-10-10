import { useCallback, useEffect, useState } from 'react';
import { api } from '../data/api';
import { getDevice, setDevice as storeDevice, type DeviceRecord } from '../data/db';
import type { LearnerDTO } from '../shared/api';
import { savedParentLanguage, setLocale, t } from '../i18n';
import { navigate } from '../router';
import { Customize } from './Customize';
import { Home } from './Home';
import { LearnerProvider, useLearner } from './LearnerContext';
import { MapScreen } from './MapScreen';
import { LessonScreen } from './LessonScreen';
import { Pairs } from './Pairs';
import { Practice } from './Practice';
import { RowGameScreen } from './RowGame';
import { prefetchArabic } from './arabicVoice';
import { ReadAloudProvider } from './ReadAloud';
import { Welcome } from './Welcome';

export function ChildApp({ path }: { path: string }) {
  const [device, setDevice] = useState<DeviceRecord | null | undefined>(undefined);

  useEffect(() => {
    void getDevice().then(async (saved) => {
      if (saved) return setDevice(saved);
      // The browser may have cleared its storage (Safari does after 7 days away): the server's
      // cookie brings the child back.
      try {
        const r = await api<{ token: string; learner: LearnerDTO }>('POST', '/restore');
        const restored: DeviceRecord = { token: r.token, learner: r.learner, lastSeq: 0 };
        await storeDevice(restored);
        setDevice(restored);
      } catch {
        setDevice(null);
      }
    });
  }, []);

  const onUnpaired = useCallback(() => {
    setDevice(null);
    navigate('/', { replace: true });
  }, []);

  if (device === undefined) return null;
  // Before a phone is linked, use the language the parent area last used on this device.
  if (device === null) setLocale(savedParentLanguage());
  if (device === null) return <Welcome onPaired={(d) => { setDevice(d); navigate('/', { replace: true }); }} />;

  return (
    <LearnerProvider device={device} onUnpaired={onUnpaired}>
      <Screens path={path} />
    </LearnerProvider>
  );
}

function Screens({ path }: { path: string }) {
  const { learner, loaded, settings } = useLearner();
  // The child's language and digits apply to everything rendered below.
  setLocale(settings.language, settings.numerals);

  useEffect(() => {
    document.documentElement.dataset.accent = learner.theme;
  }, [learner.theme]);

  // Arabic is spoken from recorded clips: fetch the ones this learner needs while online.
  useEffect(() => {
    if (settings.language === 'ar') prefetchArabic(true);
    else if (settings.bilingual) prefetchArabic(false);
  }, [settings.language, settings.bilingual]);

  if (!loaded) return <main className="screen"><p className="muted">{t('common.loading')}</p></main>;
  return (
    <ReadAloudProvider learnerId={learner.id} defaultOn={settings.readAloud || settings.bilingual} lang={settings.language}>
      <Screen path={path} />
    </ReadAloudProvider>
  );
}

function Screen({ path }: { path: string }) {
  if (path === '/practice') return <Practice />;
  if (path === '/map') return <MapScreen />;
  if (path === '/me') return <Customize />;
  if (path === '/games/pairs') return <Pairs />;
  if (path === '/games/row') return <RowGameScreen />;
  if (path.startsWith('/lesson/')) return <LessonScreen key={path} id={path.slice('/lesson/'.length)} />;
  return <Home />;
}
