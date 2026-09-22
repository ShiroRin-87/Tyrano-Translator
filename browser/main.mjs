import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, WebContentsView, ipcMain, session } from "electron";

import { BROWSER_HOME, isAllowedNavigation, isHostedGameUrl, normalizeNavigation } from "./url-policy.mjs";
import { BrowserStore } from "./store.mjs";
import { browserStoreDefaults, TranslationService } from "./translator.mjs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const PARTITION = "persist:tyrano-translator-browser";
const TOOLBAR_HEIGHT = 64;
let mainWindow;
let gameView;
let settingsWindow;
let translationService;

function viewState() {
  const contents = gameView?.webContents;
  return {
    url: contents?.getURL() || BROWSER_HOME,
    title: contents?.getTitle() || "Tyrano Translator Browser",
    loading: contents?.isLoading() ?? false,
    canGoBack: contents?.navigationHistory.canGoBack() ?? false,
    canGoForward: contents?.navigationHistory.canGoForward() ?? false
  };
}

function sendState() {
  if (!mainWindow?.isDestroyed()) {
    mainWindow.webContents.send("browser:state", viewState());
  }
}

function layoutGameView() {
  if (!mainWindow || !gameView) return;
  const [width, height] = mainWindow.getContentSize();
  gameView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
}

function secureSession(browserSession) {
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.on("will-download", (event) => event.preventDefault());
}

function secureGuest(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) setImmediate(() => contents.loadURL(url));
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, details) => {
    const target = typeof details === "string" ? details : details.url;
    if (!isAllowedNavigation(target)) event.preventDefault();
  });

  contents.on("will-frame-navigate", (event, details) => {
    if (!isAllowedNavigation(details.url)) {
      event.preventDefault();
      return;
    }
    if (!details.isMainFrame && isHostedGameUrl(details.url)) {
      event.preventDefault();
      setImmediate(() => contents.loadURL(details.url));
    }
  });

  for (const eventName of ["did-start-loading", "did-stop-loading", "did-navigate", "did-navigate-in-page", "page-title-updated"]) {
    contents.on(eventName, sendState);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 840,
    minHeight: 560,
    backgroundColor: "#0b1020",
    title: "Tyrano Translator Browser",
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(join(currentDirectory, "ui", "index.html"));

  const browserSession = session.fromPartition(PARTITION);
  secureSession(browserSession);
  gameView = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      preload: join(currentDirectory, "generated", "guest-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  mainWindow.contentView.addChildView(gameView);
  secureGuest(gameView.webContents);
  layoutGameView();
  mainWindow.on("resize", layoutGameView);
  mainWindow.on("closed", () => {
    gameView?.webContents.close();
    gameView = undefined;
    mainWindow = undefined;
  });
  void gameView.webContents.loadURL(BROWSER_HOME);
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 760,
    height: 780,
    parent: mainWindow,
    modal: true,
    backgroundColor: "#0d1117",
    title: "翻译设置",
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  settingsWindow.removeMenu();
  settingsWindow.loadFile(join(currentDirectory, "ui", "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = undefined;
  });
}

function registerNavigationIpc() {
  const fromMainWindow = (event) => event.sender.id === mainWindow?.webContents.id;
  ipcMain.handle("browser:get-state", (event) => (fromMainWindow(event) ? viewState() : null));
  ipcMain.handle("browser:navigate", (event, input) => {
    if (!fromMainWindow(event)) return false;
    return gameView.webContents.loadURL(normalizeNavigation(input)).then(() => true);
  });
  ipcMain.handle("browser:back", (event) => {
    if (!fromMainWindow(event) || !gameView.webContents.navigationHistory.canGoBack()) return false;
    gameView.webContents.navigationHistory.goBack();
    return true;
  });
  ipcMain.handle("browser:forward", (event) => {
    if (!fromMainWindow(event) || !gameView.webContents.navigationHistory.canGoForward()) return false;
    gameView.webContents.navigationHistory.goForward();
    return true;
  });
  ipcMain.handle("browser:reload", (event) => {
    if (!fromMainWindow(event)) return false;
    gameView.webContents.reload();
    return true;
  });
  ipcMain.handle("browser:home", (event) => {
    if (!fromMainWindow(event)) return false;
    void gameView.webContents.loadURL(BROWSER_HOME);
    return true;
  });
  ipcMain.handle("browser:open-settings", (event) => {
    if (!fromMainWindow(event)) return false;
    createSettingsWindow();
    return true;
  });
}

function registerTranslationIpc() {
  const fromSettingsWindow = (event) => event.sender.id === settingsWindow?.webContents.id;
  ipcMain.handle("translator:translate", async (event, payload) => {
    if (event.sender.id !== gameView?.webContents.id) return { error: "拒绝了无效的翻译来源" };
    if (!isAllowedNavigation(payload?.pageUrl)) return { error: "拒绝翻译目标站以外的页面" };
    try {
      return await translationService.translate(payload);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("settings:get", (event) => (fromSettingsWindow(event) ? translationService.getSettingsSummary() : null));
  ipcMain.handle("settings:save", (event, settings) => {
    if (!fromSettingsWindow(event)) throw new Error("拒绝了无效的设置来源");
    return translationService.saveSettings(settings);
  });
  ipcMain.handle("settings:clear-cache", (event) => {
    if (!fromSettingsWindow(event)) throw new Error("拒绝了无效的设置来源");
    return translationService.clearCache();
  });
  ipcMain.handle("settings:clear-glossaries", (event) => {
    if (!fromSettingsWindow(event)) throw new Error("拒绝了无效的设置来源");
    return translationService.clearGlossaries();
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId("jp.novelgame.tyrano-translator-browser");
  const store = new BrowserStore(join(app.getPath("userData"), "translator-data.json"), browserStoreDefaults());
  await store.initialize();
  translationService = new TranslationService(store);
  registerNavigationIpc();
  registerTranslationIpc();
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
