import { redirect } from "next/navigation";

// Project detail was absorbed into Campaigns · Step 2 (Projects tab).
export default function ProjectDetailPage() {
  redirect("/campaigns");
}
