"use client";

import { useFormStatus } from "react-dom";
import { completeTask } from "@/lib/actions";

function Box() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label="Mark done"
      className={`size-4 shrink-0 rounded-[5px] border-[1.5px] transition-colors ${
        pending
          ? "border-[#6b21a8] bg-[#6b21a8]"
          : "border-[rgba(21,24,28,0.25)] bg-transparent hover:border-[#6b21a8]"
      }`}
    />
  );
}

export function TaskCheckbox({ taskId }: { taskId: string }) {
  return (
    <form action={completeTask} className="flex items-center">
      <input type="hidden" name="taskId" value={taskId} />
      <Box />
    </form>
  );
}
