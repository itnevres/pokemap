import type { ReactNode } from "react";
import { FamilyApp } from "./shell/FamilyApp.js";
import { gbaAdapter } from "./gba/adapter.js";

export interface AppProps {
  switcher?: ReactNode;
}

/** Plan 9 Task 5: a transitional wrapper so the GBA shell tests run unchanged against FamilyApp. Deleted in Task 6. */
export function App({ switcher }: AppProps) {
  return <FamilyApp adapter={gbaAdapter} switcher={switcher} />;
}
