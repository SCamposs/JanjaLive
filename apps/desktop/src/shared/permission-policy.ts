type DesktopPermissionContext = {
  hasCaptureGrant: boolean;
  isLegacyDisplayCapture: boolean;
  permission: string;
  isMainFrame: boolean;
  isMainWindow: boolean;
  isTrustedRenderer: boolean;
};

export function canGrantDesktopPermission(context: DesktopPermissionContext) {
  const isTrustedFullscreen =
    context.permission === "fullscreen" &&
    context.isMainFrame &&
    context.isMainWindow &&
    context.isTrustedRenderer;
  const isDisplayCapture =
    context.permission === "display-capture" ||
    (context.permission === "media" && context.isLegacyDisplayCapture);
  return isTrustedFullscreen || (
    isDisplayCapture &&
    context.hasCaptureGrant &&
    context.isMainFrame &&
    context.isMainWindow &&
    context.isTrustedRenderer
  );
}
