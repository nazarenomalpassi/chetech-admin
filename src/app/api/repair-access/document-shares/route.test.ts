import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ auth:vi.fn(), client:vi.fn(), rpc:vi.fn(), query:vi.fn(), map:vi.fn(), build:vi.fn(), pdf:vi.fn() }));
vi.mock("@/lib/auth",()=>({requireAdmin:m.auth}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:m.client}));
vi.mock("@/features/repairs-access/queries",()=>({mapOrder:m.map}));
vi.mock("@/features/repairs-access/documents",()=>({buildRepairDocumentData:m.build}));
vi.mock("@/features/repairs-access/repair-document-pdf",()=>({generateRepairDocumentPdf:m.pdf}));
const id="11111111-1111-4111-8111-111111111111";
async function post(body:object={},origin:string|null="https://local.test"){
  const {POST}=await import("./route");
  return POST(new Request("https://local.test/api/repair-access/document-shares",{method:"POST",headers:{"Content-Type":"application/json",...(origin?{Origin:origin}:{})},body:JSON.stringify({orderId:id,kind:"intake",intent:"send",...body})}));
}
beforeEach(async()=>{
  vi.clearAllMocks();m.auth.mockResolvedValue({role:"admin"});
  const query:any={select:()=>query,eq:()=>query,maybeSingle:m.query};
  m.client.mockResolvedValue({from:()=>query,rpc:m.rpc});
  m.query.mockResolvedValue({data:{id},error:null});
  m.map.mockReturnValue({id,repairNumber:"REP-000513",customer:{fullName:"Cliente",phone:"3571544683"},pickedUpAt:null,deliveredAt:null});
  const actual=await vi.importActual<typeof import("@/features/repairs-access/documents")>("@/features/repairs-access/documents");
  m.build.mockReturnValue(actual.buildRepairDocumentData({id,repairNumber:"REP-000513",intakeDate:"2026-10-01",issueReported:"No enciende",pickedUpAt:null,deliveredAt:null,workPerformed:null,warrantyConditions:null,customer:{fullName:"Cliente",phone:"3571544683"},device:{deviceType:"Televisor",brand:"Marca",model:"Modelo",serialNumber:"Serie",color:"Negro",accessoryDetails:"Control",visualCondition:"Bueno"}},"intake"));
  m.pdf.mockResolvedValue(Buffer.from("%PDF-test"));
  m.rpc.mockResolvedValue({data:{expiresAt:"2027-10-21T12:00:00.000Z"},error:null});
});
describe("admin manual receipt sharing",()=>{
  it("checks authorization and origin before reading any order",async()=>{
    expect((await post({},"https://evil.test")).status).toBe(403);expect(m.client).not.toHaveBeenCalled();
    expect((await post({},null)).status).toBe(403);
    m.auth.mockResolvedValue({role:"tecnico"});expect((await post()).status).toBe(403);expect(m.client).not.toHaveBeenCalled();
  });
  it("rejects invalid kinds and IDs without minting capabilities",async()=>{
    expect((await post({kind:"estimate"})).status).toBe(400);
    expect((await post({orderId:"REP-1"})).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled();
  });
  it("uses the routed Host when Next's internal URL differs and supports the native new-tab form",async()=>{
    const {POST}=await import("./route");
    const response=await POST(new Request("http://localhost:3001/api/repair-access/document-shares",{method:"POST",headers:{Host:"127.0.0.1:3001",Origin:"http://127.0.0.1:3001","Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({orderId:id,kind:"intake",intent:"send"})}));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).searchParams.get("text")).toContain("http://127.0.0.1:3001/api/comprobantes/");
  });
  it("creates a scoped snapshot, never stores its raw token and redirects to WhatsApp Web",async()=>{
    const response=await post();expect(response.status).toBe(303);
    const target=new URL(response.headers.get("Location")!);expect(target.origin).toBe("https://web.whatsapp.com");
    const shared=new URL(target.searchParams.get("text")!.match(/https:\/\/local\.test\/api\/comprobantes\/[a-f0-9]+/)![0]);
    const token=shared.pathname.split("/").at(-1)!;expect(token).toHaveLength(64);
    const args=m.rpc.mock.calls[0];expect(args[0]).toBe("issue_repair_document_link");
    expect(args[1].p_token_hash).not.toBe(token);expect(JSON.stringify(args)).not.toContain(token);
    expect(args[1].p_kind).toBe("intake");expect(args[1].p_order_id).toBe(id);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("does not share payment or warranty before a real pickup",async()=>{
    m.map.mockReturnValue({id,status:"retirado",customer:{phone:"3571544683"},pickedUpAt:null,deliveredAt:null});
    expect((await post({kind:"delivery"})).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled();
  });
  it("does not issue a link for an invalid phone or failed PDF",async()=>{
    m.map.mockReturnValue({id,customer:{phone:"123"}});expect((await post()).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled();
    m.map.mockReturnValue({id,repairNumber:"REP-1",customer:{phone:"3571544683",fullName:"Cliente"}});m.pdf.mockRejectedValue(new Error("private path"));
    const response=await post();expect(response.status).toBe(503);expect(await response.text()).not.toContain("private path");expect(m.rpc).not.toHaveBeenCalled();
  });
  it("does not issue a link that the reader's validation would reject",async()=>{
    const current=m.build.getMockImplementation()!();
    m.build.mockReturnValue({...current,client:{...current.client,fault:"x".repeat(30001)}});
    const response=await post();expect(response.status).toBe(409);expect(m.rpc).not.toHaveBeenCalled();expect(m.pdf).not.toHaveBeenCalled();
  });
  it("revokes only the selected document's links and never redirects or reads the order",async()=>{
    m.rpc.mockResolvedValue({data:2,error:null});const response=await post({kind:"delivery",intent:"revoke"});
    expect(response.status).toBe(200);expect(await response.json()).toEqual({revoked:2});
    expect(m.rpc).toHaveBeenCalledWith("revoke_repair_document_links",{p_order_id:id,p_kind:"delivery"});expect(m.query).not.toHaveBeenCalled();
  });
});
