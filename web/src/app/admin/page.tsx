import type { Metadata } from "next";
import AdminApp from "@/components/admin/AdminApp";

export const metadata: Metadata = { title: "Yönetim — Naman" };

export default function AdminPage() {
  return <AdminApp />;
}
