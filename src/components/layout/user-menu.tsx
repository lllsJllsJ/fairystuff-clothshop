"use client"

import { useTranslations } from "next-intl"
import { LogOut, Store } from "lucide-react"

import type { Session } from "next-auth"
import { Link } from "@/i18n/navigation"
import { signOutAction } from "@/components/auth/actions"
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
        <DropdownMenuItem
          render={
            <Link href="/">
              <Store className="size-4" />
              {t("nav.viewShop")}
            </Link>
          }
        />
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-muted"
          >
            <LogOut className="size-4" />
            {t("nav.logout")}
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
