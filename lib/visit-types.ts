/** Visit-type colours, follow-up logic, and per-purpose recommendation cards. */

export const VISIT_TYPE_COLORS: Record<string, string> = {
  "Crop inspection": "#7DA02E",
  "Crop monitoring": "#7DA02E",
  "Product demo": "#1565C0",
  "Product delivery": "#1565C0",
  "Follow-up": "#E65100",
  "First visit": "#D4881F",
  "Sowing advisory": "#00695C",
  "Harvest planning": "#7B1FA2",
  "Re-engagement": "#AD1457",
  "Season review": "#4527A0",
  "Soil advisory": "#6D4C41",
  "Pest check": "#C62828",
};

export function visitTypeColor(purpose?: string | null): string {
  return (purpose && VISIT_TYPE_COLORS[purpose]) || "#757575";
}

const FOLLOWUP_PURPOSES = new Set(["Follow-up", "Crop inspection", "Re-engagement"]);
export function followupNeeded(purpose?: string | null): boolean {
  return !!purpose && FOLLOWUP_PURPOSES.has(purpose);
}

export interface RecCard {
  c: string;
  t: string;
}

export const VISIT_RECOMMENDATIONS: Record<string, RecCard[]> = {
  "Crop inspection": [
    { c: "#7DA02E", t: "Schedule follow-up spray advisory if pest activity confirmed. Coordinate with store for pesticide inventory." },
    { c: "#1565C0", t: "Update crop health status in farmer profile. Flag for priority visit if severity is high." },
    { c: "#D4881F", t: "Cross-check soil test report and recommend corrective fertiliser application for current crop stage." },
  ],
  "Crop monitoring": [
    { c: "#7DA02E", t: "Document crop growth stage and compare against expected calendar for the variety." },
    { c: "#1565C0", t: "If weed or pest pressure observed, schedule product demo within 7 days." },
    { c: "#D4881F", t: "Share monitoring report with Regional Manager for territory-level crop health tracking." },
  ],
  "Product demo": [
    { c: "#7DA02E", t: "Log farmer feedback and interest level. Raise a lead if purchase intent is high." },
    { c: "#1565C0", t: "Ensure demo product batch details are recorded. Coordinate dispatch from store for trial order." },
    { c: "#9C27B0", t: "Follow up within 10 days to assess trial results and close conversion opportunity." },
  ],
  "Product delivery": [
    { c: "#7DA02E", t: "Confirm product receipt and application plan with the farmer. Note any usage queries." },
    { c: "#1565C0", t: "Schedule a crop response check-in visit 2–3 weeks after application." },
    { c: "#D4881F", t: "Update invoice record in farmer profile. Link to purchase history for LTV tracking." },
  ],
  "Follow-up": [
    { c: "#E65100", t: "Resolve the outstanding action item from the previous visit before closing this follow-up." },
    { c: "#1565C0", t: "Reassess the lead status based on engagement level. Update in Farmer 360." },
    { c: "#7DA02E", t: "Confirm next visit date and specific objective before leaving the field." },
  ],
  "First visit": [
    { c: "#7DA02E", t: "Complete full farmer profile registration. Capture land, crop, soil, and commercial data." },
    { c: "#D4881F", t: "Assess lead potential and assign segment (High/Medium/New) based on land size and purchase history." },
    { c: "#1565C0", t: "Share Verde product catalogue and introduce store point of contact. Offer soil testing service." },
  ],
  "Sowing advisory": [
    { c: "#7DA02E", t: "Confirm seed variety recommended matches soil type and season. Document in farmer notes." },
    { c: "#D4881F", t: "Coordinate with store for seed availability and timely delivery before sowing window closes." },
    { c: "#1565C0", t: "Schedule a 4-week post-sowing visit to assess germination and nutrient requirement." },
  ],
  "Harvest planning": [
    { c: "#7B1FA2", t: "Estimate yield and connect farmer with procurement or FPO channel if applicable." },
    { c: "#7DA02E", t: "Discuss next season crop plan and pre-book inputs. Create advance order from store." },
    { c: "#E65100", t: "Capture harvest outcome data for analytics and territory performance reporting." },
  ],
  "Re-engagement": [
    { c: "#AD1457", t: "Understand reason for disengagement. Document competitive products being used." },
    { c: "#7DA02E", t: "Offer loyalty benefit or personalised input recommendation to rebuild trust." },
    { c: "#D4881F", t: "Set 30-day re-engagement milestone. Escalate to Regional Manager if farmer remains unresponsive." },
  ],
  "Season review": [
    { c: "#4527A0", t: "Document season summary: yield estimate, input usage, issues faced, and satisfaction score." },
    { c: "#7DA02E", t: "Plan next-season input requirement and create advance order. Lock pricing where possible." },
    { c: "#1565C0", t: "Flag high-performing farmers for FPO enrollment or contract farming discussion." },
  ],
  "Soil advisory": [
    { c: "#6D4C41", t: "Share soil test results in simplified form. Recommend specific amendments or fertiliser plan." },
    { c: "#7DA02E", t: "Coordinate organic/bio compost availability from store. Offer application demo if needed." },
    { c: "#D4881F", t: "Re-test soil after 60 days to validate improvement. Document corrective action taken." },
  ],
  "Pest check": [
    { c: "#C62828", t: "Identify pest/disease accurately. Apply first-aid treatment if on-hand and advise immediate action." },
    { c: "#E65100", t: "Coordinate with store for targeted pesticide. Ensure correct dosage and safety protocol." },
    { c: "#7DA02E", t: "Re-visit within 7 days to assess treatment efficacy and prevent crop loss escalation." },
  ],
};

export const DEFAULT_RECOMMENDATIONS: RecCard[] = [
  { c: "#7DA02E", t: "Schedule a follow-up visit within 14 days to assess outcomes from this visit." },
  { c: "#1565C0", t: "Update farmer profile with visit outcome and any changes to lead status." },
  { c: "#D4881F", t: "Coordinate any product or input requirements with the assigned store for timely dispatch." },
];

export function recommendationsFor(purpose?: string | null): RecCard[] {
  return (purpose && VISIT_RECOMMENDATIONS[purpose]) || DEFAULT_RECOMMENDATIONS;
}
