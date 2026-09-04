"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useTransaction } from "@/hooks/useTransaction";
import { TransactionStatus } from "@/components/transaction-status";
import { StoryStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  buildContractOperation,
  getAllocations,
  getProject,
  getStory,
  scAddress,
  scU32,
  scVecAddress,
  scVecU32,
  scBool,
} from "@/lib/contract";
import { loadTxHistory } from "@/lib/transactions";
import { bpsToPercent, formatTimestamp, formatUsdLike, shortenAddress } from "@/lib/utils";
import { explorerAccountUrl, explorerTxUrl } from "@/config/stellar";
import type { Allocation, Project, Story } from "@/types";
import { ExternalLink, ArrowLeft } from "lucide-react";

export default function StoryDetailPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const storyId = Number(params.storyId);
  const { connected, address, connect } = useWallet();
  const { tx, run } = useTransaction();

  const [project, setProject] = useState<Project | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [devInput, setDevInput] = useState("");
  const [shareInput, setShareInput] = useState("10000");

  const reload = useCallback(async () => {
    if (!address) return;
    try {
      const [p, s, a] = await Promise.all([
        getProject(address, projectId),
        getStory(address, projectId, storyId),
        getAllocations(address, projectId, storyId),
      ]);
      setProject(p);
      setStory(s);
      setAllocations(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load story");
    }
  }, [address, projectId, storyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isOwner = !!(project && address && project.owner === address);
  const isDev = !!(address && allocations.some((a) => a.developer === address));

  const act = async (label: string, fn: () => ReturnType<typeof buildContractOperation>) => {
    await run([fn()], label);
    await reload();
  };

  const relatedTxs = loadTxHistory().filter(
    (t) => t.projectId === projectId || t.action.toLowerCase().includes("story"),
  );

  if (!connected) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <Button onClick={() => void connect()}>Connect Freighter</Button>
      </div>
    );
  }

  if (error || !story || !project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <p className="text-destructive">{error ?? "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to {project.title}
      </Link>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{story.title}</h1>
          <StoryStatusBadge status={story.status} />
          {story.paid && <span className="text-xs text-success">PAID</span>}
        </div>
        <p className="text-muted-foreground">{story.description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Meta label="Budget" value={formatUsdLike(story.budget)} />
        <Meta label="Funded" value={formatUsdLike(story.fundedAmount)} />
        <Meta label="Created" value={formatTimestamp(story.createdAt)} />
        <Meta label="Submitted" value={formatTimestamp(story.submittedAt)} />
        <Meta label="Review deadline" value={formatTimestamp(story.reviewDeadline)} />
        <Meta label="Completed" value={formatTimestamp(story.completedAt)} />
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-lg">Acceptance criteria</h2>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {story.acceptanceCriteria || "—"}
        </p>
      </section>

      {story.githubUrl && (
        <section>
          <h2 className="font-display text-lg">GitHub evidence</h2>
          <a
            href={story.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {story.githubUrl} <ExternalLink className="h-3 w-3" />
          </a>
          <p className="mt-1 text-xs text-muted-foreground">
            GitHub is context only — payout rules remain on the smart contract.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg">Developers & allocation</h2>
        {allocations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No developers assigned yet.</p>
        ) : (
          <ul className="space-y-2">
            {allocations.map((a) => (
              <li
                key={a.developer}
                className="flex items-center justify-between rounded-md border border-border bg-white/70 px-3 py-2 text-sm"
              >
                <a
                  href={explorerAccountUrl(a.developer)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono hover:text-primary"
                >
                  {shortenAddress(a.developer, 6)}
                </a>
                <span>{bpsToPercent(a.shareBps)}</span>
              </li>
            ))}
          </ul>
        )}

        {isOwner && !story.paid && story.status !== "Completed" && (
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="w-full space-y-1 sm:w-auto sm:flex-1">
              <Label>Developer address</Label>
              <Input value={devInput} onChange={(e) => setDevInput(e.target.value)} placeholder="G…" />
            </div>
            <div className="w-32 space-y-1">
              <Label>Share bps</Label>
              <Input value={shareInput} onChange={(e) => setShareInput(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() =>
                  void act("Assign developer", () =>
                    buildContractOperation("assign_developers", [
                      scU32(projectId),
                      scU32(storyId),
                      scVecAddress([devInput]),
                      scVecU32([Number(shareInput) || 10000]),
                    ]),
                  ).catch(() => undefined)
                }
              >
                Assign
              </Button>
            </div>
          </div>
        )}
      </section>

      <TransactionStatus tx={tx} />

      <section className="flex flex-wrap gap-2">
        {isOwner && story.status === "Open" && (
          <Button
            onClick={() =>
              void act("Fund story", () =>
                buildContractOperation("fund_stories", [
                  scU32(projectId),
                  scVecU32([storyId]),
                  scAddress(address!),
                ]),
              ).catch(() => undefined)
            }
          >
            Fund story
          </Button>
        )}
        {isDev && (story.status === "Funded" || story.status === "Open") && story.fundedAmount >= story.budget && (
          <Button
            onClick={() =>
              void act("Start work", () =>
                buildContractOperation("start_story", [
                  scU32(projectId),
                  scU32(storyId),
                  scAddress(address!),
                ]),
              ).catch(() => undefined)
            }
          >
            Start work
          </Button>
        )}
        {isDev && story.status === "InProgress" && (
          <Button
            onClick={() =>
              void act("Submit for review", () =>
                buildContractOperation("submit_story", [
                  scU32(projectId),
                  scU32(storyId),
                  scAddress(address!),
                ]),
              ).catch(() => undefined)
            }
          >
            Submit for review
          </Button>
        )}
        {isOwner && (story.status === "Submitted" || story.status === "UnderReview") && (
          <>
            <Button
              onClick={() =>
                void act("Approve & release payment", () =>
                  buildContractOperation("approve_story", [scU32(projectId), scU32(storyId)]),
                ).catch(() => undefined)
              }
            >
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                void act("Dispute story", () =>
                  buildContractOperation("dispute_story", [scU32(projectId), scU32(storyId)]),
                ).catch(() => undefined)
              }
            >
              Dispute
            </Button>
          </>
        )}
        {story.status === "Disputed" && address === project.resolver && (
          <>
            <Button
              onClick={() =>
                void act("Resolve: approve payout", () =>
                  buildContractOperation("resolve_dispute", [
                    scU32(projectId),
                    scU32(storyId),
                    scBool(true),
                  ]),
                ).catch(() => undefined)
              }
            >
              Resolve → pay
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void act("Resolve: refund client", () =>
                  buildContractOperation("resolve_dispute", [
                    scU32(projectId),
                    scU32(storyId),
                    scBool(false),
                  ]),
                ).catch(() => undefined)
              }
            >
              Resolve → refund
            </Button>
          </>
        )}
        {(story.status === "Submitted" || story.status === "UnderReview") && (
          <Button
            variant="secondary"
            onClick={() =>
              void act("Auto-complete after window", () =>
                buildContractOperation("auto_complete_story", [scU32(projectId), scU32(storyId)]),
              ).catch(() => undefined)
            }
          >
            Auto-complete (if window elapsed)
          </Button>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg">Transaction history</h2>
        {relatedTxs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No local records for this session yet.</p>
        ) : (
          <ul className="space-y-2">
            {relatedTxs.slice(0, 10).map((t) => (
              <li
                key={t.hash + t.timestamp}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm"
              >
                <span>{t.action}</span>
                <a
                  href={explorerTxUrl(t.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-primary"
                >
                  View on Stellar Expert <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-white/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
