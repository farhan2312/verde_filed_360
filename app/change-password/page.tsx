import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export const metadata: Metadata = { title: "Set a new password · Verde Agrotech" };

export default function ChangePasswordPage() {
  return (
    <AuthLayout>
      <ChangePasswordForm />
    </AuthLayout>
  );
}
