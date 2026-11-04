// src/lib/utils/patch-fetch.ts
//
// In restricted browser environments (such as sandboxed iframes, Chrome extensions,
// or embedded webviews), window.fetch may be defined as a getter-only property on
// window or Window.prototype. When third-party packages, telemetry, polyfills, or
// browser extensions attempt to assign `window.fetch = customFetch`, strict-mode
// throws: "TypeError: Cannot set property fetch of #<Window> which has only a getter".
//
// This module provides a safe setter on window / Window.prototype so assignments
// succeed cleanly without throwing or crashing the application.

export function ensureFetchWritable(): void {
  if (typeof window === "undefined") return;

  try {
    let activeFetch = window.fetch;
    if (typeof activeFetch !== "function") return;

    // Check if window.fetch already has a setter and is writable
    const winDesc = Object.getOwnPropertyDescriptor(window, "fetch");
    const protoDesc = typeof Window !== "undefined" && Window.prototype
      ? Object.getOwnPropertyDescriptor(Window.prototype, "fetch")
      : undefined;

    const needsPatch =
      (winDesc && (!winDesc.set && !winDesc.writable)) ||
      (protoDesc && (!protoDesc.set && !protoDesc.writable));

    if (needsPatch || !winDesc) {
      try {
        Object.defineProperty(window, "fetch", {
          get() {
            return activeFetch;
          },
          set(nextFetch) {
            activeFetch = nextFetch;
          },
          configurable: true,
          enumerable: true,
        });
      } catch {
        if (typeof Window !== "undefined" && Window.prototype) {
          try {
            Object.defineProperty(Window.prototype, "fetch", {
              get() {
                return activeFetch;
              },
              set(nextFetch) {
                activeFetch = nextFetch;
              },
              configurable: true,
              enumerable: true,
            });
          } catch {
            // Best effort safeguard
          }
        }
      }
    }
  } catch {
    // Fail-safe; do not interrupt execution
  }
}

// Execute immediately upon module import
ensureFetchWritable();
