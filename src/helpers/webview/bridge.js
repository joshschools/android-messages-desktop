// This script is injected into the Google Messages webview as a preload.

import { ipcRenderer } from 'electron';
import { EVENT_WEBVIEW_NOTIFICATION, EVENT_NOTIFICATION_CLICK, EVENT_BRIDGE_INIT, EVENT_UPDATE_USER_SETTING } from '../../constants';
import { isObject } from '../utilities';
import InputManager from './input_manager';

window.addEventListener('load', () => {
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
 * Override the webview's Notification class so we can render our own native
 * Electron notifications (with custom click handling) instead of the ones
 * Chromium would show. We still preserve Google's own click listener, which
 * highlights the conversation a notification belongs to: the main process tells
 * us (via EVENT_NOTIFICATION_CLICK) when our native notification is clicked, and
 * we invoke Google's stored listener at that point.
 */
const OriginalBrowserNotification = Notification;
let pendingClickListener = null;

ipcRenderer.on(EVENT_NOTIFICATION_CLICK, () => {
    if (typeof pendingClickListener === 'function') {
        pendingClickListener();
    }
});

Notification = function (title, options) {
    const notification = new OriginalBrowserNotification(title, options);

    const originalAddEventListener = notification.addEventListener.bind(notification);
    notification.addEventListener = function (type, listener, opts) {
        if (type === 'click') {
            pendingClickListener = listener;
        } else {
            originalAddEventListener(type, listener, opts);
        }
    };

    ipcRenderer.send(EVENT_WEBVIEW_NOTIFICATION, { title, options });

    return notification;
};
Notification.prototype = OriginalBrowserNotification.prototype;
Notification.permission = OriginalBrowserNotification.permission;
Notification.requestPermission = OriginalBrowserNotification.requestPermission.bind(OriginalBrowserNotification);
