-- =====================================================================
--  ASHIKA — Work & Deal Management
--  PostgreSQL 16   ·   run inside an empty database named ashika_wdm
--
--  Three workspaces on one database:
--    banking       accounts → opportunities → mandates → fees
--    institutional clients → schemes → visits, research, brokerage
--    internal      assignments, work approvals, meetings
--
--  Money: fees in ₹ lakh (_l), transaction size in ₹ crore (_cr),
--  institutional turnover and brokerage in rupees. DECIMAL throughout —
--  never FLOAT — so totals reconcile.
-- =====================================================================


DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS meeting_participants CASCADE;
DROP TABLE IF EXISTS meetings CASCADE;
DROP TABLE IF EXISTS work_approval_notes CASCADE;
DROP TABLE IF EXISTS work_approvals CASCADE;
DROP TABLE IF EXISTS work_types CASCADE;
DROP TABLE IF EXISTS brokerage CASCADE;
DROP TABLE IF EXISTS research_report_clients CASCADE;
DROP TABLE IF EXISTS research_reports CASCADE;
DROP TABLE IF EXISTS client_visit_stocks CASCADE;
DROP TABLE IF EXISTS client_visits CASCADE;
DROP TABLE IF EXISTS institution_schemes CASCADE;
DROP TABLE IF EXISTS institution_contacts CASCADE;
DROP TABLE IF EXISTS institutions CASCADE;
DROP TABLE IF EXISTS fee_receipts CASCADE;
DROP TABLE IF EXISTS mandate_team CASCADE;
DROP TABLE IF EXISTS mandate_milestones CASCADE;
DROP TABLE IF EXISTS mandates CASCADE;
DROP TABLE IF EXISTS opportunity_team CASCADE;
DROP TABLE IF EXISTS opportunity_notes CASCADE;
DROP TABLE IF EXISTS opportunity_stage_history CASCADE;
DROP TABLE IF EXISTS opportunities CASCADE;
DROP TABLE IF EXISTS account_contacts CASCADE;
DROP TABLE IF EXISTS account_notes CASCADE;
DROP TABLE IF EXISTS account_preferences CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS institution_sectors CASCADE;
DROP TABLE IF EXISTS user_permissions CASCADE;
DROP TABLE IF EXISTS time_logs CASCADE;
DROP TABLE IF EXISTS assignment_assignees CASCADE;
DROP TABLE IF EXISTS assignment_checklist CASCADE;
DROP TABLE IF EXISTS assignment_notes CASCADE;
DROP TABLE IF EXISTS assignment_subtasks CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS preferences CASCADE;
DROP TABLE IF EXISTS client_groups CASCADE;
DROP TABLE IF EXISTS deal_types CASCADE;
DROP TABLE IF EXISTS sectors CASCADE;
DROP TABLE IF EXISTS divisions CASCADE;
DROP TABLE IF EXISTS country_cities CASCADE;
DROP TABLE IF EXISTS countries CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- =====================================================================
--  1  ORGANISATION, ACCESS, MASTERS
-- =====================================================================
CREATE TABLE departments (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       VARCHAR(12)  NULL,
  name       VARCHAR(80)  NOT NULL,
  head_user_id INTEGER NULL,
  is_active  SMALLINT   NOT NULL DEFAULT 1,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_dept_name UNIQUE (name)) ;
CREATE TABLE divisions (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code      VARCHAR(12) NULL,
  name      VARCHAR(80) NOT NULL,          -- Investment Banking / Merchant Banking
  head_user_id INTEGER NULL,
  is_active SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_div_name UNIQUE (name)) ;
CREATE TABLE roles (
  id         SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(40) NOT NULL,
  slug       VARCHAR(40) NOT NULL,
  level      SMALLINT NOT NULL,     -- 1 super admin, 2 management, 3 head/hod, 4 manager, 5 executive
  scope      VARCHAR(60) NOT NULL DEFAULT 'own' CHECK (scope IN ('all','team','own')),
  CONSTRAINT uq_role_slug UNIQUE (slug)) ;
CREATE TABLE permissions (
  id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug   VARCHAR(60) NOT NULL,              -- opportunities.edit, fees.create …
  module VARCHAR(40) NOT NULL,
  action VARCHAR(20) NOT NULL,
  label  VARCHAR(120) NOT NULL,
  CONSTRAINT uq_perm_slug UNIQUE (slug)) ;
CREATE TABLE role_permissions (
  role_id       SMALLINT  NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE) ;
CREATE TABLE users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code VARCHAR(20)  NOT NULL,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  mobile        VARCHAR(20)  NULL,
  password_hash VARCHAR(255) NOT NULL,      -- bcrypt, cost 12
  department_id INTEGER NULL,
  division_id   INTEGER NULL,     -- NULL = every division
  designation   VARCHAR(80)  NULL,
  manager_id    INTEGER NULL,
  role_id       SMALLINT NOT NULL,
  weekly_capacity_hours DECIMAL(5,2) NOT NULL DEFAULT 40.00,
  status        VARCHAR(60) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  pref_sound    SMALLINT NOT NULL DEFAULT 1,   -- notification sound on/off
  pref_desktop  SMALLINT NOT NULL DEFAULT 1,   -- browser desktop notifications on/off
  must_change_password SMALLINT NOT NULL DEFAULT 0,  -- 1 = force a reset on next sign-in (bulk-imported users)
  last_login_at TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_code UNIQUE (employee_code),
  CONSTRAINT uq_user_email UNIQUE (email),
  CONSTRAINT fk_user_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_user_div  FOREIGN KEY (division_id)   REFERENCES divisions(id)   ON DELETE SET NULL,
  CONSTRAINT fk_user_mgr  FOREIGN KEY (manager_id)    REFERENCES users(id)       ON DELETE SET NULL,
  CONSTRAINT fk_user_role FOREIGN KEY (role_id)       REFERENCES roles(id)) ;
