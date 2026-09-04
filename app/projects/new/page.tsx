"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useTransaction } from "@/hooks/useTransaction";
import { TransactionStatus } from "@/components/transaction-status";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import {
  buildContractOperation,
  getNextProjectId,
  scAddress,
  scOptionU64,
  scString,
  scI128,
  scU32,
  scVecAddress,
  scVecU32,
} from "@/lib/contract";
import { rememberProjectId } from "@/lib/transactions";
import { toBaseUnits } from "@/lib/utils";
import { DEMO_PROJECT, DEFAULT_REVIEW_WINDOW_SECONDS, stellarConfig } from "@/config/stellar";
import { Plus, Trash2, Sparkles } from "lucide-react";

interface DraftStory {
  title: string;
  description: string;
  acceptance: string;
  budget: string;
  githubUrl: string;
  developer: string;
  shareBps: string;
}

const emptyStory = (): DraftStory => ({
  title: "",
  description: "",
  acceptance: "",
  budget: "",
  githubUrl: "",
  developer: "",
  shareBps: "10000",
});

export default function NewProjectPage() {
  const { connected, address, connect } = useWallet();
  const { tx, run, reset } = useTransaction();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reviewHours, setReviewHours] = useState("48");
  const [stories, setStories] = useState<DraftStory[]>([emptyStory()]);
  const [busy, setBusy] = useState(false);
  const [stepLog, setStepLog] = useState<string[]>([]);

  const fillDemo = () => {
    setTitle(DEMO_PROJECT.title);
    setDescription(DEMO_PROJECT.description);
    setStories(
      DEMO_PROJECT.stories.map((s) => ({
        title: s.title,
        description: s.description,
        acceptance: s.acceptance,
        budget: String(s.budget),
        githubUrl: "",
        developer: address ?? "",
        shareBps: "10000",
      })),
    );
  };

  const create = async () => {
    if (!address) return;
    if (!stellarConfig.contractId) {
      alert("Set NEXT_PUBLIC_CONTRACT_ID after deploying the contract.");
      return;
    }
    setBusy(true);
    reset();
    const logs: string[] = [];
    try {
      const windowSecs = Math.max(1, Math.floor(Number(reviewHours) * 3600)) || DEFAULT_REVIEW_WINDOW_SECONDS;

      logs.push("Creating project on-chain…");
      setStepLog([...logs]);
      await run(
        [
          buildContractOperation("create_project", [
            scAddress(address),
            scString(title),
            scString(description),
            scOptionU64(windowSecs),
          ]),
        ],
        "Create project",
      );

      // Discover new project id
      const nextId = await getNextProjectId(address);
      const projectId = nextId - 1;
      rememberProjectId(projectId);
      logs.push(`Project #${projectId} created.`);
      setStepLog([...logs]);

      for (let i = 0; i < stories.length; i++) {
        const st = stories[i];
        if (!st.title || !st.budget) continue;
        const budget = toBaseUnits(st.budget);
        logs.push(`Creating HU: ${st.title}…`);
        setStepLog([...logs]);
        await run(
          [
            buildContractOperation("create_story", [
              scU32(projectId),
              scString(st.title),
              scString(st.description),
              scString(st.acceptance),
              scI128(budget),
              scString(st.githubUrl),
            ]),
          ],
          `Create story: ${st.title}`,
        );
        const storyId = i + 1;

        if (st.developer) {
          logs.push(`Assigning developer to HU #${storyId}…`);
          setStepLog([...logs]);
          await run(
            [
              buildContractOperation("assign_developers", [
                scU32(projectId),
                scU32(storyId),
                scVecAddress([st.developer]),
                scVecU32([Number(st.shareBps) || 10000]),
              ]),
            ],
            `Assign developer HU #${storyId}`,
          );
        }
      }

      logs.push("All on-chain steps confirmed.");
      setStepLog([...logs]);
      router.push(`/projects/${projectId}`);
    } catch (e) {
      logs.push(e instanceof Error ? e.message : "Failed");
      setStepLog([...logs]);
    } finally {
      setBusy(false);
    }
  };

  if (!connected) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl">Create project</h1>
        <p className="mt-2 text-muted-foreground">Connect Freighter to register a project on Soroban.</p>
        <Button className="mt-6" onClick={() => void connect()}>
          Connect Freighter
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Create project</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Project metadata and budgets are written on-chain. Each action waits for confirmation.
          </p>
        </div>
        <Button variant="outline" onClick={fillDemo}>
          <Sparkles className="h-4 w-4" /> Load demo template
        </Button>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-white/70 p-5">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ecommerce rebuild" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Description</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="review">Review window (hours)</Label>
          <Input
            id="review"
            type="number"
            min={1}
            value={reviewHours}
            onChange={(e) => setReviewHours(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">User stories</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStories((s) => [...s, emptyStory()])}
          >
            <Plus className="h-4 w-4" /> Add HU
          </Button>
        </div>
        {stories.map((st, idx) => (
          <div key={idx} className="space-y-3 rounded-lg border border-border bg-white/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">HU-{String(idx + 1).padStart(3, "0")}</span>
              {stories.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStories((s) => s.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Input
              placeholder="Title"
              value={st.title}
              onChange={(e) =>
                setStories((s) => s.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))
              }
            />
            <Textarea
              placeholder="Description"
              value={st.description}
              onChange={(e) =>
                setStories((s) =>
                  s.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                )
              }
            />
            <Textarea
              placeholder="Acceptance criteria"
              value={st.acceptance}
              onChange={(e) =>
                setStories((s) =>
                  s.map((x, i) => (i === idx ? { ...x, acceptance: e.target.value } : x)),
                )
              }
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder={`Budget (${stellarConfig.tokenSymbol})`}
                value={st.budget}
                onChange={(e) =>
                  setStories((s) => s.map((x, i) => (i === idx ? { ...x, budget: e.target.value } : x)))
                }
              />
              <Input
                placeholder="Developer address (G…)"
                value={st.developer}
                onChange={(e) =>
                  setStories((s) =>
                    s.map((x, i) => (i === idx ? { ...x, developer: e.target.value } : x)),
                  )
                }
              />
              <Input
                placeholder="Share bps (10000=100%)"
                value={st.shareBps}
                onChange={(e) =>
                  setStories((s) =>
                    s.map((x, i) => (i === idx ? { ...x, shareBps: e.target.value } : x)),
                  )
                }
              />
            </div>
            <Input
              placeholder="GitHub issue/PR URL (optional evidence)"
              value={st.githubUrl}
              onChange={(e) =>
                setStories((s) =>
                  s.map((x, i) => (i === idx ? { ...x, githubUrl: e.target.value } : x)),
                )
              }
            />
          </div>
        ))}
      </div>

      <TransactionStatus tx={tx} />

      {stepLog.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-border bg-white/60 p-4 text-sm">
          {stepLog.map((l, i) => (
            <li key={i} className="text-muted-foreground">
              {l}
            </li>
          ))}
        </ul>
      )}

      <Button size="lg" disabled={busy || !title} onClick={() => void create()}>
        {busy ? "Waiting for confirmations…" : "Create on-chain"}
      </Button>
    </div>
  );
}
