import Link from "next/link";
import { redirectAuthenticatedUser } from "@/server/modules/identity/session";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await redirectAuthenticatedUser();

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[460px]">
        <Link className="mb-8 inline-flex items-center gap-3" href="/dashboard">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-[#14584f] text-lg font-bold text-[#d6f0e5]">
            W
          </span>
          <span className="text-lg font-semibold tracking-tight">webameen</span>
        </Link>
        {children}
      </div>
    </main>
  );
}
