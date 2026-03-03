"use client";

import { Account } from "@/src/views/account";

type AccountCatchAllPageProps = {
  params: {
    slug?: string[];
  };
};

export default function AccountPage({ params }: AccountCatchAllPageProps) {
  const path = params.slug?.[0] || "settings";
  return <Account path={path} />;
}
