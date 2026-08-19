// Centralized URL validation used to keep page-controlled URLs from reaching
// dangerous sinks (shell.openExternal, webview navigation, downloads).

// Schemes considered safe to hand to the OS via shell.openExternal. Notably
// excludes file:, and any custom/again OS-handled protocol that could launch
// local executables or reach UNC paths.
const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

// Origins the embedded webview is allowed to navigate to. Anything else is
// treated as an external link (opened in the user's browser) or blocked.
const ALLOWED_NAVIGATION_HOSTS = new Set([
  'messages.google.com',
  'accounts.google.com',
  'accounts.youtube.com'
]);

// Schemes allowed when saving media from the webview's context menu.
const SAFE_DOWNLOAD_PROTOCOLS = new Set(['https:', 'blob:', 'data:']);

const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const isSafeExternalUrl = (value) => {
  const url = parseUrl(value);
  return Boolean(url) && SAFE_EXTERNAL_PROTOCOLS.has(url.protocol);
};

export const isAllowedNavigationUrl = (value) => {
  const url = parseUrl(value);
  return Boolean(url)
    && (url.protocol === 'https:' || url.protocol === 'http:')
    && ALLOWED_NAVIGATION_HOSTS.has(url.hostname);
};

export const isSafeDownloadUrl = (value) => {
  const url = parseUrl(value);
  return Boolean(url) && SAFE_DOWNLOAD_PROTOCOLS.has(url.protocol);
};

export const isMessagesOrigin = (value) => {
  const url = parseUrl(value);
  return Boolean(url) && url.protocol === 'https:' && url.hostname === 'messages.google.com';
};
