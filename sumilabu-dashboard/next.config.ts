import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * What no server function needs of Prisma: about eighty megabytes of every
   * function that touches the database.
   *
   * The generated client loads `runtime/library.js` and one query engine, and
   * on Vercel that engine is `rhel-openssl-3.0.x` (see `schema.prisma`). The
   * tracer packed the whole runtime folder anyway - wasm engines and compilers
   * for five databases in two module formats, their source maps, the edge and
   * browser builds - plus the engine of whatever machine ran the build: darwin
   * on a Mac, debian on the CI runner. The ingest and dashboard functions were
   * 102 MB each, most of it this. Every function's size counts against the
   * Functions Storage the whole SPXIS account shares; the same exclusion took
   * umakuma's largest from 236 MB to 90 on 2026-09-23.
   */
  outputFileTracingExcludes: {
    "/**": [
      "node_modules/.pnpm/**/@prisma/client/runtime/*.wasm-base64.*",
      "node_modules/.pnpm/**/@prisma/client/runtime/query_{engine,compiler}_bg.*",
      "node_modules/.pnpm/**/@prisma/client/runtime/{wasm,edge,react-native,index-browser,binary,client}*",
      "node_modules/.pnpm/**/@prisma/client/runtime/*.{map,d.ts,d.mts}",
      "node_modules/.pnpm/**/.prisma/client/libquery_engine-{darwin,debian,linux-musl,windows}*",
      "node_modules/.pnpm/**/.prisma/client/{query_engine_bg.wasm,wasm*,edge.js,index-browser.js,*.d.ts}",
    ],
  },
};

export default nextConfig;
