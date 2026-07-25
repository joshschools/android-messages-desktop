const PINNED_CONTAINER_ID = 'amd-pinned-conversations';
const STYLE_ID = 'amd-pinned-conversations-style';
const STORAGE_KEY = 'android-messages-desktop-pins-v1';
const MAX_PINNED_CONVERSATIONS = 8;

let activeMenuConversation = null;

const styles = `
  #${PINNED_CONTAINER_ID} {
    --amd-pinned-name: #202124;
    --amd-pinned-muted: #5f6368;
    box-sizing: border-box;
    padding: 12px 12px 10px;
    border-bottom: 1px solid rgba(127, 127, 127, 0.2);
  }

  #${PINNED_CONTAINER_ID}[hidden] {
    display: none;
  }

  .amd-pinned-heading {
    margin: 0 4px 10px;
    color: var(--amd-pinned-muted);
    font: 500 12px/16px sans-serif;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .amd-pinned-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .amd-pinned-item {
    position: relative;
    min-width: 0;
  }

  .amd-pinned-button {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: center;
  }

  .amd-pinned-remove {
    position: absolute;
    top: -4px;
    right: 4px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 2px solid #fff;
    border-radius: 50%;
    background: #5f6368;
    color: #fff;
    cursor: pointer;
    font: 700 14px/1 sans-serif;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .amd-pinned-item:hover .amd-pinned-remove,
  .amd-pinned-remove:focus-visible {
    opacity: 1;
  }

  .amd-pinned-button:focus-visible {
    outline: 2px solid #0b57d0;
    outline-offset: 3px;
    border-radius: 12px;
  }

  .amd-pinned-avatar {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    margin: 0 auto 5px;
    overflow: hidden;
    border-radius: 50%;
    background: #d3e3fd;
    color: #0b57d0;
    font: 500 20px/1 sans-serif;
  }

  .amd-pinned-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .amd-pinned-name {
    display: block;
    overflow: hidden;
    color: var(--amd-pinned-name);
    font: 500 12px/16px sans-serif;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  mws-conversation-list-item.amd-pinned-source {
    display: none;
  }

  .amd-pinned-context-menu {
    position: fixed;
    z-index: 10000;
    min-width: 140px;
    padding: 8px 0;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  }

  .amd-pinned-context-menu button {
    width: 100%;
    padding: 10px 16px;
    border: 0;
    background: transparent;
    color: #202124;
    cursor: pointer;
    font: 400 14px/20px sans-serif;
    text-align: left;
  }

  .amd-pinned-context-menu button:hover,
  .amd-pinned-context-menu button:focus-visible {
    background: rgba(127, 127, 127, 0.16);
    outline: none;
  }

  body.dark-mode #${PINNED_CONTAINER_ID} {
    --amd-pinned-muted: #bdc1c6;
    --amd-pinned-name: #e8eaed;
  }

  body.dark-mode .amd-pinned-context-menu {
    background: #3c4043;
  }

  body.dark-mode .amd-pinned-context-menu button {
    color: #e8eaed;
  }
`;

const readPinState = () => {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (state && Array.isArray(state.pins) && Array.isArray(state.hiddenGooglePins)) {
      return state;
    }
  } catch (error) {
    // Ignore malformed state and start with Google's current pins.
  }
  return { pins: [], hiddenGooglePins: [] };
};

const writePinState = (state) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const getConversationDetails = (item) => {
  const link = item.querySelector('a.list-item[href^="/web/conversations/"]');
  const nameElement = item.querySelector('.profile-name, h2.name');
  if (!link || !nameElement) {
    return null;
  }

  const name = nameElement.textContent.trim();
  const href = link.getAttribute('href');
  if (!name || !href) {
    return null;
  }

  const canvas = item.querySelector('.avatar-container canvas');
  let avatar = null;
  try {
    avatar = canvas ? canvas.toDataURL('image/png') : null;
  } catch (error) {
    // Canvas export is best-effort. Initials remain as the fallback.
  }

  return {
    href,
    name,
    avatar,
    googlePinned: Boolean(item.querySelector('mws-icon[aria-label="Pinned"]')),
    sourceLink: link,
    sourceItem: item
  };
};

