import type { ReactNode } from "react";

import { AuthShell } from "@/src/views/auth/shell";

export const dynamic = "force-dynamic";
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
