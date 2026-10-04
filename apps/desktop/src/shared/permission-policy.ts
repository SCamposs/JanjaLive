type DesktopPermissionContext = {
  permission: string;
  isMainFrame: boolean;
  isMainWindow: boolean;
  isTrustedRenderer: boolean;
};

export function canGrantDesktopPermission(context: DesktopPermissionContext) {
  return (
    context.permission === "display-capture" &&
    context.isMainFrame &&
    context.isMainWindow &&
    context.isTrustedRenderer
  );
}