const getVisibleConversations = () => Array.from(
  document.querySelectorAll('mws-conversation-list-item')
).map(getConversationDetails).filter(Boolean);

const syncGooglePins = (state, conversations) => {
  let changed = false;
  conversations.filter((conversation) => conversation.googlePinned).forEach((conversation) => {
    if (state.hiddenGooglePins.includes(conversation.href)) {
      return;
    }
    const existing = state.pins.find((pin) => pin.href === conversation.href);
    if (existing) {
      Object.assign(existing, {
        name: conversation.name,
        avatar: conversation.avatar || existing.avatar
      });
    } else {
      state.pins.push({
        href: conversation.href,
        name: conversation.name,
        avatar: conversation.avatar
      });
      changed = true;
    }
  });
  if (changed) {
    writePinState(state);
  }
};

const isPinned = (href) => readPinState().pins.some((pin) => pin.href === href);

const togglePinnedConversation = (conversation) => {
  const state = readPinState();
  const pinIndex = state.pins.findIndex((pin) => pin.href === conversation.href);
  if (pinIndex >= 0) {
    state.pins.splice(pinIndex, 1);
    if (!state.hiddenGooglePins.includes(conversation.href)) {
      state.hiddenGooglePins.push(conversation.href);
    }
  } else {
    state.pins.push({
      href: conversation.href,
      name: conversation.name,
      avatar: conversation.avatar
    });
    state.hiddenGooglePins = state.hiddenGooglePins.filter(
      (href) => href !== conversation.href
    );
  }
  writePinState(state);
  renderPinnedConversations();
};

