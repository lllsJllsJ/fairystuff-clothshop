import { Suspense } from "react"

import { getCurrentUser } from "@/lib/auth-helpers"
import { emailEnabled } from "@/lib/email"
import { UserList } from "@/components/users/user-list"

/**
 * `/admin/users`. `requireOwner()` in the admin layout already gated this
 * render; `getCurrentUser()` here is only for the acting user's id, which
 * the list needs to mark "you" and hide the self-destructive actions (the
 * server actions refuse them regardless — see actions.ts).
 *
 * Only the id crosses to the client. The account rows themselves arrive
 * from `GET /api/admin/users`, which selects `ADMIN_USER_COLUMNS` and so
 * never carries a password hash into an RSC payload.
 */
export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const user = await getCurrentUser()

  return (
    <Suspense>
      <UserList
        locale={locale}
        currentUserId={user?.id ?? ""}
        emailEnabled={emailEnabled()}
      />
    </Suspense>
  )
}