ALTER TABLE departments ADD CONSTRAINT fk_dept_head
  FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE divisions   ADD CONSTRAINT fk_div_head
  FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL;
/* per-user overrides on top of the role defaults. NULL row means use the role */
CREATE TABLE user_permissions (
  user_id       INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  granted       SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, permission_id),
  CONSTRAINT fk_up_user FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
  CONSTRAINT fk_up_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE) ;
/* single-use, time-limited password reset tokens (only the SHA-256 hash is stored) */
CREATE TABLE password_resets (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at    TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pwreset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ;
CREATE INDEX ix_pwreset_token ON password_resets (token_hash);
CREATE TABLE countries (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      VARCHAR(80) NOT NULL,
  dial_code VARCHAR(8)  NULL,
  is_active SMALLINT  NOT NULL DEFAULT 1,
  CONSTRAINT uq_country UNIQUE (name)) ;
CREATE TABLE country_cities (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_id INTEGER NOT NULL,
  name       VARCHAR(80) NOT NULL,
  CONSTRAINT uq_city UNIQUE (country_id, name),
  CONSTRAINT fk_city_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE) ;
CREATE TABLE sectors (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(60) NOT NULL, is_active SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_sector UNIQUE (name)) ;
CREATE TABLE deal_types (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  division_id INTEGER NULL,
  family VARCHAR(60) NOT NULL DEFAULT 'Advisory' CHECK (family IN ('Equity Capital Markets','Debt','M&A','Advisory')),
  default_fee_pct DECIMAL(5,2) NULL,
  is_active SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_dealtype UNIQUE (name),
  CONSTRAINT fk_dt_div FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE SET NULL) ;
CREATE TABLE client_groups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL, note VARCHAR(255) NULL, is_active SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_group UNIQUE (name)) ;
CREATE TABLE preferences (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  pref_type VARCHAR(60) NOT NULL DEFAULT 'General' CHECK (pref_type IN ('Communication','Reporting','Meeting','Documentation','General')),
  is_active SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_pref UNIQUE (name)) ;
CREATE TABLE categories (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(80) NOT NULL, is_active SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_cat UNIQUE (name)) ;
CREATE TABLE projects (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(20) NULL, name VARCHAR(120) NOT NULL,
  department_id INTEGER NULL, owner_id INTEGER NULL,
  start_date DATE NULL, end_date DATE NULL, closed_on DATE NULL,
  status VARCHAR(60) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','On Hold','Closed')),
  CONSTRAINT uq_project UNIQUE (name),
  CONSTRAINT fk_proj_dept  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_proj_owner FOREIGN KEY (owner_id)      REFERENCES users(id)       ON DELETE SET NULL) ;
CREATE TABLE work_types (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(60) CHECK (category IN ('Facilities','Administration','Legal','IT','Marketing','HR','Finance','Operations'))
    NOT NULL DEFAULT 'Administration',
  default_approver_id INTEGER NULL,
  is_active SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_worktype UNIQUE (name),
  CONSTRAINT fk_wt_appr FOREIGN KEY (default_approver_id) REFERENCES users(id) ON DELETE SET NULL) ;
CREATE TABLE settings (
  "key" VARCHAR(60) PRIMARY KEY,
  "value" TEXT NULL,
  updated_by INTEGER NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_set_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL) ;
CREATE TABLE holidays (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  holiday_date DATE NOT NULL, title VARCHAR(120) NOT NULL,
  CONSTRAINT uq_holiday UNIQUE (holiday_date, title)) ;
-- =====================================================================
--  2  BANKING
-- =====================================================================
CREATE TABLE accounts (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_code VARCHAR(20)  NOT NULL,          -- ACC-0001
  name         VARCHAR(180) NOT NULL,
  division_id  INTEGER NULL,
  group_id     INTEGER NULL,
  sector_id    INTEGER NULL,
  account_type VARCHAR(60) CHECK (account_type IN ('Corporate','Promoter / Family Office','PE / VC Fund','FII / DII','HNI','Bank / NBFC'))
               NOT NULL DEFAULT 'Corporate',
  owner_id     INTEGER NOT NULL,
  country_id   INTEGER NULL,
  city         VARCHAR(80) NULL,
  client_since DATE NULL,
  kyc_status   VARCHAR(60) NOT NULL DEFAULT 'Pending' CHECK (kyc_status IN ('Pending','Under Review','Completed')),
  phone_code   VARCHAR(8) NULL, phone_number  VARCHAR(30) NULL,
  mobile_code  VARCHAR(8) NULL, mobile_number VARCHAR(30) NULL,
  remark       TEXT NULL,
  fees_to_date DECIMAL(12,2) NOT NULL DEFAULT 0,   -- ₹ lakh, trigger-maintained
  status       VARCHAR(60) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Dormant','Blacklisted')),
  created_by   INTEGER NULL,
  deleted_at   TIMESTAMP NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_acc_code UNIQUE (account_code),
  CONSTRAINT fk_acc_div    FOREIGN KEY (division_id) REFERENCES divisions(id)     ON DELETE SET NULL,
  CONSTRAINT fk_acc_group  FOREIGN KEY (group_id)    REFERENCES client_groups(id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_sector FOREIGN KEY (sector_id)   REFERENCES sectors(id)       ON DELETE SET NULL,
  CONSTRAINT fk_acc_owner  FOREIGN KEY (owner_id)    REFERENCES users(id),
  CONSTRAINT fk_acc_ctry   FOREIGN KEY (country_id)  REFERENCES countries(id)     ON DELETE SET NULL) ;
CREATE TABLE account_contacts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL, designation VARCHAR(90) NULL,
  email VARCHAR(160) NULL, phone VARCHAR(30) NULL, is_primary SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_ac_acc FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE) ;
