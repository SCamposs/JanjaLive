import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <Link href="/privacidade">Privacidade</Link>
      <span aria-hidden="true">·</span>
      <Link href="/termos">Termos de uso</Link>
    </footer>
  );
}
