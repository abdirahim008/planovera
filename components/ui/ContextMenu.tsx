"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label?: string;
  icon?: React.ReactNode;
  action?: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
  /** When set, hovering the item opens a nested flyout of these items. */
  submenu?: ContextMenuItem[];
  /** Marks the currently-selected option inside a submenu. */
  active?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handler = () => onClose();
    
    // Using mousedown is more reliable than click for context menus
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handler);
      window.addEventListener("contextmenu", handler);
    }, 10);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("contextmenu", handler);
    };
  }, [onClose]);

  if (!mounted) return null;

  // Keep menu within viewport
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 20);

  return createPortal(
    <>
      {/* Invisible backdrop to capture clicks outside the menu */}
      <div 
        className="fixed inset-0 z-[9998] bg-transparent" 
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="ctx-menu z-[9999]"
        style={{ left: adjustedX, top: adjustedY }}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="ctx-divider" />
        ) : item.submenu ? (
          <SubmenuItem key={i} item={item} onClose={onClose} />
        ) : (
          <button
            key={i}
            className={`ctx-item ${item.danger ? "danger" : ""}`}
            disabled={item.disabled}
            style={{ opacity: item.disabled ? 0.35 : 1, cursor: item.disabled ? "default" : "pointer" }}
            onClick={() => {
              if (!item.disabled) {
                item.action?.();
                onClose();
              }
            }}
          >
            {item.icon && <span className="opacity-60 flex-shrink-0">{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
      </div>
    </>,
    document.body
  );
}

/** A menu row that reveals a nested flyout of options when hovered. */
function SubmenuItem({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={() => !item.disabled && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="ctx-item w-full"
        disabled={item.disabled}
        style={{ opacity: item.disabled ? 0.35 : 1, cursor: item.disabled ? "default" : "pointer" }}
        onClick={() => !item.disabled && setOpen((prev) => !prev)}
      >
        {item.icon && <span className="opacity-60 flex-shrink-0">{item.icon}</span>}
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronRightIcon />
      </button>
      {open && !item.disabled && (
        // Inline position beats .ctx-menu's `position: fixed`, which would
        // otherwise anchor left-full/top-0 to the viewport (flyout off-screen).
        <div className="ctx-menu left-full top-0 z-[10000] -ml-1" style={{ position: "absolute" }}>
          {item.submenu!.map((sub, j) =>
            sub.divider ? (
              <div key={j} className="ctx-divider" />
            ) : (
              <button
                key={j}
                type="button"
                className={`ctx-item ${sub.danger ? "danger" : ""}`}
                disabled={sub.disabled}
                style={{ opacity: sub.disabled ? 0.35 : 1, cursor: sub.disabled ? "default" : "pointer" }}
                onClick={() => {
                  if (!sub.disabled) {
                    sub.action?.();
                    onClose();
                  }
                }}
              >
                {sub.icon && <span className="opacity-60 flex-shrink-0">{sub.icon}</span>}
                <span className="flex-1 text-left">{sub.label}</span>
                {sub.active && <span className="text-[--accent]">✓</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="ml-auto opacity-50 flex-shrink-0">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
