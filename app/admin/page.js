"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /admin used to be the sign-in page; it's now shared with regular players
// at /login. Kept as a redirect so any old bookmarks or links still work.
export default function AdminRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login");
  }, [router]);
  return null;
}
