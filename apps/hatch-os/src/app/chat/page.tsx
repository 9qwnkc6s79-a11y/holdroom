import { Suspense } from "react";
import { ChatScreen } from "@/components/os/ChatScreen";

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="boot-note">Opening Hatch OS…</p>}>
      <ChatScreen />
    </Suspense>
  );
}
