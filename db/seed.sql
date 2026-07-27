-- =====================================================================
--  Master data the system needs, plus one way in.
--  Run after schema.sql. Demo records are in seed_demo.sql (optional).
--  The admin password below is 'ChangeMe#2026' — change it immediately.
-- =====================================================================

INSERT INTO roles (name, slug, level, scope) VALUES
 ('Super Admin','super-admin',1,'all'),
 ('Head / Director','director',2,'all'),
 ('Manager','manager',3,'team'),
 ('Executive','executive',4,'own');

INSERT INTO departments (code, name) VALUES
 ('IB','Investment Banking'),('INB','Institutional Broking'),('RSH','Research'),
 ('OPS','Operations'),('FIN','Finance'),('ACC','Accounts'),('CMP','Compliance'),
 ('LGL','Legal'),('HR','HR'),('IT','IT'),('MKT','Marketing'),('CS','Customer Support');

INSERT INTO divisions (code, name) VALUES ('IB','Investment Banking'),('MB','Merchant Banking');

INSERT INTO countries (name, dial_code) VALUES
 ('India','+91'),('Singapore','+65'),('United Arab Emirates','+971'),('United Kingdom','+44'),
 ('United States','+1'),('Hong Kong','+852'),('Mauritius','+230'),('Switzerland','+41');

INSERT INTO country_cities (country_id, name)
SELECT c.id, x.city FROM countries c JOIN (
  SELECT 'India' AS country, 'Mumbai' AS city UNION ALL SELECT 'India','Delhi'
  UNION ALL SELECT 'India','Kolkata'   UNION ALL SELECT 'India','Bengaluru'
  UNION ALL SELECT 'India','Chennai'   UNION ALL SELECT 'India','Hyderabad'
  UNION ALL SELECT 'India','Pune'      UNION ALL SELECT 'India','Ahmedabad'
  UNION ALL SELECT 'India','Kochi'     UNION ALL SELECT 'India','Vadodara'
  UNION ALL SELECT 'Singapore','Singapore'
  UNION ALL SELECT 'United Arab Emirates','Dubai'
  UNION ALL SELECT 'United Kingdom','London'
  UNION ALL SELECT 'United States','New York'
) x ON x.country = c.name;

INSERT INTO sectors (name) VALUES
 ('Real Estate'),('FinTech'),('HealthTech'),('FMCG'),('ConsumerTech'),('BFSI'),
 ('Manufacturing'),('Infrastructure'),('Pharma'),('Logistics'),('Renewables'),('Media');

INSERT INTO deal_types (name, division_id, family, default_fee_pct) VALUES
 ('IPO',            (SELECT id FROM divisions WHERE code='MB'),'Equity Capital Markets',2.50),
 ('QIP',            (SELECT id FROM divisions WHERE code='MB'),'Equity Capital Markets',2.00),
 ('Rights Issue',   (SELECT id FROM divisions WHERE code='MB'),'Equity Capital Markets',1.75),
 ('Preferential Allotment',(SELECT id FROM divisions WHERE code='MB'),'Equity Capital Markets',1.50),
 ('Open Offer',     (SELECT id FROM divisions WHERE code='MB'),'M&A',1.25),
 ('Valuation',      (SELECT id FROM divisions WHERE code='MB'),'Advisory',0.00),
 ('Private Equity Placement',(SELECT id FROM divisions WHERE code='IB'),'Equity Capital Markets',3.00),
 ('Debt Syndication',(SELECT id FROM divisions WHERE code='IB'),'Debt',1.50),
 ('Structured Finance',(SELECT id FROM divisions WHERE code='IB'),'Debt',2.00),
 ('M&A — Sell Side',(SELECT id FROM divisions WHERE code='IB'),'M&A',2.50),
 ('M&A — Buy Side', (SELECT id FROM divisions WHERE code='IB'),'M&A',2.00),
 ('ESOP Advisory',  (SELECT id FROM divisions WHERE code='IB'),'Advisory',0.00);

INSERT INTO client_groups (name) VALUES ('Independent');

INSERT INTO preferences (name, pref_type) VALUES
 ('Email updates','Communication'),('Phone call before email','Communication'),
 ('WhatsApp acceptable','Communication'),('No marketing contact','Communication'),
 ('Monthly reporting','Reporting'),('Quarterly reporting','Reporting'),
 ('Quarterly review meeting','Meeting'),('Physical documents required','Documentation'),
 ('Research reports','General'),('Deal alerts','General');

INSERT INTO categories (name) VALUES
 ('Report'),('Approval'),('Client Request'),('Audit'),('Documentation'),
 ('System Change'),('Recruitment'),('Review'),('Deal Support');

INSERT INTO tags (name, colour) VALUES
 ('urgent','#D0483F'),('board','#23408E'),('sebi','#1D5D9D'),('client-facing','#20B7D2'),
 ('recurring','#0FB59F'),('internal','#8794AB'),('deal','#18B485'),('audit','#E0A21C');

