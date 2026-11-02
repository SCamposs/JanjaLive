"use client";

import { UsersRound } from "lucide-react";
import { useState } from "react";

export function AudienceBadge({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false);
  return <div className="audience-badge" data-open={open} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" aria-label={`${names.length} ${names.length === 1 ? "espectador" : "espectadores"}`} aria-expanded={open} onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setOpen(true); }} onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}><UsersRound size={14} /><span>{names.length}</span></button>
    <div className="audience-names"><strong>Assistindo agora</strong>{names.length ? <ul>{names.map((name, index) => <li key={index}>{name}</li>)}</ul> : <span>Ninguém assistindo</span>}</div>
  </div>;
}
