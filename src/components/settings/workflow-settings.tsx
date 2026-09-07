"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Save, Star } from "lucide-react"
import { toast } from "sonner"

import type { Character } from "@/db/queries/characters"
import type {
  CustomerStatusLabel,
  OrderItemStatusDefinition,
  OrderStatusLabel,
  ShopSettings,
} from "@/db/queries/settings"
import { orderStatusValues } from "@/lib/validations/order"
import {
  CUSTOMER_ORDER_STAGES,
  DEFAULT_ADMIN_STATUS_LABELS,
  DEFAULT_CUSTOMER_STATUS_LABELS,
} from "@/lib/order-status"
import {
  createCharacter,
  deleteCharacter,
  deleteItemStatus,
  makeDefaultItemStatus,
  saveItemStatus,
  saveOrderLabel,
  saveShopContacts,
  updateCharacter,
} from "@/app/[locale]/admin/settings/workflow-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandSettings } from "@/components/settings/brand-settings"
import {
  SettingsSection,
  SettingsRow,
  SettingsFormDialog,
  DialogField,
} from "@/components/settings/settings-section"

type Run = (action: Promise<{ ok: boolean; error?: string }>) => void

/**
 * Every manageable list on this page — characters and order-item statuses
 * here, product types in `product-type-manager.tsx` — uses one shape:
 * a `SettingsSection` whose header carries a single icon-only `+` button,
 * and rows that show their values as text with a pencil and a bin on the
 * right. Adding and editing both happen in a dialog rather than inline,
 * because inline editors put three or four inputs on a row that a phone
 * cannot fit.
 *
 * Shop contacts is deliberately NOT converted: it is a single fixed form
 * of three fields, not a list you add to, so a dialog would add a click
 * for nothing. It sits last, immediately above the Danger zone.
 */
