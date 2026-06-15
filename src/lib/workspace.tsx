import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { PLANS, type PlanId, type PlanConfig } from "./plans";
import type { AppUser } from "./supabase";

export interface Workspace {
  id: string;
  name: string;
  type: "individual" | "agency";
  plan: PlanId;
  owner_uid: string;
  billing_email: string;
  plan_expires_at: string | null;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  uid: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "pending";
  invited_email: string;
  joined_at: string | null;
}

interface WorkspaceCtx {
  workspace: Workspace | null;
  workspaces: Workspace[];
  members: WorkspaceMember[];
  limits: PlanConfig;
  loading: boolean;
  switchWorkspace: (id: string) => void;
  refetch: () => Promise<void>;
  canUse: (feature: keyof PlanConfig) => boolean;
  isOwner: boolean;
  isAdmin: boolean;
}

const Ctx = createContext<WorkspaceCtx>({
  workspace: null, workspaces: [], members: [],
  limits: PLANS.starter, loading: true,
  switchWorkspace: () => {}, refetch: async () => {},
  canUse: () => false, isOwner: false, isAdmin: false,
});

export function useWorkspace() { return useContext(Ctx); }

export function WorkspaceProvider({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive]         = useState<string | null>(
    () => localStorage.getItem(`velox_ws_${user.uid}`)
  );
  const [members, setMembers]       = useState<WorkspaceMember[]>([]);
  const [loading, setLoading]       = useState(true);

  const fetch = useCallback(async () => {
    // Load all workspaces user is part of
    const { data: ws } = await supabase
      .from("workspaces").select("*")
      .order("created_at", { ascending: true });

    if (!ws?.length) {
      // Auto-provision — first ever login
      const { data: created } = await supabase
        .from("workspaces")
        .insert({ name: `${user.name}'s Workspace`, type: "individual", plan: "starter", owner_uid: user.uid })
        .select().single();
      if (created) {
        await supabase.from("workspace_members").insert({
          workspace_id: created.id, uid: user.uid,
          role: "owner", status: "active", joined_at: new Date().toISOString(),
        });
        setWorkspaces([created as Workspace]);
        setActive(created.id);
        localStorage.setItem(`velox_ws_${user.uid}`, created.id);
      }
      setLoading(false);
      return;
    }

    setWorkspaces(ws as Workspace[]);

    const currentId = active ?? ws[0].id;
    const valid = ws.find(w => w.id === currentId) ? currentId : ws[0].id;
    if (valid !== active) {
      setActive(valid);
      localStorage.setItem(`velox_ws_${user.uid}`, valid);
    }

    // Load members of active workspace
    const { data: mem } = await supabase
      .from("workspace_members").select("*")
      .eq("workspace_id", valid)
      .order("joined_at", { ascending: true });
    setMembers((mem as WorkspaceMember[]) ?? []);

    setLoading(false);
  }, [user.uid, user.name, active]);

  useEffect(() => { fetch(); }, []);

  const switchWorkspace = (id: string) => {
    setActive(id);
    localStorage.setItem(`velox_ws_${user.uid}`, id);
    // Reload members
    supabase.from("workspace_members").select("*").eq("workspace_id", id)
      .then(({ data }) => setMembers((data as WorkspaceMember[]) ?? []));
  };

  const workspace = workspaces.find(w => w.id === active) ?? null;
  const limits    = PLANS[workspace?.plan ?? "starter"];
  const myMembership = members.find(m => m.uid === user.uid);
  const isOwner   = workspace?.owner_uid === user.uid;
  const isAdmin   = isOwner || myMembership?.role === "admin";

  const canUse = (feature: keyof PlanConfig): boolean => {
    const val = limits[feature];
    if (typeof val === "boolean") return val;
    if (typeof val === "number")  return val !== 0;
    return true;
  };

  return (
    <Ctx.Provider value={{ workspace, workspaces, members, limits, loading, switchWorkspace, refetch: fetch, canUse, isOwner, isAdmin }}>
      {children}
    </Ctx.Provider>
  );
}