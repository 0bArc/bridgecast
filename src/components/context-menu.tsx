"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
};

type Props = {
  items: ContextMenuItem[];
  children: ReactNode;
  className?: string;
  onReady?: (openAt: (clientX: number, clientY: number) => void) => void;
};

const LONG_PRESS_MS = 480;

export function ContextMenu({ items, children, className = "", onReady }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const close = useCallback(() => setOpen(false), []);

  const openAt = useCallback((clientX: number, clientY: number) => {
    if (items.length === 0 || items.every((i) => i.disabled)) return;
    const pad = 8;
    const menuW = 200;
    const menuH = items.length * 36 + 16;
    const x = Math.min(clientX, window.innerWidth - menuW - pad);
    const y = Math.min(clientY, window.innerHeight - menuH - pad);
    setPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
    setOpen(true);
  }, [items]);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    onReadyRef.current?.(openAt);
  }, [openAt]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openAt(e.clientX, e.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      if (touchStart.current) {
        openAt(touchStart.current.x, touchStart.current.y);
        touchStart.current = null;
      }
    }, LONG_PRESS_MS);
  };

  const onTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    touchStart.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const start = touchStart.current;
    if (!t || !start) return;
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      touchStart.current = null;
    }
  };

  return (
    <>
      <div
        ref={rootRef}
        className={className}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
      >
        {children}
      </div>
      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              role="menu"
              className="menu menu-sm bg-base-300 border border-base-content/10 rounded-box shadow-xl fixed z-[100] min-w-[11rem] p-1"
              style={{ left: pos.x, top: pos.y }}
            >
              {items.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    className={`w-full justify-start ${item.danger ? "text-error" : ""}`}
                    onClick={() => {
                      close();
                      item.onClick();
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>,
            document.body
          )
        : null}
    </>
  );
}
