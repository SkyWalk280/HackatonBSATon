"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider
      manifestUrl={`${process.env.NEXT_PUBLIC_APP_URL}/tonconnect-manifest.json`}
    >
      {children}
    </TonConnectUIProvider>
  );
}