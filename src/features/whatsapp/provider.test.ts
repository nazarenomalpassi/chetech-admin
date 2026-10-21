import { afterEach,describe,expect,it,vi } from "vitest";
import { sendDocument,verifyProvider } from "./provider";
const config={token:"synthetic",phoneId:"123",businessId:"456",version:"v25.0",appSecret:"secret",verifyToken:"verify",workerSecret:"worker",language:"es_AR",intakeTemplate:"intake",deliveryTemplate:"delivery"};
const job={id:"00000000-0000-4000-8000-000000000001",order_id:"order",kind:"intake" as const,lease_token:"lease",recipient:"5493571544683",media_id:null,created_at:"2026-10-21",snapshot:{repair_number:"REP-000001",repair_access_customers:{full_name:"Ejemplo"}}};
afterEach(()=>vi.unstubAllGlobals());
describe("Meta rejection handling",()=>{
  it("retries explicit transient rejections even when Meta uses HTTP 400",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:{code:131000,is_transient:true}},{status:400})));
    await expect(sendDocument(config,job,"media","receipt.pdf")).rejects.toMatchObject({disposition:"retry",code:"meta_131000"});
  });
  it("does not retry an ambiguous server error or a missing acknowledgement",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:{code:1,is_transient:true}},{status:502})));
    await expect(sendDocument(config,job,"media","receipt.pdf")).rejects.toMatchObject({disposition:"uncertain"});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({success:true})));
    await expect(sendDocument(config,job,"media","receipt.pdf")).rejects.toMatchObject({disposition:"uncertain"});
  });
  it("requires the local business number and both approved document templates",async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({id:"123",display_phone_number:"+54 9 3571 544683",code_verification_status:"VERIFIED"}));
    for(const name of ["intake","delivery"])fetch.mockResolvedValueOnce(Response.json({data:[{name,status:"APPROVED",language:"es_AR",category:"UTILITY",components:[{type:"HEADER",format:"DOCUMENT"},{type:"BODY",text:"Hola {{1}}, orden {{2}}"}]}]}));
    vi.stubGlobal("fetch",fetch);
    await expect(verifyProvider(config)).resolves.toMatchObject({phoneVerified:true,templatesApproved:true});
  });
});
