import { Zap, CheckCircle2 } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-[hsl(var(--background))]">
            {/* Brand panel */}
            <div className="hidden lg:flex relative overflow-hidden bg-slate-950 text-white">
                <div className="absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.35),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(99,102,241,0.35),transparent_55%)]" />
                <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.6) 1px,transparent 1px)",
                        backgroundSize: "32px 32px",
                    }}
                />
                <div className="relative z-10 flex flex-col justify-between p-12 w-full">
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/40">
                            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
                        </div>
                        <span className="text-lg font-semibold tracking-tight">Fieldio</span>
                    </div>

                    <div className="max-w-md space-y-8">
                        <div>
                            <h2 className="text-3xl font-semibold tracking-tight leading-tight">
                                The modern operating system for field service businesses.
                            </h2>
                            <p className="mt-3 text-slate-300/90 leading-relaxed">
                                Schedule jobs, dispatch technicians, get paid faster — all in one beautifully simple workspace.
                            </p>
                        </div>
                        <ul className="space-y-3 text-sm text-slate-300">
                            {[
                                "Real-time dispatch with live GPS tracking",
                                "Online payments via Stripe — get paid 3× faster",
                                "Automated SMS & email customer updates",
                                "Recurring service plans on autopilot",
                            ].map((item) => (
                                <li key={item} className="flex items-start gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <p className="text-xs text-slate-500">
                        © {new Date().getFullYear()} Fieldio. Built for trade service teams.
                    </p>
                </div>
            </div>

            {/* Form panel */}
            <div className="flex items-center justify-center p-6 sm:p-12">
                <div className="w-full max-w-sm">{children}</div>
            </div>
        </div>
    );
}
