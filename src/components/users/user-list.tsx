"use client"

import { useEffect, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  KeyRound,
  Plus,
  Loader2,
  MailCheck,
  MoreHorizontal,
  Search,
  Shield,
  Trash2,
  Users as UsersIcon,
} from "lucide-react"

import { formatDate } from "@/lib/format"
import type { UserRole } from "@/lib/roles"
import type { AdminUserRow, UserSort } from "@/db/queries/users"
import type { UserListApiResult } from "@/app/api/admin/users/route"
import {
  createUser,
  deleteUser,
  sendUserPasswordReset,
  setUserRole,
  verifyUserEmail,
} from "@/app/[locale]/admin/users/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SimpleSelect } from "@/components/ui/simple-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const PAGE_SIZE = 20

const ROLES: UserRole[] = ["owner", "staff"]

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/**
 * The single `/admin/users` screen: search across email/name/phone, role and
 * verification filters, sort, pagination, and the four per-row actions
 * (change role, mark verified, send reset link, delete).
 *
 * Structural port of `order-list.tsx` — debounced search, TanStack Query
 * with `keepPreviousData`, server actions + `query.refetch()` — minus the
 * URL sync, since an account list isn't a view worth deep-linking into.
 *
 * `currentUserId` only drives what the menu OFFERS. It is not a security
 * boundary: `setUserRole`/`deleteUser` re-check the acting user themselves
 * and refuse self-demotion, self-deletion, and last-owner removal whatever
 * this component renders (see actions.ts).
 */
