"use client";

import { CircleAlert, X } from "lucide-react";

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="toast" role="alert" aria-live="assertive">
      <CircleAlert className="toast-icon" size={17} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Fechar aviso">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
