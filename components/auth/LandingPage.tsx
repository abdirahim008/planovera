import Image from "next/image";
import { ArrowRight, CheckCircle2, FileText, LayoutDashboard, MapPinned, ShieldCheck } from "lucide-react";

const featureCards = [
  { label: "Portfolio", icon: LayoutDashboard },
  { label: "BOQ", icon: FileText },
  { label: "Progress", icon: CheckCircle2 },
  { label: "Payments", icon: ShieldCheck },
  { label: "Documents", icon: FileText },
  { label: "Project map", icon: MapPinned },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#080d14] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(59,130,246,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.08)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(37,99,235,0.28),transparent_32%),radial-gradient(circle_at_86%_18%,rgba(20,184,166,0.18),transparent_28%),linear-gradient(180deg,rgba(8,13,20,0.15),#080d14_88%)]" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white shadow-xl shadow-blue-950/30">
              <Image
                src="/brand/planovera-mark.png"
                alt="Planovera"
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
                priority
              />
            </span>
            <span>
              <span className="block text-xl font-black tracking-tight text-white">Planovera</span>
              <span className="block text-[11px] font-bold uppercase tracking-[0.32em] text-blue-200/60">
                Project controls
              </span>
            </span>
          </a>

          <nav className="flex items-center gap-3">
            <a
              href="/login"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:border-blue-400/50 hover:bg-blue-500/15"
            >
              Sign in
            </a>
            <a
              href="/login?mode=signup"
              className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-400"
            >
              Create account
            </a>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[0.78fr_1.22fr] lg:py-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.28em] text-blue-100">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Built for project delivery teams
            </div>

            <h1 className="mt-7 text-4xl font-black leading-[0.95] tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
              Project delivery command centre for serious field teams.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-blue-100/72 sm:text-lg">
              Planovera gives NGOs, government agencies, consultants, and contractors one operating system for BOQs,
              progress, payments, meetings, documents, compliance, field notes, and technical drawings.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-black text-white shadow-xl shadow-blue-500/25 transition hover:bg-blue-400"
              >
                Start with Planovera
                <ArrowRight size={16} />
              </a>
              <a
                href="/login"
                className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-black text-white transition hover:border-blue-300/40 hover:bg-white/10"
              >
                Open workspace
              </a>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {featureCards.map(({ label, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-bold text-slate-200"
                >
                  <Icon size={16} className="text-blue-300" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] bg-blue-500/12 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-slate-950/70 p-3 shadow-2xl shadow-black/50">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-amber-400/10" />
              <Image
                src="/brand/planovera-hero-dashboard.png"
                alt="Planovera project controls dashboard preview"
                width={1536}
                height={864}
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="relative min-h-[420px] w-full rounded-[1.4rem] object-cover object-left-top lg:min-h-[640px]"
                priority
              />
              <div className="absolute inset-x-3 bottom-3 grid gap-3 sm:grid-cols-3">
                {[
                  ["12", "Active projects"],
                  ["4.8M", "Tracked value"],
                  ["37", "Open actions"],
                ].map(([value, label]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-[#09111f]/85 px-5 py-4 text-center shadow-xl shadow-black/30 backdrop-blur"
                  >
                    <div className="text-2xl font-black text-white">{value}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.26em] text-blue-100/55">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
