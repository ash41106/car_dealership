'use strict';
/** Permission-based RBAC. Roles/permissions live in DB tables (role_permissions); this file holds the catalogue and the seeded matrix. */
const { q } = require('./db');

const PERMS = {
  'lead.read.own': 'See leads assigned to me and my showroom',
  'lead.read.showroom': 'See all leads of my showroom',
  'lead.read.all': 'See leads of all showrooms',
  'lead.read.used': 'See used-car / trade-in leads',
  'lead.update': 'Change lead status and notes',
  'lead.reassign': 'Assign / reassign leads (within scope)',
  'lead.reply': 'Send replies to leads',
  'lead.import': 'Import portal CSV leads',
  'lead.stats': 'See lead and SLA statistics (own scope)',
  'lead.ai': 'Regenerate AI lead summary / draft',
  'sla.monitor': 'Live SLA monitor',
  'booking.read.showroom': 'Test-drive bookings of my showroom',
  'booking.read.workshop': 'Service bookings of my workshop',
  'booking.read.all': 'All bookings',
  'booking.update': 'Update booking / job-card status',
  'callback.read': 'See service call-back queue',
  'callback.update': 'Work service call-backs',
  'workshop.manage': 'Manage my workshop (bays, advisors)',
  'used.read': 'See used stock admin data',
  'used.write': 'Create / edit used stock and past sales',
  'used.price_suggestion': 'See AI used-car price band',
  'content.models': 'Edit model copy',
  'content.offers': 'Edit offers',
  'content.banners': 'Edit banners',
  'prices.write': 'Edit variants and price rules',
  'config.write': 'Edit cities, showrooms, workshops, demo cars',
  'admin.read': 'Read configuration tables',
  'users.read': 'Read users', 'users.manage': 'Create / edit users', 'users.reset_password': 'Reset user passwords',
  'roles.read': 'Read the role matrix', 'roles.manage': 'Edit role permissions',
  'dashboard.read': 'Admin dashboard', 'settings.read': 'Read settings', 'settings.write': 'Edit settings',
  'audit.read': 'Full audit log', 'audit.read.used': 'Used-stock audit entries',
  'export.dms': 'DMS CSV export', 'upload': 'Upload images', 'exec.read': 'Executive summary and trends',
  'datareq.manage': 'Handle customer data requests',
  'customer.self': 'Customer self-service',
};

const MATRIX = {
  customer: { label: 'Customer', perms: ['customer.self'] },
  consultant: { label: 'Sales consultant', perms: ['lead.read.own', 'lead.update', 'lead.reassign', 'lead.reply', 'lead.stats', 'lead.ai', 'booking.read.showroom', 'booking.update'] },
  lead_desk: { label: 'Lead desk', perms: ['lead.read.all', 'lead.update', 'lead.reassign', 'lead.reply', 'lead.import', 'lead.stats', 'lead.ai', 'sla.monitor'] },
  showroom_manager: { label: 'Showroom manager', perms: ['lead.read.showroom', 'lead.update', 'lead.reassign', 'lead.reply', 'lead.stats', 'lead.ai', 'sla.monitor', 'booking.read.showroom', 'booking.update'] },
  service_advisor: { label: 'Service advisor', perms: ['booking.read.workshop', 'booking.update', 'callback.read', 'callback.update'] },
  workshop_manager: { label: 'Workshop manager', perms: ['booking.read.workshop', 'booking.update', 'callback.read', 'callback.update', 'workshop.manage'] },
  used_manager: { label: 'Used-car manager', perms: ['lead.read.used', 'lead.update', 'lead.reply', 'lead.stats', 'lead.ai', 'used.read', 'used.write', 'used.price_suggestion', 'upload', 'audit.read.used'] },
  content_editor: { label: 'Content editor', perms: ['content.models', 'content.offers', 'content.banners', 'upload'] },
  dealer_principal: { label: 'Dealer principal (read-only)', perms: ['lead.read.all', 'lead.stats', 'sla.monitor', 'booking.read.all', 'callback.read', 'used.read', 'admin.read', 'users.read', 'roles.read', 'dashboard.read', 'settings.read', 'audit.read', 'export.dms', 'exec.read'] },
  admin: { label: 'Administrator', perms: Object.keys(PERMS).filter(p => p !== 'customer.self') },
};

const cache = new Map();
function clear() { cache.clear(); }

/** Create missing roles with their default permissions; admin always has every permission (anti-lockout). Admin edits to existing roles persist. */
function ensure() {
  clear();
  for (const [name, def] of Object.entries(MATRIX)) {
    if (!q.get('SELECT 1 x FROM roles WHERE name = ?', name)) {
      q.run('INSERT INTO roles(name,label) VALUES (?,?)', name, def.label);
      for (const p of def.perms) q.run('INSERT OR IGNORE INTO role_permissions(role,perm) VALUES (?,?)', name, p);
    }
  }
  for (const p of MATRIX.admin.perms) q.run('INSERT OR IGNORE INTO role_permissions(role,perm) VALUES (?,?)', 'admin', p);
}

function permsOf(role) {
  let s = cache.get(role);
  if (!s) { s = new Set(q.all('SELECT perm FROM role_permissions WHERE role = ?', role).map(r => r.perm)); cache.set(role, s); }
  return s;
}
/** can(actor, 'perm') or can(actor, ['any','of']) */
function can(actor, perm) {
  if (!actor || !actor.role) return false;
  const s = permsOf(actor.role);
  return Array.isArray(perm) ? perm.some(p => s.has(p)) : s.has(perm);
}
function listRoles() {
  return q.all('SELECT name, label FROM roles ORDER BY rowid').map(r => ({ ...r, permissions: [...permsOf(r.name)].sort() }));
}
function setRolePerms(role, list) {
  q.run('DELETE FROM role_permissions WHERE role = ?', role);
  for (const p of list) q.run('INSERT INTO role_permissions(role,perm) VALUES (?,?)', role, p);
  clear();
}
function roleNames() { return q.all('SELECT name FROM roles').map(r => r.name); }

module.exports = { PERMS, MATRIX, ensure, can, permsOf, listRoles, setRolePerms, roleNames, clear };
