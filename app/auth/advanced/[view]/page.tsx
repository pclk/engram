"use client";

import { AuthViewPage } from "@/src/views/auth/view";

export const dynamic = "force-dynamic";
type AdvancedAuthPageProps = {
  params: {
    view: string;
  };
};

export default function AdvancedAuthPage({ params }: AdvancedAuthPageProps) {
  return <AuthViewPage path={params.view} />;
}