CREATE TABLE account_preferences (
  account_id    INTEGER NOT NULL,
  preference_id INTEGER NOT NULL,
  PRIMARY KEY (account_id, preference_id),
  CONSTRAINT fk_ap_acc  FOREIGN KEY (account_id)    REFERENCES accounts(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ap_pref FOREIGN KEY (preference_id) REFERENCES preferences(id) ON DELETE CASCADE) ;
CREATE TABLE account_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  note_at TIMESTAMP NOT NULL, comment TEXT NOT NULL,
  CONSTRAINT fk_an_acc  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_an_user FOREIGN KEY (user_id)    REFERENCES users(id)) ;
CREATE TABLE opportunities (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_no  VARCHAR(20) NOT NULL,          -- OPP-2026-0001
  account_id      INTEGER NOT NULL,
  division_id     INTEGER NULL,
  deal_type_id    INTEGER NOT NULL,
  stage           VARCHAR(60) CHECK (stage IN ('Lead','Qualified','Pitched','Term Sheet','Mandated','Closed Won','Lost'))
                    NOT NULL DEFAULT 'Lead',
  txn_size_cr     DECIMAL(14,2) NOT NULL DEFAULT 0,
  expected_fee_l  DECIMAL(12,2) NOT NULL DEFAULT 0,
  probability_pct SMALLINT NOT NULL DEFAULT 0,
  weighted_fee_l  DECIMAL(12,2) GENERATED ALWAYS AS
                    (ROUND(expected_fee_l * probability_pct / 100, 2)) STORED,
  expected_close  DATE NULL,
  owner_id        INTEGER NOT NULL,
  source          VARCHAR(60) NOT NULL DEFAULT 'Referral' CHECK (source IN ('Referral','Existing client','Cold outreach','Banker network','Inbound',
                       'Conference','Promoter contact')),
  next_action     VARCHAR(255) NULL,
  next_action_due DATE NULL,
  is_converted    SMALLINT NOT NULL DEFAULT 0,   -- left the pipeline, lives on as a mandate
  lost_reason     VARCHAR(255) NULL,
  closed_at       DATE NULL,
  created_by      INTEGER NULL,
  deleted_at      TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_opp_no UNIQUE (opportunity_no),
  CONSTRAINT fk_opp_acc   FOREIGN KEY (account_id)   REFERENCES accounts(id),
  CONSTRAINT fk_opp_div   FOREIGN KEY (division_id)  REFERENCES divisions(id)  ON DELETE SET NULL,
  CONSTRAINT fk_opp_type  FOREIGN KEY (deal_type_id) REFERENCES deal_types(id),
  CONSTRAINT fk_opp_owner FOREIGN KEY (owner_id)     REFERENCES users(id),
  CONSTRAINT ck_opp_prob  CHECK (probability_pct BETWEEN 0 AND 100)) ;
/* the support team. Membership grants sight of the deal whatever the level */
CREATE TABLE opportunity_team (
  opportunity_id INTEGER NOT NULL,
  user_id        INTEGER NOT NULL,
  PRIMARY KEY (opportunity_id, user_id),
  CONSTRAINT fk_ot_opp  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  CONSTRAINT fk_ot_user FOREIGN KEY (user_id)        REFERENCES users(id)         ON DELETE CASCADE) ;
CREATE TABLE opportunity_stage_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id INTEGER NOT NULL,
  from_stage VARCHAR(20) NULL, to_stage VARCHAR(20) NOT NULL,
  moved_by INTEGER NULL, days_in_stage INTEGER NULL, moved_at TIMESTAMP NOT NULL,
  CONSTRAINT fk_osh_opp FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE) ;
CREATE TABLE opportunity_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  note_at TIMESTAMP NOT NULL, comment TEXT NOT NULL,
  CONSTRAINT fk_on_opp  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  CONSTRAINT fk_on_user FOREIGN KEY (user_id)        REFERENCES users(id)) ;
CREATE TABLE mandates (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mandate_no      VARCHAR(20) NOT NULL,          -- MND-2026-0001
  account_id      INTEGER NOT NULL,
  opportunity_id  INTEGER NULL,
  division_id     INTEGER NULL,
  deal_type_id    INTEGER NOT NULL,
  signed_on       DATE NOT NULL,
  expected_end    DATE NULL,
  closed_on       DATE NULL,
  retainer_l      DECIMAL(12,2) NOT NULL DEFAULT 0,
  success_fee_pct DECIMAL(5,2)  NOT NULL DEFAULT 0,
  estimated_fee_l DECIMAL(12,2) NOT NULL DEFAULT 0,
  realised_fee_l  DECIMAL(12,2) NOT NULL DEFAULT 0,   -- trigger-maintained
  outstanding_l   DECIMAL(12,2) GENERATED ALWAYS AS (estimated_fee_l - realised_fee_l) STORED,
  txn_value_cr    DECIMAL(14,2) NOT NULL DEFAULT 0,
  status          VARCHAR(60) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Executed','On Hold','Terminated')),
  sebi_cleared     SMALLINT NOT NULL DEFAULT 0,
  kyc_cleared      SMALLINT NOT NULL DEFAULT 0,
  agreement_signed SMALLINT NOT NULL DEFAULT 0,
  created_by      INTEGER NULL,
  deleted_at      TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_mnd_no UNIQUE (mandate_no),
  CONSTRAINT fk_mnd_acc  FOREIGN KEY (account_id)     REFERENCES accounts(id),
  CONSTRAINT fk_mnd_opp  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL,
  CONSTRAINT fk_mnd_div  FOREIGN KEY (division_id)    REFERENCES divisions(id)     ON DELETE SET NULL,
  CONSTRAINT fk_mnd_type FOREIGN KEY (deal_type_id)   REFERENCES deal_types(id)) ;
CREATE TABLE mandate_milestones (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mandate_id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL, sort_order SMALLINT NOT NULL DEFAULT 0,
  due_date DATE NULL, is_done SMALLINT NOT NULL DEFAULT 0,
  done_by INTEGER NULL, done_at TIMESTAMP NULL,
  CONSTRAINT fk_mm_mnd FOREIGN KEY (mandate_id) REFERENCES mandates(id) ON DELETE CASCADE) ;
