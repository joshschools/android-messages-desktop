// Right-click context menu for the embedded Google Messages webview.
//
// Electron has shipped a built-in spellchecker since v8, so the spelling
// suggestions, the misspelled word and the "add to dictionary" action are all
// provided directly on the `context-menu` event params. This replaces the old
// electron-hunspell + remote-based menu that used to live in the webview
// preload, and keeps all privileged Menu work in the main process.

import { Menu, BrowserWindow } from 'electron';
import { isSafeDownloadUrl } from './url_security';

const buildSpellingSection = (contents, params) => {
  const items = [];
  const { misspelledWord, dictionarySuggestions = [] } = params;

  if (!misspelledWord) {
    return items;
  }

  if (dictionarySuggestions.length) {
    dictionarySuggestions.slice(0, 8).forEach((suggestion) => {
      items.push({
        label: suggestion,
        click: () => contents.replaceMisspelling(suggestion)
      });
    });
    items.push({ type: 'separator' });
  }

  items.push({
    label: `Add "${misspelledWord}" to Dictionary`,
    click: () => contents.session.addWordToSpellCheckerDictionary(misspelledWord)
  });
  items.push({ type: 'separator' });

  return items;
};

export const attachContextMenu = (contents) => {
  contents.on('context-menu', (event, params) => {
    const template = [];

    // Offer to save right-clicked images/videos, but only for safe schemes.
    if ((params.mediaType === 'image' || params.mediaType === 'video') && isSafeDownloadUrl(params.srcURL)) {
      const mediaType = params.mediaType[0].toUpperCase() + params.mediaType.slice(1);
      template.push({
        label: `Save ${mediaType} As...`,
        click: () => contents.downloadURL(params.srcURL)
      });
    } else if (params.isEditable) {
      template.push(...buildSpellingSection(contents, params));
      template.push(
        { label: 'Undo', role: 'undo', enabled: params.editFlags.canUndo },
        { label: 'Redo', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll' }
      );
    } else {
      template.push(
        { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll' }
      );
    }

    if (!template.length) {
      return;
    }

    const menu = Menu.buildFromTemplate(template);
    const window = BrowserWindow.fromWebContents(contents.hostWebContents || contents);
    menu.popup(window ? { window } : undefined);
  });
};
