"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Plus, Save, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { Character } from "@/db/queries/characters"
import type { CustomerStatusLabel, OrderItemStatusDefinition, OrderStatusLabel, ShopSettings } from "@/db/queries/settings"
import { orderStatusValues } from "@/lib/validations/order"
import { CUSTOMER_ORDER_STAGES, DEFAULT_ADMIN_STATUS_LABELS, DEFAULT_CUSTOMER_STATUS_LABELS } from "@/lib/order-status"
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
  const [newCharacter, setNewCharacter] = useState("")
  const [newCharacterEn, setNewCharacterEn] = useState("")
  const [newStatusCode, setNewStatusCode] = useState("")
  const [newStatusTh, setNewStatusTh] = useState("")
  const [newStatusEn, setNewStatusEn] = useState("")

  async function run(action: Promise<{ ok: boolean; error?: string }>) {
    const result = await action
    if (!result.ok) toast.error(t("saveFailed"))
    else { toast.success(t("saved")); window.location.reload() }
  }

  return <div className="space-y-6">
    <section className="border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("shopContacts")}</h2>
      <p className="mt-1 text-small text-muted-foreground">{t("shopContactsHint")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><SettingField label="LINE ID"><Input value={lineId} onChange={(e) => setLineId(e.target.value)} placeholder="@yourshop" /></SettingField><SettingField label="Instagram"><Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="yourshop" /></SettingField></div>
      <Button className="mt-3" onClick={() => run(saveShopContacts(lineId, instagram))}><Save />{t("save")}</Button>
    </section>

    <section className="border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("characters")}</h2>
      <div className="mt-4 flex flex-wrap gap-2"><Input className="min-w-48 flex-1" value={newCharacter} onChange={(e) => setNewCharacter(e.target.value)} placeholder={t("nameTh")} /><Input className="min-w-48 flex-1" value={newCharacterEn} onChange={(e) => setNewCharacterEn(e.target.value)} placeholder={t("nameEn")} /><Button onClick={() => run(createCharacter(newCharacter, newCharacterEn))} disabled={!newCharacter.trim()}><Plus />{t("add")}</Button></div>
      <div className="mt-4 divide-y divide-border">{props.characters.map((character) => <CharacterRow key={character.id} character={character} run={run} />)}</div>
    </section>

    <section className="border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("orderStatusLabels")}</h2>
      <p className="mt-1 text-small text-muted-foreground">{t("fixedStatusHint")}</p>
      <div className="mt-4 space-y-3">{orderStatusValues.map((status) => {
        const current = props.orderLabels.find((row) => row.status === status)
        const fallback = DEFAULT_ADMIN_STATUS_LABELS[status]
        return <StatusLabelRow key={status} code={status} kind="admin" labelTh={current?.labelTh ?? fallback.th} labelEn={current?.labelEn ?? fallback.en} run={run} />
      })}</div>
    </section>

    <section className="border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("customerStatusLabels")}</h2>
      <div className="mt-4 space-y-3">{CUSTOMER_ORDER_STAGES.map((stage) => {
        const current = props.customerLabels.find((row) => row.stage === stage)
        const fallback = DEFAULT_CUSTOMER_STATUS_LABELS[stage]
        return <StatusLabelRow key={stage} code={stage} kind="customer" labelTh={current?.labelTh ?? fallback.th} labelEn={current?.labelEn ?? fallback.en} run={run} />
      })}</div>
    </section>

    <section className="border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("itemStatuses")}</h2>
      <p className="mt-1 text-small text-muted-foreground">{t("itemStatusesHint")}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3"><Input value={newStatusCode} onChange={(e) => setNewStatusCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="status_code" /><Input value={newStatusTh} onChange={(e) => setNewStatusTh(e.target.value)} placeholder={t("nameTh")} /><Input value={newStatusEn} onChange={(e) => setNewStatusEn(e.target.value)} placeholder={t("nameEn")} /></div>
      <Button className="mt-2" disabled={!newStatusCode || !newStatusTh || !newStatusEn} onClick={() => run(saveItemStatus({ code: newStatusCode, labelTh: newStatusTh, labelEn: newStatusEn, isReceived: false, isRefunded: false, isActive: true }))}><Plus />{t("add")}</Button>
      <div className="mt-4 space-y-3">{props.itemStatuses.map((status) => <ItemStatusRow key={status.code} status={status} run={run} />)}</div>
    </section>
  </div>
}

function CharacterRow({ character, run }: { character: Character; run: (action: Promise<{ ok: boolean; error?: string }>) => void }) {
  const [name, setName] = useState(character.name); const [nameEn, setNameEn] = useState(character.nameEn ?? "")
  return <div className="flex flex-wrap gap-2 py-2"><Input className="min-w-40 flex-1" value={name} onChange={(e) => setName(e.target.value)} /><Input className="min-w-40 flex-1" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /><Button size="icon-sm" onClick={() => run(updateCharacter(character.id, name, nameEn))}><Save /></Button><Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => run(deleteCharacter(character.id))}><Trash2 /></Button></div>
}

function StatusLabelRow({ code, kind, labelTh, labelEn, run }: { code: string; kind: "admin" | "customer"; labelTh: string; labelEn: string; run: (action: Promise<{ ok: boolean; error?: string }>) => void }) {
  const [th, setTh] = useState(labelTh); const [en, setEn] = useState(labelEn)
  return <div className="grid items-center gap-2 sm:grid-cols-[140px_1fr_1fr_auto]"><code className="text-small">{code}</code><Input value={th} onChange={(e) => setTh(e.target.value)} /><Input value={en} onChange={(e) => setEn(e.target.value)} /><Button size="icon-sm" onClick={() => run(saveOrderLabel(kind, code, th, en))}><Save /></Button></div>
}

function ItemStatusRow({ status, run }: { status: OrderItemStatusDefinition; run: (action: Promise<{ ok: boolean; error?: string }>) => void }) {
  const [th, setTh] = useState(status.labelTh); const [en, setEn] = useState(status.labelEn); const [received, setReceived] = useState(status.isReceived); const [refunded, setRefunded] = useState(status.isRefunded); const [active, setActive] = useState(status.isActive)
  return <div className="grid items-center gap-2 border border-border p-3 sm:grid-cols-[120px_1fr_1fr_auto]"><code className="text-small">{status.code}</code><Input value={th} onChange={(e) => setTh(e.target.value)} /><Input value={en} onChange={(e) => setEn(e.target.value)} /><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-1 text-small"><input type="checkbox" checked={received} onChange={(e) => setReceived(e.target.checked)} /> received</label><label className="flex items-center gap-1 text-small"><input type="checkbox" checked={refunded} onChange={(e) => setRefunded(e.target.checked)} /> refunded</label><label className="flex items-center gap-1 text-small"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> active</label><Button size="icon-sm" variant={status.isDefault ? "default" : "outline"} onClick={() => run(makeDefaultItemStatus(status.code))}><Star /></Button><Button size="icon-sm" onClick={() => run(saveItemStatus({ code: status.code, labelTh: th, labelEn: en, isReceived: received, isRefunded: refunded, isActive: active }, status.code))}><Save /></Button><Button size="icon-sm" variant="ghost" className="text-destructive" disabled={status.isDefault} onClick={() => run(deleteItemStatus(status.code))}><Trash2 /></Button></div></div>
}

function SettingField({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div> }