CREATE TABLE mandate_team (
  mandate_id INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  team_role  VARCHAR(60) NOT NULL DEFAULT 'Execution' CHECK (team_role IN ('Lead','Execution','Support','Compliance')),
  PRIMARY KEY (mandate_id, user_id),
  CONSTRAINT fk_mt_mnd  FOREIGN KEY (mandate_id) REFERENCES mandates(id) ON DELETE CASCADE,
  CONSTRAINT fk_mt_user FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE) ;
CREATE TABLE fee_receipts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mandate_id INTEGER NOT NULL,
  fee_type VARCHAR(60) NOT NULL DEFAULT 'Retainer' CHECK (fee_type IN ('Retainer','Success Fee','Milestone','Reimbursement')),
  amount_l DECIMAL(12,2) NOT NULL,
  invoice_no VARCHAR(40) NULL, invoice_date DATE NULL, received_on DATE NULL,
  gst_pct DECIMAL(5,2) NOT NULL DEFAULT 18.00, tds_l DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(60) NOT NULL DEFAULT 'Raised' CHECK (status IN ('Raised','Received','Written Off')),
  narration VARCHAR(255) NULL, recorded_by INTEGER NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fr_mnd FOREIGN KEY (mandate_id) REFERENCES mandates(id) ON DELETE CASCADE) ;
-- =====================================================================
--  3  INSTITUTIONAL BUSINESS
-- =====================================================================
CREATE TABLE institutions (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_ref VARCHAR(20) NOT NULL,        -- ICL-0001
  name          VARCHAR(180) NOT NULL,         -- the holder
  house_code    VARCHAR(30) NULL,              -- house-level client code
  inst_type     VARCHAR(60) NOT NULL CHECK (inst_type IN ('Mutual Fund','Insurance','FII / FPI','DII','PMS','AIF / Hedge Fund',
                     'Bank Treasury','Corporate Treasury','Family Office')),
  tier          VARCHAR(60) NOT NULL DEFAULT 'C' CHECK (tier IN ('A','B','C')),
  empanelment   VARCHAR(60) NOT NULL DEFAULT 'In process' CHECK (empanelment IN ('Empanelled','In process','Not empanelled','Suspended')),
  rm_id         INTEGER NOT NULL,
  country_id    INTEGER NULL,
  city          VARCHAR(80) NULL,
  aum_cr        DECIMAL(14,2) NOT NULL DEFAULT 0,
  contact_name  VARCHAR(120) NULL, contact_role VARCHAR(90) NULL, contact_email VARCHAR(160) NULL,
  note          TEXT NULL,
  status        VARCHAR(60) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Dormant')),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_inst_ref UNIQUE (institution_ref),
  CONSTRAINT uq_house_code UNIQUE (house_code),
  CONSTRAINT fk_inst_rm   FOREIGN KEY (rm_id)      REFERENCES users(id),
  CONSTRAINT fk_inst_ctry FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL) ;
/* schemes trade under the holder, each with the code the trades arrive under */
CREATE TABLE institution_schemes (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id INTEGER NOT NULL,
  name           VARCHAR(160) NOT NULL,
  client_code    VARCHAR(30) NULL,
  custodian      VARCHAR(120) NULL,
  status         VARCHAR(60) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Dormant','Closed')),
  CONSTRAINT uq_scheme_code UNIQUE (client_code),
  CONSTRAINT fk_scheme_inst FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE) ;
CREATE TABLE institution_contacts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL, designation VARCHAR(90) NULL,
  email VARCHAR(160) NULL, phone VARCHAR(30) NULL,
  CONSTRAINT fk_ic_inst FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE) ;
CREATE TABLE institution_sectors (
  institution_id INTEGER NOT NULL,
  sector_id      INTEGER NOT NULL,
  PRIMARY KEY (institution_id, sector_id),
  CONSTRAINT fk_is_inst FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_is_sec  FOREIGN KEY (sector_id)      REFERENCES sectors(id)      ON DELETE CASCADE) ;
CREATE TABLE client_visits (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id INTEGER NOT NULL,
  visit_date     DATE NOT NULL,
  visit_type     VARCHAR(60) NOT NULL DEFAULT 'Client visit' CHECK (visit_type IN ('Client visit','Office meeting','Call','Video call','Conference',
                      'Roadshow','Analyst day')),
  logged_by      INTEGER NOT NULL,
  met_person     VARCHAR(120) NULL,
  city           VARCHAR(80) NULL,
  agenda         TEXT NULL,
  outcome        TEXT NULL,
  interest       VARCHAR(60) NOT NULL DEFAULT 'Medium' CHECK (interest IN ('High','Medium','Low')),
  follow_up_on   DATE NULL,
  source         VARCHAR(60) NOT NULL DEFAULT 'typed' CHECK (source IN ('typed','voice','import')),
  transcript     TEXT NULL,                    -- what was actually said, kept verbatim
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_visit_inst FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_visit_user FOREIGN KEY (logged_by)      REFERENCES users(id)) ;
CREATE TABLE client_visit_stocks (
  visit_id BIGINT NOT NULL,
  symbol   VARCHAR(24) NOT NULL,
  PRIMARY KEY (visit_id, symbol),
  CONSTRAINT fk_vs_visit FOREIGN KEY (visit_id) REFERENCES client_visits(id) ON DELETE CASCADE) ;
