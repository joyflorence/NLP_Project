import { Navigate } from "react-router-dom";
import { AdminIngestionPanel } from "@/components/AdminIngestionPanel";
import { AdminRolePanel } from "@/components/AdminRolePanel";

type Props = {
  isAdmin: boolean;
};

export function AdminPage({ isAdmin }: Props) {
  if (!isAdmin) {
    return <Navigate to="/search" replace />;
  }

  return (
    <>
      <AdminRolePanel />
      <AdminIngestionPanel isAdmin={isAdmin} />
    </>
  );
}
