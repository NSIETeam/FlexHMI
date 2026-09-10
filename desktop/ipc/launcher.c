#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <shellapi.h>
#include <wchar.h>
int WINAPI wWinMain(HINSTANCE h,HINSTANCE p,PWSTR args,int show){
 wchar_t root[32768],exe[32768],cmd[65536];DWORD n=GetModuleFileNameW(NULL,root,32768);
 if(!n||n>=32768)return 1;wchar_t *slash=wcsrchr(root,L'\\');if(!slash)return 1;*slash=0;
 int count;LPWSTR *argv=CommandLineToArgvW(GetCommandLineW(),&count);const wchar_t *mode=count>1?argv[1]:L"--editor";
 if(wcscmp(mode,L"--editor")&&wcscmp(mode,L"--runtime")&&wcscmp(mode,L"--kiosk")&&wcscmp(mode,L"--stop")){LocalFree(argv);return 2;}
 swprintf(exe,32768,L"%ls\\node\\node.exe",root);swprintf(cmd,65536,L"\"%ls\" \"%ls\\desktop\\ipc\\launcher.cjs\" %ls",exe,root,mode);
 STARTUPINFOW si={.cb=sizeof(si)};PROCESS_INFORMATION pi={0};
 if(!CreateProcessW(exe,cmd,NULL,NULL,FALSE,CREATE_NO_WINDOW,NULL,root,&si,&pi)){MessageBoxW(NULL,L"无法启动 FlexHMI。请重新安装完整程序。",L"FlexHMI",MB_OK|MB_ICONERROR);LocalFree(argv);return 1;}
 WaitForSingleObject(pi.hProcess,INFINITE);DWORD result=1;GetExitCodeProcess(pi.hProcess,&result);CloseHandle(pi.hProcess);CloseHandle(pi.hThread);LocalFree(argv);
 if(result)MessageBoxW(NULL,L"FlexHMI 启动未完成。请确认已安装 Microsoft Edge。\n详情见 %LOCALAPPDATA%\\FlexHMI-IPC\\last-error.txt 和 ipc.log。",L"FlexHMI",MB_OK|MB_ICONERROR);
 return (int)result;
}
