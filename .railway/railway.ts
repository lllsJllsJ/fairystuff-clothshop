import { defineRailway, github, preserve, project, service } from "railway/iac";

/**
 * Railway Infrastructure as Code for the app service — replaces the
 * deprecated railway.json (Config as Code). Preview with
 * `railway config plan`, apply with `railway config apply`.
 *
 * DECLARATIVE: anything this file declares for the service is made to match
 * it, so an omitted `env` key or `source` would DELETE that variable or
 * disconnect GitHub auto-deploys. Always run `plan` first and read every
 * "Delete"/"Update" line before applying.
 *
 * `partial` scopes this repo to the resources declared below — the app
 * service only. The Postgres database (fairystuff-pg), its volume, and the
 * storage bucket are deliberately NOT declared here, so nothing in this
 * file can ever modify or delete production data.
 */
export const partial = "fairystuff-clothshop"

export default defineRailway(() => {
  const app = service("fairystuff-clothshop", {
    source: github("lllsJllsJ/fairystuff-clothshop", { checkSuites: false }),
    build: "npm run build",
    start: "npm run start",
    // Applies pending Drizzle migrations between build and deploy — every
    // schema change (e.g. drizzle/0010_hero_images.sql) relies on this.
    deploy: { preDeployCommand: ["npm run db:migrate"] },
    replicas: { "asia-southeast1-eqsg3a": 1 },
    networking: { privateNetworkEndpoint: "fairystuffclothshop" },
    // Values live in Railway (secrets are never committed); preserve() keeps
    // each one as-is. A variable missing from this list is deleted on apply.
    env: {
      AUTH_SECRET: preserve(),
      AUTH_URL: preserve(),
      DATABASE_URL: preserve(),
      EMAIL_ENABLED: preserve(),
      NEXT_PUBLIC_SITE_URL: preserve(),
      STORAGE_ACCESS_KEY_ID: preserve(),
      STORAGE_BUCKET: preserve(),
      STORAGE_ENDPOINT: preserve(),
      STORAGE_FORCE_PATH_STYLE: preserve(),
      STORAGE_REGION: preserve(),
      STORAGE_SECRET_ACCESS_KEY: preserve(),
    },
  })

  return project("fairypink-clothshop", {
    resources: [app],
  })
})
