"use client";

import { CircleAlert, X } from "lucide-react";

export function Toast({
  message,
  onDismiss,
  action,
}: {
  message: string;
  onDismiss: () => void;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="toast" role="alert" aria-live="assertive">
      <CircleAlert className="toast-icon" size={17} aria-hidden="true" />
      <span>{message}</span>
      {action && <button className="toast-action" type="button" onClick={action.onClick}>{action.label}</button>}
      <button className="toast-dismiss" type="button" onClick={onDismiss} aria-label="Fechar aviso">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
