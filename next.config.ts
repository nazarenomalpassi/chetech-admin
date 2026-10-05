import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.CHETECH_LOCAL_STAGING === "1" ? ".next-staging" : ".next",
  typedRoutes: true,
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/invoices/[id]/pdf": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf"],
    "/api/repair-access/documents/*": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf"],
    "/api/fiscal/records/*/pdf": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf"]
  }
};

export default nextConfig;