CREATE TABLE research_reports (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_no    VARCHAR(20) NOT NULL,            -- REP-2026-0001
  title        VARCHAR(240) NOT NULL,
  report_type  VARCHAR(60) NOT NULL CHECK (report_type IN ('Sector report','Stock initiation','Stock update','Result update','Event update',
                    'Thematic','Model portfolio','Morning note')),
  sector_id    INTEGER NULL,
  symbol       VARCHAR(24) NULL,
  analyst_id   INTEGER NOT NULL,
  recommendation VARCHAR(60) NOT NULL DEFAULT 'Not rated' CHECK (recommendation IN ('Buy','Accumulate','Hold','Reduce','Sell','Not rated')),
  cmp          DECIMAL(12,2) NULL,
  target_price DECIMAL(12,2) NULL,
  upside_pct   DECIMAL(6,2) GENERATED ALWAYS AS
                 (CASE WHEN cmp > 0 THEN ROUND((target_price / cmp - 1) * 100, 2) END) STORED,
  report_date  DATE NOT NULL,
  summary      TEXT NULL,
  status       VARCHAR(60) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Published')),
  published_at TIMESTAMP NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_report_no UNIQUE (report_no),
  CONSTRAINT fk_rep_sector  FOREIGN KEY (sector_id)  REFERENCES sectors(id) ON DELETE SET NULL,
  CONSTRAINT fk_rep_analyst FOREIGN KEY (analyst_id) REFERENCES users(id)) ;
CREATE TABLE research_report_clients (
  report_id      INTEGER NOT NULL,
  institution_id INTEGER NOT NULL,
  sent_at        TIMESTAMP NULL,
  PRIMARY KEY (report_id, institution_id),
  CONSTRAINT fk_rrc_rep  FOREIGN KEY (report_id)      REFERENCES research_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_rrc_inst FOREIGN KEY (institution_id) REFERENCES institutions(id)     ON DELETE CASCADE) ;
CREATE TABLE brokerage (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id INTEGER NOT NULL,
  scheme_id      INTEGER NULL,             -- NULL = booked to the house
  client_code    VARCHAR(30) NULL,              -- as it arrived in the file
  trade_date     DATE NULL,
  period_month   CHAR(7) NOT NULL,              -- YYYY-MM, what the grids roll up on
  segment        VARCHAR(60) NOT NULL DEFAULT 'Cash' CHECK (segment IN ('Cash','F&O','Block / Bulk')),
  turnover       DECIMAL(18,2) NOT NULL DEFAULT 0,
  brokerage      DECIMAL(14,2) NOT NULL DEFAULT 0,
  yield_bps      DECIMAL(8,2) GENERATED ALWAYS AS
                   (CASE WHEN turnover > 0 THEN ROUND(brokerage / turnover * 10000, 2) END) STORED,
  source         VARCHAR(60) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  created_by     INTEGER NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  /* the same figure loaded twice is the thing that actually goes wrong */
  CONSTRAINT uq_brok_dedupe UNIQUE (institution_id, scheme_id, trade_date, segment, brokerage),
  CONSTRAINT fk_brok_inst   FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_brok_scheme FOREIGN KEY (scheme_id)      REFERENCES institution_schemes(id) ON DELETE SET NULL) ;
-- =====================================================================
--  4  INTERNAL WORK
-- =====================================================================
CREATE TABLE assignments (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_no   VARCHAR(20) NOT NULL,          -- ASG-2026-0001
  title           VARCHAR(200) NOT NULL,
  description     TEXT NULL,
  department_id   INTEGER NULL,
  category_id     INTEGER NULL,
  project_id      INTEGER NULL,
  assigned_by     INTEGER NOT NULL,
  assigned_to     INTEGER NOT NULL,
  start_date      DATE NOT NULL,
  due_date        DATE NOT NULL,
  completed_at    TIMESTAMP NULL,
  sla_days        INTEGER NOT NULL DEFAULT 5,
  status          VARCHAR(60) CHECK (status IN ('Pending','In Progress','Under Review','Completed','On Hold'))
                    NOT NULL DEFAULT 'Pending',
  priority        VARCHAR(60) NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  progress_pct    SMALLINT NOT NULL DEFAULT 0,
  estimated_hours DECIMAL(7,2) NOT NULL DEFAULT 0,
  actual_hours    DECIMAL(7,2) NOT NULL DEFAULT 0,      -- trigger-maintained
  recurrence      VARCHAR(60) NOT NULL DEFAULT 'None' CHECK (recurrence IN ('None','Weekly','Monthly','Quarterly')),
  blocked_by_id   INTEGER NULL,
  linked_type     VARCHAR(60) NOT NULL DEFAULT 'none' CHECK (linked_type IN ('none','account','opportunity','mandate')),
  linked_id       INTEGER NULL,
  deleted_at      TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_asg_no UNIQUE (assignment_no),
  CONSTRAINT fk_asg_dept  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_asg_cat   FOREIGN KEY (category_id)   REFERENCES categories(id)  ON DELETE SET NULL,
  CONSTRAINT fk_asg_proj  FOREIGN KEY (project_id)    REFERENCES projects(id)    ON DELETE SET NULL,
  CONSTRAINT fk_asg_by    FOREIGN KEY (assigned_by)   REFERENCES users(id),
  CONSTRAINT fk_asg_to    FOREIGN KEY (assigned_to)   REFERENCES users(id),
  CONSTRAINT fk_asg_block FOREIGN KEY (blocked_by_id) REFERENCES assignments(id) ON DELETE SET NULL,
  CONSTRAINT ck_asg_prog  CHECK (progress_pct BETWEEN 0 AND 100)) ;
CREATE TABLE assignment_subtasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL, owner_id INTEGER NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_done SMALLINT NOT NULL DEFAULT 0, done_at TIMESTAMP NULL,
  CONSTRAINT fk_sub_asg FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE) ;
CREATE TABLE assignment_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  note_at TIMESTAMP NOT NULL, comment TEXT NOT NULL,
  status_at_note VARCHAR(60) NULL CHECK (status_at_note IN ('Pending','In Progress','Under Review','Completed','On Hold')),
  CONSTRAINT fk_note_asg FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE) ;
CREATE TABLE assignment_checklist (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id INTEGER NOT NULL,
  item_text VARCHAR(160) NOT NULL, sort_order SMALLINT NOT NULL DEFAULT 0,
  is_done SMALLINT NOT NULL DEFAULT 0, done_at TIMESTAMP NULL,
  CONSTRAINT fk_chk_asg FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE) ;
