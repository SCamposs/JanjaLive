export function launchBrowserAuth(
  startPolling: () => void,
  openBrowser: () => Promise<unknown>,
  onOpenError: () => void,
) {
  startPolling();
  void openBrowser().catch(onOpenError);
}
