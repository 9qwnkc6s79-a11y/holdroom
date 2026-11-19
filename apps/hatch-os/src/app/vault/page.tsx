import { Suspense } from "react";
import { VaultScreen } from "@/components/os/VaultScreen";

export default function VaultPage() {
  return (
    <Suspense fallback={<p className="boot-note">Opening Hatch OS…</p>}>
      <VaultScreen />
    </Suspense>
  );
}