-- One assignment can be assigned to many users (normalised — no comma lists).
-- assignments.assigned_to keeps the "primary" (first) assignee for compatibility.
CREATE TABLE assignment_assignees (
  assignment_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, user_id),
  CONSTRAINT fk_aa_asg  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_aa_user FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE) ;
CREATE INDEX ix_aa_user ON assignment_assignees (user_id);
CREATE TABLE time_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  log_date DATE NOT NULL, hours DECIMAL(5,2) NOT NULL,
  narration VARCHAR(255) NULL, is_billable SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tl_asg  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_tl_user FOREIGN KEY (user_id)       REFERENCES users(id),
  CONSTRAINT ck_tl_hours CHECK (hours > 0 AND hours <= 24)) ;
CREATE TABLE work_approvals (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  approval_no   VARCHAR(20) NOT NULL,             -- APR-2026-0001
  title         VARCHAR(200) NOT NULL,
  work_type_id  INTEGER NOT NULL,
  department_id INTEGER NULL,
  amount        DECIMAL(14,2) NOT NULL DEFAULT 0,
  vendor        VARCHAR(160) NULL,
  priority      VARCHAR(60) NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Routine','Normal','Urgent')),
  raised_by     INTEGER NOT NULL,
  raised_on     DATE NOT NULL,
  approver_id   INTEGER NOT NULL,
  needed_by     DATE NULL,
  status        VARCHAR(60) CHECK (status IN ('Draft','Pending','Approved','Rejected','On hold','Withdrawn'))
                  NOT NULL DEFAULT 'Draft',
  details       TEXT NULL,
  decided_by    INTEGER NULL,
  decided_on    DATE NULL,
  remarks       VARCHAR(500) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_apr_no UNIQUE (approval_no),
  CONSTRAINT fk_apr_type FOREIGN KEY (work_type_id)  REFERENCES work_types(id),
  CONSTRAINT fk_apr_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_apr_by   FOREIGN KEY (raised_by)     REFERENCES users(id),
  CONSTRAINT fk_apr_appr FOREIGN KEY (approver_id)   REFERENCES users(id)) ;
CREATE TABLE work_approval_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  approval_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  note_at TIMESTAMP NOT NULL, comment TEXT NOT NULL,
  CONSTRAINT fk_wan_apr FOREIGN KEY (approval_id) REFERENCES work_approvals(id) ON DELETE CASCADE) ;
-- =====================================================================
--  5  SHARED — attachments, email, meetings, log, alerts
-- =====================================================================
/* One attachment table for every record type. Files live on disk,
   only the pointer is here, which is the difference between a database
   you can back up and one you cannot. */
CREATE TABLE attachments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type   VARCHAR(60) NOT NULL CHECK (entity_type IN ('account','opportunity','mandate','assignment','institution',
                     'research_report','work_approval','visit')),
  entity_id     INTEGER NOT NULL,
  kind          VARCHAR(60) NOT NULL DEFAULT 'file' CHECK (kind IN ('file','link','voice')),
  original_name VARCHAR(255) NOT NULL,
  stored_path   VARCHAR(255) NULL,               -- for kind = file / voice
  url           VARCHAR(500) NULL,               -- for kind = link
  mime_type     VARCHAR(100) NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  duration_secs INTEGER NULL,          -- voice notes
  uploaded_by   INTEGER NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_att_user FOREIGN KEY (uploaded_by) REFERENCES users(id)) ;
