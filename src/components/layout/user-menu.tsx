"use client"

import { useTranslations } from "next-intl"
import { Store, Users } from "lucide-react"

import type { Session } from "next-auth"
import { Link } from "@/i18n/navigation"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu({ user }: { user: Session["user"] }) {
  const t = useTranslations()
  const name = user.name || user.email || "Owner"
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <div className="flex flex-col px-1.5 py-1">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="text-muted-foreground text-xs">
            {user.email}
          </span>
        </div>
        <DropdownMenuSeparator />
        {/* Account administration lives here rather than in the main nav
            bar (see nav-items.ts): it's an occasional, account-shaped
            errand, so it sits beside Sign out instead of competing with the
            six day-to-day screens. */}
        <DropdownMenuItem
          render={
            <Link href="/admin/users">
              <Users className="size-4" />
              {t("nav.users")}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link href="/">
              <Store className="size-4" />
              {t("nav.viewShop")}
            </Link>
          }
        />
        <DropdownMenuSeparator />
        <SignOutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
