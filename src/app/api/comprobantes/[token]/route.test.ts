import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRepairDocumentData } from "@/features/repairs-access/documents";
const m=vi.hoisted(()=>({rpc:vi.fn(),client:vi.fn(),pdf:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:m.client}));
vi.mock("@/lib/supabase/config",()=>({getSupabasePublicKey:()=>"public-key"}));
vi.mock("@/features/repairs-access/repair-document-pdf",()=>({generateRepairDocumentPdf:m.pdf}));
const token="a".repeat(64);
const source:any={id:"order",repairNumber:"REP-000513",intakeDate:"2026-10-01",issueReported:"No enciende",budgetAmount:120000,budgetDetail:"Cambio de tiras LED",pickedUpAt:"2026-10-21T12:00:00Z",deliveredAt:null,hasWarranty:true,warrantyDays:90,warrantyStart:"2026-10-21",warrantyUntil:"2027-01-19",warrantyConditions:"Sobre trabajo realizado",customer:{fullName:"Cliente de prueba",phone:"3571544683",address:"Domicilio"},device:{deviceType:"Televisor",brand:"Samsung",model:"Modelo",serialNumber:"SERIE",color:"Negro",accessoryDetails:"Control",visualCondition:"Bueno"}};
const document={...buildRepairDocumentData(source,"delivery"),issuedAt:"2026-10-21T12:30:00.000Z"};
async function get(value=token,method:"GET"|"HEAD"="GET"){
  const handler=await import("./route");return handler[method](new Request(`https://local.test/api/comprobantes/${value}`,{method}),{params:Promise.resolve({token:value})});
}
beforeEach(()=>{vi.clearAllMocks();process.env.NEXT_PUBLIC_SUPABASE_URL="https://project.supabase.co";m.client.mockReturnValue({rpc:m.rpc});m.rpc.mockResolvedValue({data:{document},error:null});m.pdf.mockResolvedValue(Buffer.from("%PDF-example"));});
describe("capability-scoped public receipt",()=>{
  it("serves only the approved PDF without login or a service role key",async()=>{
    const response=await get();expect(response.status).toBe(200);expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(await response.text()).toBe("%PDF-example");expect(m.rpc).toHaveBeenCalledWith("read_repair_document_link",{p_token:token});
    expect(m.client).toHaveBeenCalledWith("https://project.supabase.co","public-key",expect.objectContaining({auth:expect.objectContaining({persistSession:false})}));
    expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("x-robots-tag")).toContain("noindex");expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-disposition")).toContain("REP-000513-pago-y-garantia.pdf");
  });
  it.each(["REP-000513","abc",`${token}a`,"../admin"])("rejects %s before touching the database",async(value)=>{expect((await get(value)).status).toBe(404);expect(m.client).not.toHaveBeenCalled();});
  it("gives the same unavailable result for unknown, revoked and expired capabilities",async()=>{
    m.rpc.mockResolvedValue({data:null,error:null});const unknown=await get();const invalid=await get("bad");expect(unknown.status).toBe(404);expect(await unknown.text()).toBe(await invalid.text());expect(m.pdf).not.toHaveBeenCalled();
  });
  it("never leaks a malformed snapshot or database error",async()=>{
    m.rpc.mockResolvedValue({data:{document:{kind:"estimate",internalNotes:"secret"}},error:null});const invalid=await get();expect(invalid.status).toBe(404);expect(await invalid.text()).not.toContain("secret");
    m.rpc.mockResolvedValue({data:null,error:{message:"private table details"}});const failed=await get();expect(failed.status).toBe(503);expect(await failed.text()).not.toContain("private table details");
  });
  it("preserves the stored document data and supports preview HEAD requests without consuming access",async()=>{
    const response=await get(token,"HEAD");expect(response.status).toBe(200);expect(await response.text()).toBe("");
    expect(m.pdf).toHaveBeenCalledWith(document);
    expect((await get()).status).toBe(200);expect(m.rpc).toHaveBeenCalledTimes(2);
  });
});
