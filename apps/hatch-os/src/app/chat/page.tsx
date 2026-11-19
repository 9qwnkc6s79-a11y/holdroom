import { Suspense } from "react";
import { Messenger } from "@/components/os/Messenger";

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="boot-note">Opening Hatch…</p>}>
      <Messenger />
    </Suspense>
  );
}
