import { notFound } from "next/navigation";
import { getStoreList } from "@/app/actions/store-360";
import { StoreListScreen } from "@/components/store-360/StoreListScreen";

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const stores = await getStoreList();
  // null = officer / campaigner (no access). An RM with no mapped stores gets an empty list, not a 404.
  if (stores === null) notFound();

  if (stores.length === 0) {
    return (
      <div className="animate-[fadeUp_0.4s_ease-out] rounded-[14px] border border-[#F5CE8E] bg-[#FEF6E9] px-4 py-10 text-center text-[13px] text-[#8D6E00]">
        No stores are mapped to your account yet. Ask an admin to set you as the regional manager for your stores.
      </div>
    );
  }

  return <StoreListScreen stores={stores} />;
}
