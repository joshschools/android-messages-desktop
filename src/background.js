// This is main process of Electron, started as first thing when your
// app starts. It runs through entire life of your application.
// It doesn't have any windows which you can see on screen, but we can open
// window from here.

import path from 'path';
import url from 'url';
import { app, Menu, ipcMain, Notification, shell, nativeTheme } from 'electron';
import { autoUpdater } from 'electron-updater';
import { baseMenuTemplate } from './menu/base_menu_template';
import { devMenuTemplate } from './menu/dev_menu_template';
import { helpMenuTemplate } from './menu/help_menu_template';
import createWindow from './helpers/window';
import TrayManager from './helpers/tray/tray_manager';
import { attachContextMenu } from './helpers/webview_context_menu';
import { isSafeExternalUrl, isAllowedNavigationUrl, isMessagesOrigin } from './helpers/url_security';
import settings from './helpers/settings_manager';
import {
  IS_MAC,
  IS_WINDOWS,
  IS_LINUX,
  IS_DEV,
  SETTING_TRAY_ENABLED,
  SETTING_TRAY_CLICK_SHORTCUT,
  EVENT_WEBVIEW_NOTIFICATION,
  EVENT_NOTIFICATION_CLICK,
  EVENT_BRIDGE_INIT,
  EVENT_UPDATE_USER_SETTING,
  EVENT_MAIN_WINDOW_FOCUS
} from './constants';

// Special module holding environment variables which you declared
// in config/env_xxx.json file.
import env from 'env';

const state = {
  unreadNotificationCount: 0,
  notificationSoundEnabled: true,
  notificationContentHidden: false,
  bridgeInitDone: false,
  useSystemDarkMode: true
};

let mainWindow = null;
let webviewContents = null;

const updateUnreadBadge = () => {
  // Electron maps this to the macOS dock badge and to launcher badges on
  // supported Linux desktop environments. Unsupported platforms simply return
  // false, so the existing Windows tray overlay remains the fallback there.
  app.setBadgeCount(state.unreadNotificationCount);
};

const clearUnreadNotifications = () => {
  state.unreadNotificationCount = 0;
  updateUnreadBadge();
};

// Permissions the Google Messages web app legitimately needs. Everything else
// (geolocation, midi, hid, serial, usb, idle-detection, etc.) is denied, and
// notifications are handled separately since we render our own.
const ALLOWED_PERMISSIONS = new Set([
  'media',
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
  'background-sync'
]);

// Prevent multiple instances of the app which causes many problems with an app like ours
// Without this, if an instance were minimized to the tray in Windows, clicking a shortcut would launch another instance, icky
const isFirstInstance = app.requestSingleInstanceLock();

