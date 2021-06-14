/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import { BrowserWindow, screen, nativeTheme, app } from 'electron';
import log from 'electron-log';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import minimist from 'minimist';
import { Mode, readFileSync } from 'fs';
import { getAssetPath } from './assets';
import { mainScriptPath, isFile, kenvPath, promptDbPath } from './helpers';
import { Channel, UI } from './enums';
import { getAppHidden } from './appHidden';
import { Choice, PromptData, Script } from './types';
import { getScripts } from './state';
import { emitter, KitEvent } from './events';

let promptScript: Script | null;

const adapter = new FileSync(promptDbPath);
const promptDb = low(adapter);

promptDb.defaults({ screens: {}, clear: false }).write();

let promptWindow: BrowserWindow;
let blurredByKit = false;
let ignoreBlur = false;
let clearPrompt = false;

export const setBlurredByKit = (value = true) => {
  blurredByKit = value;
};

export const setIgnoreBlur = (value = true) => {
  ignoreBlur = value;
};

const miniArgs = minimist(process.argv);
const { devTools } = miniArgs;
log.info(process.argv.join(' '), devTools);

let lastResizedByUser = false;
export const createPromptWindow = async () => {
  promptWindow = new BrowserWindow({
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? '#33000000'
      : '#C0FFFFFF',
    vibrancy: nativeTheme.shouldUseDarkColors ? 'ultra-dark' : 'medium-light',
    show: false,
    hasShadow: true,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      devTools: process.env.NODE_ENV === 'development' || devTools,
      backgroundThrottling: false,
    },
    alwaysOnTop: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    skipTaskbar: true,
  });

  promptWindow.setAlwaysOnTop(true, 'floating', 1);
  promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  promptWindow.loadURL(`file://${__dirname}/index.html`);

  promptWindow.webContents.once('did-finish-load', () => {
    promptWindow?.webContents.closeDevTools();
  });

  promptWindow?.setMaxListeners(2);

  // promptWindow?.webContents.on('before-input-event', (event: any, input) => {
  //   if (input.key === 'Escape') {
  //     if (promptWindow) escapePromptWindow(promptWindow);
  //   }
  // });

  promptWindow?.on('blur', () => {
    if (!ignoreBlur) {
      hidePromptWindow();
    }

    if (
      !ignoreBlur &&
      !getAppHidden() &&
      !promptWindow?.webContents.isDevToolsOpened()
    ) {
      emitter.emit(KitEvent.Blur);
    }
  });

  let timeoutId: NodeJS.Timeout | null = null;
  const userResize = () => {
    lastResizedByUser = true;
    if (timeoutId) clearTimeout(timeoutId);
    if (!promptWindow) return;
    const promptBounds = promptWindow?.getBounds();

    const { width, height } = promptBounds;
    sendToPrompt(Channel.USER_RESIZED, { height, width });
  };

  promptWindow?.on('will-resize', userResize);
  promptWindow?.on('resized', () => {
    timeoutId = setTimeout(() => {
      if (promptWindow?.isVisible()) sendToPrompt(Channel.USER_RESIZED, false);
    }, 500);
  });

  // setInterval(() => {
  //   const [, newHeight] = promptWindow?.getSize() as number[];
  //   const { height: boundsHeight } = promptWindow?.getBounds() as Rectangle;
  //   const {
  //     height: normalBoundsHeight,
  //   } = promptWindow?.getNormalBounds() as Rectangle;
  //   const {
  //     height: contentBoundsHeight,
  //   } = promptWindow?.getContentBounds() as Rectangle;
  //   log.info(
  //     `REPORTING HEIGHT: `,
  //     newHeight,
  //     boundsHeight,
  //     normalBoundsHeight,
  //     contentBoundsHeight
  //   );
  // }, 2000);

  return promptWindow;
};

export const focusPrompt = () => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.focus();
  }
};

export const escapePromptWindow = () => {
  blurredByKit = false;
  hideAppIfNoWindows();
};

