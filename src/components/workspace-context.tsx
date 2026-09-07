"use client";

import { createContext, useContext } from "react";

/*
 * What every form in the app needs to know about the workspace without each
 * page passing it down: who is on the team. The layout provides it once.
 */

type WorkspaceInfo = { members: string[]; currentUser: string };

const WorkspaceContext = createContext<WorkspaceInfo>({ members: [], currentUser: "" });

export function WorkspaceProvider({ members, currentUser, children }: WorkspaceInfo & { children: React.ReactNode }) {
  return <WorkspaceContext.Provider value={{ members, currentUser }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceInfo {
  return useContext(WorkspaceContext);
}
