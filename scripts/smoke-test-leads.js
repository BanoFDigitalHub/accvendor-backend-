process.env.NODE_ENV='test'; process.env.CLIENT_URL='http://localhost:3000'; process.env.SITE_URL='https://accvendor.vercel.app';
process.env.JWT_ACCESS_SECRET='a'; process.env.JWT_REFRESH_SECRET='b'; process.env.CREDENTIAL_URL_SECRET='c'; process.env.TOTP_SHARE_SECRET='d';
const { MongoMemoryServer } = require('mongodb-memory-server');
let fail=0; const ok=(c,l)=>{console.log(`  ${c?'✓':'✗ FAILED:'} ${l}`); if(!c)fail++;};
(async()=>{
  const mem=await MongoMemoryServer.create();
  process.env.MONGODB_URI=mem.getUri('leads_test'); process.env.MONGODB_DB_NAME='leads_test';
  const { connectDB }=require('../src/config/db'); await connectDB();
  const mongoose=require('mongoose');
  const User=require('../src/models/User');
  const { Lead }=require('../src/models/Lead');
  const { Notification }=require('../src/models/Notification');
  const svc=require('../src/services/lead.service');
  const { leadInterestSchema }=require('../src/validators/lead.validator');

  await User.create({ email:'admin@x.com', name:'Admin', passwordHash:'x', securityQuestion:'q', securityAnswerHash:'x', role:'admin' });

  ok(!leadInterestSchema.safeParse({program:'seller',name:'A',email:'a@b.com'}).success,'a one-character name is rejected');
  ok(!leadInterestSchema.safeParse({program:'seller',name:'Ali Raza',email:'nope'}).success,'a bad email is rejected');
  ok(!leadInterestSchema.safeParse({program:'nonsense',name:'Ali Raza',email:'a@b.com'}).success,'an unknown programme is rejected');
  ok(leadInterestSchema.safeParse({program:'seller',name:'Ali Raza',email:'Ali@Example.COM '}).data.email==='ali@example.com','the email is trimmed and lowercased');

  await svc.registerInterest({ program:'seller', name:'Ali Raza', email:'ali@example.com', phone:'+92 300 1234567', details:'Netflix accounts' });
  const repeat=await svc.registerInterest({ program:'seller', name:'Ali Raza', email:'ali@example.com', details:'Netflix and Spotify' });
  ok(repeat.alreadyOnList===true,'the same address asking again is a repeat, not a new row');
  ok((await Lead.countDocuments({program:'seller'}))===1,'still one seller row');

  await svc.registerInterest({ program:'affiliate', name:'Ali Raza', email:'ali@example.com', details:'Telegram group' });
  ok((await Lead.countDocuments())===2,'the same person may join a different programme');

  await svc.registerInterest({ program:'affiliate', name:'Sara K', email:'sara@example.com', phone:'0300-9999999' });

  const sellers=await svc.listLeads({ program:'seller' });
  ok(sellers.items.length===1 && sellers.counts.seller===1 && sellers.counts.affiliate===2,'the list is per programme and carries both counts');
  const searched=await svc.listLeads({ program:'affiliate', search:'sara' });
  ok(searched.items.length===1 && searched.items[0].email==='sara@example.com','search matches on name');
  ok((await svc.listLeads({ program:'affiliate', search:'0300' })).items.length===1,'and on phone');
  ok((await svc.listLeads({ program:'affiliate', search:'.*' })).items.length===0,'a regex typed into search is escaped, not executed');

  const { csv, count }=await svc.exportLeadsCsv({ program:'affiliate' });
  ok(count===2 && csv.startsWith('﻿"Name"'),'the CSV has a UTF-8 BOM so Excel reads it correctly');
  ok(csv.includes('"sara@example.com"') && csv.includes('"0300-9999999"'),'it carries email and phone');
  ok(csv.split('\r\n').filter(Boolean).length===3,'header plus one row per lead');

  await Lead.create({ program:'seller', name:'=cmd|calc', email:'evil@example.com' });
  const injected=(await svc.exportLeadsCsv({ program:'seller' })).csv;
  ok(injected.includes(`"'=cmd|calc"`),'a name starting with = is prefixed so Excel treats it as text, not a formula');

  const lead=await Lead.findOne({ email:'sara@example.com' });
  ok(!lead.contactedAt,'a new lead is not marked contacted');
  await svc.emailLead(lead._id, { subject:'Hello', message:'We are opening soon' }, { email:'admin@x.com' });
  ok((await Lead.findById(lead._id)).contactedAt instanceof Date,'emailing a lead marks them contacted');

  let threw=false;
  try { await svc.emailLead(new mongoose.Types.ObjectId(), { subject:'x', message:'y' }); } catch(e){ threw=e.statusCode===404; }
  ok(threw,'emailing a lead that does not exist is a 404, never a send');

  ok((await Notification.countDocuments({ audience:'admin', event:'lead:created' }))===4,'every submission notifies the admins in the panel');

  await mongoose.disconnect(); await mem.stop();
  console.log(fail===0?'\nall good':`\n${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
