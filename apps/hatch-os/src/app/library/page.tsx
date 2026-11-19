import { Suspense } from "react";
import { LibraryScreen } from "@/components/os/LibraryScreen";

export default function LibraryPage() {
  return (
    <Suspense fallback={<p className="boot-note">Opening Hatch OS…</p>}>
      <LibraryScreen />
    </Suspense>
  );
}
