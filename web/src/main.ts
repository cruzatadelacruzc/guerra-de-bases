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

import UnlockManager from './game/unlocks/UnlockManager.ts';
import { createGameRuntime } from './GameApplication.ts';
import { GameUI } from './ui/GameUI.ts';

const unlocks = new UnlockManager({ definitions: unlockDefinitions, storage: 'localStorage' });

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    const event = new Event('native-back-button', { cancelable: true });
    if (window.dispatchEvent(event)) void App.exitApp();
  });

  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) window.dispatchEvent(new Event('native-app-inactive'));
  });
}

const appRoot = document.getElementById('app');
if (!(appRoot instanceof HTMLElement)) {
  throw new Error('Application root #app is missing');
}

const gameUi = new GameUI(appRoot);
gameUi.mount();
createGameRuntime(gameUi, unlocks);