INSERT INTO work_types (name, category) VALUES
 ('Agreement / contract','Legal'),('Office layout','Facilities'),('Furniture & fittings','Facilities'),
 ('Stationery purchase','Administration'),('IT hardware','IT'),('Software licence','IT'),
 ('Repairs & maintenance','Facilities'),('Housekeeping contract','Facilities'),
 ('Signage & branding','Marketing'),('Marketing collateral','Marketing'),
 ('Travel booking','Administration'),('Event / conference','Marketing'),
 ('Insurance renewal','Finance'),('Professional fees','Finance'),('Utility connection','Facilities'),
 ('Security services','Facilities'),('Courier & logistics','Administration'),
 ('Recruitment agency','HR'),('Training programme','HR'),('Subscription renewal','Administration');

INSERT INTO holidays (holiday_date, title) VALUES
 ('2026-08-15','Independence Day'),('2026-10-02','Gandhi Jayanti'),
 ('2026-11-09','Diwali — Laxmi Puja'),('2026-12-25','Christmas');

INSERT INTO settings ("key","value") VALUES
 ('working_days','Mon,Tue,Wed,Thu,Fri,Sat'),('office_open','09:30'),('office_close','18:30'),
 ('brand_navy','#23408E'),('brand_cyan','#20B7D2'),('brand_teal','#1DB5B6'),('brand_green','#18B485');

-- ---------------------------------------------------------------- rights
INSERT INTO permissions (slug, module, action, label) VALUES
 ('accounts.view','accounts','view','View accounts'),
 ('accounts.create','accounts','create','Create accounts'),
 ('accounts.edit','accounts','edit','Edit accounts'),
 ('accounts.delete','accounts','delete','Delete accounts'),
 ('opportunities.view','opportunities','view','View opportunities'),
 ('opportunities.create','opportunities','create','Create opportunities'),
 ('opportunities.edit','opportunities','edit','Edit and assign opportunities'),
 ('opportunities.move_stage','opportunities','approve','Move an opportunity between stages'),
 ('opportunities.delete','opportunities','delete','Delete opportunities'),
 ('mandates.view','mandates','view','View mandates'),
 ('mandates.create','mandates','create','Create mandates'),
 ('mandates.edit','mandates','edit','Edit mandates'),
 ('fees.create','fees','create','Record fees'),
 ('institutional.view','institutional','view','View institutional clients'),
 ('institutional.create','institutional','create','Add clients, movement and brokerage'),
 ('institutional.edit','institutional','edit','Edit institutional records'),
 ('research.view','research','view','View research'),
 ('research.create','research','create','Create research reports'),
 ('research.edit','research','edit','Edit research reports'),
 ('assignments.view','assignments','view','View assignments'),
 ('assignments.create','assignments','create','Create assignments'),
 ('assignments.edit','assignments','edit','Edit assignments'),
 ('assignments.delete','assignments','delete','Delete assignments'),
 ('time.log','time','create','Log time'),
 ('workapproval.view','workapproval','view','View work approvals'),
 ('workapproval.create','workapproval','create','Raise work approvals'),
 ('workapproval.edit','workapproval','edit','Edit work approvals'),
 ('workapproval.approve','workapproval','approve','Decide work approvals'),
 ('masters.view','masters','view','View masters'),
 ('masters.create','masters','create','Add master entries'),
 ('masters.edit','masters','edit','Edit master entries'),
 ('masters.delete','masters','delete','Delete master entries'),
 ('users.view','users','view','View users'),
 ('reports.view','reports','view','View reports'),
 ('reports.export','reports','export','Export reports');

-- level 1 gets everything
INSERT INTO role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM roles WHERE level=1), id FROM permissions;

-- level 2: everything except user administration and deleting masters
INSERT INTO role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM roles WHERE level=2), id FROM permissions
   WHERE slug NOT IN ('masters.delete','accounts.delete');

-- level 3: their own patch, and they can decide work approvals
INSERT INTO role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM roles WHERE level=3), id FROM permissions
   WHERE slug IN ('accounts.view','accounts.create','accounts.edit',
                  'opportunities.view','opportunities.create','opportunities.edit',
                  'opportunities.move_stage','mandates.view',
                  'institutional.view','institutional.create','institutional.edit',
                  'research.view','research.create','research.edit',
                  'assignments.view','assignments.create','assignments.edit','time.log',
                  'workapproval.view','workapproval.create','workapproval.edit','workapproval.approve',
                  'masters.view','users.view','reports.view','reports.export');

-- level 4: their own work
INSERT INTO role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM roles WHERE level=4), id FROM permissions
   WHERE slug IN ('accounts.view','opportunities.view','mandates.view',
                  'institutional.view','institutional.create','research.view',
                  'assignments.view','assignments.create','assignments.edit','time.log',
                  'workapproval.view','workapproval.create','reports.view');

-- ------------------------------------------------------------ the way in
--
--  No user is created here on purpose. A password hash written into a
--  seed file is either wrong or is a published password, and both are
--  worse than nothing. Create the first Super Admin with:
--
--      cd server && dotnet run -- create-admin   (from the Server folder)
--
--  which asks for the details, hashes the password with argon2id and
--  writes the row. Everything above this line is master data and can be
--  re-run safely.
