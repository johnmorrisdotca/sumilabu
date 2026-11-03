import type { MetadataRoute } from "next";

/* Every page is private (SUMILABU-7), so there is nothing for a crawler to read; the API answers 401 to it anyway. */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
