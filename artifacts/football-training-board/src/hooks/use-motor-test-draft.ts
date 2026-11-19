import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import type { MotorTestSession } from "@workspace/api-zod";
import { useAuth } from "./use-auth";
import { MotorDraftStore } from "@/lib/motor-test-drafts";

export function useMotorTestDraft(allowed: (session: MotorTestSession) => boolean) {
  const { club, user, role, profileKey, section } = useAuth();
  const cache = useQueryClient();
  const [, render] = useReducer(n => n + 1, 0);
  const [active, setActive] = useState<{ scope: string; id: string }>();
  const activeRef = useRef(active); activeRef.current = active;
  const permission = useRef(allowed); permission.current = allowed;
  const scope = JSON.stringify([club?.id, user?.id, profileKey, role, section]);
  const store = useMemo(() => new MotorDraftStore({
    scope,
    storage: {
      get length() { return window.localStorage.length; },
      getItem: key => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: key => window.localStorage.removeItem(key),
      key: index => window.localStorage.key(index),
    },
    allowed: session => !!user && permission.current(session),
    put: data => customFetch<MotorTestSession>("/api/motor-tests/" + data.id, { method: "PUT", body: JSON.stringify(data) }),
    latest: async id => (await customFetch<{ sessions: MotorTestSession[] }>("/api/motor-tests")).sessions.find(s => s.id === id),
    changed: () => render(),
    saved: () => {
      for (const key of ["/api/motor-tests", "/api/training-sessions", "/api/exercises", "/api/players"]) void cache.invalidateQueries({ queryKey: [key] });
    },
  }), [scope, cache]);
  useEffect(() => {
    store.start();
    const flush = () => store.flushAll();
    const retry = () => store.retry();
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    const unload = (event: BeforeUnloadEvent) => { flush(); if (store.unsafe()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("online", retry);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", hide);
    const timer = window.setInterval(retry, 15000);
    return () => {
      flush(); // Already synchronously backed up; start a final online attempt on app navigation.
      store.stop();
      clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [store]);
  const draft = active?.scope === scope ? store.current(active.id) : undefined;
  function open(server: MotorTestSession) {
    if (activeRef.current?.scope === scope) void store.flush(activeRef.current.id);
    const value = store.open(server);
    setActive({ scope, id: value.id });
  }
  function setDraft(value: MotorTestSession | undefined) {
    if (!value) {
      if (draft) void store.flush(draft.id);
      setActive(undefined);
    } else {
      store.edit(value);
      setActive({ scope, id: value.id });
    }
  }
  return {
    draft, setDraft, open,
    recovered: store.recoverable(),
    status: draft ? store.status(draft.id) : undefined,
    save: {
      isPending: false, // Background saves never lock the editor or player selector.
      isError: draft ? store.status(draft.id).error : false,
      mutate: (value: MotorTestSession) => { setDraft(value); void store.flush(value.id, true); },
    },
    retry: () => store.retry(true),
  };
}
