"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { api } from "@/lib/api/browser";
import { onSessionExpired, setSessionHint } from "@/lib/api/refresh";

import { subscribeToAuthEvents } from "./broadcast";

type SessionContextValue = {
  hasSession: boolean;
  setHasSession: (value: boolean) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  initialHasSession,
  children,
}: {
  initialHasSession: boolean;
  children: React.ReactNode;
}) {
  const [hasSession, setHasSession] = useState(initialHasSession);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    setSessionHint(() => hasSession);
  }, [hasSession]);

  useEffect(() => {
    const stopExpired = onSessionExpired(() => {
      queryClient.clear();
      setHasSession(false);
      void api.POST("/api/v1/auth/logout").finally(() => router.refresh());
    });
    const stopEvents = subscribeToAuthEvents((event) => {
      queryClient.clear();
      setHasSession(event === "login");
      router.refresh();
    });
    return () => {
      stopExpired();
      stopEvents();
    };
  }, [queryClient, router]);

  return <SessionContext value={{ hasSession, setHasSession }}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return value;
}
