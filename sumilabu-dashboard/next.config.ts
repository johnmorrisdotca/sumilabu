import type { NextConfig } from "next";

/*
 * Pages live on one host (SUMILABU-7). sumilabu.com, www and api.sumilabu.com
 * are aliases of the same deployment, so without this the session cookie (one
 * per host) and Google's redirect address (one per host, registered by hand)
 * would each need every name. Every page, and next-auth's own routes, on the
 * other names go to app.sumilabu.com; the token API (`/api/…` except
 * `/api/auth/…`) answers on every name exactly as before, so a device posting
 * to sumilabu.com or a release tool calling api.sumilabu.com never sees a
 * redirect. A config redirect is matched on the Host header by Vercel's own
 * router, before any function runs, so it costs no invocation.
 */
export const PAGES_HOST = "app.sumilabu.com";
export const OTHER_HOSTS = ["sumilabu.com", "www.sumilabu.com", "api.sumilabu.com"];
export const NOT_TOKEN_API = "/:path((?!api/(?!auth/)).*)";

const nextConfig: NextConfig = {
  async redirects() {
    return OTHER_HOSTS.map((host) => ({
      source: NOT_TOKEN_API,
      has: [{ type: "host" as const, value: host }],
      destination: `https://${PAGES_HOST}/:path`,
      permanent: false,
    }));
  },
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
