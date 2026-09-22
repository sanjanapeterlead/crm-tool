// `server-only` throws when imported outside Next's server bundler. Vitest runs
// in plain Node, so integration tests alias it to this no-op to import services.
export {};
