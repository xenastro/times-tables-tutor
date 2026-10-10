import { useCallback, useEffect, useState } from 'react';
import { getDevice, type DeviceRecord } from '../data/db';
import { t } from '../i18n';
import { navigate } from '../router';
import { Customize } from './Customize';
import { Home } from './Home';
import { LearnerProvider, useLearner } from './LearnerContext';
import { MapScreen } from './MapScreen';
import { LessonScreen } from './LessonScreen';
import { Pairs } from './Pairs';
import { Practice } from './Practice';
import { RowGameScreen } from './RowGame';
import { ReadAloudProvider } from './ReadAloud';
import { Welcome } from './Welcome';

export function ChildApp({ path }: { path: string }) {
  const [device, setDevice] = useState<DeviceRecord | null | undefined>(undefined);

  useEffect(() => {
    void getDevice().then(setDevice);
  }, []);

  const onUnpaired = useCallback(() => {
    setDevice(null);
    navigate('/', { replace: true });
  }, []);

  if (device === undefined) return null;
  if (device === null) return <Welcome onPaired={(d) => { setDevice(d); navigate('/', { replace: true }); }} />;

  return (
    <LearnerProvider device={device} onUnpaired={onUnpaired}>
      <Screens path={path} />
    </LearnerProvider>
  );
}

function Screens({ path }: { path: string }) {
  const { learner, loaded, settings } = useLearner();

  useEffect(() => {
    document.documentElement.dataset.accent = learner.theme;
  }, [learner.theme]);

  if (!loaded) return <main className="screen"><p className="muted">{t('common.loading')}</p></main>;
  return (
    <ReadAloudProvider enabled={settings.readAloud} lang={settings.language}>
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
