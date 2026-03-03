"use client";

import { Suspense, lazy } from "react";

import { BasicAuthView } from "./basic-view";

const AdvancedAuthView = lazy(() =>
  import("./advanced-view").then((module) => ({
    default: module.AdvancedAuthView,
  })),
);
const FullAuthView = lazy(() =>
  import("@neondatabase/neon-js/auth/react/ui").then((module) => ({
    default: ({ path }: { path: string }) => (
      <module.AuthView path={path} className="neon-auth-root" />
    ),
  })),
);

export const BASIC_AUTH_VIEWS = [
  "sign-in",
  "sign-up",
  "forgot-password",
  "magic-link",
] as const;
export const ADVANCED_AUTH_VIEWS = [
  "callback",
  "recover-account",
  "reset-password",
  "sign-out",
  "two-factor",
] as const;

export type BasicAuthPath = (typeof BASIC_AUTH_VIEWS)[number];
export type AdvancedAuthPath = (typeof ADVANCED_AUTH_VIEWS)[number];

export function normalizeAuthPath(path?: string): string {
  const normalized = (path || "sign-in").replace(/^\/+|\/+$/g, "");
  if (normalized.includes("email-otp")) return "email-otp";
  if (normalized.includes("magic-link")) return "magic-link";
  if (normalized.includes("two-factor")) return "two-factor";
  if (normalized.includes("recover-account")) return "recover-account";
  if (normalized.includes("reset-password")) return "reset-password";
  if (normalized.includes("forgot-password")) return "forgot-password";
  if (normalized.includes("callback")) return "callback";
  if (normalized.includes("sign-out")) return "sign-out";
  if (normalized.includes("sign-up")) return "sign-up";
  return "sign-in";
}

export function AuthViewPage({ path }: { path?: string }) {
  const viewPath = normalizeAuthPath(path);
  const isBasicView = (BASIC_AUTH_VIEWS as readonly string[]).includes(
    viewPath,
  );
  const isAdvancedView = (ADVANCED_AUTH_VIEWS as readonly string[]).includes(
    viewPath,
  );

  return isBasicView ? (
    <BasicAuthView path={viewPath as BasicAuthPath} />
  ) : (
    <Suspense fallback={<div>Loading...</div>}>
      {isAdvancedView ? (
        <AdvancedAuthView path={viewPath as AdvancedAuthPath} />
      ) : (
        <FullAuthView path={viewPath} />
      )}
    </Suspense>
  );
}
