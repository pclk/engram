"use client";

import { AuthViewPage } from "@/src/views/auth/view";

export const dynamic = "force-dynamic";
type BasicAuthPageProps = {
  params: {
    view: string;
  };
};

export default function BasicAuthPage({ params }: BasicAuthPageProps) {
  return <AuthViewPage path={params.view} />;
}
