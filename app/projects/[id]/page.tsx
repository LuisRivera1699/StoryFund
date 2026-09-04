"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useTransaction } from "@/hooks/useTransaction";
import { TransactionStatus } from "@/components/transaction-status";
import { FundStats } from "@/components/fund-stats";
import { ProjectStatusBadge, StoryStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  buildContractOperation,
  getAllocations,
  getProject,
  listProjectStories,
  scAddress,
  scU32,
  scVecU32,
} from "@/lib/contract";
import { rememberProjectId } from "@/lib/transactions";
import { boardColumn, formatUsdLike, shortenAddress } from "@/lib/utils";
import { explorerAccountUrl, explorerContractUrl, stellarConfig } from "@/config/stellar";
import type { Allocation, Project, Story } from "@/types";
import { ExternalLink } from "lucide-react";

const COLUMNS = [
  { id: "backlog", title: "Backlog" },
  { id: "in_progress", title: "In progress" },
  { id: "review", title: "Review" },
  { id: "completed", title: "Completed" },
] as const;

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const { connected, address, connect } = useWallet();
  const { tx, run } = useTransaction();
  const [project, setProject] = useState<Project | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [allocMap, setAllocMap] = useState<Record<number, Allocation[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!address || !Number.isFinite(projectId)) return;
    setLoading(true);
    setError(null);
    try {
      rememberProjectId(projectId);
      const p = await getProject(address, projectId);
      const s = await listProjectStories(address, projectId);
      const am: Record<number, Allocation[]> = {};
      for (const story of s) {
        am[story.storyId] = await getAllocations(address, projectId, story.storyId);
      }
      setProject(p);
      setStories(s);
      setAllocMap(am);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [address, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isOwner = project && address && project.owner === address;

  const board = useMemo(() => {
    const map: Record<string, Story[]> = {
      backlog: [],
      in_progress: [],
      review: [],
      completed: [],
    };
    for (const s of stories) {
      map[boardColumn(s.status)].push(s);
    }
    return map;
  }, [stories]);

  const fundUnfunded = async () => {
    if (!address || !project) return;
    const ids = stories.filter((s) => s.status === "Open" && s.fundedAmount < s.budget).map((s) => s.storyId);
    if (ids.length === 0) return;
    await run(
      [buildContractOperation("fund_stories", [scU32(projectId), scVecU32(ids), scAddress(address)])],
      `Fund ${ids.length} stories`,
    );
    await reload();
  };

  const cancelProject = async () => {
    if (!confirm("Cancel project and refund locked (unpaid) funds to the owner?")) return;
    await run([buildContractOperation("cancel_project", [scU32(projectId)])], "Cancel project");
    await reload();
  };

  if (!connected) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <p className="text-muted-foreground">Connect Freighter to view on-chain project state.</p>
        <Button className="mt-4" onClick={() => void connect()}>
          Connect Freighter
        </Button>
      </div>
    );
  }

  if (loading) {
    return <p className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground animate-pulse-soft">Loading project…</p>;
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20">
        <p className="text-destructive">{error ?? "Project not found"}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ensure NEXT_PUBLIC_CONTRACT_ID is set and the project exists on {stellarConfig.network}.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl">{project.title}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="max-w-2xl text-muted-foreground">{project.description}</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <a
              href={explorerAccountUrl(project.owner)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-primary"
            >
              Client {shortenAddress(project.owner)} <ExternalLink className="h-3 w-3" />
            </a>
            {stellarConfig.contractId && (
              <a
                href={explorerContractUrl(stellarConfig.contractId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary"
              >
                Contract <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <span>Review window: {Math.round(project.reviewWindow / 3600)}h</span>
          </div>
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void fundUnfunded().catch(() => undefined)}>Fund open HUs</Button>
            <Button variant="destructive" onClick={() => void cancelProject().catch(() => undefined)}>
              Cancel project
            </Button>
          </div>
        )}
      </div>

      <FundStats
        totalBudget={project.totalBudget}
        funded={project.fundedAmount}
        locked={project.lockedAmount}
        released={project.releasedAmount}
      />

      <TransactionStatus tx={tx} />

      <section>
        <h2 className="mb-4 font-display text-xl">Board</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="min-h-[200px] rounded-lg border border-border/70 bg-white/50 p-3">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {col.title}
              </div>
              <div className="space-y-2">
                {board[col.id].map((story) => (
                  <Link
                    key={story.storyId}
                    href={`/projects/${projectId}/stories/${story.storyId}`}
                    className="block rounded-md border border-border bg-white px-3 py-2 transition hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{story.title}</span>
                      <StoryStatusBadge status={story.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{formatUsdLike(story.budget)}</span>
                      <span>
                        {(allocMap[story.storyId] ?? []).length
                          ? `${(allocMap[story.storyId] ?? []).length} dev`
                          : "Unassigned"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
