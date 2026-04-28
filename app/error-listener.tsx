"use client";

import { useEffect } from "react";

export function ErrorListener() {
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      // log every shape we might see so we can identify the source
      console.warn("[unhandled rejection]");
      console.warn("  type:", typeof r, r?.constructor?.name);
      console.warn("  message:", r?.message);
      console.warn("  stack:", r?.stack);
      try {
        console.warn("  json:", JSON.stringify(r, null, 2));
      } catch {
        console.warn("  (not json-serializable)");
      }
      console.warn("  raw:", r);
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);
  return null;
}
