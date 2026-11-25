import { Slot } from "expo-router";
import { useRequireSession } from "@/state/session";

export default function AppLayout() {
  useRequireSession();
  return <Slot />;
}
