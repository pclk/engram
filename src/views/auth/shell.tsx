"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="neon-auth-page">
      <div className="neon-auth-card">
        <div className="neon-auth-brand">
          <Image className="neon-auth-brand-badge" src="/logo.svg" alt="Engram" width={96} height={24} priority />
          <div>
            <h1>Engram</h1>
            <p>Sign in to your knowledge workspace</p>
          </div>
        </div>
        <div className="neon-auth-root">{children}</div>
        <div className="neon-auth-links">
          <Link href="/auth/sign-in">Sign in</Link>
          <span>•</span>
          <Link href="/auth/sign-up">Create account</Link>
          <span>•</span>
          <Link href="/auth/forgot-password">Forgot password</Link>
        </div>
      </div>
    </div>
  );
}