export function WorkflowSettings(props: {
  settings: ShopSettings
  characters: Character[]
  orderLabels: OrderStatusLabel[]
  customerLabels: CustomerStatusLabel[]
  itemStatuses: OrderItemStatusDefinition[]
}) {
  const t = useTranslations("settings")
  const [lineId, setLineId] = useState(props.settings.lineId ?? "")
  const [instagram, setInstagram] = useState(props.settings.instagramHandle ?? "")
  const [facebook, setFacebook] = useState(props.settings.facebookUrl ?? "")

  const run: Run = async (action) => {
    const result = await action
    if (!result.ok) toast.error(t("saveFailed"))
    else {
      toast.success(t("saved"))
      window.location.reload()
    }
  }

  return (
    <div className="space-y-6">
      <CharactersSection characters={props.characters} run={run} />

      <SettingsSection title={t("orderStatusLabels")} hint={t("fixedStatusHint")}>
        {orderStatusValues.map((status) => {
          const current = props.orderLabels.find((row) => row.status === status)
          const fallback = DEFAULT_ADMIN_STATUS_LABELS[status]
          return (
            <StatusLabelRow
              key={status}
              code={status}
              kind="admin"
              labelTh={current?.labelTh ?? fallback.th}
              labelEn={current?.labelEn ?? fallback.en}
              run={run}
            />
          )
        })}
      </SettingsSection>

      <SettingsSection title={t("customerStatusLabels")}>
        {CUSTOMER_ORDER_STAGES.map((stage) => {
          const current = props.customerLabels.find((row) => row.stage === stage)
          const fallback = DEFAULT_CUSTOMER_STATUS_LABELS[stage]
          return (
            <StatusLabelRow
              key={stage}
              code={stage}
              kind="customer"
              labelTh={current?.labelTh ?? fallback.th}
              labelEn={current?.labelEn ?? fallback.en}
              run={run}
            />
          )
        })}
      </SettingsSection>

      <ItemStatusesSection statuses={props.itemStatuses} run={run} />

      {/* Brand sits low on the page, directly above Shop contacts — both
       * are singleton settings forms rather than lists, and the owner
       * only touches either occasionally after initial setup. */}
      <BrandSettings settings={props.settings} />

      {/* Moved down to sit directly above the Danger zone (DataTools). */}
      <section className="border border-border bg-card p-5">
        <h2 className="text-subtitle font-bold">{t("shopContacts")}</h2>
        <p className="mt-1 text-small text-muted-foreground">{t("shopContactsHint")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SettingField label="LINE ID">
            <Input value={lineId} onChange={(e) => setLineId(e.target.value)} placeholder="@yourshop" />
          </SettingField>
          <SettingField label="Instagram">
            <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="yourshop" />
          </SettingField>
          <SettingField label="Facebook">
            <Input
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              placeholder="facebook.com/yourshop"
            />
          </SettingField>
        </div>
        <Button className="mt-3" onClick={() => run(saveShopContacts(lineId, instagram, facebook))}>
          <Save />
          {t("save")}
        </Button>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------- characters */

function CharactersSection({ characters, run }: { characters: Character[]; run: Run }) {
  const t = useTranslations("settings")
  const tc = useTranslations("common")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Character | null>(null)

  return (
    <>
      <SettingsSection title={t("characters")} onAdd={() => setAdding(true)} addLabel={t("add")}>
        {characters.map((character) => (
          <SettingsRow
            key={character.id}
            title={character.name}
            subtitle={character.nameEn ?? undefined}
            onEdit={() => setEditing(character)}
            onDelete={() => run(deleteCharacter(character.id))}
            editLabel={tc("edit")}
            deleteLabel={tc("delete")}
          />
        ))}
      </SettingsSection>

      <CharacterDialog
        open={adding}
        onOpenChange={setAdding}
        title={t("characters")}
        onSubmit={(name, nameEn) => run(createCharacter(name, nameEn))}
      />
      <CharacterDialog
        key={editing?.id ?? "none"}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={t("characters")}
        initialName={editing?.name}
        initialNameEn={editing?.nameEn ?? ""}
        onSubmit={(name, nameEn) => editing && run(updateCharacter(editing.id, name, nameEn))}
      />
    </>
  )
}

function CharacterDialog({
  open,
  onOpenChange,
  title,
  initialName = "",
  initialNameEn = "",
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialName?: string
  initialNameEn?: string
  onSubmit: (name: string, nameEn: string) => void
}) {
  const t = useTranslations("settings")
  const [name, setName] = useState(initialName)
  const [nameEn, setNameEn] = useState(initialNameEn)

  return (
    <SettingsFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      submitLabel={t("save")}
      canSubmit={name.trim().length > 0}
      onSubmit={() => onSubmit(name, nameEn)}
    >
      <DialogField label={t("nameTh")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("nameTh")} />
      </DialogField>
      <DialogField label={t("nameEn")}>
        <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder={t("nameEn")} />
      </DialogField>
    </SettingsFormDialog>
  )
}

/* --------------------------------------------------------- status labels */

function StatusLabelRow({
  code,
  kind,
  labelTh,
  labelEn,
  run,
}: {
  code: string
  kind: "admin" | "customer"
  labelTh: string
  labelEn: string
  run: Run
}) {
  const t = useTranslations("settings")
  const tc = useTranslations("common")
  const [open, setOpen] = useState(false)
  const [th, setTh] = useState(labelTh)
  const [en, setEn] = useState(labelEn)

  return (
    <>
      {/* Fixed statuses: renameable, never added or deleted — so this row
          gets the pencil and no bin. */}
      <SettingsRow
        title={labelTh}
        subtitle={`${labelEn} · ${code}`}
        onEdit={() => setOpen(true)}
        editLabel={tc("edit")}
      />
      <SettingsFormDialog
        open={open}
        onOpenChange={setOpen}
        title={code}
        submitLabel={t("save")}
        canSubmit={th.trim().length > 0 && en.trim().length > 0}
        onSubmit={() => run(saveOrderLabel(kind, code, th, en))}
      >
        <DialogField label={t("nameTh")}>
          <Input value={th} onChange={(e) => setTh(e.target.value)} />
        </DialogField>
        <DialogField label={t("nameEn")}>
          <Input value={en} onChange={(e) => setEn(e.target.value)} />
        </DialogField>
      </SettingsFormDialog>
    </>
  )
}

/* ---------------------------------------------------------- item statuses */

function ItemStatusesSection({
  statuses,
  run,
}: {
  statuses: OrderItemStatusDefinition[]
  run: Run
}) {
  const t = useTranslations("settings")
  const tc = useTranslations("common")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<OrderItemStatusDefinition | null>(null)

  return (
    <>
      <SettingsSection
        title={t("itemStatuses")}
        hint={t("itemStatusesHint")}
        onAdd={() => setAdding(true)}
        addLabel={t("add")}
      >
        {statuses.map((status) => (
          <SettingsRow
            key={status.code}
            title={status.labelTh}
            subtitle={`${status.labelEn} · ${status.code}`}
            badges={[
              status.isDefault ? t("defaultStatus") : null,
              status.isReceived ? "received" : null,
              status.isRefunded ? "refunded" : null,
              status.isActive ? "active" : null,
            ]}
            leading={
              <Button
                variant={status.isDefault ? "default" : "ghost"}
                size="icon"
                onClick={() => run(makeDefaultItemStatus(status.code))}
                aria-label={t("makeDefault")}
              >
                <Star />
              </Button>
            }
            onEdit={() => setEditing(status)}
            onDelete={status.isDefault ? undefined : () => run(deleteItemStatus(status.code))}
            editLabel={tc("edit")}
            deleteLabel={tc("delete")}
          />
        ))}
      </SettingsSection>

      <ItemStatusDialog
        open={adding}
        onOpenChange={setAdding}
        onSubmit={(v) => run(saveItemStatus(v))}
      />
      <ItemStatusDialog
        key={editing?.code ?? "none"}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        initial={editing ?? undefined}
        onSubmit={(v) => editing && run(saveItemStatus(v, editing.code))}
      />
    </>
  )
}

type ItemStatusValues = {
  code: string
  labelTh: string
  labelEn: string
  isReceived: boolean
  isRefunded: boolean
  isActive: boolean
}

function ItemStatusDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: OrderItemStatusDefinition
  onSubmit: (values: ItemStatusValues) => void
}) {
  const t = useTranslations("settings")
  const [code, setCode] = useState(initial?.code ?? "")
  const [th, setTh] = useState(initial?.labelTh ?? "")
  const [en, setEn] = useState(initial?.labelEn ?? "")
  const [received, setReceived] = useState(initial?.isReceived ?? false)
  const [refunded, setRefunded] = useState(initial?.isRefunded ?? false)
  const [active, setActive] = useState(initial?.isActive ?? true)

  return (
    <SettingsFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("itemStatuses")}
      submitLabel={t("save")}
      canSubmit={code.trim().length > 0 && th.trim().length > 0 && en.trim().length > 0}
      onSubmit={() =>
        onSubmit({ code, labelTh: th, labelEn: en, isReceived: received, isRefunded: refunded, isActive: active })
      }
    >
      <DialogField label="code">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
          placeholder="status_code"
        />
      </DialogField>
      <DialogField label={t("nameTh")}>
        <Input value={th} onChange={(e) => setTh(e.target.value)} placeholder={t("nameTh")} />
      </DialogField>
      <DialogField label={t("nameEn")}>
        <Input value={en} onChange={(e) => setEn(e.target.value)} placeholder={t("nameEn")} />
      </DialogField>
      <div className="grid gap-1">
        <CheckboxRow label="received" checked={received} onChange={setReceived} />
        <CheckboxRow label="refunded" checked={refunded} onChange={setRefunded} />
        <CheckboxRow label="active" checked={active} onChange={setActive} />
      </div>
    </SettingsFormDialog>
  )
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body">
      <input
        type="checkbox"
        className="size-5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

function SettingField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
