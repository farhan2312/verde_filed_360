"use client";

/**
 * Discrete-bucket slider (R1 Land Holding, R4 Annual Expense).
 *
 * Stores the bucket LABEL string (never a number) into the existing string
 * field, so summary + persistence are byte-identical to the old chip picker.
 * Never fabricates a value on mount — `value` stays "" (showing "Drag to
 * select") until the user actually moves the slider, keeping required-field
 * checks honest and the review summary truthful.
 */
export function BucketSlider({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: string[];
  value: string;
  onChange: (label: string) => void;
  ariaLabel?: string;
}) {
  const max = Math.max(0, options.length - 1);
  const idx = options.indexOf(value);
  const isSet = value !== "" && idx >= 0;
  const thumbIdx = idx < 0 ? 0 : idx;
  const pct = max > 0 ? (thumbIdx / max) * 100 : 0;

  return (
    <div>
      {/* Current bucket label — pill in the chip visual language */}
      <div
        className="mb-3 inline-block rounded-[20px] border-[1.5px] px-4 py-[7px] text-[13px] font-semibold"
        style={{
          background: isSet ? "#F3F8E6" : "#FFFFFF",
          color: isSet ? "#678722" : "#9E9E9E",
          borderColor: isSet ? "#678722" : "#E0E0E0",
        }}
      >
        {isSet ? value : "Drag to select"}
      </div>

      <input
        type="range"
        className="nv-bucket-range block w-full"
        min={0}
        max={max}
        step={1}
        value={thumbIdx}
        aria-label={ariaLabel}
        aria-valuetext={isSet ? value : "Not set"}
        onChange={(e) => onChange(options[Number(e.target.value)])}
        style={{
          background: `linear-gradient(90deg, #B3D170 ${pct}%, #E0E0E0 ${pct}%)`,
        }}
      />

      {/* End-cap labels */}
      {options.length > 1 && (
        <div className="mt-1.5 flex justify-between text-[11px] text-[#9E9E9E]">
          <span>{options[0]}</span>
          <span>{options[options.length - 1]}</span>
        </div>
      )}
    </div>
  );
}
