"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refresca los datos de la página del servidor cada N segundos. */
export default function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
