import { Menu } from "@janjalive/ui";

export function DesktopAccountMenu({ user, canLogout, onLogout, onSafety }: {
  user: { name: string; image?: string | null };
  canLogout: boolean;
  onLogout: () => Promise<void>;
  onSafety: () => void;
}) {
  return <Menu.Root>
    <Menu.Trigger className="account-button" aria-label={`Conta de ${user.name}`}>
      {user.image ? <img src={user.image} alt="" /> : <span className="avatar-fallback">{user.name[0]}</span>}
      <span>{user.name}</span>
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner sideOffset={8} align="end" collisionPadding={10} className="jl-menu-positioner">
        <Menu.Popup className="jl-menu-popup desktop-account-popup">
          <Menu.Item render={<button type="button" />} nativeButton disabled={!canLogout} onClick={() => void onLogout()}>Sair da conta</Menu.Item>
          <Menu.Item render={<button type="button" />} nativeButton onClick={onSafety}>Privacidade e denúncia</Menu.Item>
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>;
}
