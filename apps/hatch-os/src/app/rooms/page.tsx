import { notFound, redirect } from "next/navigation";
import { operatorUiEnabled } from "@/lib/operator";

export const dynamic = "force-dynamic";

export default function RoomsRedirect() {
  if (!operatorUiEnabled()) notFound();
  redirect("/departments");
}
