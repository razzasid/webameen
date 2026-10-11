import { ChevronDown, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/server/modules/identity/actions";

function getAccountName(email: string) {
  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return "Account";

  const words = localPart.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return "Account";

  return words.map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1)).join(" ");
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase())
    .join("");
}

export function AccountMenu({ email }: Readonly<{ email: string }>) {
  const name = getAccountName(email);
  const initials = getInitials(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Account menu for ${name}`}
          className="flex min-h-11 min-w-11 items-center gap-2 rounded-xl px-1.5 text-left transition hover:bg-[var(--canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:px-2"
          type="button"
        >
          <Avatar size="lg" className="after:border-transparent">
            <AvatarFallback className="bg-[#e7f1ee] text-sm font-semibold text-[#24574c]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 sm:flex sm:flex-col">
            <span className="max-w-32 truncate text-sm font-semibold leading-5 text-[var(--ink)]">
              {name}
            </span>
            <span className="max-w-36 truncate text-xs leading-4 text-[var(--muted-foreground)]">
              {email || "Signed-in account"}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="hidden size-4 shrink-0 text-[var(--muted-foreground)] sm:block"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" sideOffset={8}>
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold text-[var(--ink)]">
            {name}
          </span>
          <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted-foreground)]">
            {email || "Signed-in account"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button
              className="min-h-10 w-full cursor-pointer text-[var(--danger)] focus:text-[var(--danger)]"
              type="submit"
            >
              <LogOut aria-hidden="true" />
              Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
