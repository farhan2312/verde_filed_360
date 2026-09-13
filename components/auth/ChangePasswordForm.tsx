"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction } from "@/app/actions/auth";
import { inputClass, Field, EyeToggle } from "./fields";

export function ChangePasswordForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await changePasswordAction(fd);
      if (res.error) setError(res.error);
      else {
        // Land on "/" and let middleware route each role home (campaigners → Campaigns, others → Analytics).
        router.replace("/");
        router.refresh();
      }
    });
  };

  return (
    <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-modal">
      <div className="mb-6 flex justify-center">
        <img src="/logo.svg" alt="Verde Agrotech" className="h-14" />
      </div>
      <h2 className="text-[20px] font-bold text-ink">Set a new password</h2>
      <p className="mt-1 text-[12.5px] text-ink-muted">
        For security, choose a new password before continuing.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="New password" hint="(min 8 chars)">
          <div className="relative">
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              className={inputClass}
            />
            <EyeToggle shown={show} onToggle={() => setShow((s) => !s)} />
          </div>
        </Field>
        <Field label="Confirm new password">
          <input
            name="confirm"
            type={show ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
            className={inputClass}
          />
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
          {pending ? "Saving…" : "Save & continue"}
        </button>
      </form>
    </div>
  );
}
