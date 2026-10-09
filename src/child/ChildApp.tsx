import { useCallback, useEffect, useState } from 'react';
import { getDevice, type DeviceRecord } from '../data/db';
import { t } from '../i18n';
import { navigate } from '../router';
import { Customize } from './Customize';
import { Home } from './Home';
import { LearnerProvider, useLearner } from './LearnerContext';
import { MapScreen } from './MapScreen';
import { Practice } from './Practice';
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
  const { learner, loaded } = useLearner();

  useEffect(() => {
    document.documentElement.dataset.accent = learner.theme;
  }, [learner.theme]);

  if (!loaded) return <main className="screen"><p className="muted">{t('common.loading')}</p></main>;
  if (path === '/practice') return <Practice />;
  if (path === '/map') return <MapScreen />;
  if (path === '/me') return <Customize />;
  return <Home />;
}
