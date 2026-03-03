"use client";

import { AuthViewPage } from "@/src/views/auth/view";

export const dynamic = "force-dynamic";
type AuthCatchAllPageProps = {
  params: {
    slug?: string[];
  };
};

export default function AuthPage({ params }: AuthCatchAllPageProps) {
  const slug = params.slug || [];
  const path =
    slug[0] === "basic" || slug[0] === "advanced" ? slug[1] : slug[0];

  return <AuthViewPage path={path} />;
}
