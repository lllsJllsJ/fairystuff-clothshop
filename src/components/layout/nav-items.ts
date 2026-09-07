import {
  LayoutDashboard,
  Shirt,
  Receipt,
  FileBarChart,
  Settings,
  type LucideIcon,
} from "lucide-react"

/**
 * Flat NAV_ITEMS array — no role filtering. carstockpro's `navItemsFor` /
 * `mobileNavItemsFor` (role -> filtered menu) are deleted entirely: this
 * shop has exactly one admin role (`owner`; `staff` has zero capability in
 * v1), so every item here is implicitly owner-only already, enforced by
 * `requireOwner()` in src/app/admin/layout.tsx (plan §6).
 *
 * `/admin/users` deliberately does NOT appear here. Account administration
 * is a rare, account-shaped errand rather than a daily workflow surface, so
 * it lives in the profile dropdown (`user-menu.tsx`) next to Sign out —
 * keeping this bar to the six screens the owner actually works in.
 */
export type NavItem = {
  href: string
  /** key under the `nav` message namespace */
  labelKey: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/admin/products", labelKey: "products", icon: Shirt },
  { href: "/admin/orders", labelKey: "orders", icon: Receipt },
  { href: "/admin/reports", labelKey: "reports", icon: FileBarChart },
  { href: "/admin/settings", labelKey: "settings", icon: Settings },
]
