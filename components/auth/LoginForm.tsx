"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { inputClass, Field, EyeToggle } from "./fields";

export function LoginForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
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
          <input
            name="employeeCode"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="characters"
            placeholder="e.g. VERDE1234"
            className={`${inputClass} uppercase placeholder:normal-case`}
          />
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
