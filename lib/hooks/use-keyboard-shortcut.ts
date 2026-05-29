"use client"

import { useEffect } from "react"

export function useKeyboardShortcut(
  key: string,
  ctrl: boolean,
  shift: boolean,
  callback: () => void
) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (
        e.key &&
        e.key.toLowerCase() === key.toLowerCase() &&
        e.ctrlKey === ctrl &&
        e.shiftKey === shift
      ) {
        e.preventDefault()
        callback()
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [key, ctrl, shift, callback])
}
