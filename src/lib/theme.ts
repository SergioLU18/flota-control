// Apariencia: automática (sigue al sistema), clara u oscura. Se guarda por dispositivo.
// index.html aplica el tema guardado antes de que React cargue, para que no parpadee en blanco;
// si cambias la clave o los valores, actualiza también ese script.
import { useEffect, useState } from 'react'

export type ThemePref = 'auto' | 'light' | 'dark'

const KEY = 'ajustes.tema'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch { return 'auto' }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'auto' && media.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#F2F2F7')
}

// En automático, seguir los cambios del sistema mientras la app está abierta.
media.addEventListener('change', () => apply(readTheme()))
apply(readTheme())

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readTheme)
  useEffect(() => {
    try { localStorage.setItem(KEY, pref) } catch { /* sin almacenamiento: dura lo que la pestaña */ }
    apply(pref)
  }, [pref])
  return [pref, setPref] as const
}
