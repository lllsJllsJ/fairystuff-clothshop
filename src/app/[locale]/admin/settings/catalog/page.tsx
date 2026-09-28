import { setRequestLocale } from "next-intl/server"

import { getProductTypes } from "@/db/queries/product-types"
import { getCharacters } from "@/db/queries/characters"
import { getProductColors } from "@/db/queries/product-colors"
import { ProductTypeManager } from "@/components/settings/product-type-manager"
import { CharacterSettings } from "@/components/settings/workflow-settings"
import { ColorSettings } from "@/components/settings/color-settings"

export default async function CatalogSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [types, characters, colors] = await Promise.all([
    getProductTypes(),
    getCharacters(),
    getProductColors(),
  ])

  return (
    <>
      <ProductTypeManager types={types} />
      <ColorSettings colors={colors} />
      <CharacterSettings characters={characters} />
    </>
  )
}
