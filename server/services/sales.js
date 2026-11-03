'use strict';
const { q, tx, getSetting } = require('../lib/db');
const { httpError, normPhone, validEmail, clean, nowIso, today, nowHM, addDays, isDate, isTime, toInt, truthy, normReg, validReg, maskReg } = require('../lib/util');
const leads = require('./leads');
const messaging = require('./messaging');

function listShowrooms() {
  return q.all("SELECT id,slug,name_en,name_hi,address_en,address_hi,phone,lat,lng,hours FROM showrooms WHERE active = 1 AND kind = 'showroom' ORDER BY id");
}
function listYard() {
  return q.get("SELECT id,slug,name_en,name_hi,address_en,address_hi,phone,lat,lng,hours FROM showrooms WHERE active = 1 AND kind = 'yard' ORDER BY id LIMIT 1") || null;
}
function listWorkshops() {
  return q.all('SELECT id,slug,name_en,name_hi,address_en,address_hi,phone,lat,lng,hours,bays FROM workshops WHERE active = 1 ORDER BY id');
}

function slotTimes(key, def) { return String(getSetting(key, def)).split(',').map(s => s.trim()).filter(isTime); }
function checkDate(date) {
  if (!isDate(date)) throw httpError(400, 'date must be YYYY-MM-DD', { date: 'Invalid date' });
  if (date < today()) throw httpError(422, 'Choose today or a future date', { date: 'Date is in the past' });
  if (date > addDays(today(), 60)) throw httpError(422, 'Bookings open up to 60 days ahead', { date: 'Too far ahead' });
}
function slotInPast(date, time) { return date === today() && time <= nowHM(); }

function listTestDriveSlots({ showroomId, modelId, date } = {}) {
  showroomId = toInt(showroomId); modelId = toInt(modelId);
  if (!isDate(date)) throw httpError(400, 'date must be YYYY-MM-DD');
  const cars = q.all('SELECT id FROM demo_cars WHERE showroom_id = ? AND model_id = ? AND active = 1 ORDER BY id', showroomId, modelId);
  const taken = q.all("SELECT demo_car_id, time FROM bookings WHERE type='test_drive' AND date = ? AND status NOT IN ('cancelled','no_show') AND demo_car_id IN (SELECT id FROM demo_cars WHERE showroom_id = ? AND model_id = ?)", date, showroomId, modelId);
  const inRange = date >= today() && date <= addDays(today(), 60);
  return slotTimes('td_slots', '10:00,11:00,12:00,14:00,15:00,16:00,17:00').map(time => {
    const free = cars.find(c => !taken.some(t => t.demo_car_id === c.id && t.time === time));
    const ok = !!free && inRange && !slotInPast(date, time);
    return { time, available: ok, demoCarId: ok ? free.id : null };
  });
}

function validatePerson(d, errors) {
  const name = clean(d.name, 80);
  if (name.length < 2) errors.name = 'Name must be 2-80 characters';
  const phone = normPhone(d.phone);
  if (!phone) errors.phone = 'Enter a valid 10-digit Indian mobile number';
  if (d.email && !validEmail(String(d.email))) errors.email = 'Enter a valid email';
  if (!truthy(d.consent)) errors.consent = 'Consent is required to contact you';
  return { name, phone };
}

function isUniqueErr(e) { return /UNIQUE constraint/i.test(String(e && e.message)); }

