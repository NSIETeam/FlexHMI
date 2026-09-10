Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"
!ifndef PAYLOAD
!error "Pass PAYLOAD, OUTPUT, ARCH, ICON and LICENSEFILE definitions"
!endif
Name "SimpleHMI 0.2.0 (${ARCH})"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\SimpleHMI"
InstallDirRegKey HKCU "Software\SimpleHMI" "InstallDir"
RequestExecutionLevel user
SetCompressor zlib
BrandingText "SimpleHMI · 极简工控组态"
VIProductVersion "0.2.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "SimpleHMI"
VIAddVersionKey /LANG=2052 "FileDescription" "SimpleHMI Windows ${ARCH} 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "0.2.0"
VIAddVersionKey /LANG=2052 "LegalCopyright" "SimpleHMI contributors / FUXA contributors"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "欢迎安装 SimpleHMI。$\r$\n$\r$\n本安装包包含本地运行服务和离线编辑器，无需单独安装 Node.js。$\r$\n$\r$\n安装前请关闭正在运行的 SimpleHMI。工程数据保存在当前用户的 AppData 目录。$\r$\n$\r$\n这是未签名的演示候选版。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSEFILE}"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\SimpleHMI.exe"
!define MUI_FINISHPAGE_RUN_TEXT "启动 SimpleHMI"
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
      MessageBox MB_ICONSTOP "此安装包适用于 Windows ARM64。普通 Intel / AMD 电脑请使用 x64 安装包。"
      Abort
    ${EndIf}
  !endif
FunctionEnd
Section "SimpleHMI" SecMain
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}/*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\SimpleHMI" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleHMI" "DisplayName" "SimpleHMI"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleHMI" "DisplayVersion" "0.2.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleHMI" "DisplayIcon" "$INSTDIR\SimpleHMI.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleHMI" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleHMI" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleHMI" "NoRepair" 1
  CreateDirectory "$SMPROGRAMS\SimpleHMI"
  CreateShortcut "$SMPROGRAMS\SimpleHMI\SimpleHMI.lnk" "$INSTDIR\SimpleHMI.exe"
  CreateShortcut "$SMPROGRAMS\SimpleHMI\卸载.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\SimpleHMI.lnk" "$INSTDIR\SimpleHMI.exe"
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  !include "${UNINSTALLFILES}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\SimpleHMI.lnk"
  Delete "$SMPROGRAMS\SimpleHMI\SimpleHMI.lnk"
  Delete "$SMPROGRAMS\SimpleHMI\卸载.lnk"
  RMDir "$SMPROGRAMS\SimpleHMI"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleHMI"
  DeleteRegKey HKCU "Software\SimpleHMI"
SectionEnd
