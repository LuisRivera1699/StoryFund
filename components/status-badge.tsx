"use client";

import { Badge } from "@/components/ui/badge";
import type { ProjectStatus, StoryStatus } from "@/types";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const variant =
    status === "Active"
      ? "success"
      : status === "Completed"
        ? "default"
        : status === "Disputed" || status === "Cancelled"
          ? "destructive"
          : status === "Funding"
            ? "warning"
            : "muted";
  return <Badge variant={variant}>{status}</Badge>;
}

export function StoryStatusBadge({ status }: { status: StoryStatus }) {
  const variant =
    status === "Completed"
      ? "success"
      : status === "Disputed" || status === "Cancelled"
        ? "destructive"
        : status === "Submitted" || status === "UnderReview"
          ? "warning"
          : status === "InProgress" || status === "Funded"
            ? "default"
            : "muted";
  return <Badge variant={variant}>{status}</Badge>;
}
