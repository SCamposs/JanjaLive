#define NOMINMAX
#define WIN32_LEAN_AND_MEAN

#include <Windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <avrt.h>
#include <ksmedia.h>
#include <mmdeviceapi.h>
#include <propvarutil.h>
#include <wrl/client.h>
#include <wrl/implements.h>

#include <array>
#include <cstdint>
#include <cwchar>
#include <limits>
#include <thread>
#include <vector>

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::FtmBase;
using Microsoft::WRL::Make;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;

namespace {

constexpr std::array<std::uint8_t, 4> kMagic{'J', 'N', 'J', 'A'};
constexpr std::uint16_t kProtocolVersion = 1;
constexpr std::uint16_t kFrameFormat = 1;
constexpr std::uint16_t kFramePcm = 2;
constexpr std::uint32_t kSampleRate = 48'000;
constexpr std::uint16_t kChannels = 2;
constexpr std::uint16_t kBitsPerSample = 16;
constexpr DWORD kProcessLoopbackMinimumBuild = 20'348;
constexpr DWORD kActivationTimeoutMs = 10'000;
constexpr DWORD kMaxPacketBytes = 1024 * 1024;

#pragma pack(push, 1)
struct FrameHeader {
  std::uint8_t magic[4];
  std::uint16_t version;
  std::uint16_t type;
  std::uint32_t payloadBytes;
};

struct FormatPayload {
  std::uint32_t sampleRate;
  std::uint16_t channels;
  std::uint16_t bitsPerSample;
};
#pragma pack(pop)

static_assert(sizeof(FrameHeader) == 12);
static_assert(sizeof(FormatPayload) == 8);

enum class ExitCode : int {
  Success = 0,
  InvalidArguments = 2,
  UnsupportedWindows = 3,
  InvalidWindow = 4,
  ActivationFailed = 5,
  CaptureFailed = 6,
  PipeClosed = 7,
};

void WriteDiagnostic(const wchar_t* code) {
  const HANDLE error = GetStdHandle(STD_ERROR_HANDLE);
  if (!error || error == INVALID_HANDLE_VALUE) return;
  DWORD written = 0;
  WriteFile(error, code, static_cast<DWORD>(std::wcslen(code) * sizeof(wchar_t)), &written, nullptr);
}

bool WriteAll(const void* data, std::uint32_t size) {
  const HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  if (!output || output == INVALID_HANDLE_VALUE) return false;
  const auto* bytes = static_cast<const std::uint8_t*>(data);
  std::uint32_t offset = 0;
  while (offset < size) {
    DWORD written = 0;
    const DWORD remaining = size - offset;
    if (!WriteFile(output, bytes + offset, remaining, &written, nullptr) || written == 0) return false;
    offset += written;
  }
  return true;
}

bool WriteFrame(std::uint16_t type, const void* payload, std::uint32_t payloadBytes) {
  FrameHeader header{{kMagic[0], kMagic[1], kMagic[2], kMagic[3]}, kProtocolVersion, type, payloadBytes};
  return WriteAll(&header, sizeof(header)) && (payloadBytes == 0 || WriteAll(payload, payloadBytes));
}

bool SupportsProcessLoopback() {
  OSVERSIONINFOEXW version{};
  version.dwOSVersionInfoSize = sizeof(version);
  version.dwMajorVersion = 10;
  version.dwMinorVersion = 0;
  version.dwBuildNumber = kProcessLoopbackMinimumBuild;
  DWORDLONG conditions = 0;
  VER_SET_CONDITION(conditions, VER_MAJORVERSION, VER_GREATER_EQUAL);
  VER_SET_CONDITION(conditions, VER_MINORVERSION, VER_GREATER_EQUAL);
  VER_SET_CONDITION(conditions, VER_BUILDNUMBER, VER_GREATER_EQUAL);
  return VerifyVersionInfoW(
      &version,
      VER_MAJORVERSION | VER_MINORVERSION | VER_BUILDNUMBER,
      conditions) != FALSE;
}

class ActivationHandler final
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase, IActivateAudioInterfaceCompletionHandler> {
 public:
  ActivationHandler() : completed_(CreateEventW(nullptr, TRUE, FALSE, nullptr)) {}
  ~ActivationHandler() override {
    if (completed_) CloseHandle(completed_);
  }

  HRESULT RuntimeClassInitialize() { return completed_ ? S_OK : HRESULT_FROM_WIN32(GetLastError()); }

  STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    ComPtr<IUnknown> activated;
    result_ = operation->GetActivateResult(&activationResult_, &activated);
    if (SUCCEEDED(result_) && SUCCEEDED(activationResult_)) {
      result_ = activated.As(&audioClient_);
    }
    SetEvent(completed_);
    return S_OK;
  }

