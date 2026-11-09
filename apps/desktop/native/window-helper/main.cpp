#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <Windows.h>
#include <dwmapi.h>
#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cwchar>
#include <limits>
#include <string>
#include <vector>

namespace {
struct WindowInfo {
  HWND handle{};
  DWORD pid{};
  std::uint64_t created{};
  std::wstring title, executable;
  bool minimized{}, foreground{};
  LONG width{}, height{};
};
bool ParseNumber(const wchar_t* text, std::uint64_t& number) {
  if (!text || !*text || std::wcslen(text) > 20) return false;
  for (const wchar_t* c = text; *c; ++c) if (*c < L'0' || *c > L'9') return false;
  errno = 0;
  wchar_t* end{};
  number = std::wcstoull(text, &end, 10);
  return errno != ERANGE && end && !*end && number > 0;
}
std::string JsonString(const std::wstring& value) {
  if (value.empty()) return "\"\"";
  const int length = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string utf8(static_cast<std::size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), utf8.data(), length, nullptr, nullptr);
  std::string result = "\"";
  for (unsigned char c : utf8) {
    if (c == '"' || c == '\\') result += '\\';
    if (c >= 32) result += static_cast<char>(c);
    else result += ' ';
  }
  return result + '"';
}
bool Inspect(HWND window, WindowInfo& info) {
  if (!IsWindow(window) || !IsWindowVisible(window) || GetWindow(window, GW_OWNER)) return false;
  if ((GetWindowLongPtrW(window, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0) return false;
  DWORD cloaked{};
  if (SUCCEEDED(DwmGetWindowAttribute(window, DWMWA_CLOAKED, &cloaked, sizeof(cloaked))) && cloaked) return false;
  wchar_t title[512]{};
  if (GetWindowTextW(window, title, 512) <= 0) return false;
  DWORD pid{};
  GetWindowThreadProcessId(window, &pid);
  if (!pid) return false;
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) return false;
  wchar_t executable[32768]{};
  DWORD length = 32768;
  FILETIME created{}, exited{}, kernel{}, user{};
  const bool valid = QueryFullProcessImageNameW(process, 0, executable, &length) &&
    GetProcessTimes(process, &created, &exited, &kernel, &user);
  CloseHandle(process);
  DWORD currentPid{};
  GetWindowThreadProcessId(window, &currentPid);
  if (!valid || currentPid != pid || !IsWindow(window)) return false;
  ULARGE_INTEGER creation{};
  creation.LowPart = created.dwLowDateTime;
  creation.HighPart = created.dwHighDateTime;
  RECT client{};
  GetClientRect(window, &client);
  info = {window, pid, creation.QuadPart, title, executable,
    IsIconic(window) != FALSE, GetForegroundWindow() == window, client.right, client.bottom};
  return true;
}
void Write(const WindowInfo& info) {
  std::printf("{\"hwnd\":\"%llu\",\"pid\":%lu,\"creationTime\":\"%llu\",\"title\":%s,\"executable\":%s,\"minimized\":%s,\"foreground\":%s,\"clientWidth\":%ld,\"clientHeight\":%ld}",
    static_cast<unsigned long long>(reinterpret_cast<std::uintptr_t>(info.handle)), info.pid,
    static_cast<unsigned long long>(info.created), JsonString(info.title).c_str(), JsonString(info.executable).c_str(),
    info.minimized ? "true" : "false", info.foreground ? "true" : "false", info.width, info.height);
}
BOOL CALLBACK Enumerate(HWND window, LPARAM context) {
  auto& windows = *reinterpret_cast<std::vector<WindowInfo>*>(context);
  if (windows.size() >= 512) return FALSE;
  WindowInfo info;
  if (Inspect(window, info)) windows.push_back(std::move(info));
  return TRUE;
}
}
int wmain(int argc, wchar_t** argv) {
  SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32);
  if (argc == 2 && std::wcscmp(argv[1], L"--list") == 0) {
    std::vector<WindowInfo> windows;
    EnumWindows(Enumerate, reinterpret_cast<LPARAM>(&windows));
    std::printf("[");
    for (std::size_t i = 0; i < windows.size(); ++i) { if (i) std::printf(","); Write(windows[i]); }
    std::printf("]\n");
    return 0;
  }
  std::uint64_t handle{}, expectedPid{}, expectedCreation{};
  const bool inspect = argc == 3 && std::wcscmp(argv[1], L"--inspect") == 0;
  const bool restore = argc == 5 && std::wcscmp(argv[1], L"--restore") == 0;
  if ((!inspect && !restore) || !ParseNumber(argv[2], handle) || handle > std::numeric_limits<std::uintptr_t>::max()) return 2;
  if (restore && (!ParseNumber(argv[3], expectedPid) || expectedPid > MAXDWORD || !ParseNumber(argv[4], expectedCreation))) return 2;
  WindowInfo info;
  const HWND window = reinterpret_cast<HWND>(static_cast<std::uintptr_t>(handle));
  if (!Inspect(window, info)) { std::printf("null\n"); return 0; }
  if (restore) {
    if (info.pid != expectedPid || info.created != expectedCreation) return 3;
    if (info.minimized) {
      // Only the explicitly selected, identity-checked window is restored.
      // Foreground restrictions are respected; callers can wait/cancel if denied.
      ShowWindowAsync(window, SW_RESTORE);
      SetForegroundWindow(window);
    }
    if (!Inspect(window, info) || info.pid != expectedPid || info.created != expectedCreation) return 3;
  }
  Write(info);
  std::printf("\n");
  return 0;
}
