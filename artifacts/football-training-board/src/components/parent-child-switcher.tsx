import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { withApi } from "@/lib/api-base";
import { PARENT_CHILD_CHANGED_KEY, setAuthToken, setExpectedParentChild } from "@/lib/auth-token";

type ParentChildren = {
  children: { id: number; firstName: string; lastName: string }[];
  selectedId: number;
};

export function ParentChildSwitcher() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data } = useQuery({
    queryKey: ["parent-children"],
    queryFn: async (): Promise<ParentChildren> => {
      const response = await fetch(withApi("/api/auth/parent-children"), { credentials: "include" });
      if (!response.ok) throw new Error("Impossibile caricare i figli collegati.");
      return response.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (data) setExpectedParentChild(data.selectedId);
  }, [data]);

  useEffect(() => {
    function syncChild(event: StorageEvent) {
      if (event.key === PARENT_CHILD_CHANGED_KEY) {
        setExpectedParentChild(Number(event.newValue?.split(":")[0]) || undefined);
        window.location.reload();
      }
    }
    window.addEventListener("storage", syncChild);
    return () => window.removeEventListener("storage", syncChild);
  }, []);

  async function selectChild(value: string) {
    setBusy(true);
    setError("");
    try {
      const playerId = Number(value);
      const response = await fetch(withApi("/api/auth/parent-children/select"), {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!response.ok) throw new Error("Impossibile cambiare figlio. Ricarica la pagina e riprova.");
      const { authToken } = await response.json();
      setAuthToken(authToken);
      setExpectedParentChild(playerId);
      localStorage.setItem(PARENT_CHILD_CHANGED_KEY, `${playerId}:${Date.now()}`);
      window.location.reload();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Impossibile cambiare figlio.");
      setBusy(false);
    }
  }

  if (!data || data.children.length < 2) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
      <Label htmlFor="parent-child-select">Figlio selezionato</Label>
      <Select value={String(data.selectedId)} onValueChange={selectChild} disabled={busy}>
        <SelectTrigger id="parent-child-select" className="w-full sm:w-64"><SelectValue /></SelectTrigger>
        <SelectContent>
          {data.children.map(child => <SelectItem key={child.id} value={String(child.id)}>{child.firstName} {child.lastName}</SelectItem>)}
        </SelectContent>
      </Select>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
