import { Suspense } from "react";
import { RoutinesScreen } from "@/components/os/RoutinesScreen";

export default function RoutinesPage() {
  return (
    <Suspense fallback={<p className="boot-note">Opening Hatch OS…</p>}>
      <RoutinesScreen />
    </Suspense>
  );
}
