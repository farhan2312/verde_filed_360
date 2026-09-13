import { notFound } from "next/navigation";
import { getRole } from "@/lib/session";
import { listBugs } from "@/app/actions/bugs";
import { BugTracker } from "@/components/bugs/BugTracker";

export const dynamic = "force-dynamic";

export default async function BugsPage() {
  if ((await getRole()) !== "sysadmin") notFound();
  const bugs = await listBugs();
  return <BugTracker bugs={bugs} />;
}
