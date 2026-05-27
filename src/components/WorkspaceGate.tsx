import { Navigate } from "react-router-dom";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ROUTES } from "@/lib/routes";

interface WorkspaceGateProps {
  children: React.ReactNode;
}

/**
 * Route guard that redirects to /landing when no workspace is selected.
 * Wraps the main Layout so all app pages require a workspace.
 */
export function WorkspaceGate({ children }: WorkspaceGateProps) {
  const { workspace, isLoading } = useWorkspace();

  if (isLoading) {
    return null;
  }

  if (!workspace) {
    return <Navigate to={ROUTES.LANDING} replace />;
  }

  return <>{children}</>;
}
