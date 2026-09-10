"use strict";
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
} = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path"),
  fs = require("node:fs"),
  net = require("node:net"),
  http = require("node:http"),
  crypto = require("node:crypto");
let win,
  backend,
  allowClose = false,
  origin = "",
  quitting = false,
  logStream;
app.setName("FlexHMI");
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox(
        "FlexHMI 启动失败",
        error.message + "\n请打开用户数据目录中的 desktop.log 查看原因。",
      );
      app.quit();
    });
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const p = server.address().port;
      server.close(() => resolve(p));
    });
  });
}
function status(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1200 }, (res) => {
      let text = "";
      res.on("data", (x) => (text += x));
      res.on("end", () => {
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}
async function start() {
  const payload = path.join(process.resourcesPath, "runtime");
  const root = process.env.SIMPLEHMI_DEV_ROOT || payload;
  const userDir = path.join(app.getPath("appData"), "SimpleHMI"); // Preserve existing desktop engineering data.
  fs.mkdirSync(userDir, { recursive: true });
  const logPath = path.join(userDir, "desktop.log");
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5 * 1024 * 1024)
    fs.renameSync(logPath, logPath + ".previous");
  logStream = fs.createWriteStream(logPath, { flags: "a" });
  const port = await freePort(),
    instance = crypto.randomUUID();
  origin = `http://127.0.0.1:${port}`;
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    title: "FlexHMI",
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#f2f5fa",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  win.loadFile(path.join(__dirname, "loading.html"));
  win.on("close", (e) => {
    if (
      !allowClose &&
      win.webContents.getURL().startsWith(origin + "/simplehmi/")
    ) {
      e.preventDefault();
      win.webContents.send("save-before-close");
    }
  });
  ipcMain.on("save-complete", (event) => {
    if (
      event.sender === win?.webContents &&
      event.senderFrame.url.startsWith(origin + "/simplehmi/")
    ) {
      allowClose = true;
      win.close();
    }
  });
  const allowed = (url) => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  };
  win.webContents.on("will-navigate", (e, url) => {
    if (!allowed(url)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (allowed(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "FlexHMI",
        submenu: [
          {
            label: "返回工作台",
            click: () => win.loadURL(origin + "/simplehmi/"),
          },
          { label: "打开数据目录", click: () => shell.openPath(userDir) },
          { type: "separator" },
          { label: "退出", accelerator: "Alt+F4", click: () => win.close() },
        ],
      },
      {
        label: "视图",
        submenu: [
          { label: "重新加载", role: "reload" },
          { label: "全屏", role: "togglefullscreen" },
          { label: "实际大小", role: "resetZoom" },
          { label: "放大", role: "zoomIn" },
          { label: "缩小", role: "zoomOut" },
        ],
      },
      {
        label: "帮助",
        submenu: [
          {
            label: "关于 FlexHMI",
            click: () =>
              dialog.showMessageBox(win, {
                type: "info",
                title: "关于 FlexHMI",
                message: "FlexHMI 0.3.0",
                detail: `基于 FUXA 1.3.4\nWindows ${process.arch}\n工程保存在 ${userDir}\n本版本为未签名的本地演示候选版。`,
              }),
          },
        ],
      },
    ]),
  );
  const node =
    process.env.SIMPLEHMI_NODE || path.join(payload, "node", "node.exe");
  backend = spawn(node, [path.join(root, "desktop", "backend.cjs")], {
    cwd: userDir,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      SIMPLEHMI: "1",
      PORT: String(port),
      userDir,
      SIMPLEHMI_INSTANCE: instance,
      PATH: path.join(payload, "node") + path.delimiter + process.env.PATH,
    },
  });
  backend.stdout.pipe(logStream, { end: false });
  backend.stderr.pipe(logStream, { end: false });
  backend.on("error", (error) => {
    logStream.write(error.stack + "\n");
    dialog.showErrorBox("运行服务无法启动", error.message);
    allowClose = true;
    win?.close();
  });
  backend.on("exit", (code) => {
    if (!quitting && win && !win.isDestroyed()) {
      dialog.showErrorBox(
        "运行服务已停止",
        `服务退出（${code}）。工程保留在用户数据目录。请重新打开应用，或查看 desktop.log。`,
      );
      allowClose = true;
      win.close();
    }
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null) throw Error("本地服务启动失败");
    const info = await status(origin + "/simplehmi/api/status");
    if (info?.ready && info.instance === instance) {
      await win.loadURL(origin + "/simplehmi/");
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("本地服务未能在 60 秒内就绪");
}
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (e) => {
  if (quitting) return;
  if (win && !win.isDestroyed() && !allowClose) {
    e.preventDefault();
    win.close();
    return;
  }
  quitting = true;
  if (backend && backend.exitCode === null) {
    e.preventDefault();
    if (backend.connected) backend.send({ type: "shutdown" });
    const timer = setTimeout(() => {
      backend.kill();
      app.exit(0);
    }, 4000);
    backend.once("exit", () => {
      clearTimeout(timer);
      logStream?.end();
      app.exit(0);
    });
  }
});
