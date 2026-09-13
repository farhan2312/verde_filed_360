import { Card } from "@/components/ui";

export function ConcernsCard({
  concerns,
  issues,
}: {
  concerns: string;
  issues: string[];
}) {
  return (
    <Card className="p-[22px]">
      <div className="text-[15px] font-bold text-[#1A1C1A] mb-3.5">Issues & Concerns</div>
      {concerns && (
        <div className="text-[12.5px] text-[#616161] leading-[1.55] mb-3">{concerns}</div>
      )}
      {issues.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {issues.map((issue) => (
            <span
              key={issue}
              className="px-2.5 py-1 rounded-[20px] text-[11px] font-semibold bg-[#FFF3E0] text-[#E65100]"
            >
              {issue}
            </span>
          ))}
        </div>
      ) : (
        !concerns && (
          <div className="text-[13px] text-[#BDBDBD]">No issues or concerns recorded</div>
        )
      )}
    </Card>
  );
}
