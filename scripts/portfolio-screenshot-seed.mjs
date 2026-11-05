// One-off screenshot seed. Uses exclusively the isolated CI PostgreSQL database.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

if (!process.env.DATABASE_URL?.includes("crm_screenshot_test")) {
  throw new Error("Safety stop: only crm_screenshot_test database is accepted.");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const pipeline = await prisma.pipeline.findFirstOrThrow({
    where: { isDefault: true },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  const companies = [];
  for (const name of ["Beispiel Nord GmbH", "Musterwerk Digital GmbH", "Demo Campus AG", "Beispiel Handel GmbH"]) {
    companies.push(await prisma.company.create({ data: { name, city: "Musterstadt", source: "WEBSITE" } }));
  }
  const leadTitles = [
    "Website-Relaunch", "CRM-Schnittstelle", "Digitales Kundenportal", "Automatisierte Berichte",
    "Terminverwaltung", "API-Integration", "Prozessoptimierung", "Service-Dashboard"
  ];
  const leads = [];
  for (let i = 0; i < leadTitles.length; i++) {
    leads.push(await prisma.lead.create({ data: {
      title: leadTitles[i],
      companyId: companies[i % companies.length].id,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[Math.min(i % 6, pipeline.stages.length - 1)].id,
      source: "WEBSITE",
      status: "OPEN",
      priority: i % 3 === 0 ? "HIGH" : "NORMAL",
      expectedValueCents: (450000 + i * 175000),
      assignedUserId: owner.id
    } }));
  }
  const deals = [];
  for (let i = 0; i < 5; i++) {
    deals.push(await prisma.deal.create({ data: {
      name: ["Software-Modernisierung", "Kundenportal Phase 1", "Automatisierte Abläufe", "Berichtsplattform", "API-Anbindung"][i],
      companyId: companies[i % companies.length].id,
      service: "CUSTOM_SOFTWARE",
      valueCents: (580000 + i * 225000),
      probability: 40 + i * 10,
      assignedUserId: owner.id,
      status: "OPEN"
    } }));
  }
  const tasks = [
    "Angebot für Kundenportal vorbereiten", "Rückmeldung zur API-Anbindung", "Technisches Konzept abstimmen",
    "Datenmodell prüfen", "Testbericht aktualisieren", "Schnittstellen-Dokumentation"
  ];
  const now = Date.now();
  for (let i = 0; i < tasks.length; i++) {
    await prisma.task.create({data:{
      title:tasks[i], assignedUserId:owner.id, createdById:owner.id,
      priority: i===0 ? "HIGH":"NORMAL", status: i===2 ? "IN_PROGRESS":"OPEN",
      dueAt: new Date(now + (i<3 ? (i+1)*60*60*1000 : (i+1)*24*60*60*1000))
    }});
  }
  await prisma.calendarEvent.create({data:{
    title:"Projektabstimmung (Beispieldaten)",startsAt:new Date(now+2*60*60*1000),
    endsAt:new Date(now+3*60*60*1000),assignedUserId:owner.id,createdById:owner.id
  }});
  const types = ["COMPANY_CREATED","LEAD_CREATED","DEAL_CREATED","LEAD_STAGE_CHANGED","TASK_CREATED"];
  for (let i=0; i<types.length;i++) {
    const data={ type: types[i], userId:owner.id, createdAt:new Date(now - i*60*60*1000) };
    if(i===0) data.companyId=companies[0].id;
    else if(i===1 || i===3) data.leadId=leads[i].id;
    else if(i===2) data.dealId=deals[0].id;
    await prisma.activity.create({data});
  }
  console.log("Created only fictional demonstration records:", {
    companies: companies.length, leads: leads.length, deals: deals.length, tasks: tasks.length
  });
} finally {
  await prisma.$disconnect();
}
