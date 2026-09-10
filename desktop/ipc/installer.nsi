Unicode true
!ifndef VERSION
 !define VERSION "0.3.0"
!endif
!ifndef PAYLOADGLOB
 !define PAYLOADGLOB "${PAYLOAD}/*"
!endif
!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"
Name "FlexHMI 工控机版 ${VERSION} (${ARCH})"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\FlexHMI-IPC"
InstallDirRegKey HKCU "Software\FlexHMI-IPC" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "FlexHMI · 工业可视化，从此简单"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=2052 "ProductName" "FlexHMI IPC"
VIAddVersionKey /LANG=2052 "FileDescription" "FlexHMI 工控机版 Windows ${ARCH}"
VIAddVersionKey /LANG=2052 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "FlexHMI contributors; engine copyright FUXA contributors"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "FlexHMI 工控机版使用本机 Microsoft Edge 显示界面，内置离线编辑器和通讯运行环境。$\r$\n$\r$\n需要 64 位 Windows 10 / 11 和 Microsoft Edge。无需单独安装 Node.js。$\r$\n$\r$\n关闭画面后采集与已授权控制继续运行；使用开始菜单的停止服务入口结束本地服务。重启不会自动授权控制。$\r$\n$\r$\n未签名预览版。连接现场设备前，请验证通讯、联锁与控制参数。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSEFILE}"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\FlexHMI.exe"
!define MUI_FINISHPAGE_RUN_TEXT "打开 FlexHMI 编辑工程"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Function .onInit
 ${IfNot} ${RunningX64}
  MessageBox MB_ICONSTOP "此版本需要 64 位 Windows。"
  Abort
 ${EndIf}
 !if "${ARCH}" == "arm64"
  ReadEnvStr $0 PROCESSOR_ARCHITECTURE
  ReadEnvStr $1 PROCESSOR_ARCHITEW6432
  ${If} $0 != "ARM64"
  ${AndIf} $1 != "ARM64"
   MessageBox MB_ICONSTOP "此安装包适用于 Windows ARM64。Intel / AMD 电脑请使用 x64 版本。"
   Abort
  ${EndIf}
 !endif
FunctionEnd
Section "FlexHMI" SecMain
 SetShellVarContext current
 IfFileExists "$INSTDIR\FlexHMI.exe" 0 copy
 ExecWait '"$INSTDIR\FlexHMI.exe" --stop' $0
 ${If} $0 != 0
  MessageBox MB_ICONSTOP "旧服务未能停止，请检查日志后重试。"
  Abort
 ${EndIf}
 copy:
 SetOutPath "$INSTDIR"
 File /r "${PAYLOADGLOB}"
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 WriteRegStr HKCU "Software\FlexHMI-IPC" "InstallDir" "$INSTDIR"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FlexHMI-IPC" "DisplayName" "FlexHMI 工控机版 (${ARCH})"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FlexHMI-IPC" "DisplayVersion" "${VERSION}"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FlexHMI-IPC" "DisplayIcon" "$INSTDIR\FlexHMI.exe"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FlexHMI-IPC" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FlexHMI-IPC" "NoModify" 1
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FlexHMI-IPC" "NoRepair" 1
 CreateDirectory "$SMPROGRAMS\FlexHMI 工控机版"
 CreateShortcut "$SMPROGRAMS\FlexHMI 工控机版\编辑工程.lnk" "$INSTDIR\FlexHMI.exe" "--editor"
 CreateShortcut "$SMPROGRAMS\FlexHMI 工控机版\运行画面.lnk" "$INSTDIR\FlexHMI.exe" "--runtime"
 CreateShortcut "$SMPROGRAMS\FlexHMI 工控机版\全屏运行.lnk" "$INSTDIR\FlexHMI.exe" "--kiosk"
 CreateShortcut "$SMPROGRAMS\FlexHMI 工控机版\停止服务.lnk" "$INSTDIR\FlexHMI.exe" "--stop"
 CreateShortcut "$SMPROGRAMS\FlexHMI 工控机版\卸载.lnk" "$INSTDIR\Uninstall.exe"
 CreateShortcut "$DESKTOP\FlexHMI.lnk" "$INSTDIR\FlexHMI.exe"
SectionEnd
Section "Uninstall"
 SetShellVarContext current
 ExecWait '"$INSTDIR\FlexHMI.exe" --stop' $0
 ${If} $0 != 0
  MessageBox MB_ICONSTOP "服务未能停止，卸载已取消。"
  Abort
 ${EndIf}
 !include "${UNINSTALLFILES}"
 Delete "$INSTDIR\Uninstall.exe"
 RMDir "$INSTDIR"
 Delete "$DESKTOP\FlexHMI.lnk"
 Delete "$SMPROGRAMS\FlexHMI 工控机版\编辑工程.lnk"
 Delete "$SMPROGRAMS\FlexHMI 工控机版\运行画面.lnk"
 Delete "$SMPROGRAMS\FlexHMI 工控机版\全屏运行.lnk"
 Delete "$SMPROGRAMS\FlexHMI 工控机版\停止服务.lnk"
 Delete "$SMPROGRAMS\FlexHMI 工控机版\卸载.lnk"
 RMDir "$SMPROGRAMS\FlexHMI 工控机版"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FlexHMI-IPC"
 DeleteRegKey HKCU "Software\FlexHMI-IPC"
SectionEnd
