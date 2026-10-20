import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import unlockDefinitions from './game/unlocks/unlocks.json';

import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/600.css';
import '@fontsource/orbitron/800.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './style.css';

import UnlockManager from './game/unlocks/UnlockManager.js';

const unlocks = new UnlockManager({ definitions: unlockDefinitions, storage: 'localStorage' });
window.Unlocks = unlocks;

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    const event = new Event('native-back-button', { cancelable: true });
    if (window.dispatchEvent(event)) void App.exitApp();
  });

  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) window.dispatchEvent(new Event('native-app-inactive'));
  });
}