function createTestDrive(d, opts = {}) {
  const errors = {};
  const { name, phone } = validatePerson(d, errors);
  const showroomId = toInt(d.showroomId), modelId = toInt(d.modelId);
  if (!isDate(d.date)) errors.date = 'Invalid date'; if (!isTime(d.time)) errors.time = 'Invalid time';
  if (Object.keys(errors).length) throw httpError(422, 'Please correct the highlighted fields', errors);
  checkDate(d.date);
  if (!slotTimes('td_slots', '10:00,11:00,12:00,14:00,15:00,16:00,17:00').includes(d.time)) throw httpError(422, 'Not a valid slot time', { time: 'Not a valid slot' });
  if (slotInPast(d.date, d.time)) throw httpError(422, 'That slot has already passed', { time: 'Slot passed' });
  const show = q.get("SELECT * FROM showrooms WHERE id = ? AND active = 1 AND kind = 'showroom'", showroomId);
  const model = q.get('SELECT * FROM models WHERE id = ? AND active = 1', modelId);
  if (!show) throw httpError(422, 'Unknown showroom', { showroomId: 'Unknown showroom' });
  if (!model) throw httpError(422, 'Unknown model', { modelId: 'Unknown model' });
  const variantId = toInt(d.variantId, 0) || null;
  let res, bookingId;
  try {
    tx(() => {
      const cars = q.all('SELECT id FROM demo_cars WHERE showroom_id = ? AND model_id = ? AND active = 1 ORDER BY id', showroomId, modelId);
      const car = cars.find(c => !q.get("SELECT 1 x FROM bookings WHERE demo_car_id = ? AND date = ? AND time = ? AND type='test_drive' AND status NOT IN ('cancelled','no_show')", c.id, d.date, d.time));
      if (!car) throw httpError(409, 'This slot is no longer available. Please pick another time.');
      res = leads.insertLead({ source: 'test_drive', type: 'test_drive', name, phone, email: d.email, showroomId, modelId, variantId, message: `Test drive requested for ${d.date} ${d.time}`, consent: true, lang: d.lang }, { ip: opts.ip });
      const now = nowIso();
      const r = q.run(`INSERT INTO bookings(type,lead_id,name,phone,email,showroom_id,model_id,variant_id,demo_car_id,date,time,status,created_at,updated_at)
                       VALUES ('test_drive',?,?,?,?,?,?,?,?,?,?,'booked',?,?)`, res.id, name, phone, d.email ? clean(d.email, 120) : null, showroomId, modelId, variantId, car.id, d.date, d.time, now, now);
      bookingId = Number(r.lastInsertRowid);
      leads.addEvent(res.id, 'booking', `Test drive booked ${d.date} ${d.time}`);
    });
  } catch (e) {
    if (isUniqueErr(e)) throw httpError(409, 'This slot is no longer available. Please pick another time.');
    throw e;
  }
  leads.afterCreate(res);
  messaging.sendTemplate({ leadId: res.id, phone, template: 'test_drive_confirm', lang: res.lang, vars: { name: name.split(' ')[0], model: model.name, place: show.name_en, date: d.date, time: d.time } });
  const booking = { id: bookingId, ref: 'TD-' + String(bookingId).padStart(5, '0'), type: 'test_drive', date: d.date, time: d.time, status: 'booked',
    showroom: { id: show.id, name_en: show.name_en, name_hi: show.name_hi, address_en: show.address_en, phone: show.phone }, model: { id: model.id, name: model.name } };
  return { booking, lead: q.get('SELECT id, source, type, status, created_at, due_at FROM leads WHERE id = ?', res.id), assignee: res.assignee ? { name: res.assignee.name, phone: res.assignee.phone } : null };
}

function listServiceSlots({ workshopId, date } = {}) {
  workshopId = toInt(workshopId);
  if (!isDate(date)) throw httpError(400, 'date must be YYYY-MM-DD');
  const w = q.get('SELECT bays FROM workshops WHERE id = ? AND active = 1', workshopId);
  if (!w) throw httpError(404, 'Workshop not found');
  const used = Object.fromEntries(q.all("SELECT time, COUNT(*) c FROM bookings WHERE type='service' AND workshop_id = ? AND date = ? AND status NOT IN ('cancelled','no_show') GROUP BY time", workshopId, date).map(r => [r.time, r.c]));
  const inRange = date >= today() && date <= addDays(today(), 60);
  return slotTimes('svc_slots', '09:00,10:00,11:00,12:00,14:00,15:00,16:00').map(time => {
    const remaining = inRange && !slotInPast(date, time) ? Math.max(0, w.bays - (used[time] || 0)) : 0;
    return { time, capacity: w.bays, remaining };
  });
}

const SERVICE_TYPES = ['periodic', 'repair', 'general_check', 'ac_service', 'tyres_brakes', 'bodyshop', 'accident', 'other'];

