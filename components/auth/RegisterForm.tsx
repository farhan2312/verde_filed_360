"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registerAction } from "@/app/actions/auth";
import { REQUESTABLE_ROLES } from "@/lib/roles";
import { inputClass, Field, EyeToggle } from "./fields";

export function RegisterForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [show, setShow] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await registerAction(fd);
      if (res.error) setError(res.error);
      else setDone(true);
    });
  };

  if (done) {
    return (
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-8 text-center shadow-modal">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </div>
        <h2 className="text-[20px] font-bold text-ink">Request submitted</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Your access request has been sent to the administrator. You&apos;ll be able to sign
          in once it&apos;s approved and a role is assigned.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block w-full rounded-lg bg-brand-600 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[420px] rounded-2xl bg-white p-8 shadow-modal">
      <h2 className="text-[22px] font-bold text-ink">Create account</h2>
      <p className="mt-1 text-[12.5px] text-ink-muted">Request access to Verde Field Intel</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Full name">
          <input name="name" required placeholder="Your full name" className={inputClass} />
        </Field>
        <Field label="Employee Code">
          <input
            name="employeeCode"
            required
            autoCapitalize="characters"
            placeholder="e.g. VERDE1234"
            className={`${inputClass} uppercase placeholder:normal-case`}
          />
        </Field>
        <Field label="Password" hint="(min 8 chars)">
          <div className="relative">
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={8}
              placeholder="••••••••"
              className={inputClass}
            />
            <EyeToggle shown={show} onToggle={() => setShow((s) => !s)} />
          </div>
        </Field>
        <Field label="Confirm password">
          <input
            name="confirm"
            type={show ? "text" : "password"}
            required
            minLength={8}
            placeholder="••••••••"
            className={inputClass}
          />
        </Field>
        <Field label="Requested role">
          <select name="role" defaultValue="officer" className={`${inputClass} cursor-pointer`}>
            {REQUESTABLE_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
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
          {pending ? "Submitting…" : "Request access"}
        </button>
      </form>

      <div className="mt-5 text-center text-[12.5px] text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
