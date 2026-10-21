import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../actions",()=>({toggleWhatsAppAutomation:vi.fn()}));
vi.mock("@/components/ui/form-submit-button",()=>({FormSubmitButton:()=> <button>Activar API</button>}));
import { WhatsAppSettings } from "./whatsapp-settings";
Object.assign(globalThis,{React});
describe("manual receipt settings",()=>{
  it("makes the free manual flow available without suggesting it depends on Meta setup",()=>{
    const html=renderToStaticMarkup(<WhatsAppSettings status={{enabled:false,connected:false,templatesApproved:false,webhookVerified:false,ready:false,message:"Falta vincular Meta"}}/>);
    expect(html).toContain("Envío manual disponible");expect(html).toContain("Automatización con API (opcional");
    expect(html).toContain("WhatsApp Web");expect(html.indexOf("Envío manual disponible")).toBeLessThan(html.indexOf("Falta vincular Meta"));
    expect(html).not.toContain("Pendiente de conexión</span>");
  });
});