function createServiceBooking(d, opts = {}) {
  const errors = {};
  const { name, phone } = validatePerson(d, errors);
  if (!validReg(d.regNo)) errors.regNo = 'Enter a valid registration number, e.g. UP32AB1234';
  if (!isDate(d.date)) errors.date = 'Invalid date'; if (!isTime(d.time)) errors.time = 'Invalid time';
  const serviceType = d.serviceType ? String(d.serviceType) : 'periodic';
  if (!SERVICE_TYPES.includes(serviceType)) errors.serviceType = 'Unknown service type';
  if (Object.keys(errors).length) throw httpError(422, 'Please correct the highlighted fields', errors);
  checkDate(d.date);
  if (!slotTimes('svc_slots', '09:00,10:00,11:00,12:00,14:00,15:00,16:00').includes(d.time)) throw httpError(422, 'Not a valid slot time', { time: 'Not a valid slot' });
  if (slotInPast(d.date, d.time)) throw httpError(422, 'That slot has already passed', { time: 'Slot passed' });
  const w = q.get('SELECT * FROM workshops WHERE id = ? AND active = 1', toInt(d.workshopId));
  if (!w) throw httpError(422, 'Unknown workshop', { workshopId: 'Unknown workshop' });
  const lang = d.lang === 'hi' ? 'hi' : 'en';
  const reg = normReg(d.regNo);
  const id = tx(() => {
    const n = q.get("SELECT COUNT(*) c FROM bookings WHERE type='service' AND workshop_id = ? AND date = ? AND time = ? AND status NOT IN ('cancelled','no_show')", w.id, d.date, d.time).c;
    if (n >= w.bays) throw httpError(409, 'All service bays are booked for this slot. Please choose another time.');
    const now = nowIso();
    const r = q.run(`INSERT INTO bookings(type,name,phone,email,workshop_id,date,time,service_type,pickup_drop,reg_no,model_name,notes,status,created_at,updated_at)
                     VALUES ('service',?,?,?,?,?,?,?,?,?,?,?,'booked',?,?)`, name, phone, d.email ? clean(d.email, 120) : null, w.id, d.date, d.time, serviceType, truthy(d.pickupDrop) ? 1 : 0,
      reg, clean(d.model, 60) || null, clean(d.notes, 500) || null, now, now);
    leads.recordConsent(phone, null, lang, opts.ip, 'service', undefined);
    return Number(r.lastInsertRowid);
  });
  messaging.sendTemplate({ phone, template: 'service_confirm', lang, vars: { name: name.split(' ')[0], place: w.name_en, date: d.date, time: d.time } });
  return { booking: { id, ref: 'SV-' + String(id).padStart(5, '0'), type: 'service', date: d.date, time: d.time, status: 'booked', service_type: serviceType, pickup_drop: truthy(d.pickupDrop),
    reg_masked: maskReg(reg), workshop: { id: w.id, name_en: w.name_en, name_hi: w.name_hi, address_en: w.address_en, phone: w.phone } } };
}

/** Staff: list bookings. Consultants see test drives at their showroom, service advisors see service only. */
function listBookings(user, f = {}) {
  const where = [], p = [];
  let type = f.type;
  if (user.role === 'service_advisor') type = 'service';
  else if (user.role === 'consultant') { type = 'test_drive'; where.push('b.showroom_id = ?'); p.push(user.showroom_id); }
  else if (user.role === 'used_manager') throw httpError(403, 'Not permitted for your role');
  if (type) { where.push('b.type = ?'); p.push(type); }
  if (f.date) { where.push('b.date = ?'); p.push(String(f.date)); }
  if (f.status) { where.push('b.status = ?'); p.push(String(f.status)); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return q.all(`SELECT b.*, s.name_en AS showroom_name, w.name_en AS workshop_name, m.name AS model_name_ref FROM bookings b
    LEFT JOIN showrooms s ON s.id = b.showroom_id LEFT JOIN workshops w ON w.id = b.workshop_id LEFT JOIN models m ON m.id = b.model_id
    ${w} ORDER BY b.date DESC, b.time DESC LIMIT 300`, ...p);
}
const BOOKING_STATUS = ['booked', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
function updateBooking(user, id, body) {
  const b = q.get('SELECT * FROM bookings WHERE id = ?', toInt(id));
  if (!b) throw httpError(404, 'Booking not found');
  if (user.role === 'service_advisor' && b.type !== 'service') throw httpError(403, 'Not permitted');
  if (user.role === 'consultant' && (b.type !== 'test_drive' || b.showroom_id !== user.showroom_id)) throw httpError(403, 'Not permitted');
  if (!BOOKING_STATUS.includes(body.status)) throw httpError(422, 'Invalid status', { status: 'Invalid status' });
  q.run('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?', body.status, nowIso(), b.id);
  return q.get('SELECT * FROM bookings WHERE id = ?', b.id);
}

module.exports = {
  listShowrooms, listWorkshops, listYard, listTestDriveSlots, createTestDrive, listServiceSlots, createServiceBooking,
  createLead: leads.createLead, optOut: leads.optOut, listBookings, updateBooking, SERVICE_TYPES,
};
