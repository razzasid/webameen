import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireAuthenticatedUser();
  return <WorkspaceShell email={user.email ?? ""}>{children}</WorkspaceShell>;
}
