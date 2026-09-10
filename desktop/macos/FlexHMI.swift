import AppKit
import WebKit

let app = NSApplication.shared
let runtime = Bundle.main.resourceURL!.appendingPathComponent("runtime")
let node = runtime.appendingPathComponent("node/node")
let controller = runtime.appendingPathComponent("desktop/ipc/launcher.cjs")
let dataDirectory = ProcessInfo.processInfo.environment["FLEXHMI_DATA_DIR"].map { URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/FlexHMI")

func runControl(_ mode: String) throws -> [String: Any] {
    let process = Process(); process.executableURL = node; process.arguments = [controller.path, mode]
    process.currentDirectoryURL = runtime
    let output = Pipe(); let errors = Pipe(); process.standardOutput = output; process.standardError = errors
    try process.run()
    let bytes = output.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { throw NSError(domain: "FlexHMI", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "本地服务启动失败"]) }
    return (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] ?? [:]
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var origin: String?
    var starting = true
    var pendingClose = false
    var pendingQuit = false
    var allowClose = false
    var stopping = false
    var acceptanceStep = 0
    var acceptanceTries = 0
    let acceptance = ProcessInfo.processInfo.arguments.contains("--acceptance") ? ProcessInfo.processInfo.environment["FLEXHMI_ACCEPTANCE_DIR"] : nil

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenu(); createWindow()
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let status = try runControl("--ensure")
                guard let raw = status["origin"] as? String, let url = URL(string: raw), url.scheme == "http", url.host == "127.0.0.1", url.port != nil else { throw NSError(domain: "FlexHMI", code: 1, userInfo: [NSLocalizedDescriptionKey: "本地服务地址无效"]) }
                DispatchQueue.main.async { self.starting = false; self.origin = raw; self.navigate("editor") }
            } catch { DispatchQueue.main.async { self.starting = false; self.fail("启动未完成", error.localizedDescription) } }
        }
    }
    func createWindow() {
        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        config.userContentController.add(self, name: "flexhmi")
        let bridge = """
        (()=>{let callback;window.simplehmiDesktop={onClose:fn=>callback=fn,closeReady:()=>window.webkit.messageHandlers.flexhmi.postMessage('close-ready')};window.addEventListener('flexhmi-native-close',()=>{if(callback)callback();else window.simplehmiDesktop.closeReady()});})();
        """
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 940), configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        window = NSWindow(contentRect: web.frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "FlexHMI"; window.minSize = NSSize(width: 1000, height: 680); window.contentView = web; window.delegate = self; window.isReleasedWhenClosed = false
        window.center(); window.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps: true)
        web.loadHTMLString("<html lang='zh-CN'><body style='font:18px -apple-system;text-align:center;padding-top:28vh;color:#222;background:#fff'><h1>FlexHMI</h1><p>正在启动本地工作台…</p></body></html>", baseURL: nil)
    }
    func setupMenu() {
        let main = NSMenu(); let appItem = NSMenuItem(); let appMenu = NSMenu(title: "FlexHMI")
        func add(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String = "") { let item = NSMenuItem(title: title, action: action, keyEquivalent: key); item.target = self; menu.addItem(item) }
        add(appMenu, "关于 FlexHMI", #selector(about)); appMenu.addItem(.separator())
        add(appMenu, "打开工程数据目录", #selector(openData)); appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏 FlexHMI", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "退出并停止本机服务", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu; main.addItem(appItem)
        let edit = NSMenu(title: "编辑"); let editItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: ""); editItem.submenu = edit
        for (title, action, key) in [("撤销", Selector(("undo:")), "z"), ("剪切", #selector(NSText.cut(_:)), "x"), ("复制", #selector(NSText.copy(_:)), "c"), ("粘贴", #selector(NSText.paste(_:)), "v"), ("全选", #selector(NSText.selectAll(_:)), "a")] { edit.addItem(withTitle: title, action: action, keyEquivalent: key) }
        main.addItem(editItem)
        let view = NSMenu(title: "视图"); let viewItem = NSMenuItem(title: "视图", action: nil, keyEquivalent: ""); viewItem.submenu = view
        add(view, "编辑工程", #selector(editor), "1"); add(view, "运行画面", #selector(run), "2"); add(view, "全屏", #selector(fullscreen), "f"); add(view, "重新加载", #selector(reload), "r")
        main.addItem(viewItem); app.mainMenu = main
    }
    @objc func about() { let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""; fail("FlexHMI \(v)", "中文工业可视化 · 本机 WebKit 版\n基于 FUXA，保留 MIT 许可。\n未进行 Developer ID 签名或 Apple 公证。\n工程保存在：\(dataDirectory.path)") }
    @objc func openData() { NSWorkspace.shared.open(dataDirectory) }
    @objc func editor() { navigate("editor") }
    @objc func run() { navigate("runtime") }
    @objc func fullscreen() { window.toggleFullScreen(nil) }
    @objc func reload() { web.reload() }
    func navigate(_ mode: String) { guard let origin = origin else { return }; window.makeKeyAndOrderFront(nil); web.load(URLRequest(url: URL(string: origin + "/simplehmi/" + (mode == "editor" ? "" : "?runtime=1"))!)) }
    func local(_ url: URL?) -> Bool { guard let url = url, let origin = origin else { return false }; return url.scheme == "http" && url.host == "127.0.0.1" && url.port == URL(string: origin)?.port }
    func fail(_ title: String, _ message: String) { if let directory = acceptance { let result: [String: Any] = ["passed": false, "error": title + ": " + message]; try? JSONSerialization.data(withJSONObject: result).write(to: URL(fileURLWithPath: directory).appendingPathComponent("native-webkit.json")); finishAcceptance(); return }; let alert = NSAlert(); alert.messageText = title; alert.informativeText = message; alert.addButton(withTitle: "好"); alert.runModal() }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func windowShouldClose(_ sender: NSWindow) -> Bool { if allowClose { return true }; requestClose(quit: false); return false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { if stopping { return .terminateLater }; if starting { fail("正在启动", "请等本地服务启动后再退出。"); return .terminateCancel }; requestClose(quit: true); return .terminateLater }
    func requestClose(quit: Bool) {
        if pendingClose { return }; pendingClose = true; pendingQuit = quit
        if local(web.url) { web.evaluateJavaScript("window.dispatchEvent(new Event('flexhmi-native-close'))") { _, error in if let error = error { self.pendingClose = false; if quit { app.reply(toApplicationShouldTerminate: false) }; self.fail("保存确认失败", error.localizedDescription) } } }
        else { closeReady() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { if self.pendingClose { self.pendingClose = false; if quit { app.reply(toApplicationShouldTerminate: false) }; self.fail("工程尚未确认保存", "请检查界面保存状态后重试。窗口保持打开，本机服务继续运行。") } }
    }
    func closeReady() {
        guard pendingClose else { return }; pendingClose = false
        if pendingQuit { stopAndQuit() } else { allowClose = true; window.close(); allowClose = false }
    }
    func stopAndQuit() { stopping = true; DispatchQueue.global().async { do { _ = try runControl("--stop"); DispatchQueue.main.async { app.reply(toApplicationShouldTerminate: true) } } catch { DispatchQueue.main.async { self.stopping = false; app.reply(toApplicationShouldTerminate: false); self.fail("停止服务失败", error.localizedDescription) } } } }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) { guard message.frameInfo.isMainFrame, local(message.frameInfo.request.url), pendingClose, message.body as? String == "close-ready" else { return }; closeReady() }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.request.url?.scheme == "about" && origin == nil { decisionHandler(.allow); return }
        if action.shouldPerformDownload && (local(action.request.url) || action.request.url?.scheme == "blob") { decisionHandler(.download); return }
        decisionHandler(local(action.request.url) ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { if local(navigationAction.request.url) { web.load(navigationAction.request) }; return nil }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) { decisionHandler(response.canShowMIMEType ? .allow : .download) }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) { let panel = NSSavePanel(); panel.nameFieldStringValue = URL(fileURLWithPath: suggestedFilename).lastPathComponent; panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) } }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) { let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = parameters.allowsDirectories; panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) } }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { let a = NSAlert(); a.messageText = message; a.beginSheetModal(for: window) { _ in completionHandler() } }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "确定"); a.addButton(withTitle: "取消"); a.beginSheetModal(for: window) { result in completionHandler(result == .alertFirstButtonReturn) } }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) { let a = NSAlert(); a.messageText = prompt; let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 25)); field.stringValue = defaultText ?? ""; a.accessoryView = field; a.addButton(withTitle: "确定"); a.addButton(withTitle: "取消"); a.beginSheetModal(for: window) { result in completionHandler(result == .alertFirstButtonReturn ? field.stringValue : nil) } }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail("画面加载失败", error.localizedDescription) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { if acceptance != nil && local(webView.url) { acceptanceTries = 0; checkAcceptance() } }
    func checkAcceptance() {
        guard let directory = acceptance else { return }; acceptanceTries += 1
        let script = acceptanceStep == 0 ? "Boolean(document.querySelector('#canvas') && document.querySelector('#connection-tools') && document.querySelector('#run'))" : "Boolean(document.querySelector('#canvas') && !document.querySelector('#connection-tools') && document.querySelector('.runtime-shell'))"
        web.evaluateJavaScript(script) { value, error in
            if value as? Bool == true {
                let name = self.acceptanceStep == 0 ? "native-editor.png" : "native-runtime.png"
                self.web.takeSnapshot(with: nil) { image, snapshotError in
                    guard let image = image, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else { self.fail("截图失败", snapshotError?.localizedDescription ?? "WebKit 没有返回画面"); return }
                    try? png.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
                    if self.acceptanceStep == 0 { self.acceptanceStep = 1; self.web.evaluateJavaScript("document.querySelector('#run').click()") { _, err in if let err = err { self.fail("运行切换失败", err.localizedDescription) } else { self.acceptanceTries = 0; self.checkAcceptance() } } }
                    else { let record: [String: Any] = ["passed": true, "nativeWebKit": true, "editorRendered": true, "runtimeRendered": true, "runtimeEditingHidden": true, "nativeArchitecture": ProcessInfo.processInfo.environment["FLEXHMI_TARGET_ARCH"] ?? "unknown"]; try? JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted]).write(to: URL(fileURLWithPath: directory).appendingPathComponent("native-webkit.json")); self.finishAcceptance() }
                }
            } else if self.acceptanceTries < 100 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.checkAcceptance() } }
            else { self.fail("WebKit 页面验收超时", error?.localizedDescription ?? "编辑/运行画面没有完成渲染") }
        }
    }
    func finishAcceptance() { DispatchQueue.global().async { _ = try? runControl("--stop"); DispatchQueue.main.async { app.stop(nil); let event = NSEvent.otherEvent(with: .applicationDefined, location: .zero, modifierFlags: [], timestamp: 0, windowNumber: 0, context: nil, subtype: 0, data1: 0, data2: 0)!; app.postEvent(event, atStart: true) } } }
}
let delegate = AppDelegate(); app.delegate = delegate; app.setActivationPolicy(.regular); app.run()
