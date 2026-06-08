import env from 'env';

// Operating system
const osName = process.platform;
const IS_WINDOWS = (osName === 'win32');
const IS_MAC = (osName === 'darwin');
const IS_LINUX = (osName === 'linux');

// Environment
const IS_DEV = (env.name === 'development');

// The web app the desktop wrapper points at.
const MESSAGES_URL = 'https://messages.google.com/web/';

// Settings
const SETTING_TRAY_ENABLED = 'trayEnabledPref';
const SETTING_TRAY_CLICK_SHORTCUT = 'trayClickShortcut';

// Events
const EVENT_WEBVIEW_NOTIFICATION = 'messages-webview-notification';
const EVENT_NOTIFICATION_CLICK = 'messages-notification-click';
const EVENT_BRIDGE_INIT = 'messages-bridge-init';
const EVENT_UPDATE_USER_SETTING = 'messages-update-user-setting';
const EVENT_MAIN_WINDOW_FOCUS = 'messages-main-window-focus';

export {
    osName,
    IS_WINDOWS,
    IS_MAC,
    IS_LINUX,
    IS_DEV,
    MESSAGES_URL,
    SETTING_TRAY_ENABLED,
    SETTING_TRAY_CLICK_SHORTCUT,
    EVENT_WEBVIEW_NOTIFICATION,
    EVENT_NOTIFICATION_CLICK,
    EVENT_BRIDGE_INIT,
    EVENT_UPDATE_USER_SETTING,
    EVENT_MAIN_WINDOW_FOCUS
};
