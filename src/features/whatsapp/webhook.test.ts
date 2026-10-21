import { describe,expect,it } from "vitest";
import { parseMetaEvents } from "./webhook";
const job="00000000-0000-4000-8000-000000000357";
function body(value: object) { return {object:"whatsapp_business_account",entry:[{id:"business",changes:[{field:"messages",value:{metadata:{phone_number_id:"phone"},...value}}]}]}; }
describe("signed webhook event selection",()=>{
  it("correlates a Meta status to the document job and correct business number",()=>{
    const payload=body({statuses:[{id:"wamid.test",status:"delivered",recipient_id:"543571544683",timestamp:"1792600000",biz_opaque_callback_data:job}]});
    expect(parseMetaEvents(payload,"business","phone").statuses).toEqual([{messageId:"wamid.test",jobId:job,status:"delivered",recipient:"5493571544683",timestamp:expect.any(String),error:null}]);
    expect(parseMetaEvents(payload,"other-business","phone").statuses).toHaveLength(0);
    expect(parseMetaEvents(payload,"business","other-phone").statuses).toHaveLength(0);
  });
  it("stores only explicit opt-outs and ignores normal customer conversations",()=>{
    const payload=body({messages:[{type:"text",from:"5493571544683",text:{body:" BAJA "}},{type:"text",from:"5493571123456",text:{body:"Quiero consultar el presupuesto"}}]});
    expect(parseMetaEvents(payload,"business","phone")).toEqual({statuses:[],optouts:["5493571544683"]});
  });
});
