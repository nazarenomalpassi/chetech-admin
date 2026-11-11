import type { NextConfig } from "next";
import { LEGACY_REPAIR_QR_CONTEXT_PARAMETERS, LEGACY_REPAIR_QR_MISSING_HEADERS } from "./src/features/repairs-access/repair-qr-links";

const nextConfig: NextConfig = {
  distDir: process.env.CHETECH_LOCAL_STAGING === "1" ? ".next-staging" : ".next",
  typedRoutes: true,
  serverExternalPackages: ["pdfkit"],
  async rewrites() {
    return {
      beforeFiles: [{
        source: "/reparaciones-access",
        has: [
          { type: "query", key: "view", value: "detalle" },
          { type: "query", key: "order", value: "(?<legacyRepairQrId>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})" }
        ],
        // Leave RSC and both fetch/native form Server Action POSTs untouched.
        missing: [
          ...LEGACY_REPAIR_QR_MISSING_HEADERS.map(key => ({ type: "header" as const, key })),
          ...LEGACY_REPAIR_QR_CONTEXT_PARAMETERS.map(key => ({ type: "query" as const, key }))
        ],
        destination: "/q/:legacyRepairQrId"
      }],
      afterFiles: [], fallback: []
    };
  },
  outputFileTracingIncludes: {
    "/api/repair-access/labels/*": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf", "./public/brand/*.png", "./public/brand/*.svg"],
    "/api/invoices/[id]/pdf": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf"],
    "/api/repair-access/documents/*": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf", "./public/brand/document-*.png"],
    "/api/whatsapp/worker": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf", "./public/brand/document-*.png"],
    "/api/repair-access/document-shares": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf", "./public/brand/document-*.png"],
    "/api/comprobantes/*": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf", "./public/brand/document-*.png"],
    "/api/fiscal/records/*/pdf": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf"]
  }
};

export default nextConfig;
