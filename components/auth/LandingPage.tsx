import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Link2,
  MapPinned,
  PencilRuler,
  ShieldCheck,
} from "lucide-react";

const moduleCards = [
  {
    label: "Portfolio",
    description: "Live dashboards across every project and programme.",
    icon: LayoutDashboard,
  },
  {
    label: "BOQ",
    description: "Spreadsheet-grade bills of quantities with Excel import.",
    icon: FileText,
  },
  {
    label: "Progress",
    description: "Planned-versus-actual tracking with earned value.",
    icon: CheckCircle2,
  },
  {
    label: "Payments",
    description: "FIDIC-style certificates, retention and advance recovery.",
    icon: ShieldCheck,
  },
  {
    label: "Documents",
    description: "Generate, store and version project paperwork.",
    icon: ClipboardList,
  },
  {
    label: "Project map",
    description: "Geo-locate sites and visualise your portfolio.",
    icon: MapPinned,
  },
];

const valueProps = [
  {
    title: "One source of truth",
    description:
      "BOQs, payments, progress and documents stay linked, so the numbers reconcile automatically across every report.",
    icon: Link2,
  },
  {
    title: "Built for the field",
    description:
      "Site notes, checklists, correspondence and meeting minutes capture the work where it actually happens.",
    icon: ClipboardList,
  },
  {
    title: "Drawings included",
    description:
      "An integrated technical drawing studio is built in, so there is no separate CAD tool to license or learn.",
    icon: PencilRuler,
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080d14] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(59,130,246,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.08)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(37,99,235,0.28),transparent_32%),radial-gradient(circle_at_86%_18%,rgba(20,184,166,0.18),transparent_28%),linear-gradient(180deg,rgba(8,13,20,0.15),#080d14_88%)]" />

      <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 py-6">
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
              <span className="block text-xl font-extrabold tracking-tight text-white">Planovera</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.32em] text-blue-200/55">
                Project controls
              </span>
            </span>
          </a>

          <nav className="flex items-center gap-3">
            <a
              href="/login"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-blue-400/50 hover:bg-blue-500/15"
            >
              Sign in
            </a>
            <a
              href="/login?mode=signup"
              className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-400"
            >
              Create account
            </a>
          </nav>
        </header>

        <section className="grid items-center gap-10 py-12 lg:grid-cols-[0.82fr_1.18fr] lg:py-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-100">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Built for project delivery teams
            </div>

            <h1 className="mt-7 text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-[3.5rem]">
              Project delivery{" "}
              <span className="bg-gradient-to-r from-blue-400 to-teal-300 bg-clip-text text-transparent">
                command centre
              </span>{" "}
              for serious field teams.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-blue-100/70 sm:text-lg">
              Planovera gives NGOs, government agencies, consultants, and contractors one operating system for BOQs,
              progress, payments, meetings, documents, compliance, field notes, and technical drawings.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-500/25 transition hover:bg-blue-400"
              >
                Start with Planovera
                <ArrowRight size={16} />
              </a>
              <a
                href="/login"
                className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-blue-300/40 hover:bg-white/10"
              >
                Open workspace
              </a>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] font-medium text-blue-100/60">
              {["BOQ & payments", "Progress & earned value", "Drawings studio"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-teal-300" />
                  {item}
                </span>
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
                className="relative min-h-[420px] w-full rounded-[1.4rem] object-cover object-left-top lg:min-h-[600px]"
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
                    <div className="text-2xl font-bold text-white">{value}</div>
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-blue-100/55">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 py-16 lg:py-20">
          <div className="max-w-2xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-300/70">
              One workspace
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
              Every discipline, in the same place.
            </h2>
            <p className="mt-4 text-base leading-7 text-blue-100/65">
              Stop stitching together spreadsheets, email threads, and drawing files. Planovera connects each module so
              your team works from a single, current picture of the project.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moduleCards.map(({ label, description, icon: Icon }) => (
              <div
                key={label}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-blue-300/30 hover:bg-white/[0.07]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-blue-500/15 text-blue-300 transition group-hover:bg-blue-500/25">
                  <Icon size={20} />
                </span>
                <div className="mt-4 text-base font-semibold text-white">{label}</div>
                <p className="mt-1.5 text-sm leading-6 text-blue-100/60">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-white/10 py-16 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-3">
            {valueProps.map(({ title, description, icon: Icon }) => (
              <div key={title} className="flex flex-col gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-teal-300/20 bg-teal-400/10 text-teal-300">
                  <Icon size={20} />
                </span>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="text-sm leading-7 text-blue-100/60">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-12 lg:py-16">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-gradient-to-br from-blue-600/25 via-blue-500/10 to-teal-500/15 px-6 py-12 text-center sm:px-12 sm:py-16">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.25),transparent_60%)]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
                Bring your next project online today.
              </h2>
              <p className="mt-4 text-base leading-7 text-blue-50/75">
                Create an account in minutes, or open the workspace and explore with built-in demo data first.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a
                  href="/login?mode=signup"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 shadow-xl shadow-black/20 transition hover:bg-blue-50"
                >
                  Create account
                  <ArrowRight size={16} />
                </a>
                <a
                  href="/login"
                  className="rounded-2xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Open workspace
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white">
              <Image
                src="/brand/planovera-mark.png"
                alt="Planovera"
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
              />
            </span>
            <span className="text-sm font-semibold text-white">Planovera</span>
          </div>
          <p className="text-[13px] text-blue-100/45">
            &copy; {new Date().getFullYear()} Planovera. Project controls for delivery teams.
          </p>
          <a href="/login" className="text-[13px] font-semibold text-blue-200/70 transition hover:text-white">
            Sign in
          </a>
        </footer>
      </div>
    </main>
  );
}