CREATE TABLE emails (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type   VARCHAR(60) NOT NULL DEFAULT 'none' CHECK (entity_type IN ('none','account','opportunity','mandate','assignment','institution')),
  entity_id     INTEGER NULL,
  thread_key    VARCHAR(80) NOT NULL,            -- the [OPP-2026-0001] token, or a normalised subject
  direction     VARCHAR(60) NOT NULL DEFAULT 'out' CHECK (direction IN ('out','in')),
  from_address  VARCHAR(160) NOT NULL,
  to_addresses  TEXT NOT NULL,
  cc_addresses  TEXT NULL,
  subject       VARCHAR(255) NOT NULL,
  body          MEDIUMTEXT NULL,
  status        VARCHAR(60) NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued','Sent','Failed','Received')),
  sent_by       INTEGER NULL,
  sent_at       TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ;
CREATE TABLE meetings (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace    VARCHAR(60) NOT NULL DEFAULT 'internal' CHECK (workspace IN ('banking','institutional','internal')),
  title        VARCHAR(200) NOT NULL,
  entity_type  VARCHAR(60) NOT NULL DEFAULT 'none' CHECK (entity_type IN ('none','account','opportunity','mandate','assignment','institution')),
  entity_id    INTEGER NULL,
  meeting_date DATE NOT NULL, meeting_time TIME NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  link         VARCHAR(255) NULL,
  agenda       TEXT NULL, minutes TEXT NULL,
  created_by   INTEGER NOT NULL,
  status       VARCHAR(60) NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Completed','Cancelled')),
  CONSTRAINT fk_meet_by FOREIGN KEY (created_by) REFERENCES users(id)) ;
CREATE TABLE meeting_participants (
  meeting_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  attended SMALLINT NOT NULL DEFAULT 0,
  response VARCHAR(60) NOT NULL DEFAULT 'Pending' CHECK (response IN ('Pending','Accepted','Declined')),
  PRIMARY KEY (meeting_id, user_id),
  CONSTRAINT fk_mp_meet FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_user FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE) ;
CREATE TABLE activity_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type VARCHAR(30) NOT NULL, entity_id INTEGER NOT NULL,
  user_id INTEGER NULL, action VARCHAR(60) NOT NULL,
  description VARCHAR(255) NOT NULL,
  old_value VARCHAR(255) NULL, new_value VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ;
CREATE TABLE notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL,             -- receiver
  sender_id INTEGER NULL,               -- who caused it (optional)
  type VARCHAR(40) NOT NULL,            -- module / category
  title VARCHAR(120) NOT NULL, message VARCHAR(255) NOT NULL,
  entity_type VARCHAR(30) NULL, entity_id INTEGER NULL,   -- related record
  is_read SMALLINT NOT NULL DEFAULT 0, read_at TIMESTAMP NULL,
  is_deleted SMALLINT NOT NULL DEFAULT 0,                 -- soft delete
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL) ;
-- =====================================================================
-- indexes hoisted from the table definitions
CREATE INDEX ix_user_mgr ON users (manager_id);
CREATE INDEX ix_osh ON opportunity_stage_history (opportunity_id, moved_at);
CREATE INDEX ix_mm ON mandate_milestones (mandate_id, sort_order);
CREATE INDEX ix_fr ON fee_receipts (mandate_id, status);
CREATE INDEX ix_inst_rm ON institutions (rm_id, status);
CREATE INDEX ix_scheme_inst ON institution_schemes (institution_id, status);
CREATE INDEX ix_visit ON client_visits (institution_id, visit_date);
CREATE INDEX ix_visit_by ON client_visits (logged_by, visit_date);
CREATE INDEX ix_visit_follow ON client_visits (follow_up_on);
CREATE INDEX ix_report_analyst ON research_reports (analyst_id);
CREATE INDEX ix_brok_inst ON brokerage (institution_id, period_month);
CREATE INDEX ix_brok_scheme ON brokerage (scheme_id);
CREATE INDEX ix_brok_month ON brokerage (period_month);
CREATE INDEX ix_asg_link ON assignments (linked_type, linked_id);
CREATE INDEX ix_att ON attachments (entity_type, entity_id);
CREATE INDEX ix_email_entity ON emails (entity_type, entity_id);
CREATE INDEX ix_email_thread ON emails (thread_key, sent_at);
CREATE INDEX ix_meet ON meetings (meeting_date, meeting_time);
CREATE INDEX ix_log ON activity_logs (entity_type, entity_id, created_at);
CREATE INDEX ix_log_user ON activity_logs (user_id, created_at);
CREATE INDEX ix_notif ON notifications (user_id, is_read, created_at);
CREATE INDEX ft_acc ON accounts (name);  -- was FULLTEXT; app searches use ILIKE
CREATE INDEX ft_inst ON institutions (name);  -- was FULLTEXT; app searches use ILIKE
CREATE INDEX ft_asg ON assignments (title);  -- was FULLTEXT; app searches use ILIKE
-- indexes hoisted (second pass)
CREATE INDEX ix_acc_owner ON accounts (owner_id, status);
CREATE INDEX ix_acc_div ON accounts (division_id);
CREATE INDEX ix_opp_stage ON opportunities (stage, is_converted);
CREATE INDEX ix_opp_owner ON opportunities (owner_id);
CREATE INDEX ix_opp_div ON opportunities (division_id);
CREATE INDEX ix_opp_action ON opportunities (next_action_due);
CREATE INDEX ix_mnd_status ON mandates (status, signed_on);
CREATE INDEX ix_mnd_div ON mandates (division_id);
CREATE INDEX ix_report ON research_reports (report_date, status);
CREATE INDEX ix_report_symbol ON research_reports (symbol);
CREATE INDEX ix_asg_to ON assignments (assigned_to, status);
CREATE INDEX ix_asg_due ON assignments (due_date, status);
CREATE INDEX ix_tl ON time_logs (assignment_id, log_date);
CREATE INDEX ix_tl_user ON time_logs (user_id, log_date);
CREATE INDEX ix_apr_status ON work_approvals (status, needed_by);
CREATE INDEX ix_apr_approver ON work_approvals (approver_id, status);

-- =====================================================================
--  6  TRIGGERS — the derived figures maintain themselves
-- =====================================================================

-- updated_at columns touch themselves
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_users BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_touch_settings BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_touch_accounts BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_touch_opportunities BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_touch_mandates BEFORE UPDATE ON mandates
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_touch_institutions BEFORE UPDATE ON institutions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_touch_assignments BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_touch_work_approvals BEFORE UPDATE ON work_approvals
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- fee receipts roll up to the mandate and on to the account
CREATE OR REPLACE FUNCTION fn_fee_rollup() RETURNS trigger AS $$
DECLARE
  v_mandate INTEGER := NEW.mandate_id;
  v_account INTEGER;
BEGIN
  UPDATE mandates SET realised_fee_l =
    (SELECT COALESCE(SUM(amount_l),0) FROM fee_receipts
      WHERE mandate_id = v_mandate AND status = 'Received')
   WHERE id = v_mandate;
  SELECT account_id INTO v_account FROM mandates WHERE id = v_mandate;
  UPDATE accounts a SET fees_to_date =
    (SELECT COALESCE(SUM(fr.amount_l),0) FROM fee_receipts fr
       JOIN mandates m ON m.id = fr.mandate_id
      WHERE m.account_id = a.id AND fr.status = 'Received')
   WHERE a.id = v_account;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fee_aiu AFTER INSERT OR UPDATE ON fee_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_fee_rollup();

-- hours logged roll up to the assignment
CREATE OR REPLACE FUNCTION fn_hours_rollup() RETURNS trigger AS $$
DECLARE v_asg INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN v_asg := OLD.assignment_id; ELSE v_asg := NEW.assignment_id; END IF;
  UPDATE assignments SET actual_hours =
    (SELECT COALESCE(SUM(hours),0) FROM time_logs WHERE assignment_id = v_asg)
   WHERE id = v_asg;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tl_aid AFTER INSERT OR DELETE ON time_logs
  FOR EACH ROW EXECUTE FUNCTION fn_hours_rollup();

-- every stage move is history
CREATE OR REPLACE FUNCTION fn_opp_stage() RETURNS trigger AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO opportunity_stage_history
      (opportunity_id, from_stage, to_stage, moved_at, days_in_stage)
    VALUES (NEW.id, OLD.stage, NEW.stage, now(),
      (CURRENT_DATE - COALESCE((SELECT MAX(moved_at)::date FROM opportunity_stage_history
                                 WHERE opportunity_id = NEW.id), OLD.created_at::date)));
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_opp_stage AFTER UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION fn_opp_stage();

