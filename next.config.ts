import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.CHETECH_LOCAL_STAGING === "1" ? ".next-staging" : ".next",
  typedRoutes: true,
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/invoices/[id]/pdf": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf"],
    "/api/repair-access/documents/*": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf", "./public/brand/document-*.png"],
    "/api/whatsapp/worker": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf", "./public/brand/document-*.png"],
    "/api/repair-access/document-shares": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf", "./public/brand/document-*.png"],
    "/api/comprobantes/*": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf", "./public/brand/document-*.png"],
    "/api/fiscal/records/*/pdf": ["./node_modules/pdfkit/js/data/**/*", "./public/brand/*.otf"]
  }
};

export default nextConfig;
