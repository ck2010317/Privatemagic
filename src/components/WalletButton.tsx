"use client";

import dynamic from "next/dynamic";

// Dynamically import WalletMultiButton with SSR disabled
// This fixes the hydration mismatch caused by wallet adapter
// rendering differently on server vs client
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export default WalletMultiButton;
