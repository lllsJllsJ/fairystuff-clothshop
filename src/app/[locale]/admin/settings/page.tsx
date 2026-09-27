import { redirect } from "@/i18n/navigation"

/** `/admin/settings` has no content of its own — land on the first section. */
export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect({ href: "/admin/settings/storefront", locale })
}