  HRESULT Wait(ComPtr<IAudioClient>& client) {
    if (WaitForSingleObject(completed_, kActivationTimeoutMs) != WAIT_OBJECT_0) return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
    if (FAILED(result_)) return result_;
    if (FAILED(activationResult_)) return activationResult_;
    client = audioClient_;
    return client ? S_OK : E_NOINTERFACE;
  }

 private:
  HANDLE completed_ = nullptr;
  HRESULT result_ = E_PENDING;
  HRESULT activationResult_ = E_PENDING;
  ComPtr<IAudioClient> audioClient_;
};

HRESULT ActivateProcessLoopback(DWORD processId, ComPtr<IAudioClient>& client) {
  AUDIOCLIENT_ACTIVATION_PARAMS parameters{};
  parameters.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  parameters.ProcessLoopbackParams.TargetProcessId = processId;
  parameters.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activationParameters{};
  activationParameters.vt = VT_BLOB;
  activationParameters.blob.cbSize = sizeof(parameters);
  activationParameters.blob.pBlobData = reinterpret_cast<BYTE*>(&parameters);

  const auto handler = Make<ActivationHandler>();
  if (!handler) return E_OUTOFMEMORY;
  HRESULT result = handler->RuntimeClassInitialize();
  if (FAILED(result)) return result;

  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  result = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
      __uuidof(IAudioClient),
      &activationParameters,
      handler.Get(),
      &operation);
  if (FAILED(result)) return result;
  return handler->Wait(client);
}

HRESULT ActivateSystemLoopback(ComPtr<IAudioClient>& client) {
  ComPtr<IMMDeviceEnumerator> enumerator;
  HRESULT result = CoCreateInstance(
      __uuidof(MMDeviceEnumerator),
      nullptr,
      CLSCTX_ALL,
      IID_PPV_ARGS(&enumerator));
  if (FAILED(result)) return result;

  ComPtr<IMMDevice> endpoint;
  result = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &endpoint);
  if (FAILED(result)) return result;
  return endpoint->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(client.GetAddressOf()));
}

HRESULT ConfigureAudioClient(IAudioClient* client, HANDLE sampleReady) {
  WAVEFORMATEX format{};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = kChannels;
  format.nSamplesPerSec = kSampleRate;
  format.wBitsPerSample = kBitsPerSample;
  format.nBlockAlign = static_cast<WORD>(format.nChannels * format.wBitsPerSample / 8);
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

  const DWORD flags = AUDCLNT_STREAMFLAGS_LOOPBACK |
      AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
      AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
      AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
  HRESULT result = client->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 0, 0, &format, nullptr);
  if (FAILED(result)) return result;
  return client->SetEventHandle(sampleReady);
}

bool ParseUnsigned(const wchar_t* value, std::uint64_t& parsed) {
  if (!value || !*value || *value == L'-') return false;
  wchar_t* end = nullptr;
  errno = 0;
  const unsigned long long result = std::wcstoull(value, &end, 10);
  if (errno != 0 || !end || *end != L'\0') return false;
  parsed = result;
  return true;
}