const showPinnedContextMenu = (conversation, x, y) => {
  document.querySelector('.amd-pinned-context-menu')?.remove();

  const menu = document.createElement('div');
  const unpinButton = document.createElement('button');
  menu.className = 'amd-pinned-context-menu';
  menu.setAttribute('role', 'menu');
  unpinButton.type = 'button';
  unpinButton.setAttribute('role', 'menuitem');
  unpinButton.textContent = 'Unpin';
  unpinButton.addEventListener('click', () => {
    menu.remove();
    togglePinnedConversation(conversation);
  });
  menu.appendChild(unpinButton);
  document.body.appendChild(menu);

  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - bounds.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - bounds.height - 8)}px`;
  unpinButton.focus();

  const closeMenu = (event) => {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener('pointerdown', closeMenu, true);
    }
  };
  window.setTimeout(() => document.addEventListener('pointerdown', closeMenu, true), 0);
};

const createPinnedButton = (conversation) => {
  const listItem = document.createElement('li');
  const button = document.createElement('button');
  const removeButton = document.createElement('button');
  const avatar = document.createElement('span');
  const name = document.createElement('span');

  listItem.className = 'amd-pinned-item';
  button.type = 'button';
  button.className = 'amd-pinned-button';
  button.setAttribute('aria-label', `Open conversation with ${conversation.name}`);
  button.title = conversation.name;

  avatar.className = 'amd-pinned-avatar';
  if (conversation.avatar) {
    const image = document.createElement('img');
    image.src = conversation.avatar;
    image.alt = '';
    avatar.appendChild(image);
  } else {
    avatar.textContent = conversation.name.charAt(0).toUpperCase();
  }

  name.className = 'amd-pinned-name';
  name.textContent = conversation.name;
  button.append(avatar, name);
  button.addEventListener('click', () => {
    const currentLink = Array.from(document.querySelectorAll(
      'mws-conversation-list-item a.list-item[href^="/web/conversations/"]'
    )).find((link) => link.getAttribute('href') === conversation.href);

    if (currentLink) {
      currentLink.click();
    } else {
      window.location.assign(conversation.href);
    }
  });
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    showPinnedContextMenu(conversation, event.clientX, event.clientY);
  });

  removeButton.type = 'button';
  removeButton.className = 'amd-pinned-remove';
  removeButton.textContent = '×';
  removeButton.title = 'Unpin';
  removeButton.setAttribute('aria-label', `Unpin ${conversation.name}`);
  removeButton.addEventListener('click', () => {
    togglePinnedConversation(conversation);
  });

  listItem.append(button, removeButton);
  return listItem;
};

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.appendChild(style);
};

const renderPinnedConversations = () => {
  const conversationsList = document.querySelector('mws-conversations-list');
  if (!conversationsList || !conversationsList.parentElement) {
    return;
  }

  ensureStyles();
  document.querySelectorAll('mws-conversation-list-item.amd-pinned-source')
    .forEach((item) => item.classList.remove('amd-pinned-source'));

  const visibleConversations = getVisibleConversations();
  const state = readPinState();
  syncGooglePins(state, visibleConversations);

  const currentByHref = new Map(visibleConversations.map((conversation) => [
    conversation.href,
    conversation
  ]));
  const conversations = state.pins.slice(0, MAX_PINNED_CONVERSATIONS).map((pin) => ({
    ...pin,
    ...currentByHref.get(pin.href)
  }));
  conversations.forEach((conversation) => {
    if (conversation.sourceItem) {
      conversation.sourceItem.classList.add('amd-pinned-source');
    }
  });
  let container = document.getElementById(PINNED_CONTAINER_ID);
  if (!container) {
    container = document.createElement('section');
    container.id = PINNED_CONTAINER_ID;
    container.setAttribute('aria-label', 'Pinned conversations');
    conversationsList.parentElement.insertBefore(container, conversationsList);
  }

  container.replaceChildren();
  container.hidden = conversations.length === 0;
  if (!conversations.length) {
    return;
  }

  const heading = document.createElement('h2');
  const list = document.createElement('ul');
  heading.className = 'amd-pinned-heading';
  heading.textContent = 'Pinned';
  list.className = 'amd-pinned-list';
  conversations.forEach((conversation) => list.appendChild(createPinnedButton(conversation)));
  container.append(heading, list);
};

const injectPinMenuItem = () => {
  if (!activeMenuConversation) {
    return;
  }

  const menuContents = Array.from(document.querySelectorAll('.mat-mdc-menu-content'))
    .filter((menu) => menu.getClientRects().length > 0);
  const menu = menuContents[menuContents.length - 1];
  if (!menu || menu.querySelector('.amd-pin-menu-item')) {
    return;
  }

  const button = document.createElement('button');
  const label = document.createElement('span');
  button.type = 'button';
  button.className = 'mat-mdc-menu-item mat-mdc-focus-indicator amd-pin-menu-item';
  button.setAttribute('role', 'menuitem');
  button.setAttribute('tabindex', '0');
  label.className = 'mat-mdc-menu-item-text';
  label.textContent = isPinned(activeMenuConversation.href)
    ? 'Unpin'
    : 'Pin';
  button.appendChild(label);
  button.addEventListener('click', () => {
    togglePinnedConversation(activeMenuConversation);
    const backdrop = document.querySelector('.cdk-overlay-backdrop');
    if (backdrop) {
      backdrop.click();
    }
  });
  menu.appendChild(button);
};

export const initializePinnedConversations = () => {
  let renderTimer = null;
  const scheduleRender = () => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      renderPinnedConversations();
      injectPinMenuItem();
    }, 100);
  };

  document.addEventListener('click', (event) => {
    const menuButton = event.target.closest('mws-conversation-list-item-menu button');
    if (!menuButton) {
      return;
    }
    const item = menuButton.closest('mws-conversation-list-item');
    activeMenuConversation = item ? getConversationDetails(item) : null;
    window.setTimeout(injectPinMenuItem, 0);
  }, true);

  scheduleRender();
  const observer = new MutationObserver((mutations) => {
    if (mutations.every((mutation) => mutation.target.closest
      && mutation.target.closest(`#${PINNED_CONTAINER_ID}`))) {
      return;
    }
    scheduleRender();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label']
  });
};
