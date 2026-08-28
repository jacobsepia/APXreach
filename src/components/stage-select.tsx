"use client";

import { useRef } from "react";
import { setDealStage } from "@/lib/actions";

/*
 * The board's stage mover: a quiet select on each card. Submits on change;
 * drag-and-drop can replace it later without touching the action.
 */
export function StageSelect({
  dealId,
  stageId,
  stages,
}: {
  dealId: string;
  stageId: string;
  stages: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setDealStage}>
      <input type="hidden" name="dealId" value={dealId} />
      <select
        name="stageId"
        defaultValue={stageId}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-6 max-w-[130px] rounded-md border border-[rgba(21,24,28,0.14)] bg-white px-1 text-[11px] text-[#646c78] outline-none focus:border-[#6b21a8]"
        aria-label="Move to stage"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </form>
  );
}
