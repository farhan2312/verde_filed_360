"use client";

import { useMemo, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { createStoreAction, updateStoreAction } from "@/app/actions/stores";
import type { StoreMgmtRow, RegionalOption } from "./types";

const STATUSES = ["Active", "Closed", "Vacant", "H.O."];
const labelCls =
  "block text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted mb-1.5";
const inputCls =
  "w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-brand-500";

export function StoreFormModal({
  store,
  regionals,
  zones,
  onClose,
}: {
  store: StoreMgmtRow | null;
  regionals: RegionalOption[];
  zones: string[];
  onClose: () => void;
}) {
  const isEdit = !!store;
  const [code, setCode] = useState(store?.code ?? "");
  const [name, setName] = useState(store?.name ?? "");
  const [status, setStatus] = useState(store?.status || "Active");
  const [zone, setZone] = useState(store?.zone ?? "");
  // The stored RM is a free-text name that may (case/space-insensitively) match an
  // approved regional-manager account, or be an imported "unverified" name. Canonicalise
  // to the account's exact name when it matches so the <select> value lines up with an option.
  const rmMatch = regionals.find(
    (r) => r.name.trim().toUpperCase() === (store?.regionalManager ?? "").trim().toUpperCase(),
  );
  const [regionalManager, setRM] = useState(
    rmMatch ? rmMatch.name : store?.regionalManager ?? "",
  );
  const [address, setAddress] = useState(store?.address ?? "");
  const [lat, setLat] = useState(store?.lat != null ? String(store.lat) : "");
  const [lng, setLng] = useState(store?.lng != null ? String(store.lng) : "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Names of the real regional-manager accounts (normalised, matching the StoresTab badge).
  const rmNormSet = useMemo(
    () => new Set(regionals.map((r) => r.name.trim().toUpperCase())),
    [regionals],
  );
  // The store's original RM name when it has no matching account. Preserved as a reselectable
  // <option> for the whole edit session (derived from the INITIAL value, not the live selection),
  // so picking a real manager can always be undone without silently dropping the imported name.
  const initialUnverifiedRM = useMemo(() => {
    const raw = (store?.regionalManager ?? "").trim();
    return raw && !rmNormSet.has(raw.toUpperCase()) ? raw : "";
  }, [store, rmNormSet]);

  function submit() {
    setErr(null);
    start(async () => {
      const payload = { code, name, status, zone, address, regionalManager, lat, lng };
      const res = isEdit
        ? await updateStoreAction({ id: store!.id, ...payload })
        : await createStoreAction(payload);
      if (res.ok) onClose();
      else setErr(res.error ?? "Something went wrong.");
    });
  }

  return (
    <Modal open onClose={onClose}>
      <ModalHeader
        eyebrow={isEdit ? "SYSTEM ADMIN · EDIT STORE" : "SYSTEM ADMIN · NEW STORE"}
        title={isEdit ? `Edit Store — ${store!.shortName}` : "Add Store"}
        subtitle={isEdit ? store!.code : "Create a store location"}
        onClose={onClose}
      />
      <div className="px-6 py-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Store Code *</label>
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. AGRO0123" />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Store Name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Zone / Region</label>
            <input className={inputCls} value={zone} onChange={(e) => setZone(e.target.value)} list="sfm-zones" />
            <datalist id="sfm-zones">
              {zones.map((z) => <option key={z} value={z} />)}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>Regional Manager</label>
            <select className={inputCls} value={regionalManager} onChange={(e) => setRM(e.target.value)}>
              <option value="">— Unassigned —</option>
              {initialUnverifiedRM && (
                <option value={initialUnverifiedRM}>{initialUnverifiedRM} — keep (unverified)</option>
              )}
              {regionals.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.zone ? `${r.name} · ${r.zone}` : r.name}
                </option>
              ))}
            </select>
            {regionals.length === 0 && (
              <div className="mt-1 text-[10.5px] text-ink-muted">
                No approved regional-manager accounts yet — approve one in the Users tab to assign it here.
              </div>
            )}
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Address</label>
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Latitude</label>
            <input className={inputCls} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className={labelCls}>Longitude</label>
            <input className={inputCls} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <div className="mt-2 text-[10.5px] text-ink-muted">
          Assign agri officers to this store from the store row → <b>Map</b>.
        </div>

        {err && <div className="mt-3 text-[12px] text-danger">{err}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-[10px] border border-line bg-white px-[18px] py-[9px] text-[13px] font-semibold text-ink-600 hover:bg-surface-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-[10px] bg-[#678722] px-[22px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#516A1B] disabled:opacity-50"
          >
            {pending ? "Saving…" : isEdit ? "Save Changes" : "Create Store"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
