'use strict';
/* Idempotent seed: `npm run seed` (use `--reset` to wipe the DB first). All prices/rates live in the DB tables created here. */
const fs = require('node:fs');
const db = require('./lib/db');
const auth = require('./lib/auth');
const { hashPassword } = auth;
const perms = require('./lib/perms');
const { nowIso, today, addDays, slugify } = require('./lib/util');
const { makeSlug, photoFor } = require('./services/used');

let seedN = 42;
const rnd = () => { seedN = (seedN * 1664525 + 1013904223) % 4294967296; return seedN / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const J = JSON.stringify;

/** Reference data needed by every deployment: settings, showrooms, workshops, cities (no catalog, users or demo data). */
function reference(q, now) {
  // ---- settings
  for (const [k, v] of Object.entries({ emi_rate: '9.5', emi_months: '60', emi_down_pct: '20', td_slots: '10:00,11:00,12:00,14:00,15:00,16:00,17:00', svc_slots: '09:00,10:00,11:00,12:00,14:00,15:00,16:00',
    site_stats: J({ new_cars_per_year: 6000, used_cars_per_year: 900 }),
    contact: J({ phone: '0522 4001001', whatsapp: '919810000001', email: 'hello@companya.in', hours: 'Mon-Sat 9:30-19:30, Sun 10:00-17:00', city: 'Lucknow' }) }))
    q.run('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)', k, v);

  // ---- locations
  const SR = [
    ['gomti-nagar', 'showroom', 'Company A Motors - Gomti Nagar', 'कंपनी ए मोटर्स - गोमती नगर', 'Vibhuti Khand, Gomti Nagar, Lucknow 226010', 'विभूति खंड, गोमती नगर, लखनऊ 226010', '0522 4001001', 26.8530, 81.0100, 1],
    ['aliganj', 'showroom', 'Company A Motors - Aliganj', 'कंपनी ए मोटर्स - अलीगंज', 'Sector H, Aliganj, Lucknow 226024', 'सेक्टर एच, अलीगंज, लखनऊ 226024', '0522 4001002', 26.8940, 80.9480, 0],
    ['alambagh', 'showroom', 'Company A Motors - Alambagh (Kanpur Road)', 'कंपनी ए मोटर्स - आलमबाग (कानपुर रोड)', 'Kanpur Road, Alambagh, Lucknow 226005', 'कानपुर रोड, आलमबाग, लखनऊ 226005', '0522 4001003', 26.8100, 80.9000, 0],
    ['faizabad-road-yard', 'yard', 'Company A Certified Used Cars - Faizabad Road', 'कंपनी ए सर्टिफाइड यूज़्ड कार - फैज़ाबाद रोड', 'Faizabad Road, Lucknow 226028', 'फैज़ाबाद रोड, लखनऊ 226028', '0522 4001004', 26.8800, 81.0300, 0],
  ];
  for (const s of SR) q.run('INSERT INTO showrooms(slug,kind,name_en,name_hi,address_en,address_hi,phone,lat,lng,hours,is_default) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ...s.slice(0, 9), 'Mon-Sat 9:30-19:30, Sun 10:00-17:00', s[9]);
  const WS = [
    ['amausi', 'Company A Service - Amausi', 'कंपनी ए सर्विस - अमौसी', 'Amausi Industrial Area, Lucknow 226009', 'अमौसी औद्योगिक क्षेत्र, लखनऊ 226009', '0522 4002001', 26.7640, 80.8830, 6],
    ['gomti-nagar-extension', 'Company A Service - Gomti Nagar Extension', 'कंपनी ए सर्विस - गोमती नगर एक्सटेंशन', 'Sector 4, Gomti Nagar Extension, Lucknow 226010', 'सेक्टर 4, गोमती नगर एक्सटेंशन, लखनऊ 226010', '0522 4002002', 26.8350, 81.0350, 4],
  ];
  for (const w of WS) q.run('INSERT INTO workshops(slug,name_en,name_hi,address_en,address_hi,phone,lat,lng,bays,hours) VALUES (?,?,?,?,?,?,?,?,?,?)', ...w, 'Mon-Sat 8:30-18:00');
  const sid = Object.fromEntries(q.all('SELECT id, slug FROM showrooms').map(r => [r.slug, r.id]));

  const CITIES = [['lucknow', 'Lucknow', 'लखनऊ', 'gomti-nagar'], ['kanpur', 'Kanpur', 'कानपुर', 'alambagh'], ['varanasi', 'Varanasi', 'वाराणसी', 'gomti-nagar'],
    ['prayagraj', 'Prayagraj', 'प्रयागराज', 'gomti-nagar'], ['gorakhpur', 'Gorakhpur', 'गोरखपुर', 'aliganj'], ['delhi-ncr', 'Delhi NCR', 'दिल्ली एनसीआर', 'gomti-nagar']];
  CITIES.forEach((c, i) => q.run('INSERT INTO cities(slug,name_en,name_hi,default_showroom_id,sort) VALUES (?,?,?,?,?)', c[0], c[1], c[2], sid[c[3]], i));
  const cid = Object.fromEntries(q.all('SELECT id, slug FROM cities').map(r => [r.slug, r.id]));
  return { sid, cid };
}

const NOTES_HI = { 'Minor wear, monitor': 'हल्की घिसावट, निगरानी रखें', 'Due at next service': 'अगली सर्विस पर देय', 'Cosmetic mark': 'ऊपरी निशान', 'Slight noise, recommended check': 'हल्की आवाज़, जांच की सलाह' };
const noteOf = en => ({ note: en, note_en: en, note_hi: NOTES_HI[en] || en });
const LOCATION_HI = { 'Faizabad Road Used Car Yard, Lucknow': 'फैज़ाबाद रोड यूज़्ड कार यार्ड, लखनऊ' };

function seed() {
  const { q, tx } = db;
  db.open();
  perms.ensure();
  if (q.get('SELECT 1 x FROM models LIMIT 1')) { fixups(); return { skipped: true }; }
  const leads = require('./services/leads');
  tx(() => {
    const now = nowIso();
    const { sid, cid } = reference(q, now);

    // ---- models & variants
    const COL = {
      h: [['Pearl White', 'मोती सफेद', 'f4f4f2'], ['Flame Red', 'फ्लेम रेड', 'b3122d'], ['Steel Grey', 'स्टील ग्रे', '6b6f75'], ['Ocean Blue', 'ओशन ब्लू', '1f4e8c']],
      c: [['Pearl White', 'मोती सफेद', 'f4f4f2'], ['Midnight Black', 'मिडनाइट ब्लैक', '16171a'], ['Titanium Silver', 'टाइटेनियम सिल्वर', 'b9bcc1'], ['Ruby Red', 'रूबी रेड', 'a3142b']],
      s: [['Glacier White', 'ग्लेशियर व्हाइट', 'f1f1ef'], ['Forest Green', 'फॉरेस्ट ग्रीन', '2f4a3a'], ['Graphite', 'ग्रेफाइट', '3b3e43'], ['Sunset Orange', 'सनसेट ऑरेंज', 'd2691e']],
      v: [['Silver Mist', 'सिल्वर मिस्ट', 'c4c7cb'], ['Deep Blue', 'डीप ब्लू', '1b3358'], ['Pearl White', 'मोती सफेद', 'f4f4f2'], ['Carbon Black', 'कार्बन ब्लैक', '18191c']],
    };
    const MODELS = [
      ['h', 'Model H', 'hatchback', 'Smart, nimble city hatchback', 'स्मार्ट और फुर्तीली सिटी हैचबैक', 18500, 1, 'A feature-rich hatchback built for tight lanes and daily commutes, with class-leading efficiency.', 'तंग गलियों और रोज़ाना के सफर के लिए बनी फीचर-समृद्ध हैचबैक, बेहतरीन माइलेज के साथ।'],
      ['c', 'Model C', 'sedan', 'Elegant sedan for the family', 'परिवार के लिए सुरुचिपूर्ण सेडान', 22000, 1, 'A refined sedan with a spacious cabin, quiet ride and a boot that swallows luggage.', 'विशाल केबिन, शांत सवारी और बड़ी बूट वाली परिष्कृत सेडान।'],
      ['s', 'Model S', 'suv', 'Commanding compact SUV', 'दमदार कॉम्पैक्ट एसयूवी', 34000, 1, 'A confident SUV with high ground clearance, strong safety credentials and a commanding view.', 'ऊंची ग्राउंड क्लियरेंस, मजबूत सुरक्षा और शानदार दृश्यता वाली एसयूवी।'],
      ['v', 'Model V', 'mpv', 'Seven seats, endless space', 'सात सीटें, भरपूर जगह', 29500, 0, 'A practical 7-seat MPV with flexible seating for big families and long highway trips.', 'बड़े परिवारों और लंबी हाईवे यात्राओं के लिए व्यावहारिक 7-सीटर एमपीवी।'],
    ];
    MODELS.forEach((m, i) => {
      const slug = 'model-' + m[0];
      const colors = COL[m[0]].map(c => ({ name_en: c[0], name_hi: c[1], hex: '#' + c[2] }));
      const gallery = ['side', 'front', 'rear'].map((v, k) => ({ url: `/img/car/${slug}.svg?c=${COL[m[0]][k % 4][2]}&v=${v}`, alt_en: `${m[1]} ${v} view`, alt_hi: `${m[1]} ${v} दृश्य` }));
      const specs = [
        { group_en: 'Engine', group_hi: 'इंजन', label_en: 'Displacement', label_hi: 'क्षमता', value: m[0] === 'h' ? '1197 cc' : m[0] === 'v' ? '1498 cc' : '1498 cc' },
        { group_en: 'Engine', group_hi: 'इंजन', label_en: 'Transmission', label_hi: 'ट्रांसमिशन', value: '5-speed MT / 6-speed AT' },
        { group_en: 'Dimensions', group_hi: 'आयाम', label_en: 'Boot space', label_hi: 'बूट स्पेस', value: { h: '260 L', c: '510 L', s: '420 L', v: '300 L' }[m[0]] },
        { group_en: 'Safety', group_hi: 'सुरक्षा', label_en: 'Airbags', label_hi: 'एयरबैग', value: m[0] === 'h' ? '2 (6 on ZX)' : '6' },
      ];
      const hl = [
        { title_en: 'Safety first', title_hi: 'सुरक्षा पहले', body_en: 'ABS with EBD, ISOFIX mounts and rear parking sensors on all variants.', body_hi: 'सभी वेरिएंट में ABS, EBD, ISOFIX और रियर पार्किंग सेंसर।' },
        { title_en: 'Connected cabin', title_hi: 'कनेक्टेड केबिन', body_en: 'Touchscreen infotainment with wireless smartphone mirroring.', body_hi: 'वायरलेस स्मार्टफोन मिररिंग के साथ टचस्क्रीन इंफोटेनमेंट।' },
        { title_en: 'Low running cost', title_hi: 'कम रखरखाव खर्च', body_en: 'Long service intervals and a 3-year standard warranty.', body_hi: 'लंबे सर्विस अंतराल और 3 साल की स्टैंडर्ड वारंटी।' },
      ];
      q.run(`INSERT INTO models(slug,name,tagline_en,tagline_hi,body_type,description_en,description_hi,hero_image,colors,gallery,specs,highlights,accessories_amount,featured,sort,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, slug, m[1], m[3], m[4], m[2], m[7], m[8], `/img/car/${slug}.svg?c=${COL[m[0]][0][2]}`, J(colors), J(gallery), J(specs), J(hl), m[5], m[6], i, now);
    });
    const mid = Object.fromEntries(q.all('SELECT id, slug FROM models').map(r => [r.slug, r.id]));
    const FEAT = {
      LX: [['Dual airbags', 'ABS + EBD', '7-inch touchscreen'], ['डुअल एयरबैग', 'ABS + EBD', '7-इंच टचस्क्रीन']],
      VX: [['6 airbags', 'Alloy wheels', 'Reverse camera', 'Auto AC'], ['6 एयरबैग', 'अलॉय व्हील', 'रिवर्स कैमरा', 'ऑटो एसी']],
      ZX: [['6 airbags', 'Sunroof', '360 camera', 'Wireless charger', 'Cruise control'], ['6 एयरबैग', 'सनरूफ', '360 कैमरा', 'वायरलेस चार्जर', 'क्रूज़ कंट्रोल']],
    };
    const VAR = [
      ['h', 'NEW-H-01', 'LX', 'Petrol', 'Manual', 985000], ['h', 'NEW-H-02', 'ZX Automatic', 'Petrol', 'Automatic', 1245000], ['h', 'NEW-H-03', 'VX CNG', 'CNG', 'Manual', 1055000],
      ['c', 'NEW-C-01', 'LX', 'Petrol', 'Manual', 1125000], ['c', 'NEW-C-02', 'VX', 'Diesel', 'Manual', 1410000], ['c', 'NEW-C-03', 'ZX Automatic', 'Petrol', 'Automatic', 1560000],
      ['s', 'NEW-S-01', 'LX', 'Petrol', 'Manual', 1290000], ['s', 'NEW-S-02', 'VX', 'Diesel', 'Manual', 1540000], ['s', 'NEW-S-03', 'ZX Automatic', 'Diesel', 'Automatic', 1825000], ['s', 'NEW-S-04', 'ZX+ Automatic', 'Petrol', 'Automatic', 1910000],
      ['v', 'NEW-V-01', 'LX', 'Petrol', 'Manual', 1095000], ['v', 'NEW-V-02', 'VX', 'Diesel', 'Manual', 1475000], ['v', 'NEW-V-03', 'ZX Automatic', 'Petrol', 'Automatic', 1620000],
    ];
    for (const v of VAR) {
      const f = FEAT[v[2].split(' ')[0].replace('+', '')] || FEAT.LX;
      q.run('INSERT INTO variants(model_id,code,name,fuel,transmission,ex_showroom,features_en,features_hi) VALUES (?,?,?,?,?,?,?,?)', mid['model-' + v[0]], v[1], v[2], v[3], v[4], v[5], J(f[0]), J(f[1]));
    }

    // ---- price rules (city-wide) + one model override. Indicative values; editable in /admin/prices.
    const until = addDays(today(), 60);
    const RULES = [['lucknow', 8, 10, 1500, 3.1, 4500, 600], ['kanpur', 8, 10, 1500, 3.1, 4500, 600], ['varanasi', 8, 10, 1500, 3.2, 5000, 600], ['prayagraj', 8, 10, 1500, 3.1, 4800, 600],
      ['gorakhpur', 8, 10, 1500, 3.2, 5200, 600], ['delhi-ncr', 7, 10, 1800, 3.0, 5500, 500]];
    for (const r of RULES) q.run('INSERT INTO price_rules(city_id,model_id,road_tax_pct,road_tax_pct_high,road_tax_threshold,registration_fee,insurance_pct,handling,fastag,tcs_pct,tcs_threshold,valid_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      cid[r[0]], null, r[1], r[2], 1000000, r[3], r[4], r[5], r[6], 1, 1000000, until);
    q.run('INSERT INTO price_rules(city_id,model_id,road_tax_pct,road_tax_pct_high,road_tax_threshold,registration_fee,insurance_pct,handling,fastag,tcs_pct,tcs_threshold,valid_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      cid.lucknow, mid['model-v'], 8, 10, 1000000, 1500, 3.1, 6500, 600, 1, 1000000, until);

    // ---- offers & banners
    const OFF = [
      ['Loyalty bonus on Model H', 'मॉडल H पर लॉयल्टी बोनस', 'Existing Brand X owners get a cash loyalty bonus on Model H.', 'मौजूदा Brand X ग्राहकों को मॉडल H पर कैश लॉयल्टी बोनस।', 'model-h', 'cash', 15000, 1],
      ['Exchange bonus on Model S', 'मॉडल S पर एक्सचेंज बोनस', 'Bonus when you exchange your old car for a Model S (subject to evaluation).', 'पुरानी कार एक्सचेंज करने पर बोनस (मूल्यांकन के अधीन)।', 'model-s', 'cash', 20000, 0],
      ['Corporate benefit', 'कॉर्पोरेट लाभ', 'Special benefit for salaried employees of partner corporates. Terms apply.', 'पार्टनर कंपनियों के कर्मचारियों के लिए विशेष लाभ। शर्तें लागू।', null, 'cash', 10000, 0],
      ['Free first-year service pack', 'पहले साल का मुफ्त सर्विस पैक', 'Complimentary labour on the first two services.', 'पहली दो सर्विस पर मुफ्त लेबर।', null, 'info', 0, 0],
    ];
    for (const o of OFF) q.run('INSERT INTO offers(title_en,title_hi,body_en,body_hi,model_id,type,amount,show_in_onroad,valid_until) VALUES (?,?,?,?,?,?,?,?,?)', o[0], o[1], o[2], o[3], o[4] ? mid[o[4]] : null, o[5], o[6], o[7], addDays(today(), 45));
    const BAN = [
      ['Drive home Model S', 'मॉडल S घर लाएं', 'Commanding presence. Confident safety.', 'दमदार उपस्थिति। भरोसेमंद सुरक्षा।', '/img/car/model-s.svg?c=2f4a3a', 'Explore', 'देखें', '/new-cars/model-s'],
      ['Certified used cars', 'सर्टिफाइड यूज़्ड कारें', '100-point inspected. Transparent history.', '100-पॉइंट जांचित। पारदर्शी इतिहास।', '/img/car/model-c.svg?c=b3122d', 'View stock', 'स्टॉक देखें', '/used-cars'],
      ['Book a test drive', 'टेस्ट ड्राइव बुक करें', 'Pick your slot. We bring the car.', 'अपना स्लॉट चुनें।', '/img/car/model-h.svg?c=1f4e8c', 'Book now', 'अभी बुक करें', '/test-drive'],
    ];
    BAN.forEach((b, i) => q.run('INSERT INTO banners(title_en,title_hi,sub_en,sub_hi,image,cta_label_en,cta_label_hi,cta_url,sort) VALUES (?,?,?,?,?,?,?,?,?)', ...b, i));

    // ---- users (documented logins; scrypt-hashed, never stored in plaintext)
    const wid = Object.fromEntries(q.all('SELECT id, slug FROM workshops').map(r => [r.slug, r.id]));
    const SPEC_RV = J([mid['model-s'], mid['model-v']]);
    const U = [
      // name, email, password, role, showroom, workshop, specialty, phone
      ['Administrator', 'admin@companya.in', 'Admin@123', 'admin', null, null, '[]', '9810000001'],
      ['Dealer Principal', 'principal@companya.in', 'Principal@123', 'dealer_principal', null, null, '[]', '9810000010'],
      ['Lead Desk', 'desk@companya.in', 'Desk@123', 'lead_desk', null, null, '[]', '9810000011'],
      ['Gomti Nagar Manager', 'manager.gomti@companya.in', 'Manager@123', 'showroom_manager', 'gomti-nagar', null, '[]', '9810000012'],
      ['Aliganj Manager', 'manager.aliganj@companya.in', 'Manager@123', 'showroom_manager', 'aliganj', null, '[]', '9810000013'],
      ['Alambagh Manager', 'manager.alambagh@companya.in', 'Manager@123', 'showroom_manager', 'alambagh', null, '[]', '9810000014'],
      ['Priya Sharma', 'priya@companya.in', 'Sales@123', 'consultant', 'gomti-nagar', null, '[]', '9810000003'],
      ['Rahul Verma', 'rahul@companya.in', 'Sales@123', 'consultant', 'gomti-nagar', null, SPEC_RV, '9810000004'],
      ['Neha Singh', 'neha@companya.in', 'Sales@123', 'consultant', 'aliganj', null, '[]', '9810000005'],
      ['Ravi Mehra', 'ravi@companya.in', 'Sales@123', 'consultant', 'aliganj', null, '[]', '9810000015'],
      ['Amit Yadav', 'amit@companya.in', 'Sales@123', 'consultant', 'alambagh', null, '[]', '9810000006'],
      ['Sunita Rao', 'sunita@companya.in', 'Sales@123', 'consultant', 'alambagh', null, '[]', '9810000016'],
      ['Used Car Manager', 'used@companya.in', 'Used@123', 'used_manager', null, null, '[]', '9810000002'],
      ['Content Editor', 'content@companya.in', 'Content@123', 'content_editor', null, null, '[]', '9810000017'],
      ['Service Advisor Amausi', 'service@companya.in', 'Service@123', 'service_advisor', null, 'amausi', '[]', '9810000007'],
      ['Service Advisor Gomti Ext', 'service2@companya.in', 'Service@123', 'service_advisor', null, 'gomti-nagar-extension', '[]', '9810000018'],
      ['Workshop Manager Amausi', 'wm.amausi@companya.in', 'Workshop@123', 'workshop_manager', null, 'amausi', '[]', '9810000019'],
    ];
    for (const u of U) q.run('INSERT INTO users(name,email,password_hash,role,showroom_id,workshop_id,specialty_model_ids,phone,created_at,password_changed_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      u[0], u[1], hashPassword(u[2]), u[3], u[4] ? sid[u[4]] : null, u[5] ? wid[u[5]] : null, u[6], u[7], now, now);

    // ---- demo cars
    const vid = code => q.get('SELECT id FROM variants WHERE code = ?', code).id;
    let n = 1;
    for (const s of ['gomti-nagar', 'aliganj', 'alambagh']) for (const m of ['h', 'c', 's', 'v']) {
      const copies = s === 'gomti-nagar' && m === 'h' ? 2 : 1;
      for (let k = 0; k < copies; k++) q.run('INSERT INTO demo_cars(showroom_id,model_id,variant_id,reg_no) VALUES (?,?,?,?)', sid[s], mid['model-' + m], vid(`NEW-${m.toUpperCase()}-0${m === 'h' ? 2 : 1}`), `UP32TR${String(1000 + n++)}`);
    }

    // ---- used cars
    const SECT = [
      ['Engine', 'इंजन', [['Engine oil', 'इंजन ऑयल'], ['Coolant', 'कूलेंट'], ['Timing chain/belt', 'टाइमिंग चेन/बेल्ट'], ['Air filter', 'एयर फिल्टर'], ['Plugs', 'प्लग']]],
      ['Transmission', 'ट्रांसमिशन', [['Clutch / torque converter', 'क्लच / टॉर्क कन्वर्टर'], ['Gearbox', 'गियरबॉक्स'], ['Drive shaft', 'ड्राइव शाफ्ट'], ['Differential', 'डिफरेंशियल'], ['Gear shifter', 'गियर शिफ्टर']]],
      ['Suspension', 'सस्पेंशन', [['Front shock absorbers', 'आगे के शॉक'], ['Rear shock absorbers', 'पीछे के शॉक'], ['Control arms', 'कंट्रोल आर्म'], ['Bushes', 'बुश'], ['Springs', 'स्प्रिंग']]],
      ['Brakes', 'ब्रेक', [['Front pads', 'आगे के पैड'], ['Rear pads/shoes', 'पीछे के पैड'], ['Discs/drums', 'डिस्क/ड्रम'], ['Brake fluid', 'ब्रेक फ्लूइड'], ['Handbrake', 'हैंडब्रेक']]],
      ['Steering', 'स्टीयरिंग', [['Steering rack', 'स्टीयरिंग रैक'], ['Tie rods', 'टाई रॉड'], ['Wheel alignment', 'व्हील अलाइनमेंट'], ['Power steering fluid', 'पावर स्टीयरिंग फ्लूइड'], ['Steering column', 'स्टीयरिंग कॉलम']]],
      ['Exterior', 'बाहरी हिस्सा', [['Front bumper', 'फ्रंट बंपर'], ['Rear bumper', 'रियर बंपर'], ['Doors', 'दरवाज़े'], ['Bonnet', 'बोनट'], ['Paint finish', 'पेंट फिनिश']]],
      ['Interior', 'अंदरूनी हिस्सा', [['Seats', 'सीटें'], ['Dashboard', 'डैशबोर्ड'], ['Steering wheel trim', 'स्टीयरिंग ट्रिम'], ['Carpet & mats', 'कारपेट और मैट'], ['Roof lining', 'रूफ लाइनिंग']]],
      ['Electricals', 'इलेक्ट्रिकल', [['Battery', 'बैटरी'], ['Alternator', 'अल्टरनेटर'], ['Headlamps', 'हेडलैंप'], ['Wipers', 'वाइपर'], ['Power windows', 'पावर विंडो']]],
      ['AC & Cabin', 'एसी और केबिन', [['AC compressor', 'एसी कंप्रेसर'], ['Cooling performance', 'कूलिंग'], ['Blower', 'ब्लोअर'], ['Infotainment', 'इंफोटेनमेंट'], ['Central locking', 'सेंट्रल लॉकिंग']]],
      ['Tyres & Documents', 'टायर और दस्तावेज़', [['Front tyres', 'आगे के टायर'], ['Rear tyres', 'पीछे के टायर'], ['Spare tyre', 'स्पेयर टायर'], ['RC & ownership', 'आरसी और स्वामित्व'], ['Insurance & service history', 'बीमा और सर्विस इतिहास']]],
    ];
    const CHK = [['condition', 'स्थिति'], ['operation', 'कार्यप्रणाली']];
    const inspection = attn => {
      let ok = 0;
      const sections = SECT.map(s => ({ name_en: s[0], name_hi: s[1], items: s[2].flatMap(p => CHK.map(c => {
        const bad = rnd() < attn;
        if (!bad) ok++;
        return { label_en: `${p[0]} - ${c[0]}`, label_hi: `${p[1]} - ${c[1]}`, status: bad ? 'attention' : 'ok', ...(bad ? noteOf(pick(Object.keys(NOTES_HI))) : { note: '', note_en: '', note_hi: '' }) };
      })) }));
      return { score: ok, total: 100, sections };
    };
    const USED = [
      ['UC-1171', 'Model H', 'LX', 2020, 52300, 1, 'Petrol', 'Manual', 'White', 'f4f4f2', 385000, 'available', 'UP32AB1171'],
      ['UC-1175', 'Model H', 'ZX', 2022, 21800, 1, 'Petrol', 'Automatic', 'Grey', '6b6f75', 689000, 'available', 'UP32CD5075'],
      ['UC-1179', 'Model H', 'VX', 2019, 68900, 2, 'CNG', 'Manual', 'Silver', 'b9bcc1', 372000, 'available', 'UP78EF2279'],
      ['UC-1182', 'Model C', 'VX', 2022, 41200, 1, 'Diesel', 'Manual', 'White', 'f4f4f2', 845000, 'available', 'UP32KL7834'],
      ['UC-1184', 'Model C', 'LX', 2021, 36400, 1, 'Petrol', 'Manual', 'White', 'f4f4f2', 715000, 'available', 'UP32MN6184'],
      ['UC-1186', 'Model C', 'ZX', 2023, 14200, 1, 'Petrol', 'Automatic', 'Black', '16171a', 1125000, 'available', 'UP32PQ0186'],
      ['UC-1188', 'Model S', 'VX', 2020, 74500, 2, 'Diesel', 'Manual', 'Blue', '1f4e8c', 895000, 'available', 'UP32RS3388'],
      ['UC-1190', 'Model S', 'LX', 2021, 58600, 1, 'Petrol', 'Manual', 'White', 'f4f4f2', 512000, 'booked', 'UP32HN4521'],
      ['UC-1191', 'Model C', 'ZX', 2022, 33900, 1, 'Diesel', 'Automatic', 'Silver', 'b9bcc1', 1195000, 'available', 'UP32TU9191'],
      ['UC-1193', 'Model H', 'ZX', 2019, 81200, 2, 'Petrol', 'Manual', 'Midnight Blue', '1b2a4a', 565000, 'available', 'UP65VW1193'],
      ['UC-1195', 'Model V', 'VX', 2021, 47600, 1, 'Diesel', 'Manual', 'Pearl White', 'f1f1ef', 985000, 'booked', 'UP32XY7795'],
      ['UC-1197', 'Model V', 'ZX', 2022, 28800, 1, 'Petrol', 'Automatic', 'Graphite Grey', '55565a', 1090000, 'available', 'UP32ZA4297'],
      ['UC-1199', 'Model S', 'LX', 2018, 91200, 3, 'Petrol', 'Manual', 'Blue', '2a7fc4', 695000, 'available', 'UP32BC8099'],
      ['UC-1201', 'Model S', 'VX', 2019, 77100, 2, 'Diesel', 'Manual', 'Charcoal Grey', '3b3e43', 925000, 'available', 'UP32DE5601'],
      ['UC-1203', 'Model S', 'ZX', 2018, 99500, 2, 'Diesel', 'Automatic', 'Dark Blue', '1f2f55', 745000, 'sold', 'UP32FG3203'],
      ['UC-1192', 'Model H', 'LX', 2022, 18900, 1, 'Petrol', 'Manual', 'Black', '16171a', 595000, 'available', 'UP32GH1192'],
      ['UC-1194', 'Model S', 'ZX+', 2023, 12400, 1, 'Diesel', 'Automatic', 'White', 'f4f4f2', 1745000, 'available', 'UP32JK1194'],
      ['UC-1196', 'Model S', 'ZX', 2018, 88800, 2, 'Diesel', 'Automatic', 'Black', '16171a', 1595000, 'available', 'UP32LM1196'],
      ['UC-1198', 'Model V', 'LX', 2022, 22100, 1, 'Petrol', 'Manual', 'Silver', 'b9bcc1', 1085000, 'available', 'UP32NP1198'],
      ['UC-1200', 'Model S', 'LX', 2019, 52300, 1, 'Petrol', 'Manual', 'Red', 'b3122d', 735000, 'available', 'UP32QR1200'],
      ['UC-1202', 'Model C', 'VX', 2022, 29700, 1, 'Petrol', 'Manual', 'Slate Grey', '6b7078', 1015000, 'available', 'UP32ST1202'],
    ];
    for (const u of USED) {
      const ms = slugify(u[1]);
      const photos = [photoFor(u[0], u[1])].filter(Boolean);
      const ins = inspection(u[0] === 'UC-1182' ? 0.04 : 0.03 + rnd() * 0.07);
      q.run(`INSERT INTO used_cars(stock_id,slug,model,variant,year,km,owners,fuel,transmission,color,price,status,reg_no,location,highlights,inspection,photos,warranty_en,warranty_hi,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, u[0], makeSlug(u[0], u[1], u[2], u[3]), u[1], u[2], u[3], u[4], u[5], u[6], u[7], u[8], u[10], u[11], u[12],
        'Faizabad Road Used Car Yard, Lucknow', J([`${u[5] === 1 ? 'Single owner' : u[5] + ' owners'}`, `${u[4].toLocaleString('en-IN')} km driven`, 'Service history available', '100-point inspection passed']), J(ins), J(photos),
        '6-month / 6,000 km warranty included', '6 महीने / 6,000 किमी वारंटी शामिल', addDays(today(), -rnd() * 40 | 0) + 'T10:00:00.000Z', now);
    }

    // ---- past sales (deterministic depreciation model; used by AI price band)
    const BASE = { 'Model H': 850000, 'Model C': 1080000, 'Model S': 1300000, 'Model V': 1150000 };
    for (let i = 0; i < 32; i++) {
      const model = ['Model H', 'Model C', 'Model S', 'Model V'][i % 4];
      const year = 2018 + Math.floor(rnd() * 6);
      const age = 2026 - year;
      const km = Math.round((age * 9000 + rnd() * 16000) / 100) * 100;
      const price = Math.round(BASE[model] * Math.pow(0.87, age) * (1 - km / 400000) * (0.94 + rnd() * 0.12) / 5000) * 5000;
      q.run('INSERT INTO past_sales(model,variant,year,km,fuel,sold_price,sold_date) VALUES (?,?,?,?,?,?,?)', model, pick(['LX', 'VX', 'ZX']), year, km, pick(['Petrol', 'Diesel', 'Petrol']), price, addDays(today(), -Math.floor(rnd() * 300) - 10));
    }

    // ---- historic leads (~60), created via the real assignment logic
    const NAMES = ['Aarav Gupta', 'Vivaan Mishra', 'Ananya Tiwari', 'Ishaan Srivastava', 'Diya Pandey', 'Kabir Khan', 'Saanvi Agarwal', 'Arjun Dubey', 'Myra Shukla', 'Reyansh Rastogi', 'Kiara Saxena', 'Aditya Chauhan',
      'Zoya Ansari', 'Krish Maurya', 'Navya Jaiswal', 'Rohan Bajpai', 'Pooja Kapoor', 'Sandeep Rawat', 'Meena Kumari', 'Imran Siddiqui', 'Harsh Vardhan', 'Ritu Awasthi', 'Manish Tripathi', 'Sunita Devi'];
    const SRC = ['website', 'website', 'test_drive', 'trade_in', 'finance', 'carwale', 'cardekho', 'facebook', 'instagram', 'walk_in', 'carwale', 'cardekho'];
    const MSG = ['Looking for a family car, budget around 12 lakh. Need it this month.', 'Interested in automatic, mostly city driving. Please call.', 'Want to exchange my old car and buy a new one.', 'Need finance options and EMI details.',
      'Can I get a test drive on the weekend?', 'Diesel variant for highway use, within 2 weeks.', 'Need a 7 seater for family, budget 14-16 lakh.', ''];
    const used = new Set();
    const nowMs = Date.now();
    for (let i = 0; i < 60; i++) {
      const ageH = i < 6 ? rnd() * 3 : 4 + rnd() * 24 * 30;
      const created = new Date(nowMs - ageH * 3600000).toISOString();
      let phone; do { phone = '9' + String(Math.floor(100000000 + rnd() * 899999999)); } while (used.has(phone)); used.add(phone);
      const model = pick(['model-h', 'model-c', 'model-s', 'model-v']);
      const res = leads.insertLead({ source: pick(SRC), type: 'enquiry', name: pick(NAMES), phone, modelId: mid[model], showroomId: sid[pick(['gomti-nagar', 'gomti-nagar', 'aliganj', 'alambagh'])], message: pick(MSG), consent: true, lang: rnd() < 0.2 ? 'hi' : 'en' }, { createdAt: created });
      let status, first = null;
      const r = rnd();
      if (i < 3) status = 'new';
      else {
        const delay = r < 0.72 ? 20 + rnd() * 270 : r < 0.93 ? 330 + rnd() * 2400 : 4000 + rnd() * 20000;
        first = new Date(Date.parse(created) + delay * 1000).toISOString();
        const s = rnd();
        status = ageH < 24 ? pick(['contacted', 'contacted', 'test_drive']) : s < 0.25 ? 'contacted' : s < 0.4 ? 'test_drive' : s < 0.55 ? 'negotiation' : s < 0.8 ? 'won' : 'lost';
      }
      q.run('UPDATE leads SET status = ?, first_response_at = ?, updated_at = ? WHERE id = ?', status, first, first || created, res.id);
      if (first) leads.addEvent(res.id, 'status', `new -> ${status}`, res.assignee ? res.assignee.id : null);
    }

    // ---- sample bookings: a few test drives and service bookings in the near future
    const ws = q.all('SELECT id FROM workshops');
    for (let i = 0; i < 8; i++) {
      q.run(`INSERT INTO bookings(type,name,phone,workshop_id,date,time,service_type,reg_no,model_name,status,created_at,updated_at) VALUES ('service',?,?,?,?,?,?,?,?,?,?,?)`,
        pick(NAMES), '98' + String(10000000 + Math.floor(rnd() * 89999999)), ws[i % 2].id, addDays(today(), i % 3 - 1), pick(['09:00', '10:00', '11:00', '14:00']), pick(['periodic', 'repair', 'ac_service']),
        'UP32' + pick(['AB', 'CD', 'EF']) + (1000 + i * 37), pick(['Model H', 'Model C', 'Model S']), i < 3 ? 'completed' : 'booked', now, now);
    }

    // ---- demo customer (login with phone 9876500001; OTP_MODE=mock accepts 123456)
    const cr = q.run("INSERT INTO customers(phone,name,email,lang,created_at) VALUES ('9876500001','Demo Customer','demo.customer@example.com','en',?)", now);
    const cust = Number(cr.lastInsertRowid);
    q.run("INSERT INTO customer_vehicles(customer_id,reg_no,model,year,km,last_service,created_at) VALUES (?,?,?,?,?,?,?)", cust, 'UP32DM0001', 'Model H', 2021, 34200, addDays(today(), -75), now);
    for (const [d, type] of [[-75, 'periodic'], [-260, 'periodic']]) {
      const at = addDays(today(), d);
      q.run(`INSERT INTO bookings(type,customer_id,name,phone,workshop_id,date,time,service_type,reg_no,model_name,status,delivered_at,checked_in_at,created_at,updated_at) VALUES ('service',?,?,?,?,?,?,?,?,?,'delivered',?,?,?,?)`,
        cust, 'Demo Customer', '9876500001', ws[0].id, at, '10:00', type, 'UP32DM0001', 'Model H', at + 'T12:00:00.000Z', at + 'T04:30:00.000Z', at + 'T03:00:00.000Z', at + 'T12:00:00.000Z');
    }
    q.run("INSERT INTO saved_cars(customer_id,kind,ref,created_at) VALUES (?,?,?,?)", cust, 'used', makeSlug('UC-1182', 'Model C', 'VX', 2022), now);
    q.run("INSERT INTO saved_cars(customer_id,kind,ref,created_at) VALUES (?,?,?,?)", cust, 'new', 'model-s', now);
  });
  fixups();
  return { skipped: false };
}

/** Idempotent data corrections applied to already-seeded databases too. */
const COLOUR_FIXES = [['UC-1182', 'White', 'f4f4f2', 'Model C'], ['UC-1190', 'White', 'f4f4f2', 'Model S'], ['UC-1191', 'Silver', 'b9bcc1', 'Model C'], ['UC-1192', 'Black', '16171a', 'Model H'],
  ['UC-1193', 'Midnight Blue', '1b2a4a', 'Model H'], ['UC-1194', 'White', 'f4f4f2', 'Model S'], ['UC-1195', 'Pearl White', 'f1f1ef', 'Model V'], ['UC-1196', 'Black', '16171a', 'Model S'],
  ['UC-1197', 'Graphite Grey', '55565a', 'Model V'], ['UC-1198', 'Silver', 'b9bcc1', 'Model V'], ['UC-1199', 'Blue', '2a7fc4', 'Model S'], ['UC-1200', 'Red', 'b3122d', 'Model S'],
  ['UC-1201', 'Charcoal Grey', '3b3e43', 'Model S'], ['UC-1202', 'Slate Grey', '6b7078', 'Model C'], ['UC-1203', 'Dark Blue', '1f2f55', 'Model S']];
function fixups() {
  const { q } = db;
  if (process.env.NODE_ENV === 'production') return; // demo corrections never touch a production database
  for (const [stock, colour, hex, model] of COLOUR_FIXES) {
    const r = q.get('SELECT * FROM used_cars WHERE stock_id = ?', stock);
    if (!r) continue;
    const ms = slugify(model);
    q.run('UPDATE used_cars SET color = ?, model = ?, slug = ? WHERE id = ?', colour, model, makeSlug(stock, model, r.variant, r.year), r.id);
  }
  // Hindi data: inspection note_hi / note_en and used-car location_hi
  for (const r of q.all('SELECT id, location, location_hi, inspection FROM used_cars')) {
    let ins; try { ins = JSON.parse(r.inspection); } catch { continue; }
    let changed = false;
    for (const sec of (ins && ins.sections) || []) for (const it of sec.items || []) {
      if (it.note && !it.note_en) { it.note_en = it.note; changed = true; }
      if (it.note && !it.note_hi) { it.note_hi = NOTES_HI[it.note] || it.note; changed = true; }
      if (!it.note && it.note_hi === undefined) { it.note_en = ''; it.note_hi = ''; changed = true; }
    }
    if (changed) q.run('UPDATE used_cars SET inspection = ? WHERE id = ?', JSON.stringify(ins), r.id);
    if (!r.location_hi && LOCATION_HI[r.location]) q.run('UPDATE used_cars SET location_hi = ? WHERE id = ?', LOCATION_HI[r.location], r.id);
  }
  // real photos only: replace SVG/empty photo lists with the car's own (or a same-body-type) photo
  for (const r of q.all('SELECT id, stock_id, model, photos FROM used_cars')) {
    let list = []; try { list = JSON.parse(r.photos) || []; } catch {}
    const ov = require('./services/used').OVERRIDE[String(r.stock_id).toLowerCase()];
    if (ov || !list.length || list.some(u => /\.svg(\?|$)/i.test(u))) { const f = photoFor(r.stock_id, r.model); if (f) q.run('UPDATE used_cars SET photos = ? WHERE id = ?', JSON.stringify([f]), r.id); }
  }
  for (const [k, v] of Object.entries({ site_stats: J({ new_cars_per_year: 6000, used_cars_per_year: 900 }), contact: J({ phone: '0522 4001001', whatsapp: '919810000001', email: 'hello@companya.in', hours: 'Mon-Sat 9:30-19:30, Sun 10:00-17:00', city: 'Lucknow' }) }))
    q.run('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)', k, v);
}

/**
 * Production bootstrap: schema + reference data (settings, showrooms, workshops, cities, roles) and ONE admin who must change the password.
 * No demo users, leads, customers or catalog. Password from env BOOTSTRAP_ADMIN_PASSWORD (must satisfy the policy) or generated and printed once.
 */
function bootstrap({ email, password } = {}) {
  const { q, tx } = db;
  db.open();
  perms.ensure();
  let result = { created: false };
  tx(() => {
    if (!q.get('SELECT 1 x FROM showrooms LIMIT 1')) reference(q, nowIso());
    if (q.get("SELECT 1 x FROM users WHERE role = 'admin' AND active = 1")) return;
    const em = String(email || 'admin@companya.in').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) throw new Error('BOOTSTRAP_ADMIN_EMAIL is not a valid email address');
    const generated = !password;
    const pw = password || auth.tempPassword();
    try { auth.checkPolicy(pw, { email: em, name: 'Administrator' }); } catch (e) { throw new Error('BOOTSTRAP_ADMIN_PASSWORD rejected: ' + e.message); }
    q.run("INSERT INTO users(name,email,password_hash,role,must_change_password,created_at) VALUES ('Administrator',?,?,'admin',1,?)", em, hashPassword(pw), nowIso());
    result = { created: true, email: em, password: generated ? pw : undefined };
  });
  return result;
}

module.exports = { seed, fixups, bootstrap };


if (require.main === module) {
  const arg = n => process.argv.includes(n);
  const prod = process.env.NODE_ENV === 'production';
  if (arg('--reset')) {
    const p = db.dbPath();
    for (const f of [p, p + '-wal', p + '-shm']) try { fs.rmSync(f); } catch {}
  }
  try {
    if (arg('--bootstrap')) {
      const r = bootstrap({ email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD });
      if (r.created) console.log(`Bootstrap complete. Admin: ${r.email}` + (r.password ? `\nTemporary password (shown once, must be changed at first login): ${r.password}` : '\nUse BOOTSTRAP_ADMIN_PASSWORD to sign in; you must change it at first login.'));
      else console.log('Bootstrap: an active admin already exists; nothing to do.');
    } else if (arg('--demo') || !prod) {
      const r = seed();
      console.log(r.skipped ? 'Database already seeded (use --reset to rebuild).' : 'Seeded DEMO data (documented demo logins) at ' + db.dbPath());
    } else {
      console.error('Refusing to seed demo data in production. Use `node server/seed.js --bootstrap` (admin + reference data) or pass --demo explicitly.');
      process.exitCode = 1;
    }
  } catch (e) { console.error('Seed failed:', e.message); process.exitCode = 1; }
  db.close();
}
