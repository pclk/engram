"use client";

import { AccountView } from "@neondatabase/neon-js/auth/react/ui";
import Image from "next/image";

type AccountProps = {
  path?: string;
};

export function Account({ path = "settings" }: AccountProps) {
  return (
    <div className="neon-auth-page">
      <div className="neon-auth-card">
        <div className="neon-auth-brand">
          <Image className="neon-auth-brand-badge" src="/logo.svg" alt="Engram" width={96} height={24} priority />
          <div>
            <h1>Engram</h1>
            <p>Manage your account settings</p>
          </div>
        </div>
        <AccountView path={path} className="neon-auth-root" />
      </div>
    </div>
  );
}