if (!isFirstInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });

  let trayManager = null;

  const setApplicationMenu = () => {
    const menus = baseMenuTemplate;
    if (env.name !== 'production') {
      menus.push(devMenuTemplate);
    }
    menus.push(helpMenuTemplate);
    Menu.setApplicationMenu(Menu.buildFromTemplate(menus));
  };

  // Save userData in separate folders for each environment.
  // Thanks to this you can use production and development versions of the app
  // on same machine like those are two separate apps.
  if (env.name !== 'production') {
    const userDataPath = app.getPath('userData');
    app.setPath('userData', `${userDataPath} (${env.name})`);
  }

  if (IS_WINDOWS) {
    // Needed to let notifications come through on Windows.
    // See: https://github.com/electron/electron/issues/10864#issuecomment-382519150
    app.setAppUserModelId('com.knepper.android-messages-desktop');
    app.setAsDefaultProtocolClient('android-messages-desktop');
  }

  const configureWebview = (contents) => {
    webviewContents = contents;

    // Enable Electron's built-in spellchecker for the user's locale, if a
    // matching dictionary is available.
    try {
      const available = contents.session.availableSpellCheckerLanguages || [];
      const locale = app.getLocale();
      const base = locale.split('-')[0];
      const match = available.includes(locale)
        ? locale
        : available.find((language) => language.split('-')[0] === base);
      if (match) {
        contents.session.setSpellCheckerLanguages([match]);
      }
    } catch {
      // Spellchecking is best-effort; ignore unsupported locales.
    }

    attachContextMenu(contents);

    // Deny notification permission (we render our own native notifications),
    // restrict everything to the Google Messages origin, and only allow the
    // narrow set of permissions the web app actually needs.
    const permissionCheck = (requestingUrl, permission) => {
      if (permission === 'notifications') {
        return false;
      }
      if (!isMessagesOrigin(requestingUrl)) {
        return false;
      }
      return ALLOWED_PERMISSIONS.has(permission);
    };
    contents.session.setPermissionRequestHandler((requestingContents, permission, callback) => {
      callback(permissionCheck(requestingContents.getURL(), permission));
    });
    contents.session.setPermissionCheckHandler((requestingContents, permission, requestingOrigin) => {
      return permissionCheck(requestingOrigin, permission);
    });

    // Open links in the user's default browser instead of a new Electron window,
    // but only for safe schemes (never file:, custom protocols, UNC paths, etc.).
    contents.setWindowOpenHandler(({ url: openUrl }) => {
      if (isSafeExternalUrl(openUrl)) {
        shell.openExternal(openUrl);
      }
      return { action: 'deny' };
    });

    contents.on('destroyed', () => {
      // We will need to re-init the bridge on reload.
      state.bridgeInitDone = false;
      webviewContents = null;
    });

    // Keep the webview pinned to Google's origins. Off-origin navigations are
    // blocked and, when safe, handed to the user's external browser instead.
    contents.on('will-navigate', (event, navigationUrl) => {
      if (navigationUrl === 'https://messages.google.com/web/authentication') {
        // We were logged out; the bridge will re-init when we log back in.
        state.bridgeInitDone = false;
        return;
      }
      if (!isAllowedNavigationUrl(navigationUrl)) {
        event.preventDefault();
        if (isSafeExternalUrl(navigationUrl)) {
          shell.openExternal(navigationUrl);
        }
      }
    });
  };

  app.whenReady().then(() => {
    trayManager = new TrayManager();

    // TODO: Create a preference manager which handles all of these
    const autoHideMenuBar = settings.get('autoHideMenuPref', false);
    const startInTray = settings.get('startInTrayPref', false);
    const notificationSoundEnabled = settings.get('notificationSoundEnabledPref', true);
    const pressEnterToSendEnabled = settings.get('pressEnterToSendPref', true);
    const hideNotificationContent = settings.get('hideNotificationContentPref', false);
    const useSystemDarkMode = settings.get('useSystemDarkModePref', true);
    settings.watch(SETTING_TRAY_ENABLED, trayManager.handleTrayEnabledToggle);
    settings.watch(SETTING_TRAY_CLICK_SHORTCUT, trayManager.handleTrayClickShortcutToggle);
    settings.watch('notificationSoundEnabledPref', (newValue) => {
      state.notificationSoundEnabled = newValue;
    });
    settings.watch('pressEnterToSendPref', (newValue) => {
      mainWindow.webContents.send(EVENT_UPDATE_USER_SETTING, {
        enterToSend: newValue
      });
    });
    settings.watch('hideNotificationContentPref', (newValue) => {
      state.notificationContentHidden = newValue;
    });
    settings.watch('useSystemDarkModePref', (newValue) => {
      state.useSystemDarkMode = newValue;
    });

    setApplicationMenu();
    const menuInstance = Menu.getApplicationMenu();

    if (IS_MAC) {
      app.on('activate', () => {
        mainWindow.show();
      });
    }

    nativeTheme.on('updated', () => {
      if (state.useSystemDarkMode) {
        mainWindow.webContents.send(EVENT_UPDATE_USER_SETTING, {
          useDarkMode: nativeTheme.shouldUseDarkColors
        });
      }
    });

    const trayMenuItem = menuInstance.getMenuItemById('startInTrayMenuItem');
    const enableTrayIconMenuItem = menuInstance.getMenuItemById('enableTrayIconMenuItem');
    const notificationSoundEnabledMenuItem = menuInstance.getMenuItemById('notificationSoundEnabledMenuItem');
    const pressEnterToSendMenuItem = menuInstance.getMenuItemById('pressEnterToSendMenuItem');
    const hideNotificationContentMenuItem = menuInstance.getMenuItemById('hideNotificationContentMenuItem');
    const useSystemDarkModeMenuItem = menuInstance.getMenuItemById('useSystemDarkModeMenuItem');

    if (!IS_MAC) {
      // Sets checked status based on user prefs
      menuInstance.getMenuItemById('autoHideMenuBarMenuItem').checked = autoHideMenuBar;
      trayMenuItem.enabled = trayManager.enabled;
    }

    trayMenuItem.checked = startInTray;
    enableTrayIconMenuItem.checked = trayManager.enabled;

    if (IS_WINDOWS) {
      const trayClickShortcutMenuItem = menuInstance.getMenuItemById('trayClickShortcutMenuItem');
      trayClickShortcutMenuItem.enabled = trayManager.enabled;
      // As of Electron 3 or 4, setting checked property (even to false) of multiple items in radio group results in
      // the first one always being checked, so we have to set it just on the one where checked should == true
      const checkedItemIndex = (trayManager.clickShortcut === 'double-click') ? 0 : 1;
      trayClickShortcutMenuItem.submenu.items[checkedItemIndex].checked = true;
    }

    notificationSoundEnabledMenuItem.checked = notificationSoundEnabled;
    pressEnterToSendMenuItem.checked = pressEnterToSendEnabled;
    hideNotificationContentMenuItem.checked = hideNotificationContent;
    useSystemDarkModeMenuItem.checked = useSystemDarkMode;

    state.notificationSoundEnabled = notificationSoundEnabled;
    state.notificationContentHidden = hideNotificationContent;
    state.useSystemDarkMode = useSystemDarkMode;

    autoUpdater.checkForUpdatesAndNotify();

    const mainWindowOptions = {
      width: 1100,
      height: 800,
      autoHideMenuBar: autoHideMenuBar,
      show: !(startInTray), // Starts in tray if set
      titleBarStyle: IS_MAC ? 'hiddenInset' : 'default', // Turn on hidden frame on a Mac
      webPreferences: {
        // The host renderer mounts a <webview> and bridges IPC to it. It loads
        // only local, trusted content, so node integration is acceptable here.
        contextIsolation: false,
        nodeIntegration: true,
        webviewTag: true
      }
    };

    if (IS_LINUX) {
      // Setting the icon in Linux tends to be finicky without explicitly setting it like this.
      // See: https://github.com/electron/electron/issues/6205
      mainWindowOptions.icon = path.join(__dirname, '..', 'resources', 'icons', '128x128.png');
    }

    mainWindow = createWindow('main', mainWindowOptions);

    mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, 'app.html'),
        protocol: 'file:',
        slashes: true
      })
    );

    trayManager.startIfEnabled();

    app.mainWindow = mainWindow; // Quick and dirty way for the tray manager to access mainWindow

    mainWindow.on('focus', () => {
      clearUnreadNotifications();

      if (IS_WINDOWS && trayManager.overlayVisible) {
        trayManager.toggleOverlay(false);
      }

      // Refocus the webview so text input keeps working.
      mainWindow.webContents.send(EVENT_MAIN_WINDOW_FOCUS);
    });

    ipcMain.on(EVENT_WEBVIEW_NOTIFICATION, (event, msg) => {
      const senderUrl = event.senderFrame && event.senderFrame.url;
      // Only honor notifications that originate from the Google Messages frame.
      if (!isMessagesOrigin(senderUrl)) {
        return;
      }
      if (msg && msg.options) {
        // Only pass through an icon the MAIN process can actually fetch
        // (http/https/data). blob: URLs are renderer-scoped and unresolvable
        // here, and an unresolvable icon can make the notification silently
        // fail to display on Linux.
        const iconCandidate = msg.options.icon;
        const safeIcon = (typeof iconCandidate === 'string' && /^(https?:|data:)/.test(iconCandidate))
          ? iconCandidate
          : undefined;
        const notificationOpts = state.notificationContentHidden ? {
          title: 'Android Messages Desktop',
          body: 'New Message'
        } : {
          title: msg.title,
          icon: safeIcon,
          body: msg.options.body
        };
        notificationOpts.silent = !(state.notificationSoundEnabled);
        const customNotification = new Notification(notificationOpts);

        if (!mainWindow.isFocused()) {
          state.unreadNotificationCount += 1;
          updateUnreadBadge();
        }

        trayManager.toggleOverlay(true);

        customNotification.once('click', () => {
          mainWindow.show();
          // Let the webview run Google's own click handler (highlights the
          // relevant conversation).
          if (webviewContents && !webviewContents.isDestroyed()) {
            webviewContents.send(EVENT_NOTIFICATION_CLICK);
          }
        });

        customNotification.show();
      }
    });

    ipcMain.on(EVENT_BRIDGE_INIT, (event) => {
      if (!isMessagesOrigin(event.senderFrame && event.senderFrame.url)) {
        return;
      }
      if (state.bridgeInitDone) {
        return;
      }

      state.bridgeInitDone = true;
      mainWindow.webContents.send(EVENT_UPDATE_USER_SETTING, {
        enterToSend: pressEnterToSendEnabled,
        useDarkMode: useSystemDarkMode ? nativeTheme.shouldUseDarkColors : null
      });
    });

    let quitViaContext = false;
    app.on('before-quit', () => {
      quitViaContext = true;
    });

    const shouldExitOnMainWindowClosed = () => {
      if (IS_MAC) {
        return quitViaContext;
      }
      if (trayManager.enabled) {
        return quitViaContext;
      }
      return true;
    };

    mainWindow.on('close', (event) => {
      if (!shouldExitOnMainWindowClosed()) {
        event.preventDefault();
        mainWindow.hide();
        trayManager.showMinimizeToTrayWarning();
      } else {
        app.quit(); // If we don't explicitly call this, the webview and mainWindow get destroyed but background process still runs.
      }
    });

    if (IS_DEV) {
      mainWindow.webContents.openDevTools();
    }

    app.on('web-contents-created', (event, contents) => {
      if (contents.getType() === 'webview') {
        configureWebview(contents);
      }
    });
  });
}
