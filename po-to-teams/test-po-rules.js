// Quick offline check of the PO-detection and customer-matching rules.
// Run: node po-to-teams/test-po-rules.js
const fs=require('fs');
global.Utilities={formatDate:(d,tz,f)=>{const x=new Date(d.getTime()+5.5*3600e3);return f==='yyyy'?String(x.getUTCFullYear()):f==='M'?String(x.getUTCMonth()+1):'x';}};
eval(fs.readFileSync(process.argv[2] || require("path").join(__dirname, "po-to-teams.gs"),'utf8')+';global.T={looksLikePo_,resolveCustomer_,financialYear_,safeName_,domainStem_,initials_,SKIP_RE};');
const L=T.looksLikePo_,R=T.resolveCustomer_,F=T.financialYear_,S=T.safeName_;
const subs=['Purchase Order','26271PO245','RE: HM 3060 & SM 3060 INSPECTION REROPRT-PO 7500002491-EIBC (Jayco make)-Dispatch clearance','Request for Quotation','DEBIT NOTE','PO No. 4500123','Tax Invoice 123','Work Order - Plummer block','Fwd: PO copy','Re: Quotation for SN 516','PURCHASE_ORDER.rpt.pdf','1812.pdf','Amended PO 22'];
subs.forEach(s=>console.log(L(s)?'PO  ':'--  ',s));
const folders=['Shyam SEL & Power Limited','Merit BMH Engineering Private Limited','National Engineering Industries Limited (NBC)','Baroda Bearing Centre','Athani Sugars Ltd','VBTPL','JB Rolling Mills Pvt Ltd'].sort((a,b)=>b.length-a.length);
[['x@meritbmh.com'],['a@shyamsel.com'],['p@nbcbearings.com'],['q@vbtpl.co.in'],['z@gmail.com','Ramesh Traders'],['v@gallantt.com'],['k@mail.athanisugars.co.in'],['r@eibc.in']].forEach(([e,n])=>{const d=e.split('@')[1];console.log(e,'=>',JSON.stringify(R({email:e,name:n||'',domain:d},{'eibc.in':'EIBC Ahmedabad'},folders)));});
console.log(F(new Date("2026-11-06")),F(new Date('2027-03-31T10:00:00Z')),F(new Date('2027-04-01T10:00:00Z')));
console.log(S('V & T Enterprise - 04.11.2026 - PO:12/3?.pdf'));
