type DesktopPermissionContext = {
  hasCaptureGrant: boolean;
  permission: string;
  isMainFrame: boolean;
  isMainWindow: boolean;
  isTrustedRenderer: boolean;
};

export function canGrantDesktopPermission(context: DesktopPermissionContext) {
  return (
    (context.permission === "display-capture" || context.permission === "media") &&
    context.hasCaptureGrant &&
    context.isMainFrame &&
    context.isMainWindow &&
    context.isTrustedRenderer
  );
}
