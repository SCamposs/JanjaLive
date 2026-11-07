"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode, type ComponentPropsWithRef } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Select } from "@base-ui/react/select";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
export { Menu } from "@base-ui/react/menu";
export { Input as TextInput } from "@base-ui/react/input";
export { usePlayerControlsAutoHide } from "./player-controls";
export { UserAvatar } from "./user-avatar";

export function ChoiceGroup<Value extends string>({ value, onValueChange, options, label, className }: {
  value: Value;
  onValueChange: (value: Value) => void;
  options: ReadonlyArray<{ value: Value; label: ReactNode }>;
  label: string;
  className?: string;
}) {
  return <RadioGroup value={value} aria-label={label} className={className} onValueChange={(next) => {
    const option = options.find((item) => item.value === next);
    if (option) onValueChange(option.value);
  }}>
    {options.map((option) => <Radio.Root key={option.value} value={option.value} nativeButton render={<button type="button" />} data-active={value === option.value}>{option.label}</Radio.Root>)}
  </RadioGroup>;
}

// Fullscreen elements form their own top layer. Popups must live inside it.
const PopupContainer = createContext<HTMLElement | null>(null);
const subscribeFullscreen = (notify: () => void) => {
  document.addEventListener("fullscreenchange", notify);
  return () => document.removeEventListener("fullscreenchange", notify);
};
const fullscreenSnapshot = () => document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : null;
const serverSnapshot = () => null;

export function InteractionProvider({ children }: { children: ReactNode }) {
  const container = useSyncExternalStore(subscribeFullscreen, fullscreenSnapshot, serverSnapshot);
  return <PopupContainer.Provider value={container}><Tooltip.Provider delay={350}>{children}</Tooltip.Provider></PopupContainer.Provider>;
}

export function TooltipButton({ tooltip, tooltipSide = "top", children, ...props }: ComponentPropsWithRef<"button"> & {
  tooltip: string;
  tooltipSide?: "top" | "bottom" | "left" | "right";
}) {
  const container = useContext(PopupContainer);
  return <Tooltip.Root>
      <Tooltip.Trigger render={<button type="button" {...props} />}>{children}</Tooltip.Trigger>
      <Tooltip.Portal container={container ?? undefined}>
        <Tooltip.Positioner side={tooltipSide} sideOffset={8} collisionPadding={10} className="jl-tooltip-positioner">
          <Tooltip.Popup className="jl-tooltip">{tooltip}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>;
}

export function AppSelect<Value extends string>({ value, onValueChange, options, label, disabled, className = "" }: {
  value: Value;
  onValueChange: (value: Value) => void;
  options: ReadonlyArray<{ value: Value; label: string }>;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const container = useContext(PopupContainer);
  return <Select.Root items={options} value={value} onValueChange={(next) => { if (next !== null) onValueChange(next); }} disabled={disabled}>
    <Select.Trigger aria-label={label} className={`jl-select-trigger ${className}`}>
      <Select.Value />
      <Select.Icon className="jl-select-icon"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={container ?? undefined}>
      <Select.Positioner sideOffset={6} alignItemWithTrigger={false} collisionPadding={10} className="jl-select-positioner">
        <Select.Popup className="jl-select-popup">
          <Select.List className="jl-select-list">
            {options.map((option) => <Select.Item key={option.value} value={option.value} className="jl-select-item">
              <Select.ItemText>{option.label}</Select.ItemText>
              <Select.ItemIndicator className="jl-select-check"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}
