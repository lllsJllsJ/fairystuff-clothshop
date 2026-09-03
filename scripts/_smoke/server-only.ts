// No-op stand-in for the `server-only` package. That package throws when
// required as plain Node (its no-op swap only applies under the bundler's
// `react-server` condition), which would stop the query modules from being
// importable by a plain tsx script. Mapped in tsconfig.smoke.json.
export {}
