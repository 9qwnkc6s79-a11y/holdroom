import { Suspense } from "react";
import { AuditScreen } from "@/components/os/AuditScreen";

export default function AuditPage() {
  return (
    <Suspense fallback={<p className="boot-note">Opening Hatch OS…</p>}>
      <AuditScreen />
    </Suspense>
  );
}
