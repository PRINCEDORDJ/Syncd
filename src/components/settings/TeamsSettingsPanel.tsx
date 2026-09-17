import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "./ui-primitives";
import type { PlanTier } from "@/lib/plans";
import { Loader2 } from "lucide-react";

interface Team {
  id: string;
  name: string;
  owner_id: string;
}

interface TeamMember {
  id: string;
  email: string;
  role: string;
  accepted_at: string | null;
  user_id: string | null;
}

export function TeamsSettingsPanel({
  user,
  effectivePlan,
  isAdmin,
}: {
  user: User;
  effectivePlan: PlanTier;
  isAdmin: boolean;
}) {
  const [team, setTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMsg, setTeamMsg] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: ownedTeams } = await supabase
        .from("teams")
        .select("id, name, owner_id")
        .eq("owner_id", user.id)
        .limit(1);
      if (cancelled) return;
      const t = ownedTeams?.[0] ?? null;
      setTeam(t);
      if (t) {
        const { data: mems } = await supabase
          .from("team_members")
          .select("id, email, role, accepted_at, user_id")
          .eq("team_id", t.id);
        if (!cancelled) setTeamMembers(mems ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function createTeam() {
    if (!isAdmin && effectivePlan !== "teams") {
      setTeamMsg("Creating teams and inviting members requires the Teams plan.");
      return;
    }
    setTeamMsg(null);
    const { data, error } = await supabase
      .from("teams")
      .insert({ owner_id: user.id, name: "My team" })
      .select("id, name, owner_id")
      .single();
    if (error) {
      setTeamMsg(error.message);
      return;
    }
    setTeam(data);
    setTeamMembers([]);
  }

  async function inviteMember() {
    if (!team) return;
    if (!isAdmin && effectivePlan !== "teams") {
      setTeamMsg("Inviting team members requires the Teams plan.");
      return;
    }
    const email = inviteEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setTeamMsg("Enter a valid email address.");
      return;
    }
    setInviting(true);
    setTeamMsg(null);
    const { data, error } = await supabase
      .from("team_members")
      .insert({ team_id: team.id, email, role: "editor" })
      .select("id, email, role, accepted_at, user_id")
      .single();
    setInviting(false);
    if (error) {
      setTeamMsg(error.message);
      return;
    }
    setTeamMembers((prev) => [...prev, data]);
    setInviteEmail("");
    setTeamMsg(`Invited ${email}. They'll join automatically when they sign in.`);
  }

  async function removeMember(id: string) {
    if (!team) return;
    await supabase.from("team_members").delete().eq("id", id);
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
  }

  if (loading) {
    return (
      <Section title="Team" subtitle="Invite up to 5 teammates to share this workspace's drafts.">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-4">
          <Loader2 className="size-4 animate-spin" />
          Loading team…
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Team"
      subtitle="Invite up to 5 teammates to share this workspace's drafts."
    >
      {!isAdmin && effectivePlan !== "teams" ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-border rounded-md bg-subtle/40">
          <div>
            <div className="text-[14px] font-medium text-ink">Teams plan required</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              Creating a team and inviting collaborators requires the Teams plan.
            </div>
          </div>
          <Link
            to="/pricing"
            className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium inline-flex items-center justify-center hover:bg-ink/90 shrink-0"
          >
            Upgrade to Teams
          </Link>
        </div>
      ) : !team ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-border rounded-md bg-subtle/40">
          <div>
            <div className="text-[14px] font-medium text-ink">No team yet</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              Create a team to invite others. Requires the Teams plan for full access.
            </div>
          </div>
          <button
            type="button"
            onClick={createTeam}
            className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90"
          >
            Create team
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="h-10 flex-1 px-3 rounded-md border border-border bg-card text-[14px] focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink"
            />
            <button
              type="button"
              onClick={inviteMember}
              disabled={inviting || !inviteEmail.trim()}
              className="h-10 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50"
            >
              {inviting ? "Inviting…" : "Invite"}
            </button>
          </div>
          {teamMsg && (
            <div className="text-[12px] text-muted-foreground">{teamMsg}</div>
          )}
          <ul className="divide-y divide-border border border-border rounded-md bg-card">
            <li className="px-3 py-2 flex items-center justify-between text-[13px]">
              <div>
                <span className="font-medium text-ink">{user.email}</span>
                <span className="ml-2 text-[11px] font-mono uppercase text-muted-foreground">
                  Owner
                </span>
              </div>
            </li>
            {teamMembers.map((m) => (
              <li key={m.id} className="px-3 py-2 flex items-center justify-between text-[13px]">
                <div className="min-w-0">
                  <span className="text-ink truncate">{m.email}</span>
                  <span className="ml-2 text-[11px] font-mono uppercase text-muted-foreground">
                    {m.accepted_at ? m.role : "invited"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  className="text-[12px] text-destructive hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
