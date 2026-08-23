"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, ShieldCheck, GitBranch } from "lucide-react";

export default function LandingPage() {
  const { connected, connect, freighterInstalled, connecting } = useWallet();
  const router = useRouter();

  const cta = async () => {
    if (!connected) {
      if (!freighterInstalled) {
        window.open("https://www.freighter.app/", "_blank");
        return;
      }
      try {
        await connect();
        router.push("/dashboard");
      } catch {
        // error surfaced in wallet button
      }
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230ea5e9' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />
        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-center px-4 py-16">
          <p className="animate-fade-up font-display text-5xl tracking-tight text-foreground sm:text-7xl">
            Story<span className="text-primary">Fund</span>
          </p>
          <h1 className="animate-fade-up mt-6 max-w-2xl text-balance text-2xl font-medium text-foreground/90 sm:text-3xl [animation-delay:100ms]">
            Fund software development. Pay only for verified work.
          </h1>
          <p className="animate-fade-up mt-4 max-w-xl text-muted-foreground [animation-delay:180ms]">
            Clients lock budgets per user story on Stellar. Developers deliver. When work is
            approved, the smart contract releases payment — no custodial middleman.
          </p>
          <div className="animate-fade-up mt-8 flex flex-wrap gap-3 [animation-delay:260ms]">
            <Button size="lg" onClick={() => void cta()} disabled={connecting}>
              {connected ? "Open dashboard" : freighterInstalled ? "Connect Freighter" : "Install Freighter"}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-white/70 px-8 text-base font-medium hover:bg-secondary"
            >
              Explore projects
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-white/40 py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-3">
          {[
            {
              icon: Lock,
              title: "Escrow on Soroban",
              body: "Funds move from your Freighter wallet into the contract — never to a server.",
            },
            {
              icon: ShieldCheck,
              title: "Verified payouts",
              body: "Submit → review → approve. Only authorized accounts unlock payment.",
            },
            {
              icon: GitBranch,
              title: "Story-level budgets",
              body: "Fund Login for $500 and Checkout for $2,000 separately. Transparent accounting.",
            },
          ].map((f) => (
            <div key={f.title} className="space-y-3">
              <f.icon className="h-6 w-6 text-primary" />
              <h2 className="font-display text-xl">{f.title}</h2>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
