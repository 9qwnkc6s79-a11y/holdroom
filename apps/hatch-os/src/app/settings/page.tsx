import { Suspense } from "react";
import { SettingsScreen } from "@/components/os/SettingsScreen";

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="boot-note">Opening settings…</p>}>
      <SettingsScreen />
    </Suspense>
  );
}
