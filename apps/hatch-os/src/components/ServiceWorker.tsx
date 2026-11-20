"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    const vv = window.visualViewport;
    const applyInset = () => {
      if (!vv) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${Math.round(inset)}px`);
    };
    applyInset();
    vv?.addEventListener("resize", applyInset);
    vv?.addEventListener("scroll", applyInset);

    let removeController: (() => void) | undefined;
    if ("serviceWorker" in navigator) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      let reloading = false;
      const onChange = () => {
        if (!hadController || reloading) return;
        reloading = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onChange);
      removeController = () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
        void reg.update().catch(() => undefined);
      }).catch(() => {
        /* demo / file:// ignore */
      });
    }
    return () => {
      vv?.removeEventListener("resize", applyInset);
      vv?.removeEventListener("scroll", applyInset);
      removeController?.();
    };
  }, []);
  return null;
}
