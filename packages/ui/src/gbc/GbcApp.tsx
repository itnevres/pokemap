import type { ReactNode } from "react";
import { FamilyApp } from "../shell/FamilyApp.js";
import { gbcAdapter } from "./adapter.js";
import type { GbcTimeOfDay } from "./time.js";

export type TimeOfDay = GbcTimeOfDay;

export interface GbcAppProps {
  /** Unused since Plan 6b (kept so the tests' `root` prop still type-checks until Task 6). */
  root: string;
  switcher?: ReactNode;
}

/** Plan 9 Task 5: a transitional wrapper so the GBC shell tests run unchanged against FamilyApp. Deleted in Task 6. */
export function GbcApp({ switcher }: GbcAppProps) {
  return <FamilyApp adapter={gbcAdapter} switcher={switcher} />;
}
