"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { loadProjectIds, loadTxHistory } from "@/lib/transactions";
import { getProject, getProjectStats, listProjectStories } from "@/lib/contract";
import type { Project, ProjectStats, Story } from "@/types";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/status-badge";
import { formatUsdLike } from "@/lib/utils";
import { explorerTxUrl } from "@/config/stellar";
import { Plus, ExternalLink } from "lucide-react";

interface Row {
  project: Project;
  stats: ProjectStats;
  stories: Story[];
}

export default function DashboardPage() {
  const { connected, address, connect } = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txs, setTxs] = useState(loadTxHistory());

  useEffect(() => {
    setTxs(loadTxHistory());
  }, []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const ids = loadProjectIds();
        const loaded: Row[] = [];
        for (const id of ids) {
          try {
            const [project, stats, stories] = await Promise.all([
              getProject(address, id),
              getProjectStats(address, id),
              listProjectStories(address, id),
            ]);
            loaded.push({ project, stats, stories });
          } catch {
            // project may not exist on this network / contract
          }
        }
        if (!cancelled) setRows(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load projects");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const totals = rows.reduce(
    (acc, r) => ({
      locked: acc.locked + r.stats.locked,
      paid: acc.paid + r.stats.released,
      active: acc.active + (r.project.status === "Active" ? 1 : 0),
      completedHus:
        acc.completedHus + r.stories.filter((s) => s.status === "Completed").length,
      pendingReviews:
        acc.pendingReviews +
        r.stories.filter((s) => s.status === "Submitted" || s.status === "UnderReview").length,
    }),
    { locked: 0n, paid: 0n, active: 0, completedHus: 0, pendingReviews: 0 },
  );

  if (!connected) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Connect Freighter to load on-chain projects.</p>
        <Button className="mt-6" onClick={() => void connect()}>
          Connect Freighter
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Canonical balances and statuses come from Soroban — not a database.
          </p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus className="h-4 w-4" /> New project
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total locked", value: formatUsdLike(totals.locked) },
          { label: "Total paid", value: formatUsdLike(totals.paid) },
          { label: "Active projects", value: String(totals.active) },
          { label: "Completed HUs", value: String(totals.completedHus) },
          { label: "Pending reviews", value: String(totals.pendingReviews) },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/70 bg-white/70 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="mt-1 font-mono text-lg font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground animate-pulse-soft">Loading on-chain state…</p>}

      <section className="space-y-3">
        <h2 className="font-display text-xl">Projects</h2>
        {rows.length === 0 && !loading ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No indexed projects yet. Create one or open a project by ID after deploy.
            <div className="mt-4">
              <Link href="/projects/new" className="text-primary hover:underline">
                Create your first project
              </Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white/70">
            {rows.map(({ project, stats }) => (
              <li key={project.projectId}>
                <Link
                  href={`/projects/${project.projectId}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-secondary/40"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{project.title}</span>
                      <ProjectStatusBadge status={project.status} />
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      {project.description || "No description"}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-mono">{formatUsdLike(stats.locked)} locked</div>
                    <div className="text-muted-foreground">
                      {formatUsdLike(stats.released)} released
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Recent transactions</h2>
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No local transaction history yet.</p>
        ) : (
          <ul className="space-y-2">
            {txs.slice(0, 8).map((t) => (
              <li
                key={t.hash + t.timestamp}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-white/60 px-3 py-2 text-sm"
              >
                <span className="font-medium">{t.action}</span>
                <a
                  href={explorerTxUrl(t.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                >
                  {t.hash.slice(0, 12)}… <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
