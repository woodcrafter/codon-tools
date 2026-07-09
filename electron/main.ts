import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { startServer } from "../server/_core/index";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let serverPort: number | null = null;

async function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "密码子优化与引物合成",
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const serverUrl = `http://localhost:${port}`;

  await mainWindow.loadURL(serverUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Persist the embedded PGlite database under the per-user app data directory
  // so host species / enzyme data survives restarts and lives outside the asar.
  if (!process.env.PGLITE_DATA_DIR) {
    process.env.PGLITE_DATA_DIR = path.join(app.getPath("userData"), "pglite-data");
  }

  // Point DNAWORKS_EXECUTABLE_PATH at the bundled binary (platform-specific).
  if (!process.env.DNAWORKS_EXECUTABLE_PATH) {
    const binaryName =
      process.platform === "win32" ? "dnaworks-win.exe" : "dnaworks-mac";
    const dnaworksPath = isDev
      ? path.resolve(import.meta.dirname, "..", "bin", binaryName)
      : path.join(process.resourcesPath, "bin", binaryName);
    process.env.DNAWORKS_EXECUTABLE_PATH = dnaworksPath;
  }

  const { port } = await startServer();
  serverPort = port;
  await createWindow(port);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
    createWindow(serverPort);
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());
ipcMain.handle("app:open-external", (_event, url: string) => shell.openExternal(url));
