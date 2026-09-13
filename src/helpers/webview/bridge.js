// This script is injected into the Google Messages webview as a preload.

import { ipcRenderer } from 'electron';
import { EVENT_WEBVIEW_NOTIFICATION, EVENT_NOTIFICATION_CLICK, EVENT_BRIDGE_INIT, EVENT_UPDATE_USER_SETTING } from '../../constants';
import { isObject } from '../utilities';
import InputManager from './input_manager';
import { initializePinnedConversations } from './pinned_conversations';

window.addEventListener('load', () => {
    initializePinnedConversations();

    // Without observing the DOM, we don't have a reliable way to let the main
    // process know once (and only once) that the main part of the app (not the
    // QR code login screen) has loaded.
    const onMutation = (mutationsList, observer) => {
        if (document.querySelector('mw-main-nav')) { // definitely logged-in if this is in the DOM
            ipcRenderer.send(EVENT_BRIDGE_INIT);
            observer.disconnect();
        }
    };

    if (document.body) {
        const observer = new MutationObserver(onMutation);
        observer.observe(document.body, { childList: true, attributes: true });
    }
});

ipcRenderer.on(EVENT_UPDATE_USER_SETTING, (event, settingsList) => {
    if (isObject(settingsList)) {
        if ('useDarkMode' in settingsList && settingsList.useDarkMode !== null) {
            // Google's web app drives its dark theme entirely off this class.
            document.body.classList.toggle('dark-mode', Boolean(settingsList.useDarkMode));
        }
        if ('enterToSend' in settingsList) {
            InputManager.handleEnterPrefToggle(settingsList.enterToSend);
        }
    }
});

/*
 * Forward Google Messages notifications to the main process so we can render
 * our own native Electron notifications instead of the ones Chromium would show.
 *
 * Modern Google Messages fires notifications through the service worker's
 * ServiceWorkerRegistration.showNotification() rather than `new Notification()`,
 * so we intercept BOTH. We also make the page believe notification permission is
 * granted (the OS-level permission stays denied so Chromium never shows its own
 * duplicate) — otherwise Google's code checks the permission and never fires.
 */
const OriginalBrowserNotification = Notification;
let pendingClickListener = null;

ipcRenderer.on(EVENT_NOTIFICATION_CLICK, () => {
    if (typeof pendingClickListener === 'function') {
        pendingClickListener();
    }
});

const forwardNotification = (title, options) => {
    ipcRenderer.send(EVENT_WEBVIEW_NOTIFICATION, { title, options: options || {} });
};

// 1) Intercept page-context `new Notification(...)`.
Notification = function (title, options) {
    let notification = null;
    try {
        notification = new OriginalBrowserNotification(title, options);
        const originalAddEventListener = notification.addEventListener.bind(notification);
        notification.addEventListener = function (type, listener, opts) {
            if (type === 'click') {
                pendingClickListener = listener;
            } else {
                originalAddEventListener(type, listener, opts);
            }
        };
    } catch {
        // OS-level notification permission is denied; that's expected. We still
        // forward to the main process below.
    }

    forwardNotification(title, options);
    return notification;
};
Notification.prototype = OriginalBrowserNotification.prototype;
// Make the page think it's allowed to show notifications so it actually fires them.
Notification.permission = 'granted';
Notification.requestPermission = (callback) => {
    if (typeof callback === 'function') {
        callback('granted');
    }
    return Promise.resolve('granted');
};

// 2) Intercept service-worker `registration.showNotification(...)`, which is how
//    Google Messages shows notifications while the app is open.
if (typeof ServiceWorkerRegistration !== 'undefined'
    && ServiceWorkerRegistration.prototype
    && ServiceWorkerRegistration.prototype.showNotification) {
    ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
        forwardNotification(title, options);
        return Promise.resolve();
    };
}

// 3) Report the notifications permission as granted to `navigator.permissions.query`,
//    which some code paths consult instead of `Notification.permission`.
if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    const originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (descriptor) => {
        if (descriptor && descriptor.name === 'notifications') {
            return Promise.resolve({
                state: 'granted',
                status: 'granted',
                onchange: null,
                addEventListener() {},
                removeEventListener() {},
                dispatchEvent() { return false; }
            });
        }
        return originalQuery(descriptor);
    };
}
