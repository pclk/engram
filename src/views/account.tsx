"use client";

import Image from "next/image";
import Link from "next/link";

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
        <div className="neon-auth-panel">
          <h2>Account</h2>
          <p className="neon-auth-note">Account settings are managed inside the main app.</p>
          <p className="neon-auth-note">
            Current section: <strong>{path}</strong>
          </p>
          <p className="neon-auth-note">
            <Link href="/">Return to workspace</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
