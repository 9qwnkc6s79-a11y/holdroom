import { redirect } from "next/navigation";

export default function VaultPage() {
  redirect("/settings?tab=vault");
}
