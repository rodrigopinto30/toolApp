"use client";

import { useEffect, useState } from "react";

export function useCooldown() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!seconds) {
      return;
    }
    const timer = setTimeout(() => setSeconds(0), seconds * 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return { active: seconds > 0, start: (value: number) => setSeconds(Math.max(1, Math.ceil(value))) };
}
