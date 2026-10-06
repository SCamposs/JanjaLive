type DesktopPermissionContext = {
  hasCaptureGrant: boolean;
  isLegacyDisplayCapture: boolean;
  permission: string;
  isMainFrame: boolean;
  isMainWindow: boolean;
  isTrustedRenderer: boolean;
};

export function canGrantDesktopPermission(context: DesktopPermissionContext) {
  const isDisplayCapture =
    context.permission === "display-capture" ||
    (context.permission === "media" && context.isLegacyDisplayCapture);
  return (
    isDisplayCapture &&
    context.hasCaptureGrant &&
    context.isMainFrame &&
    context.isMainWindow &&
    context.isTrustedRenderer
  );
}