const getCurrentScreen = () => {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

export const getCurrentScreenPromptCache = () => {
  const currentScreen = getCurrentScreen();

  const currentPromptCache = promptDb
    .get(`screens.${String(currentScreen.id)}`)
    .value();
  // console.log(currentScreen.id, { currentPromptCache });

  return currentPromptCache as Size;
};

export const setDefaultBounds = () => {
  const currentScreen = getCurrentScreen();

  const { width: screenWidth, height: screenHeight } =
    currentScreen.workAreaSize;

  const height = Math.round(screenHeight / 3);
  const width = Math.round(height * (4 / 3));
  const { x: workX, y: workY } = currentScreen.workArea;
  const x = Math.round(screenWidth / 2 - width / 2 + workX);
  const y = Math.round(workY + height / 10);

  log.info(`DEFAULT: setBounds`);
  promptWindow?.setBounds({ x, y, width, height });
};

const HEADER_HEIGHT = 24;
const INPUT_HEIGHT = 64;
const TABS_HEIGHT = 36;
const DEFAULT_HEIGHT = 480;

const calcHeight = () => {
  const script = promptScript;

  if (script?.ui === UI.arg) {
    const headerHeight =
      script?.menu || script?.twitter || script?.description
        ? HEADER_HEIGHT
        : 0;
    const tabsHeight = script?.tabs.length ? TABS_HEIGHT : 0;

    return INPUT_HEIGHT + headerHeight + tabsHeight;
  }

  return DEFAULT_HEIGHT;
};

const setPromptBounds = () => {
  const currentScreenPromptBounds = getCurrentScreenPromptCache();

  const height = calcHeight();
  if (currentScreenPromptBounds) {
    promptWindow.setBounds({
      ...currentScreenPromptBounds,
      height,
    });
  } else {
    setDefaultBounds();
  }
};

export const showPrompt = () => {
  if (promptWindow && !promptWindow?.isVisible()) {
    if (!promptWindow?.isVisible()) {
      setPromptBounds();
      promptWindow?.show();
      promptWindow.setVibrancy(
        nativeTheme.shouldUseDarkColors ? 'ultra-dark' : 'medium-light'
      );
      promptWindow.setBackgroundColor(
        nativeTheme.shouldUseDarkColors ? '#66000000' : '#C0FFFFFF'
      );
      if (devTools) promptWindow?.webContents.openDevTools();
    }
  }

  return promptWindow;
};

type Size = {
  width: number;
  height: number;
};
export const resizePromptHeight = (height: number) => {
  if (!promptWindow?.isVisible()) return;
  if (lastResizedByUser) {
    lastResizedByUser = false;
    return;
  }

  const [promptWidth, promptHeight] = promptWindow?.getSize() as number[];

  if (height !== promptHeight) {
    log.info(`↕ RESIZE: ${promptWidth} x ${height}`);
    promptWindow?.setSize(promptWidth, height);
  }
};

export const sendToPrompt = (channel: string, data: any) => {
  if (channel === Channel.SET_SCRIPT) {
    promptScript = data as Script;
  }
  // log.info(`>_ ${channel} ${data?.kitScript}`);
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.webContents.send(channel, data);
  }
};

const cachePromptPosition = () => {
  const currentScreen = getCurrentScreen();
  const promptBounds = promptWindow?.getBounds();
  log.info(`Cache prompt:`, { screen: currentScreen.id, ...promptBounds });

  promptDb.set(`screens.${String(currentScreen.id)}`, promptBounds).write();
};

const hideAppIfNoWindows = () => {
  if (promptWindow?.isVisible()) {
    if (clearPrompt) {
      clearPrompt = false;
    } else {
      cachePromptPosition();
    }
    const allWindows = BrowserWindow.getAllWindows();
    // Check if all other windows are hidden
    promptScript = null;
    promptWindow?.hide();
    setPromptBounds();

    if (allWindows.every((window) => !window.isVisible())) {
      app?.hide();
    }
  }
};

export const hidePromptWindow = () => {
  if (promptWindow?.webContents.isDevToolsFocused()) return;
  if (blurredByKit) {
    blurredByKit = false;
    return;
  }

  hideAppIfNoWindows();

  blurredByKit = false;
};

export const setPlaceholder = (text: string) => {
  // if (!getAppHidden())
  sendToPrompt(Channel.SET_PLACEHOLDER, text);
};

export const setPromptPid = (pid: number) => {
  sendToPrompt(Channel.SET_PID, pid);
};

export const setScript = (script: Script) => {
  if (promptScript?.id === script.id) return;
  log.info(script);

  if (script.filePath === mainScriptPath) {
    script.tabs = script.tabs.filter((tab) => !tab.match(/join|live/i));
  }

  sendToPrompt(Channel.SET_SCRIPT, script);

  showPrompt();

  if (script.filePath === mainScriptPath) {
    setChoices(getScripts());
  } else if (script.requiresPrompt) {
    const maybeCachedChoices = kenvPath('db', `_${script.command}.json`);

    if (isFile(maybeCachedChoices)) {
      const choicesFile = readFileSync(maybeCachedChoices, 'utf-8');
      const { items } = JSON.parse(choicesFile);
      log.info(`📦 Setting choices from ${maybeCachedChoices}`);
      const choices = items.map((item: string | Choice, id: number) =>
        typeof item === 'string' ? { name: item, id } : item
      );
      setChoices(choices);
    } else {
      setChoices([]);
    }
  }
};

export const setMode = (mode: Mode) => {
  sendToPrompt(Channel.SET_MODE, mode);
};

export const setInput = (input: string) => {
  sendToPrompt(Channel.SET_INPUT, input);
};

export const setPanel = (html: string) => {
  sendToPrompt(Channel.SET_PANEL, html);
};

export const setHint = (hint: string) => {
  sendToPrompt(Channel.SET_HINT, hint);
};

export const setTabIndex = (tabIndex: number) => {
  sendToPrompt(Channel.SET_TAB_INDEX, tabIndex);
};

export const setPromptData = (promptData: PromptData) => {
  sendToPrompt(Channel.SET_PROMPT_DATA, promptData);
};

export const setChoices = (choices: Choice[]) => {
  sendToPrompt(Channel.SET_CHOICES, choices);
};

export const clearPromptCache = () => {
  clearPrompt = true;
  promptDb.set('screens', {}).write();
};

emitter.on(KitEvent.ExitPrompt, () => {
  escapePromptWindow();
});
