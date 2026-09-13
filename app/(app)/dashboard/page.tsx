import { redirect } from "next/navigation";

/** The Dashboard was merged into Analytics (the home page). Keep old links/bookmarks working. */
export default function DashboardPage() {
  redirect("/analytics");
}
