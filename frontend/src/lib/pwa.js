import { useEffect, useState } from "react";

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isMobile = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent) || isIOS();

let deferred = null;
const listeners = new Set();
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e;
  listeners.forEach((l) => l(e));
});

export const useInstallPrompt = () => {
  const [prompt, setPrompt] = useState(deferred);
  useEffect(() => {
    listeners.add(setPrompt);
    return () => listeners.delete(setPrompt);
  }, []);
  const install = async () => {
    if (!prompt) return false;
    prompt.prompt();
    await prompt.userChoice;
    deferred = null;
    setPrompt(null);
    return true;
  };
  return { canPrompt: !!prompt, install };
};

export const useIsSmallScreen = () => {
  const q = "(max-width: 767px)";
  const [small, setSmall] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setSmall(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return small;
};

export const registerSW = () => {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
};
