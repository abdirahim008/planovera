"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label?: string;
  icon?: React.ReactNode;
  action?: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
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
