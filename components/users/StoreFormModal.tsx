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
  // A store can have SEVERAL managers (its BDM plus the ASM above them). `rmUserIds` is the real
  // link; a legacy store may instead carry only an imported manager NAME, so seed the selection by
  // matching those names (case/space-insensitively) against the approved accounts.
  const [rmIds, setRmIds] = useState<number[]>(() => {
    if (store?.rmUserIds?.length) return [...store.rmUserIds];
    const names = (store?.regionalManager ?? "")
      .split(",")
      .map((n) => n.trim().toUpperCase())
      .filter(Boolean);
    return regionals.filter((r) => names.includes(r.name.trim().toUpperCase())).map((r) => r.id);
  });
  const toggleRm = (id: number) =>
    setRmIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
    if (store?.rmUserIds?.length) return "";
    const raw = (store?.regionalManager ?? "").trim();
    return raw && !rmNormSet.has(raw.toUpperCase()) ? raw : "";
  }, [store, rmNormSet]);

  function submit() {
    setErr(null);
    start(async () => {
      // Keep the unverified imported name only while no real account is selected.
      const payload = {
        code, name, status, zone, address,
        rmUserIds: rmIds,
        regionalManager: rmIds.length ? "" : initialUnverifiedRM,
        lat, lng,
      };
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
          <div className="col-span-2">
            <label className={labelCls}>
              Regional Managers{rmIds.length > 0 && <span className="ml-1 font-normal normal-case tracking-normal text-brand-700">· {rmIds.length} selected</span>}
            </label>
            {regionals.length === 0 ? (
              <div className="rounded-[10px] border border-line bg-surface-50 px-3 py-2.5 text-[11.5px] text-ink-muted">
                No approved regional-manager accounts yet — approve one in the Users tab to assign it here.
              </div>
            ) : (
              <div className="max-h-[150px] overflow-y-auto rounded-[10px] border border-line bg-white p-1">
                {regionals.map((r) => {
                  const on = rmIds.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-[12.5px] ${on ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-surface-100"}`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleRm(r.id)} className="accent-[#7DA02E]" />
                      <span className="font-semibold">{r.name}</span>
                      {r.zone && <span className="text-ink-muted">· {r.zone}</span>}
                    </label>
                  );
                })}
              </div>
            )}
            <div className="mt-1 text-[10.5px] text-ink-muted">
              A store can have more than one — e.g. its BDM plus the ASM above them. Each selected manager sees this store in their scope.
              {initialUnverifiedRM && !rmIds.length && (
                <> Currently showing the imported name <b>{initialUnverifiedRM}</b>, which has no account yet.</>
              )}
            </div>
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
            className="rounded-[10px] bg-[#7DA02E] px-[22px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#66852A] disabled:opacity-50"
          >
            {pending ? "Saving…" : isEdit ? "Save Changes" : "Create Store"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
