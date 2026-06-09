// Thin wrapper around electron-settings.
//
// electron-settings v4 dropped the synchronous get-with-default signature and
// removed the `.watch()` API that the rest of the app was built around. This
// module restores that ergonomics on top of the v4 synchronous API and adds a
// lightweight watcher backed by an EventEmitter, since every settings write in
// this app goes through here in the single main process.

import { EventEmitter } from 'events';
import electronSettings from 'electron-settings';

const emitter = new EventEmitter();
// Many menu items / managers watch settings; avoid the default 10-listener warning.
emitter.setMaxListeners(0);

const get = (keyPath, defaultValue = undefined) => {
  const value = electronSettings.getSync(keyPath);
  return value === undefined ? defaultValue : value;
};

const set = (keyPath, value) => {
  const oldValue = electronSettings.getSync(keyPath);
  electronSettings.setSync(keyPath, value);
  emitter.emit(keyPath, value, oldValue);
};

const has = (keyPath) => electronSettings.hasSync(keyPath);

const unset = (keyPath) => {
  electronSettings.unsetSync(keyPath);
  emitter.emit(keyPath, undefined);
};

// Returns an unsubscribe function, mirroring how the app previously relied on
// electron-settings' watcher semantics: callback(newValue, oldValue).
const watch = (keyPath, callback) => {
  emitter.on(keyPath, callback);
  return () => emitter.removeListener(keyPath, callback);
};

export default { get, set, has, unset, watch };
