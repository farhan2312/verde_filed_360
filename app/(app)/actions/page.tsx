import { redirect } from "next/navigation";

// Action Planner was absorbed into the Cluster → Project → Campaign flow.
// Projects (formerly the planner board) now live under Campaigns · Step 2.
export default function ActionsPage() {
  redirect("/campaigns");
}