ExitCode Capture(bool processMode, std::uint64_t windowHandleValue) {
  ComPtr<IAudioClient> audioClient;
  HRESULT result = E_FAIL;
  if (processMode) {
    if (!SupportsProcessLoopback()) return ExitCode::UnsupportedWindows;

    const HWND window = reinterpret_cast<HWND>(static_cast<std::uintptr_t>(windowHandleValue));
    if (!IsWindow(window)) return ExitCode::InvalidWindow;
    DWORD processId = 0;
    GetWindowThreadProcessId(window, &processId);
    if (processId == 0 || processId == GetCurrentProcessId()) return ExitCode::InvalidWindow;
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
    if (!process) return ExitCode::InvalidWindow;
    CloseHandle(process);
    result = ActivateProcessLoopback(processId, audioClient);
  } else {
    result = ActivateSystemLoopback(audioClient);
  }
  if (FAILED(result) || !audioClient) return ExitCode::ActivationFailed;

  const HANDLE sampleReady = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  const HANDLE stop = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!sampleReady || !stop) {
    if (sampleReady) CloseHandle(sampleReady);
    if (stop) CloseHandle(stop);
    return ExitCode::CaptureFailed;
  }

  result = ConfigureAudioClient(audioClient.Get(), sampleReady);
  if (FAILED(result)) {
    CloseHandle(sampleReady);
    CloseHandle(stop);
    return ExitCode::CaptureFailed;
  }

  ComPtr<IAudioCaptureClient> captureClient;
  result = audioClient->GetService(IID_PPV_ARGS(&captureClient));
  if (FAILED(result)) {
    CloseHandle(sampleReady);
    CloseHandle(stop);
    return ExitCode::CaptureFailed;
  }

  FormatPayload format{kSampleRate, kChannels, kBitsPerSample};
  if (!WriteFrame(kFrameFormat, &format, sizeof(format))) {
    CloseHandle(sampleReady);
    CloseHandle(stop);
    return ExitCode::PipeClosed;
  }

  HANDLE inputStop = nullptr;
  if (!DuplicateHandle(GetCurrentProcess(), stop, GetCurrentProcess(), &inputStop, EVENT_MODIFY_STATE, FALSE, 0)) {
    CloseHandle(sampleReady);
    CloseHandle(stop);
    return ExitCode::CaptureFailed;
  }
  std::thread inputMonitor([inputStop]() {
    const HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    std::uint8_t byte = 0;
    DWORD read = 0;
    while (input && input != INVALID_HANDLE_VALUE && ReadFile(input, &byte, 1, &read, nullptr) && read > 0) {}
    SetEvent(inputStop);
    CloseHandle(inputStop);
  });
  inputMonitor.detach();

  result = audioClient->Start();
  if (FAILED(result)) {
    CloseHandle(sampleReady);
    CloseHandle(stop);
    return ExitCode::CaptureFailed;
  }

  DWORD taskIndex = 0;
  HANDLE mmcss = AvSetMmThreadCharacteristicsW(L"Pro Audio", &taskIndex);
  std::vector<std::uint8_t> silence;
  ExitCode exitCode = ExitCode::Success;
  const HANDLE events[] = {stop, sampleReady};

  bool running = true;
  while (running) {
    const DWORD wait = WaitForMultipleObjects(2, events, FALSE, INFINITE);
    if (wait == WAIT_OBJECT_0) break;
    if (wait != WAIT_OBJECT_0 + 1) {
      exitCode = ExitCode::CaptureFailed;
      break;
    }

    UINT32 framesAvailable = 0;
    while (SUCCEEDED(result = captureClient->GetNextPacketSize(&framesAvailable)) && framesAvailable > 0) {
      BYTE* data = nullptr;
      DWORD flags = 0;
      UINT64 devicePosition = 0;
      UINT64 performancePosition = 0;
      result = captureClient->GetBuffer(
          &data,
          &framesAvailable,
          &flags,
          &devicePosition,
          &performancePosition);
      if (FAILED(result)) {
        running = false;
        exitCode = ExitCode::CaptureFailed;
        break;
      }

      const std::uint64_t byteCount64 = static_cast<std::uint64_t>(framesAvailable) * kChannels * (kBitsPerSample / 8);
      if (byteCount64 > kMaxPacketBytes || byteCount64 > std::numeric_limits<std::uint32_t>::max()) {
        captureClient->ReleaseBuffer(framesAvailable);
        running = false;
        exitCode = ExitCode::CaptureFailed;
        break;
      }
      const auto byteCount = static_cast<std::uint32_t>(byteCount64);
      const void* payload = data;
      if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0) {
        silence.assign(byteCount, 0);
        payload = silence.data();
      }

      const bool written = WriteFrame(kFramePcm, payload, byteCount);
      captureClient->ReleaseBuffer(framesAvailable);
      if (!written) {
        running = false;
        exitCode = ExitCode::PipeClosed;
        break;
      }
    }
    if (FAILED(result)) {
      exitCode = ExitCode::CaptureFailed;
      break;
    }
  }

  audioClient->Stop();
  if (mmcss) AvRevertMmThreadCharacteristics(mmcss);
  CloseHandle(sampleReady);
  CloseHandle(stop);
  return exitCode;
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
  SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32);
  bool processMode = false;
  std::uint64_t windowHandle = 0;
  if (argc == 2 && std::wcscmp(argv[1], L"--system") == 0) {
    processMode = false;
  } else if (argc == 3 && std::wcscmp(argv[1], L"--window-handle") == 0 && ParseUnsigned(argv[2], windowHandle)) {
    processMode = true;
  } else {
    WriteDiagnostic(L"INVALID_ARGUMENTS");
    return static_cast<int>(ExitCode::InvalidArguments);
  }

  const HRESULT initialized = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(initialized)) {
    WriteDiagnostic(L"COM_INITIALIZATION_FAILED");
    return static_cast<int>(ExitCode::CaptureFailed);
  }

  const ExitCode result = Capture(processMode, windowHandle);
  CoUninitialize();
  if (result != ExitCode::Success && result != ExitCode::PipeClosed) {
    switch (result) {
      case ExitCode::UnsupportedWindows: WriteDiagnostic(L"UNSUPPORTED_WINDOWS"); break;
      case ExitCode::InvalidWindow: WriteDiagnostic(L"INVALID_WINDOW"); break;
      case ExitCode::ActivationFailed: WriteDiagnostic(L"ACTIVATION_FAILED"); break;
      default: WriteDiagnostic(L"CAPTURE_FAILED"); break;
    }
  }
  return static_cast<int>(result);
}
