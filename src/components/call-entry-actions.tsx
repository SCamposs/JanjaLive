import Link from "next/link";

export function CallEntryActions({ desktopLink, publicId }: { desktopLink: string; publicId: string }) {
  return <>
    <div className="call-entry-actions">
      <a className="button primary" href={desktopLink}>Abrir no aplicativo</a>
      <Link className="button secondary" href={`/join/${publicId}`}>Continuar no navegador</Link>
    </div>
    <p className="call-install-note">Ainda não possui o aplicativo instalado? <a href="https://apps.microsoft.com/detail/9NHM2B9TCL8Z?hl=pt-br&gl=BR" target="_blank" rel="noreferrer">Baixar pela Microsoft Store</a></p>
  </>;
}