export function UserList({
  locale,
  currentUserId,
  emailEnabled,
}: {
  locale: string
  currentUserId: string
  emailEnabled: boolean
}) {
  const t = useTranslations()

  const [search, setSearch] = useState("")
  const [role, setRole] = useState<UserRole | "all">("all")
  const [sort, setSort] = useState<UserSort>("newest")

  /**
   * Header click: first click takes the column's descending order,
   * clicking the same column again flips to ascending. Always returns to
   * page 1 — staying on page 3 of a different ordering shows rows the
   * owner never asked for. Mirrors `applySort` in order-list.tsx.
   */
  function applySort(next: UserSort) {
    setSort(next)
    setPage(1)
  }
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState<string | null>(null)

  const [roleTarget, setRoleTarget] = useState<AdminUserRow | null>(null)
  const [draftRole, setDraftRole] = useState<UserRole>("staff")
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const debouncedSearch = useDebounced(search)

  const query = useQuery<UserListApiResult>({
    queryKey: ["admin-users", debouncedSearch, role, sort, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        role,
        sort,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) throw new Error("failed")
      return res.json() as Promise<UserListApiResult>
    },
    placeholderData: keepPreviousData,
  })

  const rows = query.data?.rows ?? []
  const total = query.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  /**
   * Maps an action's error code to its message. The lockout refusals
   * (`self_*`, `last_owner`) get specific copy — a generic "something went
   * wrong" on a deliberate, correct refusal reads as a bug and invites a
   * retry that will never succeed.
   */
  function errorMessage(error: string): string {
    if (error === "self_role_change") return t("user.errorSelfRoleChange")
    if (error === "self_delete") return t("user.errorSelfDelete")
    if (error === "last_owner") return t("user.errorLastOwner")
    if (error === "email_disabled") return t("user.errorEmailDisabled")
    if (error === "no_email") return t("user.errorNoEmail")
    if (error === "cooldown") return t("user.errorCooldown")
    return t("user.errorGeneric")
  }

  /** Every row action funnels through here: one in-flight action at a time,
   * one toast, one refetch. */
  async function run(
    id: string,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
    onSuccess?: () => void
  ) {
    setPending(id)
    try {
      const result = await action()
      if (!result.ok) {
        toast.error(errorMessage(result.error))
        return
      }
      toast.success(successMessage)
      onSuccess?.()
      query.refetch()
    } finally {
      setPending(null)
    }
  }

  function openRoleDialog(row: AdminUserRow) {
    setRoleTarget(row)
    setDraftRole(row.role)
  }

  const roleLabel = (value: UserRole) =>
    value === "owner" ? t("user.roleOwner") : t("user.roleStaff")

  return (
    <div className="space-y-4">
      {/* Same header shape as the order and product lists: heading truncates,
          action stays on its row, right-aligned, at every width. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-h3 font-bold text-foreground">{t("user.title")}</h1>
          <p className="text-body text-muted-foreground">{t("user.subtitle")}</p>
        </div>
        <div className="flex shrink-0 justify-end">
          <Button onClick={() => setCreateOpen(true)} aria-label={t("user.newAccount")}>
            <Plus />
            <span className="hidden sm:inline">{t("user.newAccount")}</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t("user.searchPlaceholder")}
            className="h-11 pl-9"
            type="search"
          />
        </div>
        <SimpleSelect
          value={role}
          onValueChange={(v) => {
            setRole(v as UserRole | "all")
            setPage(1)
          }}
          options={[
            { value: "all", label: t("user.allRoles") },
            ...ROLES.map((r) => ({ value: r, label: roleLabel(r) })),
          ]}
          className="h-11 w-32 shrink-0"
        />
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <UsersIcon className="size-10 opacity-40" />
          <p>{t("user.noUsers")}</p>
        </div>
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {/* Sorting moved out of a filter-row dropdown and onto the
                    headers themselves. Only these two columns are sortable:
                    they are the only ones `SORT_MAP` in
                    `db/queries/users.ts` can order by (fullname, createdAt).
                    Role and Status have no server-side ordering, so they
                    stay plain rather than offering a control that silently
                    does nothing. */}
                <UserSortableHead
                  label={t("user.columnUser")}
                  ascending="name_az"
                  descending="name_za"
                  sort={sort}
                  onSort={applySort}
                />
                <TableHead>{t("user.columnRole")}</TableHead>
                <TableHead>{t("user.columnStatus")}</TableHead>
                <UserSortableHead
                  label={t("user.columnJoined")}
                  ascending="oldest"
                  descending="newest"
                  sort={sort}
                  onSort={applySort}
                />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isSelf = row.id === currentUserId
                const busy = pending === row.id
                return (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-64">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {row.fullname || t("user.noName")}
                        </span>
                        {isSelf && (
                          <Badge variant="outline" className="shrink-0">
                            {t("user.you")}
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-small text-muted-foreground">
                        {/* Both email and phone are optional on an
                            owner/staff account. */}
                        {row.email || t("user.noEmail")}
                        {row.phone ? ` · ${row.phone}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.role === "owner" ? "default" : "secondary"}>
                        {roleLabel(row.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.emailVerifiedAt ? (
                        <Badge variant="outline">{t("user.verified")}</Badge>
                      ) : (
                        <Badge variant="destructive">{t("user.unverified")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(row.createdAt, locale === "en" ? "en-GB" : "th-TH")}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" disabled={busy}>
                              {busy ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <MoreHorizontal />
                              )}
                              <span className="sr-only">{t("user.actions")}</span>
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          {/* Hidden for your own row: the action would refuse
                              anyway, so offering it is just a dead end. */}
                          {!isSelf && (
                            <DropdownMenuItem onClick={() => openRoleDialog(row)}>
                              <Shield />
                              {t("user.changeRole")}
                            </DropdownMenuItem>
                          )}
                          {!row.emailVerifiedAt && (
                            <DropdownMenuItem
                              onClick={() =>
                                run(row.id, () => verifyUserEmail(row.id), t("user.verifiedDone"))
                              }
                            >
                              <MailCheck />
                              {t("user.markVerified")}
                            </DropdownMenuItem>
                          )}
                          {emailEnabled && (
                            <DropdownMenuItem
                              onClick={() =>
                                run(
                                  row.id,
                                  () => sendUserPasswordReset(row.id, locale),
                                  t("user.resetSent")
                                )
                              }
                            >
                              <KeyRound />
                              {t("user.sendReset")}
                            </DropdownMenuItem>
                          )}
                          {!isSelf && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Trash2 />
                                {t("user.deleteUser")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-small text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight />
          </Button>
        </div>
      )}

      <Dialog
        open={roleTarget !== null}
        onOpenChange={(open) => (open ? undefined : setRoleTarget(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("user.roleTitle")}</DialogTitle>
            <DialogDescription>
              {t("user.roleBody", { email: roleTarget?.email || roleTarget?.fullname || "" })}
            </DialogDescription>
          </DialogHeader>

          <SimpleSelect
            value={draftRole}
            onValueChange={(v) => setDraftRole(v as UserRole)}
            options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
            className="h-11 w-full"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={pending !== null || draftRole === roleTarget?.role}
              onClick={() => {
                const target = roleTarget
                if (!target) return
                run(
                  target.id,
                  () => setUserRole(target.id, draftRole),
                  t("user.roleChanged"),
                  () => setRoleTarget(null)
                )
              }}
            >
              {pending !== null && <Loader2 className="animate-spin" />}
              {t("user.roleSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => (open ? undefined : setDeleteTarget(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("user.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("user.deleteBody", { email: deleteTarget?.email || deleteTarget?.fullname || "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={pending !== null}
              onClick={() => {
                const target = deleteTarget
                if (!target) return
                run(
                  target.id,
                  () => deleteUser(target.id),
                  t("user.deleted"),
                  () => setDeleteTarget(null)
                )
              }}
            >
              {pending !== null && <Loader2 className="animate-spin" />}
              {t("user.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roleLabel={roleLabel}
        onCreated={() => {
          setCreateOpen(false)
          query.refetch()
        }}
      />
    </div>
  )
}

/**
 * Create-account dialog. This is the only in-app way to mint an account —
 * there is no public registration (guest checkout needs no account), so
 * before this the second admin had to come from `npm run create-owner` with
 * shell access.
 *
 * Email and phone are each optional but at least one is required, because
 * `authorize()` in src/auth.ts looks an account up by email OR phone and by
 * nothing else — an account with neither could never sign in. The server
 * enforces that too (`createUser`'s `.refine`); this only surfaces it early.
 */
function CreateUserDialog({
  open,
  onOpenChange,
  roleLabel,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roleLabel: (value: UserRole) => string
  onCreated: () => void
}) {
  const t = useTranslations()
  const [fullname, setFullname] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [newRole, setNewRole] = useState<UserRole>("staff")
  const [saving, setSaving] = useState(false)

  function reset() {
    setFullname("")
    setEmail("")
    setPhone("")
    setPassword("")
    setNewRole("staff")
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await createUser({ fullname, email, phone, password, role: newRole })
      if (!result.ok) {
        toast.error(
          result.error === "duplicate"
            ? t("user.errorDuplicate")
            : result.error === "identifier_required"
              ? t("user.errorIdentifierRequired")
              : t("user.errorGeneric")
        )
        return
      }
      toast.success(t("user.accountCreated"))
      reset()
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("user.newAccount")}</DialogTitle>
            <DialogDescription>{t("user.newAccountBody")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <label className="grid gap-1.5">
              <span className="text-small font-medium">{t("user.fullName")}</span>
              <Input value={fullname} onChange={(e) => setFullname(e.target.value)} required maxLength={120} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-small font-medium">{t("user.email")}</span>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-small font-medium">{t("user.phone")}</span>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="off" />
            </label>
            <p className="text-small text-muted-foreground">{t("user.identifierHint")}</p>
            <label className="grid gap-1.5">
              <span className="text-small font-medium">{t("user.password")}</span>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-small font-medium">{t("user.columnRole")}</span>
              <SimpleSelect
                value={newRole}
                onValueChange={(v) => setNewRole(v as UserRole)}
                options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Sortable column header for the user table. Same interaction and markup as
 * `SortableHead` in order-list.tsx (first click = descending, second =
 * ascending, `aria-sort` reflected for screen readers); kept as its own
 * component because it is typed to `UserSort` rather than `OrderSort`.
 */
function UserSortableHead({
  label,
  ascending,
  descending,
  sort,
  onSort,
}: {
  label: string
  /** Sort value for A->Z / oldest. */
  ascending: UserSort
  /** Sort value for Z->A / newest — the first click's result. */
  descending: UserSort
  sort: UserSort
  onSort: (next: UserSort) => void
}) {
  const isAscending = sort === ascending
  const isActive = isAscending || sort === descending

  return (
    <TableHead aria-sort={isActive ? (isAscending ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(isActive && !isAscending ? ascending : descending)}
        className="group -mx-1 flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {label}
        {isActive ? (
          isAscending ? (
            <ChevronUp className="size-3.5" aria-hidden />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden />
          )
        ) : (
          <ChevronsUpDown
            className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60"
            aria-hidden
          />
        )}
      </button>
    </TableHead>
  )
}
