"use client";

import { ChipGroup } from "./ChipGroup";
import { OtherReveal } from "./OtherReveal";

/**
 * A ChipGroup that reveals a "please specify" text box beneath it whenever the
 * "Other" option is selected (R6). Leaves ChipGroup itself untouched. The caller
 * is responsible for clearing `detail` when "Other" is deselected (see the
 * wizard's `setChip` wrapper) so stale text never lingers.
 */
type Base = {
  fieldKey: string;
  options: string[];
  size?: "sm" | "md";
  detail: string;
  onDetail: (t: string) => void;
};
type SingleP = Base & { multi?: false; value: string; onChange: (v: string) => void };
type MultiP = Base & { multi: true; value: string[]; onChange: (v: string[]) => void };

export function ChipGroupWithOther(props: SingleP | MultiP) {
  const hasOther = props.multi
    ? props.value.includes("Other")
    : props.value === "Other";

  return (
    <div>
      {props.multi ? (
        <ChipGroup
          multi
          size={props.size}
          options={props.options}
          value={props.value}
          onChange={props.onChange}
        />
      ) : (
        <ChipGroup
          size={props.size}
          options={props.options}
          value={props.value}
          onChange={props.onChange}
        />
      )}
      <OtherReveal
        show={hasOther}
        value={props.detail}
        onChange={props.onDetail}
        placeholder="Please specify"
      />
    </div>
  );
}
