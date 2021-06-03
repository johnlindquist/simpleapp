import { globalShortcut } from 'electron';
import { grep } from 'shelljs';
import log from 'electron-log';
import { readFile } from 'fs/promises';
import { tryPromptScript } from './kit';
import { mainScriptPath, shortcutsPath } from './helpers';
import { emitter, AppEvent } from './events';

export const shortcutMap = new Map();

const shortcutNormalizer = (shortcut: string) =>
  shortcut
    .replace(/(option|opt)/i, 'Alt')
    .replace(/(command|cmd)/i, 'CommandOrControl')
    .replace(/(ctl|cntrl|ctrl)/, 'Control')
    .split(/\s/)
    .filter(Boolean)
    .map((part) => (part[0].toUpperCase() + part.slice(1)).trim())
    .join('+');

export const unlinkShortcuts = (filePath: string) => {
  const oldShortcut = shortcutMap.get(filePath);

  if (oldShortcut) {
    globalShortcut.unregister(oldShortcut);
    shortcutMap.delete(filePath);
  }
};

export const updateShortcuts = (filePath: string) => {
  const shortcutMarker = 'Shortcut: ';
  const { stdout } = grep(`^//\\s*${shortcutMarker}\\s*`, filePath);

  const rawShortcut = stdout
    .substring(0, stdout.indexOf('\n'))
    .substring(stdout.indexOf(shortcutMarker) + shortcutMarker.length)
    .trim();

  const shortcut = rawShortcut ? shortcutNormalizer(rawShortcut) : '';

  const oldShortcut = shortcutMap.get(filePath);

  // Handle existing shortcuts
  if (oldShortcut) {
    // No change
    if (oldShortcut === shortcut) {
      log.info(`${shortcut} is already registered to ${filePath}`);
      return;
    }

    // User removed an existing shortcut
    globalShortcut.unregister(oldShortcut);
    shortcutMap.delete(filePath);
    log.info(`Unregistered ${oldShortcut} from ${filePath}`);
  }

  if (!shortcut) return;
  // At this point, we know it's a new shortcut, so register it

  const ret = globalShortcut.register(shortcut, async () => {
    // const execPath = filePath.replace('scripts', 'bin').replace('.js', '');

    await tryPromptScript(filePath, []);
  });

  if (!ret) {
    log.info(`Failed to register: ${shortcut} to ${filePath}`);
  }

  if (ret && globalShortcut.isRegistered(shortcut)) {
    log.info(`Registered ${shortcut} to ${filePath}`);
    shortcutMap.set(filePath, shortcut);
  }
};

export const updateMainShortcut = async (filePath: string) => {
  if (filePath === shortcutsPath) {
    log.info(`SHORTCUTS DB CHANGED:`, filePath);
    const settings = JSON.parse(await readFile(filePath, 'utf-8'));
    const rawShortcut = settings?.shortcuts?.[mainScriptPath];

    const shortcut = rawShortcut ? shortcutNormalizer(rawShortcut) : '';

    if (shortcut) {
      const oldShortcut = shortcutMap.get(mainScriptPath);

      if (shortcut === oldShortcut) return;

      if (oldShortcut) {
        globalShortcut.unregister(oldShortcut);
        shortcutMap.delete(mainScriptPath);
      }

      const ret = globalShortcut.register(shortcut, async () => {
        await tryPromptScript(mainScriptPath, []);
      });

      if (!ret) {
        log.info(`Failed to register: ${shortcut} to ${mainScriptPath}`);
      }

      if (ret && globalShortcut.isRegistered(shortcut)) {
        log.info(`Registered ${shortcut} to ${mainScriptPath}`);
        shortcutMap.set(mainScriptPath, shortcut);
      }
    }
  }
};

let shortcutsPaused = false;
const pauseShortcuts = () => {
  log.info(`PAUSING GLOBAL SHORTCUTS`);
  shortcutsPaused = true;
  globalShortcut.unregisterAll();
};

const resumeShortcuts = () => {
  if (shortcutsPaused) {
    shortcutsPaused = false;

    log.info(`RESUMING GLOBAL SHORTCUTS`);

    shortcutMap.forEach((shortcut, filePath) => {
      const ret = globalShortcut.register(shortcut, async () => {
        // const execPath = filePath.replace('scripts', 'bin').replace('.js', '');

        await tryPromptScript(filePath, []);
      });

      if (!ret) {
        log.info(`Failed to register: ${shortcut} to ${filePath}`);
      }
    });
  }
};

emitter.on(AppEvent.PAUSE_SHORTCUTS, pauseShortcuts);
emitter.on(AppEvent.RESUME_SHORTCUTS, resumeShortcuts);
