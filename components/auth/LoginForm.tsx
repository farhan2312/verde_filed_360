"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { inputClass, Field, EyeToggle } from "./fields";

/** Every Verde login is VER<number>; the form supplies the prefix so only the number is typed. */
export const VER_PREFIX = "VER";
export function withVerPrefix(raw: string): string {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!v) return "";
  return v.startsWith(VER_PREFIX) ? v : VER_PREFIX + v;
}

export function LoginForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    // The field shows a fixed "VER" prefix and people type only their number, so re-attach it here.
    // A pasted full code ("VER074") is tolerated — the prefix is never doubled.
    fd.set("employeeCode", withVerPrefix(String(fd.get("employeeCode") ?? "")));
    start(async () => {
      const res = await loginAction(fd);
      if (res.error) setError(res.error);
      else {
        // Land on "/" so middleware routes each role home (campaigners → Campaigns; forced resets → change-password).
        router.replace("/");
        router.refresh();
      }
    });
  };

  return (
    <div className="w-full max-w-[380px] rounded-2xl bg-white p-8 shadow-modal">
      <div className="mb-6 flex justify-center">
        <img src="/logo.svg" alt="Verde Agrotech" className="h-14" />
      </div>
      <h2 className="text-[20px] font-bold text-ink">Sign in</h2>
      <p className="mt-1 text-[12.5px] text-ink-muted">Access the Verde Field Intel platform</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Employee Code">
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-[13px] font-bold tracking-[0.5px] text-ink-500"
            >
              {VER_PREFIX}
            </span>
            <input
              name="employeeCode"
              type="text"
              inputMode="numeric"
              required
              autoComplete="username"
              autoCapitalize="characters"
              placeholder="074"
              aria-label="Employee code number, without the VER prefix"
              className={`${inputClass} pl-[42px] uppercase placeholder:normal-case`}
            />
          </div>
        </Field>

        <Field label="Password">
          <div className="relative">
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={inputClass}
            />
            <EyeToggle shown={show} onToggle={() => setShow((s) => !s)} />
          </div>
        </Field>

        {error && (
          <div className="rounded-lg bg-danger-50 px-3 py-2 text-[12px] font-medium text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-5 text-center text-[12.5px] text-ink-muted">
        New to Verde Field Intel?{" "}
        <Link href="/register" className="font-semibold text-brand-600 hover:underline">
          Request access
        </Link>
      </div>
      <div className="mt-3 text-center text-[10.5px] text-ink-400">
        Verde Agrotech · Internal use only
      </div>
    </div>
  );
}
