import './stylesheets/main.css';

import path from 'path';
import url from 'url';
import { ipcRenderer } from 'electron';
import { EVENT_UPDATE_USER_SETTING, EVENT_MAIN_WINDOW_FOCUS, MESSAGES_URL, IS_DEV, IS_MAC } from './constants';

const state = {
  loaded: false
};

const androidMessagesWebview = document.getElementById('androidMessagesWebview');
const loader = document.getElementById('loader');

androidMessagesWebview.addEventListener('did-stop-loading', () => { // coincident with onLoad, can fire multiple times
  if (!state.loaded) {
    state.loaded = true;
    loader.classList.add('hidden');
    if (IS_DEV) {
      androidMessagesWebview.openDevTools();
    }
  }
});

androidMessagesWebview.addEventListener('dom-ready', () => {
  // Center the title so it isn't covered by the traffic lights on macOS.
  // TODO: Use CSS that doesn't rely on Google's obfuscated class names.
  if (IS_MAC) {
    androidMessagesWebview.insertCSS('.main-nav-header .logo {text-align:center; transform: translateX(10px)}');
  }
});

// Forward updated settings from the main process down into the webview preload.
ipcRenderer.on(EVENT_UPDATE_USER_SETTING, (event, settingsList) => {
  androidMessagesWebview.send(EVENT_UPDATE_USER_SETTING, settingsList);
});

// When the app window regains focus, make sure the webview gets a focus event
// too, so automatic text-input focus keeps working.
ipcRenderer.on(EVENT_MAIN_WINDOW_FOCUS, () => {
  androidMessagesWebview.dispatchEvent(new Event('focus'));
});

// Configure and load the webview. Electron requires the webview preload to be an
// absolute file: URL. The OS sandbox stays ENABLED for the remote content; we keep
// only contextIsolation off, which the preload needs to override the guest page's
// Notification implementation (ipcRenderer remains available in a sandboxed preload).
const preloadUrl = url.pathToFileURL(path.join(__dirname, 'bridge.js')).toString();
// allowpopups lets setWindowOpenHandler intercept target="_blank" links so they
// open in the system browser instead of being silently blocked.
androidMessagesWebview.setAttribute('allowpopups', '');
androidMessagesWebview.setAttribute('preload', preloadUrl);
androidMessagesWebview.setAttribute('webpreferences', 'contextIsolation=no, sandbox=yes, nodeIntegration=no');
androidMessagesWebview.setAttribute('src', MESSAGES_URL);