-- =====================================================================
--  7  VIEWS — what every dashboard reads
-- =====================================================================
CREATE OR REPLACE VIEW v_pipeline_summary AS
SELECT o.stage, d.name AS division, COUNT(*) AS deals,
       SUM(o.txn_size_cr) AS txn_value_cr, SUM(o.expected_fee_l) AS gross_fee_l,
       SUM(o.weighted_fee_l) AS weighted_fee_l,
       ROUND(AVG(CURRENT_DATE - o.created_at::date)) AS avg_age_days
FROM opportunities o
LEFT JOIN divisions d ON d.id = o.division_id
WHERE o.deleted_at IS NULL AND o.is_converted = 0
GROUP BY o.stage, d.name;

CREATE OR REPLACE VIEW v_mandate_fees AS
SELECT m.id, m.mandate_no, a.name AS account, dt.name AS deal_type, d.name AS division,
       m.status, m.signed_on, m.closed_on, m.estimated_fee_l, m.realised_fee_l, m.outstanding_l,
       ROUND(100.0 * m.realised_fee_l / NULLIF(m.estimated_fee_l,0)) AS realisation_pct,
       (SELECT COUNT(*) FROM mandate_milestones WHERE mandate_id = m.id) AS milestones,
       (SELECT COUNT(*) FROM mandate_milestones WHERE mandate_id = m.id AND is_done = 1) AS milestones_done,
       (m.sebi_cleared = 1 AND m.kyc_cleared = 1 AND m.agreement_signed = 1) AS compliance_ok
FROM mandates m
JOIN accounts a ON a.id = m.account_id
JOIN deal_types dt ON dt.id = m.deal_type_id
LEFT JOIN divisions d ON d.id = m.division_id
WHERE m.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_institution_summary AS
SELECT i.id, i.institution_ref, i.name, i.house_code, i.inst_type, i.tier, i.empanelment,
       u.name AS rm, i.city, i.status,
       (SELECT COUNT(*) FROM institution_schemes s WHERE s.institution_id = i.id) AS schemes,
       (SELECT MAX(visit_date) FROM client_visits v WHERE v.institution_id = i.id) AS last_met,
       CURRENT_DATE - (SELECT MAX(visit_date) FROM client_visits v
                        WHERE v.institution_id = i.id)                             AS days_since_met,
       (SELECT COUNT(*) FROM client_visits v WHERE v.institution_id = i.id)        AS interactions,
       (SELECT COALESCE(SUM(b.brokerage),0) FROM brokerage b
         WHERE b.institution_id = i.id)                                            AS brokerage_total
FROM institutions i JOIN users u ON u.id = i.rm_id;

CREATE OR REPLACE VIEW v_brokerage_monthly AS
SELECT b.period_month, i.name AS institution, s.name AS scheme, b.segment,
       SUM(b.turnover) AS turnover, SUM(b.brokerage) AS brokerage,
       ROUND(SUM(b.brokerage) / NULLIF(SUM(b.turnover),0) * 10000, 2) AS yield_bps
FROM brokerage b
JOIN institutions i ON i.id = b.institution_id
LEFT JOIN institution_schemes s ON s.id = b.scheme_id
GROUP BY b.period_month, i.name, s.name, b.segment;

CREATE OR REPLACE VIEW v_employee_performance AS
SELECT u.id AS user_id, u.name, d.name AS department,
       COUNT(a.id) AS received,
       COUNT(*) FILTER (WHERE a.status = 'Completed') AS completed,
       COUNT(*) FILTER (WHERE a.id IS NOT NULL AND a.status <> 'Completed') AS pending,
       COUNT(*) FILTER (WHERE a.status <> 'Completed' AND a.due_date < CURRENT_DATE) AS delayed,
       COALESCE(SUM(a.actual_hours),0) AS hours_logged,
       GREATEST(0, ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'Completed') / NULLIF(COUNT(a.id),0)
              - 8 * COUNT(*) FILTER (WHERE a.status <> 'Completed' AND a.due_date < CURRENT_DATE))) AS efficiency_pct
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN assignment_assignees aa ON aa.user_id = u.id
LEFT JOIN assignments a ON a.id = aa.assignment_id AND a.deleted_at IS NULL
GROUP BY u.id, u.name, d.name;

CREATE OR REPLACE VIEW v_workload AS
SELECT u.id AS user_id, u.name, d.name AS department, u.weekly_capacity_hours,
       COUNT(a.id) AS open_tasks,
       COUNT(*) FILTER (WHERE a.due_date < CURRENT_DATE) AS overdue_tasks,
       COALESCE(SUM(a.estimated_hours),0) AS open_hours,
       ROUND(100.0 * COALESCE(SUM(a.estimated_hours),0) / NULLIF(u.weekly_capacity_hours,0)) AS utilisation_pct
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN assignment_assignees aa ON aa.user_id = u.id
LEFT JOIN assignments a ON a.id = aa.assignment_id AND a.status <> 'Completed' AND a.deleted_at IS NULL
WHERE u.status = 'Active'
GROUP BY u.id, u.name, d.name, u.weekly_capacity_hours;

CREATE OR REPLACE VIEW v_sla_breaches AS
SELECT a.id, a.assignment_no, a.title, u.name AS owner, d.name AS department,
       a.start_date, a.due_date, a.sla_days,
       (CURRENT_DATE - a.start_date) - a.sla_days AS days_over_sla,
       a.priority, a.status
FROM assignments a
JOIN users u ON u.id = a.assigned_to
LEFT JOIN departments d ON d.id = a.department_id
WHERE a.status <> 'Completed' AND a.deleted_at IS NULL
  AND (CURRENT_DATE - a.start_date) > a.sla_days;
