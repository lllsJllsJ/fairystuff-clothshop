import { setRequestLocale } from "next-intl/server"

import { getProductTypes } from "@/db/queries/product-types"
import { getCharacters } from "@/db/queries/characters"
import { ProductTypeManager } from "@/components/settings/product-type-manager"
import { CharacterSettings } from "@/components/settings/workflow-settings"

export default async function CatalogSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [types, characters] = await Promise.all([getProductTypes(), getCharacters()])

  return (
    <>
      <ProductTypeManager types={types} />
      <CharacterSettings characters={characters} />
    </>
  )
}
