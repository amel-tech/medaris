"use client";

import { Toaster } from "@medaris/ui/components/sonner";
import { SessionProvider } from "next-auth/react";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster />
    </SessionProvider>
  );
}
