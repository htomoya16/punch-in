"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useResponsiveNavigation() {
  const [menu, setMenu] = useState(false);

  const [compactNavigation, setCompactNavigation] = useState(false);

  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const closeMenu = useCallback(() => {
    setMenu(false);
    requestAnimationFrame(() => menuButton.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width:1200px)");
    const change = () => {
      setCompactNavigation(media.matches);
      setMenu(false);
    };
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!compactNavigation || !menu) return;
    const focusTimer = setTimeout(
      () =>
        sidebarRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true }),
      30,
    );
    const key = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
      if (event.key !== "Tab") return;
      const items = sidebarRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),a[href]",
      );
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", key);
    };
  }, [compactNavigation, menu, closeMenu]);
  return { menu, setMenu, compactNavigation, menuButton, sidebarRef, closeMenu };
}
