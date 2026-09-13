export function Placeholder({ name }: { name: string }) {
  return (
    <div className="animate-fadeUp rounded-[14px] border border-dashed border-line bg-white p-12 text-center">
      <div className="text-[15px] font-bold text-ink">{name}</div>
      <div className="mt-1 text-[12px] text-ink-muted">Screen implementation pending.</div>
    </div>
  );
}
