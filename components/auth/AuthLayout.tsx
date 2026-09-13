export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-900 to-brand-950 p-12 text-white lg:flex">
        {/* Soft green glow behind the arcs */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 640,
            height: 640,
            background:
              "radial-gradient(circle, rgba(129,199,132,0.18), rgba(129,199,132,0) 68%)",
          }}
        />
        {/* Concentric semicircles anchored to the left edge */}
        {[300, 500, 720, 960, 1220].map((d, i) => (
          <div
            key={d}
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{
              width: d,
              height: d,
              borderColor: `rgba(255,255,255,${(0.1 - i * 0.014).toFixed(3)})`,
            }}
          />
        ))}
        {/* Faint tinted accent ring */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-300/20"
        />

        <div className="relative flex items-center gap-3">
          <img src="/logo-mark.svg" alt="Verde Agrotech" className="h-11 w-11 rounded-lg bg-white p-1" />
          <div>
            <div className="text-[15px] font-bold">Verde Field Intel</div>
            <div className="text-[10px] uppercase tracking-[0.5px] text-white/50">Verde Agrotech</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="text-[40px] font-light leading-[1.1]">
            Field intelligence for
            <br />
            <span className="font-semibold text-brand-200">every farmer</span>
          </h1>
          <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-white/60">
            Real-time visit analytics, Farmer 360, and sales intelligence for the Verde Agrotech
            field team.
          </p>
        </div>

        <div className="relative text-[11px] text-white/40">
          Verde Agrotech · Internal use only
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full items-center justify-center bg-canvas p-6 lg:w-1/2">
        {children}
      </div>
    </div>
  );
}
