import { api } from "@/lib/api";
import { isIOS, isStandalone } from "@/lib/pwa";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const needsInstallFirst = () => isIOS() && !isStandalone();

const toBytes = (v) => {
  const pad = "=".repeat((4 - (v.length % 4)) % 4);
  const raw = atob((v + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const currentSubscription = async () => {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
};

export const enablePush = async () => {
  if (needsInstallFirst()) throw new Error("Add RainCheck to your Home Screen first, then turn on alerts from the app.");
  if (!pushSupported()) throw new Error("This browser doesn't support notifications.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were blocked. Allow them in your phone settings.");
  const { data } = await api.get("/push/public-key");
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(data.publicKey) }));
  await api.post("/push/subscribe", sub.toJSON());
  return sub;
};

export const disablePush = async () => {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.post("/push/unsubscribe", sub.toJSON()).catch(() => {});
  await sub.unsubscribe();
};
