#!/usr/bin/env node

require('dotenv').config({ path: '.env' });

const { PrismaClient } = require('@prisma/client');
const { createHash, randomBytes } = require('crypto');

const prisma = new PrismaClient();

function hashPat(token) {
  // Canonical plugin lookup hash (indexed, deterministic).
  return createHash('sha256').update(token).digest('hex');
}

async function main() {
  const email = process.env.FIDUX_DEV_EMAIL || 'fidux-dev@example.com';
  const orgName = process.env.FIDUX_DEV_ORG_NAME || 'Fidux Dev Org';
  const projectName = process.env.FIDUX_DEV_PROJECT_NAME || 'Fidux Dev Project';

  const user = await prisma.user.upsert({
    where: { email },
    update: { name: 'Fidux Dev User' },
    create: { email, name: 'Fidux Dev User' },
  });

  let org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: orgName } });
  }

  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    update: { role: 'ORG_OWNER' },
    create: { orgId: org.id, userId: user.id, role: 'ORG_OWNER' },
  });

  let project = await prisma.project.findFirst({ where: { orgId: org.id, name: projectName } });
  if (!project) {
    project = await prisma.project.create({ data: { orgId: org.id, name: projectName } });
  }

  await prisma.projectMembership.upsert({
    where: { projectId_userId: { projectId: project.id, userId: user.id } },
    update: { role: 'PROJECT_MEMBER' },
    create: { projectId: project.id, userId: user.id, role: 'PROJECT_MEMBER' },
  });

  const token = `fidux_pat_${randomBytes(18).toString('hex')}`;
  const tokenSalt = randomBytes(16).toString('hex');
  const tokenHash = hashPat(token);

  const pat = await prisma.personalAccessToken.create({
    data: {
      orgId: org.id,
      userId: user.id,
      name: 'fidux-dev-plugin-token',
      tokenHash,
      tokenSalt,
      scopes: ['plugin:read_projects', 'plugin:write_issues'],
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(JSON.stringify({
    apiBase: process.env.FIDUX_API_BASE || 'http://localhost:3002/api/plugin',
    userId: user.id,
    orgId: org.id,
    projectId: project.id,
    patId: pat.id,
    patToken: token,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
