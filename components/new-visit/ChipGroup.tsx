"use client";

/**
 * Single / multi select chip row. Reproduces the design `mkSingle` / `mkMulti`:
 * selected → bg #F3F8E6, color #678722, border #678722; unselected → white /
 * #616161 / #E0E0E0. `hover:opacity-85` matches the prototype style-hover.
 */

type SingleProps = {
  multi?: false;
  options: string[];
  value: string;
  onChange: (next: string) => void;
  size?: "sm" | "md";
};
type MultiProps = {
  multi: true;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  size?: "sm" | "md";
};

export function ChipGroup(props: SingleProps | MultiProps) {
  const size = props.size ?? "md";
  const pad = size === "sm" ? "px-3.5 py-[7px] text-[12px]" : "px-4 py-2 text-[12.5px]";

  const isSelected = (opt: string) =>
    props.multi ? props.value.includes(opt) : props.value === opt;

  const toggle = (opt: string) => {
    if (props.multi) {
      const set = new Set(props.value);
      if (set.has(opt)) set.delete(opt);
      else set.add(opt);
      props.onChange([...set]);
    } else {
      props.onChange(opt);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {props.options.map((opt) => {
        const sel = isSelected(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`rounded-[20px] font-medium border-[1.5px] cursor-pointer transition-opacity hover:opacity-85 ${pad}`}
            style={{
              background: sel ? "#F3F8E6" : "#FFFFFF",
              color: sel ? "#678722" : "#616161",
              borderColor: sel ? "#678722" : "#E0E0E0",
            }}
            aria-pressed={sel}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
