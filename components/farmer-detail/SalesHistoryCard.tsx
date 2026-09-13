import { Card } from "@/components/ui";
import type { FarmerSale } from "./types";

const GRID = "grid grid-cols-[0.7fr_0.5fr_1.1fr_0.55fr_0.55fr_0.5fr]";

export function SalesHistoryCard({ sales }: { sales: FarmerSale[] }) {
  return (
    <Card className="p-[22px]">
      <div className="text-[15px] font-bold text-[#1A1C1A] mb-3.5">
        Sales / Invoice History
      </div>
      {sales.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="min-w-[520px] lg:min-w-0">
          <div
            className={`${GRID} py-2.5 border-b border-[#F0F0F0] text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-[0.4px]`}
          >
            <div>Invoice</div>
            <div>Date</div>
            <div>Items</div>
            <div>Base ₹</div>
            <div>+GST ₹</div>
            <div>Store</div>
          </div>
          {sales.map((sale) => (
            <div
              key={sale.id}
              className={`${GRID} py-[11px] border-b border-[#F8F8F8] items-center`}
            >
              <div className="text-[12px] font-semibold text-[#1565C0]">{sale.invoice}</div>
              <div className="text-[12px] text-[#757575]">{sale.date}</div>
              <div className="text-[12px] text-[#424242]">{sale.items}</div>
              <div className="text-[12.5px] font-bold text-[#1A1C1A]">{sale.base}</div>
              <div className="text-[12px] text-[#9E9E9E]" title="GST-inclusive final price (display only)">{sale.amount}</div>
              <div className="text-[11px] text-[#9E9E9E]">{sale.store}</div>
            </div>
          ))}
          </div>
        </div>
      ) : (
        <div className="p-7 text-center text-[#BDBDBD] text-[13px]">
          No purchase history yet
        </div>
      )}
    </Card>
  );
}
