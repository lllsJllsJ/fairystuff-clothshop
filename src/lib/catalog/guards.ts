export const CATALOG_REPLACE_CONFIRMATION = "REPLACE CATALOGUE WITH FAIRYSTUFF"

export function isPrivateDatabaseTarget(databaseUrl: string): boolean {
  const host = new URL(databaseUrl).hostname.toLowerCase()
  if (["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".internal")) return true
  const octets = host.split(".").map(Number)
  return octets.length === 4 && (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
}

export function assertCatalogApplyGuards(options: {
  replace: boolean
  confirmation?: string
  databaseUrl: string
  allowRemote: boolean
}): { privateTarget: boolean } {
  if (!options.replace) throw new Error("--apply also requires --replace")
  if (options.confirmation !== CATALOG_REPLACE_CONFIRMATION) {
    throw new Error(`Confirmation must exactly equal: ${CATALOG_REPLACE_CONFIRMATION}`)
  }
  const privateTarget = isPrivateDatabaseTarget(options.databaseUrl)
  if (!privateTarget && !options.allowRemote) {
    throw new Error("Remote database replacement also requires --allow-remote")
  }
  return { privateTarget }
}
