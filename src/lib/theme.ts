/** Tema claro/escuro: preferência guardada neste aparelho (localStorage). Sem escolha, a tela é clara; "system" (Automático) segue o aparelho. */
export type ThemePref = "light" | "dark" | "system";
export const THEME_KEY = "printup-theme";
const EVENT = "printup-theme";

export const isPref = (v: unknown): v is ThemePref => v === "light" || v === "dark" || v === "system";

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isPref(v) ? v : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
  document.documentElement.dataset.themePref = pref;
}

export function setPref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // sem armazenamento (janela privada): vale só nesta visita
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

export function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => { if (readPref() === "system") { applyTheme("system"); cb(); } };
  mq.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", onSystem);
  };
}

/** Roda no <head> antes da primeira pintura, para a página não piscar clara antes de ficar escura. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"&&t!=="system")t="light";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.dataset.theme=d?"dark":"light";e.dataset.themePref=t}catch(x){}})()`;
